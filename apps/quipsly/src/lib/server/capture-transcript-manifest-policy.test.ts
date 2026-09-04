/** @jest-environment node */

import {
  newCaptureTranscriptManifest,
  planTranscriptRouting,
} from "@high-ground/quipsly-media-processing";

import {
  assertCaptureTranscriptManifestBinding,
  CaptureTranscriptOutboxError,
} from "./capture-transcript-manifest-policy";

function manifest(input: {
  model?: string;
  diarizeModel?: "latest" | "v1" | "v2" | null;
  sourceSha256?: string;
  topology?: { kind: "participant-isolated"; participantId: string; participantLabel: string };
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
      ...(input.topology ? { topology: input.topology } : {}),
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
  it("accepts a Google Speech v2 routing receipt for the same named model", () => {
    const source = {
      bucketName: "quipsly-media-test",
      objectName: "media-vault/recordings/source-1234.m4a",
      generation: "7",
      sizeBytes: 1024,
      sha256: "a".repeat(64),
      contentType: "audio/mp4",
      roomId: "capture-room-1234",
      recordingAssetId: "recording-asset-1234",
      topology: {
        kind: "participant-isolated" as const,
        participantId: "participant-1234",
        participantLabel: "Scott Sparrow",
      },
    };
    const routingPlan = planTranscriptRouting({
      source: {
        sourceId: source.recordingAssetId,
        sha256: source.sha256,
        sizeBytes: source.sizeBytes,
        topology: source.topology,
      },
      language: "en-US",
      cloudProcessing: "required",
      providers: {
        appleOnDeviceAvailable: false,
        deepgramAvailable: false,
        deepgramModel: "nova-3",
        deepgramModelVersion: "latest",
        deepgramModelVersionPolicy: "moving-latest",
        googleSpeechAvailable: true,
        googleSpeechModel: "chirp_3",
        googleSpeechLocation: "us",
        openAIAvailable: false,
      },
      terminologySnapshotSha256: null,
      includeEvaluationComparisons: false,
    });

    expect(() => newCaptureTranscriptManifest({
      jobId: "transcript-job-google-1234",
      actorUserId: "actor-user-1234",
      actorEmail: "actor@example.test",
      source,
      provider: {
        name: "google-speech-v2",
        model: "chirp_3",
        version: null,
        language: "en-US",
        smartFormat: true,
        punctuate: true,
        diarize: false,
        diarizeModel: null,
        multichannel: false,
        utterances: true,
        paragraphs: true,
        terminology: null,
      },
      routingPlan,
      queuedAt: "2026-09-04T08:00:00.000Z",
      updatedAt: "2026-09-04T08:00:00.000Z",
    })).not.toThrow();
  });

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

  it("preserves historical unknown topology when a replay can now infer ownership", () => {
    expect(() => assertCaptureTranscriptManifestBinding({
      stored: manifest({}),
      desired: manifest({
        topology: {
          kind: "participant-isolated",
          participantId: "participant-1234",
          participantLabel: "Scott Sparrow",
        },
      }),
      created: false,
    })).not.toThrow();
  });
});
