"use client";

import { SyncDeck } from "./SyncDeck";
import { ChangeEvent, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Player } from "@remotion/player";
import { submitRenderJob } from "../render-queue/actions";
import { VisualTimeline } from "./VisualTimeline";
import {
  makeTrackId,
  normalizeTrackId,
  normalizeTrackIdForKind,
  TRACK_PREFIX_VIDEO,
  TRACK_PREFIX_AUDIO,
  DEFAULT_AUDIO_TRACK,
  DEFAULT_VIDEO_TRACK,
  useTimelineState,
  isAudioTrackId,
  isVideoTrackId,
  trackKindFromTrackId,
} from "./useTimelineState";
import { RemotionComposition } from "./RemotionComposition";
import { VideoSegmentDesk } from "./VideoSegmentDesk";
import type { EpisodeArtifact } from "../episode-production/episodeArtifact";
import { EPISODE_ARTIFACT_CURRENT_VERSION } from "../episode-production/episodeArtifact";
import type { TimelineClip, TimelineState, TranscriptBlock } from "./useTimelineState";

const EPISODE_ARTIFACT_PAYLOAD_VERSION = EPISODE_ARTIFACT_CURRENT_VERSION;
const EDITOR_LEGACY_VERSION = 0;
const DEFAULT_EDITOR_PROJECT_SLUG = "quipsly-dev-lab";
type TimelineSaveState = "idle" | "queued" | "saving" | "saved" | "error" | "fallback" | "conflict";
type TimelineHydrationSource = "loading" | "saved timeline" | "recording room" | "transcript payload" | "default timeline" | "error";

type EpisodeProductionState = {
  ok: boolean;
  mode: "database" | "fallback" | "conflict";
  id: string;
  projectSlug: string;
  slug: string;
  title: string;
  boundaryLabel: string;
  status: string;
  message?: string;
  recordingRoomJson?: unknown;
  timelineJson?: unknown;
  transcriptJson?: unknown;
  productionJson?: unknown;
  updatedAt?: string;
};

type ImportedMediaAsset = {
  id: string;
  sourceId: string;
  projectSlug: string;
  episodeSlug: string;
  originalName: string;
  contentType: string;
  size: number;
  kind: "audio" | "video" | "unknown";
  bucketName?: string;
  objectName?: string;
  gcsUri: string;
  playbackUrl: string;
  importedAt: string;
  source?: string;
  importRole?: string;
  sync?: {
    status?: string;
    anchorTimelineSeconds?: number;
    targetClipId?: string;
    note?: string;
    source?: string;
    syncedAt?: string;
    suggestedTrackId?: string;
    suggestedRole?: string;
    suggestionConfidence?: number;
    suggestionReason?: string;
    suggestionAppliedAt?: string;
    suggestionSource?: string;
  };
  proxy?: {
    status?: string;
    proxyUrl?: string;
    note?: string;
  };
};

type EpisodeImportLane = {
  id: "phone-audio" | "camera-video" | "reference-clip";
  title: string;
  description: string;
  accept: string;
  buttonLabel: string;
  tone: string;
};

type AiIngestRecommendation = {
  assetId: string;
  role: string;
  confidence: number;
  suggestedTrackId: string;
  suggestedSyncStatus: string;
  suggestedAction: string;
  reason: string;
  suggestedAnchorTimelineSeconds?: number;
};

type AiIngestReport = {
  source?: string;
  generatedAt?: string;
  summary: string;
  recommendations: AiIngestRecommendation[];
  batchPlan: Array<{ title: string; detail: string }>;
  warnings: string[];
};

type TranscriptAssistReport = {
  id: string;
  source: string;
  generatedAt: string;
  assetId: string;
  sourceId?: string;
  originalName: string;
  contentType: string;
  kind: "audio" | "video" | "unknown";
  inspectedRawMedia: boolean;
  summary: string;
  transcriptText: string;
  transcriptBlocks: Array<{
    startSeconds: number;
    endSeconds: number;
    speaker: string;
    text: string;
    confidence: number;
  }>;
  suggestedUse: string;
  warnings: string[];
};

type MediaAnalysisJobType = "transcript" | "file-triage" | "sync-suggestion" | "proxy-needed";
type MediaAnalysisJobStatus = "queued" | "running" | "completed" | "failed" | "canceled";

type MediaAnalysisJob = {
  id: string;
  assetId: string;
  type: MediaAnalysisJobType;
  status: MediaAnalysisJobStatus;
  startedAt: string;
  completedAt?: string | null;
  error?: string | null;
  result: Record<string, unknown>;
};

type SyncHistorySnapshot = {
  id?: string;
  type: string;
  assetId?: string;
  targetClipId?: string;
  label?: string;
  createdAt?: string;
  beforeSync?: unknown;
  afterSync?: unknown;
  beforeClip?: {
    id?: string;
    assetId?: string;
    name?: string;
  };
  afterClip?: {
    id?: string;
    assetId?: string;
    name?: string;
  };
};

type EditorCoPilotStatus = "queued" | "running" | "success" | "error" | "rolled-back";

type EditorCoPilotRevertKind = "undo-sync" | "delete-timeline-clip" | "restore-spine" | "restore-clip-source" | "restore-sync-status" | "none";

type EditorCoPilotRevertPayload = {
  kind: EditorCoPilotRevertKind;
  assetId?: string;
  clipId?: string;
  clip?: TimelineClip | null;
  clipSourceAssetId?: string;
  previousSyncStatus?: "ready-to-sync" | "synced" | "held";
  previousSyncAnchorTimelineSeconds?: number | null;
  previousSyncTargetClipId?: string | null;
  spineAudioAssetId?: string | null;
  spineAudioClipId?: string | null;
  spineAudioSource?: string | null;
  spineAudioLabel?: string | null;
};

type EditorCoPilotLogEntry = {
  id: string;
  at: string;
  command: string;
  result: string;
  changeSummary?: string;
  status: EditorCoPilotStatus;
  reversible: boolean;
  revert: EditorCoPilotRevertPayload;
};

type EditorCoPilotMessageRole = "user" | "agent" | "system";

type EditorCoPilotMessage = {
  id: string;
  at: string;
  role: EditorCoPilotMessageRole;
  text: string;
  command?: string;
  logId?: string;
};

type EditorCoPilotParse = {
  commandText: string;
  parsed: ParsedEditorCommand;
};

const EDITOR_CO_PILOT_MAX_LOG = 24;
const EDITOR_CO_PILOT_MAX_MESSAGES = 48;

type ParsedEditorCommandType = "help" | "source-url" | "add-to-timeline" | "attach-to-selected" | "set-sync-status"
  | "set-spine-audio" | "undo-last-change" | "save-timeline" | "refresh-state" | "organize" | "apply-suggestion"
  | "transcript-assist" | "queue-job" | "set-playhead" | "n/a";

type ParsedEditorCommand = {
  type: ParsedEditorCommandType;
  command: string;
  assetRef?: string;
  status?: "ready-to-sync" | "synced" | "held";
  jobType?: MediaAnalysisJobType;
  sourceUrl?: string;
  sourceTitle?: string;
  playheadSeconds?: number;
};

const EDITOR_CO_PILOT_COMMANDS: string[] = [
  "help",
  "set playhead to 42",
  "import source https://www.youtube.com/watch?v=...",
  "add <asset> to timeline",
  "attach <asset> to selected clip",
  "set spine <asset>",
  "mark <asset> as synced|held|ready",
  "organize",
  "save timeline",
  "undo last sync change",
  "transcript assist <asset>",
  "apply suggestion <asset>",
  "queue sync-suggestion for <asset>",
];

const EDITOR_CO_PILOT_STATUS_TONE: Record<EditorCoPilotStatus, string> = {
  queued: "border-slate-200 bg-slate-50 text-slate-700",
  running: "border-sky-200 bg-sky-50 text-sky-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  error: "border-red-200 bg-red-50 text-red-800",
  "rolled-back": "border-amber-200 bg-amber-50 text-amber-800",
};

const EDITOR_CO_PILOT_MESSAGE_TONE: Record<EditorCoPilotMessageRole, string> = {
  user: "bg-indigo-100 text-indigo-900 border-indigo-200",
  agent: "bg-emerald-100 text-emerald-900 border-emerald-200",
  system: "bg-violet-100 text-violet-900 border-violet-200",
};

const EDITOR_CO_PILOT_REVERT_LABEL: Record<EditorCoPilotRevertKind, string> = {
  "undo-sync": "Undo last sync change",
  "delete-timeline-clip": "Remove added clip",
  "restore-sync-status": "Restore prior sync status",
  "restore-spine": "Restore previous spine",
  "restore-clip-source": "Restore clip source",
  none: "No rollback",
};

function formatEditorCoPilotTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "--:--";
  return parsed.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

type MediaSourceHealthStatus = "ok" | "warning" | "error" | "unchecked" | "checking";
type MediaSourceHealthKind = "audio" | "video" | "unknown";

type MediaSourceHealth = {
  id: string;
  label: string;
  sourceUrl: string;
  status: MediaSourceHealthStatus;
  reachable: boolean;
  playable: boolean;
  previewUsable: boolean;
  renderUsable: boolean;
  kind: MediaSourceHealthKind;
  expectedKind: MediaSourceHealthKind;
  detectedKind: MediaSourceHealthKind;
  contentType: string;
  size: number;
  statusCode?: number;
  method?: string;
  note: string;
};

type MediaHealthProbeItem = {
  id: string;
  label: string;
  sourceUrl: string;
  expectedKind: MediaSourceHealthKind;
  contentType?: string;
  size?: number;
};

type EpisodeSpineAudio = {
  assetId?: string;
  clipId?: string;
  source?: string;
  label: string;
  setAt?: string;
};

const INITIAL_VIDEO_TRACK_A = makeTrackId(TRACK_PREFIX_VIDEO, 1);
const INITIAL_VIDEO_TRACK_B = makeTrackId(TRACK_PREFIX_VIDEO, 2);
const SESSION_EVENT_TRACK = makeTrackId(TRACK_PREFIX_VIDEO, 3);

const INITIAL_STATE: TimelineState = {
  clips: [
    { id: "t1", assetId: "v1", kind: "video", trackId: INITIAL_VIDEO_TRACK_A, startIn: 0, duration: 10.5, sourceStart: 0, sourceEnd: 10.5, name: "A-Roll_Take_1", color: "#2563eb" },
    { id: "t2", assetId: "v2", kind: "video", trackId: INITIAL_VIDEO_TRACK_B, startIn: 10.5, duration: 5.2, sourceStart: 0, sourceEnd: 5.2, name: "B-Roll_City", color: "#059669" },
  ],
  transcript: [
    { id: "p1", time: 0, duration: 5, text: "Welcome back to the podcast. Today we are talking about the AI revolution.", deleted: false, alert: null },
    { id: "p2", time: 5, duration: 7, text: "And honestly, it's pretty crazy. I don't know what to think about it.", deleted: false, alert: "Retention Drop Detected" },
    { id: "p3", time: 12, duration: 3.7, text: "Let's dive right into the code and see how we can build an autonomous studio.", deleted: false, alert: null },
  ]
};

const RECORDER_SEGMENT_DEFAULT_DURATION_SECONDS = 8;
const RECORDER_SEGMENT_MIN_DURATION_SECONDS = 0.2;
const RECORDER_SEGMENT_GAP_SECONDS = 0.5;
const RECORDER_SEGMENT_PREFIX = "seg";
type SessionTrackKind = "audio" | "video";

type SegmentTimelineRange = {
  sourceStart: number;
  sourceEnd: number;
  duration: number;
};

type RecordingSessionEvent = {
  id?: string;
  kind?: "session" | "marker" | "clip" | "retake" | "note";
  label?: string;
  atMs?: number;
  note?: string;
};

type RecordingSessionTrack = {
  id: string;
  name?: string;
  type?: SessionTrackKind;
  trackId?: string;
  sourceId?: string;
  sourceUrl?: string;
  size?: number;
  durationMs?: number;
  kind?: SessionTrackKind;
  recordedStartAt?: string;
  recordedEndAt?: string;
  recordedSessionStartMs?: number;
  recordedSessionEndMs?: number;
};

type RecordingSessionPackage = {
  projectSlug?: string;
  episodeSlug?: string;
  episodeLabel?: string;
  roomName?: string;
  durationMs?: number;
  events?: RecordingSessionEvent[];
  clips?: Array<{ id?: string; title?: string; url?: string; segments?: Array<{ id?: string; start?: string; end?: string; note?: string }> }>;
  tracks?: RecordingSessionTrack[];
  script?: string;
};

function makeId(prefix = "timeline") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function parseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function coerceArray<T>(value: unknown) {
  return Array.isArray(value) ? (value as T[]) : [];
}

function coerceString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function coerceOptionalString(value: unknown, fallback?: string) {
  return typeof value === "string" ? value : fallback ?? "";
}

function normalizeImportedMediaAssets(value: unknown): ImportedMediaAsset[] {
  const record = asObject(value);
  const importedMedia = coerceArray<Record<string, unknown>>(record?.importedMedia);

  return importedMedia
    .map<ImportedMediaAsset | null>((asset) => {
      const sourceId = coerceString(asset.sourceId);
      const playbackUrl = coerceString(asset.playbackUrl);
      const id = coerceString(asset.id, sourceId || makeId("import"));
      const kind = asset.kind === "audio" || asset.kind === "video" || asset.kind === "unknown" ? asset.kind : "unknown";
      if (!sourceId || !playbackUrl) return null;

      return {
        id,
        sourceId,
        projectSlug: coerceString(asset.projectSlug, DEFAULT_EDITOR_PROJECT_SLUG),
        episodeSlug: coerceString(asset.episodeSlug, "current-episode"),
        originalName: coerceString(asset.originalName, "Imported media"),
        contentType: coerceString(asset.contentType, "application/octet-stream"),
        size: typeof asset.size === "number" && Number.isFinite(asset.size) ? asset.size : 0,
        kind,
        bucketName: coerceString(asset.bucketName),
        objectName: coerceString(asset.objectName),
        gcsUri: coerceString(asset.gcsUri),
        playbackUrl,
        importedAt: coerceString(asset.importedAt, new Date().toISOString()),
        source: coerceString(asset.source),
        importRole: coerceString(asset.importRole || asObject(asset.sync)?.suggestedRole),
        sync: (asObject(asset.sync) ?? undefined) as ImportedMediaAsset["sync"],
        proxy: (asObject(asset.proxy) ?? undefined) as ImportedMediaAsset["proxy"],
      } satisfies ImportedMediaAsset;
    })
    .filter((asset): asset is ImportedMediaAsset => asset !== null);
}

function normalizeAiIngestReport(value: unknown): AiIngestReport | null {
  const record = asObject(value);
  const report = asObject(record?.aiIngestReport);
  if (!report) return null;

  const summary = coerceString(report.summary);
  if (!summary) return null;

  return {
    source: coerceString(report.source),
    generatedAt: coerceString(report.generatedAt),
    summary,
    recommendations: coerceArray<Record<string, unknown>>(report.recommendations).map((recommendation) => ({
      assetId: coerceString(recommendation.assetId),
      role: coerceString(recommendation.role, "unknown"),
      confidence: typeof recommendation.confidence === "number" && Number.isFinite(recommendation.confidence)
        ? recommendation.confidence
        : 0,
      suggestedTrackId: coerceString(recommendation.suggestedTrackId, "V3"),
      suggestedSyncStatus: coerceString(recommendation.suggestedSyncStatus, "ready-to-sync"),
      suggestedAction: coerceString(recommendation.suggestedAction),
      reason: coerceString(recommendation.reason),
      suggestedAnchorTimelineSeconds: coerceOptionalNumber(recommendation.suggestedAnchorTimelineSeconds),
    })).filter((recommendation) => recommendation.assetId),
    batchPlan: coerceArray<Record<string, unknown>>(report.batchPlan).map((step) => ({
      title: coerceString(step.title, "Next step"),
      detail: coerceString(step.detail),
    })).filter((step) => step.detail),
    warnings: coerceArray<unknown>(report.warnings)
      .map((warning) => coerceString(warning))
      .filter(Boolean),
  };
}

function normalizeTranscriptAssistReports(value: unknown): TranscriptAssistReport[] {
  const record = asObject(value);
  return coerceArray<Record<string, unknown>>(record?.transcriptAssistReports)
    .map((report) => {
      const kind: TranscriptAssistReport["kind"] = report.kind === "audio" || report.kind === "video" || report.kind === "unknown" ? report.kind : "unknown";
      return {
        id: coerceString(report.id, makeId("transcript-assist")),
        source: coerceString(report.source, "unknown"),
        generatedAt: coerceString(report.generatedAt),
        assetId: coerceString(report.assetId),
        sourceId: coerceString(report.sourceId),
        originalName: coerceString(report.originalName, "Imported media"),
        contentType: coerceString(report.contentType),
        kind,
        inspectedRawMedia: Boolean(report.inspectedRawMedia),
        summary: coerceString(report.summary),
        transcriptText: coerceString(report.transcriptText),
        transcriptBlocks: coerceArray<Record<string, unknown>>(report.transcriptBlocks).map((block) => ({
          startSeconds: coerceNumber(block.startSeconds, 0),
          endSeconds: coerceNumber(block.endSeconds, 0),
          speaker: coerceString(block.speaker, "Unknown"),
          text: coerceString(block.text),
          confidence: coerceNumber(block.confidence, 0),
        })).filter((block) => block.text),
        suggestedUse: coerceString(report.suggestedUse),
        warnings: coerceArray<unknown>(report.warnings).map((warning) => coerceString(warning)).filter(Boolean),
      };
    })
    .filter((report) => report.assetId && (report.summary || report.transcriptText || report.suggestedUse));
}

function normalizeMediaAnalysisJobType(value: unknown): MediaAnalysisJobType {
  const raw = coerceString(value);
  if (raw === "transcript" || raw === "file-triage" || raw === "sync-suggestion" || raw === "proxy-needed") return raw;
  return "file-triage";
}

function normalizeMediaAnalysisJobStatus(value: unknown): MediaAnalysisJobStatus {
  const raw = coerceString(value);
  if (raw === "queued" || raw === "running" || raw === "completed" || raw === "failed" || raw === "canceled") return raw;
  return "queued";
}

function normalizeMediaAnalysisJobs(value: unknown): MediaAnalysisJob[] {
  const record = asObject(value);
  return coerceArray<Record<string, unknown>>(record?.mediaAnalysisJobs)
    .map((job) => ({
      id: coerceString(job.id, makeId("media-job")),
      assetId: coerceString(job.assetId),
      type: normalizeMediaAnalysisJobType(job.type),
      status: normalizeMediaAnalysisJobStatus(job.status),
      startedAt: coerceString(job.startedAt),
      completedAt: coerceString(job.completedAt) || null,
      error: coerceString(job.error) || null,
      result: asObject(job.result) ?? {},
    }))
    .filter((job) => job.assetId);
}

function mediaAnalysisJobTone(status: MediaAnalysisJobStatus) {
  if (status === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "failed") return "border-red-200 bg-red-50 text-red-800";
  if (status === "running") return "border-sky-200 bg-sky-50 text-sky-800";
  if (status === "canceled") return "border-slate-200 bg-slate-50 text-slate-700";
  return "border-amber-200 bg-amber-50 text-amber-900";
}

function mediaAnalysisJobLabel(type: MediaAnalysisJobType) {
  if (type === "transcript") return "Transcript";
  if (type === "file-triage") return "File triage";
  if (type === "sync-suggestion") return "Sync suggestion";
  return "Proxy needed";
}

function normalizeSyncHistory(value: unknown): SyncHistorySnapshot[] {
  const record = asObject(value);
  return coerceArray<Record<string, unknown>>(record?.syncHistory).map((snapshot) => ({
    id: coerceString(snapshot.id),
    type: coerceString(snapshot.type),
    assetId: coerceString(snapshot.assetId),
    targetClipId: coerceString(snapshot.targetClipId),
    label: coerceString(snapshot.label),
    createdAt: coerceString(snapshot.createdAt),
    beforeSync: snapshot.beforeSync,
    afterSync: snapshot.afterSync,
    beforeClip: asObject(snapshot.beforeClip) as SyncHistorySnapshot["beforeClip"],
    afterClip: asObject(snapshot.afterClip) as SyncHistorySnapshot["afterClip"],
  })).filter((snapshot) => snapshot.type);
}

