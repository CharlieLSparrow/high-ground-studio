export const TRANSCRIPT_ROUTING_PLAN_KIND =
  "quipsly-transcript-routing-plan-v1" as const;
export const TRANSCRIPT_ROUTING_PLAN_VERSION = 1 as const;

export type TranscriptSourceTopology =
  | {
      kind: "participant-isolated";
      participantId: string;
      participantLabel: string;
    }
  | {
      kind: "mixed-room";
      expectedSpeakerCount: number | null;
    }
  | {
      kind: "unknown";
    };

export type TranscriptRoutingProvider =
  | "apple-speech-on-device"
  | "deepgram"
  | "openai-transcribe"
  | "openai-diarized";

export type TranscriptRoutingAttempt = {
  role: "primary" | "comparison";
  provider: TranscriptRoutingProvider;
  model: string;
  language: string;
  speakerAttribution: "source-binding" | "provider-candidate" | "unavailable";
  timingGranularity: "word" | "segment" | "unavailable";
  terminology: {
    mode: "none" | "keyterm-snapshot" | "keywords-snapshot";
    snapshotSha256: string | null;
  };
  configuration: Readonly<Record<string, string | number | boolean>>;
};

export type TranscriptRoutingPlan = {
  kind: typeof TRANSCRIPT_ROUTING_PLAN_KIND;
  version: typeof TRANSCRIPT_ROUTING_PLAN_VERSION;
  source: {
    sourceId: string;
    sha256: string;
    sizeBytes: number;
    topology: TranscriptSourceTopology;
  };
  speakerIdentityAuthority:
    | {
        kind: "source-binding";
        participantId: string;
        participantLabel: string;
      }
    | { kind: "provider-candidate" }
    | { kind: "unresolved" };
  primaryAttempt: TranscriptRoutingAttempt;
  comparisonAttempts: TranscriptRoutingAttempt[];
  boundaries: {
    providerOutputIsImmutableEvidence: true;
    providerSpeakerLabelsAreCandidates: true;
    sourceBindingOutranksDiarization: true;
    terminologyIsContextNotTruth: true;
    humanCorrectionsRemainSeparate: true;
    routingChangeRequiresMeasuredEvaluation: true;
  };
};

export type TranscriptRoutingInput = {
  source: {
    sourceId: string;
    sha256: string;
    sizeBytes: number;
    topology: TranscriptSourceTopology;
  };
  language: string;
  cloudProcessing: "forbidden" | "allowed" | "required";
  providers: {
    appleOnDeviceAvailable: boolean;
    deepgramAvailable: boolean;
    deepgramModelVersion: string | null;
    openAIAvailable: boolean;
  };
  terminologySnapshotSha256: string | null;
  includeEvaluationComparisons: boolean;
};

const SAFE_ID = /^[A-Za-z0-9_-]{8,160}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const LANGUAGE = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

/**
 * Select a transcript strategy from source topology and processing authority.
 *
 * This does not execute a provider request. The returned plan is intended to
 * be persisted beside an immutable attempt so a later UI can explain why a
 * source was routed, what speaker evidence is authoritative, and which
 * comparisons were intentionally requested.
 */
export function planTranscriptRouting(
  rawInput: TranscriptRoutingInput,
): TranscriptRoutingPlan {
  const input = validateInput(rawInput);
  const topology = input.source.topology;
  const cloudAllowed = input.cloudProcessing !== "forbidden";
  const sourceBound = topology.kind === "participant-isolated";

  const speakerIdentityAuthority: TranscriptRoutingPlan["speakerIdentityAuthority"] =
    topology.kind === "participant-isolated"
      ? {
          kind: "source-binding",
          participantId: topology.participantId,
          participantLabel: topology.participantLabel,
        }
      : topology.kind === "mixed-room"
        ? { kind: "provider-candidate" }
        : { kind: "unresolved" };

  let primaryAttempt: TranscriptRoutingAttempt;
  if (
    sourceBound
    && input.providers.appleOnDeviceAvailable
    && input.cloudProcessing !== "required"
  ) {
    primaryAttempt = appleAttempt(input, "primary", true);
  } else if (
    topology.kind !== "mixed-room"
    && input.providers.appleOnDeviceAvailable
    && !cloudAllowed
  ) {
    primaryAttempt = appleAttempt(input, "primary", false);
  } else if (cloudAllowed && input.providers.deepgramAvailable) {
    primaryAttempt = deepgramAttempt(
      input,
      "primary",
      topology.kind !== "participant-isolated",
    );
  } else {
    throw new Error(
      topology.kind === "mixed-room"
        ? "Mixed-room transcription requires an allowed diarization-capable provider."
        : "No transcript provider satisfies this source and cloud-processing policy.",
    );
  }

  const comparisonAttempts: TranscriptRoutingAttempt[] = [];
  if (input.includeEvaluationComparisons && cloudAllowed) {
    if (
      input.providers.deepgramAvailable
      && primaryAttempt.provider !== "deepgram"
    ) {
      comparisonAttempts.push(deepgramAttempt(
        input,
        "comparison",
        topology.kind !== "participant-isolated",
      ));
    }
    if (input.providers.openAIAvailable) {
      comparisonAttempts.push(openAIGeneralAttempt(input));
      if (topology.kind !== "participant-isolated") {
        comparisonAttempts.push(openAIDiarizedAttempt(input));
      }
    }
  }

  return {
    kind: TRANSCRIPT_ROUTING_PLAN_KIND,
    version: TRANSCRIPT_ROUTING_PLAN_VERSION,
    source: input.source,
    speakerIdentityAuthority,
    primaryAttempt,
    comparisonAttempts,
    boundaries: {
      providerOutputIsImmutableEvidence: true,
      providerSpeakerLabelsAreCandidates: true,
      sourceBindingOutranksDiarization: true,
      terminologyIsContextNotTruth: true,
      humanCorrectionsRemainSeparate: true,
      routingChangeRequiresMeasuredEvaluation: true,
    },
  };
}

