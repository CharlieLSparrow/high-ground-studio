export const AI_EDIT_PROPOSAL_SET_KIND = "quipsly-ai-edit-proposal-set-v1" as const;
export const AI_EDIT_PROPOSAL_SET_VERSION = 1 as const;

export type AiEditTranscriptBlock = {
  id: string;
  time: number;
  duration: number;
  text: string;
  alert?: string | null;
  speaker?: string | null;
};

export type AiEditAudioSignalEvidence = {
  recordingAssetId: string;
  sourceSha256: string;
  storageGeneration: string | null;
  signalProfileSha256: string;
  algorithm: string;
  measuredStartSeconds: number;
  measuredEndSeconds: number;
  coverageFraction: number;
  maximumRmsDbfs: number;
  nearSilenceDbfs: number;
  surroundingSignalDbfs: number;
  classification: "measured-low-energy" | "measured-signal-present";
};

export type AiEditReviewCandidate = {
  candidateId: string;
  kind:
    | "retake-marker"
    | "repeated-language"
    | "transcript-timing-gap"
    | "signal-corroborated-gap"
    | "transcript-gap-with-signal"
    | "overlapping-speech"
    | "speaker-change";
  sourceRange: { startSeconds: number; endSeconds: number };
  evidence: {
    blockIds: string[];
    transcriptTextSha256: string;
    audioSignal?: AiEditAudioSignalEvidence;
  };
  rationale: string;
  confidence: "low" | "medium" | "high";
  suggestedAction: "listen" | "review-cut" | "review-camera";
  requiresSignalEvidence: boolean;
  changesSource: false;
};

export type AiEditProposal = {
  proposalId: string;
  type: "deactivate" | "deactivate_range" | "add_keyframe";
  sourceRange: { startSeconds: number; endSeconds: number };
  evidence: {
    blockIds: string[];
    transcriptTextSha256: string;
    audioSignal?: AiEditAudioSignalEvidence;
  };
  rationale: string;
  confidence: "low" | "medium" | "high";
  changesSource: false;
  applied: false;
  blockId?: string;
  timeOffset?: number;
  x?: number;
  y?: number;
  scale?: number;
};

export type AiEditProposalSet = {
  kind: typeof AI_EDIT_PROPOSAL_SET_KIND;
  version: typeof AI_EDIT_PROPOSAL_SET_VERSION;
  proposalSetId: string;
  createdAt: string;
  binding: {
    projectSlug: string;
    episodeSlug: string;
    timelineFingerprintSha256: string;
    transcriptSha256: string;
    blockCount: number;
    startSeconds: number;
    endSeconds: number;
    signalEvidence?: {
      recordingAssetId: string;
      sourceSha256: string;
      storageGeneration: string | null;
      signalProfileSha256: string;
    };
  };
  provider: {
    kind: "deterministic" | "google-gemini";
    model: string;
  };
  proposals: AiEditProposal[];
  reviewCandidates: AiEditReviewCandidate[];
  boundaries: {
    sourceMediaUnchanged: true;
    proposalsOnly: true;
    proofWatchBeforeApply: true;
    staleBindingRejectsApply: true;
    noAutomaticSaveRenderOrPublish: true;
  };
};

export function canonicalAiEditTranscript(blocks: AiEditTranscriptBlock[]) {
  return JSON.stringify(
    blocks
      .map((block) => ({
        id: block.id.trim(),
        timeMs: Math.round(block.time * 1_000),
        durationMs: Math.round(block.duration * 1_000),
        text: block.text.trim(),
        alert: block.alert?.trim() || null,
        speaker: block.speaker?.trim() || null,
      }))
      .sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id)),
  );
}
export function aiEditTranscriptBounds(blocks: AiEditTranscriptBlock[]) {
  if (!blocks.length) return { startSeconds: 0, endSeconds: 0 };
  return {
    startSeconds: Math.min(...blocks.map((block) => block.time)),
    endSeconds: Math.max(...blocks.map((block) => block.time + block.duration)),
  };
}