function normalizeEpisodeSpineAudio(value: unknown): EpisodeSpineAudio | null {
  const record = asObject(value);
  if (!record) return null;
  const assetId = coerceString(record.spineAudioAssetId);
  const clipId = coerceString(record.spineAudioClipId);
  if (!assetId && !clipId) return null;

  return {
    assetId: assetId || undefined,
    clipId: clipId || undefined,
    source: coerceString(record.spineAudioSource) || undefined,
    label: coerceString(record.spineAudioLabel, assetId || clipId || "Spine audio"),
    setAt: coerceString(record.spineAudioSetAt) || undefined,
  };
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "unknown size";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function importedAssetTrackId(asset: ImportedMediaAsset) {
  const suggestedTrackId = normalizeSuggestedTrackId(asset.sync?.suggestedTrackId);
  if (suggestedTrackId) return suggestedTrackId;
  return asset.kind === "audio" ? DEFAULT_AUDIO_TRACK : INITIAL_VIDEO_TRACK_B;
}

function importedAssetKind(asset: ImportedMediaAsset): "audio" | "video" {
  if (asset.kind === "audio" || asset.contentType.startsWith("audio/")) return "audio";
  return "video";
}

function cleanImportedClipName(asset: ImportedMediaAsset) {
  const role = humanizeSlug(asset.importRole || asset.sync?.suggestedRole || asset.kind || "media");
  const baseName = (asset.originalName || "Imported media")
    .replace(/\.[a-z0-9]{2,6}$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const cleanBaseName = baseName || "Imported media";
  return `${role}: ${cleanBaseName}`.slice(0, 90);
}

function trackSortValue(trackId: string) {
  const match = /^([VA])(\d+)(?:\.(\d+))?$/i.exec(trackId);
  if (!match) return Number.MAX_SAFE_INTEGER;
  return Number(match[2]) + (match[3] ? Number(`0.${match[3]}`) : 0);
}

function sortedUniqueTrackIds(trackIds: string[], kind: "audio" | "video") {
  const prefix = kind === "audio" ? TRACK_PREFIX_AUDIO : TRACK_PREFIX_VIDEO;
  return Array.from(new Set(trackIds))
    .filter((trackId) => trackId.toUpperCase().startsWith(prefix))
    .sort((a, b) => trackSortValue(a) - trackSortValue(b));
}

function nextTrackIdForKind(existingTrackIds: string[], kind: "audio" | "video") {
  const prefix = kind === "audio" ? TRACK_PREFIX_AUDIO : TRACK_PREFIX_VIDEO;
  const usedIndexes = existingTrackIds
    .map((trackId) => new RegExp(`^${prefix}(\\d+)`, "i").exec(trackId)?.[1])
    .filter((value): value is string => Boolean(value))
    .map((value) => Number(value))
    .filter(Number.isFinite);
  return makeTrackId(prefix, Math.max(0, ...usedIndexes) + 1);
}

function clipOverlapsRange(clip: TimelineClip, startIn: number, duration: number) {
  const clipStart = clip.startIn;
  const clipEnd = clip.startIn + Math.max(clip.duration, 0.05);
  const rangeEnd = startIn + Math.max(duration, 0.05);
  return clipStart < rangeEnd && clipEnd > startIn;
}

function smartImportedAssetPlacement(asset: ImportedMediaAsset, clips: TimelineClip[], playheadSeconds: number) {
  const kind = importedAssetKind(asset);
  const startIn = roundSeconds(Math.max(0, playheadSeconds));
  const duration = 30;
  const suggestedTrackId = normalizeSuggestedTrackId(asset.sync?.suggestedTrackId);
  const existingCompatibleTrackIds = sortedUniqueTrackIds(
    clips
      .filter((clip) => clip.kind === kind || trackKindFromTrackId(clip.trackId) === kind)
      .map((clip) => clip.trackId),
    kind,
  );
  const defaultTrackId = kind === "audio" ? DEFAULT_AUDIO_TRACK : INITIAL_VIDEO_TRACK_B;
  const candidateTrackIds = sortedUniqueTrackIds(
    [
      ...(suggestedTrackId ? [suggestedTrackId] : []),
      defaultTrackId,
      ...existingCompatibleTrackIds,
    ],
    kind,
  );
  const openTrackId = candidateTrackIds.find((trackId) =>
    !clips.some((clip) => clip.trackId === trackId && clipOverlapsRange(clip, startIn, duration))
  );
  const trackId = openTrackId ?? nextTrackIdForKind([...candidateTrackIds, ...clips.map((clip) => clip.trackId)], kind);

  return {
    kind,
    trackId,
    startIn,
    duration,
    name: cleanImportedClipName(asset),
    avoidedOverlap: trackId !== suggestedTrackId && trackId !== defaultTrackId,
  };
}

function importedAssetColor(asset: ImportedMediaAsset) {
  if (asset.kind === "audio") return "#d97706";
  if (asset.kind === "video") return "#7c3aed";
  return "#64748b";
}

function importedAssetTimelinePercent(asset: ImportedMediaAsset, totalDuration: number) {
  const anchor = asset.sync?.anchorTimelineSeconds;
  if (typeof anchor !== "number" || !Number.isFinite(anchor) || totalDuration <= 0) return null;
  return Math.max(0, Math.min(100, (anchor / totalDuration) * 100));
}

function importedAssetSyncLabel(asset: ImportedMediaAsset) {
  const status = asset.sync?.status ?? "ready-to-sync";
  if (status === "synced") return "Synced";
  if (status === "held") return "Held";
  return "Safe to test";
}

function importedAssetSyncTone(asset: ImportedMediaAsset) {
  const status = asset.sync?.status ?? "ready-to-sync";
  if (status === "synced") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "held") return "border-slate-200 bg-slate-50 text-slate-700";
  return "border-amber-200 bg-amber-50 text-amber-900";
}

function importedAssetConfidenceStatus(asset: ImportedMediaAsset, health: MediaSourceHealth | null | undefined) {
  const syncStatus = asset.sync?.status ?? "ready-to-sync";

  if (syncStatus === "held") {
    return {
      label: "Held",
      tone: "border-slate-200 bg-slate-50 text-slate-700",
      meaning: "This file is saved, but intentionally parked for later.",
      next: "Ignore it for now. Unpark it only when you actually need it.",
    };
  }

  if (health?.status === "error") {
    return {
      label: "Broken source",
      tone: "border-red-200 bg-red-50 text-red-900",
      meaning: "Quipsly cannot confidently read this file right now.",
      next: "Relink it, replace it, or park it so it stops blocking the edit.",
    };
  }

  if (syncStatus === "synced") {
    return {
      label: "Synced",
      tone: "border-emerald-200 bg-emerald-50 text-emerald-900",
      meaning: "This file has been lined up or accepted for the current edit.",
      next: "Keep editing, or save the timeline if you just changed it.",
    };
  }

  if (health?.status === "warning" || (health && !health.renderUsable)) {
    return {
      label: "Needs review",
      tone: "border-amber-200 bg-amber-50 text-amber-900",
      meaning: "This is usable for checking the edit, but it may need a cleaner source before export.",
      next: "Preview it, then relink or replace it before final render if needed.",
    };
  }

  if (!health || health.status === "checking" || health.previewUsable || health.status === "ok") {
    return {
      label: "Safe to test",
      tone: "border-sky-200 bg-sky-50 text-sky-900",
      meaning: "Nothing here should stop you from trying it in the edit.",
      next: "Add it to the timeline, line it up at the playhead, or mark it synced when it feels right.",
    };
  }

  return {
    label: "Needs review",
    tone: "border-amber-200 bg-amber-50 text-amber-900",
    meaning: "This file is saved, but Quipsly needs a human check before trusting it.",
    next: "Preview it once. If it feels wrong, park it or replace it.",
  };
}

function importedAssetRoleLabel(asset: ImportedMediaAsset) {
  const role = coerceString(asset.importRole || asset.sync?.suggestedRole, "").trim();
  if (role === "phone-audio") return "Phone audio";
  if (role === "camera-video") return "Camera video";
  if (role === "reference-clip") return "Reference clip";
  if (role === "source-clip") return "YouTube/source";
  if (role) return humanizeSlug(role);
  if (asset.kind === "audio") return "Audio";
  if (asset.kind === "video") return "Video";
  return "Episode media";
}

const EPISODE_IMPORT_LANES: EpisodeImportLane[] = [
  {
    id: "phone-audio",
    title: "Phone audio",
    description: "Clean host/guest recording, voice memos, Riverside backup, or call audio.",
    accept: "audio/*,.mp3,.m4a,.wav,.aac,.ogg,.webm",
    buttonLabel: "Import phone audio",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-950",
  },
  {
    id: "camera-video",
    title: "Camera video",
    description: "Main camera, iPhone video, Insta360 export, screen recording, or A-roll.",
    accept: "video/*,.mp4,.mov,.m4v,.webm,.mkv",
    buttonLabel: "Import camera video",
    tone: "border-sky-200 bg-sky-50 text-sky-950",
  },
  {
    id: "reference-clip",
    title: "Reference clips",
    description: "Local clips to watch, quote, react to, compare, or use as B-roll/source reference.",
    accept: "video/*,audio/*,.mp4,.mov,.m4v,.webm,.mp3,.m4a,.wav,.aac",
    buttonLabel: "Import reference clip",
    tone: "border-amber-200 bg-amber-50 text-amber-950",
  },
];

const SYNC_STATUS_GUIDE = [
  {
    label: "Safe to test",
    tone: "border-sky-200 bg-sky-50 text-sky-900",
    meaning: "Nothing here should stop you from trying the file in the edit.",
  },
  {
    label: "Needs review",
    tone: "border-amber-200 bg-amber-50 text-amber-900",
    meaning: "Usable for checking, but verify or replace before trusting final export.",
  },
  {
    label: "Synced",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-900",
    meaning: "The file has been lined up or accepted for this edit.",
  },
  {
    label: "Held",
    tone: "border-slate-200 bg-slate-50 text-slate-700",
    meaning: "Saved and parked. It does not need attention right now.",
  },
  {
    label: "Broken source",
    tone: "border-red-200 bg-red-50 text-red-900",
    meaning: "Quipsly cannot confidently read this file. Relink, replace, or park it.",
  },
];

function SyncStatusGuide({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`rounded-lg border border-[#e8dcc4] bg-white p-3 text-[11px] font-bold leading-5 text-[#5d4528] ${compact ? "mt-2" : "mt-3"}`}>
      <div className="font-black uppercase tracking-[0.16em] text-[#9a641e]">Status guide</div>
      <div className={`mt-2 grid gap-2 ${compact ? "" : "md:grid-cols-2"}`}>
        {SYNC_STATUS_GUIDE.map((status) => (
          <div key={status.label} className={`rounded-md border px-2 py-2 ${status.tone}`}>
            <div className="font-black">{status.label}</div>
            <div className="mt-1 text-[10px] opacity-85">{status.meaning}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function normalizeSuggestedTrackId(value: unknown) {
  const raw = coerceString(value, "").trim().toUpperCase();
  if (/^[VA]\d+(?:\.\d+)?$/.test(raw)) return raw;
  return "";
}

function normalizeSuggestedSyncStatus(value: unknown): "ready-to-sync" | "synced" | "held" {
  const raw = coerceString(value, "").trim();
  if (raw === "synced" || raw === "held" || raw === "ready-to-sync") return raw;
  return "ready-to-sync";
}

function recommendationApplySummary(recommendation: AiIngestRecommendation) {
  const status = normalizeSuggestedSyncStatus(recommendation.suggestedSyncStatus);
  const trackId = normalizeSuggestedTrackId(recommendation.suggestedTrackId);
  return [
    `status: ${status}`,
    trackId ? `suggested track: ${trackId}` : "no safe track suggestion",
  ].join(" / ");
}

function coerceNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function coerceOptionalNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function coerceBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeFiniteNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundSeconds(value: number) {
  return Math.round(value * 1000) / 1000;
}

function parseTrackKindFromSource(assetId: string): "audio" | "video" {
  const lower = assetId.toLowerCase();
  if (/\.(mp3|wav|m4a|aac|ogg|flac|webm)(\?|$)/i.test(lower)) return "audio";
  if (/\.(mp4|webm|mov|m4v|m3u8|mpd)(\?|$)/i.test(lower)) return "video";
  return "video";
}

function looksLikeEpisodePayload(value: unknown) {
  const record = asObject(value);
  if (!record) return false;

  return (
    "projectSlug" in record ||
    "episodeSlug" in record ||
    "timelineClips" in record ||
    "clips" in record ||
    "transcript" in record ||
    "blocks" in record ||
    "events" in record ||
    "roomName" in record
  );
}

function normalizeEpisodePayload(payload: unknown): Record<string, unknown> | null {
  const record = asObject(payload);
  if (!record) return null;

  const wrappedPayload = asObject(record.payload);
  if (looksLikeEpisodePayload(wrappedPayload)) return wrappedPayload;

  const dataPayload = asObject(record.data);
  if (looksLikeEpisodePayload(dataPayload)) return dataPayload;

  const roomPayload = asObject(record.room);
  if (looksLikeEpisodePayload(roomPayload)) return roomPayload;

  const rootFallbacks = asObject(record.recordingRoom);
  if (looksLikeEpisodePayload(rootFallbacks)) return rootFallbacks;

  const wrappedEpisodePayload = asObject(record.episodePayload);
  if (looksLikeEpisodePayload(wrappedEpisodePayload)) return wrappedEpisodePayload;

  if (typeof record.payloadVersion === "number") return record;
  if (typeof record.version === "number") return record;
  if (typeof record.version === "string") return record;

  return record;
}

function normalizeTrackIdFallback(value: unknown, fallbackIndex: number, kind: SessionTrackKind = "audio") {
  return normalizeTrackIdForKind(value, kind, fallbackIndex);
}

function inferTrackKindFromTrackId(raw: unknown) {
  const safe = coerceString(raw, "").toUpperCase().trim();
  if (safe.startsWith("V")) return "video" as const;
  if (safe.startsWith("A")) return "audio" as const;
  return undefined;
}

function inferTrackKindFromType(rawType: string) {
  const normalized = (rawType || "").toLowerCase();
  if (normalized.includes("video")) return "video" as SessionTrackKind;
  if (normalized.includes("audio")) return "audio" as SessionTrackKind;
  return undefined;
}

function inferTrackKindFromValue(track: { type?: string | undefined; trackId?: string | undefined; sourceUrl?: string | undefined; }): SessionTrackKind {
  const explicitKind = inferTrackKindFromType(track.type || "");
  if (explicitKind) return explicitKind;

  const byTrackId = inferTrackKindFromTrackId(track.trackId);
  if (byTrackId) return byTrackId;

  const sourceUrl = coerceOptionalString(track.sourceUrl, "").toLowerCase();
  if (/\.(mp4|webm|mov|m4v|m3u8|mpd)(\?|$)/i.test(sourceUrl)) return "video";
  if (/\.(mp3|wav|m4a|aac|ogg|flac)(\?|$)/i.test(sourceUrl)) return "audio";
  return "audio";
}

function inferTrackKindFromSourceUrl(sourceUrl: string, fallback: SessionTrackKind = "video"): SessionTrackKind {
  const lower = sourceUrl.trim().toLowerCase();
  if (!lower) return fallback;
  if (/\.(mp3|wav|m4a|aac|ogg|flac)(\?|$)/i.test(lower)) return "audio";
  if (/\.(mp4|webm|mov|m4v|m3u8|mpd)(\?|$)/i.test(lower)) return "video";
  if (lower.includes(".youtube.com") || lower.includes("youtu.be")) return "video";
  return fallback;
}

function sanitizeTrackSource(value: unknown) {
  const raw = coerceString(value, "").trim();
  if (!raw || raw.startsWith("blob:")) return "";
  return raw;
}

function sanitizeSessionTrackDurationSeconds(raw: unknown, fallback = 0) {
  const ms = coerceNumber(raw, fallback * 1000);
  const seconds = ms <= 0 ? 0 : ms / 1000;
  if (!Number.isFinite(seconds) || seconds <= 0) return fallback;
  return Math.max(0.05, seconds);
}

function normalizeSegmentTime(value: unknown, fallback: number) {
  const raw = (coerceOptionalString(value) ?? String(fallback)).trim();
  if (!raw || raw.toLowerCase() === "open") return Math.max(0, fallback);

  if (/^\d+(\.\d+)?$/.test(raw)) {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : Math.max(0, fallback);
  }

  const parts = raw.split(":").map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part))) return Math.max(0, fallback);
  return Math.max(0, parts.reduce((total, part) => total * 60 + part, 0));
}

function sanitizeSegmentRange(rawSegment?: { start?: string; end?: string }): SegmentTimelineRange {
  const start = normalizeSegmentTime(rawSegment?.start, 0);
  const parsedEnd = normalizeSegmentTime(rawSegment?.end, Number.NaN);
  const end = Number.isFinite(parsedEnd) && parsedEnd > start
    ? parsedEnd
    : start + RECORDER_SEGMENT_DEFAULT_DURATION_SECONDS;

  const sourceStart = Number(start.toFixed(3));
  const sourceEnd = Number(Math.max(sourceStart + RECORDER_SEGMENT_MIN_DURATION_SECONDS, end).toFixed(3));
  const duration = Number(Math.max(RECORDER_SEGMENT_MIN_DURATION_SECONDS, sourceEnd - sourceStart).toFixed(3));

  return { sourceStart, sourceEnd, duration };
}

function sanitizeLegacyAssetId(value: unknown, fallback = "") {
  const raw = coerceString(value, "").trim();
  if (!raw || raw === "youtube-clip") return fallback;
  return raw;
}

function normalizeTimelineClip(raw: unknown): TimelineClip | null {
  if (!raw || typeof raw !== "object") return null;
  const record = asObject(raw);
  if (!record) return null;

  const sourceStart = Math.max(0, coerceNumber(record.sourceStart, 0));
  const sourceEnd = Math.max(sourceStart, coerceNumber(record.sourceEnd, sourceStart + coerceNumber(record.duration, RECORDER_SEGMENT_DEFAULT_DURATION_SECONDS)));
  const duration = coerceNumber(record.duration, RECORDER_SEGMENT_DEFAULT_DURATION_SECONDS);
  const explicitSourceId = sanitizeLegacyAssetId(record.assetId as unknown);
  if (!record.id && !explicitSourceId && !record.name) return null;
  const explicitTrackKind = inferTrackKindFromType(coerceOptionalString(record.type as unknown));
  const inferredTrackKind = explicitTrackKind
    ?? trackKindFromTrackId((record as { trackId?: unknown }).trackId as string)
    ?? parseTrackKindFromSource(coerceString(record.assetId));
  const resolvedTrackKind = explicitTrackKind ?? inferredTrackKind;
  const safeTrackId = normalizeTrackId(
    (record as { trackId?: unknown }).trackId,
    DEFAULT_VIDEO_TRACK,
    resolvedTrackKind,
  );
  const safeDuration = Math.max(0.05, duration);
  const safeSourceStart = Math.max(0, sourceStart);
  const safeSourceDuration = Math.max(RECORDER_SEGMENT_MIN_DURATION_SECONDS, safeDuration);

  return {
    id: coerceString(record.id, makeId("clip")),
    assetId: explicitSourceId || "unknown-asset",
    trackId: safeTrackId,
    startIn: Math.max(0, coerceNumber(record.startIn, 0)),
    duration: safeSourceDuration,
    kind: resolvedTrackKind,
    sourceStart: safeSourceStart,
    sourceEnd: roundSeconds(Math.max(safeSourceStart, sourceEnd)),
    name: coerceString(record.name, "Clip"),
    color: coerceString(record.color, "#2563eb"),
  };
}

function normalizeTranscriptBlock(raw: unknown): TranscriptBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const record = asObject(raw);
  if (!record) return null;

  const text = coerceString(record.text);
  const id = coerceString(record.id, makeId("block"));
  if (!text.trim()) return null;

  return {
    id,
    time: Math.max(0, coerceNumber(record.time, 0)),
    duration: Math.max(0.1, coerceNumber(record.duration, 0)),
    text,
    deleted: coerceBoolean(record.deleted, false),
    alert: typeof record.alert === "string" ? record.alert : null,
  };
}

function normalizePaperEditSnapshots(raw: unknown): TimelineState["paperEditSnapshots"] {
  const record = asObject(raw);
  if (!record) return undefined;

  const entries: Array<[string, NonNullable<TimelineState["paperEditSnapshots"]>[string]]> = [];

  Object.entries(record).forEach(([blockId, snapshot]) => {
    const snapshotRecord = asObject(snapshot);
    if (!snapshotRecord) return;
    const clips = coerceArray(snapshotRecord.clips)
      .map(normalizeTimelineClip)
      .filter((clip): clip is TimelineClip => Boolean(clip));
    const transcript = coerceArray(snapshotRecord.transcript)
      .map(normalizeTranscriptBlock)
      .filter((block): block is TranscriptBlock => Boolean(block));
    if (!clips.length && !transcript.length) return;
    entries.push([
      blockId,
      {
        clips,
        transcript,
        createdAt: coerceOptionalString(snapshotRecord.createdAt, undefined),
        label: coerceOptionalString(snapshotRecord.label, undefined),
      },
    ]);
  });

  return entries.length ? Object.fromEntries(entries) : undefined;
}

function normalizeRecordingSessionPackage(raw: unknown): RecordingSessionPackage | null {
  const record = asObject(raw);
  if (!record) return null;

  const events = coerceArray<unknown>(record.events ?? record.eventLog);
  const clips = coerceArray<unknown>(record.clips ?? (record as { recordingClips?: unknown }).recordingClips);
  const trackRecords = coerceArray<unknown>(record.tracks ?? (record as { recordingTracks?: unknown }).recordingTracks);
  const episodeLabel = coerceOptionalString(record.episodeLabel) || coerceOptionalString(record.boundaryLabel);
  const roomName = coerceOptionalString(record.roomName) || coerceOptionalString((record as { name?: unknown }).name);
  const script = coerceOptionalString(record.script) || coerceOptionalString((record as { text?: unknown }).text);
  const durationMs = coerceNumber(record.durationMs, coerceNumber(record.duration, 0));
  const projectSlug = coerceOptionalString(record.projectSlug) || coerceOptionalString((record as { project?: unknown }).project);
  const episodeSlug = coerceOptionalString(record.episodeSlug) || coerceOptionalString((record as { episode?: unknown }).episode);

  return {
    projectSlug,
    episodeSlug,
    episodeLabel,
    roomName,
    durationMs,
    script: script,
    tracks: trackRecords.map((track, index) => {
      const trackRecord = asObject(track);
      const id = coerceOptionalString(trackRecord?.id, makeId("track"));
      if (!trackRecord) {
        return {
          id,
          kind: "audio",
        };
      }
      const inferredTrackKind = inferTrackKindFromValue({
        type: coerceOptionalString(trackRecord.type),
        trackId: coerceOptionalString(trackRecord.trackId),
      });
      return {
        id,
        name: coerceOptionalString(trackRecord.name),
        size: coerceNumber(trackRecord.size, 0),
        type: inferredTrackKind,
        trackId: normalizeTrackIdFallback(trackRecord.trackId, index + 1, inferredTrackKind),
        sourceId: coerceOptionalString(trackRecord.sourceId),
        sourceUrl: sanitizeTrackSource(trackRecord.sourceUrl),
        durationMs: coerceNumber(trackRecord.durationMs, 0),
        kind: inferredTrackKind,
        recordedStartAt: coerceOptionalString(trackRecord.recordedStartAt, undefined),
        recordedEndAt: coerceOptionalString(trackRecord.recordedEndAt, undefined),
        recordedSessionStartMs: coerceOptionalNumber(trackRecord.recordedSessionStartMs),
        recordedSessionEndMs: coerceOptionalNumber(trackRecord.recordedSessionEndMs),
      } satisfies RecordingSessionTrack;
    }),
    events: events.map((event) => {
      const eventRecord = asObject(event);
      if (!eventRecord) return {};
      return {
        id: coerceOptionalString(eventRecord.id),
        kind: coerceOptionalString(eventRecord.kind) as
          | "session"
          | "marker"
          | "clip"
          | "retake"
          | "note"
          | undefined,
        label: coerceOptionalString(eventRecord.label),
        atMs: coerceNumber(eventRecord.atMs, 0),
        note: coerceOptionalString(eventRecord.note),
      };
    }),
    clips: clips.map((clip) => {
      const clipRecord = asObject(clip);
      if (!clipRecord) return {};
      return {
        id: coerceOptionalString(clipRecord.id),
        title: coerceOptionalString(clipRecord.title),
        url: coerceOptionalString(clipRecord.url),
        segments: coerceArray<unknown>(clipRecord.segments).map((segment) => {
          const segmentRecord = asObject(segment);
          if (!segmentRecord) return {};
          return {
            id: coerceOptionalString(segmentRecord.id),
            start: coerceOptionalString(segmentRecord.start),
            end: coerceOptionalString(segmentRecord.end),
            note: coerceOptionalString(segmentRecord.note),
          };
        }),
      };
    }),
  };
}

function resolveSessionTrackSource(track: RecordingSessionTrack) {
  if (track.sourceId) {
    return `/api/ingest/media/${track.sourceId}`;
  }

  if (track.sourceUrl) {
    return track.sourceUrl;
  }

  return "";
}

function inferSessionTrackKind(track: RecordingSessionTrack): SessionTrackKind {
  if (track.kind) return track.kind;

  return isVideoTrackId(track.trackId) ? "video" : "audio";
}

function trackDurationSeconds(track: RecordingSessionTrack, fallbackSeconds: number) {
  const sessionStartMs = Number(track.recordedSessionStartMs);
  const sessionEndMs = Number(track.recordedSessionEndMs);
  if (Number.isFinite(sessionStartMs) && Number.isFinite(sessionEndMs) && sessionEndMs >= sessionStartMs) {
    return sanitizeSessionTrackDurationSeconds(sessionEndMs - sessionStartMs, fallbackSeconds);
  }

  const startMs = track.recordedStartAt ? Date.parse(track.recordedStartAt) : Number.NaN;
  const endMs = track.recordedEndAt ? Date.parse(track.recordedEndAt) : Number.NaN;
  if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs) {
    return sanitizeSessionTrackDurationSeconds(endMs - startMs, fallbackSeconds);
  }
  return sanitizeSessionTrackDurationSeconds(track.durationMs, fallbackSeconds);
}

function makeTrackIndexBase(track: RecordingSessionTrack, index: number) {
  return normalizeTrackIdFallback(track.trackId, index + 1, inferSessionTrackKind(track));
}

function buildSessionTrackClips(session: RecordingSessionPackage): TimelineClip[] {
  if (!session.tracks?.length) return [];

  const fallbackBaseSeconds = Math.max(
    RECORDER_SEGMENT_DEFAULT_DURATION_SECONDS,
    (session.durationMs ?? 0) / 1000 / 2,
  );

  let endToEndCursor = 0;
  const tracksBySource = [...session.tracks]
    .map((track, index) => {
      const source = resolveSessionTrackSource(track);
      if (!source) return null;
      const explicitTrackId = coerceOptionalString(track.trackId);
      const sourceKind = inferSessionTrackKind(track);
      const trackId = explicitTrackId && explicitTrackId !== "null" ? normalizeTrackIdFallback(explicitTrackId, index + 1, sourceKind) : makeTrackIndexBase(track, index);
      const duration = trackDurationSeconds(track, fallbackBaseSeconds);
      const rawStartMs = track.recordedStartAt ? Date.parse(track.recordedStartAt) : Number.NaN;
      const rawSessionStartMs = Number(track.recordedSessionStartMs);
      const rawSessionEndMs = Number(track.recordedSessionEndMs);
      return {
        index,
        track,
        source,
        sourceKind,
        trackId,
        duration,
        sessionStartSeconds: Number.isFinite(rawSessionStartMs) ? Math.max(0, rawSessionStartMs / 1000) : null,
        sessionEndSeconds: Number.isFinite(rawSessionEndMs) ? Math.max(0, rawSessionEndMs / 1000) : null,
        startSortMs: Number.isFinite(rawStartMs) ? rawStartMs : Number.MAX_SAFE_INTEGER,
      };
    })
    .filter((entry): entry is { index: number; track: RecordingSessionTrack; source: string; sourceKind: SessionTrackKind; trackId: string; duration: number; sessionStartSeconds: number | null; sessionEndSeconds: number | null; startSortMs: number; } =>
      entry !== null && (entry.sourceKind === "audio" || entry.sourceKind === "video") && entry.duration > 0)
    .sort((a, b) => {
      if (a.startSortMs !== b.startSortMs) return a.startSortMs - b.startSortMs;
      return a.index - b.index;
    })
    .map((track, index) => {
      const source = sanitizeTrackSource(track.source);
      const duration = track.duration;
      const startIn = roundSeconds(track.sessionStartSeconds ?? endToEndCursor);
      const endIn = track.sessionEndSeconds !== null && track.sessionEndSeconds >= startIn
        ? track.sessionEndSeconds
        : startIn + duration;
      endToEndCursor = Math.max(endToEndCursor, roundSeconds(endIn));
      const sourceKind = track.sourceKind;
      const trackId = track.trackId;
      const trackRecord = track.track;
      const sanitizedSource = source.trim();

      return {
        id: `track-${trackRecord.id}-${index}`,
        assetId: sanitizedSource,
        kind: sourceKind,
        trackId,
        name: trackRecord.name || `Track ${trackId}`,
        color: sourceKind === "audio" ? "#047857" : "#2563eb",
        startIn,
        sourceStart: 0,
        sourceEnd: roundSeconds(duration),
        duration,
      } as TimelineClip;
    });

  return tracksBySource;
}

function extractTimelineFromPayload(payload: unknown): TimelineState | null {
  const record = normalizeEpisodePayload(payload);
  if (!record) return null;
  const payloadVersion = coerceNumber(record.payloadVersion, EDITOR_LEGACY_VERSION);
  const recordedProjectSlug = coerceOptionalString(record.projectSlug);
  const recordedEpisodeSlug = coerceOptionalString(record.episodeSlug);
  const isLegacyRecordedContract = recordedProjectSlug === undefined && recordedEpisodeSlug === undefined
    && typeof record.savedAt !== "string"
    && typeof record.source === "undefined"
    && typeof record.timelineClips === "undefined";

  const artifactClips = coerceArray(record.timelineClips);
  const legacyClips = coerceArray(record.clips);
  const nestedTimeline = asObject((record as Record<string, unknown>).timeline);
  const nestedTimelineClips = coerceArray(nestedTimeline?.timelineClips);
  const rawClips = artifactClips.length ? artifactClips : nestedTimelineClips.length ? nestedTimelineClips : legacyClips;
  const hasTimelineClips = artifactClips.length > 0 || legacyClips.some((clip) => {
    const recordClip = asObject(clip);
    return !!(recordClip && ("assetId" in recordClip || "duration" in recordClip || "sourceStart" in recordClip));
  });

  if (hasTimelineClips) {
    const clips = rawClips.map(normalizeTimelineClip).filter((clip): clip is TimelineClip => Boolean(clip));
    const nestedTranscript = asObject((record as Record<string, unknown>).timeline)?.transcript;
    const nestedPaperEditSnapshots = asObject((record as Record<string, unknown>).timeline)?.paperEditSnapshots;
    const nestedData = asObject((record as Record<string, unknown>).data);
    const transcriptSource = Array.isArray(record.transcript)
      ? record.transcript
      : Array.isArray(nestedTranscript)
        ? nestedTranscript
        : Array.isArray(record.blocks)
          ? record.blocks
          : [];
    const transcript = transcriptSource.map(normalizeTranscriptBlock).filter((block): block is TranscriptBlock => Boolean(block));

    if (clips.length || transcript.length) {
      return {
        clips: clips.length ? clips : INITIAL_STATE.clips,
        transcript: transcript.length ? transcript : INITIAL_STATE.transcript,
        paperEditSnapshots: normalizePaperEditSnapshots(record.paperEditSnapshots ?? nestedPaperEditSnapshots ?? nestedData?.paperEditSnapshots),
      };
    }
  }

  const isRecordingSessionPayload = payloadVersion >= 1 || isLegacyRecordedContract
    || ("clips" in record && "events" in record && "roomName" in record && "durationMs" in record)
    || ("clips" in record && "tracks" in record && (record as Record<string, unknown>).projectSlug !== undefined);

  if (isRecordingSessionPayload) {
    const recordingSession = normalizeRecordingSessionPackage(record);
    if (recordingSession) {
      return sessionPackageToTimeline(recordingSession);
    }
  }

  const nestedTranscript = asObject((record as Record<string, unknown>).timeline)?.transcript;
  const transcriptSource = Array.isArray(record.transcript)
    ? record.transcript
    : Array.isArray(nestedTranscript)
      ? nestedTranscript
      : Array.isArray(record.blocks)
        ? record.blocks
        : [];
  const transcript = transcriptSource.map(normalizeTranscriptBlock).filter((block): block is TranscriptBlock => Boolean(block));
  if (!transcript.length) return null;

  return {
    clips: INITIAL_STATE.clips,
    transcript,
    paperEditSnapshots: normalizePaperEditSnapshots(record.paperEditSnapshots),
  };
}

function parseTimeToSeconds(value: string, fallback = 0) {
  return normalizeSegmentTime(value, fallback);
}

function formatClock(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function humanizeSlug(value: string) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isYouTubeAsset(value: string) {
  return /youtube\.com|youtu\.be/i.test(value);
}

function isMissingProductionSource(clip: TimelineClip) {
  const assetId = sanitizeTrackSource(clip.assetId);
  return !assetId
    || assetId === "unknown-asset"
    || assetId.startsWith("missing-")
    || assetId === "recording-clip-event";
}

function describeClipSource(clip: TimelineClip) {
  const assetId = sanitizeTrackSource(clip.assetId);
  if (!assetId) return "Missing source";
  if (assetId.startsWith("/api/ingest/media/")) return "Vault media";
  if (assetId.startsWith("http://") || assetId.startsWith("https://")) {
    return isYouTubeAsset(assetId) ? "YouTube preview" : "Remote media";
  }
  if (assetId.startsWith("gcs://")) return "GCS media";
  if (assetId.startsWith("missing-") || assetId === "recording-clip-event") return "Placeholder";
  return "Timeline asset";
}

function inferHealthKindFromClip(clip: TimelineClip): MediaSourceHealthKind {
  if (clip.kind === "audio" || isAudioTrackId(clip.trackId)) return "audio";
  if (clip.kind === "video" || isVideoTrackId(clip.trackId)) return "video";
  return inferTrackKindFromSourceUrl(clip.assetId, "video");
}

function healthKindFromImportedAsset(asset: ImportedMediaAsset): MediaSourceHealthKind {
  if (asset.kind === "audio" || asset.contentType.startsWith("audio/")) return "audio";
  if (asset.kind === "video" || asset.contentType.startsWith("video/")) return "video";
  return "unknown";
}

function healthStatusStyles(status: MediaSourceHealthStatus) {
  if (status === "ok") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "warning") return "border-amber-200 bg-amber-50 text-amber-900";
  if (status === "error") return "border-red-200 bg-red-50 text-red-800";
  if (status === "checking") return "border-sky-200 bg-sky-50 text-sky-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function healthStatusLabel(status: MediaSourceHealthStatus) {
  if (status === "ok") return "Healthy";
  if (status === "warning") return "Needs attention";
  if (status === "error") return "Broken";
  if (status === "checking") return "Checking";
  return "Unchecked";
}

function healthSafetyTitle(health: MediaSourceHealth | null | undefined, missing = false) {
  if (missing) return "Not safe yet";
  if (!health) return "Checking safety";
  if (health.status === "checking") return "Checking safety";
  if (health.status === "error") return "Not safe yet";
  if (health.renderUsable) return "Safe for export";
  if (health.previewUsable) return "Safe to edit";
  if (health.reachable) return "Needs review";
  return "Not safe yet";
}

function healthNextAction(health: MediaSourceHealth | null | undefined, missing = false) {
  if (missing) return "Attach or replace the source before previewing or exporting.";
  if (!health || health.status === "checking") return "Keep working. Quipsly is checking this source in the background.";
  if (health.renderUsable) return "You can edit and export with this source.";
  if (health.previewUsable) return "You can keep editing. Before final export, replace this with a renderable file.";
  if (health.reachable) return "The file responds, but Quipsly cannot use it confidently yet. Recheck or replace it.";
  return "Relink, replace, or park this file so it stops blocking the edit.";
}

function assetSyncTargetSummary(asset: ImportedMediaAsset, selectedClip: TimelineClip | null, spine: EpisodeSpineAudio | null) {
  if (spine?.assetId === asset.id || spine?.assetId === asset.sourceId) return "Synced to: episode spine audio";
  if (asset.sync?.targetClipId) return `Synced to clip: ${asset.sync.targetClipId.slice(0, 8)}`;
  if (typeof asset.sync?.anchorTimelineSeconds === "number") return `Lined up at: ${formatClock(asset.sync.anchorTimelineSeconds)}`;
  if (selectedClip) return `Selected clip ready: ${selectedClip.name}`;
  return "Not attached to a timeline clip yet";
}

function assetNextAction(asset: ImportedMediaAsset, health: MediaSourceHealth | null, spine: EpisodeSpineAudio | null) {
  if (asset.sync?.status === "held") return "Parked for later. It will not demand attention until you unpark it.";
  if ((asset.kind === "audio" || asset.contentType.startsWith("audio/")) && !spine?.assetId && !spine?.clipId) {
    return "If this is the main recording, make it the spine audio first.";
  }
  if (health?.status === "error") return "Relink/replace it or park it so the edit stays calm.";
  if (!asset.sync?.targetClipId && typeof asset.sync?.anchorTimelineSeconds !== "number") return "Add it to the timeline, attach it to the selected clip, or line it up at the playhead.";
  if (asset.sync?.status === "synced") return "This file is marked lined up. Keep editing or save the timeline.";
  return "If it looks right at the current playhead, mark it lined up.";
}

function mediaHealthFallback(item: MediaHealthProbeItem, status: MediaSourceHealthStatus, note: string): MediaSourceHealth {
  return {
    id: item.id,
    label: item.label,
    sourceUrl: item.sourceUrl,
    status,
    reachable: false,
    playable: false,
    previewUsable: false,
    renderUsable: false,
    kind: item.expectedKind,
    expectedKind: item.expectedKind,
    detectedKind: "unknown",
    contentType: item.contentType ?? "application/octet-stream",
    size: item.size ?? 0,
    note,
  };
}

function mediaHealthSummary(results: MediaSourceHealth[]) {
  const checked = results.filter((item) => item.status !== "unchecked" && item.status !== "checking");
  const checking = results.filter((item) => item.status === "checking").length;
  const healthy = checked.filter((item) => item.status === "ok").length;
  const warnings = checked.filter((item) => item.status === "warning").length;
  const broken = checked.filter((item) => item.status === "error").length;
  const previewUsable = checked.filter((item) => item.previewUsable).length;
  const renderUsable = checked.filter((item) => item.renderUsable).length;

  return {
    total: results.length,
    checked: checked.length,
    checking,
    healthy,
    warnings,
    broken,
    previewUsable,
    renderUsable,
  };
}

function eventDuration(event: RecordingSessionEvent) {
  const match = (event.label ?? "").match(/(\d+(?::\d+){0,2}(?:\.\d+)?)\s*-\s*(\d+(?::\d+){0,2}(?:\.\d+)?|open)/i);
  if (!match || match[2] === "open") return 8;
  const start = parseTimeToSeconds(match[1]);
  const end = parseTimeToSeconds(match[2], start + 8);
  return end > start ? end - start : 8;
}

function buildTrackAllocator(existingTrackIds: string[]) {
  const used = new Set(existingTrackIds.map((id) => coerceString(id, "").trim().toUpperCase()));
  const highestIndexByKind = {
    audio: 0,
    video: 0,
  };

  used.forEach((trackId) => {
    const match = /^([VA])(\d+)(?:\.\d+)?$/.exec(trackId);
    if (!match) return;
    const kind = match[1] === TRACK_PREFIX_VIDEO ? "video" : "audio";
    const index = Number.parseInt(match[2], 10);
    if (Number.isFinite(index)) {
      highestIndexByKind[kind] = Math.max(highestIndexByKind[kind], index);
    }
  });

  const next = (kind: SessionTrackKind) => {
    const prefix = kind === "video" ? TRACK_PREFIX_VIDEO : TRACK_PREFIX_AUDIO;
    let index = highestIndexByKind[kind] + 1;
    while (used.has(`${prefix}${index}`)) {
      index += 1;
    }
    const trackId = `${prefix}${index}`;
    used.add(trackId);
    highestIndexByKind[kind] = index;
    return trackId;
  };

  return { next };
}

