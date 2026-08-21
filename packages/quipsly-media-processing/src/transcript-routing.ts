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
  | "google-speech-v2"
  | "openai-transcribe"
  | "openai-diarized";

export type TranscriptRoutingAttempt = {
  role: "primary" | "comparison";
  provider: TranscriptRoutingProvider;
  model: string;
  modelRevisionPolicy:
    | "system-assets"
    | "pinned"
    | "moving-latest"
    | "provider-model-name";
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
    deepgramModel: string;
    deepgramModelVersion: string | null;
    deepgramModelVersionPolicy: "pinned" | "moving-latest";
    googleSpeechAvailable?: boolean;
    googleSpeechModel?: string;
    googleSpeechLocation?: string;
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
  if (
    input.includeEvaluationComparisons
    && input.providers.deepgramAvailable
    && input.providers.deepgramModelVersionPolicy === "moving-latest"
  ) {
    throw new Error("Measured transcript evaluation requires an exact Deepgram model version.");
  }

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
  } else if (cloudAllowed && input.providers.googleSpeechAvailable) {
    primaryAttempt = googleSpeechAttempt(
      input,
      "primary",
      topology.kind !== "participant-isolated",
    );
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

export function parseTranscriptSourceTopology(
  value: unknown,
): TranscriptSourceTopology {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { kind: "unknown" };
  }
  const row = value as Record<string, unknown>;
  if (row.kind === "participant-isolated") {
    const participantId = typeof row.participantId === "string"
      ? row.participantId.trim()
      : "";
    const participantLabel = typeof row.participantLabel === "string"
      ? row.participantLabel.trim()
      : "";
    if (!SAFE_ID.test(participantId) || !participantLabel || participantLabel.length > 160) {
      throw new Error("Participant-isolated transcript topology is invalid.");
    }
    return { kind: "participant-isolated", participantId, participantLabel };
  }
  if (row.kind === "mixed-room") {
    const expectedSpeakerCount = row.expectedSpeakerCount == null
      ? null
      : Number(row.expectedSpeakerCount);
    if (
      expectedSpeakerCount !== null
      && (!Number.isSafeInteger(expectedSpeakerCount)
        || expectedSpeakerCount < 1
        || expectedSpeakerCount > 32)
    ) {
      throw new Error("Mixed-room expectedSpeakerCount is invalid.");
    }
    return { kind: "mixed-room", expectedSpeakerCount };
  }
  if (row.kind === "unknown" || row.kind == null) return { kind: "unknown" };
  throw new Error("Transcript source topology is invalid.");
}

