import {
  voiceWritingTranscriptCorrectionHasChanges,
  voiceWritingTranscriptCorrectionPayload,
  type VoiceWritingTranscriptCorrectionDraft,
} from "./voice-writing-transcript-edit";

function correctionDraft(
  overrides: Partial<VoiceWritingTranscriptCorrectionDraft> = {},
): VoiceWritingTranscriptCorrectionDraft {
  return {
    roomId: "room-1",
    transcriptJobId: "job-1",
    segment: {
      id: "segment-1",
      text: "Homer is writing a dissertation.",
      speakerLabel: "Homer",
      providerText: "Home is writing a dissertation.",
      providerSpeakerLabel: "Speaker 2",
      acceptedCorrectionId: "correction-1",
    },
    correctedText: "Homer is writing a dissertation.",
    correctedSpeakerLabel: "Homer",
    clientRequestId: "request-1",
    ...overrides,
  };
}

describe("voice-writing transcript correction", () => {
  it("does not create work when the effective passage is unchanged", () => {
    expect(voiceWritingTranscriptCorrectionHasChanges(correctionDraft())).toBe(false);
  });

  it("detects ordinary word or speaker edits without requiring playback", () => {
    expect(voiceWritingTranscriptCorrectionHasChanges(correctionDraft({
      correctedText: "Homer is completing his dissertation.",
    }))).toBe(true);
    expect(voiceWritingTranscriptCorrectionHasChanges(correctionDraft({
      correctedSpeakerLabel: "Scott Homer Sparrow",
    }))).toBe(true);
  });

  it("preserves provider evidence and the active overlay identity in the save", () => {
    expect(voiceWritingTranscriptCorrectionPayload(correctionDraft({
      correctedText: " Homer is completing his dissertation. ",
      correctedSpeakerLabel: " ",
    }))).toEqual({
      operation: "accept-human-correction",
      roomId: "room-1",
      transcriptJobId: "job-1",
      segmentId: "segment-1",
      clientRequestId: "request-1",
      expectedText: "Home is writing a dissertation.",
      expectedSpeakerLabel: "Speaker 2",
      expectedAcceptedCorrectionId: "correction-1",
      correctedText: "Homer is completing his dissertation.",
      correctedSpeakerLabel: null,
      reason: "Corrected while writing",
      confirmedAgainstPlayback: false,
    });
  });
});
