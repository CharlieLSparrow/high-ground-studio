import type { AudioEvidenceTranscriptWord } from "./AudioEvidenceMap";

export type SpectralEvidenceMarkerCategory = "signal" | "capture" | "mastery" | "treatment" | "edit";

export type SpectralEvidenceMarker = {
  id: string;
  category: SpectralEvidenceMarkerCategory;
  startSeconds: number;
  endSeconds: number;
  label: string;
  detail: string;
  severity: "attention" | "warning";
};

export type SpectralLoudnessPoint = {
  timeSeconds: number;
  momentaryLufs: number | null;
  shortTermLufs: number | null;
  integratedLufs: number | null;
  truePeakDbtp: number | null;
};

export type SpectralLoudnessEvidence = {
  integratedLufs: number;
  truePeakDbtp: number;
  targetLufs: number | null;
  points: SpectralLoudnessPoint[];
};

export type SpectralEditProposalBinding = {
  projectSlug: string;
  episodeSlug: string;
  signalEvidence?: {
    mediaAssetKind: "capture-recording" | "studio-media";
    mediaAssetId: string;
    sourceSha256: string;
    signalProfileSha256: string;
    protectedPlaybackSourceId?: string;
  };
};

export type SpectralEditProposalInput = {
  proposalId: string;
  type: string;
  sourceRange: { startSeconds: number; endSeconds: number };
  rationale: string;
  confidence: "low" | "medium" | "high";
  applied: false;
};

export type SpectralEditReviewCandidateInput = {
  candidateId: string;
  kind: string;
  sourceRange: { startSeconds: number; endSeconds: number };
  rationale: string;
  confidence: "low" | "medium" | "high";
  suggestedAction: string;
  changesSource: false;
};

export type SpectralOverlayMoment = {
  id: string;
  category: SpectralEvidenceMarkerCategory | "transcript";
  startSeconds: number;
  endSeconds: number;
  label: string;
  detail: string;
  severity: "attention" | "warning";
};

