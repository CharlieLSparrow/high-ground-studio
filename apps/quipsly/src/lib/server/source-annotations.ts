import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

export const SOURCE_ANNOTATION_KINDS = [
  "highlight",
  "note",
  "question",
  "quote",
  "claim",
  "idea",
  "correction",
  "action",
] as const;

export const SOURCE_ANNOTATION_VISIBILITIES = ["private", "project"] as const;
export const SOURCE_ANNOTATION_STATUSES = ["active", "resolved", "archived"] as const;

export type SourceAnnotationKind = (typeof SOURCE_ANNOTATION_KINDS)[number];
export type SourceAnnotationVisibility = (typeof SOURCE_ANNOTATION_VISIBILITIES)[number];
export type SourceAnnotationStatus = (typeof SOURCE_ANNOTATION_STATUSES)[number];

export type CreateSourceAnnotationInput = {
  projectId: string;
  sourceUnitId: string;
  actorUserId: string;
  actorEmail: string;
  clientRequestId: string;
  kind: string;
  visibility: string;
  body: string;
  startOffset: number;
  endOffset: number;
  exactText: string;
  tagIds?: string[];
  surface: "nest-research" | "ios-capture";
};

export type SourceAnnotationWriteResult =
  | { ok: true; id: string; updatedAt: string; reused: boolean }
  | { ok: false; code: "INVALID" | "NOT_FOUND" | "CONFLICT"; message: string };

export type SourceAnnotationDraftResult =
  | { ok: true; documentId: string; documentStableId: string; blockId: string; blockStableId: string; href: string; reused: boolean }
  | { ok: false; code: "INVALID" | "NOT_FOUND" | "CONFLICT"; message: string };

function isMember<T extends string>(values: readonly T[], value: string): value is T {
  return values.includes(value as T);
}

function cleanText(value: string, max: number) {
  return value.trim().slice(0, max);
}

