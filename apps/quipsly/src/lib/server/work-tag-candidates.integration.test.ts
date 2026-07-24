/** @jest-environment node */

import { randomUUID } from "node:crypto";

import { getPrismaClient } from "@/lib/prisma";

import {
  extractImportedKeywords,
  mutateWorkTagCandidate,
  recordImportedTagCandidatesInTransaction,
} from "./work-tag-candidates";

jest.mock("@/auth", () => ({ auth: jest.fn() }));

const runLocalDatabaseSmoke = process.env.QUIPSLY_LOCAL_DB_SMOKE === "1" ? describe : describe.skip;
if (process.env.QUIPSLY_LOCAL_DB_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) throw new Error("QUIPSLY_LOCAL_DATABASE_URL is required for the imported keyword smoke.");
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

describe("imported keyword parsing", () => {
  it("accepts only the explicit keywords field and bounds normalized suggestions", () => {
    expect(extractImportedKeywords({ tags: ["Not imported"], keywords: " Story arc ; #Guest research\nStory arc " }))
      .toEqual(["Story arc", "Guest research"]);
    expect(extractImportedKeywords({ tags: ["Not imported"] })).toEqual([]);
    expect(extractImportedKeywords({ keywords: 42 })).toEqual([]);
  });
});

runLocalDatabaseSmoke("imported keyword candidate local database smoke", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID().slice(0, 8);
  const actorEmail = `tag-candidate-${nonce}@example.test`;
  let actorUserId = "";
  let workspaceId = "";
  let projectId = "";

  beforeAll(async () => {
    const actor = await prisma.user.create({ data: { primaryEmail: actorEmail, name: "Tag candidate actor" } });
    actorUserId = actor.id;
    const workspace = await prisma.studioWorkspace.create({
      data: { slug: `tag-candidate-${nonce}`, name: "Tag candidate smoke", isPrivate: true },
    });
    workspaceId = workspace.id;
    const project = await prisma.studioProject.create({
      data: { workspaceId, slug: `tag-candidate-project-${nonce}`, name: "Imported keyword review", isPrivate: true },
    });
    projectId = project.id;
    await prisma.studioProjectAccessGrant.create({
      data: {
        projectId,
        email: actorEmail,
        role: "EDITOR",
        status: "ACTIVE",
        createdByUserId: actorUserId,
        createdByEmail: actorEmail,
      },
    });
  });

  afterAll(async () => {
    try {
      if (workspaceId) await prisma.studioWorkspace.deleteMany({ where: { id: workspaceId } });
      if (actorUserId) await prisma.user.deleteMany({ where: { id: actorUserId } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it("keeps repeated source keywords non-canonical until explicit reviewed promotion", async () => {
    const evidence = {
      manifestSha256: "a".repeat(64),
      originalSourceUnitId: "source-one",
      metadataField: "keywords",
      sourceMutated: false,
    };
    const first = await recordImportedTagCandidatesInTransaction(prisma, {
      projectId,
      sourceKind: "research-source-metadata",
      sourceIdentity: "manifest-one:source-one",
      labels: ["Story structure", "Story structure"],
      provenanceJson: evidence,
    });
    expect(first).toMatchObject({
      acceptedLabels: 1,
      candidateCreates: 1,
      candidateReuses: 0,
      evidenceCreates: 1,
      evidenceReuses: 0,
      candidates: [{ label: "Story structure", slug: "story-structure", status: "PENDING" }],
    });
    await expect(prisma.studioTag.count({ where: { projectId, slug: "story-structure" } })).resolves.toBe(0);

    const retry = await recordImportedTagCandidatesInTransaction(prisma, {
      projectId,
      sourceKind: "research-source-metadata",
      sourceIdentity: "manifest-one:source-one",
      labels: ["Story structure"],
      provenanceJson: evidence,
    });
    expect(retry).toMatchObject({ candidateCreates: 0, candidateReuses: 1, evidenceCreates: 0, evidenceReuses: 1 });
    const candidate = await prisma.studioTagCandidate.findUniqueOrThrow({
      where: { id: first.candidates[0].id },
      include: { evidence: true },
    });
    expect(candidate.evidence).toHaveLength(1);

    const rejected = await mutateWorkTagCandidate({
      prisma,
      actorUserId,
      actorEmail,
      candidateId: candidate.id,
      operation: "REJECT",
      expectedUpdatedAt: candidate.updatedAt,
    });
    expect(rejected).toMatchObject({ ok: true, operation: "REJECT", candidate: { status: "REJECTED" }, tag: null, revision: 1 });
    await expect(prisma.studioTag.count({ where: { projectId, slug: "story-structure" } })).resolves.toBe(0);

    if (!rejected.ok) throw new Error("reject setup failed");
    const reopened = await mutateWorkTagCandidate({
      prisma,
      actorUserId,
      actorEmail,
      candidateId: candidate.id,
      operation: "REOPEN",
      expectedUpdatedAt: rejected.candidate.updatedAt,
    });
    expect(reopened).toMatchObject({ ok: true, operation: "REOPEN", candidate: { status: "PENDING", promotedTagId: null }, revision: 2 });

    if (!reopened.ok) throw new Error("reopen setup failed");
    const promoted = await mutateWorkTagCandidate({
      prisma,
      actorUserId,
      actorEmail,
      candidateId: candidate.id,
      operation: "PROMOTE",
      expectedUpdatedAt: reopened.candidate.updatedAt,
    });
    expect(promoted).toMatchObject({
      ok: true,
      operation: "PROMOTE",
      candidate: { status: "PROMOTED" },
      tag: { label: "Story structure", slug: "story-structure", isActive: true },
      revision: 3,
      receiptId: expect.any(String),
    });
    if (!promoted.ok || !promoted.tag) throw new Error("promotion setup failed");
    await expect(prisma.studioTag.count({ where: { projectId, slug: "story-structure" } })).resolves.toBe(1);
    await expect(prisma.studioTagCandidateRevision.findMany({
      where: { candidateId: candidate.id },
      orderBy: { revision: "asc" },
      select: { revision: true, operation: true },
    })).resolves.toEqual([
      { revision: 1, operation: "reject" },
      { revision: 2, operation: "reopen" },
      { revision: 3, operation: "promote" },
    ]);
    await expect(prisma.studioTagRevision.findMany({
      where: { tagId: promoted.tag.id },
      select: { operation: true, snapshotJson: true },
    })).resolves.toEqual([expect.objectContaining({
      operation: "imported-keyword-promoted",
      snapshotJson: expect.objectContaining({
        candidateReceiptId: promoted.receiptId,
        evidenceIds: [candidate.evidence[0].id],
        externalSideEffects: false,
      }),
    })]);
  });

  it("fails closed on ambiguous canonical names and lost editor permission", async () => {
    await prisma.studioTag.create({
      data: { projectId, slug: `ambiguous-${nonce}`, label: `Ambiguous ${nonce}` },
    });
    const recorded = await recordImportedTagCandidatesInTransaction(prisma, {
      projectId,
      sourceKind: "external-document-keywords",
      sourceIdentity: "external-source-two",
      labels: [`Ambiguous-${nonce}`],
      provenanceJson: { metadataField: "keywords" },
    });
    const candidate = await prisma.studioTagCandidate.findUniqueOrThrow({ where: { id: recorded.candidates[0].id } });
    const ambiguous = await mutateWorkTagCandidate({
      prisma,
      actorUserId,
      actorEmail,
      candidateId: candidate.id,
      operation: "PROMOTE",
      expectedUpdatedAt: candidate.updatedAt,
    });
    expect(ambiguous).toMatchObject({ ok: false, code: "SLUG_CONFLICT" });
    await expect(prisma.studioTagCandidateRevision.count({ where: { candidateId: candidate.id } })).resolves.toBe(0);

    await prisma.studioProjectAccessGrant.update({
      where: { projectId_email: { projectId, email: actorEmail } },
      data: { role: "VIEWER" },
    });
    const forbidden = await mutateWorkTagCandidate({
      prisma,
      actorUserId,
      actorEmail,
      candidateId: candidate.id,
      operation: "REJECT",
      expectedUpdatedAt: candidate.updatedAt,
    });
    expect(forbidden).toMatchObject({ ok: false, code: "FORBIDDEN" });
    await prisma.studioProjectAccessGrant.update({
      where: { projectId_email: { projectId, email: actorEmail } },
      data: { role: "EDITOR" },
    });
  });
});
