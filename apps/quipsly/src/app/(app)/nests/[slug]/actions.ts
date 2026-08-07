"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createHash, randomUUID } from "crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getPrismaClient } from "@/lib/prisma";
import { resolveQuickEntryTags, type QuickEntryTag } from "@/lib/server/quick-entry-tags";
import { resolveStudioProjectAccess } from "@/lib/server/studio-project-access";
import { normalizeWorkTagLabel } from "@/lib/server/work-tag-normalization";
import { personalWritingDocumentVisibilityWhere } from "@/lib/server/personal-writing-documents";
import { auth } from "@/auth";

type CreateNestDocumentKind = "draft" | "note" | "study-source";

export type CreateNestQuickNoteResult =
  | {
      ok: true;
      documentId: string;
      blockId: string;
      projectSlug: string;
      href: string;
      idempotentReplay: boolean;
      externalSideEffects: false;
    }
  | {
      ok: false;
      code: "AUTH_REQUIRED" | "INVALID_INPUT" | "FORBIDDEN" | "CONFLICT" | "UNAVAILABLE";
      error: string;
    };

export type CreateNestQuickWorkResult =
  | {
      ok: true;
      entityKind: "TASK" | "GOAL";
      entityId: string;
      projectSlug: string;
      href: string;
      tags: QuickEntryTag[];
      idempotentReplay: boolean;
      externalSideEffects: false;
    }
  | {
      ok: false;
      code: "AUTH_REQUIRED" | "INVALID_INPUT" | "FORBIDDEN" | "CONFLICT" | "UNAVAILABLE";
      error: string;
    };

const DOCUMENT_PRESETS: Record<CreateNestDocumentKind, {
  title: string;
  sourceLabel: string;
  blocks: string[];
}> = {
  draft: {
    title: "New Draft",
    sourceLabel: "document-kind:draft",
    blocks: [
      "Draft Title",
      "Start drafting here. This is a side draft inside the Nest, not the canonical manuscript until you intentionally promote or copy it.",
    ],
  },
  note: {
    title: "New Note",
    sourceLabel: "document-kind:note",
    blocks: [
      "Note Title",
      "Capture the thought here. Notes can be tagged, linked, summarized, or pulled into drafts later without pretending they are manuscript truth.",
    ],
  },
  "study-source": {
    title: "New Study Source",
    sourceLabel: "document-kind:fixed-source",
    blocks: [
      "Source Title",
      "Paste or import source text here. Treat this as fixed source material: annotate over it, cite it, and keep provenance visible before using it in your own writing.",
    ],
  },
};

const HGO_SOURCE_ROOT_ENV = "QUIPSLY_HGO_PODCAST_YEAR_ONE_SOURCE_ROOT";
const DEFAULT_HGO_SOURCE_ROOT = path.join(process.cwd(), "data", "hgo-podcast-year-1");
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STORY_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,127}$/;

const HGO_SOURCE_CATALOG = [
  { key: "episode-1", label: "Episode 1 Source", relativePath: "1 - March 25 - Pilot/1.md" },
  { key: "episode-2", label: "Episode 2 Source", relativePath: "2 - April 1 - It's a Metaphor!/2.md" },
  { key: "episode-3", label: "Episode 3 Source", relativePath: "3 - April 8 - Chub and Jack/3.md" },
  { key: "episode-4", label: "Episode 4 Source", relativePath: "4 - April 15 - Early Life Lessons/4.md" },
  { key: "episode-5", label: "Episode 5 Source", relativePath: "5 - April 22 - Values/5.md" },
  { key: "episode-6", label: "Episode 6 Source", relativePath: "6 - New - Values 2/6.md" },
  { key: "episode-7", label: "Episode 7 Source", relativePath: "7 - In The Army Now/7.md" },
  { key: "episode-8", label: "Episode 8 Source", relativePath: "8 - Don't Shush the Shusher/8.md" },
  { key: "episode-9", label: "Episode 9 Source", relativePath: "9 - I wasn't born a leader/9.md" },
] as const;

export type HgoSourceKey = typeof HGO_SOURCE_CATALOG[number]["key"];

function hgoSourceRoot() {
  const configuredRoot = process.env[HGO_SOURCE_ROOT_ENV]?.trim();
  if (configuredRoot) {
    return path.resolve(/* turbopackIgnore: true */ configuredRoot);
  }

  return DEFAULT_HGO_SOURCE_ROOT;
}

function resolveHgoSource(sourceKey: HgoSourceKey) {
  const source = HGO_SOURCE_CATALOG.find((item) => item.key === sourceKey);
  if (!source) {
    throw new Error("Unknown HGO source.");
  }

  const sourceRoot = hgoSourceRoot();
  const sourcePath = path.resolve(/* turbopackIgnore: true */ sourceRoot, source.relativePath);

  if (sourcePath !== sourceRoot && !sourcePath.startsWith(`${sourceRoot}${path.sep}`)) {
    throw new Error("Refusing to import a source outside the approved HGO source root.");
  }

  return { ...source, sourcePath };
}

function chunkSourceText(text: string, maxChars = 3600) {
  const paragraphs = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  for (const paragraph of paragraphs) {
    if (paragraph.length <= maxChars) {
      chunks.push(paragraph);
      continue;
    }

    for (let index = 0; index < paragraph.length; index += maxChars) {
      chunks.push(paragraph.slice(index, index + maxChars).trim());
    }
  }

  return chunks;
}

function cleanQuickNoteText(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.replace(/\r\n/g, "\n").trim().slice(0, maxLength)
    : "";
}

