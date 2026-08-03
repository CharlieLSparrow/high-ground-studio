/**
 * Shared transcript-packet contract.
 *
 * A transcript may suggest work, but inference is never committed work. Both
 * Quipsly applications use this module to keep packet provenance, review state,
 * legacy quarantine, and the provider-processing release boundary identical.
 */

import {
  readTranscriptSourceSpan,
  type TranscriptSourceSpanEvidence,
} from "./transcript-derived-task";

export const TRANSCRIPT_PACKET_SOURCE = "transcript-packet-builder" as const;
export const LEGACY_WEB_TRANSCRIPT_PACKET_SOURCE = "web-transcript-packet-builder" as const;
export const TRANSCRIPT_PACKET_SOURCES = [
  TRANSCRIPT_PACKET_SOURCE,
  LEGACY_WEB_TRANSCRIPT_PACKET_SOURCE,
] as const;

export type TranscriptPacketSource = (typeof TRANSCRIPT_PACKET_SOURCES)[number];

export const TRANSCRIPT_ACTION_CANDIDATE_KIND =
  "quipsly-transcript-action-candidate-v1" as const;

export const TRANSCRIPT_ACTION_REVIEW_DECISIONS = [
  "ACCEPT",
  "EDIT",
  "REJECT",
  "DEFER",
] as const;
export type TranscriptActionReviewDecision =
  (typeof TRANSCRIPT_ACTION_REVIEW_DECISIONS)[number];

export const TRANSCRIPT_ACTION_REVIEW_STATUSES = [
  "READY_FOR_HUMAN_REVIEW",
  "EDITED_FOR_REVIEW",
  "DEFERRED_BY_HUMAN",
  "REJECTED_BY_HUMAN",
  "ACCEPTED_AS_ACTION_ITEM",
] as const;
export type TranscriptActionReviewStatus =
  (typeof TRANSCRIPT_ACTION_REVIEW_STATUSES)[number];

export const TRANSCRIPT_GOAL_REVIEW_DECISIONS = [
  "ACCEPT",
  "EDIT",
  "REJECT",
  "DEFER",
] as const;
export type TranscriptGoalReviewDecision =
  (typeof TRANSCRIPT_GOAL_REVIEW_DECISIONS)[number];

export const TRANSCRIPT_GOAL_REVIEW_STATUSES = [
  "READY_FOR_HUMAN_REVIEW",
  "EDITED_FOR_REVIEW",
  "DEFERRED_BY_HUMAN",
  "REJECTED_BY_HUMAN",
  "ACCEPTED_AS_GOAL",
] as const;
export type TranscriptGoalReviewStatus =
  (typeof TRANSCRIPT_GOAL_REVIEW_STATUSES)[number];

export const TRANSCRIPT_NOTE_REVIEW_DECISIONS = [
  "ACCEPT",
  "EDIT",
  "REJECT",
  "DEFER",
] as const;
export type TranscriptNoteReviewDecision =
  (typeof TRANSCRIPT_NOTE_REVIEW_DECISIONS)[number];

export const TRANSCRIPT_NOTE_REVIEW_STATUSES = [
  "READY_FOR_HUMAN_REVIEW",
  "EDITED_FOR_REVIEW",
  "DEFERRED_BY_HUMAN",
  "REJECTED_BY_HUMAN",
  "ACCEPTED_AS_NOTE",
] as const;
export type TranscriptNoteReviewStatus =
  (typeof TRANSCRIPT_NOTE_REVIEW_STATUSES)[number];

export interface TranscriptActionCandidate {
  id: string;
  kind: typeof TRANSCRIPT_ACTION_CANDIDATE_KIND;
  reviewStatus: TranscriptActionReviewStatus;
  title: string;
  detail: string;
  transcriptJobId: string;
  recordingAssetId: string;
  roomId: string;
  packetBuildId: string;
  segmentId: string;
  /** Ordered immutable segment identities. `segmentId` remains the primary deep-link anchor. */
  segmentIds?: string[];
  /** Complete effective transcript text represented by the candidate span. */
  sourceText?: string;
  /** SHA-256 of `sourceText`, used to reject mutated packet projections. */
  sourceTextSha256?: string;
  sourceSpan?: TranscriptSourceSpanEvidence | null;
  /** Human-review state for the complete evidence span, not only its primary segment. */
  transcriptReviewStatus?: "provider" | "human-reviewed";
  speakerLabel: string | null;
  startSeconds: number;
  endSeconds: number;
  humanApprovalRequired: boolean;
  committedActionItemId: string | null;
}

