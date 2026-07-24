import "server-only";

import { isRetryableCaptureRoomTransactionError } from "@/lib/server/capture-room-state-ledger";
import { toGcsUri } from "@/lib/server/gcs";
import { recordMobileCaptureIngestion } from "@/lib/server/mobile-capture-records";
import type {
  MobileCaptureObjectEvidence,
  MobileCaptureResumableFinalizationEvidence,
  MobileCaptureResumableManifest,
} from "@/lib/server/mobile-capture-resumable-store";

export type MobileCaptureProcessingDecision = {
  disposition: "HELD" | "RELEASED";
  reasonCode: string | null;
  reason: string | null;
  startReceiptId: string | null;
  consentVersion: string | null;
  transcriptDisposition: "HELD" | "RELEASED";
  transcriptReasonCode: string | null;
  transcriptReason: string | null;
  releaseAudit?: {
    releasedByUserId: string;
    releaseReason: string;
    releasedAt: string;
  } | null;
  transcriptReleaseAudit?: {
    releasedByUserId: string;
    releaseReason: string;
    releasedAt: string;
  } | null;
};

function asObject(value: unknown): Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function parsedSegments(value: string | null) {
  if (!value) return [];
  try {
    return JSON.parse(value);
  } catch {
    return { raw: value };
  }
}

function evidenceFromReceipt(receipt: any) {
  const evidence = asObject(asObject(receipt?.metadataJson).evidence);
  return Object.keys(evidence).length > 0
    ? evidence as MobileCaptureResumableFinalizationEvidence
    : null;
}

function finalizationReceiptMetadata(args: {
  priorReceipt: any;
  manifest: MobileCaptureResumableManifest;
  object: MobileCaptureObjectEvidence;
  processingDecision: MobileCaptureProcessingDecision;
  evidence: MobileCaptureResumableFinalizationEvidence;
}) {
  const priorMetadata = asObject(args.priorReceipt?.metadataJson);
  const originalDecision = asObject(priorMetadata.originalDecision);
  const immutableUploadBinding = asObject(priorMetadata.immutableUploadBinding);
  return {
    ...priorMetadata,
    immutableUploadBinding: Object.keys(immutableUploadBinding).length > 0
      ? immutableUploadBinding
      : {
          uploadSessionId: args.manifest.uploadSessionId,
          captureId: args.manifest.captureId,
          actorUserId: args.manifest.actorUserId,
          roomId: args.manifest.callRoomId,
          startReceiptId: args.processingDecision.startReceiptId,
          consentVersion: args.processingDecision.consentVersion,
          sha256: args.manifest.sha256,
          bucketName: args.object.bucketName,
          objectName: args.object.objectName,
          generation: args.object.generation,
          sizeBytes: args.object.sizeBytes,
        },
    originalDecision: Object.keys(originalDecision).length > 0
      ? originalDecision
      : {
          capturedAt: new Date().toISOString(),
          processingDisposition: args.processingDecision.disposition,
          holdReasonCode: args.processingDecision.reasonCode,
          holdReason: args.processingDecision.reason,
          transcriptDisposition: args.processingDecision.transcriptDisposition,
          transcriptHoldReasonCode: args.processingDecision.transcriptReasonCode,
          transcriptHoldReason: args.processingDecision.transcriptReason,
          initialRoomReadiness: args.manifest.initialRoomReadiness,
          legacyHistoricalEvidence:
            args.manifest.finalization?.legacyHistoricalEvidence ?? null,
        },
    latestDecision: {
      capturedAt: new Date().toISOString(),
      processingDisposition: args.processingDecision.disposition,
      transcriptDisposition: args.processingDecision.transcriptDisposition,
      releaseAudit: args.processingDecision.releaseAudit ?? null,
      transcriptReleaseAudit: args.processingDecision.transcriptReleaseAudit ?? null,
    },
    evidence: args.evidence,
  };
}