function appleAttempt(
  input: TranscriptRoutingInput,
  role: TranscriptRoutingAttempt["role"],
  sourceBound: boolean,
): TranscriptRoutingAttempt {
  return {
    role,
    provider: "apple-speech-on-device",
    model: "speech-transcriber-system-assets",
    language: input.language,
    speakerAttribution: sourceBound ? "source-binding" : "unavailable",
    timingGranularity: "word",
    terminology: { mode: "none", snapshotSha256: null },
    configuration: {
      resultMode: "final-only",
      audioTimeRange: true,
      cloudProcessing: false,
    },
  };
}

function deepgramAttempt(
  input: TranscriptRoutingInput,
  role: TranscriptRoutingAttempt["role"],
  diarize: boolean,
): TranscriptRoutingAttempt {
  const modelVersion = input.providers.deepgramModelVersion;
  if (!modelVersion || modelVersion === "latest") {
    throw new Error("Deepgram routing requires an exact model version.");
  }
  return {
    role,
    provider: "deepgram",
    model: `nova-3@${modelVersion}`,
    language: input.language,
    speakerAttribution: diarize ? "provider-candidate" : "source-binding",
    timingGranularity: "word",
    terminology: input.terminologySnapshotSha256
      ? {
          mode: "keyterm-snapshot",
          snapshotSha256: input.terminologySnapshotSha256,
        }
      : { mode: "none", snapshotSha256: null },
    configuration: {
      diarize,
      diarizeModel: diarize ? "v2" : "none",
      multichannel: false,
      smartFormat: true,
      utterances: true,
    },
  };
}

function openAIGeneralAttempt(
  input: TranscriptRoutingInput,
): TranscriptRoutingAttempt {
  return {
    role: "comparison",
    provider: "openai-transcribe",
    model: "gpt-transcribe",
    language: input.language,
    speakerAttribution: input.source.topology.kind === "participant-isolated"
      ? "source-binding"
      : "unavailable",
    timingGranularity: "unavailable",
    terminology: input.terminologySnapshotSha256
      ? {
          mode: "keywords-snapshot",
          snapshotSha256: input.terminologySnapshotSha256,
        }
      : { mode: "none", snapshotSha256: null },
    configuration: { comparisonOnly: true },
  };
}

function openAIDiarizedAttempt(
  input: TranscriptRoutingInput,
): TranscriptRoutingAttempt {
  return {
    role: "comparison",
    provider: "openai-diarized",
    model: "gpt-4o-transcribe-diarize",
    language: input.language,
    speakerAttribution: "provider-candidate",
    timingGranularity: "segment",
    // The diarized model does not accept prompting. The null receipt prevents
    // a comparison result from implying that project vocabulary was applied.
    terminology: { mode: "none", snapshotSha256: null },
    configuration: {
      responseFormat: "diarized_json",
      chunkingStrategy: "auto",
      comparisonOnly: true,
    },
  };
}

function validateInput(input: TranscriptRoutingInput): TranscriptRoutingInput {
  if (!input || typeof input !== "object") {
    throw new Error("Transcript routing input is required.");
  }
  if (!SAFE_ID.test(input.source.sourceId)) {
    throw new Error("Transcript sourceId is invalid.");
  }
  if (!SHA256.test(input.source.sha256)) {
    throw new Error("Transcript source sha256 is invalid.");
  }
  if (!Number.isSafeInteger(input.source.sizeBytes) || input.source.sizeBytes < 1) {
    throw new Error("Transcript source sizeBytes is invalid.");
  }
  if (!LANGUAGE.test(input.language)) {
    throw new Error("Transcript language is invalid.");
  }
  if (
    input.terminologySnapshotSha256 !== null
    && !SHA256.test(input.terminologySnapshotSha256)
  ) {
    throw new Error("Transcript terminology snapshot is invalid.");
  }
  const topology = input.source.topology;
  if (topology.kind === "participant-isolated") {
    if (!SAFE_ID.test(topology.participantId) || !topology.participantLabel.trim()) {
      throw new Error("Participant-isolated transcript topology is invalid.");
    }
  } else if (topology.kind === "mixed-room") {
    if (
      topology.expectedSpeakerCount !== null
      && (!Number.isSafeInteger(topology.expectedSpeakerCount)
        || topology.expectedSpeakerCount < 1
        || topology.expectedSpeakerCount > 32)
    ) {
      throw new Error("Mixed-room expectedSpeakerCount is invalid.");
    }
  } else if (topology.kind !== "unknown") {
    throw new Error("Transcript source topology is invalid.");
  }
  return input;
}
