export type SessionSourceClockAuthority =
  | "TRANSCRIPT_ATTEMPT"
  | "AUDIBLE_EVENT_DETECTOR"
  | "DIALOGUE_REPAIR"
  | "AUDIO_MASTERY"
  | "EDIT_PROPOSAL";

export type SessionSourceClockSource = {
  roomId: string;
  recordingAssetId: string | null;
  projectSlug: string;
  episodeSlug: string | null;
  mediaAssetId: string;
  sourceId: string;
  sourceUrl: string;
  sourceKind: "audio" | "video";
  durationSeconds: number;
  label: string;
};

export type SessionSourceClockDecisionTarget = {
  kind: "AUDIBLE_EVENT_REVIEW";
  analysisId: string;
  eventId: string;
  contextStartSeconds: number;
  contextEndSeconds: number;
};

type RangeEvidence = {
  id: string;
  source: SessionSourceClockSource;
  startSeconds: number;
  endSeconds: number;
};

export type SessionSourceClockAttentionInput = {
  transcript: Array<RangeEvidence & {
    segmentId: string;
    text: string;
    speakerLabel: string | null;
    providerConfidence: number | null;
    reviewState: "unreviewed" | "verified" | "corrected";
  }>;
  audibleEvents: Array<RangeEvidence & {
    analysisId: string;
    eventId: string;
    displayLabel: string;
    family: "dialogue" | "content" | "environment" | "capture";
    detectorConfidence: number;
    reviewState: "unreviewed" | "confirmed" | "false-positive" | "needs-comparison";
    detail: string;
  }>;
  dialogueRepairs: Array<RangeEvidence & {
    candidateId: string;
    label: string;
    reviewState: "unreviewed" | "confirmed" | "false-positive" | "needs-comparison";
  }>;
  mastery: Array<RangeEvidence & {
    jobId: string;
    kind: string;
    severity: "attention" | "warning";
    detail: string;
    reviewState: "unreviewed" | "approved" | "rejected";
  }>;
  edits: Array<RangeEvidence & {
    proposalSetId: string;
    subjectId: string;
    subjectKind: "proposal" | "candidate";
    editKind: string;
    rationale: string;
    heuristicConfidence: "low" | "medium" | "high";
    reviewState: "unreviewed" | "proof-listened" | "proof-watched" | "applied" | "dismissed";
  }>;
};

export type SessionSourceClockAttentionItem = {
  id: string;
  authority: SessionSourceClockAuthority;
  authorityLabel: string;
  severity: "HIGH" | "REVIEW";
  reviewState: string;
  source: SessionSourceClockSource;
  startSeconds: number;
  endSeconds: number;
  title: string;
  detail: string;
  boundary: string;
  rankReason: string;
  confidenceLabel: string | null;
  decisionTarget: SessionSourceClockDecisionTarget | null;
  transcriptHref: string | null;
  audioStudioHref: string | null;
  editorHref: string | null;
};

export type SessionSourceClockReviewMoment = {
  id: string;
  severity: "HIGH" | "REVIEW";
  source: SessionSourceClockSource;
  startSeconds: number;
  endSeconds: number;
  title: string;
  authorityLabels: string[];
  items: SessionSourceClockAttentionItem[];
  contextTruncated: boolean;
  estimatedReviewSeconds: number;
  separateReviewSeconds: number;
  sharedContextSavingsSeconds: number;
};

export type SessionSourceClockAttention = {
  items: SessionSourceClockAttentionItem[];
  moments: SessionSourceClockReviewMoment[];
  counts: {
    total: number;
    high: number;
    review: number;
    moments: number;
    estimatedReviewSeconds: number;
    separateReviewSeconds: number;
    sharedContextSavingsSeconds: number;
    byAuthority: Record<SessionSourceClockAuthority, number>;
  };
  boundaries: {
    projectionCreatesNoWorkflowState: true;
    authorityScoresAreNotMerged: true;
    detectorConfidenceIsNotAudibility: true;
    providerConfidenceIsNotAccuracy: true;
    editConfidenceIsNotCalibratedProbability: true;
    playbackRemainsRequired: true;
    clusteringDoesNotMergeAuthority: true;
    attentionBudgetIsDeterministicEstimate: true;
    downstreamComparisonsAreNotIncluded: true;
    truncatedContextRequiresAuthoritySurface: true;
  };
};

