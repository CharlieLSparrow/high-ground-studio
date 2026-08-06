import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import {
  captureSourceRecoveryDecisionId,
  captureSourceRecoveryRequestSha256,
  importedMediaCaptureGroupId,
  importedMediaRecordingAssetId,
  projectCaptureSourceRecovery,
} from "@/lib/episode-production/capture-source-recovery";
import {
  canonicalEpisodeImportedMedia,
} from "@/lib/episode-production/imported-media";
import { getPrismaClient } from "@/lib/prisma";
import { inspectImmutableStudioMediaSource } from "@/lib/server/episode-collaboration-proxy";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";
import { parseGcsUri } from "@/lib/server/gcs";
import { mobileCaptureMediaProcessingGate } from "@/lib/server/mobile-capture-processing-gates";
import { expectedSourceRequestSha256, expectedSourceSnapshot } from "@/lib/server/session-source-expectations";
import { queueAudioSignalProfile } from "@/lib/server/audio-signal-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", Vary: "Authorization, Cookie" };

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function text(value: unknown, maximum = 500) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function response(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: PRIVATE_HEADERS });
}

function storageBinding(evidence: Awaited<ReturnType<typeof inspectImmutableStudioMediaSource>>) {
  const gcs = parseGcsUri(evidence.locator);
  if (gcs) return { bucketName: gcs.bucketName, objectName: gcs.objectName };
  return { bucketName: "local", objectName: evidence.locator };
}

function sourceKind(kind: string) {
  if (kind === "LOCAL_VIDEO") return "VIDEO" as const;
  if (kind === "SCREEN_REFERENCE") return "SCREEN" as const;
  return "AUDIO" as const;
}

function importedKindMatchesRecording(imported: JsonRecord, recordingKind: string) {
  const kind = text(imported.kind, 20).toLowerCase();
  const contentType = text(imported.contentType, 120).toLowerCase();
  if (recordingKind === "LOCAL_VIDEO") return kind === "video" || contentType.startsWith("video/");
  if (recordingKind === "SCREEN_REFERENCE") return kind === "video" || contentType.startsWith("video/");
  return kind === "audio" || contentType.startsWith("audio/");
}

function recoveryManifest(value: unknown) {
  return record(record(value).captureSourceRecovery);
}

