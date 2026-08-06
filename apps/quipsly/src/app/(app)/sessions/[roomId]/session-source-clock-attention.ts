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
  label: string;
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
  transcriptHref: string | null;
  audioStudioHref: string | null;
  editorHref: string | null;
};

export type SessionSourceClockAttention = {
  items: SessionSourceClockAttentionItem[];
  counts: {
    total: number;
    high: number;
    review: number;
    byAuthority: Record<SessionSourceClockAuthority, number>;
  };
  boundaries: {
    projectionCreatesNoWorkflowState: true;
    authorityScoresAreNotMerged: true;
    detectorConfidenceIsNotAudibility: true;
    providerConfidenceIsNotAccuracy: true;
    editConfidenceIsNotCalibratedProbability: true;
    playbackRemainsRequired: true;
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

function validRange(item: RangeEvidence) {
  return Number.isFinite(item.startSeconds)
    && Number.isFinite(item.endSeconds)
    && item.startSeconds >= 0
    && item.endSeconds > item.startSeconds
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
    audioStudioHref: audioStudioHref(item),
  };
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
  return {
    items: bounded,
    counts: {
      total: bounded.length,
      high: bounded.filter((item) => item.severity === "HIGH").length,
      review: bounded.filter((item) => item.severity === "REVIEW").length,
      byAuthority,
    },
    boundaries: {
      projectionCreatesNoWorkflowState: true,
      authorityScoresAreNotMerged: true,
      detectorConfidenceIsNotAudibility: true,
      providerConfidenceIsNotAccuracy: true,
      editConfidenceIsNotCalibratedProbability: true,
      playbackRemainsRequired: true,
    },
  };
}
