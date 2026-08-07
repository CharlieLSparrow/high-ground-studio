import type { AudioTranscriptEvidence } from "@/lib/transcript-evidence";
import type { EpisodeRenderProfileId } from "@high-ground/quipsly-media-processing";

export const PROGRAM_EDIT_VERSION = "quipsly-program-edit.v1" as const;

export const PROGRAM_DECISION_KINDS = [
  "primary",
  "secondary",
  "both",
  "skip",
  "primaryWithClip",
  "secondaryWithClip",
  "bothWithClip",
  "custom",
] as const;

export type ProgramDecisionKind = (typeof PROGRAM_DECISION_KINDS)[number];
export type EditActorType = "human" | "agent" | "import";
export type EditSourceRole = "primary" | "secondary" | "clip" | "audio" | "reference";

export type ProgramEditSource = {
  id: string;
  mediaAssetId?: string;
  sourceId?: string;
  recordingAssetId?: string;
  label: string;
  role: EditSourceRole;
  kind?: "audio" | "video" | "unknown";
  contentType?: string;
  sourceSha256?: string;
  storageGeneration?: string;
  playbackUrl?: string;
  proxyUrl?: string;
  offsetSeconds: number;
  sourceStartSeconds?: number;
  durationSeconds: number;
  syncStatus?: string;
};

export type ProgramDecision = {
  id: string;
  startTime: number;
  kind: ProgramDecisionKind;
  sourceLaneIDs: string[];
  clipLaneID?: string;
  clipMotion?: "playing" | "holdFrame";
  clipHoldSourceTime?: number;
  audioPolicy?: "hostMix" | "selectedSources" | "hostMixAndSelectedSources" | "silence";
  audioSourceLaneIDs?: string[];
  actor?: {
    userId?: string;
    email?: string;
    label?: string;
    type: EditActorType;
  };
  createdAt?: string;
  provenance?: {
    timestampPrecision: "exact" | "before-cutoff";
    createdBefore?: string;
  };
};

export type ProgramEditState = {
  version: typeof PROGRAM_EDIT_VERSION;
  durationSeconds: number;
  sources: ProgramEditSource[];
  /**
   * Fingerprint of the canonical Episode source projection used for this read.
   * Edit intent lives on the branch; synchronized source truth stays on the
   * Episode timeline and is projected into the branch instead of copied.
   */
  sourceProjectionFingerprint?: string;
  listenAudioUrl?: string;
  programDecisions: ProgramDecision[];
};

export type EpisodeDeskEpisode = {
  id: string;
  slug: string;
  title: string;
  status: string;
  updatedAt: string;
};

export type EpisodeDeskAnnotation = {
  id: string;
  startSeconds: number;
  endSeconds?: number | null;
  kind: string;
  title?: string | null;
  body?: string | null;
  hookKey?: string | null;
  tags: Array<{ id: string; slug: string; label: string }>;
  createdByEmail?: string | null;
  createdByActorType: string;
  createdAt: string;
};

export type EpisodeWatchDerivative = {
  id: string;
  assetId: string;
  name: string;
  kind: "audio" | "video";
  startSeconds: number;
  durationSeconds: number;
  sourceStartSeconds: number;
  sourceEndSeconds: number;
  color: string;
  episodeRoomSessionId: string;
  watchSegmentId: string;
  startReceiptId: string;
  endReceiptId: string;
  watchedAt: string;
  recordingRoomId?: string;
  recordingStartedAt?: string;
};

export type EpisodeEditTranscriptSegment = {
  id: string;
  startSeconds: number;
  endSeconds: number;
  timelineClock: "episode" | "source";
  sourceStartSeconds: number | null;
  sourceEndSeconds: number | null;
  text: string;
  speakerLabel: string | null;
  reviewStatus: "provider" | "human-reviewed" | "unknown";
  sourceTranscriptJobId: string | null;
  sourceSegmentId: string | null;
  acceptedReviewId: string | null;
  deactivated: boolean;
};

export type EpisodeEditTranscriptProjection = {
  status: "available" | "unavailable";
  reason: string;
  sourceFormat: string | null;
  segmentCount: number;
  reviewedSegmentCount: number;
  segments: EpisodeEditTranscriptSegment[];
};

export type EpisodeEditSignalInspection = {
  status: "available" | "unavailable" | "ambiguous" | "held";
  reason: string;
  candidateCount: number;
  evidence: null | {
    mediaAssetKind: "capture-recording" | "studio-media";
    mediaAssetId: string;
    sourceSha256: string;
    storageGeneration: string | null;
    signalProfileSha256: string;
    signal: NonNullable<AudioTranscriptEvidence["audio"]["signal"]>;
    protectedPlayback: {
      sourceId: string;
      url: string;
      kind: "audio" | "video";
      label: string;
      durationSeconds: number | null;
    } | null;
  };
};

export type EpisodeEditProcessingJob = {
  id: string;
  type: string;
  status: string;
  lane: "local-worker" | "cloud-worker" | "device" | "unassigned";
  provider: string | null;
  updatedAt: string;
  completedAt: string | null;
  error: string | null;
  manifestSha256: string | null;
  renderProfile: EpisodeRenderProfileId | null;
  branchRevision: number | null;
  proofStartSeconds: number | null;
  proofEndSeconds: number | null;
  playbackUrl: string | null;
};

export type EpisodeRenderExecutorPlan = {
  id: "browser" | "local-mac" | "cloud";
  label: string;
  status: "ready" | "offline" | "held" | "not-configured";
  canQueue: boolean;
  detail: string;
  costKind: "none" | "metered";
  costDetail: string;
  qualityDetail: string;
};

