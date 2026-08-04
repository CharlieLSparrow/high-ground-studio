import {
  buildSessionSourceEvidence,
  buildSessionSourceEvidenceReceipt,
} from "./session-source-evidence-model";

const roomId = "room-1";
const captureId = "11111111-1111-4111-8111-111111111111";
const uploadSessionId = "22222222-2222-4222-8222-222222222222";
const startReceiptId = "33333333-3333-4333-8333-333333333333";
const stopReceiptId = "44444444-4444-4444-8444-444444444444";
const sha256 = "a".repeat(64);

function fixture(): Parameters<typeof buildSessionSourceEvidence>[0] {
  return {
    roomId,
    recordingAssets: [{
      id: "asset-1",
      roomId,
      fileName: "homer-camera.mov",
      kind: "LOCAL_VIDEO",
      status: "VERIFIED",
      byteSize: BigInt(4096),
      storageBucket: "quipsly-private-media",
      storageObjectPath: "mobile/room-1/homer-camera.mov",
      checksum: sha256,
      verifiedAt: new Date("2026-07-29T15:05:00Z"),
      recordedStartedAt: new Date("2026-07-29T15:00:00Z"),
      recordedStoppedAt: new Date("2026-07-29T15:04:00Z"),
      localManifestJson: {
        captureId,
        captureGroupId: "55555555-5555-4555-8555-555555555555",
        exactBytesVerified: true,
        storageGeneration: "1742",
        reportedSourceProfile: {
          captureAppVersion: "1.0",
          captureAppBuild: "9",
          deviceModelIdentifier: "iPhone17,3",
          deviceSystemName: "iOS",
          deviceSystemVersion: "26.2",
          audioRouteName: "Shure MV7i",
          audioRoutePortType: "USBAudio",
          audioInputDataSourceName: "MV7i microphone",
          container: "mov",
          codec: "hevc",
          audioSampleRate: 48_000,
          audioChannelCount: 1,
          audioHardwareSampleRate: 48_000,
          audioHardwareInputChannelCount: 1,
          audioCapturePipeline: "avcapture-session",
          pauseTimelinePolicy: "continuous-source-clock",
          recordedMedia: {
            audioTrackCount: 1,
            audioSampleRate: 48_000,
            audioChannelCount: 1,
          },
          audioSignal: {
            schemaVersion: 1,
            algorithm: "quipsly-audio-signal-window-v1",
            sampleRate: 48_000,
            channelCount: 1,
            analyzedFrameCount: 11_520_000,
            durationSeconds: 240,
            windowDurationSeconds: 1,
            rmsDbfs: -19.2,
            samplePeakDbfs: -1.1,
            clippedFrameCount: 0,
            clippedFrameFraction: 0,
            nearSilentFrameFraction: 0.05,
            leftRmsDbfs: -19.2,
            rightRmsDbfs: null,
            stereoBalanceDb: null,
            signalStatus: "signal-present",
            thresholds: {
              clippingAmplitude: 0.999,
              nearSilenceDbfs: -72,
              possibleDropoutMinimumSeconds: 0.25,
              surroundingSignalDbfs: -45,
              stereoImbalanceDb: 12,
            },
            waveform: [{ startSeconds: 0, durationSeconds: 240, rmsDbfs: -19.2, samplePeakDbfs: -1.1, clippedFrameCount: 0 }],
            observations: [],
          },
          cameraDeviceUniqueID: "must-not-reach-the-client",
        },
      },
    }],
    finalizationReceipts: [{
      uploadSessionId,
      captureId,
      roomId,
      actorUserId: "actor-private-1",
      startReceiptId,
      processingDisposition: "RELEASED",
      transcriptDisposition: "HELD",
      recordingAssetId: "asset-1",
      metadataJson: {
        immutableUploadBinding: {
          uploadSessionId,
          captureId,
          actorUserId: "actor-private-1",
          roomId,
          startReceiptId,
          sha256,
          bucketName: "quipsly-private-media",
          objectName: "mobile/room-1/homer-camera.mov",
          generation: "1742",
          sizeBytes: 4096,
        },
        evidence: { recordingAssetId: "asset-1" },
      },
      createdAt: new Date("2026-07-29T15:05:00Z"),
      updatedAt: new Date("2026-07-29T15:05:00Z"),
    }],
    stateReceipts: [{
      receiptId: startReceiptId,
      captureId,
      actorUserId: "actor-private-1",
      action: "START_RECORDING",
      outcome: "APPLIED",
      stateApplied: true,
      occurredAt: new Date("2026-07-29T15:00:00Z"),
      receivedAt: new Date("2026-07-29T15:00:01Z"),
    }, {
      receiptId: stopReceiptId,
      captureId,
      actorUserId: "actor-private-1",
      action: "STOP_RECORDING",
      outcome: "APPLIED",
      stateApplied: true,
      occurredAt: new Date("2026-07-29T15:04:00Z"),
      receivedAt: new Date("2026-07-29T15:04:01Z"),
    }],
  };
}

