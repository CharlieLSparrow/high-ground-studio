"use client";

import Link from "next/link";
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createRecordingSegmentTimelineOffsets,
  getRecordingSessionDurationSeconds,
  segmentNeedsAttention,
  type EpisodeRecordingSession,
  type RecordingSessionEvent,
  type RecordingSessionEventKind,
  type RecordingSegment,
} from "@high-ground/quipsly-domain/recording";
import { classifyRecorderEntryAccess, type RecorderEntryAccessState } from "./recorder-entry-access";

type RecordingEventKind = RecordingSessionEventKind;
type RecordingEvent = RecordingSessionEvent & { readonly createdAt: string };

type ClipSegment = {
  id: string;
  start: string;
  end: string;
  note: string;
};

type ClipCue = {
  id: string;
  title: string;
  url: string;
  segments: ClipSegment[];
};

type ImportedTrack = {
  id: string;
  name: string;
  size: number;
  type: string;
  kind?: "audio" | "video";
  source: "local-recorder" | "file";
  createdAt: string;
  trackId?: string;
  sourceId?: string;
  sourceUrl?: string;
  durationMs?: number;
  uploadState?: "idle" | "uploading" | "uploaded" | "error" | "local-only";
  uploadMessage?: string;
  fileName?: string;
  recordedStartAt?: string;
  recordedEndAt?: string;
  recordedSessionStartMs?: number;
  recordedSessionEndMs?: number;
};

type PersistedTrack = Omit<ImportedTrack, "source">;

type RecordingTrackKind = "audio" | "video";

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
  updatedAt?: string;
};

type RoomSaveStatus = "idle" | "queued" | "saving" | "saved" | "error" | "fallback" | "conflict";
type AudioUploadStatus = "idle" | "uploading" | "uploaded" | "error" | "not-available";

type PersistedRoom = {
  exportedAt?: string;
  roomName: string;
  script: string;
  producerNotes: string;
  clips: ClipCue[];
  events: RecordingEvent[];
  tracks: PersistedTrack[];
};

export const dynamic = "force-dynamic";

type RecorderRoomSnapshot = {
  roomName: string;
  script: string;
  producerNotes: string;
  clips: ClipCue[];
  events: RecordingEvent[];
  tracks: PersistedTrack[];
};

const DEMO_YOUTUBE_VIDEO_URL = "https://www.youtube.com/watch?v=96LN__TA-T8&t=2s";

function makeDemoYoutubeClip(): ClipCue {
  return {
    id: makeId("clip-demo"),
    title: "YouTube dummy edit",
    url: DEMO_YOUTUBE_VIDEO_URL,
    segments: [
      { id: makeId("segment-demo"), start: "0:02", end: "0:18", note: "Smoke test segment A" },
      { id: makeId("segment-demo"), start: "0:34", end: "0:54", note: "Smoke test segment B" },
    ],
  };
}

const DEFAULT_CLIPS: ClipCue[] = [];

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/aac",
];

const VIDEO_FILE_EXTENSIONS = new Set(["mp4", "mov", "m4v", "webm", "mkv", "avi", "ogv"]);
const AUDIO_FILE_EXTENSIONS = new Set(["mp3", "wav", "m4a", "aac", "ogg", "flac", "opus"]);

const TRACK_PREFIX_AUDIO = "A";
const TRACK_PREFIX_VIDEO = "V";
const RECORDER_SEGMENT_DEFAULT_SECONDS = 8;
const RECORDER_SEGMENT_MIN_SECONDS = 0.2;
function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeTrackId(value: unknown, fallback = 1, kind: RecordingTrackKind = "audio") {
  const raw = coerceString(value, "").trim().toUpperCase();
  const prefix = kind === "video" ? TRACK_PREFIX_VIDEO : TRACK_PREFIX_AUDIO;
  if (new RegExp(`^[AV]\\d+(?:\\.\\d+)?$`).test(raw)) {
    return kind === "video" ? (raw.startsWith("V") ? raw : `${TRACK_PREFIX_VIDEO}${raw.slice(1)}`) : (raw.startsWith("A") ? raw : `${TRACK_PREFIX_AUDIO}${raw.slice(1)}`);
  }

  if (/^\d+(?:\.\d+)?$/.test(raw)) return `${prefix}${raw}`;
  return `${prefix}${Math.max(1, Math.floor(fallback))}`;
}

function coerceTrackKind(value: unknown, fallback: RecordingTrackKind = "audio"): RecordingTrackKind {
  const normalized = coerceString(value, "").toLowerCase().trim();
  if (normalized === "video") return "video";
  if (normalized === "audio") return "audio";
  return fallback;
}

function inferTrackKindFromFileName(fileName: string, fallback?: RecordingTrackKind) {
  const lowered = coerceString(fileName, "").toLowerCase();
  const ext = lowered.split(".").pop() ?? "";
  if (!ext) return fallback;
  if (VIDEO_FILE_EXTENSIONS.has(ext)) return "video" as const;
  if (AUDIO_FILE_EXTENSIONS.has(ext)) return "audio" as const;
  return fallback;
}

function inferTrackIdFromPayload(value: unknown, kind: RecordingTrackKind = "audio") {
  return normalizeTrackId(value, 1, kind);
}

function inferTrackKindFromType(type: string) {
  const safe = coerceString(type, "").toLowerCase();
  if (safe.includes("video")) return "video" as const;
  if (safe.includes("audio")) return "audio" as const;
  return undefined;
}

function inferTrackKindFromTrackUrl(url: string | undefined, fallback: RecordingTrackKind = "audio") {
  const lower = coerceString(url, "").toLowerCase();
  if (!lower) return fallback;
  if (/\.(mp4|webm|mov|m4v|m3u8|mpd)(\?|$)/.test(lower)) return "video";
  if (/\.(mp3|wav|m4a|aac|ogg|flac)(\?|$)/.test(lower)) return "audio";
  if (lower.startsWith("video/")) return "video";
  if (lower.startsWith("audio/")) return "audio";
  return fallback;
}

function inferTrackKindFromFile(file: File, fallback: RecordingTrackKind = "audio") {
  return (
    inferTrackKindFromType(file.type)
    || inferTrackKindFromTrackUrl(file.name, fallback)
    || inferTrackKindFromFileName(file.name, fallback)
    || fallback
  );
}
const RECORDER_DB_NAME = "QuipslyRecorderDB";
const RECORDER_STORE_NAME = "recording_chunks";

