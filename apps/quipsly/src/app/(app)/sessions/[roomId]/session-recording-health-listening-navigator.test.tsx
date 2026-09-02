import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { SessionRecordingHealthListeningNavigator } from "./session-recording-health-listening-navigator";
import type { SessionRecordingHealth } from "./session-recording-health";
import type { SessionSourceEvidence } from "./session-source-evidence-model";

function signal(observations: Array<{ kind: "possible-dropout"; severity: "attention"; startSeconds: number; endSeconds: number; detail: string; requiresListening: true }> = []) {
  return {
    schemaVersion: 1 as const,
    algorithm: "quipsly-audio-signal-window-v1" as const,
    status: observations.length ? "attention" as const : "signal-present" as const,
    sampleRateHz: 48_000,
    channelCount: 1,
    analyzedFrameCount: 960_000,
    durationSeconds: 20,
    windowDurationSeconds: 10,
    rmsDbfs: -18,
    samplePeakDbfs: -3,
    clippedFrameCount: 0,
    clippedFrameFraction: 0,
    nearSilentFrameFraction: 0,
    leftRmsDbfs: -18,
    rightRmsDbfs: null,
    stereoBalanceDb: null,
    rmsIsNotLufs: true as const,
    loudness: null,
    thresholds: { clippingAmplitude: 0.999, nearSilenceDbfs: -72, possibleDropoutMinimumSeconds: 0.25, surroundingSignalDbfs: -45, stereoImbalanceDb: 12 },
    waveform: [
      { startSeconds: 0, durationSeconds: 10, rmsDbfs: -18, samplePeakDbfs: -3, clippedFrameCount: 0 },
      { startSeconds: 10, durationSeconds: 10, rmsDbfs: -20, samplePeakDbfs: -4, clippedFrameCount: 0 },
    ],
    frequencyProfile: null,
    observations,
  };
}

function health(): SessionRecordingHealth {
  return {
    state: "REVIEW",
    headline: "Two retained sources",
    detail: "One current master and one historical source.",
    sources: [{
      id: "observed:historical",
      recordingAssetId: "historical",
      expectedSourceId: null,
      participantLabel: "Charlie",
      label: "Historical browser.wav",
      sourceKind: "audio",
      retentionRole: "unplanned",
      state: "REVIEW",
      nextAction: "Review the plan.",
      gates: [],
    }, {
      id: "expected:master",
      recordingAssetId: "master",
      expectedSourceId: "expected-master",
      participantLabel: "Charlie",
      label: "MV7i master.wav",
      sourceKind: "audio",
      retentionRole: "required-master",
      state: "READY",
      nextAction: "Proof-listen.",
      gates: [],
    }],
    counts: { READY: 1, REVIEW: 1, BLOCKED: 0, UNKNOWN: 0 },
    boundaries: { projectionCreatesNoWorkflowState: true, noUniversalQualityScore: true, transcriptConfidenceIsNotAudioHealth: true, captureSettingsAreNotDecodedMedia: true, releasedBytesAreNotProofListened: true },
  };
}

function evidence(): SessionSourceEvidence {
  const source = (id: string, label: string, sourceSignal: ReturnType<typeof signal>): SessionSourceEvidence["sources"][number] => ({
    recordingAssetId: id,
    fileName: label,
    kind: "LOCAL_AUDIO",
    recordingStatus: "VERIFIED",
    status: "VERIFIED_MATCH",
    captureId: null,
    captureGroupId: "group-1",
    uploadSessionId: "upload-1",
    startBoundary: null,
    stopBoundary: null,
    sourceOrigin: "NEST_RECOVERY_REPLICA",
    boundaryAuthority: "AUDITED_RECOVERY_REPLICA",
    cloud: { sha256: "a".repeat(64), byteSize: "4096", generation: "9", bucket: "private", objectPath: `${id}.wav`, verifiedAt: "2026-08-06T01:00:00.000Z" },
    protectedPlayback: { sourceId: `source-${id}`, url: `/api/ingest/media/source-${id}`, kind: "audio", durationSeconds: 20 },
    captureRuntime: { appVersion: null, appBuild: null, deviceModel: null, operatingSystem: null, audioRoute: null },
    analysis: {
      jobId: `audio-signal-${id}`,
      mediaAssetId: `media-${id}`,
      status: "completed",
      exactSourceBound: true,
      completeDecode: true,
      completedAt: "2026-08-06T01:01:00.000Z",
      updatedAt: "2026-08-06T01:01:00.000Z",
      media: { container: "wav", codec: "pcm_s24le", sampleRateHz: 48_000, channelCount: 1, durationSeconds: 20 },
      signal: sourceSignal,
      error: null,
      boundaries: { derivedEvidenceDoesNotMutateCaptureManifest: true, exactBytesBoundByAssetHashAndSize: true, sourceReplicaGenerationRemainsSeparate: true },
    },
    processingDisposition: "RELEASED",
    transcriptDisposition: "RELEASED",
    issues: [],
  });
  return {
    sources: [
      source("historical", "Historical browser.wav", signal([{ kind: "possible-dropout", severity: "attention", startSeconds: 4, endSeconds: 4.5, detail: "Energy fell below the configured threshold.", requiresListening: true }])),
      source("master", "MV7i master.wav", signal()),
    ],
    counts: { VERIFIED_MATCH: 2, HELD: 0, DRIFT: 0, INCOMPLETE: 0 },
  };
}

describe("SessionRecordingHealthListeningNavigator", () => {
  beforeEach(() => {
    jest.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    jest.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("starts on the ready master and exposes protected native playback plus a source clock", () => {
    render(<SessionRecordingHealthListeningNavigator health={health()} evidence={evidence()} />);

    expect(screen.getByRole("heading", { name: "Open the actual master" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /MV7i master.wav/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Protected source MV7i master.wav")).toHaveAttribute("src", "/api/ingest/media/source-master");
    expect(screen.getByRole("slider", { name: "Selected source time" })).toHaveAttribute("max", "20");
    expect(screen.getByRole("img", { name: "Complete-decode waveform overview" })).toBeInTheDocument();
    expect(screen.getByText(/No configured complete-decode threshold flagged a range/)).toBeInTheDocument();
  });

  it("switches source identity and plays exact-time observations without claiming playback review", async () => {
    render(<SessionRecordingHealthListeningNavigator health={health()} evidence={evidence()} />);

    fireEvent.click(screen.getByRole("button", { name: /Historical browser.wav/ }));

    expect(screen.getByRole("button", { name: /Historical browser.wav/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Protected source Historical browser.wav")).toHaveAttribute("src", "/api/ingest/media/source-historical");
    fireEvent.click(screen.getByRole("button", { name: /0:04 · possible dropout/i }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/source check from 00:04/i));
    expect(screen.getByText(/no heard\/approved claim is written/i)).toBeInTheDocument();
  });

  it("fails visibly when no authorized protected source is attached", () => {
    const withoutPlayback = evidence();
    for (const source of withoutPlayback.sources) source.protectedPlayback = null;

    render(<SessionRecordingHealthListeningNavigator health={health()} evidence={withoutPlayback} />);

    expect(screen.getByRole("heading", { name: "Protected playback is not attached" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Check up to 10 seconds/ })).not.toBeInTheDocument();
  });
});
