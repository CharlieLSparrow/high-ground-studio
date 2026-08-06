import type { AudioMasteryProfileId, AudioMasterySourceBinding } from "./audio-mastery.js";

export const EPISODE_AUDIO_MIX_CONTRACT_VERSION = 1 as const;
export const EPISODE_AUDIO_MIX_PROPOSAL_KIND = "quipsly-episode-audio-mix-proposal-v1" as const;

export type EpisodeAudioMixTrack = {
  assetId: string;
  sourceId: string;
  title: string;
  participantId: string | null;
  participantLabel: string | null;
  role: "dialogue-primary" | "dialogue-backup" | "camera-scratch" | "reference" | "music" | "sound-effect" | "program-master";
  mixDisposition: "include";
  alignment: "program-clock" | "qualified-candidate";
  programOffsetSeconds: number;
  sourceDurationSeconds: number;
  alignmentEvidenceJobId: string | null;
  source: AudioMasterySourceBinding;
};

export type EpisodeAudioMixReviewEvidence = {
  receiptId: string;
  analysisReceiptId: string;
  eventId: string;
  decision:
    | "confirmed-overlap"
    | "intentional-overlap"
    | "same-participant-redundancy"
    | "mic-bleed"
    | "confirmed-dialogue-gap"
    | "false-positive"
    | "needs-comparison";
  startSeconds: number;
  endSeconds: number;
  involvedAssetIds: string[];
  playbackEvidenceSha256: string;
};

export type EpisodeAudioMixGainAction = {
  id: string;
  operation: "gain-envelope";
  origin: "review-derived" | "human-adjustment";
  targetAssetId: string;
  programStartSeconds: number;
  programEndSeconds: number;
  gainDb: number;
  attackMilliseconds: number;
  releaseMilliseconds: number;
  reason: "mic-bleed" | "same-participant-redundancy" | "manual";
  evidenceReviewReceiptIds: string[];
  replacesActionId: string | null;
};

export type EpisodeAudioMixUnresolvedEvent = {
  reviewReceiptId: string;
  eventId: string;
  reason: "no-unique-primary" | "review-does-not-authorize-gain";
  involvedAssetIds: string[];
};

export type EpisodeAudioMixProposal = {
  kind: typeof EPISODE_AUDIO_MIX_PROPOSAL_KIND;
  version: typeof EPISODE_AUDIO_MIX_CONTRACT_VERSION;
  proposalId: string;
  parentProposalId: string | null;
  revision: number;
  createdAt: string;
  createdBy: "quipsly-deterministic-v1" | "human-revision";
  projectId: string;
  episodeProductionId: string;
  programFingerprintSha256: string;
  activeDecisionReceiptIds: string[];
  tracks: EpisodeAudioMixTrack[];
  evidenceReviews: EpisodeAudioMixReviewEvidence[];
  actions: EpisodeAudioMixGainAction[];
  unresolvedEvents: EpisodeAudioMixUnresolvedEvent[];
  output: {
    provider: "local" | "gcs";
    locator: string;
    contentType: "audio/wav";
    codec: "pcm_s24le";
    sampleRateHz: 48_000;
    channelCount: 2;
    variantKind: "episode-mix-preview";
    masteryProfileId: AudioMasteryProfileId;
  };
  boundaries: {
    originalTracksRemainSourceTruth: true;
    proposalDoesNotChangeTimelineOrMedia: true;
    reviewEvidenceAuthorizesSuggestionsOnly: true;
    correlationNeverAuthorizesAutomation: true;
    previewMustBeIndependentlyMeasured: true;
    promotionRequiresPlaybackBoundApproval: true;
  };
};

type AutomaticMixProposalInput = {
  proposalId: string;
  createdAt: string;
  projectId: string;
  episodeProductionId: string;
  programFingerprintSha256: string;
  activeDecisionReceiptIds: string[];
  tracks: EpisodeAudioMixTrack[];
  evidenceReviews: EpisodeAudioMixReviewEvidence[];
  output: EpisodeAudioMixProposal["output"];
};

