/** @jest-environment node */

import { randomUUID } from "node:crypto";

import { getPrismaClient } from "@/lib/prisma";
import { loadInbox } from "@/app/(app)/inbox/inbox-loader";

import { filePersonalSourceIntoResearch } from "./personal-source-filing";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySession: jest.fn() }));

const runLocalDatabaseSmoke = process.env.QUIPSLY_LOCAL_DB_SMOKE === "1" ? describe : describe.skip;
if (process.env.QUIPSLY_LOCAL_DB_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) throw new Error("QUIPSLY_LOCAL_DATABASE_URL is required for the personal source filing smoke.");
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

runLocalDatabaseSmoke("personal Inbox source to canonical Research filing", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID().slice(0, 8);
  const actorEmail = `research-filing-${nonce}@example.test`;
  const otherEmail = `research-filing-other-${nonce}@example.test`;
  let actorUserId = "";
  let otherUserId = "";
  let workspaceId = "";
  let projectId = "";
  let viewerProjectId = "";
  let snippetId = "";
  let bookmarkId = "";

  beforeAll(async () => {
    const [actor, other] = await Promise.all([
      prisma.user.create({ data: { primaryEmail: actorEmail, name: "Research filing actor" } }),
      prisma.user.create({ data: { primaryEmail: otherEmail, name: "Other private actor" } }),
    ]);
    actorUserId = actor.id;
    otherUserId = other.id;
    const workspace = await prisma.studioWorkspace.create({ data: { slug: `source-filing-${nonce}`, name: "Source filing smoke" } });
    workspaceId = workspace.id;
    const [project, viewerProject] = await Promise.all([
      prisma.studioProject.create({ data: { workspaceId, slug: `episode-research-${nonce}`, name: "High Ground Odyssey" } }),
      prisma.studioProject.create({ data: { workspaceId, slug: `viewer-research-${nonce}`, name: "Read-only Nest" } }),
    ]);
    projectId = project.id;
    viewerProjectId = viewerProject.id;
    await Promise.all([
      prisma.studioProjectAccessGrant.create({ data: { projectId, email: actorEmail, role: "EDITOR", status: "ACTIVE", createdByUserId: actorUserId, createdByEmail: actorEmail } }),
      prisma.studioProjectAccessGrant.create({ data: { projectId: viewerProjectId, email: actorEmail, role: "VIEWER", status: "ACTIVE", createdByUserId: actorUserId, createdByEmail: actorEmail } }),
    ]);
    const [snippet, bookmark] = await Promise.all([
      prisma.snippet.create({ data: { userId: actorUserId, sourceTitle: "Coaching insight", sourceUrl: "https://example.com/coaching", highlightedText: "Ask what changed before prescribing the next step.", note: "Private note must not become shared source text." } }),
      prisma.bookmark.create({ data: { userId: actorUserId, title: "Leadership interview", url: "https://example.com/leadership" } }),
      prisma.bookmark.create({ data: { userId: otherUserId, title: "Other actor source", url: "https://example.com/private-other" } }),
    ]);
    snippetId = snippet.id;
    bookmarkId = bookmark.id;
    await prisma.studioPersonalSourceCaptureReceipt.createMany({ data: [
      {
        createdByUserId: actorUserId,
        clientRequestId: randomUUID(),
        captureType: "SNIPPET",
        snippetId,
        sourceFingerprint: "snippet-fingerprint",
        capturedAt: new Date("2026-07-18T14:00:00.000Z"),
        captureSnapshotJson: { kind: "quipsly-personal-source-capture-receipt-v1" },
      },
      {
        createdByUserId: actorUserId,
        clientRequestId: randomUUID(),
        captureType: "SNIPPET",
        snippetId,
        sourceFingerprint: "snippet-fingerprint",
        capturedAt: new Date("2026-07-19T14:00:00.000Z"),
        captureSnapshotJson: { kind: "quipsly-personal-source-capture-receipt-v1" },
      },
    ] });
  });

  afterAll(async () => {
    try {
      if (workspaceId) await prisma.studioWorkspace.deleteMany({ where: { id: workspaceId } });
      if (actorUserId || otherUserId) await prisma.user.deleteMany({ where: { id: { in: [actorUserId, otherUserId].filter(Boolean) } } });
      const [users, workspaces, filings, sources] = await Promise.all([
        prisma.user.count({ where: { primaryEmail: { in: [actorEmail, otherEmail] } } }),
        prisma.studioWorkspace.count({ where: { id: workspaceId } }),
        prisma.studioPersonalSourceFiling.count({ where: { project: { workspaceId } } }),
        prisma.studioSourceUnit.count({ where: { project: { workspaceId } } }),
      ]);
      expect({ users, workspaces, filings, sources }).toEqual({ users: 0, workspaces: 0, filings: 0, sources: 0 });
    } finally {
      await prisma.$disconnect();
    }
  });

  it("atomically creates one source and receipt, preserves the private capture, and reuses retries", async () => {
    const clientRequestId = randomUUID();
    const first = await filePersonalSourceIntoResearch({ prisma, actorUserId, actorEmail, projectId, captureId: snippetId, captureType: "SNIPPET", clientRequestId });
    const replay = await filePersonalSourceIntoResearch({ prisma, actorUserId, actorEmail, projectId, captureId: snippetId, captureType: "SNIPPET", clientRequestId });
    expect(first).toMatchObject({ ok: true, captureId: snippetId, captureType: "SNIPPET", projectId, reused: false });
    expect(replay).toMatchObject({ ok: true, sourceUnitId: first.ok ? first.sourceUnitId : "", filingId: first.ok ? first.filingId : "", reused: true });

    const [source, filing, snippet, sourceCount, filingCount] = await Promise.all([
      prisma.studioSourceUnit.findUnique({ where: { id: first.ok ? first.sourceUnitId : "" } }),
      prisma.studioPersonalSourceFiling.findUnique({ where: { id: first.ok ? first.filingId : "" } }),
      prisma.snippet.findUnique({ where: { id: snippetId } }),
      prisma.studioSourceUnit.count({ where: { projectId, slug: { contains: snippetId.toLowerCase() } } }),
      prisma.studioPersonalSourceFiling.count({ where: { projectId, snippetId } }),
    ]);
    expect(source).toMatchObject({
      projectId,
      kind: "captured-passage",
      title: "Coaching insight",
      sourceUrl: "https://example.com/coaching",
      immutableText: "Ask what changed before prescribing the next step.",
      capturedAt: new Date("2026-07-18T14:00:00.000Z"),
      metadataJson: expect.objectContaining({ privateCaptureMutated: false, filedFrom: "personal-inbox" }),
    });
    expect(filing?.captureSnapshotJson).toMatchObject({
      personalCaptureId: snippetId,
      capturedAt: "2026-07-18T14:00:00.000Z",
      captureCountAtFiling: 2,
      privateCaptureMutated: false,
      collaboratorsReceivePrivateCollectionAccess: false,
      externalSideEffects: false,
    });
    expect(JSON.stringify(filing?.captureSnapshotJson)).not.toContain("Private note must not become shared source text");
    expect(snippet).toMatchObject({ collectionId: null, note: "Private note must not become shared source text." });
    expect({ sourceCount, filingCount }).toEqual({ sourceCount: 1, filingCount: 1 });
    const inbox = await loadInbox(actorUserId, actorEmail, false);
    expect(inbox.counts.sources).toBe(1);
    expect(inbox.ready.filter((item) => item.kind === "SOURCE").map((item) => item.id)).toEqual([bookmarkId]);
  });

  it("files a URL as link evidence without claiming page import", async () => {
    const result = await filePersonalSourceIntoResearch({ prisma, actorUserId, actorEmail, projectId, captureId: bookmarkId, captureType: "BOOKMARK", clientRequestId: randomUUID() });
    expect(result).toMatchObject({ ok: true, captureType: "BOOKMARK", captureId: bookmarkId, reused: false });
    const source = await prisma.studioSourceUnit.findUnique({ where: { id: result.ok ? result.sourceUnitId : "" } });
    expect(source).toMatchObject({
      kind: "saved-web-link",
      sourceUrl: "https://example.com/leadership",
      immutableText: "https://example.com/leadership",
      metadataJson: expect.objectContaining({ pageContentImported: false }),
    });
  });

  it("rejects another actor's capture and a Viewer destination with zero new filings", async () => {
    const otherCapture = await prisma.bookmark.findFirstOrThrow({ where: { userId: otherUserId } });
    const before = await prisma.studioPersonalSourceFiling.count();
    const otherActorSource = await filePersonalSourceIntoResearch({ prisma, actorUserId, actorEmail, projectId, captureId: otherCapture.id, captureType: "BOOKMARK", clientRequestId: randomUUID() });
    const viewer = await filePersonalSourceIntoResearch({ prisma, actorUserId, actorEmail, projectId: viewerProjectId, captureId: bookmarkId, captureType: "BOOKMARK", clientRequestId: randomUUID() });
    expect(otherActorSource).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(viewer).toMatchObject({ ok: false, code: "FORBIDDEN" });
    await expect(prisma.studioPersonalSourceFiling.count()).resolves.toBe(before);
  });
});