function cleanQuickCaptureTagInput(input: {
  tagIds?: unknown;
  newTagLabels?: unknown;
}) {
  const rawTagIds = input.tagIds === undefined ? [] : input.tagIds;
  const rawNewTagLabels = input.newTagLabels === undefined ? [] : input.newTagLabels;
  if (!Array.isArray(rawTagIds) || !Array.isArray(rawNewTagLabels)
      || rawTagIds.length > 24 || rawNewTagLabels.length > 8
      || rawTagIds.length + rawNewTagLabels.length > 24) {
    return null;
  }
  const tagIds = rawTagIds
    .map((value) => cleanQuickNoteText(value, 200))
    .filter(Boolean)
    .sort();
  const newTagLabels = rawNewTagLabels
    .map((value) => normalizeWorkTagLabel(value))
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => left.localeCompare(right));
  const normalizedLabels = newTagLabels.map((label) => label.normalize("NFKC").toLocaleLowerCase("en-US"));
  if (tagIds.length !== rawTagIds.length
      || newTagLabels.length !== rawNewTagLabels.length
      || new Set(tagIds).size !== tagIds.length
      || new Set(normalizedLabels).size !== normalizedLabels.length) {
    return null;
  }
  return { tagIds, newTagLabels };
}

function safeJsonRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function quickNoteInputHash(input: {
  actorUserId: string;
  projectSlug: string;
  title: string;
  body: string;
  tagIds: string[];
  newTagLabels: string[];
}) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function quickCaptureTagFailure(
  result: Exclude<Awaited<ReturnType<typeof resolveQuickEntryTags>>, { kind: "resolved" }>,
): Extract<CreateNestQuickNoteResult, { ok: false }> {
  if (result.kind === "tag-creation-forbidden") {
    return { ok: false, code: "FORBIDDEN", error: "Editor access to this Nest is required to expand its reusable vocabulary." };
  }
  if (result.kind === "archived-tag") {
    return { ok: false, code: "INVALID_INPUT", error: `“${result.label}” is archived. Restore or rename it before using it.` };
  }
  if (result.kind === "tag-slug-conflict") {
    return { ok: false, code: "INVALID_INPUT", error: `“${result.label}” conflicts with existing tag “${result.existingLabel}”. Choose a more distinct name.` };
  }
  return { ok: false, code: "INVALID_INPUT", error: "Choose only active reusable tags from this Nest." };
}

