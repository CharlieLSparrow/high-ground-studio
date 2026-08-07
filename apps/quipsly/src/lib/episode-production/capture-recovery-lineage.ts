type UnknownRecord = Record<string, unknown>;

export type CaptureRecoveryLineageInput = {
  roomId: string;
  recordingAsset: {
    id: string;
    status: unknown;
    byteSize: bigint | number | string | null | undefined;
    storageBucket: string | null | undefined;
    storageObjectPath: string | null | undefined;
    checksum: string | null | undefined;
    verifiedAt: Date | string | null | undefined;
    localManifestJson: unknown;
  };
  finalization: {
    uploadSessionId: string;
    captureId: string | null | undefined;
    roomId: string | null | undefined;
    actorUserId: string | null | undefined;
    processingDisposition: string | null | undefined;
    releaseReason?: string | null;
    releasedAt?: Date | string | null;
    metadataJson: unknown;
  } | null;
};

export type CaptureRecoveryLineage = {
  valid: boolean;
  issues: string[];
  missing: string[];
  authority: {
    requestId: string | null;
    originalRecordingAssetId: string | null;
    expectationId: string | null;
    decidedAt: string | null;
    reason: string | null;
    importedSourceGeneration: string | null;
    durableReplicaGeneration: string | null;
  };
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

function scalar(value: unknown): string | null {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return text(value);
}

function hash(value: unknown): string | null {
  const normalized = text(value)?.toLowerCase() ?? null;
  return normalized && /^[a-f0-9]{64}$/.test(normalized) ? normalized : null;
}

function uuid(value: unknown): string | null {
  const normalized = text(value)?.toLowerCase() ?? null;
  return normalized && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)
    ? normalized
    : null;
}

function positiveInteger(value: unknown): string | null {
  const normalized = scalar(value);
  return normalized && /^\d+$/.test(normalized) && !/^0+$/.test(normalized) ? normalized : null;
}

function immutableSourceGeneration(value: unknown): string | null {
  const normalized = text(value)?.toLowerCase() ?? null;
  if (!normalized) return null;
  if (/^\d+$/.test(normalized) && !/^0+$/.test(normalized)) return normalized;
  return /^sha256:[a-f0-9]{64}$/.test(normalized) ? normalized : null;
}

function iso(value: unknown): string | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  const normalized = text(value);
  if (!normalized) return null;
  const parsed = new Date(normalized);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function compare(issues: string[], label: string, expected: string | null, actual: string | null) {
  if (expected && actual && expected !== actual) issues.push(`${label} does not match the audited recovery receipt.`);
}

function requireValue(missing: string[], value: unknown, detail: string) {
  if (!value) missing.push(detail);
}

/**
 * Verifies a recovery replica without pretending that it owns native Capture
 * START/STOP boundaries. The returned authority deliberately excludes actor
 * identity and the private imported-source locator.
 */