async function serializableFinalizationTransaction<T>(
  prisma: any,
  operation: (transaction: any) => Promise<T>,
): Promise<T> {
  const maximumAttempts = 4;
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: "Serializable",
        maxWait: 10_000,
        timeout: 30_000,
      });
    } catch (error) {
      if (attempt === maximumAttempts || !isRetryableCaptureRoomTransactionError(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 20));
    }
  }
  throw new Error("Mobile capture finalization retry loop exited unexpectedly.");
}

async function lockUploadFinalization(transaction: any, uploadSessionId: string) {
  // Parameterized advisory lock prevents duplicate source/media creation for
  // the same upload even before its normalized receipt row exists.
  await transaction.$queryRawUnsafe(
    "SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended($1, 0))",
    uploadSessionId,
  );
}

async function createOrReuseStudioMedia(args: {
  transaction: any;
  manifest: MobileCaptureResumableManifest;
  object: MobileCaptureObjectEvidence;
}) {
  const { transaction, manifest, object } = args;
  const localDevelopment = manifest.storageBackend === "local-development";
  const provider = localDevelopment ? "capture-recording" : "gcs";
  const cloudProvider = localDevelopment ? "local-development" : "gcs";
  const immutableProviderSourceId = localDevelopment
    ? object.localFilePath
    : toGcsUri(object.bucketName, object.objectName, object.generation);
  if (!immutableProviderSourceId) {
    throw new Error("Verified Capture storage is missing its immutable playback location.");
  }
  const existingSource = await transaction.studioVideoSource.findFirst({
    where: {
      provider,
      providerSourceId: immutableProviderSourceId,
    },
    orderBy: { createdAt: "asc" },
  });

  const source = existingSource || await transaction.studioVideoSource.create({
    data: {
      provider,
      providerSourceId: immutableProviderSourceId,
      url: "pending",
      title: `Quipsly Capture [${manifest.projectSlug}/${manifest.episodeSlug || "session"}] ${manifest.fileName}`,
    },
  });
  const playbackUrl = `/api/ingest/media/${source.id}`;
  if (source.url !== playbackUrl) {
    await transaction.studioVideoSource.update({
      where: { id: source.id },
      data: { url: playbackUrl },
    });
  }

  const existingMediaAsset = await transaction.studioMediaAsset.findFirst({
    where: {
      rawAssetId: source.id,
      cloudProvider,
      isProxy: false,
    },
    orderBy: { createdAt: "asc" },
  });
  const mediaAsset = existingMediaAsset
    ? await transaction.studioMediaAsset.update({
        where: { id: existingMediaAsset.id },
        data: {
          filename: manifest.fileName,
          url: playbackUrl,
          mimeType: manifest.contentType,
          sizeBytes: BigInt(object.sizeBytes),
          isGlobal: false,
          isProxy: false,
          projects: { connect: { id: manifest.projectId } },
        },
      })
    : await transaction.studioMediaAsset.create({
        data: {
          filename: manifest.fileName,
          url: playbackUrl,
          mimeType: manifest.contentType,
          sizeBytes: BigInt(object.sizeBytes),
          isGlobal: false,
          isProxy: false,
          cloudProvider,
          rawAssetId: source.id,
          projects: { connect: { id: manifest.projectId } },
        },
      });

  return { source, mediaAsset, playbackUrl };
}