export async function createNestQuickNoteAction(input: {
  projectSlug: string;
  title: string;
  body: string;
  clientRequestId: string;
  tagIds?: string[];
  newTagLabels?: string[];
}): Promise<CreateNestQuickNoteResult> {
  const session = await auth();
  const actorUserId = session?.user?.id;
  const actorEmail = (session?.user?.primaryEmail || session?.user?.email || "").trim().toLowerCase();
  if (!actorUserId || !actorEmail) {
    return { ok: false, code: "AUTH_REQUIRED", error: "Sign in before saving a private project note." };
  }

  const projectSlug = cleanQuickNoteText(input?.projectSlug, 160).toLowerCase();
  const title = cleanQuickNoteText(input?.title, 160).replace(/\s+/g, " ");
  const body = cleanQuickNoteText(input?.body, 12_000);
  const clientRequestId = cleanQuickNoteText(input?.clientRequestId, 80).toLowerCase();
  const tagInput = cleanQuickCaptureTagInput(input ?? {});
  if (!projectSlug || !title || !body || !UUID_PATTERN.test(clientRequestId) || !tagInput) {
    return {
      ok: false,
      code: "INVALID_INPUT",
      error: "Add a title and note, then retry with the same capture identity.",
    };
  }

  const inputHash = quickNoteInputHash({
    actorUserId,
    projectSlug,
    title,
    body,
    tagIds: tagInput.tagIds,
    newTagLabels: tagInput.newTagLabels,
  });
  const stableId = `project-note:${actorUserId}:${clientRequestId}`;
  const groupId = `project-capture:${clientRequestId}`;
  const sourceLabel = "document-kind:note;origin:nest-project-capture";
  const prisma = getPrismaClient();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const access = await resolveStudioProjectAccess({
        projectSlug,
        email: actorEmail,
        action: "write",
        prisma: tx as typeof prisma,
      });
      if (!access.allowed || !access.projectId) return { kind: "forbidden" as const };

      const existing = await tx.studioDocument.findUnique({
        where: { stableId },
        select: {
          id: true,
          projectId: true,
          blocks: { orderBy: { order: "asc" }, take: 1, select: { id: true } },
          documentOperations: {
            where: { groupId, operationType: "create-project-quick-note" },
            orderBy: { createdAt: "asc" },
            take: 1,
            select: { afterJson: true },
          },
        },
      });
      if (existing) {
        const receipt = safeJsonRecord(existing.documentOperations[0]?.afterJson);
        if (existing.projectId !== access.projectId || receipt.inputHash !== inputHash || !existing.blocks[0]?.id) {
          return { kind: "conflict" as const };
        }
        return {
          kind: "saved" as const,
          documentId: existing.id,
          blockId: existing.blocks[0].id,
          idempotentReplay: true,
        };
      }

      const tagResolution = await resolveQuickEntryTags({
        tx,
        projectId: access.projectId,
        actorEmail,
        tagIds: tagInput.tagIds,
        newTagLabels: tagInput.newTagLabels,
      });
      if (tagResolution.kind !== "resolved") return tagResolution;

      const blockId = `${stableId}:body`;
      const document = await tx.studioDocument.create({
        data: {
          projectId: access.projectId,
          personalOwnerUserId: actorUserId,
          stableId,
          title,
          sourceLabel,
          projectionStatus: "private",
          isPrivate: true,
          tagRevision: tagResolution.tags.length > 0 ? 1 : 0,
          blocks: {
            create: [{
              id: blockId,
              stableId: blockId,
              order: 0,
              title: null,
              body,
              sourceLabel,
              isPrivate: true,
            }],
          },
        },
        select: { id: true },
      });

      if (tagResolution.tags.length > 0) {
        await tx.studioDocumentTagLink.createMany({
          data: tagResolution.tags.map((tag) => ({
            documentId: document.id,
            tagId: tag.id,
            createdByUserId: actorUserId,
            sourceJson: {
              source: "quipsly-project-quick-note-v2",
              clientRequestId,
              documentLevel: true,
              sourceMutated: false,
              externalSideEffects: false,
            },
          })),
        });
      }

      await tx.studioDocumentOperation.create({
        data: {
          projectId: access.projectId,
          documentId: document.id,
          groupId,
          actorEmail,
          origin: "human",
          operationType: "create-project-quick-note",
          status: "applied",
          afterJson: {
            schema: "quipsly-project-quick-note-v1",
            inputHash,
            clientRequestId,
            tagIds: tagResolution.tags.map((tag) => tag.id),
            tagLabels: tagResolution.tags.map((tag) => tag.label),
            requestedNewTagLabels: tagInput.newTagLabels,
            createdTagCount: tagResolution.createdTagCount,
            reusedTagCount: tagResolution.reusedTagCount,
            sourceMutated: false,
            externalSideEffects: false,
          },
          payloadJson: {
            surface: "nest-project",
            explicitHumanCapture: true,
            destination: "project-note",
          },
          reversible: true,
        },
      });

      return {
        kind: "saved" as const,
        documentId: document.id,
        blockId,
        idempotentReplay: false,
      };
    }, { isolationLevel: "Serializable" });

    if (result.kind === "forbidden") {
      return { ok: false, code: "FORBIDDEN", error: "Editor access to this project is required." };
    }
    if (result.kind === "conflict") {
      return {
        ok: false,
        code: "CONFLICT",
        error: "This capture identity already belongs to different note evidence. Your text was not overwritten.",
      };
    }
    if (result.kind !== "saved") return quickCaptureTagFailure(result);

    revalidatePath(`/nests/${projectSlug}`);
    revalidatePath("/library");
    revalidatePath("/find");
    const href = `/create?project=${encodeURIComponent(projectSlug)}&document=${encodeURIComponent(result.documentId)}&block=${encodeURIComponent(result.blockId)}`;
    return {
      ok: true,
      documentId: result.documentId,
      blockId: result.blockId,
      projectSlug,
      href,
      idempotentReplay: result.idempotentReplay,
      externalSideEffects: false,
    };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && String((error as { code?: unknown }).code) === "P2002") {
      const replay = await prisma.studioDocument.findUnique({
        where: { stableId },
        select: {
          id: true,
          project: { select: { slug: true } },
          blocks: { orderBy: { order: "asc" }, take: 1, select: { id: true } },
          documentOperations: {
            where: { groupId, operationType: "create-project-quick-note" },
            orderBy: { createdAt: "asc" },
            take: 1,
            select: { afterJson: true },
          },
        },
      }).catch(() => null);
      const receipt = safeJsonRecord(replay?.documentOperations[0]?.afterJson);
      if (replay?.project.slug === projectSlug && replay.blocks[0]?.id && receipt.inputHash === inputHash) {
        revalidatePath(`/nests/${projectSlug}`);
        revalidatePath("/library");
        revalidatePath("/find");
        return {
          ok: true,
          documentId: replay.id,
          blockId: replay.blocks[0].id,
          projectSlug,
          href: `/create?project=${encodeURIComponent(projectSlug)}&document=${encodeURIComponent(replay.id)}&block=${encodeURIComponent(replay.blocks[0].id)}`,
          idempotentReplay: true,
          externalSideEffects: false,
        };
      }
      if (replay) {
        return {
          ok: false,
          code: "CONFLICT",
          error: "This capture identity already belongs to different note evidence. Your text was not overwritten.",
        };
      }
    }
    console.error("[nest-project] failed to create quick note", error);
    return {
      ok: false,
      code: "UNAVAILABLE",
      error: "Quipsly could not save this project note. No task, message, calendar event, or publication was created.",
    };
  }
}

