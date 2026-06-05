export type EpisodeArtifactTimelineClip = {
  id: string;
  assetId: string;
  trackId: string;
  startIn: number;
  duration: number;
  sourceStart: number;
  sourceEnd?: number;
  name: string;
  color: string;
  kind?: "audio" | "video";
};

export type EpisodeArtifactTranscript = {
  id: string;
  time: number;
  duration: number;
  text: string;
  deleted: boolean;
  alert: string | null;
};

export type EpisodeArtifactPaperEditSnapshot = {
  clips: EpisodeArtifactTimelineClip[];
  transcript: EpisodeArtifactTranscript[];
  createdAt?: string;
  label?: string;
};

export type EpisodeImportedMediaAsset = {
  id: string;
  sourceId: string;
  projectSlug: string;
  episodeSlug: string;
  originalName: string;
  contentType: string;
  size: number;
  kind: "audio" | "video" | "unknown";
  bucketName: string;
  objectName: string;
  gcsUri: string;
  playbackUrl: string;
  importedAt: string;
  source: "editor-import" | "recorder-upload" | "field-kit" | (string & {});
  importRole?: string;
  sync: {
    status: "ready-to-sync" | "synced" | "held";
    anchorTimelineSeconds?: number;
    targetClipId?: string;
    suggestedRole?: string;
    suggestedTrackId?: string;
    suggestionReason?: string;
    suggestionConfidence?: number;
    suggestionAppliedAt?: string;
    suggestionSource?: string;
    note?: string;
    source?: string;
    syncedAt?: string;
  };
  proxy: {
    status: "queued" | "ready" | "not-required" | "failed" | "external-preview";
    proxyUrl?: string;
    note?: string;
  };
};

import { DEFAULT_PROJECT_SLUG } from "@/lib/studio/project-registry";

export const EPISODE_ARTIFACT_CURRENT_VERSION = 2;
export const EPISODE_ARTIFACT_PREVIOUS_VERSION = 1;

export type EpisodeArtifactSource = "quipsly-editor" | "quipsly-recorder" | "editor-import" | "api-import" | (string & {});

export type EpisodeArtifactPayload = {
  payloadVersion: number;
  projectSlug: string;
  episodeSlug: string;
  source: EpisodeArtifactSource;
  timelineClips: EpisodeArtifactTimelineClip[];
  transcript: EpisodeArtifactTranscript[];
  paperEditSnapshots?: Record<string, EpisodeArtifactPaperEditSnapshot>;
  importedMedia?: EpisodeImportedMediaAsset[];
  contentFingerprint?: string;
  generatedFrom: string;
  savedAt: string;
  generatedAt?: string;
};

export type EpisodeArtifactLegacyInput = {
  payloadVersion?: number;
  // old key variants from early recorder/editor saves
  project?: string;
  episode?: string;
  timeline?: { timelineClips?: EpisodeArtifactTimelineClip[]; transcript?: EpisodeArtifactTranscript[] };
  room?: {
    project?: string;
    episode?: string;
    tracks?: unknown[];
  };
  version?: string;
  data?: {
    timelineClips?: EpisodeArtifactTimelineClip[];
    transcript?: EpisodeArtifactTranscript[];
  };
  savedAt?: string;
  [key: string]: unknown;
};

export type EpisodeArtifactShape = EpisodeArtifactPayload | EpisodeArtifactLegacyInput;

function normalizeStringRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function toString(value: unknown, fallback?: string) {
  return typeof value === "string" ? value : fallback;
}

export function getEpisodePayloadVersion(value: EpisodeArtifactShape): number {
  const record = normalizeStringRecord(value);
  if (!record) return EPISODE_ARTIFACT_PREVIOUS_VERSION;

  const raw = record.payloadVersion;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (record.version === "quipsly-recording-room.v1" || record.version === "quipsly-timeline.v1") {
    return 1;
  }
  return EPISODE_ARTIFACT_PREVIOUS_VERSION;
}

export function normalizeEpisodeArtifact(value: unknown): EpisodeArtifactPayload | null {
  const record = normalizeStringRecord(value);
  if (!record) return null;

  const payloadVersion = getEpisodePayloadVersion(record);
  const nestedTimeline = normalizeStringRecord(record.timeline);
  const nestedData = normalizeStringRecord(record.data);

  const timelineClips = Array.isArray(record.timelineClips) ? record.timelineClips : Array.isArray(nestedTimeline?.timelineClips) ? nestedTimeline?.timelineClips : Array.isArray(nestedData?.timelineClips) ? nestedData?.timelineClips : [];
  const transcript = Array.isArray(record.transcript) ? record.transcript : Array.isArray(nestedTimeline?.transcript) ? nestedTimeline?.transcript : Array.isArray(nestedData?.transcript) ? nestedData?.transcript : [];

  if (!Array.isArray(timelineClips) || !Array.isArray(transcript)) return null;

  return {
    payloadVersion,
    projectSlug: toString(record.projectSlug, toString(record.project, "")) || DEFAULT_PROJECT_SLUG,
    episodeSlug: toString(record.episodeSlug, toString(record.episode, "current-episode")),
    source: toString(record.source, "unknown"),
    timelineClips,
    transcript,
    paperEditSnapshots: normalizeStringRecord(record.paperEditSnapshots) as Record<string, EpisodeArtifactPaperEditSnapshot> | undefined,
    importedMedia: Array.isArray(record.importedMedia) ? record.importedMedia as EpisodeImportedMediaAsset[] : undefined,
    contentFingerprint: toString(record.contentFingerprint, undefined),
    generatedFrom: toString(record.generatedFrom, "migration"),
    savedAt: toString(record.savedAt, new Date().toISOString()),
    generatedAt: toString(record.generatedAt, undefined),
  } as EpisodeArtifactPayload;
}

export type EpisodeArtifactVersionedTimelinePayload = EpisodeArtifactPayload & {
  payloadVersion: number;
};

export type EpisodeArtifact = EpisodeArtifactVersionedTimelinePayload;

export type EpisodeArtifactLegacyShape = {
  // previous payloadVersion
  payloadVersion: number;
  // common migration keys used by legacy saves
  project?: string;
  episode?: string;
  timelineClips?: EpisodeArtifactTimelineClip[];
  clips?: EpisodeArtifactTimelineClip[];
  transcript?: EpisodeArtifactTranscript[];
  blocks?: EpisodeArtifactTranscript[];
  source?: string;
  generatedFrom?: string;
  savedAt?: string;
  generatedAt?: string;
};