export function verifyCaptureRecoveryLineage(input: CaptureRecoveryLineageInput): CaptureRecoveryLineage | null {
  const manifest = object(input.recordingAsset.localManifestJson);
  const finalizationMetadata = object(input.finalization?.metadataJson);
  const manifestSchema = text(manifest.schema);
  const finalizationSchema = text(finalizationMetadata.schema);
  const recognized = manifestSchema === "quipsly-capture-source-recovery-manifest-v1"
    || finalizationSchema === "quipsly-capture-source-recovery-finalization-v1";
  if (!recognized) return null;

  const recovery = object(manifest.captureSourceRecovery);
  const storageVerification = object(manifest.storageVerification);
  const manifestStorage = object(recovery.durableStorage);
  const authority = object(finalizationMetadata.recoveryAuthority);
  const importedSource = object(authority.importedSource);
  const durableReplica = object(authority.durableCaptureReplica);
  const binding = object(finalizationMetadata.immutableUploadBinding);
  const issues: string[] = [];
  const missing: string[] = [];
  requireValue(missing, text(input.roomId), "The authoritative Session room identity is absent.");

  const requestId = uuid(recovery.requestId);
  const authorityRequestId = uuid(authority.requestId);
  const requestSha256 = hash(recovery.requestSha256);
  const authorityRequestSha256 = hash(authority.requestSha256);
  const originalRecordingAssetId = text(recovery.originalRecordingAssetId);
  const authorityOriginalRecordingAssetId = text(authority.originalRecordingAssetId);
  const expectationId = text(recovery.expectationId);
  const authorityExpectationId = text(authority.expectationId);
  const reason = text(recovery.reason);
  const authorityReason = text(authority.reason);
  const decidedAt = iso(recovery.decidedAt);
  const authorityDecidedAt = iso(authority.decidedAt);
  const manifestActor = text(recovery.actorUserId);
  const authorityActor = text(authority.actorUserId);
  const assetHash = hash(input.recordingAsset.checksum);
  const assetSize = positiveInteger(input.recordingAsset.byteSize);
  const assetBucket = text(input.recordingAsset.storageBucket);
  const assetObjectPath = text(input.recordingAsset.storageObjectPath);
  const assetGeneration = positiveInteger(manifest.storageGeneration);
  const importedHash = hash(importedSource.sha256);
  const importedGeneration = immutableSourceGeneration(importedSource.generation);
  const manifestImportedHash = hash(recovery.sourceSha256);
  const manifestImportedGeneration = immutableSourceGeneration(recovery.sourceGeneration);
  const manifestImportedLocator = text(recovery.sourceLocator);
  const durableGeneration = positiveInteger(durableReplica.generation);
  const manifestCaptureId = uuid(manifest.captureId);
  const finalizationCaptureId = uuid(input.finalization?.captureId);
  const bindingUploadSessionId = uuid(binding.uploadSessionId);
  const finalizationUploadSessionId = uuid(input.finalization?.uploadSessionId);

  if (manifestSchema !== "quipsly-capture-source-recovery-manifest-v1") missing.push("The recovery RecordingAsset manifest schema is absent.");
  if (finalizationSchema !== "quipsly-capture-source-recovery-finalization-v1") missing.push("The recovery finalization schema is absent.");
  requireValue(missing, input.finalization, "No finalization receipt is bound to the recovery RecordingAsset.");
  requireValue(missing, requestId, "The recovery request identity is absent from the RecordingAsset.");
  requireValue(missing, authorityRequestId, "The recovery request identity is absent from the finalization receipt.");
  requireValue(missing, requestSha256, "A valid recovery request SHA-256 is absent from the RecordingAsset.");
  requireValue(missing, authorityRequestSha256, "A valid recovery request SHA-256 is absent from the finalization receipt.");
  requireValue(missing, originalRecordingAssetId, "The immutable original RecordingAsset identity is absent.");
  requireValue(missing, authorityOriginalRecordingAssetId, "The finalization receipt does not name the immutable original RecordingAsset.");
  requireValue(missing, expectationId, "The source-plan expectation identity is absent from the recovery manifest.");
  requireValue(missing, authorityExpectationId, "The source-plan expectation identity is absent from the recovery receipt.");
  if (!reason || reason.length < 20) missing.push("The durable recovery reason is absent or too short.");
  if (!authorityReason || authorityReason.length < 20) missing.push("The finalization recovery reason is absent or too short.");
  requireValue(missing, decidedAt, "The recovery decision time is absent or invalid.");
  requireValue(missing, authorityDecidedAt, "The finalization recovery decision time is absent or invalid.");
  requireValue(missing, manifestActor, "The recovery decision actor is absent from the RecordingAsset.");
  requireValue(missing, authorityActor, "The recovery decision actor is absent from the finalization receipt.");
  requireValue(missing, text(input.finalization?.actorUserId), "The canonical recovery finalization actor is absent.");
  requireValue(missing, text(input.finalization?.roomId), "The canonical recovery finalization room is absent.");
  requireValue(missing, manifestCaptureId, "A valid recovery capture identity is absent from the RecordingAsset.");
  requireValue(missing, finalizationCaptureId, "A valid recovery capture identity is absent from the finalization receipt.");
  requireValue(missing, bindingUploadSessionId, "A valid immutable recovery upload-session binding is absent.");
  requireValue(missing, finalizationUploadSessionId, "A valid recovery finalization upload-session identity is absent.");
  if (recovery.authorityConfirmed !== true || authority.authorityConfirmed !== true) missing.push("The explicit recovery authority confirmation is absent.");
  if (recovery.originalSourceMediaUnchanged !== true) missing.push("The recovery manifest does not preserve the immutable-original boundary.");
  if (originalRecordingAssetId && originalRecordingAssetId === input.recordingAsset.id) issues.push("The recovery replica incorrectly names itself as the immutable original.");

  requireValue(missing, assetHash, "A valid recovery-replica SHA-256 is absent.");
  requireValue(missing, assetSize, "The recovery-replica byte size is absent.");
  requireValue(missing, assetBucket, "The recovery-replica storage bucket is absent.");
  requireValue(missing, assetObjectPath, "The recovery-replica storage path is absent.");
  requireValue(missing, assetGeneration, "The recovery-replica storage generation is absent.");
  if (manifest.exactBytesVerified !== true || String(input.recordingAsset.status) !== "VERIFIED" || !iso(input.recordingAsset.verifiedAt)) {
    missing.push("The recovery RecordingAsset is not independently server-verified.");
  }
  if (text(storageVerification.schema) !== "quipsly-capture-recovery-storage-verification-v1") missing.push("The durable recovery storage-verification schema is absent.");
  requireValue(missing, iso(storageVerification.verifiedAt), "The durable recovery storage verification time is absent or invalid.");
  requireValue(missing, text(importedSource.locator), "The verified imported-source locator is absent from the private recovery receipt.");
  requireValue(missing, importedGeneration, "The verified imported-source generation is absent.");
  requireValue(missing, importedHash, "The verified imported-source SHA-256 is absent.");
  requireValue(missing, manifestImportedLocator, "The verified imported-source locator is absent from the recovery manifest.");
  requireValue(missing, manifestImportedGeneration, "The verified imported-source generation is absent from the recovery manifest.");
  requireValue(missing, manifestImportedHash, "The verified imported-source SHA-256 is absent from the recovery manifest.");
  if (importedGeneration?.startsWith("sha256:") && importedHash && importedGeneration !== `sha256:${importedHash}`) {
    issues.push("The content-addressed imported-source generation does not match its SHA-256.");
  }
  if (String(input.finalization?.processingDisposition).toUpperCase() === "RELEASED") {
    if (!text(input.finalization?.releaseReason) || text(input.finalization?.releaseReason)!.length < 20) missing.push("The released recovery reason is absent or too short.");
    requireValue(missing, iso(input.finalization?.releasedAt), "The released recovery time is absent or invalid.");
  }

  compare(issues, "Recovery request ID", requestId, authorityRequestId);
  compare(issues, "Recovery request SHA-256", requestSha256, authorityRequestSha256);
  compare(issues, "Immutable original RecordingAsset", originalRecordingAssetId, authorityOriginalRecordingAssetId);
  compare(issues, "Recovery source-plan expectation", expectationId, authorityExpectationId);
  compare(issues, "Recovery reason", reason, authorityReason);
  compare(issues, "Recovery decision time", decidedAt, authorityDecidedAt);
  compare(issues, "Recovery actor", manifestActor, authorityActor);
  compare(issues, "Finalization actor", text(input.finalization?.actorUserId), authorityActor);
  compare(issues, "Finalization room", text(input.finalization?.roomId), input.roomId);
  compare(issues, "Recovery capture ID", manifestCaptureId, finalizationCaptureId);
  compare(issues, "Recovery upload session", bindingUploadSessionId, finalizationUploadSessionId);
  compare(issues, "Immutable room", text(binding.roomId), input.roomId);
  compare(issues, "Immutable SHA-256", hash(binding.sha256), assetHash);
  compare(issues, "Immutable byte size", positiveInteger(binding.sizeBytes), assetSize);
  compare(issues, "Immutable storage bucket", text(binding.bucketName), assetBucket);
  compare(issues, "Immutable storage path", text(binding.objectName), assetObjectPath);
  compare(issues, "Storage-verification SHA-256", hash(storageVerification.sha256), assetHash);
  compare(issues, "Storage-verification byte size", positiveInteger(storageVerification.sizeBytes), assetSize);
  compare(issues, "Storage-verification generation", positiveInteger(storageVerification.generation), assetGeneration);
  compare(issues, "Manifest durable bucket", text(manifestStorage.bucketName), assetBucket);
  compare(issues, "Manifest durable path", text(manifestStorage.objectName), assetObjectPath);
  compare(issues, "Manifest durable generation", positiveInteger(manifestStorage.generation), assetGeneration);
  compare(issues, "Receipt durable bucket", text(durableReplica.bucketName), assetBucket);
  compare(issues, "Receipt durable path", text(durableReplica.objectName), assetObjectPath);
  compare(issues, "Receipt durable generation", durableGeneration, assetGeneration);
  compare(issues, "Imported source SHA-256", importedHash, assetHash);
  compare(issues, "Imported-source locator", manifestImportedLocator, text(importedSource.locator));
  compare(issues, "Imported-source generation", manifestImportedGeneration, importedGeneration);
  compare(issues, "Imported-source manifest SHA-256", manifestImportedHash, importedHash);
  compare(issues, "Released recovery reason", text(input.finalization?.releaseReason), reason);
  compare(issues, "Released recovery time", iso(input.finalization?.releasedAt), decidedAt);

  for (const [value, detail] of [
    [bindingUploadSessionId, "The immutable recovery upload-session binding is absent."],
    [text(binding.roomId), "The immutable recovery room binding is absent."],
    [hash(binding.sha256), "The immutable recovery SHA-256 binding is absent."],
    [positiveInteger(binding.sizeBytes), "The immutable recovery byte-size binding is absent."],
    [text(binding.bucketName), "The immutable recovery storage-bucket binding is absent."],
    [text(binding.objectName), "The immutable recovery storage-path binding is absent."],
    [hash(storageVerification.sha256), "The recovery storage-verification SHA-256 is absent."],
    [positiveInteger(storageVerification.sizeBytes), "The recovery storage-verification byte size is absent."],
    [positiveInteger(storageVerification.generation), "The recovery storage-verification generation is absent."],
    [text(manifestStorage.bucketName), "The manifest durable recovery bucket is absent."],
    [text(manifestStorage.objectName), "The manifest durable recovery path is absent."],
    [positiveInteger(manifestStorage.generation), "The manifest durable recovery generation is absent."],
    [text(durableReplica.bucketName), "The receipt durable recovery bucket is absent."],
    [text(durableReplica.objectName), "The receipt durable recovery path is absent."],
    [durableGeneration, "The receipt durable recovery generation is absent."],
  ] as Array<[string | null, string]>) requireValue(missing, value, detail);

  return {
    valid: issues.length === 0 && missing.length === 0,
    issues,
    missing,
    authority: {
      requestId,
      originalRecordingAssetId,
      expectationId,
      decidedAt,
      reason,
      importedSourceGeneration: importedGeneration,
      durableReplicaGeneration: durableGeneration,
    },
  };
}
