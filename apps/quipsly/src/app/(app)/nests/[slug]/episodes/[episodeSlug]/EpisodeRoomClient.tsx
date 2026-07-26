"use client";

import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  Film,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Scissors,
  Trash2,
  Upload,
} from "lucide-react";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  projectedEpisodeRoomPosition,
  type EpisodeRoomClip,
  type EpisodeRoomState,
} from "@/lib/episode-room/episode-room-contract";
import type {
  EpisodeRoomDeskPayload,
  EpisodeRoomImportedCandidate,
} from "@/lib/server/episode-room-store";

import EpisodeRoomChat from "./EpisodeRoomChat";

type RoomResponse = {
  ok: boolean;
  error?: string;
  code?: string;
  currentRevision?: number;
  desk?: EpisodeRoomDeskPayload;
  room?: EpisodeRoomState;
  importedCandidates?: EpisodeRoomImportedCandidate[];
  timelineClipCount?: number;
  updatedAt?: string;
};

type CommandDraft = {
  type:
    | "START_SESSION"
    | "ADD_CLIP"
    | "REMOVE_CLIP"
    | "SELECT_CLIP"
    | "PLAY"
    | "PAUSE"
    | "SEEK"
    | "ENDED"
    | "SYNC_TIMELINE";
  assetId?: string;
  clipId?: string;
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

function selectedClip(room: EpisodeRoomState) {
  return room.clips.find((clip) => clip.assetId === room.selectedClipId);
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
  const [candidates, setCandidates] = useState(initialPayload.importedCandidates);
  const [timelineClipCount, setTimelineClipCount] = useState(initialPayload.timelineClipCount);
  const [status, setStatus] = useState<"idle" | "saving" | "uploading" | "error">("idle");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [episodeTextDraft, setEpisodeTextDraft] = useState("");
  const [displayPosition, setDisplayPosition] = useState(initialPayload.room.positionSeconds);
  const [localDuration, setLocalDuration] = useState(initialPayload.room.durationSeconds ?? 0);
  const [localPlaybackBlocked, setLocalPlaybackBlocked] = useState(false);
  const [dragPosition, setDragPosition] = useState<number | null>(null);
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const projectSlug = initialPayload.project.slug;
  const episodeSlug = initialPayload.episode.slug;
  const canEdit = initialPayload.canEdit;
  const clip = useMemo(() => selectedClip(room), [room]);
  const endpoint = `/api/nests/${encodeURIComponent(projectSlug)}/episode-room`;

  const refresh = useCallback(async (quiet = false) => {
    try {
      const params = new URLSearchParams({ episode: episodeSlug, runtime: "1" });
      const response = await fetch(`${endpoint}?${params}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as RoomResponse;
      if (!response.ok || !payload.ok || !payload.room) {
        throw new Error(payload.error || "Episode Room could not refresh.");
      }
      roomRef.current = payload.room;
      setRoom(payload.room);
      if (payload.importedCandidates) setCandidates(payload.importedCandidates);
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
      if (typeof payload.timelineClipCount === "number") setTimelineClipCount(payload.timelineClipCount);
      setStatus("idle");
      if (options.success) setNotice(options.success);
      return payload.room;
    }
    return null;
  }, [canEdit, endpoint, episodeSlug, refresh]);

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
    if (room.status === "playing") {
      void media.play()
        .then(() => setLocalPlaybackBlocked(false))
        .catch(() => setLocalPlaybackBlocked(true));
    } else {
      media.pause();
      setLocalPlaybackBlocked(false);
    }
  }, [clip, room]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const media = mediaRef.current;
      setDisplayPosition(media && !media.paused
        ? media.currentTime
        : projectedEpisodeRoomPosition(roomRef.current));
    }, 200);
    return () => window.clearInterval(interval);
  }, []);

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
    window.location.reload();
  }

  async function seek(position: number) {
    const media = mediaRef.current;
    const fromPositionSeconds = media?.currentTime ?? projectedEpisodeRoomPosition(roomRef.current);
    if (media) media.currentTime = position;
    setDisplayPosition(position);
    setDragPosition(null);
    await sendCommand({
      type: "SEEK",
      positionSeconds: position,
      fromPositionSeconds,
    });
  }

  const duration = Math.max(0, localDuration || clip?.durationSeconds || room.durationSeconds || 0);
  const sliderPosition = Math.min(duration || Number.MAX_SAFE_INTEGER, dragPosition ?? displayPosition);
  const unattachedCandidates = candidates.filter((candidate) => !candidate.attached);

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
              <Link href={`/create?project=${encodeURIComponent(projectSlug)}`} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#40584c] bg-[#17251e] px-4 text-xs font-black hover:border-[#d8ad56]">
                <FileText size={15} /> Write
              </Link>
              <Link href={`/recorder?project=${encodeURIComponent(projectSlug)}&episode=${encodeURIComponent(episodeSlug)}`} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#40584c] bg-[#17251e] px-4 text-xs font-black hover:border-[#d8ad56]">
                <Clock3 size={15} /> Record
              </Link>
              <Link href={`/nests/${encodeURIComponent(projectSlug)}/episode-editor?episode=${encodeURIComponent(episodeSlug)}`} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#40584c] bg-[#17251e] px-4 text-xs font-black hover:border-[#d8ad56]">
                <Scissors size={15} /> Edit
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
                <span>Episode clock {formatClock(Math.max(0, (Date.now() - Date.parse(room.session.recordingStartedAt || room.session.startedAt)) / 1_000))}</span>
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

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(260px,0.72fr)_minmax(520px,1.55fr)_minmax(300px,0.8fr)]">
          <section aria-labelledby="episode-text-heading" className="min-h-[34rem] overflow-hidden rounded-[1.75rem] border border-[#30483d] bg-[#101b16]">
            <header className="border-b border-[#30483d] px-5 py-4">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#d8ad56]">Episode text</p>
              <h2 id="episode-text-heading" className="mt-1 font-serif text-2xl font-black">{initialPayload.episode.documentTitle}</h2>
              <p className="mt-2 text-xs font-semibold leading-5 text-[#aab9af]">
                {initialPayload.textBlocks.length
                  ? `${initialPayload.textBlocks.length} writing blocks in this episode boundary.`
                  : `${initialPayload.transcriptSegments.length} recorded transcript segments available; writing has not been imported yet.`}
              </p>
            </header>
            <div className="max-h-[calc(100vh-16rem)] space-y-3 overflow-y-auto p-4">
              {initialPayload.textBlocks.length ? initialPayload.textBlocks.map((block) => (
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
                disabled={!canEdit || status === "saving"}
                onClick={() => void sendCommand({ type: "START_SESSION" }, { success: "A fresh episode clock is running." })}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#d8ad56]/60 bg-[#d8ad56]/10 px-4 text-xs font-black text-[#f6d68f] hover:bg-[#d8ad56]/20 disabled:opacity-40"
              >
                <Clock3 size={16} /> {room.session ? "Restart episode clock" : "Start episode clock"}
              </button>
            </header>

            <div className="p-4 md:p-5">
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
                      key={clip.assetId}
                      ref={(node) => { mediaRef.current = node; }}
                      src={clip.playbackUrl}
                      preload="metadata"
                      onLoadedMetadata={(event) => setLocalDuration(event.currentTarget.duration)}
                      onEnded={() => void sendCommand({ type: "ENDED", positionSeconds: mediaRef.current?.currentTime })}
                    />
                  </div>
                ) : (
                  <video
                    key={clip.assetId}
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
                      disabled={!canEdit}
                      onClick={() => void sendCommand({
                        type: room.status === "playing" ? "PAUSE" : "PLAY",
                        positionSeconds: mediaRef.current?.currentTime ?? displayPosition,
                      })}
                      className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#d8ad56] text-[#172018] disabled:opacity-40"
                      aria-label={room.status === "playing" ? "Pause for everyone" : "Play for everyone"}
                    >
                      {room.status === "playing" ? <Pause size={21} fill="currentColor" /> : <Play size={21} fill="currentColor" />}
                    </button>
                    <button type="button" disabled={!canEdit} onClick={() => void seek(Math.max(0, displayPosition - 10))} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#40584c] disabled:opacity-40" aria-label="Back 10 seconds"><RotateCcw size={18} /></button>
                    <div className="min-w-0 flex-1">
                      <input
                        type="range"
                        min={0}
                        max={Math.max(1, duration)}
                        step={0.01}
                        value={Math.min(Math.max(0, sliderPosition), Math.max(1, duration))}
                        disabled={!canEdit || !duration}
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
                        <span>{duration ? formatClock(duration) : "Duration loading"}</span>
                      </div>
                    </div>
                    <button type="button" disabled={!canEdit} onClick={() => void seek(Math.min(duration || Number.MAX_SAFE_INTEGER, displayPosition + 10))} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#40584c] disabled:opacity-40" aria-label="Forward 10 seconds"><RotateCw size={18} /></button>
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
                      <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#91a298]">{clip.kind} · {room.segments.length} watched {room.segments.length === 1 ? "segment" : "segments"}</p>
                    </div>
                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => void sendCommand({
                        type: "REMOVE_CLIP",
                        clipId: clip.assetId,
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
                        key={item.assetId}
                        type="button"
                        disabled={!canEdit || item.assetId === room.selectedClipId}
                        onClick={() => void sendCommand({
                          type: "SELECT_CLIP",
                          clipId: item.assetId,
                          positionSeconds: mediaRef.current?.currentTime,
                        })}
                        className={`min-w-52 rounded-2xl border p-3 text-left transition ${item.assetId === room.selectedClipId ? "border-[#d8ad56] bg-[#d8ad56]/10" : "border-[#30483d] bg-[#17251e] hover:border-[#6b8376]"}`}
                      >
                        <span className="block truncate text-sm font-black">{item.title}</span>
                        <span className="mt-1 block text-[10px] font-bold uppercase tracking-wide text-[#91a298]">{item.kind} · {isNativePlayable(item) ? "ready" : "source only"}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

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
                          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#91a298]">{candidate.kind} · {candidate.proxyStatus || "registered"}</p>
                        </div>
                        <button type="button" disabled={!canEdit} onClick={() => void sendCommand({ type: "ADD_CLIP", assetId: candidate.assetId }, { success: `${candidate.title} is in Watch.` })} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-[#d8ad56]/60 px-3 text-[10px] font-black uppercase tracking-wide text-[#f6d68f] disabled:opacity-40">
                          <Plus size={13} /> Add
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="mt-5 flex flex-col gap-3 rounded-3xl border border-[#d8ad56]/30 bg-[#d8ad56]/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-serif text-xl font-black">Watched clips → timeline</p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-[#d7c69d]">{room.segments.length} receipt-backed segments · {timelineClipCount} episode timeline clips now stored.</p>
                  {room.timelineSync ? <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#d8ad56]">Last synced by {room.timelineSync.syncedBy} · {room.timelineSync.timelineClipCount} watch clips</p> : null}
                </div>
                <button
                  type="button"
                  disabled={!canEdit || room.status === "playing" || room.segments.length === 0}
                  onClick={() => void sendCommand({ type: "SYNC_TIMELINE" }, { success: "Watched spans are aligned on the episode timeline." })}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-[#d8ad56] px-4 text-xs font-black text-[#172018] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <CheckCircle2 size={16} /> Sync watched spans
                </button>
              </div>
            </div>
          </section>

          <EpisodeRoomChat projectSlug={projectSlug} episodeSlug={episodeSlug} canEdit={canEdit} />
        </div>
      </div>
    </main>
  );
}
