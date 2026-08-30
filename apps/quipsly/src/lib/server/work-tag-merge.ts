import { createHash, randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import { listProjectsVisibleToEmail } from "./home-nest";
import {
  canReadPersonalWritingDocument,
  resolvePersonalWritingActorUserId,
} from "./personal-writing-documents";

const RELATION_LIMIT = 5_000;

type MergeCountKey =
  | "documents"
  | "tasks"
  | "goals"
  | "sessions"
  | "coachingNotes"
  | "annotations"
  | "taggedSpans"
  | "knowledgeNodes"
  | "mediaClips";

export type WorkTagMergePreview = {
  projectId: string;
  source: { id: string; label: string; slug: string; updatedAt: Date };
  target: { id: string; label: string; slug: string; updatedAt: Date };
  counts: Record<MergeCountKey, number> & { aliases: number; totalUses: number };
  deduplicated: Pick<Record<MergeCountKey, number>, "documents" | "tasks" | "goals" | "sessions" | "coachingNotes" | "annotations" | "mediaClips">;
  blockingConflicts: {
    anchoredSpanCollisions: number;
    aliasCollisions: Array<{ label: string; slug: string; conflictingLabel: string }>;
    relationLimitExceeded: boolean;
    personalDocumentOwnershipConflict: boolean;
  };
  impactHash: string;
  canMerge: boolean;
  boundaries: {
    sourcePreservedAsRedirect: true;
    exactRollbackSnapshot: true;
    immutableSourceTextMutated: false;
    externalSideEffects: false;
  };
};

export type PreviewWorkTagMergeResult =
  | { ok: true; preview: WorkTagMergePreview }
  | { ok: false; code: "INVALID_INPUT" | "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "MERGED"; error: string };

export type ApplyWorkTagMergeResult =
  | {
      ok: true;
      projectId: string;
      sourceTag: { id: string; label: string; slug: string; isActive: boolean; mergedIntoTagId: string; mergedAt: Date; updatedAt: Date };
      targetTag: { id: string; label: string; slug: string; updatedAt: Date };
      receiptId: string;
      impactHash: string;
      counts: WorkTagMergePreview["counts"];
      deduplicated: WorkTagMergePreview["deduplicated"];
    }
  | { ok: false; code: "INVALID_INPUT" | "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "MERGED" | "BLOCKED"; error: string; preview?: WorkTagMergePreview };

function cleanId(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 200) : "";
}

function normalizedLabel(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("en-US");
}

async function writableProjectIds(prisma: PrismaClient, actorEmail: string) {
  const projects = await listProjectsVisibleToEmail(actorEmail, prisma);
  return new Set(projects
    .filter((project) => project.role === "OWNER" || project.role === "EDITOR")
    .map((project) => project.id));
}

function overlapCount<T>(source: T[], target: T[]) {
  const targetSet = new Set(target);
  return source.filter((value) => targetSet.has(value)).length;
}

async function buildMergePreview(prisma: any, input: {
  sourceTagId: string;
  targetTagId: string;
  actorUserId: string | null;
}): Promise<
  | { kind: "ready"; preview: WorkTagMergePreview; impact: any }
  | { kind: "not-found" }
  | { kind: "conflict" }
  | { kind: "merged" }
> {
  const tags = await prisma.studioTag.findMany({
    where: { id: { in: [input.sourceTagId, input.targetTagId] } },
    orderBy: { id: "asc" },
    select: {
      id: true, projectId: true, label: true, slug: true, category: true, nodeType: true,
      isActive: true, mergedIntoTagId: true, updatedAt: true,
      aliases: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, label: true, slug: true, provenanceJson: true, createdByUserId: true, createdAt: true } },
    },
  });
  const source = tags.find((tag: any) => tag.id === input.sourceTagId);
  const target = tags.find((tag: any) => tag.id === input.targetTagId);
  if (!source || !target) return { kind: "not-found" };
  if (source.projectId !== target.projectId || source.id === target.id || !source.isActive || !target.isActive) return { kind: "conflict" };
  if (source.mergedIntoTagId || target.mergedIntoTagId) return { kind: "merged" };

  const whereEither = { tagId: { in: [source.id, target.id] } };
  const [
    documentLinksRaw,
    taskLinks,
    goalLinks,
    sessionLinks,
    coachingNoteLinks,
    annotationLinks,
    taggedSpansRaw,
    knowledgeNodesRaw,
    mediaClips,
  ] = await Promise.all([
    prisma.studioDocumentTagLink.findMany({ where: whereEither, orderBy: [{ documentId: "asc" }, { tagId: "asc" }], take: RELATION_LIMIT + 1 }),
    prisma.actionItemTagLink.findMany({ where: whereEither, orderBy: [{ actionItemId: "asc" }, { tagId: "asc" }], take: RELATION_LIMIT + 1 }),
    prisma.goalTagLink.findMany({ where: whereEither, orderBy: [{ goalId: "asc" }, { tagId: "asc" }], take: RELATION_LIMIT + 1 }),
    prisma.callRoomTagLink.findMany({ where: whereEither, orderBy: [{ roomId: "asc" }, { tagId: "asc" }], take: RELATION_LIMIT + 1 }),
    prisma.coachingNoteTagLink.findMany({ where: whereEither, orderBy: [{ noteId: "asc" }, { tagId: "asc" }], take: RELATION_LIMIT + 1 }),
    prisma.studioSourceAnnotationTag.findMany({ where: whereEither, orderBy: [{ annotationId: "asc" }, { tagId: "asc" }], take: RELATION_LIMIT + 1 }),
    prisma.studioTaggedSpan.findMany({
      where: whereEither,
      orderBy: [{ blockId: "asc" }, { startOffset: "asc" }, { endOffset: "asc" }, { tagId: "asc" }],
      take: RELATION_LIMIT + 1,
      select: { id: true, tagId: true, blockId: true, startOffset: true, endOffset: true },
    }),
    prisma.studioKnowledgeNode.findMany({
      where: whereEither,
      orderBy: [{ taggedSpanId: "asc" }, { id: "asc" }],
      take: RELATION_LIMIT + 1,
      select: { id: true, tagId: true, taggedSpanId: true, tagLabel: true, tagCategory: true, nodeType: true },
    }),
    prisma.mediaClip.findMany({
      where: { tags: { some: { id: { in: [source.id, target.id] } } } },
      orderBy: { id: "asc" },
      take: RELATION_LIMIT + 1,
      select: { id: true, tags: { where: { id: { in: [source.id, target.id] } }, select: { id: true } } },
    }),
  ]);

  const affectedDocumentIds = [
    ...documentLinksRaw.map((row: any) => String(row.documentId)),
    ...taggedSpansRaw.map((row: any) => String(row.documentId)),
    ...knowledgeNodesRaw.map((row: any) => String(row.documentId)),
  ];
  const affectedDocumentOwners = affectedDocumentIds.length
    ? await prisma.studioDocument.findMany({
        where: { id: { in: [...new Set(affectedDocumentIds)] } },
        select: { id: true, personalOwnerUserId: true, isPrivate: true },
      })
    : [];
  const visibilityByDocumentId = new Map<string, { ownerUserId: string | null; isPrivate: boolean }>(
    affectedDocumentOwners.map((document: any) => [
      String(document.id),
      {
        ownerUserId: document.personalOwnerUserId ? String(document.personalOwnerUserId) : null,
        isPrivate: document.isPrivate !== false,
      },
    ]),
  );
  const actorCanSeeDocument = (documentId: unknown) => {
    const visibility = visibilityByDocumentId.get(String(documentId))
      ?? { ownerUserId: null, isPrivate: false };
    return canReadPersonalWritingDocument(
      visibility.ownerUserId,
      input.actorUserId,
      visibility.isPrivate,
    );
  };
  const personalDocumentOwnershipConflict = affectedDocumentOwners.some(
    (document: any) =>
      document.personalOwnerUserId
      && document.personalOwnerUserId !== input.actorUserId
      && document.isPrivate !== false,
  );
  const documentLinks = documentLinksRaw.filter((row: any) =>
    actorCanSeeDocument(row.documentId),
  );
  const taggedSpans = taggedSpansRaw.filter((row: any) =>
    actorCanSeeDocument(row.documentId),
  );
  const knowledgeNodes = knowledgeNodesRaw.filter((row: any) =>
    actorCanSeeDocument(row.documentId),
  );

  const relationLimitExceeded = [documentLinksRaw, taskLinks, goalLinks, sessionLinks, coachingNoteLinks, annotationLinks, taggedSpansRaw, knowledgeNodesRaw, mediaClips]
    .some((rows) => rows.length > RELATION_LIMIT);
  const sourceRows = (rows: any[]) => rows.filter((row) => row.tagId === source.id);
  const targetRows = (rows: any[]) => rows.filter((row) => row.tagId === target.id);
  const sourceMediaIds = mediaClips.filter((clip: any) => clip.tags.some((tag: any) => tag.id === source.id)).map((clip: any) => clip.id);
  const targetMediaIds = mediaClips.filter((clip: any) => clip.tags.some((tag: any) => tag.id === target.id)).map((clip: any) => clip.id);
  const spanKey = (span: any) => `${span.blockId}|${span.startOffset}|${span.endOffset}`;
  const sourceSpanKeys = sourceRows(taggedSpans).map(spanKey);
  const targetSpanKeys = new Set(targetRows(taggedSpans).map(spanKey));
  const anchoredSpanCollisions = sourceSpanKeys.filter((key) => targetSpanKeys.has(key)).length;

  const aliasCandidates = [
    { id: null, label: source.label, slug: source.slug },
    ...source.aliases.map((alias: any) => ({ id: alias.id, label: alias.label, slug: alias.slug })),
  ];
  const candidateSlugs = [...new Set(aliasCandidates.map((alias) => alias.slug))];
  const [canonicalOccupants, aliasOccupants] = candidateSlugs.length ? await Promise.all([
    prisma.studioTag.findMany({
      where: { projectId: source.projectId, slug: { in: candidateSlugs }, id: { notIn: [source.id, target.id] } },
      select: { slug: true, label: true },
    }),
    prisma.studioTagAlias.findMany({
      where: { projectId: source.projectId, slug: { in: candidateSlugs }, tagId: { notIn: [source.id, target.id] } },
      select: { slug: true, label: true },
    }),
  ]) : [[], []];
  const targetAliasBySlug = new Map<string, string>(target.aliases.map((alias: any) => [alias.slug, alias.label]));
  const aliasCollisions = aliasCandidates.flatMap((candidate) => {
    const canonicalOther = canonicalOccupants.find((item: any) => item.slug === candidate.slug);
    const aliasOther = aliasOccupants.find((item: any) => item.slug === candidate.slug);
    const targetLabel = candidate.slug === target.slug ? target.label : targetAliasBySlug.get(candidate.slug);
    const conflictingLabel = canonicalOther?.label || aliasOther?.label
      || (targetLabel && normalizedLabel(targetLabel) !== normalizedLabel(candidate.label) ? targetLabel : null);
    return conflictingLabel ? [{ label: candidate.label, slug: candidate.slug, conflictingLabel }] : [];
  });

  const sourceDocumentRows = sourceRows(documentLinks);
  const sourceTaskRows = sourceRows(taskLinks);
  const sourceGoalRows = sourceRows(goalLinks);
  const sourceSessionRows = sourceRows(sessionLinks);
  const sourceCoachingRows = sourceRows(coachingNoteLinks);
  const sourceAnnotationRows = sourceRows(annotationLinks);
  const sourceSpanRows = sourceRows(taggedSpans);
  const sourceNodeRows = sourceRows(knowledgeNodes);
  const counts = {
    documents: sourceDocumentRows.length,
    tasks: sourceTaskRows.length,
    goals: sourceGoalRows.length,
    sessions: sourceSessionRows.length,
    coachingNotes: sourceCoachingRows.length,
    annotations: sourceAnnotationRows.length,
    taggedSpans: sourceSpanRows.length,
    knowledgeNodes: sourceNodeRows.length,
    mediaClips: sourceMediaIds.length,
    aliases: aliasCandidates.length,
    totalUses: sourceDocumentRows.length + sourceTaskRows.length + sourceGoalRows.length + sourceSessionRows.length + sourceCoachingRows.length
      + sourceAnnotationRows.length + sourceSpanRows.length + sourceNodeRows.length + sourceMediaIds.length,
  };
  const deduplicated = {
    documents: overlapCount(sourceDocumentRows.map((row: any) => row.documentId), targetRows(documentLinks).map((row: any) => row.documentId)),
    tasks: overlapCount(sourceTaskRows.map((row: any) => row.actionItemId), targetRows(taskLinks).map((row: any) => row.actionItemId)),
    goals: overlapCount(sourceGoalRows.map((row: any) => row.goalId), targetRows(goalLinks).map((row: any) => row.goalId)),
    sessions: overlapCount(sourceSessionRows.map((row: any) => row.roomId), targetRows(sessionLinks).map((row: any) => row.roomId)),
    coachingNotes: overlapCount(sourceCoachingRows.map((row: any) => row.noteId), targetRows(coachingNoteLinks).map((row: any) => row.noteId)),
    annotations: overlapCount(sourceAnnotationRows.map((row: any) => row.annotationId), targetRows(annotationLinks).map((row: any) => row.annotationId)),
    mediaClips: overlapCount(sourceMediaIds, targetMediaIds),
  };
  const impact = {
    source: { ...source, aliases: source.aliases },
    target: { ...target, aliases: target.aliases },
    documentLinks: sourceDocumentRows,
    taskLinks: sourceTaskRows,
    goalLinks: sourceGoalRows,
    sessionLinks: sourceSessionRows,
    coachingNoteLinks: sourceCoachingRows,
    annotationLinks: sourceAnnotationRows,
    taggedSpans: sourceSpanRows,
    knowledgeNodes: sourceNodeRows,
    mediaClipIds: sourceMediaIds,
    exactTargetAssociations: {
      documentLinks: targetRows(documentLinks),
      taskLinks: targetRows(taskLinks),
      goalLinks: targetRows(goalLinks),
      sessionLinks: targetRows(sessionLinks),
      coachingNoteLinks: targetRows(coachingNoteLinks),
      annotationLinks: targetRows(annotationLinks),
      taggedSpans: targetRows(taggedSpans),
      knowledgeNodes: targetRows(knowledgeNodes),
      mediaClipIds: targetMediaIds,
    },
  };
  const hashPayload = {
    source: { id: source.id, updatedAt: source.updatedAt.toISOString() },
    target: { id: target.id, updatedAt: target.updatedAt.toISOString() },
    rows: {
      documents: documentLinks.map((row: any) => `${row.documentId}:${row.tagId}`),
      tasks: taskLinks.map((row: any) => `${row.actionItemId}:${row.tagId}`),
      goals: goalLinks.map((row: any) => `${row.goalId}:${row.tagId}`),
      sessions: sessionLinks.map((row: any) => `${row.roomId}:${row.tagId}`),
      coachingNotes: coachingNoteLinks.map((row: any) => `${row.noteId}:${row.tagId}`),
      annotations: annotationLinks.map((row: any) => `${row.annotationId}:${row.tagId}`),
      spans: taggedSpans.map((row: any) => `${row.id}:${row.tagId}:${spanKey(row)}`),
      nodes: knowledgeNodes.map((row: any) => `${row.id}:${row.tagId}:${row.taggedSpanId}`),
      media: mediaClips.map((clip: any) => `${clip.id}:${clip.tags.map((tag: any) => tag.id).sort().join(",")}`),
      aliases: aliasCandidates.map((alias) => `${alias.slug}:${alias.label}`),
    },
  };
  const impactHash = createHash("sha256").update(JSON.stringify(hashPayload)).digest("hex");
  const preview: WorkTagMergePreview = {
    projectId: source.projectId,
    source: { id: source.id, label: source.label, slug: source.slug, updatedAt: source.updatedAt },
    target: { id: target.id, label: target.label, slug: target.slug, updatedAt: target.updatedAt },
    counts,
    deduplicated,
    blockingConflicts: {
      anchoredSpanCollisions,
      aliasCollisions,
      relationLimitExceeded,
      personalDocumentOwnershipConflict,
    },
    impactHash,
    canMerge:
      anchoredSpanCollisions === 0
      && aliasCollisions.length === 0
      && !relationLimitExceeded
      && !personalDocumentOwnershipConflict,
    boundaries: {
      sourcePreservedAsRedirect: true,
      exactRollbackSnapshot: true,
      immutableSourceTextMutated: false,
      externalSideEffects: false,
    },
  };
  return { kind: "ready", preview, impact };
}