export async function POST(request: Request) {
  let body: JsonRecord;
  try {
    body = await request.json() as JsonRecord;
  } catch {
    return response({ ok: false, code: "RECOVERY_JSON_REQUIRED", error: "A JSON recovery request is required." }, 400);
  }
  const projectSlug = text(body.projectSlug, 160);
  const episodeSlug = text(body.episodeSlug, 160);
  const captureGroupId = text(body.captureGroupId, 64).toLowerCase();
  const originalRecordingAssetId = text(body.originalRecordingAssetId, 160);
  const importedMediaAssetId = text(body.importedMediaAssetId, 160);
  const sourceId = text(body.sourceId, 160);
  const reason = text(body.reason, 500);
  const requestId = text(body.requestId, 64).toLowerCase();
  const authorityConfirmed = body.authorityConfirmed === true;
  if (!projectSlug || !episodeSlug || !UUID.test(captureGroupId) || !originalRecordingAssetId || !importedMediaAssetId || !sourceId || !UUID.test(requestId)) {
    return response({ ok: false, code: "RECOVERY_IDENTITY_REQUIRED", error: "Project, episode, capture group, original source, imported backup, source, and request identities are required." }, 400);
  }
  if (reason.length < 12 || !authorityConfirmed) {
    return response({ ok: false, code: "RECOVERY_AUTHORITY_REQUIRED", error: "Confirm that the backup belongs to this recorded session and provide a specific recovery reason." }, 400);
  }

  const prisma = getPrismaClient();
  const access = await resolveEpisodeProductionAccess({ request, projectSlug, action: "write", prisma });
  if (!access.allowed) return response({ ok: false, code: access.code, error: access.error }, access.status);
  if (!access.actor.id || !access.access.projectId) {
    return response({ ok: false, code: "RECOVERY_ACTOR_REQUIRED", error: "A canonical Nest user and project identity are required for an auditable recovery decision." }, 409);
  }

  const requestShape = {
    schema: "quipsly-capture-source-recovery-request-v1",
    requestId,
    projectId: access.access.projectId,
    projectSlug,
    episodeSlug,
    captureGroupId,
    originalRecordingAssetId,
    importedMediaAssetId,
    sourceId,
    reason,
    actorUserId: access.actor.id,
    actorEmail: access.actor.email,
    authorityConfirmed,
  };
  const requestSha256 = captureSourceRecoveryRequestSha256(requestShape);

  const production = await prisma.studioEpisodeProduction.findUnique({
    where: { projectId_slug: { projectId: access.access.projectId, slug: episodeSlug } },
    select: { id: true, projectId: true, productionJson: true, timelineJson: true, updatedAt: true },
  });
  if (!production) return response({ ok: false, code: "RECOVERY_EPISODE_NOT_FOUND", error: "The episode production does not exist." }, 404);
  const original = await prisma.recordingAsset.findUnique({
    where: { id: originalRecordingAssetId },
    include: { room: true, participant: true, sourceExpectation: { include: { revisions: { orderBy: { revision: "asc" } } } } },
  });
  if (!original || original.room.projectId !== production.projectId || original.room.episodeProductionId !== production.id || original.room.captureGroupId.toLowerCase() !== captureGroupId) {
    return response({ ok: false, code: "RECOVERY_ORIGINAL_MISMATCH", error: "The retained original does not belong to this exact Episode Room and capture group." }, 409);
  }
  const originalCaptureGroup = text(record(original.localManifestJson).captureGroupId, 64).toLowerCase() || original.room.captureGroupId.toLowerCase();
  if (originalCaptureGroup !== captureGroupId) {
    return response({ ok: false, code: "RECOVERY_CAPTURE_GROUP_MISMATCH", error: "The original source's immutable capture-group evidence does not match this take." }, 409);
  }
  const originalGate = await mobileCaptureMediaProcessingGate({ prisma, recordingAsset: original });
  if (!originalGate.allowed) {
    return response({ ok: false, code: originalGate.errorCode, error: originalGate.error }, 409);
  }

  const importedMedia = canonicalEpisodeImportedMedia(production.productionJson, production.timelineJson);
  const imported = importedMedia.map(record).find((asset) => text(asset.id, 160) === importedMediaAssetId && text(asset.sourceId, 160) === sourceId);
  if (!imported) return response({ ok: false, code: "RECOVERY_IMPORT_NOT_FOUND", error: "Import the backup into this episode before adopting it as a retained replacement." }, 404);
  if (importedMediaRecordingAssetId(imported)) {
    const existingId = importedMediaRecordingAssetId(imported);
    const existing = await prisma.recordingAsset.findUnique({ where: { id: existingId } });
    const manifest = recoveryManifest(existing?.localManifestJson);
    if (!existing || text(manifest.requestId, 64) !== requestId || text(manifest.requestSha256, 64) !== requestSha256) {
      return response({ ok: false, code: "RECOVERY_IMPORT_ALREADY_BOUND", error: "That imported asset already has a retained recording identity." }, 409);
    }
  }
  if (importedMediaCaptureGroupId(imported) && importedMediaCaptureGroupId(imported).toLowerCase() !== captureGroupId) {
    return response({ ok: false, code: "RECOVERY_IMPORT_CAPTURE_GROUP_MISMATCH", error: "That imported asset is already attributed to a different capture group." }, 409);
  }
  if (!importedKindMatchesRecording(imported, original.kind)) {
    return response({ ok: false, code: "RECOVERY_MEDIA_KIND_MISMATCH", error: "The backup must match the original audio or video source kind." }, 409);
  }
  const [mediaAsset, source, originalReceipts] = await Promise.all([
    prisma.studioMediaAsset.findFirst({
      where: { id: importedMediaAssetId, projects: { some: { id: production.projectId } }, isProxy: false },
      include: { assetAttachments: { where: { projectId: production.projectId } } },
    }),
    prisma.studioVideoSource.findUnique({ where: { id: sourceId } }),
    prisma.mobileCaptureFinalizationReceipt.findMany({ where: { recordingAssetId: original.id }, orderBy: { createdAt: "asc" } }),
  ]);
  if (!mediaAsset || mediaAsset.assetAttachments.length === 0 || !source?.providerSourceId || source.url !== `/api/ingest/media/${source.id}` || (mediaAsset.url !== source.url && !mediaAsset.assetAttachments.some((attachment) => text(record(attachment.metadataJson).sourceId, 160) === source.id))) {
    return response({ ok: false, code: "RECOVERY_IMMUTABLE_IMPORT_REQUIRED", error: "Recovery requires an exact imported original attached to this Nest and episode." }, 409);
  }
  const releaseReceipt = originalReceipts.find((receipt) => receipt.processingDisposition === "RELEASED");
  if (!releaseReceipt) {
    return response({ ok: false, code: "RECOVERY_RELEASE_RECEIPT_REQUIRED", error: "The original capture has no released immutable consent receipt to govern this backup." }, 409);
  }

  let evidence: Awaited<ReturnType<typeof inspectImmutableStudioMediaSource>>;
  try {
    evidence = await inspectImmutableStudioMediaSource(source.providerSourceId, mediaAsset.mimeType);
  } catch (error) {
    return response({ ok: false, code: "RECOVERY_SOURCE_VERIFICATION_FAILED", error: error instanceof Error ? error.message : "The imported backup could not be verified." }, 409);
  }
  const storage = storageBinding(evidence);
  const decidedAt = new Date().toISOString();
  const uploadSessionId = captureSourceRecoveryDecisionId(requestId, "upload");
  const replacementCaptureId = captureSourceRecoveryDecisionId(requestId, "capture");

  try {
    const saved = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtextextended(${original.roomId}, 0))`;
      const currentProduction = await tx.studioEpisodeProduction.findUnique({ where: { id: production.id }, select: { productionJson: true, timelineJson: true, updatedAt: true } });
      if (!currentProduction || currentProduction.updatedAt.getTime() !== production.updatedAt.getTime()) return { kind: "stale" as const };
      const roomAssets = await tx.recordingAsset.findMany({ where: { roomId: original.roomId }, select: { id: true, localManifestJson: true } });
      const replay = roomAssets.find((asset) => text(recoveryManifest(asset.localManifestJson).requestId, 64) === requestId);
      if (replay) {
        return text(recoveryManifest(replay.localManifestJson).requestSha256, 64) === requestSha256
          ? { kind: "replay" as const, recordingAssetId: replay.id, expectationId: text(recoveryManifest(replay.localManifestJson).expectationId, 160), productionJson: currentProduction.productionJson }
          : { kind: "conflict" as const };
      }

      let expectation = original.sourceExpectation
        ? await tx.callExpectedSource.findUnique({ where: { id: original.sourceExpectation.id } })
        : null;
      if (expectation && expectation.recordingAssetId !== original.id) return { kind: "slot-changed" as const };
      if (!expectation) {
        expectation = await tx.callExpectedSource.create({
          data: {
            roomId: original.roomId,
            participantId: original.participantId,
            createdByUserId: access.actor.id,
            label: `${original.fileName || "Retained source"} recovery slot`.slice(0, 160),
            sourceKind: sourceKind(original.kind),
            retentionRole: "REQUIRED_MASTER",
            expectedClientKind: "external",
            expectedDeviceLabel: text(imported.originalName, 160) || mediaAsset.filename,
            recordingAssetId: original.id,
            captureId: null,
            revision: 1,
            latestReason: "Recovery slot projected from a retained source after complete-decode failure.",
            metadataJson: json({ schema: "quipsly-capture-source-recovery-slot-v1", originalRecordingAssetId: original.id, captureGroupId }),
          },
        });
        const createRequestId = captureSourceRecoveryDecisionId(requestId, "create");
        const afterJson = expectedSourceSnapshot(expectation);
        await tx.callExpectedSourceRevision.create({ data: {
          requestId: createRequestId,
          requestSha256: expectedSourceRequestSha256({ requestId: createRequestId, action: "CREATE", roomId: original.roomId, actorUserId: access.actor.id, afterJson, recoveryRequestId: requestId }),
          expectationId: expectation.id,
          roomId: original.roomId,
          actorUserId: access.actor.id,
          action: "CREATE",
          revision: 1,
          beforeJson: {},
          afterJson: json(afterJson),
          reason: "Project the retained original as the immutable recovery slot baseline.",
        } });
      }

      const replacement = await tx.recordingAsset.create({ data: {
        roomId: original.roomId,
        participantId: original.participantId,
        kind: original.kind,
        status: "VERIFIED",
        fileName: mediaAsset.filename,
        contentType: evidence.contentType,
        byteSize: BigInt(evidence.sizeBytes),
        durationSeconds: mediaAsset.duration,
        storageBucket: storage.bucketName,
        storageObjectPath: storage.objectName,
        checksum: evidence.sha256,
        uploadedAt: new Date(decidedAt),
        verifiedAt: new Date(decidedAt),
        localManifestJson: json({
          schema: "quipsly-capture-source-recovery-manifest-v1",
          captureId: replacementCaptureId,
          captureGroupId,
          processingDisposition: "RELEASED",
          transcriptionDisposition: releaseReceipt.transcriptDisposition,
          captureSourceRecovery: {
            requestId,
            requestSha256,
            originalRecordingAssetId: original.id,
            replacementMediaAssetId: mediaAsset.id,
            replacementSourceId: source.id,
            expectationId: expectation.id,
            reason,
            authorityConfirmed: true,
            actorUserId: access.actor.id,
            actorEmail: access.actor.email,
            decidedAt,
            sourceLocator: evidence.locator,
            sourceGeneration: evidence.generation,
            sourceSha256: evidence.sha256,
            originalSourceMediaUnchanged: true,
          },
        }),
      } });

      const originalDecision = record(releaseReceipt.metadataJson).originalDecision;
      await tx.mobileCaptureFinalizationReceipt.create({ data: {
        uploadSessionId,
        captureId: replacementCaptureId,
        roomId: original.roomId,
        actorUserId: access.actor.id,
        startReceiptId: releaseReceipt.startReceiptId,
        consentVersion: releaseReceipt.consentVersion,
        processingDisposition: "RELEASED",
        transcriptDisposition: releaseReceipt.transcriptDisposition,
        sourceId: source.id,
        mediaAssetId: mediaAsset.id,
        recordingAssetId: replacement.id,
        releasedByUserId: access.actor.id,
        releaseReason: reason,
        releasedAt: new Date(decidedAt),
        transcriptReleasedByUserId: releaseReceipt.transcriptDisposition === "RELEASED" ? access.actor.id : null,
        transcriptReleaseReason: releaseReceipt.transcriptDisposition === "RELEASED" ? reason : null,
        transcriptReleasedAt: releaseReceipt.transcriptDisposition === "RELEASED" ? new Date(decidedAt) : null,
        metadataJson: json({
          schema: "quipsly-capture-source-recovery-finalization-v1",
          originalDecision,
          immutableUploadBinding: { uploadSessionId, roomId: original.roomId, sha256: evidence.sha256, bucketName: storage.bucketName, objectName: storage.objectName, sizeBytes: evidence.sizeBytes },
          recoveryAuthority: { requestId, requestSha256, originalRecordingAssetId: original.id, expectationId: expectation.id, reason, actorUserId: access.actor.id, actorEmail: access.actor.email, authorityConfirmed: true, decidedAt },
        }),
      } });

      const beforeUnbind = expectedSourceSnapshot(expectation);
      const unbound = await tx.callExpectedSource.update({ where: { id: expectation.id }, data: { recordingAssetId: null, captureId: null, revision: expectation.revision + 1, latestReason: reason } });
      const unbindRequestId = captureSourceRecoveryDecisionId(requestId, "unbind");
      await tx.callExpectedSourceRevision.create({ data: {
        requestId: unbindRequestId,
        requestSha256: expectedSourceRequestSha256({ requestId: unbindRequestId, action: "UNBIND", roomId: original.roomId, actorUserId: access.actor.id, expectationId: expectation.id, originalRecordingAssetId: original.id, reason }),
        expectationId: expectation.id,
        roomId: original.roomId,
        actorUserId: access.actor.id,
        action: "UNBIND",
        revision: unbound.revision,
        beforeJson: json(beforeUnbind),
        afterJson: json(expectedSourceSnapshot(unbound)),
        reason,
      } });
      const beforeBind = expectedSourceSnapshot(unbound);
      const bound = await tx.callExpectedSource.update({ where: { id: expectation.id }, data: { recordingAssetId: replacement.id, captureId: replacementCaptureId, revision: unbound.revision + 1, latestReason: reason } });
      const bindRequestId = captureSourceRecoveryDecisionId(requestId, "bind");
      await tx.callExpectedSourceRevision.create({ data: {
        requestId: bindRequestId,
        requestSha256: expectedSourceRequestSha256({ requestId: bindRequestId, action: "BIND", roomId: original.roomId, actorUserId: access.actor.id, expectationId: expectation.id, replacementRecordingAssetId: replacement.id, reason }),
        expectationId: expectation.id,
        roomId: original.roomId,
        actorUserId: access.actor.id,
        action: "BIND",
        revision: bound.revision,
        beforeJson: json(beforeBind),
        afterJson: json(expectedSourceSnapshot(bound)),
        reason,
      } });

      const nextProductionJson = projectCaptureSourceRecovery({
        productionJson: currentProduction.productionJson,
        timelineJson: currentProduction.timelineJson,
        projectSlug,
        episodeSlug,
        captureGroupId,
        originalRecordingAssetId: original.id,
        replacementRecordingAssetId: replacement.id,
        replacementMediaAssetId: mediaAsset.id,
        replacementSourceId: source.id,
        expectationId: expectation.id,
        requestId,
        requestSha256,
        sourceSha256: evidence.sha256,
        storageGeneration: evidence.generation,
        sourceLocator: evidence.locator,
        reason,
        actorUserId: access.actor.id,
        actorEmail: access.actor.email,
        decidedAt,
      });
      await tx.studioEpisodeProduction.update({ where: { id: production.id }, data: { productionJson: json(nextProductionJson) } });
      return { kind: "saved" as const, recordingAssetId: replacement.id, expectationId: expectation.id, productionJson: nextProductionJson };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 });

    if (saved.kind === "stale") return response({ ok: false, code: "RECOVERY_EPISODE_CHANGED", error: "The episode changed after backup verification. Refresh and retry; no recovery decision was written." }, 409);
    if (saved.kind === "conflict") return response({ ok: false, code: "RECOVERY_REQUEST_CONFLICT", error: "That request ID already belongs to a different recovery decision." }, 409);
    if (saved.kind === "slot-changed") return response({ ok: false, code: "RECOVERY_SLOT_CHANGED", error: "The retained source slot changed while recovery was being prepared. Refresh before selecting a replacement." }, 409);

    let signalProfile: unknown = null;
    try {
      signalProfile = await queueAudioSignalProfile({ prisma, projectSlug, assetId: mediaAsset.id, sourceId: source.id, actorEmail: access.actor.email });
    } catch (error) {
      signalProfile = { status: "not-queued", error: error instanceof Error ? error.message : "Complete decode could not be queued." };
    }
    return response({
      ok: true,
      idempotentReplay: saved.kind === "replay",
      replacement: { recordingAssetId: saved.recordingAssetId, mediaAssetId: mediaAsset.id, sourceId: source.id, expectationId: saved.expectationId, sourceSha256: evidence.sha256, storageGeneration: evidence.generation },
      productionJson: saved.productionJson,
      signalProfile,
      nextAction: "The backup is now the active retained master. Complete decode must prove signal before materialization.",
      boundaries: { originalSourceMediaUnchanged: true, recoveryHistoryAppendOnly: true, publicationNotStarted: true },
    }, saved.kind === "saved" ? 201 : 200);
  } catch (error) {
    console.error("[capture-source-recovery] failed", error);
    return response({ ok: false, code: "RECOVERY_UNAVAILABLE", error: "Quipsly could not adopt the backup master. The original and imported backup remain unchanged." }, 503);
  }
}
