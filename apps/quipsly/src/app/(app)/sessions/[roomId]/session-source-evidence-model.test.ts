import { newAudioSignalProfileJob } from "@high-ground/quipsly-media-processing";

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
          width: 3840,
          height: 2160,
          nominalFrameRate: 24,
          colorSpace: "P3-D65",
          orientation: "landscape",
          cameraPosition: "front",
          captureRotationDegrees: 0,
          requestedVideoQuality: "production-4k-24",
          videoQualityIntentFulfilled: true,
          videoSystemPressureAtStart: "nominal",
          audioSampleRate: 48_000,
          audioChannelCount: 1,
          audioHardwareSampleRate: 48_000,
          audioHardwareInputChannelCount: 1,
          audioCapturePipeline: "avcapture-session",
          pauseTimelinePolicy: "continuous-source-clock",
          recordedMedia: {
            videoTrackCount: 1,
            videoCodec: "hvc1",
            encodedWidth: 3840,
            encodedHeight: 2160,
            presentationWidth: 3840,
            presentationHeight: 2160,
            rotationDegrees: 0,
            nominalFrameRate: 24,
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

function markAsAuditedRecoveryReplica(input: ReturnType<typeof fixture>) {
  const decidedAt = "2026-08-02T20:00:00.000Z";
  const reason = "The original decoded near silence; adopt the independently verified backup.";
  const requestId = "66666666-6666-4666-8666-666666666666";
  const requestSha256 = "b".repeat(64);
  const originalRecordingAssetId = "original-asset-1";
  const expectationId = "expected-source-1";
  input.recordingAssets[0].localManifestJson = {
    schema: "quipsly-capture-source-recovery-manifest-v1",
    captureId,
    captureGroupId: "55555555-5555-4555-8555-555555555555",
    exactBytesVerified: true,
    storageGeneration: "1742",
    storageVerification: { schema: "quipsly-capture-recovery-storage-verification-v1", verifiedAt: decidedAt, sizeBytes: 4096, sha256, generation: "1742" },
    promotion: {
      status: "promoted-to-studio-media",
      mediaAssetId: "studio-media-asset-1",
      sourceId: "studio-source-1",
      playbackUrl: "/api/ingest/media/studio-source-1",
    },
    captureSourceRecovery: {
      requestId,
      requestSha256,
      originalRecordingAssetId,
      expectationId,
      reason,
      authorityConfirmed: true,
      actorUserId: "actor-private-1",
      actorEmail: "private@example.test",
      decidedAt,
      sourceLocator: "gs://private-import/backup.wav#88",
      sourceGeneration: "88",
      sourceSha256: sha256,
      durableStorage: { bucketName: "quipsly-private-media", objectName: "mobile/room-1/homer-camera.mov", generation: "1742" },
      originalSourceMediaUnchanged: true,
    },
  };
  input.finalizationReceipts[0].releaseReason = reason;
  input.finalizationReceipts[0].releasedAt = decidedAt;
  input.finalizationReceipts[0].metadataJson = {
    schema: "quipsly-capture-source-recovery-finalization-v1",
    immutableUploadBinding: {
      uploadSessionId,
      roomId,
      sha256,
      bucketName: "quipsly-private-media",
      objectName: "mobile/room-1/homer-camera.mov",
      sizeBytes: 4096,
    },
    recoveryAuthority: {
      requestId,
      requestSha256,
      originalRecordingAssetId,
      expectationId,
      reason,
      actorUserId: "actor-private-1",
      actorEmail: "private@example.test",
      authorityConfirmed: true,
      decidedAt,
      importedSource: { locator: "gs://private-import/backup.wav#88", generation: "88", sha256 },
      durableCaptureReplica: { bucketName: "quipsly-private-media", objectName: "mobile/room-1/homer-camera.mov", generation: "1742" },
    },
  };
  input.stateReceipts = [];
}

function completedAudioSignalJob(sourceSha256 = sha256) {
  const source = {
    assetId: "studio-media-asset-1",
    provider: "local" as const,
    locator: "/retained/recovery.wav",
    generation: `sha256:${sourceSha256}`,
    sha256: sourceSha256,
    sizeBytes: 4096,
    contentType: "audio/wav",
  };
  const job = newAudioSignalProfileJob({
    jobId: "audio_signal_recovery_fixture_1",
    projectId: "project_fixture_1",
    requestedByEmail: "producer@example.test",
    queuedAt: "2026-08-02T20:01:00.000Z",
    source,
  });
  const audioSignal = {
    schemaVersion: 1 as const,
    algorithm: "quipsly-audio-signal-window-v1" as const,
    sampleRate: 48_000,
    channelCount: 1,
    analyzedFrameCount: 48_000,
    durationSeconds: 1,
    windowDurationSeconds: 1,
    rmsDbfs: -18,
    samplePeakDbfs: -3,
    clippedFrameCount: 0,
    clippedFrameFraction: 0,
    nearSilentFrameFraction: 0,
    leftRmsDbfs: -18,
    rightRmsDbfs: null,
    stereoBalanceDb: null,
    signalStatus: "signal-present" as const,
    thresholds: { clippingAmplitude: 0.999, nearSilenceDbfs: -72, possibleDropoutMinimumSeconds: 0.25, surroundingSignalDbfs: -45, stereoImbalanceDb: 12 },
    waveform: [{ startSeconds: 0, durationSeconds: 1, rmsDbfs: -18, samplePeakDbfs: -3, clippedFrameCount: 0 }],
    frequencyProfile: {
      algorithm: "quipsly-audio-broad-band-rms-v1" as const,
      completeDecode: true as const,
      downmixPolicy: "ffmpeg-default-mono-v1" as const,
      windowDurationSeconds: 1,
      analyzedFrameCount: 48_000,
      bands: [{ id: "speech" as const, label: "Speech", minimumHz: 500, maximumHz: 2_000 }],
      overallBandRmsDbfs: [-20],
      windows: [{ startSeconds: 0, durationSeconds: 1, bandRmsDbfs: [-20] }],
      boundaries: { broadBandsAreNotARepairSpectrogram: true as const, measurementsAreNotEqDecisions: true as const, stereoIsDownmixedForFrequencyOverview: true as const },
    },
    observations: [],
  };
  return {
    id: job.jobId,
    assetId: source.assetId,
    type: "audio-signal-profile",
    status: "completed",
    inputJson: job,
    resultJson: { receipt: {
      kind: "quipsly-audio-signal-profile-result-v1",
      version: 1,
      jobId: job.jobId,
      completedAt: "2026-08-02T20:02:00.000Z",
      source,
      media: { container: "wav", codec: "pcm_s24le", sampleRate: 48_000, channelCount: 1, durationSeconds: 1 },
      audioSignal,
      analyzer: { algorithm: "quipsly-audio-signal-window-v1", ffmpegVersion: "ffmpeg fixture", completeDecode: true, maximumWindows: 1_200, frequencyAnalysis: { algorithm: "quipsly-audio-broad-band-rms-v1", maximumBands: 6, maximumWindows: 1_200, completeDecode: true } },
      worker: { executionId: "execution_fixture_1", buildId: "fixture", imageDigest: null, attempt: 1 },
      boundaries: { originalRemainsSourceTruth: true, analysisDoesNotChangeMedia: true, observationsRequireHumanInterpretation: true },
    } },
    error: null,
    completedAt: new Date("2026-08-02T20:02:00.000Z"),
    updatedAt: new Date("2026-08-02T20:02:00.000Z"),
  };
}

describe("Session source evidence", () => {
  it("does not recast an immutable share derivative as a participant source", () => {
    const input = fixture();
    input.recordingAssets.push({
      id: "share-preview",
      roomId,
      fileName: "recording-share-output.m4a",
      kind: "SERVER_MIX",
      status: "VERIFIED",
      byteSize: BigInt(2048),
      storageBucket: "quipsly-private-media",
      storageObjectPath: "session-exports/share.m4a",
      checksum: "b".repeat(64),
      verifiedAt: new Date("2026-07-29T15:10:00Z"),
      recordedStartedAt: null,
      recordedStoppedAt: null,
      localManifestJson: {
        exactBytesVerified: true,
        source: "session-recording-share",
        storageGeneration: "1743",
        sessionRecordingShare: {
          outputId: "share-1",
          originalsRemainImmutable: true,
        },
      },
    });

    const result = buildSessionSourceEvidence(input);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].recordingAssetId).toBe("asset-1");
    expect(result.counts).toEqual({
      VERIFIED_MATCH: 1,
      HELD: 0,
      DRIFT: 0,
      INCOMPLETE: 0,
    });
  });

  it("exposes audio improvement coordinates only for the canonical Session project", () => {
    const input = fixture();
    input.project = { id: "project-coaching-1", slug: "coach-home" };
    (input.recordingAssets[0].localManifestJson as any).promotion = {
      status: "promoted-to-studio-media",
      projectId: "project-coaching-1",
      nestSlug: "coach-home",
      mediaAssetId: "studio-media-asset-1",
      sourceId: "studio-source-1",
      playbackUrl: "/api/ingest/media/studio-source-1",
    };

    expect(buildSessionSourceEvidence(input).sources[0].audioMastery).toEqual({
      projectId: "project-coaching-1",
      projectSlug: "coach-home",
      assetId: "studio-media-asset-1",
      sourceId: "studio-source-1",
      sourceUrl: "/api/ingest/media/studio-source-1",
      sourceKind: "video",
    });

    input.project = { id: "project-other", slug: "other-home" };
    expect(buildSessionSourceEvidence(input).sources[0].audioMastery).toBeNull();
  });

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
        videoFormat: {
          requestedQuality: "production-4k-24",
          intentFulfilled: true,
          systemPressureAtStart: "nominal",
          configured: {
            widthPixels: 3840,
            heightPixels: 2160,
            frameRate: 24,
            codec: "hevc",
            colorSpace: "P3-D65",
            orientation: "landscape",
            cameraPosition: "front",
            rotationDegrees: 0,
          },
          recorded: {
            videoTrackCount: 1,
            encodedWidthPixels: 3840,
            encodedHeightPixels: 2160,
            presentationWidthPixels: 3840,
            presentationHeightPixels: 2160,
            frameRate: 24,
            codec: "hvc1",
            rotationDegrees: 0,
          },
        },
      },
      processingDisposition: "RELEASED",
      transcriptDisposition: "HELD",
      releaseAudit: null,
      issues: [],
    });
    expect(JSON.stringify(result)).not.toContain("cameraDeviceUniqueID");
    expect(JSON.stringify(result)).not.toContain("actor-private-1");
  });

  it("does not invent video evidence for an audio-only source", () => {
    const input = fixture();
    const profile = (input.recordingAssets[0].localManifestJson as any)
      .reportedSourceProfile;
    for (const key of [
      "width",
      "height",
      "nominalFrameRate",
      "colorSpace",
      "orientation",
      "cameraPosition",
      "captureRotationDegrees",
      "requestedVideoQuality",
      "videoQualityIntentFulfilled",
      "videoSystemPressureAtStart",
    ]) delete profile[key];
    profile.recordedMedia.videoTrackCount = 0;
    delete profile.recordedMedia.videoCodec;
    delete profile.recordedMedia.encodedWidth;
    delete profile.recordedMedia.encodedHeight;
    delete profile.recordedMedia.presentationWidth;
    delete profile.recordedMedia.presentationHeight;
    delete profile.recordedMedia.rotationDegrees;
    delete profile.recordedMedia.nominalFrameRate;

    expect(buildSessionSourceEvidence(input).sources[0].captureRuntime)
      .not.toHaveProperty("videoFormat");
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

  it("verifies an audited recovery replica without inventing native Capture boundaries", () => {
    const input = fixture();
    markAsAuditedRecoveryReplica(input);

    const result = buildSessionSourceEvidence(input);

    expect(result.sources[0]).toMatchObject({
      status: "VERIFIED_MATCH",
      sourceOrigin: "NEST_RECOVERY_REPLICA",
      boundaryAuthority: "AUDITED_RECOVERY_REPLICA",
      startBoundary: null,
      stopBoundary: null,
      recoveryAudit: {
        originalRecordingAssetId: "original-asset-1",
        expectationId: "expected-source-1",
        importedSourceGeneration: "88",
        durableReplicaGeneration: "1742",
        originalSourceMediaUnchanged: true,
      },
      protectedPlayback: {
        sourceId: "studio-source-1",
        url: "/api/ingest/media/studio-source-1",
        kind: "video",
      },
      issues: [],
    });
    expect(JSON.stringify(result)).not.toContain("actor-private-1");
    expect(JSON.stringify(result)).not.toContain("private@example.test");
    expect(JSON.stringify(result)).not.toContain("gs://private-import");
  });

  it("refuses to expose a promotion URL that is not the protected source route", () => {
    const input = fixture();
    markAsAuditedRecoveryReplica(input);
    (input.recordingAssets[0].localManifestJson as any).promotion.playbackUrl = "https://storage.example.test/private.wav";

    expect(buildSessionSourceEvidence(input).sources[0].protectedPlayback).toBeNull();
  });

  it("refuses to project an unsafe protected-playback source identity", () => {
    const input = fixture();
    markAsAuditedRecoveryReplica(input);
    (input.recordingAssets[0].localManifestJson as any).promotion.sourceId = "../private-object";
    (input.recordingAssets[0].localManifestJson as any).promotion.playbackUrl = "/api/ingest/media/../private-object";

    expect(buildSessionSourceEvidence(input).sources[0].protectedPlayback).toBeNull();
  });

  it("joins a completed exact-byte signal receipt without mutating the recovery manifest", () => {
    const input = fixture();
    markAsAuditedRecoveryReplica(input);
    input.audioSignalProfileJobs = [completedAudioSignalJob()];

    const result = buildSessionSourceEvidence(input);

    expect(result.sources[0]).toMatchObject({
      status: "VERIFIED_MATCH",
      analysis: {
        jobId: "audio_signal_recovery_fixture_1",
        mediaAssetId: "studio-media-asset-1",
        status: "completed",
        exactSourceBound: true,
        completeDecode: true,
        completedAt: "2026-08-02T20:02:00.000Z",
        media: { container: "wav", codec: "pcm_s24le", sampleRateHz: 48_000, channelCount: 1, durationSeconds: 1 },
        signal: expect.objectContaining({ status: "signal-present", rmsDbfs: -18, samplePeakDbfs: -3 }),
        error: null,
      },
    });
    expect((input.recordingAssets[0].localManifestJson as any).reportedSourceProfile).toBeUndefined();
  });

  it("fails derived analysis closed when its job hash belongs to different bytes", () => {
    const input = fixture();
    markAsAuditedRecoveryReplica(input);
    input.audioSignalProfileJobs = [completedAudioSignalJob("c".repeat(64))];

    expect(buildSessionSourceEvidence(input).sources[0]).toMatchObject({
      status: "VERIFIED_MATCH",
      analysis: {
        status: "failed",
        exactSourceBound: false,
        completeDecode: false,
        media: null,
        signal: null,
        error: "Complete-decode job is not bound to these exact retained bytes.",
      },
    });
  });

  it("fails closed when an audited recovery replica drifts from durable storage", () => {
    const input = fixture();
    markAsAuditedRecoveryReplica(input);
    ((input.finalizationReceipts[0].metadataJson as any).recoveryAuthority.durableCaptureReplica as any).generation = "1743";

    expect(buildSessionSourceEvidence(input).sources[0]).toMatchObject({
      status: "DRIFT",
      sourceOrigin: "NEST_RECOVERY_REPLICA",
      boundaryAuthority: null,
      recoveryAudit: null,
      issues: expect.arrayContaining(["Receipt durable generation does not match the audited recovery receipt."]),
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
