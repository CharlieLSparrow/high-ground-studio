import { buildSessionTranscriptReadiness } from "@/lib/session-transcript-readiness";

const A = "a".repeat(64);

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    status: "COMPLETED",
    segmentCount: 42,
    wordCount: 420,
    reviewedAttributionCount: 0,
    sourceSha256: A,
    sourceGeneration: "9",
    processingManifestObject: "transcripts/jobs/job-1/manifest.json",
    processingResultObject: "transcripts/jobs/job-1/result.json",
    providerRequestId: "provider-request-1",
    providerResponseObject: "transcripts/jobs/job-1/provider.json",
    workerBuildId: "worker-build-1",
    resultJson: {
      processingControl: {
        routing: {
          schema: "quipsly-transcript-routing-summary-v1",
          sourceTopology: "participant-isolated",
          participantLabel: "Charlie",
          speakerAuthority: "source-binding",
          timingGranularity: "word",
          manifestBacked: true,
        },
      },
    },
    ...overrides,
  };
}

const source = { status: "VERIFIED_MATCH" as const, sha256: A, generation: "9" };

describe("Session transcript readiness", () => {
  it("requires exact source, result, worker, word clock, and isolated speaker authority before ready", () => {
    expect(buildSessionTranscriptReadiness(job(), source)).toMatchObject({
      state: "READY",
      sourceBinding: { exactSourceBound: true },
      timing: { granularity: "word", transcriptEditingPrecision: "word", wordCount: 420 },
      speaker: { authority: "source-binding", participantLabel: "Charlie", reviewRequired: false },
    });
  });

  it("holds a completed job whose canonical source hash disagrees", () => {
    expect(buildSessionTranscriptReadiness(job({ sourceSha256: "b".repeat(64) }), source)).toMatchObject({
      state: "HELD",
      detail: expect.stringContaining("disagrees"),
      sourceBinding: { exactSourceBound: false, hashMatches: false },
    });
  });

  it("does not call status plus segments complete when provider or word evidence is absent", () => {
    expect(buildSessionTranscriptReadiness(job({
      wordCount: 0,
      processingResultObject: null,
      providerRequestId: null,
      providerResponseObject: null,
      workerBuildId: null,
    }), source)).toMatchObject({
      state: "REVIEW_REQUIRED",
      sourceBinding: { exactSourceBound: false, resultReceiptPresent: false, providerReceiptPresent: false },
      timing: { transcriptEditingPrecision: "unavailable" },
    });
  });

  it("keeps mixed-room speaker labels in review even with exact word timing", () => {
    expect(buildSessionTranscriptReadiness(job({
      reviewedAttributionCount: 2,
      resultJson: {
        processingControl: {
          routing: {
            schema: "quipsly-transcript-routing-summary-v1",
            sourceTopology: "mixed-room",
            speakerAuthority: "provider-candidate",
            timingGranularity: "word",
            manifestBacked: true,
          },
        },
      },
    }), source)).toMatchObject({
      state: "REVIEW_REQUIRED",
      detail: expect.stringContaining("speaker labels remain candidates"),
      speaker: { authority: "provider-candidate", reviewRequired: true },
    });
  });

  it("reports segment-only timing without pretending word editing is available", () => {
    const result = buildSessionTranscriptReadiness(job({
      resultJson: {
        processingControl: {
          routing: {
            schema: "quipsly-transcript-routing-summary-v1",
            sourceTopology: "participant-isolated",
            participantLabel: "Charlie",
            speakerAuthority: "source-binding",
            timingGranularity: "segment",
            manifestBacked: false,
          },
        },
      },
      processingManifestObject: null,
    }), source);
    expect(result).toMatchObject({
      state: "READY",
      timing: { granularity: "segment", transcriptEditingPrecision: "segment" },
      detail: expect.stringContaining("Word-level editing is unavailable"),
    });
  });

  function localJob(localOverride: Record<string, unknown> = {}) {
    const rawSha256 = "c".repeat(64);
    return job({
      segmentCount: 6,
      wordCount: 64,
      processingManifestObject: null,
      processingResultObject: null,
      providerRequestId: null,
      providerResponseObject: null,
      resultJson: {
        source: "local-durable-transcript-worker",
        processingControl: {
          routing: {
            schema: "quipsly-transcript-routing-summary-v1",
            sourceTopology: "participant-isolated",
            participantLabel: "Charlie",
            speakerAuthority: "source-binding",
            timingGranularity: "segment",
            manifestBacked: false,
          },
        },
        localProcessing: {
          schema: "quipsly-local-transcript-result-v1",
          status: "COMPLETED",
          startedAt: "2026-08-24T18:00:00.000Z",
          completedAt: "2026-08-24T18:01:00.000Z",
          sourceSha256: A,
          sourceGeneration: "9",
          segmentCount: 6,
          wordCount: 64,
          rawProviderSha256: rawSha256,
          rawProviderEvidencePath: `transcripts/jobs/job-1/provider-${rawSha256}.json`,
          immutableProviderEvidence: true,
          sourceMutationAllowed: false,
          ...localOverride,
        },
      },
    });
  }

  it("accepts a strict durable local provider receipt without pretending it is a cloud receipt", () => {
    expect(buildSessionTranscriptReadiness(localJob(), source)).toMatchObject({
      state: "READY",
      sourceBinding: {
        exactSourceBound: true,
        manifestReceiptPresent: true,
        resultReceiptPresent: true,
        providerReceiptPresent: true,
      },
      timing: { transcriptEditingPrecision: "segment" },
    });
  });

  it.each([
    ["wrong evidence path", { rawProviderEvidencePath: "transcripts/jobs/other/provider.json" }],
    ["wrong source hash", { sourceSha256: "d".repeat(64) }],
    ["wrong segment count", { segmentCount: 7 }],
    ["mutable provider evidence", { immutableProviderEvidence: false }],
  ])("rejects a local receipt with %s", (_label, localOverride) => {
    expect(buildSessionTranscriptReadiness(localJob(localOverride), source)).toMatchObject({
      state: "REVIEW_REQUIRED",
      sourceBinding: {
        exactSourceBound: false,
        resultReceiptPresent: false,
        providerReceiptPresent: false,
      },
    });
  });
});
