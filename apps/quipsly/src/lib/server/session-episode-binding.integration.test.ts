/** @jest-environment node */

jest.mock("server-only", () => ({}));

import { randomUUID } from "node:crypto";

import { getPrismaClient } from "@/lib/prisma";
import {
  SessionEpisodeBindingError,
  callRoomEpisodeBindingWhere,
  resolveSessionEpisodeBinding,
} from "@/lib/server/session-episode-binding";

const runLocalDatabaseSmoke = process.env.QUIPSLY_LOCAL_DB_SMOKE === "1" ? describe : describe.skip;
if (process.env.QUIPSLY_LOCAL_DB_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) {
    throw new Error("QUIPSLY_LOCAL_DATABASE_URL is required for the Session episode binding smoke.");
  }
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

runLocalDatabaseSmoke("first-class recording Session episode binding", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID().slice(0, 8);
  const ownerId = `episode-session-owner-${nonce}`;
  const ownerEmail = `episode-session-owner-${nonce}@example.test`;
  const workspaceId = `episode-session-workspace-${nonce}`;
  const projectAId = `episode-session-project-a-${nonce}`;
  const projectBId = `episode-session-project-b-${nonce}`;
  const episodeASlug = `episode-a-${nonce}`;
  const episodeBSlug = `episode-b-${nonce}`;
  const exactRoomId = `episode-session-exact-${nonce}`;
  const legacyRoomId = `episode-session-legacy-${nonce}`;
  const conflictingRoomId = `episode-session-conflict-${nonce}`;
  let episodeAId = "";
  let episodeBId = "";

  beforeAll(async () => {
    await prisma.user.create({
      data: { id: ownerId, primaryEmail: ownerEmail, name: "Episode Session owner" },
    });
    await prisma.studioWorkspace.create({
      data: { id: workspaceId, slug: workspaceId, name: "Episode Session binding smoke" },
    });
    await prisma.studioProject.createMany({
      data: [
        { id: projectAId, workspaceId, slug: `episode-session-a-${nonce}`, name: "Project A" },
        { id: projectBId, workspaceId, slug: `episode-session-b-${nonce}`, name: "Project B" },
      ],
    });
    await prisma.studioDocument.createMany({
      data: [
        {
          id: `episode-session-document-a-${nonce}`,
          projectId: projectAId,
          stableId: `episode-session-document-a-${nonce}`,
          title: "Episode A manuscript",
        },
        {
          id: `episode-session-document-b-${nonce}`,
          projectId: projectBId,
          stableId: `episode-session-document-b-${nonce}`,
          title: "Episode B manuscript",
        },
      ],
    });
    const [episodeA, episodeB] = await Promise.all([
      prisma.studioEpisodeProduction.create({
        data: {
          projectId: projectAId,
          documentId: `episode-session-document-a-${nonce}`,
          slug: episodeASlug,
          title: "Episode A",
          boundaryLabel: "Episode A",
        },
      }),
      prisma.studioEpisodeProduction.create({
        data: {
          projectId: projectBId,
          documentId: `episode-session-document-b-${nonce}`,
          slug: episodeBSlug,
          title: "Episode B",
          boundaryLabel: "Episode B",
        },
      }),
    ]);
    episodeAId = episodeA.id;
    episodeBId = episodeB.id;
  });

  afterAll(async () => {
    try {
      await prisma.callRoom.deleteMany({
        where: { id: { in: [exactRoomId, legacyRoomId, conflictingRoomId] } },
      });
      await prisma.studioWorkspace.deleteMany({ where: { id: workspaceId } });
      await prisma.user.deleteMany({ where: { id: ownerId } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it("persists the exact same-project relation and reads it back through the Episode Room", async () => {
    const binding = await resolveSessionEpisodeBinding({
      prisma,
      projectId: projectAId,
      purpose: "PODCAST",
      episodeSlug: episodeASlug,
    });
    expect(binding).toMatchObject({
      episodeProductionId: episodeAId,
      episodeSlug: episodeASlug,
    });

    await prisma.callRoom.create({
      data: {
        id: exactRoomId,
        createdByUserId: ownerId,
        projectId: projectAId,
        episodeProductionId: binding.episodeProductionId,
        purpose: "PODCAST",
        title: "Exact first-class Session",
        metadataJson: { episodeSlug: binding.episodeSlug },
      },
    });

    const readback = await prisma.callRoom.findUnique({
      where: { id: exactRoomId },
      include: { episodeProduction: { select: { id: true, projectId: true, slug: true } } },
    });
    expect(readback?.episodeProduction).toEqual({
      id: episodeAId,
      projectId: projectAId,
      slug: episodeASlug,
    });
  });

  it("keeps compatibility for unbackfilled rooms but never lets metadata override a conflicting relation", async () => {
    await prisma.callRoom.createMany({
      data: [
        {
          id: legacyRoomId,
          createdByUserId: ownerId,
          projectId: projectAId,
          purpose: "PODCAST",
          title: "Unbackfilled compatibility Session",
          metadataJson: { episodeSlug: episodeASlug },
        },
        {
          id: conflictingRoomId,
          createdByUserId: ownerId,
          projectId: projectAId,
          episodeProductionId: episodeBId,
          purpose: "PODCAST",
          title: "Adversarial cross-project relation",
          metadataJson: { episodeSlug: episodeASlug },
        },
      ],
    });

    const sessions = await prisma.callRoom.findMany({
      where: {
        projectId: projectAId,
        purpose: "PODCAST",
        AND: [callRoomEpisodeBindingWhere({
          episodeProductionId: episodeAId,
          episodeSlug: episodeASlug,
        })],
      },
      select: { id: true },
    });
    expect(sessions.map((session) => session.id)).toEqual(expect.arrayContaining([
      exactRoomId,
      legacyRoomId,
    ]));
    expect(sessions.map((session) => session.id)).not.toContain(conflictingRoomId);
  });

  it("rejects cross-project and non-podcast binding attempts before a room is written", async () => {
    await expect(resolveSessionEpisodeBinding({
      prisma,
      projectId: projectAId,
      purpose: "PODCAST",
      episodeSlug: episodeBSlug,
    })).rejects.toBeInstanceOf(SessionEpisodeBindingError);

    await expect(resolveSessionEpisodeBinding({
      prisma,
      projectId: projectAId,
      purpose: "COACHING",
      episodeSlug: episodeASlug,
    })).rejects.toMatchObject({ status: 400 });
  });
});