const AUTHORITY_LABEL: Record<SessionSourceClockAuthority, string> = {
  TRANSCRIPT_ATTEMPT: "Transcript attempt",
  AUDIBLE_EVENT_DETECTOR: "Audible-event detector",
  DIALOGUE_REPAIR: "Dialogue repair candidate",
  AUDIO_MASTERY: "Decoded mastering scan",
  EDIT_PROPOSAL: "Edit proposal",
};

const AUTHORITY_ORDER: Record<SessionSourceClockAuthority, number> = {
  DIALOGUE_REPAIR: 0,
  AUDIO_MASTERY: 1,
  AUDIBLE_EVENT_DETECTOR: 2,
  TRANSCRIPT_ATTEMPT: 3,
  EDIT_PROPOSAL: 4,
};

const REVIEW_CONTEXT_SECONDS = 2;
const REVIEW_DECISION_SECONDS = 6;
const ADDITIONAL_SIGNAL_SECONDS = 3;
const MAX_REVIEW_MOMENT_SECONDS = 25;
const NEARBY_SIGNAL_GAP_SECONDS = 1.5;

function validRange(item: RangeEvidence) {
  return Number.isFinite(item.startSeconds)
    && Number.isFinite(item.endSeconds)
    && Number.isFinite(item.source.durationSeconds)
    && item.source.durationSeconds > 0
    && item.startSeconds >= 0
    && item.endSeconds > item.startSeconds
    && item.endSeconds <= item.source.durationSeconds + 0.001
    && item.endSeconds <= 86_400;
}

function audioStudioHref(item: RangeEvidence) {
  if (!item.source.episodeSlug) return null;
  const query = new URLSearchParams({
    project: item.source.projectSlug,
    asset: item.source.mediaAssetId,
    at: item.startSeconds.toFixed(3),
    focus: item.id,
  });
  query.set("episode", item.source.episodeSlug);
  return `/audio?${query.toString()}#source-clock-heading`;
}

function editorHref(item: RangeEvidence) {
  if (!item.source.episodeSlug) return null;
  const query = new URLSearchParams({
    project: item.source.projectSlug,
    episode: item.source.episodeSlug,
    asset: item.source.mediaAssetId,
    at: item.startSeconds.toFixed(3),
    focus: item.id,
  });
  return `/editor?${query.toString()}#automated-edit-evidence`;
}

function transcriptHref(item: RangeEvidence & { segmentId?: string }) {
  return item.segmentId
    ? `/sessions/${encodeURIComponent(item.source.roomId)}?mode=transcript#transcript-segment-${encodeURIComponent(item.segmentId)}`
    : null;
}

function itemBase(item: RangeEvidence, authority: SessionSourceClockAuthority) {
  return {
    id: `${authority.toLowerCase()}:${item.id}`,
    authority,
    authorityLabel: AUTHORITY_LABEL[authority],
    source: item.source,
    startSeconds: item.startSeconds,
    endSeconds: item.endSeconds,
    decisionTarget: null,
    audioStudioHref: audioStudioHref(item),
  };
}

function sourceKey(source: SessionSourceClockSource) {
  return `${source.roomId}\u0000${source.mediaAssetId}\u0000${source.sourceId}`;
}

function paddedRange(item: SessionSourceClockAttentionItem) {
  const startSeconds = Math.max(0, item.startSeconds - REVIEW_CONTEXT_SECONDS);
  return {
    startSeconds,
    endSeconds: Math.min(item.source.durationSeconds, 86_400, item.endSeconds + REVIEW_CONTEXT_SECONDS, startSeconds + MAX_REVIEW_MOMENT_SECONDS),
  };
}

