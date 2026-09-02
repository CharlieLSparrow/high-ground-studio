import type { SessionReadinessExpectedSource, SessionReadinessSource, SessionReadinessTopology } from "./session-readiness-topology";
import type { SessionSourceEvidence } from "./session-source-evidence-model";

export type SessionRecordingHealthState = "READY" | "REVIEW" | "BLOCKED" | "UNKNOWN";

export type SessionRecordingHealthGate = {
  id: "plan" | "immutable-source" | "decoded-media" | "signal" | "processing" | "transcription";
  label: string;
  state: SessionRecordingHealthState;
  detail: string;
};

export type SessionRecordingHealthSource = {
  id: string;
  recordingAssetId: string | null;
  expectedSourceId: string | null;
  participantLabel: string;
  label: string;
  sourceKind: string;
  retentionRole: string;
  state: SessionRecordingHealthState;
  nextAction: string;
  gates: SessionRecordingHealthGate[];
};

export type SessionRecordingHealth = {
  state: SessionRecordingHealthState;
  headline: string;
  detail: string;
  sources: SessionRecordingHealthSource[];
  counts: Record<SessionRecordingHealthState, number>;
  boundaries: {
    projectionCreatesNoWorkflowState: true;
    noUniversalQualityScore: true;
    transcriptConfidenceIsNotAudioHealth: true;
    captureSettingsAreNotDecodedMedia: true;
    releasedBytesAreNotProofListened: true;
  };
};

type EvidenceSource = SessionSourceEvidence["sources"][number];

const stateRank: Record<SessionRecordingHealthState, number> = {
  BLOCKED: 0,
  REVIEW: 1,
  UNKNOWN: 2,
  READY: 3,
};

function worstState(states: SessionRecordingHealthState[]): SessionRecordingHealthState {
  return states.reduce<SessionRecordingHealthState>((worst, state) => (
    stateRank[state] < stateRank[worst] ? state : worst
  ), "READY");
}

function allRetainedSources(topology: SessionReadinessTopology) {
  return [
    ...topology.people.flatMap((person) => person.sources.map((source) => ({ source, participantLabel: person.label }))),
    ...topology.unassignedSources.map((source) => ({ source, participantLabel: "Unassigned source" })),
  ];
}

function findSource(sources: SessionReadinessSource[], expectation: SessionReadinessExpectedSource) {
  if (expectation.recordingAssetId) {
    const exact = sources.find((source) => source.id === expectation.recordingAssetId);
    if (exact) return exact;
  }
  if (expectation.captureId) {
    return sources.find((source) => source.captureId === expectation.captureId) ?? null;
  }
  return null;
}

function planGate(expectation: SessionReadinessExpectedSource | null): SessionRecordingHealthGate {
  if (!expectation) return {
    id: "plan",
    label: "Source plan",
    state: "REVIEW",
    detail: "Retained media exists, but no source-plan item owns its intended role.",
  };
  if (expectation.fulfillment === "fulfilled" || expectation.fulfillment === "bound-source-pending") return {
    id: "plan",
    label: "Source plan",
    state: "READY",
    detail: `${expectation.retentionRole.replaceAll("-", " ")} is bound to this exact capture identity.`,
  };
  if (expectation.fulfillment === "candidate-review") return {
    id: "plan",
    label: "Source plan",
    state: "REVIEW",
    detail: `${expectation.candidateSources.length} compatible source candidate${expectation.candidateSources.length === 1 ? " needs" : "s need"} an explicit binding decision.`,
  };
  const required = expectation.retentionRole === "required-master";
  return {
    id: "plan",
    label: "Source plan",
    state: required ? "BLOCKED" : "REVIEW",
    detail: expectation.fulfillment === "bound-source-invalid"
      ? "The bound source does not satisfy the planned source kind."
      : `${required ? "Required" : "Optional"} planned source has no retained source bound to it.`,
  };
}