export type TranscriptPacketBriefSegment = {
  id: string;
  segmentIds?: string[];
  sourceTextSha256?: string;
  speakerLabel?: string | null;
  startSeconds: number;
  endSeconds: number;
  text: string;
};

const TRANSCRIPT_PACKET_BRIEF_SECTIONS = [
  { id: "decisions", label: "Candidate decisions", pattern: /\b(decid(?:e|ed|ing)|decision|choose|chose|choice|going with|settled on|agreed)\b/i },
  { id: "goals", label: "Candidate goals", pattern: /\b(goal|aim|want to|working toward|trying to|success looks like|outcome)\b/i },
  { id: "questions", label: "Open questions", pattern: /\?|\b(question|unclear|wonder|need to know|find out|verify)\b/i },
] as const;

function briefText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function briefTime(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}

function briefSegment(segment: TranscriptPacketBriefSegment) {
  const text = briefText(segment.text);
  return {
    segmentId: segment.id,
    segmentIds: Array.isArray(segment.segmentIds) && segment.segmentIds.length
      ? [...segment.segmentIds]
      : [segment.id],
    sourceTextSha256: briefText(segment.sourceTextSha256) || null,
    speakerLabel: briefText(segment.speakerLabel) || "Unknown speaker",
    startSeconds: segment.startSeconds,
    endSeconds: segment.endSeconds,
    timeLabel: `${briefTime(segment.startSeconds)}-${briefTime(segment.endSeconds)}`,
    text: text.length > 240 ? `${text.slice(0, 237)}...` : text,
  };
}

export function buildTranscriptPacketBrief(
  segments: TranscriptPacketBriefSegment[],
  highlights: TranscriptPacketBriefSegment[],
  actionSegments: TranscriptPacketBriefSegment[],
) {
  const section = (id: string, label: string, candidates: TranscriptPacketBriefSegment[]) => {
    const seen = new Set<string>();
    const items = [];
    for (const segment of candidates) {
      if (!segment.id || seen.has(segment.id) || !briefText(segment.text)) continue;
      seen.add(segment.id);
      items.push(briefSegment(segment));
      if (items.length >= 6) break;
    }
    return { id, label, itemCount: items.length, items };
  };
  const structuredSections = TRANSCRIPT_PACKET_BRIEF_SECTIONS.map((definition) => section(
    definition.id,
    definition.label,
    segments.filter((segment) => definition.pattern.test(briefText(segment.text))),
  ));
  return {
    kind: "quipsly-transcript-packet-brief-v1" as const,
    candidateOnly: true as const,
    humanApprovalRequired: true as const,
    sourceTruth: "Every brief item points to an immutable transcript segment; recording media remains source truth.",
    overview: {
      segmentCount: segments.reduce((count, segment) => count + (
        Array.isArray(segment.segmentIds) && segment.segmentIds.length ? segment.segmentIds.length : 1
      ), 0),
      thoughtSpanCount: segments.length,
      speakerCount: new Set(segments.map((segment) => briefText(segment.speakerLabel)).filter(Boolean)).size,
      startSeconds: typeof segments[0]?.startSeconds === "number" ? segments[0].startSeconds : null,
      endSeconds: typeof segments.at(-1)?.endSeconds === "number" ? segments.at(-1)!.endSeconds : null,
    },
    sections: [
      ...structuredSections,
      section("commitments", "Candidate commitments", actionSegments),
      section("key-moments", "Candidate key moments", highlights),
    ],
  };
}

/**
 * Construct the only shape a transcript builder may use for inferred work.
 * Deliberately omits all committed-work fields: a packet builder can propose
 * an action, but cannot manufacture an accepted ActionItem by choosing its
 * own review status.
 */
