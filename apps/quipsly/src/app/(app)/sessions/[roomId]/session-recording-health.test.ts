import { buildSessionRecordingHealth } from "./session-recording-health";
import { EMPTY_SESSION_READINESS_TOPOLOGY } from "./session-readiness-topology";
import type { SessionReadinessSource, SessionReadinessTopology } from "./session-readiness-topology";
import type { SessionSourceEvidence } from "./session-source-evidence-model";

function retainedSource(): SessionReadinessSource {
  return {
    id: "asset-1",
    evidenceKind: "recording-asset",
    sourceKind: "audio",
    label: "Charlie MV7i.wav",
    status: "VERIFIED",
    clientKind: "web",
    deviceLabel: "Mac browser · Shure MV7i",
    captureId: "capture-1",
    startedAt: "2026-08-06T01:00:00.000Z",
    stoppedAt: "2026-08-06T01:42:00.000Z",
    durationSeconds: 2520,
    byteSize: "200000000",
    verified: true,
    serverRetention: {
      state: "SERVER_COPY_VERIFIED_RELEASED",
      uploadSessionId: "upload-1",
      exactBytesVerified: true,
      processingDisposition: "RELEASED",
      transcriptDisposition: "RELEASED",
      updatedAt: "2026-08-06T02:00:00.000Z",
    },
  };
}

function topology(overrides: Partial<SessionReadinessTopology["expectedSources"][number]> = {}): SessionReadinessTopology {
  return {
    ...EMPTY_SESSION_READINESS_TOPOLOGY,
    generatedAt: "2026-08-06T03:00:00.000Z",
    people: [{
      id: "person-1",
      label: "Charlie",
      role: "HOST",
      isCurrentActor: true,
      consent: "ready",
      videoConsent: true,
      transcriptionConsent: true,
      endpoints: [],
      preflights: [],
      endpointQueues: [],
      sources: [retainedSource()],
      attentionCount: 0,
    }],
    expectedSources: [{
      id: "expected-1",
      participantId: "person-1",
      participantLabel: "Charlie",
      label: "Charlie clean microphone master",
      sourceKind: "audio",
      retentionRole: "required-master",
      status: "active",
      expectedClientKind: "web",
      expectedDeviceLabel: "MV7i",
      recordingAssetId: "asset-1",
      captureId: "capture-1",
      revision: 2,
      latestReason: null,
      fulfillment: "fulfilled",
      blocking: false,
      candidateSources: [],
      createdAt: "2026-08-05T23:00:00.000Z",
      updatedAt: "2026-08-06T02:00:00.000Z",
      ...overrides,
    }],
  };
}

function sourceEvidence(overrides: Partial<SessionSourceEvidence["sources"][number]> = {}): SessionSourceEvidence {
  return {
    sources: [{
      recordingAssetId: "asset-1",
      fileName: "Charlie MV7i.wav",
      kind: "LOCAL_AUDIO",
      recordingStatus: "VERIFIED",
      status: "VERIFIED_MATCH",
      captureId: "capture-1",
      captureGroupId: "group-1",
      uploadSessionId: "upload-1",
      startBoundary: { receiptId: "start-1", occurredAt: "2026-08-06T01:00:00.000Z" },
      stopBoundary: { receiptId: "stop-1", occurredAt: "2026-08-06T01:42:00.000Z" },
      sourceOrigin: "CAPTURE",
      boundaryAuthority: "CAPTURE_RECEIPTS",
      cloud: {
        sha256: "a".repeat(64),
        byteSize: "200000000",
        generation: "9",
        bucket: "quipsly",
        objectPath: "capture.wav",
        verifiedAt: "2026-08-06T01:59:00.000Z",
      },
      captureRuntime: {
        appVersion: "1.0",
        appBuild: "28",
        deviceModel: "Mac",
        operatingSystem: "macOS",
        audioRoute: "MV7i",
        audioFormat: {
          container: "wav",
          codec: "pcm_s24le",
          sampleRateHz: 48_000,
          channelCount: 1,
          hardwareSampleRateHz: 48_000,
          hardwareInputChannelCount: 1,
          decodedAudioTrackCount: 1,
          decodedSampleRateHz: 48_000,
          decodedChannelCount: 1,
          capturePipeline: "media-recorder",
          pauseTimelinePolicy: "continuous-source-clock",
          signal: {
            schemaVersion: 1,
            algorithm: "quipsly-audio-signal-window-v1",
            status: "signal-present",
            sampleRateHz: 48_000,
            channelCount: 1,
            analyzedFrameCount: 126_000,
            durationSeconds: 2520,
            windowDurationSeconds: 1,
            rmsDbfs: -19.2,
            samplePeakDbfs: -3.4,
            clippedFrameCount: 0,
            clippedFrameFraction: 0,
            nearSilentFrameFraction: 0.01,
            leftRmsDbfs: -19.2,
            rightRmsDbfs: null,
            stereoBalanceDb: null,
            rmsIsNotLufs: true,
            loudness: null,
            thresholds: {
              clippingAmplitude: 0.999,
              nearSilenceDbfs: -72,
              possibleDropoutMinimumSeconds: 0.25,
              surroundingSignalDbfs: -45,
              stereoImbalanceDb: 12,
            },
            waveform: [],
            frequencyProfile: null,
            observations: [],
          },
        },
      },
      processingDisposition: "RELEASED",
      transcriptDisposition: "RELEASED",
      releaseAudit: null,
      issues: [],
      ...overrides,
    }],
    counts: { VERIFIED_MATCH: 1, HELD: 0, DRIFT: 0, INCOMPLETE: 0 },
  };
}

