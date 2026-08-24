/** @jest-environment node */

import {
  assembleSessionTranscriptProgramClock,
  SessionTranscriptAssemblyError,
} from "./session-transcript-assembly";

function alignment(start: string, group = "take-1", uncertaintyMilliseconds = 42) {
  return {
    schema: "quipsly-capture-alignment-proposal-v1",
    status: "proposal-ready",
    captureGroupId: group,
    estimatedServerStartedAt: start,
    uncertaintyMilliseconds,
    sampleAccurateClaimed: false,
    reviewRequired: true,
    reviewGate: {
      waveformCorrelationRequired: true,
      driftReviewRequired: true,
      humanApprovalRequired: true,
    },
  };
}

describe("Session transcript program clock", () => {
  it("prefers validated monotonic/server clock proposals over skewed wall starts", () => {
    const clock = assembleSessionTranscriptProgramClock([
      {
        recordingAssetId: "recording-coach",
        transcriptJobId: "transcript-coach",
        captureGroupId: "take-1",
        recordedStartedAt: "2026-08-24T15:00:05.000Z",
        alignment: alignment("2026-08-24T15:00:00.000Z", "take-1", 35),
      },
      {
        recordingAssetId: "recording-client",
        transcriptJobId: "transcript-client",
        captureGroupId: "take-1",
        recordedStartedAt: "2026-08-24T15:00:00.000Z",
        alignment: alignment("2026-08-24T15:00:00.625Z", "take-1", 48),
      },
    ]);

    expect(clock).toMatchObject({
      schema: "quipsly-session-transcript-program-clock-v1",
      authority: "capture-clock-proposal",
      baselineRecordingAssetId: "recording-coach",
      waveformReviewRequired: true,
      sampleAccurateClaimed: false,
    });
    expect(clock.sources.map((source) => [
      source.recordingAssetId,
      source.programOffsetSeconds,
      source.timingUncertaintyMilliseconds,
    ])).toEqual([
      ["recording-coach", 0, 35],
      ["recording-client", 0.625, 48],
    ]);
  });

  it("labels reported wall starts as fallback instead of exact sync", () => {
    const clock = assembleSessionTranscriptProgramClock([
      { recordingAssetId: "recording-a", transcriptJobId: "transcript-a", captureGroupId: "take-1", recordedStartedAt: "2026-08-24T15:00:00.000Z" },
      { recordingAssetId: "recording-b", transcriptJobId: "transcript-b", captureGroupId: "take-1", recordedStartedAt: "2026-08-24T15:00:01.250Z" },
    ]);

    expect(clock.authority).toBe("reported-wall-clock-fallback");
    expect(clock.sources[1]).toMatchObject({
      programOffsetSeconds: 1.25,
      timingReviewRequired: true,
      timingUncertaintyMilliseconds: null,
      sampleAccurateClaimed: false,
    });
  });

  it("does not merge sources from different capture takes", () => {
    expect(() => assembleSessionTranscriptProgramClock([
      { recordingAssetId: "recording-a", transcriptJobId: "transcript-a", captureGroupId: "take-a", recordedStartedAt: "2026-08-24T15:00:00.000Z" },
      { recordingAssetId: "recording-b", transcriptJobId: "transcript-b", captureGroupId: "take-b", recordedStartedAt: "2026-08-24T15:00:01.000Z" },
    ])).toThrow(expect.objectContaining<Partial<SessionTranscriptAssemblyError>>({
      code: "TRANSCRIPT_SOURCE_TAKE_MISMATCH",
    }));
  });

  it("refuses a manifest take that conflicts with preserved clock evidence", () => {
    expect(() => assembleSessionTranscriptProgramClock([{
      recordingAssetId: "recording-a",
      transcriptJobId: "transcript-a",
      captureGroupId: "declared-take",
      recordedStartedAt: "2026-08-24T15:00:00.000Z",
      alignment: alignment("2026-08-24T15:00:00.000Z", "evidence-take"),
    }])).toThrow(expect.objectContaining<Partial<SessionTranscriptAssemblyError>>({
      code: "TRANSCRIPT_SOURCE_TAKE_MISMATCH",
    }));
  });

  it("keeps one source on its own clock without implying cross-device sync", () => {
    const clock = assembleSessionTranscriptProgramClock([{
      recordingAssetId: "recording-a",
      transcriptJobId: "transcript-a",
      recordedStartedAt: "2026-08-24T15:00:00.000Z",
      alignment: alignment("2026-08-24T15:00:00.200Z"),
    }]);
    expect(clock).toMatchObject({
      authority: "single-source-origin",
      waveformReviewRequired: false,
      sources: [{ programOffsetSeconds: 0, timingReviewRequired: false }],
    });
  });
});
