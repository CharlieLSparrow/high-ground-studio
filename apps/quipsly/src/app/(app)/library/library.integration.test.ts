/** @jest-environment node */

import { randomUUID } from "node:crypto";

import { getPrismaClient } from "@/lib/prisma";

jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySession: jest.fn() }));

import { loadLibrary } from "./page";

const runLocalDatabaseSmoke = process.env.QUIPSLY_LOCAL_DB_SMOKE === "1" ? describe : describe.skip;
if (process.env.QUIPSLY_LOCAL_DB_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) throw new Error("QUIPSLY_LOCAL_DATABASE_URL is required for the Library smoke.");
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

runLocalDatabaseSmoke("Library local database ownership and continuation smoke", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID().slice(0, 8);
  const actorEmail = `library-actor-${nonce}@example.test`;
  const otherEmail = `library-other-${nonce}@example.test`;
  let actorUserId = "";
  let otherUserId = "";
  let actorRoomId = "";
  let otherRoomId = "";
  let projectId = "";
  let workspaceId = "";
  let sourceId = "";
  let documentId = "";
  let promotedMediaId = "";
  let standaloneMediaId = "";
  let actorNoteId = "";
  let otherNoteId = "";

  beforeAll(async () => {
    const [actor, other] = await Promise.all([
      prisma.user.create({ data: { primaryEmail: actorEmail, name: "Library actor" } }),
      prisma.user.create({ data: { primaryEmail: otherEmail, name: "Library other" } }),
    ]);
    actorUserId = actor.id;
    otherUserId = other.id;

    const workspace = await prisma.studioWorkspace.create({ data: { slug: `library-${nonce}`, name: "Library smoke" } });
    workspaceId = workspace.id;
    const project = await prisma.studioProject.create({ data: { workspaceId, slug: `library-${nonce}`, name: "High Ground Library smoke" } });
    projectId = project.id;
    await prisma.studioProjectAccessGrant.create({ data: { projectId, email: actorEmail, role: "EDITOR", status: "ACTIVE", createdByUserId: actorUserId, createdByEmail: actorEmail } });

    const [promotedMedia, standaloneMedia] = await Promise.all([
      prisma.studioMediaAsset.create({ data: { filename: "promoted-session-source.wav", url: `gs://library-${nonce}/promoted.wav`, mimeType: "audio/wav", duration: 1800, projects: { connect: { id: projectId } } } }),
      prisma.studioMediaAsset.create({ data: { filename: "reusable-cold-open.mov", url: `gs://library-${nonce}/cold-open.mov`, mimeType: "video/quicktime", duration: 24, projects: { connect: { id: projectId } } } }),
    ]);
    promotedMediaId = promotedMedia.id;
    standaloneMediaId = standaloneMedia.id;

    const [actorRoom, otherRoom] = await Promise.all([
      prisma.callRoom.create({ data: { createdByUserId: actorUserId, projectId, title: "Episode 7 field recording", purpose: "PODCAST", status: "ENDED" } }),
      prisma.callRoom.create({ data: { createdByUserId: otherUserId, projectId, title: "Other person's private coaching", purpose: "COACHING", status: "ENDED" } }),
    ]);
    actorRoomId = actorRoom.id;
    otherRoomId = otherRoom.id;

    const tag = await prisma.studioTag.create({ data: { projectId, slug: `opening-${nonce}`, label: "Opening thought", category: "meaning", nodeType: "source_note" } });
    const [actorNote, otherNote] = await Promise.all([
      prisma.coachingNote.create({
        data: {
          roomId: actorRoomId,
          authorUserId: actorUserId,
          kind: "SESSION_NOTE",
          title: "Let the opening breathe",
          body: "Pause before the first edit point.",
          sourceJson: { schema: "quipsly-mobile-quick-entry-v1", surface: "ios-capture" },
        },
      }),
      prisma.coachingNote.create({ data: { roomId: otherRoomId, authorUserId: otherUserId, kind: "SESSION_NOTE", title: "Other private note", body: "Must remain private." } }),
    ]);
    actorNoteId = actorNote.id;
    otherNoteId = otherNote.id;
    await prisma.coachingNoteTagLink.create({ data: { noteId: actorNoteId, tagId: tag.id, createdByUserId: actorUserId } });

    const actorAsset = await prisma.recordingAsset.create({
      data: {
        roomId: actorRoomId,
        fileName: "episode-7-original.m4a",
        contentType: "audio/mp4",
        durationSeconds: 1800,
        status: "VERIFIED",
        localManifestJson: { promotion: { mediaAssetId: promotedMediaId } },
      },
    });
    const transcript = await prisma.transcriptJob.create({ data: { roomId: actorRoomId, assetId: actorAsset.id, provider: "local-smoke", status: "COMPLETED" } });
    await prisma.transcriptSegment.createMany({ data: [
      { transcriptJobId: transcript.id, speakerLabel: "Charlie", startSeconds: 0, endSeconds: 6, text: "Welcome to the High Ground Odyssey." },
      { transcriptJobId: transcript.id, speakerLabel: "Homer", startSeconds: 6, endSeconds: 13, text: "Today we are testing the whole capture path." },
    ] });
    await prisma.recordingAsset.create({ data: { roomId: otherRoomId, fileName: "other-private.m4a", status: "VERIFIED" } });

    const source = await prisma.studioSourceUnit.create({ data: { projectId, slug: `source-${nonce}`, kind: "article", title: "Odyssey episode evidence", immutableText: "A preserved source should remain intact.", author: "Charlie" } });
    sourceId = source.id;
    await prisma.studioSourceAnnotation.createMany({ data: [
      { projectId, sourceUnitId: source.id, createdByUserId: actorUserId, kind: "note", visibility: "private", body: "Use this as the opening question.", selectorKind: "text-quote", exactText: "preserved source" },
      { projectId, sourceUnitId: source.id, createdByUserId: otherUserId, kind: "note", visibility: "private", body: "Other person's private interpretation.", selectorKind: "text-quote", exactText: "remain intact" },
      { projectId, sourceUnitId: source.id, createdByUserId: otherUserId, kind: "insight", visibility: "project", body: "Shared production context.", selectorKind: "text-quote", exactText: "source" },
    ] });

    const document = await prisma.studioDocument.create({ data: { projectId, stableId: `document-${nonce}`, title: "Episode 7 manuscript" } });
    documentId = document.id;
    await prisma.studioDocumentBlock.create({ data: { documentId, stableId: `block-${nonce}`, order: 1, body: "A real manuscript block for proof." } });
    await prisma.studioEpisodeProduction.create({ data: { projectId, documentId, slug: `episode-7-${nonce}`, title: "Episode 7", boundaryLabel: "Episode 7" } });

    const collection = await prisma.collection.create({ data: { userId: actorUserId, slug: `saved-${nonce}`, name: "Actor saved material" } });
    await Promise.all([
      prisma.snippet.create({ data: { userId: actorUserId, collectionId: collection.id, highlightedText: "Actor-owned saved line" } }),
      prisma.bookmark.create({ data: { userId: otherUserId, url: `https://example.test/private-${nonce}`, title: "Other private bookmark" } }),
    ]);
  });

  afterAll(async () => {
    try {
      if (actorRoomId || otherRoomId) await prisma.callRoom.deleteMany({ where: { id: { in: [actorRoomId, otherRoomId].filter(Boolean) } } });
      if (projectId) await prisma.studioProject.deleteMany({ where: { id: projectId } });
      if (promotedMediaId || standaloneMediaId) await prisma.studioMediaAsset.deleteMany({ where: { id: { in: [promotedMediaId, standaloneMediaId].filter(Boolean) } } });
      if (workspaceId) await prisma.studioWorkspace.deleteMany({ where: { id: workspaceId } });
      if (actorUserId || otherUserId) await prisma.user.deleteMany({ where: { id: { in: [actorUserId, otherUserId].filter(Boolean) } } });

      const residue = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*)::bigint AS count
        FROM "User"
        WHERE "primaryEmail" IN (${actorEmail}, ${otherEmail})
      `;
      expect(Number(residue[0]?.count ?? 0)).toBe(0);
    } finally {
      await prisma.$disconnect();
    }
  });

  it("indexes canonical actor-visible work with exact continuation and no promoted-media duplicate", async () => {
    const library = await loadLibrary(actorUserId, actorEmail, false);
    const serialized = JSON.stringify(library);

    expect(library.entries.find((entry) => entry.id === `session:${actorRoomId}`)).toMatchObject({
      href: `/sessions/${actorRoomId}`,
      title: "Episode 7 field recording",
      badges: expect.arrayContaining(["2 segments"]),
    });
    expect(library.entries.find((entry) => entry.id === `source:${sourceId}`)).toMatchObject({
      href: `/research?source=${sourceId}`,
      detail: "2 anchored annotations; preserved source text remains unchanged.",
    });
    expect(library.entries.find((entry) => entry.id === `note:${actorNoteId}`)).toMatchObject({
      kind: "NOTE",
      href: `/sessions/${actorRoomId}#quick-entry-${actorNoteId}`,
      projectName: "High Ground Library smoke",
      stateLabel: "iPhone capture",
      badges: expect.arrayContaining(["#Opening thought", "Offline retry safe"]),
    });
    expect(library.entries.find((entry) => entry.id === `document:${documentId}`)?.href).toContain(`/read?projectSlug=library-${nonce}&episodeSlug=episode-7-${nonce}`);
    expect(library.entries.find((entry) => entry.id === `media:${standaloneMediaId}`)).toMatchObject({ title: "reusable-cold-open.mov" });
    expect(library.entries.some((entry) => entry.id === `media:${promotedMediaId}`)).toBe(false);
    expect(library.counts).toMatchObject({ sessions: 1, notes: 1, sources: 1, documents: 1, media: 1, saved: 1 });
    expect(library.boundaries).toEqual({
      permissionFilteredBeforeProjection: true,
      immutableSourcesPreserved: true,
      promotedCaptureMediaDeduplicated: true,
      localPhoneRecordingsRemainDeviceOwned: true,
      externalSideEffects: false,
    });
    expect(serialized).not.toContain("Other person's private coaching");
    expect(serialized).not.toContain("Other person's private interpretation");
    expect(serialized).not.toContain("Other private bookmark");
    expect(serialized).not.toContain("Other private note");
  });

  it("leaves the other owner's records stored while keeping them out of the actor projection", async () => {
    await expect(prisma.callRoom.findUnique({ where: { id: otherRoomId }, select: { title: true } })).resolves.toEqual({ title: "Other person's private coaching" });
    await expect(prisma.studioSourceAnnotation.count({ where: { sourceUnitId: sourceId, createdByUserId: otherUserId } })).resolves.toBe(2);
    await expect(prisma.bookmark.count({ where: { userId: otherUserId } })).resolves.toBe(1);
    await expect(prisma.coachingNote.count({ where: { id: otherNoteId, authorUserId: otherUserId } })).resolves.toBe(1);
  });
});
