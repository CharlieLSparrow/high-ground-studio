import type {
  EpisodeAudioProcessingEvidence,
  EpisodeAudioProcessingStatus,
} from "./episode-audio-processing-evidence";

export type EpisodeAudioProgramTrackKind = "dialogue" | "reference" | "music" | "unknown";
export type EpisodeAudioProgramState = "ready" | "attention" | "held" | "not-started";

export type EpisodeAudioProgramStage = {
  id: "preserve" | "align" | "understand" | "treat" | "finish";
  label: string;
  state: EpisodeAudioProgramState;
  detail: string;
};

export type EpisodeAudioProgramTrack = {
  assetId: string;
  sourceId: string;
  title: string;
  kind: EpisodeAudioProgramTrackKind;
  role: string;
  participantId: string | null;
  groupKey: string;
  contentType: string | null;
  durationSeconds: number | null;
  syncStatus: string | null;
  attentionScore: number;
  attentionReason: string;
  stages: EpisodeAudioProgramStage[];
  processing: EpisodeAudioProcessingEvidence;
};

export type EpisodeAudioProgram = {
  tracks: EpisodeAudioProgramTrack[];
  groups: Array<{
    key: string;
    label: string;
    trackCount: number;
    multiDevice: boolean;
  }>;
  summary: {
    retainedTrackCount: number;
    dialogueTrackCount: number;
    heldTrackCount: number;
    alignedTrackCount: number;
    understoodTrackCount: number;
    finishedTrackCount: number;
    multiDeviceGroupCount: number;
  };
  nextAttention: EpisodeAudioProgramTrack | null;
  boundaries: {
    readOnlyProjection: true;
    sourcesRemainImmutable: true;
    processingIsEvidenceNotTaste: true;
    noMixRendered: true;
    noTimelinePlacementApplied: true;
  };
};

const EMPTY_PROCESSING: EpisodeAudioProcessingEvidence = {
  signal: { jobId: null, status: "not-queued", integrityVerified: false, error: null, updatedAt: null, durationSeconds: null, signalStatus: null, observationCount: 0 },
  transcript: { jobId: null, status: "not-queued", integrityVerified: false, error: null, updatedAt: null, transcriptJobId: null, segmentCount: 0, wordCount: 0, timedWordCount: 0 },
  alignment: { jobId: null, status: "not-queued", integrityVerified: false, error: null, updatedAt: null, spineAssetId: null, qualifiedForReview: null, openingOffsetSeconds: null, residualDriftMilliseconds: null },
  mastery: { jobId: null, status: "not-queued", integrityVerified: false, error: null, updatedAt: null, action: null, sourcePassesProfile: null, previewVerified: false },
};

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function processStatus(value: unknown): EpisodeAudioProcessingStatus {
  return ["not-queued", "queued", "processing", "output-ready", "completed", "blocked", "failed"].includes(String(value))
    ? value as EpisodeAudioProcessingStatus
    : "not-queued";
}

function processingEvidence(value: unknown): EpisodeAudioProcessingEvidence {
  const row = record(value);
  const signal = record(row.signal);
  const transcript = record(row.transcript);
  const alignment = record(row.alignment);
  const mastery = record(row.mastery);
  return {
    signal: {
      ...EMPTY_PROCESSING.signal,
      ...signal,
      status: processStatus(signal.status),
      observationCount: number(signal.observationCount) ?? 0,
      durationSeconds: number(signal.durationSeconds),
    },
    transcript: {
      ...EMPTY_PROCESSING.transcript,
      ...transcript,
      status: processStatus(transcript.status),
      segmentCount: number(transcript.segmentCount) ?? 0,
      wordCount: number(transcript.wordCount) ?? 0,
      timedWordCount: number(transcript.timedWordCount) ?? 0,
    },
    alignment: {
      ...EMPTY_PROCESSING.alignment,
      ...alignment,
      status: processStatus(alignment.status),
      openingOffsetSeconds: numberOrSignedNull(alignment.openingOffsetSeconds),
      residualDriftMilliseconds: numberOrSignedNull(alignment.residualDriftMilliseconds),
    },
    mastery: {
      ...EMPTY_PROCESSING.mastery,
      ...mastery,
      status: processStatus(mastery.status),
    },
  };
}

function numberOrSignedNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function trackKind(role: string): EpisodeAudioProgramTrackKind {
  if (/(reference|b-roll|source-clip|youtube|media-board|screen)/.test(role)) return "reference";
  if (/(music|score|theme|jingle|bed)/.test(role)) return "music";
  if (/(audio|dialog|voice|mic|phone|camera|spine|master|episode-media)/.test(role)) return "dialogue";
  return "unknown";
}

function stateForStatus(status: EpisodeAudioProcessingStatus): EpisodeAudioProgramState {
  if (status === "completed") return "ready";
  if (status === "blocked" || status === "failed") return "attention";
  if (status === "queued" || status === "processing" || status === "output-ready") return "attention";
  return "not-started";
}

function stageMap(input: {
  sourceSafe: boolean;
  released: boolean | null;
  unresolved: boolean;
  syncStatus: string;
  processing: EpisodeAudioProcessingEvidence;
  deliveryApproved: boolean;
  isSpine: boolean;
}): EpisodeAudioProgramStage[] {
  const preserveState: EpisodeAudioProgramState = input.unresolved || !input.sourceSafe || input.released === false ? "held" : "ready";
  const syncReady = input.isSpine || input.processing.alignment.status === "completed" || /(synced|aligned|locked)/.test(input.syncStatus);
  const understandReady = input.processing.signal.status === "completed" && input.processing.transcript.status === "completed";
  return [
    {
      id: "preserve",
      label: "Preserve",
      state: preserveState,
      detail: preserveState === "ready" ? "Retained source is available" : "Release or lineage evidence needs attention",
    },
    {
      id: "align",
      label: "Align",
      state: syncReady ? "ready" : stateForStatus(input.processing.alignment.status),
      detail: input.isSpine ? "Program reference clock" : syncReady ? "Alignment evidence is available" : "No reviewed shared-clock evidence yet",
    },
    {
      id: "understand",
      label: "Understand",
      state: understandReady ? "ready" : [input.processing.signal.status, input.processing.transcript.status].some((value) => value === "failed" || value === "blocked") ? "attention" : "not-started",
      detail: understandReady
        ? `${input.processing.transcript.timedWordCount} timed words · ${input.processing.signal.observationCount} signal flags`
        : "Signal map and timed transcript are not both complete",
    },
    {
      id: "treat",
      label: "Treat",
      state: stateForStatus(input.processing.mastery.status),
      detail: input.processing.mastery.previewVerified
        ? input.processing.mastery.action === "no-change" ? "Source already passes profile" : "Verified treatment preview"
        : "No verified mastering decision yet",
    },
    {
      id: "finish",
      label: "Finish",
      state: input.deliveryApproved ? "ready" : "not-started",
      detail: input.deliveryApproved ? "Encoded bytes proof-listened" : "No approved delivery artifact yet",
    },
  ];
}

function attention(stages: EpisodeAudioProgramStage[], kind: EpisodeAudioProgramTrackKind) {
  const weights: Record<EpisodeAudioProgramStage["id"], number> = { preserve: 100, align: 70, understand: 50, treat: 30, finish: 10 };
  const problem = stages.find((stage) => stage.state === "held" || stage.state === "attention" || stage.state === "not-started");
  if (!problem) return { score: 0, reason: "This track has a complete reviewed delivery chain." };
  const kindBoost = kind === "dialogue" ? 20 : kind === "unknown" ? 10 : 0;
  const stateBoost = problem.state === "held" ? 20 : problem.state === "attention" ? 10 : 0;
  return { score: weights[problem.id] + kindBoost + stateBoost, reason: `${problem.label}: ${problem.detail}` };
}