function fingerprint(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function buildVerifiedTextSelector(input: {
  immutableText: string;
  startOffset: number;
  endOffset: number;
  exactText: string;
  contextLength?: number;
}) {
  const { immutableText } = input;
  const startOffset = Math.trunc(input.startOffset);
  const endOffset = Math.trunc(input.endOffset);
  if (!Number.isFinite(startOffset) || !Number.isFinite(endOffset) || startOffset < 0 || endOffset <= startOffset) {
    return { ok: false as const, message: "Select a non-empty passage from the preserved source." };
  }
  if (endOffset > immutableText.length) {
    return { ok: false as const, message: "The selected passage extends beyond the preserved source." };
  }
  const exactText = immutableText.slice(startOffset, endOffset);
  if (!input.exactText || exactText !== input.exactText) {
    return { ok: false as const, message: "The source changed or the selection no longer matches. Reopen the source and select it again." };
  }
  const contextLength = input.contextLength ?? 64;
  return {
    ok: true as const,
    selector: {
      selectorKind: "text-quote" as const,
      startOffset,
      endOffset,
      exactText,
      prefixText: immutableText.slice(Math.max(0, startOffset - contextLength), startOffset),
      suffixText: immutableText.slice(endOffset, Math.min(immutableText.length, endOffset + contextLength)),
      sourceFingerprint: fingerprint(immutableText),
    },
  };
}

function snapshot(input: {
  kind: string;
  status: string;
  visibility: string;
  body: string;
  selectorKind: string;
  startOffset: number | null;
  endOffset: number | null;
  exactText: string | null;
  prefixText: string | null;
  suffixText: string | null;
  sourceFingerprint: string | null;
  tagIds: string[];
}) {
  return input satisfies Prisma.InputJsonObject;
}

export async function createSourceAnnotation(
  prisma: PrismaClient,
  input: CreateSourceAnnotationInput,
): Promise<SourceAnnotationWriteResult> {
  const kind = cleanText(input.kind, 40).toLowerCase();
  const visibility = cleanText(input.visibility, 20).toLowerCase();
  const body = cleanText(input.body, 20_000);
  const clientRequestId = cleanText(input.clientRequestId, 120);
  const actorEmail = cleanText(input.actorEmail.toLowerCase(), 320);
  const tagIds = [...new Set((input.tagIds ?? []).map((value) => cleanText(value, 120)).filter(Boolean))].slice(0, 20);

  if (!isMember(SOURCE_ANNOTATION_KINDS, kind)) {
    return { ok: false, code: "INVALID", message: "Choose a supported annotation kind." };
  }
  if (!isMember(SOURCE_ANNOTATION_VISIBILITIES, visibility)) {
    return { ok: false, code: "INVALID", message: "Choose private or Nest-visible sharing." };
  }
  if (!body && tagIds.length === 0) {
    return { ok: false, code: "INVALID", message: "Add a note or at least one tag before saving." };
  }
  if (!clientRequestId) {
    return { ok: false, code: "INVALID", message: "This annotation is missing its save identity." };
  }

  return prisma.$transaction(async (tx) => {
    const [existing] = await tx.$queryRaw<Array<{ id: string; projectId: string; updatedAt: Date }>>(Prisma.sql`
      SELECT "id", "projectId", "updatedAt"
      FROM "StudioSourceAnnotation"
      WHERE "createdByUserId" = ${input.actorUserId} AND "clientRequestId" = ${clientRequestId}
      LIMIT 1
    `);
    if (existing) {
      if (existing.projectId !== input.projectId) {
        return { ok: false as const, code: "CONFLICT" as const, message: "That save identity already belongs to another Nest." };
      }
      return { ok: true as const, id: existing.id, updatedAt: existing.updatedAt.toISOString(), reused: true };
    }

    const source = await tx.studioSourceUnit.findFirst({
      where: { id: input.sourceUnitId, projectId: input.projectId },
      select: { id: true, documentId: true, immutableText: true },
    });
    if (!source?.immutableText) {
      return { ok: false as const, code: "NOT_FOUND" as const, message: "The preserved text source is unavailable in this Nest." };
    }

    const selectorResult = buildVerifiedTextSelector({
      immutableText: source.immutableText,
      startOffset: input.startOffset,
      endOffset: input.endOffset,
      exactText: input.exactText,
    });
    if (!selectorResult.ok) {
      return { ok: false as const, code: "CONFLICT" as const, message: selectorResult.message };
    }

    const tags = tagIds.length > 0
      ? await tx.studioTag.findMany({
          where: { id: { in: tagIds }, projectId: input.projectId, isActive: true },
          select: { id: true },
        })
      : [];
    if (tags.length !== tagIds.length) {
      return { ok: false as const, code: "INVALID" as const, message: "One or more tags do not belong to this Nest." };
    }

    const selector = selectorResult.selector;
    const annotationId = randomUUID();
    const revisionId = randomUUID();
    const now = new Date();
    const provenanceJson = JSON.stringify({
      kind: "quipsly-source-annotation-v1",
      surface: input.surface,
      humanAuthored: true,
      sourceMutated: false,
      createdAt: now.toISOString(),
    });
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "StudioSourceAnnotation" (
        "id", "projectId", "sourceUnitId", "documentId", "createdByUserId", "createdByEmailSnapshot",
        "kind", "status", "visibility", "body", "selectorKind", "startOffset", "endOffset",
        "exactText", "prefixText", "suffixText", "sourceFingerprint", "clientRequestId",
        "provenanceJson", "createdAt", "updatedAt"
      ) VALUES (
        ${annotationId}, ${input.projectId}, ${source.id}, ${source.documentId}, ${input.actorUserId}, ${actorEmail || null},
        ${kind}, 'active', ${visibility}, ${body}, ${selector.selectorKind}, ${selector.startOffset}, ${selector.endOffset},
        ${selector.exactText}, ${selector.prefixText}, ${selector.suffixText}, ${selector.sourceFingerprint}, ${clientRequestId},
        ${provenanceJson}::jsonb, ${now}, ${now}
      )
    `);
    for (const tag of tags) {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "StudioSourceAnnotationTag" ("annotationId", "tagId", "createdAt")
        VALUES (${annotationId}, ${tag.id}, ${now})
      `);
    }
    const snapshotJson = JSON.stringify(snapshot({
          kind,
          status: "active",
          visibility,
          body,
          selectorKind: selector.selectorKind,
          startOffset: selector.startOffset,
          endOffset: selector.endOffset,
          exactText: selector.exactText,
          prefixText: selector.prefixText,
          suffixText: selector.suffixText,
          sourceFingerprint: selector.sourceFingerprint,
          tagIds: tags.map((tag) => tag.id),
        }));
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "StudioSourceAnnotationRevision" (
        "id", "annotationId", "revision", "operation", "actorUserId", "snapshotJson", "createdAt"
      ) VALUES (${revisionId}, ${annotationId}, 1, 'created', ${input.actorUserId}, ${snapshotJson}::jsonb, ${now})
    `);

    return { ok: true as const, id: annotationId, updatedAt: now.toISOString(), reused: false };
  });
}

export async function setSourceAnnotationStatus(
  prisma: PrismaClient,
  input: {
    annotationId: string;
    actorUserId: string;
    expectedUpdatedAt: Date;
    nextStatus: string;
  },
): Promise<SourceAnnotationWriteResult> {
  const nextStatus = cleanText(input.nextStatus, 20).toLowerCase();
  if (!isMember(SOURCE_ANNOTATION_STATUSES, nextStatus)) {
    return { ok: false, code: "INVALID", message: "Choose active, resolved, or archived." };
  }

  return prisma.$transaction(async (tx) => {
    const [current] = await tx.$queryRaw<Array<{
      id: string; createdByUserId: string | null; updatedAt: Date; kind: string; status: string; visibility: string;
      body: string; selectorKind: string; startOffset: number | null; endOffset: number | null; exactText: string | null;
      prefixText: string | null; suffixText: string | null; sourceFingerprint: string | null; revision: number | null;
    }>>(Prisma.sql`
      SELECT annotation.*, MAX(revision."revision") AS "revision"
      FROM "StudioSourceAnnotation" annotation
      LEFT JOIN "StudioSourceAnnotationRevision" revision ON revision."annotationId" = annotation."id"
      WHERE annotation."id" = ${input.annotationId}
      GROUP BY annotation."id"
      LIMIT 1
    `);
    if (!current) return { ok: false as const, code: "NOT_FOUND" as const, message: "This annotation no longer exists." };
    if (current.createdByUserId !== input.actorUserId) {
      return { ok: false as const, code: "NOT_FOUND" as const, message: "Only the annotation author can change its review state." };
    }
    if (current.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
      return { ok: false as const, code: "CONFLICT" as const, message: "This annotation changed elsewhere. Refresh before deciding again." };
    }

    const archivedAt = nextStatus === "archived" ? new Date() : null;
    const now = new Date();
    const updated = await tx.$queryRaw<Array<{ id: string; updatedAt: Date }>>(Prisma.sql`
      UPDATE "StudioSourceAnnotation"
      SET "status" = ${nextStatus}, "archivedAt" = ${archivedAt}, "updatedAt" = ${now}
      WHERE "id" = ${current.id}
        AND "createdByUserId" = ${input.actorUserId}
        AND "updatedAt" = ${input.expectedUpdatedAt}
      RETURNING "id", "updatedAt"
    `);
    if (updated.length !== 1) {
      return { ok: false as const, code: "CONFLICT" as const, message: "This annotation changed elsewhere. Refresh before deciding again." };
    }
    const [saved] = updated;
    const operation = nextStatus === "resolved" ? "resolved" : nextStatus === "archived" ? "archived" : "reopened";
    const tagRows = await tx.$queryRaw<Array<{ tagId: string }>>(Prisma.sql`
      SELECT "tagId" FROM "StudioSourceAnnotationTag" WHERE "annotationId" = ${current.id}
    `);
    const snapshotJson = JSON.stringify(snapshot({
          kind: current.kind,
          status: nextStatus,
          visibility: current.visibility,
          body: current.body,
          selectorKind: current.selectorKind,
          startOffset: current.startOffset,
          endOffset: current.endOffset,
          exactText: current.exactText,
          prefixText: current.prefixText,
          suffixText: current.suffixText,
          sourceFingerprint: current.sourceFingerprint,
          tagIds: tagRows.map((tag) => tag.tagId),
        }));
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "StudioSourceAnnotationRevision" (
        "id", "annotationId", "revision", "operation", "actorUserId", "snapshotJson", "createdAt"
      ) VALUES (
        ${randomUUID()}, ${current.id}, ${(current.revision ?? 0) + 1}, ${operation}, ${input.actorUserId}, ${snapshotJson}::jsonb, ${now}
      )
    `);
    return { ok: true as const, id: saved.id, updatedAt: saved.updatedAt.toISOString(), reused: false };
  });
}

