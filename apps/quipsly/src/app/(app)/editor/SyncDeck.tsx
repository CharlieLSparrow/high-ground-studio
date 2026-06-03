"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type TimelineClip = {
  id: string;
  assetId: string;
  kind?: "audio" | "video";
  trackId: string;
  startIn: number;
  duration: number;
  sourceStart: number;
  sourceEnd?: number;
  name: string;
  color?: string;
};

type RecordingTrack = {
  id?: string;
  name?: string;
  kind?: "audio" | "video";
  type?: string;
  trackId?: string;
  sourceId?: string;
  sourceUrl?: string;
  durationMs?: number;
  recordedSessionStartMs?: number;
  recordedSessionEndMs?: number;
};

type ClipCue = {
  id?: string;
  title?: string;
  url?: string;
  segments?: Array<{ id?: string; start?: string; end?: string; note?: string }>;
};

type ProductionPayload = {
  ok?: boolean;
  mode?: string;
  title?: string;
  projectSlug?: string;
  slug?: string;
  recordingRoomJson?: unknown;
  timelineJson?: unknown;
  updatedAt?: string;
};

type SyncSource = {
  id: string;
  title: string;
  role: "program" | "recording" | "clip-cue";
  kind: "audio" | "video";
  trackId: string;
  sourceUrl: string;
  timelineStart: number;
  timelineEnd: number;
  sourceStart: number;
  sourceEnd: number;
  color: string;
};

type MediaPreviewProps = {
  active: boolean;
  kind: "audio" | "video";
  sourceTime: number;
  sourceUrl: string;
  title: string;
};