function markAsNestExternalImport(input: ReturnType<typeof fixture>) {
  input.recordingAssets[0].localManifestJson = {
    ...input.recordingAssets[0].localManifestJson as Record<string, unknown>,
    reportedSourceProfile: {
      kind: "quipsly-nest-external-recording-import-v1",
      source: "nest-session-recordings",
      originalPreserved: true,
    },
  };
}

describe("Session source evidence", () => {
  it("reports an exact source match while keeping transcript disposition separate", () => {
    const result = buildSessionSourceEvidence(fixture());
    expect(result.counts).toEqual({
      VERIFIED_MATCH: 1,
      HELD: 0,
      DRIFT: 0,
      INCOMPLETE: 0,
    });
    expect(result.sources[0]).toMatchObject({
      recordingAssetId: "asset-1",
      status: "VERIFIED_MATCH",
      captureId,
      uploadSessionId,
      startBoundary: { receiptId: startReceiptId },
      stopBoundary: { receiptId: stopReceiptId },
      sourceOrigin: "CAPTURE",
      boundaryAuthority: "CAPTURE_RECEIPTS",
      cloud: {
        sha256,
        byteSize: "4096",
        generation: "1742",
      },
      captureRuntime: {
        appVersion: "1.0",
        appBuild: "9",
        deviceModel: "iPhone17,3",
        operatingSystem: "iOS 26.2",
        audioRoute: "Shure MV7i · USBAudio",
        audioInputDataSource: "MV7i microphone",
        audioFormat: expect.objectContaining({
          sampleRateHz: 48_000,
          decodedSampleRateHz: 48_000,
          decodedAudioTrackCount: 1,
          hardwareInputChannelCount: 1,
          capturePipeline: "avcapture-session",
          signal: expect.objectContaining({
            status: "signal-present",
            rmsDbfs: -19.2,
            rmsIsNotLufs: true,
          }),
        }),
      },
      processingDisposition: "RELEASED",
      transcriptDisposition: "HELD",
      releaseAudit: null,
      issues: [],
    });
    expect(JSON.stringify(result)).not.toContain("cameraDeviceUniqueID");
    expect(JSON.stringify(result)).not.toContain("actor-private-1");
  });

  it("fails closed on immutable checksum drift", () => {
    const input = fixture();
    input.recordingAssets[0].checksum = "b".repeat(64);
    const result = buildSessionSourceEvidence(input);
    expect(result.sources[0].status).toBe("DRIFT");
    expect(result.sources[0].issues).toContain(
      "SHA-256 does not match the immutable upload receipt.",
    );
  });

  it("distinguishes a policy hold from integrity drift", () => {
    const input = fixture();
    input.finalizationReceipts[0].processingDisposition = "HELD";
    input.recordingAssets[0].status = "HELD";
    const result = buildSessionSourceEvidence(input);
    expect(result.sources[0].status).toBe("HELD");
    expect(result.sources[0].issues).toEqual([]);
  });

  it("does not invent verified evidence when STOP or object generation is absent", () => {
    const input = fixture();
    input.stateReceipts = input.stateReceipts.slice(0, 1);
    input.recordingAssets[0].localManifestJson = {
      ...input.recordingAssets[0].localManifestJson as Record<string, unknown>,
      storageGeneration: undefined,
    };
    const result = buildSessionSourceEvidence(input);
    expect(result.sources[0].status).toBe("INCOMPLETE");
    expect(result.sources[0].issues).toEqual(expect.arrayContaining([
      "The object-generation comparison is absent.",
      "The applied STOP boundary is incomplete.",
    ]));
  });

  it("keeps an exact external import held while its phone boundaries are absent", () => {
    const input = fixture();
    markAsNestExternalImport(input);
    input.finalizationReceipts[0].processingDisposition = "HELD";
    input.finalizationReceipts[0].startReceiptId = null;
    (input.finalizationReceipts[0].metadataJson as any).immutableUploadBinding.startReceiptId = null;
    input.recordingAssets[0].status = "HELD";
    input.stateReceipts = [];

    const result = buildSessionSourceEvidence(input);
    expect(result.sources[0]).toMatchObject({
      status: "HELD",
      sourceOrigin: "NEST_EXTERNAL_IMPORT",
      boundaryAuthority: null,
      releaseAudit: null,
      issues: expect.arrayContaining([
        "The applied START boundary is incomplete.",
        "The applied STOP boundary is incomplete.",
      ]),
    });
  });

  it("accepts an external import only through a durable audited staff boundary", () => {
    const input = fixture();
    markAsNestExternalImport(input);
    input.finalizationReceipts[0].startReceiptId = null;
    input.finalizationReceipts[0].releaseReason = "All participants consented and the exact imported source was reviewed.";
    input.finalizationReceipts[0].releasedAt = new Date("2026-08-02T20:00:00Z");
    input.finalizationReceipts[0].transcriptReleaseReason = "All participants consented to transcription before staff release.";
    input.finalizationReceipts[0].transcriptReleasedAt = new Date("2026-08-02T20:00:00Z");
    (input.finalizationReceipts[0].metadataJson as any).immutableUploadBinding.startReceiptId = null;
    input.stateReceipts = [];

    const result = buildSessionSourceEvidence(input);
    expect(result.sources[0]).toMatchObject({
      status: "VERIFIED_MATCH",
      startBoundary: null,
      stopBoundary: null,
      boundaryAuthority: "STAFF_REVIEWED_EXTERNAL_IMPORT",
      releaseAudit: {
        releasedAt: "2026-08-02T20:00:00.000Z",
        reason: "All participants consented and the exact imported source was reviewed.",
        transcriptReleasedAt: "2026-08-02T20:00:00.000Z",
      },
      issues: [],
    });
    expect(JSON.stringify(result)).not.toContain("actor-private-1");
  });

  it("does not treat a released external import without a durable audit as complete", () => {
    const input = fixture();
    markAsNestExternalImport(input);
    input.finalizationReceipts[0].startReceiptId = null;
    (input.finalizationReceipts[0].metadataJson as any).immutableUploadBinding.startReceiptId = null;
    input.stateReceipts = [];

    const result = buildSessionSourceEvidence(input);
    expect(result.sources[0]).toMatchObject({
      status: "INCOMPLETE",
      boundaryAuthority: null,
      releaseAudit: null,
    });
  });

  it("does not upgrade a native Capture source through an external-import staff audit", () => {
    const input = fixture();
    input.finalizationReceipts[0].startReceiptId = null;
    input.finalizationReceipts[0].releaseReason = "Staff reviewed these bytes, but this is still a native Capture source.";
    input.finalizationReceipts[0].releasedAt = new Date("2026-08-02T20:00:00Z");
    (input.finalizationReceipts[0].metadataJson as any).immutableUploadBinding.startReceiptId = null;
    input.stateReceipts = [];

    expect(buildSessionSourceEvidence(input).sources[0]).toMatchObject({
      status: "INCOMPLETE",
      sourceOrigin: "CAPTURE",
      boundaryAuthority: null,
      releaseAudit: null,
      issues: expect.arrayContaining([
        "The applied START boundary is incomplete.",
        "The applied STOP boundary is incomplete.",
      ]),
    });
  });

  it("omits provider receipt slots from local source evidence", () => {
    const input = fixture();
    input.recordingAssets.push({
      ...input.recordingAssets[0],
      id: "provider-slot",
      kind: "SERVER_MIX",
      localManifestJson: { source: "provider-recording-receipt-slot" },
    });
    expect(buildSessionSourceEvidence(input).sources).toHaveLength(1);
  });

  it("creates a versioned Nest receipt without upgrading the phone export to authority", () => {
    const evidence = buildSessionSourceEvidence(fixture());
    const receipt = buildSessionSourceEvidenceReceipt({
      roomId,
      generatedAt: new Date("2026-07-29T15:10:00Z"),
      evidence,
    });
    expect(receipt).toMatchObject({
      schema: "quipsly-nest-source-evidence",
      version: 1,
      generatedAt: "2026-07-29T15:10:00.000Z",
      authority: "nest-independent-projection",
      roomId,
      phoneReceiptImportedAsAuthority: false,
    });
    expect(JSON.stringify(receipt)).not.toContain("actor-private-1");
    expect(JSON.stringify(receipt)).not.toContain("cameraDeviceUniqueID");
  });
});