const SAFE_ID = /^[A-Za-z0-9_-]{8,180}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const ROLES = new Set<EpisodeAudioMixTrack["role"]>(["dialogue-primary", "dialogue-backup", "camera-scratch", "reference", "music", "sound-effect", "program-master"]);
const REVIEW_DECISIONS = new Set<EpisodeAudioMixReviewEvidence["decision"]>(["confirmed-overlap", "intentional-overlap", "same-participant-redundancy", "mic-bleed", "confirmed-dialogue-gap", "false-positive", "needs-comparison"]);
const ROLE_RANK: Record<EpisodeAudioMixTrack["role"], number> = {
  "dialogue-primary": 70,
  "program-master": 60,
  "dialogue-backup": 40,
  "camera-scratch": 20,
  reference: 10,
  music: 5,
  "sound-effect": 5,
};

export function newAutomaticEpisodeAudioMixProposal(input: AutomaticMixProposalInput): EpisodeAudioMixProposal {
  const tracks = input.tracks.map(parseTrack).sort((left, right) => `${left.assetId}:${left.sourceId}`.localeCompare(`${right.assetId}:${right.sourceId}`));
  if (tracks.length === 0) throw new Error("An Episode mix proposal requires at least one included, aligned exact source.");
  if (tracks.filter((track) => track.alignment === "program-clock").length !== 1) throw new Error("An Episode mix proposal requires exactly one program clock.");
  const reviews = input.evidenceReviews.map(parseReview).sort((left, right) => `${left.startSeconds}:${left.receiptId}`.localeCompare(`${right.startSeconds}:${right.receiptId}`));
  const actions: EpisodeAudioMixGainAction[] = [];
  const unresolvedEvents: EpisodeAudioMixUnresolvedEvent[] = [];
  for (const review of reviews) {
    const involved = tracks.filter((track) => review.involvedAssetIds.includes(track.assetId));
    if (review.decision !== "mic-bleed" && review.decision !== "same-participant-redundancy") {
      unresolvedEvents.push({ reviewReceiptId: review.receiptId, eventId: review.eventId, reason: "review-does-not-authorize-gain", involvedAssetIds: review.involvedAssetIds });
      continue;
    }
    if (involved.length < 2) throw new Error("A gain-authorizing review must bind at least two included exact tracks.");
    const maximumRank = Math.max(...involved.map((track) => ROLE_RANK[track.role]));
    const winners = involved.filter((track) => ROLE_RANK[track.role] === maximumRank);
    if (winners.length !== 1) {
      unresolvedEvents.push({ reviewReceiptId: review.receiptId, eventId: review.eventId, reason: "no-unique-primary", involvedAssetIds: review.involvedAssetIds });
      continue;
    }
    const winner = winners[0]!;
    for (const target of involved.filter((track) => track.assetId !== winner.assetId)) {
      actions.push({
        id: `mix_action_${review.receiptId}_${target.assetId}`.replaceAll(/[^A-Za-z0-9_-]/g, "_").slice(0, 180),
        operation: "gain-envelope",
        origin: "review-derived",
        targetAssetId: target.assetId,
        programStartSeconds: review.startSeconds,
        programEndSeconds: review.endSeconds,
        gainDb: -18,
        attackMilliseconds: 75,
        releaseMilliseconds: 150,
        reason: review.decision,
        evidenceReviewReceiptIds: [review.receiptId],
        replacesActionId: null,
      });
    }
  }
  return parseEpisodeAudioMixProposal({
    kind: EPISODE_AUDIO_MIX_PROPOSAL_KIND,
    version: EPISODE_AUDIO_MIX_CONTRACT_VERSION,
    proposalId: input.proposalId,
    parentProposalId: null,
    revision: 1,
    createdAt: input.createdAt,
    createdBy: "quipsly-deterministic-v1",
    projectId: input.projectId,
    episodeProductionId: input.episodeProductionId,
    programFingerprintSha256: input.programFingerprintSha256,
    activeDecisionReceiptIds: uniqueSortedIds(input.activeDecisionReceiptIds, "activeDecisionReceiptIds"),
    tracks,
    evidenceReviews: reviews,
    actions,
    unresolvedEvents,
    output: input.output,
    boundaries: boundaries(),
  });
}

