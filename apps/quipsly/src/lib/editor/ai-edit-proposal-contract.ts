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

export type AiEditSignalVisualization = {
  recordingAssetId: string;
  sourceSha256: string;
  storageGeneration: string | null;
  signalProfileSha256: string;
  algorithm: string;
  durationSeconds: number;
  nearSilenceDbfs: number;
  surroundingSignalDbfs: number;
  protectedPlayback: {
    sourceId: string;
    url: string;
    kind: "audio" | "video";
    label: string;
    durationSeconds: number | null;
  } | null;
  waveform: Array<{
    startSeconds: number;
    durationSeconds: number;
    rmsDbfs: number;
    samplePeakDbfs: number;
    clippedFrameCount: number;
  }>;
};

const SHA256 = /^[0-9a-f]{64}$/;

export function isAiEditSignalVisualization(value: unknown): value is AiEditSignalVisualization {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  const waveform = row.waveform;
  return typeof row.recordingAssetId === "string"
    && row.recordingAssetId.length > 0
    && typeof row.sourceSha256 === "string"
    && SHA256.test(row.sourceSha256)
    && (row.storageGeneration === null || typeof row.storageGeneration === "string")
    && typeof row.signalProfileSha256 === "string"
    && SHA256.test(row.signalProfileSha256)
    && typeof row.algorithm === "string"
    && row.algorithm.length > 0
    && typeof row.durationSeconds === "number"
    && Number.isFinite(row.durationSeconds)
    && row.durationSeconds > 0
    && typeof row.nearSilenceDbfs === "number"
    && Number.isFinite(row.nearSilenceDbfs)
    && typeof row.surroundingSignalDbfs === "number"
    && Number.isFinite(row.surroundingSignalDbfs)
    && (
      row.protectedPlayback === null
      || (
        typeof row.protectedPlayback === "object"
        && !Array.isArray(row.protectedPlayback)
        && typeof (row.protectedPlayback as Record<string, unknown>).sourceId === "string"
        && (row.protectedPlayback as Record<string, unknown>).sourceId !== ""
        && (row.protectedPlayback as Record<string, unknown>).url === `/api/ingest/media/${(row.protectedPlayback as Record<string, unknown>).sourceId}`
        && ["audio", "video"].includes(String((row.protectedPlayback as Record<string, unknown>).kind))
        && typeof (row.protectedPlayback as Record<string, unknown>).label === "string"
        && (
          (row.protectedPlayback as Record<string, unknown>).durationSeconds === null
          || (
            typeof (row.protectedPlayback as Record<string, unknown>).durationSeconds === "number"
            && Number.isFinite((row.protectedPlayback as Record<string, unknown>).durationSeconds)
          )
        )
      )
    )
    && Array.isArray(waveform)
    && waveform.length <= 360
    && waveform.every((point) => {
      if (!point || typeof point !== "object" || Array.isArray(point)) return false;
      const sample = point as Record<string, unknown>;
      return [sample.startSeconds, sample.durationSeconds, sample.rmsDbfs, sample.samplePeakDbfs, sample.clippedFrameCount]
        .every((entry) => typeof entry === "number" && Number.isFinite(entry))
        && (sample.startSeconds as number) >= 0
        && (sample.durationSeconds as number) > 0
        && (sample.clippedFrameCount as number) >= 0;
    });
}

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
      protectedPlaybackSourceId?: string;
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
