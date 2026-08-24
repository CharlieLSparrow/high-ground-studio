export type SessionTranscriptReadiness = {
  state: "READY" | "REVIEW_REQUIRED" | "PROCESSING" | "HELD";
  detail: string;
  sourceBinding: {
    exactSourceBound: boolean;
    hashMatches: boolean;
    generationMatches: boolean;
    manifestReceiptPresent: boolean;
    resultReceiptPresent: boolean;
    providerReceiptPresent: boolean;
  };
  timing: {
    granularity: "word" | "segment" | "unavailable";
    segmentCount: number;
    wordCount: number;
    transcriptEditingPrecision: "word" | "segment" | "unavailable";
  };
  speaker: {
    sourceTopology: "participant-isolated" | "mixed-room" | "unknown";
    authority: "source-binding" | "provider-candidate" | "unresolved";
    participantLabel: string | null;
    reviewedAttributionCount: number;
    reviewRequired: boolean;
  };
  boundaries: {
    statusAloneIsNotCompletion: true;
    segmentCountAloneIsNotSourceBinding: true;
    providerSpeakerLabelsRemainCandidates: true;
    transcriptTimingDoesNotProveWordAccuracy: true;
  };
};

type TranscriptJobEvidence = {
  status: string;
  segmentCount: number;
  wordCount: number;
  reviewedAttributionCount: number;
  sourceSha256: string | null;
  sourceGeneration: string | null;
  processingManifestObject: string | null;
  processingResultObject: string | null;
  providerRequestId: string | null;
  providerResponseObject: string | null;
  workerBuildId: string | null;
  resultJson: unknown;
};

type RetainedSourceEvidence = {
  status: "VERIFIED_MATCH" | "HELD" | "DRIFT" | "INCOMPLETE";
  sha256: string | null;
  generation: string | null;
} | null;

type UnknownRecord = Record<string, unknown>;

function object(value: unknown): UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function routingEvidence(value: unknown) {
  const result = object(value);
  const control = object(result.processingControl);
  const routing = object(control.routing);
  const valid = routing.schema === "quipsly-transcript-routing-summary-v1";
  const sourceTopology = valid && ["participant-isolated", "mixed-room", "unknown"].includes(String(routing.sourceTopology))
    ? routing.sourceTopology as SessionTranscriptReadiness["speaker"]["sourceTopology"]
    : "unknown";
  const authority = valid && ["source-binding", "provider-candidate", "unresolved"].includes(String(routing.speakerAuthority))
    ? routing.speakerAuthority as SessionTranscriptReadiness["speaker"]["authority"]
    : "unresolved";
  const granularity = valid && ["word", "segment", "unavailable"].includes(String(routing.timingGranularity))
    ? routing.timingGranularity as SessionTranscriptReadiness["timing"]["granularity"]
    : "unavailable";
  return {
    valid,
    manifestBacked: valid ? routing.manifestBacked === true : null,
    sourceTopology,
    authority,
    granularity,
    participantLabel: valid ? text(routing.participantLabel) : null,
  };
}

function result(input: Omit<SessionTranscriptReadiness, "boundaries">): SessionTranscriptReadiness {
  return {
    ...input,
    boundaries: {
      statusAloneIsNotCompletion: true,
      segmentCountAloneIsNotSourceBinding: true,
      providerSpeakerLabelsRemainCandidates: true,
      transcriptTimingDoesNotProveWordAccuracy: true,
    },
  };
}

