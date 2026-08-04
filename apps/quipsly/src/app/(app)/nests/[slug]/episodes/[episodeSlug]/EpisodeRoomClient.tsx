"use client";

import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  Film,
  Gauge,
  Loader2,
  Mic2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Search,
  Scissors,
  ShieldCheck,
  Trash2,
  Upload,
  Waves,
} from "lucide-react";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import LocalDateTime from "@/components/LocalDateTime";
import { LiveSessionRoom } from "@/components/live-session-room";
import { SessionThread } from "@/components/session-thread";
import {
  episodeRoomTimelineClips,
  episodeRoomTimelineIsCurrent,
  projectedEpisodeRoomPosition,
  type EpisodeRoomClip,
  type EpisodeRoomState,
} from "@/lib/episode-room/episode-room-contract";
import {
  episodeWatchLiveHintFromRoom,
  type EpisodeWatchLiveHint,
} from "@/lib/episode-room/episode-watch-live";
import type {
  EpisodeRoomDeskPayload,
  EpisodeRoomImportedCandidate,
  EpisodeRoomRecordingSession,
  EpisodeRoomVaultCandidate,
  EpisodeRoomVaultSavedClip,
  EpisodeRoomWritingState,
} from "@/lib/server/episode-room-store";

import EpisodeRoomChat from "./EpisodeRoomChat";
import EpisodeProductionRunway from "./EpisodeProductionRunway";

type RoomResponse = {
  ok: boolean;
  error?: string;
  code?: string;
  currentRevision?: number;
  desk?: EpisodeRoomDeskPayload;
  room?: EpisodeRoomState;
  writing?: EpisodeRoomWritingState;
  importedCandidates?: EpisodeRoomImportedCandidate[];
  vaultCandidates?: EpisodeRoomVaultCandidate[];
  recordingSessions?: EpisodeRoomRecordingSession[];
  timelineClipCount?: number;
  updatedAt?: string;
};

type CommandDraft = {
  type:
    | "START_SESSION"
    | "ADD_CLIP"
    | "IMPORT_VAULT_ASSET"
    | "REMOVE_CLIP"
    | "SELECT_CLIP"
    | "PLAY"
    | "PAUSE"
    | "SEEK"
    | "ENDED"
    | "SYNC_TIMELINE";
  assetId?: string;
  mediaClipId?: string;
  clipId?: string;
  recordingRoomId?: string;
  positionSeconds?: number;
  fromPositionSeconds?: number;
};

function requestId(label: string) {
  return `${label}:${crypto.randomUUID()}`;
}