const DEFAULT_PROJECT_SLUG = "quipsly-dev-lab";
const DEFAULT_EPISODE_SLUG = "episode-8";
const DEFAULT_SYNC_DURATION_SECONDS = 90;
const MIN_SYNC_DURATION_SECONDS = 0.25;
const DEFAULT_SOURCE_CUT_SECONDS = 6;
const SOURCE_CUT_DURATION_OPTIONS = [3, 6, 10, 30];

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asArray<T>(value: unknown) {
  return Array.isArray(value) ? (value as T[]) : [];
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function roundTime(value: number) {
  return Number(Math.max(0, value).toFixed(3));
}

function formatClock(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hours) return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function parseTimeToSeconds(value: string | undefined) {
  const clean = (value ?? "").trim();
  if (!clean) return 0;
  if (/^\d+(\.\d+)?$/.test(clean)) return Number(clean);
  const parts = clean.split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function unwrapJsonPayload(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      return unwrapJsonPayload(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return asRecord(value) ?? {};
}

function getRouteParams() {
  if (typeof window === "undefined") {
    return { projectSlug: DEFAULT_PROJECT_SLUG, episodeSlug: DEFAULT_EPISODE_SLUG };
  }
  const params = new URLSearchParams(window.location.search);
  return {
    projectSlug: params.get("project") || params.get("projectSlug") || DEFAULT_PROJECT_SLUG,
    episodeSlug: params.get("episode") || params.get("episodeSlug") || params.get("boundary") || DEFAULT_EPISODE_SLUG,
  };
}

function sourceUrlForTrack(track: RecordingTrack) {
  if (track.sourceId) return `/api/ingest/media/${track.sourceId}`;
  return track.sourceUrl ?? "";
}

function inferKind(value: unknown, trackId: string): "audio" | "video" {
  const raw = stringValue(value).toLowerCase();
  if (raw === "video" || trackId.toUpperCase().startsWith("V")) return "video";
  return "audio";
}

function normalizeTimelineClips(payload: unknown): TimelineClip[] {
  const record = unwrapJsonPayload(payload);
  const nestedTimeline = unwrapJsonPayload(record.timeline);
  const nestedData = unwrapJsonPayload(record.data);
  const clips = asArray<unknown>(record.timelineClips).length
    ? asArray<unknown>(record.timelineClips)
    : asArray<unknown>(nestedTimeline.timelineClips).length
      ? asArray<unknown>(nestedTimeline.timelineClips)
      : asArray<unknown>(nestedData.timelineClips);

  return clips.map((clip, index) => {
    const recordClip = asRecord(clip) ?? {};
    const trackId = stringValue(recordClip.trackId, index % 2 === 0 ? "V1" : "A1");
    const startIn = roundTime(numberValue(recordClip.startIn, 0));
    const duration = Math.max(MIN_SYNC_DURATION_SECONDS, numberValue(recordClip.duration, 4));
    const sourceStart = roundTime(numberValue(recordClip.sourceStart, 0));
    const sourceEnd = roundTime(numberValue(recordClip.sourceEnd, sourceStart + duration));
    return {
      id: stringValue(recordClip.id, `clip-${index}`),
      assetId: stringValue(recordClip.assetId),
      kind: inferKind(recordClip.kind, trackId),
      trackId,
      startIn,
      duration,
      sourceStart,
      sourceEnd,
      name: stringValue(recordClip.name, `Timeline clip ${index + 1}`),
      color: stringValue(recordClip.color, trackId.startsWith("A") ? "#047857" : "#2563eb"),
    };
  });
}

function normalizeTimelineTranscript(payload: unknown) {
  const record = unwrapJsonPayload(payload);
  const nestedTimeline = unwrapJsonPayload(record.timeline);
  const nestedData = unwrapJsonPayload(record.data);
  return asArray<unknown>(record.transcript).length
    ? asArray<unknown>(record.transcript)
    : asArray<unknown>(nestedTimeline.transcript).length
      ? asArray<unknown>(nestedTimeline.transcript)
      : asArray<unknown>(nestedData.transcript);
}

function normalizeRecordingTracks(payload: unknown): RecordingTrack[] {
  const record = unwrapJsonPayload(payload);
  return asArray<unknown>(record.tracks).map((track, index) => {
    const trackRecord = asRecord(track) ?? {};
    const trackId = stringValue(trackRecord.trackId, `A${index + 1}`);
    return {
      id: stringValue(trackRecord.id, `track-${index}`),
      name: stringValue(trackRecord.name, `Recording track ${index + 1}`),
      kind: inferKind(trackRecord.kind ?? trackRecord.type, trackId),
      type: stringValue(trackRecord.type),
      trackId,
      sourceId: stringValue(trackRecord.sourceId),
      sourceUrl: stringValue(trackRecord.sourceUrl),
      durationMs: numberValue(trackRecord.durationMs, 0),
      recordedSessionStartMs: Number.isFinite(Number(trackRecord.recordedSessionStartMs)) ? Number(trackRecord.recordedSessionStartMs) : undefined,
      recordedSessionEndMs: Number.isFinite(Number(trackRecord.recordedSessionEndMs)) ? Number(trackRecord.recordedSessionEndMs) : undefined,
    };
  });
}

function normalizeClipCues(payload: unknown): ClipCue[] {
  const record = unwrapJsonPayload(payload);
  return asArray<unknown>(record.clips).map((clip, index) => {
    const clipRecord = asRecord(clip) ?? {};
    return {
      id: stringValue(clipRecord.id, `cue-${index}`),
      title: stringValue(clipRecord.title, `Cue ${index + 1}`),
      url: stringValue(clipRecord.url),
      segments: asArray<unknown>(clipRecord.segments).map((segment, segmentIndex) => {
        const segmentRecord = asRecord(segment) ?? {};
        return {
          id: stringValue(segmentRecord.id, `cue-${index}-segment-${segmentIndex}`),
          start: stringValue(segmentRecord.start),
          end: stringValue(segmentRecord.end),
          note: stringValue(segmentRecord.note, `Segment ${segmentIndex + 1}`),
        };
      }),
    };
  });
}

function timelineSourcesFromClips(clips: TimelineClip[]): SyncSource[] {
  return clips
    .filter((clip) => clip.assetId)
    .map((clip) => {
      const timelineStart = clip.startIn;
      const duration = Math.max(MIN_SYNC_DURATION_SECONDS, clip.duration);
      const sourceStart = clip.sourceStart;
      const sourceEnd = clip.sourceEnd ?? sourceStart + duration;
      return {
        id: `program-${clip.id}`,
        title: clip.name,
        role: "program",
        kind: clip.kind ?? (clip.trackId.startsWith("A") ? "audio" : "video"),
        trackId: clip.trackId,
        sourceUrl: clip.assetId,
        timelineStart,
        timelineEnd: roundTime(timelineStart + duration),
        sourceStart,
        sourceEnd,
        color: clip.color ?? "#2563eb",
      };
    });
}

function recordingSourcesFromTracks(tracks: RecordingTrack[]): SyncSource[] {
  return tracks
    .map((track, index) => {
      const sourceUrl = sourceUrlForTrack(track);
      if (!sourceUrl) return null;
      const timelineStart = Math.max(0, numberValue(track.recordedSessionStartMs, 0) / 1000);
      const explicitEnd = numberValue(track.recordedSessionEndMs, 0) / 1000;
      const duration = Math.max(
        MIN_SYNC_DURATION_SECONDS,
        explicitEnd > timelineStart ? explicitEnd - timelineStart : numberValue(track.durationMs, 0) / 1000 || DEFAULT_SYNC_DURATION_SECONDS,
      );
      const source: SyncSource = {
        id: `recording-${track.id ?? index}`,
        title: track.name ?? `Recording ${index + 1}`,
        role: "recording",
        kind: track.kind ?? inferKind(track.type, track.trackId ?? "A1"),
        trackId: track.trackId ?? `A${index + 1}`,
        sourceUrl,
        timelineStart,
        timelineEnd: roundTime(timelineStart + duration),
        sourceStart: 0,
        sourceEnd: roundTime(duration),
        color: track.trackId?.startsWith("V") ? "#2563eb" : "#047857",
      };
      return source;
    })
    .filter((source): source is SyncSource => source !== null);
}

function cueSourcesFromClipStack(cues: ClipCue[]): SyncSource[] {
  let cursor = 0;
  const sources: SyncSource[] = [];

  cues.forEach((cue, cueIndex) => {
    const segments = cue.segments?.length ? cue.segments : [{ id: `${cue.id ?? cueIndex}-fallback`, start: "0", end: "8", note: "Full cue" }];
    segments.forEach((segment, segmentIndex) => {
      const sourceStart = parseTimeToSeconds(segment.start);
      const rawSourceEnd = parseTimeToSeconds(segment.end);
      const sourceEnd = rawSourceEnd > sourceStart ? rawSourceEnd : sourceStart + 8;
      const duration = Math.max(MIN_SYNC_DURATION_SECONDS, sourceEnd - sourceStart);
      const timelineStart = cursor;
      cursor += duration;
      sources.push({
        id: `cue-${cue.id ?? cueIndex}-${segment.id ?? segmentIndex}`,
        title: `${cue.title ?? "Clip cue"}${segment.note ? ` - ${segment.note}` : ""}`,
        role: "clip-cue",
        kind: "video",
        trackId: `V${cueIndex + 1}`,
        sourceUrl: cue.url ?? "",
        timelineStart: roundTime(timelineStart),
        timelineEnd: roundTime(timelineStart + duration),
        sourceStart,
        sourceEnd,
        color: "#b45309",
      });
    });
  });

  return sources.filter((source) => source.sourceUrl);
}

function sourceTimeAt(source: SyncSource, playhead: number) {
  const duration = Math.max(MIN_SYNC_DURATION_SECONDS, source.timelineEnd - source.timelineStart);
  const progress = clamp((playhead - source.timelineStart) / duration, 0, 1);
  return roundTime(source.sourceStart + progress * (source.sourceEnd - source.sourceStart));
}

function isSourceActive(source: SyncSource, playhead: number) {
  return playhead >= source.timelineStart && playhead <= source.timelineEnd;
}

function timelineEnd(clips: TimelineClip[]) {
  return clips.reduce((max, clip) => Math.max(max, clip.startIn + clip.duration), 0);
}

function makeCutClipFromSource(source: SyncSource, playhead: number, existingClips: TimelineClip[], cutDurationSeconds: number): TimelineClip {
  const sourceStart = sourceTimeAt(source, playhead);
  const remainingSourceSeconds = Math.max(MIN_SYNC_DURATION_SECONDS, source.sourceEnd - sourceStart);
  const duration = roundTime(Math.min(Math.max(MIN_SYNC_DURATION_SECONDS, cutDurationSeconds), remainingSourceSeconds));
  const startIn = roundTime(timelineEnd(existingClips));
  const trackPrefix = source.kind === "video" ? "V" : "A";
  const trackId = source.trackId?.startsWith(trackPrefix) ? source.trackId : `${trackPrefix}1`;

  return {
    id: `sync-cut-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    assetId: source.sourceUrl,
    kind: source.kind,
    trackId,
    startIn,
    duration,
    sourceStart,
    sourceEnd: roundTime(sourceStart + duration),
    name: `${source.title} / cut ${formatClock(sourceStart)}`,
    color: source.kind === "video" ? "#2563eb" : "#047857",
  };
}

function timelineContentFingerprint(clips: TimelineClip[], transcript: unknown[]) {
  return JSON.stringify({
    clips: [...clips]
      .map((clip) => ({
        id: clip.id,
        assetId: clip.assetId,
        trackId: clip.trackId,
        startIn: roundTime(clip.startIn),
        duration: roundTime(clip.duration),
        sourceStart: roundTime(clip.sourceStart),
        sourceEnd: roundTime(clip.sourceEnd ?? clip.sourceStart + clip.duration),
        name: clip.name,
        color: clip.color ?? "",
        kind: clip.kind ?? (clip.trackId.startsWith("A") ? "audio" : "video"),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    transcript,
  });
}

function isYouTubeUrl(url: string) {
  return /(?:youtube\.com|youtu\.be)/i.test(url);
}

function getYouTubeId(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) return parsed.pathname.replace("/", "");
    if (parsed.searchParams.get("v")) return parsed.searchParams.get("v") ?? "";
    const embedMatch = /\/embed\/([^/?]+)/.exec(parsed.pathname);
    return embedMatch?.[1] ?? "";
  } catch {
    return "";
  }
}

function buildYouTubeEmbedUrl(url: string, sourceTime: number) {
  const id = getYouTubeId(url);
  if (!id) return "";
  const start = Math.max(0, Math.floor(sourceTime));
  return `https://www.youtube.com/embed/${id}?start=${start}&playsinline=1&rel=0&modestbranding=1`;
}

function MediaPreview({ active, kind, sourceTime, sourceUrl, title }: MediaPreviewProps) {
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const roundedSourceTime = Math.max(0, Math.floor(sourceTime));
  const youtubeUrl = isYouTubeUrl(sourceUrl) ? buildYouTubeEmbedUrl(sourceUrl, roundedSourceTime) : "";

  useEffect(() => {
    const media = mediaRef.current;
    if (!media || youtubeUrl) return;
    if (Math.abs(media.currentTime - sourceTime) > 0.35) {
      media.currentTime = sourceTime;
    }
  }, [sourceTime, youtubeUrl]);

  if (youtubeUrl) {
    return (
      <iframe
        key={`${youtubeUrl}-${active ? "active" : "idle"}`}
        title={title}
        src={youtubeUrl}
        className="aspect-video w-full rounded-2xl border border-white/10 bg-black"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    );
  }

  if (!sourceUrl) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-2xl border border-dashed border-white/15 bg-black/30 text-xs font-bold text-white/50">
        No source URL
      </div>
    );
  }

  if (kind === "audio") {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/40 p-3">
        <audio ref={(node) => { mediaRef.current = node; }} controls preload="metadata" src={sourceUrl} className="w-full" />
      </div>
    );
  }

  return (
    <video
      ref={(node) => { mediaRef.current = node; }}
      controls
      muted
      preload="metadata"
      src={sourceUrl}
      className="aspect-video w-full rounded-2xl border border-white/10 bg-black object-contain"
    />
  );
}

export function SyncDeck() {
  const [{ projectSlug, episodeSlug }, setRouteState] = useState(() => getRouteParams());
  const [payload, setPayload] = useState<ProductionPayload | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [cutDurationSeconds, setCutDurationSeconds] = useState(DEFAULT_SOURCE_CUT_SECONDS);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error" | "conflict">("idle");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    setRouteState(getRouteParams());
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    setError(null);

    void fetch("/api/episode-production", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ensure", projectSlug, episodeSlug }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error ?? `Episode production returned ${response.status}`);
        setPayload(data);
        setStatus("ready");
      })
      .catch((fetchError) => {
        if (controller.signal.aborted) return;
        setError(fetchError instanceof Error ? fetchError.message : "Could not load sync deck");
        setStatus("error");
      });

    return () => controller.abort();
  }, [episodeSlug, projectSlug]);

  const timelineClips = useMemo(() => normalizeTimelineClips(payload?.timelineJson), [payload?.timelineJson]);

  const syncSources = useMemo(() => {
    if (!payload) return [];
    const roomTracks = normalizeRecordingTracks(payload.recordingRoomJson);
    const clipCues = normalizeClipCues(payload.recordingRoomJson);

    const allSources = [
      ...timelineSourcesFromClips(timelineClips),
      ...recordingSourcesFromTracks(roomTracks),
      ...cueSourcesFromClipStack(clipCues),
    ];

    const seen = new Set<string>();
    return allSources.filter((source) => {
      const key = `${source.role}:${source.sourceUrl}:${source.timelineStart}:${source.timelineEnd}:${source.sourceStart}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [payload, timelineClips]);

  const duration = useMemo(() => {
    const lastSourceEnd = syncSources.reduce((max, source) => Math.max(max, source.timelineEnd), 0);
    return Math.max(DEFAULT_SYNC_DURATION_SECONDS, Math.ceil(lastSourceEnd));
  }, [syncSources]);

  const activeProgram = syncSources.find((source) => source.role === "program" && isSourceActive(source, playhead));
  const visibleSources = syncSources.length ? syncSources : [];
  const syncCutCount = timelineClips.filter((clip) => clip.id.startsWith("sync-cut-")).length;

  const saveTimelineClips = async (args: {
    nextTimelineClips: TimelineClip[];
    generatedFrom: string;
    busyMessage: string;
    savedMessage: string;
  }) => {
    if (!payload || saveStatus === "saving") return;

    const transcript = normalizeTimelineTranscript(payload.timelineJson);
    const contentFingerprint = timelineContentFingerprint(args.nextTimelineClips, transcript);
    const expectedTimelineFingerprint = stringValue(asRecord(payload.timelineJson)?.contentFingerprint);
    const timelineJson = {
      payloadVersion: 2,
      projectSlug,
      episodeSlug,
      source: "sync-deck",
      timelineClips: args.nextTimelineClips,
      transcript,
      contentFingerprint,
      generatedFrom: args.generatedFrom,
      savedAt: new Date().toISOString(),
    };

    setSaveStatus("saving");
    setSaveMessage(args.busyMessage);

    try {
      const response = await fetch("/api/episode-production", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save-timeline",
          projectSlug,
          episodeSlug,
          expectedTimelineFingerprint: expectedTimelineFingerprint || undefined,
          timelineJson,
        }),
      });
      const data = await response.json();

      if (!response.ok || data?.mode === "conflict") {
        setPayload((current) => ({
          ...(current ?? {}),
          ...(asRecord(data) ?? {}),
        }));
        setSaveStatus(data?.mode === "conflict" ? "conflict" : "error");
        setSaveMessage(data?.message ?? "Timeline save needs a refresh before retrying.");
        return;
      }

      setPayload((current) => ({
        ...(current ?? {}),
        ...(asRecord(data) ?? {}),
        timelineJson: data?.timelineJson ?? timelineJson,
      }));
      window.dispatchEvent(
        new CustomEvent("quipsly:timeline-json-saved", {
          detail: {
            timelineJson: data?.timelineJson ?? timelineJson,
            state: data,
          },
        }),
      );
      setSaveStatus("saved");
      setSaveMessage(args.savedMessage);
      window.setTimeout(() => {
        setSaveStatus("idle");
        setSaveMessage(null);
      }, 2500);
    } catch (saveError) {
      setSaveStatus("error");
      setSaveMessage(saveError instanceof Error ? saveError.message : "Timeline save failed.");
    }
  };

  const appendCutFromSource = async (source: SyncSource) => {
    const nextClip = makeCutClipFromSource(source, playhead, timelineClips, cutDurationSeconds);
    await saveTimelineClips({
      nextTimelineClips: [...timelineClips, nextClip],
      generatedFrom: `sync-deck:${source.role}`,
      busyMessage: `Adding ${formatClock(nextClip.duration)} from ${source.title} at ${formatClock(nextClip.sourceStart)}...`,
      savedMessage: `Added cut to timeline at ${formatClock(nextClip.startIn)}.`,
    });
  };

  const undoLastSyncDeckCut = async () => {
    const lastSyncCut = [...timelineClips].reverse().find((clip) => clip.id.startsWith("sync-cut-"));
    if (!lastSyncCut) return;
    await saveTimelineClips({
      nextTimelineClips: timelineClips.filter((clip) => clip.id !== lastSyncCut.id),
      generatedFrom: "sync-deck:undo-last-cut",
      busyMessage: `Removing last Sync Deck cut: ${lastSyncCut.name}...`,
      savedMessage: `Removed last Sync Deck cut: ${lastSyncCut.name}.`,
    });
  };

  return (
    <section className="rounded-[2rem] border border-[#d7c3a1] bg-[#17120d] p-4 text-[#fff4db] shadow-xl">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.24em] text-[#d9b36e]">Sync Deck</div>
          <h2 className="mt-1 text-2xl font-black">Scrub every synced source, play the edit</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#d8c6a6]">
            Program playback stays edited. Scrub mode exposes the whole source room: recorder takes, clip cues, and timeline media follow the same episode spine.
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#d9b36e]">Playhead</div>
          <div className="mt-1 font-mono text-2xl font-black">{formatClock(playhead)}</div>
          <label className="mt-3 block text-[10px] font-black uppercase tracking-[0.18em] text-[#d9b36e]">
            Cut length
            <select
              value={cutDurationSeconds}
              onChange={(event) => setCutDurationSeconds(Number(event.target.value))}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/35 px-2 py-1.5 text-xs font-black text-[#fff4db] outline-none"
            >
              {SOURCE_CUT_DURATION_OPTIONS.map((seconds) => (
                <option key={seconds} value={seconds}>{seconds}s</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={saveStatus === "saving" || syncCutCount === 0}
            onClick={undoLastSyncDeckCut}
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/25 px-2 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#ffe5b3] transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Undo last cut ({syncCutCount})
          </button>
        </div>
      </div>

      {saveMessage ? (
        <div
          className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-bold ${
            saveStatus === "saved"
              ? "border-emerald-400/40 bg-emerald-950/40 text-emerald-100"
              : saveStatus === "error" || saveStatus === "conflict"
                ? "border-red-400/40 bg-red-950/40 text-red-100"
                : "border-amber-300/40 bg-amber-950/30 text-amber-100"
          }`}
        >
          {saveMessage}
        </div>
      ) : null}

      <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-3">
        <input
          type="range"
          min={0}
          max={duration}
          step={0.05}
          value={playhead}
          onChange={(event) => setPlayhead(Number(event.target.value))}
          className="w-full accent-[#f2b35b]"
          aria-label="Sync deck playhead"
        />
        <div className="mt-2 flex justify-between text-[10px] font-black uppercase tracking-[0.18em] text-[#a98c5b]">
          <span>0:00</span>
          <span>{formatClock(duration)}</span>
        </div>
      </div>

      {status === "loading" ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/10 p-4 text-sm text-[#d8c6a6]">Loading synced sources...</div>
      ) : null}

      {status === "error" ? (
        <div className="mt-4 rounded-2xl border border-red-400/40 bg-red-950/40 p-4 text-sm text-red-100">
          Sync deck could not load: {error}
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <div className="rounded-3xl border border-white/10 bg-white/8 p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#d9b36e]">Program monitor</div>
              <div className="text-sm font-black">{activeProgram?.title ?? "No edited clip active at this playhead"}</div>
            </div>
            <div className="text-right font-mono text-xs text-[#d8c6a6]">
              {activeProgram ? `${activeProgram.trackId} / source ${formatClock(sourceTimeAt(activeProgram, playhead))}` : "scrub to an edit"}
            </div>
          </div>
          {activeProgram ? (
            <MediaPreview
              active
              kind={activeProgram.kind}
              sourceTime={sourceTimeAt(activeProgram, playhead)}
              sourceUrl={activeProgram.sourceUrl}
              title={activeProgram.title}
            />
          ) : (
            <div className="flex aspect-video items-center justify-center rounded-2xl border border-dashed border-white/15 bg-black/40 text-sm font-bold text-white/50">
              Edited output appears here when the playhead lands on a timeline clip.
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/8 p-3">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#d9b36e]">Source room</div>
          <div className="mt-2 max-h-[28rem] space-y-3 overflow-y-auto pr-1">
            {visibleSources.length ? visibleSources.map((source) => {
              const active = isSourceActive(source, playhead);
              const sourceTime = sourceTimeAt(source, playhead);
              return (
                <article
                  key={source.id}
                  className={`rounded-2xl border p-3 transition-colors ${
                    active ? "border-[#f2b35b] bg-[#f2b35b]/15" : "border-white/10 bg-black/20"
                  }`}
                >
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black">{source.title}</div>
                      <div className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#d9b36e]">
                        {source.role} / {source.trackId} / {source.kind}
                      </div>
                    </div>
                    <div className="shrink-0 text-right font-mono text-xs text-[#d8c6a6]">
                      <div>{formatClock(source.timelineStart)}-{formatClock(source.timelineEnd)}</div>
                      <div>src {formatClock(sourceTime)}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={saveStatus === "saving"}
                    onClick={() => appendCutFromSource(source)}
                    className="mb-2 rounded-full border border-[#f2b35b]/50 bg-[#f2b35b]/15 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-[#ffe5b3] transition-colors hover:bg-[#f2b35b]/25 disabled:cursor-wait disabled:opacity-50"
                  >
                    Cut this moment into timeline
                  </button>
                  <MediaPreview
                    active={active}
                    kind={source.kind}
                    sourceTime={sourceTime}
                    sourceUrl={source.sourceUrl}
                    title={source.title}
                  />
                </article>
              );
            }) : (
              <div className="rounded-2xl border border-dashed border-white/15 bg-black/25 p-4 text-sm text-[#d8c6a6]">
                No synced sources yet. Record or upload takes in the recorder, then reopen the editor.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