function immutableGate(source: SessionReadinessSource | null, evidence: EvidenceSource | null, required: boolean): SessionRecordingHealthGate {
  if (!source || source.evidenceKind !== "recording-asset") return {
    id: "immutable-source",
    label: "Exact bytes",
    state: required ? "BLOCKED" : "UNKNOWN",
    detail: "No RecordingAsset exists for independent byte, checksum, and cloud-generation verification.",
  };
  if (evidence?.status === "DRIFT") return {
    id: "immutable-source",
    label: "Exact bytes",
    state: "BLOCKED",
    detail: evidence.issues[0] ?? "Immutable source identities disagree.",
  };
  if (evidence?.status === "INCOMPLETE") return {
    id: "immutable-source",
    label: "Exact bytes",
    state: "BLOCKED",
    detail: evidence.issues[0] ?? "Independent exact-byte evidence is incomplete.",
  };
  const exactIdentity = Boolean(
    evidence?.cloud.sha256
    && evidence.cloud.byteSize
    && evidence.cloud.generation
    && evidence.cloud.verifiedAt,
  );
  if (exactIdentity && (evidence?.status === "VERIFIED_MATCH" || evidence?.status === "HELD")) return {
    id: "immutable-source",
    label: "Exact bytes",
    state: "READY",
    detail: "Checksum, byte count, cloud generation, and server verification time are preserved.",
  };
  return {
    id: "immutable-source",
    label: "Exact bytes",
    state: required ? "BLOCKED" : "UNKNOWN",
    detail: "Nest cannot independently prove the complete retained-source identity yet.",
  };
}

function decodedMediaGate(evidence: EvidenceSource | null, sourceKind: string, required: boolean): SessionRecordingHealthGate {
  const analysis = evidence?.analysis;
  if (analysis?.status === "failed") return {
    id: "decoded-media",
    label: "Decoded media",
    state: required ? "BLOCKED" : "REVIEW",
    detail: analysis.error ?? "Complete-decode evidence failed integrity validation.",
  };
  if (analysis && !analysis.completeDecode) return {
    id: "decoded-media",
    label: "Decoded media",
    state: "UNKNOWN",
    detail: `Exact-source complete decode is ${analysis.status.replaceAll("-", " ")}; no result is claimed yet.`,
  };
  if (analysis?.completeDecode && analysis.media) return {
    id: "decoded-media",
    label: "Decoded media",
    state: "READY",
    detail: `Complete ${analysis.media.container} decode · ${Math.round(analysis.media.sampleRateHz)} Hz · ${analysis.media.channelCount} channel${analysis.media.channelCount === 1 ? "" : "s"} · ${analysis.media.durationSeconds.toFixed(2)} seconds.`,
  };
  const audio = evidence?.captureRuntime.audioFormat;
  if (!audio || audio.decodedAudioTrackCount === null) return {
    id: "decoded-media",
    label: "Decoded media",
    state: "UNKNOWN",
    detail: "No complete decoded audio-track result is attached; capture settings are not substituted for a decode.",
  };
  if (audio.decodedAudioTrackCount === 0) return {
    id: "decoded-media",
    label: "Decoded media",
    state: sourceKind === "audio" && required ? "BLOCKED" : "REVIEW",
    detail: sourceKind === "audio"
      ? "The planned audio source decoded with no audio track."
      : "This retained source decoded with no audio track; confirm whether it is intentionally picture-only.",
  };
  if (audio.decodedSampleRateHz && audio.decodedChannelCount) return {
    id: "decoded-media",
    label: "Decoded media",
    state: "READY",
    detail: `${audio.decodedAudioTrackCount} audio track${audio.decodedAudioTrackCount === 1 ? "" : "s"} · ${Math.round(audio.decodedSampleRateHz)} Hz · ${audio.decodedChannelCount} channel${audio.decodedChannelCount === 1 ? "" : "s"}.`,
  };
  return {
    id: "decoded-media",
    label: "Decoded media",
    state: "REVIEW",
    detail: "An audio track decoded, but its complete sample-rate or channel evidence is missing.",
  };
}

