/** @jest-environment node */

jest.mock("server-only", () => ({}));

import { randomUUID } from "node:crypto";

import { getPrismaClient } from "@/lib/prisma";
import {
  repairSessionEpisodeBinding,
  SessionEpisodeBindingRepairError,
} from "@/lib/server/session-episode-binding-repair";
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
  const repairRoomId = `episode-session-repair-${nonce}`;
  const rebindRoomId = `episode-session-rebind-${nonce}`;
  const staleRoomId = `episode-session-stale-${nonce}`;
  const repairRequestId = randomUUID();
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
        where: { id: { in: [exactRoomId, legacyRoomId, conflictingRoomId, repairRoomId, rebindRoomId, staleRoomId] } },
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

  it("repairs an unbound podcast Session without changing its retained source and replays exactly once", async () => {
    const room = await prisma.callRoom.create({
      data: {
        id: repairRoomId,
        createdByUserId: ownerId,
        projectId: projectAId,
        purpose: "PODCAST",
        title: "Unbound retained recording Session",
        metadataJson: { episodeSlug: "unmatched-legacy-episode" },
        recordingAssets: {
          create: {
            id: `episode-session-repair-asset-${nonce}`,
            status: "VERIFIED",
            fileName: "retained-source.m4a",
            checksum: "a".repeat(64),
          },
        },
      },
    });
    const input = {
      prisma,
      actor: { id: ownerId, primaryEmail: ownerEmail, isStaff: false },
      roomId: repairRoomId,
      episodeSlug: episodeASlug,
      requestId: repairRequestId,
      expectedRoomUpdatedAt: room.updatedAt.toISOString(),
    };
    const first = await repairSessionEpisodeBinding(input);
    const replay = await repairSessionEpisodeBinding(input);
    expect(first).toMatchObject({
      idempotentReplay: false,
      receipt: {
        action: "BIND",
        previousEpisodeProductionId: null,
        nextEpisodeProductionId: episodeAId,
        nextEpisodeSlug: episodeASlug,
      },
      boundaries: {
        canonicalSessionRelationshipChanged: true,
        immutableSourcesChanged: false,
        recordingChanged: false,
        externalSideEffects: false,
      },
    });
    expect(replay).toMatchObject({
      idempotentReplay: true,
      receipt: { id: first.receipt.id },
    });
    const readback = await prisma.callRoom.findUnique({
      where: { id: repairRoomId },
      include: {
        episodeProduction: { select: { id: true, projectId: true, slug: true } },
        recordingAssets: { select: { id: true, status: true, checksum: true } },
        episodeBindingReceipts: true,
      },
    });
    expect(readback?.episodeProduction).toEqual({
      id: episodeAId,
      projectId: projectAId,
      slug: episodeASlug,
    });
    expect(readback?.recordingAssets).toEqual([{
      id: `episode-session-repair-asset-${nonce}`,
      status: "VERIFIED",
      checksum: "a".repeat(64),
    }]);
    expect(readback?.episodeBindingReceipts).toHaveLength(1);

    await expect(repairSessionEpisodeBinding({
      ...input,
      episodeSlug: episodeBSlug,
    })).rejects.toMatchObject({ code: "REQUEST_ID_CONFLICT" });
  });

  it("rejects unauthorized and stale repairs, then requires an explained explicit rebind", async () => {
    const staleRoom = await prisma.callRoom.create({
      data: {
        id: staleRoomId,
        createdByUserId: ownerId,
        projectId: projectAId,
        purpose: "PODCAST",
        title: "Stale relationship Session",
      },
    });
    await expect(repairSessionEpisodeBinding({
      prisma,
      actor: { id: "outsider", primaryEmail: "outsider@example.test", isStaff: false },
      roomId: staleRoomId,
      episodeSlug: episodeASlug,
      requestId: randomUUID(),
      expectedRoomUpdatedAt: staleRoom.updatedAt.toISOString(),
    })).rejects.toMatchObject({ code: "SESSION_NOT_FOUND", status: 404 });

    await prisma.callRoom.update({
      where: { id: staleRoomId },
      data: { title: "Changed after repair choices loaded" },
    });
    await expect(repairSessionEpisodeBinding({
      prisma,
      actor: { id: ownerId, primaryEmail: ownerEmail, isStaff: false },
      roomId: staleRoomId,
      episodeSlug: episodeASlug,
      requestId: randomUUID(),
      expectedRoomUpdatedAt: staleRoom.updatedAt.toISOString(),
    })).rejects.toMatchObject({ code: "STALE_SESSION_VERSION" });

    const rebindRoom = await prisma.callRoom.create({
      data: {
        id: rebindRoomId,
        createdByUserId: ownerId,
        projectId: projectAId,
        episodeProductionId: episodeBId,
        purpose: "PODCAST",
        title: "Invalid imported relationship",
        metadataJson: { episodeSlug: episodeBSlug },
      },
    });
    const rebindInput = {
      prisma,
      actor: { id: ownerId, primaryEmail: ownerEmail, isStaff: false },
      roomId: rebindRoomId,
      episodeSlug: episodeASlug,
      requestId: randomUUID(),
      expectedRoomUpdatedAt: rebindRoom.updatedAt.toISOString(),
    };
    await expect(repairSessionEpisodeBinding(rebindInput)).rejects.toBeInstanceOf(
      SessionEpisodeBindingRepairError,
    );
    await expect(repairSessionEpisodeBinding({
      ...rebindInput,
      requestId: randomUUID(),
      confirmRebind: true,
      reason: "Imported relation crossed the Nest boundary",
    })).resolves.toMatchObject({
      receipt: {
        action: "REBIND",
        previousEpisodeProductionId: episodeBId,
        nextEpisodeProductionId: episodeAId,
      },
    });
  });
});
