export type VoiceWritingTranscriptCorrectionSegment = {
  id: string;
  text: string;
  speakerLabel: string | null;
  providerText: string;
  providerSpeakerLabel: string | null;
  acceptedCorrectionId: string | null;
};

export type VoiceWritingTranscriptCorrectionDraft = {
  roomId: string;
  transcriptJobId: string;
  segment: VoiceWritingTranscriptCorrectionSegment;
  correctedText: string;
  correctedSpeakerLabel: string;
  clientRequestId: string;
};

function normalizedText(value: string | null | undefined) {
  return String(value ?? "").trim();
}

export function voiceWritingTranscriptCorrectionHasChanges(
  draft: VoiceWritingTranscriptCorrectionDraft,
) {
  return normalizedText(draft.correctedText) !== normalizedText(draft.segment.text)
    || normalizedText(draft.correctedSpeakerLabel) !== normalizedText(draft.segment.speakerLabel);
}

export function voiceWritingTranscriptCorrectionPayload(
  draft: VoiceWritingTranscriptCorrectionDraft,
) {
  return {
    operation: "accept-human-correction",
    roomId: draft.roomId,
    transcriptJobId: draft.transcriptJobId,
    segmentId: draft.segment.id,
    clientRequestId: draft.clientRequestId,
    expectedText: draft.segment.providerText,
    expectedSpeakerLabel: draft.segment.providerSpeakerLabel,
    expectedAcceptedCorrectionId: draft.segment.acceptedCorrectionId,
    correctedText: normalizedText(draft.correctedText) || null,
    correctedSpeakerLabel: normalizedText(draft.correctedSpeakerLabel) || null,
    reason: "Corrected while writing",
    confirmedAgainstPlayback: false,
  } as const;
}