function buildReviewMoments(items: SessionSourceClockAttentionItem[]): SessionSourceClockReviewMoment[] {
  const rank = new Map(items.map((item, index) => [item.id, index]));
  const bySource = new Map<string, SessionSourceClockAttentionItem[]>();
  for (const item of items) {
    const key = sourceKey(item.source);
    const current = bySource.get(key) ?? [];
    current.push(item);
    bySource.set(key, current);
  }
  const moments: SessionSourceClockReviewMoment[] = [];
  for (const sourceItems of bySource.values()) {
    const chronological = [...sourceItems].sort((left, right) => left.startSeconds - right.startSeconds || left.endSeconds - right.endSeconds || left.id.localeCompare(right.id));
    const groups: Array<{ startSeconds: number; endSeconds: number; items: SessionSourceClockAttentionItem[] }> = [];
    for (const item of chronological) {
      const padded = paddedRange(item);
      const current = groups.at(-1);
      const mergedEnd = current ? Math.max(current.endSeconds, padded.endSeconds) : padded.endSeconds;
      if (current
        && padded.startSeconds <= current.endSeconds + NEARBY_SIGNAL_GAP_SECONDS
        && mergedEnd - current.startSeconds <= MAX_REVIEW_MOMENT_SECONDS) {
        current.endSeconds = mergedEnd;
        current.items.push(item);
      } else {
        groups.push({ startSeconds: padded.startSeconds, endSeconds: padded.endSeconds, items: [item] });
      }
    }
    for (const group of groups) {
      const orderedItems = [...group.items].sort((left, right) => (rank.get(left.id) ?? 0) - (rank.get(right.id) ?? 0));
      const separateReviewSeconds = orderedItems.reduce((total, item) => {
        const range = paddedRange(item);
        return total + Math.ceil(range.endSeconds - range.startSeconds + REVIEW_DECISION_SECONDS);
      }, 0);
      const estimatedReviewSeconds = Math.ceil(
        group.endSeconds - group.startSeconds
        + REVIEW_DECISION_SECONDS
        + Math.max(0, orderedItems.length - 1) * ADDITIONAL_SIGNAL_SECONDS,
      );
      const first = orderedItems[0]!;
      moments.push({
        id: `review-moment:${first.id}`,
        severity: orderedItems.some((item) => item.severity === "HIGH") ? "HIGH" : "REVIEW",
        source: first.source,
        startSeconds: group.startSeconds,
        endSeconds: group.endSeconds,
        title: orderedItems.length === 1 ? first.title : `${orderedItems.length} signals share one listening moment`,
        authorityLabels: [...new Set(orderedItems.map((item) => item.authorityLabel))],
        items: orderedItems,
        contextTruncated: orderedItems.some((item) => item.startSeconds < group.startSeconds || item.endSeconds > group.endSeconds),
        estimatedReviewSeconds,
        separateReviewSeconds,
        sharedContextSavingsSeconds: Math.max(0, separateReviewSeconds - estimatedReviewSeconds),
      });
    }
  }
  return moments.sort((left, right) => {
    const leftRank = Math.min(...left.items.map((item) => rank.get(item.id) ?? Number.MAX_SAFE_INTEGER));
    const rightRank = Math.min(...right.items.map((item) => rank.get(item.id) ?? Number.MAX_SAFE_INTEGER));
    return leftRank - rightRank || left.source.label.localeCompare(right.source.label) || left.startSeconds - right.startSeconds || left.id.localeCompare(right.id);
  });
}