export function reviseEpisodeAudioMixProposal(input: {
  proposalId: string;
  createdAt: string;
  parent: EpisodeAudioMixProposal | unknown;
  edits: Array<{
    actionId: string;
    gainDb: number;
    attackMilliseconds: number;
    releaseMilliseconds: number;
  }>;
}): EpisodeAudioMixProposal {
  const parent = parseEpisodeAudioMixProposal(input.parent);
  const edits = new Map(input.edits.map((edit) => [id(edit.actionId, "edit.actionId"), edit]));
  if (edits.size !== input.edits.length) throw new Error("An Episode mix revision contains duplicate action edits.");
  const actions = parent.actions.map((action) => {
    const edit = edits.get(action.id);
    if (!edit) return action;
    edits.delete(action.id);
    return parseAction({
      ...action,
      id: `${action.id}_r${parent.revision + 1}`.slice(0, 180),
      origin: "human-adjustment",
      gainDb: edit.gainDb,
      attackMilliseconds: edit.attackMilliseconds,
      releaseMilliseconds: edit.releaseMilliseconds,
      reason: "manual",
      replacesActionId: action.id,
    }, parent.tracks, parent.evidenceReviews);
  });
  if (edits.size > 0) throw new Error("An Episode mix revision references an unknown action.");
  return parseEpisodeAudioMixProposal({
    ...parent,
    proposalId: input.proposalId,
    parentProposalId: parent.proposalId,
    revision: parent.revision + 1,
    createdAt: input.createdAt,
    createdBy: "human-revision",
    actions,
  });
}

export function parseEpisodeAudioMixProposal(value: unknown): EpisodeAudioMixProposal {
  const row = record(value);
  const tracks = array(row.tracks, "tracks").map(parseTrack);
  if (tracks.length === 0 || tracks.filter((track) => track.alignment === "program-clock").length !== 1) throw new Error("An Episode mix proposal must retain exactly one program clock.");
  const reviews = array(row.evidenceReviews, "evidenceReviews").map(parseReview);
  const actions = array(row.actions, "actions").map((action) => parseAction(action, tracks, reviews));
  const unresolvedEvents = array(row.unresolvedEvents, "unresolvedEvents").map(parseUnresolved);
  const output = parseOutput(row.output);
  const boundary = record(row.boundaries);
  if (JSON.stringify(boundary) !== JSON.stringify(boundaries())) throw new Error("Episode mix safety boundaries are invalid.");
  const parentProposalId = row.parentProposalId === null ? null : id(row.parentProposalId, "parentProposalId");
  const revision = positiveInteger(row.revision, "revision");
  const createdBy = row.createdBy === "quipsly-deterministic-v1" || row.createdBy === "human-revision" ? row.createdBy : invalid("createdBy");
  if ((revision === 1) !== (parentProposalId === null) || (createdBy === "quipsly-deterministic-v1") !== (revision === 1)) throw new Error("Episode mix revision lineage is invalid.");
  if (row.kind !== EPISODE_AUDIO_MIX_PROPOSAL_KIND || row.version !== EPISODE_AUDIO_MIX_CONTRACT_VERSION) throw new Error("Episode mix proposal contract is unsupported.");
  return {
    kind: EPISODE_AUDIO_MIX_PROPOSAL_KIND,
    version: EPISODE_AUDIO_MIX_CONTRACT_VERSION,
    proposalId: id(row.proposalId, "proposalId"),
    parentProposalId,
    revision,
    createdAt: isoDate(row.createdAt, "createdAt"),
    createdBy,
    projectId: id(row.projectId, "projectId"),
    episodeProductionId: id(row.episodeProductionId, "episodeProductionId"),
    programFingerprintSha256: sha(row.programFingerprintSha256, "programFingerprintSha256"),
    activeDecisionReceiptIds: uniqueSortedIds(row.activeDecisionReceiptIds, "activeDecisionReceiptIds"),
    tracks,
    evidenceReviews: reviews,
    actions,
    unresolvedEvents,
    output,
    boundaries: boundaries(),
  };
}