export function buildEpisodeAudioProgram(inventory: unknown): EpisodeAudioProgram {
  const root = record(inventory);
  const imported = Array.isArray(root.importedMedia) ? root.importedMedia : [];
  const tracks = imported.flatMap((raw): EpisodeAudioProgramTrack[] => {
    const item = record(raw);
    const asset = record(item.asset);
    const readiness = record(asset.readiness);
    const recording = record(item.recording);
    const recordingReadiness = record(recording.readiness);
    const contentType = text(item.contentType) || text(asset.mimeType) || null;
    const kind = text(item.kind);
    if (!(kind === "audio" || kind === "video" || contentType?.startsWith("audio/") || contentType?.startsWith("video/"))) return [];
    const assetId = text(item.id);
    const sourceId = text(item.sourceId);
    if (!assetId || !sourceId) return [];
    const role = (text(item.importRole) || "unassigned-source").toLowerCase();
    const participantId = text(recording.participantId) || null;
    const groupKey = participantId ? `participant:${participantId}` : `source:${sourceId}`;
    const processing = processingEvidence(asset.audioProcessingEvidence);
    const delivery = record(asset.audioDeliveryArtifact);
    const deliveryReadiness = record(delivery.readiness);
    const syncStatus = text(item.syncStatus).toLowerCase();
    const stages = stageMap({
      sourceSafe: readiness.sourceSafe !== false,
      released: Object.keys(recording).length ? recordingReadiness.mediaProcessingReleased === true : null,
      unresolved: item.unresolvedRecordingReference === true,
      syncStatus,
      processing,
      deliveryApproved: deliveryReadiness.proofListenApproved === true,
      isSpine: /^(spine-audio|program-master|mixed-master)$/.test(role),
    });
    const trackType = trackKind(role);
    const ranked = attention(stages, trackType);
    return [{
      assetId,
      sourceId,
      title: text(item.originalName) || text(asset.filename) || "Unnamed retained source",
      kind: trackType,
      role,
      participantId,
      groupKey,
      contentType,
      durationSeconds: number(asset.duration) ?? number(processing.signal.durationSeconds),
      syncStatus: syncStatus || null,
      attentionScore: ranked.score,
      attentionReason: ranked.reason,
      stages,
      processing,
    }];
  }).sort((left, right) => right.attentionScore - left.attentionScore || left.title.localeCompare(right.title));

  const grouped = new Map<string, EpisodeAudioProgramTrack[]>();
  for (const track of tracks) grouped.set(track.groupKey, [...(grouped.get(track.groupKey) ?? []), track]);
  const groups = [...grouped.entries()].map(([key, entries]) => ({
    key,
    label: key.startsWith("participant:") ? `Participant ${key.slice("participant:".length)}` : entries[0].title,
    trackCount: entries.length,
    multiDevice: key.startsWith("participant:") && entries.length > 1,
  }));
  const completed = (track: EpisodeAudioProgramTrack, id: EpisodeAudioProgramStage["id"]) => track.stages.find((stage) => stage.id === id)?.state === "ready";

  return {
    tracks,
    groups,
    summary: {
      retainedTrackCount: tracks.length,
      dialogueTrackCount: tracks.filter((track) => track.kind === "dialogue").length,
      heldTrackCount: tracks.filter((track) => track.stages[0].state === "held").length,
      alignedTrackCount: tracks.filter((track) => completed(track, "align")).length,
      understoodTrackCount: tracks.filter((track) => completed(track, "understand")).length,
      finishedTrackCount: tracks.filter((track) => completed(track, "finish")).length,
      multiDeviceGroupCount: groups.filter((group) => group.multiDevice).length,
    },
    nextAttention: tracks.find((track) => track.attentionScore > 0) ?? null,
    boundaries: {
      readOnlyProjection: true,
      sourcesRemainImmutable: true,
      processingIsEvidenceNotTaste: true,
      noMixRendered: true,
      noTimelinePlacementApplied: true,
    },
  };
}
