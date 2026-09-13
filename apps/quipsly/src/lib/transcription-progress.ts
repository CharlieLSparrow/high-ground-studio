export type TranscriptionProgressSource = {
  recordingAssetId: string;
  participantLabel: string;
  transcriptJobId: string | null;
  status: string | null;
  error: string | null;
};

export function transcriptionProgressLabel(status: string | null) {
  if (status === "QUEUED") return "Waiting to transcribe";
  if (status === "RUNNING" || status === "PROCESSING") return "Transcribing";
  if (status === "FAILED") return "Transcription failed";
  if (status === "HELD") return "Transcription needs attention";
  if (status === "COMPLETED") return "Transcript ready";
  if (status === "CANCELED" || status === "CANCELLED") return "Transcription stopped";
  return "Ready to transcribe";
}

export function transcriptionIsPending(status: string | null) {
  return status === null || ["QUEUED", "RUNNING", "PROCESSING"].includes(status);
}