async function attachEpisodeMediaWithoutLostUpdate(args: {
  transaction: any;
  manifest: MobileCaptureResumableManifest;
  object: MobileCaptureObjectEvidence;
  source: any;
  mediaAsset: any;
  playbackUrl: string;
  captureRecords: any;
}) {
  const { transaction, manifest, object, source, mediaAsset, playbackUrl, captureRecords } = args;
  if (!manifest.episodeSlug) return;

  const productionKey = await transaction.studioEpisodeProduction.findFirst({
    where: {
      slug: manifest.episodeSlug,
      project: { slug: manifest.projectSlug },
    },
    select: { id: true },
  });
  if (!productionKey) return;

  // Serialize all writers to this episode projection. Serializable retry is
  // still required when a waiter inherited an older transaction snapshot.
  await transaction.$queryRawUnsafe(
    'SELECT "id" FROM "StudioEpisodeProduction" WHERE "id" = $1 FOR UPDATE',
    productionKey.id,
  );

  const existingAttachment = await transaction.mobileCaptureEpisodeAttachment.findUnique({
    where: { uploadSessionId: manifest.uploadSessionId },
  });
  if (existingAttachment) return;

  const production = await transaction.studioEpisodeProduction.findUnique({
    where: { id: productionKey.id },
    select: { id: true, timelineJson: true },
  });
  if (!production) return;

  const timelineJson = asObject(production.timelineJson);
  const importedMedia = Array.isArray(timelineJson.importedMedia)
    ? [...timelineJson.importedMedia]
    : [];
  const alreadyAttached = importedMedia.some((entry) => {
    const record = asObject(entry);
    return record.sourceId === source.id || record.storageUri === manifest.storageUri;
  });

  if (!alreadyAttached) {
    importedMedia.push({
      id: mediaAsset.id,
      sourceId: source.id,
      projectSlug: manifest.projectSlug,
      episodeSlug: manifest.episodeSlug,
      originalName: manifest.fileName,
      contentType: manifest.contentType,
      size: object.sizeBytes,
      kind: manifest.sourceType,
      bucketName: manifest.bucketName,
      objectName: manifest.objectName,
      storageBackend: manifest.storageBackend,
      storageUri: manifest.storageUri,
      gcsUri: manifest.gcsUri,
      playbackUrl,
      importedAt: new Date().toISOString(),
      source: "quipsly-capture-resumable-v2",
      sha256: manifest.sha256,
      sync: {
        status: "ready-to-sync",
        recordingSegments: parsedSegments(manifest.recordingSegmentsJson),
        callRoomId: manifest.callRoomId,
        participantId: captureRecords.participantId,
        recordingConsentId: captureRecords.consentId,
        recordingConsentGranted: captureRecords.consentStatus === "GRANTED",
        recordingAssetId: captureRecords.recordingAssetId,
        capturePurpose: manifest.capturePurpose,
      },
      proxy: { status: "not-required" },
    });

    await transaction.studioEpisodeProduction.update({
      where: { id: production.id },
      data: {
        timelineJson: {
          ...timelineJson,
          importedMedia,
        },
      },
    });
  }

  await transaction.mobileCaptureEpisodeAttachment.create({
    data: {
      uploadSessionId: manifest.uploadSessionId,
      productionId: production.id,
      mediaAssetId: mediaAsset.id,
      sourceId: source.id,
    },
  });
}

function captureRecordInput(args: {
  transaction: any;
  manifest: MobileCaptureResumableManifest;
  object: MobileCaptureObjectEvidence;
  actorIsStaff: boolean;
  processingDecision: MobileCaptureProcessingDecision;
  mediaAssetId?: string | null;
  sourceId?: string | null;
}) {
  const { transaction, manifest, object, processingDecision } = args;
  return {
    prisma: transaction,
    actorUserId: manifest.actorUserId,
    actorIsStaff: args.actorIsStaff,
    sessionId: manifest.uploadSessionId,
    fileName: manifest.fileName,
    contentType: manifest.contentType,
    sizeBytes: object.sizeBytes,
    checksumSha256: manifest.sha256,
    exactBytesVerified: true,
    provider: manifest.storageBackend,
    storageBucket: manifest.bucketName,
    storageObjectPath: manifest.objectName,
    storageGeneration: object.generation,
    storageCrc32c: object.crc32c,
    projectSlug: manifest.projectSlug,
    episodeSlug: manifest.episodeSlug,
    sourceType: manifest.sourceType,
    callRoomId: manifest.callRoomId,
    participantId: manifest.participantId,
    recordingConsentId: manifest.recordingConsentId,
    recordingAssetId: manifest.recordingAssetId,
    capturePurpose: manifest.capturePurpose,
    startedAt: manifest.startedAt,
    stoppedAt: manifest.stoppedAt,
    segmentsJson: manifest.recordingSegmentsJson,
    totalChunks: 1,
    mediaAssetId: args.mediaAssetId ?? null,
    sourceId: args.sourceId ?? null,
    processingDisposition: processingDecision.disposition,
    processingHoldReasonCode: processingDecision.reasonCode,
    processingHoldReason: processingDecision.reason,
    transcriptionDisposition: processingDecision.transcriptDisposition,
    transcriptionHoldReasonCode: processingDecision.transcriptReasonCode,
    transcriptionHoldReason: processingDecision.transcriptReason,
  } as const;
}