export type EpisodeRenderPlan = {
  schema: "quipsly-episode-render-plan-v1";
  branchRevision: number;
  renderProfile: EpisodeRenderProfileId;
  profileLabel: string;
  profileDescription: string;
  sequenceStartSeconds: number;
  sequenceEndSeconds: number;
  durationSeconds: number;
  output: {
    width: 1280;
    height: 720;
    fps: 24;
    videoCodec: "h264";
    audioCodec: "aac";
  };
  sources: {
    requiredCount: number;
    browserPlayableCount: number;
    exactLocalCount: number;
    totalBytes: number;
    labels: string[];
  };
  executors: EpisodeRenderExecutorPlan[];
  boundaries: {
    createsNoJob: true;
    sourceMediaRemainsImmutable: true;
    cloudUploadNotStarted: true;
    publicationNotStarted: true;
  };
};

export type EpisodeEditExecutionWorker = {
  id: string;
  label: string;
  executorKind: "local-mac" | "cloud" | "unknown";
  status: "online" | "stale" | "offline";
  buildId: string | null;
  lastHeartbeatAt: string | null;
  jobTypes: string[];
  renderProfiles: string[];
};

export type EpisodeEditMediaChoice = {
  id: string;
  label: string;
  kind: "audio" | "video" | "unknown";
  role: string | null;
  sourceId: string | null;
  recordingAssetId: string | null;
  captureGroupId: string | null;
};

export type EpisodeEditExecutionInspection = {
  browser: {
    status: "ready";
    detail: string;
  };
  native: {
    status: "observed" | "available-unobserved";
    detail: string;
  };
  workers: EpisodeEditExecutionWorker[];
  jobs: EpisodeEditProcessingJob[];
};

export type EpisodeEditDeskPayload = {
  inspectionFresh: boolean;
  projectId: string | null;
  projectSlug: string;
  timelineFingerprint: string | null;
  episodes: EpisodeDeskEpisode[];
  selectedEpisode: EpisodeDeskEpisode | null;
  baseline: null | {
    id: string;
    label: string;
    version: number;
    durationSeconds: number;
    sourceFingerprint?: string | null;
    syncSummary: Record<string, unknown>;
    importReceipt: Record<string, unknown>;
  };
  branch: null | {
    id: string;
    slug: string;
    name: string;
    headRevision: number;
    updatedAt: string;
  };
  state: ProgramEditState;
  watchDerivatives: EpisodeWatchDerivative[];
  annotations: EpisodeDeskAnnotation[];
  transcript: EpisodeEditTranscriptProjection;
  mediaChoices: EpisodeEditMediaChoice[];
  selectedMediaAssetId: string | null;
  signalInspection: EpisodeEditSignalInspection;
  executionInspection: EpisodeEditExecutionInspection;
  document: { id: string; title: string } | null;
  canEdit: boolean;
};

export const DECISION_SHORTCUTS: Array<{
  key: string;
  kind: ProgramDecisionKind;
  label: string;
}> = [
  { key: "1", kind: "primary", label: "Charlie" },
  { key: "2", kind: "secondary", label: "Homer" },
  { key: "3", kind: "both", label: "Both" },
  { key: "4", kind: "skip", label: "Skip" },
  { key: "5", kind: "primaryWithClip", label: "Charlie + Clip" },
  { key: "6", kind: "secondaryWithClip", label: "Homer + Clip" },
  { key: "7", kind: "bothWithClip", label: "Both + Clip" },
];

export function decisionAt(decisions: ProgramDecision[], time: number): ProgramDecision | null {
  let result: ProgramDecision | null = null;
  for (const decision of decisions) {
    if (decision.startTime <= time + 0.0001) result = decision;
    else break;
  }
  return result;
}

export function formatEditClock(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const frames = Math.floor((safe - Math.floor(safe)) * 30);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}:${String(frames).padStart(2, "0")}`;
}

export function sourceIDsForDecision(kind: ProgramDecisionKind, sources: ProgramEditSource[]): {
  sourceLaneIDs: string[];
  clipLaneID?: string;
} {
  const primary = sources.find((source) => source.role === "primary")?.id;
  const secondary = sources.find((source) => source.role === "secondary")?.id;
  // Imported participant cameras and other visual references are intentionally
  // projected as `reference` until a human assigns a host. The Clips monitor
  // already treats them as usable visual material, so clip-layout decisions
  // must resolve the same way instead of silently producing an audio-only cut.
  const clip = sources.find((source) => source.role === "clip")?.id
    ?? sources.find((source) => source.role === "reference")?.id;
  const hosts = [primary, secondary].filter((value): value is string => Boolean(value));
  if (kind === "skip") return { sourceLaneIDs: [] };
  if (kind === "primary") return { sourceLaneIDs: primary ? [primary] : hosts.slice(0, 1) };
  if (kind === "secondary") return { sourceLaneIDs: secondary ? [secondary] : hosts.slice(1, 2) };
  if (kind === "both") return { sourceLaneIDs: hosts };
  if (kind === "primaryWithClip") return { sourceLaneIDs: primary ? [primary] : hosts.slice(0, 1), clipLaneID: clip };
  if (kind === "secondaryWithClip") return { sourceLaneIDs: secondary ? [secondary] : hosts.slice(1, 2), clipLaneID: clip };
  if (kind === "bothWithClip") return { sourceLaneIDs: hosts, clipLaneID: clip };
  return { sourceLaneIDs: hosts };
}