export function createTranscriptActionCandidate(input: {
  id: string;
  title: string;
  detail: string;
  transcriptJobId: string;
  recordingAssetId: string;
  roomId: string;
  packetBuildId: string;
  segmentId: string;
  segmentIds: string[];
  sourceText: string;
  sourceTextSha256: string;
  sourceSpan?: TranscriptSourceSpanEvidence | null;
  transcriptReviewStatus: "provider" | "human-reviewed";
  speakerLabel: string | null;
  startSeconds: number;
  endSeconds: number;
}): TranscriptActionCandidate {
  return {
    ...input,
    kind: TRANSCRIPT_ACTION_CANDIDATE_KIND,
    reviewStatus: "READY_FOR_HUMAN_REVIEW",
    humanApprovalRequired: true,
    committedActionItemId: null,
  };
}

export interface TranscriptPacketProvenance {
  source: TranscriptPacketSource;
  transcriptJobId: string;
  recordingAssetId: string;
  roomId: string;
  packetBuildId: string;
}

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function nonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isTranscriptPacketSource(value: unknown): value is TranscriptPacketSource {
  return TRANSCRIPT_PACKET_SOURCES.some((source) => source === value);
}

export function isTranscriptActionReviewDecision(
  value: unknown,
): value is TranscriptActionReviewDecision {
  return TRANSCRIPT_ACTION_REVIEW_DECISIONS.some((decision) => decision === value);
}

export function isTranscriptActionReviewStatus(
  value: unknown,
): value is TranscriptActionReviewStatus {
  return TRANSCRIPT_ACTION_REVIEW_STATUSES.some((status) => status === value);
}

export function isTranscriptGoalReviewDecision(
  value: unknown,
): value is TranscriptGoalReviewDecision {
  return TRANSCRIPT_GOAL_REVIEW_DECISIONS.some((decision) => decision === value);
}

export function isTranscriptGoalReviewStatus(
  value: unknown,
): value is TranscriptGoalReviewStatus {
  return TRANSCRIPT_GOAL_REVIEW_STATUSES.some((status) => status === value);
}

export function isTranscriptNoteReviewDecision(
  value: unknown,
): value is TranscriptNoteReviewDecision {
  return TRANSCRIPT_NOTE_REVIEW_DECISIONS.some((decision) => decision === value);
}

export function isTranscriptNoteReviewStatus(
  value: unknown,
): value is TranscriptNoteReviewStatus {
  return TRANSCRIPT_NOTE_REVIEW_STATUSES.some((status) => status === value);
}

/** Stable identity shared by packet read models and deliberate note writes. */
export function transcriptPacketNoteCandidateId(packetBuildId: string, laneId: string, segmentId: string) {
  return `packet-note-${packetBuildId}-${laneId}-${segmentId}`;
}

export function hasCorrelatedTranscriptPacketProvenance(
  value: unknown,
): value is TranscriptPacketProvenance {
  const source = object(value);
  return isTranscriptPacketSource(source.source)
    && nonEmptyText(source.transcriptJobId)
    && nonEmptyText(source.recordingAssetId)
    && nonEmptyText(source.roomId)
    && nonEmptyText(source.packetBuildId);
}

export function isTranscriptActionCandidate(
  value: unknown,
): value is TranscriptActionCandidate {
  const candidate = object(value);
  return candidate.kind === TRANSCRIPT_ACTION_CANDIDATE_KIND
    && nonEmptyText(candidate.id)
    && isTranscriptActionReviewStatus(candidate.reviewStatus)
    && nonEmptyText(candidate.title)
    && typeof candidate.detail === "string"
    && nonEmptyText(candidate.transcriptJobId)
    && nonEmptyText(candidate.recordingAssetId)
    && nonEmptyText(candidate.roomId)
    && nonEmptyText(candidate.packetBuildId)
    && nonEmptyText(candidate.segmentId)
    && (
      candidate.segmentIds === undefined
      || (Array.isArray(candidate.segmentIds)
        && candidate.segmentIds.length > 0
        && candidate.segmentIds.length <= 12
        && candidate.segmentIds.every(nonEmptyText)
        && candidate.segmentIds[0] === candidate.segmentId
        && new Set(candidate.segmentIds).size === candidate.segmentIds.length)
    )
    && (candidate.sourceText === undefined || nonEmptyText(candidate.sourceText))
    && (candidate.sourceTextSha256 === undefined
      || (typeof candidate.sourceTextSha256 === "string" && /^[a-f0-9]{64}$/.test(candidate.sourceTextSha256)))
    && (candidate.sourceSpan === undefined || candidate.sourceSpan === null || readTranscriptSourceSpan(candidate.sourceSpan) !== null)
    && (candidate.transcriptReviewStatus === undefined
      || candidate.transcriptReviewStatus === "provider"
      || candidate.transcriptReviewStatus === "human-reviewed")
    && (candidate.speakerLabel === null || typeof candidate.speakerLabel === "string")
    && typeof candidate.startSeconds === "number"
    && Number.isFinite(candidate.startSeconds)
    && typeof candidate.endSeconds === "number"
    && Number.isFinite(candidate.endSeconds)
    && typeof candidate.humanApprovalRequired === "boolean"
    && (candidate.committedActionItemId === null
      || nonEmptyText(candidate.committedActionItemId));
}