export async function previewWorkTagMerge(input: {
  prisma: PrismaClient;
  actorEmail: string;
  sourceTagId: string;
  targetTagId: string;
}): Promise<PreviewWorkTagMergeResult> {
  const actorEmail = typeof input.actorEmail === "string" ? input.actorEmail.trim().toLowerCase() : "";
  const sourceTagId = cleanId(input.sourceTagId);
  const targetTagId = cleanId(input.targetTagId);
  if (!actorEmail || !sourceTagId || !targetTagId || sourceTagId === targetTagId) {
    return { ok: false, code: "INVALID_INPUT", error: "Choose two different tags from the same Nest." };
  }
  const actorUserId = await resolvePersonalWritingActorUserId(
    input.prisma,
    actorEmail,
  );
  const built = await buildMergePreview(input.prisma as any, {
    sourceTagId,
    targetTagId,
    actorUserId,
  });
  if (built.kind === "not-found") return { ok: false, code: "NOT_FOUND", error: "One of those tags no longer exists." };
  if (built.kind === "conflict") return { ok: false, code: "CONFLICT", error: "Both tags must be active and belong to the same Nest." };
  if (built.kind === "merged") return { ok: false, code: "MERGED", error: "A tag that is already a merge redirect cannot be merged again." };
  const writableProjects = await writableProjectIds(input.prisma, actorEmail);
  if (!writableProjects.has(built.preview.projectId)) return { ok: false, code: "FORBIDDEN", error: "Editor access to this Nest is required to preview a merge." };
  return { ok: true, preview: built.preview };
}