let idbPromise: Promise<IDBDatabase> | null = null;
function getRecorderDB(): Promise<IDBDatabase> {
  if (typeof window === "undefined") return Promise.reject(new Error("No window"));
  if (idbPromise) return idbPromise;
  idbPromise = new Promise((resolve, reject) => {
    const req = window.indexedDB.open(RECORDER_DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(RECORDER_STORE_NAME)) {
        req.result.createObjectStore(RECORDER_STORE_NAME, { autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return idbPromise;
}

async function clearRecorderDB() {
  try {
    const db = await getRecorderDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(RECORDER_STORE_NAME, "readwrite");
      tx.objectStore(RECORDER_STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn("clearRecorderDB failed", e);
  }
}

async function writeRecorderChunk(chunk: Blob) {
  try {
    const db = await getRecorderDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(RECORDER_STORE_NAME, "readwrite");
      tx.objectStore(RECORDER_STORE_NAME).add(chunk);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn("writeRecorderChunk failed", e);
  }
}

async function getAllRecorderChunks(): Promise<Blob[]> {
  try {
    const db = await getRecorderDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(RECORDER_STORE_NAME, "readonly");
      const req = tx.objectStore(RECORDER_STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn("getAllRecorderChunks failed", e);
    return [];
  }
}

function inferUploadTrackFileExt(type: string, kind: RecordingTrackKind) {
  const normalizedType = coerceString(type, "").toLowerCase();

  if (kind === "video") {
    if (normalizedType.includes("video/mp4") || normalizedType.includes("video/webm") || normalizedType.includes("video/quicktime") || normalizedType.includes("video/x-m4v") || normalizedType.includes("video/mov")) {
      return "mp4";
    }
    return "mp4";
  }

  if (normalizedType.includes("audio/m4a") || normalizedType.includes("audio/mp4")) return "m4a";
  if (normalizedType.includes("audio/aac")) return "aac";
  if (normalizedType.includes("audio/ogg")) return "ogg";
  if (normalizedType.includes("audio/wav") || normalizedType.includes("audio/x-wav")) return "wav";
  return "webm";
}

function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function coerceString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function coerceNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function coerceOptionalNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function coerceArray<T>(value: unknown) {
  return Array.isArray(value) ? (value as T[]) : [];
}

function parseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function looksLikeRecordingRoomPayload(value: unknown) {
  const record = asObject(value);
  if (!record) return false;
  return (
    "roomName" in record ||
    "script" in record ||
    "producerNotes" in record ||
    "clips" in record ||
    "events" in record ||
    "tracks" in record
  );
}

function resolveLegacyRecordingPayload(raw: unknown) {
  const record = asObject(raw);
  if (!record) return null;
  if (looksLikeRecordingRoomPayload(record)) return record;

  const payload = asObject(record.payload);
  if (looksLikeRecordingRoomPayload(payload)) return payload;

  const data = asObject(record.data);
  if (looksLikeRecordingRoomPayload(data)) return data;

  const room = asObject(record.room);
  if (looksLikeRecordingRoomPayload(room)) return room;

  const recording = asObject(record.recordingRoom);
  if (looksLikeRecordingRoomPayload(recording)) return recording;

  return null;
}

function coerceStringArray(raw: unknown): unknown[] {
  if (typeof raw === "string") {
    const parsed = parseJson(raw);
    if (Array.isArray(parsed)) return parsed;
  }
  return coerceArray(raw);
}

function isAbortError(error: unknown): error is DOMException {
  return error instanceof DOMException && error.name === "AbortError";
}

function storageKey(projectSlug: string, episodeSlug: string) {
  return `quipsly.recording-room.${projectSlug}.${episodeSlug}`;
}

function formatClock(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function formatRecordingTimestamp(value?: string) {
  if (!value) return "unavailable";
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return value;
  return new Date(timestamp).toLocaleString();
}

function resolveTrackWindowDurationMs(track: ImportedTrack, fallbackMs = 0) {
  const startMs = track.recordedStartAt ? Date.parse(track.recordedStartAt) : Number.NaN;
  const endMs = track.recordedEndAt ? Date.parse(track.recordedEndAt) : Number.NaN;
  if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs) {
    return Math.max(0, endMs - startMs);
  }
  return coerceNumber(track.durationMs, fallbackMs);
}

function calculateRecordedSessionCursorMs(tracks: ImportedTrack[]) {
  let cursorMs = 0;
  for (const track of tracks) {
    const explicitEndMs = Number(track.recordedSessionEndMs);
    if (Number.isFinite(explicitEndMs) && explicitEndMs >= 0) {
      cursorMs = Math.max(cursorMs, explicitEndMs);
      continue;
    }
    cursorMs += resolveTrackWindowDurationMs(track);
  }
  return cursorMs;
}

type ClipPlaybackPlanItem = {
  clipId: string;
  clipTitle: string;
  clipUrl: string;
  segmentId: string;
  segmentNote: string;
  sourceStart: number;
  sourceEnd: number;
  sourceDuration: number;
  playbackStartMs: number;
  playbackEndMs: number;
};

function sanitizeSeconds(value: string): number {
  const parsed = parseTimeToSeconds(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function sanitizeSegmentTimes(segment: ClipSegment) {
  const start = sanitizeSeconds(segment.start);
  const endRaw = sanitizeSeconds(segment.end);
  const fallbackEnd = start + RECORDER_SEGMENT_DEFAULT_SECONDS;
  const sourceStart = parseFloat(start.toFixed(3));
  const sourceEnd = Number.isFinite(endRaw) && endRaw > sourceStart
    ? parseFloat(endRaw.toFixed(3))
    : parseFloat(fallbackEnd.toFixed(3));
  const sourceDuration = Math.max(RECORDER_SEGMENT_MIN_SECONDS, Number((sourceEnd - sourceStart).toFixed(3)));
  return { sourceStart, sourceEnd, sourceDuration };
}

function buildClipPlaybackPlan(clips: ClipCue[]): ClipPlaybackPlanItem[] {
  const plan: ClipPlaybackPlanItem[] = [];
  let playbackCursorMs = 0;

  for (const clip of clips) {
    const segments = clip.segments.length ? clip.segments : [{ id: makeId("segment"), start: "", end: "", note: "" }];
    for (const segment of segments) {
      const sanitized = sanitizeSegmentTimes(segment);
      const playbackStartMs = playbackCursorMs;
      const playbackEndMs = playbackCursorMs + sanitized.sourceDuration * 1000;
      playbackCursorMs = playbackEndMs;

      plan.push({
        clipId: clip.id,
        clipTitle: clip.title || "Clip",
        clipUrl: clip.url,
        segmentId: segment.id,
        segmentNote: segment.note || "Segment",
        sourceStart: sanitized.sourceStart,
        sourceEnd: sanitized.sourceEnd,
        sourceDuration: sanitized.sourceDuration,
        playbackStartMs,
        playbackEndMs,
      });
    }
  }

  return plan;
}

function getRecorderRouteParams() {
  if (typeof window === "undefined") {
    return {
      project: null as string | null,
      episode: null as string | null,
      seed: false,
    };
  }

  const params = new URLSearchParams(window.location.search);
  return {
    project: params.get("project"),
    episode: params.get("episode") ?? params.get("boundary"),
    seed: params.get("seed") === "demo",
  };
}

const RECORDING_ROOM_PAYLOAD_VERSION = 2;
const WEB_CAPTURE_UPLOAD_PAUSED_MESSAGE =
  "Web cloud upload is temporarily unavailable while Quipsly completes the consent-bound resumable-v2 migration. This source remains local; download or export it before leaving.";

function normalizeTrackSourceUrl(url: string | undefined) {
  const trimmed = (url || "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("blob:")) return "";
  return trimmed;
}

function normalizePersistedTrack(track: ImportedTrack): PersistedTrack {
  const inferredKind =
    coerceTrackKind(track.kind)
    || inferTrackKindFromType(track.type)
    || inferTrackKindFromTrackUrl(track.sourceUrl, "audio")
    || inferTrackKindFromFileName(track.name, "audio");

  return {
    id: coerceString(track.id),
    name: coerceString(track.name, "Track"),
    size: coerceNumber(track.size, 0),
    type: coerceString(track.type, "unknown"),
    kind: inferredKind,
    trackId: normalizeTrackId(track.trackId, 1, inferredKind),
    createdAt: coerceString(track.createdAt),
    sourceId: coerceString(track.sourceId),
    sourceUrl: normalizeTrackSourceUrl(track.sourceUrl),
    durationMs: coerceNumber(track.durationMs),
    uploadState: track.uploadState,
    uploadMessage: track.uploadMessage,
    fileName: track.fileName,
    recordedStartAt: track.recordedStartAt,
    recordedEndAt: track.recordedEndAt,
    recordedSessionStartMs: coerceOptionalNumber(track.recordedSessionStartMs),
    recordedSessionEndMs: coerceOptionalNumber(track.recordedSessionEndMs),
  };
}

function humanizeSlug(value: string) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function parseTimeToSeconds(value: string) {
  const clean = value.trim();
  if (!clean) return 0;
  if (/^\d+(\.\d+)?$/.test(clean)) return Number(clean);

  const parts = clean.split(":").map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part))) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function inferYouTubeId(url: string) {
  if (!url.trim()) return null;
  try {
    const parsed = new URL(url.trim());
    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.split("/").filter(Boolean)[0] ?? null;
    }
    if (parsed.pathname.startsWith("/embed/") || parsed.pathname.startsWith("/shorts/")) {
      return parsed.pathname.split("/").filter(Boolean)[1] ?? null;
    }
    return parsed.searchParams.get("v");
  } catch {
    return null;
  }
}

function buildYouTubeEmbedUrl(url: string, segment: ClipSegment | undefined, autoplay: boolean) {
  const videoId = inferYouTubeId(url);
  if (!videoId) return null;

  const params = new URLSearchParams({
    rel: "0",
    modestbranding: "1",
    playsinline: "1",
    start: String(parseTimeToSeconds(segment?.start ?? "")),
  });

  const end = parseTimeToSeconds(segment?.end ?? "");
  if (end > 0) params.set("end", String(end));
  if (autoplay) params.set("autoplay", "1");

  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  return MIME_CANDIDATES.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? "";
}

function downloadText(filename: string, value: string, type = "application/json") {
  const blob = new Blob([value], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function defaultRoom(): PersistedRoom {
  return {
    roomName: "Quipsly Recording Room",
    script: "",
    producerNotes: "",
    clips: DEFAULT_CLIPS,
    events: [],
    tracks: [],
  };
}

function makeRoomSnapshotFingerprint(snapshot: RecorderRoomSnapshot) {
  return JSON.stringify(snapshot);
}

function addSecondsToIso(value: string | null | undefined, seconds: number) {
  if (!value || seconds <= 0) return undefined;
  const startMs = Date.parse(value);
  if (!Number.isFinite(startMs)) return undefined;
  return new Date(startMs + seconds * 1000).toISOString();
}

function recordingSegmentFromTrack(
  track: ImportedTrack,
  sessionId: string,
  fallbackIndex: number,
): RecordingSegment {
  const durationSeconds = Math.max(0, resolveTrackWindowDurationMs(track) / 1000);
  const recordedStartAt = track.recordedStartAt || track.createdAt || new Date().toISOString();
  const recordedEndAt = track.recordedEndAt || addSecondsToIso(recordedStartAt, durationSeconds);

  return {
    id: track.id || `segment-${fallbackIndex + 1}`,
    sessionId,
    participantId: "local-recorder",
    deviceKind: track.source === "local-recorder" ? "web-browser" : "external-recorder",
    status: track.uploadState === "uploaded" ? "uploaded" : track.uploadState === "error" ? "failed" : "local-ready",
    startedAt: recordedStartAt,
    stoppedAt: recordedEndAt,
    durationSeconds,
    stopReason: track.source === "local-recorder" ? "user-stop" : "unknown",
    upload: track.sourceId || track.sourceUrl
      ? {
          provider: track.sourceId ? "gcs" : "external",
          objectKey: track.sourceId,
          url: track.sourceUrl,
          contentType: track.type,
          sizeBytes: track.size,
        }
      : undefined,
    notes: track.name,
  };
}

function normalizeClipCue(raw: unknown): ClipCue {
  const record = asObject(raw);
  const clipId = coerceString(record?.id, makeId("clip"));
  const title = coerceString(record?.title, "Clip");
  const url = coerceString(record?.url, "");
  const segmentRecords = coerceArray<unknown>(record?.segments);
  const segments = segmentRecords.map((segment) => {
    const segmentRecord = asObject(segment);
    return {
      id: coerceString(segmentRecord?.id, makeId("segment")),
      start: coerceString(segmentRecord?.start),
      end: coerceString(segmentRecord?.end),
      note: coerceString(segmentRecord?.note),
    };
  });
  return {
    id: clipId,
    title,
    url,
    segments: segments.length ? segments : [{ id: makeId("segment"), start: "", end: "", note: "" }],
  };
}

function normalizeEvent(raw: unknown): RecordingEvent {
  const record = asObject(raw);
  const kind = coerceString(record?.kind, "session");
  const validKinds: RecordingEventKind[] = ["session", "marker", "clip", "retake", "note"];
  const clipPlaybackRecord = asObject(record?.clipPlayback);
  const sourceStartSeconds = coerceNumber(clipPlaybackRecord?.sourceStartSeconds, 0);
  const sourceEndSeconds = coerceNumber(clipPlaybackRecord?.sourceEndSeconds, sourceStartSeconds);
  const clipPlayback = clipPlaybackRecord
    && coerceString(clipPlaybackRecord.clipId)
    && coerceString(clipPlaybackRecord.segmentId)
    && normalizeTrackSourceUrl(coerceString(clipPlaybackRecord.sourceUrl))
    && sourceEndSeconds > sourceStartSeconds
      ? {
          clipId: coerceString(clipPlaybackRecord.clipId),
          segmentId: coerceString(clipPlaybackRecord.segmentId),
          sourceUrl: normalizeTrackSourceUrl(coerceString(clipPlaybackRecord.sourceUrl)),
          sourceStartSeconds,
          sourceEndSeconds,
        }
      : undefined;
  return {
    id: coerceString(record?.id, makeId("event")),
    kind: validKinds.includes(kind as RecordingEventKind) ? (kind as RecordingEventKind) : "session",
    label: coerceString(record?.label, "Event"),
    atMs: coerceNumber(record?.atMs, 0),
    note: coerceString(record?.note),
    clipPlayback,
    createdAt: coerceString(record?.createdAt, new Date().toISOString()),
  };
}

function normalizeTrack(raw: unknown): ImportedTrack {
  const record = asObject(raw);
  const source = coerceString(record?.source, "file");
  const inferredKind =
    coerceTrackKind((record as { kind?: unknown })?.kind)
    || inferTrackKindFromType(coerceString(record?.type))
    || inferTrackKindFromTrackUrl(coerceString(record?.sourceUrl), "audio")
    || inferTrackKindFromFileName(coerceString(record?.name), "audio");
  const persistedTrackId = inferTrackIdFromPayload(record?.trackId, inferredKind);
  return {
    id: coerceString(record?.id, makeId("track")),
    name: coerceString(record?.name, "Track"),
    size: coerceNumber(record?.size, 0),
    kind: inferredKind,
    type: coerceString(record?.type, "unknown"),
    source: source === "local-recorder" ? "local-recorder" : "file",
    trackId: normalizeTrackId(persistedTrackId, 1, inferredKind),
    createdAt: coerceString(record?.createdAt, new Date().toISOString()),
    sourceId: coerceString(record?.sourceId),
    sourceUrl: normalizeTrackSourceUrl(coerceString(record?.sourceUrl)),
    durationMs: coerceNumber(record?.durationMs),
    recordedStartAt: coerceString(record?.recordedStartAt) || undefined,
    recordedEndAt: coerceString(record?.recordedEndAt) || undefined,
    recordedSessionStartMs: coerceOptionalNumber(record?.recordedSessionStartMs),
    recordedSessionEndMs: coerceOptionalNumber(record?.recordedSessionEndMs),
  };
}

function nextTrackId(existingTracks: ImportedTrack[], kind: RecordingTrackKind = "audio") {
  const prefix = kind === "video" ? TRACK_PREFIX_VIDEO : TRACK_PREFIX_AUDIO;
  let max = 0;
  for (const track of existingTracks) {
    const raw = coerceString(track.trackId, "").trim().toUpperCase();
    const match = new RegExp(`^${prefix}(\\d+(?:\\.\\d+)?)$`).exec(raw);
    if (!match) continue;
    const parsed = Number.parseFloat(match[1]);
    if (Number.isFinite(parsed)) max = Math.max(max, parsed);
  }
  return `${prefix}${max + 1}`;
}

function normalizeImportedTrackFromPersisted(raw: PersistedTrack, fallbackIndex: number): ImportedTrack {
  const persistedKind = coerceTrackKind(raw.kind);
  const inferredNameKind = inferTrackKindFromFileName(raw.name, persistedKind ?? "audio");
  const restored = {
    id: coerceString(raw.id, makeId("track")),
    name: coerceString(raw.name, `Track ${normalizeTrackId(raw.trackId, fallbackIndex, inferredNameKind)}`),
    size: coerceNumber(raw.size, 0),
    type: coerceString(raw.type, "unknown"),
    kind: persistedKind ?? inferredNameKind,
    trackId: normalizeTrackId(raw.trackId, fallbackIndex, persistedKind ?? inferredNameKind),
    source: "file",
    sourceId: coerceString(raw.sourceId),
    sourceUrl: coerceString(raw.sourceUrl),
    durationMs: coerceNumber(raw.durationMs),
    createdAt: coerceString(raw.createdAt, new Date().toISOString()),
    uploadState: coerceString(raw.uploadState, "idle") as ImportedTrack["uploadState"],
    uploadMessage: coerceString(raw.uploadMessage, raw.sourceUrl ? "Uploaded" : "Awaiting upload"),
    fileName: coerceString(raw.fileName),
    recordedStartAt: coerceString(raw.recordedStartAt),
    recordedEndAt: coerceString(raw.recordedEndAt),
    recordedSessionStartMs: coerceOptionalNumber(raw.recordedSessionStartMs),
    recordedSessionEndMs: coerceOptionalNumber(raw.recordedSessionEndMs),
  };

  return {
    ...restored,
    sourceUrl: restored.sourceUrl || undefined,
    recordedStartAt: restored.recordedStartAt || undefined,
    recordedEndAt: restored.recordedEndAt || undefined,
    recordedSessionStartMs: restored.recordedSessionStartMs,
    recordedSessionEndMs: restored.recordedSessionEndMs,
    source: "file",
  };
}

function normalizeRoomState(raw: unknown): PersistedRoom | null {
  const record = asObject(raw);
  if (!record) return null;
  const packagePayload = resolveLegacyRecordingPayload(record);
  const normalized = packagePayload || record;

  const scripts = coerceString(normalized.script, "");
  const producerNotes = coerceString(normalized.producerNotes, "");
  const roomName = coerceString(normalized.roomName, "Quipsly Recording Room");
  const clipRecords = coerceStringArray(normalized.clips);
  const eventRecords = coerceStringArray(normalized.events);
  const trackRecords = coerceStringArray(normalized.tracks);

  return {
    exportedAt: coerceString(normalized.exportedAt),
    roomName: roomName || "Quipsly Recording Room",
    script: scripts,
    producerNotes,
    clips: clipRecords.map(normalizeClipCue),
    events: eventRecords.map(normalizeEvent),
    tracks: trackRecords.map((track, index) =>
      normalizeImportedTrackFromPersisted(track as PersistedTrack, index + 1),
    ),
  };
}

async function postEpisodeProduction(
  payload: Record<string, unknown>,
  options: { signal?: AbortSignal } = {},
): Promise<EpisodeProductionState> {
  const response = await fetch("/api/episode-production", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: options.signal,
  });
  return response.json();
}

export default function RecorderDashboard() {
  const { project: routeProject, episode: routeEpisode, seed: routeSeedDemo } = getRecorderRouteParams();

  const [hydrated, setHydrated] = useState(false);
  const [projectSlug, setProjectSlug] = useState("");
  const [episodeSlug, setEpisodeSlug] = useState("current-episode");
  const [roomName, setRoomName] = useState(defaultRoom().roomName);
  const [script, setScript] = useState(defaultRoom().script);
  const [producerNotes, setProducerNotes] = useState(defaultRoom().producerNotes);
  const [clips, setClips] = useState<ClipCue[]>(defaultRoom().clips);
  const [events, setEvents] = useState<RecordingEvent[]>([]);
  const [tracks, setTracks] = useState<ImportedTrack[]>([]);
  const [micReady, setMicReady] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [audioLevels, setAudioLevels] = useState<number[]>(new Array(18).fill(4));
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioMimeType, setAudioMimeType] = useState("");

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState<string>("default");
  const [echoCancellation, setEchoCancellation] = useState(true);
  const [noiseSuppression, setNoiseSuppression] = useState(true);
  const [autoGainControl, setAutoGainControl] = useState(true);

  const [activeClipId, setActiveClipId] = useState(DEFAULT_CLIPS[0]?.id ?? "");
  const [activeSegmentId, setActiveSegmentId] = useState(DEFAULT_CLIPS[0]?.segments[0]?.id ?? "");
  const [playNonce, setPlayNonce] = useState(0);
  const [productionState, setProductionState] = useState<EpisodeProductionState | null>(null);
  const [productionHydrationResolved, setProductionHydrationResolved] = useState(false);
  const [entryAccessState, setEntryAccessState] = useState<"checking" | RecorderEntryAccessState>("checking");
  const [entryAccessMessage, setEntryAccessMessage] = useState<string | null>(null);
  const [entryAccessRetryToken, setEntryAccessRetryToken] = useState(0);
  const [roomSaveState, setRoomSaveState] = useState<RoomSaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [roomSaveToast, setRoomSaveToast] = useState<string | null>(null);
  const [audioUploadState, setAudioUploadState] = useState<AudioUploadStatus>("idle");
  const [audioUploadStatus, setAudioUploadStatus] = useState<string | null>(null);
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [clipFollowRecording, setClipFollowRecording] = useState(true);
  const isHydratedFromProduction = useRef(false);
  const routeHydrationRunRef = useRef(0);
  const entryAccessRunRef = useRef(0);
  const productionHydrationRunRef = useRef(0);
  const activeHydrationRouteRef = useRef("");
  const roomAutosaveHashRef = useRef("");
  const roomAutosaveTimerRef = useRef<ReturnType<typeof setTimeout> | ReturnType<typeof window.setTimeout> | null>(null);
  const roomAutosaveRequestRef = useRef(0);
  const roomAutosaveAbortRef = useRef<AbortController | null>(null);
  const roomSaveToastTimerRef = useRef<ReturnType<typeof setTimeout> | ReturnType<typeof window.setTimeout> | null>(null);
  const demoSeedAppliedRef = useRef(false);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const tracksRef = useRef<ImportedTrack[]>([]);

  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);

  useEffect(() => {
    const syncViewport = () => {
      setIsMobileLayout(window.innerWidth < 768);
    };

    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  useEffect(() => {
    async function loadDevices() {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      try {
        const devs = await navigator.mediaDevices.enumerateDevices();
        setDevices(devs.filter((d) => d.kind === "audioinput"));
      } catch (err) {
        console.warn("Could not enumerate devices", err);
      }
    }
    loadDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", loadDevices);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", loadDevices);
  }, []);

  useEffect(() => {
    const runId = ++entryAccessRunRef.current;
    const controller = new AbortController();
    setEntryAccessState("checking");
    setEntryAccessMessage(null);
    setProductionState(null);
    setProductionHydrationResolved(false);
    setHydrated(false);

    if (!routeProject) {
      setEntryAccessState("allowed");
      return () => controller.abort();
    }

    postEpisodeProduction({
      action: "ensure",
      projectSlug: routeProject,
      episodeSlug: routeEpisode ?? "current-episode",
      title: humanizeSlug(routeEpisode ?? "current-episode"),
      boundaryLabel: humanizeSlug(routeEpisode ?? "current-episode"),
      productionJson: {
        surface: "recorder-entry",
        projectSlug: routeProject,
        episodeSlug: routeEpisode ?? "current-episode",
      },
    }, { signal: controller.signal }).then((state) => {
      if (controller.signal.aborted || runId !== entryAccessRunRef.current) return;
      const accessState = classifyRecorderEntryAccess(state);
      setEntryAccessState(accessState);
      setEntryAccessMessage(state.message ?? null);
      if (accessState === "allowed") setProductionState(state);
    }).catch((error) => {
      if (isAbortError(error) || runId !== entryAccessRunRef.current) return;
      setEntryAccessState("unavailable");
      setEntryAccessMessage(error instanceof Error ? error.message : "Nest access could not be verified.");
    });

    return () => controller.abort();
  }, [entryAccessRetryToken, routeEpisode, routeProject]);

  useEffect(() => {
    const runId = ++routeHydrationRunRef.current;
    setHydrated(false);
    demoSeedAppliedRef.current = false;
    isHydratedFromProduction.current = false;
    setRoomSaveState("idle");
    setLastSavedAt(null);
    roomAutosaveHashRef.current = "";

    if (entryAccessState !== "allowed") {
      setProjectSlug(routeProject ?? "");
      setEpisodeSlug(routeEpisode ?? "current-episode");
      return;
    }

    const slug = routeProject ?? "";
    const episode = routeEpisode ?? "current-episode";
    if (!slug) {
      setProjectSlug("");
      setEpisodeSlug(episode);
      setProductionHydrationResolved(true);
      setHydrated(true);
      return;
    }

    setProjectSlug(slug);
    setEpisodeSlug(episode);
    activeHydrationRouteRef.current = `${slug}::${episode}`;
    window.localStorage.setItem("quipsly.last-recording-project", slug);

    const roomTemplate = defaultRoom();
    const saved = window.localStorage.getItem(storageKey(slug, episode));
    if (saved) {
      try {
        const parsed = parseJson(saved);
        const normalized = normalizeRoomState(parsed);
        if (!normalized) {
          throw new Error("Malformed recording-room JSON");
        }
        if (routeHydrationRunRef.current !== runId) return;
        const snapshot: RecorderRoomSnapshot = {
          roomName: normalized?.roomName ?? roomTemplate.roomName,
          script: normalized?.script ?? roomTemplate.script,
          producerNotes: normalized?.producerNotes ?? roomTemplate.producerNotes,
          clips: normalized?.clips?.length ? normalized.clips : roomTemplate.clips,
          events: normalized?.events ?? [],
          tracks: normalized?.tracks ?? [],
        };
        setRoomName(normalized?.roomName ?? roomTemplate.roomName);
        setScript(normalized?.script ?? roomTemplate.script);
        setProducerNotes(normalized?.producerNotes ?? roomTemplate.producerNotes);
        setClips(normalized?.clips.length ? normalized.clips : roomTemplate.clips);
        setEvents(normalized?.events ?? []);
        setTracks((normalized?.tracks ?? []).map((track, index) => normalizeImportedTrackFromPersisted(track, index + 1)));
        setActiveClipId(normalized?.clips?.[0]?.id ?? DEFAULT_CLIPS[0]?.id ?? "");
        setActiveSegmentId(normalized?.clips?.[0]?.segments?.[0]?.id ?? DEFAULT_CLIPS[0]?.segments[0]?.id ?? "");
        roomAutosaveHashRef.current = makeRoomSnapshotFingerprint(snapshot);
        setLastSavedAt(normalized?.exportedAt ?? null);
        setHydrated(true);
        return;
      } catch (error) {
        console.warn("Could not read saved recording room state.", error);
      }
    }

    if (routeHydrationRunRef.current === runId) {
      const snapshot: RecorderRoomSnapshot = {
        roomName: roomTemplate.roomName,
        script: roomTemplate.script,
        producerNotes: roomTemplate.producerNotes,
        clips: roomTemplate.clips,
        events: [],
        tracks: [],
      };
        setRoomName(roomTemplate.roomName);
        setScript(roomTemplate.script);
        setProducerNotes(roomTemplate.producerNotes);
        setClips(roomTemplate.clips);
        setEvents([]);
        setTracks([]);
      setActiveClipId(DEFAULT_CLIPS[0]?.id ?? "");
      setActiveSegmentId(DEFAULT_CLIPS[0]?.segments[0]?.id ?? "");
      roomAutosaveHashRef.current = makeRoomSnapshotFingerprint(snapshot);
      setLastSavedAt(null);
    }
    if (routeHydrationRunRef.current === runId) {
      setHydrated(true);
    }

    return () => {
      // No-op: stale local parse steps are ignored via runId matching.
    };
  }, [entryAccessState, routeEpisode, routeProject]);

  useEffect(() => {
    if (!hydrated) return;
    const requestId = ++productionHydrationRunRef.current;
    const controller = new AbortController();
    const routeRunId = routeHydrationRunRef.current;
    const activeRoute = `${projectSlug}::${episodeSlug}`;

    postEpisodeProduction(
      {
        action: "ensure",
        projectSlug,
        episodeSlug,
        title: humanizeSlug(episodeSlug),
        boundaryLabel: humanizeSlug(episodeSlug),
        productionJson: {
          surface: "recorder",
          projectSlug,
          episodeSlug,
        },
      },
      { signal: controller.signal },
    ).then((state) => {
      if (routeHydrationRunRef.current !== routeRunId) return;
      if (activeHydrationRouteRef.current !== activeRoute) return;
      if (requestId !== productionHydrationRunRef.current) return;
      if (controller.signal.aborted) return;

      setProductionState(state);
      if (state.mode !== "database") {
        setRoomSaveState("conflict");
      }

      if (isHydratedFromProduction.current) return;
      const dbState = normalizeRoomState(state.recordingRoomJson);
      if (state.mode === "database" && dbState) {
        setRoomName(dbState.roomName);
        setScript(dbState.script);
        setProducerNotes(dbState.producerNotes);
        setClips(dbState.clips.length ? dbState.clips : defaultRoom().clips);
        setEvents(dbState.events);
        setTracks((dbState.tracks ?? []).map((track, index) => normalizeImportedTrackFromPersisted(track, index + 1)));
        setActiveClipId(dbState.clips?.[0]?.id ?? DEFAULT_CLIPS[0]?.id ?? "");
        setActiveSegmentId(dbState.clips?.[0]?.segments?.[0]?.id ?? DEFAULT_CLIPS[0]?.segments[0]?.id ?? "");
        const snapshot: RecorderRoomSnapshot = {
          roomName: dbState.roomName,
          script: dbState.script,
          producerNotes: dbState.producerNotes,
          clips: dbState.clips.length ? dbState.clips : defaultRoom().clips,
          events: dbState.events,
          tracks: dbState.tracks ?? [],
        };
        roomAutosaveHashRef.current = makeRoomSnapshotFingerprint(snapshot);
        const persistedRoomRecord = asObject(state.recordingRoomJson);
        const dbSavedAt = coerceString(persistedRoomRecord?.savedAt, dbState.exportedAt ?? "");
        setLastSavedAt(dbSavedAt || null);
        isHydratedFromProduction.current = true;
      }
      setProductionHydrationResolved(true);
    }).catch((error) => {
      if (isAbortError(error)) return;
      if (routeHydrationRunRef.current !== routeRunId || activeHydrationRouteRef.current !== activeRoute) return;
      if (requestId !== productionHydrationRunRef.current) return;
      if (controller.signal.aborted) return;
      console.warn("Could not hydrate recorder production state.", error);
      setRoomSaveState("error");
      setProductionHydrationResolved(true);
    });

    return () => {
      controller.abort();
    };
  }, [episodeSlug, hydrated, projectSlug]);

  useEffect(() => {
    if (!hydrated) return;
    const payload: PersistedRoom = {
      roomName,
      script,
      producerNotes,
      clips,
      events,
      tracks: tracks.map((track) => normalizePersistedTrack(track)),
    };
    window.localStorage.setItem(storageKey(projectSlug, episodeSlug), JSON.stringify(payload));
  }, [clips, episodeSlug, events, hydrated, producerNotes, projectSlug, roomName, script, tracks]);

  const roomSnapshot: RecorderRoomSnapshot = useMemo(
    () => ({
      roomName,
      script,
      producerNotes,
      clips,
      events,
      tracks: tracks.map((track) => normalizePersistedTrack(track)),
    }),
    [clips, events, producerNotes, roomName, script, tracks],
  );
  const roomSnapshotFingerprint = useMemo(() => makeRoomSnapshotFingerprint(roomSnapshot), [roomSnapshot]);
  const roomPersistPackage = useMemo(
    () => ({
      payloadVersion: RECORDING_ROOM_PAYLOAD_VERSION,
      version: "quipsly-recording-room.v1",
      roomName,
      script,
      producerNotes,
      clips,
      events,
      projectSlug,
      episodeSlug,
      durationMs: calculateRecordedSessionCursorMs(tracks),
      tracks: tracks.map((track) => normalizePersistedTrack(track)),
    }),
    [clips, episodeSlug, events, producerNotes, projectSlug, roomName, script, tracks],
  );

  useEffect(() => {
    if (!hydrated || !productionHydrationResolved || !productionState || productionState.mode !== "database") {
      setRoomSaveState(roomSnapshotFingerprint === roomAutosaveHashRef.current ? "fallback" : "conflict");
      return;
    }

    if (roomSnapshotFingerprint === roomAutosaveHashRef.current) {
      setRoomSaveState("idle");
      return;
    }

    const routeSnapshot = `${projectSlug}::${episodeSlug}`;
    if (roomAutosaveTimerRef.current) clearTimeout(roomAutosaveTimerRef.current);
    setRoomSaveState("queued");

    roomAutosaveTimerRef.current = setTimeout(() => {
      const captureFingerprint = roomSnapshotFingerprint;
      const requestId = ++roomAutosaveRequestRef.current;
      const routeRunId = routeHydrationRunRef.current;
      const controller = new AbortController();
      roomAutosaveAbortRef.current = controller;
      setRoomSaveState("saving");

      const savedAt = new Date().toISOString();
      const packageJson = {
        ...roomPersistPackage,
        savedAt,
        generatedFrom: "auto",
      };

      postEpisodeProduction(
        {
          action: "save-recording-room",
          productionId: productionState.id,
          projectSlug,
          episodeSlug,
          packageJson,
          expectedUpdatedAt: productionState.updatedAt,
        },
        { signal: controller.signal },
      ).then((state) => {
        if (controller.signal.aborted) return;
        if (routeRunId !== routeHydrationRunRef.current) return;
        if (activeHydrationRouteRef.current !== routeSnapshot) return;
        if (requestId !== roomAutosaveRequestRef.current) return;
        if (captureFingerprint !== roomSnapshotFingerprint) return;

        if (state.mode === "database") {
          roomAutosaveHashRef.current = captureFingerprint;
          setProductionState(state);
          setLastSavedAt(savedAt);
          setRoomSaveState("saved");
          setSaveToast("Recorder room autosaved");
        } else if (state.mode === "conflict") {
          setRoomSaveState("conflict");
          setSaveToast("Concurrent edit detected. Please refresh to merge.");
        } else {
          setRoomSaveState("conflict");
        }
      }).catch((error) => {
        if (isAbortError(error)) return;
        if (requestId !== roomAutosaveRequestRef.current) return;
        if (routeRunId !== routeHydrationRunRef.current) return;
        if (activeHydrationRouteRef.current !== routeSnapshot) return;
        console.warn("Could not autosave recorder room.", error);
        setRoomSaveState("error");
        setSaveToast("Autosave failed. Changes will retry on next edit.");
      });
    }, 1000);

    return () => {
      if (roomAutosaveTimerRef.current) {
        clearTimeout(roomAutosaveTimerRef.current);
        roomAutosaveTimerRef.current = null;
      }
      roomAutosaveAbortRef.current?.abort();
    };
  }, [clips, episodeSlug, hydrated, productionHydrationResolved, productionState, projectSlug, roomSnapshotFingerprint, roomPersistPackage]);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (animationFrameRef.current) window.cancelAnimationFrame(animationFrameRef.current);
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      audioContextRef.current?.close();
      if (roomAutosaveTimerRef.current) clearTimeout(roomAutosaveTimerRef.current);
      if (roomSaveToastTimerRef.current) clearTimeout(roomSaveToastTimerRef.current);
      roomAutosaveAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      tracksRef.current.forEach((track) => {
        if (track.sourceUrl?.startsWith("blob:")) {
          URL.revokeObjectURL(track.sourceUrl);
        }
      });
    };
  }, [audioUrl]);

  const activeClip = useMemo(
    () => clips.find((clip) => clip.id === activeClipId) ?? clips[0] ?? null,
    [activeClipId, clips],
  );
  const activeSegment = useMemo(
    () => activeClip?.segments.find((segment) => segment.id === activeSegmentId) ?? activeClip?.segments[0],
    [activeClip, activeSegmentId],
  );
  const clipPlaybackPlan = useMemo(() => buildClipPlaybackPlan(clips), [clips]);
  const activePlaybackEntry = useMemo(
    () =>
      clipPlaybackPlan.find((entry) => entry.clipId === activeClipId && entry.segmentId === activeSegmentId) ??
      clipPlaybackPlan[0] ??
      null,
    [activeClipId, activeSegmentId, clipPlaybackPlan],
  );
  const previewUrl = useMemo(
    () => buildYouTubeEmbedUrl(activePlaybackEntry?.clipUrl ?? "", {
      id: activePlaybackEntry?.segmentId ?? "",
      start: activePlaybackEntry ? String(activePlaybackEntry.sourceStart) : "",
      end: activePlaybackEntry ? String(activePlaybackEntry.sourceEnd) : "",
      note: activePlaybackEntry?.segmentNote ?? "",
    }, playNonce > 0),
    [activePlaybackEntry?.clipUrl, activePlaybackEntry?.sourceEnd, activePlaybackEntry?.sourceStart, activePlaybackEntry?.segmentNote, activePlaybackEntry?.segmentId, playNonce],
  );
  const sessionPackage = useMemo(
    () => ({
      payloadVersion: RECORDING_ROOM_PAYLOAD_VERSION,
      version: "quipsly-recording-room.v1",
      exportedAt: new Date().toISOString(),
      projectSlug,
      roomName,
      durationMs: elapsedMs,
      episodeSlug,
      episodeLabel: humanizeSlug(episodeSlug),
      productionId: productionState?.id ?? null,
      productionMode: productionState?.mode ?? "unknown",
      script,
      producerNotes,
      clips,
      events,
      tracks: tracks.map((track) => normalizePersistedTrack(track)),
      localRecording: audioBlob
        ? { mimeType: audioBlob.type || audioMimeType, size: audioBlob.size, durationMs: elapsedMs }
        : null,
    }),
    [audioBlob, audioMimeType, clips, elapsedMs, episodeSlug, events, producerNotes, productionState?.id, productionState?.mode, projectSlug, roomName, script, tracks],
  );
  const recordingSession = useMemo<EpisodeRecordingSession>(() => {
    const sessionId = productionState?.id ?? `${projectSlug || "local"}:${episodeSlug || "episode"}`;
    const segments = tracks.map((track, index) => recordingSegmentFromTrack(track, sessionId, index));
    const now = new Date().toISOString();

    return {
      payloadVersion: 1,
      id: sessionId,
      projectSlug,
      episodeSlug,
      title: roomName,
      participants: [
        {
          id: "local-recorder",
          displayName: "Local recorder",
          role: "host",
          deviceKind: "web-browser",
        },
      ],
      segments,
      createdAt: segments[0]?.startedAt ?? now,
      savedAt: lastSavedAt ?? now,
    };
  }, [episodeSlug, lastSavedAt, productionState?.id, projectSlug, roomName, tracks]);
  const recordingOffsets = useMemo(
    () => createRecordingSegmentTimelineOffsets(recordingSession),
    [recordingSession],
  );
  const recordingSpineSummary = useMemo(() => {
    const totalDurationSeconds = getRecordingSessionDurationSeconds(recordingSession);
    const attentionCount = recordingSession.segments.filter(segmentNeedsAttention).length;
    const uploadedCount = recordingSession.segments.filter((segment) => segment.upload?.objectKey || segment.upload?.url).length;

    return {
      totalDurationSeconds,
      attentionCount,
      uploadedCount,
      segmentCount: recordingSession.segments.length,
    };
  }, [recordingSession]);
  const loadYouTubeDummyClip = () => {
    const demoClip = makeDemoYoutubeClip();
    setClips([demoClip]);
    setActiveClipId(demoClip.id);
    setActiveSegmentId(demoClip.segments[0]?.id ?? "");
  };

  const syncClipWithRecorder = useCallback((elapsed = elapsedMs) => {
    if (!clipFollowRecording || clipPlaybackPlan.length === 0) return;
    const entry = clipPlaybackPlan.find((item) => elapsed >= item.playbackStartMs && elapsed < item.playbackEndMs);
    if (!entry) return;

    const shouldChange = entry.clipId !== activeClipId || entry.segmentId !== activeSegmentId;
    if (shouldChange) {
      setActiveClipId(entry.clipId);
      setActiveSegmentId(entry.segmentId);
      setPlayNonce((value) => value + 1);
    }
  }, [activeClipId, activeSegmentId, clipFollowRecording, clipPlaybackPlan]);

  const setSaveToast = (message: string) => {
    if (roomSaveToastTimerRef.current) {
      clearTimeout(roomSaveToastTimerRef.current);
    }
    setRoomSaveToast(message);
    roomSaveToastTimerRef.current = setTimeout(() => setRoomSaveToast(null), 2200);
  };

  const setAudioStatus = (message: string | null, status?: AudioUploadStatus) => {
    if (status) {
      setAudioUploadState(status);
    }
    setAudioUploadStatus(message);
  };

  const setTrackUploadMeta = useCallback((trackRecordId: string, patch: Partial<ImportedTrack>) => {
    setTracks((current) => current.map((track) => (track.id === trackRecordId ? { ...track, ...patch } : track)));
  }, []);

  const holdTrackLocally = useCallback((trackRecordId: string) => {
    setTrackUploadMeta(trackRecordId, {
      uploadState: "local-only",
      uploadMessage: "Local only — cloud upload paused pending resumable-v2",
    });
    setAudioStatus(WEB_CAPTURE_UPLOAD_PAUSED_MESSAGE, "not-available");
  }, [setTrackUploadMeta]);

  const roomSaveStatusLabel = (() => {
    if (roomSaveState === "queued") return "Queued";
    if (roomSaveState === "saving") return "Saving";
    if (roomSaveState === "saved") return "Saved";
    if (roomSaveState === "error") return "Error";
    if (roomSaveState === "fallback") return "Fallback mode";
    if (roomSaveState === "conflict") return "Conflict";
    return "Idle";
  })();
  const roomSaveStatusStyles = roomSaveState === "saved"
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : roomSaveState === "queued" || roomSaveState === "saving"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : roomSaveState === "error" || roomSaveState === "conflict"
        ? "border-red-200 bg-red-50 text-red-800"
        : "border-slate-200 bg-slate-50 text-slate-700";
  const roomLastSavedDisplay = lastSavedAt ? new Date(lastSavedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "never";

  useEffect(() => {
    if (!hydrated || !routeSeedDemo || demoSeedAppliedRef.current) return;
    loadYouTubeDummyClip();
    setSaveToast("Loaded YouTube dummy edit for test watch.");
    setEvents((current) => [
      {
        id: makeId("event"),
        kind: "session",
        label: "Loaded YouTube dummy edit",
        note: `Seeded test clip from ${DEMO_YOUTUBE_VIDEO_URL}`,
        atMs: elapsedMs,
        createdAt: new Date().toISOString(),
      },
      ...current,
    ]);
    demoSeedAppliedRef.current = true;
  }, [routeSeedDemo, hydrated, elapsedMs, loadYouTubeDummyClip, setSaveToast]);

  const updateLevels = () => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    setAudioLevels(
      Array.from({ length: 18 }).map((_, index) => {
        const value = data[index % data.length] ?? 0;
        return Math.max(4, (value / 255) * 44);
      }),
    );
    animationFrameRef.current = window.requestAnimationFrame(updateLevels);
  };

  const logEvent = (
    kind: RecordingEventKind,
    label: string,
    note?: string,
    atMs?: number,
    clipPlayback?: RecordingEvent["clipPlayback"],
  ) => {
    const resolvedAtMs = Number.isFinite(atMs ?? NaN) ? atMs! : isRecording && startedAtRef.current ? Date.now() - startedAtRef.current : 0;
    setEvents((current) => [
      {
        id: makeId(kind),
        kind,
        label,
        note,
        clipPlayback,
        atMs: resolvedAtMs,
        createdAt: new Date().toISOString(),
      },
      ...current,
    ]);
  };

  useEffect(() => {
    if (!isRecording) return;
    syncClipWithRecorder(elapsedMs);
  }, [elapsedMs, isRecording, syncClipWithRecorder]);

  useEffect(() => {
    if (playNonce === 0 || isRecording) return;
    if (!activePlaybackEntry) return;

    const timeoutMs = (activePlaybackEntry.sourceDuration * 1000) + 250; // 250ms buffer for iframe loading

    const timeout = setTimeout(() => {
      const currentIndex = clipPlaybackPlan.findIndex(
        (entry) => entry.clipId === activePlaybackEntry.clipId && entry.segmentId === activePlaybackEntry.segmentId
      );

      const nextEntry = currentIndex >= 0 ? clipPlaybackPlan[currentIndex + 1] : clipPlaybackPlan[0];
      if (nextEntry) {
        setActiveClipId(nextEntry.clipId);
        setActiveSegmentId(nextEntry.segmentId);
        setPlayNonce((value) => value + 1);
      }
    }, timeoutMs);

    return () => clearTimeout(timeout);
  }, [playNonce, activePlaybackEntry, clipPlaybackPlan, isRecording]);

  const armMic = async (forceRearm = false) => {
    if (streamRef.current && !forceRearm) return streamRef.current;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setMicReady(false);
    }

    setMicError(null);

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: {
          deviceId: selectedAudioDeviceId !== "default" ? { exact: selectedAudioDeviceId } : undefined,
          channelCount: 1,
          sampleRate: 48000,
          echoCancellation,
          noiseSuppression,
          autoGainControl,
        },
      });

      streamRef.current = mediaStream;
      setMicReady(true);

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextClass();
      if (audioContext.state === "suspended") await audioContext.resume();

      const source = audioContext.createMediaStreamSource(mediaStream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      updateLevels();

      logEvent("session", "Mic armed", "Browser capture ready. For final production, keep a local device backup rolling too.");
      return mediaStream;
    } catch (err) {
      console.warn("Microphone access failed.", err);
      logEvent("session", "Mic error", `Failed to arm browser mic: ${String(err)}`);
      setMicError(`Camera/mic permission denied or device busy. Please check browser settings. (${String(err)})`);
      return null;
    }
  };

  useEffect(() => {
    if (micReady && !isRecording) {
      armMic(true).catch(console.warn);
    }
  }, [selectedAudioDeviceId, echoCancellation, noiseSuppression, autoGainControl]);

  const startRecording = async () => {
    const mediaStream = await armMic(true);
    if (!mediaStream) return;

    await clearRecorderDB();

    const mimeType = pickMimeType();
    const inferredKind: RecordingTrackKind = inferTrackKindFromType(mimeType || "") || "audio";
    const startAt = new Date();
    const startAtIso = startAt.toISOString();
    const segmentClockMs = calculateRecordedSessionCursorMs(tracksRef.current);
    setAudioMimeType(mimeType || "browser-default-audio");
    setAudioBlob(null);
    setAudioUrl(null);
    setAudioUploadStatus(null);
    setAudioUploadState("idle");
    chunksRef.current = []; // Keep in-memory as fallback/fast-path for short clips if desired, but IDB is primary

    const recorder = new MediaRecorder(mediaStream, mimeType ? { mimeType } : undefined);
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
        writeRecorderChunk(event.data).catch(console.warn);
      }
    };
    recorder.onstop = async () => {
      const stoppedAt = new Date();
      const stoppedAtIso = stoppedAt.toISOString();
      const recordedStartAt = startedAtRef.current ? new Date(startedAtRef.current).toISOString() : stoppedAtIso;
      const stopMs = startedAtRef.current ? Math.max(0, stoppedAt.getTime() - startedAtRef.current) : 0;
      const recordedSessionStartMs = segmentClockMs;
      const recordedSessionEndMs = recordedSessionStartMs + stopMs;

      const idbChunks = await getAllRecorderChunks();
      const finalChunks = idbChunks.length > 0 ? idbChunks : chunksRef.current;
      const blob = new Blob(finalChunks, { type: mimeType || "audio/webm" });

      const trackId = nextTrackId(tracksRef.current, inferredKind);
      const trackUrl = URL.createObjectURL(blob);
      const extension = inferUploadTrackFileExt(blob.type, inferredKind);
      const fileName = `${projectSlug}-${episodeSlug}-${trackId}.${extension}`;
      const trackRecordId = makeId("track");
      setAudioBlob(blob);
      setAudioUrl(trackUrl);

      const track: ImportedTrack = {
        id: trackRecordId,
        name: `${roomName} local recording.${extension}`,
        size: blob.size,
        type: blob.type,
        kind: inferredKind,
        trackId,
        source: "local-recorder",
        sourceUrl: trackUrl,
        fileName,
        durationMs: stopMs,
        uploadState: "idle",
        createdAt: new Date().toISOString(),
        recordedStartAt,
        recordedEndAt: stoppedAtIso,
        recordedSessionStartMs,
        recordedSessionEndMs,
      };
      setTracks((current) => [track, ...current]);
      startedAtRef.current = null;
      holdTrackLocally(trackRecordId);
    };

    const start = startAt.getTime();
    startedAtRef.current = start;
    setElapsedMs(0);
    setIsRecording(true);
    setClipFollowRecording(true);
    recorder.start(1000);
    timerRef.current = window.setInterval(() => setElapsedMs(Date.now() - start), 250);
    logEvent("session", "Recording started", `Wall-clock start: ${formatRecordingTimestamp(startAtIso)}`, segmentClockMs);
  };

  const stopRecording = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    const stoppedAt = new Date();
    const stoppedAtIso = stoppedAt.toISOString();
    const segmentElapsedMs = startedAtRef.current ? Math.max(0, stoppedAt.getTime() - startedAtRef.current) : elapsedMs;
    const stopClockMs = calculateRecordedSessionCursorMs(tracksRef.current) + segmentElapsedMs;
    setIsRecording(false);
    setElapsedMs(segmentElapsedMs);
    setAudioUploadStatus("Stopping recorder, then syncing track...");

    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }

    logEvent(
      "session",
      "Recording stopped",
      `Wall-clock stop: ${formatRecordingTimestamp(stoppedAtIso)}`,
      stopClockMs,
    );
  };

  const addClip = () => {
    const clip: ClipCue = {
      id: makeId("clip"),
      title: "New clip",
      url: "",
      segments: [{ id: makeId("segment"), start: "", end: "", note: "" }],
    };
    setClips((current) => [...current, clip]);
    setActiveClipId(clip.id);
    setActiveSegmentId(clip.segments[0].id);
  };

  const updateClip = (clipId: string, patch: Partial<ClipCue>) => {
    setClips((current) => current.map((clip) => clip.id === clipId ? { ...clip, ...patch } : clip));
  };

  const removeClip = (clipId: string) => {
    setClips((current) => {
      const next = current.filter((clip) => clip.id !== clipId);
      if (activeClipId === clipId) {
        setActiveClipId(next[0]?.id ?? "");
        setActiveSegmentId(next[0]?.segments[0]?.id ?? "");
      }
      return next;
    });
  };

  const addSegment = (clipId: string) => {
    const segment = { id: makeId("segment"), start: "", end: "", note: "" };
    setClips((current) =>
      current.map((clip) => clip.id === clipId ? { ...clip, segments: [...clip.segments, segment] } : clip),
    );
    setActiveSegmentId(segment.id);
  };

  const updateSegment = (clipId: string, segmentId: string, patch: Partial<ClipSegment>) => {
    setClips((current) =>
      current.map((clip) =>
        clip.id === clipId
          ? {
              ...clip,
              segments: clip.segments.map((segment) =>
                segment.id === segmentId ? { ...segment, ...patch } : segment,
              ),
            }
          : clip,
      ),
    );
  };

  const removeSegment = (clipId: string, segmentId: string) => {
    setClips((current) =>
      current.map((clip) => {
        if (clip.id !== clipId) return clip;
        const segments = clip.segments.filter((segment) => segment.id !== segmentId);
        return {
          ...clip,
          segments: segments.length ? segments : [{ id: makeId("segment"), start: "", end: "", note: "" }],
        };
      }),
    );
  };

  const playAndLogSegment = () => {
    if (!activeClip || !activeSegment) return;
    const segmentRange = sanitizeSegmentTimes(activeSegment);
    if (clipFollowRecording) {
      setClipFollowRecording(false);
    }
    setPlayNonce((value) => value + 1);
    logEvent(
      "clip",
      `Played ${activeClip.title || "clip"} ${activeSegment.start || "0:00"}-${activeSegment.end || "open"}`,
      activeSegment.note || activeClip.url,
      undefined,
      activeClip.url.trim()
        ? {
            clipId: activeClip.id,
            segmentId: activeSegment.id,
            sourceUrl: activeClip.url.trim(),
            sourceStartSeconds: segmentRange.sourceStart,
            sourceEndSeconds: segmentRange.sourceEnd,
          }
        : undefined,
    );
  };

  const handleTrackFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;

    let trackSeed = [...tracksRef.current];
    const tracksToAttach = files.map((file) => {
      const inferredKind = inferTrackKindFromFile(file);
      const trackId = nextTrackId(trackSeed, inferredKind);
      const trackRecordId = makeId("track");
      const isPlayable = file.type.startsWith("video/") || file.type.startsWith("audio/") || !!inferTrackKindFromFileName(file.name);
      const sourceUrl = isPlayable ? URL.createObjectURL(file) : undefined;
      const track: ImportedTrack = {
        id: trackRecordId,
        name: file.name,
        size: file.size,
        type: file.type || "unknown",
        kind: inferredKind,
        source: "file" as const,
        trackId,
        sourceUrl,
        fileName: file.name,
        uploadState: "idle",
        uploadMessage: "Awaiting upload",
        durationMs: 0,
        createdAt: new Date().toISOString(),
      };
      trackSeed = [...trackSeed, track];
      return track;
    });

    setTracks((current) => [...tracksToAttach, ...current]);
    tracksToAttach.forEach((track, index) => {
      if (!track.trackId) return;
      holdTrackLocally(track.id);
    });
    logEvent("session", `Attached ${files.length} local file${files.length === 1 ? "" : "s"}`);
    event.target.value = "";
  };

  const downloadAudio = () => {
    if (!audioBlob || !audioUrl) return;
    const extension = audioBlob.type.includes("mp4") || audioBlob.type.includes("aac") ? "m4a" : "webm";
    const anchor = document.createElement("a");
    anchor.href = audioUrl;
    anchor.download = `${projectSlug}-${Date.now()}-local-audio.${extension}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const saveRoomToEpisode = async () => {
    if (!productionState) return;
    const payload = {
      ...roomPersistPackage,
      savedAt: new Date().toISOString(),
      generatedFrom: "manual",
    };
    const activeRoute = `${projectSlug}::${episodeSlug}`;
    const runId = routeHydrationRunRef.current;
    if (productionState.mode !== "database") {
      setRoomSaveState("conflict");
      setSaveToast("No DB connection for this route; local copy only.");
      return;
    }

    roomAutosaveAbortRef.current?.abort();
    roomAutosaveTimerRef.current && clearTimeout(roomAutosaveTimerRef.current);
    roomAutosaveTimerRef.current = null;

    const requestId = ++roomAutosaveRequestRef.current;
    const controller = new AbortController();
    roomAutosaveAbortRef.current = controller;

    setRoomSaveState("saving");
    try {
      const state = await postEpisodeProduction(
        {
          action: "save-recording-room",
          productionId: productionState?.mode === "database" ? productionState.id : undefined,
          projectSlug,
          episodeSlug,
          packageJson: payload,
          expectedUpdatedAt: productionState.updatedAt,
        },
        { signal: controller.signal },
      );

      if (controller.signal.aborted) return;
      if (runId !== routeHydrationRunRef.current) return;
      if (activeHydrationRouteRef.current !== activeRoute) return;
      if (requestId !== roomAutosaveRequestRef.current) return;

      setProductionState(state);
      roomAutosaveHashRef.current = roomSnapshotFingerprint;
      setLastSavedAt(payload.savedAt);

      if (state.mode === "database") {
        setRoomSaveState("saved");
        setSaveToast("Recorder room manually saved");
      } else if (state.mode === "conflict") {
        setRoomSaveState("conflict");
        setSaveToast("Concurrent edit detected. Please refresh to merge.");
      } else {
        setRoomSaveState("fallback");
      }
    } catch (error) {
      if (isAbortError(error)) return;
      if (requestId !== roomAutosaveRequestRef.current) return;
      setRoomSaveState("error");
      setSaveToast("Manual save failed");
      console.warn("Could not save recorder room manually.", error);
    }
  };

  if (entryAccessState === "checking" || (entryAccessState === "allowed" && (!hydrated || !productionHydrationResolved))) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0b0d12] px-5 py-10 text-slate-100">
        <section className="w-full max-w-2xl rounded-[32px] border border-amber-300/25 bg-slate-950/80 p-8 text-center shadow-2xl shadow-black/30" aria-live="polite">
          <p className="text-xs font-black uppercase tracking-[0.32em] text-amber-300">Protected recording room</p>
          <h1 className="mt-4 text-4xl font-black tracking-tight text-white">Checking Nest access…</h1>
          <p className="mt-4 text-base leading-7 text-slate-300">No script, notes, local room state, or capture controls load until this account is verified.</p>
        </section>
      </main>
    );
  }

  if (entryAccessState === "denied" || entryAccessState === "unavailable") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0b0d12] px-5 py-10 text-slate-100">
        <section className="w-full max-w-2xl rounded-[32px] border border-rose-300/30 bg-slate-950/80 p-8 text-center shadow-2xl shadow-black/30" role="alert">
          <p className="text-xs font-black uppercase tracking-[0.32em] text-rose-300">Recording room protected</p>
          <h1 className="mt-4 text-4xl font-black tracking-tight text-white">
            {entryAccessState === "denied" ? "This Nest recorder is private." : "Recorder access could not be verified."}
          </h1>
          <p className="mt-4 text-base leading-7 text-slate-300">
            No script, producer notes, local room state, or recording controls were loaded.
          </p>
          {entryAccessState === "unavailable" && entryAccessMessage ? <p className="mt-3 text-sm text-slate-400">{entryAccessMessage}</p> : null}
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {entryAccessState === "unavailable" ? (
              <button type="button" onClick={() => setEntryAccessRetryToken((token) => token + 1)} className="rounded-full bg-amber-300 px-5 py-3 text-sm font-black uppercase tracking-[0.18em] text-slate-950">
                Retry
              </button>
            ) : null}
            <Link href="/projects" className="rounded-full border border-white/15 px-5 py-3 text-sm font-black uppercase tracking-[0.18em] text-slate-100">
              Choose an accessible Nest
            </Link>
          </div>
        </section>
      </main>
    );
  }

  if (hydrated && !projectSlug) {
    return (
      <main className="min-h-screen bg-[#0b0d12] px-5 py-10 text-slate-100">
        <section className="mx-auto flex min-h-[70vh] max-w-3xl flex-col justify-center rounded-[32px] border border-amber-300/25 bg-slate-950/80 p-8 shadow-2xl shadow-black/30">
          <p className="text-xs font-black uppercase tracking-[0.32em] text-amber-300">
            Recording needs a Nest
          </p>
          <h1 className="mt-4 text-4xl font-black tracking-tight text-white">
            Choose where this session belongs before recording.
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-300">
            Recorder rooms now require a project/Nest so audio, clips, transcripts, and timelines stay attached to the right work. No more sneaky dev-lab fallbacks.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/projects"
              className="rounded-full bg-amber-300 px-5 py-3 text-sm font-black uppercase tracking-[0.18em] text-slate-950 shadow-lg shadow-amber-950/30"
            >
              Open Nests
            </Link>
            <Link
              href="/create"
              className="rounded-full border border-white/15 px-5 py-3 text-sm font-black uppercase tracking-[0.18em] text-slate-100"
            >
              Back to Studio
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7efe0] text-[#312619]">
      <header className="border-b border-[#dfcaa5] bg-[#fffaf0]/95 px-4 py-3 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.28em] text-[#a86520]">Quipsly Nest / Recorder</div>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-[#2d2115] md:text-3xl">{roomName}</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[#6b5a43] md:block hidden">
              Read the manuscript, capture clean local audio, play clip cues, and leave an edit map as you go.
            </p>
          </div>

          <nav className="hidden flex-wrap items-center gap-2 text-xs font-bold md:flex">
            <Link
              href={`/create?project=${encodeURIComponent(projectSlug)}&publisher=1&boundary=${encodeURIComponent(episodeSlug)}`}
              className="rounded-full border border-[#d7bd8f] bg-white px-4 py-2 text-[#5d4528] shadow-sm hover:bg-[#fff4db]"
            >
              Manuscript
            </Link>
            <Link
              href={`/editor?project=${encodeURIComponent(projectSlug)}&episode=${encodeURIComponent(episodeSlug)}`}
              className="rounded-full border border-[#d7bd8f] bg-white px-4 py-2 text-[#5d4528] shadow-sm hover:bg-[#fff4db]"
            >
              Video editor
            </Link>
            <Link
              href="/coaching/sessions"
              className="rounded-full border border-[#2f2418] bg-[#2f2418] px-4 py-2 text-white shadow-sm hover:bg-[#46331f]"
            >
              Session prep
            </Link>
            <Link
              href="/asset-manager"
              className="rounded-full border border-[#d7bd8f] bg-white px-4 py-2 text-[#5d4528] shadow-sm hover:bg-[#fff4db]"
            >
              Assets
            </Link>
            <button
              type="button"
              onClick={() => downloadText(`${projectSlug}-recording-session.json`, JSON.stringify(sessionPackage, null, 2))}
              className="rounded-full border border-[#2f2418] bg-[#2f2418] px-4 py-2 text-white shadow-sm hover:bg-[#46331f]"
            >
              Export session
            </button>
            <button
              type="button"
              onClick={saveRoomToEpisode}
              disabled={roomSaveState === "saving"}
              className="rounded-full border border-emerald-700 bg-emerald-700 px-4 py-2 text-white shadow-sm hover:bg-emerald-800 disabled:opacity-50"
            >
              {roomSaveState === "saving"
                ? "Saving..."
                : roomSaveState === "queued"
                  ? "Queueing..."
                  : roomSaveState === "saved"
                    ? "Saved"
                    : roomSaveState === "error"
                      ? "Retry save"
                      : roomSaveState === "conflict"
                        ? "Resolve sync"
                        : roomSaveState === "fallback"
                          ? "Local-only"
                          : "Save room"}
            </button>
          </nav>
          <div className="mt-2 flex w-full flex-wrap items-center gap-2 text-[11px]">
            <span className={`rounded-full border px-3 py-1 font-black uppercase tracking-wide ${roomSaveStatusStyles}`}>
              {roomSaveStatusLabel}
            </span>
            <span className="rounded-full border border-[#dbbc8f] bg-[#fff3d8] px-3 py-1 font-black uppercase tracking-wide text-[#8e6237]">
              Last saved {roomLastSavedDisplay}
            </span>
            {roomSaveToast ? (
              <span className="rounded-full border border-[#9d6f20] bg-[#fff6de] px-3 py-1 font-black uppercase tracking-wide text-[#7b4e18]">
                {roomSaveToast}
              </span>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] p-3 md:p-5">
        {isMobileLayout ? (
          <div className="fixed inset-0 z-50 flex flex-col bg-[#0b0d12] font-sans text-white overflow-hidden">
            {/* Top Bar */}
            <div className="flex items-center justify-between border-b border-white/5 bg-[#11141a]/80 px-4 py-3 shadow-md backdrop-blur-md">
              <div className="flex items-center gap-2">
                <div
                  className={`h-2 w-2 rounded-full ${
                    isRecording ? "animate-pulse bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.6)]" : "bg-emerald-500"
                  }`}
                />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">
                  {humanizeSlug(episodeSlug)}
                </span>
              </div>
              <div className="font-mono text-sm font-bold tracking-wider text-amber-100">
                {formatClock(elapsedMs)}
              </div>
            </div>

            {/* Prompter Area */}
            <div className="flex-1 overflow-y-auto scroll-smooth bg-[#0b0d12] p-4 pb-48">
              <textarea
                value={script}
                onChange={(event) => setScript(event.target.value)}
                aria-label="Episode manuscript"
                className="h-full min-h-[80vh] w-full resize-none bg-transparent font-serif text-[28px] leading-[1.6] text-amber-50/90 outline-none placeholder:text-white/20 md:text-[36px]"
                placeholder="Paste manuscript here..."
                spellCheck={false}
              />
            </div>

            {/* Inline Clip Viewer Overlay (if clip is active) */}
            {previewUrl && (
              <div className="absolute left-4 right-4 top-14 z-20 overflow-hidden rounded-2xl border border-white/10 bg-black/90 shadow-2xl backdrop-blur-xl">
                <div className="flex items-center justify-between bg-white/5 px-3 py-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">
                    {activePlaybackEntry?.clipTitle || "Clip Cue"}
                  </span>
                  <button
                    onClick={() => setClipFollowRecording((v) => !v)}
                    className={`rounded px-2 py-1 text-[9px] font-bold uppercase tracking-wider ${
                      clipFollowRecording ? "bg-amber-500/20 text-amber-300" : "bg-white/5 text-white/40"
                    }`}
                  >
                    Sync {clipFollowRecording ? "ON" : "OFF"}
                  </button>
                </div>
                <div className="aspect-video">
                  <iframe
                    key={`${activePlaybackEntry?.clipId}-${activePlaybackEntry?.segmentId}-${playNonce}`}
                    src={previewUrl}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    className="h-full w-full"
                    title="Clip preview"
                  />
                </div>
                <button
                  onClick={playAndLogSegment}
                  className="w-full bg-amber-500/10 py-3 text-xs font-black uppercase tracking-widest text-amber-400 transition-colors hover:bg-amber-500/20"
                >
                  Play & Log Event
                </button>
              </div>
            )}

            {/* Bottom Recording Control Dock */}
            <div className="absolute bottom-6 left-4 right-4 z-30">
              <div className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-[#11141a]/80 p-4 shadow-2xl backdrop-blur-xl">
                <div role="status" className="rounded-xl border border-amber-400/20 bg-amber-950/50 px-3 py-2 text-[10px] font-bold leading-4 text-amber-200">
                  Cloud upload paused pending consent-bound resumable-v2. Takes stay local; download or export before leaving.
                </div>
                {/* Audio Visualizer */}
                <div className="flex h-8 items-end justify-center gap-[2px] opacity-80">
                  {audioLevels.map((level, index) => (
                    <div
                      key={index}
                      className={`w-1 rounded-t-sm transition-all duration-75 ${
                        isRecording ? "bg-red-500" : micReady ? "bg-emerald-400" : "bg-white/20"
                      }`}
                      style={{ height: `${Math.max(2, level * 0.8)}px` }}
                    />
                  ))}
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      {audioUploadState === "uploaded"
                        ? "Uploaded"
                        : audioUploadState === "not-available"
                        ? "Local only"
                        : roomSaveState === "error"
                        ? "Error"
                        : micReady
                        ? "Ready"
                        : "Standby"}
                    </span>
                    {micError && <span className="text-[9px] text-red-400">{micError}</span>}
                    {audioUploadStatus && <span className="max-w-[11rem] text-[9px] leading-3 text-amber-300">{audioUploadStatus}</span>}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => armMic(true)}
                      disabled={micReady || isRecording}
                      className="rounded-full bg-white/5 px-4 py-3 text-[11px] font-black uppercase tracking-widest text-white/80 transition-colors disabled:opacity-30"
                    >
                      {micReady ? "Armed" : "Arm Mic"}
                    </button>
                    <button
                      type="button"
                      onClick={isRecording ? stopRecording : startRecording}
                      className={`flex h-14 w-14 items-center justify-center rounded-full transition-all ${
                        isRecording
                          ? "animate-pulse bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.5)]"
                          : "bg-white text-black shadow-xl"
                      }`}
                    >
                      {isRecording ? (
                        <div className="h-5 w-5 rounded-sm bg-white" />
                      ) : (
                        <div className="ml-1 h-4 w-4 rounded-full bg-red-600" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)_400px]">
            <section className="rounded-3xl border border-[#dfcaa5] bg-[#fffaf0] p-4 shadow-sm">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.22em] text-[#b07328]">Script stand</div>
                  <h2 className="mt-1 text-xl font-black">Manuscript in the room</h2>
                </div>
                <div className="text-right">
                  <span className="rounded-full border border-[#ead8b6] bg-[#f8edda] px-3 py-1 text-[11px] font-black uppercase tracking-wide text-[#7d5725]">
                    {projectSlug}
                  </span>
                  <div className="mt-2 rounded-full border border-[#d8b777] bg-[#fff4d8] px-3 py-1 text-[11px] font-black uppercase tracking-wide text-[#8a5a19]">
                    {humanizeSlug(episodeSlug)}
                  </div>
                  <div className={`mt-2 rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-wide ${
                    productionState?.mode === "database"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-amber-200 bg-amber-50 text-amber-800"
                  }`}>
                    {productionState?.mode === "database" ? "DB backed" : "URL backed"}
                  </div>
                </div>
              </div>

              <label htmlFor="recording-room-title" className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-[#8f6d38]">Room title</label>
              <input
                id="recording-room-title"
                value={roomName}
                onChange={(event) => setRoomName(event.target.value)}
                className="mb-4 w-full rounded-2xl border border-[#e4cfaa] bg-white px-4 py-3 text-sm font-bold outline-none focus:border-[#c0832d]"
              />

              <textarea
                value={script}
                onChange={(event) => setScript(event.target.value)}
                aria-label="Episode manuscript"
                className="h-[46vh] min-h-[360px] w-full resize-none rounded-2xl border border-[#e4cfaa] bg-white p-4 font-serif text-lg leading-8 text-[#342616] shadow-inner outline-none focus:border-[#c0832d]"
                spellCheck
              />

              <div className="mt-4 rounded-2xl border border-[#ecd7b3] bg-[#fff4dd] p-4">
                <div className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-[#9b6927]">Producer notes</div>
                <textarea
                  value={producerNotes}
                  onChange={(event) => setProducerNotes(event.target.value)}
                  aria-label="Producer notes"
                  className="h-28 w-full resize-none rounded-xl border border-[#ead3aa] bg-white/80 p-3 text-sm leading-6 outline-none focus:border-[#c0832d]"
                />
              </div>
            </section>

            <section className="space-y-5">
              <div className="rounded-3xl border border-[#2a2118] bg-[#20170f] p-5 text-white shadow-xl">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.28em] text-[#f4b860]">Local audio capture</div>
                    <h2 className="mt-2 text-4xl font-black tabular-nums">{formatClock(elapsedMs)}</h2>
                    <p className="mt-2 max-w-xl text-sm leading-6 text-[#d9c7a7]">
                      Browser audio stays on this device. For mission-critical sessions, use the consent-bound iPhone Capture app and keep a local backup.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => armMic(true)}
                      disabled={micReady || isRecording}
                      className="rounded-full border border-[#64503a] bg-[#34271a] px-4 py-2 text-xs font-black uppercase tracking-wide text-[#ffe6b6] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {micReady ? "Mic armed" : "Arm mic"}
                    </button>
                    <button
                      type="button"
                      onClick={isRecording ? stopRecording : startRecording}
                      className={`rounded-full px-6 py-2 text-xs font-black uppercase tracking-wide shadow-lg ${
                        isRecording
                          ? "bg-red-600 text-white shadow-red-900/40"
                          : "bg-[#f0a83b] text-[#2b1b0b] shadow-orange-950/30"
                      }`}
                    >
                      {isRecording ? "Stop recording" : "Start recording"}
                    </button>
                  </div>
                </div>

                {micError ? (
                  <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-950/40 p-3 text-sm text-red-100">{micError}</div>
                ) : null}

                <div role="status" className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-950/40 p-3 text-sm leading-6 text-amber-100">
                  <strong>Web cloud upload is paused.</strong> Resumable-v2 still needs an explicit capture-session and consent preflight here. No recording or attached file is sent; download or export local sources before leaving.
                </div>

                <div className="mt-6 flex h-20 items-end gap-1 rounded-2xl border border-white/10 bg-black/30 p-4">
                  {audioLevels.map((level, index) => (
                    <div
                      key={index}
                      className={`w-full rounded-full transition-all duration-75 ${
                        index < 12 ? "bg-emerald-400" : index < 15 ? "bg-yellow-300" : "bg-red-400"
                      }`}
                      style={{ height: `${level}px` }}
                    />
                  ))}
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  {[
                    ["marker", "Good line"],
                    ["note", "Show note"],
                    ["retake", "Retake"],
                    ["marker", "Homer beat"],
                    ["marker", "Charlie beat"],
                    ["marker", "Edit point"],
                  ].map(([kind, label]) => (
                    <button
                      key={`${kind}-${label}`}
                      type="button"
                      onClick={() => logEvent(kind as RecordingEventKind, label)}
                      className="rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-left text-sm font-black text-[#ffe5b3] transition-colors hover:bg-white/15"
                    >
                      <span className="block text-[10px] uppercase tracking-[0.2em] text-[#bda987]">{kind}</span>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-5 xl:grid-cols-2">
                <div className="rounded-3xl border border-[#dfcaa5] bg-[#fffaf0] p-5 shadow-sm">
                  <div className="text-xs font-black uppercase tracking-[0.22em] text-[#b07328]">Local takes</div>
                  <h2 className="mt-1 text-xl font-black">Audio and local tracks</h2>
                  <p className="mt-2 text-sm leading-6 text-[#6b5a43]">
                    Attach iPhone voice memos, backup WAVs, or browser captures here for this tab only. Cloud upload is unavailable until the consent-bound resumable-v2 migration is complete.
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <label className="cursor-pointer rounded-full border border-[#d7bd8f] bg-white px-4 py-2 text-xs font-black text-[#5d4528] shadow-sm hover:bg-[#fff4db]">
                      Attach audio/video files
                      <input type="file" multiple accept="audio/*,video/*" onChange={handleTrackFiles} className="hidden" />
                    </label>
                    <button
                      type="button"
                      onClick={downloadAudio}
                      disabled={!audioBlob}
                      className="rounded-full border border-[#2f2418] bg-[#2f2418] px-4 py-2 text-xs font-black text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Download latest audio
                    </button>
                  </div>

                  {audioUrl ? (
                    <audio controls src={audioUrl} className="mt-4 w-full" />
                  ) : (
                    <div className="mt-4 rounded-2xl border border-dashed border-[#dcc49c] bg-white/70 p-5 text-sm text-[#755d3b]">
                      No browser recording captured yet.
                    </div>
                  )}

                  <div className="mt-4 rounded-2xl border border-[#d8c29c] bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-black uppercase tracking-[0.18em] text-[#9b6927]">Recording spine</div>
                        <h3 className="mt-1 font-serif text-lg font-black text-[#342616]">
                          Breaks are preserved as stackable segments.
                        </h3>
                        <p className="mt-2 text-xs leading-5 text-[#6b5a43]">
                          Each take keeps start/stop timestamps and upload evidence. If a call drops or a phone recording restarts, Quipsly can stack the segments end-to-end and sync them back to the continuous edit.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => downloadText(`${projectSlug}-recording-spine.json`, JSON.stringify(recordingSession, null, 2))}
                        className="rounded-full border border-[#d7bd8f] bg-[#fff8e8] px-3 py-2 text-[11px] font-black uppercase tracking-wide text-[#7d5725] shadow-sm hover:bg-[#fff0cf]"
                      >
                        Export spine
                      </button>
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-4">
                      <div className="rounded-xl border border-[#ead8b6] bg-[#fffaf0] p-3">
                        <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#9b6927]">Segments</div>
                        <div className="mt-1 text-2xl font-black text-[#342616]">{recordingSpineSummary.segmentCount}</div>
                      </div>
                      <div className="rounded-xl border border-[#ead8b6] bg-[#fffaf0] p-3">
                        <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#9b6927]">Duration</div>
                        <div className="mt-1 text-2xl font-black text-[#342616]">
                          {formatClock(recordingSpineSummary.totalDurationSeconds * 1000)}
                        </div>
                      </div>
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                        <div className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700">Uploaded</div>
                        <div className="mt-1 text-2xl font-black text-emerald-900">{recordingSpineSummary.uploadedCount}</div>
                      </div>
                      <div className={`rounded-xl border p-3 ${
                        recordingSpineSummary.attentionCount > 0
                          ? "border-amber-200 bg-amber-50"
                          : "border-emerald-200 bg-emerald-50"
                      }`}>
                        <div className={`text-[10px] font-black uppercase tracking-[0.16em] ${
                          recordingSpineSummary.attentionCount > 0 ? "text-amber-700" : "text-emerald-700"
                        }`}>Needs attention</div>
                        <div className={`mt-1 text-2xl font-black ${
                          recordingSpineSummary.attentionCount > 0 ? "text-amber-900" : "text-emerald-900"
                        }`}>{recordingSpineSummary.attentionCount}</div>
                      </div>
                    </div>
                    {recordingOffsets.length > 0 ? (
                      <div className="mt-4 max-h-32 space-y-1 overflow-y-auto rounded-xl border border-[#ead8b6] bg-[#fffaf0] p-2">
                        {recordingOffsets.map((offset, index) => (
                          <div key={offset.segmentId} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-[11px] text-[#6b5a43]">
                            <span className="font-black text-[#342616]">Segment {index + 1}</span>
                            <span>{formatClock(offset.timelineStartSeconds * 1000)} - {formatClock(offset.timelineEndSeconds * 1000)}</span>
                            <span className="rounded-full border border-[#ead8b6] bg-[#fffaf0] px-2 py-0.5 font-black uppercase tracking-wide">{offset.status}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4 max-h-52 space-y-2 overflow-y-auto pr-1">
                    {tracks.map((track) => (
                      <div key={track.id} className="rounded-2xl border border-[#ead8b6] bg-white p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                              <div className="truncate text-sm font-black">
                              {track.trackId ?? "A1"} {track.kind ? `(${track.kind})` : ""} / {track.name}
                            </div>
                            <div className="mt-1 text-xs text-[#7a6447]">
                              {track.source} / {formatBytes(track.size)} / {track.type || "unknown"}
                              {track.recordedSessionStartMs !== undefined ? ` / spine ${formatClock(track.recordedSessionStartMs)} → ${formatClock(track.recordedSessionEndMs ?? track.recordedSessionStartMs + resolveTrackWindowDurationMs(track))}` : ""}
                              {track.recordedStartAt ? ` / ${formatRecordingTimestamp(track.recordedStartAt)} → ${track.recordedEndAt ? formatRecordingTimestamp(track.recordedEndAt) : "..."}` : ""}
                              {track.uploadState ? ` / ${track.uploadState}` : ""}
                              {track.uploadMessage ? ` / ${track.uploadMessage}` : ""}
                            </div>
                            {track.sourceUrl ? (
                              <a
                                href={track.sourceUrl}
                                className="mt-1 inline-block max-w-full truncate text-[10px] text-[#7b4f1f] underline decoration-dotted hover:text-[#59380f]"
                                title={track.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                open source
                              </a>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-3xl border border-[#dfcaa5] bg-[#fffaf0] p-5 shadow-sm">
                  <div className="text-xs font-black uppercase tracking-[0.22em] text-[#b07328]">Session contract</div>
                  <h2 className="mt-1 text-xl font-black">What the editor gets</h2>
                  <div className="mt-4 space-y-3 text-sm leading-6 text-[#5f4c34]">
                    <p><strong>Audio tracks:</strong> local recording plus attached files.</p>
                    <p><strong>Event ledger:</strong> good lines, retakes, show notes, and edit points with timestamps.</p>
                    <p><strong>Clip stack:</strong> YouTube URLs and start/end ranges logged against the recording clock.</p>
                    <p><strong>Editor handoff:</strong> session offsets stack broken takes end-to-end while wall-clock timestamps stay available for later sync.</p>
                  </div>
                </div>
              </div>
            </section>

            <aside className="space-y-5">
              <section className="rounded-3xl border border-[#dfcaa5] bg-[#fffaf0] p-4 shadow-sm">
                <div className="mb-3">
                  <div className="text-xs font-black uppercase tracking-[0.22em] text-[#b07328]">Hardware</div>
                  <h2 className="mt-1 text-xl font-black">Input & Pro Mode</h2>
                </div>
                <div className="space-y-4 text-sm text-[#5f4c34]">
                  <div>
                    <label className="mb-1.5 block font-bold">Microphone</label>
                    <select
                      value={selectedAudioDeviceId}
                      onChange={(e) => setSelectedAudioDeviceId(e.target.value)}
                      className="w-full rounded-xl border border-[#e8d5b5] bg-white px-3 py-2 outline-none focus:border-[#d4a055] focus:ring-1 focus:ring-[#d4a055]"
                    >
                      <option value="default">System Default</option>
                      {devices.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || `Microphone (${d.deviceId.slice(0, 5)}...)`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2 border-t border-[#e8d5b5] pt-3">
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={echoCancellation}
                        onChange={(e) => setEchoCancellation(e.target.checked)}
                        className="rounded border-[#e8d5b5] text-[#b07328] focus:ring-[#b07328]"
                      />
                      <span className="select-none font-medium">Echo Cancellation</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={noiseSuppression}
                        onChange={(e) => setNoiseSuppression(e.target.checked)}
                        className="rounded border-[#e8d5b5] text-[#b07328] focus:ring-[#b07328]"
                      />
                      <span className="select-none font-medium">Noise Suppression</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={autoGainControl}
                        onChange={(e) => setAutoGainControl(e.target.checked)}
                        className="rounded border-[#e8d5b5] text-[#b07328] focus:ring-[#b07328]"
                      />
                      <span className="select-none font-medium">Auto Gain Control</span>
                    </label>
                  </div>
                  <p className="text-xs opacity-75">
                    Disable toggles if you are in a treated room using a professional XLR microphone to capture uncompressed audio.
                  </p>
                </div>
              </section>

              <section className="rounded-3xl border border-[#dfcaa5] bg-[#fffaf0] p-4 shadow-sm">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.22em] text-[#b07328]">Clip stack</div>
                    <h2 className="mt-1 text-xl font-black">Play and log cues</h2>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={addClip}
                      className="rounded-full border border-[#d7bd8f] bg-white px-3 py-1.5 text-xs font-black text-[#5d4528] hover:bg-[#fff4db]"
                    >
                      Add clip
                    </button>
                    <button
                      type="button"
                      onClick={loadYouTubeDummyClip}
                      className="rounded-full border border-[#f2b65a] bg-white px-3 py-1.5 text-xs font-black text-[#8b520d] hover:bg-[#fff2d2]"
                    >
                      Load YouTube dummy clip
                    </button>
                  </div>
                </div>

                <div className="aspect-video overflow-hidden rounded-2xl border border-[#e2c99d] bg-[#1f1710]">
                  {previewUrl ? (
                    <iframe
                      key={`${activeClip?.id}-${activeSegment?.id}-${playNonce}`}
                      src={previewUrl}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      className="h-full w-full"
                      title="Clip preview"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center p-6 text-center text-sm leading-6 text-[#d9c7a7]">
                      Paste a YouTube URL into a clip to preview timed segments here.
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={playAndLogSegment}
                  disabled={!previewUrl}
                  className="mt-3 w-full rounded-2xl bg-[#2f2418] px-4 py-3 text-sm font-black uppercase tracking-wide text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isRecording ? "Play active segment and log event" : "Play clip end-to-end"}
                </button>

                <div className="mt-4 max-h-[46vh] space-y-3 overflow-y-auto pr-1">
                  {clips.map((clip, clipIndex) => (
                    <div
                      key={clip.id}
                      className={`rounded-2xl border p-3 ${
                        activeClip?.id === clip.id ? "border-[#c5862e] bg-[#fff2d5]" : "border-[#ead8b6] bg-white"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setActiveClipId(clip.id);
                          setActiveSegmentId(clip.segments[0]?.id ?? "");
                        }}
                        className="mb-2 text-left text-xs font-black uppercase tracking-[0.18em] text-[#9b6927]"
                      >
                        Clip {clipIndex + 1}
                      </button>
                      <input
                        value={clip.title}
                        onChange={(event) => updateClip(clip.id, { title: event.target.value })}
                        className="mb-2 w-full rounded-xl border border-[#e4cfaa] bg-white px-3 py-2 text-sm font-bold outline-none focus:border-[#c0832d]"
                        placeholder="Clip title"
                      />
                      <input
                        value={clip.url}
                        onChange={(event) => updateClip(clip.id, { url: event.target.value })}
                        className="mb-3 w-full rounded-xl border border-[#e4cfaa] bg-white px-3 py-2 text-xs outline-none focus:border-[#c0832d]"
                        placeholder="https://youtube.com/watch?v=..."
                      />

                      <div className="space-y-2">
                        {clip.segments.map((segment, segmentIndex) => (
                          <div
                            key={segment.id}
                            className={`rounded-xl border p-2 ${
                              activeSegment?.id === segment.id ? "border-[#c5862e] bg-white" : "border-[#eddcbe] bg-[#fffaf0]"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setActiveClipId(clip.id);
                                setActiveSegmentId(segment.id);
                              }}
                              className="mb-2 text-left text-[11px] font-black uppercase tracking-[0.16em] text-[#8f6d38]"
                            >
                              Segment {segmentIndex + 1}
                            </button>
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                value={segment.start}
                                onChange={(event) => updateSegment(clip.id, segment.id, { start: event.target.value })}
                                className="rounded-lg border border-[#e4cfaa] bg-white px-2 py-2 text-xs outline-none focus:border-[#c0832d]"
                                placeholder="start"
                              />
                              <input
                                value={segment.end}
                                onChange={(event) => updateSegment(clip.id, segment.id, { end: event.target.value })}
                                className="rounded-lg border border-[#e4cfaa] bg-white px-2 py-2 text-xs outline-none focus:border-[#c0832d]"
                                placeholder="end"
                              />
                            </div>
                            <input
                              value={segment.note}
                              onChange={(event) => updateSegment(clip.id, segment.id, { note: event.target.value })}
                              className="mt-2 w-full rounded-lg border border-[#e4cfaa] bg-white px-2 py-2 text-xs outline-none focus:border-[#c0832d]"
                              placeholder="why this segment matters"
                            />
                            <button
                              type="button"
                              onClick={() => removeSegment(clip.id, segment.id)}
                              className="mt-2 text-[11px] font-bold text-[#9d4b28] hover:underline"
                            >
                              Remove segment
                            </button>
                          </div>
                        ))}
                      </div>

                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => addSegment(clip.id)}
                          className="rounded-full border border-[#d7bd8f] bg-white px-3 py-1.5 text-[11px] font-black text-[#5d4528] hover:bg-[#fff4db]"
                        >
                          Add segment
                        </button>
                        <button
                          type="button"
                          onClick={() => removeClip(clip.id)}
                          className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-[11px] font-black text-red-700 hover:bg-red-100"
                        >
                          Remove clip
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-3xl border border-[#dfcaa5] bg-[#fffaf0] p-4 shadow-sm">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.22em] text-[#b07328]">Edit ledger</div>
                    <h2 className="mt-1 text-xl font-black">Timestamped events</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEvents([])}
                    className="rounded-full border border-[#ead8b6] bg-white px-3 py-1.5 text-xs font-black text-[#7a4d1b] hover:bg-[#fff4db]"
                  >
                    Clear
                  </button>
                </div>

                <div className="max-h-[38vh] space-y-2 overflow-y-auto pr-1">
                  {events.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[#dcc49c] bg-white/70 p-5 text-sm leading-6 text-[#755d3b]">
                      Events appear here as you record, mark beats, and play clips.
                    </div>
                  ) : (
                    events.map((event) => (
                      <div key={event.id} className="rounded-2xl border border-[#ead8b6] bg-white p-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="rounded-full bg-[#f4e3c2] px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#7b5422]">
                            {event.kind}
                          </span>
                          <span className="font-mono text-xs font-black text-[#9b6927]">{formatClock(event.atMs)}</span>
                        </div>
                        <div className="mt-2 text-sm font-black">{event.label}</div>
                        {event.note ? <div className="mt-1 text-xs leading-5 text-[#745d3f]">{event.note}</div> : null}
                      </div>
                    ))
                  )}
                </div>
              </section>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
