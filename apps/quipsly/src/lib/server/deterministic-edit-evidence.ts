import "server-only";

import { createHash } from "node:crypto";

import {
  canonicalAiEditTranscript,
  type AiEditProposal,
  type AiEditReviewCandidate,
  type AiEditTranscriptBlock,
} from "@/lib/editor/ai-edit-proposal-contract";

const EXPLICIT_RESTART = /\b(?:let me (?:restart|start (?:that|this) (?:again|over))|(?:i(?:'ll| will) )?start (?:that|this) over|scratch that|take that again|let me try that again)\b/i;
const MIN_GAP_SECONDS = 1.25;
const MAX_GAP_SECONDS = 30;

function sha256(blocks: AiEditTranscriptBlock[]) {
  return createHash("sha256").update(canonicalAiEditTranscript(blocks)).digest("hex");
}

function stableId(kind: string, blocks: AiEditTranscriptBlock[], startSeconds: number, endSeconds: number) {
  return createHash("sha256")
    .update(`${kind}\n${blocks.map((block) => block.id).join("\n")}\n${Math.round(startSeconds * 1_000)}\n${Math.round(endSeconds * 1_000)}`)
    .digest("hex")
    .slice(0, 24);
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

export function deterministicEditEvidence(blocks: AiEditTranscriptBlock[]): {
  proposals: AiEditProposal[];
  reviewCandidates: AiEditReviewCandidate[];
} {
  const ordered = [...blocks].sort((left, right) => left.time - right.time || left.id.localeCompare(right.id));
  const proposals: AiEditProposal[] = [];
  const reviewCandidates: AiEditReviewCandidate[] = [];

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
      reviewCandidates.push({
        candidateId: `candidate_${stableId("transcript-gap", evidenceBlocks, leftEnd, right.time)}`,
        kind: "transcript-timing-gap",
        sourceRange: { startSeconds: leftEnd, endSeconds: right.time },
        evidence: { blockIds: evidenceBlocks.map((block) => block.id), transcriptTextSha256: sha256(evidenceBlocks) },
        rationale: `The transcript has a ${gap.toFixed(2)} second timing gap. This is not proof of silence; listen and require decoded signal evidence before proposing a cut.`,
        confidence: "low",
        suggestedAction: "listen",
        requiresSignalEvidence: true,
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

  return { proposals, reviewCandidates };
}
