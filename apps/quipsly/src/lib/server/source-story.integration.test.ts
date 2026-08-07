/** @jest-environment node */

import { randomUUID } from "node:crypto";

import { getPrismaClient } from "@/lib/prisma";

import {
  SourceStoryConflictError,
  createMediaSourceSet,
  createSourceStoryCard,
  createStoryBoard,
  readSourceStoryWorkspace,
  rebindSourceStoryCard,
  reorderStoryBoard,
  updateSourceStoryCard,
} from "./source-story";

jest.mock("@/auth", () => ({ auth: jest.fn() }));

const runLocalDatabaseSmoke = process.env.QUIPSLY_SOURCE_STORY_DB_SMOKE === "1" ? describe : describe.skip;
if (process.env.QUIPSLY_SOURCE_STORY_DB_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) {
    throw new Error("QUIPSLY_LOCAL_DATABASE_URL is required for the source-story smoke.");
  }
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

runLocalDatabaseSmoke("source-backed story workspace local database smoke", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID().slice(0, 8);
  const actorEmail = `source-story-${nonce}@example.test`;
  let actorUserId = "";
  let workspaceId = "";
  let projectId = "";
  let otherProjectId = "";
  let firstAssetId = "";
  let secondAssetId = "";
  let otherAssetId = "";
  let tagId = "";
  let otherTagId = "";
  let boardId = "";
  let firstCardId = "";
  let secondCardId = "";
  let firstRangeId = "";

  beforeAll(async () => {
    const actor = await prisma.user.create({
      data: { primaryEmail: actorEmail, name: "Source story operator" },
    });
    actorUserId = actor.id;
    const workspace = await prisma.studioWorkspace.create({
      data: { slug: `source-story-${nonce}`, name: "Source story smoke" },
    });
    workspaceId = workspace.id;
    const [project, otherProject] = await Promise.all([
      prisma.studioProject.create({
        data: { workspaceId, slug: `source-story-main-${nonce}`, name: "High Ground Odyssey" },
      }),
      prisma.studioProject.create({
        data: { workspaceId, slug: `source-story-other-${nonce}`, name: "Other private Nest" },
      }),
    ]);
    projectId = project.id;
    otherProjectId = otherProject.id;
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
    const [tag, otherTag] = await Promise.all([
      prisma.studioTag.create({ data: { projectId, slug: `episode-nine-${nonce}`, label: "Episode 9" } }),
      prisma.studioTag.create({ data: { projectId: otherProjectId, slug: `private-${nonce}`, label: "Private source" } }),
    ]);
    tagId = tag.id;
    otherTagId = otherTag.id;
    const [firstAsset, secondAsset, otherAsset] = await Promise.all([
      prisma.studioMediaAsset.create({
        data: {
          filename: "insta360-walkthrough.insv",
          url: `/source-story/${nonce}/insta360-walkthrough.insv`,
          mimeType: "video/mp4",
          sizeBytes: BigInt(4_200_000_000),
          duration: 120,
          resolution: "5760x2880",
          fps: 29.97,
          projects: { connect: { id: projectId } },
          variants: {
            create: {
              kind: "browse-proxy",
              url: `/source-story/${nonce}/insta360-walkthrough-proxy.mp4`,
              mimeType: "video/mp4",
              metadataJson: {
                source: {
                  provider: "local-fixture",
                  checksumStatus: "not-yet-verified",
                },
              },
            },
          },
        },
      }),
      prisma.studioMediaAsset.create({
        data: {
          filename: "homer-reaction.mov",
          url: `/source-story/${nonce}/homer-reaction.mov`,
          mimeType: "video/quicktime",
          sizeBytes: BigInt(1_100_000_000),
          duration: 75,
          resolution: "3840x2160",
          fps: 24,
          projects: { connect: { id: projectId } },
        },
      }),
      prisma.studioMediaAsset.create({
        data: {
          filename: "other-nest-private.mov",
          url: `/source-story/${nonce}/other-nest-private.mov`,
          mimeType: "video/quicktime",
          duration: 30,
          projects: { connect: { id: otherProjectId } },
        },
      }),
    ]);
    firstAssetId = firstAsset.id;
    secondAssetId = secondAsset.id;
    otherAssetId = otherAsset.id;
    await prisma.studioAssetAttachment.create({
      data: {
        projectId,
        assetId: secondAssetId,
        role: "proxy-video",
        source: "source-story-smoke",
        metadataJson: {
          schema: "quipsly-test-proxy-registration-v1",
          playbackUrl: `/source-story/${nonce}/homer-reaction.mov`,
          output: {
            sha256: "a".repeat(64),
            sizeBytes: 1_100_000_000,
            contentType: "video/quicktime",
          },
          source: {
            sha256: "b".repeat(64),
            sizeBytes: 9_900_000_000,
            contentType: "video/quicktime",
          },
        },
      },
    });
  });

  afterAll(async () => {
    try {
      // Source-set membership deliberately restricts deleting an exact source
      // revision in isolation. Remove the package aggregate before deleting
      // the disposable Nest so the test exercises the production lifecycle.
      if (projectId) await prisma.studioMediaSourceSet.deleteMany({ where: { projectId } });
      if (workspaceId) await prisma.studioWorkspace.deleteMany({ where: { id: workspaceId } });
      await prisma.studioMediaAsset.deleteMany({
        where: { id: { in: [firstAssetId, secondAssetId, otherAssetId].filter(Boolean) } },
      });
      if (actorUserId) await prisma.user.deleteMany({ where: { id: actorUserId } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it("creates one idempotent board and rejects request or slug identity reuse", async () => {
    const clientRequestId = randomUUID();
    const input = {
      prisma,
      projectId,
      actorUserId,
      clientRequestId,
      slug: `episode-nine-build-${nonce}`,
      title: "Episode 9 source build",
      description: "Choose exact source ranges before they enter the timeline.",
      kind: "episode-story",
    };
    const created = await createStoryBoard(input);
    boardId = created.board.id;
    expect(created).toMatchObject({ replayed: false, board: { revision: 1, clientRequestId } });
    await expect(createStoryBoard(input)).resolves.toMatchObject({ replayed: true, board: { id: boardId } });
    await expect(createStoryBoard({ ...input, title: "A different board" })).rejects.toMatchObject({
      code: "request-reuse-conflict",
      currentRevision: 1,
    } satisfies Partial<SourceStoryConflictError>);
    await expect(createStoryBoard({
      ...input,
      clientRequestId: randomUUID(),
      title: "A conflicting canonical address",
    })).rejects.toMatchObject({ code: "board-slug-conflict", currentRevision: 1 });
    await expect(prisma.studioStoryBoard.count({ where: { projectId } })).resolves.toBe(1);
    await expect(prisma.studioStoryBoardOperation.count({ where: { boardId } })).resolves.toBe(1);
  });

  it("retains a complete multi-file camera package as one immutable source set", async () => {
    const [originalRevision, browseRevision] = await Promise.all([
      prisma.studioMediaSourceRevision.create({
        data: {
          projectId,
          mediaAssetId: firstAssetId,
          revisionKey: `insv:${nonce}`,
          identitySha256: "c".repeat(63) + "1",
          contentSha256: "d".repeat(64),
          sizeBytes: BigInt(4_200_000_000),
          durationSeconds: 120,
          widthPixels: 3840,
          heightPixels: 3840,
          framesPerSecond: 29.97,
          mediaProjection: "dual-fisheye",
          sourceState: "checksum-bound",
          createdByUserId: actorUserId,
        },
      }),
      prisma.studioMediaSourceRevision.create({
        data: {
          projectId,
          mediaAssetId: secondAssetId,
          revisionKey: `lrv:${nonce}`,
          identitySha256: "c".repeat(63) + "2",
          contentSha256: "e".repeat(64),
          sizeBytes: BigInt(110_000_000),
          durationSeconds: 120,
          widthPixels: 1920,
          heightPixels: 960,
          framesPerSecond: 29.97,
          mediaProjection: "equirectangular",
          sourceState: "checksum-bound",
          createdByUserId: actorUserId,
        },
      }),
    ]);
    const value = {
      projectId,
      clientRequestId: randomUUID(),
      kind: "insta360-360" as const,
      captureKey: `VID_${nonce}`,
      displayName: "Homer walk-through package",
      sourceClockRevisionId: browseRevision.id,
      members: [
        { sourceRevisionId: originalRevision.id, role: "primary-original" as const, requiredForRender: true },
        { sourceRevisionId: browseRevision.id, role: "browse-proxy" as const, requiredForRender: false },
      ],
      metadata: { cameraFamily: "Insta360" },
    };
    const created = await createMediaSourceSet({ prisma, actorUserId, value });
    expect(created).toMatchObject({ replayed: false, sourceSet: { completeness: "complete", sourceClockRevisionId: browseRevision.id } });
    await expect(createMediaSourceSet({ prisma, actorUserId, value })).resolves.toMatchObject({
      replayed: true,
      sourceSet: { id: created.sourceSet.id },
    });
    const workspace = await readSourceStoryWorkspace(prisma, projectId);
    expect(workspace.sourceSets).toContainEqual(expect.objectContaining({
      id: created.sourceSet.id,
      displayName: "Homer walk-through package",
      sourceClockRevision: expect.objectContaining({ id: browseRevision.id, widthPixels: 1920, heightPixels: 960 }),
      members: expect.arrayContaining([
        expect.objectContaining({ role: "primary-original", requiredForRender: true }),
        expect.objectContaining({ role: "browse-proxy", requiredForRender: false }),
      ]),
    }));
  });

  it("persists one exact 360 range, source identity, tags, placement, and replay receipt", async () => {
    const clientRequestId = randomUUID();
    const value = {
      projectId,
      mediaAssetId: firstAssetId,
      boardId,
      expectedBoardRevision: 1,
      clientRequestId,
      title: "Homer enters the room",
      synopsis: "A clean opening beat from the Insta360 walkthrough.",
      notes: "Start after the door closes; preserve the natural laugh.",
      purpose: "opening" as const,
      startSeconds: 12.125,
      endSeconds: 21.875,
      groupKey: "cold-open",
      laneKey: "story",
      tagIds: [tagId],
      reframeRecipe: {
        schema: "quipsly-360-reframe-v1" as const,
        projection: "equirectangular" as const,
        aspectRatio: "16:9" as const,
        stabilization: "flowstate" as const,
        horizonLock: true,
        keyframes: [
          { sourceSeconds: 12.125, panDegrees: 14, tiltDegrees: 0, rollDegrees: 0, fieldOfViewDegrees: 92, interpolation: "ease" as const },
          { sourceSeconds: 21.875, panDegrees: 30, tiltDegrees: -3, rollDegrees: 0, fieldOfViewDegrees: 78, interpolation: "ease" as const },
        ],
      },
    };
    const created = await createSourceStoryCard({ prisma, actorUserId, actorEmail, value });
    firstCardId = created.card.id;
    firstRangeId = created.card.sourceRangeId!;
    expect(created).toMatchObject({ replayed: false, boardRevision: 2 });
    const replayed = await createSourceStoryCard({ prisma, actorUserId, actorEmail, value });
    expect(replayed).toMatchObject({ replayed: true, boardRevision: 2, card: { id: firstCardId } });
    await expect(createSourceStoryCard({
      prisma,
      actorUserId,
      actorEmail,
      value: { ...value, title: "A different card under the same request identity" },
    })).rejects.toMatchObject({ code: "request-reuse-conflict", currentRevision: 1 });

    const workspace = await readSourceStoryWorkspace(prisma, projectId);
    expect(workspace.boards[0]).toMatchObject({ id: boardId, revision: 2 });
    expect(workspace.boards[0]?.placements[0]).toMatchObject({
      cardId: firstCardId,
      groupKey: "cold-open",
      sortOrder: 0,
      card: {
        title: "Homer enters the room",
        tags: [{ id: tagId, label: "Episode 9" }],
        sourceRange: {
          startSeconds: 12.125,
          endSeconds: 21.875,
          reframeRecipe: { schema: "quipsly-360-reframe-v1", horizonLock: true },
          sourceRevision: {
            sourceState: "identity-unverified",
            contentSha256: null,
            mediaAsset: { id: firstAssetId, filename: "insta360-walkthrough.insv" },
          },
        },
      },
    });
    await expect(prisma.studioStoryCard.count({ where: { projectId } })).resolves.toBe(1);
    await expect(prisma.studioSourceRange.count({ where: { projectId } })).resolves.toBe(1);
    await expect(prisma.studioMediaSourceRevision.count({ where: { projectId } })).resolves.toBe(3);
  });

  it("rolls back cross-Nest source and tag attempts without leaving partial rows", async () => {
    const cardCount = await prisma.studioStoryCard.count({ where: { projectId } });
    await expect(createSourceStoryCard({
      prisma,
      actorUserId,
      actorEmail,
      value: {
        projectId,
        mediaAssetId: otherAssetId,
        clientRequestId: randomUUID(),
        title: "Private source leak",
        startSeconds: 0,
        endSeconds: 2,
      },
    })).rejects.toMatchObject({ code: "asset-project-mismatch" });
    await expect(createSourceStoryCard({
      prisma,
      actorUserId,
      actorEmail,
      value: {
        projectId,
        mediaAssetId: secondAssetId,
        clientRequestId: randomUUID(),
        title: "Cross-Nest tag leak",
        startSeconds: 0,
        endSeconds: 2,
        tagIds: [otherTagId],
      },
    })).rejects.toMatchObject({ code: "invalid-tag-scope" });
    await expect(prisma.studioStoryCard.count({ where: { projectId } })).resolves.toBe(cardCount);
    await expect(prisma.studioMediaSourceRevision.count({ where: { projectId, mediaAssetId: secondAssetId } })).resolves.toBe(1);
  });

  it("reorders cards without mutating either immutable source range", async () => {
    const created = await createSourceStoryCard({
      prisma,
      actorUserId,
      actorEmail,
      value: {
        projectId,
        mediaAssetId: secondAssetId,
        boardId,
        expectedBoardRevision: 2,
        clientRequestId: randomUUID(),
        title: "Reaction after the reveal",
        synopsis: "Cut back to Homer after the clip lands.",
        purpose: "payoff",
        startSeconds: 33,
        endSeconds: 39.5,
        groupKey: "reaction",
        tagIds: [tagId],
      },
    });
    secondCardId = created.card.id;
    expect(created.boardRevision).toBe(3);
    const secondPersisted = await prisma.studioStoryCard.findUniqueOrThrow({
      where: { id: secondCardId },
      include: { sourceRange: { include: { sourceRevision: true } } },
    });
    expect(secondPersisted.sourceRange?.sourceRevision).toMatchObject({
      sourceState: "checksum-bound",
      contentSha256: "a".repeat(64),
      sizeBytes: BigInt(1_100_000_000),
      verificationJson: {
        schema: "quipsly-media-source-verification-v2",
        checksumEvidence: {
          attachmentRole: "proxy-video",
          checksumSha256: "a".repeat(64),
          sizeBytes: "1100000000",
        },
      },
    });
    const sourceRangesBefore = await prisma.studioStoryCard.findMany({
      where: { id: { in: [firstCardId, secondCardId] } },
      orderBy: { id: "asc" },
      select: { id: true, sourceRangeId: true },
    });
    const clientRequestId = randomUUID();
    await expect(reorderStoryBoard({
      prisma,
      projectId,
      actorUserId,
      boardId,
      expectedRevision: 3,
      orderedCardIds: [secondCardId, firstCardId],
      clientRequestId,
    })).resolves.toEqual({ revision: 4, replayed: false });
    await expect(reorderStoryBoard({
      prisma,
      projectId,
      actorUserId,
      boardId,
      expectedRevision: 3,
      orderedCardIds: [secondCardId, firstCardId],
      clientRequestId,
    })).resolves.toEqual({ revision: 4, replayed: true });
    await expect(reorderStoryBoard({
      prisma,
      projectId,
      actorUserId,
      boardId,
      expectedRevision: 3,
      orderedCardIds: [firstCardId, secondCardId],
      clientRequestId,
    })).rejects.toMatchObject({ code: "request-reuse-conflict", currentRevision: 4 });
    await expect(reorderStoryBoard({
      prisma,
      projectId,
      actorUserId,
      boardId,
      expectedRevision: 3,
      orderedCardIds: [firstCardId, secondCardId],
      clientRequestId: randomUUID(),
    })).rejects.toMatchObject({ code: "stale-board", currentRevision: 4 });
    await expect(reorderStoryBoard({
      prisma,
      projectId,
      actorUserId,
      boardId,
      expectedRevision: 4,
      orderedCardIds: [firstCardId],
      clientRequestId: randomUUID(),
    })).rejects.toMatchObject({ code: "order-set-mismatch", currentRevision: 4 });
    const sourceRangesAfter = await prisma.studioStoryCard.findMany({
      where: { id: { in: [firstCardId, secondCardId] } },
      orderBy: { id: "asc" },
      select: { id: true, sourceRangeId: true },
    });
    expect(sourceRangesAfter).toEqual(sourceRangesBefore);
    const workspace = await readSourceStoryWorkspace(prisma, projectId);
    expect(workspace.boards[0]?.placements.map((placement) => placement.cardId)).toEqual([secondCardId, firstCardId]);
  });

  it("revises prose and tags append-only while stale writes and invalid SQL ranges fail", async () => {
    const clientRequestId = randomUUID();
    const update = {
      prisma,
      projectId,
      actorUserId,
      cardId: firstCardId,
      expectedRevision: 1,
      clientRequestId,
      title: "Homer enters the room — selected",
      synopsis: "The chosen opening beat.",
      notes: "Use this before Charlie's first line.",
      purpose: "opening" as const,
      status: "selected" as const,
      tagIds: [tagId],
    };
    await expect(updateSourceStoryCard(update)).resolves.toMatchObject({ replayed: false, card: { revision: 2 } });
    await expect(updateSourceStoryCard(update)).resolves.toMatchObject({ replayed: true, card: { revision: 2 } });
    await expect(updateSourceStoryCard({ ...update, notes: "A different update under the same request identity" })).rejects.toMatchObject({
      code: "request-reuse-conflict",
      currentRevision: 2,
    });
    await expect(updateSourceStoryCard({ ...update, clientRequestId: randomUUID() })).rejects.toMatchObject({
      code: "stale-card",
      currentRevision: 2,
    });
    await expect(updateSourceStoryCard({
      ...update,
      expectedRevision: 2,
      clientRequestId: randomUUID(),
      tagIds: [otherTagId],
    })).rejects.toMatchObject({ code: "invalid-tag-scope" });
    await expect(prisma.studioStoryCardRevision.findMany({
      where: { cardId: firstCardId },
      orderBy: { revision: "asc" },
      select: { revision: true, operation: true },
    })).resolves.toEqual([
      { revision: 1, operation: "create-card" },
      { revision: 2, operation: "update-card" },
    ]);
    await expect(prisma.studioStoryCard.findUnique({
      where: { id: firstCardId },
      select: { sourceRangeId: true, revision: true, status: true },
    })).resolves.toEqual({ sourceRangeId: firstRangeId, revision: 2, status: "selected" });

    const range = await prisma.studioSourceRange.findUniqueOrThrow({ where: { id: firstRangeId } });
    await expect(prisma.studioSourceRange.create({
      data: {
        projectId,
        sourceRevisionId: range.sourceRevisionId,
        selectorSha256: "f".repeat(64),
        startSeconds: 10,
        endSeconds: 5,
        selectorJson: { source: "constraint-smoke" },
        createdByUserId: actorUserId,
      },
    })).rejects.toThrow();
    await expect(prisma.studioSourceRange.count({ where: { selectorSha256: "f".repeat(64) } })).resolves.toBe(0);
  });

  it("rebinds a card to a corrected immutable source while preserving prose, tags, placement, and history", async () => {
    const placementBefore = await prisma.studioStoryBoardPlacement.findFirstOrThrow({
      where: { boardId, cardId: firstCardId },
      select: { id: true, boardId: true, cardId: true, groupKey: true, laneKey: true, sortOrder: true },
    });
    const oldRange = await prisma.studioSourceRange.findUniqueOrThrow({ where: { id: firstRangeId } });
    const cardBefore = await prisma.studioStoryCard.findUniqueOrThrow({
      where: { id: firstCardId },
      include: { tags: { orderBy: { tagId: "asc" } } },
    });
    const clientRequestId = randomUUID();
    const input = {
      prisma,
      actorUserId,
      value: {
        projectId,
        cardId: firstCardId,
        expectedRevision: 2,
        expectedSourceRangeId: firstRangeId,
        replacementMediaAssetId: secondAssetId,
        clientRequestId,
        startSeconds: 2.25,
        endSeconds: 8.75,
        reason: "The exact replacement source bytes are now registered.",
      },
    };
    const rebound = await rebindSourceStoryCard(input);
    expect(rebound).toMatchObject({
      replayed: false,
      previousSourceRangeId: firstRangeId,
      card: { id: firstCardId, revision: 3 },
    });
    expect(rebound.card.sourceRangeId).not.toBe(firstRangeId);
    await expect(rebindSourceStoryCard(input)).resolves.toMatchObject({
      replayed: true,
      previousSourceRangeId: firstRangeId,
      card: { id: firstCardId, revision: 3, sourceRangeId: rebound.card.sourceRangeId },
    });
    await expect(rebindSourceStoryCard({
      ...input,
      value: { ...input.value, reason: "Different intent under a reused request identity." },
    })).rejects.toMatchObject({ code: "request-reuse-conflict", currentRevision: 3 });
    await expect(rebindSourceStoryCard({
      ...input,
      value: { ...input.value, clientRequestId: randomUUID() },
    })).rejects.toMatchObject({ code: "stale-card", currentRevision: 3 });

    const [cardAfter, placementAfter, retainedOldRange, revisions, board] = await Promise.all([
      prisma.studioStoryCard.findUniqueOrThrow({
        where: { id: firstCardId },
        include: {
          tags: { orderBy: { tagId: "asc" } },
          sourceRange: { include: { sourceRevision: true } },
        },
      }),
      prisma.studioStoryBoardPlacement.findUniqueOrThrow({ where: { id: placementBefore.id } }),
      prisma.studioSourceRange.findUniqueOrThrow({ where: { id: firstRangeId } }),
      prisma.studioStoryCardRevision.findMany({
        where: { cardId: firstCardId },
        orderBy: { revision: "asc" },
        select: { revision: true, operation: true, snapshotJson: true },
      }),
      prisma.studioStoryBoard.findUniqueOrThrow({ where: { id: boardId }, select: { revision: true } }),
    ]);
    expect(cardAfter).toMatchObject({
      title: cardBefore.title,
      synopsis: cardBefore.synopsis,
      notes: cardBefore.notes,
      purpose: cardBefore.purpose,
      status: cardBefore.status,
      sourceRange: {
        startSeconds: 2.25,
        endSeconds: 8.75,
        sourceRevision: { sourceState: "checksum-bound", contentSha256: "a".repeat(64) },
      },
    });
    expect(cardAfter.tags.map((tag) => tag.tagId)).toEqual(cardBefore.tags.map((tag) => tag.tagId));
    expect(placementAfter).toMatchObject(placementBefore);
    expect(retainedOldRange).toMatchObject({
      id: oldRange.id,
      sourceRevisionId: oldRange.sourceRevisionId,
      startSeconds: oldRange.startSeconds,
      endSeconds: oldRange.endSeconds,
      selectorSha256: oldRange.selectorSha256,
    });
    expect(board.revision).toBe(4);
    expect(revisions.map(({ revision, operation }) => ({ revision, operation }))).toEqual([
      { revision: 1, operation: "create-card" },
      { revision: 2, operation: "update-card" },
      { revision: 3, operation: "rebind-source" },
    ]);
    expect(revisions[2]?.snapshotJson).toMatchObject({
      sourceRebind: {
        previousSourceRangeId: firstRangeId,
        replacementSourceRangeId: rebound.card.sourceRangeId,
        sourceMutated: false,
        placementsMutated: false,
      },
    });
  });
});
