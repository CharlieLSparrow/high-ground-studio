/** @jest-environment node */

jest.mock("server-only", () => ({}));
jest.mock("@/lib/server/studio-project-access", () => ({
  normalizeAccessEmail: (value: unknown) => typeof value === "string" ? value.trim().toLowerCase() : "",
}));

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { createEpisodeRoomFromManuscript } from "./episode-room-creation";

const runDatabaseOperation = process.env.QUIPSLY_EPISODE_ROOM_CREATE_DB_OPERATION === "1";
const describeDatabase = runDatabaseOperation ? describe : describe.skip;

describeDatabase("Episode Room source import isolated PostgreSQL operation", () => {
  let prisma: PrismaClient;
  const actor = { id: "episode-room-import-owner", email: "owner@example.test" };

  beforeAll(async () => {
    const connectionString = process.env.QUIPSLY_EPISODE_ROOM_CREATE_DATABASE_URL || "";
    const parsed = new URL(connectionString);
    if (
      !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname)
      || !parsed.pathname.startsWith("/quipsly_episode_room_acceptance_")
    ) {
      throw new Error("Episode Room operation requires an isolated loopback quipsly_episode_room_acceptance_* database.");
    }
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 2 }) });
    await prisma.$connect();
    await prisma.user.create({
      data: { id: actor.id, primaryEmail: actor.email, name: "Episode Owner", emailVerified: new Date("2026-08-02T12:00:00.000Z") },
    });
    await prisma.studioWorkspace.createMany({
      data: [
        { id: "episode-room-target-workspace", slug: "episode-room-target-workspace", name: "Target" },
        { id: "episode-room-source-workspace", slug: "episode-room-source-workspace", name: "Source" },
      ],
    });
    await prisma.studioProject.createMany({
      data: [
        { id: "episode-room-target-project", workspaceId: "episode-room-target-workspace", slug: "high-ground-odyssey", name: "High Ground Odyssey" },
        { id: "episode-room-source-project", workspaceId: "episode-room-source-workspace", slug: "high-ground-odyssey-manuscript", name: "HGO Manuscript" },
      ],
    });
    await prisma.studioDocument.create({
      data: {
        id: "episode-room-source-document",
        projectId: "episode-room-source-project",
        stableId: "podcast-episode-8-source",
        title: "Podcast Ep 8: May 13 - I wasn't born a leader",
        sourceLabel: "document-kind:draft;hgo-draft-kind:podcast-episode;hgo-podcast-ep:8",
        blocks: {
          create: [
            { id: "episode-room-source-block-1", stableId: "episode-8-block-1", order: 0, title: "The Swear Jar", body: "One of the first things people noticed about me at basic training was the way I talked." },
            { id: "episode-room-source-block-2", stableId: "episode-8-block-2", order: 1, title: "Shared watch", body: "Ted Lasso — Be curious, not judgmental." },
          ],
        },
      },
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("copies one immutable source snapshot, preserves anchors, and replays without duplication", async () => {
    const input = {
      prisma,
      targetProjectId: "episode-room-target-project",
      targetProjectSlug: "high-ground-odyssey",
      sourceProjectId: "episode-room-source-project",
      sourceProjectSlug: "high-ground-odyssey-manuscript",
      sourceDocumentId: "episode-room-source-document",
      episodeSlug: "episode-8-i-wasnt-born-a-leader",
      title: "Episode 8: I wasn't born a leader",
      actor,
      clientRequestId: "create-episode-8-room",
    };

    const created = await createEpisodeRoomFromManuscript(input);
    const replay = await createEpisodeRoomFromManuscript(input);

    expect(created.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.episode.id).toBe(created.episode.id);
    expect(created.episode.sourceImport).toEqual(expect.objectContaining({
      sourceProjectSlug: "high-ground-odyssey-manuscript",
      sourceDocumentId: "episode-room-source-document",
      sourceBlockCount: 2,
    }));

    const [source, destination, productions, operations] = await Promise.all([
      prisma.studioDocument.findUnique({ where: { id: "episode-room-source-document" }, include: { blocks: { orderBy: { order: "asc" } } } }),
      prisma.studioDocument.findUnique({ where: { id: created.episode.documentId }, include: { blocks: { orderBy: { order: "asc" } } } }),
      prisma.studioEpisodeProduction.findMany({ where: { projectId: "episode-room-target-project" } }),
      prisma.studioDocumentOperation.findMany({ where: { operationType: "episode-room-source-import" } }),
    ]);
    expect(source?.blocks.map((block) => block.body)).toEqual([
      "One of the first things people noticed about me at basic training was the way I talked.",
      "Ted Lasso — Be curious, not judgmental.",
    ]);
    expect(destination?.blocks).toHaveLength(2);
    expect(destination?.blocks.map((block) => block.externalId)).toEqual([
      "studio-source-block:episode-room-source-block-1",
      "studio-source-block:episode-room-source-block-2",
    ]);
    expect(productions).toHaveLength(1);
    expect(operations).toHaveLength(1);
    expect(operations[0]?.payloadJson).toEqual(expect.objectContaining({
      sourceMutated: false,
      externalSideEffects: false,
      providerCalendarMutated: false,
      recordingStarted: false,
      publicationCreated: false,
    }));

    await expect(createEpisodeRoomFromManuscript({
      ...input,
      title: "Changed intent must not win",
    })).rejects.toMatchObject({ code: "request-conflict", status: 409 });
    expect(await prisma.studioEpisodeProduction.count()).toBe(1);
    expect(await prisma.studioDocumentOperation.count({ where: { operationType: "episode-room-source-import" } })).toBe(1);
  });
});
