export function studioTranscriptSpeakerAuthority(input: {
  correctedSpeakerLabel?: string | null;
  confirmedAsIs?: boolean;
  providerSpeakerLabel?: string | null;
}) {
  if (input.correctedSpeakerLabel != null || input.confirmedAsIs === true) return "correction" as const;
  if (typeof input.providerSpeakerLabel === "string" && input.providerSpeakerLabel.trim()) return "provider" as const;
  return "unresolved" as const;
}
