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
  const immutableSourceMatches = input.stored.jobId === input.desired.jobId
    && input.stored.actorUserId === input.desired.actorUserId
    && input.stored.actorEmail === input.desired.actorEmail
    && input.stored.source.bucketName === input.desired.source.bucketName
    && input.stored.source.objectName === input.desired.source.objectName
    && input.stored.source.generation === input.desired.source.generation
    && input.stored.source.sizeBytes === input.desired.source.sizeBytes
    && input.stored.source.sha256 === input.desired.source.sha256
    && input.stored.source.contentType === input.desired.source.contentType
    && input.stored.source.roomId === input.desired.source.roomId
    && input.stored.source.recordingAssetId === input.desired.source.recordingAssetId;
  const sourcePolicyMatches = JSON.stringify(input.stored.source)
    === JSON.stringify(input.desired.source);
  const providerMatches = JSON.stringify(input.stored.provider)
    === JSON.stringify(input.desired.provider);

  if (
    !immutableSourceMatches
    || (input.created && (!sourcePolicyMatches || !providerMatches))
  ) {
    throw new CaptureTranscriptOutboxError(
      "TRANSCRIPT_MANIFEST_BINDING_MISMATCH",
      input.created
        ? "New transcript manifest has a different immutable binding."
        : "Existing transcript manifest has a different immutable source binding.",
    );
  }
}