export async function createNestQuickWorkAction(input: {
  projectSlug: string;
  entityKind: "TASK" | "GOAL";
  title: string;
  body?: string;
  clientRequestId: string;
  tagIds?: string[];
  newTagLabels?: string[];
  sourceCardId?: string;
  sourceBoardId?: string;
}): Promise<CreateNestQuickWorkResult> {
  const session = await auth();
  const actorUserId = session?.user?.id;
  const actorEmail = (session?.user?.primaryEmail || session?.user?.email || "").trim().toLowerCase();
  if (!actorUserId || !actorEmail) {
    return { ok: false, code: "AUTH_REQUIRED", error: "Sign in before saving private project work." };
  }

  const projectSlug = cleanQuickNoteText(input?.projectSlug, 160).toLowerCase();
  const entityKind = input?.entityKind;
  const title = cleanQuickNoteText(input?.title, 500).replace(/\s+/g, " ");
  const body = cleanQuickNoteText(input?.body, 5_000).replace(/\s+/g, " ");
  const clientRequestId = cleanQuickNoteText(input?.clientRequestId, 80).toLowerCase();
  const sourceCardId = cleanQuickNoteText(input?.sourceCardId, 128).toLowerCase();
  const sourceBoardId = cleanQuickNoteText(input?.sourceBoardId, 128).toLowerCase();
  const tagInput = cleanQuickCaptureTagInput(input ?? {});
  if (!projectSlug || !["TASK", "GOAL"].includes(entityKind) || !title
      || !UUID_PATTERN.test(clientRequestId) || !tagInput
      || (sourceCardId && (!STORY_ID_PATTERN.test(sourceCardId) || entityKind !== "TASK"))
      || (sourceCardId && tagInput?.newTagLabels.length)
      || (sourceBoardId && (!sourceCardId || !STORY_ID_PATTERN.test(sourceBoardId)))) {
    return {
      ok: false,
      code: "INVALID_INPUT",
      error: "Add a Task or Goal title, then retry with the same capture identity.",
    };
  }

  const inputHash = createHash("sha256").update(JSON.stringify({
    actorUserId,
    projectSlug,
    entityKind,
    title,
    body,
    tagIds: tagInput.tagIds,
    newTagLabels: tagInput.newTagLabels,
    sourceCardId,
    sourceBoardId,
  })).digest("hex");
  const entityId = `project-${entityKind.toLowerCase()}-${clientRequestId}`;
  const receiptId = `project-capture-${clientRequestId}`;
  const prisma = getPrismaClient();

  const readExisting = async (database: typeof prisma) => {
    if (entityKind === "TASK") {
      const task = await database.actionItem.findUnique({
        where: { id: entityId },
        select: {
          id: true,
          projectId: true,
          assignedUserId: true,
          sourceJson: true,
          tagLinks: {
            select: { tag: { select: { id: true, slug: true, label: true } } },
            orderBy: { tag: { label: "asc" } },
          },
        },
      });
      return task ? {
        projectId: task.projectId,
        ownerUserId: task.assignedUserId,
        sourceJson: task.sourceJson,
        tags: task.tagLinks.map((link) => link.tag),
      } : null;
    }
    const goal = await database.goal.findUnique({
      where: { id: entityId },
      select: {
        id: true,
        projectId: true,
        ownerUserId: true,
        sourceJson: true,
        tagLinks: {
          select: { tag: { select: { id: true, slug: true, label: true } } },
          orderBy: { tag: { label: "asc" } },
        },
      },
    });
    return goal ? {
      projectId: goal.projectId,
      ownerUserId: goal.ownerUserId,
      sourceJson: goal.sourceJson,
      tags: goal.tagLinks.map((link) => link.tag),
    } : null;
  };

  const matchesExisting = (existing: Awaited<ReturnType<typeof readExisting>>, projectId: string) => {
    const creationReceipt = safeJsonRecord(safeJsonRecord(existing?.sourceJson).creationReceipt);
    return Boolean(existing)
      && existing?.projectId === projectId
      && existing?.ownerUserId === actorUserId
      && creationReceipt.inputHash === inputHash;
  };

  try {
    const result = await prisma.$transaction(async (tx) => {
      const access = await resolveStudioProjectAccess({
        projectSlug,
        email: actorEmail,
        action: "write",
        prisma: tx as typeof prisma,
      });
      if (!access.allowed || !access.projectId) return { kind: "forbidden" as const };

      const existing = await readExisting(tx as typeof prisma);
      if (existing) {
        if (!matchesExisting(existing, access.projectId)) return { kind: "conflict" as const };
        return { kind: "saved" as const, tags: existing.tags, idempotentReplay: true };
      }

      const sourceCard = sourceCardId
        ? await tx.studioStoryCard.findFirst({
            where: {
              id: sourceCardId,
              projectId: access.projectId,
              archivedAt: null,
              ...(sourceBoardId ? {
                placements: {
                  some: {
                    boardId: sourceBoardId,
                    board: { projectId: access.projectId, archivedAt: null },
                  },
                },
              } : {}),
            },
            select: {
              id: true,
              stableId: true,
              title: true,
              revision: true,
              tags: { select: { tag: { select: { id: true } } }, orderBy: { tagId: "asc" } },
              sourceRange: {
                select: {
                  id: true,
                  startSeconds: true,
                  endSeconds: true,
                  selectorSha256: true,
                  sourceRevision: { select: { id: true, identitySha256: true } },
                  sourceSet: { select: { id: true, captureKey: true, displayName: true, identitySha256: true } },
                },
              },
              placements: {
                where: sourceBoardId ? { boardId: sourceBoardId } : { id: "__no-board-context__" },
                take: 1,
                select: {
                  board: { select: { id: true, slug: true, title: true, revision: true } },
                  groupKey: true,
                  laneKey: true,
                },
              },
            },
          })
        : null;
      if (sourceCardId && (!sourceCard || !sourceCard.sourceRange)) {
        return { kind: "source-card-unavailable" as const };
      }
      if (sourceCard) {
        const currentCardTagIds = sourceCard.tags.map((link) => link.tag.id).sort();
        if (currentCardTagIds.join("\n") !== tagInput.tagIds.join("\n")) {
          return { kind: "source-card-tags-stale" as const };
        }
      }

      const tagResolution = await resolveQuickEntryTags({
        tx,
        projectId: access.projectId,
        actorEmail,
        tagIds: tagInput.tagIds,
        newTagLabels: tagInput.newTagLabels,
      });
      if (tagResolution.kind !== "resolved") return tagResolution;

      const now = new Date();
      const sourcePlacement = sourceCard?.placements[0] ?? null;
      const sourceCardAnchor = sourceCard?.sourceRange ? {
        schema: "quipsly-source-card-action-anchor-v1",
        projectSlug,
        storyCardId: sourceCard.id,
        storyCardStableId: sourceCard.stableId,
        storyCardTitle: sourceCard.title,
        storyCardRevision: sourceCard.revision,
        sourceRangeId: sourceCard.sourceRange.id,
        startSeconds: sourceCard.sourceRange.startSeconds,
        endSeconds: sourceCard.sourceRange.endSeconds,
        selectorSha256: sourceCard.sourceRange.selectorSha256,
        sourceRevisionId: sourceCard.sourceRange.sourceRevision.id,
        sourceRevisionIdentitySha256: sourceCard.sourceRange.sourceRevision.identitySha256,
        sourceSetId: sourceCard.sourceRange.sourceSet?.id ?? null,
        sourceSetIdentitySha256: sourceCard.sourceRange.sourceSet?.identitySha256 ?? null,
        captureKey: sourceCard.sourceRange.sourceSet?.captureKey ?? null,
        sourceDisplayName: sourceCard.sourceRange.sourceSet?.displayName ?? null,
        boardId: sourcePlacement?.board.id ?? null,
        boardSlug: sourcePlacement?.board.slug ?? null,
        boardTitle: sourcePlacement?.board.title ?? null,
        boardRevision: sourcePlacement?.board.revision ?? null,
        boardSection: sourcePlacement?.groupKey ?? null,
        boardLane: sourcePlacement?.laneKey ?? null,
        capturedAt: now.toISOString(),
        immutableSourceRange: true,
        externalSideEffects: false,
      } : null;
      const sourceCardEvidenceReceiptId = sourceCardAnchor
        ? `source-card-action-${clientRequestId}`
        : null;
      const creationReceipt = {
        id: receiptId,
        kind: entityKind === "TASK" ? "quipsly-project-task-capture-v1" : "quipsly-project-goal-capture-v1",
        inputHash,
        clientRequestId,
        projectId: access.projectId,
        tagIds: tagResolution.tags.map((tag) => tag.id),
        tagLabels: tagResolution.tags.map((tag) => tag.label),
        requestedNewTagLabels: tagInput.newTagLabels,
        createdTagCount: tagResolution.createdTagCount,
        reusedTagCount: tagResolution.reusedTagCount,
        createdAt: now.toISOString(),
        createdByUserId: actorUserId,
        assignedToCreator: entityKind === "TASK",
        explicitHumanCapture: true,
        externalSideEffects: false,
        messageSent: false,
        calendarMutated: false,
        published: false,
        ...(sourceCardEvidenceReceiptId ? { sourceCardEvidenceReceiptId } : {}),
      };
      const sourceJson = {
        source: "quipsly-project-quick-capture-v1",
        surface: "nest-project",
        creationReceipt,
        ...(sourceCardAnchor ? { sourceCardAnchor } : {}),
      };
      const linkSourceJson = {
        schema: "quipsly-record-tag-link-v1",
        surface: "nest-project",
        clientRequestId,
        explicitHumanCapture: true,
        externalSideEffects: false,
      };

      if (entityKind === "TASK") {
        await tx.actionItem.create({
          data: {
            id: entityId,
            assignedUserId: actorUserId,
            projectId: access.projectId,
            title,
            detail: body || null,
            sourceJson,
          },
        });
        if (sourceCardAnchor && sourceCardEvidenceReceiptId) {
          await tx.actionItemEvidenceReceipt.create({
            data: {
              id: sourceCardEvidenceReceiptId,
              actionItemId: entityId,
              actorUserId,
              kind: "SOURCE_CARD_ANCHOR",
              note: `Task created from source card: ${sourceCardAnchor.storyCardTitle}`,
              evidenceJson: sourceCardAnchor,
              occurredAt: now,
            },
          });
        }
        if (tagResolution.tags.length > 0) {
          await tx.actionItemTagLink.createMany({
            data: tagResolution.tags.map((tag) => ({
              actionItemId: entityId,
              tagId: tag.id,
              createdByUserId: actorUserId,
              sourceJson: linkSourceJson,
            })),
          });
        }
      } else {
        await tx.goal.create({
          data: {
            id: entityId,
            ownerUserId: actorUserId,
            projectId: access.projectId,
            title,
            description: body || null,
            sourceJson,
          },
        });
        if (tagResolution.tags.length > 0) {
          await tx.goalTagLink.createMany({
            data: tagResolution.tags.map((tag) => ({
              goalId: entityId,
              tagId: tag.id,
              createdByUserId: actorUserId,
              sourceJson: linkSourceJson,
            })),
          });
        }
      }
      return {
        kind: "saved" as const,
        tags: tagResolution.tags,
        idempotentReplay: false,
      };
    }, { isolationLevel: "Serializable" });

    if (result.kind === "forbidden") {
      return { ok: false, code: "FORBIDDEN", error: "Editor access to this project is required." };
    }
    if (result.kind === "conflict") {
      return {
        ok: false,
        code: "CONFLICT",
        error: "This capture identity already belongs to different project work. Nothing was overwritten.",
      };
    }
    if (result.kind === "source-card-unavailable") {
      return {
        ok: false,
        code: "CONFLICT",
        error: "That source card or board placement is no longer available. Nothing was created.",
      };
    }
    if (result.kind === "source-card-tags-stale") {
      return {
        ok: false,
        code: "CONFLICT",
        error: "That source card's tags changed before the task was saved. Refresh the card and try again; nothing was created.",
      };
    }
    if (result.kind !== "saved") return quickCaptureTagFailure(result);

    revalidatePath(`/nests/${projectSlug}`);
    revalidatePath("/work");
    revalidatePath("/today");
    revalidatePath("/schedule");
    revalidatePath("/find");
    const href = entityKind === "TASK"
      ? `/work?task=${encodeURIComponent(entityId)}`
      : `/work?goal=${encodeURIComponent(entityId)}`;
    return {
      ok: true,
      entityKind,
      entityId,
      projectSlug,
      href,
      tags: result.tags,
      idempotentReplay: result.idempotentReplay,
      externalSideEffects: false,
    };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && String((error as { code?: unknown }).code) === "P2002") {
      const access = await resolveStudioProjectAccess({
        projectSlug,
        email: actorEmail,
        action: "write",
      }).catch(() => null);
      const replay = access?.allowed && access.projectId
        ? await readExisting(prisma).catch(() => null)
        : null;
      if (access?.projectId && matchesExisting(replay, access.projectId)) {
        revalidatePath(`/nests/${projectSlug}`);
        revalidatePath("/work");
        revalidatePath("/today");
        revalidatePath("/schedule");
        revalidatePath("/find");
        return {
          ok: true,
          entityKind,
          entityId,
          projectSlug,
          href: entityKind === "TASK"
            ? `/work?task=${encodeURIComponent(entityId)}`
            : `/work?goal=${encodeURIComponent(entityId)}`,
          tags: replay?.tags ?? [],
          idempotentReplay: true,
          externalSideEffects: false,
        };
      }
      if (replay) {
        return {
          ok: false,
          code: "CONFLICT",
          error: "This capture identity already belongs to different project work. Nothing was overwritten.",
        };
      }
    }
    console.error("[nest-project] failed to create quick work", error);
    return {
      ok: false,
      code: "UNAVAILABLE",
      error: "Quipsly could not save this project work. No message, calendar event, reminder, or publication was created.",
    };
  }
}

