/** @jest-environment node */

import {
  buildCoachingTranscriptReport,
  coachingTranscriptReportFileName,
  CoachingTranscriptReportError,
  renderCoachingTranscriptReport,
} from "./coaching-transcript-report";
import { assembleSessionTranscriptProgramClock } from "./session-transcript-assembly";

function input() {
  return {
    roomId: "room-coaching-1",
    title: "Practice Coaching Session",
    scheduledStart: "2026-08-23T16:00:00.000Z",
    generatedAt: "2026-08-23T18:00:00.000Z",
    sources: [{
      transcriptJobId: "transcript-1",
      recordingAssetId: "recording-1",
      sourceSha256: "a".repeat(64),
    }],
    participants: [
      { id: "participant-coach", displayLabel: "Scott Sparrow", role: "COACH" },
      { id: "participant-client", displayLabel: "Practice Client", role: "CLIENT" },
    ],
    speakerGroups: [
      { providerSpeakerLabel: "Speaker 0", attribution: { participantId: "participant-coach" } },
      { providerSpeakerLabel: "Speaker 1", attribution: { participantId: "participant-client" } },
    ],
    segments: [
      {
        id: "turn-1",
        startSeconds: 3.8,
        endSeconds: 8,
        text: "What would make this session useful?",
        speakerLabel: "Scott Sparrow",
        providerSpeakerLabel: "Speaker 0",
        speakerAttribution: { participantId: "participant-coach" },
        acceptedVerification: { id: "verified-1" },
      },
      {
        id: "turn-2",
        startSeconds: 65,
        endSeconds: 72,
        text: "I want to leave with one clear next step.",
        speakerLabel: "Practice Client",
        providerSpeakerLabel: "Speaker 1",
        acceptedCorrection: { id: "correction-1" },
      },
    ],
  };
}