function sanitizeSegmentSource(raw: unknown, fallback = "") {
  return sanitizeLegacyAssetId(raw, fallback);
}

function buildSegmentTrackClips(session: RecordingSessionPackage, trackAllocator: { next: (kind: SessionTrackKind) => string }) {
  const usedTrackIds = new Map<string, string>();
  let cursor = 0.5;
  const sortedClips = [...(session.clips ?? [])];
  const deterministicSortedClips = [...sortedClips].sort((a, b) => {
    const aOrder = coerceOptionalString(a.id, "").localeCompare(coerceOptionalString(b.id, ""));
    if (aOrder !== 0) return aOrder;
    return coerceOptionalString(a.title, "").localeCompare(coerceOptionalString(b.title, ""));
  });

  const segmentClips = deterministicSortedClips.flatMap((clip, clipIndex) => {
    const clipId = coerceOptionalString(clip.id, `${RECORDER_SEGMENT_PREFIX}-${clipIndex}`);
    const sourceUrl = sanitizeSegmentSource(clip.url, "");
    const segmentKind = inferTrackKindFromSourceUrl(sourceUrl, "video");
    const cacheKey = `${segmentKind}::${sourceUrl || clipId}`;

    const trackId = usedTrackIds.get(cacheKey)
      || trackAllocator.next(segmentKind);
    usedTrackIds.set(cacheKey, trackId);

    const orderedSegments = [...(clip.segments?.length ? clip.segments : [{ id: makeId("segment"), start: "", end: "", note: "" }])]
      .sort((a, b) => {
        const aStart = normalizeSegmentTime(a.start, 0);
        const bStart = normalizeSegmentTime(b.start, 0);
        if (aStart !== bStart) return aStart - bStart;
        const aLabel = coerceOptionalString((a as any).id, "0");
        const bLabel = coerceOptionalString((b as any).id, "0");
        return aLabel.localeCompare(bLabel);
      });

    return orderedSegments.map((segment, segmentIndex) => {
      const range = sanitizeSegmentRange(segment);
      const duration = range.duration;
      const timelineStart = Math.max(0, cursor);
      cursor = Math.max(0, cursor + duration + RECORDER_SEGMENT_GAP_SECONDS);
      const timelineEnd = timelineStart + duration;

      return {
        id: `clip-segment-${clipId}-${segmentIndex}-${range.sourceStart.toFixed(3)}`,
        assetId: sourceUrl || `missing-segment-source-${clipId}`,
        trackId,
        startIn: timelineStart,
        sourceStart: range.sourceStart,
        sourceEnd: roundSeconds(range.sourceEnd),
        kind: segmentKind,
        name: `${clip.title || "Clip"} ${segmentIndex + 1}${segment.note ? ` — ${segment.note}` : ""} (${formatClock(range.sourceStart)}-${formatClock(range.sourceEnd)})`,
        color: segmentKind === "video" ? "#7c3aed" : "#a855f7",
        duration: Math.max(range.duration, Math.max(RECORDER_SEGMENT_MIN_DURATION_SECONDS, timelineEnd - timelineStart)),
      } satisfies TimelineClip;
    });
  });

  return segmentClips.filter((clip) => clip.duration > 0);
}

function sessionPackageToTimeline(session: RecordingSessionPackage): TimelineState {
  const events = [...(session.events ?? [])].sort((a, b) => (a.atMs ?? 0) - (b.atMs ?? 0));
  const sessionTrackClips = buildSessionTrackClips(session);
  const sessionTrackTimelineEnd = sessionTrackClips.reduce((cursor, clip) => Math.max(cursor, clip.startIn + clip.duration), 0);
  const duration = Math.max(
    30,
    sessionTrackTimelineEnd,
    (session.durationMs ?? 0) / 1000,
    ...events.map((event) => ((event.atMs ?? 0) / 1000) + 10),
  );
  const hasSessionTrackClips = sessionTrackClips.length > 0;
  const usedTrackIds = sessionTrackClips.map((clip) => coerceString(clip.trackId, ""));
  const trackAllocator = buildTrackAllocator([SESSION_EVENT_TRACK, ...usedTrackIds]);
  const segmentClips = buildSegmentTrackClips(session, trackAllocator);

  const clips: TimelineClip[] = hasSessionTrackClips
    ? [...sessionTrackClips, ...segmentClips]
    : [{
      id: `session-${session.episodeSlug || session.roomName || "session"}-spine`,
      assetId: "",
      kind: "audio",
      trackId: DEFAULT_AUDIO_TRACK,
      startIn: 0,
      duration,
      sourceStart: 0,
      sourceEnd: roundSeconds(duration),
      name: `${session.episodeLabel ?? session.roomName ?? "Recording"} audio spine (placeholder)`,
      color: "#047857",
    }];

  const clipEvents = events.filter((event) => event.kind === "clip");
  const clipEventTimelineClips = clipEvents.map((event, index) => ({
    id: `clip-event-${event.id ?? index}`,
    assetId: "recording-clip-event",
    trackId: SESSION_EVENT_TRACK,
    startIn: (event.atMs ?? 0) / 1000,
    duration: eventDuration(event),
    sourceStart: 0,
    sourceEnd: roundSeconds((event.atMs ?? 0) / 1000 + eventDuration(event)),
    kind: "video",
    name: event.label ?? `Clip cue ${index + 1}`,
    color: "#d97706",
  } satisfies TimelineClip));

  clips.push(...clipEventTimelineClips);

  const markerEvents = events.filter((event) => event.kind !== "session");
  const transcript: TranscriptBlock[] = markerEvents.length
    ? markerEvents.map((event, index) => ({
        id: `event-${event.id ?? index}`,
        time: (event.atMs ?? 0) / 1000,
        duration: event.kind === "clip" ? eventDuration(event) : 4,
        text: `[${event.kind ?? "marker"}] ${event.label ?? "Untitled event"}${event.note ? ` - ${event.note}` : ""}`,
        deleted: false,
        alert: event.kind === "retake" ? "Retake" : event.kind === "clip" ? "Clip Cue" : null,
      }))
    : [
        {
          id: "session-script",
          time: 0,
          duration,
          text: session.script?.slice(0, 260) || `${session.roomName ?? "Recording"} session imported.`,
          deleted: false,
          alert: null,
        },
      ];

  return {
    clips: clips.sort((a, b) => a.startIn - b.startIn),
    transcript,
  };
}

async function postEpisodeProduction(payload: Record<string, unknown>, options: { signal?: AbortSignal } = {}): Promise<EpisodeProductionState> {
  const response = await fetch("/api/episode-production", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: options.signal,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok && data?.mode !== "conflict") {
    throw new Error(data?.message || data?.error || `Episode production returned ${response.status}`);
  }
  return data as EpisodeProductionState;
}

function transcriptWordTimings(block: TranscriptBlock) {
  const tokens = block.text.match(/\S+\s*/g) ?? [block.text];
  const wordCount = Math.max(1, tokens.filter((token) => token.trim()).length);
  const secondsPerWord = block.duration / wordCount;
  let spokenWordIndex = 0;

  return tokens.map((token, index) => {
    const text = token.trim();
    if (!text) {
      return {
        id: `${block.id}-space-${index}`,
        text: token,
        start: block.time,
        end: block.time,
      };
    }

    const start = block.time + spokenWordIndex * secondsPerWord;
    const end = start + secondsPerWord;
    spokenWordIndex += 1;

    return {
      id: `${block.id}-word-${index}`,
      text: token,
      start,
      end,
    };
  });
}

function buildEpisodeArtifactPayload(
  timeline: TimelineState,
  projectSlug: string,
  episodeSlug: string,
  generatedFrom: string,
  savedAt: string,
): EpisodeArtifact {
  const contentFingerprint = timelineContentFingerprint(timeline);
  return {
    payloadVersion: EPISODE_ARTIFACT_PAYLOAD_VERSION,
    projectSlug,
    episodeSlug,
    source: "quipsly-editor",
    timelineClips: timeline.clips.map((clip) => ({
      id: clip.id,
      assetId: clip.assetId,
      trackId: clip.trackId,
      startIn: roundSeconds(clip.startIn),
      duration: roundSeconds(Math.max(clip.duration, 0.05)),
      sourceStart: roundSeconds(Math.max(clip.sourceStart, 0)),
      sourceEnd: roundSeconds(Math.max(clip.sourceEnd ?? (clip.sourceStart + clip.duration), clip.sourceStart + 0.05, clip.sourceStart)),
      name: clip.name,
      color: clip.color,
      kind: clip.kind,
    })),
    transcript: timeline.transcript.map((block) => ({
      id: block.id,
      time: roundSeconds(Math.max(block.time, 0)),
      duration: roundSeconds(Math.max(block.duration, 0.05)),
      text: block.text,
      deleted: Boolean(block.deleted),
      alert: block.alert ?? null,
    })),
    paperEditSnapshots: timeline.paperEditSnapshots,
    contentFingerprint,
    generatedFrom,
    savedAt,
    generatedAt: savedAt,
  };
}

