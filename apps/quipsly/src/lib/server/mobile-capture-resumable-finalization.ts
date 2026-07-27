import "server-only";

import {
  canonicalEpisodeImportedMedia,
} from "@/lib/episode-production/imported-media";
import {
  ensureCaptureProxyProcessingQueued,
} from "@/lib/server/capture-proxy-processing";
import {
  buildCaptureSourceAlignmentProposal,
} from "@/lib/server/capture-source-alignment";
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

function dateIso(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function durationSeconds(startedAt: string | null, stoppedAt: string | null) {
  const start = startedAt ? Date.parse(startedAt) : Number.NaN;
  const stop = stoppedAt ? Date.parse(stoppedAt) : Number.NaN;
  if (!Number.isFinite(start) || !Number.isFinite(stop) || stop < start) {
    return null;
  }
  return (stop - start) / 1_000;
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
  if (
    existingAttachment
    && (
      existingAttachment.productionId !== productionKey.id
      || existingAttachment.mediaAssetId !== mediaAsset.id
      || existingAttachment.sourceId !== source.id
    )
  ) {
    throw new Error(
      "The immutable Capture episode attachment is bound to different source evidence.",
    );
  }

  const production = await transaction.studioEpisodeProduction.findUnique({
    where: { id: productionKey.id },
    select: { id: true, productionJson: true, timelineJson: true },
  });
  if (!production) return;

  const productionJson = asObject(production.productionJson);
  const canonicalImportedMediaCount = Array.isArray(
    productionJson.importedMedia,
  )
    ? productionJson.importedMedia.length
    : 0;
  const importedMedia = canonicalEpisodeImportedMedia(
    production.productionJson,
    production.timelineJson,
  );
  const recoveredLegacyCount = Math.max(
    0,
    importedMedia.length - canonicalImportedMediaCount,
  );
  const existingImportedIndex = importedMedia.findIndex((entry) => {
    const record = asObject(entry);
    const sync = asObject(record.sync);
    const recordingSync = asObject(sync.recordingSync);
    return record.id === mediaAsset.id
      || record.sourceId === source.id
      || record.storageUri === manifest.storageUri
      || sync.recordingAssetId === captureRecords.recordingAssetId
      || recordingSync.recordingAssetId === captureRecords.recordingAssetId;
  });
  const existingImported = existingImportedIndex >= 0
    ? asObject(importedMedia[existingImportedIndex])
    : {};
  const isVideo =
    manifest.sourceType === "video"
    || manifest.contentType.toLowerCase().startsWith("video/");
  const importRole = isVideo
    ? "participant-camera"
    : "spine-audio-candidate";
  const startReceipt = manifest.startReceiptId
    ? await transaction.captureRoomStateReceipt.findUnique({
        where: { receiptId: manifest.startReceiptId },
      })
    : null;
  const alignment = buildCaptureSourceAlignmentProposal({
    sourceProfile: manifest.sourceProfileJson
      ? JSON.parse(manifest.sourceProfileJson)
      : null,
    callRoomId: manifest.callRoomId,
    captureId: manifest.captureId,
    captureGroupId: manifest.captureGroupId,
    actorUserId: manifest.actorUserId,
    startReceiptId: manifest.startReceiptId,
    recordedStartedAt: manifest.startedAt,
    startReceipt,
  });
  const importedAt =
    typeof existingImported.importedAt === "string"
      ? existingImported.importedAt
      : new Date().toISOString();
  const recordingSync = {
    recordingAssetId: captureRecords.recordingAssetId,
    callRoomId: manifest.callRoomId,
    participantId: captureRecords.participantId,
    recordingConsentId: captureRecords.consentId,
    recordingConsentGranted:
      captureRecords.consentStatus === "GRANTED",
    recordedStartAt: dateIso(manifest.startedAt),
    recordedEndAt: dateIso(manifest.stoppedAt),
    durationSeconds: durationSeconds(
      manifest.startedAt,
      manifest.stoppedAt,
    ),
    recordingSegments: parsedSegments(
      manifest.recordingSegmentsJson,
    ),
    capturePurpose: manifest.capturePurpose,
    captureId: manifest.captureId,
    captureGroupId: manifest.captureGroupId,
    uploadSessionId: manifest.uploadSessionId,
    sourceVerification: "server-size-and-sha256",
    expectedSha256: manifest.sha256,
    storageGeneration: object.generation,
    reportedSourceProfile: manifest.sourceProfileJson
      ? JSON.parse(manifest.sourceProfileJson)
      : null,
    alignment,
    source: "quipsly-capture-resumable-v2",
  };

  const existingMetadata = asObject(existingImported.metadata);
  const existingSync = asObject(existingImported.sync);
  const existingProxy = asObject(existingImported.proxy);
  const existingProxyStatus =
    typeof existingProxy.status === "string"
      ? existingProxy.status
      : "";
  const proxyStatus = isVideo
    ? existingProxyStatus || "queued"
    : "not-required";
  const canonicalImportedSource = {
      ...existingImported,
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
      importedAt,
      source: "quipsly-capture-resumable-v2",
      importRole,
      sha256: manifest.sha256,
      metadata: {
        ...existingMetadata,
        recordingSync,
        localImport: {
          ...asObject(existingMetadata.localImport),
          promotedFrom: "MobileCaptureFinalizationReceipt",
          copiedBlob: false,
          mutatedOriginal: false,
          exactBytesVerified: true,
        },
      },
      sync: {
        ...existingSync,
        status: "ready-to-sync",
        recordingAssetId: captureRecords.recordingAssetId,
        suggestedRole: importRole,
        source: "quipsly-capture-resumable-v2",
        recordingSync,
        alignment,
        note: isVideo
          ? alignment.status === "proposal-ready"
            ? "The original is verified and attached. Its clock proposal still requires waveform and drift review; collaborative playback also requires the registered proxy."
            : "The original is verified and attached. Create a proxy, then align it from preserved clock and waveform evidence."
          : alignment.status === "proposal-ready"
            ? "The original is verified with a clock proposal. Correlate waveforms and approve drift before locking it to the episode spine."
            : "The original is verified and ready for reviewed alignment against the episode audio spine.",
      },
      proxy: {
        ...existingProxy,
        status: proxyStatus,
        note: isVideo
          ? existingProxyStatus === "ready"
            ? "The immutable source is safe and its registered proxy is ready for collaborative playback."
            : "The immutable video is safe, but collaborative playback waits for a registered media-vault proxy."
          : "This audio master does not require a video proxy.",
      },
    };

  if (existingImportedIndex >= 0) {
    importedMedia[existingImportedIndex] = canonicalImportedSource;
  } else {
    importedMedia.unshift(canonicalImportedSource);
  }

  await transaction.studioEpisodeProduction.update({
    where: { id: production.id },
    data: {
      productionJson: {
        ...productionJson,
        episodeProductionPayloadVersion: 1,
        projectSlug: manifest.projectSlug,
        episodeSlug: manifest.episodeSlug,
        importedMedia,
        importedMediaOwnership: {
          schema: "quipsly-episode-imported-media-v1",
          canonicalField:
            "StudioEpisodeProduction.productionJson.importedMedia",
          legacyTimelineReadThrough: recoveredLegacyCount > 0,
          recoveredLegacyCount,
        },
        lastCaptureSourceAttachedAt: importedAt,
        source: "quipsly-capture-resumable-v2",
      },
    },
  });

  await transaction.studioAssetAttachment.upsert({
    where: {
      projectId_assetId: {
        projectId: manifest.projectId,
        assetId: mediaAsset.id,
      },
    },
    create: {
      projectId: manifest.projectId,
      assetId: mediaAsset.id,
      role: importRole,
      source: "mobile-capture-finalization",
      createdByEmail: manifest.actorEmail,
      metadataJson: {
        uploadSessionId: manifest.uploadSessionId,
        captureId: manifest.captureId,
        captureGroupId: manifest.captureGroupId,
        recordingAssetId: captureRecords.recordingAssetId,
        sourceId: source.id,
        alignment,
        exactBytesVerified: true,
        copiedBlob: false,
        mutatedOriginal: false,
      },
    },
    update: {
      role: importRole,
      source: "mobile-capture-finalization",
      metadataJson: {
        uploadSessionId: manifest.uploadSessionId,
        captureId: manifest.captureId,
        captureGroupId: manifest.captureGroupId,
        recordingAssetId: captureRecords.recordingAssetId,
        sourceId: source.id,
        alignment,
        exactBytesVerified: true,
        copiedBlob: false,
        mutatedOriginal: false,
      },
    },
  });

  const workflowInput = {
    uploadSessionId: manifest.uploadSessionId,
    captureId: manifest.captureId,
    captureGroupId: manifest.captureGroupId,
    callRoomId: manifest.callRoomId,
    actorUserId: manifest.actorUserId,
    actorEmail: manifest.actorEmail,
    recordingAssetId: captureRecords.recordingAssetId,
    sourceId: source.id,
    projectSlug: manifest.projectSlug,
    episodeSlug: manifest.episodeSlug,
    mediaKind: isVideo ? "video" : "audio",
    bucketName: manifest.bucketName,
    objectName: manifest.objectName,
    objectGeneration: object.generation,
    sourceSha256: manifest.sha256,
    sourceSizeBytes: object.sizeBytes,
    sourceContentType: manifest.contentType,
    alignment,
    proxyPolicy: isVideo
      ? "proxy-required-before-collaborative-playback"
      : "audio-source-registered",
  };
  const existingWorkflow = await transaction.studioWorkflowJob.findFirst({
    where: {
      projectId: manifest.projectId,
      assetId: mediaAsset.id,
      type: isVideo ? "asset-proxy" : "asset-register",
      source: "mobile-capture-finalization",
    },
    select: { id: true, inputJson: true },
  });
  if (!existingWorkflow) {
    await transaction.studioWorkflowJob.create({
      data: {
        projectId: manifest.projectId,
        assetId: mediaAsset.id,
        type: isVideo ? "asset-proxy" : "asset-register",
        status: "queued",
        source: "mobile-capture-finalization",
        requestedByEmail: manifest.actorEmail,
        inputJson: workflowInput,
      },
    });
  } else {
    await transaction.studioWorkflowJob.update({
      where: { id: existingWorkflow.id },
      data: {
        requestedByEmail: manifest.actorEmail,
        inputJson: {
          ...asObject(existingWorkflow.inputJson),
          ...workflowInput,
        },
      },
    });
  }

  const recordingAsset = await transaction.recordingAsset.findUnique({
    where: { id: captureRecords.recordingAssetId },
    select: { localManifestJson: true },
  });
  await transaction.recordingAsset.update({
    where: { id: captureRecords.recordingAssetId },
    data: {
      localManifestJson: {
        ...asObject(recordingAsset?.localManifestJson),
        promotion: {
          status: "promoted-to-studio-media",
          mediaAssetId: mediaAsset.id,
          sourceId: source.id,
          playbackUrl,
          providerSourceId: source.providerSourceId,
          projectId: manifest.projectId,
          nestSlug: manifest.projectSlug,
          episodeSlug: manifest.episodeSlug,
          importRole,
          mediaKind: isVideo ? "video" : "audio",
          captureGroupId: manifest.captureGroupId,
          alignment,
          handoffReceipt: {
            version: 1,
            source: "StudioAssetAttachment",
          },
          promotedAt: importedAt,
          promotedByUserId: manifest.actorUserId,
          source: "mobile-capture-finalization",
        },
      },
    },
  });

  if (!existingAttachment) {
    await transaction.mobileCaptureEpisodeAttachment.create({
      data: {
        uploadSessionId: manifest.uploadSessionId,
        productionId: production.id,
        mediaAssetId: mediaAsset.id,
        sourceId: source.id,
      },
    });
  }
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
    captureGroupId: manifest.captureGroupId,
    sourceProfileJson: manifest.sourceProfileJson,
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

  const evidence = await serializableFinalizationTransaction(
    prisma,
    async (transaction) => {
    await lockUploadFinalization(transaction, manifest.uploadSessionId);

    const priorReceipt = await transaction.mobileCaptureFinalizationReceipt.findUnique({
      where: { uploadSessionId: manifest.uploadSessionId },
    });
    const priorEvidence = evidenceFromReceipt(priorReceipt);
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
    },
  );
  if (
    evidence.processingDisposition === "RELEASED"
    && (
      manifest.sourceType === "video"
      || manifest.contentType.toLowerCase().startsWith("video/")
    )
  ) {
    try {
      await ensureCaptureProxyProcessingQueued({
        prisma,
        manifest,
        object,
        finalization: evidence,
      });
    } catch (error) {
      console.error("[Capture Proxy] Unable to queue verified video", {
        uploadSessionId: manifest.uploadSessionId,
        mediaAssetId: evidence.mediaAssetId,
        reason: error instanceof Error ? error.message : "unknown",
      });
    }
  }
  return evidence;
}