function parseTrack(value: unknown): EpisodeAudioMixTrack {
  const row = record(value);
  const role = ROLES.has(row.role as EpisodeAudioMixTrack["role"]) ? row.role as EpisodeAudioMixTrack["role"] : invalid("track.role");
  const alignment = row.alignment === "program-clock" || row.alignment === "qualified-candidate" ? row.alignment : invalid("track.alignment");
  const source = parseSource(row.source);
  if (source.assetId !== row.assetId || row.mixDisposition !== "include") throw new Error("Episode mix tracks must bind an included exact source.");
  const alignmentEvidenceJobId = row.alignmentEvidenceJobId === null ? null : id(row.alignmentEvidenceJobId, "track.alignmentEvidenceJobId");
  if ((alignment === "program-clock") !== (alignmentEvidenceJobId === null)) throw new Error("Episode mix track alignment evidence is invalid.");
  return { assetId: id(row.assetId, "track.assetId"), sourceId: id(row.sourceId, "track.sourceId"), title: text(row.title, "track.title", 240), participantId: nullableId(row.participantId, "track.participantId"), participantLabel: nullableText(row.participantLabel, 160), role, mixDisposition: "include", alignment, programOffsetSeconds: finite(row.programOffsetSeconds, "track.programOffsetSeconds", -86_400, 86_400), sourceDurationSeconds: finite(row.sourceDurationSeconds, "track.sourceDurationSeconds", 0.001, 172_800), alignmentEvidenceJobId, source };
}

function parseReview(value: unknown): EpisodeAudioMixReviewEvidence {
  const row = record(value);
  const decision = REVIEW_DECISIONS.has(row.decision as EpisodeAudioMixReviewEvidence["decision"]) ? row.decision as EpisodeAudioMixReviewEvidence["decision"] : invalid("review.decision");
  const startSeconds = finite(row.startSeconds, "review.startSeconds", 0, 172_800);
  const endSeconds = finite(row.endSeconds, "review.endSeconds", 0.001, 172_800);
  if (endSeconds <= startSeconds) throw new Error("Episode mix review range is invalid.");
  return { receiptId: id(row.receiptId, "review.receiptId"), analysisReceiptId: id(row.analysisReceiptId, "review.analysisReceiptId"), eventId: id(row.eventId, "review.eventId"), decision, startSeconds, endSeconds, involvedAssetIds: uniqueSortedIds(row.involvedAssetIds, "review.involvedAssetIds"), playbackEvidenceSha256: sha(row.playbackEvidenceSha256, "review.playbackEvidenceSha256") };
}

function parseAction(value: unknown, tracks: EpisodeAudioMixTrack[], reviews: EpisodeAudioMixReviewEvidence[]): EpisodeAudioMixGainAction {
  const row = record(value);
  const targetAssetId = id(row.targetAssetId, "action.targetAssetId");
  if (!tracks.some((track) => track.assetId === targetAssetId)) throw new Error("Episode mix action target is not an included exact track.");
  const evidenceReviewReceiptIds = uniqueSortedIds(row.evidenceReviewReceiptIds, "action.evidenceReviewReceiptIds");
  if (!evidenceReviewReceiptIds.every((receiptId) => reviews.some((review) => review.receiptId === receiptId))) throw new Error("Episode mix action evidence is missing from the proposal.");
  const start = finite(row.programStartSeconds, "action.programStartSeconds", 0, 172_800);
  const end = finite(row.programEndSeconds, "action.programEndSeconds", 0.001, 172_800);
  if (end <= start) throw new Error("Episode mix action range is invalid.");
  const origin = row.origin === "review-derived" || row.origin === "human-adjustment" ? row.origin : invalid("action.origin");
  const reason = row.reason === "mic-bleed" || row.reason === "same-participant-redundancy" || row.reason === "manual" ? row.reason : invalid("action.reason");
  if (origin === "review-derived" && reason === "manual") throw new Error("A review-derived action cannot claim a manual reason.");
  return { id: id(row.id, "action.id"), operation: row.operation === "gain-envelope" ? "gain-envelope" : invalid("action.operation"), origin, targetAssetId, programStartSeconds: start, programEndSeconds: end, gainDb: finite(row.gainDb, "action.gainDb", -60, 6), attackMilliseconds: finite(row.attackMilliseconds, "action.attackMilliseconds", 5, 5_000), releaseMilliseconds: finite(row.releaseMilliseconds, "action.releaseMilliseconds", 5, 5_000), reason, evidenceReviewReceiptIds, replacesActionId: row.replacesActionId === null ? null : id(row.replacesActionId, "action.replacesActionId") };
}

