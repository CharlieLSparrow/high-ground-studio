/** @jest-environment node */

import { randomUUID } from "node:crypto";

import { auth } from "@/auth";
import { GET as readEpisodeInventory } from "@/app/api/media-vault/episode-inventory/route";
import { getPrismaClient } from "@/lib/prisma";

import { promoteRecordingAssetToStudioMedia } from "./recording-media-promotion";

jest.mock("@/auth", () => ({ auth: jest.fn() }));

const runLocalDatabaseSmoke = process.env.QUIPSLY_LOCAL_DB_SMOKE === "1" ? describe : describe.skip;
if (process.env.QUIPSLY_LOCAL_DB_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) throw new Error("QUIPSLY_LOCAL_DATABASE_URL is required for the Studio handoff smoke.");
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

runLocalDatabaseSmoke("canonical Session to Studio handoff local database smoke", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID().slice(0, 8);
  const actorEmail = `studio-handoff-${nonce}@example.test`;
  let actorUserId = "";
  let workspaceId = "";
  let projectId = "";
  let projectSlug = "";
  let roomId = "";
  let recordingAssetId = "";
  let mediaAssetId = "";
  let sourceId = "";

  beforeAll(async () => {
    const actor = await prisma.user.create({ data: { primaryEmail: actorEmail, name: "Studio handoff actor" } });
    actorUserId = actor.id;
    (auth as jest.Mock).mockResolvedValue({ user: { id: actorUserId, email: actorEmail, primaryEmail: actorEmail, name: "Studio handoff actor" } });
    // Deliberately use a non-legacy workspace. Capture sessions can belong to
    // any accessible Nest, and Studio attachment must preserve that exact
    // project identity instead of silently assuming `tonight-pack`.
    const workspace = await prisma.studioWorkspace.create({
      data: {
        slug: `handoff-workspace-${nonce}`,
        name: "Capture handoff workspace",
      },
    });
    workspaceId = workspace.id;
    projectSlug = `handoff-${nonce}`;
    const project = await prisma.studioProject.create({ data: { workspaceId: workspace.id, slug: projectSlug, name: "High Ground Odyssey handoff" } });
    projectId = project.id;
    await Promise.all([
      prisma.studioProjectAccessGrant.create({ data: { projectId, email: actorEmail, role: "EDITOR", status: "ACTIVE", createdByUserId: actorUserId, createdByEmail: actorEmail } }),
      prisma.studioDocument.create({ data: { projectId, stableId: `handoff-doc-${nonce}`, title: "Episode 4" } }),
    ]);
    const tag = await prisma.studioTag.create({ data: { projectId, slug: `proof-listen-${nonce}`, label: "Proof listen", category: "review" } });
    const room = await prisma.callRoom.create({ data: { createdByUserId: actorUserId, projectId, projectSlug: `stale-${nonce}`, title: "Episode 4 recording" } });
    roomId = room.id;
    await prisma.callRoomTagLink.create({ data: { roomId, tagId: tag.id, createdByUserId: actorUserId } });
    const checksum = "a".repeat(64);
    const recording = await prisma.recordingAsset.create({
      data: {
        roomId,
        kind: "LOCAL_AUDIO",
        status: "VERIFIED",
        fileName: "Episode 4 room mix.wav",
        contentType: "audio/wav",
        byteSize: 1234n,
        durationSeconds: 62,
        storageBucket: "local-smoke",
        storageObjectPath: `recordings/${roomId}/room-mix.wav`,
        checksum,
        verifiedAt: new Date(),
        localManifestJson: { projectSlug },
      },
    });
    recordingAssetId = recording.id;
    const finalizedSource = await prisma.studioVideoSource.create({
      data: {
        provider: "gcs",
        providerSourceId: `gcs://local-smoke/recordings/${roomId}/room-mix.wav?generation=1`,
        url: "pending",
        title: "Episode 4 finalized source",
      },
    });
    sourceId = finalizedSource.id;
    const playbackUrl = `/api/ingest/media/${sourceId}`;
    await prisma.studioVideoSource.update({ where: { id: sourceId }, data: { url: playbackUrl } });
    const finalizedMedia = await prisma.studioMediaAsset.create({
      data: {
        filename: "Episode 4 room mix.wav",
        url: playbackUrl,
        mimeType: "audio/wav",
        sizeBytes: 1234n,
        isProxy: false,
        rawAssetId: sourceId,
        cloudProvider: "gcs",
        isGlobal: false,
        projects: { connect: { id: projectId } },
      },
    });
    mediaAssetId = finalizedMedia.id;
    const uploadSessionId = randomUUID();
    await prisma.mobileCaptureFinalizationReceipt.create({
      data: {
        uploadSessionId,
        captureId: randomUUID(),
        roomId,
        actorUserId,
        processingDisposition: "RELEASED",
        transcriptDisposition: "RELEASED",
        recordingAssetId,
        sourceId,
        mediaAssetId,
        releasedByUserId: actorUserId,
        releasedAt: new Date(),
        metadataJson: {
          immutableUploadBinding: {
            uploadSessionId,
            roomId,
            sha256: checksum,
            bucketName: "local-smoke",
            objectName: `recordings/${roomId}/room-mix.wav`,
            sizeBytes: 1234,
          },
        },
      },
    });
  });

  afterAll(async () => {
    try {
      if (recordingAssetId) await prisma.mobileCaptureFinalizationReceipt.deleteMany({ where: { recordingAssetId } });
      if (roomId) await prisma.callRoom.deleteMany({ where: { id: roomId } });
      if (projectId) await prisma.studioProject.deleteMany({ where: { id: projectId } });
      if (workspaceId) await prisma.studioWorkspace.deleteMany({ where: { id: workspaceId } });
      if (mediaAssetId) await prisma.studioMediaAsset.deleteMany({ where: { id: mediaAssetId } });
      if (sourceId) await prisma.studioVideoSource.deleteMany({ where: { id: sourceId } });
      if (actorUserId) await prisma.user.deleteMany({ where: { id: actorUserId } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it("persists one project-scoped receipt and one episode source across an idempotent replay", async () => {
    const conflict = await promoteRecordingAssetToStudioMedia({
      prisma,
      recordingAssetId,
      actorUserId,
      actorEmail,
      nestSlug: `other-${nonce}`,
      episodeSlug: "episode-4",
    });
    expect(conflict).toMatchObject({ ok: false, status: "canonical-session-project-conflict", httpStatus: 409, targetNestSlug: projectSlug });
    await expect(prisma.studioAssetAttachment.count({ where: { projectId } })).resolves.toBe(0);
    await expect(prisma.studioWorkflowJob.count({ where: { projectId } })).resolves.toBe(0);

    const first = await promoteRecordingAssetToStudioMedia({ prisma, recordingAssetId, actorUserId, actorEmail, episodeSlug: "episode-4" });
    expect(first).toMatchObject({
      ok: true,
      status: "promoted",
      sourceId,
      mediaAsset: { id: mediaAssetId },
      targetNestSlug: projectSlug,
      targetResolvedFrom: "canonical-session-project",
      handoffReceipt: {
        projectId,
        idempotent: false,
        sessionContext: { roomId, projectId, projectSlug, tagSnapshot: [{ label: "Proof listen" }] },
      },
      episodeAttachment: { status: "attached-to-episode-production", episodeSlug: "episode-4" },
    });
    expect(first.ok && first.mediaAsset.id).toBe(mediaAssetId);
    expect(first.ok && first.sourceId).toBe(sourceId);
    const jobsAfterFirst = await prisma.studioWorkflowJob.count({ where: { projectId, assetId: mediaAssetId } });

    const second = await promoteRecordingAssetToStudioMedia({ prisma, recordingAssetId, actorUserId, actorEmail, episodeSlug: "episode-4" });
    expect(second).toMatchObject({
      ok: true,
      status: "already-promoted",
      handoffReceipt: { projectId, idempotent: true },
      episodeAttachment: { status: "already-attached-to-episode-production" },
    });
    const [attachmentCount, sourceCount, mediaCount, jobsAfterSecond, production] = await Promise.all([
      prisma.studioAssetAttachment.count({ where: { projectId, assetId: mediaAssetId } }),
      prisma.studioVideoSource.count({ where: { id: sourceId } }),
      prisma.studioMediaAsset.count({ where: { id: mediaAssetId } }),
      prisma.studioWorkflowJob.count({ where: { projectId, assetId: mediaAssetId } }),
      prisma.studioEpisodeProduction.findUniqueOrThrow({ where: { projectId_slug: { projectId, slug: "episode-4" } } }),
    ]);
    expect({ attachmentCount, sourceCount, mediaCount, jobsAfterSecond }).toEqual({ attachmentCount: 1, sourceCount: 1, mediaCount: 1, jobsAfterSecond: jobsAfterFirst });
    const importedMedia = Array.isArray((production.productionJson as any)?.importedMedia) ? (production.productionJson as any).importedMedia : [];
    expect(importedMedia).toHaveLength(1);
    expect(importedMedia[0]).toMatchObject({ metadata: { sessionContext: { roomId, projectId, projectSlug, tagIds: [expect.any(String)] } } });
    const attachment = await prisma.studioAssetAttachment.findUniqueOrThrow({ where: { projectId_assetId: { projectId, assetId: mediaAssetId } } });
    expect(attachment.metadataJson).toMatchObject({
      handoffKind: "capture-session-to-studio",
      sessionContext: { roomId, projectId, projectSlug, tagSnapshot: [{ label: "Proof listen" }] },
      boundaries: { copiedBlob: false, mutatedOriginal: false, externalPublished: false, canonicalTagsRemainOnSession: true },
    });

    const inventoryResponse = await readEpisodeInventory(new Request(`http://local.test/api/media-vault/episode-inventory?projectSlug=${projectSlug}&episodeSlug=episode-4`));
    expect(inventoryResponse.status).toBe(200);
    const inventory = await inventoryResponse.json();
    expect(inventory).toMatchObject({
      ok: true,
      project: { id: projectId, slug: projectSlug, name: "High Ground Odyssey handoff" },
      importedMedia: [{
        id: mediaAssetId,
        recordingAssetId,
        sessionContext: { roomId, projectId, projectSlug, tagSnapshot: [{ label: "Proof listen" }] },
        asset: { attachments: [{ id: attachment.id, nestTitle: "High Ground Odyssey handoff" }] },
      }],
      boundaries: { sideEffectFree: true, noOriginalMutation: true, noExternalMutation: true, inventoryOnly: true },
    });
  });
});