function finalizationEvidence(args: {
  captureRecords: any;
  processingDecision: MobileCaptureProcessingDecision;
  sourceId: string | null;
  mediaAssetId: string | null;
}): MobileCaptureResumableFinalizationEvidence {
  return {
    sourceId: args.sourceId,
    mediaAssetId: args.mediaAssetId,
    roomId: args.captureRecords.roomId,
    participantId: args.captureRecords.participantId,
    consentId: args.captureRecords.consentId,
    consentStatus: args.captureRecords.consentStatus,
    recordingAssetId: args.captureRecords.recordingAssetId,
    recordingAssetStatus: args.captureRecords.recordingAssetStatus,
    transcriptJobId: args.captureRecords.transcriptJobId,
    transcriptJobStatus: args.captureRecords.transcriptJobStatus,
    processingDisposition: args.processingDecision.disposition,
    holdReasonCode: args.processingDecision.reasonCode,
    holdReason: args.processingDecision.reason,
    startReceiptId: args.processingDecision.startReceiptId,
    consentVersion: args.processingDecision.consentVersion,
    transcriptDisposition: args.processingDecision.transcriptDisposition,
    transcriptHoldReasonCode: args.processingDecision.transcriptReasonCode,
    transcriptHoldReason: args.processingDecision.transcriptReason,
    releasedByUserId: args.processingDecision.releaseAudit?.releasedByUserId ?? null,
    releaseReason: args.processingDecision.releaseAudit?.releaseReason ?? null,
    releasedAt: args.processingDecision.releaseAudit?.releasedAt ?? null,
    transcriptReleasedByUserId: args.processingDecision.transcriptReleaseAudit?.releasedByUserId ?? null,
    transcriptReleaseReason: args.processingDecision.transcriptReleaseAudit?.releaseReason ?? null,
    transcriptReleasedAt: args.processingDecision.transcriptReleaseAudit?.releasedAt ?? null,
  };
}

