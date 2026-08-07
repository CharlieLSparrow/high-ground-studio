/** @jest-environment node */

import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { newReviewedSpatialStitchMasterReceipt, newSpatialRenderResult, parseSpatialRenderJob, reviewedSpatialStitchMasterCanonicalJson } from "@high-ground/quipsly-media-processing";

import { getPrismaClient } from "@/lib/prisma";
import { normalizeEpisodeArtifact, timelineStateFromEpisodeArtifact } from "@/app/(app)/episode-production/episodeArtifact";

import {
  SourceStoryConflictError,
  arrangeStoryBoard,
  arrangeStoryBoardSections,
  archiveStoryBoardSection,
  createMediaSourceSet,
  createSourceStoryCard,
  createStoryBoard,
  createStoryBoardSection,
  openStoryBoardSectionWriting,
  readSourceStoryWorkspace,
  promoteSourceStoryCardToEpisode,
  rebindSourceStoryCard,
  reorderStoryBoard,
  updateSourceStoryCard,
  updateStoryBoardSection,
  withdrawSourceStoryTimelinePlacement,
} from "./source-story";
import { registerReviewedSpatialStitchMaster } from "./spatial-stitch-master";
import { queueSpatialReframe, registerSpatialReframeResult } from "./spatial-render-job";
import { readSourceLibraryPage } from "./source-library";
import { addSourceToCollection, createSourceCollection, readSourceCollections, removeSourceFromCollection } from "./source-collections";

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
  let thirdCardId = "";
  let firstRangeId = "";
  let spatialSourceSetId = "";
  let spatialSourceSetIdentitySha256 = "";
  let spatialClockRevisionId = "";
  let spatialOriginalRevisionId = "";
  let spatialVaultRoot = "";
  let spatialMasterPath = "";
  const additionalAssetIds: string[] = [];
  let collectionOtherUserId = "";

  beforeAll(async () => {
    spatialVaultRoot = await mkdtemp(path.join(os.tmpdir(), "quipsly-spatial-master-vault-"));
    spatialMasterPath = path.join(spatialVaultRoot, "reviewed-master.mp4");
    await writeFile(spatialMasterPath, "reviewed-spatial-master-smoke-bytes");
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
      if (projectId) {
        await prisma.studioSourceCollection.deleteMany({ where: { projectId } });
        await prisma.studioStoryTimelinePlacement.deleteMany({ where: { projectId } });
        await prisma.studioStoryCard.deleteMany({ where: { projectId } });
        await prisma.studioSourceRange.deleteMany({ where: { projectId } });
        await prisma.studioMediaSourceSet.deleteMany({ where: { projectId } });
      }
      if (workspaceId) await prisma.studioWorkspace.deleteMany({ where: { id: workspaceId } });
      await prisma.studioMediaAsset.deleteMany({
        where: { id: { in: [firstAssetId, secondAssetId, otherAssetId, ...additionalAssetIds].filter(Boolean) } },
      });
      if (collectionOtherUserId) await prisma.user.deleteMany({ where: { id: collectionOtherUserId } });
      if (actorUserId) await prisma.user.deleteMany({ where: { id: actorUserId } });
    } finally {
      if (spatialVaultRoot) await rm(spatialVaultRoot, { recursive: true, force: true });
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
    const [originalReference, browseReference] = await Promise.all([
      prisma.studioExternalMediaReference.create({ data: { projectId, provider: "local-file-vault", externalFileId: `original-${nonce}`, fileName: "insta360-walkthrough.insv", mimeType: "video/mp4", sizeBytes: BigInt(4_200_000_000), headRevisionKey: `sha256:${"d".repeat(64)}`, checksumSha256: "d".repeat(64), accessState: "available", capabilityState: "downloadable", providerLocatorJson: { localPath: path.join(spatialVaultRoot, "insta360-walkthrough.insv") }, importedByUserId: actorUserId, importedByEmail: actorEmail, clientRequestId: randomUUID() } }),
      prisma.studioExternalMediaReference.create({ data: { projectId, provider: "local-file-vault", externalFileId: `browse-${nonce}`, fileName: "insta360-walkthrough.lrv", mimeType: "video/mp4", sizeBytes: BigInt(110_000_000), headRevisionKey: `sha256:${"e".repeat(64)}`, checksumSha256: "e".repeat(64), accessState: "available", capabilityState: "downloadable", providerLocatorJson: { localPath: path.join(spatialVaultRoot, "insta360-walkthrough.lrv") }, importedByUserId: actorUserId, importedByEmail: actorEmail, clientRequestId: randomUUID() } }),
    ]);
    const [originalRevision, browseRevision] = await Promise.all([
      prisma.studioMediaSourceRevision.create({
        data: {
          projectId,
          mediaAssetId: firstAssetId,
          externalReferenceId: originalReference.id,
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
          externalReferenceId: browseReference.id,
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
    spatialSourceSetId = created.sourceSet.id;
    spatialSourceSetIdentitySha256 = created.sourceSet.identitySha256;
    spatialClockRevisionId = browseRevision.id;
    spatialOriginalRevisionId = originalRevision.id;
    const proxyJobId = `spatialproxyjob_${nonce}`;
    await prisma.studioWorkflowJob.create({ data: { id: proxyJobId, projectId, type: "external-source-proxy", status: "completed", source: "source-story.external-proxy", requestedByEmail: actorEmail, inputJson: { source: { sourceRevisionId: browseRevision.id } }, resultJson: { state: "completed" } } });
    await prisma.studioMediaDerivative.create({ data: { id: `spatialproxy_${nonce}`, projectId, sourceRevisionId: browseRevision.id, workflowJobId: proxyJobId, kind: "collaboration-proxy", profile: "collaboration-1080p-h264-aac-v1", storageProvider: "local", locator: spatialMasterPath, generation: `sha256:${"f".repeat(64)}`, contentSha256: "f".repeat(64), sizeBytes: BigInt(33), mimeType: "video/mp4", durationSeconds: 120, widthPixels: 1920, heightPixels: 960, framesPerSecond: 29.97, status: "ready", createdByUserId: actorUserId } });
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

  it("cursor-pages one mixed canonical source inventory without duplicating package members", async () => {
    const [standaloneAsset, standaloneExternal] = await Promise.all([
      prisma.studioMediaAsset.create({
        data: {
          filename: `standalone-camera-${nonce}.mov`,
          url: `/source-story/${nonce}/standalone-camera.mov`,
          mimeType: "video/quicktime",
          duration: 42,
          projects: { connect: { id: projectId } },
        },
      }),
      prisma.studioExternalMediaReference.create({
        data: {
          projectId,
          provider: "google-drive",
          externalFileId: `standalone-drive-${nonce}`,
          fileName: `standalone-interview-${nonce}.wav`,
          mimeType: "audio/wav",
          accessState: "available",
          capabilityState: "downloadable",
          importedByUserId: actorUserId,
          importedByEmail: actorEmail,
          clientRequestId: randomUUID(),
        },
      }),
    ]);
    additionalAssetIds.push(standaloneAsset.id);

    const keys: string[] = [];
    let cursor: string | null = null;
    do {
      const page = await readSourceLibraryPage({ prisma, projectId, limit: 1, cursor });
      keys.push(...page.orderedKeys);
      cursor = page.pageInfo.nextCursor;
      if (keys.length > 20) throw new Error("The mixed source cursor did not converge.");
    } while (cursor);

    expect(keys).toEqual(expect.arrayContaining([
      `source-set:${spatialSourceSetId}`,
      `external:${standaloneExternal.id}`,
      `asset:${standaloneAsset.id}`,
    ]));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.filter((key) => key.startsWith("external:")).length).toBe(1);
    expect(keys).not.toContain(`asset:${firstAssetId}`);
    expect(keys).not.toContain(`asset:${secondAssetId}`);

    const search = await readSourceLibraryPage({ prisma, projectId, limit: 10, query: "standalone-interview" });
    expect(search.orderedKeys).toEqual([`external:${standaloneExternal.id}`]);
    expect(search.pageInfo).toMatchObject({ complete: true, totals: { all: 1, externalSources: 1 } });

    await expect(readSourceLibraryPage({ prisma, projectId, cursor: "not-a-cursor" })).rejects.toMatchObject({
      code: "invalid-source-library-cursor",
      status: 400,
    });
  });

  it("files canonical sources into revisioned personal and shared collections without copying media", async () => {
    const standaloneAsset = await prisma.studioMediaAsset.findFirstOrThrow({
      where: { id: { in: additionalAssetIds }, projects: { some: { id: projectId } } },
      select: { id: true },
    });
    const otherUser = await prisma.user.create({ data: { primaryEmail: `source-collection-reader-${nonce}@example.test` } });
    collectionOtherUserId = otherUser.id;
    const personalRequestId = randomUUID();
    const personal = await createSourceCollection({
      prisma,
      projectId,
      actorUserId,
      clientRequestId: personalRequestId,
      title: "Homer selects",
      description: "Private review bin before sharing.",
      scope: "personal",
    });
    await expect(createSourceCollection({
      prisma,
      projectId,
      actorUserId,
      clientRequestId: personalRequestId,
      title: "Homer selects",
      description: "Private review bin before sharing.",
      scope: "personal",
    })).resolves.toMatchObject({ replayed: true, collection: { id: personal.collection.id } });
    const shared = await createSourceCollection({
      prisma,
      projectId,
      actorUserId,
      clientRequestId: randomUUID(),
      title: "Episode 9 shared selects",
      scope: "project",
    });

    const added = await addSourceToCollection({
      prisma,
      projectId,
      actorUserId,
      collectionId: personal.collection.id,
      expectedRevision: 1,
      clientRequestId: randomUUID(),
      sourceKind: "source-set",
      sourceId: spatialSourceSetId,
    });
    expect(added).toMatchObject({ replayed: false, unchanged: false, collection: { revision: 2 } });
    const assetAdded = await addSourceToCollection({
      prisma,
      projectId,
      actorUserId,
      collectionId: personal.collection.id,
      expectedRevision: 2,
      clientRequestId: randomUUID(),
      sourceKind: "asset",
      sourceId: standaloneAsset.id,
      note: "Strong alternate angle",
    });
    expect(assetAdded.collection.items.map((item) => item.targetKey)).toEqual([
      `source-set:${spatialSourceSetId}`,
      `asset:${standaloneAsset.id}`,
    ]);
    await expect(prisma.studioSourceCollectionItem.create({
      data: {
        collectionId: personal.collection.id,
        targetKey: `asset:${standaloneAsset.id}-wrong`,
        mediaAssetId: standaloneAsset.id,
        sortOrder: 9,
        addedByUserId: actorUserId,
      },
    })).rejects.toThrow();
    await expect(addSourceToCollection({
      prisma,
      projectId,
      actorUserId,
      collectionId: personal.collection.id,
      expectedRevision: 2,
      clientRequestId: randomUUID(),
      sourceKind: "asset",
      sourceId: otherAssetId,
    })).rejects.toMatchObject({ code: "stale-collection-revision", currentRevision: 3 });

    await addSourceToCollection({
      prisma,
      projectId,
      actorUserId,
      collectionId: shared.collection.id,
      expectedRevision: 1,
      clientRequestId: randomUUID(),
      sourceKind: "source-set",
      sourceId: spatialSourceSetId,
    });
    const [ownerView, collaboratorView] = await Promise.all([
      readSourceCollections(prisma, { projectId, actorUserId }),
      readSourceCollections(prisma, { projectId, actorUserId: otherUser.id }),
    ]);
    expect(ownerView.map((collection) => collection.id)).toEqual(expect.arrayContaining([personal.collection.id, shared.collection.id]));
    expect(collaboratorView.map((collection) => collection.id)).toEqual([shared.collection.id]);
    expect(collaboratorView[0]).toMatchObject({ scope: "project", canEdit: true, items: [{ targetKey: `source-set:${spatialSourceSetId}` }] });

    await expect(addSourceToCollection({
      prisma,
      projectId,
      actorUserId: otherUser.id,
      collectionId: personal.collection.id,
      expectedRevision: 3,
      clientRequestId: randomUUID(),
      sourceKind: "source-set",
      sourceId: spatialSourceSetId,
    })).rejects.toMatchObject({ code: "collection-owner-required" });

    const removed = await removeSourceFromCollection({
      prisma,
      projectId,
      actorUserId,
      collectionId: personal.collection.id,
      expectedRevision: 3,
      clientRequestId: randomUUID(),
      sourceKind: "source-set",
      sourceId: spatialSourceSetId,
    });
    expect(removed).toMatchObject({ collection: { revision: 4, items: [{ targetKey: `asset:${standaloneAsset.id}`, sortOrder: 0 }] } });
    await expect(prisma.studioSourceCollectionOperation.findMany({
      where: { collectionId: personal.collection.id },
      orderBy: { revision: "asc" },
      select: { operation: true, revision: true, previousRevision: true },
    })).resolves.toEqual([
      { operation: "create-collection", revision: 1, previousRevision: 0 },
      { operation: "add-source", revision: 2, previousRevision: 1 },
      { operation: "add-source", revision: 3, previousRevision: 2 },
      { operation: "remove-source", revision: 4, previousRevision: 3 },
    ]);
  });

  it("registers one checksum-bound reviewed 5.7K master and exposes it without its local locator", async () => {
    const output = await stat(spatialMasterPath);
    const outputSha256 = createHash("sha256").update(await readFile(spatialMasterPath)).digest("hex");
    const unsealed = newReviewedSpatialStitchMasterReceipt({
      receiptId: `spatialstitchreceipt_${nonce}`,
      clientRequestId: `spatialstitchrequest_${nonce}`,
      projectId,
      sourceSetId: spatialSourceSetId,
      sourceSetIdentitySha256: spatialSourceSetIdentitySha256,
      sourceClockRevisionId: spatialClockRevisionId,
      exactMembers: [{
        sourceRevisionId: spatialOriginalRevisionId,
        role: "primary-original",
        fileName: "insta360-walkthrough.insv",
        generation: `sha256:${"d".repeat(64)}`,
        sha256: "d".repeat(64),
        sizeBytes: 4_200_000_000,
      }],
      output: {
        provider: "local",
        locator: spatialMasterPath,
        contentType: "video/mp4",
        generation: `sha256:${outputSha256}`,
        sha256: outputSha256,
        sizeBytes: output.size,
        durationSeconds: 120,
        completeDecode: true,
        width: 5760,
        height: 2880,
        fps: 29.97,
        videoCodec: "hevc",
        projection: "equirectangular",
      },
      review: {
        reviewedAt: "2026-08-07T12:00:00.000Z",
        reviewedByUserId: actorUserId,
        reviewedByEmail: actorEmail,
        application: "Insta360 Studio",
        applicationVersion: "5.9.9",
        flowStateEnabled: true,
        horizonLockEnabled: true,
        stitchMode: "ai-flow",
        visualPlaybackReviewed: true,
      },
      receiptSha256: "0".repeat(64),
    });
    const receipt = newReviewedSpatialStitchMasterReceipt({
      ...unsealed,
      receiptSha256: createHash("sha256").update(reviewedSpatialStitchMasterCanonicalJson(unsealed)).digest("hex"),
    });
    await expect(registerReviewedSpatialStitchMaster({ prisma, receipt, authorizedRoot: spatialVaultRoot })).resolves.toMatchObject({
      replayed: false,
      derivative: { kind: "spatial-stitch-master", contentSha256: outputSha256, widthPixels: 5760, heightPixels: 2880 },
    });
    await expect(registerReviewedSpatialStitchMaster({ prisma, receipt, authorizedRoot: spatialVaultRoot })).resolves.toMatchObject({ replayed: true });
    await expect(prisma.studioWorkflowJob.count({ where: { id: receipt.receiptId } })).resolves.toBe(1);
    await expect(prisma.studioMediaDerivative.count({ where: { workflowJobId: receipt.receiptId } })).resolves.toBe(1);

    const workspace = await readSourceStoryWorkspace(prisma, projectId);
    const sourceSet = workspace.sourceSets.find((candidate) => candidate.id === spatialSourceSetId);
    expect(sourceSet?.sourceClockRevision.spatialStitchMaster).toMatchObject({
      kind: "spatial-stitch-master",
      widthPixels: 5760,
      heightPixels: 2880,
      playbackUrl: expect.stringMatching(/^\/api\/media\/derivatives\//),
    });
    expect(JSON.stringify(sourceSet)).not.toContain(spatialMasterPath);
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

  it("files, groups, lanes, orders, and unfiles cards in one revision without touching source truth", async () => {
    const unfiled = await createSourceStoryCard({
      prisma,
      actorUserId,
      actorEmail,
      value: {
        projectId,
        mediaAssetId: secondAssetId,
        clientRequestId: randomUUID(),
        title: "Room texture for the transition",
        synopsis: "A quiet visual bridge into the next section.",
        purpose: "b-roll",
        startSeconds: 44,
        endSeconds: 48.25,
        tagIds: [tagId],
      },
    });
    thirdCardId = unfiled.card.id;
    const sourceRangesBefore = await prisma.studioStoryCard.findMany({
      where: { id: { in: [firstCardId, secondCardId, thirdCardId] } },
      orderBy: { id: "asc" },
      select: { id: true, sourceRangeId: true },
    });
    const clientRequestId = randomUUID();
    const value = {
      projectId,
      boardId,
      expectedRevision: 4,
      clientRequestId,
      placements: [
        { cardId: firstCardId, groupKey: "Cold Open", laneKey: "Story" },
        { cardId: thirdCardId, groupKey: "Act 1", laneKey: "B-roll" },
      ],
    };
    await expect(arrangeStoryBoard({ prisma, actorUserId, value })).resolves.toEqual({ revision: 5, replayed: false });
    await expect(arrangeStoryBoard({ prisma, actorUserId, value })).resolves.toEqual({ revision: 5, replayed: true });
    await expect(arrangeStoryBoard({
      prisma,
      actorUserId,
      value: { ...value, placements: [...value.placements].reverse() },
    })).rejects.toMatchObject({ code: "request-reuse-conflict", currentRevision: 5 });
    await expect(arrangeStoryBoard({
      prisma,
      actorUserId,
      value: { ...value, clientRequestId: randomUUID() },
    })).rejects.toMatchObject({ code: "stale-board", currentRevision: 5 });
    await expect(arrangeStoryBoard({
      prisma,
      actorUserId,
      value: {
        ...value,
        expectedRevision: 5,
        clientRequestId: randomUUID(),
        placements: [{ cardId: "card_from_another_nest", groupKey: "private", laneKey: "story" }],
      },
    })).rejects.toMatchObject({ code: "arrangement-card-scope" });

    const [sourceRangesAfter, board, removedCard, operation] = await Promise.all([
      prisma.studioStoryCard.findMany({
        where: { id: { in: [firstCardId, secondCardId, thirdCardId] } },
        orderBy: { id: "asc" },
        select: { id: true, sourceRangeId: true },
      }),
      prisma.studioStoryBoard.findUniqueOrThrow({
        where: { id: boardId },
        include: { placements: { orderBy: { sortOrder: "asc" } } },
      }),
      prisma.studioStoryCard.findUnique({ where: { id: secondCardId }, select: { id: true, sourceRangeId: true } }),
      prisma.studioStoryBoardOperation.findUniqueOrThrow({ where: { boardId_revision: { boardId, revision: 5 } } }),
    ]);
    expect(sourceRangesAfter).toEqual(sourceRangesBefore);
    expect(removedCard).toMatchObject({ id: secondCardId, sourceRangeId: expect.any(String) });
    expect(board.revision).toBe(5);
    expect(board.placements.map(({ cardId, groupKey, laneKey, sortOrder }) => ({ cardId, groupKey, laneKey, sortOrder }))).toEqual([
      { cardId: firstCardId, groupKey: "cold-open", laneKey: "story", sortOrder: 0 },
      { cardId: thirdCardId, groupKey: "act-1", laneKey: "b-roll", sortOrder: 1 },
    ]);
    expect(operation).toMatchObject({ operation: "arrange-cards", revision: 5, previousRevision: 4 });
    expect(operation.snapshotJson).toMatchObject({
      placements: [
        { cardId: firstCardId, groupKey: "cold-open", laneKey: "story", sortOrder: 0 },
        { cardId: thirdCardId, groupKey: "act-1", laneKey: "b-roll", sortOrder: 1 },
      ],
      previousPlacements: expect.arrayContaining([
        expect.objectContaining({ cardId: firstCardId }),
        expect.objectContaining({ cardId: secondCardId }),
      ]),
    });
  });

  it("opens one durable board section into shared document-kernel writing without copying its cards", async () => {
    const sectionBefore = await prisma.studioStoryBoardSection.findUniqueOrThrow({
      where: { boardId_key: { boardId, key: "cold-open" } },
      include: { document: true },
    });
    const cardBefore = await prisma.studioStoryCard.findUniqueOrThrow({
      where: { id: firstCardId },
      select: { id: true, sourceRangeId: true, revision: true, synopsis: true, notes: true },
    });
    expect(sectionBefore).toMatchObject({ title: "Cold Open", revision: 1, document: null });
    const clientRequestId = randomUUID();
    const value = {
      projectId,
      boardId,
      sectionKey: "Cold Open",
      expectedRevision: 1,
      clientRequestId,
    };
    const opened = await openStoryBoardSectionWriting({ prisma, actorUserId, actorEmail, value });
    expect(opened).toMatchObject({ replayed: false, section: { id: sectionBefore.id, revision: 2 }, document: { id: expect.any(String), title: expect.stringContaining("Cold Open") } });
    await expect(openStoryBoardSectionWriting({ prisma, actorUserId, actorEmail, value })).resolves.toMatchObject({
      replayed: true,
      document: { id: opened.document.id },
    });
    await expect(openStoryBoardSectionWriting({
      prisma,
      actorUserId,
      actorEmail,
      value: { ...value, expectedRevision: 2 },
    })).rejects.toMatchObject({ code: "request-reuse-conflict", currentRevision: 2 });
    await expect(openStoryBoardSectionWriting({
      prisma,
      actorUserId,
      actorEmail,
      value: { ...value, projectId: otherProjectId, clientRequestId: randomUUID() },
    })).rejects.toMatchObject({ code: "section-project-mismatch" });

    const [sectionAfter, document, cardAfter, workspace] = await Promise.all([
      prisma.studioStoryBoardSection.findUniqueOrThrow({
        where: { id: sectionBefore.id },
        include: { operations: { orderBy: { revision: "asc" } } },
      }),
      prisma.studioDocument.findUniqueOrThrow({
        where: { id: opened.document.id },
        include: { blocks: { orderBy: { order: "asc" } }, documentOperations: true },
      }),
      prisma.studioStoryCard.findUniqueOrThrow({
        where: { id: firstCardId },
        select: { id: true, sourceRangeId: true, revision: true, synopsis: true, notes: true },
      }),
      readSourceStoryWorkspace(prisma, projectId),
    ]);
    expect(sectionAfter).toMatchObject({ documentId: document.id, revision: 2 });
    expect(sectionAfter.operations).toHaveLength(2);
    expect(sectionAfter.operations).toEqual([
      expect.objectContaining({ operation: "create-section", revision: 1, previousRevision: 0, requestSha256: expect.stringMatching(/^[0-9a-f]{64}$/) }),
      expect.objectContaining({ operation: "create-writing-document", revision: 2, previousRevision: 1, requestSha256: expect.stringMatching(/^[0-9a-f]{64}$/) }),
    ]);
    expect(document).toMatchObject({ projectId, personalOwnerUserId: null, projectionStatus: "draft", isPrivate: true });
    expect(document.blocks).toEqual([expect.objectContaining({ stableId: `${document.stableId}:draft`, title: "Cold Open", order: 0 })]);
    expect(document.documentOperations).toEqual([expect.objectContaining({ operationType: "create-from-story-board-section", groupId: clientRequestId, reversible: true })]);
    expect(cardAfter).toEqual(cardBefore);
    expect(workspace.boards[0]?.sections.find((section) => section.id === sectionBefore.id)).toMatchObject({
      key: "cold-open",
      revision: 2,
      document: { id: document.id, blockCount: 1 },
    });
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
        reframeRecipe: {
          schema: "quipsly-360-reframe-v1" as const,
          projection: "equirectangular" as const,
          aspectRatio: "16:9" as const,
          stabilization: "flowstate" as const,
          horizonLock: true,
          keyframes: [
            { sourceSeconds: 2.25, panDegrees: 14, tiltDegrees: 0, rollDegrees: 0, fieldOfViewDegrees: 92, interpolation: "ease" as const },
            { sourceSeconds: 8.75, panDegrees: 30, tiltDegrees: -3, rollDegrees: 0, fieldOfViewDegrees: 78, interpolation: "ease" as const },
          ],
        },
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
    expect(board.revision).toBe(5);
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

  it("promotes a verified Story range into the canonical Episode and withdraws it reversibly", async () => {
    const document = await prisma.studioDocument.create({
      data: { projectId, stableId: `source-story-document-${nonce}`, title: "Episode 9 source build", projectionStatus: "review", isPrivate: false },
    });
    const episode = await prisma.studioEpisodeProduction.create({
      data: { projectId, documentId: document.id, slug: `source-story-episode-${nonce}`, title: "Episode 9 source promotion", boundaryLabel: "Episode 9", status: "draft" },
    });
    const boardPlacement = await prisma.studioStoryBoardPlacement.findFirstOrThrow({ where: { boardId, cardId: firstCardId } });
    const beforeWorkspace = await readSourceStoryWorkspace(prisma, projectId);
    const beforeEpisode = beforeWorkspace.episodes.find((candidate) => candidate.id === episode.id)!;
    const clientRequestId = randomUUID();
    const value = {
      projectId,
      episodeProductionId: episode.id,
      cardId: firstCardId,
      originBoardId: boardId,
      originBoardPlacementId: boardPlacement.id,
      clientRequestId,
      expectedTimelineFingerprint: beforeEpisode.timelineFingerprint,
      placementMode: "append" as const,
      trackId: "V2",
    };
    const promoted = await promoteSourceStoryCardToEpisode({ prisma, actorUserId, actorEmail, value });
    expect(promoted).toMatchObject({ replayed: false, placement: { status: "active", revision: 1, trackId: "V2", episodeStartSeconds: 0 } });
    await expect(promoteSourceStoryCardToEpisode({ prisma, actorUserId, actorEmail, value })).resolves.toMatchObject({ replayed: true, placement: { id: promoted.placement.id } });
    await expect(promoteSourceStoryCardToEpisode({ prisma, actorUserId, actorEmail, value: { ...value, trackId: "V3" } })).rejects.toMatchObject({ code: "request-reuse-conflict", currentRevision: 1 });

    const afterPromotion = await prisma.studioEpisodeProduction.findUniqueOrThrow({ where: { id: episode.id } });
    const artifact = normalizeEpisodeArtifact(afterPromotion.timelineJson)!;
    const timeline = timelineStateFromEpisodeArtifact(afterPromotion.timelineJson);
    expect(artifact).toMatchObject({
      payloadVersion: 6,
      importedMedia: [expect.objectContaining({ source: "source-story", is360: true, proxy: expect.objectContaining({ sourceOriginalPreserved: true }) })],
      timelineClips: [expect.objectContaining({
        id: promoted.placement.clipId,
        sourceStory: expect.objectContaining({ cardId: firstCardId, boundaries: expect.objectContaining({ finalRenderMustResolveExactSource: true }) }),
        transforms: [expect.objectContaining({ x: 14, scale: 92 }), expect.objectContaining({ x: 30, scale: 78 })],
      })],
    });
    expect(timeline.clips[0]?.sourceStory?.placementId).toBe(promoted.placement.id);
    expect(await prisma.studioStoryTimelinePlacementOperation.count({ where: { placementId: promoted.placement.id } })).toBe(1);

    const promotedWorkspace = await readSourceStoryWorkspace(prisma, projectId);
    const promotedEpisode = promotedWorkspace.episodes.find((candidate) => candidate.id === episode.id)!;
    expect(promotedEpisode).toMatchObject({ clipCount: 1, timelineDurationSeconds: 6.5 });
    const withdrawRequestId = randomUUID();
    const withdrawValue = {
      projectId,
      placementId: promoted.placement.id,
      expectedRevision: 1,
      expectedTimelineFingerprint: promotedEpisode.timelineFingerprint,
      clientRequestId: withdrawRequestId,
    };
    const withdrawn = await withdrawSourceStoryTimelinePlacement({ prisma, actorUserId, value: withdrawValue });
    expect(withdrawn).toMatchObject({ replayed: false, placement: { status: "withdrawn", revision: 2 } });
    await expect(withdrawSourceStoryTimelinePlacement({ prisma, actorUserId, value: withdrawValue })).resolves.toMatchObject({ replayed: true, placement: { revision: 2 } });
    const afterWithdrawal = await prisma.studioEpisodeProduction.findUniqueOrThrow({ where: { id: episode.id } });
    expect(timelineStateFromEpisodeArtifact(afterWithdrawal.timelineJson).clips).toEqual([]);
    expect(normalizeEpisodeArtifact(afterWithdrawal.timelineJson)?.importedMedia).toEqual([]);
    expect(await prisma.studioStoryCard.findUnique({ where: { id: firstCardId } })).not.toBeNull();
    expect(await prisma.studioSourceRange.findUnique({ where: { id: firstRangeId } })).not.toBeNull();
    expect(await prisma.studioStoryTimelinePlacementOperation.findMany({ where: { placementId: promoted.placement.id }, orderBy: { revision: "asc" }, select: { revision: true, operation: true } })).toEqual([
      { revision: 1, operation: "promote" },
      { revision: 2, operation: "withdraw" },
    ]);
  });

  it("queues and registers one reviewed-master spatial proof against the canonical Episode placement", async () => {
    const recipe = {
      schema: "quipsly-360-reframe-v1",
      projection: "equirectangular",
      aspectRatio: "16:9",
      stabilization: "flowstate",
      horizonLock: true,
      keyframes: [
        { sourceSeconds: 0.05, panDegrees: 0, tiltDegrees: 0, rollDegrees: 0, fieldOfViewDegrees: 85, interpolation: "ease" },
        { sourceSeconds: 0.35, panDegrees: 25, tiltDegrees: -2, rollDegrees: 0, fieldOfViewDegrees: 72, interpolation: "ease" },
      ],
    };
    const range = await prisma.studioSourceRange.create({ data: { projectId, sourceRevisionId: spatialClockRevisionId, sourceSetId: spatialSourceSetId, selectorSha256: "7".repeat(64), startSeconds: 0.05, endSeconds: 0.35, selectorJson: { schema: "spatial-queue-smoke" }, reframeRecipeJson: recipe, createdByUserId: actorUserId } });
    const card = await prisma.studioStoryCard.create({ data: { projectId, sourceRangeId: range.id, stableId: `spatial-render-card-${nonce}`, title: "Spatial render card", synopsis: "A frozen 360 select.", notes: "Proof render integration.", purpose: "select", status: "selected", visibility: "project", revision: 1, clientRequestId: randomUUID(), createdByUserId: actorUserId } });
    const document = await prisma.studioDocument.create({ data: { projectId, stableId: `spatial-render-document-${nonce}`, title: "Spatial render proof", projectionStatus: "review", isPrivate: false } });
    const episode = await prisma.studioEpisodeProduction.create({ data: { projectId, documentId: document.id, slug: `spatial-render-${nonce}`, title: "Spatial render proof", boundaryLabel: "QA", status: "draft" } });
    const before = (await readSourceStoryWorkspace(prisma, projectId)).episodes.find((candidate) => candidate.id === episode.id)!;
    const promoted = await promoteSourceStoryCardToEpisode({ prisma, actorUserId, actorEmail, value: { projectId, episodeProductionId: episode.id, cardId: card.id, originBoardId: null, originBoardPlacementId: null, clientRequestId: randomUUID(), expectedTimelineFingerprint: before.timelineFingerprint, placementMode: "append", trackId: "V2" } });
    const clientRequestId = `spatialrenderrequest_${nonce}`;
    const queued = await queueSpatialReframe({ prisma, projectId, timelinePlacementId: promoted.placement.id, profile: "spatial-proof-720p24", requestedByUserId: actorUserId, requestedByEmail: actorEmail, clientRequestId, localMediaRoot: spatialVaultRoot });
    expect(queued).toMatchObject({ replayed: false, job: { status: "queued", timelinePlacementId: promoted.placement.id, profile: "spatial-proof-720p24" } });
    await expect(queueSpatialReframe({ prisma, projectId, timelinePlacementId: promoted.placement.id, profile: "spatial-proof-720p24", requestedByUserId: actorUserId, requestedByEmail: actorEmail, clientRequestId, localMediaRoot: spatialVaultRoot })).resolves.toMatchObject({ replayed: true, job: { id: queued.job.id } });
    const jobRow = await prisma.studioWorkflowJob.findUniqueOrThrow({ where: { id: queued.job.id } });
    const job = parseSpatialRenderJob(jobRow.inputJson);
    const outputPath = job.reframe.target.locator;
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, "registered-spatial-proof-output");
    const outputBytes = await readFile(outputPath);
    const outputSha256 = createHash("sha256").update(outputBytes).digest("hex");
    const master = job.stitch.reviewedMaster!;
    const receipt = newSpatialRenderResult({
      jobId: job.jobId,
      completedAt: "2026-08-07T14:00:00.000Z",
      manifestSha256: job.manifestSha256,
      stitch: { profile: job.stitch.profile, adapter: "insta360-studio-reviewed-export", adapterVersion: master.adapterVersion, sourceSetIdentitySha256: job.sourcePackage.sourceSetIdentitySha256, output: { provider: "local", locator: job.stitch.target.locator, contentType: "video/mp4", generation: master.generation, sha256: master.sha256, sizeBytes: master.sizeBytes, durationSeconds: master.durationSeconds, completeDecode: true, width: 5760, height: 2880, fps: master.fps, videoCodec: master.videoCodec, projection: "equirectangular" } },
      reframe: { adapter: "ffmpeg-v360", ffmpegVersion: "ffmpeg 8.1.1", recipeSha256: job.recipeSha256, output: { provider: "local", locator: outputPath, contentType: "video/mp4", generation: `sha256:${outputSha256}`, sha256: outputSha256, sizeBytes: outputBytes.length, durationSeconds: 0.3, completeDecode: true, width: 1280, height: 720, fps: 24, videoCodec: "h264", variantKind: "spatial-reframe-proof" } },
      worker: { executionId: `spatialexecution_${nonce}`, buildId: "integration-test", imageDigest: null, attempt: 1 },
    }, job);
    await prisma.studioWorkflowJob.update({ where: { id: job.jobId }, data: { status: "output-ready", resultJson: { state: "output-ready", receipt } } });
    await expect(registerSpatialReframeResult({ prisma, projectId, jobId: job.jobId, authorizedRoot: spatialVaultRoot })).resolves.toMatchObject({ replayed: false, derivative: { kind: "spatial-reframe-proof", widthPixels: 1280, heightPixels: 720 }, binding: { timelinePlacementId: promoted.placement.id, recipeSha256: job.recipeSha256 } });
    await expect(registerSpatialReframeResult({ prisma, projectId, jobId: job.jobId, authorizedRoot: spatialVaultRoot })).resolves.toMatchObject({ replayed: true });
    await expect(prisma.studioMediaDerivative.count({ where: { workflowJobId: job.jobId } })).resolves.toBe(1);
  });

  it("operates a durable binder independently from card order and retains archived section writing", async () => {
    const createRequestId = randomUUID();
    const createValue = {
      projectId,
      boardId,
      expectedBoardRevision: 5,
      clientRequestId: createRequestId,
      title: "Payoff and next question",
      synopsis: "Resolve the opening promise, then preserve the next investigation.",
    };
    const created = await createStoryBoardSection({ prisma, actorUserId, value: createValue });
    expect(created).toMatchObject({ boardRevision: 6, replayed: false, section: { key: "payoff-and-next-question", revision: 1, sortOrder: expect.any(Number) } });
    await expect(createStoryBoardSection({ prisma, actorUserId, value: createValue })).resolves.toMatchObject({ boardRevision: 6, replayed: true, section: { id: created.section.id } });
    await expect(createStoryBoardSection({ prisma, actorUserId, value: { ...createValue, title: "Different section" } })).rejects.toMatchObject({ code: "request-reuse-conflict", currentRevision: 6 });

    const updateRequestId = randomUUID();
    const updateValue = {
      projectId,
      boardId,
      sectionId: created.section.id,
      expectedRevision: 1,
      clientRequestId: updateRequestId,
      title: "Payoff, then the next question",
      synopsis: "Land the promise without pretending the investigation is finished.",
    };
    await expect(updateStoryBoardSection({ prisma, actorUserId, value: updateValue })).resolves.toMatchObject({ replayed: false, section: { revision: 2, title: updateValue.title } });
    await expect(updateStoryBoardSection({ prisma, actorUserId, value: updateValue })).resolves.toMatchObject({ replayed: true, section: { revision: 2 } });
    const writingRequestId = randomUUID();
    const writing = await openStoryBoardSectionWriting({ prisma, actorUserId, actorEmail, value: { projectId, boardId, sectionKey: created.section.key, expectedRevision: 2, clientRequestId: writingRequestId } });
    expect(writing).toMatchObject({ replayed: false, section: { revision: 3 }, document: { id: expect.any(String) } });

    const beforeOrder = (await readSourceStoryWorkspace(prisma, projectId)).boards.find((board) => board.id === boardId)!;
    const orderedSectionIds = [...beforeOrder.sections].reverse().map((section) => section.id);
    const arrangeRequestId = randomUUID();
    const arrangeValue = { projectId, boardId, expectedBoardRevision: 6, clientRequestId: arrangeRequestId, orderedSectionIds };
    await expect(arrangeStoryBoardSections({ prisma, actorUserId, value: arrangeValue })).resolves.toEqual({ revision: 7, replayed: false });
    await expect(arrangeStoryBoardSections({ prisma, actorUserId, value: arrangeValue })).resolves.toEqual({ revision: 7, replayed: true });
    await expect(arrangeStoryBoardSections({ prisma, actorUserId, value: { ...arrangeValue, orderedSectionIds: [...orderedSectionIds].reverse() } })).rejects.toMatchObject({ code: "request-reuse-conflict", currentRevision: 7 });

    const boardAfterSectionOrder = (await readSourceStoryWorkspace(prisma, projectId)).boards.find((board) => board.id === boardId)!;
    await arrangeStoryBoard({
      prisma,
      actorUserId,
      value: {
        projectId,
        boardId,
        expectedRevision: 7,
        clientRequestId: randomUUID(),
        placements: boardAfterSectionOrder.placements.map((placement) => ({ cardId: placement.cardId, groupKey: placement.groupKey, laneKey: placement.laneKey })),
      },
    });
    const afterCardArrangement = (await readSourceStoryWorkspace(prisma, projectId)).boards.find((board) => board.id === boardId)!;
    expect(afterCardArrangement.sections.map((section) => section.id)).toEqual(orderedSectionIds);

    const occupied = afterCardArrangement.sections.find((section) => section.key === "cold-open")!;
    await expect(archiveStoryBoardSection({
      prisma,
      actorUserId,
      value: { projectId, boardId, sectionId: occupied.id, expectedBoardRevision: 8, expectedSectionRevision: occupied.revision, clientRequestId: randomUUID() },
    })).rejects.toMatchObject({ code: "section-not-empty" });

    const archiveRequestId = randomUUID();
    const archiveValue = { projectId, boardId, sectionId: created.section.id, expectedBoardRevision: 8, expectedSectionRevision: 3, clientRequestId: archiveRequestId };
    await expect(archiveStoryBoardSection({ prisma, actorUserId, value: archiveValue })).resolves.toMatchObject({ boardRevision: 9, sectionRevision: 4, replayed: false });
    await expect(archiveStoryBoardSection({ prisma, actorUserId, value: archiveValue })).resolves.toMatchObject({ boardRevision: 9, replayed: true });
    await expect(openStoryBoardSectionWriting({ prisma, actorUserId, actorEmail, value: { projectId, boardId, sectionKey: created.section.key, expectedRevision: 2, clientRequestId: writingRequestId } })).resolves.toMatchObject({ replayed: true, document: { id: writing.document.id } });
    await expect(openStoryBoardSectionWriting({ prisma, actorUserId, actorEmail, value: { projectId, boardId, sectionKey: created.section.key, expectedRevision: 4, clientRequestId: randomUUID() } })).rejects.toMatchObject({ code: "section-project-mismatch" });
    const [archived, retainedDocument, finalBoard] = await Promise.all([
      prisma.studioStoryBoardSection.findUniqueOrThrow({ where: { id: created.section.id }, include: { operations: { orderBy: { revision: "asc" } } } }),
      prisma.studioDocument.findUnique({ where: { id: writing.document.id } }),
      readSourceStoryWorkspace(prisma, projectId),
    ]);
    expect(archived).toMatchObject({ archivedAt: expect.any(Date), documentId: writing.document.id, revision: 4 });
    expect(archived.operations.map(({ operation, revision }) => ({ operation, revision }))).toEqual([
      { operation: "create-section", revision: 1 },
      { operation: "update-section", revision: 2 },
      { operation: "create-writing-document", revision: 3 },
      { operation: "archive-section", revision: 4 },
    ]);
    expect(retainedDocument).not.toBeNull();
    expect(finalBoard.boards.find((board) => board.id === boardId)?.sections.some((section) => section.id === created.section.id)).toBe(false);
  });
});
