import type { CaptureTranscriptManifest } from "@high-ground/quipsly-media-processing";

export class CaptureTranscriptOutboxError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CaptureTranscriptOutboxError";
    this.code = code;
  }
}

export function assertCaptureTranscriptManifestBinding(input: {
  stored: CaptureTranscriptManifest;
  desired: CaptureTranscriptManifest;
  created: boolean;
}) {
  const sourceMatches = input.stored.jobId === input.desired.jobId
    && input.stored.actorUserId === input.desired.actorUserId
    && input.stored.actorEmail === input.desired.actorEmail
    && JSON.stringify(input.stored.source) === JSON.stringify(input.desired.source);
  const providerMatches = JSON.stringify(input.stored.provider)
    === JSON.stringify(input.desired.provider);

  if (!sourceMatches || (input.created && !providerMatches)) {
    throw new CaptureTranscriptOutboxError(
      "TRANSCRIPT_MANIFEST_BINDING_MISMATCH",
      input.created
        ? "New transcript manifest has a different immutable binding."
        : "Existing transcript manifest has a different immutable source binding.",
    );
  }
}