function timelineContentFingerprint(timeline: TimelineState): string {
  const sortedClips = [...timeline.clips]
    .map((clip) => ({
      id: clip.id,
      assetId: clip.assetId,
      trackId: clip.trackId,
      startIn: roundSeconds(clip.startIn),
      duration: roundSeconds(Math.max(clip.duration, 0.05)),
      sourceStart: roundSeconds(Math.max(clip.sourceStart, 0)),
      sourceEnd: roundSeconds(Math.max(clip.sourceEnd ?? (clip.sourceStart + clip.duration), clip.sourceStart)),
      name: clip.name,
      color: clip.color,
      kind: clip.kind,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const sortedTranscript = [...timeline.transcript]
    .map((block) => ({
      id: block.id,
      time: roundSeconds(Math.max(block.time, 0)),
      duration: roundSeconds(Math.max(block.duration, 0.05)),
      text: block.text,
      deleted: Boolean(block.deleted),
      alert: block.alert ?? null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const sortedSnapshots = Object.entries(timeline.paperEditSnapshots ?? {})
    .map(([blockId, snapshot]) => ({
      blockId,
      clips: snapshot.clips
        .map((clip) => ({
          id: clip.id,
          assetId: clip.assetId,
          trackId: clip.trackId,
          startIn: roundSeconds(clip.startIn),
          duration: roundSeconds(Math.max(clip.duration, 0.05)),
          sourceStart: roundSeconds(Math.max(clip.sourceStart, 0)),
          sourceEnd: roundSeconds(Math.max(clip.sourceEnd ?? (clip.sourceStart + clip.duration), clip.sourceStart)),
          name: clip.name,
          color: clip.color,
          kind: clip.kind,
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      transcript: snapshot.transcript
        .map((block) => ({
          id: block.id,
          time: roundSeconds(Math.max(block.time, 0)),
          duration: roundSeconds(Math.max(block.duration, 0.05)),
          text: block.text,
          deleted: Boolean(block.deleted),
          alert: block.alert ?? null,
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    }))
    .sort((a, b) => a.blockId.localeCompare(b.blockId));

  return JSON.stringify({
    clips: sortedClips,
    transcript: sortedTranscript,
    paperEditSnapshots: sortedSnapshots,
  });
}

function splitAssetRef(raw: string) {
  const trim = raw.trim();
  if (!trim) return "";
  return trim.replace(/^["'`]/, "").replace(/["'`]$/, "").trim();
}

function findAssetByReference(ref: string, assets: ImportedMediaAsset[]) {
  const candidate = splitAssetRef(ref);
  if (!candidate) return null;
  const normalized = candidate.toLowerCase();
  const directMatch = assets.find((asset) =>
    asset.id === candidate || asset.sourceId === candidate || asset.playbackUrl === candidate || asset.gcsUri === candidate
  );
  if (directMatch) return directMatch;

  const slugMatch = assets.find((asset) => {
    const lowerName = asset.originalName.toLowerCase();
    return lowerName === normalized || lowerName.includes(normalized) || normalized.includes(lowerName);
  });
  return slugMatch ?? null;
}

function parseCoPilotCommand(input: string): EditorCoPilotParse {
  const commandText = input.trim();
  if (!commandText) {
    return {
      commandText,
      parsed: { type: "n/a", command: input },
    };
  }

  const lower = commandText.toLowerCase();
  const sourceUrl = /^(?:import|register|add)\s+(?:a\s+)?(?:source|clip|url)\s+(.+)$/i;
  const urlMatch = commandText.match(/https?:\/\/\S+/);

  if (/^\s*(help|\?|commands?)\s*$/i.test(lower)) {
    return { commandText, parsed: { type: "help", command: commandText } };
  }

  if (/\bundo\b.*\b(sync|change|action|last)\b/i.test(lower)) {
    return { commandText, parsed: { type: "undo-last-change", command: commandText } };
  }

  if (/\bsave\b.*\btimeline\b/i.test(lower) || /^\s*save(ed)?\s*$/i.test(lower)) {
    return { commandText, parsed: { type: "save-timeline", command: commandText } };
  }

  if (/\b(refresh|reload|reopen|re-hydrate|reopen)\b/i.test(lower)) {
    return { commandText, parsed: { type: "refresh-state", command: commandText } };
  }

  if (/\borgani(z|s)e\b/i.test(lower)) {
    return { commandText, parsed: { type: "organize", command: commandText } };
  }

  const sourceMatch = commandText.match(sourceUrl);
  if (sourceMatch) {
    const nextRef = splitAssetRef(sourceMatch[1]);
    return {
      commandText,
      parsed: {
        type: "source-url",
        command: commandText,
        sourceUrl: nextRef,
        sourceTitle: `Imported from co-pilot`,
      },
    };
  }

  const addMatch = commandText.match(/^(?:add|place|append)\s+(.+?)\s+(?:to|onto|onto the)\s+(?:timeline|the\s+timeline)$/i);
  if (addMatch) {
    return {
      commandText,
      parsed: {
        type: "add-to-timeline",
        command: commandText,
        assetRef: splitAssetRef(addMatch[1]),
      },
    };
  }

  const attachMatch = commandText.match(/^(?:attach|link|connect|use)\s+(.+?)\s+(?:to|onto|on)\s+(?:the\s+)?selected\s+clip/i);
  if (attachMatch) {
    return {
      commandText,
      parsed: {
        type: "attach-to-selected",
        command: commandText,
        assetRef: splitAssetRef(attachMatch[1]),
      },
    };
  }

  const spineMatch = commandText.match(/^(?:set|make)\s+(.+?)\s+(?:as|the|to\s+the)?\s*(?:spine|episode\s+spine|main|main\s+audio)$/i);
  if (spineMatch) {
    return {
      commandText,
      parsed: {
        type: "set-spine-audio",
        command: commandText,
        assetRef: splitAssetRef(spineMatch[1]),
      },
    };
  }

  const markMatch = commandText.match(/^(?:mark|set|line|lined|flag)\s+(.+?)\s+(?:as\s+)?(synced|ready-to-sync|ready to sync|safe|held|parked)$/i);
  if (markMatch) {
    const status = markMatch[2].toLowerCase();
    return {
      commandText,
      parsed: {
        type: "set-sync-status",
        command: commandText,
        assetRef: splitAssetRef(markMatch[1]),
        status: status === "safe"
          ? "ready-to-sync"
          : status === "parked"
            ? "held"
            : status === "held" || status === "synced"
              ? status
              : "ready-to-sync",
      },
    };
  }

  const playheadMatch = commandText.match(/^(?:set|move|jump)\s+(?:playhead|time|cursor)\s+to\s+(\d+(?:\.\d+)?)$/i);
  if (playheadMatch) {
    const value = Number(playheadMatch[1]);
    return {
      commandText,
      parsed: {
        type: "set-playhead",
        command: commandText,
        playheadSeconds: Number.isFinite(value) ? value : 0,
      },
    };
  }

  const transcriptMatch = commandText.match(/^(?:transcript|assist)\s+(.+)$/i);
  if (transcriptMatch) {
    return {
      commandText,
      parsed: {
        type: "transcript-assist",
        command: commandText,
        assetRef: splitAssetRef(transcriptMatch[1]),
      },
    };
  }

  const queueMatch = commandText.match(/^(?:queue|enqueue)\s+(\w+(?:-\w+)?)\s+for\s+(.+)$/i);
  if (queueMatch) {
    const rawJob = queueMatch[1].toLowerCase();
    return {
      commandText,
      parsed: {
        type: "queue-job",
        command: commandText,
        assetRef: splitAssetRef(queueMatch[2]),
        jobType: normalizeMediaAnalysisJobType(rawJob),
      },
    };
  }

  const suggestionMatch = commandText.match(/^(?:apply|accept)\s+(?:suggestion|ai)\s+(?:for|to)\s+(.+)$/i);
  if (suggestionMatch) {
    return {
      commandText,
      parsed: { type: "apply-suggestion", command: commandText, assetRef: splitAssetRef(suggestionMatch[1]) },
    };
  }

  if (urlMatch && /https?:\/\/\S+/.test(commandText)) {
    return {
      commandText,
      parsed: {
        type: "source-url",
        command: commandText,
        sourceUrl: urlMatch[0],
      },
    };
  }

  return {
    commandText,
    parsed: {
      type: "n/a",
      command: commandText,
    },
  };
}

function CloudEditorContent() {
  const [currentTime, setCurrentTime] = useState(0);
  const [viewMode, setViewMode] = useState<"timeline" | "transcript" | "reframe" | "segmenter">("timeline");
  const [isExporting, setIsExporting] = useState(false);
  const [sessionSummary, setSessionSummary] = useState<string | null>(null);
  const [productionState, setProductionState] = useState<EpisodeProductionState | null>(null);
  const [isImportingMedia, setIsImportingMedia] = useState(false);
  const [isAiOrganizingMedia, setIsAiOrganizingMedia] = useState(false);
  const [applyingAiSuggestionIds, setApplyingAiSuggestionIds] = useState<Set<string>>(() => new Set());
  const [transcriptAssistingAssetIds, setTranscriptAssistingAssetIds] = useState<Set<string>>(() => new Set());
  const [queueingMediaJobKeys, setQueueingMediaJobKeys] = useState<Set<string>>(() => new Set());
  const [mediaImportStatus, setMediaImportStatus] = useState<string | null>(null);
  const [editorCoPilotInput, setEditorCoPilotInput] = useState("");
  const [editorCoPilotLog, setEditorCoPilotLog] = useState<EditorCoPilotLogEntry[]>([]);
  const [editorCoPilotMessages, setEditorCoPilotMessages] = useState<EditorCoPilotMessage[]>(() => [
    {
      id: makeId("copilot-msg"),
      at: new Date().toISOString(),
      role: "system",
      text: "Editor co-pilot online. I can run editor actions and keep a rollback log for each successful change.",
    },
  ]);
  const [isEditorCoPilotBusy, setIsEditorCoPilotBusy] = useState(false);
  const [sourceClipUrl, setSourceClipUrl] = useState("");
  const [sourceClipTitle, setSourceClipTitle] = useState("");
  const [sourceClipImportStatus, setSourceClipImportStatus] = useState<"idle" | "importing">("idle");
  const [mediaHealthById, setMediaHealthById] = useState<Record<string, MediaSourceHealth>>({});
  const [mediaHealthCheckedAt, setMediaHealthCheckedAt] = useState<string | null>(null);
  const [isCheckingMediaHealth, setIsCheckingMediaHealth] = useState(false);
  const [syncWizardSpineAssetId, setSyncWizardSpineAssetId] = useState("");
  const [syncWizardTargetAssetId, setSyncWizardTargetAssetId] = useState("");
  const [syncWizardAnchorSeconds, setSyncWizardAnchorSeconds] = useState(0);
  const [syncWizardPreviousAnchorSeconds, setSyncWizardPreviousAnchorSeconds] = useState<number | null>(null);
  const [syncPreviewState, setSyncPreviewState] = useState<"idle" | "ready" | "playing" | "paused" | "error">("idle");
  const [syncPreviewMessage, setSyncPreviewMessage] = useState("Pick a spine and target, then preview the current anchor.");
  const [timelineSaveState, setTimelineSaveState] = useState<TimelineSaveState>("idle");
  const [timelineLastSavedAt, setTimelineLastSavedAt] = useState<string | null>(null);
  const [timelineHydrationSource, setTimelineHydrationSource] = useState<TimelineHydrationSource>("loading");
  const [timelineReloadToken, setTimelineReloadToken] = useState(0);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [isTimelineHydrated, setIsTimelineHydrated] = useState(false);
  const hasHydratedProductionTimeline = useRef(false);
  const timelineHydrationRequestRef = useRef(0);
  const timelineAutosaveRequestRef = useRef(0);
  const timelineSaveStateRef = useRef<TimelineSaveState>("idle");
  const timelineAutosaveAbortRef = useRef<AbortController | null>(null);
  const timelineAutosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timelineSavedFingerprintRef = useRef("");
  const timelineRouteRef = useRef("");
  const syncPreviewSpineRef = useRef<HTMLAudioElement | null>(null);
  const syncPreviewTargetRef = useRef<HTMLMediaElement | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project") ?? searchParams.get("projectId");
  const episodeSlug = searchParams.get("episode") ?? searchParams.get("boundary") ?? "current-episode";
  const resolvedProjectSlug = projectId ?? DEFAULT_EDITOR_PROJECT_SLUG;
  const episodeLabel = humanizeSlug(episodeSlug);
  const [realEditingMode, setRealEditingMode] = useState(episodeSlug === "episode-4");

  // The new NLE timeline reducer
  const {
    state: timelineState,
    replaceTimeline,
    addClip,
    toggleDeleteBlock,
    splitClipAt,
    trimClip,
    updateClipSource,
    deleteClip,
    deleteClipAndCloseGap,
    duplicateClip,
    nudgeClip,
    moveClipTo,
    moveClipToTrack,
    renameClip,
    snapClipToPrevious,
    snapClipToNext,
    updateClipTiming,
    compactTrackFromClip,
    pushTrackOverlapsFromClip,
  } = useTimelineState(INITIAL_STATE);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const timelineFingerprint = useMemo(() => timelineContentFingerprint(timelineState), [timelineState]);
  const routeToken = useMemo(() => `${resolvedProjectSlug}::${episodeSlug}`, [resolvedProjectSlug, episodeSlug]);

  const setTimelineSaveStateSafe = (next: TimelineSaveState) => {
    timelineSaveStateRef.current = next;
    setTimelineSaveState(next);
  };

  useEffect(() => {
    hasHydratedProductionTimeline.current = false;
    setIsTimelineHydrated(false);
    timelineSavedFingerprintRef.current = "";
    timelineSaveStateRef.current = "idle";
    setTimelineSaveState("idle");
    setTimelineLastSavedAt(null);
    setTimelineHydrationSource("loading");
    setSelectedClipId(null);
    timelineRouteRef.current = routeToken;
    timelineAutosaveAbortRef.current?.abort();
    if (timelineAutosaveTimerRef.current) {
      clearTimeout(timelineAutosaveTimerRef.current);
      timelineAutosaveTimerRef.current = null;
    }
  }, [episodeSlug, resolvedProjectSlug, routeToken]);

  useEffect(() => {
    if (realEditingMode && viewMode !== "timeline") {
      setViewMode("timeline");
    }
  }, [realEditingMode, viewMode]);

  useEffect(() => {
    const requestId = ++timelineHydrationRequestRef.current;
    const controller = new AbortController();
    const activeRoute = routeToken;

    postEpisodeProduction(
      {
        action: "ensure",
        projectSlug: resolvedProjectSlug,
        episodeSlug,
        title: episodeLabel,
        boundaryLabel: episodeLabel,
        productionJson: {
          surface: "editor",
          projectSlug: resolvedProjectSlug,
          episodeSlug,
        },
      },
      { signal: controller.signal },
    ).then((state) => {
      if (controller.signal.aborted) return;
      if (requestId !== timelineHydrationRequestRef.current) return;
      if (activeRoute !== timelineRouteRef.current) return;

      setProductionState(state);
      if (state.mode === "database") {
        setTimelineSaveStateSafe("idle");
      } else {
        setTimelineSaveStateSafe("fallback");
      }

      if (hasHydratedProductionTimeline.current) return;

      const persistedPayloads: Array<{ label: TimelineHydrationSource; payload: unknown }> = [
        { label: "saved timeline", payload: state.timelineJson },
        { label: "recording room", payload: state.recordingRoomJson },
        { label: "transcript payload", payload: state.transcriptJson },
      ];
      const persistedTimelineEntry = persistedPayloads
        .map((candidate) => ({ label: candidate.label, timeline: extractTimelineFromPayload(candidate.payload) }))
        .find((candidate) => Boolean(candidate.timeline)) as { label: TimelineHydrationSource; timeline: TimelineState } | undefined;

      if (persistedTimelineEntry) {
        const persistedTimeline = persistedTimelineEntry.timeline;
        replaceTimeline(persistedTimeline);
        hasHydratedProductionTimeline.current = true;
        setIsTimelineHydrated(true);
        timelineSavedFingerprintRef.current = timelineContentFingerprint(persistedTimeline);
        const persistedRecord = asObject(state.timelineJson);
        const persistedSavedAt = coerceString(persistedRecord?.savedAt);
        setTimelineLastSavedAt(persistedSavedAt || null);
        setTimelineHydrationSource(persistedTimelineEntry.label);
        setSessionSummary(`Loaded ${state.title} from ${persistedTimelineEntry.label}`);
        setViewMode("timeline");
      } else {
        timelineSavedFingerprintRef.current = timelineContentFingerprint(INITIAL_STATE);
        setTimelineLastSavedAt(null);
        setTimelineHydrationSource("default timeline");
        setSessionSummary(`Using default timeline for ${state.title}`);
      }
      setIsTimelineHydrated(true);
    }).catch((error) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (requestId !== timelineHydrationRequestRef.current) return;
      if (activeRoute !== timelineRouteRef.current) return;
      console.warn("Could not hydrate episode timeline production state.", error);
      setTimelineSaveStateSafe("error");
      setTimelineHydrationSource("error");
      setSessionSummary("Failed to hydrate timeline from server.");
      setIsTimelineHydrated(true);
    });

    return () => {
      controller.abort();
    };
  }, [episodeLabel, episodeSlug, resolvedProjectSlug, routeToken, timelineReloadToken]);

  useEffect(() => {
    const handleSyncDeckTimelineSave = (event: Event) => {
      const detail = (event as CustomEvent<{ timelineJson?: unknown; state?: EpisodeProductionState }>).detail;
      const nextTimeline = extractTimelineFromPayload(detail?.timelineJson ?? detail?.state?.timelineJson);
      if (!nextTimeline) return;

      replaceTimeline(nextTimeline);
      timelineSavedFingerprintRef.current = timelineContentFingerprint(nextTimeline);
      setProductionState(detail?.state ?? null);
      setTimelineLastSavedAt(new Date().toISOString());
      setTimelineSaveStateSafe("saved");
      setSessionSummary("Sync Deck cut added to timeline");
      setIsTimelineHydrated(true);
      setViewMode("timeline");
    };

    window.addEventListener("quipsly:timeline-json-saved", handleSyncDeckTimelineSave);
    return () => window.removeEventListener("quipsly:timeline-json-saved", handleSyncDeckTimelineSave);
  }, [replaceTimeline]);

  const handleExportToQueue = async () => {
    setIsExporting(true);
    await submitRenderJob("The AI Revolution (Final Cut)", timelineState);
    setIsExporting(false);
    router.push("/render-queue");
  };

  const buildTimelineArtifact = useCallback((generatedFrom: string, savedAt: string): EpisodeArtifact => {
    return buildEpisodeArtifactPayload(timelineState, resolvedProjectSlug, episodeSlug, generatedFrom, savedAt);
  }, [resolvedProjectSlug, episodeSlug, timelineState]);

  const saveTimelineEpisodeProduction = useCallback(async (mode: "manual" | "auto") => {
    if (!productionState) {
      setTimelineSaveStateSafe("error");
      return;
    }

    if (productionState.mode !== "database") {
      setTimelineSaveStateSafe("conflict");
      return;
    }

    const requestId = ++timelineAutosaveRequestRef.current;
    const activeRoute = routeToken;
    const capturedFingerprint = timelineFingerprint;
    const savedAt = new Date().toISOString();
    const episodeArtifact = buildTimelineArtifact(
      mode === "manual" ? "editor-save-manual" : "editor-autosave",
      savedAt,
    );
    const controller = new AbortController();

    timelineAutosaveAbortRef.current?.abort();
    timelineAutosaveAbortRef.current = controller;
    setTimelineSaveStateSafe("saving");

    try {
      const state = await postEpisodeProduction(
        {
          action: "save-timeline",
          productionId: productionState.id,
          projectSlug: resolvedProjectSlug,
          episodeSlug,
          timelineJson: episodeArtifact,
          transcriptJson: episodeArtifact,
          expectedTimelineFingerprint: timelineSavedFingerprintRef.current || undefined,
        },
        { signal: controller.signal },
      );

      if (controller.signal.aborted) return;
      if (requestId !== timelineAutosaveRequestRef.current) return;
      if (activeRoute !== timelineRouteRef.current) return;
      if (capturedFingerprint !== timelineFingerprint) return;

      setProductionState(state);
      if (state.mode === "database") {
        timelineSavedFingerprintRef.current = capturedFingerprint;
        setTimelineLastSavedAt(savedAt);
        setTimelineSaveStateSafe("saved");
      } else if (state.mode === "conflict") {
        setTimelineSaveStateSafe("conflict");
        console.warn("Conflict detected. Server timeline has diverged.");
      } else {
        setTimelineSaveStateSafe("conflict");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (requestId !== timelineAutosaveRequestRef.current) return;
      console.warn("Could not save timeline state.", error);
      setTimelineSaveStateSafe("error");
    }
  }, [
    buildTimelineArtifact,
    episodeSlug,
    productionState,
    resolvedProjectSlug,
    routeToken,
    timelineFingerprint,
  ]);

  const handleSaveEpisodeTimeline = async () => {
    await saveTimelineEpisodeProduction("manual");
  };

  const handleRefreshProductionState = () => {
    const hasUnsavedLocalChanges = timelineFingerprint !== timelineSavedFingerprintRef.current;
    if (
      hasUnsavedLocalChanges
      && !window.confirm("Reload this episode from the database? Unsaved local timeline changes will be replaced.")
    ) {
      return;
    }

    hasHydratedProductionTimeline.current = false;
    setIsTimelineHydrated(false);
    setTimelineHydrationSource("loading");
    setSessionSummary("Refreshing episode production state...");
    setTimelineReloadToken((token) => token + 1);
  };

  useEffect(() => {
    if (!isTimelineHydrated) return;
    if (!productionState) {
      setTimelineSaveStateSafe("idle");
      return;
    }
    if (productionState.mode !== "database") {
      setTimelineSaveStateSafe("fallback");
      return;
    }
    if (timelineFingerprint === timelineSavedFingerprintRef.current) {
      if (["saving", "queued"].includes(timelineSaveStateRef.current)) {
        setTimelineSaveStateSafe("saved");
      } else if (timelineLastSavedAt) {
        setTimelineSaveStateSafe("saved");
      } else {
        setTimelineSaveStateSafe("idle");
      }
      return;
    }

    if (timelineAutosaveTimerRef.current) {
      clearTimeout(timelineAutosaveTimerRef.current);
      timelineAutosaveTimerRef.current = null;
    }

    setTimelineSaveStateSafe("queued");

    const activeRoute = routeToken;
    timelineAutosaveTimerRef.current = setTimeout(() => {
      void saveTimelineEpisodeProduction("auto");
    }, 900);

    return () => {
      if (timelineAutosaveTimerRef.current && activeRoute === timelineRouteRef.current) {
        clearTimeout(timelineAutosaveTimerRef.current);
      }
      timelineAutosaveTimerRef.current = null;
      timelineAutosaveAbortRef.current?.abort();
    };
  }, [isTimelineHydrated, productionState, timelineFingerprint, saveTimelineEpisodeProduction, timelineLastSavedAt, routeToken]);

  const selectedClip = useMemo(() => {
    return timelineState.clips.find((clip) => clip.id === selectedClipId) ?? timelineState.clips[0] ?? null;
  }, [selectedClipId, timelineState.clips]);

  const importedMediaAssets = useMemo(() => {
    return normalizeImportedMediaAssets(productionState?.productionJson);
  }, [productionState?.productionJson]);

  const aiIngestReport = useMemo(() => {
    return normalizeAiIngestReport(productionState?.productionJson);
  }, [productionState?.productionJson]);

  const transcriptAssistReports = useMemo(() => {
    return normalizeTranscriptAssistReports(productionState?.productionJson);
  }, [productionState?.productionJson]);

  const transcriptAssistReportsByAsset = useMemo(() => {
    const map = new Map<string, TranscriptAssistReport>();
    transcriptAssistReports.forEach((report) => {
      if (!map.has(report.assetId)) map.set(report.assetId, report);
      if (report.sourceId && !map.has(report.sourceId)) map.set(report.sourceId, report);
    });
    return map;
  }, [transcriptAssistReports]);

  const mediaAnalysisJobs = useMemo(() => {
    return normalizeMediaAnalysisJobs(productionState?.productionJson);
  }, [productionState?.productionJson]);

  const mediaAnalysisJobsByAsset = useMemo(() => {
    const map = new Map<string, MediaAnalysisJob[]>();
    mediaAnalysisJobs.forEach((job) => {
      const jobs = map.get(job.assetId) ?? [];
      jobs.push(job);
      map.set(job.assetId, jobs);
    });
    return map;
  }, [mediaAnalysisJobs]);

  const aiIngestRecommendationsByAsset = useMemo(() => {
    const recommendations = new Map<string, AiIngestRecommendation>();
    aiIngestReport?.recommendations.forEach((recommendation) => {
      recommendations.set(recommendation.assetId, recommendation);
    });
    return recommendations;
  }, [aiIngestReport]);

  const syncHistory = useMemo(() => {
    return normalizeSyncHistory(productionState?.productionJson);
  }, [productionState?.productionJson]);

  const latestSyncSnapshot = syncHistory[0] ?? null;

  const importedAudioAssets = useMemo(() => {
    return importedMediaAssets.filter((asset) => asset.kind === "audio" || asset.contentType.startsWith("audio/"));
  }, [importedMediaAssets]);

  const persistedSpineAudio = useMemo(() => {
    return normalizeEpisodeSpineAudio(productionState?.productionJson);
  }, [productionState?.productionJson]);

  const timelineAudioClips = useMemo(() => {
    return timelineState.clips.filter((clip) => clip.kind === "audio" || isAudioTrackId(clip.trackId));
  }, [timelineState.clips]);

  const syncWizardSpineAsset = useMemo(() => {
    return importedMediaAssets.find((asset) => asset.id === syncWizardSpineAssetId || asset.sourceId === syncWizardSpineAssetId) ?? null;
  }, [importedMediaAssets, syncWizardSpineAssetId]);

  const persistedSpineImportedAsset = useMemo(() => {
    if (!persistedSpineAudio?.assetId) return null;
    return importedMediaAssets.find((asset) =>
      asset.id === persistedSpineAudio.assetId || asset.sourceId === persistedSpineAudio.assetId
    ) ?? null;
  }, [importedMediaAssets, persistedSpineAudio?.assetId]);

  const persistedSpineTimelineClip = useMemo(() => {
    if (!persistedSpineAudio?.clipId) return null;
    return timelineState.clips.find((clip) => clip.id === persistedSpineAudio.clipId) ?? null;
  }, [persistedSpineAudio?.clipId, timelineState.clips]);

  const activeSpineAudioLabel = persistedSpineImportedAsset?.originalName
    ?? persistedSpineTimelineClip?.name
    ?? persistedSpineAudio?.label
    ?? syncWizardSpineAsset?.originalName
    ?? "No spine audio set";

  const syncWizardTargetAsset = useMemo(() => {
    return importedMediaAssets.find((asset) => asset.id === syncWizardTargetAssetId || asset.sourceId === syncWizardTargetAssetId) ?? null;
  }, [importedMediaAssets, syncWizardTargetAssetId]);

  const syncWizardTargetOptions = useMemo(() => {
    return importedMediaAssets.filter((asset) => asset.id !== syncWizardSpineAsset?.id);
  }, [importedMediaAssets, syncWizardSpineAsset]);

  const mediaHealthProbeItems = useMemo(() => {
    const items = new Map<string, MediaHealthProbeItem>();

    importedMediaAssets.forEach((asset) => {
      const sourceUrl = sanitizeTrackSource(asset.playbackUrl || asset.gcsUri);
      if (!sourceUrl) return;
      items.set(`asset:${asset.id}`, {
        id: `asset:${asset.id}`,
        label: asset.originalName,
        sourceUrl,
        expectedKind: healthKindFromImportedAsset(asset),
        contentType: asset.contentType,
        size: asset.size,
      });
    });

    timelineState.clips.forEach((clip) => {
      const sourceUrl = sanitizeTrackSource(clip.assetId);
      if (!sourceUrl || isMissingProductionSource(clip)) return;
      items.set(`clip:${clip.id}`, {
        id: `clip:${clip.id}`,
        label: `${clip.trackId} ${clip.name}`,
        sourceUrl,
        expectedKind: inferHealthKindFromClip(clip),
      });
    });

    return Array.from(items.values());
  }, [importedMediaAssets, timelineState.clips]);

  const mediaHealthProbeSignature = useMemo(() => {
    return JSON.stringify(mediaHealthProbeItems.map((item) => [
      item.id,
      item.sourceUrl,
      item.expectedKind,
      item.contentType ?? "",
      item.size ?? 0,
    ]));
  }, [mediaHealthProbeItems]);

  const refreshMediaHealth = useCallback(async () => {
    if (!mediaHealthProbeItems.length) {
      setMediaHealthById({});
      setMediaHealthCheckedAt(null);
      setIsCheckingMediaHealth(false);
      return;
    }

    setIsCheckingMediaHealth(true);
    setMediaHealthById((previous) => {
      const next: Record<string, MediaSourceHealth> = {};
      mediaHealthProbeItems.forEach((item) => {
        next[item.id] = previous[item.id]
          ? { ...previous[item.id], status: "checking" }
          : mediaHealthFallback(item, "checking", "Waiting for lightweight source probe.");
      });
      return next;
    });

    try {
      const response = await fetch("/api/episode-production/media-health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: mediaHealthProbeItems }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `Media health check failed with HTTP ${response.status}`);
      }

      const results = coerceArray<MediaSourceHealth>(payload.results);
      setMediaHealthById(Object.fromEntries(results.map((result) => [result.id, result])));
      setMediaHealthCheckedAt(coerceString(payload.checkedAt, new Date().toISOString()));
    } catch (error) {
      console.warn("Could not check media source health.", error);
      setMediaHealthById(Object.fromEntries(
        mediaHealthProbeItems.map((item) => [
          item.id,
          mediaHealthFallback(item, "error", error instanceof Error ? error.message : "Media health check failed."),
        ]),
      ));
      setMediaHealthCheckedAt(new Date().toISOString());
    } finally {
      setIsCheckingMediaHealth(false);
    }
  }, [mediaHealthProbeItems]);

  useEffect(() => {
    void refreshMediaHealth();
  }, [mediaHealthProbeSignature]);

  const importedAssetHealth = useCallback((asset: ImportedMediaAsset) => {
    return mediaHealthById[`asset:${asset.id}`] ?? null;
  }, [mediaHealthById]);

  const timelineClipHealth = useCallback((clip: TimelineClip) => {
    return mediaHealthById[`clip:${clip.id}`] ?? null;
  }, [mediaHealthById]);

  const mediaHealthResults = useMemo(() => Object.values(mediaHealthById), [mediaHealthById]);
  const mediaHealthStats = useMemo(() => mediaHealthSummary(mediaHealthResults), [mediaHealthResults]);

  useEffect(() => {
    if (persistedSpineAudio?.assetId && syncWizardSpineAssetId !== persistedSpineAudio.assetId) {
      setSyncWizardSpineAssetId(persistedSpineAudio.assetId);
      return;
    }
    if (!syncWizardSpineAssetId && importedAudioAssets[0]) {
      setSyncWizardSpineAssetId(importedAudioAssets[0].id);
    }
  }, [importedAudioAssets, persistedSpineAudio?.assetId, syncWizardSpineAssetId]);

  useEffect(() => {
    if (!syncWizardTargetAssetId && importedMediaAssets.length > 0) {
      const firstTarget = importedMediaAssets.find((asset) => asset.kind === "video") ?? importedMediaAssets.find((asset) => asset.id !== syncWizardSpineAssetId) ?? importedMediaAssets[0];
      if (firstTarget) setSyncWizardTargetAssetId(firstTarget.id);
    }
  }, [importedMediaAssets, syncWizardSpineAssetId, syncWizardTargetAssetId]);

  const handleSessionImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const raw = await file.text();
    const payload = parseJson(raw);
    if (!payload) return;

    const normalizedPayload = normalizeEpisodePayload(payload) ?? payload;
    const session = normalizeRecordingSessionPackage(normalizedPayload);
    if (!session) return;

    replaceTimeline(sessionPackageToTimeline(session));
    setSessionSummary(`${session.roomName ?? file.name}: ${(session.events ?? []).length} events, ${(session.tracks ?? []).length} tracks`);
    setViewMode("timeline");
    event.target.value = "";
  };

  const handleMediaImport = async (event: ChangeEvent<HTMLInputElement>, importRole = "episode-media") => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;

    setIsImportingMedia(true);
    const roleLabel = humanizeSlug(importRole);
    setMediaImportStatus(`Importing ${files.length} ${roleLabel.toLowerCase()} file${files.length === 1 ? "" : "s"} to ${episodeLabel}...`);

    try {
      let importedCount = 0;
      let latestProductionJson = productionState?.productionJson;
      let latestUpdatedAt = productionState?.updatedAt;

      for (const file of files) {
        setMediaImportStatus(`Importing ${file.name} (${importedCount + 1}/${files.length})...`);

        const formData = new FormData();
        formData.append("file", file);
        formData.append("projectSlug", resolvedProjectSlug);
        formData.append("episodeSlug", episodeSlug);
        formData.append("anchorTime", String(roundSeconds(currentTime)));
        formData.append("importRole", importRole);
        if (selectedClip?.id) formData.append("selectedClipId", selectedClip.id);

        const response = await fetch("/api/episode-production/import-media", {
          method: "POST",
          body: formData,
        });

        const payload = await response.json();
        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.error || `Import failed with HTTP ${response.status}`);
        }

        importedCount += 1;
        latestProductionJson = payload.productionJson ?? latestProductionJson;
        latestUpdatedAt = payload.updatedAt ?? latestUpdatedAt;
      }

      setProductionState((previous) => previous
        ? {
          ...previous,
          productionJson: latestProductionJson ?? previous.productionJson,
          updatedAt: latestUpdatedAt ?? previous.updatedAt,
        }
        : previous);
      setMediaImportStatus(`Imported ${importedCount} ${roleLabel.toLowerCase()} file${importedCount === 1 ? "" : "s"}; ready to sync at ${formatClock(currentTime)}.`);
    } catch (error) {
      console.warn("Could not import media into episode production.", error);
      setMediaImportStatus(error instanceof Error ? error.message : "Media import failed.");
    } finally {
      setIsImportingMedia(false);
      event.target.value = "";
    }
  };

  const registerSourceClipUrl = useCallback(async (input: { sourceUrl: string; sourceTitle?: string }) => {
    const sourceUrl = input.sourceUrl.trim();
    const sourceTitle = input.sourceTitle?.trim();
    if (!sourceUrl) {
      setMediaImportStatus("Paste a YouTube/source URL first.");
      return;
    }

    setSourceClipImportStatus("importing");
    setMediaImportStatus(`Registering source clip for ${episodeLabel}...`);

    try {
      const response = await fetch("/api/episode-production/import-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectSlug: resolvedProjectSlug,
          episodeSlug,
          sourceUrl,
          originalName: sourceTitle || sourceClipTitle.trim() || sourceUrl,
          importRole: "source-clip",
          anchorTime: roundSeconds(currentTime),
          selectedClipId: selectedClip?.id,
        }),
      });

      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `Source import failed with HTTP ${response.status}`);
      }

      setProductionState((previous) => previous
        ? {
          ...previous,
          productionJson: payload.productionJson ?? previous.productionJson,
          updatedAt: payload.updatedAt ?? previous.updatedAt,
        }
        : previous);
      if (input.sourceUrl === sourceClipUrl) {
        setSourceClipUrl("");
        setSourceClipTitle("");
      }
      setMediaImportStatus(`Registered source clip; ready to sync at ${formatClock(currentTime)}.`);
    } catch (error) {
      console.warn("Could not register source clip.", error);
      setMediaImportStatus(error instanceof Error ? error.message : "Source clip import failed.");
    } finally {
      setSourceClipImportStatus("idle");
    }
  }, [currentTime, episodeLabel, episodeSlug, resolvedProjectSlug, selectedClip?.id, sourceClipTitle]);

  const handleSourceClipUrlImport = useCallback(async () => {
    await registerSourceClipUrl({ sourceUrl: sourceClipUrl, sourceTitle: sourceClipTitle });
    setSourceClipUrl("");
    setSourceClipTitle("");
  }, [registerSourceClipUrl, sourceClipUrl, sourceClipTitle]);

  const setEpisodeSpineAudio = useCallback(async (
    input: { asset?: ImportedMediaAsset; clip?: TimelineClip },
  ) => {
    const asset = input.asset;
    const clip = input.clip;
    if (!asset && !clip) {
      setMediaImportStatus("Choose an imported audio file or timeline audio clip first.");
      return;
    }

    const label = asset?.originalName ?? clip?.name ?? "Spine audio";
    const source = asset?.playbackUrl ?? clip?.assetId ?? "";
    setMediaImportStatus(`Setting spine audio: ${label}...`);

    try {
      const response = await fetch("/api/episode-production/import-media", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set-spine-audio",
          projectSlug: resolvedProjectSlug,
          episodeSlug,
          spineAudioAssetId: asset?.id ?? asset?.sourceId,
          spineAudioClipId: clip?.id,
          spineAudioSource: source,
          spineAudioLabel: label,
        }),
      });

      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `Spine update failed with HTTP ${response.status}`);
      }

      setProductionState((previous) => previous
        ? {
          ...previous,
          productionJson: payload.productionJson ?? previous.productionJson,
          updatedAt: payload.updatedAt ?? previous.updatedAt,
        }
        : previous);
      if (asset) setSyncWizardSpineAssetId(asset.id);
      setMediaImportStatus(`Spine audio set: ${label}.`);
    } catch (error) {
      console.warn("Could not set spine audio.", error);
      setMediaImportStatus(error instanceof Error ? error.message : "Could not set spine audio.");
    }
  }, [episodeSlug, resolvedProjectSlug]);

  const addImportedAssetToTimeline = useCallback((asset: ImportedMediaAsset) => {
    const placement = smartImportedAssetPlacement(asset, timelineState.clips, currentTime);
    const clipId = makeId("import-clip");
    const clip: TimelineClip = {
      id: clipId,
      assetId: asset.playbackUrl,
      kind: placement.kind,
      trackId: placement.trackId,
      startIn: placement.startIn,
      duration: placement.duration,
      sourceStart: 0,
      sourceEnd: placement.duration,
      name: placement.name,
      color: importedAssetColor(asset),
    };

    addClip(clip);
    setSelectedClipId(clipId);
    setMediaImportStatus(
      `Added ${placement.name} at ${formatClock(placement.startIn)} on ${placement.trackId}${
        placement.avoidedOverlap ? " to avoid an obvious overlap" : ""
      }. Manual track controls are still available on the selected clip.`
    );
    return clip;
  }, [addClip, currentTime, timelineState.clips]);

  const attachImportedAssetToSelectedClip = useCallback(async (asset: ImportedMediaAsset) => {
    if (!selectedClip) {
      setMediaImportStatus("Select a clip first, then attach imported media.");
      return;
    }

    try {
      const response = await fetch("/api/episode-production/import-media", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "record-sync-snapshot",
          projectSlug: resolvedProjectSlug,
          episodeSlug,
          snapshot: {
            type: "attach-source",
            assetId: asset.id,
            targetClipId: selectedClip.id,
            label: `Attached ${asset.originalName} to ${selectedClip.name}`,
            beforeClip: {
              id: selectedClip.id,
              assetId: selectedClip.assetId,
              name: selectedClip.name,
            },
            afterClip: {
              id: selectedClip.id,
              assetId: asset.playbackUrl,
              name: asset.originalName,
            },
          },
        }),
      });
      const payload = await response.json();
      if (response.ok && payload?.ok) {
        setProductionState((previous) => previous
          ? {
            ...previous,
            productionJson: payload.productionJson ?? previous.productionJson,
            updatedAt: payload.updatedAt ?? previous.updatedAt,
          }
          : previous);
      }
    } catch (error) {
      console.warn("Could not record attach-source sync snapshot.", error);
    }

    updateClipSource(selectedClip.id, asset.playbackUrl, asset.originalName);
    setMediaImportStatus(`Attached ${asset.originalName} to ${selectedClip.name}.`);
  }, [episodeSlug, resolvedProjectSlug, selectedClip, updateClipSource]);

  const updateImportedAssetSyncStatus = useCallback(async (
    asset: ImportedMediaAsset,
    status: "ready-to-sync" | "synced" | "held",
    options?: { anchorTimelineSeconds?: number; targetClipId?: string | null },
  ) => {
    const label = status === "synced" ? "synced" : status === "held" ? "held for later sync" : "ready to sync";
    setMediaImportStatus(`Marking ${asset.originalName} ${label} at ${formatClock(currentTime)}...`);
    const anchorTimelineSeconds = options?.anchorTimelineSeconds ?? roundSeconds(currentTime);
    const targetClipId = options?.targetClipId ?? selectedClip?.id;

    try {
      const response = await fetch("/api/episode-production/import-media", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectSlug: resolvedProjectSlug,
          episodeSlug,
          assetId: asset.id,
          status,
          ...(anchorTimelineSeconds === undefined ? {} : { anchorTimelineSeconds }),
          ...(targetClipId === undefined ? {} : { targetClipId }),
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `Sync marker failed with HTTP ${response.status}`);
      }

      setProductionState((previous) => previous
        ? {
          ...previous,
          productionJson: payload.productionJson ?? previous.productionJson,
          updatedAt: payload.updatedAt ?? previous.updatedAt,
        }
        : previous);
    setMediaImportStatus(`${asset.originalName} is ${label} at ${formatClock(anchorTimelineSeconds)}.`);
    } catch (error) {
      console.warn("Could not update imported media sync marker.", error);
      setMediaImportStatus(error instanceof Error ? error.message : "Could not update imported media sync marker.");
    }
  }, [currentTime, episodeSlug, resolvedProjectSlug, selectedClip]);

  const nudgeSyncWizardAnchor = useCallback((deltaSeconds: number) => {
    setSyncWizardAnchorSeconds((value) => {
      setSyncWizardPreviousAnchorSeconds(value);
      return Math.max(0, roundSeconds(value + deltaSeconds));
    });
  }, []);

  const pauseSyncPreview = useCallback(() => {
    syncPreviewSpineRef.current?.pause();
    syncPreviewTargetRef.current?.pause();
    setSyncPreviewState("paused");
    setSyncPreviewMessage("Preview paused. Nudge the anchor if it felt early or late, then try again.");
  }, []);

  const resetSyncPreview = useCallback(() => {
    const spine = syncPreviewSpineRef.current;
    const target = syncPreviewTargetRef.current;
    spine?.pause();
    target?.pause();
    if (spine) spine.currentTime = Math.max(0, roundSeconds(syncWizardAnchorSeconds));
    if (target) target.currentTime = 0;
    setSyncPreviewState("ready");
    setSyncPreviewMessage(`Reset to spine ${formatClock(syncWizardAnchorSeconds)} + target 00:00.`);
  }, [syncWizardAnchorSeconds]);

  const previewSyncFromAnchor = useCallback(async () => {
    const spine = syncPreviewSpineRef.current;
    const target = syncPreviewTargetRef.current;

    if (!syncWizardSpineAsset?.playbackUrl || !spine) {
      setSyncPreviewState("error");
      setSyncPreviewMessage("Choose an imported audio spine with a playable URL before previewing.");
      return;
    }

    if (!syncWizardTargetAsset?.playbackUrl || !target) {
      setSyncPreviewState("error");
      setSyncPreviewMessage("Choose a target media file with a playable URL before previewing.");
      return;
    }

    try {
      spine.pause();
      target.pause();
      spine.currentTime = Math.max(0, roundSeconds(syncWizardAnchorSeconds));
      target.currentTime = 0;

      const results = await Promise.allSettled([spine.play(), target.play()]);
      const rejected = results.find((result) => result.status === "rejected");

      if (rejected) {
        const reason = rejected.status === "rejected" && rejected.reason instanceof Error
          ? rejected.reason.message
          : "Browser blocked one of the media players.";
        setSyncPreviewState("error");
        setSyncPreviewMessage(`Could not auto-play both sources: ${reason}. Use the visible media controls, then nudge below.`);
        return;
      }

      setSyncPreviewState("playing");
      setSyncPreviewMessage(
        `Previewing spine at ${formatClock(syncWizardAnchorSeconds)} against target at 00:00. If the target feels early or late, use the nudge buttons.`
      );
    } catch (error) {
      console.warn("Sync preview failed.", error);
      setSyncPreviewState("error");
      setSyncPreviewMessage(error instanceof Error ? error.message : "Sync preview failed. Use the native media controls and nudge below.");
    }
  }, [syncWizardAnchorSeconds, syncWizardSpineAsset?.playbackUrl, syncWizardTargetAsset?.playbackUrl]);

  const saveSyncWizardAlignment = useCallback(async () => {
    if (!syncWizardTargetAsset) {
      setMediaImportStatus("Pick a target media file before saving sync.");
      return;
    }

    setMediaImportStatus(`Saving ${syncWizardTargetAsset.originalName} synced at ${formatClock(syncWizardAnchorSeconds)}...`);

    try {
      const response = await fetch("/api/episode-production/import-media", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectSlug: resolvedProjectSlug,
          episodeSlug,
          assetId: syncWizardTargetAsset.id,
          status: "synced",
          anchorTimelineSeconds: roundSeconds(syncWizardAnchorSeconds),
          targetClipId: selectedClip?.id,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `Sync save failed with HTTP ${response.status}`);
      }

      setProductionState((previous) => previous
        ? {
          ...previous,
          productionJson: payload.productionJson ?? previous.productionJson,
          updatedAt: payload.updatedAt ?? previous.updatedAt,
        }
        : previous);
      setCurrentTime(roundSeconds(syncWizardAnchorSeconds));
      setMediaImportStatus(`${syncWizardTargetAsset.originalName} is saved as synced at ${formatClock(syncWizardAnchorSeconds)}.`);
    } catch (error) {
      console.warn("Could not save guided sync alignment.", error);
      setMediaImportStatus(error instanceof Error ? error.message : "Could not save guided sync alignment.");
    }
  }, [episodeSlug, resolvedProjectSlug, selectedClip, syncWizardAnchorSeconds, syncWizardTargetAsset]);

  const undoLastSyncChange = useCallback(async () => {
    setMediaImportStatus("Undoing last sync change...");

    try {
      const response = await fetch("/api/episode-production/import-media", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "undo-last-sync",
          projectSlug: resolvedProjectSlug,
          episodeSlug,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `Undo failed with HTTP ${response.status}`);
      }

      const undoAction = payload.undoAction as SyncHistorySnapshot | undefined;
      if (undoAction?.type === "attach-source" && undoAction.beforeClip?.id) {
        updateClipSource(
          undoAction.beforeClip.id,
          undoAction.beforeClip.assetId ?? "",
          undoAction.beforeClip.name,
        );
        setSelectedClipId(undoAction.beforeClip.id);
      }

      setProductionState((previous) => previous
        ? {
          ...previous,
          productionJson: payload.productionJson ?? previous.productionJson,
          updatedAt: payload.updatedAt ?? previous.updatedAt,
        }
        : previous);
      setMediaImportStatus(`Undid ${undoAction?.label || undoAction?.type || "last sync change"}.`);
    } catch (error) {
      console.warn("Could not undo sync change.", error);
      setMediaImportStatus(error instanceof Error ? error.message : "Could not undo sync change.");
    }
  }, [episodeSlug, resolvedProjectSlug, updateClipSource]);

  const refreshEpisodeProductionState = useCallback(() => {
    setMediaImportStatus("Refreshing episode production state from the database...");
    setSyncPreviewState("idle");
    setSyncPreviewMessage("DB refresh requested. Pick a spine and target, then preview the current anchor.");
    setTimelineReloadToken((token) => token + 1);
  }, []);

  const holdSyncWizardTarget = useCallback(async () => {
    if (!syncWizardTargetAsset) {
      setMediaImportStatus("Pick a target media file before holding it.");
      return;
    }
    await updateImportedAssetSyncStatus(syncWizardTargetAsset, "held");
  }, [syncWizardTargetAsset, updateImportedAssetSyncStatus]);

  const detachSourceFromSelectedClip = useCallback(async () => {
    if (!selectedClip) {
      setMediaImportStatus("Select a timeline clip before detaching a source.");
      return;
    }

    setMediaImportStatus(`Detaching source from ${selectedClip.name}...`);

    try {
      const response = await fetch("/api/episode-production/import-media", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "record-sync-snapshot",
          projectSlug: resolvedProjectSlug,
          episodeSlug,
          snapshot: {
            type: "attach-source",
            assetId: selectedClip.assetId,
            targetClipId: selectedClip.id,
            label: `Detached source from ${selectedClip.name}`,
            beforeClip: {
              id: selectedClip.id,
              assetId: selectedClip.assetId,
              name: selectedClip.name,
            },
            afterClip: {
              id: selectedClip.id,
              assetId: "",
              name: selectedClip.name,
            },
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `Detach snapshot failed with HTTP ${response.status}`);
      }

      setProductionState((previous) => previous
        ? {
          ...previous,
          productionJson: payload.productionJson ?? previous.productionJson,
          updatedAt: payload.updatedAt ?? previous.updatedAt,
        }
        : previous);
      updateClipSource(selectedClip.id, "", selectedClip.name);
      setSelectedClipId(selectedClip.id);
      setMediaImportStatus(`Detached source from ${selectedClip.name}. Undo is available.`);
    } catch (error) {
      console.warn("Could not detach source from selected clip.", error);
      setMediaImportStatus(error instanceof Error ? error.message : "Could not detach source from selected clip.");
    }
  }, [episodeSlug, resolvedProjectSlug, selectedClip, updateClipSource]);

  const copySyncDiagnosticJson = useCallback(async () => {
    const diagnostic = {
      copiedAt: new Date().toISOString(),
      route: {
        projectSlug: resolvedProjectSlug,
        episodeSlug,
      },
      production: {
        mode: productionState?.mode ?? "unknown",
        id: productionState?.id ?? null,
        updatedAt: productionState?.updatedAt ?? null,
      },
      syncWizard: {
        spineAssetId: syncWizardSpineAssetId || null,
        spineAssetName: syncWizardSpineAsset?.originalName ?? null,
        targetAssetId: syncWizardTargetAssetId || null,
        targetAssetName: syncWizardTargetAsset?.originalName ?? null,
        anchorSeconds: roundSeconds(syncWizardAnchorSeconds),
        previousAnchorSeconds: syncWizardPreviousAnchorSeconds,
        previewState: syncPreviewState,
        previewMessage: syncPreviewMessage,
      },
      selectedClip: selectedClip
        ? {
          id: selectedClip.id,
          name: selectedClip.name,
          assetId: selectedClip.assetId,
          trackId: selectedClip.trackId,
          startIn: selectedClip.startIn,
          duration: selectedClip.duration,
          sourceStart: selectedClip.sourceStart,
          sourceEnd: selectedClip.sourceEnd,
        }
        : null,
      latestSyncSnapshot,
      importedMediaCount: importedMediaAssets.length,
      timelineClipCount: timelineState.clips.length,
      mediaHealthStats,
    };
    const text = JSON.stringify(diagnostic, null, 2);

    try {
      await navigator.clipboard.writeText(text);
      setMediaImportStatus("Copied sync diagnostic JSON to clipboard.");
    } catch (error) {
      console.warn("Could not copy sync diagnostic JSON.", error);
      setMediaImportStatus(text);
    }
  }, [
    episodeSlug,
    importedMediaAssets.length,
    latestSyncSnapshot,
    mediaHealthStats,
    productionState?.id,
    productionState?.mode,
    productionState?.updatedAt,
    resolvedProjectSlug,
    selectedClip,
    syncPreviewMessage,
    syncPreviewState,
    syncWizardAnchorSeconds,
    syncWizardPreviousAnchorSeconds,
    syncWizardSpineAsset?.originalName,
    syncWizardSpineAssetId,
    syncWizardTargetAsset?.originalName,
    syncWizardTargetAssetId,
    timelineState.clips.length,
  ]);

  const handleAiOrganizeMedia = useCallback(async () => {
    setIsAiOrganizingMedia(true);
    setMediaImportStatus("Asking Gemini to organize this episode media...");

    try {
      const response = await fetch("/api/episode-production/ai-ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectSlug: resolvedProjectSlug,
          episodeSlug,
          importedMedia: importedMediaAssets,
          timelineClips: timelineState.clips,
          transcript: timelineState.transcript,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `AI organize failed with HTTP ${response.status}`);
      }

      setProductionState((previous) => previous
        ? {
          ...previous,
          productionJson: payload.productionJson ?? previous.productionJson,
          updatedAt: payload.updatedAt ?? previous.updatedAt,
        }
        : previous);
      const source = payload.report?.source === "gemini" ? "Gemini" : "local fallback";
      setMediaImportStatus(`${source} organized ${payload.report?.recommendations?.length ?? 0} media recommendation(s).`);
    } catch (error) {
      console.warn("Could not run AI ingest organizer.", error);
      setMediaImportStatus(error instanceof Error ? error.message : "Could not run AI ingest organizer.");
    } finally {
      setIsAiOrganizingMedia(false);
    }
  }, [episodeSlug, importedMediaAssets, resolvedProjectSlug, timelineState.clips, timelineState.transcript]);

  const applyAiIngestRecommendation = useCallback(async (
    recommendation: AiIngestRecommendation,
    asset?: ImportedMediaAsset,
  ) => {
    const targetAsset = asset
      ?? importedMediaAssets.find((candidate) =>
        candidate.id === recommendation.assetId || candidate.sourceId === recommendation.assetId
      );
    if (!targetAsset) {
      setMediaImportStatus(`Could not find imported asset for ${recommendation.assetId}.`);
      return;
    }

    const status = normalizeSuggestedSyncStatus(recommendation.suggestedSyncStatus);
    const suggestedTrackId = normalizeSuggestedTrackId(recommendation.suggestedTrackId);
    const anchor = recommendation.suggestedAnchorTimelineSeconds ?? (status === "held" ? undefined : roundSeconds(currentTime));
    const applyKey = `${targetAsset.id}:${recommendation.assetId}`;

    setApplyingAiSuggestionIds((previous) => new Set(previous).add(applyKey));
    setMediaImportStatus(`Applying AI suggestion to ${targetAsset.originalName} (${recommendationApplySummary(recommendation)})...`);

    try {
      const response = await fetch("/api/episode-production/import-media", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "apply-ai-suggestion",
          projectSlug: resolvedProjectSlug,
          episodeSlug,
          assetId: targetAsset.id,
          status,
          ...(anchor === undefined ? {} : { anchorTimelineSeconds: anchor }),
          ...(selectedClip?.id ? { targetClipId: selectedClip.id } : {}),
          ...(suggestedTrackId ? { suggestedTrackId } : {}),
          suggestedRole: recommendation.role,
          suggestionReason: recommendation.reason,
          suggestionConfidence: recommendation.confidence,
          suggestionSource: aiIngestReport?.source ?? "ai-ingest",
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `Apply suggestion failed with HTTP ${response.status}`);
      }

      setProductionState((previous) => previous
        ? {
          ...previous,
          productionJson: payload.productionJson ?? previous.productionJson,
          updatedAt: payload.updatedAt ?? previous.updatedAt,
        }
        : previous);
      setSyncWizardTargetAssetId(targetAsset.id);
      if (targetAsset.kind === "audio" || targetAsset.contentType.startsWith("audio/")) {
        setSyncWizardSpineAssetId(targetAsset.id);
      }
      if (anchor !== undefined) {
        setSyncWizardAnchorSeconds(anchor);
      }
      setMediaImportStatus(`Applied suggestion for ${targetAsset.originalName}. No timeline clips were moved.`);
    } catch (error) {
      console.warn("Could not apply AI ingest suggestion.", error);
      setMediaImportStatus(error instanceof Error ? error.message : "Could not apply AI ingest suggestion.");
    } finally {
      setApplyingAiSuggestionIds((previous) => {
        const next = new Set(previous);
        next.delete(applyKey);
        return next;
      });
    }
  }, [aiIngestReport?.source, currentTime, episodeSlug, importedMediaAssets, resolvedProjectSlug, selectedClip]);

  const requestTranscriptAssist = useCallback(async (asset: ImportedMediaAsset) => {
    const assistKey = asset.id;
    setTranscriptAssistingAssetIds((previous) => new Set(previous).add(assistKey));
    setMediaImportStatus(`Asking Gemini for transcript suggestions from ${asset.originalName}...`);

    try {
      const response = await fetch("/api/episode-production/transcript-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectSlug: resolvedProjectSlug,
          episodeSlug,
          assetId: asset.id,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `Transcript assist failed with HTTP ${response.status}`);
      }

      setProductionState((previous) => previous
        ? {
          ...previous,
          productionJson: payload.productionJson ?? previous.productionJson,
          updatedAt: payload.updatedAt ?? previous.updatedAt,
        }
        : previous);
      const report = payload.report as TranscriptAssistReport | undefined;
      const source = report?.source === "gemini-inline-media" ? "Gemini media" : "metadata fallback";
      setMediaImportStatus(`${source} saved transcript suggestions for ${asset.originalName}. Existing transcript was not replaced.`);
    } catch (error) {
      console.warn("Could not generate transcript assist.", error);
      setMediaImportStatus(error instanceof Error ? error.message : "Could not generate transcript assist.");
    } finally {
      setTranscriptAssistingAssetIds((previous) => {
        const next = new Set(previous);
        next.delete(assistKey);
        return next;
      });
    }
  }, [episodeSlug, resolvedProjectSlug]);

  const queueMediaAnalysisJob = useCallback(async (asset: ImportedMediaAsset, type: MediaAnalysisJobType) => {
    const jobKey = `${asset.id}:${type}`;
    setQueueingMediaJobKeys((previous) => new Set(previous).add(jobKey));
    setMediaImportStatus(`Saving ${mediaAnalysisJobLabel(type).toLowerCase()} job for ${asset.originalName}...`);

    const simpleResult =
      type === "file-triage"
        ? {
          originalName: asset.originalName,
          kind: asset.kind,
          contentType: asset.contentType,
          size: asset.size,
          importRole: asset.importRole ?? null,
          suggestedStatus: asset.kind === "unknown" ? "held" : "ready-to-sync",
        }
        : type === "sync-suggestion"
          ? {
            currentSyncStatus: asset.sync?.status ?? "ready-to-sync",
            anchorTimelineSeconds: asset.sync?.anchorTimelineSeconds ?? null,
            suggestedTrackId: asset.sync?.suggestedTrackId ?? importedAssetTrackId(asset),
            note: "Queued for deeper sync analysis. Current result is metadata-only.",
          }
          : type === "proxy-needed"
            ? {
              proxyStatus: asset.proxy?.status ?? "unknown",
              needsProxy: asset.kind === "video" && asset.proxy?.status !== "ready",
              note: asset.kind === "video" ? "Video assets need proxy/render readiness checks." : "Audio assets usually do not need video proxies.",
            }
            : {
              note: "Use Gemini transcript assist to generate transcript suggestions.",
            };

    const status: MediaAnalysisJobStatus = type === "transcript" ? "queued" : "completed";

    try {
      const response = await fetch("/api/episode-production/media-analysis-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectSlug: resolvedProjectSlug,
          episodeSlug,
          assetId: asset.id,
          type,
          status,
          result: simpleResult,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `Media job failed with HTTP ${response.status}`);
      }

      setProductionState((previous) => previous
        ? {
          ...previous,
          productionJson: payload.productionJson ?? previous.productionJson,
          updatedAt: payload.updatedAt ?? previous.updatedAt,
        }
        : previous);
      setMediaImportStatus(`${mediaAnalysisJobLabel(type)} job saved for ${asset.originalName}.`);
    } catch (error) {
      console.warn("Could not save media analysis job.", error);
      setMediaImportStatus(error instanceof Error ? error.message : "Could not save media analysis job.");
    } finally {
      setQueueingMediaJobKeys((previous) => {
        const next = new Set(previous);
        next.delete(jobKey);
        return next;
      });
    }
  }, [episodeSlug, resolvedProjectSlug]);

  const addEditorCoPilotLog = useCallback((entry: Omit<EditorCoPilotLogEntry, "id">) => {
    const id = makeId("copilot");
    setEditorCoPilotLog((previous) => [
      {
        id,
        ...entry,
      },
      ...previous,
    ].slice(0, EDITOR_CO_PILOT_MAX_LOG));
    return id;
  }, []);

  const addEditorCoPilotMessage = useCallback((entry: Omit<EditorCoPilotMessage, "id">) => {
    const id = makeId("copilot-msg");
    setEditorCoPilotMessages((previous) => [
      {
        id,
        ...entry,
      },
      ...previous,
    ].slice(0, EDITOR_CO_PILOT_MAX_MESSAGES));
    return id;
  }, []);

  const updateEditorCoPilotLog = useCallback((id: string, patch: Partial<EditorCoPilotLogEntry>) => {
    setEditorCoPilotLog((previous) => previous.map((entry) => entry.id === id ? { ...entry, ...patch } : entry));
  }, []);

  const runEditorCoPilotCommand = useCallback(async (commandTextOverride?: string) => {
    const commandText = (commandTextOverride ?? editorCoPilotInput).trim();
    if (!commandText || isEditorCoPilotBusy) {
      return;
    }

    setEditorCoPilotInput((current) => {
      if (!commandTextOverride) return "";
      return current;
    });

    const parsed = parseCoPilotCommand(commandText);

    addEditorCoPilotMessage({
      at: new Date().toISOString(),
      role: "user",
      command: commandText,
      text: commandText,
    });

    const logId = addEditorCoPilotLog({
      at: new Date().toISOString(),
      command: commandText,
      result: "Queued.",
      status: "queued",
      reversible: false,
      revert: { kind: "none" },
    });

    setEditorCoPilotInput("");
    setIsEditorCoPilotBusy(true);
    updateEditorCoPilotLog(logId, {
      status: "running",
      result: "Running command…",
    });

    const markFailed = (message: string) => {
      updateEditorCoPilotLog(logId, { status: "error", result: message, reversible: false });
      addEditorCoPilotMessage({
        at: new Date().toISOString(),
        role: "agent",
        text: message,
        logId,
      });
      setMediaImportStatus(message);
      setIsEditorCoPilotBusy(false);
      return Promise.resolve();
    };

    const markSuccess = (result: string, revert: EditorCoPilotRevertPayload, changeSummary?: string[]) => {
      const summary = (changeSummary ?? []).filter(Boolean);
      updateEditorCoPilotLog(logId, {
        status: "success",
        result,
        changeSummary: summary.length ? summary.join(" | ") : undefined,
        reversible: revert.kind !== "none",
        revert,
      });
      addEditorCoPilotMessage({
        at: new Date().toISOString(),
        role: "agent",
        text: summary.length ? `${result}\n${summary.join("\n")}` : result,
        logId,
      });
      setMediaImportStatus(result);
    };

    try {
      switch (parsed.parsed.type) {
      case "help": {
        const helpText = `Co-pilot commands: ${EDITOR_CO_PILOT_COMMANDS.join(" | ")}`;
        markSuccess(helpText, { kind: "none" });
        setMediaImportStatus("Co-pilot help shown.");
        break;
      }
      case "source-url": {
        if (!parsed.parsed.sourceUrl) return markFailed("No source URL detected for import.");
        await registerSourceClipUrl({
          sourceUrl: parsed.parsed.sourceUrl,
          sourceTitle: parsed.parsed.sourceTitle,
        });
        markSuccess(`Registered source: ${parsed.parsed.sourceUrl}`, { kind: "none" });
        break;
      }
      case "add-to-timeline": {
        if (!parsed.parsed.assetRef) return markFailed("Tell me which asset to add.");
        const asset = findAssetByReference(parsed.parsed.assetRef, importedMediaAssets);
        if (!asset) return markFailed(`Could not find imported asset "${parsed.parsed.assetRef}".`);
        const clip = addImportedAssetToTimeline(asset);
        if (!clip) return markFailed("Could not add asset to timeline.");
        markSuccess(`Added ${asset.originalName} to timeline.`, {
          kind: "delete-timeline-clip",
          clip: { ...clip },
        }, [
          `Created clip ${clip.id} (${clip.name})`,
          `Track: ${clip.trackId}`,
          `Placement: ${formatClock(clip.startIn)} → ${formatClock(clip.startIn + clip.duration)} (${formatClock(clip.duration)})`,
        ]);
        break;
      }
      case "attach-to-selected": {
        if (!parsed.parsed.assetRef) return markFailed("Tell me which asset to attach.");
        if (!selectedClip) return markFailed("Select a timeline clip first before attaching a source.");
        const asset = findAssetByReference(parsed.parsed.assetRef, importedMediaAssets);
        if (!asset) return markFailed(`Could not find imported asset "${parsed.parsed.assetRef}".`);
        const previousClipSource = selectedClip.assetId;
        const previousClipSourceLabel = previousClipSource
          ? findAssetByReference(previousClipSource, importedMediaAssets)?.originalName ?? "unassigned source"
          : "unassigned source";
        const previousClipName = selectedClip.name;
        await attachImportedAssetToSelectedClip(asset);
        markSuccess(`Attached ${asset.originalName} to ${selectedClip.name}.`, {
          kind: "restore-clip-source",
          clipId: selectedClip.id,
          clipSourceAssetId: previousClipSource,
          clip: {
            ...selectedClip,
            assetId: previousClipSource,
            name: previousClipName,
          },
        }, [
          `Clip: ${selectedClip.name}`,
          `Source changed from ${previousClipSourceLabel} → ${asset.originalName}`,
        ]);
        break;
      }
      case "set-sync-status": {
        if (!parsed.parsed.assetRef || !parsed.parsed.status) return markFailed("Tell me which asset to mark and what status.");
        const asset = findAssetByReference(parsed.parsed.assetRef, importedMediaAssets);
        if (!asset) return markFailed(`Could not find imported asset "${parsed.parsed.assetRef}".`);
        const previousStatus = (asset.sync?.status ?? "ready-to-sync") as
          | "ready-to-sync"
          | "synced"
          | "held";
        const previousAnchor = asset.sync?.anchorTimelineSeconds ?? null;
        const previousTargetClipId = asset.sync?.targetClipId ?? null;
        await updateImportedAssetSyncStatus(asset, parsed.parsed.status);
        markSuccess(`Marked ${asset.originalName} as ${parsed.parsed.status}.`, {
          kind: "restore-sync-status",
          assetId: asset.id,
          previousSyncStatus: previousStatus,
          previousSyncAnchorTimelineSeconds: previousAnchor,
          previousSyncTargetClipId: previousTargetClipId,
        }, [
          `Asset: ${asset.originalName}`,
          `Status: ${previousStatus} → ${parsed.parsed.status}`,
          `Target clip: ${previousTargetClipId ?? "none"}`,
        ]);
        break;
      }
      case "set-spine-audio": {
        if (!parsed.parsed.assetRef) return markFailed("Tell me which asset to make spine audio.");
        const asset = findAssetByReference(parsed.parsed.assetRef, importedMediaAssets);
        if (!asset) return markFailed(`Could not find imported asset "${parsed.parsed.assetRef}".`);
        const before = persistedSpineAudio;
        const beforeLabel = before?.assetId
          ? findAssetByReference(before.assetId, importedMediaAssets)?.originalName ?? before.label
          : before?.clipId
            ? timelineState.clips.find((candidate) => candidate.id === before.clipId)?.name ?? before.label
            : before?.label ?? "none";
        await setEpisodeSpineAudio({ asset });
        markSuccess(`Set spine audio to ${asset.originalName}.`, {
          kind: before ? "restore-spine" : "none",
          spineAudioAssetId: before?.assetId ?? null,
          spineAudioClipId: before?.clipId ?? null,
          spineAudioSource: before?.source ?? null,
          spineAudioLabel: before?.label ?? null,
        }, [
          `Spine changed: ${beforeLabel} → ${asset.originalName}`,
        ]);
        break;
      }
      case "undo-last-change": {
        await undoLastSyncChange();
        markSuccess("Undo request sent to server snapshot history.", { kind: "undo-sync" });
        break;
      }
      case "save-timeline": {
        await handleSaveEpisodeTimeline();
        markSuccess("Timeline saved.", { kind: "none" });
        break;
      }
      case "refresh-state": {
        refreshEpisodeProductionState();
        markSuccess("Production DB state requested refresh.", { kind: "none" });
        break;
      }
      case "organize": {
        await handleAiOrganizeMedia();
        markSuccess("Media organize completed.", { kind: "none" });
        break;
      }
      case "apply-suggestion": {
        if (!parsed.parsed.assetRef) return markFailed("Tell me which recommendation to apply.");
        const recommendation = aiIngestRecommendationsByAsset.get(parsed.parsed.assetRef);
        const fallbackRecommendation = aiIngestReport?.recommendations.find((candidate) =>
          candidate.assetId.toLowerCase() === parsed.parsed.assetRef?.toLowerCase()
          || candidate.assetId.toLowerCase().includes(parsed.parsed.assetRef?.toLowerCase() ?? "")
        );
        const toApply = recommendation ?? fallbackRecommendation;
        if (!toApply) {
          return markFailed(`No AI suggestion found for "${parsed.parsed.assetRef}".`);
        }
        const asset = findAssetByReference(toApply.assetId, importedMediaAssets);
        if (!asset) return markFailed(`Could not find imported asset for suggestion "${parsed.parsed.assetRef}".`);
        await applyAiIngestRecommendation(toApply, asset);
        markSuccess(`Applied suggestion to ${asset.originalName}.`, { kind: "none" }, [
          `Suggestion action: ${toApply.suggestedAction}`,
          `Target status: ${toApply.suggestedSyncStatus}`,
          `Target track: ${toApply.suggestedTrackId}`,
        ]);
        break;
      }
      case "transcript-assist": {
        if (!parsed.parsed.assetRef) return markFailed("Tell me which asset to request transcript suggestions for.");
        const asset = findAssetByReference(parsed.parsed.assetRef, importedMediaAssets);
        if (!asset) return markFailed(`Could not find imported asset "${parsed.parsed.assetRef}".`);
        await requestTranscriptAssist(asset);
        markSuccess(`Generated transcript suggestions for ${asset.originalName}.`, { kind: "none" });
        break;
      }
      case "queue-job": {
        if (!parsed.parsed.jobType) return markFailed("Tell me which analysis job to queue.");
        if (!parsed.parsed.assetRef) return markFailed("Tell me which asset to queue job for.");
        const asset = findAssetByReference(parsed.parsed.assetRef, importedMediaAssets);
        if (!asset) return markFailed(`Could not find imported asset "${parsed.parsed.assetRef}".`);
        await queueMediaAnalysisJob(asset, parsed.parsed.jobType);
        markSuccess(`Queued ${mediaAnalysisJobLabel(parsed.parsed.jobType)} for ${asset.originalName}.`, { kind: "none" }, [
          `Job: ${parsed.parsed.jobType}`,
        ]);
        break;
      }
      case "set-playhead": {
        if (parsed.parsed.playheadSeconds === undefined) return markFailed("Tell me when to set the playhead.");
        setCurrentTime(parsed.parsed.playheadSeconds);
        markSuccess(`Playhead moved to ${formatClock(parsed.parsed.playheadSeconds)}.`, { kind: "none" });
        break;
      }
      case "n/a":
      default:
        markSuccess(`I didn't recognize "${commandText}". Try "help".`, { kind: "none" });
        break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Co-pilot command failed.";
      updateEditorCoPilotLog(logId, {
        status: "error",
        result: message,
        reversible: false,
      });
      setMediaImportStatus(message);
      addEditorCoPilotMessage({
        at: new Date().toISOString(),
        role: "agent",
        text: message,
        logId,
      });
    } finally {
      setIsEditorCoPilotBusy(false);
    }
  }, [
    addEditorCoPilotLog,
    applyAiIngestRecommendation,
    aiIngestRecommendationsByAsset,
    aiIngestReport?.recommendations,
    formatClock,
    handleAiOrganizeMedia,
    addImportedAssetToTimeline,
    attachImportedAssetToSelectedClip,
    mediaAnalysisJobLabel,
    requestTranscriptAssist,
    persistedSpineAudio,
    queueMediaAnalysisJob,
    registerSourceClipUrl,
    selectedClip,
    timelineState.clips,
    editorCoPilotInput,
    isEditorCoPilotBusy,
    setCurrentTime,
    setEpisodeSpineAudio,
    undoLastSyncChange,
    updateImportedAssetSyncStatus,
    importedMediaAssets,
    refreshEpisodeProductionState,
    handleSaveEpisodeTimeline,
    addEditorCoPilotMessage,
  ]);

  const revertEditorCoPilotAction = useCallback(async (entry: EditorCoPilotLogEntry) => {
    if (entry.status !== "success" || !entry.reversible) return;
    if (entry.revert.kind === "none" || entry.revert.kind === "undo-sync") return;

    const revertId = entry.id;
    const changeSummaryText = entry.changeSummary;
    updateEditorCoPilotLog(revertId, {
      status: "running",
      result: "Reverting...",
    });

    try {
      switch (entry.revert.kind) {
      case "delete-timeline-clip": {
        const clip = entry.revert.clip;
        if (!clip) {
          throw new Error("No clip snapshot is available to restore.");
        }
        const hasExisting = timelineState.clips.some((candidate) => candidate.id === clip.id);
        if (hasExisting) {
          updateEditorCoPilotLog(revertId, {
            status: "rolled-back",
            result: "Timeline already contains that clip. Rollback skipped.",
          });
          addEditorCoPilotMessage({
            at: new Date().toISOString(),
            role: "agent",
            text: "Rollback skipped: timeline already contains the clip.",
            logId: revertId,
          });
          break;
        }
        addClip(clip);
        setSelectedClipId(clip.id);
        updateEditorCoPilotLog(revertId, {
          status: "rolled-back",
          result: `Re-added "${clip.name}".`,
        });
        addEditorCoPilotMessage({
          at: new Date().toISOString(),
          role: "agent",
          text: changeSummaryText ? `Rolled back. ${changeSummaryText}` : "Rolled back timeline clip add.",
          logId: revertId,
        });
        break;
      }
      case "restore-clip-source": {
        const clipId = entry.revert.clipId;
        if (!clipId) {
          throw new Error("No clip exists to restore source for.");
        }
        updateClipSource(clipId, entry.revert.clipSourceAssetId ?? "", entry.revert.clip?.name);
        setSelectedClipId(clipId);
        updateEditorCoPilotLog(revertId, {
          status: "rolled-back",
          result: "Restored previous clip source.",
        });
        addEditorCoPilotMessage({
          at: new Date().toISOString(),
          role: "agent",
          text: changeSummaryText ? `Rolled back. ${changeSummaryText}` : "Rolled back clip source.",
          logId: revertId,
        });
        break;
      }
      case "restore-sync-status": {
        const assetId = entry.revert.assetId;
        if (!assetId) {
          throw new Error("No target asset found for sync rollback.");
        }
        const targetAsset = findAssetByReference(assetId, importedMediaAssets);
        if (!targetAsset) {
          throw new Error(`Could not find ${assetId} in imported assets.`);
        }
        await updateImportedAssetSyncStatus(
          targetAsset,
          entry.revert.previousSyncStatus ?? "ready-to-sync",
          {
            anchorTimelineSeconds: entry.revert.previousSyncAnchorTimelineSeconds ?? undefined,
            targetClipId: entry.revert.previousSyncTargetClipId,
          },
        );
        updateEditorCoPilotLog(revertId, {
          status: "rolled-back",
          result: "Restored previous media sync status.",
        });
        addEditorCoPilotMessage({
          at: new Date().toISOString(),
          role: "agent",
          text: changeSummaryText ? `Rolled back. ${changeSummaryText}` : "Rolled back media sync status.",
          logId: revertId,
        });
        break;
      }
      case "restore-spine": {
        if (entry.revert.spineAudioAssetId) {
          const spineAsset = findAssetByReference(entry.revert.spineAudioAssetId, importedMediaAssets)
            ?? importedMediaAssets.find((candidate) => candidate.sourceId === entry.revert.spineAudioAssetId);
          if (!spineAsset) {
            throw new Error("Could not find prior spine asset.");
          }
          await setEpisodeSpineAudio({ asset: spineAsset });
          setSyncWizardSpineAssetId(spineAsset.id);
          updateEditorCoPilotLog(revertId, {
            status: "rolled-back",
            result: `Restored previous spine: ${spineAsset.originalName}.`,
          });
          addEditorCoPilotMessage({
            at: new Date().toISOString(),
            role: "agent",
            text: changeSummaryText ? `Rolled back. ${changeSummaryText}` : `Rolled back spine to ${spineAsset.originalName}.`,
            logId: revertId,
          });
          break;
        }
        if (entry.revert.spineAudioClipId) {
          const spineClip = timelineState.clips.find((candidate) => candidate.id === entry.revert.spineAudioClipId);
          if (!spineClip) {
            throw new Error("Could not find prior spine clip.");
          }
          await setEpisodeSpineAudio({ clip: spineClip });
          updateEditorCoPilotLog(revertId, {
            status: "rolled-back",
            result: `Restored previous spine clip: ${spineClip.name}.`,
          });
          addEditorCoPilotMessage({
            at: new Date().toISOString(),
            role: "agent",
            text: changeSummaryText ? `Rolled back. ${changeSummaryText}` : `Rolled back spine to ${spineClip.name}.`,
            logId: revertId,
          });
          break;
        }
        throw new Error("No prior spine audio target found to restore.");
      }
      default:
        break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not rollback co-pilot action.";
      updateEditorCoPilotLog(revertId, {
        status: "error",
        result: message,
      });
      setMediaImportStatus(message);
      addEditorCoPilotMessage({
        at: new Date().toISOString(),
        role: "agent",
        text: `Rollback failed: ${message}`,
        logId: revertId,
      });
    }
  }, [
    addClip,
    setSyncWizardSpineAssetId,
    importedMediaAssets,
    timelineState.clips,
    updateClipSource,
    updateEditorCoPilotLog,
    setEpisodeSpineAudio,
    setSelectedClipId,
    setMediaImportStatus,
    updateImportedAssetSyncStatus,
    addEditorCoPilotMessage,
  ]);

  // Calculate total duration in frames (30fps)
  const totalDuration = timelineState.clips.reduce((acc, clip) => Math.max(acc, clip.startIn + clip.duration), 1);
  const durationInFrames = Math.max(1, Math.round(totalDuration * 30));
  const activeWord = useMemo(() => {
    for (const block of timelineState.transcript) {
      if (block.deleted) continue;
      const word = transcriptWordTimings(block).find((candidate) => currentTime >= candidate.start && currentTime < candidate.end);
      if (word) return { ...word, block };
    }
    return null;
  }, [currentTime, timelineState.transcript]);

  const timelineSaveStatusLabel = useMemo(() => {
    if (timelineSaveState === "queued") return "Queued";
    if (timelineSaveState === "saving") return "Saving";
    if (timelineSaveState === "saved") {
      return `Saved ${timelineLastSavedAt ? `@ ${new Date(timelineLastSavedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "just now"}`;
    }
    if (timelineSaveState === "error") return "Error";
    if (timelineSaveState === "conflict") return "Conflict";
    if (timelineSaveState === "fallback") return "Local";
    return "Idle";
  }, [timelineLastSavedAt, timelineSaveState]);

  const timelineSaveStatusStyles = timelineSaveState === "saved"
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : timelineSaveState === "queued" || timelineSaveState === "saving"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : timelineSaveState === "error" || timelineSaveState === "conflict"
        ? "border-red-200 bg-red-50 text-red-800"
        : "border-slate-200 bg-slate-50 text-slate-700";

  const productionDiagnostics = useMemo(() => {
    const clips = timelineState.clips;
    const audioClips = clips.filter((clip) => isAudioTrackId(clip.trackId) || clip.kind === "audio");
    const videoClips = clips.filter((clip) => isVideoTrackId(clip.trackId) || clip.kind === "video");
    const missingSourceClips = clips.filter(isMissingProductionSource);
    const youtubeClips = clips.filter((clip) => isYouTubeAsset(clip.assetId));
    const brokenHealthClips = clips.filter((clip) => {
      if (isMissingProductionSource(clip)) return false;
      const health = mediaHealthById[`clip:${clip.id}`];
      return health?.status === "error";
    });
    const renderBlockedHealthClips = clips.filter((clip) => {
      if (isMissingProductionSource(clip)) return false;
      const health = mediaHealthById[`clip:${clip.id}`];
      return health && !health.renderUsable;
    });
    const deletedTranscriptBlocks = timelineState.transcript.filter((block) => block.deleted);
    const paperEditSnapshotCount = Object.keys(timelineState.paperEditSnapshots ?? {}).length;
    const timelineEndSeconds = clips.reduce((max, clip) => Math.max(max, clip.startIn + clip.duration), 0);
    const clipsByTrack = new Map<string, TimelineClip[]>();
    clips.forEach((clip) => {
      const trackClips = clipsByTrack.get(clip.trackId) ?? [];
      trackClips.push(clip);
      clipsByTrack.set(clip.trackId, trackClips);
    });
    let gapCount = 0;
    let overlapCount = 0;
    clipsByTrack.forEach((trackClips) => {
      const sortedClips = [...trackClips].sort((a, b) => a.startIn - b.startIn);
      let previousEnd = 0;
      sortedClips.forEach((clip, index) => {
        if (index > 0 && clip.startIn > previousEnd + 0.05) gapCount += 1;
        if (index > 0 && clip.startIn < previousEnd - 0.05) overlapCount += 1;
        previousEnd = Math.max(previousEnd, clip.startIn + clip.duration);
      });
    });
    const sourceProblemClips = [
      ...missingSourceClips,
      ...youtubeClips.filter((clip) => !missingSourceClips.some((missingClip) => missingClip.id === clip.id)),
      ...brokenHealthClips.filter((clip) => !missingSourceClips.some((missingClip) => missingClip.id === clip.id)),
      ...renderBlockedHealthClips.filter((clip) =>
        !missingSourceClips.some((missingClip) => missingClip.id === clip.id)
        && !youtubeClips.some((youtubeClip) => youtubeClip.id === clip.id)
        && !brokenHealthClips.some((brokenClip) => brokenClip.id === clip.id)
      ),
    ];
    const readyForPreview = clips.length > 0;
    const readyForRender = readyForPreview && sourceProblemClips.length === 0 && mediaHealthStats.broken === 0;
    const readinessLevel = readyForRender ? "render" : readyForPreview ? "preview" : "empty";
    const readinessTitle = readyForRender
      ? "Render-ready"
      : readyForPreview
        ? "Preview-only"
        : "No timeline yet";
    const readinessDetail = readyForRender
      ? "Every clip has a renderable source."
      : readyForPreview
        ? "You can keep editing, but final export needs these sources fixed."
        : "Hydrate from the recorder or add synced media before editing.";

    return {
      totalClips: clips.length,
      audioClips: audioClips.length,
      videoClips: videoClips.length,
      missingSourceClips: missingSourceClips.length,
      youtubeClips: youtubeClips.length,
      brokenHealthClips: brokenHealthClips.length,
      renderBlockedHealthClips: renderBlockedHealthClips.length,
      transcriptBlocks: timelineState.transcript.length,
      deletedTranscriptBlocks: deletedTranscriptBlocks.length,
      paperEditSnapshotCount,
      timelineEndSeconds,
      gapCount,
      overlapCount,
      sourceProblemClips,
      readinessLevel,
      readinessTitle,
      readinessDetail,
      readyForPreview,
      readyForRender,
    };
  }, [mediaHealthById, mediaHealthStats.broken, timelineState]);

  const episodeSyncChecklist = useMemo(() => {
    const importedVideoAssets = importedMediaAssets.filter((asset) => asset.kind === "video" || asset.contentType.startsWith("video/"));
    const syncedAssets = importedMediaAssets.filter((asset) => asset.sync?.status === "synced");
    const readyOrSyncedAssets = importedMediaAssets.filter((asset) => ["ready-to-sync", "synced"].includes(asset.sync?.status ?? "ready-to-sync"));
    const hasSpineAudio = Boolean(persistedSpineAudio);
    const hasCameraOrVideo = importedVideoAssets.length > 0 || productionDiagnostics.videoClips > 0;
    const hasSyncedReference = syncedAssets.length > 0 || timelineState.clips.some((clip) => clip.assetId?.startsWith("/api/ingest/media/"));
    const playbackVerified = productionDiagnostics.readyForPreview && productionDiagnostics.missingSourceClips === 0;
    const timelineSaved = timelineSaveState === "saved" || timelineFingerprint === timelineSavedFingerprintRef.current;

    return [
      {
        id: "import-media",
        done: importedMediaAssets.length > 0 || productionDiagnostics.totalClips > 0,
        title: "Import media",
        detail: importedMediaAssets.length > 0
          ? `${importedMediaAssets.length} imported asset${importedMediaAssets.length === 1 ? "" : "s"} in the episode vault.`
          : productionDiagnostics.totalClips > 0
            ? "Timeline already has media clips; import raw files when ready."
            : "Import phone audio, camera video, screen recordings, or reference clips.",
      },
      {
        id: "choose-spine",
        done: hasSpineAudio,
        title: "Choose spine audio",
        detail: persistedSpineAudio
          ? `${activeSpineAudioLabel} is the episode sync spine.`
          : importedAudioAssets.length > 0
            ? "Audio is imported; designate the cleanest continuous recording as the spine."
            : productionDiagnostics.audioClips > 0
              ? "Timeline has audio; designate the spine before syncing video."
              : "Import or hydrate the cleanest episode audio first.",
      },
      {
        id: "attach-video",
        done: hasCameraOrVideo,
        title: "Attach camera/video",
        detail: hasCameraOrVideo
          ? `${importedVideoAssets.length || productionDiagnostics.videoClips} video source${(importedVideoAssets.length || productionDiagnostics.videoClips) === 1 ? "" : "s"} available for the edit.`
          : "Import camera footage, screen capture, or source clips and attach them to the timeline.",
      },
      {
        id: "sync-reference",
        done: hasSyncedReference,
        title: "Sync reference clips",
        detail: syncedAssets.length > 0
          ? `${syncedAssets.length} imported asset${syncedAssets.length === 1 ? "" : "s"} marked synced.`
          : readyOrSyncedAssets.length > 0
            ? "Use the line-up controls on an imported file, or open full lab controls only if you need the wizard."
            : "Hold unclear files, then sync the useful ones to the spine.",
      },
      {
        id: "verify-playback",
        done: playbackVerified,
        title: "Verify playback",
        detail: playbackVerified
          ? "Timeline has playable sources for preview."
          : productionDiagnostics.readyForPreview
            ? `${productionDiagnostics.missingSourceClips} missing source${productionDiagnostics.missingSourceClips === 1 ? "" : "s"} still need attention.`
            : "Add or hydrate clips before previewing playback.",
      },
      {
        id: "save-timeline",
        done: timelineSaved,
        title: "Save timeline",
        detail: timelineSaved
          ? "Timeline state is saved or unchanged."
          : `Timeline save status is ${timelineSaveStatusLabel.toLowerCase()}; let autosave finish or click save.`,
      },
    ];
  }, [
    importedAudioAssets,
    importedMediaAssets,
    persistedSpineAudio,
    productionDiagnostics,
    syncWizardSpineAsset,
    activeSpineAudioLabel,
    timelineFingerprint,
    timelineSaveState,
    timelineSaveStatusLabel,
    timelineState.clips,
  ]);

  const canSplitSelectedClip = useMemo(() => {
    if (!selectedClip) return false;
    const splitOffset = currentTime - selectedClip.startIn;
    return splitOffset > 0.1 && splitOffset < selectedClip.duration - 0.1;
  }, [currentTime, selectedClip]);

  const productionSources = useMemo(() => {
    return timelineState.clips.map((clip) => ({
      clip,
      sourceLabel: describeClipSource(clip),
      missing: isMissingProductionSource(clip),
      youtubeOnly: isYouTubeAsset(clip.assetId),
    }));
  }, [timelineState.clips]);

  useEffect(() => {
    if (!selectedClipId) return;
    if (!timelineState.clips.some((clip) => clip.id === selectedClipId)) {
      setSelectedClipId(timelineState.clips[0]?.id ?? null);
    }
  }, [selectedClipId, timelineState.clips]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!selectedClip) return;
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      if (target?.isContentEditable || tagName === "input" || tagName === "textarea" || tagName === "select") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === "ArrowLeft" && event.shiftKey) {
        event.preventDefault();
        nudgeClip(selectedClip.id, -1);
        return;
      }

      if (event.key === "ArrowRight" && event.shiftKey) {
        event.preventDefault();
        nudgeClip(selectedClip.id, 1);
        return;
      }

      if (event.key === "[" || event.key === "{") {
        event.preventDefault();
        snapClipToPrevious(selectedClip.id);
        return;
      }

      if (event.key === "]" || event.key === "}") {
        event.preventDefault();
        snapClipToNext(selectedClip.id);
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "d") {
        event.preventDefault();
        duplicateClip(selectedClip.id);
        return;
      }

      if (key === "m") {
        event.preventDefault();
        moveClipTo(selectedClip.id, currentTime);
        return;
      }

      if (key === "x" && canSplitSelectedClip) {
        event.preventDefault();
        splitClipAt(selectedClip.id, currentTime);
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        if (!window.confirm(`Delete "${selectedClip.name}" from this timeline?`)) return;
        deleteClip(selectedClip.id);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    canSplitSelectedClip,
    currentTime,
    deleteClip,
    duplicateClip,
    moveClipTo,
    nudgeClip,
    selectedClip,
    snapClipToNext,
    snapClipToPrevious,
    splitClipAt,
  ]);

  useEffect(() => {
    if (!isPreviewPlaying) return;

    const interval = window.setInterval(() => {
      setCurrentTime((time) => {
        const nextTime = time + 0.12;
        if (nextTime >= totalDuration) {
          setIsPreviewPlaying(false);
          return totalDuration;
        }
        return nextTime;
      });
    }, 120);

    return () => window.clearInterval(interval);
  }, [isPreviewPlaying, totalDuration]);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <header className="flex justify-between items-center p-4 border-b border-[#e8dcc4] bg-[#fdfaf6]">
        <h1 className="text-xl font-black tracking-tight text-[#3d3122]">
          NLE // Editor {projectId && <span className="text-[#8c6b4a] font-medium text-sm ml-2">Project: {projectId}</span>}
        </h1>
        {realEditingMode ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-emerald-900">
            Real editing session
          </div>
        ) : (
          <div className="flex bg-[#f8f3e6] rounded-lg p-1 border border-[#e8dcc4]">
            <button
              onClick={() => setViewMode("timeline")}
              className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${viewMode === 'timeline' ? 'bg-[#8c6b4a] text-white shadow-sm' : 'text-[#8c6b4a] hover:text-[#3d3122]'}`}
            >
              TIMELINE
            </button>
            <button
              onClick={() => setViewMode("transcript")}
              className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${viewMode === 'transcript' ? 'bg-[#8c6b4a] text-white shadow-sm' : 'text-[#8c6b4a] hover:text-[#3d3122]'}`}
            >
              TRANSCRIPT
            </button>
            <button
              onClick={() => setViewMode("segmenter")}
              className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${viewMode === 'segmenter' ? 'bg-[#8c6b4a] text-white shadow-sm' : 'text-[#8c6b4a] hover:text-[#3d3122]'}`}
            >
              SEGMENT DESK
            </button>
            <button
              onClick={() => setViewMode("reframe")}
              className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${viewMode === 'reframe' ? 'bg-[#8c6b4a] text-white shadow-sm' : 'text-[#8c6b4a] hover:text-[#3d3122]'}`}
            >
              REMOTION PLAYER
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => setRealEditingMode((enabled) => !enabled)}
            className={`px-4 py-1.5 text-xs font-bold shadow-sm rounded-md transition-colors ${
              realEditingMode
                ? "bg-emerald-700 text-white hover:bg-emerald-800"
                : "bg-white text-[#3d3122] border border-[#e8dcc4] hover:bg-[#fff8ec]"
            }`}
          >
            {realEditingMode ? "Real Mode On" : "Real Mode"}
          </button>
          <span className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-wide ${timelineSaveStatusStyles}`}>
            {timelineSaveStatusLabel}
          </span>
          <button
            onClick={() => setIsPreviewPlaying((playing) => !playing)}
            className={`px-4 py-1.5 text-xs font-bold bg-[#3d3122] hover:bg-[#59442d] text-white shadow-sm rounded-md transition-colors ${realEditingMode ? "hidden" : ""}`}
          >
            {isPreviewPlaying ? "Pause Read-Along" : "Play Read-Along"}
          </button>
          <button
            onClick={handleSaveEpisodeTimeline}
            disabled={timelineSaveState === "saving"}
            className="px-4 py-1.5 text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm rounded-md transition-colors disabled:opacity-50"
          >
            {timelineSaveState === "saving" ? "Saving..." : timelineSaveState === "saved" ? "Timeline Saved" : "Save Episode Timeline"}
          </button>
          <button
            onClick={handleRefreshProductionState}
            disabled={!isTimelineHydrated || timelineSaveState === "saving"}
            className="px-4 py-1.5 text-xs font-bold bg-white hover:bg-[#fff8ec] text-[#3d3122] border border-[#e8dcc4] shadow-sm rounded-md transition-colors disabled:opacity-50"
          >
            Refresh DB State
          </button>
          <button
            onClick={handleExportToQueue}
            disabled={isExporting || !productionDiagnostics.readyForRender}
            title={productionDiagnostics.readyForRender ? "Send this render-ready episode to the queue." : productionDiagnostics.readinessDetail}
            className={`px-4 py-1.5 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-sm rounded-md transition-colors disabled:opacity-50 ${realEditingMode ? "hidden" : ""}`}
          >
            {isExporting ? "Sending..." : productionDiagnostics.readyForRender ? "Export to Queue" : "Fix Sources Before Export"}
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Media Pool Panel */}
        <aside className="w-64 bg-[#f8f3e6] border-r border-[#e8dcc4] p-4 flex flex-col gap-3 overflow-y-auto">
          <h2 className="text-xs font-bold text-[#8c6b4a] uppercase tracking-wider mb-2">
            Media Pool
          </h2>
          {realEditingMode && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold leading-5 text-emerald-950 shadow-sm">
              <div className="font-black uppercase tracking-[0.18em]">Real editing session mode</div>
              <div className="mt-2">
                Panic-proof Episode 4 view: manuscript link, media import, spine audio, checklist, timeline, selected clip, and save state.
              </div>
              <button
                type="button"
                onClick={() => setRealEditingMode(false)}
                className="mt-3 w-full rounded-lg border border-emerald-300 bg-white px-3 py-2 font-black text-emerald-900 hover:bg-emerald-100"
              >
                Show full lab controls
              </button>
            </div>
          )}
          {projectId && (
            <div className="bg-amber-100 text-amber-800 border border-amber-200 px-3 py-2 rounded-lg text-xs font-bold shadow-sm">
               Scoped to tags: {projectId}
            </div>
          )}
          <div className="rounded-xl border border-[#d8b777] bg-[#fff4d8] p-3 text-xs leading-5 text-[#694615] shadow-sm">
            <div className="font-black uppercase tracking-[0.18em] text-[#9a641e]">Episode Production Room</div>
            <div className="mt-1 text-sm font-black text-[#3d3122]">{episodeLabel}</div>
            <div className="mt-2">
              This editor section is scoped to the manuscript episode boundary. Audio, clips, transcript words, and publish exports should all hang off this room.
            </div>
            <div className={`mt-3 rounded-lg border px-3 py-2 font-black ${
              productionState?.mode === "database"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-amber-200 bg-amber-50 text-amber-800"
            }`}>
              {productionState?.mode === "database"
                ? `DB-backed production ${productionState.id.slice(0, 8)}`
                : productionState?.message ?? "URL-backed production room until DB sync completes"}
            </div>
            <div className="mt-3 rounded-lg border border-[#ead6aa] bg-white/80 p-3 text-[11px] font-bold leading-5 text-[#5d4528]">
              <div className="font-black uppercase tracking-[0.18em] text-[#9a641e]">Production truth</div>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                <span>Hydrated from</span>
                <span className="text-right">{timelineHydrationSource}</span>
                <span>Timeline</span>
                <span className="text-right">{formatClock(productionDiagnostics.timelineEndSeconds)}</span>
                <span>Clips</span>
                <span className="text-right">{productionDiagnostics.totalClips} ({productionDiagnostics.videoClips}V / {productionDiagnostics.audioClips}A)</span>
                <span>Transcript</span>
                <span className="text-right">{productionDiagnostics.transcriptBlocks} blocks</span>
                <span>Paper cuts</span>
                <span className="text-right">{productionDiagnostics.deletedTranscriptBlocks} active / {productionDiagnostics.paperEditSnapshotCount} undo</span>
                <span>Track gaps</span>
                <span className="text-right">{productionDiagnostics.gapCount}</span>
                <span>Track overlaps</span>
                <span className="text-right">{productionDiagnostics.overlapCount}</span>
                <span>Missing media</span>
                <span className="text-right">{productionDiagnostics.missingSourceClips}</span>
                <span>YouTube-only</span>
                <span className="text-right">{productionDiagnostics.youtubeClips}</span>
                <span>Health checked</span>
                <span className="text-right">{mediaHealthStats.checked}/{mediaHealthStats.total}</span>
                <span>Preview usable</span>
                <span className="text-right">{mediaHealthStats.previewUsable}</span>
                <span>Render usable</span>
                <span className="text-right">{mediaHealthStats.renderUsable}</span>
                <span>Broken sources</span>
                <span className="text-right">{mediaHealthStats.broken}</span>
                <span>Render state</span>
                <span className="text-right">{productionDiagnostics.readinessTitle}</span>
                <span>Spine audio</span>
                <span className={`text-right ${persistedSpineAudio ? "text-emerald-800" : "text-amber-800"}`}>
                  {activeSpineAudioLabel}
                </span>
              </div>
              <div className="mt-3 rounded-md border border-[#e8dcc4] bg-white px-2 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-black">Media source safety</div>
                    <div className="mt-0.5 text-[10px] font-bold text-[#8c6b4a]">
                      Can we preview it? Can we export it? What needs attention?
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void refreshMediaHealth()}
                    disabled={isCheckingMediaHealth || mediaHealthProbeItems.length === 0}
                    className="rounded-md border border-[#d8b777] bg-[#fff8ec] px-2 py-1 font-black text-[#7b4f1f] disabled:cursor-wait disabled:opacity-60"
                  >
                    {isCheckingMediaHealth ? "Checking..." : "Recheck"}
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1 font-mono text-[10px] uppercase tracking-[0.12em]">
                  <span className={`rounded-full border px-2 py-1 ${healthStatusStyles(mediaHealthStats.broken > 0 ? "error" : mediaHealthStats.warnings > 0 ? "warning" : mediaHealthStats.checked ? "ok" : "unchecked")}`}>
                    {mediaHealthStats.broken} broken
                  </span>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-800">
                    {mediaHealthStats.healthy} healthy
                  </span>
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-amber-900">
                    {mediaHealthStats.warnings} warning
                  </span>
                  {mediaHealthStats.checking > 0 && (
                    <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-sky-800">
                      {mediaHealthStats.checking} checking
                    </span>
                  )}
                </div>
                <div className={`mt-2 rounded-lg border px-2 py-2 font-bold leading-5 ${
                  mediaHealthStats.broken > 0
                    ? "border-red-200 bg-red-50 text-red-900"
                    : mediaHealthStats.warnings > 0
                      ? "border-amber-200 bg-amber-50 text-amber-900"
                      : mediaHealthStats.checked > 0
                        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                        : "border-slate-200 bg-slate-50 text-slate-700"
                }`}>
                  {mediaHealthStats.broken > 0
                    ? "Some sources need relink or replacement before final export. You can keep editing."
                    : mediaHealthStats.warnings > 0
                      ? "Preview is usable, but final export may need cleaner sources."
                      : mediaHealthStats.checked > 0
                        ? "Sources look safe for this pass."
                        : "No media sources have been checked yet."}
                </div>
                {mediaHealthCheckedAt && (
                  <div className="mt-2 font-mono text-[10px] text-[#8c6b4a]">
                    Last checked {new Date(mediaHealthCheckedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </div>
                )}
              </div>
              <div className={`mt-3 rounded-md border px-2 py-1.5 ${
                productionDiagnostics.readinessLevel === "render"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : productionDiagnostics.readinessLevel === "preview"
                    ? "border-amber-200 bg-amber-50 text-amber-800"
                    : "border-slate-200 bg-slate-50 text-slate-700"
              }`}>
                <div className="font-black">{productionDiagnostics.readinessTitle}</div>
                <div className="mt-1 font-bold">{productionDiagnostics.readinessDetail}</div>
              </div>
              {productionDiagnostics.sourceProblemClips.length > 0 && (
                <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-amber-900">
                  <div className="font-black">Fix before final export</div>
                  <ul className="mt-1 space-y-1">
                    {productionDiagnostics.sourceProblemClips.slice(0, 4).map((clip) => (
                      <li key={clip.id} className="truncate font-mono text-[10px]">
                        {clip.trackId} {clip.name}: {describeClipSource(clip)}
                      </li>
                    ))}
                  </ul>
                  {productionDiagnostics.sourceProblemClips.length > 4 && (
                    <div className="mt-1 font-bold">
                      +{productionDiagnostics.sourceProblemClips.length - 4} more source issue(s)
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-[11px] leading-5 text-indigo-950 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-black uppercase tracking-[0.18em] text-[#2f2a7a]">Editor co-pilot</div>
                  <div className="mt-1 text-[11px] font-bold leading-5 text-[#3d316b]">
                    Run a command to execute quick editorial actions across imported media, timeline, sync, and DB-backed state.
                  </div>
                </div>
                <div className="text-right text-[10px] font-black">
                  <div className="rounded-full border border-indigo-200 bg-white px-2 py-1 font-mono text-indigo-900">
                    {editorCoPilotLog.length} actions
                  </div>
                  <div className="mt-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-1 font-mono text-violet-900">
                    {editorCoPilotMessages.length} messages
                  </div>
                </div>
              </div>
              <div className="mt-3">
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void runEditorCoPilotCommand();
                  }}
                  className="space-y-2"
                >
                  <label className="block font-black text-[#2f2a7a]">Ask co-pilot</label>
                  <textarea
                    value={editorCoPilotInput}
                    onChange={(event) => setEditorCoPilotInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void runEditorCoPilotCommand();
                      }
                    }}
                    rows={2}
                    placeholder='Try "help" or "add quote_clip.mp3 to timeline"'
                    className="mt-1 w-full resize-y rounded-lg border border-indigo-200 bg-white p-2 font-mono text-[11px] text-[#3d3122]"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      disabled={isEditorCoPilotBusy}
                      className="rounded-lg border border-[#2f2a7a] bg-[#2f2a7a] px-3 py-2 font-black text-white hover:bg-[#211f57] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isEditorCoPilotBusy ? "Running..." : "Run co-pilot"}
                    </button>
                  </div>
                </form>
              </div>
              <div className="mt-3 max-h-40 space-y-2 overflow-y-auto pr-1">
                {editorCoPilotMessages.length ? (
                  editorCoPilotMessages.map((message) => {
                    const tone = EDITOR_CO_PILOT_MESSAGE_TONE[message.role];
                    return (
                      <div key={message.id} className={`rounded-lg border p-2 ${tone}`}>
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-black">
                            {message.role === "user" ? "You" : message.role === "agent" ? "Co-pilot" : "System"} · {formatEditorCoPilotTime(message.at)}
                          </span>
                          {message.logId && (
                            <span className="rounded-full border border-current px-2 py-0.5 font-mono text-[9px]">linked action</span>
                          )}
                        </div>
                        <div className="mt-1 whitespace-pre-wrap text-[11px] leading-5 font-bold">
                          {message.text}
                        </div>
                        {message.command && (
                          <div className="mt-1 font-mono text-[10px] text-slate-700">
                            command: {message.command}
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-lg border border-dashed border-violet-200 bg-white p-3 font-black text-[#4f4494]">
                    No co-pilot messages yet.
                  </div>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {EDITOR_CO_PILOT_COMMANDS.map((command) => (
                  <button
                    key={command}
                    type="button"
                    onClick={() => void runEditorCoPilotCommand(command)}
                    className="rounded-full border border-indigo-200 bg-white px-2 py-1 text-[10px] font-black text-[#2f2a7a] hover:bg-indigo-50"
                  >
                    {command}
                  </button>
                ))}
              </div>
              <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
                {editorCoPilotLog.length ? (
                  editorCoPilotLog.map((entry) => {
                    const tone = EDITOR_CO_PILOT_STATUS_TONE[entry.status];
                    const canRollback = entry.reversible && entry.status === "success" && entry.revert.kind !== "none" && entry.revert.kind !== "undo-sync";
                    return (
                      <div key={entry.id} className={`rounded-lg border px-2 py-2 ${tone}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-black truncate">
                            {formatEditorCoPilotTime(entry.at)} · {entry.command}
                          </div>
                          <button
                            type="button"
                            onClick={() => void revertEditorCoPilotAction(entry)}
                            disabled={!canRollback}
                            className="rounded border border-[#2f2a7a] bg-white px-2 py-1 font-black text-[10px] text-[#2f2a7a] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {canRollback ? EDITOR_CO_PILOT_REVERT_LABEL[entry.revert.kind] : "No rollback"}
                          </button>
                        </div>
                        <div className="mt-1 text-[11px] font-bold leading-5">{entry.result}</div>
                        {entry.changeSummary ? (
                          <div className="mt-1 rounded-md border border-indigo-100 bg-white px-2 py-1 text-[10px] leading-4 font-bold text-[#3c2c6d]">
                            Changes: {entry.changeSummary}
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-lg border border-dashed border-indigo-200 bg-white p-3 font-black text-[#4f4494]">
                    No actions yet. Start with `help` or type one.
                  </div>
                )}
              </div>
            </div>
            <div className="mt-3 rounded-lg border border-[#d8b777] bg-white p-3 text-[11px] leading-5 text-[#5d4528] shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="font-black uppercase tracking-[0.18em] text-[#9a641e]">Episode sync checklist</div>
                <span className="rounded-full border border-[#e8dcc4] bg-[#fffaf0] px-2 py-1 font-mono text-[10px] text-[#8c6b4a]">
                  {episodeSyncChecklist.filter((item) => item.done).length}/{episodeSyncChecklist.length}
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {episodeSyncChecklist.map((item) => (
                  <div
                    key={item.id}
                    className={`rounded-lg border px-3 py-2 ${
                      item.done
                        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                        : "border-amber-200 bg-amber-50 text-amber-900"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-black">{item.title}</span>
                      <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] ${
                        item.done ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
                      }`}>
                        {item.done ? "Done" : "Next"}
                      </span>
                    </div>
                    <div className="mt-1 font-bold leading-5">{item.detail}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-3 grid gap-2">
              <Link
                href={`/create?project=${encodeURIComponent(projectId ?? "quipsly-dev-lab")}&publisher=1&boundary=${encodeURIComponent(episodeSlug)}&view=${encodeURIComponent(`${episodeSlug}-view`)}`}
                className="rounded-lg border border-[#d7bd8f] bg-white px-3 py-2 font-black text-[#5d4528] hover:bg-[#fffaf0]"
              >
                Open {episodeLabel} manuscript
              </Link>
              <Link
                href={`/recorder?project=${encodeURIComponent(projectId ?? "quipsly-dev-lab")}&episode=${encodeURIComponent(episodeSlug)}`}
                className="rounded-lg border border-[#d7bd8f] bg-white px-3 py-2 font-black text-[#5d4528] hover:bg-[#fffaf0]"
              >
                Record this episode
              </Link>
              <Link
                href={`/call?project=${encodeURIComponent(projectId ?? "quipsly-dev-lab")}&episode=${encodeURIComponent(episodeSlug)}&room=${encodeURIComponent(episodeSlug)}&role=host`}
                className="rounded-lg border border-[#3d3122] bg-[#3d3122] px-3 py-2 font-black text-white hover:bg-[#59442d]"
              >
                Live call for this episode
              </Link>
            </div>
          </div>
          <Link
            href={`/recorder?project=${encodeURIComponent(projectId ?? "quipsly-dev-lab")}&episode=${encodeURIComponent(episodeSlug)}`}
            className={`bg-[#3d3122] text-white border border-[#3d3122] px-3 py-2 rounded-lg text-xs font-bold shadow-sm hover:bg-[#59442d] ${realEditingMode ? "hidden" : ""}`}
          >
            Open Recording Room
          </Link>
          <Link
            href={`/call?project=${encodeURIComponent(projectId ?? "quipsly-dev-lab")}&episode=${encodeURIComponent(episodeSlug)}&room=${encodeURIComponent(episodeSlug)}&role=host`}
            className={`bg-[#7b4f1f] text-white border border-[#7b4f1f] px-3 py-2 rounded-lg text-xs font-bold shadow-sm hover:bg-[#9a662c] ${realEditingMode ? "hidden" : ""}`}
          >
            Open Live Call
          </Link>
          <label className={`cursor-pointer bg-white text-[#3d3122] border border-[#e8dcc4] px-3 py-2 rounded-lg text-xs font-bold shadow-sm hover:bg-[#fff8ec] ${realEditingMode ? "hidden" : ""}`}>
            Import session JSON
            <input type="file" accept="application/json,.json" onChange={handleSessionImport} className="hidden" />
          </label>
          {sessionSummary && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold leading-5 text-emerald-800">
              {sessionSummary}
            </div>
          )}
          <div className={`rounded-xl border border-[#d8b777] bg-white p-3 text-xs text-[#4a3722] shadow-sm ${realEditingMode ? "hidden" : ""}`}>
            <div className="font-black uppercase tracking-[0.18em] text-[#9a641e]">Production source bin</div>
            <div className="mt-3 rounded-lg border border-[#e8dcc4] bg-[#fffdf7] p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-black text-[#3d3122]">Media analysis jobs</div>
                  <div className="mt-1 text-[11px] font-bold leading-5 text-[#6f5336]">
                    Lightweight job ledger saved in productionJson. Execution is simple for now; the record shape is ready for a real worker.
                  </div>
                </div>
                <span className="rounded-full border border-[#e8dcc4] bg-white px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#8c6b4a]">
                  {mediaAnalysisJobs.length} total
                </span>
              </div>
              {mediaAnalysisJobs.length > 0 ? (
                <div className="mt-2 max-h-28 space-y-1 overflow-y-auto pr-1">
                  {mediaAnalysisJobs.slice(0, 8).map((job) => {
                    const asset = importedMediaAssets.find((candidate) => candidate.id === job.assetId || candidate.sourceId === job.assetId);
                    return (
                      <div key={job.id} className="flex items-center justify-between gap-2 rounded-md border border-[#e8dcc4] bg-white px-2 py-1.5">
                        <div className="min-w-0">
                          <div className="truncate font-black text-[#3d3122]">{mediaAnalysisJobLabel(job.type)} - {asset?.originalName ?? job.assetId}</div>
                          <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#8c6b4a]">
                            {job.completedAt ? `completed ${new Date(job.completedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : `started ${job.startedAt ? new Date(job.startedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "unknown"}`}
                          </div>
                        </div>
                        <span className={`shrink-0 rounded-full border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] ${mediaAnalysisJobTone(job.status)}`}>
                          {job.status}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-2 rounded-md border border-dashed border-[#d8b777] bg-white px-3 py-2 text-[11px] font-bold text-[#8c6b4a]">
                  No analysis jobs yet. Queue one from an imported asset below.
                </div>
              )}
            </div>
            <div className="mt-2 max-h-56 space-y-2 overflow-y-auto pr-1">
              {productionSources.length ? productionSources.map(({ clip, sourceLabel, missing, youtubeOnly }) => {
                const health = timelineClipHealth(clip);
                return (
                <button
                  key={clip.id}
                  type="button"
                  onClick={() => setSelectedClipId(clip.id)}
                  className={`w-full rounded-lg border px-2 py-2 text-left transition-colors ${
                    selectedClip?.id === clip.id
                      ? "border-[#3d3122] bg-[#3d3122] text-white"
                      : missing || youtubeOnly
                        ? "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100"
                        : "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
                  }`}
                >
                  <div className="truncate font-black">{clip.name}</div>
                  <div className="mt-1 flex items-center justify-between gap-2 font-mono text-[10px] opacity-80">
                    <span>{clip.trackId} / {clip.kind}</span>
                    <span>{sourceLabel}</span>
                  </div>
                  <div className={`mt-2 inline-flex rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] ${
                    selectedClip?.id === clip.id ? "border-white/40 bg-white/10 text-white" : healthStatusStyles(health?.status ?? (missing ? "error" : "unchecked"))
                  }`}>
                    {health ? `${healthStatusLabel(health.status)} / ${health.kind} / ${health.renderUsable ? "render" : health.previewUsable ? "preview" : "not usable"}` : missing ? "Missing source" : "Unchecked"}
                  </div>
                </button>
                );
              }) : (
                <div className="rounded-lg border border-dashed border-[#e8dcc4] bg-[#fffaf0] p-3 font-bold text-[#8c6b4a]">
                  No timeline sources yet.
                </div>
              )}
            </div>
          </div>
          <div className="rounded-xl border border-[#d8b777] bg-[#fffaf0] p-3 text-xs text-[#4a3722] shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-black uppercase tracking-[0.18em] text-[#9a641e]">{episodeLabel} import workflow</div>
                <p className="mt-1 leading-5 text-[#6f5336]">
                  Import phone audio, camera video, reference clips, and YouTube/source clips into this exact episode. Everything lands in the sync bench tagged as {resolvedProjectSlug} / {episodeSlug}.
                </p>
              </div>
              <div className={`flex shrink-0 flex-col gap-2 ${realEditingMode ? "hidden" : ""}`}>
                <button
                  type="button"
                  onClick={() => void handleAiOrganizeMedia()}
                  disabled={isAiOrganizingMedia}
                  className="rounded-lg border border-[#d8b777] bg-white px-3 py-2 text-center font-black text-[#7b4f1f] shadow-sm hover:bg-[#fff8ec] disabled:cursor-wait disabled:bg-[#f3e4c7] disabled:text-[#8c6b4a]"
                >
                  {isAiOrganizingMedia ? "Organizing..." : "Organize with Gemini"}
                </button>
              </div>
            </div>
            <div className="mt-3 grid gap-2">
              {EPISODE_IMPORT_LANES.map((lane) => (
                <div key={lane.id} className={`rounded-xl border p-3 ${lane.tone}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-black text-[#2f261a]">{lane.title}</div>
                      <p className="mt-1 text-[11px] font-bold leading-5 opacity-80">{lane.description}</p>
                    </div>
                    <label className={`shrink-0 rounded-lg border px-3 py-2 text-center font-black shadow-sm ${
                      isImportingMedia
                        ? "cursor-wait border-[#d8b777] bg-[#f3e4c7] text-[#8c6b4a]"
                        : "cursor-pointer border-[#3d3122] bg-[#3d3122] text-white hover:bg-[#59442d]"
                    }`}>
                      {isImportingMedia ? "Importing..." : lane.buttonLabel}
                      <input
                        type="file"
                        accept={lane.accept}
                        multiple
                        onChange={(event) => void handleMediaImport(event, lane.id)}
                        disabled={isImportingMedia}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              ))}
              <div className={`rounded-xl border border-fuchsia-200 bg-fuchsia-50 p-3 text-fuchsia-950 ${realEditingMode ? "hidden" : ""}`}>
                <div className="font-black text-[#2f261a]">YouTube / source clip</div>
                <p className="mt-1 text-[11px] font-bold leading-5 opacity-80">
                  Paste a YouTube URL, article video URL, remote source, or other clip link. It appears in the same sync bench as uploaded files.
                </p>
                <div className="mt-3 grid gap-2">
                  <input
                    type="url"
                    value={sourceClipUrl}
                    onChange={(event) => setSourceClipUrl(event.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="w-full rounded-lg border border-fuchsia-200 bg-white px-3 py-2 font-mono text-[11px] text-[#3d3122]"
                  />
                  <input
                    type="text"
                    value={sourceClipTitle}
                    onChange={(event) => setSourceClipTitle(event.target.value)}
                    placeholder="Optional title, e.g. Franklin quote clip"
                    className="w-full rounded-lg border border-fuchsia-200 bg-white px-3 py-2 font-bold text-[#3d3122]"
                  />
                  <button
                    type="button"
                    onClick={() => void handleSourceClipUrlImport()}
                    disabled={sourceClipImportStatus === "importing" || !sourceClipUrl.trim()}
                    className="rounded-lg border border-[#3d3122] bg-[#3d3122] px-3 py-2 font-black text-white shadow-sm hover:bg-[#59442d] disabled:cursor-not-allowed disabled:border-[#d8b777] disabled:bg-[#f3e4c7] disabled:text-[#8c6b4a]"
                  >
                    {sourceClipImportStatus === "importing" ? "Registering..." : "Add source clip"}
                  </button>
                </div>
              </div>
            </div>
            {mediaImportStatus && (
              <div className="mt-2 rounded-lg border border-[#e8dcc4] bg-white px-3 py-2 font-bold text-[#6f5336]">
                {mediaImportStatus}
              </div>
            )}
            {!realEditingMode && aiIngestReport && (
              <div className="mt-3 rounded-lg border border-[#d8b777] bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-black text-[#3d3122]">AI ingest report</div>
                    <p className="mt-1 leading-5 text-[#6f5336]">{aiIngestReport.summary}</p>
                  </div>
                  <span className={`rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] ${
                    aiIngestReport.source === "gemini"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-amber-200 bg-amber-50 text-amber-900"
                  }`}>
                    {aiIngestReport.source === "gemini" ? "Gemini" : "Fallback"}
                  </span>
                </div>
                {aiIngestReport.batchPlan.length > 0 && (
                  <ol className="mt-3 space-y-2">
                    {aiIngestReport.batchPlan.slice(0, 3).map((step, index) => (
                      <li key={`${step.title}-${index}`} className="rounded-lg border border-[#e8dcc4] bg-[#fffaf0] px-3 py-2">
                        <div className="font-black text-[#3d3122]">{index + 1}. {step.title}</div>
                        <div className="mt-1 font-bold leading-5 text-[#6f5336]">{step.detail}</div>
                      </li>
                    ))}
                  </ol>
                )}
                {aiIngestReport.recommendations.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <div className="font-black uppercase tracking-[0.16em] text-[#9a641e]">Recommendations</div>
                    {aiIngestReport.recommendations.map((recommendation) => {
                      const asset = importedMediaAssets.find((candidate) =>
                        candidate.id === recommendation.assetId || candidate.sourceId === recommendation.assetId
                      );
                      const applyKey = `${asset?.id ?? recommendation.assetId}:${recommendation.assetId}`;
                      const canApply = Boolean(asset);
                      const isApplying = applyingAiSuggestionIds.has(applyKey);
                      return (
                        <div key={`${recommendation.assetId}-${recommendation.role}`} className="rounded-lg border border-[#e8dcc4] bg-[#fffaf0] px-3 py-2">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate font-black text-[#3d3122]">
                                {asset?.originalName ?? recommendation.assetId}
                              </div>
                              <div className="mt-1 flex flex-wrap gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#8c6b4a]">
                                <span className="rounded-full bg-white px-2 py-1">{recommendation.role}</span>
                                <span className="rounded-full bg-white px-2 py-1">{recommendation.suggestedTrackId}</span>
                                <span className="rounded-full bg-white px-2 py-1">{normalizeSuggestedSyncStatus(recommendation.suggestedSyncStatus)}</span>
                                <span className="rounded-full bg-white px-2 py-1">{Math.round(recommendation.confidence * 100)}%</span>
                              </div>
                              <div className="mt-1 font-bold leading-5 text-[#6f5336]">{recommendation.suggestedAction}</div>
                              <div className="mt-1 text-[10px] font-bold leading-4 text-[#8c6b4a]">
                                Safe apply: updates imported-asset metadata only. It will not move timeline clips.
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => void applyAiIngestRecommendation(recommendation, asset)}
                              disabled={!canApply || isApplying}
                              className="shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 font-black text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-500"
                              title={canApply ? recommendationApplySummary(recommendation) : "Import record for this recommendation was not found."}
                            >
                              {isApplying ? "Applying..." : "Apply suggestion"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {aiIngestReport.warnings.length > 0 && (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 font-bold leading-5 text-amber-900">
                    {aiIngestReport.warnings[0]}
                  </div>
                )}
              </div>
            )}
            <div className={`mt-3 rounded-lg border border-[#3d3122] bg-[#fffdf7] p-3 shadow-sm ${realEditingMode ? "hidden" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-black uppercase tracking-[0.18em] text-[#3d3122]">Guided sync wizard</div>
                  <p className="mt-1 leading-5 text-[#6f5336]">
                    One safe pass: choose the spine, choose what to line up, set a rough anchor, preview, nudge, then save.
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-2">
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-emerald-800">
                    {syncHistory.length} undo point{syncHistory.length === 1 ? "" : "s"}
                  </span>
                  <button
                    type="button"
                    onClick={() => void undoLastSyncChange()}
                    disabled={!latestSyncSnapshot}
                    className="rounded-lg border border-[#d8b777] bg-white px-3 py-2 font-black text-[#7b4f1f] shadow-sm hover:bg-[#fff8ec] disabled:cursor-not-allowed disabled:bg-[#f3e4c7] disabled:text-[#8c6b4a]"
                    title={latestSyncSnapshot?.label || latestSyncSnapshot?.type || "No sync change to undo"}
                  >
                    Undo last sync change
                  </button>
                </div>
              </div>

              <SyncStatusGuide compact />

              <div className="mt-3 grid gap-3">
                <label className="block">
                  <span className="font-black text-[#3d3122]">1. Pick spine audio</span>
                  <select
                    value={syncWizardSpineAssetId}
                    onChange={(event) => setSyncWizardSpineAssetId(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#d8b777] bg-white px-3 py-2 font-bold text-[#3d3122]"
                  >
                    <option value="">No spine audio selected yet</option>
                    {importedAudioAssets.map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {asset.originalName} ({formatBytes(asset.size)})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => syncWizardSpineAsset && void setEpisodeSpineAudio({ asset: syncWizardSpineAsset })}
                    disabled={!syncWizardSpineAsset}
                    className="mt-2 w-full rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 font-black text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-500"
                  >
                    Make selected import the episode spine
                  </button>
                </label>

                {timelineAudioClips.length > 0 && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                    <div className="font-black text-emerald-950">Timeline audio clips can also be the spine</div>
                    <div className="mt-2 grid gap-2">
                      {timelineAudioClips.slice(0, 4).map((clip) => (
                        <button
                          key={clip.id}
                          type="button"
                          onClick={() => void setEpisodeSpineAudio({ clip })}
                          className={`rounded-lg border px-3 py-2 text-left font-bold ${
                            persistedSpineAudio?.clipId === clip.id
                              ? "border-emerald-400 bg-white text-emerald-900"
                              : "border-emerald-200 bg-white/70 text-emerald-900 hover:bg-white"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate">{clip.name}</span>
                            <span className="font-mono text-[10px]">{clip.trackId} / {formatClock(clip.startIn)}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <label className="block">
                  <span className="font-black text-[#3d3122]">2. Pick target media</span>
                  <select
                    value={syncWizardTargetAssetId}
                    onChange={(event) => setSyncWizardTargetAssetId(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#d8b777] bg-white px-3 py-2 font-bold text-[#3d3122]"
                  >
                    <option value="">No target media selected yet</option>
                    {syncWizardTargetOptions.map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {asset.originalName} ({asset.kind}, {formatBytes(asset.size)})
                      </option>
                    ))}
                  </select>
                  {syncWizardTargetAsset && (() => {
                    const targetHealth = importedAssetHealth(syncWizardTargetAsset);
                    const targetConfidence = importedAssetConfidenceStatus(syncWizardTargetAsset, targetHealth);
                    return (
                      <div className={`mt-2 rounded-lg border px-3 py-2 text-[11px] font-bold leading-5 ${targetConfidence.tone}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-black">Status: {targetConfidence.label}</div>
                            <div className="mt-1">{targetConfidence.meaning}</div>
                          </div>
                          <span className="shrink-0 rounded-full bg-white/70 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em]">
                            {syncWizardTargetAsset.kind}
                          </span>
                        </div>
                        <div className="mt-1 text-[10px] opacity-80">
                          Next: {targetConfidence.next}
                        </div>
                      </div>
                    );
                  })()}
                </label>

                <div className="rounded-lg border border-[#e8dcc4] bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-black text-[#3d3122]">3. Rough timeline anchor</div>
                      <div className="mt-1 font-mono text-[11px] text-[#8c6b4a]">
                        Target starts at {formatClock(syncWizardAnchorSeconds)}. Playhead is {formatClock(currentTime)}.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSyncWizardPreviousAnchorSeconds(syncWizardAnchorSeconds);
                        setSyncWizardAnchorSeconds(roundSeconds(currentTime));
                      }}
                      className="rounded-lg border border-[#d8b777] bg-[#fff8ec] px-3 py-2 font-black text-[#7b4f1f] hover:bg-[#f3e4c7]"
                    >
                      Use playhead
                    </button>
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={syncWizardAnchorSeconds}
                    onChange={(event) => {
                      setSyncWizardPreviousAnchorSeconds(syncWizardAnchorSeconds);
                      setSyncWizardAnchorSeconds(Math.max(0, roundSeconds(Number(event.target.value) || 0)));
                    }}
                    className="mt-3 w-full rounded-lg border border-[#d8b777] bg-white px-3 py-2 font-mono text-[#3d3122]"
                  />
                </div>

                <div className="rounded-xl border border-[#3d3122] bg-white p-3 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-black text-[#3d3122]">4. Sync preview - confidence check</div>
                      <p className="mt-1 text-[11px] font-bold leading-5 text-[#6f5336]">
                        This previews the spine at the current anchor against the selected target at its beginning. It is not final NLE playback yet; it is a quick alignment sanity check.
                      </p>
                    </div>
                    <span
                      className={`rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] ${
                        syncPreviewState === "playing"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                          : syncPreviewState === "error"
                            ? "border-red-200 bg-red-50 text-red-900"
                            : "border-[#e8dcc4] bg-[#fffaf0] text-[#8c6b4a]"
                      }`}
                    >
                      {syncPreviewState}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <div className="rounded-lg border border-[#e8dcc4] bg-[#fffaf0] p-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8c6b4a]">Spine starts</div>
                      <div className="mt-1 font-mono text-xl font-black text-[#3d3122]">{formatClock(syncWizardAnchorSeconds)}</div>
                    </div>
                    <div className="rounded-lg border border-[#e8dcc4] bg-[#fffaf0] p-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8c6b4a]">Target starts</div>
                      <div className="mt-1 font-mono text-xl font-black text-[#3d3122]">{formatClock(0)}</div>
                    </div>
                    <div className="rounded-lg border border-sky-200 bg-sky-50 p-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-sky-800">Current offset</div>
                      <div className="mt-1 font-mono text-xl font-black text-sky-950">+{formatClock(syncWizardAnchorSeconds)}</div>
                    </div>
                  </div>

                  <div className="mt-2 rounded-lg border border-[#e8dcc4] bg-[#fffdf7] px-3 py-2 text-[11px] font-bold leading-5 text-[#6f5336]">
                    Translation: when you click preview, the spine jumps to {formatClock(syncWizardAnchorSeconds)} and the target starts at 00:00. If the target moment sounds late, move it earlier. If it sounds early, move it later.
                  </div>

                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <div className="rounded-lg border border-[#e8dcc4] bg-[#fffaf0] p-2">
                      <div className="font-black text-[#7b4f1f]">Spine audio</div>
                      <div className="mt-1 truncate font-bold text-[#3d3122]">{syncWizardSpineAsset?.originalName ?? "No spine selected"}</div>
                      {syncWizardSpineAsset?.playbackUrl ? (
                        <audio
                          ref={syncPreviewSpineRef}
                          src={syncWizardSpineAsset.playbackUrl}
                          controls
                          preload="metadata"
                          className="mt-2 w-full"
                        />
                      ) : (
                        <div className="mt-2 rounded-lg border border-dashed border-[#d8b777] bg-white px-3 py-2 text-[11px] font-bold text-[#8c6b4a]">
                          Select an imported spine audio file to enable preview.
                        </div>
                      )}
                    </div>
                    <div className="rounded-lg border border-[#e8dcc4] bg-[#fffaf0] p-2">
                      <div className="font-black text-[#7b4f1f]">Target media</div>
                      <div className="mt-1 truncate font-bold text-[#3d3122]">{syncWizardTargetAsset?.originalName ?? "No target selected"}</div>
                      {syncWizardTargetAsset?.playbackUrl && syncWizardTargetAsset.kind === "video" && (
                        <video
                          ref={(node) => {
                            syncPreviewTargetRef.current = node;
                          }}
                          src={syncWizardTargetAsset.playbackUrl}
                          controls
                          preload="metadata"
                          className="mt-2 max-h-44 w-full rounded-lg bg-black"
                        />
                      )}
                      {syncWizardTargetAsset?.playbackUrl && syncWizardTargetAsset.kind !== "video" && (
                        <audio
                          ref={(node) => {
                            syncPreviewTargetRef.current = node;
                          }}
                          src={syncWizardTargetAsset.playbackUrl}
                          controls
                          preload="metadata"
                          className="mt-2 w-full"
                        />
                      )}
                      {!syncWizardTargetAsset?.playbackUrl && (
                        <div className="mt-2 rounded-lg border border-dashed border-[#d8b777] bg-white px-3 py-2 text-[11px] font-bold text-[#8c6b4a]">
                          Select a target audio or video file to enable preview.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => void previewSyncFromAnchor()}
                      disabled={!syncWizardSpineAsset?.playbackUrl || !syncWizardTargetAsset?.playbackUrl}
                      className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-left font-black text-emerald-950 shadow-sm hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-500"
                    >
                      Preview from anchor
                    </button>
                    <button
                      type="button"
                      onClick={pauseSyncPreview}
                      disabled={syncPreviewState !== "playing"}
                      className="rounded-xl border border-[#e8dcc4] bg-[#fff8ec] px-3 py-3 text-left font-black text-[#7b4f1f] shadow-sm hover:bg-[#f3e4c7] disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-500"
                    >
                      Pause both
                    </button>
                    <button
                      type="button"
                      onClick={resetSyncPreview}
                      disabled={!syncWizardSpineAsset?.playbackUrl && !syncWizardTargetAsset?.playbackUrl}
                      className="rounded-xl border border-[#e8dcc4] bg-white px-3 py-3 text-left font-black text-[#3d3122] shadow-sm hover:bg-[#fffaf0] disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-500"
                    >
                      Reset preview
                    </button>
                  </div>

                  <div className={`mt-3 rounded-lg border px-3 py-2 font-bold leading-5 ${
                    syncPreviewState === "error"
                      ? "border-red-200 bg-red-50 text-red-900"
                      : "border-amber-200 bg-amber-50 text-amber-900"
                  }`}>
                    {syncPreviewMessage}
                  </div>
                </div>

                <div className="rounded-xl border border-[#3d3122] bg-[#fffdf7] p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-black text-[#3d3122]">5. Move selected target until it lines up</div>
                      <p className="mt-1 text-[11px] font-bold leading-5 text-[#6f5336]">
                        These buttons only move the saved sync anchor for {syncWizardTargetAsset?.originalName ?? "the selected target"}. They do not cut or move timeline clips.
                      </p>
                    </div>
                    <span className="rounded-full border border-[#e8dcc4] bg-white px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#8c6b4a]">
                      Target anchor
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-[#e8dcc4] bg-[#fffaf0] p-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8c6b4a]">Before</div>
                      <div className="mt-1 font-mono text-2xl font-black text-[#3d3122]">
                        {formatClock(syncWizardPreviousAnchorSeconds ?? syncWizardAnchorSeconds)}
                      </div>
                    </div>
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-800">After</div>
                      <div className="mt-1 font-mono text-2xl font-black text-emerald-950">
                        {formatClock(syncWizardAnchorSeconds)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {[
                      { delta: -10, label: "10 sec earlier", value: "-10s" },
                      { delta: -1, label: "1 sec earlier", value: "-1s" },
                      { delta: -0.1, label: "Tiny earlier", value: "-0.1s" },
                      { delta: 0.1, label: "Tiny later", value: "+0.1s" },
                      { delta: 1, label: "1 sec later", value: "+1s" },
                      { delta: 10, label: "10 sec later", value: "+10s" },
                    ].map((nudge) => (
                      <button
                        key={nudge.value}
                        type="button"
                        onClick={() => nudgeSyncWizardAnchor(nudge.delta)}
                        disabled={!syncWizardTargetAsset}
                        className={`min-h-20 rounded-xl border px-3 py-3 text-left shadow-sm transition-colors disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-500 ${
                          nudge.delta < 0
                            ? "border-sky-200 bg-sky-50 text-sky-950 hover:bg-sky-100"
                            : "border-amber-200 bg-amber-50 text-amber-950 hover:bg-amber-100"
                        }`}
                      >
                        <div className="font-mono text-2xl font-black">{nudge.value}</div>
                        <div className="mt-1 text-[11px] font-black uppercase tracking-[0.12em]">{nudge.label}</div>
                      </button>
                    ))}
                  </div>

                  <div className="mt-3 rounded-lg border border-[#e8dcc4] bg-white px-3 py-2 text-[11px] font-bold leading-5 text-[#6f5336]">
                    If the target sound happens too late, use an earlier button. If it happens too soon, use a later button. Then save the synced alignment.
                  </div>
                </div>

                <div className="rounded-xl border border-red-200 bg-red-50 p-3 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-black text-red-950">6. Something looks wrong</div>
                      <p className="mt-1 text-[11px] font-bold leading-5 text-red-900">
                        Recovery actions for sync panic. These avoid destructive timeline edits and keep the current episode diagnosable.
                      </p>
                    </div>
                    <span className="rounded-full border border-red-200 bg-white px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-red-800">
                      safe recovery
                    </span>
                  </div>

                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => void holdSyncWizardTarget()}
                      disabled={!syncWizardTargetAsset}
                      className="rounded-xl border border-red-200 bg-white px-3 py-3 text-left shadow-sm hover:bg-red-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-500"
                    >
                      <div className="font-black text-red-950">Hold this file</div>
                    <div className="mt-1 text-[11px] font-bold leading-5 text-red-800">
                        Parks {syncWizardTargetAsset?.originalName ?? "the selected target"} for later so it stops feeling urgent.
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => void undoLastSyncChange()}
                      disabled={!latestSyncSnapshot}
                      className="rounded-xl border border-red-200 bg-white px-3 py-3 text-left shadow-sm hover:bg-red-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-500"
                    >
                      <div className="font-black text-red-950">Revert last sync</div>
                      <div className="mt-1 text-[11px] font-bold leading-5 text-red-800">
                        Undo: {latestSyncSnapshot?.label || latestSyncSnapshot?.type || "no sync history yet"}.
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => void detachSourceFromSelectedClip()}
                      disabled={!selectedClip?.assetId}
                      className="rounded-xl border border-red-200 bg-white px-3 py-3 text-left shadow-sm hover:bg-red-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-500"
                    >
                      <div className="font-black text-red-950">Detach source from selected clip</div>
                      <div className="mt-1 text-[11px] font-bold leading-5 text-red-800">
                        Clears the selected clip source after saving an undo point. Clip: {selectedClip?.name ?? "none selected"}.
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => void copySyncDiagnosticJson()}
                      className="rounded-xl border border-red-200 bg-white px-3 py-3 text-left shadow-sm hover:bg-red-100"
                    >
                      <div className="font-black text-red-950">Copy diagnostic JSON</div>
                      <div className="mt-1 text-[11px] font-bold leading-5 text-red-800">
                        Copies route, selected clip, target media, latest sync snapshot, and health summary for debugging.
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={refreshEpisodeProductionState}
                      className="rounded-xl border border-red-200 bg-white px-3 py-3 text-left shadow-sm hover:bg-red-100 md:col-span-2"
                    >
                      <div className="font-black text-red-950">Refresh DB state</div>
                      <div className="mt-1 text-[11px] font-bold leading-5 text-red-800">
                        Reloads the episode production record from the database without changing saved media or timeline data.
                      </div>
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void saveSyncWizardAlignment()}
                  disabled={!syncWizardTargetAsset}
                  className="rounded-xl border border-[#3d3122] bg-[#3d3122] px-4 py-3 font-black text-white shadow-sm hover:bg-[#59442d] disabled:cursor-not-allowed disabled:border-[#d8b777] disabled:bg-[#f3e4c7] disabled:text-[#8c6b4a]"
                >
                  7. Save synced alignment
                </button>
              </div>
            </div>
            <div className="mt-3 rounded-lg border border-[#e8dcc4] bg-white p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="font-black text-[#3d3122]">Episode sync lane</div>
                <div className="font-mono text-[10px] text-[#8c6b4a]">{formatClock(0)} - {formatClock(totalDuration)}</div>
              </div>
              <div className="relative mt-3 h-8 rounded-full border border-[#e8dcc4] bg-[#fff8ec]">
                <div
                  className="absolute top-0 h-full w-px bg-[#3d3122]/50"
                  style={{ left: `${Math.max(0, Math.min(100, (currentTime / Math.max(totalDuration, 1)) * 100))}%` }}
                  title={`Playhead ${formatClock(currentTime)}`}
                />
                {importedMediaAssets.map((asset) => {
                  const percent = importedAssetTimelinePercent(asset, totalDuration);
                  if (percent === null) return null;
                  return (
                    <button
                      key={`${asset.id}-anchor`}
                      type="button"
                      onClick={() => setCurrentTime(asset.sync?.anchorTimelineSeconds ?? currentTime)}
                      className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
                      style={{ left: `${percent}%`, background: importedAssetColor(asset) }}
                      title={`${asset.originalName}: ${formatClock(asset.sync?.anchorTimelineSeconds ?? 0)}`}
                    />
                  );
                })}
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.14em]">
                <span className="rounded-full border border-[#e8dcc4] bg-[#fffaf0] px-2 py-1 text-[#8c6b4a]">{importedMediaAssets.length} imported</span>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-800">
                  {importedMediaAssets.filter((asset) => asset.sync?.status === "synced").length} synced
                </span>
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-amber-900">
                  {importedMediaAssets.filter((asset) => (asset.sync?.status ?? "ready-to-sync") === "ready-to-sync").length} safe to test
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-slate-700">
                  {importedMediaAssets.filter((asset) => asset.sync?.status === "held").length} held
                </span>
              </div>
            </div>
            <SyncStatusGuide />
            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
              {importedMediaAssets.length ? importedMediaAssets.map((asset) => {
                const aiRecommendation = aiIngestRecommendationsByAsset.get(asset.id) ?? aiIngestRecommendationsByAsset.get(asset.sourceId);
                const transcriptAssistReport = transcriptAssistReportsByAsset.get(asset.id) ?? transcriptAssistReportsByAsset.get(asset.sourceId);
                const isTranscriptAssisting = transcriptAssistingAssetIds.has(asset.id);
                const assetJobs = mediaAnalysisJobsByAsset.get(asset.id) ?? mediaAnalysisJobsByAsset.get(asset.sourceId) ?? [];
                const health = importedAssetHealth(asset);
                const confidenceStatus = importedAssetConfidenceStatus(asset, health);
                const isSpineAsset = persistedSpineAudio?.assetId === asset.id || persistedSpineAudio?.assetId === asset.sourceId;
                return (
                <div key={asset.id} className="rounded-lg border border-[#e8dcc4] bg-white p-2 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-black text-[#3d3122]">{asset.originalName}</div>
                      <div className="mt-1 flex flex-wrap gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#8c6b4a]">
                        <span className="rounded-full bg-[#f5ead6] px-2 py-1">{asset.kind}</span>
                        <span className="rounded-full bg-[#f5ead6] px-2 py-1">{importedAssetRoleLabel(asset)}</span>
                        <span className="rounded-full bg-[#f5ead6] px-2 py-1">{formatBytes(asset.size)}</span>
                        <span className="rounded-full bg-[#f5ead6] px-2 py-1">{asset.proxy?.status ?? "proxy pending"}</span>
                        <span className={`rounded-full border px-2 py-1 ${healthStatusStyles(health?.status ?? "unchecked")}`}>
                          {health ? healthStatusLabel(health.status) : "Unchecked"}
                        </span>
                        <span className={`rounded-full border px-2 py-1 ${confidenceStatus.tone}`}>{confidenceStatus.label}</span>
                        <span className={`rounded-full border px-2 py-1 ${importedAssetSyncTone(asset)}`}>{importedAssetSyncLabel(asset)}</span>
                        {typeof asset.sync?.anchorTimelineSeconds === "number" && (
                          <span className="rounded-full bg-[#f5ead6] px-2 py-1">{formatClock(asset.sync.anchorTimelineSeconds)}</span>
                        )}
                      </div>
                    </div>
                    <span
                      className="mt-1 h-3 w-3 rounded-full"
                      style={{ background: importedAssetColor(asset) }}
                      aria-hidden="true"
                    />
                  </div>
                  <div className={`mt-2 rounded-lg border px-3 py-2 text-[11px] font-bold leading-5 ${healthStatusStyles(health?.status ?? "unchecked")}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-black">{healthSafetyTitle(health)}</div>
                        <div className="mt-1">{healthNextAction(health)}</div>
                      </div>
                      <span className="shrink-0 rounded-full bg-white/70 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em]">
                        {isSpineAsset ? "Spine" : confidenceStatus.label}
                      </span>
                    </div>
                    <div className="mt-2 rounded-md border border-white/70 bg-white/60 px-2 py-1 text-[#3d3122]">
                      Status means: {confidenceStatus.meaning}
                    </div>
                    <div className="mt-2 rounded-md border border-white/70 bg-white/60 px-2 py-1 text-[#3d3122]">
                      {assetSyncTargetSummary(asset, selectedClip, persistedSpineAudio)}
                    </div>
                    <div className="mt-1 text-[10px] opacity-80">
                      Next: {asset.sync?.status === "ready-to-sync" || !asset.sync?.status
                        ? confidenceStatus.next
                        : assetNextAction(asset, health, persistedSpineAudio)}
                    </div>
                  </div>
                  {health && (
                    <div className={`mt-2 rounded-lg border px-3 py-2 text-[11px] font-bold leading-5 ${healthStatusStyles(health.status)}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span>{health.kind.toUpperCase()} source details</span>
                        <span className="font-mono">{health.method ?? "probe"}{health.statusCode ? ` / ${health.statusCode}` : ""}</span>
                      </div>
                      <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
                        <span>Reachable</span>
                        <span className="text-right">{health.reachable ? "yes" : "no"}</span>
                        <span>Preview</span>
                        <span className="text-right">{health.previewUsable ? "yes" : "no"}</span>
                        <span>Render</span>
                        <span className="text-right">{health.renderUsable ? "yes" : "no"}</span>
                        <span>Type</span>
                        <span className="truncate text-right">{health.contentType}</span>
                      </div>
                      <div className="mt-1 text-[10px] opacity-80">{health.note}</div>
                    </div>
                  )}
                  {!realEditingMode && aiRecommendation && (
                    <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-black">{aiRecommendation.role} / {aiRecommendation.suggestedTrackId}</span>
                        <span className="font-mono text-[10px]">{Math.round(aiRecommendation.confidence * 100)}%</span>
                      </div>
                      <div className="mt-1 font-bold leading-5">{aiRecommendation.suggestedAction}</div>
                      {aiRecommendation.reason && (
                        <div className="mt-1 text-[10px] font-bold leading-4 opacity-80">{aiRecommendation.reason}</div>
                      )}
                      <button
                        type="button"
                        onClick={() => void applyAiIngestRecommendation(aiRecommendation, asset)}
                        disabled={applyingAiSuggestionIds.has(`${asset.id}:${aiRecommendation.assetId}`)}
                        className="mt-2 w-full rounded-lg border border-emerald-300 bg-white px-2 py-2 font-black text-emerald-800 hover:bg-emerald-100 disabled:cursor-wait disabled:bg-emerald-50"
                        title={recommendationApplySummary(aiRecommendation)}
                      >
                        {applyingAiSuggestionIds.has(`${asset.id}:${aiRecommendation.assetId}`) ? "Applying..." : "Apply suggestion"}
                      </button>
                    </div>
                  )}
                  {!realEditingMode && (asset.sync?.suggestedTrackId || asset.sync?.suggestedRole) && (
                    <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] font-bold leading-5 text-sky-900">
                      <div className="font-black">Applied suggestion</div>
                      <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
                        <span>Role</span>
                        <span className="text-right">{asset.sync.suggestedRole ?? "not set"}</span>
                        <span>Track</span>
                        <span className="text-right">{asset.sync.suggestedTrackId ?? "not set"}</span>
                        <span>Confidence</span>
                        <span className="text-right">
                          {typeof asset.sync.suggestionConfidence === "number" ? `${Math.round(asset.sync.suggestionConfidence * 100)}%` : "not set"}
                        </span>
                      </div>
                      {asset.sync.suggestionReason && (
                        <div className="mt-1 text-[10px] opacity-80">{asset.sync.suggestionReason}</div>
                      )}
                    </div>
                  )}
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => addImportedAssetToTimeline(asset)}
                      className="rounded-lg border border-[#d8b777] bg-[#fff8ec] px-2 py-2 font-black text-[#7b4f1f] hover:bg-[#f3e4c7]"
                      title="Creates a timeline clip at the current playhead on a sensible audio or video track."
                    >
                      Add to timeline here
                    </button>
                    <button
                      type="button"
                      onClick={() => void attachImportedAssetToSelectedClip(asset)}
                      className="rounded-lg border border-[#d8b777] bg-[#fff8ec] px-2 py-2 font-black text-[#7b4f1f] hover:bg-[#f3e4c7]"
                      title={selectedClip ? `Use this file as the source for ${selectedClip.name}.` : "Select a timeline clip first, then attach this file to it."}
                    >
                      Attach to selected clip
                    </button>
                    <button
                      type="button"
                      onClick={() => void updateImportedAssetSyncStatus(asset, "synced")}
                      className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-2 font-black text-emerald-800 hover:bg-emerald-100"
                      title="Use this when the file is lined up correctly enough to keep editing."
                    >
                      Mark lined up
                    </button>
                  </div>
                  {!realEditingMode && (asset.kind === "audio" || asset.kind === "video" || asset.contentType.startsWith("audio/") || asset.contentType.startsWith("video/")) && (
                    <button
                      type="button"
                      onClick={() => void requestTranscriptAssist(asset)}
                      disabled={isTranscriptAssisting}
                      className="mt-2 w-full rounded-lg border border-sky-200 bg-sky-50 px-2 py-2 text-left font-black text-sky-900 hover:bg-sky-100 disabled:cursor-wait disabled:bg-slate-50 disabled:text-slate-500"
                    >
                      {isTranscriptAssisting ? "Generating transcript suggestions..." : "Gemini transcript assist"}
                      <div className="mt-1 text-[10px] font-bold leading-4 opacity-80">
                        Saves suggestions only. It will not replace the episode transcript.
                      </div>
                    </button>
                  )}
                  <div className={`mt-2 rounded-lg border border-[#e8dcc4] bg-[#fffdf7] px-3 py-2 ${realEditingMode ? "hidden" : ""}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-black text-[#3d3122]">Media analysis jobs</div>
                      <span className="rounded-full border border-[#e8dcc4] bg-white px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[#8c6b4a]">
                        {assetJobs.length}
                      </span>
                    </div>
                    {assetJobs.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {assetJobs.slice(0, 4).map((job) => (
                          <span
                            key={job.id}
                            className={`rounded-full border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] ${mediaAnalysisJobTone(job.status)}`}
                            title={job.error || JSON.stringify(job.result)}
                          >
                            {mediaAnalysisJobLabel(job.type)} / {job.status}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="mt-2 grid grid-cols-2 gap-1">
                      {(["file-triage", "sync-suggestion", "proxy-needed", "transcript"] as MediaAnalysisJobType[]).map((jobType) => {
                        const jobKey = `${asset.id}:${jobType}`;
                        const isQueueing = queueingMediaJobKeys.has(jobKey);
                        return (
                          <button
                            key={jobType}
                            type="button"
                            onClick={() => void queueMediaAnalysisJob(asset, jobType)}
                            disabled={isQueueing}
                            className="rounded-md border border-[#d8b777] bg-white px-2 py-1.5 text-left text-[10px] font-black text-[#7b4f1f] hover:bg-[#fff8ec] disabled:cursor-wait disabled:bg-slate-50 disabled:text-slate-500"
                          >
                            {isQueueing ? "Saving..." : mediaAnalysisJobLabel(jobType)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {!realEditingMode && transcriptAssistReport && (
                    <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] font-bold leading-5 text-sky-950">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-black">Transcript assist</div>
                        <span className={`rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] ${
                          transcriptAssistReport.inspectedRawMedia
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : "border-amber-200 bg-amber-50 text-amber-900"
                        }`}>
                          {transcriptAssistReport.inspectedRawMedia ? "media heard" : "metadata"}
                        </span>
                      </div>
                      <div className="mt-1 text-sky-900">{transcriptAssistReport.summary}</div>
                      {transcriptAssistReport.transcriptText && (
                        <div className="mt-2 max-h-24 overflow-y-auto rounded-md border border-sky-100 bg-white px-2 py-1 font-serif text-[12px] leading-5 text-[#3d3122]">
                          {transcriptAssistReport.transcriptText}
                        </div>
                      )}
                      {transcriptAssistReport.transcriptBlocks.length > 0 && (
                        <div className="mt-2 font-mono text-[10px] text-sky-800">
                          {transcriptAssistReport.transcriptBlocks.length} suggested block{transcriptAssistReport.transcriptBlocks.length === 1 ? "" : "s"}
                        </div>
                      )}
                      <div className="mt-1 text-[10px] text-sky-800">{transcriptAssistReport.suggestedUse}</div>
                      {transcriptAssistReport.warnings[0] && (
                        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-amber-900">
                          {transcriptAssistReport.warnings[0]}
                        </div>
                      )}
                    </div>
                  )}
                  {(asset.kind === "audio" || asset.contentType.startsWith("audio/")) && (
                    <button
                      type="button"
                      onClick={() => void setEpisodeSpineAudio({ asset })}
                      className={`mt-2 w-full rounded-lg border px-2 py-2 font-black ${
                        persistedSpineAudio?.assetId === asset.id || persistedSpineAudio?.assetId === asset.sourceId
                          ? "border-emerald-300 bg-emerald-100 text-emerald-900"
                          : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                      }`}
                    >
                      {persistedSpineAudio?.assetId === asset.id || persistedSpineAudio?.assetId === asset.sourceId
                        ? "This is the episode spine audio"
                        : "Make this the main spine audio"}
                    </button>
                  )}
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => void updateImportedAssetSyncStatus(asset, "ready-to-sync")}
                      className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-2 font-black text-amber-900 hover:bg-amber-100"
                      title={`Sets this file's anchor to the current playhead: ${formatClock(currentTime)}.`}
                    >
                      Line up at playhead
                    </button>
                    <button
                      type="button"
                      onClick={() => void updateImportedAssetSyncStatus(asset, "held")}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 font-black text-slate-700 hover:bg-slate-100"
                      title="Park this file so it is preserved but no longer feels like the next urgent thing."
                    >
                      Park for later
                    </button>
                  </div>
                  {!realEditingMode && (
                    <button
                      type="button"
                      onClick={() => void navigator.clipboard?.writeText(asset.gcsUri || asset.playbackUrl)}
                      className="mt-2 w-full rounded-lg border border-dashed border-[#d8b777] px-2 py-2 font-mono text-[10px] text-[#8c6b4a] hover:bg-[#fff8ec]"
                    >
                      Copy vault URI
                    </button>
                  )}
                </div>
                );
              }) : (
                <div className="rounded-lg border border-dashed border-[#e8dcc4] bg-white p-3 font-bold leading-5 text-[#8c6b4a]">
                  <div className="font-black text-[#3d3122]">No episode media imported yet.</div>
                  <div className="mt-1">
                    Start with the least scary file: import the main phone/audio recording first, then make it the spine audio. Camera video and reference clips can come later.
                  </div>
                </div>
              )}
            </div>
          </div>
          {selectedClip ? (
            <div className="rounded-xl border border-[#d8b777] bg-[#fffaf0] p-3 text-xs text-[#4a3722] shadow-sm">
              {(() => {
                const selectedHealth = timelineClipHealth(selectedClip);
                return (
                  <>
              <div className="font-black uppercase tracking-[0.18em] text-[#9a641e]">Selected clip</div>
              <div className="mt-2 font-black text-[#3d3122]">{selectedClip.name}</div>
              <div className={`mt-2 rounded-lg border px-3 py-2 font-bold leading-5 ${healthStatusStyles(selectedHealth?.status ?? (isMissingProductionSource(selectedClip) ? "error" : "unchecked"))}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-black">{healthSafetyTitle(selectedHealth, isMissingProductionSource(selectedClip))}</div>
                    <div className="mt-1">{healthNextAction(selectedHealth, isMissingProductionSource(selectedClip))}</div>
                  </div>
                  <span className="shrink-0 rounded-full bg-white/70 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em]">
                    {selectedClip.trackId}
                  </span>
                </div>
                <div className="mt-2 rounded-md border border-white/70 bg-white/60 px-2 py-1 text-[#3d3122]">
                  This clip uses: {selectedClip.assetId ? describeClipSource(selectedClip) : "no source yet"}
                </div>
              </div>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 leading-5">
                <dt className="font-black text-[#8c6b4a]">Track</dt>
                <dd className="text-right font-mono">{selectedClip.trackId}</dd>
                <dt className="font-black text-[#8c6b4a]">Timeline</dt>
                <dd className="text-right font-mono">{formatClock(selectedClip.startIn)}-{formatClock(selectedClip.startIn + selectedClip.duration)}</dd>
                <dt className="font-black text-[#8c6b4a]">Source</dt>
                <dd className="text-right font-mono">{formatClock(selectedClip.sourceStart)}-{formatClock(selectedClip.sourceEnd ?? selectedClip.sourceStart + selectedClip.duration)}</dd>
                <dt className="font-black text-[#8c6b4a]">Status</dt>
                <dd className="text-right">{describeClipSource(selectedClip)}</dd>
              </dl>
              <div className="mt-2 break-all rounded-lg border border-[#e8dcc4] bg-white p-2 font-mono text-[10px] text-[#6c5638]">
                {selectedClip.assetId || "No source URL"}
              </div>
              <div className={`mt-2 rounded-lg border px-3 py-2 font-bold leading-5 ${healthStatusStyles(selectedHealth?.status ?? (isMissingProductionSource(selectedClip) ? "error" : "unchecked"))}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="font-black">Source health</div>
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em]">
                    {selectedHealth ? healthStatusLabel(selectedHealth.status) : isMissingProductionSource(selectedClip) ? "Missing" : "Unchecked"}
                  </span>
                </div>
                {selectedHealth ? (
                  <>
                    <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
                      <span>Detected</span>
                      <span className="text-right">{selectedHealth.kind}</span>
                      <span>Reachable</span>
                      <span className="text-right">{selectedHealth.reachable ? "yes" : "no"}</span>
                      <span>Preview usable</span>
                      <span className="text-right">{selectedHealth.previewUsable ? "yes" : "no"}</span>
                      <span>Render usable</span>
                      <span className="text-right">{selectedHealth.renderUsable ? "yes" : "no"}</span>
                    </div>
                    <div className="mt-1 text-[10px] opacity-80">{selectedHealth.note}</div>
                  </>
                ) : (
                  <div className="mt-1 text-[10px] opacity-80">
                    {isMissingProductionSource(selectedClip)
                      ? "Attach media before preview or render."
                      : "Waiting for the next lightweight source probe."}
                  </div>
                )}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(selectedClip.kind === "audio" || isAudioTrackId(selectedClip.trackId)) && (
                  <button
                    type="button"
                    onClick={() => void setEpisodeSpineAudio({ clip: selectedClip })}
                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-2 font-black text-emerald-800 hover:bg-emerald-100"
                  >
                    Set as spine
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void navigator.clipboard?.writeText(selectedClip.assetId || "")}
                  className="rounded-lg border border-[#d7bd8f] bg-white px-2 py-2 font-black text-[#5d4528] hover:bg-[#fffaf0]"
                >
                  Copy source link
                </button>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard?.writeText(JSON.stringify(selectedClip, null, 2))}
                  className={`rounded-lg border border-[#d7bd8f] bg-white px-2 py-2 font-black text-[#5d4528] hover:bg-[#fffaf0] ${realEditingMode ? "hidden" : ""}`}
                >
                  Copy clip JSON
                </button>
              </div>
              <div className="mt-2 rounded-lg border border-[#e8dcc4] bg-white p-2">
                <div className="mb-2 font-black uppercase tracking-[0.14em] text-[#9a641e]">Exact timing</div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const nextStart = window.prompt("Timeline start in seconds", String(selectedClip.startIn));
                      if (nextStart === null) return;
                      updateClipTiming(selectedClip.id, { startIn: Number(nextStart) });
                    }}
                    className="rounded-lg border border-[#d7bd8f] bg-[#fffaf0] px-2 py-2 font-black text-[#5d4528] hover:bg-[#fff4d8]"
                  >
                    Set timeline start
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const nextDuration = window.prompt("Timeline duration in seconds", String(selectedClip.duration));
                      if (nextDuration === null) return;
                      updateClipTiming(selectedClip.id, { duration: Number(nextDuration) });
                    }}
                    className="rounded-lg border border-[#d7bd8f] bg-[#fffaf0] px-2 py-2 font-black text-[#5d4528] hover:bg-[#fff4d8]"
                  >
                    Set duration
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const nextSourceStart = window.prompt("Source in-point in seconds", String(selectedClip.sourceStart));
                      if (nextSourceStart === null) return;
                      updateClipTiming(selectedClip.id, { sourceStart: Number(nextSourceStart) });
                    }}
                    className="rounded-lg border border-[#d7bd8f] bg-[#fffaf0] px-2 py-2 font-black text-[#5d4528] hover:bg-[#fff4d8]"
                  >
                    Set source in
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const sourceOut = selectedClip.sourceEnd ?? selectedClip.sourceStart + selectedClip.duration;
                      const nextSourceEnd = window.prompt("Source out-point in seconds", String(sourceOut));
                      if (nextSourceEnd === null) return;
                      updateClipTiming(selectedClip.id, { sourceEnd: Number(nextSourceEnd) });
                    }}
                    className="rounded-lg border border-[#d7bd8f] bg-[#fffaf0] px-2 py-2 font-black text-[#5d4528] hover:bg-[#fff4d8]"
                  >
                    Set source out
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const nextAssetId = window.prompt("Paste a renderable media URL for this clip", selectedClip.assetId);
                  if (!nextAssetId?.trim()) return;
                  updateClipSource(selectedClip.id, nextAssetId.trim());
                }}
                className="mt-2 w-full rounded-lg border border-[#3d3122] bg-white px-2 py-2 font-black text-[#3d3122] hover:bg-[#fffaf0]"
              >
                Relink or replace this clip source
              </button>
              <button
                type="button"
                onClick={() => {
                  const nextName = window.prompt("Rename this clip", selectedClip.name);
                  if (!nextName?.trim()) return;
                  renameClip(selectedClip.id, nextName.trim());
                }}
                className="mt-2 w-full rounded-lg border border-[#d7bd8f] bg-white px-2 py-2 font-black text-[#5d4528] hover:bg-[#fffaf0]"
              >
                Rename clip
              </button>
              <div className="mt-2 rounded-lg border border-[#e8dcc4] bg-white p-2">
                <div className="mb-2 font-black uppercase tracking-[0.14em] text-[#9a641e]">Move to track</div>
                <div className="grid grid-cols-4 gap-1">
                  {["V1", "V2", "A1", "A2"].map((trackId) => (
                    <button
                      key={trackId}
                      type="button"
                      onClick={() => moveClipToTrack(selectedClip.id, trackId)}
                      className={`rounded-md border px-2 py-1.5 font-black ${
                        selectedClip.trackId === trackId
                          ? "border-[#3d3122] bg-[#3d3122] text-white"
                          : "border-[#d7bd8f] bg-[#fffaf0] text-[#5d4528] hover:bg-[#fff4d8]"
                      }`}
                    >
                      {trackId}
                    </button>
                  ))}
                </div>
              </div>
              <div className={`mt-2 grid grid-cols-2 gap-2 ${realEditingMode ? "hidden" : ""}`}>
                <button
                  type="button"
                  onClick={() => duplicateClip(selectedClip.id)}
                  className="rounded-lg border border-[#d7bd8f] bg-white px-2 py-2 font-black text-[#5d4528] hover:bg-[#fffaf0]"
                >
                  Duplicate clip
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!window.confirm(`Delete "${selectedClip.name}" from this timeline?`)) return;
                    deleteClip(selectedClip.id);
                  }}
                  className="rounded-lg border border-red-200 bg-red-50 px-2 py-2 font-black text-red-800 hover:bg-red-100"
                >
                  Delete clip
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!window.confirm(`Delete "${selectedClip.name}" and close the gap on ${selectedClip.trackId}?`)) return;
                    deleteClipAndCloseGap(selectedClip.id);
                  }}
                  className="col-span-2 rounded-lg border border-red-200 bg-white px-2 py-2 font-black text-red-800 hover:bg-red-50"
                >
                  Delete + close gap
                </button>
                <button
                  type="button"
                  onClick={() => nudgeClip(selectedClip.id, -1)}
                  className="rounded-lg border border-[#d7bd8f] bg-white px-2 py-2 font-black text-[#5d4528] hover:bg-[#fffaf0]"
                >
                  Nudge -1s
                </button>
                <button
                  type="button"
                  onClick={() => nudgeClip(selectedClip.id, 1)}
                  className="rounded-lg border border-[#d7bd8f] bg-white px-2 py-2 font-black text-[#5d4528] hover:bg-[#fffaf0]"
                >
                  Nudge +1s
                </button>
                <button
                  type="button"
                  onClick={() => moveClipTo(selectedClip.id, currentTime)}
                  className="col-span-2 rounded-lg border border-[#3d3122] bg-[#3d3122] px-2 py-2 font-black text-white hover:bg-[#59442d]"
                >
                  Move clip to playhead
                </button>
                <button
                  type="button"
                  onClick={() => snapClipToPrevious(selectedClip.id)}
                  className="rounded-lg border border-[#d7bd8f] bg-white px-2 py-2 font-black text-[#5d4528] hover:bg-[#fffaf0]"
                >
                  Snap to previous
                </button>
                <button
                  type="button"
                  onClick={() => snapClipToNext(selectedClip.id)}
                  className="rounded-lg border border-[#d7bd8f] bg-white px-2 py-2 font-black text-[#5d4528] hover:bg-[#fffaf0]"
                >
                  Snap to next
                </button>
                <button
                  type="button"
                  onClick={() => pushTrackOverlapsFromClip(selectedClip.id)}
                  className="rounded-lg border border-[#d7bd8f] bg-white px-2 py-2 font-black text-[#5d4528] hover:bg-[#fffaf0]"
                >
                  Resolve track overlaps
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!window.confirm(`Compact all clips on ${selectedClip.trackId} to remove gaps?`)) return;
                    compactTrackFromClip(selectedClip.id);
                  }}
                  className="rounded-lg border border-[#d7bd8f] bg-white px-2 py-2 font-black text-[#5d4528] hover:bg-[#fffaf0]"
                >
                  Compact selected track
                </button>
              </div>
              <div className={`mt-2 rounded-lg border border-[#e8dcc4] bg-white p-2 text-[10px] font-bold leading-5 text-[#6c5638] ${realEditingMode ? "hidden" : ""}`}>
                Shortcuts: <span className="font-mono">D</span> duplicate, <span className="font-mono">Delete</span> remove, <span className="font-mono">Shift+Left/Right</span> nudge, <span className="font-mono">M</span> move to playhead, <span className="font-mono">X</span> split, <span className="font-mono">[ ]</span> snap.
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentTime(selectedClip.startIn)}
                  className="rounded-lg border border-[#d7bd8f] bg-white px-2 py-2 font-black text-[#5d4528] hover:bg-[#fffaf0]"
                >
                  Cue clip in
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentTime(selectedClip.startIn + selectedClip.duration)}
                  className="rounded-lg border border-[#d7bd8f] bg-white px-2 py-2 font-black text-[#5d4528] hover:bg-[#fffaf0]"
                >
                  Cue clip out
                </button>
                <button
                  type="button"
                  onClick={() => splitClipAt(selectedClip.id, currentTime)}
                  disabled={!canSplitSelectedClip}
                  title={canSplitSelectedClip ? "Split this clip at the current playhead." : "Move the playhead inside the selected clip to split it."}
                  className="rounded-lg border border-[#3d3122] bg-[#3d3122] px-2 py-2 font-black text-white hover:bg-[#59442d] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Split at playhead
                </button>
                <button
                  type="button"
                  onClick={() => trimClip(selectedClip.id, "start", currentTime - selectedClip.startIn)}
                  disabled={currentTime <= selectedClip.startIn || currentTime >= selectedClip.startIn + selectedClip.duration}
                  className="rounded-lg border border-[#d7bd8f] bg-white px-2 py-2 font-black text-[#5d4528] hover:bg-[#fffaf0] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Set in to playhead
                </button>
                <button
                  type="button"
                  onClick={() => trimClip(selectedClip.id, "end", currentTime - (selectedClip.startIn + selectedClip.duration))}
                  disabled={currentTime <= selectedClip.startIn || currentTime >= selectedClip.startIn + selectedClip.duration}
                  className="rounded-lg border border-[#d7bd8f] bg-white px-2 py-2 font-black text-[#5d4528] hover:bg-[#fffaf0] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Set out to playhead
                </button>
                <button
                  type="button"
                  onClick={() => trimClip(selectedClip.id, "start", 0.5)}
                  className="rounded-lg border border-[#d7bd8f] bg-white px-2 py-2 font-black text-[#5d4528] hover:bg-[#fffaf0]"
                >
                  Trim in +0.5s
                </button>
                <button
                  type="button"
                  onClick={() => trimClip(selectedClip.id, "start", -0.5)}
                  className="rounded-lg border border-[#d7bd8f] bg-white px-2 py-2 font-black text-[#5d4528] hover:bg-[#fffaf0]"
                >
                  Extend in -0.5s
                </button>
                <button
                  type="button"
                  onClick={() => trimClip(selectedClip.id, "end", -0.5)}
                  className="rounded-lg border border-[#d7bd8f] bg-white px-2 py-2 font-black text-[#5d4528] hover:bg-[#fffaf0]"
                >
                  Trim out -0.5s
                </button>
              </div>
                  </>
                );
              })()}
            </div>
          ) : null}
          <div className="rounded-lg border border-[#e8dcc4] bg-white px-3 py-2 text-xs font-bold leading-5 text-[#5d4528]">
            Real media sources come from the recording room, call uploads, imported session JSON, or Sync Deck cuts. Demo placeholder assets are hidden from this production workflow.
          </div>
        </aside>

        {/* Main Editor Area */}
        <main className="flex-1 flex flex-col relative overflow-hidden bg-transparent p-8">
          
          <div className={`w-full flex justify-center mb-8 ${realEditingMode ? "hidden" : ""}`}>
             <div className="w-full max-w-2xl bg-black rounded-2xl border-4 border-[#e8dcc4] overflow-hidden shadow-xl ring-1 ring-black/5">
                {/* REMOTION PLAYER INTEGRATION */}
                <Player
                  component={RemotionComposition}
                  inputProps={{ timeline: timelineState }}
                  durationInFrames={durationInFrames}
                  compositionWidth={1920}
                  compositionHeight={1080}
                  fps={30}
                  style={{ width: "100%", aspectRatio: "16/9" }}
                  controls
                />
             </div>
          </div>

          <div className={`mb-6 rounded-2xl border border-[#e8dcc4] bg-white p-4 shadow-sm ${realEditingMode ? "hidden" : ""}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.2em] text-[#8c6b4a]">Transcript read-along</div>
                <div className="mt-1 text-sm font-bold text-[#3d3122]">
                  {formatClock(currentTime)} / {formatClock(totalDuration)}
                </div>
              </div>
              <div className="rounded-xl bg-[#f8f3e6] px-4 py-2 text-lg font-black text-[#3d3122]">
                {activeWord?.text.trim() || "Move the playhead to light up words"}
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={Math.max(1, totalDuration)}
              step={0.05}
              value={Math.min(currentTime, totalDuration)}
              onChange={(event) => {
                setIsPreviewPlaying(false);
                setCurrentTime(Number(event.target.value));
              }}
              className="mt-4 w-full accent-[#8c6b4a]"
            />
          </div>

          {viewMode === "transcript" && (
            <div className="flex-1 bg-white border border-[#e8dcc4] rounded-2xl shadow-sm overflow-hidden flex flex-col">
              <div className="p-4 bg-[#fdfaf6] border-b border-[#e8dcc4]">
                <h2 className="font-bold text-lg text-[#3d3122]">Paper Edit</h2>
                <p className="text-xs text-[#8c6b4a] font-medium mt-1">
                  Select text to delete. Deleting text automatically slices the clips and ripples the timeline left!
                </p>
              </div>
              <div className="p-8 overflow-y-auto flex-1 space-y-6 text-xl leading-loose font-serif text-[#5e4b33]">
                {timelineState.transcript.map((block) => (
                  <span
                    key={block.id}
                    onClick={() => toggleDeleteBlock(block.id)}
                    className={`
                      inline-block mr-2 px-1 cursor-pointer transition-all rounded relative
                      ${block.deleted ? 'line-through text-[#d4c1a0] decoration-red-500/50 decoration-2' : 'hover:bg-amber-100/50'}
                    `}
                  >
                    {block.alert && !block.deleted && (
                      <span className="absolute -top-6 left-0 bg-red-500 text-white text-[10px] font-sans font-bold px-2.5 py-0.5 rounded-md shadow-sm whitespace-nowrap z-10">
                        {block.alert}
                      </span>
                    )}
                    {transcriptWordTimings(block).map((word) => {
                      const isActive = !block.deleted && currentTime >= word.start && currentTime < word.end;
                      return (
                        <span
                          key={word.id}
                          className={isActive ? "rounded-md bg-amber-300 px-1 text-[#2f2418] shadow-sm ring-2 ring-amber-400" : undefined}
                        >
                          {word.text}
                        </span>
                      );
                    })}
                  </span>
                ))}
              </div>
            </div>
          )}

          {viewMode === "segmenter" && (
            <div className="flex-1 w-full flex flex-col mt-4 overflow-y-auto pr-2">
               <VideoSegmentDesk />
            </div>
          )}

          {viewMode === "timeline" && (
            <div className="w-full flex-1 flex flex-col justify-end mt-auto border border-[#e8dcc4] bg-white rounded-2xl overflow-hidden shadow-sm p-4 relative">
              <h2 className="text-xs font-bold text-[#8c6b4a] uppercase tracking-wider mb-4 absolute top-4 left-4 z-10">EDL Visualizer</h2>
              <div className="pt-8 flex-1 w-full">
          <SyncDeck />

          <VisualTimeline
                  clips={timelineState.clips.map((c) => ({
                    id: c.id,
                    type: c.trackId && c.trackId.toString().startsWith("A") ? "audio" : c.kind,
                    src: c.assetId,
                    startIn: c.startIn,
                    duration: c.duration,
                    track: c.trackId,
                    label: c.name,
                    color: c.color,
                  }))}
	                  currentTime={currentTime}
	                  selectedClipId={selectedClip?.id}
	                  onTimeScrub={setCurrentTime}
	                  onClipSelect={setSelectedClipId}
	                />
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default function CloudEditor() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center bg-[#fdfaf6] text-sm font-bold text-[#5e4b33]">Loading editor...</div>}>
      <CloudEditorContent />
    </Suspense>
  );
}
