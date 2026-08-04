import "server-only";

import { createHash } from "node:crypto";

import {
  canonicalAiEditTranscript,
  type AiEditAudioSignalEvidence,
  type AiEditProposal,
  type AiEditReviewCandidate,
  type AiEditTranscriptBlock,
} from "@/lib/editor/ai-edit-proposal-contract";
import type { BoundEpisodeAudioSignalEvidence } from "@/lib/server/episode-edit-signal-evidence";

const EXPLICIT_RESTART = /\b(?:let me (?:restart|start (?:that|this) (?:again|over))|(?:i(?:'ll| will) )?start (?:that|this) over|scratch that|take that again|let me try that again)\b/i;
const MIN_GAP_SECONDS = 1.25;
const MAX_GAP_SECONDS = 30;
const MIN_SIGNAL_COVERAGE = 0.85;
const MAX_PROPOSALS = 100;
const MAX_REVIEW_CANDIDATES = 250;

function sha256(blocks: AiEditTranscriptBlock[]) {
  return createHash("sha256").update(canonicalAiEditTranscript(blocks)).digest("hex");
}

function stableId(kind: string, blocks: AiEditTranscriptBlock[], startSeconds: number, endSeconds: number, salt = "") {
  return createHash("sha256")
    .update(`${kind}\n${blocks.map((block) => block.id).join("\n")}\n${Math.round(startSeconds * 1_000)}\n${Math.round(endSeconds * 1_000)}\n${salt}`)
    .digest("hex")
    .slice(0, 24);
}

function speaker(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase("en-US") || null;
}

function measuredSignalRange(
  evidence: BoundEpisodeAudioSignalEvidence,
  startSeconds: number,
  endSeconds: number,
): AiEditAudioSignalEvidence | null {
  const duration = endSeconds - startSeconds;
  if (!(duration > 0)) return null;
  const overlaps = evidence.signal.waveform
    .map((point) => ({
      start: Math.max(startSeconds, point.startSeconds),
      end: Math.min(endSeconds, point.startSeconds + point.durationSeconds),
      rmsDbfs: point.rmsDbfs,
    }))
    .filter((point) => point.end > point.start)
    .sort((left, right) => left.start - right.start);
  if (!overlaps.length) return null;

  let coveredSeconds = 0;
  let cursor = startSeconds;
  for (const point of overlaps) {
    const uncoveredStart = Math.max(cursor, point.start);
    if (point.end > uncoveredStart) coveredSeconds += point.end - uncoveredStart;
    cursor = Math.max(cursor, point.end);
  }
  const coverageFraction = Math.min(1, coveredSeconds / duration);
  if (coverageFraction < MIN_SIGNAL_COVERAGE) return null;

  const maximumRmsDbfs = Math.max(...overlaps.map((point) => point.rmsDbfs));
  const nearSilenceDbfs = evidence.signal.thresholds.nearSilenceDbfs;
  const surroundingSignalDbfs = evidence.signal.thresholds.surroundingSignalDbfs;
  const classification = maximumRmsDbfs <= nearSilenceDbfs
    ? "measured-low-energy" as const
    : maximumRmsDbfs >= surroundingSignalDbfs
      ? "measured-signal-present" as const
      : null;
  if (!classification) return null;

  return {
    mediaAssetKind: evidence.mediaAssetKind,
    mediaAssetId: evidence.mediaAssetId,
    sourceSha256: evidence.sourceSha256,
    storageGeneration: evidence.storageGeneration,
    signalProfileSha256: evidence.signalProfileSha256,
    algorithm: evidence.signal.algorithm,
    measuredStartSeconds: overlaps[0]!.start,
    measuredEndSeconds: overlaps[overlaps.length - 1]!.end,
    coverageFraction: Math.round(coverageFraction * 10_000) / 10_000,
    maximumRmsDbfs,
    nearSilenceDbfs,
    surroundingSignalDbfs,
    classification,
  };
}

function normalizedWords(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}' ]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function repeatedLanguage(left: AiEditTranscriptBlock, right: AiEditTranscriptBlock) {
  const leftWords = normalizedWords(left.text);
  const rightWords = normalizedWords(right.text);
  if (leftWords.length < 4 || rightWords.length < 4) return false;
  const shorterLength = Math.min(leftWords.length, rightWords.length, 12);
  const leftOpening = leftWords.slice(0, shorterLength).join(" ");
  const rightOpening = rightWords.slice(0, shorterLength).join(" ");
  return leftOpening === rightOpening;
}

export function deterministicEditEvidence(
  blocks: AiEditTranscriptBlock[],
  options: { audioSignal?: BoundEpisodeAudioSignalEvidence | null } = {},
): {
  proposals: AiEditProposal[];
  reviewCandidates: AiEditReviewCandidate[];
} {
  const ordered = [...blocks].sort((left, right) => left.time - right.time || left.id.localeCompare(right.id));
  const proposals: AiEditProposal[] = [];
  const reviewCandidates: AiEditReviewCandidate[] = [];

  if (options.audioSignal) {
    for (const observation of options.audioSignal.signal.observations ?? []) {
      const durationSeconds = options.audioSignal.signal.durationSeconds;
      const startSeconds = Math.max(0, Math.min(Math.max(0, durationSeconds - 0.001), observation.startSeconds));
      const endSeconds = Math.min(durationSeconds, Math.max(startSeconds + 0.001, observation.endSeconds));
      const evidenceBlocks = ordered.filter((block) => block.time < endSeconds && block.time + block.duration > startSeconds);
      reviewCandidates.push({
        candidateId: `candidate_${stableId("signal-attention", evidenceBlocks, startSeconds, endSeconds, `${options.audioSignal.signalProfileSha256}:${observation.kind}`)}`,
        kind: "signal-attention",
        sourceRange: { startSeconds, endSeconds },
        evidence: {
          blockIds: evidenceBlocks.map((block) => block.id),
          transcriptTextSha256: sha256(evidenceBlocks),
          audioObservation: {
            mediaAssetKind: options.audioSignal.mediaAssetKind,
            mediaAssetId: options.audioSignal.mediaAssetId,
            sourceSha256: options.audioSignal.sourceSha256,
            storageGeneration: options.audioSignal.storageGeneration,
            signalProfileSha256: options.audioSignal.signalProfileSha256,
            algorithm: options.audioSignal.signal.algorithm,
            kind: observation.kind,
            severity: observation.severity,
            startSeconds,
            endSeconds,
            detail: observation.detail,
          },
        },
        rationale: `${observation.detail} This deterministic signal observation requires playback review and does not authorize repair, removal, or a cut.`,
        confidence: observation.severity === "warning" ? "high" : "medium",
        suggestedAction: "listen",
        requiresSignalEvidence: false,
        changesSource: false,
      });
    }
  }

  for (const block of ordered) {
    const startSeconds = block.time;
    const endSeconds = block.time + block.duration;
    const evidence = { blockIds: [block.id], transcriptTextSha256: sha256([block]) };

    if (EXPLICIT_RESTART.test(block.text)) {
      proposals.push({
        proposalId: `deterministic_${stableId("explicit-restart", [block], startSeconds, endSeconds)}`,
        type: "deactivate",
        blockId: block.id,
        sourceRange: { startSeconds, endSeconds },
        evidence,
        rationale: "The transcript contains an explicit restart instruction. Review the complete source block before deciding whether to cut it.",
        confidence: "high",
        changesSource: false,
        applied: false,
      });
    }

    if (block.alert?.trim().toLowerCase() === "retake") {
      reviewCandidates.push({
        candidateId: `candidate_${stableId("retake-marker", [block], startSeconds, endSeconds)}`,
        kind: "retake-marker",
        sourceRange: { startSeconds, endSeconds },
        evidence,
        rationale: "A recording-time retake marker overlaps this source interval. Listen before choosing the preferred take.",
        confidence: "high",
        suggestedAction: "review-cut",
        requiresSignalEvidence: false,
        changesSource: false,
      });
    }
  }

  for (let index = 0; index < ordered.length - 1; index += 1) {
    const left = ordered[index]!;
    const right = ordered[index + 1]!;
    const leftEnd = left.time + left.duration;
    const gap = right.time - leftEnd;

    if (gap >= MIN_GAP_SECONDS && gap <= MAX_GAP_SECONDS) {
      const evidenceBlocks = [left, right];
      const audioSignal = options.audioSignal
        ? measuredSignalRange(options.audioSignal, leftEnd, right.time)
        : null;
      const baseEvidence = { blockIds: evidenceBlocks.map((block) => block.id), transcriptTextSha256: sha256(evidenceBlocks) };
      if (audioSignal?.classification === "measured-low-energy") {
        proposals.push({
          proposalId: `deterministic_${stableId("signal-corroborated-range", evidenceBlocks, leftEnd, right.time, audioSignal.signalProfileSha256)}`,
          type: "deactivate_range",
          sourceRange: { startSeconds: leftEnd, endSeconds: right.time },
          evidence: { ...baseEvidence, audioSignal },
          rationale: `Decoded audio covers ${(audioSignal.coverageFraction * 100).toFixed(0)}% of this ${gap.toFixed(2)} second transcript gap. Its strongest RMS window is ${audioSignal.maximumRmsDbfs.toFixed(1)} dBFS, at or below the ${audioSignal.nearSilenceDbfs.toFixed(1)} dBFS near-silence threshold. Review the untouched interval before applying this reversible range skip.`,
          confidence: "medium",
          changesSource: false,
          applied: false,
        });
      } else if (audioSignal?.classification === "measured-signal-present") {
        reviewCandidates.push({
          candidateId: `candidate_${stableId("transcript-gap-with-signal", evidenceBlocks, leftEnd, right.time, audioSignal.signalProfileSha256)}`,
          kind: "transcript-gap-with-signal",
          sourceRange: { startSeconds: leftEnd, endSeconds: right.time },
          evidence: { ...baseEvidence, audioSignal },
          rationale: `Decoded audio covers ${(audioSignal.coverageFraction * 100).toFixed(0)}% of this ${gap.toFixed(2)} second transcript gap and reaches ${audioSignal.maximumRmsDbfs.toFixed(1)} dBFS, above the ${audioSignal.surroundingSignalDbfs.toFixed(1)} dBFS signal threshold. Listen for untranscribed speech or intentional sound before editing.`,
          confidence: "high",
          suggestedAction: "listen",
          requiresSignalEvidence: false,
          changesSource: false,
        });
      } else {
        reviewCandidates.push({
          candidateId: `candidate_${stableId("transcript-gap", evidenceBlocks, leftEnd, right.time)}`,
          kind: "transcript-timing-gap",
          sourceRange: { startSeconds: leftEnd, endSeconds: right.time },
          evidence: baseEvidence,
          rationale: `The transcript has a ${gap.toFixed(2)} second timing gap. This is not proof of silence; listen and require decoded signal evidence before proposing a cut.`,
          confidence: "low",
          suggestedAction: "listen",
          requiresSignalEvidence: true,
          changesSource: false,
        });
      }
    }

    const overlapStart = right.time;
    const overlapEnd = leftEnd;
    if (overlapEnd - overlapStart >= 0.15) {
      const evidenceBlocks = [left, right];
      reviewCandidates.push({
        candidateId: `candidate_${stableId("overlapping-speech", evidenceBlocks, overlapStart, overlapEnd)}`,
        kind: "overlapping-speech",
        sourceRange: { startSeconds: overlapStart, endSeconds: overlapEnd },
        evidence: { blockIds: evidenceBlocks.map((block) => block.id), transcriptTextSha256: sha256(evidenceBlocks) },
        rationale: `Canonical transcript timing overlaps by ${(overlapEnd - overlapStart).toFixed(2)} seconds. Listen before changing dialogue timing or choosing a camera.`,
        confidence: "high",
        suggestedAction: "listen",
        requiresSignalEvidence: false,
        changesSource: false,
      });
    }

    const leftSpeaker = speaker(left.speaker);
    const rightSpeaker = speaker(right.speaker);
    if (leftSpeaker && rightSpeaker && leftSpeaker !== rightSpeaker) {
      const transition = Math.max(left.time, right.time);
      const startSeconds = Math.max(left.time, transition - 0.75);
      const endSeconds = Math.min(right.time + right.duration, transition + 0.75);
      const evidenceBlocks = [left, right];
      reviewCandidates.push({
        candidateId: `candidate_${stableId("speaker-change", evidenceBlocks, startSeconds, endSeconds)}`,
        kind: "speaker-change",
        sourceRange: { startSeconds, endSeconds },
        evidence: { blockIds: evidenceBlocks.map((block) => block.id), transcriptTextSha256: sha256(evidenceBlocks) },
        rationale: `Canonical speaker timing changes from ${left.speaker!.trim()} to ${right.speaker!.trim()}. Review the transition before proposing a multicamera switch.`,
        confidence: "high",
        suggestedAction: "review-camera",
        requiresSignalEvidence: false,
        changesSource: false,
      });
    }

    if (repeatedLanguage(left, right)) {
      const evidenceBlocks = [left, right];
      reviewCandidates.push({
        candidateId: `candidate_${stableId("repeated-language", evidenceBlocks, left.time, right.time + right.duration)}`,
        kind: "repeated-language",
        sourceRange: { startSeconds: left.time, endSeconds: right.time + right.duration },
        evidence: { blockIds: evidenceBlocks.map((block) => block.id), transcriptTextSha256: sha256(evidenceBlocks) },
        rationale: "Adjacent transcript blocks begin with the same four or more words. This may be a retake or intentional repetition; compare both against playback.",
        confidence: "medium",
        suggestedAction: "review-cut",
        requiresSignalEvidence: false,
        changesSource: false,
      });
    }
  }

  return {
    proposals: proposals.slice(0, MAX_PROPOSALS),
    reviewCandidates: reviewCandidates.slice(0, MAX_REVIEW_CANDIDATES),
  };
}