describe("coaching transcript mentor report", () => {
  it("exports a partially measured conversation without changing its source timestamps", () => {
    const clock = assembleSessionTranscriptProgramClock([
      {recordingAssetId: "coach-source", transcriptJobId: "coach-job", captureGroupId: "take", recordedStartedAt: "2026-08-23T16:00:00Z"},
      {recordingAssetId: "client-source", transcriptJobId: "client-job", captureGroupId: "take", recordedStartedAt: "2026-08-23T16:00:09Z"},
      {recordingAssetId: "reconnect-source", transcriptJobId: "reconnect-job", captureGroupId: "take", recordedStartedAt: "2026-08-23T16:20:00Z"},
    ], {reviewedPlacements: [{alignmentJobId: "sync", captureGroupId: "take", spineRecordingAssetId: "coach-source", targetRecordingAssetId: "client-source", signedOffsetSeconds: 0.35, residualDriftMilliseconds: 2, correctionApplied: false, sourceBytesMutated: false, sampleAccurateClaimed: false}]});
    const report = buildCoachingTranscriptReport({
      ...input(),
      sources: clock.sources.map((source, index) => ({...source, sourceSha256: "a".repeat(64), participantId: index === 0 ? "participant-coach" : "participant-client"})),
      segments: [
        {...input().segments[0], transcriptJobId: "coach-job", recordingAssetId: "coach-source"},
        {...input().segments[1], transcriptJobId: "client-job", recordingAssetId: "client-source"},
        {...input().segments[1], id: "reconnected-turn", startSeconds: 2, endSeconds: 4, transcriptJobId: "reconnect-job", recordingAssetId: "reconnect-source"},
      ],
    });
    expect(report.timelineTiming).toMatchObject({authority: "mixed-waveform-clock-placement", waveformReviewRequired: true, sampleAccurateClaimed: false});
    expect(report.turns.map(turn => [turn.startSeconds, turn.sourceStartSeconds])).toEqual([[3.8, 3.8], [65.35, 65], [1202, 2]]);
  });
  it("places reviewed coach and client turns into deterministic source-bound columns", () => {
    const report = buildCoachingTranscriptReport(input());

    expect(report.coach.displayLabel).toBe("Scott Sparrow");
    expect(report.client.displayLabel).toBe("Practice Client");
    expect(report.turns.map((turn) => [turn.speaker, turn.timestamp, turn.reviewState])).toEqual([
      ["coach", "0:03", "confirmed"],
      ["client", "1:05", "corrected"],
    ]);
    expect(report.review).toEqual({ correctedTurns: 1, confirmedTurns: 1, unreviewedTurns: 0 });
    expect(coachingTranscriptReportFileName(report)).toBe("20260823 Practice Coaching Session Transcript.docx");
  });

  it("exports unnamed voices without guessing a coach or client identity", () => {
    const report = buildCoachingTranscriptReport({
      ...input(),
      speakerGroups: [],
      segments: [{
        id: "turn-unknown",
        startSeconds: 12,
        endSeconds: 15,
        text: "This must never be guessed into the report.",
        speakerLabel: "Speaker 7",
      }],
    });
    expect(report.turns).toEqual([expect.objectContaining({
      speaker: "unassigned", speakerLabel: "Speaker 7", text: "This must never be guessed into the report.",
      recordingAssetId: "recording-1", transcriptJobId: "transcript-1", startSeconds: 12,
    })]);
    expect(report.speakerCoverage).toEqual({ unassignedTurns: 1, hasCoach: false, hasClient: false });
  });

  it("exports available words and records one-sided coverage without claiming a complete conversation", () => {
    const report = buildCoachingTranscriptReport({
      ...input(),
      incomplete: true,
      segments: [input().segments[0]],
    });
    expect(report.incomplete).toBe(true);
    expect(report.speakerCoverage).toEqual({ unassignedTurns: 0, hasCoach: true, hasClient: false });
  });

  it("preserves every unlabelled passage in a mixed conversation", () => {
    const report = buildCoachingTranscriptReport({ ...input(), segments: [
      ...input().segments, {id: "unknown", startSeconds: 20, endSeconds: 24, text: "Keep these words too.", speakerLabel: null},
    ] });
    expect(report.turns.map(turn => turn.segmentId)).toEqual(["turn-1", "unknown", "turn-2"]);
    expect(report.turns[1]).toMatchObject({ speaker: "unassigned", speakerLabel: "Speaker not named" });
  });

  it("still rejects contradictory source IDs instead of associating words with a different recording", () => {
    expect(() => buildCoachingTranscriptReport({...input(), segments: [
      {...input().segments[0], transcriptJobId: "transcript-1", recordingAssetId: "another-recording"},
    ]})).toThrow(expect.objectContaining({code: "REPORT_SOURCE_CHANGED"}));
  });

  it.each([[-1, 3], [5, 4], [Number.NaN, 4], [0, Number.POSITIVE_INFINITY]])("rejects invalid source timing %s to %s", (startSeconds, endSeconds) => {
    expect(() => buildCoachingTranscriptReport({...input(), segments: [
      {...input().segments[0], startSeconds, endSeconds},
    ]})).toThrow(expect.objectContaining({code: "REPORT_TIMING_INVALID"}));
  });

  it("creates a real OOXML document without mutating source evidence", async () => {
    const report = buildCoachingTranscriptReport(input());
    const document = await renderCoachingTranscriptReport(report);

    expect(document.byteLength).toBeGreaterThan(5_000);
    expect(document.subarray(0, 2).toString("utf8")).toBe("PK");
    expect(report.sources).toEqual([expect.objectContaining({ sourceSha256: "a".repeat(64) })]);
  });

  it("keeps long answers intact instead of silently truncating the export", () => {
    const text = "A long answer can continue across pages. ".repeat(600);
    const source = {...input(), segments: [{...input().segments[0], text}]};
    const before = JSON.stringify(source);
    expect(buildCoachingTranscriptReport(source).turns[0].text).toBe(text.trim());
    expect(JSON.stringify(source)).toBe(before);
  });

  it("merges independently source-bound participant transcripts on the shared Session clock", () => {
    const report = buildCoachingTranscriptReport({
      ...input(),
      sources: [
        { transcriptJobId: "coach-job", recordingAssetId: "coach-source", sourceSha256: "a".repeat(64), participantId: "participant-coach", programOffsetSeconds: 0, timingAuthority: "capture-clock-proposal" as const, timingUncertaintyMilliseconds: 35, timingReviewRequired: true },
        { transcriptJobId: "client-job", recordingAssetId: "client-source", sourceSha256: "b".repeat(64), participantId: "participant-client", programOffsetSeconds: 1.25, timingAuthority: "capture-clock-proposal" as const, timingUncertaintyMilliseconds: 48, timingReviewRequired: true },
      ],
      speakerGroups: [],
      segments: [
        { ...input().segments[0], transcriptJobId: "coach-job", recordingAssetId: "coach-source", speakerAttribution: null },
        { ...input().segments[1], transcriptJobId: "client-job", recordingAssetId: "client-source", speakerAttribution: null },
      ],
    });

    expect(report.schema).toBe("quipsly-coaching-transcript-report-v2");
    expect(report.sources).toHaveLength(2);
    expect(report.turns.map((turn) => [turn.speaker, turn.transcriptJobId])).toEqual([
      ["coach", "coach-job"],
      ["client", "client-job"],
    ]);
    expect(report.turns[1]).toMatchObject({
      timestamp: "1:06",
      startSeconds: 66.25,
      sourceStartSeconds: 65,
    });
    expect(report.timelineTiming).toEqual({
      authority: "capture-clock-proposal",
      waveformReviewRequired: true,
      maximumUncertaintyMilliseconds: 48,
      sampleAccurateClaimed: false,
    });
  });
});
