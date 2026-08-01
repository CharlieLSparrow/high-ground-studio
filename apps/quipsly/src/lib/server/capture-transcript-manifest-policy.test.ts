/** @jest-environment node */

import { newCaptureTranscriptManifest } from "@high-ground/quipsly-media-processing";

import {
  assertCaptureTranscriptManifestBinding,
  CaptureTranscriptOutboxError,
} from "./capture-transcript-manifest-policy";

function manifest(input: {
  model?: string;
  diarizeModel?: "latest" | "v1" | "v2" | null;
  sourceSha256?: string;
}) {
  return newCaptureTranscriptManifest({
    jobId: "transcript-job-1234",
    actorUserId: "actor-user-1234",
    actorEmail: "actor@example.test",
    source: {
      bucketName: "quipsly-media-test",
      objectName: "media-vault/recordings/source-1234.m4a",
      generation: "7",
      sizeBytes: 1024,
      sha256: input.sourceSha256 || "a".repeat(64),
      contentType: "audio/mp4",
      roomId: "capture-room-1234",
      recordingAssetId: "recording-asset-1234",
    },
    provider: {
      name: "deepgram",
      model: input.model || "nova-3",
      language: "en",
      smartFormat: true,
      punctuate: true,
      diarize: true,
      diarizeModel: input.diarizeModel === undefined ? "v2" : input.diarizeModel,
      multichannel: false,
      utterances: true,
      paragraphs: true,
    },
    queuedAt: "2026-08-02T12:00:00.000Z",
    updatedAt: "2026-08-02T12:00:00.000Z",
  });
}

describe("capture transcript manifest provider policy", () => {
  it("preserves an existing valid provider request when current defaults change", () => {
    expect(() => assertCaptureTranscriptManifestBinding({
      stored: manifest({ model: "nova-3", diarizeModel: "latest" }),
      desired: manifest({ model: "nova-4", diarizeModel: "v2" }),
      created: false,
    })).not.toThrow();
  });

  it("requires a newly created manifest to equal the requested provider policy", () => {
    expect(() => assertCaptureTranscriptManifestBinding({
      stored: manifest({ diarizeModel: "latest" }),
      desired: manifest({ diarizeModel: "v2" }),
      created: true,
    })).toThrow(expect.objectContaining({
      code: "TRANSCRIPT_MANIFEST_BINDING_MISMATCH",
    }));
  });

  it("never tolerates a changed immutable recording binding", () => {
    expect(() => assertCaptureTranscriptManifestBinding({
      stored: manifest({ sourceSha256: "b".repeat(64), diarizeModel: "latest" }),
      desired: manifest({ sourceSha256: "a".repeat(64), diarizeModel: "v2" }),
      created: false,
    })).toThrow(CaptureTranscriptOutboxError);
  });
});