function parseUnresolved(value: unknown): EpisodeAudioMixUnresolvedEvent {
  const row = record(value);
  const reason = row.reason === "no-unique-primary" || row.reason === "review-does-not-authorize-gain" ? row.reason : invalid("unresolved.reason");
  return { reviewReceiptId: id(row.reviewReceiptId, "unresolved.reviewReceiptId"), eventId: id(row.eventId, "unresolved.eventId"), reason, involvedAssetIds: uniqueSortedIds(row.involvedAssetIds, "unresolved.involvedAssetIds") };
}

function parseOutput(value: unknown): EpisodeAudioMixProposal["output"] {
  const row = record(value);
  const provider = row.provider === "local" || row.provider === "gcs" ? row.provider : invalid("output.provider");
  const masteryProfileId = row.masteryProfileId === "apple-podcasts-dialogue-v1" || row.masteryProfileId === "ebu-r128-broadcast-v1" ? row.masteryProfileId : invalid("output.masteryProfileId");
  if (row.contentType !== "audio/wav" || row.codec !== "pcm_s24le" || row.sampleRateHz !== 48_000 || row.channelCount !== 2 || row.variantKind !== "episode-mix-preview") throw new Error("Episode mix preview output contract is invalid.");
  return { provider, locator: text(row.locator, "output.locator", 1_500), contentType: "audio/wav", codec: "pcm_s24le", sampleRateHz: 48_000, channelCount: 2, variantKind: "episode-mix-preview", masteryProfileId };
}

function parseSource(value: unknown): AudioMasterySourceBinding {
  const row = record(value);
  const provider = row.provider === "local" || row.provider === "gcs" ? row.provider : invalid("source.provider");
  return { assetId: id(row.assetId, "source.assetId"), provider, locator: text(row.locator, "source.locator", 1_500), generation: text(row.generation, "source.generation", 240), sha256: sha(row.sha256, "source.sha256"), sizeBytes: positiveInteger(row.sizeBytes, "source.sizeBytes"), contentType: text(row.contentType, "source.contentType", 240) };
}

function boundaries(): EpisodeAudioMixProposal["boundaries"] { return { originalTracksRemainSourceTruth: true, proposalDoesNotChangeTimelineOrMedia: true, reviewEvidenceAuthorizesSuggestionsOnly: true, correlationNeverAuthorizesAutomation: true, previewMustBeIndependentlyMeasured: true, promotionRequiresPlaybackBoundApproval: true }; }
function record(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function array(value: unknown, field: string): unknown[] { if (!Array.isArray(value)) throw new Error(`Episode mix ${field} must be an array.`); return value; }
function text(value: unknown, field: string, maximum = 180): string { const result = typeof value === "string" ? value.trim() : ""; if (!result || result.length > maximum) throw new Error(`Episode mix ${field} is invalid.`); return result; }
function nullableText(value: unknown, maximum: number): string | null { if (value === null) return null; return text(value, "nullableText", maximum); }
function id(value: unknown, field: string): string { const result = text(value, field); if (!SAFE_ID.test(result)) throw new Error(`Episode mix ${field} is invalid.`); return result; }
function nullableId(value: unknown, field: string): string | null { return value === null ? null : id(value, field); }
function sha(value: unknown, field: string): string { const result = text(value, field); if (!SHA256.test(result)) throw new Error(`Episode mix ${field} is invalid.`); return result; }
function isoDate(value: unknown, field: string): string { const result = text(value, field); if (!Number.isFinite(Date.parse(result))) throw new Error(`Episode mix ${field} is invalid.`); return result; }
function finite(value: unknown, field: string, minimum: number, maximum: number): number { const result = Number(value); if (!Number.isFinite(result) || result < minimum || result > maximum) throw new Error(`Episode mix ${field} is out of range.`); return Math.round(result * 1_000_000) / 1_000_000; }
function positiveInteger(value: unknown, field: string): number { const result = Number(value); if (!Number.isSafeInteger(result) || result <= 0) throw new Error(`Episode mix ${field} must be a positive integer.`); return result; }
function uniqueSortedIds(value: unknown, field: string): string[] { const result = array(value, field).map((entry) => id(entry, field)).sort(); if (new Set(result).size !== result.length) throw new Error(`Episode mix ${field} contains duplicates.`); return result; }
function invalid(field: string): never { throw new Error(`Episode mix ${field} is invalid.`); }