/**
 * Legacy builders wrote inferred candidates into OPEN ActionItem rows. Keep the
 * rows for audit history, but quarantine both known source names until an
 * explicit review receipt says the row is committed work.
 */
export function isUnreviewedTranscriptActionItemSource(value: unknown): boolean {
  const source = object(value);
  return isTranscriptPacketSource(source.source)
    && source.candidate === true
    && source.reviewDecision !== "ACCEPT";
}

type TranscriptPacketNote = {
  id?: string;
  kind?: string;
  sourceJson?: unknown;
  createdAt?: Date | string | number;
  updatedAt?: Date | string | number;
};

function packetText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function packetTime(value: unknown) {
  if (value instanceof Date) return value.getTime();
  if (typeof value !== "string" && typeof value !== "number") return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Select one summary and only highlights correlated to that packet build. */
export function selectLatestCorrelatedTranscriptPacketNotes<T extends TranscriptPacketNote>(notes: T[]) {
  const summaries = notes
    .filter((note) => note.kind === "SUMMARY")
    .sort((left, right) => {
      const createdDelta = packetTime(right.createdAt) - packetTime(left.createdAt);
      if (createdDelta !== 0) return createdDelta;
      const updatedDelta = packetTime(right.updatedAt) - packetTime(left.updatedAt);
      return updatedDelta !== 0
        ? updatedDelta
        : packetText(right.id).localeCompare(packetText(left.id));
    });
  const summary = summaries[0] ?? null;
  const packetBuildId = packetText(object(summary?.sourceJson).packetBuildId);
  const allHighlights = notes.filter((note) => note.kind === "HIGHLIGHT");
  const highlights = packetBuildId
    ? allHighlights.filter(
        (note) => packetText(object(note.sourceJson).packetBuildId) === packetBuildId,
      )
    : allHighlights;

  return {
    summary,
    highlights,
    packetBuildId: packetBuildId || null,
    correlationMode: packetBuildId
      ? "PACKET_BUILD_ID" as const
      : "LEGACY_TRANSCRIPT_FALLBACK" as const,
  };
}

export function readTranscriptActionCandidates(value: unknown): TranscriptActionCandidate[] {
  const source = object(value);
  if (!Array.isArray(source.actionCandidates)) return [];

  return source.actionCandidates.flatMap((candidate) => {
    if (isTranscriptActionCandidate(candidate)) return [candidate];
    const legacy = object(candidate);
    if (
      legacy.kind !== TRANSCRIPT_ACTION_CANDIDATE_KIND
      || !packetText(legacy.id)
      || !packetText(legacy.title)
      || !packetText(legacy.segmentId)
    ) return [];

    return [{
      id: packetText(legacy.id),
      kind: TRANSCRIPT_ACTION_CANDIDATE_KIND,
      reviewStatus: isTranscriptActionReviewStatus(legacy.reviewStatus)
        ? legacy.reviewStatus
        : "READY_FOR_HUMAN_REVIEW",
      title: packetText(legacy.title),
      detail: packetText(legacy.detail),
      transcriptJobId: packetText(legacy.transcriptJobId) || packetText(source.transcriptJobId),
      recordingAssetId: packetText(legacy.recordingAssetId) || packetText(source.recordingAssetId),
      roomId: packetText(legacy.roomId) || packetText(source.roomId),
      packetBuildId: packetText(legacy.packetBuildId) || packetText(source.packetBuildId),
      segmentId: packetText(legacy.segmentId),
      speakerLabel: packetText(legacy.speakerLabel) || null,
      startSeconds: typeof legacy.startSeconds === "number" ? legacy.startSeconds : 0,
      endSeconds: typeof legacy.endSeconds === "number" ? legacy.endSeconds : 0,
      humanApprovalRequired: typeof legacy.humanApprovalRequired === "boolean"
        ? legacy.humanApprovalRequired
        : true,
      committedActionItemId: packetText(legacy.committedActionItemId) || null,
    } satisfies TranscriptActionCandidate];
  });
}

type LegacyTranscriptActionItem = {
  id: string;
  roomId?: string | null;
  title?: string | null;
  detail?: string | null;
  sourceJson?: unknown;
};

function legacyTranscriptActionCandidate(item: LegacyTranscriptActionItem): TranscriptActionCandidate | null {
  if (!isUnreviewedTranscriptActionItemSource(item.sourceJson)) return null;
  const source = object(item.sourceJson);
  const transcriptJobId = packetText(source.transcriptJobId);
  const segmentId = packetText(source.segmentId) || String(item.id);
  return {
    id: `${TRANSCRIPT_ACTION_CANDIDATE_KIND}:${transcriptJobId || "legacy"}:${segmentId}`,
    kind: TRANSCRIPT_ACTION_CANDIDATE_KIND,
    reviewStatus: "READY_FOR_HUMAN_REVIEW",
    title: packetText(item.title) || "Review this follow-up",
    detail: packetText(item.detail),
    transcriptJobId,
    recordingAssetId: packetText(source.recordingAssetId),
    roomId: packetText(source.roomId) || packetText(item.roomId),
    packetBuildId: packetText(source.packetBuildId),
    segmentId,
    speakerLabel: packetText(source.speakerLabel) || null,
    startSeconds: typeof source.startSeconds === "number" ? source.startSeconds : 0,
    endSeconds: typeof source.endSeconds === "number" ? source.endSeconds : 0,
    humanApprovalRequired: true,
    committedActionItemId: null,
  };
}

/** Merge current packet candidates with quarantined legacy ActionItem rows. */
export function mergeTranscriptActionCandidates(input: {
  sourceJson: unknown;
  legacyActionItems?: LegacyTranscriptActionItem[];
}) {
  const candidates = readTranscriptActionCandidates(input.sourceJson);
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  for (const item of input.legacyActionItems ?? []) {
    const candidate = legacyTranscriptActionCandidate(item);
    if (candidate && !byId.has(candidate.id)) byId.set(candidate.id, candidate);
  }
  return Array.from(byId.values());
}

export type TranscriptReleaseGateReceiptInput = {
  processingDisposition: string | null;
  transcriptDisposition: string | null;
  immutableBindingMatches: boolean;
  holdReasonCode?: string | null;
  holdReason?: string | null;
  transcriptHoldReasonCode?: string | null;
  transcriptHoldReason?: string | null;
};

export type TranscriptReleaseGateProviderInput = {
  immutableProviderEvidenceVerified: boolean;
  roomEvidenceAvailable: boolean;
  currentAllPartySourceConsent: boolean;
  currentAllPartyTranscriptionConsent: boolean;
  immutableConsentBindingMatches: boolean;
  processingDisposition: string | null;
  transcriptDisposition: string | null;
};

/**
 * Adapters must derive this input from persisted evidence only. Provider keys,
 * environment configuration, and the media download are intentionally absent:
 * this gate must run before any provider use.
 */
export type TranscriptReleaseGateInput = {
  manifestProcessingDisposition?: string | null;
  manifestTranscriptDisposition?: string | null;
  manifestProcessingHoldReasonCode?: string | null;
  manifestProcessingHoldReason?: string | null;
  manifestTranscriptHoldReasonCode?: string | null;
  manifestTranscriptHoldReason?: string | null;
  normalizedFinalizationReceipts: readonly TranscriptReleaseGateReceiptInput[];
  trustedProvider: TranscriptReleaseGateProviderInput | null;
};

export type TranscriptReleaseGateDecision =
  | {
      allowed: true;
      evidenceKind: "NORMALIZED_FINALIZATION" | "TRUSTED_PROVIDER_CAPTURE";
    }
  | {
      allowed: false;
      evidenceKind: "HELD" | "MISSING" | "MISMATCHED";
      errorCode: string;
      error: string;
    };

/** Pure, fail-closed policy shared by transcript and packet builders. */
export function transcriptReleaseGate(
  input: TranscriptReleaseGateInput,
): TranscriptReleaseGateDecision {
  if (
    input.manifestProcessingDisposition === "HELD"
    || input.manifestProcessingDisposition === "preservation-only"
    || input.manifestTranscriptDisposition === "HELD"
  ) {
    return {
      allowed: false,
      evidenceKind: "HELD",
      errorCode:
        input.manifestTranscriptHoldReasonCode
        || input.manifestProcessingHoldReasonCode
        || "CAPTURE_TRANSCRIPT_EXPLICIT_RELEASE_REQUIRED",
      error:
        input.manifestTranscriptHoldReason
        || input.manifestProcessingHoldReason
        || "Transcript processing is held until explicit release.",
    };
  }

  const heldReceipt = input.normalizedFinalizationReceipts.find(
    (receipt) => (
      receipt.processingDisposition !== "RELEASED"
      || receipt.transcriptDisposition !== "RELEASED"
    ),
  );
  if (heldReceipt) {
    return {
      allowed: false,
      evidenceKind: "HELD",
      errorCode: heldReceipt.transcriptDisposition !== "RELEASED"
        ? heldReceipt.transcriptHoldReasonCode
          || "CAPTURE_TRANSCRIPT_EXPLICIT_RELEASE_REQUIRED"
        : heldReceipt.holdReasonCode || "CAPTURE_MEDIA_EXPLICIT_RELEASE_REQUIRED",
      error: heldReceipt.transcriptDisposition !== "RELEASED"
        ? heldReceipt.transcriptHoldReason
          || "Transcript processing awaits reviewed release."
        : heldReceipt.holdReason || "Capture media awaits reviewed release.",
    };
  }

  const mismatchedReceipt = input.normalizedFinalizationReceipts.find(
    (receipt) => !receipt.immutableBindingMatches,
  );
  if (mismatchedReceipt) {
    return {
      allowed: false,
      evidenceKind: "MISMATCHED",
      errorCode: "CAPTURE_IMMUTABLE_UPLOAD_BINDING_MISMATCH",
      error:
        "Transcript source media no longer matches the immutable upload evidence recorded at finalization.",
    };
  }
  if (input.normalizedFinalizationReceipts.length > 0) {
    return { allowed: true, evidenceKind: "NORMALIZED_FINALIZATION" };
  }

  const provider = input.trustedProvider;
  if (!provider?.immutableProviderEvidenceVerified) {
    return {
      allowed: false,
      evidenceKind: "MISSING",
      errorCode: "NORMALIZED_CAPTURE_RELEASE_REQUIRED",
      error:
        "This recording has no normalized release receipt or trusted provider consent binding.",
    };
  }
  if (!provider.roomEvidenceAvailable) {
    return {
      allowed: false,
      evidenceKind: "MISSING",
      errorCode: "PROVIDER_CAPTURE_ROOM_REQUIRED",
      error:
        "The provider recording room is unavailable, so current all-party consent cannot be verified.",
    };
  }
  if (
    !provider.currentAllPartySourceConsent
    || !provider.immutableConsentBindingMatches
    || provider.processingDisposition !== "RELEASED"
  ) {
    return {
      allowed: false,
      evidenceKind: "HELD",
      errorCode: "PROVIDER_ALL_PARTY_SOURCE_BINDING_REQUIRED",
      error:
        "Provider composite processing requires the unchanged all-party audio-and-video consent snapshot captured at egress start.",
    };
  }
  if (
    !provider.currentAllPartyTranscriptionConsent
    || provider.transcriptDisposition !== "RELEASED"
  ) {
    return {
      allowed: false,
      evidenceKind: "HELD",
      errorCode: "PROVIDER_ALL_PARTY_TRANSCRIPTION_RELEASE_REQUIRED",
      error:
        "Provider recording transcription requires separate current all-party transcription consent and an explicit provider transcript disposition.",
    };
  }
  return { allowed: true, evidenceKind: "TRUSTED_PROVIDER_CAPTURE" };
}
