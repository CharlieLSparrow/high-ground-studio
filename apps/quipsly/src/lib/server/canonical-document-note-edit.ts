import "server-only";

import { createHash, randomUUID } from "node:crypto";

import {
  applyOperation,
  createDocumentFromStudioProjection,
  projectDocumentToStudioProjection,
} from "@high-ground/quipsly-document-kernel";
import type { Prisma, PrismaClient } from "@prisma/client";

import { getPrismaClient } from "@/lib/prisma";
import { isImmutableSourceEvidenceExternalId } from "@/lib/studio/immutable-source";
import { resolveStudioProjectAccess } from "@/lib/server/studio-project-access";
import { canReadPersonalWritingDocument } from "@/lib/server/personal-writing-documents";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NOTE_SOURCE_MARKER = "document-kind:note";
const NOTE_EDIT_SCHEMA = "quipsly-document-note-edit-v1";
const MAX_BLOCK_COUNT = 24;
const MAX_BLOCK_LENGTH = 20_000;
const MAX_TOTAL_LENGTH = 60_000;

export const canonicalDocumentNoteSelect = {
  id: true,
  projectId: true,
  personalOwnerUserId: true,
  stableId: true,
  title: true,
  sourceLabel: true,
  projectionStatus: true,
  isPrivate: true,
  tagRevision: true,
  updatedAt: true,
  project: {
    select: {
      id: true,
      slug: true,
      name: true,
    },
  },
  tagLinks: {
    select: {
      tagId: true,
    },
  },
  blocks: {
    where: { archivedAt: null },
    orderBy: [{ order: "asc" as const }, { id: "asc" as const }],
    select: {
      id: true,
      documentId: true,
      stableId: true,
      order: true,
      title: true,
      body: true,
      sourceLabel: true,
      externalId: true,
      updatedAt: true,
      taggedSpans: {
        orderBy: [{ startOffset: "asc" as const }, { endOffset: "asc" as const }, { id: "asc" as const }],
        select: {
          id: true,
          tagId: true,
          startOffset: true,
          endOffset: true,
          selectedText: true,
          documentStableId: true,
          documentTitleSnapshot: true,
          blockStableId: true,
          blockTitleSnapshot: true,
          sourceLabel: true,
          knowledgeNode: {
            select: {
              id: true,
              sourceText: true,
              spanStartOffset: true,
              spanEndOffset: true,
            },
          },
          tag: {
            select: {
              id: true,
              slug: true,
              label: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.StudioDocumentSelect;

export type CanonicalDocumentNoteRecord = Prisma.StudioDocumentGetPayload<{
  select: typeof canonicalDocumentNoteSelect;
}>;

export type CanonicalDocumentNoteEditableBlock = {
  id: string;
  stableId: string;
  order: number;
  body: string;
};

export type CanonicalDocumentNoteSnapshot = {
  id: string;
  stableId: string;
  projectId: string;
  projectSlug: string;
  title: string;
  blocks: CanonicalDocumentNoteEditableBlock[];
  contentRevision: string;
  updatedAt: string;
  canEditContent: boolean;
  contentEditBoundary: string;
};

export type CanonicalDocumentNoteEditInput = {
  actorUserId: string;
  actorEmail: string;
  documentId: string;
  expectedContentRevision: string;
  clientRequestId: string;
  title: string;
  blocks: Array<{
    id: string;
    stableId: string;
    body: string;
  }>;
};

export type CanonicalDocumentNoteEditResult =
  | {
      ok: true;
      note: CanonicalDocumentNoteSnapshot;
      receiptId: string;
      idempotentReplay: boolean;
      changedBlockIds: string[];
    }
  | {
      ok: false;
      code:
        | "INVALID_INPUT"
        | "NOT_FOUND"
        | "FORBIDDEN"
        | "CONFLICT"
        | "IMMUTABLE_SOURCE"
        | "ANCHOR_REVIEW_REQUIRED"
        | "UNAVAILABLE";
      error: string;
      current?: CanonicalDocumentNoteSnapshot;
    };

type NoteTransaction = Parameters<
  Parameters<PrismaClient["$transaction"]>[0]
>[0];

type RemappedSpan = {
  id: string;
  startOffset: number;
  endOffset: number;
  selectedText: string;
};

function cleanId(value: unknown, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizeTitle(value: unknown) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim()
    : "";
}

function normalizeBody(value: unknown) {
  return typeof value === "string"
    ? value.replace(/\r\n?/g, "\n")
    : "";
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function sha256(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function sha256Text(value: string) {
  return createHash("sha256")
    .update(value)
    .digest("hex");
}

function isDocumentNote(record: Pick<CanonicalDocumentNoteRecord, "sourceLabel">) {
  return String(record.sourceLabel ?? "").toLowerCase().includes(NOTE_SOURCE_MARKER);
}

function isSyntheticTitleBlock(
  document: Pick<CanonicalDocumentNoteRecord, "title">,
  block: CanonicalDocumentNoteRecord["blocks"][number],
) {
  return block.order === 0
    && block.title === "Note Title"
    && block.body === document.title
    && String(block.sourceLabel ?? "").toLowerCase().includes(NOTE_SOURCE_MARKER);
}

function editableBlocks(record: CanonicalDocumentNoteRecord) {
  const withoutSyntheticTitle = record.blocks.filter(
    (block) => !isSyntheticTitleBlock(record, block),
  );
  return withoutSyntheticTitle.length > 0 ? withoutSyntheticTitle : record.blocks;
}

function revisionPayload(record: CanonicalDocumentNoteRecord) {
  return {
    schema: "quipsly-document-note-content-v1",
    documentId: record.id,
    stableId: record.stableId,
    title: record.title,
    blocks: record.blocks.map((block) => ({
      id: block.id,
      stableId: block.stableId,
      order: block.order,
      title: block.title,
      body: block.body,
      sourceLabel: block.sourceLabel,
      externalId: block.externalId,
    })),
  };
}

function noteCanEdit(record: CanonicalDocumentNoteRecord) {
  if (!isDocumentNote(record)) {
    return {
      allowed: false,
      boundary: "Only canonical document notes can be edited from Capture.",
    };
  }
  if (record.blocks.length === 0 || editableBlocks(record).length === 0) {
    return {
      allowed: false,
      boundary: "This note has no active writing block. Continue it in Nest.",
    };
  }
  if (record.blocks.length > MAX_BLOCK_COUNT) {
    return {
      allowed: false,
      boundary: "This structured note has too many blocks for the focused iPhone editor. Continue it in Nest.",
    };
  }
  if (record.blocks.some((block) => isImmutableSourceEvidenceExternalId(block.externalId))) {
    return {
      allowed: false,
      boundary: "Pinned source evidence is immutable. Create a correction or edit its linked response in Nest.",
    };
  }
  return {
    allowed: true,
    boundary: "Edits update this same private Nest document. Tags and safe text anchors are preserved; nothing is sent, published, or added to a calendar.",
  };
}

export function projectCanonicalDocumentNote(
  record: CanonicalDocumentNoteRecord,
): CanonicalDocumentNoteSnapshot {
  const editability = noteCanEdit(record);
  return {
    id: record.id,
    stableId: record.stableId,
    projectId: record.projectId,
    projectSlug: record.project.slug,
    title: record.title,
    blocks: editableBlocks(record).map((block) => ({
      id: block.id,
      stableId: block.stableId,
      order: block.order,
      body: block.body,
    })),
    contentRevision: sha256(revisionPayload(record)),
    updatedAt: record.updatedAt.toISOString(),
    canEditContent: editability.allowed,
    contentEditBoundary: editability.boundary,
  };
}

function commonTextBoundary(previous: string, next: string) {
  let prefix = 0;
  while (
    prefix < previous.length
    && prefix < next.length
    && previous[prefix] === next[prefix]
  ) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < previous.length - prefix
    && suffix < next.length - prefix
    && previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  return {
    prefix,
    previousEnd: previous.length - suffix,
    nextMiddle: next.slice(prefix, next.length - suffix),
  };
}

function remapSpansForReplacement(
  block: CanonicalDocumentNoteRecord["blocks"][number],
  nextBody: string,
  documentTitle: string,
  documentTagIds: Set<string>,
): { ok: true; spans: RemappedSpan[] } | { ok: false; error: string } {
  if (block.body === nextBody || block.taggedSpans.length === 0) {
    return {
      ok: true,
      spans: block.taggedSpans.map((span) => ({
        id: span.id,
        startOffset: span.startOffset,
        endOffset: span.endOffset,
        selectedText: span.selectedText,
      })),
    };
  }

  const classificationSpanIds = new Set(
    block.taggedSpans
      .filter((span) =>
        documentTagIds.has(span.tagId)
        && span.startOffset === 0
        && span.endOffset === block.body.length
        && span.selectedText === block.body
        && String(span.sourceLabel ?? "").toLowerCase().includes(NOTE_SOURCE_MARKER))
      .map((span) => span.id),
  );
  const anchored = block.taggedSpans.filter(
    (span) => !classificationSpanIds.has(span.id),
  );
  const boundary = commonTextBoundary(block.body, nextBody);

  for (const span of anchored) {
    const entirelyInsideChangedText =
      span.startOffset >= boundary.prefix
      && span.endOffset <= boundary.previousEnd;
    if (entirelyInsideChangedText && boundary.previousEnd > boundary.prefix) {
      return {
        ok: false,
        error: `The edit would replace the complete anchored passage “${span.selectedText.slice(0, 80)}”. Review that annotation in Nest before changing this text.`,
      };
    }
  }

  let document = createDocumentFromStudioProjection({
    documentId: `note-edit:${block.documentId}`,
    title: documentTitle,
    blocks: [{
      id: block.stableId,
      text: block.body,
      order: block.order,
    }],
    spans: anchored.map((span) => ({
      id: span.id,
      blockId: block.stableId,
      tagSlug: span.tag.id,
      label: span.tag.label,
      startOffset: span.startOffset,
      endOffset: span.endOffset,
      selectedText: span.selectedText,
    })),
  });

  if (boundary.previousEnd > boundary.prefix) {
    document = applyOperation(document, {
      type: "deleteText",
      nodeId: block.stableId,
      startOffset: boundary.prefix,
      endOffset: boundary.previousEnd,
    }).document;
  }
  if (boundary.nextMiddle.length > 0) {
    document = applyOperation(document, {
      type: "insertText",
      nodeId: block.stableId,
      offset: boundary.prefix,
      text: boundary.nextMiddle,
    }).document;
  }

  const projected = projectDocumentToStudioProjection(document);
  const remappedById = new Map(
    projected.taggedSpans.map((span) => [
      span.stableId.endsWith(":0") ? span.stableId.slice(0, -2) : span.stableId,
      span,
    ] as const),
  );
  const remapped: RemappedSpan[] = [];

  for (const span of block.taggedSpans) {
    if (classificationSpanIds.has(span.id)) {
      remapped.push({
        id: span.id,
        startOffset: 0,
        endOffset: nextBody.length,
        selectedText: nextBody,
      });
      continue;
    }
    const next = remappedById.get(span.id);
    if (!next || next.endOffset <= next.startOffset) {
      return {
        ok: false,
        error: `The edit would collapse the anchored passage “${span.selectedText.slice(0, 80)}”. Review that annotation in Nest before changing this text.`,
      };
    }
    if (span.knowledgeNode && next.selectedText !== span.selectedText) {
      return {
        ok: false,
        error: `The edit would rewrite reviewed knowledge evidence “${span.selectedText.slice(0, 80)}”. Continue in Nest so the evidence can be reviewed explicitly.`,
      };
    }
    remapped.push({
      id: span.id,
      startOffset: next.startOffset,
      endOffset: next.endOffset,
      selectedText: next.selectedText,
    });
  }

  const uniqueness = new Set<string>();
  for (const next of remapped) {
    const original = block.taggedSpans.find((span) => span.id === next.id);
    const key = `${original?.tagId ?? ""}:${next.startOffset}:${next.endOffset}`;
    if (uniqueness.has(key)) {
      return {
        ok: false,
        error: "This edit would merge two distinct text anchors. Review the annotations in Nest before changing this text.",
      };
    }
    uniqueness.add(key);
  }

  return { ok: true, spans: remapped };
}

async function loadNote(
  prisma: NoteTransaction,
  documentId: string,
): Promise<CanonicalDocumentNoteRecord | null> {
  return prisma.studioDocument.findUnique({
    where: { id: documentId },
    select: canonicalDocumentNoteSelect,
  });
}

function receiptId(actorUserId: string, documentId: string, clientRequestId: string) {
  return `document-note-edit-${sha256Text(`${actorUserId}|${documentId}|${clientRequestId}`).slice(0, 32)}`;
}

function serializableInput(input: CanonicalDocumentNoteEditInput) {
  const actorUserId = cleanId(input.actorUserId);
  const actorEmail = cleanId(input.actorEmail, 320).toLowerCase();
  const documentId = cleanId(input.documentId);
  const expectedContentRevision = cleanId(input.expectedContentRevision, 64).toLowerCase();
  const clientRequestId = cleanId(input.clientRequestId, 80).toLowerCase();
  const title = normalizeTitle(input.title);
  const blocks = Array.isArray(input.blocks)
    ? input.blocks.slice(0, MAX_BLOCK_COUNT + 1).map((block) => ({
        id: cleanId(block?.id),
        stableId: cleanId(block?.stableId),
        body: normalizeBody(block?.body),
      }))
    : [];
  const totalLength = blocks.reduce((sum, block) => sum + block.body.length, 0);
  const valid = Boolean(
    actorUserId
    && actorEmail
    && documentId
    && /^[0-9a-f]{64}$/.test(expectedContentRevision)
    && UUID_PATTERN.test(clientRequestId)
    && title
    && title.length <= 160
    && blocks.length > 0
    && blocks.length <= MAX_BLOCK_COUNT
    && blocks.every((block) =>
      block.id
      && block.stableId
      && block.body.length <= MAX_BLOCK_LENGTH)
    && new Set(blocks.map((block) => block.id)).size === blocks.length
    && new Set(blocks.map((block) => block.stableId)).size === blocks.length
    && totalLength <= MAX_TOTAL_LENGTH
    && blocks.some((block) => block.body.trim().length > 0),
  );

  return {
    valid,
    actorUserId,
    actorEmail,
    documentId,
    expectedContentRevision,
    clientRequestId,
    title,
    blocks,
  };
}

export async function editCanonicalDocumentNoteInTransaction(
  rawInput: CanonicalDocumentNoteEditInput,
  prisma: PrismaClient = getPrismaClient(),
): Promise<CanonicalDocumentNoteEditResult> {
  const input = serializableInput(rawInput);
  if (!input.valid) {
    return {
      ok: false,
      code: "INVALID_INPUT",
      error: "Refresh the note, add a title and body, then retry the same protected edit.",
    };
  }
  const groupId = `document-note-edit:${input.clientRequestId}`;
  const inputHash = sha256({
    actorUserId: input.actorUserId,
    documentId: input.documentId,
    expectedContentRevision: input.expectedContentRevision,
    title: input.title,
    blocks: input.blocks,
  });

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT 1::integer AS "locked"
        FROM pg_advisory_xact_lock(
          hashtextextended(${`quipsly-document-note:${input.documentId}`}, 0)
        )
      `;

      const note = await loadNote(tx, input.documentId);
      if (!note || !isDocumentNote(note)) {
        return {
          ok: false,
          code: "NOT_FOUND",
          error: "That canonical note is not available.",
        } as const;
      }
      if (!canReadPersonalWritingDocument(
        note.personalOwnerUserId,
        input.actorUserId,
        note.isPrivate,
      )) {
        return {
          ok: false,
          code: "NOT_FOUND",
          error: "That canonical note is not available.",
        } as const;
      }

      const access = await resolveStudioProjectAccess({
        projectSlug: note.project.slug,
        email: input.actorEmail,
        action: "write",
        prisma: tx as unknown as PrismaClient,
      });
      if (!access.allowed || access.projectId !== note.projectId) {
        return {
          ok: false,
          code: "NOT_FOUND",
          error: "That canonical note is not available.",
        } as const;
      }

      const priorOperation = await tx.studioDocumentOperation.findFirst({
        where: {
          documentId: note.id,
          groupId,
          operationType: "document-note-content-edit",
        },
        orderBy: { createdAt: "asc" },
        select: { id: true, afterJson: true },
      });
      if (priorOperation) {
        const receipt = jsonRecord(priorOperation.afterJson);
        const acknowledged = jsonRecord(receipt.acknowledged);
        if (receipt.schema !== NOTE_EDIT_SCHEMA || receipt.inputHash !== inputHash) {
          return {
            ok: false,
            code: "CONFLICT",
            error: "This edit identity is already bound to different note content. The protected draft was not overwritten.",
            current: projectCanonicalDocumentNote(note),
          } as const;
        }
        return {
          ok: true,
          note: acknowledged as unknown as CanonicalDocumentNoteSnapshot,
          receiptId: priorOperation.id,
          idempotentReplay: true,
          changedBlockIds: Array.isArray(receipt.changedBlockIds)
            ? receipt.changedBlockIds.filter((value): value is string => typeof value === "string")
            : [],
        } as const;
      }

      const current = projectCanonicalDocumentNote(note);
      if (!current.canEditContent) {
        return {
          ok: false,
          code: note.blocks.some((block) => isImmutableSourceEvidenceExternalId(block.externalId))
            ? "IMMUTABLE_SOURCE"
            : "CONFLICT",
          error: current.contentEditBoundary,
          current,
        } as const;
      }
      if (current.contentRevision !== input.expectedContentRevision) {
        return {
          ok: false,
          code: "CONFLICT",
          error: "This note changed in Nest after the iPhone draft began. Review both versions before retrying.",
          current,
        } as const;
      }

      const expectedBlocks = editableBlocks(note);
      const expectedById = new Map(expectedBlocks.map((block) => [block.id, block]));
      if (
        expectedBlocks.length !== input.blocks.length
        || input.blocks.some((block) => expectedById.get(block.id)?.stableId !== block.stableId)
      ) {
        return {
          ok: false,
          code: "CONFLICT",
          error: "The note structure changed in Nest. Review the current blocks before retrying the protected draft.",
          current,
        } as const;
      }

      const desiredBodies = new Map(input.blocks.map((block) => [block.id, block.body]));
      for (const block of note.blocks) {
        if (isSyntheticTitleBlock(note, block)) {
          desiredBodies.set(block.id, input.title);
        }
      }
      const changedBlocks = note.blocks.filter(
        (block) => desiredBodies.has(block.id) && desiredBodies.get(block.id) !== block.body,
      );
      const titleChanged = input.title !== note.title;
      if (!titleChanged && changedBlocks.length === 0) {
        return {
          ok: false,
          code: "INVALID_INPUT",
          error: "Change the note title or body before saving.",
          current,
        } as const;
      }

      const documentTagIds = new Set(note.tagLinks.map((link) => link.tagId));
      const remappedByBlock = new Map<string, RemappedSpan[]>();
      for (const block of changedBlocks) {
        const remapped = remapSpansForReplacement(
          block,
          desiredBodies.get(block.id) ?? block.body,
          input.title,
          documentTagIds,
        );
        if (!remapped.ok) {
          return {
            ok: false,
            code: "ANCHOR_REVIEW_REQUIRED",
            error: remapped.error,
            current,
          } as const;
        }
        remappedByBlock.set(block.id, remapped.spans);
      }

      const beforeSnapshot = revisionPayload(note);
      await tx.studioDocument.update({
        where: { id: note.id },
        data: { title: input.title },
      });
      for (const block of changedBlocks) {
        const nextBody = desiredBodies.get(block.id) ?? block.body;
        await tx.studioDocumentBlock.update({
          where: { id: block.id },
          data: { body: nextBody },
        });
        const remapped = remappedByBlock.get(block.id) ?? [];
        for (const nextSpan of remapped) {
          const priorSpan = block.taggedSpans.find((span) => span.id === nextSpan.id);
          await tx.studioTaggedSpan.update({
            where: { id: nextSpan.id },
            data: {
              startOffset: nextSpan.startOffset,
              endOffset: nextSpan.endOffset,
              selectedText: nextSpan.selectedText,
              documentTitleSnapshot: input.title,
            },
          });
          if (priorSpan?.knowledgeNode) {
            await tx.studioKnowledgeNode.update({
              where: { id: priorSpan.knowledgeNode.id },
              data: {
                sourceText: nextSpan.selectedText,
                spanStartOffset: nextSpan.startOffset,
                spanEndOffset: nextSpan.endOffset,
                documentTitleSnapshot: input.title,
              },
            });
          }
        }
      }
      if (titleChanged) {
        await tx.studioTaggedSpan.updateMany({
          where: { documentId: note.id },
          data: { documentTitleSnapshot: input.title },
        });
        await tx.studioKnowledgeNode.updateMany({
          where: { documentId: note.id },
          data: { documentTitleSnapshot: input.title },
        });
      }

      const saved = await loadNote(tx, note.id);
      if (!saved) {
        throw new Error("Canonical note disappeared during its edit transaction.");
      }
      const acknowledged = projectCanonicalDocumentNote(saved);
      const operationId = receiptId(
        input.actorUserId,
        input.documentId,
        input.clientRequestId,
      );
      await tx.studioDocumentOperation.create({
        data: {
          id: operationId,
          projectId: note.projectId,
          documentId: note.id,
          groupId,
          actorEmail: input.actorEmail,
          origin: "human",
          operationType: "document-note-content-edit",
          status: "applied",
          beforeJson: beforeSnapshot as Prisma.InputJsonValue,
          afterJson: {
            schema: NOTE_EDIT_SCHEMA,
            inputHash,
            clientRequestId: input.clientRequestId,
            expectedContentRevision: input.expectedContentRevision,
            acknowledged,
            changedBlockIds: changedBlocks.map((block) => block.id),
            anchorsPreserved: true,
            tagsChanged: false,
            structureChanged: false,
            sourceMutated: false,
            externalSideEffects: false,
          } as Prisma.InputJsonValue,
          payloadJson: {
            surface: "canonical-document-note",
            actorUserId: input.actorUserId,
            requestId: input.clientRequestId,
            replacementStrategy: "stable-block-content-with-kernel-anchor-remap",
          },
          reversible: true,
        },
      });

      return {
        ok: true,
        note: acknowledged,
        receiptId: operationId,
        idempotentReplay: false,
        changedBlockIds: changedBlocks.map((block) => block.id),
      } as const;
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    console.error("[canonical-document-note] edit failed", error);
    return {
      ok: false,
      code: "UNAVAILABLE",
      error: "Nest could not safely apply this note edit. The protected draft should remain available for retry.",
    };
  }
}
