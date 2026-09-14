/** @jest-environment node */

import {
  assembleSessionTranscriptProgramClock,
  SessionTranscriptAssemblyError,
} from "./session-transcript-assembly";

function alignment(
  start: string,
  group = "take-1",
  uncertaintyMilliseconds = 42,
) {
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

function reviewedPlacement(input: {
  spine: string;
  target: string;
  offset: number;
  group?: string;
}) {
  return {
    alignmentJobId: `alignment-${input.spine}-${input.target}`,
    captureGroupId: input.group ?? "take-1",
    spineRecordingAssetId: input.spine,
    targetRecordingAssetId: input.target,
    signedOffsetSeconds: input.offset,
    residualDriftMilliseconds: 1.4,
    correctionApplied: false as const,
    sourceBytesMutated: false as const,
    sampleAccurateClaimed: false as const,
  };
}

describe("Session transcript program clock", () => {
  const source = (id: string, seconds: number, calibrated = true) => ({
    recordingAssetId: id,
    transcriptJobId: `transcript-${id}`,
    captureGroupId: "take-1",
    recordedStartedAt: new Date(Date.parse("2026-08-24T15:00:00Z") + (seconds + (calibrated ? 90 : 0)) * 1_000),
    alignment: calibrated ? alignment(new Date(Date.parse("2026-08-24T15:00:00Z") + seconds * 1_000).toISOString()) : undefined,
  });

  it("keeps measured sync usable when a reconnect has only a capture clock", () => {
    const inputs = [source("coach", 0), source("client", 9), source("reconnect", 1200)];
    const before = structuredClone(inputs);
    const placements = [reviewedPlacement({spine: "coach", target: "client", offset: 0.35})];
    const clock = assembleSessionTranscriptProgramClock(inputs, {reviewedPlacements: placements});
    expect(clock).toMatchObject({authority: "mixed-waveform-clock-placement", waveformReviewRequired: true, sampleAccurateClaimed: false});
    expect(clock.sources.map(row => row.programOffsetSeconds)).toEqual([0, 0.35, 1200]);
    expect(clock.sources.every(row => row.timingReviewRequired && row.timingUncertaintyMilliseconds === null)).toBe(true);
    expect(inputs).toEqual(before);
    // Resetting the measured adjustment retains the original device clocks.
    expect(assembleSessionTranscriptProgramClock(inputs).sources.map(row => row.programOffsetSeconds)).toEqual([0, 9, 1200]);
  });

  it("does not let source or placement query order move disconnected measured groups", () => {
    const inputs = [source("a", 0), source("b", 9), source("c", 1200), source("d", 1209), source("e", 1800, false)];
    const placements = [reviewedPlacement({spine: "a", target: "b", offset: -0.35}), reviewedPlacement({spine: "c", target: "d", offset: 0.5})];
    const offsets = (rows: typeof inputs, edges: typeof placements) => Object.fromEntries(
      assembleSessionTranscriptProgramClock(rows, {reviewedPlacements: edges}).sources.map(row => [row.recordingAssetId, row.programOffsetSeconds]),
    );
    const expected = {a: 0.35, b: 0, c: 1200.35, d: 1200.85, e: 1800.35};
    expect(offsets(inputs, placements)).toEqual(expected);
    expect(offsets([...inputs].reverse(), [...placements].reverse())).toEqual(expected);
    expect(offsets([inputs[3]!, inputs[1]!, inputs[4]!, inputs[0]!, inputs[2]!], placements)).toEqual(expected);
  });

  it("prefers a calibrated anchor over a skewed wall clock within a measured group", () => {
    const clock = assembleSessionTranscriptProgramClock(
      [source("uncalibrated", -90, false), source("calibrated", 0), source("reconnect", 1200)],
      {reviewedPlacements: [reviewedPlacement({spine: "calibrated", target: "uncalibrated", offset: 0.25})]},
    );
    expect(clock.sources.map(row => row.programOffsetSeconds)).toEqual([0.25, 0, 1200]);
  });

  it("checks conflicting cycles in disconnected groups too", () => {
    expect(() => assembleSessionTranscriptProgramClock(
      [source("unconnected", 0), source("a", 1), source("b", 2), source("c", 3)],
      {reviewedPlacements: [reviewedPlacement({spine: "a", target: "b", offset: 0.1}), reviewedPlacement({spine: "b", target: "c", offset: 0.1}), reviewedPlacement({spine: "a", target: "c", offset: 0.3})]},
    )).toThrow(expect.objectContaining({code: "TRANSCRIPT_REVIEWED_PLACEMENT_CONFLICT"}));
  });

  it("does not accept an unrelated source or another take as partial sync", () => {
    for (const placement of [reviewedPlacement({spine: "a", target: "outside", offset: 1}), reviewedPlacement({spine: "a", target: "b", offset: 1, group: "other-take"})]) {
      expect(() => assembleSessionTranscriptProgramClock([source("a", 0), source("b", 1), source("c", 2)], {reviewedPlacements: [placement]}))
        .toThrow(expect.objectContaining({code: "TRANSCRIPT_REVIEWED_PLACEMENT_CONFLICT"}));
    }
  });

  it("returns to a fully measured clock when the reconnect becomes connected", () => {
    const clock = assembleSessionTranscriptProgramClock([source("a", 0), source("b", 9), source("c", 1200)], {
      reviewedPlacements: [reviewedPlacement({spine: "a", target: "b", offset: 0.35}), reviewedPlacement({spine: "b", target: "c", offset: 1199.4})],
    });
    expect(clock.authority).toBe("reviewed-waveform-placement");
    expect(clock.sources.map(row => row.programOffsetSeconds)).toEqual([0, 0.35, 1199.75]);
  });

  it("uses an approved measured placement as the Session clock authority", () => {
    const clock = assembleSessionTranscriptProgramClock(
      [
        {
          recordingAssetId: "recording-coach",
          transcriptJobId: "transcript-coach",
          captureGroupId: "take-1",
          recordedStartedAt: "2026-08-24T15:00:00.000Z",
        },
        {
          recordingAssetId: "recording-client",
          transcriptJobId: "transcript-client",
          captureGroupId: "take-1",
          recordedStartedAt: "2026-08-24T15:00:09.000Z",
        },
      ],
      {
        reviewedPlacements: [
          reviewedPlacement({
            spine: "recording-coach",
            target: "recording-client",
            offset: 0.35,
          }),
        ],
      },
    );

    expect(clock).toMatchObject({
      authority: "reviewed-waveform-placement",
      baselineRecordingAssetId: "recording-coach",
      waveformReviewRequired: false,
      sampleAccurateClaimed: false,
      sources: [
        {
          recordingAssetId: "recording-coach",
          programOffsetSeconds: 0,
          timingReviewRequired: false,
        },
        {
          recordingAssetId: "recording-client",
          programOffsetSeconds: 0.35,
          timingReviewRequired: false,
        },
      ],
    });
  });

  it("preserves a negative measured offset by moving the spine after program zero", () => {
    const clock = assembleSessionTranscriptProgramClock(
      [
        {
          recordingAssetId: "recording-spine",
          transcriptJobId: "transcript-spine",
          captureGroupId: "take-1",
          recordedStartedAt: "2026-08-24T15:00:00.000Z",
        },
        {
          recordingAssetId: "recording-target",
          transcriptJobId: "transcript-target",
          captureGroupId: "take-1",
          recordedStartedAt: "2026-08-24T15:00:00.000Z",
        },
      ],
      {
        reviewedPlacements: [
          reviewedPlacement({
            spine: "recording-spine",
            target: "recording-target",
            offset: -0.35,
          }),
        ],
      },
    );

    expect(clock.baselineRecordingAssetId).toBe("recording-target");
    expect(
      clock.sources.map((source) => [
        source.recordingAssetId,
        source.programOffsetSeconds,
      ]),
    ).toEqual([
      ["recording-spine", 0.35],
      ["recording-target", 0],
    ]);
  });

  it("holds conflicting reviewed placement cycles instead of choosing one", () => {
    expect(() =>
      assembleSessionTranscriptProgramClock(
        [
          {
            recordingAssetId: "a",
            transcriptJobId: "ta",
            captureGroupId: "take-1",
            recordedStartedAt: "2026-08-24T15:00:00.000Z",
          },
          {
            recordingAssetId: "b",
            transcriptJobId: "tb",
            captureGroupId: "take-1",
            recordedStartedAt: "2026-08-24T15:00:00.000Z",
          },
          {
            recordingAssetId: "c",
            transcriptJobId: "tc",
            captureGroupId: "take-1",
            recordedStartedAt: "2026-08-24T15:00:00.000Z",
          },
        ],
        {
          reviewedPlacements: [
            reviewedPlacement({ spine: "a", target: "b", offset: 0.1 }),
            reviewedPlacement({ spine: "b", target: "c", offset: 0.1 }),
            reviewedPlacement({ spine: "a", target: "c", offset: 0.3 }),
          ],
        },
      ),
    ).toThrow(
      expect.objectContaining<Partial<SessionTranscriptAssemblyError>>({
        code: "TRANSCRIPT_REVIEWED_PLACEMENT_CONFLICT",
      }),
    );
  });

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
    expect(
      clock.sources.map((source) => [
        source.recordingAssetId,
        source.programOffsetSeconds,
        source.timingUncertaintyMilliseconds,
      ]),
    ).toEqual([
      ["recording-coach", 0, 35],
      ["recording-client", 0.625, 48],
    ]);
  });

  it("labels reported wall starts as fallback instead of exact sync", () => {
    const clock = assembleSessionTranscriptProgramClock([
      {
        recordingAssetId: "recording-a",
        transcriptJobId: "transcript-a",
        captureGroupId: "take-1",
        recordedStartedAt: "2026-08-24T15:00:00.000Z",
      },
      {
        recordingAssetId: "recording-b",
        transcriptJobId: "transcript-b",
        captureGroupId: "take-1",
        recordedStartedAt: "2026-08-24T15:00:01.250Z",
      },
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
    expect(() =>
      assembleSessionTranscriptProgramClock([
        {
          recordingAssetId: "recording-a",
          transcriptJobId: "transcript-a",
          captureGroupId: "take-a",
          recordedStartedAt: "2026-08-24T15:00:00.000Z",
        },
        {
          recordingAssetId: "recording-b",
          transcriptJobId: "transcript-b",
          captureGroupId: "take-b",
          recordedStartedAt: "2026-08-24T15:00:01.000Z",
        },
      ]),
    ).toThrow(
      expect.objectContaining<Partial<SessionTranscriptAssemblyError>>({
        code: "TRANSCRIPT_SOURCE_TAKE_MISMATCH",
      }),
    );
  });

  it("refuses a manifest take that conflicts with preserved clock evidence", () => {
    expect(() =>
      assembleSessionTranscriptProgramClock([
        {
          recordingAssetId: "recording-a",
          transcriptJobId: "transcript-a",
          captureGroupId: "declared-take",
          recordedStartedAt: "2026-08-24T15:00:00.000Z",
          alignment: alignment("2026-08-24T15:00:00.000Z", "evidence-take"),
        },
      ]),
    ).toThrow(
      expect.objectContaining<Partial<SessionTranscriptAssemblyError>>({
        code: "TRANSCRIPT_SOURCE_TAKE_MISMATCH",
      }),
    );
  });

  it("keeps one source on its own clock without implying cross-device sync", () => {
    const clock = assembleSessionTranscriptProgramClock([
      {
        recordingAssetId: "recording-a",
        transcriptJobId: "transcript-a",
        recordedStartedAt: "2026-08-24T15:00:00.000Z",
        alignment: alignment("2026-08-24T15:00:00.200Z"),
      },
    ]);
    expect(clock).toMatchObject({
      authority: "single-source-origin",
      waveformReviewRequired: false,
      sources: [{ programOffsetSeconds: 0, timingReviewRequired: false }],
    });
  });
});
