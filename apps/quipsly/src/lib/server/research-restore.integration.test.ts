/** @jest-environment node */

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { researchSha256, stableResearchJson, validateResearchBundle } from "@/lib/research-portability";
import { getPrismaClient } from "@/lib/prisma";
import { applyResearchRestore, buildResearchRestorePlan } from "./research-restore";
import { researchWritingUseVisibilitySql } from "./research-writing-privacy";

const runLocalDatabaseSmoke = process.env.QUIPSLY_LOCAL_DB_SMOKE === "1" ? describe : describe.skip;
if (process.env.QUIPSLY_LOCAL_DB_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) throw new Error("QUIPSLY_LOCAL_DATABASE_URL is required for the local restore smoke.");
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

runLocalDatabaseSmoke("research writing-target restore local database smoke", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID().slice(0, 8);
  const actorEmail = `research-restore-${nonce}@example.test`;
  const secondActorEmail = `research-restore-second-${nonce}@example.test`;
  let actorUserId = "";
  let secondActorUserId = "";
  let workspaceId = "";
  let projectId = "";

  beforeAll(async () => {
    const actor = await prisma.user.create({ data: { primaryEmail: actorEmail, name: "Research restore smoke" } });
    actorUserId = actor.id;
    const secondActor = await prisma.user.create({ data: { primaryEmail: secondActorEmail, name: "Research privacy smoke" } });
    secondActorUserId = secondActor.id;
    const workspace = await prisma.studioWorkspace.create({
      data: { slug: `research-restore-${nonce}`, name: "Research restore smoke", isPrivate: true },
    });
    workspaceId = workspace.id;
    const project = await prisma.studioProject.create({
      data: { workspaceId, slug: `target-${nonce}`, name: "Restore target", isPrivate: true },
    });
    projectId = project.id;
    await prisma.studioProjectAccessGrant.create({
      data: { projectId, email: secondActorEmail, role: "VIEWER", status: "ACTIVE", createdByUserId: actorUserId, createdByEmail: actorEmail },
    });
  });

  afterAll(async () => {
    try {
      if (projectId) {
        await prisma.studioSourceAnnotationTag.deleteMany({ where: { annotation: { projectId } } });
        await prisma.studioSourceAnnotationRevision.deleteMany({ where: { annotation: { projectId } } });
        await prisma.studioSourceAnnotationUse.deleteMany({ where: { projectId } });
        await prisma.studioSourceAnnotation.deleteMany({ where: { projectId } });
        await prisma.studioTag.deleteMany({ where: { projectId } });
        await prisma.studioProject.deleteMany({ where: { id: projectId } });
      }
      if (workspaceId) await prisma.studioWorkspace.deleteMany({ where: { id: workspaceId } });
      if (actorUserId) await prisma.user.deleteMany({ where: { id: actorUserId } });
      if (secondActorUserId) await prisma.user.deleteMany({ where: { id: secondActorUserId } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it("creates private referenced-block excerpts and reuses every identity on retry", async () => {
    const writingUses = [{
      id: "portable-use-1",
      annotationId: "portable-annotation-1",
      documentId: "portable-document-1",
      blockId: "portable-block-1",
      useKind: "evidence",
      citationKey: "portable-source-1",
      quoteSnapshot: "Evidence",
      citationLabel: "Portable source",
      sourceJson: { kind: "quipsly-source-annotation-use-v1", sourceMutated: false },
      archivedAt: null,
      createdAt: "2026-07-18T20:10:00.000Z",
    }];
    const writingTargets = [{
      useId: "portable-use-1",
      document: {
        id: "portable-document-1",
        stableId: "portable-draft-1",
        title: "Portable source-backed draft",
        sourceLabel: "Writing smoke",
        sourcePath: null,
        projectionStatus: "draft",
        isPrivate: true,
        updatedAt: "2026-07-18T20:20:00.000Z",
      },
      block: {
        id: "portable-block-1",
        stableId: "portable-opening-1",
        order: 1,
        title: "Source-backed opening",
        body: "A preserved writing excerpt backed by portable evidence.",
        sourceLabel: "Portable source",
        sourcePath: null,
        externalId: "annotation:portable-annotation-1",
        projectionStatus: "draft",
        isPrivate: true,
        archivedAt: null,
        updatedAt: "2026-07-18T20:20:00.000Z",
      },
    }];
    const payload = {
      schemaVersion: "quipsly-research-export-v1",
      exportedAt: "2026-07-18T20:30:00.000Z",
      project: { id: "portable-project-1", slug: "portable-source", name: "Portable source", updatedAt: "2026-07-18T20:25:00.000Z" },
      sources: [{
        id: "portable-source-1", slug: "portable-source", kind: "article", title: "Portable source",
        sourceUrl: null, sourcePath: null, author: "Quipsly", capturedAt: null,
        immutableText: "Evidence", immutableTextSha256: researchSha256("Evidence"), editableNotes: null, metadataJson: {},
      }],
      tags: [{ id: "portable-tag-1", slug: "portable", label: "Portable", description: null, category: "source", isPrivate: true }],
      annotations: [{
        id: "portable-annotation-1", sourceUnitId: "portable-source-1", kind: "quote", status: "active", visibility: "private",
        body: "Use this exact evidence.", selectorKind: "text-quote", startOffset: 0, endOffset: 8, exactText: "Evidence",
        prefixText: "", suffixText: "", startSeconds: null, endSeconds: null, sourceFingerprint: researchSha256("Evidence"),
        provenanceJson: {}, tagIds: ["portable-tag-1"], revisions: [{ revision: 1, operation: "created" }],
      }],
      writingUses,
      writingTargets,
      boundaries: { actorScoped: true, sourceMutated: false },
    };
    const input = {
      ...payload,
      integrity: {
        algorithm: "sha256",
        manifestSha256: researchSha256(stableResearchJson(payload)),
        sourceCount: 1,
        annotationCount: 1,
        writingUseCount: 1,
        writingTargetCount: 1,
      },
    };
    const validation = validateResearchBundle(input);
    if (!validation.ok) throw new Error(validation.error);

    const firstPlan = await buildResearchRestorePlan(prisma, { projectId, actorUserId, bundle: validation.bundle });
    expect(firstPlan).toMatchObject({
      sourceCreates: 1,
      annotationCreates: 1,
      writingTargetDocumentCreates: 1,
      writingTargetBlockCreates: 1,
      writingUseCreates: 1,
      writingUsesDeferred: 0,
      overwrites: 0,
      sourceMutations: 0,
    });

    const first = await applyResearchRestore(prisma, { projectId, actorUserId, actorEmail, bundle: validation.bundle });
    const restoredDocumentId = first.restoredWritingTargetDocumentIds["portable-document-1"];
    const restoredUseId = first.restoredWritingUseIds["portable-use-1"];
    expect(restoredDocumentId).toBeTruthy();
    expect(restoredUseId).toBeTruthy();
    expect(first.boundaries).toMatchObject({
      sourceMutated: false,
      overwroteExisting: false,
      writingTargetsRestoredPrivate: true,
      writingTargetSnapshotKind: "referenced-blocks-only",
      writingUsesDeferred: 0,
    });

    const [document, restoredUse, source] = await Promise.all([
      prisma.studioDocument.findUnique({ where: { id: restoredDocumentId }, include: { blocks: true } }),
      prisma.studioSourceAnnotationUse.findUnique({ where: { id: restoredUseId }, include: { annotation: true, block: true } }),
      prisma.studioSourceUnit.findFirst({ where: { projectId } }),
    ]);
    expect(document).toMatchObject({ isPrivate: true, projectionStatus: "private", blocks: [{ body: writingTargets[0].block.body, isPrivate: true, projectionStatus: "private" }] });
    expect(restoredUse).toMatchObject({ quoteSnapshot: "Evidence", createdByUserId: actorUserId, block: { body: writingTargets[0].block.body }, annotation: { visibility: "private" } });
    expect(source?.immutableText).toBe("Evidence");
    const visibleWritingUseIds = async (viewerUserId: string | null) => prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT annotation_use."id"
      FROM "StudioSourceAnnotationUse" annotation_use
      JOIN "StudioDocument" document ON document."id" = annotation_use."documentId"
      WHERE annotation_use."projectId" = ${projectId}
        AND ${researchWritingUseVisibilitySql(viewerUserId)}
      ORDER BY annotation_use."id"
    `);
    await expect(visibleWritingUseIds(actorUserId)).resolves.toEqual([{ id: restoredUseId }]);
    await expect(visibleWritingUseIds(secondActorUserId)).resolves.toEqual([]);
    await expect(visibleWritingUseIds(null)).resolves.toEqual([]);

    const secondPlan = await buildResearchRestorePlan(prisma, { projectId, actorUserId, bundle: validation.bundle });
    expect(secondPlan).toMatchObject({
      sourceReuses: 1,
      annotationReuses: 1,
      writingTargetDocumentReuses: 1,
      writingTargetBlockReuses: 1,
      writingUseReuses: 1,
      writingUsesDeferred: 0,
      overwrites: 0,
    });
    const second = await applyResearchRestore(prisma, { projectId, actorUserId, actorEmail, bundle: validation.bundle });
    expect(second.restoredWritingTargetDocumentIds).toEqual(first.restoredWritingTargetDocumentIds);
    expect(second.restoredWritingUseIds).toEqual(first.restoredWritingUseIds);

    const changedTargets = [{
      ...writingTargets[0],
      block: {
        ...writingTargets[0].block,
        body: "A newer preserved writing excerpt that must be versioned, never overwritten.",
        updatedAt: "2026-07-18T21:20:00.000Z",
      },
    }];
    const changedPayload = {
      ...payload,
      exportedAt: "2026-07-18T21:30:00.000Z",
      writingTargets: changedTargets,
    };
    const changedValidation = validateResearchBundle({
      ...changedPayload,
      integrity: {
        algorithm: "sha256",
        manifestSha256: researchSha256(stableResearchJson(changedPayload)),
        sourceCount: 1,
        annotationCount: 1,
        writingUseCount: 1,
        writingTargetCount: 1,
      },
    });
    if (!changedValidation.ok) throw new Error(changedValidation.error);
    const changedPlan = await buildResearchRestorePlan(prisma, { projectId, actorUserId, bundle: changedValidation.bundle });
    expect(changedPlan).toMatchObject({
      sourceReuses: 1,
      annotationReuses: 1,
      writingTargetDocumentCreates: 1,
      writingTargetBlockCreates: 1,
      writingUseCreates: 1,
      overwrites: 0,
    });
    const changed = await applyResearchRestore(prisma, { projectId, actorUserId, actorEmail, bundle: changedValidation.bundle });
    expect(changed.restoredWritingTargetDocumentIds["portable-document-1"]).not.toBe(restoredDocumentId);
    expect(changed.restoredWritingUseIds["portable-use-1"]).not.toBe(restoredUseId);
    await expect(prisma.studioDocument.count({ where: { projectId } })).resolves.toBe(2);
    await expect(prisma.studioSourceAnnotationUse.count({ where: { projectId } })).resolves.toBe(2);
    await expect(visibleWritingUseIds(secondActorUserId)).resolves.toEqual([]);
    await expect(prisma.studioDocumentBlock.findUnique({
      where: { id: document?.blocks[0].id },
      select: { body: true },
    })).resolves.toEqual({ body: writingTargets[0].block.body });
  });
});
