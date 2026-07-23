/** @jest-environment node */

import { randomUUID } from "node:crypto";

import { getPrismaClient } from "@/lib/prisma";

import { createAndAssignWorkEntityTag } from "./work-tags";
import { applyWorkTagMerge, previewWorkTagMerge } from "./work-tag-merge";
import { applyWorkTagMergeRollback, previewWorkTagMergeRollback } from "./work-tag-merge-rollback";

jest.mock("@/auth", () => ({ auth: jest.fn() }));

const runLocalDatabaseSmoke = process.env.QUIPSLY_LOCAL_DB_SMOKE === "1" ? describe : describe.skip;
if (process.env.QUIPSLY_LOCAL_DB_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) throw new Error("QUIPSLY_LOCAL_DATABASE_URL is required for the tag merge smoke.");
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

runLocalDatabaseSmoke("lossless canonical tag merge local database smoke", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID().slice(0, 8);
  const actorEmail = `tag-merge-${nonce}@example.test`;
  let actorUserId = "";
  let workspaceId = "";
  let projectId = "";
  let sourceTagId = "";
  let targetTagId = "";
  let taskId = "";
  let duplicateTaskId = "";
  let goalId = "";
  let roomId = "";
  let noteId = "";
  let annotationId = "";
  let spanId = "";
  let nodeId = "";
  let mediaAssetId = "";
  let mediaClipId = "";
  let conflictSourceTagId = "";
  let conflictTargetTagId = "";

  beforeAll(async () => {
    const actor = await prisma.user.create({ data: { primaryEmail: actorEmail, name: "Tag merge actor" } });
    actorUserId = actor.id;
    const workspace = await prisma.studioWorkspace.create({ data: { slug: `tag-merge-${nonce}`, name: "Tag merge smoke" } });
    workspaceId = workspace.id;
    const project = await prisma.studioProject.create({ data: { workspaceId, slug: `tag-merge-project-${nonce}`, name: "High Ground tag merge smoke" } });
    projectId = project.id;
    await prisma.studioProjectAccessGrant.create({ data: { projectId, email: actorEmail, role: "EDITOR", status: "ACTIVE", createdByUserId: actorUserId } });

    const [sourceTag, targetTag] = await Promise.all([
      prisma.studioTag.create({ data: { projectId, slug: `rough-cut-${nonce}`, label: `Rough cut ${nonce}` } }),
      prisma.studioTag.create({ data: { projectId, slug: `episode-edit-${nonce}`, label: `Episode edit ${nonce}`, category: "production_breakdown", nodeType: "principle" } }),
    ]);
    sourceTagId = sourceTag.id;
    targetTagId = targetTag.id;
    await prisma.studioTagAlias.create({ data: { projectId, tagId: sourceTagId, slug: `assembly-${nonce}`, label: `Assembly ${nonce}` } });

    const [task, duplicateTask, goal, room] = await Promise.all([
      prisma.actionItem.create({ data: { assignedUserId: actorUserId, projectId, title: "Conform the episode" } }),
      prisma.actionItem.create({ data: { assignedUserId: actorUserId, projectId, title: "Already shared taxonomy" } }),
      prisma.goal.create({ data: { ownerUserId: actorUserId, projectId, title: "Finish the episode edit" } }),
      prisma.callRoom.create({ data: { createdByUserId: actorUserId, projectId, title: "Episode edit review" } }),
    ]);
    taskId = task.id;
    duplicateTaskId = duplicateTask.id;
    goalId = goal.id;
    roomId = room.id;
    const note = await prisma.coachingNote.create({ data: { roomId, authorUserId: actorUserId, body: "Editing follow-through note" } });
    noteId = note.id;
    await Promise.all([
      prisma.actionItemTagLink.createMany({ data: [
        { actionItemId: taskId, tagId: sourceTagId, createdByUserId: actorUserId, sourceJson: { fixture: "source-only" } },
        { actionItemId: duplicateTaskId, tagId: sourceTagId, createdByUserId: actorUserId, sourceJson: { fixture: "source-duplicate" } },
        { actionItemId: duplicateTaskId, tagId: targetTagId, createdByUserId: actorUserId, sourceJson: { fixture: "target-existing" } },
      ] }),
      prisma.goalTagLink.create({ data: { goalId, tagId: sourceTagId, createdByUserId: actorUserId } }),
      prisma.callRoomTagLink.create({ data: { roomId, tagId: sourceTagId, createdByUserId: actorUserId } }),
      prisma.coachingNoteTagLink.create({ data: { noteId, tagId: sourceTagId, createdByUserId: actorUserId } }),
    ]);

    const document = await prisma.studioDocument.create({
      data: { projectId, stableId: `tag-merge-document-${nonce}`, title: "Episode edit source" },
    });
    const block = await prisma.studioDocumentBlock.create({
      data: { documentId: document.id, stableId: `tag-merge-block-${nonce}`, order: 1, body: "A precise episode editing passage." },
    });
    const sourceUnit = await prisma.studioSourceUnit.create({
      data: { projectId, documentId: document.id, slug: `tag-merge-source-${nonce}`, kind: "document", title: "Episode edit evidence", immutableText: block.body },
    });
    const annotation = await prisma.studioSourceAnnotation.create({
      data: {
        projectId,
        sourceUnitId: sourceUnit.id,
        documentId: document.id,
        blockId: block.id,
        createdByUserId: actorUserId,
        body: "This belongs in the edit.",
        selectorKind: "text",
        startOffset: 2,
        endOffset: 9,
        exactText: "precise",
      },
    });
    annotationId = annotation.id;
    await prisma.studioSourceAnnotationTag.create({ data: { annotationId, tagId: sourceTagId } });

    const span = await prisma.studioTaggedSpan.create({
      data: {
        documentId: document.id,
        blockId: block.id,
        tagId: sourceTagId,
        startOffset: 2,
        endOffset: 9,
        selectedText: "precise",
        documentStableId: document.stableId,
        documentTitleSnapshot: document.title,
        blockStableId: block.stableId,
      },
    });
    spanId = span.id;
    const node = await prisma.studioKnowledgeNode.create({
      data: {
        projectId,
        documentId: document.id,
        blockId: block.id,
        taggedSpanId: span.id,
        tagId: sourceTagId,
        tagLabel: sourceTag.label,
        tagCategory: sourceTag.category,
        nodeType: sourceTag.nodeType,
        sourceText: span.selectedText,
        title: "Precise editing",
        body: "Preserved knowledge-node interpretation.",
        documentStableId: document.stableId,
        documentTitleSnapshot: document.title,
        blockStableId: block.stableId,
        spanStartOffset: span.startOffset,
        spanEndOffset: span.endOffset,
      },
    });
    nodeId = node.id;

    const mediaAsset = await prisma.studioMediaAsset.create({ data: { filename: `tag-merge-${nonce}.mov`, url: `file:///tmp/tag-merge-${nonce}.mov` } });
    mediaAssetId = mediaAsset.id;
    const mediaClip = await prisma.mediaClip.create({
      data: { mediaAssetId, title: "Episode edit clip", inTimecode: 0, outTimecode: 12, tags: { connect: { id: sourceTagId } } },
    });
    mediaClipId = mediaClip.id;
  });

  afterAll(async () => {
    try {
      if (mediaAssetId) await prisma.studioMediaAsset.deleteMany({ where: { id: mediaAssetId } });
      if (noteId) await prisma.coachingNote.deleteMany({ where: { id: noteId } });
      if (taskId || duplicateTaskId) await prisma.actionItem.deleteMany({ where: { id: { in: [taskId, duplicateTaskId].filter(Boolean) } } });
      if (goalId) await prisma.goal.deleteMany({ where: { id: goalId } });
      if (roomId) await prisma.callRoom.deleteMany({ where: { id: roomId } });
      if (projectId) {
        await prisma.studioSourceAnnotationTag.deleteMany({ where: { annotation: { projectId } } });
        await prisma.studioKnowledgeNode.deleteMany({ where: { projectId } });
        await prisma.studioTaggedSpan.deleteMany({ where: { document: { projectId } } });
        await prisma.studioSourceAnnotation.deleteMany({ where: { projectId } });
        await prisma.studioSourceUnit.deleteMany({ where: { projectId } });
        await prisma.studioDocument.deleteMany({ where: { projectId } });
        await prisma.studioTagMergeReceipt.deleteMany({ where: { projectId } });
      }
      if (workspaceId) await prisma.studioWorkspace.deleteMany({ where: { id: workspaceId } });
      if (actorUserId) await prisma.user.deleteMany({ where: { id: actorUserId } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it("previews and transactionally reassigns every supported relationship with an exact rollback receipt", async () => {
    const previewResult = await previewWorkTagMerge({ prisma, actorEmail, sourceTagId, targetTagId });
    expect(previewResult).toMatchObject({
      ok: true,
      preview: {
        canMerge: true,
        counts: {
          tasks: 2,
          goals: 1,
          sessions: 1,
          coachingNotes: 1,
          annotations: 1,
          taggedSpans: 1,
          knowledgeNodes: 1,
          mediaClips: 1,
          aliases: 2,
          totalUses: 9,
        },
        deduplicated: { tasks: 1 },
        boundaries: { sourcePreservedAsRedirect: true, exactRollbackSnapshot: true, immutableSourceTextMutated: false, externalSideEffects: false },
      },
    });
    if (!previewResult.ok) throw new Error("preview setup failed");

    const result = await applyWorkTagMerge({
      prisma,
      actorUserId,
      actorEmail,
      sourceTagId,
      targetTagId,
      expectedImpactHash: previewResult.preview.impactHash,
      expectedSourceUpdatedAt: previewResult.preview.source.updatedAt,
      expectedTargetUpdatedAt: previewResult.preview.target.updatedAt,
    });
    expect(result).toMatchObject({
      ok: true,
      sourceTag: { id: sourceTagId, isActive: false, mergedIntoTagId: targetTagId },
      targetTag: { id: targetTagId },
      counts: { totalUses: 9 },
      deduplicated: { tasks: 1 },
    });

    const [source, taskLinks, goalLinks, roomLinks, noteLinks, annotationLinks, span, node, mediaClip, aliases, receipt] = await Promise.all([
      prisma.studioTag.findUniqueOrThrow({ where: { id: sourceTagId } }),
      prisma.actionItemTagLink.findMany({ where: { actionItemId: { in: [taskId, duplicateTaskId] } }, orderBy: { actionItemId: "asc" } }),
      prisma.goalTagLink.findMany({ where: { goalId } }),
      prisma.callRoomTagLink.findMany({ where: { roomId } }),
      prisma.coachingNoteTagLink.findMany({ where: { noteId } }),
      prisma.studioSourceAnnotationTag.findMany({ where: { annotationId } }),
      prisma.studioTaggedSpan.findUniqueOrThrow({ where: { id: spanId } }),
      prisma.studioKnowledgeNode.findUniqueOrThrow({ where: { id: nodeId } }),
      prisma.mediaClip.findUniqueOrThrow({ where: { id: mediaClipId }, include: { tags: true } }),
      prisma.studioTagAlias.findMany({ where: { tagId: targetTagId }, orderBy: { label: "asc" } }),
      prisma.studioTagMergeReceipt.findUniqueOrThrow({ where: { id: result.ok ? result.receiptId : "unreachable" } }),
    ]);
    expect(source).toMatchObject({ isActive: false, mergedIntoTagId: targetTagId, mergedAt: expect.any(Date) });
    expect(taskLinks).toHaveLength(2);
    expect(taskLinks.every((link) => link.tagId === targetTagId)).toBe(true);
    expect(goalLinks).toEqual([expect.objectContaining({ tagId: targetTagId })]);
    expect(roomLinks).toEqual([expect.objectContaining({ tagId: targetTagId })]);
    expect(noteLinks).toEqual([expect.objectContaining({ tagId: targetTagId })]);
    expect(annotationLinks).toEqual([expect.objectContaining({ tagId: targetTagId })]);
    expect(span.tagId).toBe(targetTagId);
    expect(node).toMatchObject({ tagId: targetTagId, tagLabel: `Episode edit ${nonce}`, tagCategory: "production_breakdown", nodeType: "principle" });
    expect(mediaClip.tags.map((tag) => tag.id)).toEqual([targetTagId]);
    expect(aliases.map((alias) => alias.label)).toEqual([`Assembly ${nonce}`, `Rough cut ${nonce}`]);
    expect(receipt).toMatchObject({ sourceTagId, targetTagId, impactHash: result.ok ? result.impactHash : "unreachable" });
    expect(receipt.snapshotJson).toMatchObject({
      kind: "quipsly-tag-merge-v2",
      exactMovedAssociations: {
        taskLinks: expect.arrayContaining([expect.objectContaining({ actionItemId: taskId, tagId: sourceTagId, sourceJson: { fixture: "source-only" } })]),
        taggedSpans: [expect.objectContaining({ id: spanId, tagId: sourceTagId })],
        knowledgeNodes: [expect.objectContaining({ id: nodeId, tagId: sourceTagId })],
        mediaClipIds: [mediaClipId],
      },
      exactPreMergeTargetAssociations: {
        taskLinks: [expect.objectContaining({ actionItemId: duplicateTaskId, tagId: targetTagId, sourceJson: { fixture: "target-existing" } })],
      },
      boundaries: { externalSideEffects: false, immutableSourceTextMutated: false },
    });

    const currentTask = await prisma.actionItem.findUniqueOrThrow({ where: { id: taskId } });
    const aliasReuse = await createAndAssignWorkEntityTag({
      prisma,
      actorUserId,
      actorEmail,
      entityKind: "task",
      entityId: taskId,
      label: `Rough cut ${nonce}`,
      expectedUpdatedAt: currentTask.updatedAt,
    });
    expect(aliasReuse).toMatchObject({ ok: true, created: false, tag: { id: targetTagId, label: `Episode edit ${nonce}` } });
    await expect(prisma.studioTag.count({ where: { projectId, OR: [{ slug: `rough-cut-${nonce}` }, { slug: `episode-edit-${nonce}` }] } })).resolves.toBe(2);

    const rollbackPreview = await previewWorkTagMergeRollback({ prisma, actorEmail, sourceTagId });
    expect(rollbackPreview).toMatchObject({
      ok: true,
      preview: {
        receiptId: result.ok ? result.receiptId : "unreachable",
        canRollback: true,
        counts: { tasks: 2, goals: 1, sessions: 1, coachingNotes: 1, annotations: 1, taggedSpans: 1, knowledgeNodes: 1, mediaClips: 1, totalUses: 9 },
        targetRelationshipsPreserved: { tasks: 1 },
        targetRelationshipsRemoved: { tasks: 1, goals: 1, sessions: 1, coachingNotes: 1, annotations: 1, mediaClips: 1 },
        boundaries: { exactReceiptRequired: true, laterEditsFailClosed: true, immutableSourceTextMutated: false, externalSideEffects: false },
      },
    });
    if (!rollbackPreview.ok) throw new Error("rollback preview setup failed");

    await prisma.actionItemTagLink.update({
      where: { actionItemId_tagId: { actionItemId: taskId, tagId: targetTagId } },
      data: { sourceJson: { fixture: "changed-after-merge" } },
    });
    await expect(previewWorkTagMergeRollback({ prisma, actorEmail, sourceTagId })).resolves.toMatchObject({
      ok: true,
      preview: { canRollback: false, blockingConflicts: expect.arrayContaining([expect.stringContaining("changed afterward")]) },
    });
    await prisma.actionItemTagLink.update({
      where: { actionItemId_tagId: { actionItemId: taskId, tagId: targetTagId } },
      data: { sourceJson: { fixture: "source-only" } },
    });
    const freshRollbackPreview = await previewWorkTagMergeRollback({ prisma, actorEmail, sourceTagId });
    if (!freshRollbackPreview.ok) throw new Error("fresh rollback preview setup failed");
    expect(freshRollbackPreview.preview.canRollback).toBe(true);
    const rollbackResult = await applyWorkTagMergeRollback({
      prisma,
      actorUserId,
      actorEmail,
      sourceTagId,
      expectedPreviewHash: freshRollbackPreview.preview.previewHash,
      expectedSourceUpdatedAt: freshRollbackPreview.preview.source.updatedAt,
      expectedTargetUpdatedAt: freshRollbackPreview.preview.target.updatedAt,
    });
    expect(rollbackResult).toMatchObject({
      ok: true,
      sourceTag: { id: sourceTagId, isActive: true, mergedIntoTagId: null, mergedAt: null },
      targetTag: { id: targetTagId },
      mergeReceiptId: result.ok ? result.receiptId : "unreachable",
      rollbackReceiptId: expect.any(String),
    });

    const [rolledBackTaskLinks, rolledBackGoalLinks, rolledBackRoomLinks, rolledBackNoteLinks, rolledBackAnnotationLinks,
      rolledBackSpan, rolledBackNode, rolledBackClip, sourceAliases, targetAliases, rollbackRevision] = await Promise.all([
      prisma.actionItemTagLink.findMany({ where: { actionItemId: { in: [taskId, duplicateTaskId] } }, orderBy: [{ actionItemId: "asc" }, { tagId: "asc" }] }),
      prisma.goalTagLink.findMany({ where: { goalId } }),
      prisma.callRoomTagLink.findMany({ where: { roomId } }),
      prisma.coachingNoteTagLink.findMany({ where: { noteId } }),
      prisma.studioSourceAnnotationTag.findMany({ where: { annotationId } }),
      prisma.studioTaggedSpan.findUniqueOrThrow({ where: { id: spanId } }),
      prisma.studioKnowledgeNode.findUniqueOrThrow({ where: { id: nodeId } }),
      prisma.mediaClip.findUniqueOrThrow({ where: { id: mediaClipId }, include: { tags: true } }),
      prisma.studioTagAlias.findMany({ where: { tagId: sourceTagId }, orderBy: { label: "asc" } }),
      prisma.studioTagAlias.findMany({ where: { tagId: targetTagId }, orderBy: { label: "asc" } }),
      prisma.studioTagRevision.findFirstOrThrow({ where: { tagId: sourceTagId, operation: "merge-rollback" }, orderBy: { revision: "desc" } }),
    ]);
    expect(rolledBackTaskLinks).toEqual(expect.arrayContaining([
      expect.objectContaining({ actionItemId: taskId, tagId: sourceTagId, sourceJson: { fixture: "source-only" } }),
      expect.objectContaining({ actionItemId: duplicateTaskId, tagId: sourceTagId, sourceJson: { fixture: "source-duplicate" } }),
      expect.objectContaining({ actionItemId: duplicateTaskId, tagId: targetTagId, sourceJson: { fixture: "target-existing" } }),
    ]));
    expect(rolledBackTaskLinks).toHaveLength(3);
    expect(rolledBackGoalLinks).toEqual([expect.objectContaining({ tagId: sourceTagId })]);
    expect(rolledBackRoomLinks).toEqual([expect.objectContaining({ tagId: sourceTagId })]);
    expect(rolledBackNoteLinks).toEqual([expect.objectContaining({ tagId: sourceTagId })]);
    expect(rolledBackAnnotationLinks).toEqual([expect.objectContaining({ tagId: sourceTagId })]);
    expect(rolledBackSpan.tagId).toBe(sourceTagId);
    expect(rolledBackNode).toMatchObject({ tagId: sourceTagId, tagLabel: `Rough cut ${nonce}`, tagCategory: "meaning", nodeType: "source_note" });
    expect(rolledBackClip.tags.map((tag) => tag.id)).toEqual([sourceTagId]);
    expect(sourceAliases.map((alias) => alias.label)).toEqual([`Assembly ${nonce}`]);
    expect(targetAliases).toHaveLength(0);
    expect(rollbackRevision.snapshotJson).toMatchObject({
      kind: "quipsly-tag-merge-rollback-v1",
      rollbackReceiptId: rollbackResult.ok ? rollbackResult.rollbackReceiptId : "unreachable",
      mergeReceiptId: result.ok ? result.receiptId : "unreachable",
      boundaries: { externalSideEffects: false, immutableSourceTextMutated: false },
    });
  });

  it("blocks same-range anchored writing collisions instead of deleting interpretation", async () => {
    const [sourceTag, targetTag] = await Promise.all([
      prisma.studioTag.create({ data: { projectId, slug: `collision-source-${nonce}`, label: "Collision source" } }),
      prisma.studioTag.create({ data: { projectId, slug: `collision-target-${nonce}`, label: "Collision target" } }),
    ]);
    conflictSourceTagId = sourceTag.id;
    conflictTargetTagId = targetTag.id;
    const document = await prisma.studioDocument.create({ data: { projectId, stableId: `collision-document-${nonce}`, title: "Collision document" } });
    const block = await prisma.studioDocumentBlock.create({ data: { documentId: document.id, stableId: `collision-block-${nonce}`, order: 1, body: "Same exact anchor." } });
    const base = {
      documentId: document.id,
      blockId: block.id,
      startOffset: 0,
      endOffset: 4,
      selectedText: "Same",
      documentStableId: document.stableId,
      documentTitleSnapshot: document.title,
      blockStableId: block.stableId,
    };
    await prisma.studioTaggedSpan.createMany({ data: [{ ...base, tagId: sourceTag.id }, { ...base, tagId: targetTag.id }] });

    const previewResult = await previewWorkTagMerge({ prisma, actorEmail, sourceTagId: sourceTag.id, targetTagId: targetTag.id });
    expect(previewResult).toMatchObject({ ok: true, preview: { canMerge: false, blockingConflicts: { anchoredSpanCollisions: 1 } } });
    if (!previewResult.ok) throw new Error("collision preview setup failed");
    const result = await applyWorkTagMerge({
      prisma,
      actorUserId,
      actorEmail,
      sourceTagId: sourceTag.id,
      targetTagId: targetTag.id,
      expectedImpactHash: previewResult.preview.impactHash,
      expectedSourceUpdatedAt: previewResult.preview.source.updatedAt,
      expectedTargetUpdatedAt: previewResult.preview.target.updatedAt,
    });
    expect(result).toMatchObject({ ok: false, code: "BLOCKED", preview: { blockingConflicts: { anchoredSpanCollisions: 1 } } });
    await expect(prisma.studioTaggedSpan.count({ where: { blockId: block.id } })).resolves.toBe(2);
    await expect(prisma.studioTag.findUniqueOrThrow({ where: { id: sourceTag.id } })).resolves.toMatchObject({ isActive: true, mergedIntoTagId: null });

    await prisma.studioTagMergeReceipt.create({
      data: {
        id: randomUUID(),
        projectId,
        sourceTagId: sourceTag.id,
        targetTagId: targetTag.id,
        actorUserId,
        impactHash: "f".repeat(64),
        snapshotJson: { kind: "quipsly-tag-merge-v1", boundaries: { exactRollbackSnapshot: false } },
      },
    });
    await expect(previewWorkTagMergeRollback({ prisma, actorEmail, sourceTagId: sourceTag.id })).resolves.toMatchObject({
      ok: false,
      code: "UNSUPPORTED",
      error: expect.stringContaining("older merge receipt"),
    });
  });
});