export function parseTranscriptRoutingPlan(value: unknown): TranscriptRoutingPlan {
  const row = routingRecord(value, "routing plan");
  const sourceRow = routingRecord(row.source, "routing plan source");
  const topology = parseTranscriptSourceTopology(sourceRow.topology);
  const source = {
    sourceId: routingId(sourceRow.sourceId, "routing plan sourceId"),
    sha256: routingSha(sourceRow.sha256, "routing plan source sha256"),
    sizeBytes: routingPositiveInteger(sourceRow.sizeBytes, "routing plan source sizeBytes"),
    topology,
  };
  const authorityRow = routingRecord(row.speakerIdentityAuthority, "speaker identity authority");
  let speakerIdentityAuthority: TranscriptRoutingPlan["speakerIdentityAuthority"];
  if (authorityRow.kind === "source-binding") {
    speakerIdentityAuthority = {
      kind: "source-binding",
      participantId: routingId(authorityRow.participantId, "speaker participantId"),
      participantLabel: routingText(authorityRow.participantLabel, "speaker participantLabel", 160),
    };
  } else if (authorityRow.kind === "provider-candidate") {
    speakerIdentityAuthority = { kind: "provider-candidate" };
  } else if (authorityRow.kind === "unresolved") {
    speakerIdentityAuthority = { kind: "unresolved" };
  } else {
    throw new Error("Transcript speaker identity authority is invalid.");
  }
  const primaryAttempt = parseRoutingAttempt(row.primaryAttempt, "primaryAttempt");
  const comparisonRows = Array.isArray(row.comparisonAttempts)
    ? row.comparisonAttempts
    : null;
  if (!comparisonRows || comparisonRows.length > 8) {
    throw new Error("Transcript routing comparisons are invalid.");
  }
  const comparisonAttempts = comparisonRows.map((attempt, index) =>
    parseRoutingAttempt(attempt, `comparisonAttempts[${index}]`));
  const boundaries = routingRecord(row.boundaries, "routing boundaries");
  if (
    row.kind !== TRANSCRIPT_ROUTING_PLAN_KIND
    || row.version !== TRANSCRIPT_ROUTING_PLAN_VERSION
    || primaryAttempt.role !== "primary"
    || comparisonAttempts.some((attempt) => attempt.role !== "comparison")
    || boundaries.providerOutputIsImmutableEvidence !== true
    || boundaries.providerSpeakerLabelsAreCandidates !== true
    || boundaries.sourceBindingOutranksDiarization !== true
    || boundaries.terminologyIsContextNotTruth !== true
    || boundaries.humanCorrectionsRemainSeparate !== true
    || boundaries.routingChangeRequiresMeasuredEvaluation !== true
  ) {
    throw new Error("Transcript routing plan is invalid.");
  }
  if (topology.kind === "participant-isolated") {
    if (
      speakerIdentityAuthority.kind !== "source-binding"
      || speakerIdentityAuthority.participantId !== topology.participantId
      || speakerIdentityAuthority.participantLabel !== topology.participantLabel
      || primaryAttempt.speakerAttribution !== "source-binding"
    ) {
      throw new Error("Participant source routing lost its canonical speaker binding.");
    }
  } else if (
    topology.kind === "mixed-room"
    && speakerIdentityAuthority.kind !== "provider-candidate"
  ) {
    throw new Error("Mixed-room routing has invalid speaker authority.");
  }
  return {
    kind: TRANSCRIPT_ROUTING_PLAN_KIND,
    version: TRANSCRIPT_ROUTING_PLAN_VERSION,
    source,
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
    modelRevisionPolicy: "system-assets",
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
  if (!modelVersion) {
    throw new Error("Deepgram routing requires an explicit model version request.");
  }
  if (
    (modelVersion === "latest")
      !== (input.providers.deepgramModelVersionPolicy === "moving-latest")
  ) {
    throw new Error("Deepgram model version and revision policy disagree.");
  }
  return {
    role,
    provider: "deepgram",
    model: `${routingText(input.providers.deepgramModel, "Deepgram model", 128)}@${modelVersion}`,
    modelRevisionPolicy: input.providers.deepgramModelVersionPolicy,
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

function googleSpeechAttempt(
  input: TranscriptRoutingInput,
  role: TranscriptRoutingAttempt["role"],
  diarize: boolean,
): TranscriptRoutingAttempt {
  return {
    role,
    provider: "google-speech-v2",
    model: routingText(
      input.providers.googleSpeechModel || "chirp_3",
      "Google Speech model",
      128,
    ),
    modelRevisionPolicy: "provider-model-name",
    language: input.language,
    speakerAttribution: diarize ? "provider-candidate" : "source-binding",
    timingGranularity: "word",
    terminology: { mode: "none", snapshotSha256: null },
    configuration: {
      location: routingText(
        input.providers.googleSpeechLocation || "us",
        "Google Speech location",
        63,
      ),
      diarize,
      multichannel: false,
      automaticPunctuation: true,
      wordTimeOffsets: true,
      wordConfidence: true,
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
    modelRevisionPolicy: "provider-model-name",
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
    modelRevisionPolicy: "provider-model-name",
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
  const topology = parseTranscriptSourceTopology(input.source.topology);
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
  return {
    ...input,
    source: { ...input.source, topology },
  };
}

function parseRoutingAttempt(value: unknown, field: string): TranscriptRoutingAttempt {
  const row = routingRecord(value, field);
  const terminologyRow = routingRecord(row.terminology, `${field}.terminology`);
  const configurationRow = routingRecord(row.configuration, `${field}.configuration`);
  const role = row.role === "primary" || row.role === "comparison" ? row.role : null;
  const provider = [
    "apple-speech-on-device",
    "deepgram",
    "google-speech-v2",
    "openai-transcribe",
    "openai-diarized",
  ].includes(String(row.provider)) ? row.provider as TranscriptRoutingProvider : null;
  const modelRevisionPolicy = [
    "system-assets",
    "pinned",
    "moving-latest",
    "provider-model-name",
  ].includes(String(row.modelRevisionPolicy))
    ? row.modelRevisionPolicy as TranscriptRoutingAttempt["modelRevisionPolicy"]
    : null;
  const speakerAttribution = ["source-binding", "provider-candidate", "unavailable"]
    .includes(String(row.speakerAttribution))
    ? row.speakerAttribution as TranscriptRoutingAttempt["speakerAttribution"]
    : null;
  const timingGranularity = ["word", "segment", "unavailable"]
    .includes(String(row.timingGranularity))
    ? row.timingGranularity as TranscriptRoutingAttempt["timingGranularity"]
    : null;
  const terminologyMode = ["none", "keyterm-snapshot", "keywords-snapshot"]
    .includes(String(terminologyRow.mode))
    ? terminologyRow.mode as TranscriptRoutingAttempt["terminology"]["mode"]
    : null;
  const snapshotSha256 = terminologyRow.snapshotSha256 == null
    ? null
    : routingSha(terminologyRow.snapshotSha256, `${field}.terminology.snapshotSha256`);
  const configuration: Record<string, string | number | boolean> = {};
  for (const [key, entry] of Object.entries(configurationRow)) {
    if (!/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(key)
      || !["string", "number", "boolean"].includes(typeof entry)
      || (typeof entry === "number" && !Number.isFinite(entry))) {
      throw new Error(`${field}.configuration is invalid.`);
    }
    configuration[key] = entry as string | number | boolean;
  }
  if (
    !role
    || !provider
    || !modelRevisionPolicy
    || !speakerAttribution
    || !timingGranularity
    || !terminologyMode
    || (terminologyMode === "none") !== (snapshotSha256 === null)
  ) {
    throw new Error(`${field} is invalid.`);
  }
  return {
    role,
    provider,
    model: routingText(row.model, `${field}.model`, 180),
    modelRevisionPolicy,
    language: routingText(row.language, `${field}.language`, 40),
    speakerAttribution,
    timingGranularity,
    terminology: { mode: terminologyMode, snapshotSha256 },
    configuration,
  };
}

function routingRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}
function routingText(value: unknown, field: string, max: number) {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result || result.length > max || /[\u0000-\u001f\u007f]/u.test(result)) {
    throw new Error(`${field} is invalid.`);
  }
  return result;
}
function routingId(value: unknown, field: string) {
  const result = routingText(value, field, 160);
  if (!SAFE_ID.test(result)) throw new Error(`${field} is invalid.`);
  return result;
}
function routingSha(value: unknown, field: string) {
  const result = routingText(value, field, 64).toLowerCase();
  if (!SHA256.test(result)) throw new Error(`${field} is invalid.`);
  return result;
}
function routingPositiveInteger(value: unknown, field: string) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1) throw new Error(`${field} is invalid.`);
  return result;
}
