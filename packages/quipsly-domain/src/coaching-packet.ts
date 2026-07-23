/**
 * Shared transcript-packet contract.
 *
 * A transcript may suggest work, but inference is never committed work. Both
 * Quipsly applications use this module to keep packet provenance, review state,
 * legacy quarantine, and the provider-processing release boundary identical.
 */

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
  speakerLabel: string | null;
  startSeconds: number;
  endSeconds: number;
  humanApprovalRequired: boolean;
  committedActionItemId: string | null;
}

export type TranscriptPacketBriefSegment = {
  id: string;
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
      segmentCount: segments.length,
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