export type SpectralTranscriptSlice = {
  id: string;
  startSeconds: number;
  endSeconds: number;
  state: "unchecked" | "confirmed" | "corrected" | "attention";
  states: Array<"unchecked" | "confirmed" | "corrected" | "attention">;
  wordCount: number;
  label: string;
  minimumConfidence: number | null;
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validWord(word: AudioEvidenceTranscriptWord) {
  return Boolean(word.id)
    && finite(word.startSeconds)
    && finite(word.endSeconds)
    && word.startSeconds >= 0
    && word.endSeconds >= word.startSeconds;
}

function validMarker(marker: SpectralEvidenceMarker) {
  return Boolean(marker.id && marker.label)
    && finite(marker.startSeconds)
    && finite(marker.endSeconds)
    && marker.startSeconds >= 0
    && marker.endSeconds >= marker.startSeconds;
}

export function sourceBoundSpectralEditMarkers(input: {
  currentProjectSlug: string;
  currentEpisodeSlug: string;
  currentAssetId: string;
  currentSourceId: string;
  currentSourceSha256: string | null;
  bindingIsCurrent: boolean;
  binding: SpectralEditProposalBinding | null;
  proposals: SpectralEditProposalInput[];
  reviewCandidates: SpectralEditReviewCandidateInput[];
}): SpectralEvidenceMarker[] {
  const evidence = input.binding?.signalEvidence;
  if (
    !input.bindingIsCurrent
    || !input.binding
    || input.binding.projectSlug !== input.currentProjectSlug
    || input.binding.episodeSlug !== input.currentEpisodeSlug
    || evidence?.mediaAssetKind !== "studio-media"
    || evidence.mediaAssetId !== input.currentAssetId
    || (evidence.protectedPlaybackSourceId !== undefined && evidence.protectedPlaybackSourceId !== input.currentSourceId)
    || (input.currentSourceSha256 !== null && evidence.sourceSha256 !== input.currentSourceSha256)
  ) return [];

  const sourceFingerprint = `${evidence.sourceSha256.slice(0, 10)} · signal ${evidence.signalProfileSha256.slice(0, 10)}`;
  return [
    ...input.proposals.map((proposal): SpectralEvidenceMarker => ({
      id: `edit-proposal-${proposal.proposalId}`,
      category: "edit",
      startSeconds: proposal.sourceRange.startSeconds,
      endSeconds: proposal.sourceRange.endSeconds,
      label: `Unapplied edit proposal · ${proposal.type.replaceAll("_", " ")}`,
      detail: `${proposal.rationale} · ${proposal.confidence} confidence · Proposal only; source unchanged · ${sourceFingerprint}`,
      severity: "attention",
    })),
    ...input.reviewCandidates.map((candidate): SpectralEvidenceMarker => ({
      id: `edit-candidate-${candidate.candidateId}`,
      category: "edit",
      startSeconds: candidate.sourceRange.startSeconds,
      endSeconds: candidate.sourceRange.endSeconds,
      label: `Edit review candidate · ${candidate.kind.replaceAll("-", " ")}`,
      detail: `${candidate.rationale} · ${candidate.confidence} confidence · Suggested action: ${candidate.suggestedAction.replaceAll("-", " ")} · Source unchanged · ${sourceFingerprint}`,
      severity: "attention",
    })),
  ].filter(validMarker);
}

function wordState(word: AudioEvidenceTranscriptWord, lowConfidenceThreshold: number | null): SpectralTranscriptSlice["state"] {
  if (word.reviewState === "corrected") return "corrected";
  if (word.reviewState === "confirmed") return "confirmed";
  if (lowConfidenceThreshold !== null && word.confidence !== null && word.confidence < lowConfidenceThreshold) return "attention";
  return "unchecked";
}

const STATE_PRIORITY: Record<SpectralTranscriptSlice["state"], number> = {
  unchecked: 0,
  confirmed: 1,
  corrected: 2,
  attention: 3,
};

export function spectralTranscriptSlices(
  words: AudioEvidenceTranscriptWord[],
  startSeconds: number,
  endSeconds: number,
  lowConfidenceThreshold: number | null,
  maximumSlices = 360,
): SpectralTranscriptSlice[] {
  const start = finite(startSeconds) ? Math.max(0, startSeconds) : 0;
  const end = finite(endSeconds) ? Math.max(start + 0.001, endSeconds) : start + 0.001;
  const visible = words
    .filter(validWord)
    .filter((word) => word.startSeconds < end && word.endSeconds > start)
    .sort((left, right) => left.startSeconds - right.startSeconds || left.endSeconds - right.endSeconds || left.id.localeCompare(right.id));
  if (visible.length <= maximumSlices) return visible.map((word) => ({
    id: word.id,
    startSeconds: Math.max(start, word.startSeconds),
    endSeconds: Math.min(end, Math.max(word.endSeconds, word.startSeconds + 0.001)),
    state: wordState(word, lowConfidenceThreshold),
    states: [wordState(word, lowConfidenceThreshold)],
    wordCount: 1,
    label: word.text,
    minimumConfidence: word.confidence,
  }));

  const binCount = Math.max(1, Math.floor(maximumSlices));
  const span = end - start;
  const bins = new Map<number, AudioEvidenceTranscriptWord[]>();
  for (const word of visible) {
    const center = (Math.max(start, word.startSeconds) + Math.min(end, word.endSeconds)) / 2;
    const index = Math.min(binCount - 1, Math.max(0, Math.floor(((center - start) / span) * binCount)));
    const bucket = bins.get(index) ?? [];
    bucket.push(word);
    bins.set(index, bucket);
  }
  return [...bins.entries()].sort(([left], [right]) => left - right).map(([index, bucket]) => {
    const states = bucket.map((word) => wordState(word, lowConfidenceThreshold));
    const distinctStates = [...new Set(states)].sort((left, right) => STATE_PRIORITY[right] - STATE_PRIORITY[left]);
    const state = distinctStates[0] ?? "unchecked";
    const confidences = bucket.map((word) => word.confidence).filter((value): value is number => value !== null && finite(value));
    return {
      id: `transcript-bin-${index}-${bucket[0].id}`,
      startSeconds: Math.max(start, Math.min(...bucket.map((word) => word.startSeconds))),
      endSeconds: Math.min(end, Math.max(...bucket.map((word) => Math.max(word.endSeconds, word.startSeconds + 0.001)))),
      state,
      states: distinctStates,
      wordCount: bucket.length,
      label: bucket.length === 1 ? bucket[0].text : `${bucket.length} timed words`,
      minimumConfidence: confidences.length ? Math.min(...confidences) : null,
    };
  });
}

export function spectralOverlayMoments(
  markers: SpectralEvidenceMarker[],
  words: AudioEvidenceTranscriptWord[],
  lowConfidenceThreshold: number | null,
): SpectralOverlayMoment[] {
  const markerMoments = markers.filter(validMarker).map((marker) => ({ ...marker }));
  const wordsBySegment = new Map<string, AudioEvidenceTranscriptWord[]>();
  for (const word of words.filter(validWord)) {
    const segmentWords = wordsBySegment.get(word.segmentId) ?? [];
    segmentWords.push(word);
    wordsBySegment.set(word.segmentId, segmentWords);
  }
  const transcriptMoments = [...wordsBySegment.entries()].flatMap(([segmentId, segmentWords]) => {
    const sorted = segmentWords.sort((left, right) => left.startSeconds - right.startSeconds || left.id.localeCompare(right.id));
    const lowConfidenceWords = lowConfidenceThreshold === null ? [] : sorted.filter((word) => word.reviewState === "unchecked" && word.confidence !== null && word.confidence < lowConfidenceThreshold);
    if (lowConfidenceWords.length) return lowConfidenceWords.map((word): SpectralOverlayMoment => ({
      id: `transcript-${word.id}`,
      category: "transcript",
      startSeconds: word.startSeconds,
      endSeconds: word.endSeconds,
      label: `Check “${word.text}”`,
      detail: `Provider confidence ${Math.round((word.confidence as number) * 100)}%. Confidence prioritizes listening; it is not measured accuracy.`,
      severity: "attention",
    }));
    const first = sorted[0];
    const last = sorted.at(-1) as AudioEvidenceTranscriptWord;
    const reviewStates = [...new Set(sorted.map((word) => word.reviewState))];
    const excerpt = sorted.slice(0, 6).map((word) => word.text).join(" ");
    return [{
      id: `transcript-segment-${segmentId}`,
      category: "transcript" as const,
      startSeconds: first.startSeconds,
      endSeconds: last.endSeconds,
      label: `Transcript · ${excerpt}${sorted.length > 6 ? "…" : ""}`,
      detail: `Provider-timed segment · ${reviewStates.join(" and ")} review state. Select the exact word against playback before changing text or timing.`,
      severity: "attention" as const,
    }];
  });
  return [...markerMoments, ...transcriptMoments]
    .sort((left, right) => left.startSeconds - right.startSeconds || left.id.localeCompare(right.id))
    .slice(0, 5_000);
}

export function adjacentSpectralMoment(
  moments: SpectralOverlayMoment[],
  selectedSeconds: number,
  direction: "previous" | "next",
) {
  if (!moments.length) return null;
  if (direction === "next") return moments.find((moment) => moment.startSeconds > selectedSeconds + 0.001) ?? moments[0];
  return [...moments].reverse().find((moment) => moment.startSeconds < selectedSeconds - 0.001) ?? moments.at(-1) ?? null;
}

export function spectralEvidenceAtTime(
  markers: SpectralEvidenceMarker[],
  words: AudioEvidenceTranscriptWord[],
  selectedSeconds: number,
) {
  const word = words.filter(validWord).find((candidate) => selectedSeconds >= candidate.startSeconds && selectedSeconds < candidate.endSeconds) ?? null;
  const activeMarkers = markers.filter(validMarker).filter((marker) => selectedSeconds >= marker.startSeconds && selectedSeconds <= Math.max(marker.endSeconds, marker.startSeconds + 0.001));
  return { word, markers: activeMarkers };
}

export function nearestSpectralLoudnessPoint(points: SpectralLoudnessPoint[], selectedSeconds: number) {
  return points.filter((point) => finite(point.timeSeconds) && point.timeSeconds >= 0).reduce<SpectralLoudnessPoint | null>((nearest, point) => {
    if (!nearest) return point;
    return Math.abs(point.timeSeconds - selectedSeconds) < Math.abs(nearest.timeSeconds - selectedSeconds) ? point : nearest;
  }, null);
}
