import { createHash, randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import { listProjectsVisibleToEmail } from "./home-nest";

type RollbackCountKey =
  | "tasks"
  | "goals"
  | "sessions"
  | "coachingNotes"
  | "annotations"
  | "taggedSpans"
  | "knowledgeNodes"
  | "mediaClips"
  | "aliases";

export type WorkTagMergeRollbackPreview = {
  receiptId: string;
  projectId: string;
  source: { id: string; label: string; slug: string; updatedAt: Date };
  target: { id: string; label: string; slug: string; updatedAt: Date };
  counts: Record<RollbackCountKey, number> & { totalUses: number };
  targetRelationshipsPreserved: Omit<Record<RollbackCountKey, number>, "taggedSpans" | "knowledgeNodes" | "aliases">;
  targetRelationshipsRemoved: Omit<Record<RollbackCountKey, number>, "taggedSpans" | "knowledgeNodes" | "aliases">;
  blockingConflicts: string[];
  previewHash: string;
  canRollback: boolean;
  boundaries: {
    exactReceiptRequired: true;
    laterEditsFailClosed: true;
    immutableSourceTextMutated: false;
    externalSideEffects: false;
  };
};

export type PreviewWorkTagMergeRollbackResult =
  | { ok: true; preview: WorkTagMergeRollbackPreview }
  | { ok: false; code: "INVALID_INPUT" | "NOT_FOUND" | "FORBIDDEN" | "UNSUPPORTED"; error: string };

export type ApplyWorkTagMergeRollbackResult =
  | {
      ok: true;
      projectId: string;
      sourceTag: { id: string; label: string; slug: string; isActive: boolean; mergedIntoTagId: null; mergedAt: null; updatedAt: Date };
      targetTag: { id: string; label: string; slug: string; updatedAt: Date };
      mergeReceiptId: string;
      rollbackReceiptId: string;
      previewHash: string;
      counts: WorkTagMergeRollbackPreview["counts"];
    }
  | { ok: false; code: "INVALID_INPUT" | "NOT_FOUND" | "FORBIDDEN" | "UNSUPPORTED" | "CONFLICT" | "BLOCKED"; error: string; preview?: WorkTagMergeRollbackPreview };

type ExplicitRelation = {
  key: "tasks" | "goals" | "sessions" | "coachingNotes" | "annotations";
  sourceField: "taskLinks" | "goalLinks" | "sessionLinks" | "coachingNoteLinks" | "annotationLinks";
  idField: "actionItemId" | "goalId" | "roomId" | "noteId" | "annotationId";
  model: "actionItemTagLink" | "goalTagLink" | "callRoomTagLink" | "coachingNoteTagLink" | "studioSourceAnnotationTag";
};

const EXPLICIT_RELATIONS: ExplicitRelation[] = [
  { key: "tasks", sourceField: "taskLinks", idField: "actionItemId", model: "actionItemTagLink" },
  { key: "goals", sourceField: "goalLinks", idField: "goalId", model: "goalTagLink" },
  { key: "sessions", sourceField: "sessionLinks", idField: "roomId", model: "callRoomTagLink" },
  { key: "coachingNotes", sourceField: "coachingNoteLinks", idField: "noteId", model: "coachingNoteTagLink" },
  { key: "annotations", sourceField: "annotationLinks", idField: "annotationId", model: "studioSourceAnnotationTag" },
];

function cleanId(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 200) : "";
}

function safeRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function safeRows(value: unknown) {
  return Array.isArray(value) ? value.filter((row) => row && typeof row === "object").map((row) => safeRecord(row)) : [];
}

function safeString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function normalizedLabel(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("en-US");
}