export function buildSessionSourceClockAttention(input: SessionSourceClockAttentionInput): SessionSourceClockAttention {
  const items: SessionSourceClockAttentionItem[] = [];

  for (const segment of input.transcript) {
    if (!validRange(segment) || segment.reviewState !== "unreviewed") continue;
    const confidence = segment.providerConfidence;
    if (confidence !== null && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1 || confidence > 0.9)) continue;
    const severe = confidence !== null && confidence <= 0.72;
    items.push({
      ...itemBase(segment, "TRANSCRIPT_ATTEMPT"),
      severity: severe ? "HIGH" : "REVIEW",
      reviewState: "Playback not yet observed",
      title: segment.speakerLabel ? `${segment.speakerLabel}: transcript wording needs a listen` : "Transcript wording needs a listen",
      detail: segment.text,
      boundary: "Provider text and timing remain immutable evidence. A correction or confirmed-as-is receipt is a separate human decision.",
      rankReason: severe ? "Lower provider confidence and no playback review raise the chance of misleading downstream notes or edits." : "No playback review closes this exact provider segment.",
      confidenceLabel: confidence === null ? "Provider confidence unavailable" : `${Math.round(confidence * 100)}% provider confidence · not measured accuracy`,
      transcriptHref: transcriptHref(segment),
      editorHref: null,
    });
  }

  for (const event of input.audibleEvents) {
    if (!validRange(event) || event.reviewState === "false-positive") continue;
    const severe = event.family === "capture" || event.reviewState === "needs-comparison";
    items.push({
      ...itemBase(event, "AUDIBLE_EVENT_DETECTOR"),
      severity: severe ? "HIGH" : "REVIEW",
      reviewState: event.reviewState === "unreviewed" ? "Listening decision missing" : event.reviewState.replaceAll("-", " "),
      title: `${event.displayLabel} at ${event.startSeconds.toFixed(2)}s`,
      detail: event.detail,
      boundary: "The Apple classifier can prioritize listening only. It does not prove audibility and cannot authorize repair, a cut, or mastering.",
      rankReason: severe ? "The candidate may indicate capture integrity risk or still needs a source comparison." : "A detector suggestion remains unresolved by human listening.",
      confidenceLabel: `${Math.round(event.detectorConfidence * 100)}% detector score · not audibility`,
      decisionTarget: {
        kind: "AUDIBLE_EVENT_REVIEW",
        analysisId: event.analysisId,
        eventId: event.eventId,
        contextStartSeconds: Math.max(0, event.startSeconds - 1),
        contextEndSeconds: Math.min(event.source.durationSeconds, event.endSeconds + 1),
      },
      transcriptHref: null,
      editorHref: event.source.episodeSlug ? editorHref(event) : null,
    });
  }

  for (const candidate of input.dialogueRepairs) {
    if (!validRange(candidate) || candidate.reviewState === "false-positive") continue;
    const confirmed = candidate.reviewState === "confirmed";
    items.push({
      ...itemBase(candidate, "DIALOGUE_REPAIR"),
      severity: confirmed ? "REVIEW" : "HIGH",
      reviewState: candidate.reviewState === "unreviewed" ? "Listening decision missing" : candidate.reviewState.replaceAll("-", " "),
      title: `${candidate.label.replaceAll("-", " ")} repair candidate`,
      detail: confirmed ? "A human confirmed the audible event; any treatment remains a separate, versioned experiment." : "Listen in context before confirming, dismissing, or requesting a comparison.",
      boundary: "The candidate never changes original media. Confirmation authorizes an experiment only, not replacement, promotion, or publication.",
      rankReason: confirmed ? "A confirmed event is ready for a reversible comparison experiment." : "An unreviewed repair candidate could hide a real dialogue defect or waste treatment effort.",
      confidenceLabel: null,
      transcriptHref: null,
      editorHref: candidate.source.episodeSlug ? editorHref(candidate) : null,
    });
  }

  for (const observation of input.mastery) {
    if (!validRange(observation) || observation.reviewState === "approved") continue;
    const severe = observation.severity === "warning" || observation.reviewState === "rejected";
    items.push({
      ...itemBase(observation, "AUDIO_MASTERY"),
      severity: severe ? "HIGH" : "REVIEW",
      reviewState: observation.reviewState === "unreviewed" ? "Mastering audition incomplete" : "Mastering preview rejected",
      title: observation.kind.replaceAll("-", " "),
      detail: observation.detail,
      boundary: "Decoded statistics locate evidence; they are not a listening judgment. Approval requires matched source/preview audition and does not replace the source.",
      rankReason: severe ? "A warning or rejected preview can affect intelligibility or delivery quality." : "The decoded observation still needs source/preview listening.",
      confidenceLabel: null,
      transcriptHref: null,
      editorHref: observation.source.episodeSlug ? editorHref(observation) : null,
    });
  }

  for (const edit of input.edits) {
    if (!validRange(edit) || edit.reviewState === "dismissed" || edit.reviewState === "applied") continue;
    const proofObserved = edit.reviewState === "proof-listened" || edit.reviewState === "proof-watched";
    items.push({
      ...itemBase(edit, "EDIT_PROPOSAL"),
      severity: edit.heuristicConfidence === "high" && !proofObserved ? "HIGH" : "REVIEW",
      reviewState: proofObserved ? `${edit.reviewState.replaceAll("-", " ")} · decision still open` : "Proof review missing",
      title: edit.editKind.replaceAll("-", " "),
      detail: edit.rationale,
      boundary: "Heuristic confidence ranks review effort; it is not a calibrated probability. The proposal changes no source and cannot save, render, or publish itself.",
      rankReason: proofObserved ? "The source was reviewed, but the explicit edit decision remains open." : "An exact-range editorial suggestion still needs proof listening or watching.",
      confidenceLabel: `${edit.heuristicConfidence} heuristic confidence · not a probability`,
      transcriptHref: null,
      editorHref: editorHref(edit),
    });
  }

  const severityOrder = { HIGH: 0, REVIEW: 1 } as const;
  items.sort((left, right) =>
    severityOrder[left.severity] - severityOrder[right.severity]
    || AUTHORITY_ORDER[left.authority] - AUTHORITY_ORDER[right.authority]
    || left.source.label.localeCompare(right.source.label)
    || left.startSeconds - right.startSeconds
    || left.id.localeCompare(right.id));
  const retainedPerAuthority = new Map<SessionSourceClockAuthority, number>();
  const bounded = items.filter((item) => {
    const count = retainedPerAuthority.get(item.authority) ?? 0;
    if (count >= 20) return false;
    retainedPerAuthority.set(item.authority, count + 1);
    return true;
  }).slice(0, 100);
  const byAuthority = Object.fromEntries(Object.keys(AUTHORITY_LABEL).map((authority) => [authority, 0])) as Record<SessionSourceClockAuthority, number>;
  for (const item of bounded) byAuthority[item.authority] += 1;
  const moments = buildReviewMoments(bounded);
  const estimatedReviewSeconds = moments.reduce((total, moment) => total + moment.estimatedReviewSeconds, 0);
  const separateReviewSeconds = moments.reduce((total, moment) => total + moment.separateReviewSeconds, 0);
  return {
    items: bounded,
    moments,
    counts: {
      total: bounded.length,
      high: bounded.filter((item) => item.severity === "HIGH").length,
      review: bounded.filter((item) => item.severity === "REVIEW").length,
      moments: moments.length,
      estimatedReviewSeconds,
      separateReviewSeconds,
      sharedContextSavingsSeconds: Math.max(0, separateReviewSeconds - estimatedReviewSeconds),
      byAuthority,
    },
    boundaries: {
      projectionCreatesNoWorkflowState: true,
      authorityScoresAreNotMerged: true,
      detectorConfidenceIsNotAudibility: true,
      providerConfidenceIsNotAccuracy: true,
      editConfidenceIsNotCalibratedProbability: true,
      playbackRemainsRequired: true,
      clusteringDoesNotMergeAuthority: true,
      attentionBudgetIsDeterministicEstimate: true,
      downstreamComparisonsAreNotIncluded: true,
      truncatedContextRequiresAuthoritySurface: true,
    },
  };
}