function signalGate(evidence: EvidenceSource | null, sourceKind: string, required: boolean): SessionRecordingHealthGate {
  const analysis = evidence?.analysis;
  if (analysis?.status === "failed") return {
    id: "signal",
    label: "Useful signal",
    state: required ? "BLOCKED" : "REVIEW",
    detail: analysis.error ?? "Signal evidence failed integrity validation.",
  };
  if (analysis && !analysis.completeDecode) return {
    id: "signal",
    label: "Useful signal",
    state: "UNKNOWN",
    detail: `Signal scan is ${analysis.status.replaceAll("-", " ")}; transcript confidence is not used as a proxy.`,
  };
  const signal = analysis?.signal ?? evidence?.captureRuntime.audioFormat?.signal;
  if (!signal) return {
    id: "signal",
    label: "Useful signal",
    state: "UNKNOWN",
    detail: "No complete decoded signal scan is attached. Transcript confidence is not used as a proxy.",
  };
  if (signal.status === "signal-present") return {
    id: "signal",
    label: "Useful signal",
    state: "READY",
    detail: signal.loudness?.integratedLoudnessLufs !== null && signal.loudness?.integratedLoudnessLufs !== undefined
      ? `Signal is present across the complete decode · programme loudness ${signal.loudness.integratedLoudnessLufs.toFixed(1)} LUFS · sample peak ${signal.samplePeakDbfs.toFixed(1)} dBFS.`
      : `Signal is present across the complete decode · RMS ${signal.rmsDbfs.toFixed(1)} dBFS · sample peak ${signal.samplePeakDbfs.toFixed(1)} dBFS.`,
  };
  if (signal.status === "near-digital-silence") return {
    id: "signal",
    label: "Useful signal",
    state: sourceKind === "audio" && required ? "BLOCKED" : "REVIEW",
    detail: `${(signal.nearSilentFrameFraction * 100).toFixed(1)}% of decoded frames are near digital silence; listen before relying on this source.`,
  };
  return {
    id: "signal",
    label: "Useful signal",
    state: "REVIEW",
    detail: `${signal.observations.length} exact-time signal observation${signal.observations.length === 1 ? " needs" : "s need"} listening review.`,
  };
}

function dispositionGate(id: "processing" | "transcription", disposition: string | null | undefined): SessionRecordingHealthGate {
  const processing = id === "processing";
  const label = processing ? "Processing release" : "Transcript release";
  if (disposition === "RELEASED") return {
    id,
    label,
    state: "READY",
    detail: processing ? "Exact source bytes are released for governed processing." : "The source is released for governed transcription.",
  };
  if (disposition === "HELD") return {
    id,
    label,
    state: processing ? "BLOCKED" : "REVIEW",
    detail: processing
      ? "Source processing remains held; no editor or mastering work should consume it."
      : "Transcription remains held by its separate consent or release policy; source quality is unchanged.",
  };
  return { id, label, state: "UNKNOWN", detail: `No authoritative ${processing ? "processing" : "transcription"} disposition is projected.` };
}

function nextAction(gates: SessionRecordingHealthGate[]) {
  const gate = gates.find((candidate) => candidate.state === "BLOCKED")
    ?? gates.find((candidate) => candidate.state === "REVIEW")
    ?? gates.find((candidate) => candidate.state === "UNKNOWN");
  if (!gate) return "Evidence is ready; proof-listen and editorial decisions remain separate work.";
  if (gate.id === "plan") return "Bind or repair the retained-source plan before relying on this take.";
  if (gate.id === "immutable-source") return "Recover or reconcile the exact retained bytes and their immutable receipt.";
  if (gate.id === "decoded-media") return "Run or repair complete media decoding, then inspect the actual track format.";
  if (gate.id === "signal") return gate.state === "UNKNOWN" ? "Run a complete decoded signal scan." : "Listen at the exact flagged ranges before repair or assembly.";
  if (gate.id === "processing") return "Resolve the governed source-processing hold.";
  return "Resolve transcription consent or release separately from source-media quality.";
}