function citationLabel(source: { title: string; author: string | null; sourceUrl: string | null; sourcePath: string | null }) {
  return [source.title, source.author, source.sourceUrl || source.sourcePath].filter(Boolean).join(" — ").slice(0, 1_000);
}

export async function createWritingDraftFromSourceAnnotation(
  prisma: PrismaClient,
  input: {
    annotationId: string;
    projectId: string;
    projectSlug: string;
    actorUserId: string;
    actorEmail: string;
    clientRequestId: string;
    expectedUpdatedAt: Date;
  },
): Promise<SourceAnnotationDraftResult> {
  const clientRequestId = cleanText(input.clientRequestId, 120);
  if (!clientRequestId || !Number.isFinite(input.expectedUpdatedAt.getTime())) {
    return { ok: false, code: "INVALID", message: "The writing handoff is missing its save identity or annotation revision." };
  }

  return prisma.$transaction(async (tx) => {
    const [existing] = await tx.$queryRaw<Array<{ documentId: string; documentStableId: string; blockId: string; blockStableId: string }>>(Prisma.sql`
      SELECT document."id" AS "documentId", document."stableId" AS "documentStableId",
             block."id" AS "blockId", block."stableId" AS "blockStableId"
      FROM "StudioSourceAnnotationUse" annotation_use
      JOIN "StudioDocument" document ON document."id" = annotation_use."documentId"
      JOIN "StudioDocumentBlock" block ON block."id" = annotation_use."blockId"
      WHERE annotation_use."createdByUserId" = ${input.actorUserId}
        AND annotation_use."clientRequestId" = ${clientRequestId}
      LIMIT 1
    `);
    if (existing) {
      return {
        ok: true as const,
        ...existing,
        href: `/create?project=${encodeURIComponent(input.projectSlug)}&document=${encodeURIComponent(existing.documentId)}`,
        reused: true,
      };
    }

    const [annotation] = await tx.$queryRaw<Array<{
      id: string;
      body: string;
      exactText: string | null;
      kind: string;
      visibility: string;
      createdByUserId: string | null;
      updatedAt: Date;
      sourceUnitId: string;
      sourceTitle: string;
      author: string | null;
      sourceUrl: string | null;
      sourcePath: string | null;
      sourceFingerprint: string | null;
    }>>(Prisma.sql`
      SELECT annotation."id", annotation."body", annotation."exactText", annotation."kind", annotation."visibility",
             annotation."createdByUserId", annotation."updatedAt", annotation."sourceUnitId",
             source."title" AS "sourceTitle", source."author", source."sourceUrl", source."sourcePath",
             annotation."sourceFingerprint"
      FROM "StudioSourceAnnotation" annotation
      JOIN "StudioSourceUnit" source ON source."id" = annotation."sourceUnitId"
      WHERE annotation."id" = ${input.annotationId}
        AND annotation."projectId" = ${input.projectId}
        AND annotation."status" IN ('active', 'resolved')
        AND (annotation."visibility" = 'project' OR annotation."createdByUserId" = ${input.actorUserId})
      LIMIT 1
    `);
    if (!annotation?.exactText) {
      return { ok: false as const, code: "NOT_FOUND" as const, message: "That source-linked annotation is not available for writing." };
    }
    if (annotation.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
      return { ok: false as const, code: "CONFLICT" as const, message: "The annotation changed. Refresh Research before starting the draft." };
    }

    const documentStableId = `evidence-draft-${randomUUID()}`;
    const blockStableId = `evidence-opening-${randomUUID()}`;
    const citationKey = `qs-${annotation.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16)}`;
    const label = citationLabel({
      title: annotation.sourceTitle,
      author: annotation.author,
      sourceUrl: annotation.sourceUrl,
      sourcePath: annotation.sourcePath,
    });
    const workingNote = cleanText(annotation.body, 20_000);
    const body = [
      workingNote ? `Working note\n\n${workingNote}` : "Working note",
      `> ${annotation.exactText}`,
      `[^${citationKey}]: ${label}. Quipsly evidence ${annotation.id}.`,
    ].join("\n\n");

    const document = await tx.studioDocument.create({
      data: {
        projectId: input.projectId,
        stableId: documentStableId,
        title: `Draft — ${annotation.sourceTitle}`.slice(0, 180),
        sourceLabel: "Quipsly evidence draft",
        sourcePath: annotation.sourceUrl || annotation.sourcePath,
        projectionStatus: "draft",
        isPrivate: true,
      },
      select: { id: true },
    });
    const block = await tx.studioDocumentBlock.create({
      data: {
        documentId: document.id,
        stableId: blockStableId,
        order: 1,
        title: "Opening from source evidence",
        body,
        sourceLabel: label,
        sourcePath: annotation.sourceUrl || annotation.sourcePath,
        externalId: `annotation:${annotation.id}`,
        projectionStatus: "draft",
        isPrivate: true,
      },
      select: { id: true },
    });
    const now = new Date();
    const sourceJson = JSON.stringify({
      kind: "quipsly-source-annotation-use-v1",
      sourceUnitId: annotation.sourceUnitId,
      sourceFingerprint: annotation.sourceFingerprint,
      annotationRevision: annotation.updatedAt.toISOString(),
      sourceMutated: false,
      draftCreated: true,
    });
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "StudioSourceAnnotationUse" (
        "id", "annotationId", "projectId", "documentId", "blockId", "createdByUserId", "clientRequestId",
        "useKind", "citationKey", "quoteSnapshot", "citationLabel", "sourceJson", "createdAt"
      ) VALUES (
        ${randomUUID()}, ${annotation.id}, ${input.projectId}, ${document.id}, ${block.id}, ${input.actorUserId}, ${clientRequestId},
        'evidence', ${citationKey}, ${annotation.exactText}, ${label}, ${sourceJson}::jsonb, ${now}
      )
    `);
    await tx.studioDocumentOperation.create({
      data: {
        projectId: input.projectId,
        documentId: document.id,
        actorEmail: cleanText(input.actorEmail.toLowerCase(), 320) || null,
        origin: "human",
        operationType: "create-draft-from-source-annotation",
        status: "applied",
        afterJson: { documentStableId, blockStableId, body },
        payloadJson: {
          annotationId: annotation.id,
          sourceUnitId: annotation.sourceUnitId,
          citationKey,
          sourceMutated: false,
        },
        reversible: true,
      },
    });

    return {
      ok: true as const,
      documentId: document.id,
      documentStableId,
      blockId: block.id,
      blockStableId,
      href: `/create?project=${encodeURIComponent(input.projectSlug)}&document=${encodeURIComponent(document.id)}`,
      reused: false,
    };
  });
}
