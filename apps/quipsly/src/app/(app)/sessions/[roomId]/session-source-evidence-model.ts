import { parseAudioSignalEvidence, type AudioTranscriptEvidence } from "@/lib/transcript-evidence";
import { verifyCaptureRecoveryLineage } from "@/lib/episode-production/capture-recovery-lineage";
import {
  parseAudioSignalProfileJob,
  parseAudioSignalProfileResult,
} from "@high-ground/quipsly-media-processing";

type UnknownRecord = Record<string, unknown>;

type RecordingAssetEvidenceRow = {
  id: string;
  roomId: string;
  fileName: string | null;
  kind: unknown;
  status: unknown;
  byteSize: bigint | number | string | null;
  storageBucket: string | null;
  storageObjectPath: string | null;
  checksum: string | null;
  verifiedAt: Date | string | null;
  recordedStartedAt: Date | string | null;
  recordedStoppedAt: Date | string | null;
  localManifestJson: unknown;
};

type FinalizationEvidenceRow = {
  uploadSessionId: string;
  captureId: string;
  roomId: string;
  actorUserId: string;
  startReceiptId: string | null;
  processingDisposition: string;
  transcriptDisposition: string;
  recordingAssetId: string | null;
  releaseReason?: string | null;
  releasedAt?: Date | string | null;
  transcriptReleaseReason?: string | null;
  transcriptReleasedAt?: Date | string | null;
  metadataJson: unknown;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type StateReceiptEvidenceRow = {
  receiptId: string;
  captureId: string | null;
  actorUserId: string;
  action: unknown;
  outcome: string;
  stateApplied: boolean;
  occurredAt: Date | string;
  receivedAt: Date | string;
};

type AudioSignalProfileJobRow = {
  id: string;
  assetId: string;
  type: string;
  status: string;
  inputJson: unknown;
  resultJson: unknown;
  error: string | null;
  completedAt: Date | string | null;
  updatedAt: Date | string;
};

export type SessionSourceEvidenceStatus =
  | "VERIFIED_MATCH"
  | "HELD"
  | "DRIFT"
  | "INCOMPLETE";

export type SessionSourceEvidence = {
  sources: Array<{
    recordingAssetId: string;
    fileName: string;
    kind: string;
    recordingStatus: string;
    status: SessionSourceEvidenceStatus;
    captureId: string | null;
    captureGroupId: string | null;
    uploadSessionId: string | null;
    startBoundary: { receiptId: string; occurredAt: string } | null;
    stopBoundary: { receiptId: string; occurredAt: string } | null;
    sourceOrigin: "CAPTURE" | "NEST_EXTERNAL_IMPORT" | "NEST_RECOVERY_REPLICA";
    boundaryAuthority?: "CAPTURE_RECEIPTS" | "STAFF_REVIEWED_EXTERNAL_IMPORT" | "AUDITED_RECOVERY_REPLICA" | null;
    cloud: {
      sha256: string | null;
      byteSize: string | null;
      generation: string | null;
      bucket: string | null;
      objectPath: string | null;
      verifiedAt: string | null;
    };
    captureRuntime: {
      appVersion: string | null;
      appBuild: string | null;
      deviceModel: string | null;
      operatingSystem: string | null;
      audioRoute: string | null;
      audioInputDataSource?: string | null;
      audioFormat?: {
        container: string | null;
        codec: string | null;
        sampleRateHz: number | null;
        channelCount: number | null;
        hardwareSampleRateHz: number | null;
        hardwareInputChannelCount: number | null;
        decodedAudioTrackCount: number | null;
        decodedSampleRateHz: number | null;
        decodedChannelCount: number | null;
        capturePipeline: string | null;
        pauseTimelinePolicy: string | null;
        signal: AudioTranscriptEvidence["audio"]["signal"];
      };
      videoFormat?: {
        requestedQuality: string | null;
        intentFulfilled: boolean | null;
        systemPressureAtStart: string | null;
        configured: {
          widthPixels: number | null;
          heightPixels: number | null;
          frameRate: number | null;
          codec: string | null;
          colorSpace: string | null;
          orientation: string | null;
          cameraPosition: string | null;
          rotationDegrees: number | null;
        };
        recorded: {
          videoTrackCount: number | null;
          encodedWidthPixels: number | null;
          encodedHeightPixels: number | null;
          presentationWidthPixels: number | null;
          presentationHeightPixels: number | null;
          frameRate: number | null;
          codec: string | null;
          rotationDegrees: number | null;
        };
      };
    };
    analysis?: {
      jobId: string;
      mediaAssetId: string;
      status: "queued" | "processing" | "output-ready" | "completed" | "blocked" | "failed";
      exactSourceBound: boolean;
      completeDecode: boolean;
      completedAt: string | null;
      updatedAt: string | null;
      media: {
        container: string;
        codec: string;
        sampleRateHz: number;
        channelCount: number;
        durationSeconds: number;
      } | null;
      signal: AudioTranscriptEvidence["audio"]["signal"];
      error: string | null;
      boundaries: {
        derivedEvidenceDoesNotMutateCaptureManifest: true;
        exactBytesBoundByAssetHashAndSize: true;
        sourceReplicaGenerationRemainsSeparate: true;
      };
    } | null;
    processingDisposition: string | null;
    transcriptDisposition: string | null;
    releaseAudit?: {
      releasedAt: string;
      reason: string;
      transcriptReleasedAt: string | null;
      transcriptReason: string | null;
    } | null;
    recoveryAudit?: {
      requestId: string;
      originalRecordingAssetId: string;
      expectationId: string;
      decidedAt: string;
      reason: string;
      importedSourceGeneration: string;
      durableReplicaGeneration: string;
      originalSourceMediaUnchanged: true;
    } | null;
    issues: string[];
  }>;
  counts: Record<SessionSourceEvidenceStatus, number>;
};

export type SessionSourceEvidenceReceipt = {
  schema: "quipsly-nest-source-evidence";
  version: 1;
  generatedAt: string;
  authority: "nest-independent-projection";
  roomId: string;
  phoneReceiptImportedAsAuthority: false;
  evidence: SessionSourceEvidence;
};

function object(value: unknown): UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function scalarText(value: unknown): string | null {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return text(value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function finiteScalar(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function boolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function iso(value: unknown): string | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  const normalized = text(value);
  if (!normalized) return null;
  const parsed = new Date(normalized);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function normalizedHash(value: unknown): string | null {
  const normalized = text(value)?.toLowerCase() ?? null;
  return normalized && /^[a-f0-9]{64}$/.test(normalized) ? normalized : null;
}

function sourceProfile(manifest: UnknownRecord) {
  return object(manifest.reportedSourceProfile);
}

function sourceRuntime(manifest: UnknownRecord) {
  const profile = sourceProfile(manifest);
  const systemName = text(profile.deviceSystemName);
  const systemVersion = text(profile.deviceSystemVersion);
  const routeName = text(profile.audioRouteName);
  const routeType = text(profile.audioRoutePortType);
  const recorded = object(profile.recordedMedia);
  const requestedQuality = text(profile.requestedVideoQuality);
  const configuredWidth = finiteNumber(profile.width);
  const configuredHeight = finiteNumber(profile.height);
  const recordedVideoTrackCount = finiteNumber(recorded.videoTrackCount);
  const hasVideoEvidence = Boolean(
    requestedQuality
    || configuredWidth
    || configuredHeight
    || text(profile.cameraPosition)
    || (recordedVideoTrackCount && recordedVideoTrackCount > 0),
  );
  return {
    appVersion: text(profile.captureAppVersion),
    appBuild: text(profile.captureAppBuild),
    deviceModel: text(profile.deviceModelIdentifier),
    operatingSystem: [systemName, systemVersion].filter(Boolean).join(" ") || null,
    audioRoute: [routeName, routeType].filter(Boolean).join(" · ") || null,
    audioInputDataSource: text(profile.audioInputDataSourceName),
    audioFormat: {
      container: text(profile.container),
      codec: text(profile.codec),
      sampleRateHz: finiteNumber(profile.audioSampleRate),
      channelCount: finiteNumber(profile.audioChannelCount),
      hardwareSampleRateHz: finiteNumber(profile.audioHardwareSampleRate),
      hardwareInputChannelCount: finiteNumber(profile.audioHardwareInputChannelCount),
      decodedAudioTrackCount: finiteNumber(recorded.audioTrackCount),
      decodedSampleRateHz: finiteNumber(recorded.audioSampleRate),
      decodedChannelCount: finiteNumber(recorded.audioChannelCount),
      capturePipeline: text(profile.audioCapturePipeline),
      pauseTimelinePolicy: text(profile.pauseTimelinePolicy),
      signal: parseAudioSignalEvidence(profile.audioSignal),
    },
    ...(hasVideoEvidence ? {
      videoFormat: {
        requestedQuality,
        intentFulfilled: boolean(profile.videoQualityIntentFulfilled),
        systemPressureAtStart: text(profile.videoSystemPressureAtStart),
        configured: {
          widthPixels: configuredWidth,
          heightPixels: configuredHeight,
          frameRate: finiteNumber(profile.nominalFrameRate),
          codec: text(profile.codec),
          colorSpace: text(profile.colorSpace),
          orientation: text(profile.orientation),
          cameraPosition: text(profile.cameraPosition),
          rotationDegrees: finiteScalar(profile.captureRotationDegrees),
        },
        recorded: {
          videoTrackCount: recordedVideoTrackCount,
          encodedWidthPixels: finiteNumber(recorded.encodedWidth),
          encodedHeightPixels: finiteNumber(recorded.encodedHeight),
          presentationWidthPixels: finiteNumber(recorded.presentationWidth),
          presentationHeightPixels: finiteNumber(recorded.presentationHeight),
          frameRate: finiteNumber(recorded.nominalFrameRate),
          codec: text(recorded.videoCodec),
          rotationDegrees: finiteScalar(recorded.rotationDegrees),
        },
      },
    } : {}),
  };
}

function audioSignalAnalysis(
  recording: RecordingAssetEvidenceRow,
  jobs: AudioSignalProfileJobRow[],
) {
  const manifest = object(recording.localManifestJson);
  const mediaAssetId = text(object(manifest.promotion).mediaAssetId);
  if (!mediaAssetId) return null;
  const row = jobs.find((job) => job.assetId === mediaAssetId && job.type === "audio-signal-profile");
  if (!row) return null;
  const declaredStatus = ["queued", "processing", "output-ready", "completed", "blocked", "failed"].includes(row.status)
    ? row.status as "queued" | "processing" | "output-ready" | "completed" | "blocked" | "failed"
    : "failed";
  let exactSourceBound = false;
  let completeDecode = false;
  let completedAt: string | null = null;
  let media: {
    container: string;
    codec: string;
    sampleRateHz: number;
    channelCount: number;
    durationSeconds: number;
  } | null = null;
  let signal: AudioTranscriptEvidence["audio"]["signal"] = null;
  let integrityError: string | null = null;
  try {
    const contract = parseAudioSignalProfileJob(row.inputJson, row.id);
    exactSourceBound = contract.source.assetId === mediaAssetId
      && contract.source.sha256 === normalizedHash(recording.checksum)
      && String(contract.source.sizeBytes) === scalarText(recording.byteSize);
    if (!exactSourceBound) throw new Error("Complete-decode job is not bound to these exact retained bytes.");
    if (declaredStatus === "completed") {
      const result = parseAudioSignalProfileResult(object(row.resultJson).receipt, contract);
      media = {
        container: result.media.container,
        codec: result.media.codec,
        sampleRateHz: result.media.sampleRate,
        channelCount: result.media.channelCount,
        durationSeconds: result.media.durationSeconds,
      };
      signal = parseAudioSignalEvidence(result.audioSignal, { maximumWaveformPoints: 1_200 });
      if (!signal || result.analyzer.completeDecode !== true) throw new Error("Complete-decode result cannot be projected into the shared signal model.");
      completeDecode = true;
      completedAt = iso(result.completedAt);
    }
  } catch (error) {
    integrityError = error instanceof Error ? error.message : "Audio analysis evidence failed integrity validation.";
  }
  return {
    jobId: row.id,
    mediaAssetId,
    status: integrityError ? "failed" as const : declaredStatus,
    exactSourceBound,
    completeDecode,
    completedAt,
    updatedAt: iso(row.updatedAt),
    media,
    signal,
    error: integrityError ?? (text(row.error) ? "Complete decode failed; inspect the processing job for private diagnostics." : null),
    boundaries: {
      derivedEvidenceDoesNotMutateCaptureManifest: true as const,
      exactBytesBoundByAssetHashAndSize: true as const,
      sourceReplicaGenerationRemainsSeparate: true as const,
    },
  };
}

function sameValue(
  issues: string[],
  label: string,
  expected: string | null,
  actual: string | null,
) {
  if (!expected || !actual) return;
  if (expected !== actual) issues.push(`${label} does not match the immutable upload receipt.`);
}

function latestFinalization(
  rows: FinalizationEvidenceRow[],
  recordingAssetId: string,
) {
  return rows
    .filter((row) => row.recordingAssetId === recordingAssetId)
    .sort((left, right) => (
      (iso(right.updatedAt) ?? iso(right.createdAt) ?? "")
        .localeCompare(iso(left.updatedAt) ?? iso(left.createdAt) ?? "")
    ))[0] ?? null;
}

function appliedBoundary(
  rows: StateReceiptEvidenceRow[],
  captureId: string | null,
  action: "START_RECORDING" | "STOP_RECORDING",
) {
  if (!captureId) return null;
  const row = rows.find((candidate) => (
    candidate.captureId?.toLowerCase() === captureId.toLowerCase()
    && String(candidate.action) === action
    && candidate.outcome === "APPLIED"
    && candidate.stateApplied
  ));
  const occurredAt = iso(row?.occurredAt);
  return row && occurredAt ? { row, occurredAt } : null;
}

function isProviderReceiptSlot(row: RecordingAssetEvidenceRow) {
  const manifest = object(row.localManifestJson);
  return String(row.kind) === "SERVER_MIX"
    && manifest.source === "provider-recording-receipt-slot";
}

function isNestExternalRecordingImport(manifest: UnknownRecord) {
  const profile = object(manifest.reportedSourceProfile);
  return profile.kind === "quipsly-nest-external-recording-import-v1"
    && profile.source === "nest-session-recordings"
    && profile.originalPreserved === true;
}

export function buildSessionSourceEvidence(input: {
  roomId: string;
  recordingAssets: RecordingAssetEvidenceRow[];
  finalizationReceipts: FinalizationEvidenceRow[];
  stateReceipts: StateReceiptEvidenceRow[];
  audioSignalProfileJobs?: AudioSignalProfileJobRow[];
}): SessionSourceEvidence {
  const sources = input.recordingAssets
    .filter((row) => !isProviderReceiptSlot(row))
    .map((recording) => {
      const manifest = object(recording.localManifestJson);
      const finalization = latestFinalization(input.finalizationReceipts, recording.id);
      const recoveryLineage = verifyCaptureRecoveryLineage({
        roomId: input.roomId,
        recordingAsset: recording,
        finalization: finalization ? {
          uploadSessionId: finalization.uploadSessionId,
          captureId: finalization.captureId,
          roomId: finalization.roomId,
          actorUserId: finalization.actorUserId,
          processingDisposition: finalization.processingDisposition,
          releaseReason: finalization.releaseReason,
          releasedAt: finalization.releasedAt,
          metadataJson: finalization.metadataJson,
        } : null,
      });
      const binding = object(object(finalization?.metadataJson).immutableUploadBinding);
      const evidence = object(object(finalization?.metadataJson).evidence);
      const captureId = text(finalization?.captureId) ?? text(manifest.captureId);
      const captureGroupId = text(manifest.captureGroupId);
      const uploadSessionId = text(finalization?.uploadSessionId);
      const start = appliedBoundary(input.stateReceipts, captureId, "START_RECORDING");
      const stop = appliedBoundary(input.stateReceipts, captureId, "STOP_RECORDING");
      const issues: string[] = [];

      const bindingUploadSessionId = text(binding.uploadSessionId);
      const bindingCaptureId = text(binding.captureId);
      const bindingRoomId = text(binding.roomId);
      const bindingActorUserId = text(binding.actorUserId);
      const bindingStartReceiptId = text(binding.startReceiptId);
      const bindingHash = normalizedHash(binding.sha256);
      const bindingSize = scalarText(binding.sizeBytes);
      const bindingBucket = text(binding.bucketName);
      const bindingObjectPath = text(binding.objectName);
      const bindingGeneration = scalarText(binding.generation);
      const assetHash = normalizedHash(recording.checksum);
      const assetSize = scalarText(recording.byteSize);
      const manifestGeneration = scalarText(manifest.storageGeneration);
      const finalizationStartReceiptId = text(finalization?.startReceiptId);
      const releaseReason = text(finalization?.releaseReason);
      const releasedAt = iso(finalization?.releasedAt);
      const transcriptReleaseReason = text(finalization?.transcriptReleaseReason);
      const transcriptReleasedAt = iso(finalization?.transcriptReleasedAt);
      const externalImport = isNestExternalRecordingImport(manifest);
      const durableStaffRelease = Boolean(
        externalImport
        && !start
        && !stop
        && finalization?.processingDisposition === "RELEASED"
        && releaseReason
        && releaseReason.length >= 20
        && releasedAt,
      );

      sameValue(issues, "Upload session", bindingUploadSessionId, uploadSessionId);
      sameValue(issues, "Capture ID", bindingCaptureId, captureId);
      sameValue(issues, "Room ID", bindingRoomId, input.roomId);
      sameValue(issues, "Finalization room", text(finalization?.roomId), input.roomId);
      sameValue(issues, "Recording room", text(recording.roomId), input.roomId);
      sameValue(issues, "Recording asset", text(evidence.recordingAssetId), recording.id);
      sameValue(issues, "SHA-256", bindingHash, assetHash);
      sameValue(issues, "Byte size", bindingSize, assetSize);
      sameValue(issues, "Storage bucket", bindingBucket, text(recording.storageBucket));
      sameValue(issues, "Storage path", bindingObjectPath, text(recording.storageObjectPath));
      sameValue(issues, "Storage generation", bindingGeneration, manifestGeneration);
      sameValue(issues, "START receipt", bindingStartReceiptId, finalizationStartReceiptId);
      sameValue(issues, "START boundary", finalizationStartReceiptId, text(start?.row.receiptId));
      sameValue(issues, "Capture actor", bindingActorUserId, text(finalization?.actorUserId));
      if (start && finalization) {
        sameValue(issues, "START actor", text(finalization.actorUserId), text(start.row.actorUserId));
      }

      const missing: string[] = [];
      if (!finalization) missing.push("No finalization receipt is bound to this RecordingAsset.");
      if (!uploadSessionId || !bindingUploadSessionId) missing.push("The upload-session binding is incomplete.");
      if (!recoveryLineage && (!captureId || !bindingCaptureId)) missing.push("The capture identity is incomplete.");
      if (!bindingRoomId) missing.push("The immutable room binding is absent.");
      if (!bindingHash || !assetHash) missing.push("A valid server SHA-256 is absent.");
      if (!bindingSize || !assetSize) missing.push("The exact byte-size comparison is absent.");
      if (!bindingBucket || !recording.storageBucket) missing.push("The storage-bucket comparison is absent.");
      if (!bindingObjectPath || !recording.storageObjectPath) missing.push("The storage-path comparison is absent.");
      if (!recoveryLineage && (!bindingGeneration || !manifestGeneration)) missing.push("The object-generation comparison is absent.");
      if (!recoveryLineage && !durableStaffRelease && (!bindingStartReceiptId || !finalizationStartReceiptId || !start)) {
        missing.push("The applied START boundary is incomplete.");
      }
      if (!recoveryLineage && !durableStaffRelease && !stop) missing.push("The applied STOP boundary is incomplete.");
      if (manifest.exactBytesVerified !== true) missing.push("The RecordingAsset manifest does not claim exact-byte verification.");
      if (
        !["VERIFIED", "HELD"].includes(String(recording.status))
        || manifest.exactBytesVerified !== true
        || !iso(recording.verifiedAt)
      ) {
        missing.push("The RecordingAsset is not server-verified.");
      }
      if (recoveryLineage) {
        issues.push(...recoveryLineage.issues);
        missing.push(...recoveryLineage.missing);
      }

      const processingDisposition = text(finalization?.processingDisposition);
      const transcriptDisposition = text(finalization?.transcriptDisposition);
      const boundaryAuthority = recoveryLineage
        ? recoveryLineage.valid
          ? "AUDITED_RECOVERY_REPLICA" as const
          : null
        : start && stop
          ? "CAPTURE_RECEIPTS" as const
          : durableStaffRelease
          ? "STAFF_REVIEWED_EXTERNAL_IMPORT" as const
          : null;
      const status: SessionSourceEvidenceStatus = issues.length
        ? "DRIFT"
        : processingDisposition && processingDisposition !== "RELEASED"
          ? "HELD"
          : missing.length
            ? "INCOMPLETE"
            : "VERIFIED_MATCH";

      return {
        recordingAssetId: recording.id,
        fileName: text(recording.fileName) ?? "Unnamed capture source",
        kind: String(recording.kind),
        recordingStatus: String(recording.status),
        status,
        captureId,
        captureGroupId,
        uploadSessionId,
        startBoundary: start
          ? { receiptId: start.row.receiptId, occurredAt: start.occurredAt }
          : null,
        stopBoundary: stop
          ? { receiptId: stop.row.receiptId, occurredAt: stop.occurredAt }
          : null,
        sourceOrigin: recoveryLineage
          ? "NEST_RECOVERY_REPLICA" as const
          : externalImport
            ? "NEST_EXTERNAL_IMPORT" as const
            : "CAPTURE" as const,
        boundaryAuthority,
        cloud: {
          sha256: bindingHash ?? assetHash,
          byteSize: bindingSize ?? assetSize,
          generation: bindingGeneration ?? manifestGeneration,
          bucket: bindingBucket ?? text(recording.storageBucket),
          objectPath: bindingObjectPath ?? text(recording.storageObjectPath),
          verifiedAt: iso(recording.verifiedAt),
        },
        captureRuntime: sourceRuntime(manifest),
        analysis: audioSignalAnalysis(recording, input.audioSignalProfileJobs ?? []),
        processingDisposition,
        transcriptDisposition,
        releaseAudit: durableStaffRelease && releasedAt && releaseReason
          ? {
              releasedAt,
              reason: releaseReason,
              transcriptReleasedAt,
              transcriptReason: transcriptReleaseReason,
            }
          : null,
        recoveryAudit: recoveryLineage?.valid
          && recoveryLineage.authority.requestId
          && recoveryLineage.authority.originalRecordingAssetId
          && recoveryLineage.authority.expectationId
          && recoveryLineage.authority.decidedAt
          && recoveryLineage.authority.reason
          && recoveryLineage.authority.importedSourceGeneration
          && recoveryLineage.authority.durableReplicaGeneration
          ? {
              requestId: recoveryLineage.authority.requestId,
              originalRecordingAssetId: recoveryLineage.authority.originalRecordingAssetId,
              expectationId: recoveryLineage.authority.expectationId,
              decidedAt: recoveryLineage.authority.decidedAt,
              reason: recoveryLineage.authority.reason,
              importedSourceGeneration: recoveryLineage.authority.importedSourceGeneration,
              durableReplicaGeneration: recoveryLineage.authority.durableReplicaGeneration,
              originalSourceMediaUnchanged: true as const,
            }
          : null,
        issues: [...issues, ...missing],
      };
    });

  const counts: SessionSourceEvidence["counts"] = {
    VERIFIED_MATCH: 0,
    HELD: 0,
    DRIFT: 0,
    INCOMPLETE: 0,
  };
  for (const source of sources) counts[source.status] += 1;
  return { sources, counts };
}

export function buildSessionSourceEvidenceReceipt(input: {
  roomId: string;
  generatedAt: Date | string;
  evidence: SessionSourceEvidence;
}): SessionSourceEvidenceReceipt {
  const generatedAt = iso(input.generatedAt);
  if (!generatedAt) throw new Error("A valid receipt generation time is required.");
  return {
    schema: "quipsly-nest-source-evidence",
    version: 1,
    generatedAt,
    authority: "nest-independent-projection",
    roomId: input.roomId,
    phoneReceiptImportedAsAuthority: false,
    evidence: input.evidence,
  };
}
