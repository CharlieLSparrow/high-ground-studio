/** @jest-environment node */

import {
  buildCoachingTranscriptReport,
  coachingTranscriptReportFileName,
  CoachingTranscriptReportError,
  renderCoachingTranscriptReport,
} from "./coaching-transcript-report";

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

  it("fails closed when speaker identity is not mapped to the coach or client", () => {
    expect(() => buildCoachingTranscriptReport({
      ...input(),
      speakerGroups: [],
      segments: [{
        id: "turn-unknown",
        startSeconds: 12,
        endSeconds: 15,
        text: "This must never be guessed into the report.",
        speakerLabel: "Speaker 7",
      }],
    })).toThrow(expect.objectContaining<Partial<CoachingTranscriptReportError>>({
      code: "REPORT_SPEAKERS_UNRESOLVED",
      status: 409,
    }));
  });

  it("does not export a one-sided isolated source as the complete coaching conversation", () => {
    expect(() => buildCoachingTranscriptReport({
      ...input(),
      segments: [input().segments[0]],
    })).toThrow(expect.objectContaining<Partial<CoachingTranscriptReportError>>({
      code: "REPORT_SPEAKERS_INCOMPLETE",
      status: 409,
    }));
  });

  it("creates a real OOXML document without mutating source evidence", async () => {
    const report = buildCoachingTranscriptReport(input());
    const document = await renderCoachingTranscriptReport(report);

    expect(document.byteLength).toBeGreaterThan(5_000);
    expect(document.subarray(0, 2).toString("utf8")).toBe("PK");
    expect(report.sources).toEqual([expect.objectContaining({ sourceSha256: "a".repeat(64) })]);
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