export function buildSessionRecordingHealth(input: {
  topology: SessionReadinessTopology;
  sourceEvidence: SessionSourceEvidence;
}): SessionRecordingHealth {
  const retained = allRetainedSources(input.topology);
  const retainedSources = retained.map(({ source }) => source);
  const participantByAsset = new Map(retained.map(({ source, participantLabel }) => [source.id, participantLabel]));
  const evidenceByAsset = new Map(input.sourceEvidence.sources.map((source) => [source.recordingAssetId, source]));
  const coveredAssets = new Set<string>();

  const project = (expectation: SessionReadinessExpectedSource | null, source: SessionReadinessSource | null, evidence: EvidenceSource | null): SessionRecordingHealthSource => {
    if (source?.evidenceKind === "recording-asset") coveredAssets.add(source.id);
    if (evidence) coveredAssets.add(evidence.recordingAssetId);
    const required = expectation?.retentionRole === "required-master";
    const sourceKind = expectation?.sourceKind ?? source?.sourceKind ?? (evidence?.kind.toLowerCase().includes("video") ? "video" : "audio");
    const gates = [
      planGate(expectation),
      immutableGate(source, evidence, required),
      decodedMediaGate(evidence, sourceKind, required),
      signalGate(evidence, sourceKind, required),
      dispositionGate("processing", evidence?.processingDisposition ?? source?.serverRetention.processingDisposition),
      dispositionGate("transcription", evidence?.transcriptDisposition ?? source?.serverRetention.transcriptDisposition),
    ];
    const state = worstState(gates.map((gate) => gate.state));
    const recordingAssetId = source?.evidenceKind === "recording-asset" ? source.id : evidence?.recordingAssetId ?? null;
    return {
      id: expectation?.id ?? `observed:${recordingAssetId ?? source?.id ?? "missing"}`,
      recordingAssetId,
      expectedSourceId: expectation?.id ?? null,
      participantLabel: expectation?.participantLabel ?? (recordingAssetId ? participantByAsset.get(recordingAssetId) : null) ?? "Unassigned source",
      label: expectation?.label ?? source?.label ?? evidence?.fileName ?? "Observed retained source",
      sourceKind,
      retentionRole: expectation?.retentionRole ?? "unplanned",
      state,
      nextAction: nextAction(gates),
      gates,
    };
  };

  const activeExpectations = input.topology.expectedSources.filter((expectation) => expectation.status === "active");
  const sources = activeExpectations.map((expectation) => {
    const source = findSource(retainedSources, expectation);
    const assetId = source?.evidenceKind === "recording-asset" ? source.id : expectation.recordingAssetId;
    return project(expectation, source, assetId ? evidenceByAsset.get(assetId) ?? null : null);
  });
  for (const { source } of retained) {
    if (coveredAssets.has(source.id)) continue;
    sources.push(project(null, source, source.evidenceKind === "recording-asset" ? evidenceByAsset.get(source.id) ?? null : null));
  }
  for (const evidence of input.sourceEvidence.sources) {
    if (coveredAssets.has(evidence.recordingAssetId)) continue;
    sources.push(project(null, null, evidence));
  }

  sources.sort((left, right) => {
    if (stateRank[left.state] !== stateRank[right.state]) return stateRank[left.state] - stateRank[right.state];
    return left.label.localeCompare(right.label);
  });
  const counts = sources.reduce<Record<SessionRecordingHealthState, number>>((result, source) => {
    result[source.state] += 1;
    return result;
  }, { READY: 0, REVIEW: 0, BLOCKED: 0, UNKNOWN: 0 });
  const state = sources.length ? worstState(sources.map((source) => source.state)) : "UNKNOWN";
  const headline = state === "READY"
    ? "Every planned source has reviewable audio evidence"
    : state === "BLOCKED"
      ? "At least one source is unsafe to use"
      : state === "REVIEW"
        ? "Listening or release review is required"
        : "Recording health is not yet known";
  const detail = sources.length
    ? `${counts.READY} ready · ${counts.REVIEW} review · ${counts.BLOCKED} blocked · ${counts.UNKNOWN} unknown. A source is only ready when every displayed gate is ready.`
    : "No active source plan or retained source is available to evaluate.";
  return {
    state,
    headline,
    detail,
    sources,
    counts,
    boundaries: {
      projectionCreatesNoWorkflowState: true,
      noUniversalQualityScore: true,
      transcriptConfidenceIsNotAudioHealth: true,
      captureSettingsAreNotDecodedMedia: true,
      releasedBytesAreNotProofListened: true,
    },
  };
}