function formatClock(value: number) {
  const safe = Math.max(0, Number.isFinite(value) ? value : 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = Math.floor(safe % 60);
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatOffset(milliseconds: number | null) {
  if (milliseconds === null) return "Group offset pending";
  if (milliseconds === 0) return "Group baseline";
  const sign = milliseconds > 0 ? "+" : "−";
  const seconds = Math.abs(milliseconds) / 1_000;
  return `${sign}${seconds.toFixed(seconds < 10 ? 3 : 2)}s from baseline`;
}

function formatUncertainty(milliseconds: number | null) {
  if (milliseconds === null) return "uncertainty unavailable";
  return `±${milliseconds.toFixed(milliseconds < 10 ? 1 : 0)}ms clock uncertainty`;
}

function selectedClip(room: EpisodeRoomState) {
  return room.clips.find((clip) => clip.watchId === room.selectedClipId);
}

function activityLabel(room: EpisodeRoomState) {
  const receipt = room.lastCommand;
  if (!receipt) return "No shared playback commands yet";
  const action = receipt.command
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  return `${action} by ${receipt.actorLabel}`;
}

function isNativePlayable(clip: EpisodeRoomClip) {
  if (clip.playbackUrl.startsWith("/")) return true;
  try {
    const url = new URL(clip.playbackUrl);
    return /\.(mp4|m4v|mov|webm|mp3|wav|m4a|aac|ogg)(?:$|[?#])/i.test(url.pathname);
  } catch {
    return false;
  }
}

export default function EpisodeRoomClient({
  initialPayload,
}: {
  initialPayload: EpisodeRoomDeskPayload;
}) {
  const [room, setRoom] = useState(initialPayload.room);
  const roomRef = useRef(initialPayload.room);
  const [writing, setWriting] = useState(initialPayload.writing);
  const writingRef = useRef(initialPayload.writing);
  const [textBlocks, setTextBlocks] = useState(initialPayload.textBlocks);
  const [writingNotice, setWritingNotice] = useState("");
  const [candidates, setCandidates] = useState(initialPayload.importedCandidates);
  const [vaultCandidates, setVaultCandidates] = useState(initialPayload.vaultCandidates);
  const [vaultQuery, setVaultQuery] = useState("");
  const [vaultLoading, setVaultLoading] = useState(false);
  const [recordingSessions, setRecordingSessions] = useState(initialPayload.recordingSessions);
  const [selectedRecordingRoomId, setSelectedRecordingRoomId] = useState(
    initialPayload.room.session?.recordingRoomId
      || initialPayload.recordingSessions.find((session) => session.status === "RECORDING")?.id
      || initialPayload.recordingSessions[0]?.id
      || "",
  );
  const [timelineClipCount, setTimelineClipCount] = useState(initialPayload.timelineClipCount);
  const [status, setStatus] = useState<"idle" | "saving" | "uploading" | "error">("idle");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [episodeTextDraft, setEpisodeTextDraft] = useState("");
  const [displayPosition, setDisplayPosition] = useState(initialPayload.room.positionSeconds);
  const [clockNowMilliseconds, setClockNowMilliseconds] = useState(
    () => Date.parse(initialPayload.room.effectiveAt),
  );
  const [localDuration, setLocalDuration] = useState(initialPayload.room.durationSeconds ?? 0);
  const [localPlaybackBlocked, setLocalPlaybackBlocked] = useState(false);
  const [episodeWatchHint, setEpisodeWatchHint] = useState<EpisodeWatchLiveHint | null>(null);
  const [dragPosition, setDragPosition] = useState<number | null>(null);
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const rangeEndSentRef = useRef("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const projectSlug = initialPayload.project.slug;
  const episodeSlug = initialPayload.episode.slug;
  const canEdit = initialPayload.canEdit;
  const clip = useMemo(() => selectedClip(room), [room]);
  const endpoint = `/api/nests/${encodeURIComponent(projectSlug)}/episode-room`;
  const boundRecordingSession = room.session?.recordingRoomId
    ? recordingSessions.find(
      (session) => session.id === room.session?.recordingRoomId,
    ) || null
    : null;
  const sharedClockIsLive = !room.session?.recordingRoomId
    || boundRecordingSession?.status === "RECORDING";
  const recordingSession = recordingSessions.find((session) => session.id === selectedRecordingRoomId)
    || recordingSessions.find((session) => session.status === "RECORDING")
    || recordingSessions[0]
    || null;

  const refresh = useCallback(async (quiet = false) => {
    try {
      const params = new URLSearchParams({
        episode: episodeSlug,
        runtime: "1",
        writingVersion: writingRef.current.version,
      });
      const response = await fetch(`${endpoint}?${params}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as RoomResponse;
      if (!response.ok || !payload.ok || !payload.room) {
        throw new Error(payload.error || "Episode Room could not refresh.");
      }
      roomRef.current = payload.room;
      setRoom(payload.room);
      if (payload.writing) {
        const {
          textBlocks: refreshedTextBlocks,
          ...writingMetadata
        } = payload.writing;
        const writingChanged = writingMetadata.version !== writingRef.current.version;
        if (writingChanged && !refreshedTextBlocks) {
          throw new Error("Episode writing changed, but its refreshed snapshot was unavailable.");
        }
        writingRef.current = writingMetadata;
        setWriting(writingMetadata);
        if (refreshedTextBlocks) {
          setTextBlocks(refreshedTextBlocks);
          if (writingChanged) {
            setWritingNotice("Latest episode writing loaded from the shared manuscript.");
          }
        }
      }
      if (payload.importedCandidates) setCandidates(payload.importedCandidates);
      if (payload.recordingSessions) {
        setRecordingSessions(payload.recordingSessions);
        setSelectedRecordingRoomId((current) => (
          payload.recordingSessions?.some((session) => session.id === current)
            ? current
            : payload.room?.session?.recordingRoomId
              || payload.recordingSessions?.find((session) => session.status === "RECORDING")?.id
              || payload.recordingSessions?.[0]?.id
              || ""
        ));
      }
      if (typeof payload.timelineClipCount === "number") setTimelineClipCount(payload.timelineClipCount);
      if (!quiet) {
        setError("");
        setNotice("Room refreshed.");
      }
      return payload.room;
    } catch (nextError) {
      if (!quiet) {
        setError(nextError instanceof Error ? nextError.message : "Episode Room could not refresh.");
        setStatus("error");
      }
      return null;
    }
  }, [endpoint, episodeSlug]);

  const sendCommand = useCallback(async (
    draft: CommandDraft,
    options: { retryConflict?: boolean; success?: string } = {},
  ) => {
    if (!canEdit) return null;
    setStatus("saving");
    setError("");
    setNotice("");
    const clientRequestId = requestId(draft.type.toLowerCase());

    for (let attempt = 0; attempt < (options.retryConflict === false ? 1 : 2); attempt += 1) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          episodeSlug,
          ...draft,
          clientRequestId,
          expectedRevision: roomRef.current.revision,
        }),
      });
      const payload = await response.json().catch(() => ({})) as RoomResponse;
      if (response.status === 409 && attempt === 0) {
        const latestRoom = await refresh(true);
        if (latestRoom) continue;
      }
      if (!response.ok || !payload.ok || !payload.room) {
        const message = response.status === 409
          ? "Someone changed the room at the same moment. The latest state is loaded; try once more."
          : payload.error || "The Episode Room could not save that command.";
        setError(message);
        setStatus("error");
        return null;
      }
      roomRef.current = payload.room;
      setRoom(payload.room);
      if (payload.importedCandidates) setCandidates(payload.importedCandidates);
      if (payload.recordingSessions) setRecordingSessions(payload.recordingSessions);
      if (typeof payload.timelineClipCount === "number") setTimelineClipCount(payload.timelineClipCount);
      setStatus("idle");
      if (options.success) setNotice(options.success);
      if (recordingSession?.id) {
        setEpisodeWatchHint(episodeWatchLiveHintFromRoom({
          projectSlug,
          episodeSlug,
          callRoomId: recordingSession.id,
        }, payload.room));
      }
      return payload.room;
    }
    return null;
  }, [canEdit, endpoint, episodeSlug, projectSlug, recordingSession?.id, refresh]);
  const sendCommandRef = useRef(sendCommand);
  sendCommandRef.current = sendCommand;

  const receiveEpisodeWatchHint = useCallback((hint: EpisodeWatchLiveHint) => {
    if (hint.revision <= roomRef.current.revision) return;
    void refresh(true);
  }, [refresh]);

  const refreshVault = useCallback(async (quiet = false) => {
    setVaultLoading(true);
    try {
      const params = new URLSearchParams({
        episode: episodeSlug,
        vault: "1",
      });
      const response = await fetch(`${endpoint}?${params}`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({})) as RoomResponse;
      if (!response.ok || !payload.ok || !payload.vaultCandidates) {
        throw new Error(payload.error || "The Media Vault could not refresh.");
      }
      setVaultCandidates(payload.vaultCandidates);
      if (!quiet) {
        setError("");
        setNotice("Media Vault refreshed.");
      }
    } catch (nextError) {
      if (!quiet) {
        setError(nextError instanceof Error
          ? nextError.message
          : "The Media Vault could not refresh.");
        setStatus("error");
      }
    } finally {
      setVaultLoading(false);
    }
  }, [endpoint, episodeSlug]);

  async function useVaultAsset(
    candidate: EpisodeRoomVaultCandidate,
    savedClip?: EpisodeRoomVaultSavedClip,
  ) {
    const nextRoom = await sendCommand({
      type: "IMPORT_VAULT_ASSET",
      assetId: candidate.assetId,
      ...(savedClip ? { mediaClipId: savedClip.mediaClipId } : {}),
    }, {
      success: `${savedClip?.title || candidate.title} is attached to the episode and ready in Watch.`,
    });
    if (nextRoom) await refreshVault(true);
  }

  useEffect(() => {
    const interval = window.setInterval(() => void refresh(true), 750);
    return () => window.clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media || !clip || !isNativePlayable(clip)) return;
    const target = projectedEpisodeRoomPosition(room);
    if (Number.isFinite(target) && Math.abs(media.currentTime - target) > 0.35) {
      media.currentTime = target;
    }
    if (room.status === "playing" && sharedClockIsLive) {
      rangeEndSentRef.current = "";
      void media.play()
        .then(() => setLocalPlaybackBlocked(false))
        .catch(() => setLocalPlaybackBlocked(true));
    } else {
      media.pause();
      setLocalPlaybackBlocked(false);
    }
  }, [clip, room, sharedClockIsLive]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const media = mediaRef.current;
      setClockNowMilliseconds(Date.now());
      const currentClip = selectedClip(roomRef.current);
      const rangeEnd = currentClip?.rangeEndSeconds;
      const projectedPosition = sharedClockIsLive
        ? projectedEpisodeRoomPosition(roomRef.current)
        : roomRef.current.positionSeconds;
      const effectivePosition = media && !media.paused
        ? media.currentTime
        : projectedPosition;
      if (
        rangeEnd !== undefined
        && effectivePosition >= rangeEnd - 0.04
        && roomRef.current.status === "playing"
      ) {
        media?.pause();
        const endIdentity = `${roomRef.current.revision}:${currentClip?.watchId || ""}`;
        if (rangeEndSentRef.current !== endIdentity) {
          rangeEndSentRef.current = endIdentity;
          void sendCommandRef.current({
            type: "ENDED",
            positionSeconds: rangeEnd,
          });
        }
      }
      setDisplayPosition(effectivePosition);
    }, 200);
    return () => window.clearInterval(interval);
  }, [sharedClockIsLive]);

  async function importFile(file: File) {
    const form = new FormData();
    form.set("projectSlug", projectSlug);
    form.set("episodeSlug", episodeSlug);
    form.set("importRole", "reference-clip");
    form.set("file", file);
    setStatus("uploading");
    setError("");
    const response = await fetch("/api/episode-production/import-media", {
      method: "POST",
      body: form,
    });
    const payload = await response.json().catch(() => ({})) as {
      ok?: boolean;
      error?: string;
      importedAsset?: { id?: string };
    };
    if (!response.ok || !payload.ok || !payload.importedAsset?.id) {
      setError(payload.error || "The clip could not be imported.");
      setStatus("error");
      return;
    }
    await refresh(true);
    await sendCommand({
      type: "ADD_CLIP",
      assetId: payload.importedAsset.id,
    }, { success: `${file.name} is ready in Watch.` });
  }

  async function importUrl(event: FormEvent) {
    event.preventDefault();
    const url = sourceUrl.trim();
    if (!url) return;
    setStatus("uploading");
    setError("");
    const response = await fetch("/api/episode-production/import-media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectSlug,
        episodeSlug,
        sourceUrl: url,
        originalName: sourceTitle.trim() || url,
        importRole: "reference-clip",
        kind: "video",
      }),
    });
    const payload = await response.json().catch(() => ({})) as {
      ok?: boolean;
      error?: string;
      importedAsset?: { id?: string };
    };
    if (!response.ok || !payload.ok || !payload.importedAsset?.id) {
      setError(payload.error || "The clip URL could not be registered.");
      setStatus("error");
      return;
    }
    setSourceUrl("");
    setSourceTitle("");
    await refresh(true);
    await sendCommand({
      type: "ADD_CLIP",
      assetId: payload.importedAsset.id,
    }, { success: "The source clip is attached to this episode." });
  }

  async function importText(event: FormEvent) {
    event.preventDefault();
    const body = episodeTextDraft.trim();
    if (!body || !canEdit) return;
    setStatus("saving");
    setError("");
    const response = await fetch(endpoint, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        episodeSlug,
        body,
        clientRequestId: requestId("episode-text"),
      }),
    });
    const payload = await response.json().catch(() => ({})) as RoomResponse & { blockCount?: number };
    if (!response.ok || !payload.ok) {
      setError(payload.error || "Episode text could not be imported.");
      setStatus("error");
      return;
    }
    setNotice(`${payload.blockCount ?? 0} episode text blocks imported.`);
    setEpisodeTextDraft("");
    setStatus("idle");
    await refresh(true);
  }

  async function prepareRecordingSession() {
    if (!canEdit) return;
    setStatus("saving");
    setError("");
    setNotice("");
    const response = await fetch("/api/mobile/capture/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectSlug,
        episodeSlug,
        purpose: "PODCAST",
        title: initialPayload.episode.title,
        provider: "livekit",
        deviceLabel: "Nest Episode Room",
      }),
    });
    const payload = await response.json().catch(() => ({})) as {
      ok?: boolean;
      error?: string;
      session?: { id?: string };
    };
    if (!response.ok || !payload.ok || !payload.session?.id) {
      setError(payload.error || "The podcast recording session could not be prepared.");
      setStatus("error");
      return;
    }
    setSelectedRecordingRoomId(payload.session.id);
    setNotice("Podcast session prepared. Open it in Quipsly Capture, confirm consent, and start recording; this room will see the authoritative clock.");
    setStatus("idle");
    await refresh(true);
  }

  async function seek(position: number) {
    const media = mediaRef.current;
    const fromPositionSeconds = roomRef.current.status === "playing"
      ? undefined
      : media?.currentTime ?? displayPosition;
    if (media) media.currentTime = position;
    setDisplayPosition(position);
    setDragPosition(null);
    await sendCommand({
      type: "SEEK",
      positionSeconds: position,
      fromPositionSeconds,
    });
  }

  const playbackStart = clip?.rangeStartSeconds ?? 0;
  const playbackEnd = clip?.rangeEndSeconds
    ?? (localDuration || clip?.durationSeconds || room.durationSeconds || 0);
  const duration = Math.max(playbackStart, playbackEnd);
  const sliderPosition = Math.min(
    duration || Number.MAX_SAFE_INTEGER,
    Math.max(playbackStart, dragPosition ?? displayPosition),
  );
  const unattachedCandidates = candidates.filter((candidate) => !candidate.attached);
  const normalizedVaultQuery = vaultQuery.trim().toLowerCase();
  const visibleVaultCandidates = vaultCandidates.filter((candidate) => (
    !normalizedVaultQuery
    || candidate.title.toLowerCase().includes(normalizedVaultQuery)
    || candidate.savedClipTitles.some((title) => (
      title.toLowerCase().includes(normalizedVaultQuery)
    ))
  ));
  const alignmentCandidates = candidates.filter(
    (candidate) => candidate.captureAlignment,
  );
  const episodeClockSeconds = sharedClockIsLive && room.session
    ? Math.max(
      0,
      (clockNowMilliseconds - Date.parse(
        room.session.recordingStartedAt || room.session.startedAt,
      )) / 1_000,
    )
    : room.lastCommand?.episodeSeconds ?? 0;
  const currentPassSegmentCount = room.session
    ? room.segments.filter((segment) => segment.sessionId === room.session?.id).length
    : 0;
  const currentPassTimelineClipCount = episodeRoomTimelineClips(room).length;
  const timelineUpToDate = episodeRoomTimelineIsCurrent(room)
    && timelineClipCount === currentPassTimelineClipCount;
  const hasTimelineWork = currentPassTimelineClipCount > 0 || timelineClipCount > 0;
  const timelineActionLabel = timelineUpToDate
    ? "Timeline up to date"
    : currentPassTimelineClipCount > 0
      ? `Sync ${currentPassTimelineClipCount} watched ${currentPassTimelineClipCount === 1 ? "span" : "spans"}`
      : timelineClipCount > 0
        ? "Clear previous watch pass"
        : "Watch a clip to build timeline";
  const rehearsalActionLabel = !room.session
    ? "Start rehearsal clock"
    : room.session.recordingRoomId
      ? "Switch to rehearsal clock"
      : "Start new rehearsal pass";

  return (
    <main className="min-h-screen bg-[#07110d] px-3 py-4 text-[#f4eedf] sm:px-5 md:px-7 md:py-7">
      <div className="mx-auto max-w-[1540px]">
        <header className="rounded-[2rem] border border-[#30483d] bg-[#101b16] p-5 shadow-2xl shadow-black/20 md:p-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <Link href={`/nests/${encodeURIComponent(projectSlug)}`} className="inline-flex min-h-11 items-center gap-2 text-xs font-black uppercase tracking-wide text-[#d8ad56] hover:underline">
                <ArrowLeft size={15} /> Back to {initialPayload.project.name}
              </Link>
              <p className="mt-3 text-[10px] font-black uppercase tracking-[0.24em] text-[#83a390]">Episode Room · {initialPayload.episode.status}</p>
              <h1 className="mt-2 font-serif text-4xl font-black tracking-tight md:text-5xl">{initialPayload.episode.title}</h1>
              <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-[#aab9af]">
                One room for the script, clips you watch together, the recording clock, editorial alignment, and the conversation that carries the episode to publish.
              </p>
            </div>
            <nav aria-label="Episode workflow" className="flex flex-wrap gap-2">
              <Link href={`/create?project=${encodeURIComponent(projectSlug)}&document=${encodeURIComponent(initialPayload.episode.documentId)}`} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#40584c] bg-[#17251e] px-4 text-xs font-black hover:border-[#d8ad56]">
                <FileText size={15} /> Write
              </Link>
              <Link href={recordingSession ? "#record" : `/recorder?project=${encodeURIComponent(projectSlug)}&episode=${encodeURIComponent(episodeSlug)}`} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#d8ad56]/60 bg-[#d8ad56]/10 px-4 text-xs font-black text-[#f6d68f] hover:border-[#f6d68f]">
                <Clock3 size={15} /> Record
              </Link>
              <Link href={`/editor?project=${encodeURIComponent(projectSlug)}&episode=${encodeURIComponent(episodeSlug)}`} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#40584c] bg-[#17251e] px-4 text-xs font-black hover:border-[#d8ad56]">
                <Scissors size={15} /> Edit timeline
              </Link>
              <Link href={`/nests/${encodeURIComponent(projectSlug)}/episode-editor?episode=${encodeURIComponent(episodeSlug)}`} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#40584c] bg-[#17251e] px-4 text-xs font-black hover:border-[#d8ad56]">
                <Gauge size={15} /> Live cut
              </Link>
              <Link href={`/publishing?project=${encodeURIComponent(projectSlug)}&episode=${encodeURIComponent(episodeSlug)}`} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#40584c] bg-[#17251e] px-4 text-xs font-black hover:border-[#d8ad56]">
                <ExternalLink size={15} /> Publish
              </Link>
            </nav>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[#30483d] pt-4 text-[11px] font-bold text-[#aab9af]">
            <span className={`rounded-full px-3 py-1.5 ${room.status === "playing" ? "bg-emerald-400/15 text-emerald-200" : "bg-white/5"}`}>
              {room.status === "playing" ? "Playing together" : room.status}
            </span>
            <span>Revision {room.revision}</span>
            <span aria-hidden="true">·</span>
            <span>{activityLabel(room)}</span>
            {room.session ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{sharedClockIsLive ? "Episode clock" : "Last clock receipt"} {formatClock(episodeClockSeconds)}</span>
              </>
            ) : null}
            <button type="button" onClick={() => void refresh()} className="ml-auto inline-flex min-h-9 items-center gap-2 rounded-full border border-[#40584c] px-3 text-[10px] font-black uppercase tracking-wide hover:border-[#d8ad56]">
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
          {!canEdit ? <p className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm font-semibold text-amber-100">You have view-only access. Playback follows the room, but controls and chat require editor access.</p> : null}
          {error ? <p role="alert" className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-950/50 px-4 py-3 text-sm font-semibold text-rose-200">{error}</p> : null}
          {notice ? <p className="mt-4 rounded-2xl border border-emerald-400/30 bg-emerald-950/40 px-4 py-3 text-sm font-semibold text-emerald-100">{notice}</p> : null}
        </header>

        <EpisodeProductionRunway
          projectSlug={projectSlug}
          episodeSlug={episodeSlug}
          initialMilestones={initialPayload.milestones}
          initialAssignees={initialPayload.milestoneAssignees}
          canEdit={canEdit}
        />

        {recordingSession ? <details id="record" open className="group mt-5 scroll-mt-4 rounded-[1.75rem] border border-[#30483d] bg-[#101b16] p-3 open:bg-[#f7f0e3]">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-3 text-sm font-black text-[#f4eedf] group-open:text-[#3d3122]">
            <span className="flex items-center gap-3"><Mic2 size={18} aria-hidden="true" /> Open browser mic, camera, and live participant room</span>
            <span className="rounded-full border border-[#d8ad56]/40 px-3 py-1 text-[10px] uppercase tracking-wide text-[#d8ad56]">Same room as iPhone</span>
          </summary>
          <div className="pt-3">
            <LiveSessionRoom
              callRoomId={recordingSession.id}
              sessionTitle={recordingSession.title}
              kind="episode"
              purpose="PODCAST"
              projectSlug={projectSlug}
              episodeSlug={episodeSlug}
              episodeWatchHint={episodeWatchHint}
              onEpisodeWatchHint={receiveEpisodeWatchHint}
              compact
            />
            <div className="mt-4">
              <SessionThread
                projectSlug={projectSlug}
                roomId={recordingSession.id}
                sessionTitle={recordingSession.title}
                canPost={canEdit}
                scopeLabel="This recording Session only"
                scopeDescription="Coordinate this take, device checks, handoffs, and immediate recording decisions here. The Episode thread below remains the long-lived conversation for writing, editing, and publishing."
              />
            </div>
          </div>
        </details> : null}

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(260px,0.72fr)_minmax(520px,1.55fr)_minmax(300px,0.8fr)]">
          <section aria-labelledby="episode-text-heading" className="min-h-[34rem] overflow-hidden rounded-[1.75rem] border border-[#30483d] bg-[#101b16]">
            <header className="border-b border-[#30483d] px-5 py-4">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#d8ad56]">Episode text</p>
              <h2 id="episode-text-heading" className="mt-1 font-serif text-2xl font-black">{initialPayload.episode.documentTitle}</h2>
              <p className="mt-2 text-xs font-semibold leading-5 text-[#aab9af]">
                {textBlocks.length
                  ? `${writing.blockCount} writing blocks in this episode boundary.`
                  : `${initialPayload.transcriptSegments.length} recorded transcript segments available; writing has not been imported yet.`}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-wide text-[#91a298]">
                <span>Shared manuscript · <LocalDateTime value={writing.updatedAt} /></span>
                <Link
                  href={`/create?project=${encodeURIComponent(projectSlug)}&document=${encodeURIComponent(initialPayload.episode.documentId)}`}
                  className="rounded-full border border-[#40584c] px-2.5 py-1 text-[#f6d68f] hover:border-[#d8ad56]"
                >
                  Open this manuscript
                </Link>
              </div>
              {writingNotice ? (
                <p aria-live="polite" className="mt-3 rounded-xl border border-emerald-400/30 bg-emerald-950/40 px-3 py-2 text-xs font-bold text-emerald-100">
                  {writingNotice}
                </p>
              ) : null}
              {writing.truncated ? (
                <p className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs font-bold text-amber-100">
                  Showing the first {writing.visibleBlockCount} of {writing.blockCount} blocks. Open the shared manuscript for the complete document.
                </p>
              ) : null}
            </header>
            <div className="max-h-[calc(100vh-16rem)] space-y-3 overflow-y-auto p-4">
              {textBlocks.length ? textBlocks.map((block) => (
                <article key={block.id} id={`block-${block.stableId}`} className="rounded-2xl border border-[#30483d] bg-[#17251e] p-4">
                  {block.title ? <h3 className="font-serif text-lg font-black text-[#f4eedf]">{block.title}</h3> : null}
                  <p className={`${block.title ? "mt-2" : ""} whitespace-pre-wrap text-sm font-medium leading-7 text-[#d5ded8]`}>{block.body}</p>
                </article>
              )) : (
                <>
                  {initialPayload.transcriptSegments.length ? (
                    <section aria-labelledby="episode-transcript-heading" className="rounded-2xl border border-[#30483d] bg-[#07110d] p-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#d8ad56]">Existing recording</p>
                      <h3 id="episode-transcript-heading" className="mt-1 font-serif text-xl font-black">Recorded transcript</h3>
                      <p className="mt-2 text-xs font-semibold leading-5 text-[#aab9af]">This remains transcript evidence, not a fabricated script. Add the actual outline or manuscript below when it is ready.</p>
                      <div className="mt-4 space-y-3">
                        {initialPayload.transcriptSegments.slice(0, 160).map((segment) => (
                          <article key={segment.id} className="border-l-2 border-[#40584c] pl-3">
                            <p className="text-[10px] font-black uppercase tracking-wide text-[#91a298]">{segment.speaker} · {formatClock(segment.startSeconds)}</p>
                            <p className="mt-1 text-sm leading-6 text-[#d5ded8]">{segment.text}</p>
                          </article>
                        ))}
                      </div>
                      {initialPayload.transcriptSegments.length > 160 ? (
                        <p className="mt-4 text-xs font-bold text-[#91a298]">Showing 160 of {initialPayload.transcriptSegments.length} segments here. Open Edit for the complete timecoded transcript.</p>
                      ) : null}
                    </section>
                  ) : null}
                  <form onSubmit={importText} className="rounded-2xl border border-dashed border-[#40584c] p-4">
                    <p className="text-sm font-semibold leading-6 text-[#aab9af]">Paste the outline, script, or notes you are actually using. Quipsly will split blank-line-separated paragraphs into durable Writing blocks.</p>
                    <textarea
                      value={episodeTextDraft}
                      onChange={(event) => setEpisodeTextDraft(event.target.value)}
                      disabled={!canEdit}
                      placeholder="Paste episode text…"
                      className="mt-3 min-h-52 w-full resize-y rounded-2xl border border-[#40584c] bg-[#07110d] px-3 py-3 text-sm leading-6 text-[#f4eedf] outline-none placeholder:text-[#72847a] focus:border-[#d8ad56] focus:ring-4 focus:ring-[#d8ad56]/10 disabled:opacity-50"
                    />
                    <button
                      type="submit"
                      disabled={!canEdit || !episodeTextDraft.trim() || status === "saving"}
                      className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#d8ad56] px-4 text-xs font-black text-[#172018] disabled:opacity-40"
                    >
                      {status === "saving" ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                      Bring text into this episode
                    </button>
                    <p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-[#82958a]">Empty-document import only · never overwrites existing writing</p>
                  </form>
                </>
              )}
            </div>
          </section>

          <section aria-labelledby="watch-heading" className="overflow-hidden rounded-[1.75rem] border border-[#30483d] bg-[#101b16]">
            <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[#30483d] px-5 py-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#d8ad56]">Shared Watch</p>
                <h2 id="watch-heading" className="mt-1 font-serif text-3xl font-black">Watch it together</h2>
                <p className="mt-2 text-xs font-semibold leading-5 text-[#aab9af]">Either editor can play, seek, or pause. Every watched span becomes a provenance-bearing timeline segment.</p>
              </div>
              <button
                type="button"
                disabled={
                  !canEdit
                  || status === "saving"
                  || (room.status === "playing" && sharedClockIsLive)
                }
                onClick={() => void sendCommand({ type: "START_SESSION" }, { success: "A rehearsal clock is running. It is not recording evidence." })}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#d8ad56]/60 bg-[#d8ad56]/10 px-4 text-xs font-black text-[#f6d68f] hover:bg-[#d8ad56]/20 disabled:opacity-40"
              >
                <Clock3 size={16} /> {rehearsalActionLabel}
              </button>
            </header>

            <div className="p-4 md:p-5">
              <section aria-labelledby="recording-clock-heading" className="mb-5 rounded-3xl border border-[#30483d] bg-[#17251e] p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#d8ad56]">Production clock</p>
                    <h3 id="recording-clock-heading" className="mt-1 font-serif text-2xl font-black">Anchor Watch to the real recording</h3>
                    <p className="mt-2 max-w-2xl text-xs font-semibold leading-5 text-[#aab9af]">
                      Quipsly Capture owns consent and Start/Stop receipts. Episode Room reads that server clock; this page never fabricates or silently starts a recording.
                    </p>
                  </div>
                  {boundRecordingSession ? (
                    <span className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 text-[10px] font-black uppercase tracking-wide text-emerald-100">
                      <Mic2 size={14} /> Bound to {boundRecordingSession.title}
                    </span>
                  ) : null}
                </div>

                {recordingSessions.length ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                    <label className="block">
                      <span className="text-[10px] font-black uppercase tracking-wide text-[#91a298]">Podcast session</span>
                      <select
                        value={recordingSession?.id || ""}
                        onChange={(event) => setSelectedRecordingRoomId(event.target.value)}
                        className="mt-1 min-h-11 w-full rounded-xl border border-[#40584c] bg-[#07110d] px-3 text-sm font-bold text-[#f4eedf] outline-none focus:border-[#d8ad56]"
                      >
                        {recordingSessions.map((session) => (
                          <option key={session.id} value={session.id}>
                            {session.title} · {session.status.toLowerCase()}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={
                        !canEdit
                        || !recordingSession?.canUseRecordingClock
                        || recordingSession.status !== "RECORDING"
                        || room.session?.recordingRoomId === recordingSession?.id
                        || status === "saving"
                      }
                      onClick={() => recordingSession && void sendCommand({
                        type: "START_SESSION",
                        recordingRoomId: recordingSession.id,
                      }, { success: "Shared playback is anchored to the authoritative recording clock." })}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#d8ad56] px-4 text-xs font-black text-[#172018] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Clock3 size={16} /> Use recording clock
                    </button>
                    <div className="text-xs font-semibold leading-5 text-[#aab9af] md:col-span-2">
                      {recordingSession?.recordingStartedAt ? (
                        <>
                          {recordingSession.status === "RECORDING" ? "Recording now" : "Recorded"}
                          {" · started "}
                          <LocalDateTime value={recordingSession.recordingStartedAt} />
                          {" · "}
                          {recordingSession.provider}
                        </>
                      ) : "Recording has not started. Open this session in Quipsly Capture, confirm consent, and tap Record."}
                      {recordingSession?.canOpenSession ? (
                        <Link href={`/sessions/${encodeURIComponent(recordingSession.id)}?mode=prepare`} className="ml-2 font-black text-[#f6d68f] hover:underline">
                          Open session
                        </Link>
                      ) : recordingSession ? (
                        <span className="ml-2 text-[#91a298]">
                          Capture access is separate; ask a session participant to add you if you need the raw room.
                        </span>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-dashed border-[#40584c] p-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs font-semibold leading-5 text-[#aab9af]">No podcast capture session is bound to this episode yet.</p>
                    <button
                      type="button"
                      disabled={!canEdit || status === "saving"}
                      onClick={() => void prepareRecordingSession()}
                      className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-[#d8ad56] px-4 text-xs font-black text-[#172018] disabled:opacity-40"
                    >
                      <Plus size={16} /> Prepare podcast session
                    </button>
                  </div>
                )}
                {!sharedClockIsLive ? (
                  <p className="mt-4 rounded-2xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-xs font-semibold leading-5 text-amber-100">
                    This recording clock is no longer live. Start a rehearsal clock before creating new shared-watch receipts, or begin a new Capture recording and bind that clock.
                  </p>
                ) : null}

                {alignmentCandidates.length ? (
                  <div className="mt-4 border-t border-[#30483d] pt-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#d8ad56]">Capture alignment review</p>
                        <h4 className="mt-1 font-serif text-xl font-black">Clock proposals, not locked sync</h4>
                        <p className="mt-1 max-w-2xl text-xs font-semibold leading-5 text-[#aab9af]">
                          These offsets come from immutable START receipts and the best device clock sample. Quipsly never calls them sample-accurate until waveform correlation, drift review, and a person approves the result.
                        </p>
                      </div>
                      <Link
                        href={`/nests/${encodeURIComponent(projectSlug)}/episode-editor?episode=${encodeURIComponent(episodeSlug)}`}
                        className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-[#d8ad56]/60 px-3 text-[10px] font-black uppercase tracking-wide text-[#f6d68f]"
                      >
                        <Scissors size={13} /> Review in editor
                      </Link>
                    </div>
                    <ul className="mt-3 grid min-w-0 gap-2 lg:grid-cols-2">
                      {alignmentCandidates.map((candidate) => {
                        const alignment = candidate.captureAlignment!;
                        const ready = alignment.status === "proposal-ready";
                        return (
                          <li key={`${candidate.assetId}-alignment`} className="min-w-0 rounded-2xl border border-[#30483d] bg-[#07110d] p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-black">{candidate.title}</p>
                                <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#91a298]">
                                  {formatOffset(alignment.estimatedOffsetMilliseconds)} · {formatUncertainty(alignment.uncertaintyMilliseconds)}
                                </p>
                              </div>
                              <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wide ${ready ? "bg-emerald-400/10 text-emerald-100" : "bg-amber-300/10 text-amber-100"}`}>
                                {ready ? "Proposal ready" : "Evidence needed"}
                              </span>
                            </div>
                            <p className="mt-2 text-[11px] font-semibold leading-5 text-[#aab9af]">{alignment.reason}</p>
                            <div className="mt-2 flex flex-wrap gap-1.5 text-[9px] font-black uppercase tracking-wide text-[#c9d4cd]">
                              <span className="inline-flex items-center gap-1 rounded-full border border-[#40584c] px-2 py-1"><Waves size={11} /> Waveform</span>
                              <span className="inline-flex items-center gap-1 rounded-full border border-[#40584c] px-2 py-1"><Gauge size={11} /> Drift</span>
                              <span className="inline-flex items-center gap-1 rounded-full border border-[#40584c] px-2 py-1"><ShieldCheck size={11} /> Human approval</span>
                            </div>
                            {alignment.estimatedServerStartedAt ? (
                              <p className="mt-2 truncate font-mono text-[9px] text-[#72847a]">
                                Proposed server start {alignment.estimatedServerStartedAt}
                                {alignment.proposalSourceCount ? ` · ${alignment.proposalSourceCount} grouped sources` : ""}
                              </p>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
              </section>

              <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-3xl border border-[#30483d] bg-black">
                {!clip ? (
                  <div className="max-w-md px-6 text-center">
                    <Film className="mx-auto h-10 w-10 text-[#d8ad56]" />
                    <h3 className="mt-4 font-serif text-2xl font-black">Add the first clip</h3>
                    <p className="mt-2 text-sm font-semibold leading-6 text-[#aab9af]">Upload the actual audio or video you plan to react to. It stays attached to this episode and will be aligned from the shared watch receipts.</p>
                  </div>
                ) : !isNativePlayable(clip) ? (
                  <div className="max-w-lg px-6 text-center">
                    <ExternalLink className="mx-auto h-10 w-10 text-[#d8ad56]" />
                    <h3 className="mt-4 font-serif text-2xl font-black">This source needs a playable file</h3>
                    <p className="mt-2 text-sm font-semibold leading-6 text-[#aab9af]">The link is attached for research, but shared playback needs a direct MP4, WebM, MP3, WAV, M4A, or an uploaded file.</p>
                    <a href={clip.playbackUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#d8ad56] px-4 text-xs font-black text-[#172018]">Open source <ExternalLink size={14} /></a>
                  </div>
                ) : clip.kind === "audio" ? (
                  <div className="w-full px-8 text-center">
                    <Film className="mx-auto h-14 w-14 text-[#d8ad56]" />
                    <p className="mt-4 font-serif text-2xl font-black">{clip.title}</p>
                    <audio
                      key={clip.watchId}
                      ref={(node) => { mediaRef.current = node; }}
                      src={clip.playbackUrl}
                      preload="metadata"
                      onLoadedMetadata={(event) => setLocalDuration(event.currentTarget.duration)}
                      onEnded={() => void sendCommand({ type: "ENDED", positionSeconds: mediaRef.current?.currentTime })}
                    />
                  </div>
                ) : (
                  <video
                    key={clip.watchId}
                    ref={(node) => { mediaRef.current = node; }}
                    src={clip.playbackUrl}
                    preload="metadata"
                    playsInline
                    className="h-full w-full object-contain"
                    onLoadedMetadata={(event) => setLocalDuration(event.currentTarget.duration)}
                    onEnded={() => void sendCommand({ type: "ENDED", positionSeconds: mediaRef.current?.currentTime })}
                  />
                )}
                {status === "saving" || status === "uploading" ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/45">
                    <span className="inline-flex items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-xs font-black"><Loader2 size={16} className="animate-spin" /> {status === "uploading" ? "Importing clip…" : "Syncing room…"}</span>
                  </div>
                ) : null}
              </div>

              {clip && isNativePlayable(clip) ? (
                <div className="mt-4 rounded-3xl border border-[#30483d] bg-[#07110d] p-4">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      disabled={!canEdit || !sharedClockIsLive}
                      onClick={() => void sendCommand(
                        room.status === "playing"
                          ? { type: "PAUSE" }
                          : {
                              type: "PLAY",
                              positionSeconds:
                                mediaRef.current?.currentTime ?? displayPosition,
                            },
                      )}
                      className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#d8ad56] text-[#172018] disabled:opacity-40"
                      aria-label={room.status === "playing" ? "Pause for everyone" : "Play for everyone"}
                    >
                      {room.status === "playing" ? <Pause size={21} fill="currentColor" /> : <Play size={21} fill="currentColor" />}
                    </button>
                    <button type="button" disabled={!canEdit || !sharedClockIsLive} onClick={() => void seek(Math.max(playbackStart, displayPosition - 10))} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#40584c] disabled:opacity-40" aria-label="Back 10 seconds"><RotateCcw size={18} /></button>
                    <div className="min-w-0 flex-1">
                      <input
                        type="range"
                        min={playbackStart}
                        max={Math.max(playbackStart + 0.01, duration)}
                        step={0.01}
                        value={Math.min(
                          Math.max(playbackStart, sliderPosition),
                          Math.max(playbackStart + 0.01, duration),
                        )}
                        disabled={!canEdit || !sharedClockIsLive || duration <= playbackStart}
                        onChange={(event) => setDragPosition(Number(event.target.value))}
                        onPointerUp={(event) => void seek(Number(event.currentTarget.value))}
                        onKeyUp={(event) => {
                          if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
                            void seek(Number(event.currentTarget.value));
                          }
                        }}
                        className="w-full accent-[#d8ad56]"
                        aria-label="Shared clip position"
                      />
                      <div className="mt-1 flex justify-between text-[10px] font-black tabular-nums text-[#91a298]">
                        <span>{formatClock(sliderPosition)}</span>
                        <span>{duration > playbackStart ? formatClock(duration) : "Duration loading"}</span>
                      </div>
                    </div>
                    <button type="button" disabled={!canEdit || !sharedClockIsLive} onClick={() => void seek(Math.min(duration || Number.MAX_SAFE_INTEGER, displayPosition + 10))} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#40584c] disabled:opacity-40" aria-label="Forward 10 seconds"><RotateCw size={18} /></button>
                  </div>
                  {localPlaybackBlocked && room.status === "playing" ? (
                    <button
                      type="button"
                      onClick={() => void mediaRef.current?.play().then(() => setLocalPlaybackBlocked(false))}
                      className="mt-3 w-full rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm font-black text-amber-100"
                    >
                      Tap to join playback on this device
                    </button>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-black text-[#f4eedf]">{clip.title}</p>
                      <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#91a298]">
                        {clip.kind}
                        {clip.rangeStartSeconds !== undefined && clip.rangeEndSeconds !== undefined
                          ? ` · saved range ${formatClock(clip.rangeStartSeconds)}–${formatClock(clip.rangeEndSeconds)}`
                          : ""}
                        {" · "}{room.segments.length} watched {room.segments.length === 1 ? "segment" : "segments"}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => void sendCommand({
                        type: "REMOVE_CLIP",
                        clipId: clip.watchId,
                        positionSeconds: mediaRef.current?.currentTime,
                      })}
                      className="inline-flex min-h-10 items-center gap-2 rounded-full border border-rose-400/30 px-3 text-[10px] font-black uppercase tracking-wide text-rose-200 disabled:opacity-40"
                    >
                      <Trash2 size={13} /> Remove
                    </button>
                  </div>
                </div>
              ) : null}

              {room.clips.length ? (
                <div className="mt-4">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.18em] text-[#91a298]">Episode watch list</h3>
                  <div className="mt-2 flex gap-2 overflow-x-auto pb-2">
                    {room.clips.map((item) => (
                      <button
                        key={item.watchId}
                        type="button"
                        disabled={!canEdit || item.watchId === room.selectedClipId}
                        onClick={() => void sendCommand({
                          type: "SELECT_CLIP",
                          clipId: item.watchId,
                          positionSeconds: mediaRef.current?.currentTime,
                        })}
                        className={`min-w-52 rounded-2xl border p-3 text-left transition ${item.watchId === room.selectedClipId ? "border-[#d8ad56] bg-[#d8ad56]/10" : "border-[#30483d] bg-[#17251e] hover:border-[#6b8376]"}`}
                      >
                        <span className="block truncate text-sm font-black">{item.title}</span>
                        <span className="mt-1 block text-[10px] font-bold uppercase tracking-wide text-[#91a298]">
                          {item.kind}
                          {item.rangeStartSeconds !== undefined && item.rangeEndSeconds !== undefined
                            ? ` · ${formatClock(item.rangeStartSeconds)}–${formatClock(item.rangeEndSeconds)}`
                            : ""}
                          {" · "}{isNativePlayable(item) ? "ready" : "source only"}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-5 rounded-3xl border border-[#d8ad56]/35 bg-[#17251e] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#d8ad56]">Reuse the source of truth</p>
                    <h3 className="mt-1 font-serif text-2xl font-black">Add from this Nest’s Media Vault</h3>
                    <p className="mt-2 max-w-2xl text-xs font-semibold leading-5 text-[#aab9af]">
                      Attach an existing source without another upload. Quipsly preserves the original, records the episode reference, and makes it available to iPhone Watch.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={vaultLoading}
                    onClick={() => void refreshVault()}
                    className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-[#40584c] px-3 text-[10px] font-black uppercase tracking-wide text-[#d7e0da] disabled:opacity-40"
                  >
                    <RefreshCw size={13} className={vaultLoading ? "animate-spin" : ""} />
                    Refresh
                  </button>
                </div>
                <label className="mt-4 flex min-h-11 items-center gap-2 rounded-2xl border border-[#40584c] bg-[#07110d] px-3 focus-within:border-[#d8ad56]">
                  <Search size={15} className="shrink-0 text-[#91a298]" />
                  <span className="sr-only">Search Media Vault</span>
                  <input
                    value={vaultQuery}
                    onChange={(event) => setVaultQuery(event.target.value)}
                    placeholder="Search source files or saved clip names"
                    className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-[#72847a]"
                  />
                </label>
                {visibleVaultCandidates.length ? (
                  <ul className="mt-3 grid gap-2 lg:grid-cols-2">
                    {visibleVaultCandidates.slice(0, 24).map((candidate) => (
                      <li key={candidate.assetId} className="min-w-0 rounded-2xl border border-[#30483d] bg-[#07110d] p-3">
                        <div className="flex min-w-0 flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <p className="break-words text-sm font-black sm:truncate">{candidate.title}</p>
                            <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#91a298]">
                              {candidate.kind} · {candidate.readinessLabel}
                            </p>
                            {candidate.savedClipCount ? (
                              <p className="mt-1 text-[10px] font-semibold text-[#d7c69d]">
                                {candidate.savedClipCount} saved {candidate.savedClipCount === 1 ? "range" : "ranges"}
                              </p>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            disabled={!canEdit || !candidate.canAddToWatch || status === "saving"}
                            onClick={() => void useVaultAsset(candidate)}
                            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-full bg-[#d8ad56] px-3 text-[10px] font-black uppercase tracking-wide text-[#172018] disabled:opacity-40"
                          >
                            {candidate.attached ? (
                              <><CheckCircle2 size={13} /> Whole source in Watch</>
                            ) : (
                              <><Plus size={13} /> Use whole source</>
                            )}
                          </button>
                        </div>
                        {candidate.savedClips.length ? (
                          <div className="mt-3 border-t border-[#30483d] pt-3">
                            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#91a298]">Saved ranges</p>
                            <ul className="mt-2 space-y-2">
                              {candidate.savedClips.map((savedClip) => (
                                <li key={savedClip.mediaClipId} className="flex flex-col gap-2 rounded-xl bg-[#17251e] p-2.5 sm:flex-row sm:items-center sm:justify-between">
                                  <div className="min-w-0">
                                    <p className="break-words text-xs font-black sm:truncate">{savedClip.title}</p>
                                    <p className="mt-1 text-[9px] font-bold uppercase tracking-wide text-[#91a298]">
                                      {formatClock(savedClip.rangeStartSeconds)}–{formatClock(savedClip.rangeEndSeconds)}
                                      {" · "}{formatClock(savedClip.durationSeconds)}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    disabled={!canEdit || savedClip.attached || status === "saving"}
                                    onClick={() => void useVaultAsset(candidate, savedClip)}
                                    className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-full border border-[#d8ad56]/60 px-3 text-[10px] font-black uppercase tracking-wide text-[#f6d68f] disabled:opacity-40"
                                  >
                                    {savedClip.attached ? (
                                      <><CheckCircle2 size={13} /> Range in Watch</>
                                    ) : (
                                      <><Scissors size={13} /> Use saved range</>
                                    )}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-3 rounded-2xl border border-dashed border-[#40584c] px-4 py-5 text-center">
                    <p className="text-sm font-black">
                      {vaultCandidates.length
                        ? "No vault sources match that search."
                        : "No reusable audio or video is filed in this Nest yet."}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-[#91a298]">
                      Upload below once; future episodes can reuse the preserved source.
                    </p>
                  </div>
                )}
                {vaultCandidates.some((candidate) => candidate.savedClipCount > 0) ? (
                  <p className="mt-3 text-[10px] font-semibold leading-4 text-[#91a298]">
                    Saved ranges play from their exact in point to out point while the original source remains unchanged.
                  </p>
                ) : null}
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <div className="rounded-3xl border border-[#30483d] bg-[#17251e] p-4">
                  <h3 className="font-serif text-xl font-black">Upload watch media</h3>
                  <p className="mt-2 text-xs font-semibold leading-5 text-[#aab9af]">Best for dependable synchronized playback. Original media stays in the vault.</p>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="video/*,audio/*,.mp4,.mov,.m4v,.webm,.mp3,.wav,.m4a,.aac,.ogg"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void importFile(file);
                      event.currentTarget.value = "";
                    }}
                  />
                  <button type="button" disabled={!canEdit || status === "uploading"} onClick={() => fileRef.current?.click()} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#d8ad56] px-4 text-xs font-black text-[#172018] disabled:opacity-40">
                    <Upload size={16} /> Choose audio or video
                  </button>
                </div>
                <form onSubmit={importUrl} className="rounded-3xl border border-[#30483d] bg-[#17251e] p-4">
                  <h3 className="font-serif text-xl font-black">Attach a source URL</h3>
                  <p className="mt-2 text-xs font-semibold leading-5 text-[#aab9af]">Direct media links can play here. YouTube and article links remain attached as references until materialized.</p>
                  <input value={sourceTitle} onChange={(event) => setSourceTitle(event.target.value)} placeholder="Clip title" className="mt-3 w-full rounded-xl border border-[#40584c] bg-[#07110d] px-3 py-2 text-sm outline-none focus:border-[#d8ad56]" />
                  <input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://…" inputMode="url" className="mt-2 w-full rounded-xl border border-[#40584c] bg-[#07110d] px-3 py-2 text-sm outline-none focus:border-[#d8ad56]" />
                  <button type="submit" disabled={!canEdit || !sourceUrl.trim() || status === "uploading"} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-[#d8ad56]/60 px-4 text-xs font-black text-[#f6d68f] disabled:opacity-40">
                    <Plus size={16} /> Attach source
                  </button>
                </form>
              </div>

              {unattachedCandidates.length ? (
                <div className="mt-4 rounded-3xl border border-[#30483d] bg-[#17251e] p-4">
                  <h3 className="font-serif text-xl font-black">Already in this episode</h3>
                  <p className="mt-2 text-xs font-semibold text-[#aab9af]">Reuse imported media without another upload.</p>
                  <ul className="mt-3 space-y-2">
                    {unattachedCandidates.slice(0, 8).map((candidate) => (
                      <li key={candidate.assetId} className="flex items-center justify-between gap-3 rounded-2xl border border-[#30483d] bg-[#07110d] p-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black">{candidate.title}</p>
                          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#91a298]">{candidate.kind} · {candidate.readinessLabel}</p>
                          {candidate.recordingAssetId ? (
                            <p className="mt-1 truncate font-mono text-[9px] font-semibold text-[#72847a]">
                              Recording {candidate.recordingAssetId}
                              {candidate.captureGroupId ? ` · Take ${candidate.captureGroupId}` : ""}
                            </p>
                          ) : null}
                        </div>
                        <button type="button" disabled={!canEdit || !candidate.canAddToWatch} onClick={() => void sendCommand({ type: "ADD_CLIP", assetId: candidate.assetId }, { success: `${candidate.title} is in Watch.` })} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-[#d8ad56]/60 px-3 text-[10px] font-black uppercase tracking-wide text-[#f6d68f] disabled:opacity-40">
                          <Plus size={13} /> {candidate.canAddToWatch ? "Add" : "Proxying"}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="mt-5 flex flex-col gap-3 rounded-3xl border border-[#d8ad56]/30 bg-[#d8ad56]/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-serif text-xl font-black">Watched clips → timeline</p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-[#d7c69d]">
                    {currentPassSegmentCount} receipt-backed {currentPassSegmentCount === 1 ? "span" : "spans"} in this pass · {room.segments.length} total in history · {timelineClipCount} episode timeline {timelineClipCount === 1 ? "derivative" : "derivatives"} stored.
                  </p>
                  {room.timelineSync ? (
                    <p className={`mt-1 text-[10px] font-bold uppercase tracking-wide ${timelineUpToDate ? "text-emerald-200" : "text-[#d8ad56]"}`}>
                      {timelineUpToDate ? "Timeline current" : "Timeline needs review"} · last synced by {room.timelineSync.syncedBy} · {room.timelineSync.timelineClipCount} watch {room.timelineSync.timelineClipCount === 1 ? "clip" : "clips"}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                  {canEdit && timelineClipCount > 0 ? (
                    <Link
                      href={`/editor?project=${encodeURIComponent(projectSlug)}&episode=${encodeURIComponent(episodeSlug)}`}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#d8ad56]/60 bg-[#07110d] px-4 text-xs font-black text-[#f6d68f]"
                    >
                      <Scissors size={16} /> Review production timeline
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    disabled={!canEdit || room.status === "playing" || !hasTimelineWork || timelineUpToDate}
                    onClick={() => void sendCommand(
                      { type: "SYNC_TIMELINE" },
                      {
                        success: currentPassTimelineClipCount > 0
                          ? "Watched spans are aligned on the episode timeline."
                          : "The previous Watch pass was removed from the episode timeline. Its receipts remain in history.",
                      },
                    )}
                    className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-[#d8ad56] px-4 text-xs font-black text-[#172018] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <CheckCircle2 size={16} /> {timelineActionLabel}
                  </button>
                </div>
              </div>
            </div>
          </section>

          <EpisodeRoomChat projectSlug={projectSlug} episodeSlug={episodeSlug} canEdit={canEdit} />
        </div>
      </div>
    </main>
  );
}
