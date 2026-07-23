/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";

import { searchWorkspace } from "./workspace-search";
import {
  mutateWorkTagCandidate,
  recordImportedTagCandidatesInTransaction,
} from "./work-tag-candidates";

jest.mock("@/auth", () => ({ auth: jest.fn() }));

const runDogfood = process.env.QUIPSLY_TAG_CANDIDATE_DOGFOOD === "1" ? describe : describe.skip;
if (process.env.QUIPSLY_TAG_CANDIDATE_DOGFOOD === "1") {
  if (process.env.QUIPSLY_LOCAL_DB_SMOKE !== "1" || !process.env.QUIPSLY_LOCAL_DATABASE_URL) {
    throw new Error("Imported keyword dogfood requires the explicit local database smoke flags.");
  }
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

runDogfood("persisted QA import → review → canonical search dogfood", () => {
  const prisma = getPrismaClient();
  const actorEmail = String(process.env.QUIPSLY_TAG_CANDIDATE_DOGFOOD_EMAIL || "").trim().toLowerCase();
  const projectId = String(process.env.QUIPSLY_TAG_CANDIDATE_DOGFOOD_PROJECT_ID || "").trim();
  const suffix = String(process.env.QUIPSLY_TAG_CANDIDATE_DOGFOOD_SUFFIX || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 48);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("does not search as canonical before promotion and does afterward", async () => {
    if (!actorEmail || !projectId || !suffix) throw new Error("Dogfood email, project ID, and a unique suffix are required.");
    const actor = await prisma.user.findFirstOrThrow({ where: { primaryEmail: actorEmail }, select: { id: true } });
    const project = await prisma.studioProject.findUniqueOrThrow({
      where: { id: projectId },
      select: { id: true, slug: true, name: true },
    });
    const label = `Imported proof keyword ${suffix}`;
    const sourceIdentity = `quipsly-dogfood:${suffix}`;
    if (await prisma.studioTagCandidate.count({ where: { projectId, slug: `imported-proof-keyword-${suffix.toLowerCase()}` } })) {
      throw new Error("Use a unique dogfood suffix; this candidate already exists.");
    }

    const recorded = await recordImportedTagCandidatesInTransaction(prisma, {
      projectId,
      sourceKind: "research-source-metadata",
      sourceIdentity,
      labels: [label],
      provenanceJson: {
        purpose: "local persisted imported-keyword boundary dogfood",
        metadataField: "keywords",
        sourceMutated: false,
        externalSideEffects: false,
      },
    });
    expect(recorded).toMatchObject({
      candidateCreates: 1,
      evidenceCreates: 1,
      candidates: [{ label, status: "PENDING" }],
    });
    const candidate = await prisma.studioTagCandidate.findUniqueOrThrow({
      where: { id: recorded.candidates[0].id },
      include: { evidence: true },
    });
    const before = await searchWorkspace(prisma, {
      actorUserId: actor.id,
      query: label,
      visibleProjects: [project],
    });
    expect(before.tags).toEqual([]);

    const promoted = await mutateWorkTagCandidate({
      prisma,
      actorUserId: actor.id,
      actorEmail,
      candidateId: candidate.id,
      operation: "PROMOTE",
      expectedUpdatedAt: candidate.updatedAt,
    });
    expect(promoted).toMatchObject({
      ok: true,
      operation: "PROMOTE",
      candidate: { status: "PROMOTED" },
      tag: { label, isActive: true },
      receiptId: expect.any(String),
    });
    if (!promoted.ok || !promoted.tag) throw new Error("promotion did not persist");
    const after = await searchWorkspace(prisma, {
      actorUserId: actor.id,
      query: label,
      visibleProjects: [project],
    });
    expect(after.tags).toMatchObject([{ id: promoted.tag.id, label }]);
    const [savedCandidate, candidateRevision, tagRevision] = await Promise.all([
      prisma.studioTagCandidate.findUniqueOrThrow({ where: { id: candidate.id }, include: { evidence: true } }),
      prisma.studioTagCandidateRevision.findFirstOrThrow({ where: { candidateId: candidate.id, operation: "promote" } }),
      prisma.studioTagRevision.findFirstOrThrow({ where: { tagId: promoted.tag.id, operation: "imported-keyword-promoted" } }),
    ]);
    expect(savedCandidate).toMatchObject({ status: "PROMOTED", promotedTagId: promoted.tag.id, evidence: [{ sourceIdentity }] });
    console.info("[tag-candidate-dogfood]", {
      projectId,
      candidateId: candidate.id,
      evidenceId: savedCandidate.evidence[0].id,
      candidateReceiptId: candidateRevision.id,
      canonicalTagId: promoted.tag.id,
      canonicalRevisionId: tagRevision.id,
      searchBoundary: "absent before promotion; present after promotion",
    });
  }, 30_000);
});