function rowsNotAlreadyLinked(rows: any[], targetIds: Set<string>, idField: string) {
  return rows.filter((row) => !targetIds.has(row[idField]));
}

export async function applyWorkTagMerge(input: {
  prisma: PrismaClient;
  actorUserId: string;
  actorEmail: string;
  sourceTagId: string;
  targetTagId: string;
  expectedImpactHash: string;
  expectedSourceUpdatedAt: Date;
  expectedTargetUpdatedAt: Date;
}): Promise<ApplyWorkTagMergeResult> {
  const actorUserId = cleanId(input.actorUserId);
  const actorEmail = typeof input.actorEmail === "string" ? input.actorEmail.trim().toLowerCase() : "";
  const sourceTagId = cleanId(input.sourceTagId);
  const targetTagId = cleanId(input.targetTagId);
  const expectedImpactHash = typeof input.expectedImpactHash === "string" ? input.expectedImpactHash.trim().toLowerCase() : "";
  if (!actorUserId || !actorEmail || !sourceTagId || !targetTagId || sourceTagId === targetTagId
    || !/^[a-f0-9]{64}$/.test(expectedImpactHash)
    || !Number.isFinite(input.expectedSourceUpdatedAt?.getTime()) || !Number.isFinite(input.expectedTargetUpdatedAt?.getTime())) {
    return { ok: false, code: "INVALID_INPUT", error: "Preview this merge again before applying it." };
  }

  const initial = await buildMergePreview(input.prisma as any, {
    sourceTagId,
    targetTagId,
    actorUserId,
  });
  if (initial.kind === "not-found") return { ok: false, code: "NOT_FOUND", error: "One of those tags no longer exists." };
  if (initial.kind === "conflict") return { ok: false, code: "CONFLICT", error: "Both tags must still be active in the same Nest." };
  if (initial.kind === "merged") return { ok: false, code: "MERGED", error: "A tag that is already a merge redirect cannot be merged again." };
  const writableProjects = await writableProjectIds(input.prisma, actorEmail);
  if (!writableProjects.has(initial.preview.projectId)) return { ok: false, code: "FORBIDDEN", error: "Editor access to this Nest is required to apply a merge." };
  if (!initial.preview.canMerge) return { ok: false, code: "BLOCKED", error: "This merge has evidence conflicts that require human resolution.", preview: initial.preview };
  if (initial.preview.impactHash !== expectedImpactHash
    || initial.preview.source.updatedAt.getTime() !== input.expectedSourceUpdatedAt.getTime()
    || initial.preview.target.updatedAt.getTime() !== input.expectedTargetUpdatedAt.getTime()) {
    return { ok: false, code: "CONFLICT", error: "The tags or their uses changed after preview. Preview the merge again.", preview: initial.preview };
  }

  const receiptId = randomUUID();
  const now = new Date();
  const prisma = input.prisma as any;
  const result = await prisma.$transaction(async (tx: any) => {
    const grant = await tx.studioProjectAccessGrant.findFirst({
      where: { projectId: initial.preview.projectId, email: actorEmail, status: "ACTIVE", role: { in: ["OWNER", "EDITOR"] } },
      select: { id: true },
    });
    if (!grant) return { kind: "forbidden" as const };
    const fresh = await buildMergePreview(tx, {
      sourceTagId,
      targetTagId,
      actorUserId,
    });
    if (fresh.kind !== "ready") return { kind: "conflict" as const };
    if (!fresh.preview.canMerge) return { kind: "blocked" as const, preview: fresh.preview };
    if (fresh.preview.impactHash !== expectedImpactHash
      || fresh.preview.source.updatedAt.getTime() !== input.expectedSourceUpdatedAt.getTime()
      || fresh.preview.target.updatedAt.getTime() !== input.expectedTargetUpdatedAt.getTime()) {
      return { kind: "conflict" as const, preview: fresh.preview };
    }

    const source = fresh.impact.source;
    const target = fresh.impact.target;
    const sourceUpdate = await tx.studioTag.updateMany({
      where: { id: source.id, projectId: source.projectId, isActive: true, mergedIntoTagId: null, updatedAt: input.expectedSourceUpdatedAt },
      data: { isActive: false, archivedAt: now, mergedIntoTagId: target.id, mergedAt: now, updatedAt: now },
    });
    const targetUpdate = await tx.studioTag.updateMany({
      where: { id: target.id, projectId: source.projectId, isActive: true, mergedIntoTagId: null, updatedAt: input.expectedTargetUpdatedAt },
      data: { updatedAt: now },
    });
    if (sourceUpdate.count !== 1 || targetUpdate.count !== 1) return { kind: "conflict" as const };

    const moveExplicitLinks = async (model: any, rows: any[], idField: string) => {
      const targetRows = await model.findMany({ where: { tagId: target.id, [idField]: { in: rows.map((row) => row[idField]) } }, select: { [idField]: true } });
      const targetIds = new Set<string>(targetRows.map((row: any) => String(row[idField])));
      const createRows = rowsNotAlreadyLinked(rows, targetIds, idField).map((row) => ({ ...row, tagId: target.id }));
      if (createRows.length) await model.createMany({ data: createRows, skipDuplicates: true });
      await model.deleteMany({ where: { tagId: source.id, [idField]: { in: rows.map((row) => row[idField]) } } });
    };
    await moveExplicitLinks(tx.studioDocumentTagLink, fresh.impact.documentLinks, "documentId");
    const affectedDocumentIds = [...new Set<string>(
      fresh.impact.documentLinks.map((row: any) => String(row.documentId)),
    )];
    if (affectedDocumentIds.length) {
      await tx.studioDocument.updateMany({
        where: { id: { in: affectedDocumentIds }, projectId: source.projectId },
        data: { tagRevision: { increment: 1 } },
      });
    }
    await moveExplicitLinks(tx.actionItemTagLink, fresh.impact.taskLinks, "actionItemId");
    await moveExplicitLinks(tx.goalTagLink, fresh.impact.goalLinks, "goalId");
    await moveExplicitLinks(tx.callRoomTagLink, fresh.impact.sessionLinks, "roomId");
    await moveExplicitLinks(tx.coachingNoteTagLink, fresh.impact.coachingNoteLinks, "noteId");
    await moveExplicitLinks(tx.studioSourceAnnotationTag, fresh.impact.annotationLinks, "annotationId");

    if (fresh.impact.knowledgeNodes.length) {
      await tx.studioKnowledgeNode.updateMany({
        where: { id: { in: fresh.impact.knowledgeNodes.map((node: any) => node.id) }, tagId: source.id },
        data: { tagId: target.id, tagLabel: target.label, tagCategory: target.category, nodeType: target.nodeType },
      });
    }
    if (fresh.impact.taggedSpans.length) {
      await tx.studioTaggedSpan.updateMany({
        where: { id: { in: fresh.impact.taggedSpans.map((span: any) => span.id) }, tagId: source.id },
        data: { tagId: target.id },
      });
    }
    for (const mediaClipId of fresh.impact.mediaClipIds) {
      await tx.mediaClip.update({
        where: { id: mediaClipId },
        data: { tags: { connect: { id: target.id }, disconnect: { id: source.id } } },
      });
    }

    const targetAliasBySlug = new Map<string, string>(target.aliases.map((alias: any) => [alias.slug, alias.label]));
    for (const alias of source.aliases) {
      const redundant = (alias.slug === target.slug && normalizedLabel(alias.label) === normalizedLabel(target.label))
        || (targetAliasBySlug.has(alias.slug) && normalizedLabel(targetAliasBySlug.get(alias.slug)!) === normalizedLabel(alias.label));
      if (redundant) await tx.studioTagAlias.delete({ where: { id: alias.id } });
      else await tx.studioTagAlias.update({ where: { id: alias.id }, data: { tagId: target.id, provenanceJson: { source: "quipsly-tag-merge-v1", receiptId, priorProvenance: alias.provenanceJson } } });
    }
    const sourceNameIsRedundant = (source.slug === target.slug && normalizedLabel(source.label) === normalizedLabel(target.label))
      || (targetAliasBySlug.has(source.slug) && normalizedLabel(targetAliasBySlug.get(source.slug)!) === normalizedLabel(source.label));
    if (!sourceNameIsRedundant) {
      await tx.studioTagAlias.create({
        data: {
          projectId: source.projectId,
          tagId: target.id,
          slug: source.slug,
          label: source.label,
          createdByUserId: actorUserId,
          provenanceJson: { source: "quipsly-tag-merge-v1", receiptId, sourceTagId: source.id },
        },
      });
    }

    const [sourceRevision, targetRevision] = await Promise.all([
      tx.studioTagRevision.aggregate({ where: { tagId: source.id }, _max: { revision: true } }),
      tx.studioTagRevision.aggregate({ where: { tagId: target.id }, _max: { revision: true } }),
    ]);
    const receiptSnapshot = {
      kind: "quipsly-tag-merge-v2",
      receiptId,
      projectId: source.projectId,
      sourceTag: { id: source.id, label: source.label, slug: source.slug, updatedAt: source.updatedAt.toISOString() },
      targetTag: { id: target.id, label: target.label, slug: target.slug, updatedAt: target.updatedAt.toISOString() },
      exactMovedAssociations: fresh.impact,
      exactPreMergeTargetAssociations: fresh.impact.exactTargetAssociations,
      expectedPostMerge: {
        sourceUpdatedAt: now.toISOString(),
        targetUpdatedAt: now.toISOString(),
        sourceMergedAt: now.toISOString(),
      },
      counts: fresh.preview.counts,
      deduplicated: fresh.preview.deduplicated,
      boundaries: fresh.preview.boundaries,
    };
    const targetReceiptSnapshot = {
      kind: receiptSnapshot.kind,
      receiptId,
      projectId: source.projectId,
      sourceTag: receiptSnapshot.sourceTag,
      targetTag: receiptSnapshot.targetTag,
      counts: fresh.preview.counts,
      deduplicated: fresh.preview.deduplicated,
      boundaries: fresh.preview.boundaries,
    };
    await tx.studioTagMergeReceipt.create({
      data: { id: receiptId, projectId: source.projectId, sourceTagId: source.id, targetTagId: target.id, actorUserId, impactHash: expectedImpactHash, snapshotJson: receiptSnapshot },
    });
    await tx.studioTagRevision.createMany({
      data: [
        { tagId: source.id, revision: (sourceRevision._max.revision ?? 0) + 1, operation: "merge", actorUserId, snapshotJson: receiptSnapshot },
        { tagId: target.id, revision: (targetRevision._max.revision ?? 0) + 1, operation: "merge-received", actorUserId, snapshotJson: targetReceiptSnapshot },
      ],
    });
    const [savedSource, savedTarget] = await Promise.all([
      tx.studioTag.findUnique({ where: { id: source.id }, select: { id: true, label: true, slug: true, isActive: true, mergedIntoTagId: true, mergedAt: true, updatedAt: true } }),
      tx.studioTag.findUnique({ where: { id: target.id }, select: { id: true, label: true, slug: true, updatedAt: true } }),
    ]);
    return { kind: "saved" as const, sourceTag: savedSource, targetTag: savedTarget, preview: fresh.preview };
  }, { isolationLevel: "Serializable", timeout: 30_000 });

  if (result.kind === "forbidden") return { ok: false, code: "FORBIDDEN", error: "Editor access to this Nest is required to apply a merge." };
  if (result.kind === "blocked") return { ok: false, code: "BLOCKED", error: "This merge has evidence conflicts that require human resolution.", preview: result.preview };
  if (result.kind === "conflict") return { ok: false, code: "CONFLICT", error: "The tags or their uses changed after preview. Preview the merge again.", preview: result.preview };
  return {
    ok: true,
    projectId: initial.preview.projectId,
    sourceTag: result.sourceTag,
    targetTag: result.targetTag,
    receiptId,
    impactHash: expectedImpactHash,
    counts: result.preview.counts,
    deduplicated: result.preview.deduplicated,
  };
}