export async function finalizeMobileCaptureDatabaseEvidence(input: {
  prisma: any;
  manifest: MobileCaptureResumableManifest;
  object: MobileCaptureObjectEvidence;
  actorIsStaff: boolean;
  processingDecision: MobileCaptureProcessingDecision;
}): Promise<MobileCaptureResumableFinalizationEvidence> {
  const { prisma, manifest, object, processingDecision } = input;

  return serializableFinalizationTransaction(prisma, async (transaction) => {
    await lockUploadFinalization(transaction, manifest.uploadSessionId);

    const priorReceipt = await transaction.mobileCaptureFinalizationReceipt.findUnique({
      where: { uploadSessionId: manifest.uploadSessionId },
    });
    const priorEvidence = evidenceFromReceipt(priorReceipt);
    if (priorReceipt?.processingDisposition === "RELEASED" && priorEvidence) {
      const transcriptUpgradeRequested =
        priorEvidence.transcriptDisposition === "HELD"
        && processingDecision.transcriptDisposition === "RELEASED"
        && Boolean(processingDecision.transcriptReleaseAudit);
      if (!transcriptUpgradeRequested) return priorEvidence;
    }
    if (
      priorReceipt?.processingDisposition === "HELD"
      && processingDecision.disposition === "HELD"
      && priorEvidence
    ) {
      return priorEvidence;
    }
    if (
      priorReceipt?.processingDisposition === "HELD"
      && processingDecision.disposition === "RELEASED"
      && !processingDecision.releaseAudit
    ) {
      throw new Error("A held capture requires an explicit audited release before processing.");
    }

    if (processingDecision.disposition === "HELD") {
      const captureRecords = await recordMobileCaptureIngestion(captureRecordInput({
        transaction,
        manifest,
        object,
        actorIsStaff: input.actorIsStaff,
        processingDecision,
      }));
      const evidence = finalizationEvidence({
        captureRecords,
        processingDecision,
        sourceId: null,
        mediaAssetId: null,
      });
      const receiptMetadata = finalizationReceiptMetadata({
        priorReceipt,
        manifest,
        object,
        processingDecision,
        evidence,
      });
      await transaction.mobileCaptureFinalizationReceipt.upsert({
        where: { uploadSessionId: manifest.uploadSessionId },
        create: {
          uploadSessionId: manifest.uploadSessionId,
          captureId: manifest.captureId,
          roomId: manifest.callRoomId,
          actorUserId: manifest.actorUserId,
          startReceiptId: processingDecision.startReceiptId,
          consentVersion: processingDecision.consentVersion,
          processingDisposition: "HELD",
          transcriptDisposition: "HELD",
          holdReasonCode: processingDecision.reasonCode,
          holdReason: processingDecision.reason,
          transcriptHoldReasonCode: processingDecision.transcriptReasonCode,
          transcriptHoldReason: processingDecision.transcriptReason,
          recordingAssetId: evidence.recordingAssetId,
          transcriptJobId: evidence.transcriptJobId,
          metadataJson: receiptMetadata,
        },
        update: {
          processingDisposition: "HELD",
          transcriptDisposition: "HELD",
          holdReasonCode: processingDecision.reasonCode,
          holdReason: processingDecision.reason,
          transcriptHoldReasonCode: processingDecision.transcriptReasonCode,
          transcriptHoldReason: processingDecision.transcriptReason,
          recordingAssetId: evidence.recordingAssetId,
          transcriptJobId: evidence.transcriptJobId,
          metadataJson: receiptMetadata,
        },
      });
      return evidence;
    }

    const studioMedia = await createOrReuseStudioMedia({ transaction, manifest, object });
    const captureRecords = await recordMobileCaptureIngestion(captureRecordInput({
      transaction,
      manifest,
      object,
      actorIsStaff: input.actorIsStaff,
      processingDecision,
      mediaAssetId: studioMedia.mediaAsset.id,
      sourceId: studioMedia.source.id,
    }));
    await attachEpisodeMediaWithoutLostUpdate({
      transaction,
      manifest,
      object,
      ...studioMedia,
      captureRecords,
    });
    const evidence = finalizationEvidence({
      captureRecords,
      processingDecision,
      sourceId: studioMedia.source.id,
      mediaAssetId: studioMedia.mediaAsset.id,
    });
    evidence.releasedByUserId = priorReceipt?.releasedByUserId
      ?? evidence.releasedByUserId
      ?? null;
    evidence.releaseReason = priorReceipt?.releaseReason
      ?? evidence.releaseReason
      ?? null;
    evidence.releasedAt = priorReceipt?.releasedAt?.toISOString?.()
      ?? evidence.releasedAt
      ?? null;
    evidence.transcriptReleasedByUserId = priorReceipt?.transcriptReleasedByUserId
      ?? evidence.transcriptReleasedByUserId
      ?? null;
    evidence.transcriptReleaseReason = priorReceipt?.transcriptReleaseReason
      ?? evidence.transcriptReleaseReason
      ?? null;
    evidence.transcriptReleasedAt = priorReceipt?.transcriptReleasedAt?.toISOString?.()
      ?? evidence.transcriptReleasedAt
      ?? null;
    const receiptMetadata = finalizationReceiptMetadata({
      priorReceipt,
      manifest,
      object,
      processingDecision,
      evidence,
    });
    await transaction.mobileCaptureFinalizationReceipt.upsert({
      where: { uploadSessionId: manifest.uploadSessionId },
      create: {
        uploadSessionId: manifest.uploadSessionId,
        captureId: manifest.captureId,
        roomId: manifest.callRoomId,
        actorUserId: manifest.actorUserId,
        startReceiptId: processingDecision.startReceiptId,
        consentVersion: processingDecision.consentVersion,
        processingDisposition: "RELEASED",
        transcriptDisposition: processingDecision.transcriptDisposition,
        transcriptHoldReasonCode: processingDecision.transcriptReasonCode,
        transcriptHoldReason: processingDecision.transcriptReason,
        sourceId: evidence.sourceId,
        mediaAssetId: evidence.mediaAssetId,
        recordingAssetId: evidence.recordingAssetId,
        transcriptJobId: evidence.transcriptJobId,
        releasedByUserId: processingDecision.releaseAudit?.releasedByUserId ?? null,
        releaseReason: processingDecision.releaseAudit?.releaseReason ?? null,
        releasedAt: processingDecision.releaseAudit?.releasedAt
          ? new Date(processingDecision.releaseAudit.releasedAt)
          : null,
        transcriptReleasedByUserId: processingDecision.transcriptReleaseAudit?.releasedByUserId ?? null,
        transcriptReleaseReason: processingDecision.transcriptReleaseAudit?.releaseReason ?? null,
        transcriptReleasedAt: processingDecision.transcriptReleaseAudit?.releasedAt
          ? new Date(processingDecision.transcriptReleaseAudit.releasedAt)
          : null,
        metadataJson: receiptMetadata,
      },
      update: {
        startReceiptId: processingDecision.startReceiptId,
        consentVersion: processingDecision.consentVersion,
        processingDisposition: "RELEASED",
        transcriptDisposition: processingDecision.transcriptDisposition,
        holdReasonCode: null,
        holdReason: null,
        transcriptHoldReasonCode: processingDecision.transcriptReasonCode,
        transcriptHoldReason: processingDecision.transcriptReason,
        sourceId: evidence.sourceId,
        mediaAssetId: evidence.mediaAssetId,
        recordingAssetId: evidence.recordingAssetId,
        transcriptJobId: evidence.transcriptJobId,
        releasedByUserId: priorReceipt?.releasedByUserId
          ?? processingDecision.releaseAudit?.releasedByUserId
          ?? null,
        releaseReason: priorReceipt?.releaseReason
          ?? processingDecision.releaseAudit?.releaseReason
          ?? null,
        releasedAt: priorReceipt?.releasedAt
          ?? (processingDecision.releaseAudit?.releasedAt
            ? new Date(processingDecision.releaseAudit.releasedAt)
            : null),
        transcriptReleasedByUserId: priorReceipt?.transcriptReleasedByUserId
          ?? processingDecision.transcriptReleaseAudit?.releasedByUserId
          ?? null,
        transcriptReleaseReason: priorReceipt?.transcriptReleaseReason
          ?? processingDecision.transcriptReleaseAudit?.releaseReason
          ?? null,
        transcriptReleasedAt: priorReceipt?.transcriptReleasedAt
          ?? (processingDecision.transcriptReleaseAudit?.releasedAt
            ? new Date(processingDecision.transcriptReleaseAudit.releasedAt)
            : null),
        metadataJson: receiptMetadata,
      },
    });
    return evidence;
  });
}