describe("Session recording health", () => {
  it("calls a required microphone master ready only when every evidence gate is ready", () => {
    const health = buildSessionRecordingHealth({ topology: topology(), sourceEvidence: sourceEvidence() });

    expect(health.state).toBe("READY");
    expect(health.sources[0]).toMatchObject({
      label: "Charlie clean microphone master",
      state: "READY",
      nextAction: expect.stringContaining("proof-listen"),
    });
    expect(health.sources[0]?.gates.map((gate) => [gate.id, gate.state])).toEqual([
      ["plan", "READY"],
      ["immutable-source", "READY"],
      ["decoded-media", "READY"],
      ["signal", "READY"],
      ["processing", "READY"],
      ["transcription", "READY"],
    ]);
  });

  it("uses source-bound programme loudness when the complete decode measured it", () => {
    const evidence = sourceEvidence();
    evidence.sources[0]!.captureRuntime.audioFormat!.signal!.loudness = {
      schemaVersion: 1,
      algorithm: "itu-r-bs.1770-5-integrated-v1",
      standard: "ITU-R BS.1770-5",
      status: "measured",
      sampleRateHz: 48_000,
      channelCount: 1,
      analyzedFrameCount: 126_000,
      measurementBlockDurationSeconds: 0.4,
      measurementBlockStepSeconds: 0.1,
      measurementBlockCount: 23,
      absoluteGatedBlockCount: 23,
      relativeGatedBlockCount: 22,
      absoluteGateLufs: -70,
      relativeGateLufs: -30.6,
      integratedLoudnessLufs: -20.6,
      maximumMomentaryLoudnessLufs: -16.2,
      truePeakMeasured: false,
      masteringTargetInferred: false,
    };

    const health = buildSessionRecordingHealth({ topology: topology(), sourceEvidence: evidence });

    expect(health.sources[0]?.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "signal", state: "READY", detail: expect.stringContaining("programme loudness -20.6 LUFS") }),
    ]));
  });

  it("blocks a required audio master whose complete decode is near digital silence", () => {
    const evidence = sourceEvidence();
    evidence.sources[0]!.captureRuntime.audioFormat!.signal = {
      ...evidence.sources[0]!.captureRuntime.audioFormat!.signal!,
      status: "near-digital-silence",
      nearSilentFrameFraction: 0.97,
    };

    const health = buildSessionRecordingHealth({ topology: topology(), sourceEvidence: evidence });

    expect(health.state).toBe("BLOCKED");
    expect(health.sources[0]?.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "signal", state: "BLOCKED", detail: expect.stringContaining("97.0%") }),
    ]));
  });

  it("keeps exact bytes green while a processing hold blocks use and a transcript hold stays separate", () => {
    const evidence = sourceEvidence({ status: "HELD", processingDisposition: "HELD", transcriptDisposition: "HELD" });
    const health = buildSessionRecordingHealth({ topology: topology(), sourceEvidence: evidence });

    expect(health.sources[0]?.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "immutable-source", state: "READY" }),
      expect.objectContaining({ id: "processing", state: "BLOCKED" }),
      expect.objectContaining({ id: "transcription", state: "REVIEW" }),
    ]));
  });

  it("refuses to infer audio health from released bytes when decoded signal evidence is absent", () => {
    const evidence = sourceEvidence();
    evidence.sources[0]!.captureRuntime.audioFormat!.signal = null;
    const health = buildSessionRecordingHealth({ topology: topology(), sourceEvidence: evidence });

    expect(health.state).toBe("UNKNOWN");
    expect(health.sources[0]?.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "signal", state: "UNKNOWN", detail: expect.stringContaining("Transcript confidence") }),
    ]));
  });

  it("uses a completed exact-source derived scan when a recovery replica has no capture-time profile", () => {
    const evidence = sourceEvidence({
      sourceOrigin: "NEST_RECOVERY_REPLICA",
      boundaryAuthority: "AUDITED_RECOVERY_REPLICA",
      captureRuntime: {
        appVersion: null,
        appBuild: null,
        deviceModel: null,
        operatingSystem: null,
        audioRoute: null,
        audioFormat: {
          container: null,
          codec: null,
          sampleRateHz: null,
          channelCount: null,
          hardwareSampleRateHz: null,
          hardwareInputChannelCount: null,
          decodedAudioTrackCount: null,
          decodedSampleRateHz: null,
          decodedChannelCount: null,
          capturePipeline: null,
          pauseTimelinePolicy: null,
          signal: null,
        },
      },
      analysis: {
        jobId: "audio_signal_recovery_1",
        mediaAssetId: "studio-media-1",
        status: "completed",
        exactSourceBound: true,
        completeDecode: true,
        completedAt: "2026-08-06T02:03:00.000Z",
        updatedAt: "2026-08-06T02:03:00.000Z",
        media: { container: "wav", codec: "pcm_s24le", sampleRateHz: 48_000, channelCount: 1, durationSeconds: 2520 },
        signal: sourceEvidence().sources[0]!.captureRuntime.audioFormat!.signal,
        error: null,
        boundaries: {
          derivedEvidenceDoesNotMutateCaptureManifest: true,
          exactBytesBoundByAssetHashAndSize: true,
          sourceReplicaGenerationRemainsSeparate: true,
        },
      },
    });

    const health = buildSessionRecordingHealth({ topology: topology(), sourceEvidence: evidence });

    expect(health.state).toBe("READY");
    expect(health.sources[0]?.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "decoded-media", state: "READY", detail: expect.stringContaining("Complete wav decode") }),
      expect.objectContaining({ id: "signal", state: "READY", detail: expect.stringContaining("Signal is present") }),
    ]));
  });

  it("blocks a required master when derived analysis fails integrity validation", () => {
    const evidence = sourceEvidence({
      analysis: {
        jobId: "audio_signal_wrong_bytes_1",
        mediaAssetId: "studio-media-1",
        status: "failed",
        exactSourceBound: false,
        completeDecode: false,
        completedAt: null,
        updatedAt: "2026-08-06T02:03:00.000Z",
        media: null,
        signal: null,
        error: "Complete-decode job is not bound to these exact retained bytes.",
        boundaries: {
          derivedEvidenceDoesNotMutateCaptureManifest: true,
          exactBytesBoundByAssetHashAndSize: true,
          sourceReplicaGenerationRemainsSeparate: true,
        },
      },
    });

    const health = buildSessionRecordingHealth({ topology: topology(), sourceEvidence: evidence });

    expect(health.state).toBe("BLOCKED");
    expect(health.sources[0]?.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "decoded-media", state: "BLOCKED", detail: expect.stringContaining("not bound") }),
      expect.objectContaining({ id: "signal", state: "BLOCKED", detail: expect.stringContaining("not bound") }),
    ]));
  });

  it("blocks a missing required planned master even when no file ever appeared", () => {
    const inputTopology = topology({ recordingAssetId: null, captureId: null, fulfillment: "missing", blocking: true });
    inputTopology.people[0]!.sources = [];
    const health = buildSessionRecordingHealth({
      topology: inputTopology,
      sourceEvidence: { sources: [], counts: { VERIFIED_MATCH: 0, HELD: 0, DRIFT: 0, INCOMPLETE: 0 } },
    });

    expect(health.state).toBe("BLOCKED");
    expect(health.sources[0]).toMatchObject({ recordingAssetId: null, state: "BLOCKED" });
    expect(health.sources[0]?.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "plan", state: "BLOCKED" }),
      expect.objectContaining({ id: "immutable-source", state: "BLOCKED" }),
    ]));
  });

  it("surfaces an unplanned retained source for review instead of silently blessing it", () => {
    const inputTopology = topology();
    inputTopology.expectedSources = [];
    const health = buildSessionRecordingHealth({ topology: inputTopology, sourceEvidence: sourceEvidence() });

    expect(health.state).toBe("REVIEW");
    expect(health.sources[0]).toMatchObject({ expectedSourceId: null, retentionRole: "unplanned" });
    expect(health.sources[0]?.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "plan", state: "REVIEW" }),
    ]));
  });
});
