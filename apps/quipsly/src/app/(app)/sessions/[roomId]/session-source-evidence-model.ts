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
    };
    processingDisposition: string | null;
    transcriptDisposition: string | null;
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
  return {
    appVersion: text(profile.captureAppVersion),
    appBuild: text(profile.captureAppBuild),
    deviceModel: text(profile.deviceModelIdentifier),
    operatingSystem: [systemName, systemVersion].filter(Boolean).join(" ") || null,
    audioRoute: [routeName, routeType].filter(Boolean).join(" · ") || null,
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

export function buildSessionSourceEvidence(input: {
  roomId: string;
  recordingAssets: RecordingAssetEvidenceRow[];
  finalizationReceipts: FinalizationEvidenceRow[];
  stateReceipts: StateReceiptEvidenceRow[];
}): SessionSourceEvidence {
  const sources = input.recordingAssets
    .filter((row) => !isProviderReceiptSlot(row))
    .map((recording) => {
      const manifest = object(recording.localManifestJson);
      const finalization = latestFinalization(input.finalizationReceipts, recording.id);
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
      if (!captureId || !bindingCaptureId) missing.push("The capture identity is incomplete.");
      if (!bindingRoomId) missing.push("The immutable room binding is absent.");
      if (!bindingHash || !assetHash) missing.push("A valid server SHA-256 is absent.");
      if (!bindingSize || !assetSize) missing.push("The exact byte-size comparison is absent.");
      if (!bindingBucket || !recording.storageBucket) missing.push("The storage-bucket comparison is absent.");
      if (!bindingObjectPath || !recording.storageObjectPath) missing.push("The storage-path comparison is absent.");
      if (!bindingGeneration || !manifestGeneration) missing.push("The object-generation comparison is absent.");
      if (!bindingStartReceiptId || !finalizationStartReceiptId || !start) {
        missing.push("The applied START boundary is incomplete.");
      }
      if (!stop) missing.push("The applied STOP boundary is incomplete.");
      if (manifest.exactBytesVerified !== true) missing.push("The RecordingAsset manifest does not claim exact-byte verification.");
      if (String(recording.status) !== "VERIFIED" || !iso(recording.verifiedAt)) {
        missing.push("The RecordingAsset is not server-verified.");
      }

      const processingDisposition = text(finalization?.processingDisposition);
      const transcriptDisposition = text(finalization?.transcriptDisposition);
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
        cloud: {
          sha256: bindingHash ?? assetHash,
          byteSize: bindingSize ?? assetSize,
          generation: bindingGeneration ?? manifestGeneration,
          bucket: bindingBucket ?? text(recording.storageBucket),
          objectPath: bindingObjectPath ?? text(recording.storageObjectPath),
          verifiedAt: iso(recording.verifiedAt),
        },
        captureRuntime: sourceRuntime(manifest),
        processingDisposition,
        transcriptDisposition,
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