function normalizedJson(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(normalizedJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${normalizedJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function rowWithoutTag(row: Record<string, any>) {
  const { tagId: _tagId, ...rest } = row;
  return rest;
}

function rowsMatchExceptTag(current: Record<string, any>, before: Record<string, any>) {
  return normalizedJson(rowWithoutTag(current)) === normalizedJson(rowWithoutTag(before));
}

async function writableProjectIds(prisma: PrismaClient, actorEmail: string) {
  const projects = await listProjectsVisibleToEmail(actorEmail, prisma);
  return new Set(projects
    .filter((project) => project.role === "OWNER" || project.role === "EDITOR")
    .map((project) => project.id));
}

function parseV2Snapshot(value: unknown) {
  const snapshot = safeRecord(value);
  if (snapshot.kind !== "quipsly-tag-merge-v2") return null;
  const sourceTag = safeRecord(snapshot.sourceTag);
  const targetTag = safeRecord(snapshot.targetTag);
  const moved = safeRecord(snapshot.exactMovedAssociations);
  const targetBefore = safeRecord(snapshot.exactPreMergeTargetAssociations);
  const postMerge = safeRecord(snapshot.expectedPostMerge);
  if (!safeString(snapshot.receiptId) || !safeString(snapshot.projectId)
    || !safeString(sourceTag.id) || !safeString(targetTag.id)
    || !safeString(postMerge.sourceUpdatedAt) || !safeString(postMerge.targetUpdatedAt)
    || !safeString(postMerge.sourceMergedAt)) return null;
  return { snapshot, sourceTag, targetTag, moved, targetBefore, postMerge };
}

function relationIds(rows: Record<string, any>[], idField: string) {
  return rows.map((row) => safeString(row[idField])).filter(Boolean);
}

async function buildRollbackPreview(prisma: any, sourceTagId: string): Promise<
  | { kind: "ready"; preview: WorkTagMergeRollbackPreview; context: any }
  | { kind: "not-found" }
  | { kind: "unsupported" }
> {
  const receipt = await prisma.studioTagMergeReceipt.findFirst({
    where: { sourceTagId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  if (!receipt) return { kind: "not-found" };
  const parsed = parseV2Snapshot(receipt.snapshotJson);
  if (!parsed) return { kind: "unsupported" };
  if (parsed.sourceTag.id !== receipt.sourceTagId || parsed.targetTag.id !== receipt.targetTagId
    || parsed.snapshot.receiptId !== receipt.id || parsed.snapshot.projectId !== receipt.projectId) {
    return { kind: "unsupported" };
  }

  const [source, target] = await Promise.all([
    prisma.studioTag.findUnique({
      where: { id: receipt.sourceTagId },
      select: {
        id: true, projectId: true, label: true, slug: true, category: true, nodeType: true,
        isActive: true, archivedAt: true, mergedIntoTagId: true, mergedAt: true, updatedAt: true,
        aliases: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      },
    }),
    prisma.studioTag.findUnique({
      where: { id: receipt.targetTagId },
      select: {
        id: true, projectId: true, label: true, slug: true, category: true, nodeType: true,
        isActive: true, archivedAt: true, mergedIntoTagId: true, mergedAt: true, updatedAt: true,
        aliases: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      },
    }),
  ]);
  const blockingConflicts: string[] = [];
  if (!source || !target || source.projectId !== receipt.projectId || target.projectId !== receipt.projectId) {
    blockingConflicts.push("One of the recorded tag identities no longer exists in this Nest.");
  }
  if (!source || !target) {
    const previewHash = createHash("sha256").update(`${receipt.id}:missing-tags`).digest("hex");
    return {
      kind: "ready",
      preview: {
        receiptId: receipt.id,
        projectId: receipt.projectId,
        source: { id: receipt.sourceTagId, label: safeString(parsed.sourceTag.label), slug: safeString(parsed.sourceTag.slug), updatedAt: new Date(0) },
        target: { id: receipt.targetTagId, label: safeString(parsed.targetTag.label), slug: safeString(parsed.targetTag.slug), updatedAt: new Date(0) },
        counts: { tasks: 0, goals: 0, sessions: 0, coachingNotes: 0, annotations: 0, taggedSpans: 0, knowledgeNodes: 0, mediaClips: 0, aliases: 0, totalUses: 0 },
        targetRelationshipsPreserved: { tasks: 0, goals: 0, sessions: 0, coachingNotes: 0, annotations: 0, mediaClips: 0 },
        targetRelationshipsRemoved: { tasks: 0, goals: 0, sessions: 0, coachingNotes: 0, annotations: 0, mediaClips: 0 },
        blockingConflicts,
        previewHash,
        canRollback: false,
        boundaries: { exactReceiptRequired: true, laterEditsFailClosed: true, immutableSourceTextMutated: false, externalSideEffects: false },
      },
      context: null,
    };
  }

  const expectedSourceUpdatedAt = new Date(parsed.postMerge.sourceUpdatedAt);
  const expectedTargetUpdatedAt = new Date(parsed.postMerge.targetUpdatedAt);
  const expectedMergedAt = new Date(parsed.postMerge.sourceMergedAt);
  if (source.isActive || source.mergedIntoTagId !== target.id || !source.mergedAt
    || source.mergedAt.getTime() !== expectedMergedAt.getTime()) {
    blockingConflicts.push("The source tag is no longer the redirect created by this merge.");
  }
  if (!target.isActive || target.mergedIntoTagId) {
    blockingConflicts.push("The canonical target is no longer an active standalone tag.");
  }
  if (source.updatedAt.getTime() !== expectedSourceUpdatedAt.getTime()
    || target.updatedAt.getTime() !== expectedTargetUpdatedAt.getTime()) {
    blockingConflicts.push("One of the tag records changed after this merge.");
  }
  if (source.label !== parsed.sourceTag.label || source.slug !== parsed.sourceTag.slug
    || target.label !== parsed.targetTag.label || target.slug !== parsed.targetTag.slug) {
    blockingConflicts.push("A recorded tag label or slug changed after this merge.");
  }

  const currentExplicit: Record<string, any[]> = {};
  const removeTargetIds: Record<string, string[]> = {};
  const preserveTargetIds: Record<string, string[]> = {};
  for (const relation of EXPLICIT_RELATIONS) {
    const sourceRows = safeRows(parsed.moved[relation.sourceField]);
    const targetRowsBefore = safeRows(parsed.targetBefore[relation.sourceField]);
    const ids = relationIds(sourceRows, relation.idField);
    const currentRows = ids.length
      ? await prisma[relation.model].findMany({
          where: { [relation.idField]: { in: ids }, tagId: { in: [source.id, target.id] } },
          orderBy: [{ [relation.idField]: "asc" }, { tagId: "asc" }],
        })
      : [];
    currentExplicit[relation.key] = currentRows;
    const currentSourceIds = new Set(currentRows.filter((row: any) => row.tagId === source.id).map((row: any) => safeString(row[relation.idField])));
    const currentTargetById = new Map(currentRows.filter((row: any) => row.tagId === target.id).map((row: any) => [safeString(row[relation.idField]), row]));
    const targetBeforeIds = new Set(relationIds(targetRowsBefore, relation.idField));
    removeTargetIds[relation.key] = ids.filter((id) => !targetBeforeIds.has(id));
    preserveTargetIds[relation.key] = ids.filter((id) => targetBeforeIds.has(id));
    for (const row of sourceRows) {
      const id = safeString(row[relation.idField]);
      if (currentSourceIds.has(id)) blockingConflicts.push(`${relation.key}: a source relationship was recreated after the merge.`);
      const currentTarget = currentTargetById.get(id);
      if (!currentTarget) blockingConflicts.push(`${relation.key}: a merged target relationship is missing.`);
      else if (!targetBeforeIds.has(id) && !rowsMatchExceptTag(currentTarget, row)) {
        blockingConflicts.push(`${relation.key}: a relationship created by the merge changed afterward.`);
      }
    }
  }

  const sourceSpans = safeRows(parsed.moved.taggedSpans);
  const currentSpans = sourceSpans.length
    ? await prisma.studioTaggedSpan.findMany({ where: { id: { in: sourceSpans.map((row) => safeString(row.id)).filter(Boolean) } }, orderBy: { id: "asc" } })
    : [];
  const currentSpanById = new Map<string, any>(currentSpans.map((row: any) => [row.id, row]));
  for (const before of sourceSpans) {
    const current = currentSpanById.get(safeString(before.id));
    if (!current || current.tagId !== target.id || current.blockId !== before.blockId
      || current.startOffset !== before.startOffset || current.endOffset !== before.endOffset) {
      blockingConflicts.push("An anchored writing span changed or disappeared after the merge.");
    }
  }

  const sourceNodes = safeRows(parsed.moved.knowledgeNodes);
  const currentNodes = sourceNodes.length
    ? await prisma.studioKnowledgeNode.findMany({ where: { id: { in: sourceNodes.map((row) => safeString(row.id)).filter(Boolean) } }, orderBy: { id: "asc" } })
    : [];
  const currentNodeById = new Map<string, any>(currentNodes.map((row: any) => [row.id, row]));
  for (const before of sourceNodes) {
    const current = currentNodeById.get(safeString(before.id));
    if (!current || current.tagId !== target.id || current.taggedSpanId !== before.taggedSpanId
      || current.tagLabel !== target.label || current.tagCategory !== target.category || current.nodeType !== target.nodeType) {
      blockingConflicts.push("A knowledge-node tag interpretation changed or disappeared after the merge.");
    }
  }

  const sourceMediaIds = Array.isArray(parsed.moved.mediaClipIds) ? parsed.moved.mediaClipIds.map(safeString).filter(Boolean) : [];
  const targetMediaBeforeIds = new Set<string>(Array.isArray(parsed.targetBefore.mediaClipIds)
    ? parsed.targetBefore.mediaClipIds.map(safeString).filter(Boolean)
    : []);
  const currentMedia = sourceMediaIds.length
    ? await prisma.mediaClip.findMany({
        where: { id: { in: sourceMediaIds } },
        orderBy: { id: "asc" },
        select: { id: true, tags: { where: { id: { in: [source.id, target.id] } }, orderBy: { id: "asc" }, select: { id: true } } },
      })
    : [];
  const currentMediaById = new Map<string, Set<string>>(currentMedia.map((clip: any) => [clip.id, new Set<string>(clip.tags.map((tag: any) => tag.id))]));
  for (const id of sourceMediaIds) {
    const tags = currentMediaById.get(id);
    if (!tags || !tags.has(target.id) || tags.has(source.id)) {
      blockingConflicts.push("A media-clip tag relationship changed or disappeared after the merge.");
    }
  }

  const sourceBefore = safeRecord(parsed.moved.source);
  const originalSourceAliases = safeRows(sourceBefore.aliases);
  const targetBefore = safeRecord(parsed.moved.target);
  const originalTargetAliases = safeRows(targetBefore.aliases);
  if (source.aliases.length) blockingConflicts.push("The source tag gained aliases after the merge.");
  const currentAliasesById = new Map<string, any>(target.aliases.map((alias: any) => [alias.id, alias]));
  for (const alias of originalSourceAliases) {
    const current = currentAliasesById.get(safeString(alias.id));
    if (current) {
      const provenance = safeRecord(current.provenanceJson);
      if (current.tagId !== target.id || provenance.source !== "quipsly-tag-merge-v1" || provenance.receiptId !== receipt.id) {
        blockingConflicts.push(`Alias “${safeString(alias.label)}” changed after the merge.`);
      }
    } else if (safeString(alias.slug) !== target.slug || normalizedLabel(safeString(alias.label)) !== normalizedLabel(target.label)) {
      blockingConflicts.push(`Alias “${safeString(alias.label)}” disappeared after the merge.`);
    }
  }
  const targetAliasBySlugBefore = new Map(originalTargetAliases.map((alias) => [safeString(alias.slug), safeString(alias.label)]));
  const sourceNameWasRedundant = (safeString(parsed.sourceTag.slug) === target.slug
      && normalizedLabel(safeString(parsed.sourceTag.label)) === normalizedLabel(target.label))
    || (targetAliasBySlugBefore.has(safeString(parsed.sourceTag.slug))
      && normalizedLabel(targetAliasBySlugBefore.get(safeString(parsed.sourceTag.slug)) || "") === normalizedLabel(safeString(parsed.sourceTag.label)));
  const sourceNameAlias = target.aliases.find((alias: any) => alias.slug === parsed.sourceTag.slug);
  if (!sourceNameWasRedundant) {
    const provenance = safeRecord(sourceNameAlias?.provenanceJson);
    if (!sourceNameAlias || provenance.source !== "quipsly-tag-merge-v1" || provenance.receiptId !== receipt.id
      || provenance.sourceTagId !== source.id) {
      blockingConflicts.push("The redirect alias created by this merge changed or disappeared.");
    }
  }

  const counts = {
    tasks: safeRows(parsed.moved.taskLinks).length,
    goals: safeRows(parsed.moved.goalLinks).length,
    sessions: safeRows(parsed.moved.sessionLinks).length,
    coachingNotes: safeRows(parsed.moved.coachingNoteLinks).length,
    annotations: safeRows(parsed.moved.annotationLinks).length,
    taggedSpans: sourceSpans.length,
    knowledgeNodes: sourceNodes.length,
    mediaClips: sourceMediaIds.length,
    aliases: originalSourceAliases.length + (sourceNameWasRedundant ? 0 : 1),
    totalUses: safeRows(parsed.moved.taskLinks).length + safeRows(parsed.moved.goalLinks).length
      + safeRows(parsed.moved.sessionLinks).length + safeRows(parsed.moved.coachingNoteLinks).length
      + safeRows(parsed.moved.annotationLinks).length + sourceSpans.length + sourceNodes.length + sourceMediaIds.length,
  };
  const targetRelationshipsPreserved = {
    tasks: preserveTargetIds.tasks.length,
    goals: preserveTargetIds.goals.length,
    sessions: preserveTargetIds.sessions.length,
    coachingNotes: preserveTargetIds.coachingNotes.length,
    annotations: preserveTargetIds.annotations.length,
    mediaClips: sourceMediaIds.filter((id) => targetMediaBeforeIds.has(id)).length,
  };
  const targetRelationshipsRemoved = {
    tasks: removeTargetIds.tasks.length,
    goals: removeTargetIds.goals.length,
    sessions: removeTargetIds.sessions.length,
    coachingNotes: removeTargetIds.coachingNotes.length,
    annotations: removeTargetIds.annotations.length,
    mediaClips: sourceMediaIds.filter((id) => !targetMediaBeforeIds.has(id)).length,
  };
  const currentState = {
    source,
    target,
    currentExplicit,
    currentSpans,
    currentNodes,
    currentMedia: currentMedia.map((clip: any) => ({ id: clip.id, tagIds: [...(currentMediaById.get(clip.id) || [])].sort() })),
  };
  const previewHash = createHash("sha256").update(normalizedJson({ receiptId: receipt.id, currentState })).digest("hex");
  const preview: WorkTagMergeRollbackPreview = {
    receiptId: receipt.id,
    projectId: receipt.projectId,
    source: { id: source.id, label: source.label, slug: source.slug, updatedAt: source.updatedAt },
    target: { id: target.id, label: target.label, slug: target.slug, updatedAt: target.updatedAt },
    counts,
    targetRelationshipsPreserved,
    targetRelationshipsRemoved,
    blockingConflicts: [...new Set(blockingConflicts)],
    previewHash,
    canRollback: blockingConflicts.length === 0,
    boundaries: { exactReceiptRequired: true, laterEditsFailClosed: true, immutableSourceTextMutated: false, externalSideEffects: false },
  };
  return {
    kind: "ready",
    preview,
    context: {
      receipt,
      parsed,
      source,
      target,
      removeTargetIds,
      preserveTargetIds,
      sourceSpans,
      sourceNodes,
      sourceMediaIds,
      targetMediaBeforeIds,
      originalSourceAliases,
      sourceNameWasRedundant,
      sourceNameAlias,
    },
  };
}

export async function previewWorkTagMergeRollback(input: {
  prisma: PrismaClient;
  actorEmail: string;
  sourceTagId: string;
}): Promise<PreviewWorkTagMergeRollbackResult> {
  const actorEmail = typeof input.actorEmail === "string" ? input.actorEmail.trim().toLowerCase() : "";
  const sourceTagId = cleanId(input.sourceTagId);
  if (!actorEmail || !sourceTagId) return { ok: false, code: "INVALID_INPUT", error: "Choose a merged tag to inspect its rollback receipt." };
  const built = await buildRollbackPreview(input.prisma as any, sourceTagId);
  if (built.kind === "not-found") return { ok: false, code: "NOT_FOUND", error: "No merge receipt exists for this tag." };
  if (built.kind === "unsupported") return { ok: false, code: "UNSUPPORTED", error: "This older merge receipt does not record both sides precisely enough for automatic rollback." };
  const writableProjects = await writableProjectIds(input.prisma, actorEmail);
  if (!writableProjects.has(built.preview.projectId)) return { ok: false, code: "FORBIDDEN", error: "Editor access to this Nest is required to inspect rollback." };
  return { ok: true, preview: built.preview };
}

export async function applyWorkTagMergeRollback(input: {
  prisma: PrismaClient;
  actorUserId: string;
  actorEmail: string;
  sourceTagId: string;
  expectedPreviewHash: string;
  expectedSourceUpdatedAt: Date;
  expectedTargetUpdatedAt: Date;
}): Promise<ApplyWorkTagMergeRollbackResult> {
  const actorUserId = cleanId(input.actorUserId);
  const actorEmail = typeof input.actorEmail === "string" ? input.actorEmail.trim().toLowerCase() : "";
  const sourceTagId = cleanId(input.sourceTagId);
  const expectedPreviewHash = typeof input.expectedPreviewHash === "string" ? input.expectedPreviewHash.trim().toLowerCase() : "";
  if (!actorUserId || !actorEmail || !sourceTagId || !/^[a-f0-9]{64}$/.test(expectedPreviewHash)
    || !Number.isFinite(input.expectedSourceUpdatedAt?.getTime()) || !Number.isFinite(input.expectedTargetUpdatedAt?.getTime())) {
    return { ok: false, code: "INVALID_INPUT", error: "Preview this rollback again before applying it." };
  }
  const initial = await buildRollbackPreview(input.prisma as any, sourceTagId);
  if (initial.kind === "not-found") return { ok: false, code: "NOT_FOUND", error: "No merge receipt exists for this tag." };
  if (initial.kind === "unsupported") return { ok: false, code: "UNSUPPORTED", error: "This older merge receipt does not record both sides precisely enough for automatic rollback." };
  const writableProjects = await writableProjectIds(input.prisma, actorEmail);
  if (!writableProjects.has(initial.preview.projectId)) return { ok: false, code: "FORBIDDEN", error: "Editor access to this Nest is required to roll back a merge." };
  if (!initial.preview.canRollback) return { ok: false, code: "BLOCKED", error: "Later changes make this rollback unsafe. Review the listed conflicts.", preview: initial.preview };
  if (initial.preview.previewHash !== expectedPreviewHash
    || initial.preview.source.updatedAt.getTime() !== input.expectedSourceUpdatedAt.getTime()
    || initial.preview.target.updatedAt.getTime() !== input.expectedTargetUpdatedAt.getTime()) {
    return { ok: false, code: "CONFLICT", error: "The merge state changed after preview. Preview rollback again.", preview: initial.preview };
  }

  const rollbackReceiptId = randomUUID();
  const now = new Date();
  const prisma = input.prisma as any;
  const result = await prisma.$transaction(async (tx: any) => {
    const grant = await tx.studioProjectAccessGrant.findFirst({
      where: { projectId: initial.preview.projectId, email: actorEmail, status: "ACTIVE", role: { in: ["OWNER", "EDITOR"] } },
      select: { id: true },
    });
    if (!grant) return { kind: "forbidden" as const };
    const fresh = await buildRollbackPreview(tx, sourceTagId);
    if (fresh.kind !== "ready" || !fresh.context) return { kind: "conflict" as const };
    if (!fresh.preview.canRollback) return { kind: "blocked" as const, preview: fresh.preview };
    if (fresh.preview.previewHash !== expectedPreviewHash
      || fresh.preview.source.updatedAt.getTime() !== input.expectedSourceUpdatedAt.getTime()
      || fresh.preview.target.updatedAt.getTime() !== input.expectedTargetUpdatedAt.getTime()) {
      return { kind: "conflict" as const, preview: fresh.preview };
    }
    const { parsed, source, target, removeTargetIds, sourceSpans, sourceNodes, sourceMediaIds, targetMediaBeforeIds,
      originalSourceAliases, sourceNameWasRedundant, sourceNameAlias } = fresh.context;

    if (!sourceNameWasRedundant && sourceNameAlias) {
      await tx.studioTagAlias.delete({ where: { id: sourceNameAlias.id } });
    }
    for (const alias of originalSourceAliases) {
      const aliasId = safeString(alias.id);
      const existing = aliasId ? await tx.studioTagAlias.findUnique({ where: { id: aliasId } }) : null;
      const data = {
        projectId: source.projectId,
        tagId: source.id,
        slug: safeString(alias.slug),
        label: safeString(alias.label),
        provenanceJson: alias.provenanceJson ?? {},
        createdByUserId: alias.createdByUserId || null,
        createdAt: new Date(alias.createdAt),
      };
      if (existing) await tx.studioTagAlias.update({ where: { id: aliasId }, data });
      else await tx.studioTagAlias.create({ data: { id: aliasId, ...data } });
    }

    for (const relation of EXPLICIT_RELATIONS) {
      const sourceRows = safeRows(parsed.moved[relation.sourceField]);
      if (sourceRows.length) {
        await tx[relation.model].createMany({ data: sourceRows, skipDuplicates: false });
      }
      const removeIds = removeTargetIds[relation.key] || [];
      if (removeIds.length) {
        await tx[relation.model].deleteMany({ where: { [relation.idField]: { in: removeIds }, tagId: target.id } });
      }
    }
    if (sourceSpans.length) {
      for (const span of sourceSpans) {
        await tx.studioTaggedSpan.update({
          where: { id: safeString(span.id) },
          data: { tagId: source.id },
        });
      }
    }
    if (sourceNodes.length) {
      for (const node of sourceNodes) {
        await tx.studioKnowledgeNode.update({
          where: { id: safeString(node.id) },
          data: {
            tagId: source.id,
            tagLabel: safeString(node.tagLabel),
            tagCategory: node.tagCategory,
            nodeType: node.nodeType,
          },
        });
      }
    }
    for (const mediaClipId of sourceMediaIds) {
      await tx.mediaClip.update({
        where: { id: mediaClipId },
        data: {
          tags: {
            connect: { id: source.id },
            ...(targetMediaBeforeIds.has(mediaClipId) ? {} : { disconnect: { id: target.id } }),
          },
        },
      });
    }

    const sourceUpdate = await tx.studioTag.updateMany({
      where: { id: source.id, projectId: source.projectId, isActive: false, mergedIntoTagId: target.id, updatedAt: input.expectedSourceUpdatedAt },
      data: { isActive: true, archivedAt: null, mergedIntoTagId: null, mergedAt: null, updatedAt: now },
    });
    const targetUpdate = await tx.studioTag.updateMany({
      where: { id: target.id, projectId: source.projectId, isActive: true, mergedIntoTagId: null, updatedAt: input.expectedTargetUpdatedAt },
      data: { updatedAt: now },
    });
    if (sourceUpdate.count !== 1 || targetUpdate.count !== 1) return { kind: "conflict" as const };

    const [sourceRevision, targetRevision] = await Promise.all([
      tx.studioTagRevision.aggregate({ where: { tagId: source.id }, _max: { revision: true } }),
      tx.studioTagRevision.aggregate({ where: { tagId: target.id }, _max: { revision: true } }),
    ]);
    const rollbackSnapshot = {
      kind: "quipsly-tag-merge-rollback-v1",
      rollbackReceiptId,
      mergeReceiptId: fresh.preview.receiptId,
      projectId: source.projectId,
      sourceTagId: source.id,
      targetTagId: target.id,
      previewHash: expectedPreviewHash,
      restoredAssociations: parsed.moved,
      targetRelationshipsPreserved: fresh.preview.targetRelationshipsPreserved,
      targetRelationshipsRemoved: fresh.preview.targetRelationshipsRemoved,
      counts: fresh.preview.counts,
      boundaries: fresh.preview.boundaries,
      rolledBackAt: now.toISOString(),
    };
    await tx.studioTagRevision.createMany({
      data: [
        { id: rollbackReceiptId, tagId: source.id, revision: (sourceRevision._max.revision ?? 0) + 1, operation: "merge-rollback", actorUserId, snapshotJson: rollbackSnapshot },
        { id: randomUUID(), tagId: target.id, revision: (targetRevision._max.revision ?? 0) + 1, operation: "merge-rollback-received", actorUserId, snapshotJson: rollbackSnapshot },
      ],
    });
    const [savedSource, savedTarget] = await Promise.all([
      tx.studioTag.findUnique({ where: { id: source.id }, select: { id: true, label: true, slug: true, isActive: true, mergedIntoTagId: true, mergedAt: true, updatedAt: true } }),
      tx.studioTag.findUnique({ where: { id: target.id }, select: { id: true, label: true, slug: true, updatedAt: true } }),
    ]);
    return { kind: "saved" as const, sourceTag: savedSource, targetTag: savedTarget, preview: fresh.preview };
  }, { isolationLevel: "Serializable", timeout: 30_000 });

  if (result.kind === "forbidden") return { ok: false, code: "FORBIDDEN", error: "Editor access to this Nest is required to roll back a merge." };
  if (result.kind === "blocked") return { ok: false, code: "BLOCKED", error: "Later changes make this rollback unsafe. Review the listed conflicts.", preview: result.preview };
  if (result.kind === "conflict") return { ok: false, code: "CONFLICT", error: "The merge state changed after preview. Preview rollback again.", preview: result.preview };
  return {
    ok: true,
    projectId: initial.preview.projectId,
    sourceTag: result.sourceTag,
    targetTag: result.targetTag,
    mergeReceiptId: initial.preview.receiptId,
    rollbackReceiptId,
    previewHash: expectedPreviewHash,
    counts: result.preview.counts,
  };
}