export function buildSessionTranscriptReadiness(
  job: TranscriptJobEvidence,
  source: RetainedSourceEvidence,
): SessionTranscriptReadiness {
  const routing = routingEvidence(job.resultJson);
  const normalizedHash = text(job.sourceSha256)?.toLowerCase() ?? null;
  const sourceHash = text(source?.sha256)?.toLowerCase() ?? null;
  const normalizedGeneration = text(job.sourceGeneration);
  const sourceGeneration = text(source?.generation);
  const hashMatches = Boolean(normalizedHash && sourceHash && normalizedHash === sourceHash);
  const generationMatches = Boolean(normalizedGeneration && sourceGeneration && normalizedGeneration === sourceGeneration);
  const manifestReceiptPresent = Boolean(job.processingManifestObject) || routing.manifestBacked === false;
  const resultReceiptPresent = Boolean(job.processingResultObject);
  const providerReceiptPresent = Boolean(job.providerRequestId && job.providerResponseObject && job.workerBuildId);
  const exactSourceBound = source?.status === "VERIFIED_MATCH"
    && hashMatches
    && generationMatches
    && manifestReceiptPresent
    && resultReceiptPresent
    && providerReceiptPresent;
  const speakerReviewRequired = routing.sourceTopology !== "participant-isolated"
    || routing.authority !== "source-binding";
  const common = {
    sourceBinding: {
      exactSourceBound,
      hashMatches,
      generationMatches,
      manifestReceiptPresent,
      resultReceiptPresent,
      providerReceiptPresent,
    },
    timing: {
      granularity: routing.granularity,
      segmentCount: job.segmentCount,
      wordCount: job.wordCount,
      transcriptEditingPrecision: job.wordCount > 0 && routing.granularity === "word"
        ? "word" as const
        : job.segmentCount > 0 && routing.granularity === "segment"
          ? "segment" as const
          : "unavailable" as const,
    },
    speaker: {
      sourceTopology: routing.sourceTopology,
      authority: routing.authority,
      participantLabel: routing.participantLabel,
      reviewedAttributionCount: job.reviewedAttributionCount,
      reviewRequired: speakerReviewRequired,
    },
  };

  if (job.status === "FAILED" || job.status === "HELD") return result({
    state: "HELD",
    detail: `The latest transcript attempt is ${job.status.toLowerCase()}; retained media and prior correction overlays remain unchanged.`,
    ...common,
  });
  if (job.status !== "COMPLETED") return result({
    state: "PROCESSING",
    detail: `The transcript attempt is ${job.status.toLowerCase()} and has not produced a releasable provider evidence set.`,
    ...common,
  });
  if (source?.status === "DRIFT" || source?.status === "HELD" || (normalizedHash && sourceHash && !hashMatches) || (normalizedGeneration && sourceGeneration && !generationMatches)) return result({
    state: "HELD",
    detail: "Transcript source SHA, generation, or retained-source integrity disagrees. Quipsly will not present these words as bound to this recording.",
    ...common,
  });
  if (!exactSourceBound || job.segmentCount <= 0 || job.wordCount <= 0) return result({
    state: "REVIEW_REQUIRED",
    detail: "Provider text exists, but exact-source, result, worker, segment, or word evidence is incomplete. The transcript remains inspectable without being called ready.",
    ...common,
  });
  if (!routing.valid || routing.granularity === "unavailable") return result({
    state: "REVIEW_REQUIRED",
    detail: "The exact source is bound, but the routing or timing receipt cannot support source-clock editing yet.",
    ...common,
  });
  if (speakerReviewRequired) return result({
    state: "REVIEW_REQUIRED",
    detail: routing.sourceTopology === "mixed-room"
      ? "Timed provider evidence is source-bound, but mixed-room speaker labels remain candidates until a person reviews attribution."
      : "Timed provider evidence is source-bound, but speaker identity remains unresolved and needs review.",
    ...common,
  });
  return result({
    state: "READY",
    detail: routing.granularity === "word"
      ? `Exact-source provider evidence includes ${job.segmentCount} segments and ${job.wordCount} word-clock anchors; participant identity comes from the isolated source. Word accuracy still requires listening.`
      : `Exact-source provider evidence includes ${job.segmentCount} segment-clock anchors; participant identity comes from the isolated source. Word-level editing is unavailable until word timing exists.`,
    ...common,
  });
}

