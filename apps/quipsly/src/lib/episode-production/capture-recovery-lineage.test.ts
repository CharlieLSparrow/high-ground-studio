import { verifyCaptureRecoveryLineage } from "./capture-recovery-lineage";

const hash = "a".repeat(64);
const requestHash = "b".repeat(64);

function fixture() {
  const decidedAt = "2026-08-06T20:00:00.000Z";
  const reason = "The original decoded near silence; adopt the independently verified backup.";
  return {
    roomId: "room-1",
    recordingAsset: {
      id: "replacement-1",
      status: "VERIFIED",
      byteSize: BigInt(4096),
      storageBucket: "capture-private",
      storageObjectPath: "recovery/backup.wav",
      checksum: hash,
      verifiedAt: decidedAt,
      localManifestJson: {
        schema: "quipsly-capture-source-recovery-manifest-v1",
        captureId: "11111111-1111-4111-8111-111111111111",
        exactBytesVerified: true,
        storageGeneration: "9",
        storageVerification: { schema: "quipsly-capture-recovery-storage-verification-v1", verifiedAt: decidedAt, sizeBytes: 4096, sha256: hash, generation: "9" },
        captureSourceRecovery: {
          requestId: "22222222-2222-4222-8222-222222222222",
          requestSha256: requestHash,
          originalRecordingAssetId: "original-1",
          expectationId: "expectation-1",
          reason,
          authorityConfirmed: true,
          actorUserId: "private-actor",
          decidedAt,
          sourceLocator: "gs://private/import.wav#4",
          sourceGeneration: "4",
          sourceSha256: hash,
          durableStorage: { bucketName: "capture-private", objectName: "recovery/backup.wav", generation: "9" },
          originalSourceMediaUnchanged: true,
        },
      },
    },
    finalization: {
      uploadSessionId: "33333333-3333-4333-8333-333333333333",
      captureId: "11111111-1111-4111-8111-111111111111",
      roomId: "room-1",
      actorUserId: "private-actor",
      processingDisposition: "RELEASED",
      releaseReason: reason,
      releasedAt: decidedAt,
      metadataJson: {
        schema: "quipsly-capture-source-recovery-finalization-v1",
        immutableUploadBinding: { uploadSessionId: "33333333-3333-4333-8333-333333333333", roomId: "room-1", sha256: hash, bucketName: "capture-private", objectName: "recovery/backup.wav", sizeBytes: 4096 },
        recoveryAuthority: {
          requestId: "22222222-2222-4222-8222-222222222222",
          requestSha256: requestHash,
          originalRecordingAssetId: "original-1",
          expectationId: "expectation-1",
          reason,
          actorUserId: "private-actor",
          authorityConfirmed: true,
          decidedAt,
          importedSource: { locator: "gs://private/import.wav#4", generation: "4", sha256: hash },
          durableCaptureReplica: { bucketName: "capture-private", objectName: "recovery/backup.wav", generation: "9" },
        },
      },
    },
  };
}

describe("Capture recovery lineage", () => {
  it("verifies an audited durable replica without exposing actor or private locator", () => {
    const result = verifyCaptureRecoveryLineage(fixture());
    expect(result).toMatchObject({
      valid: true,
      issues: [],
      missing: [],
      authority: {
        originalRecordingAssetId: "original-1",
        expectationId: "expectation-1",
        importedSourceGeneration: "4",
        durableReplicaGeneration: "9",
      },
    });
    expect(JSON.stringify(result)).not.toContain("private-actor");
    expect(JSON.stringify(result)).not.toContain("gs://private");
  });

  it("fails closed when the durable replica generation drifts", () => {
    const input = fixture();
    (input.finalization.metadataJson.recoveryAuthority.durableCaptureReplica as { generation: string }).generation = "10";
    const result = verifyCaptureRecoveryLineage(input);
    expect(result).toMatchObject({ valid: false, issues: ["Receipt durable generation does not match the audited recovery receipt."] });
  });

  it("recognizes but refuses a partial recovery receipt", () => {
    const input = fixture();
    input.finalization.metadataJson = { schema: "quipsly-capture-source-recovery-finalization-v1" } as typeof input.finalization.metadataJson;
    const result = verifyCaptureRecoveryLineage(input);
    expect(result?.valid).toBe(false);
    expect(result?.missing).toEqual(expect.arrayContaining([
      "The recovery request identity is absent from the finalization receipt.",
      "The immutable recovery upload-session binding is absent.",
    ]));
  });

  it("accepts a content-addressed local imported-source generation only when it matches the source hash", () => {
    const input = fixture();
    input.recordingAsset.localManifestJson.captureSourceRecovery.sourceGeneration = `sha256:${hash}`;
    input.finalization.metadataJson.recoveryAuthority.importedSource.generation = `sha256:${hash}`;
    expect(verifyCaptureRecoveryLineage(input)).toMatchObject({ valid: true });

    input.finalization.metadataJson.recoveryAuthority.importedSource.generation = `sha256:${"c".repeat(64)}`;
    expect(verifyCaptureRecoveryLineage(input)).toMatchObject({
      valid: false,
      issues: expect.arrayContaining(["The content-addressed imported-source generation does not match its SHA-256."]),
    });
  });

  it("returns null for a native Capture receipt", () => {
    const input = fixture();
    input.recordingAsset.localManifestJson = { schema: "quipsly-mobile-capture-v1" } as typeof input.recordingAsset.localManifestJson;
    input.finalization.metadataJson = { schema: "quipsly-mobile-capture-finalization-v1" } as typeof input.finalization.metadataJson;
    expect(verifyCaptureRecoveryLineage(input)).toBeNull();
  });
});
