/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";

import { createAndAssignWorkEntityTag } from "./work-tags";
import { applyWorkTagMerge, previewWorkTagMerge } from "./work-tag-merge";
import { applyWorkTagMergeRollback, previewWorkTagMergeRollback } from "./work-tag-merge-rollback";

jest.mock("@/auth", () => ({ auth: jest.fn() }));

const runDogfood = process.env.QUIPSLY_TAG_ROLLBACK_DOGFOOD === "1" ? describe : describe.skip;
if (process.env.QUIPSLY_TAG_ROLLBACK_DOGFOOD === "1") {
  if (process.env.QUIPSLY_LOCAL_DB_SMOKE !== "1" || !process.env.QUIPSLY_LOCAL_DATABASE_URL) {
    throw new Error("Tag rollback dogfood requires the explicit local database smoke flags.");
  }
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

runDogfood("persisted QA merge → rollback → re-merge dogfood", () => {
  const prisma = getPrismaClient();
  const actorEmail = String(process.env.QUIPSLY_TAG_ROLLBACK_DOGFOOD_EMAIL || "").trim().toLowerCase();
  const taskId = String(process.env.QUIPSLY_TAG_ROLLBACK_DOGFOOD_TASK_ID || "").trim();
  const suffix = String(process.env.QUIPSLY_TAG_ROLLBACK_DOGFOOD_SUFFIX || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 48);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("retains an inspectable final redirect after proving exact rollback", async () => {
    if (!actorEmail || !taskId || !suffix) {
      throw new Error("The dogfood email, task ID, and unique suffix are required.");
    }
    const [actor, originalTask] = await Promise.all([
      prisma.user.findFirstOrThrow({ where: { primaryEmail: actorEmail }, select: { id: true } }),
      prisma.actionItem.findUniqueOrThrow({ where: { id: taskId }, select: { id: true, projectId: true, updatedAt: true } }),
    ]);
    if (!originalTask.projectId) throw new Error("The dogfood task must already belong to a canonical Nest.");
    const sourceLabel = `Rollback proof source ${suffix}`;
    const targetLabel = `Rollback proof canonical ${suffix}`;
    const existing = await prisma.studioTag.count({
      where: { projectId: originalTask.projectId, label: { in: [sourceLabel, targetLabel] } },
    });
    if (existing) throw new Error("Use a unique dogfood suffix; one of these proof labels already exists.");

    const sourceCreate = await createAndAssignWorkEntityTag({
      prisma,
      actorUserId: actor.id,
      actorEmail,
      entityKind: "task",
      entityId: taskId,
      label: sourceLabel,
      expectedUpdatedAt: originalTask.updatedAt,
    });
    expect(sourceCreate).toMatchObject({ ok: true, created: true });
    if (!sourceCreate.ok) throw new Error(sourceCreate.error);

    const taskAfterSource = await prisma.actionItem.findUniqueOrThrow({ where: { id: taskId }, select: { updatedAt: true } });
    const targetCreate = await createAndAssignWorkEntityTag({
      prisma,
      actorUserId: actor.id,
      actorEmail,
      entityKind: "task",
      entityId: taskId,
      label: targetLabel,
      expectedUpdatedAt: taskAfterSource.updatedAt,
    });
    expect(targetCreate).toMatchObject({ ok: true, created: true });
    if (!targetCreate.ok) throw new Error(targetCreate.error);

    const mergePreview = await previewWorkTagMerge({
      prisma,
      actorEmail,
      sourceTagId: sourceCreate.tag.id,
      targetTagId: targetCreate.tag.id,
    });
    expect(mergePreview).toMatchObject({ ok: true, preview: { canMerge: true, counts: { tasks: 1 }, deduplicated: { tasks: 1 } } });
    if (!mergePreview.ok) throw new Error(mergePreview.error);
    const merge = await applyWorkTagMerge({
      prisma,
      actorUserId: actor.id,
      actorEmail,
      sourceTagId: sourceCreate.tag.id,
      targetTagId: targetCreate.tag.id,
      expectedImpactHash: mergePreview.preview.impactHash,
      expectedSourceUpdatedAt: mergePreview.preview.source.updatedAt,
      expectedTargetUpdatedAt: mergePreview.preview.target.updatedAt,
    });
    expect(merge).toMatchObject({ ok: true });
    if (!merge.ok) throw new Error(merge.error);

    const rollbackPreview = await previewWorkTagMergeRollback({ prisma, actorEmail, sourceTagId: sourceCreate.tag.id });
    expect(rollbackPreview).toMatchObject({
      ok: true,
      preview: { canRollback: true, counts: { tasks: 1 }, targetRelationshipsPreserved: { tasks: 1 }, targetRelationshipsRemoved: { tasks: 0 } },
    });
    if (!rollbackPreview.ok) throw new Error(rollbackPreview.error);
    const rollback = await applyWorkTagMergeRollback({
      prisma,
      actorUserId: actor.id,
      actorEmail,
      sourceTagId: sourceCreate.tag.id,
      expectedPreviewHash: rollbackPreview.preview.previewHash,
      expectedSourceUpdatedAt: rollbackPreview.preview.source.updatedAt,
      expectedTargetUpdatedAt: rollbackPreview.preview.target.updatedAt,
    });
    expect(rollback).toMatchObject({ ok: true });
    if (!rollback.ok) throw new Error(rollback.error);

    const remergePreview = await previewWorkTagMerge({
      prisma,
      actorEmail,
      sourceTagId: sourceCreate.tag.id,
      targetTagId: targetCreate.tag.id,
    });
    expect(remergePreview).toMatchObject({ ok: true, preview: { canMerge: true } });
    if (!remergePreview.ok) throw new Error(remergePreview.error);
    const remerge = await applyWorkTagMerge({
      prisma,
      actorUserId: actor.id,
      actorEmail,
      sourceTagId: sourceCreate.tag.id,
      targetTagId: targetCreate.tag.id,
      expectedImpactHash: remergePreview.preview.impactHash,
      expectedSourceUpdatedAt: remergePreview.preview.source.updatedAt,
      expectedTargetUpdatedAt: remergePreview.preview.target.updatedAt,
    });
    expect(remerge).toMatchObject({ ok: true });
    if (!remerge.ok) throw new Error(remerge.error);

    const [source, sourceLinks, targetLinks, v2Receipts, rollbackRevisions] = await Promise.all([
      prisma.studioTag.findUniqueOrThrow({ where: { id: sourceCreate.tag.id } }),
      prisma.actionItemTagLink.count({ where: { actionItemId: taskId, tagId: sourceCreate.tag.id } }),
      prisma.actionItemTagLink.count({ where: { actionItemId: taskId, tagId: targetCreate.tag.id } }),
      prisma.studioTagMergeReceipt.count({ where: { sourceTagId: sourceCreate.tag.id, snapshotJson: { path: ["kind"], equals: "quipsly-tag-merge-v2" } } }),
      prisma.studioTagRevision.count({ where: { tagId: sourceCreate.tag.id, operation: "merge-rollback" } }),
    ]);
    expect(source).toMatchObject({ isActive: false, mergedIntoTagId: targetCreate.tag.id });
    expect({ sourceLinks, targetLinks, v2Receipts, rollbackRevisions }).toEqual({ sourceLinks: 0, targetLinks: 1, v2Receipts: 2, rollbackRevisions: 1 });
    console.info("[tag-rollback-dogfood]", {
      sourceTagId: sourceCreate.tag.id,
      targetTagId: targetCreate.tag.id,
      firstMergeReceiptId: merge.receiptId,
      rollbackReceiptId: rollback.rollbackReceiptId,
      finalMergeReceiptId: remerge.receiptId,
      finalState: "source redirects to canonical target",
    });
  }, 30_000);
});