export async function createDocumentAction(projectSlug: string, kind: CreateNestDocumentKind = "note") {
  const session = await auth();
  const actorEmail = session?.user?.primaryEmail || session?.user?.email;

  if (!actorEmail) {
    throw new Error("UNAUTHORIZED: Must be logged in to create a document.");
  }

  const access = await resolveStudioProjectAccess({
    projectSlug,
    email: actorEmail,
    action: "write",
  });

  if (!access.allowed) {
    throw new Error("UNAUTHORIZED: You do not have write access to this Nest.");
  }

  const prisma = getPrismaClient();
  const project = await prisma.studioProject.findFirst({
    where: { slug: projectSlug },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  const preset = DOCUMENT_PRESETS[kind] ?? DOCUMENT_PRESETS.note;
  const stableDocumentId = randomUUID();
  const document = await prisma.studioDocument.create({
    data: {
      projectId: project.id,
      stableId: stableDocumentId,
      title: preset.title,
      sourceLabel: preset.sourceLabel,
      blocks: {
        create: preset.blocks.map((body, index) => ({
          stableId: `${stableDocumentId}-block-${index + 1}`,
          order: index,
          title: index === 0 ? body : null,
          body,
          sourceLabel: preset.sourceLabel,
        })),
      },
    },
  });

  revalidatePath(`/nests/${projectSlug}`);
  revalidatePath(`/create`);
  redirect(`/create?project=${encodeURIComponent(project.slug)}&document=${encodeURIComponent(document.id)}`);
}

export async function renameDocumentAction(projectSlug: string, documentId: string, nextTitle: string) {
  const session = await auth();
  const actorUserId = session?.user?.id;
  const actorEmail = session?.user?.primaryEmail || session?.user?.email;

  if (!actorEmail || !actorUserId) {
    throw new Error("UNAUTHORIZED: Must be logged in to rename a document.");
  }

  const trimmedTitle = nextTitle.trim().replace(/\s+/g, " ");
  if (!trimmedTitle) {
    throw new Error("A page needs a title.");
  }

  if (trimmedTitle.length > 160) {
    throw new Error("Keep page titles under 160 characters.");
  }

  const access = await resolveStudioProjectAccess({
    projectSlug,
    email: actorEmail,
    action: "write",
  });

  if (!access.allowed) {
    throw new Error("UNAUTHORIZED: You do not have write access to this Nest.");
  }

  const prisma = getPrismaClient();
  const project = await prisma.studioProject.findFirst({
    where: { slug: projectSlug },
    select: { id: true, slug: true },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  const document = await prisma.studioDocument.findFirst({
    where: {
      id: documentId,
      projectId: project.id,
      ...personalWritingDocumentVisibilityWhere(actorUserId),
    },
    select: {
      id: true,
      title: true,
    },
  });

  if (!document) {
    throw new Error("Document not found in this Nest.");
  }

  if (document.title === trimmedTitle) {
    revalidatePath(`/create`);
    return { ok: true, title: trimmedTitle };
  }

  await prisma.studioDocument.update({
    where: { id: document.id },
    data: { title: trimmedTitle },
  });

  revalidatePath(`/nests/${projectSlug}`);
  revalidatePath(`/create`);
  return { ok: true, title: trimmedTitle };
}

export async function duplicateDocumentAsDraftAction(projectSlug: string, documentId: string) {
  const session = await auth();
  const actorUserId = session?.user?.id;
  const actorEmail = session?.user?.primaryEmail || session?.user?.email;

  if (!actorEmail || !actorUserId) {
    throw new Error("UNAUTHORIZED: Must be logged in to duplicate a document.");
  }

  const access = await resolveStudioProjectAccess({
    projectSlug,
    email: actorEmail,
    action: "write",
  });

  if (!access.allowed) {
    throw new Error("UNAUTHORIZED: You do not have write access to this Nest.");
  }

  const prisma = getPrismaClient();
  const project = await prisma.studioProject.findFirst({
    where: { slug: projectSlug },
    select: { id: true, slug: true },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  const sourceDocument = await prisma.studioDocument.findFirst({
    where: {
      id: documentId,
      projectId: project.id,
      ...personalWritingDocumentVisibilityWhere(actorUserId),
    },
    include: {
      blocks: {
        orderBy: { order: "asc" },
      },
    },
  });

  if (!sourceDocument) {
    throw new Error("Document not found in this Nest.");
  }

  const stableDocumentId = randomUUID();
  const sourceLabel = [
    "document-kind:draft",
    "draft-kind:branch",
    `branched-from-document:${sourceDocument.id}`,
    sourceDocument.sourceLabel ? `branched-from-label:${sourceDocument.sourceLabel}` : null,
  ].filter(Boolean).join(";");

  const duplicate = await prisma.studioDocument.create({
    data: {
      projectId: project.id,
      personalOwnerUserId: sourceDocument.personalOwnerUserId,
      stableId: stableDocumentId,
      title: `${sourceDocument.title} - Draft Copy`,
      sourceLabel,
      blocks: {
        create: sourceDocument.blocks.map((block, index) => ({
          stableId: `${stableDocumentId}-block-${index + 1}`,
          order: index,
          title: block.title,
          body: block.body,
          sourceLabel,
        })),
      },
    },
    select: { id: true },
  });

  revalidatePath(`/nests/${projectSlug}`);
  revalidatePath(`/create`);
  return {
    ok: true,
    documentId: duplicate.id,
    href: `/create?project=${encodeURIComponent(project.slug)}&document=${encodeURIComponent(duplicate.id)}`,
  };
}

export async function promoteNoteToWritingPageAction(projectSlug: string, documentId: string) {
  const session = await auth();
  const actorUserId = session?.user?.id;
  const actorEmail = session?.user?.primaryEmail || session?.user?.email;

  if (!actorEmail || !actorUserId) {
    throw new Error("UNAUTHORIZED: Must be logged in to promote a note.");
  }

  const access = await resolveStudioProjectAccess({
    projectSlug,
    email: actorEmail,
    action: "write",
  });

  if (!access.allowed) {
    throw new Error("UNAUTHORIZED: You do not have write access to this Nest.");
  }

  const prisma = getPrismaClient();
  const project = await prisma.studioProject.findFirst({
    where: { slug: projectSlug },
    select: { id: true, slug: true },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  const sourceDocument = await prisma.studioDocument.findFirst({
    where: {
      id: documentId,
      projectId: project.id,
      ...personalWritingDocumentVisibilityWhere(actorUserId),
    },
    include: {
      blocks: {
        orderBy: { order: "asc" },
      },
    },
  });

  if (!sourceDocument) {
    throw new Error("Document not found in this Nest.");
  }

  if (!String(sourceDocument.sourceLabel ?? "").toLowerCase().includes("document-kind:note")) {
    throw new Error("Only quick notes can be promoted into writing pages.");
  }

  const stableDocumentId = randomUUID();
  const sourceLabel = [
    "document-kind:draft",
    "draft-kind:promoted-note",
    `promoted-from-document:${sourceDocument.id}`,
    sourceDocument.sourceLabel ? `promoted-from-label:${sourceDocument.sourceLabel}` : null,
  ].filter(Boolean).join(";");

  const title = sourceDocument.title.toLowerCase().includes("note")
    ? sourceDocument.title.replace(/\bnote\b/gi, "Draft").trim()
    : `${sourceDocument.title} - Writing Draft`;

  const promoted = await prisma.studioDocument.create({
    data: {
      projectId: project.id,
      personalOwnerUserId: sourceDocument.personalOwnerUserId,
      stableId: stableDocumentId,
      title: title || `${sourceDocument.title} - Writing Draft`,
      sourceLabel,
      blocks: {
        create: sourceDocument.blocks.map((block, index) => ({
          stableId: `${stableDocumentId}-block-${index + 1}`,
          order: index,
          title: block.title,
          body: block.body,
          sourceLabel,
        })),
      },
    },
    select: { id: true },
  });

  revalidatePath(`/nests/${projectSlug}`);
  revalidatePath(`/create`);
  return {
    ok: true,
    documentId: promoted.id,
    href: `/create?project=${encodeURIComponent(project.slug)}&document=${encodeURIComponent(promoted.id)}`,
  };
}

export async function importHgoEpisodeSourceAction(projectSlug: string, sourceKey: HgoSourceKey) {
  const session = await auth();
  const actorEmail = session?.user?.primaryEmail || session?.user?.email;

  if (!actorEmail) {
    throw new Error("UNAUTHORIZED: Must be logged in to import a source document.");
  }

  const access = await resolveStudioProjectAccess({
    projectSlug,
    email: actorEmail,
    action: "write",
  });

  if (!access.allowed) {
    throw new Error("UNAUTHORIZED: You do not have write access to this Nest.");
  }

  if (projectSlug !== "high-ground-odyssey-manuscript") {
    throw new Error("HGO episode source import is only available inside the High Ground Odyssey Nest.");
  }

  const prisma = getPrismaClient();
  const project = await prisma.studioProject.findFirst({
    where: { slug: projectSlug },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  const source = resolveHgoSource(sourceKey);
  const sourceLabel = [
    "document-kind:fixed-source",
    "hgo-source-family:podcast-year-1",
    `hgo-source:${source.key}`,
    `source-path:${source.relativePath}`,
  ].join(";");

  const existing = await prisma.studioDocument.findFirst({
    where: {
      projectId: project.id,
      sourceLabel: { contains: `hgo-source:${source.key}` },
    },
    select: { id: true },
  });

  if (existing) {
    redirect(`/create?project=${encodeURIComponent(project.slug)}&document=${encodeURIComponent(existing.id)}`);
  }

  if (!existsSync(/* turbopackIgnore: true */ source.sourcePath)) {
    throw new Error(`HGO source file is missing. Configure ${HGO_SOURCE_ROOT_ENV} or import source material through the normal upload path. Missing: ${source.sourcePath}`);
  }

  const rawText = await readFile(
    /* turbopackIgnore: true */ source.sourcePath,
    "utf-8",
  );
  const stableDocumentId = randomUUID();
  const provenanceBlock = [
    `${source.label}`,
    "",
    "Quipsly imported this as a fixed Study Source document.",
    `Source family: Podcast Year 1`,
    `Source path: ${source.sourcePath}`,
    `Relative path: ${source.relativePath}`,
    "Safety rule: tag, annotate, cite, and draft from this source; do not silently replace the living manuscript with it.",
  ].join("\n");
  const sourceBlocks = [
    source.label,
    provenanceBlock,
    ...chunkSourceText(rawText),
  ];

  const document = await prisma.studioDocument.create({
    data: {
      projectId: project.id,
      stableId: stableDocumentId,
      title: source.label,
      sourceLabel,
      blocks: {
        create: sourceBlocks.map((body, index) => ({
          stableId: `${stableDocumentId}-block-${index + 1}`,
          order: index,
          title: index === 0 ? source.label : null,
          body,
          sourceLabel,
        })),
      },
    },
  });

  revalidatePath(`/nests/${projectSlug}`);
  revalidatePath(`/create`);
  redirect(`/create?project=${encodeURIComponent(project.slug)}&document=${encodeURIComponent(document.id)}`);
}

export async function createHgoEpisodeDraftShellAction(projectSlug: string, sourceKey: HgoSourceKey) {
  const session = await auth();
  const actorEmail = session?.user?.primaryEmail || session?.user?.email;

  if (!actorEmail) {
    throw new Error("UNAUTHORIZED: Must be logged in to create an episode draft.");
  }

  const access = await resolveStudioProjectAccess({
    projectSlug,
    email: actorEmail,
    action: "write",
  });

  if (!access.allowed) {
    throw new Error("UNAUTHORIZED: You do not have write access to this Nest.");
  }

  if (projectSlug !== "high-ground-odyssey-manuscript") {
    throw new Error("HGO episode draft shells are only available inside the High Ground Odyssey Nest.");
  }

  const prisma = getPrismaClient();
  const project = await prisma.studioProject.findFirst({
    where: { slug: projectSlug },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  const source = resolveHgoSource(sourceKey);
  const episodeNumber = source.key.replace("episode-", "");
  const sourceLabel = [
    "document-kind:draft",
    "hgo-draft-kind:episode-page",
    `hgo-source:${source.key}`,
    "source-family:podcast-year-1",
  ].join(";");

  const existing = await prisma.studioDocument.findFirst({
    where: {
      projectId: project.id,
      sourceLabel: { contains: `hgo-draft-kind:episode-page;hgo-source:${source.key}` },
    },
    select: { id: true },
  });

  if (existing) {
    redirect(`/create?project=${encodeURIComponent(project.slug)}&document=${encodeURIComponent(existing.id)}`);
  }

  const stableDocumentId = randomUUID();
  const title = `Episode ${episodeNumber} Draft / Episode Page`;
  const blocks = [
    title,
    [
      `Source-linked draft shell for ${source.label}.`,
      `Source family: Podcast Year 1`,
      `Source path: ${source.sourcePath}`,
      "",
      "Use this document for episode-page copy, article drafts, manuscript connective tissue, social descriptions, and human/AI co-writing.",
      "Drafting is allowed here. Promotion into the living manuscript or public publishing remains a separate reviewed action.",
    ].join("\n"),
    "Working thesis / hook\n\nWhat is the useful promise of this episode for a reader, listener, or viewer?",
    "Episode page draft\n\nStart with a human-useful summary, then add sections, quotes, links, and source-backed notes.",
    "Book/manuscript candidate notes\n\nIf this episode reveals a stronger chapter idea, capture it here before promoting anything.",
    "Platform copy seeds\n\nYouTube description:\n\nPodcast/RSS summary:\n\nPatreon/support note:\n\nShorts/social hooks:",
  ];

  const document = await prisma.studioDocument.create({
    data: {
      projectId: project.id,
      stableId: stableDocumentId,
      title,
      sourceLabel,
      blocks: {
        create: blocks.map((body, index) => ({
          stableId: `${stableDocumentId}-block-${index + 1}`,
          order: index,
          title: index === 0 ? title : null,
          body,
          sourceLabel,
        })),
      },
    },
  });

  revalidatePath(`/nests/${projectSlug}`);
  revalidatePath(`/create`);
  redirect(`/create?project=${encodeURIComponent(project.slug)}&document=${encodeURIComponent(document.id)}`);
}
