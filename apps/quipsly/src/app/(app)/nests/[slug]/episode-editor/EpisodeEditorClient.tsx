"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AudioEvidenceMap } from "@/components/audio/AudioEvidenceMap";
import { StudioTranscriptReviewDesk } from "@/app/(app)/editor/StudioTranscriptReviewDesk";
import {
  DECISION_SHORTCUTS,
  decisionAt,
  formatEditClock,
  type EpisodeEditDeskPayload,
  type ProgramDecisionKind,
  type ProgramEditSource,
} from "@/lib/editor/program-edit-contract";
import { EpisodeWorkspaceNav } from "../episodes/[episodeSlug]/EpisodeWorkspaceNav";
import { EpisodeCaptureTakeHandoff } from "./EpisodeCaptureTakeHandoff";

const decisionColors: Record<ProgramDecisionKind, string> = {
  primary: "#3ea7b4",
  secondary: "#78995b",
  both: "#d5bd72",
  skip: "#a65337",
  primaryWithClip: "#cf8c38",
  secondaryWithClip: "#b77849",
  bothWithClip: "#d9a32b",
  custom: "#8b7aa8",
};

function SourceMonitorCanvas({
  source,
  videoRefs,
}: {
  source?: ProgramEditSource;
  videoRefs: MutableRefObject<Map<string, HTMLVideoElement>>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let frame = 0;
    const draw = () => {
      context.fillStyle = "#020604";
      context.fillRect(0, 0, canvas.width, canvas.height);
      const video = source ? videoRefs.current.get(source.id) : undefined;
      if (video && video.readyState >= 2 && video.videoWidth && video.videoHeight) {
        const scale = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
        const sourceWidth = canvas.width / scale;
        const sourceHeight = canvas.height / scale;
        context.drawImage(
          video,
          (video.videoWidth - sourceWidth) / 2,
          (video.videoHeight - sourceHeight) / 2,
          sourceWidth,
          sourceHeight,
          0,
          0,
          canvas.width,
          canvas.height,
        );
      } else {
        context.fillStyle = "#738278";
        context.font = "600 22px ui-sans-serif";
        context.textAlign = "center";
        context.fillText(source ? "Proxy unavailable" : "Out of range", canvas.width / 2, canvas.height / 2);
      }
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [source, videoRefs]);
  return <canvas ref={canvasRef} width={640} height={360} className="aspect-video w-full bg-black" />;
}

export default function EpisodeEditorClient({
  initialPayload,
  projectName,
  canonicalWorkspace = false,
  recordingRoomId,
}: {
  initialPayload: EpisodeEditDeskPayload;
  projectName?: string;
  canonicalWorkspace?: boolean;
  recordingRoomId?: string | null;
}) {
  const router = useRouter();
  const [payload, setPayload] = useState(initialPayload);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playMode, setPlayMode] = useState<"edit" | "through">("edit");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("All changes save to the shared edit.");
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [tags, setTags] = useState("");
  const [sourcePlaybackFailures, setSourcePlaybackFailures] = useState<string[]>([]);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const listenAudioRef = useRef<HTMLAudioElement>(null);
  const audioRefs = useRef(new Map<string, HTMLAudioElement>());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRefs = useRef(new Map<string, HTMLVideoElement>());
  const clockRef = useRef<{ wall: number; sequence: number } | null>(null);
  const state = payload.state;
  const episode = payload.selectedEpisode;
  const duration = Math.max(1, state.durationSeconds);
  const protectedBaselineDuration = Math.max(
    0,
    payload.baseline?.durationSeconds ?? state.durationSeconds,
  );
  const watchDerivatives = payload.watchDerivatives;
  const placedWatchDerivatives = watchDerivatives.filter((derivative) => (
    derivative.startSeconds >= 0
    && derivative.startSeconds + derivative.durationSeconds
      <= protectedBaselineDuration
  ));
  const heldWatchDerivativeCount =
    watchDerivatives.length - placedWatchDerivatives.length;
  const currentDecision = useMemo(
    () => decisionAt(state.programDecisions, playhead),
    [state.programDecisions, playhead],
  );
  const activeTranscriptSegment = useMemo(() => (
    payload.transcript.segments.find((segment) => (
      !segment.deactivated
      && playhead >= segment.startSeconds
      && playhead < segment.endSeconds
    )) ?? null
  ), [payload.transcript.segments, playhead]);
  const visibleTranscriptSegments = useMemo(() => {
    const active = payload.transcript.segments.filter((segment) => !segment.deactivated);
    const nearby = active.filter((segment) => (
      segment.startSeconds <= playhead + 35
      && segment.endSeconds >= playhead - 15
    ));
    if (nearby.length) return nearby.slice(0, 18);
    const next = active.findIndex((segment) => segment.startSeconds >= playhead);
    const center = next < 0 ? active.length - 1 : next;
    return active.slice(Math.max(0, center - 3), center + 5);
  }, [payload.transcript.segments, playhead]);
  const transcriptEndSeconds = payload.transcript.segments.reduce(
    (maximum, segment) => Math.max(maximum, segment.endSeconds),
    0,
  ) || null;
  const signalEvidence = payload.signalInspection.evidence;
  const studioReviewEvidence = signalEvidence?.mediaAssetKind === "studio-media"
    && signalEvidence.protectedPlayback
    ? signalEvidence
    : null;
  const selectedMediaChoice = payload.mediaChoices.find((choice) => choice.id === payload.selectedMediaAssetId)
    ?? (payload.mediaChoices.length === 1 ? payload.mediaChoices[0] : null);

  const reportSourcePlaybackFailure = useCallback((sourceId: string) => {
    setSourcePlaybackFailures((current) => current.includes(sourceId)
      ? current
      : [...current, sourceId]);
  }, []);

  const syncMedia = useCallback((time: number, shouldPlay = false) => {
    for (const source of state.sources) {
      const media = source.role === "audio"
        ? audioRefs.current.get(source.id)
        : videoRefs.current.get(source.id);
      if (!media) continue;
      const sourceTime = time - source.offsetSeconds;
      if (sourceTime >= 0 && (!source.durationSeconds || sourceTime <= source.durationSeconds)) {
        if (Math.abs(media.currentTime - sourceTime) > 0.18) media.currentTime = sourceTime;
        if (shouldPlay && media.paused) void media.play().catch(() => reportSourcePlaybackFailure(source.id));
      } else if (!media.paused) {
        media.pause();
      }
    }
    if (listenAudioRef.current && Math.abs(listenAudioRef.current.currentTime - time) > 0.18) {
      listenAudioRef.current.currentTime = time;
      if (shouldPlay && listenAudioRef.current.paused) void listenAudioRef.current.play().catch(() => reportSourcePlaybackFailure("episode-listen-audio"));
    }
  }, [reportSourcePlaybackFailure, state.sources]);

  const seek = useCallback((time: number) => {
    const next = Math.min(duration, Math.max(0, time));
    setPlayhead(next);
    syncMedia(next);
    if (playing) clockRef.current = { wall: performance.now(), sequence: next };
  }, [duration, playing, syncMedia]);

  const stopPlayback = useCallback(() => {
    setPlaying(false);
    clockRef.current = null;
    listenAudioRef.current?.pause();
    audioRefs.current.forEach((audio) => audio.pause());
    videoRefs.current.forEach((video) => video.pause());
  }, []);

  const togglePlayback = useCallback((requestedMode: "edit" | "through" = playMode) => {
    if (playing) {
      stopPlayback();
      return;
    }
    setPlayMode(requestedMode);
    syncMedia(playhead, true);
    clockRef.current = { wall: performance.now(), sequence: playhead };
    setPlaying(true);
  }, [playMode, playhead, playing, stopPlayback, syncMedia]);

  const nextPlayableTime = useCallback((time: number) => {
    const decision = decisionAt(state.programDecisions, time);
    if (decision && decision.kind !== "skip") return time;
    return state.programDecisions.find((candidate) => candidate.startTime > time && candidate.kind !== "skip")?.startTime;
  }, [state.programDecisions]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      const clock = clockRef.current;
      if (!clock) return;
      let next = clock.sequence + (performance.now() - clock.wall) / 1000;
      if (playMode === "edit") {
        const playable = nextPlayableTime(next);
        if (playable === undefined) {
          stopPlayback();
          return;
        }
        if (playable !== next) {
          next = playable;
          clockRef.current = { wall: performance.now(), sequence: next };
        }
      }
      if (next >= duration) {
        setPlayhead(duration);
        stopPlayback();
        return;
      }
      setPlayhead(next);
      syncMedia(next, true);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [duration, nextPlayableTime, playMode, playing, stopPlayback, syncMedia]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let frame = 0;
    const drawCover = (video: HTMLVideoElement, x: number, y: number, width: number, height: number) => {
      if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
      const scale = Math.max(width / video.videoWidth, height / video.videoHeight);
      const sourceWidth = width / scale;
      const sourceHeight = height / scale;
      context.drawImage(
        video,
        (video.videoWidth - sourceWidth) / 2,
        (video.videoHeight - sourceHeight) / 2,
        sourceWidth,
        sourceHeight,
        x,
        y,
        width,
        height,
      );
    };
    const render = () => {
      context.fillStyle = "#020604";
      context.fillRect(0, 0, canvas.width, canvas.height);
      if (!currentDecision || currentDecision.kind === "skip") {
        context.fillStyle = "#8fa094";
        context.font = "600 28px ui-sans-serif";
        context.textAlign = "center";
        context.fillText(
          currentDecision?.kind === "skip"
            ? "Skipped in Play Edit"
            : "Choose Charlie, Homer, Both, or a clip layout",
          canvas.width / 2,
          canvas.height / 2,
        );
      } else {
        const hosts = currentDecision.sourceLaneIDs
          .map((id) => videoRefs.current.get(id))
          .filter((video): video is HTMLVideoElement => Boolean(video));
        const clip = currentDecision.clipLaneID
          ? videoRefs.current.get(currentDecision.clipLaneID)
          : undefined;
        if (clip && hosts.length) {
          drawCover(clip, 0, 0, canvas.width * 0.72, canvas.height);
          const hostHeight = canvas.height / hosts.length;
          hosts.forEach((video, index) => {
            drawCover(video, canvas.width * 0.72, index * hostHeight, canvas.width * 0.28, hostHeight);
          });
        } else if (hosts.length === 2) {
          drawCover(hosts[0], 0, 0, canvas.width / 2, canvas.height);
          drawCover(hosts[1], canvas.width / 2, 0, canvas.width / 2, canvas.height);
        } else if (hosts[0]) {
          drawCover(hosts[0], 0, 0, canvas.width, canvas.height);
        }
      }
      frame = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(frame);
  }, [currentDecision]);

  const post = useCallback(async (body: Record<string, unknown>) => {
    if (!episode) return;
    setSaving(true);
    setMessage("Saving...");
    try {
      const response = await fetch(
        `/api/nests/${encodeURIComponent(payload.projectSlug)}/episode-editor`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            episodeSlug: episode.slug,
            selectedMediaAssetId: payload.selectedMediaAssetId,
            clientRequestId: crypto.randomUUID(),
            ...body,
          }),
        },
      );
      const result = await response.json();
      if (response.status === 409 && result.payload) {
        setPayload((current) => result.payload.inspectionFresh
          ? result.payload
          : {
              ...result.payload,
              signalInspection: current.signalInspection,
              executionInspection: current.executionInspection,
            });
        setMessage(result.error);
        return;
      }
      if (!response.ok) throw new Error(result.error ?? "The edit could not be saved.");
      setPayload((current) => result.inspectionFresh
        ? result
        : {
            ...result,
            signalInspection: current.signalInspection,
            executionInspection: current.executionInspection,
          });
      setMessage(`Saved revision ${result.branch?.headRevision ?? 0}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The edit could not be saved.");
    } finally {
      setSaving(false);
    }
  }, [episode, payload.projectSlug, payload.selectedMediaAssetId]);

  const refreshCanonicalProjection = useCallback(async () => {
    if (!episode) return;
    const query = new URLSearchParams({ episode: episode.slug });
    if (payload.selectedMediaAssetId) query.set("source", payload.selectedMediaAssetId);
    const response = await fetch(
      `/api/nests/${encodeURIComponent(payload.projectSlug)}/episode-editor?${query.toString()}`,
      { cache: "no-store" },
    );
    const result = await response.json() as EpisodeEditDeskPayload & { error?: string };
    if (!response.ok) throw new Error(result.error ?? "The shared Episode projection could not be refreshed.");
    setPayload(result);
    setMessage(result.transcript.status === "available"
      ? `Capture evidence is on the Episode clock · ${result.transcript.segmentCount} timed turns.`
      : "Capture sources are on the Episode clock; transcript evidence is still pending.");
  }, [episode, payload.projectSlug, payload.selectedMediaAssetId]);

  const setDecision = useCallback((kind: ProgramDecisionKind) => {
    if (!payload.canEdit || !payload.branch) return;
    void post({
      action: "set-decision",
      kind,
      sequenceTime: playhead,
      expectedRevision: payload.branch.headRevision,
    });
  }, [payload.branch, payload.canEdit, playhead, post]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable=true]")) return;
      const shortcut = DECISION_SHORTCUTS.find((item) => item.key === event.key);
      if (shortcut) {
        event.preventDefault();
        setDecision(shortcut.kind);
      } else if (event.code === "Space") {
        event.preventDefault();
        togglePlayback("edit");
      } else if (event.key.toLowerCase() === "t") {
        event.preventDefault();
        togglePlayback("through");
      } else if (event.key.toLowerCase() === "m") {
        event.preventDefault();
        setNoteOpen(true);
        requestAnimationFrame(() => noteRef.current?.focus());
      } else if (event.key === "[") {
        event.preventDefault();
        seek(playhead - 1);
      } else if (event.key === "]") {
        event.preventDefault();
        seek(playhead + 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playhead, seek, setDecision, togglePlayback]);

  const changeEpisode = async (episodeSlug: string) => {
    stopPlayback();
    setPlayhead(0);
    const selected = payload.episodes.find((item) => item.slug === episodeSlug);
    if (!selected) return;
    if (canonicalWorkspace) {
      router.push(`/nests/${encodeURIComponent(payload.projectSlug)}/episodes/${encodeURIComponent(selected.slug)}?mode=edit`);
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(
        `/api/nests/${encodeURIComponent(payload.projectSlug)}/episode-editor`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "open-episode", episodeSlug }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Episode could not be opened.");
      setPayload(result);
      setMessage(`${selected.title} is open.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Episode could not be opened.");
    } finally {
      setSaving(false);
    }
  };

  const submitNote = () => {
    if (!note.trim() || !payload.branch) return;
    void post({
      action: "add-annotation",
      sequenceTime: playhead,
      expectedRevision: payload.branch.headRevision,
      kind: "note",
      body: note,
      tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
    });
    setNote("");
    setTags("");
    setNoteOpen(false);
  };

  const spans = state.programDecisions.map((decision, index) => ({
    decision,
    end: state.programDecisions[index + 1]?.startTime ?? duration,
  }));
  const visualSources = state.sources.filter((source) => source.role !== "audio");
  const sourceAtPlayhead = (roles: ProgramEditSource["role"][]) => {
    const decisionIDs = new Set([
      ...(currentDecision?.sourceLaneIDs ?? []),
      ...(currentDecision?.clipLaneID ? [currentDecision.clipLaneID] : []),
    ]);
    return visualSources.find((source) =>
      roles.includes(source.role) &&
      decisionIDs.has(source.id) &&
      playhead >= source.offsetSeconds &&
      playhead <= source.offsetSeconds + source.durationSeconds,
    ) ?? visualSources.find((source) =>
      roles.includes(source.role) &&
      playhead >= source.offsetSeconds &&
      playhead <= source.offsetSeconds + source.durationSeconds,
    );
  };
  const logicalMonitors = [
    { id: "charlie", label: "Charlie", roles: ["primary"] as ProgramEditSource["role"][] },
    { id: "homer", label: "Homer", roles: ["secondary"] as ProgramEditSource["role"][] },
    { id: "clips", label: "Clips", roles: ["clip", "reference"] as ProgramEditSource["role"][] },
  ].map((monitor) => ({ ...monitor, source: sourceAtPlayhead(monitor.roles) }));

  return (
    <main className="min-h-screen bg-[#07110d] text-[#f2ead8]">
      <header className="sticky top-0 z-30 border-b border-[#293d32] bg-[#0a1510]/95 px-5 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-4">
          <div className="mr-auto">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#d8ad56]">{projectName || payload.projectSlug.replaceAll("-", " ")}</p>
            <h1 className="font-serif text-2xl">{episode?.title || "Shared episode editor"}</h1>
          </div>
          <label className="flex items-center gap-2 text-sm text-[#b7c4b8]">
            Episode
            <select
              value={episode?.slug ?? ""}
              onChange={(event) => void changeEpisode(event.target.value)}
              className="min-w-64 rounded-xl border border-[#3b5545] bg-[#14231b] px-3 py-2 text-[#f2ead8]"
            >
              {payload.episodes.map((item) => <option key={item.id} value={item.slug}>{item.title}</option>)}
            </select>
          </label>
          <div className="rounded-xl border border-[#31483b] bg-[#101b15] px-3 py-2 text-xs">
            <span className="text-[#7f9787]">Baseline </span><strong>v{payload.baseline?.version ?? 0}</strong>
            <span className="ml-3 text-[#7f9787]">Revision </span><strong>{payload.branch?.headRevision ?? 0}</strong>
          </div>
          <div className={`rounded-full px-3 py-2 text-xs font-bold ${saving ? "bg-[#745c2d]" : "bg-[#244b34]"}`}>
            {message}
          </div>
          {episode ? <div className="w-full border-t border-[#293d32] pt-3"><EpisodeWorkspaceNav projectSlug={payload.projectSlug} episodeSlug={episode.slug} activeMode="edit" recordingRoomId={recordingRoomId} /></div> : null}
        </div>
      </header>

      <div className="mx-auto grid max-w-[1800px] gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-w-0 space-y-4">
          <div className="overflow-hidden rounded-3xl border border-[#2d4638] bg-black shadow-2xl shadow-black/30">
            <div className="flex items-center justify-between border-b border-[#203328] bg-[#0d1712] px-4 py-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#d8ad56]">Program</p>
                <p className="text-sm text-[#9faf9f]">
                  {currentDecision
                    ? DECISION_SHORTCUTS.find((item) => item.kind === currentDecision.kind)?.label ?? currentDecision.kind
                    : "No decision yet"}
                </p>
              </div>
              <div className="font-mono text-lg text-[#d9e5dc]">{formatEditClock(playhead)}</div>
            </div>
            <div className="flex justify-center bg-black">
              <canvas
                ref={canvasRef}
                width={1280}
                height={720}
                onClick={() => togglePlayback(playMode)}
                className="aspect-video max-h-[52vh] w-auto max-w-full cursor-pointer bg-black"
              />
            </div>
          </div>

          {sourcePlaybackFailures.length ? (
            <div role="alert" className="rounded-2xl border border-amber-500/40 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
              <strong className="block">{sourcePlaybackFailures.length} protected {sourcePlaybackFailures.length === 1 ? "source could" : "sources could"} not be loaded here.</strong>
              <span className="mt-1 block text-xs leading-5 text-amber-100/80">The edit and source receipts remain safe. Reconnect or restore the source before playback, transcript correction, or rendering.</span>
            </div>
          ) : null}

          <div className="rounded-3xl border border-[#2d4638] bg-[#0d1712] p-4">
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => togglePlayback("edit")} className="rounded-xl bg-[#d8ad56] px-5 py-3 font-black text-[#172018]">
                {playing && playMode === "edit" ? "Pause" : "Play Edit"} <span className="ml-2 text-xs opacity-70">Space</span>
              </button>
              <button onClick={() => togglePlayback("through")} className="rounded-xl border border-[#3b5545] bg-[#14231b] px-4 py-3 font-black text-[#d9e5dc]">
                {playing && playMode === "through" ? "Pause" : "Play Through"} <span className="ml-2 text-xs opacity-70">T</span>
              </button>
              {DECISION_SHORTCUTS.map((item) => (
                <button
                  key={item.key}
                  disabled={!payload.canEdit || saving}
                  onClick={() => setDecision(item.kind)}
                  title={`Press ${item.key}`}
                  className="rounded-xl border border-[#3b5545] px-3 py-3 text-sm font-bold disabled:opacity-40"
                  style={{ backgroundColor: `${decisionColors[item.kind]}33` }}
                >
                  <span className="mr-2 rounded bg-black/30 px-1.5 py-0.5 font-mono">{item.key}</span>{item.label}
                </button>
              ))}
              <button
                onClick={() => {
                  setNoteOpen(true);
                  requestAnimationFrame(() => noteRef.current?.focus());
                }}
                className="ml-auto rounded-xl border border-[#7b6842] px-4 py-3 font-bold text-[#e5c575]"
              >
                Note <span className="ml-2 text-xs">M</span>
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-[#2d4638] bg-[#0d1712] p-4">
            <div className="mb-3 flex items-end justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#d8ad56]">Decision timeline</p>
                <p className="text-sm text-[#8fa094]">Whole sources stay intact. Colored spans are display decisions.</p>
              </div>
              <span className="font-mono text-sm text-[#b7c4b8]">{formatEditClock(duration)}</span>
            </div>
            <div
              className="relative h-24 overflow-hidden rounded-2xl border border-[#30483a] bg-[#07100c]"
              onClick={(event) => {
                const bounds = event.currentTarget.getBoundingClientRect();
                seek(((event.clientX - bounds.left) / bounds.width) * duration);
              }}
            >
              {spans.map(({ decision, end }) => (
                <button
                  key={decision.id}
                  className="absolute inset-y-3 border-r border-black/30 opacity-90 hover:brightness-125"
                  title={`${decision.kind} at ${formatEditClock(decision.startTime)}`}
                  style={{
                    left: `${(decision.startTime / duration) * 100}%`,
                    width: `${Math.max(0.15, ((end - decision.startTime) / duration) * 100)}%`,
                    backgroundColor: decisionColors[decision.kind],
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    seek(decision.startTime);
                  }}
                />
              ))}
              {payload.annotations.map((annotation) => (
                <button
                  key={annotation.id}
                  title={annotation.body ?? "Note"}
                  className="absolute bottom-0 h-4 w-1 -translate-x-1/2 bg-[#f0d48b]"
                  style={{ left: `${(annotation.startSeconds / duration) * 100}%` }}
                  onClick={(event) => {
                    event.stopPropagation();
                    seek(annotation.startSeconds);
                  }}
                />
              ))}
              <div
                className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_12px_white]"
                style={{ left: `${(playhead / duration) * 100}%` }}
              />
            </div>
            <input
              aria-label="Episode playhead"
              type="range"
              min={0}
              max={duration}
              step={1 / 30}
              value={playhead}
              onChange={(event) => seek(Number(event.target.value))}
              className="mt-3 w-full accent-[#d8ad56]"
            />
            <div className="mt-5 border-t border-[#30483a] pt-4">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#d8ad56]">Shared Watch derivatives</p>
                  <p className="mt-1 text-sm text-[#8fa094]">Receipt-backed clip spans from the current Episode Room pass. The protected source baseline stays unchanged.</p>
                </div>
                <span className="rounded-full bg-[#14231b] px-3 py-1 text-xs font-black text-[#d7c69d]">
                  {watchDerivatives.length} synced
                </span>
              </div>
              <div className="relative mt-3 h-16 overflow-hidden rounded-2xl border border-[#30483a] bg-[#07100c]">
                {placedWatchDerivatives.map((derivative) => (
                  <button
                    key={derivative.id}
                    type="button"
                    aria-label={`${derivative.name} at ${formatEditClock(derivative.startSeconds)}`}
                    title={`${derivative.name} · source ${formatEditClock(derivative.sourceStartSeconds)}–${formatEditClock(derivative.sourceEndSeconds)} · receipts ${derivative.startReceiptId} / ${derivative.endReceiptId}`}
                    className="absolute inset-y-2 min-w-1 rounded-md border border-white/20 opacity-90 hover:brightness-125"
                    style={{
                      left: `${(derivative.startSeconds / duration) * 100}%`,
                      width: `${Math.max(0.15, (derivative.durationSeconds / duration) * 100)}%`,
                      backgroundColor: derivative.color,
                    }}
                    onClick={() => seek(derivative.startSeconds)}
                  />
                ))}
                {!placedWatchDerivatives.length ? (
                  <p className="flex h-full items-center justify-center px-4 text-center text-xs font-semibold text-[#7f9787]">
                    No current-pass watch derivatives are placed on this protected timeline yet.
                  </p>
                ) : null}
                <div
                  className="pointer-events-none absolute inset-y-0 w-0.5 bg-white/70"
                  style={{ left: `${(playhead / duration) * 100}%` }}
                />
              </div>
              {heldWatchDerivativeCount ? (
                <p className="mt-2 rounded-xl border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-xs font-semibold text-amber-100">
                  {heldWatchDerivativeCount} watch {heldWatchDerivativeCount === 1 ? "span is" : "spans are"} outside this protected baseline and {heldWatchDerivativeCount === 1 ? "remains" : "remain"} held for alignment review.
                </p>
              ) : null}
            </div>
          </div>

          <section className="rounded-3xl border border-[#2d4638] bg-[#0d1712] p-4" aria-labelledby="episode-transcript-heading">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#d8ad56]">Transcript edit map</p>
                <h2 id="episode-transcript-heading" className="mt-1 font-serif text-2xl">Read, listen, and cut on one clock</h2>
                <p className="mt-1 max-w-3xl text-sm text-[#8fa094]">Provider words remain immutable. Clicking a line moves the shared edit playhead; reviewed corrections remain source-bound overlays.</p>
              </div>
              <div className="flex gap-2 text-center text-xs">
                <div className="rounded-xl bg-[#14231b] px-3 py-2"><strong className="block text-lg">{payload.transcript.segmentCount}</strong>timed</div>
                <div className="rounded-xl bg-[#14231b] px-3 py-2"><strong className="block text-lg">{payload.transcript.reviewedSegmentCount}</strong>reviewed</div>
              </div>
            </div>
            {payload.transcript.status === "available" ? (
              <>
                <div className="mt-4 rounded-2xl border border-[#405a49] bg-[#08110d] p-4" aria-live="polite">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-xs text-[#d8ad56]">{formatEditClock(activeTranscriptSegment?.startSeconds ?? playhead)}</span>
                    <span className="rounded-full bg-[#1c3427] px-2 py-1 text-[10px] font-black uppercase text-[#9ac9a8]">
                      {activeTranscriptSegment ? `${activeTranscriptSegment.timelineClock} clock · ${activeTranscriptSegment.reviewStatus}` : "between segments"}
                    </span>
                  </div>
                  <p className="mt-2 font-serif text-xl leading-relaxed text-[#f2ead8]">
                    {activeTranscriptSegment?.text ?? "Move the playhead or choose a transcript line to inspect the source clock."}
                  </p>
                  {activeTranscriptSegment?.speakerLabel ? <p className="mt-2 text-xs font-black uppercase tracking-wide text-[#8fa094]">{activeTranscriptSegment.speakerLabel}</p> : null}
                </div>
                <div className="mt-3 max-h-80 space-y-1 overflow-y-auto pr-1" aria-label="Nearby transcript segments">
                  {visibleTranscriptSegments.map((segment) => (
                    <button
                      key={segment.id}
                      type="button"
                      onClick={() => seek(segment.startSeconds)}
                      aria-current={segment.id === activeTranscriptSegment?.id ? "true" : undefined}
                      className={`grid w-full grid-cols-[76px_minmax(0,1fr)] gap-3 rounded-xl px-3 py-2.5 text-left transition ${segment.id === activeTranscriptSegment?.id ? "bg-[#274635] ring-1 ring-[#d8ad56]" : "bg-[#14231b] hover:bg-[#1b3024]"}`}
                    >
                      <span className="font-mono text-xs text-[#d8ad56]">{formatEditClock(segment.startSeconds).slice(0, 8)}</span>
                      <span>
                        <span className="block text-sm leading-5 text-[#edf1eb]">{segment.text}</span>
                        <span className="mt-1 block text-[10px] font-bold uppercase tracking-wide text-[#7f9787]">
                          {[
                            segment.speakerLabel,
                            `${segment.timelineClock} clock`,
                            segment.timelineClock === "episode" && segment.sourceStartSeconds !== null
                              ? `source ${formatEditClock(segment.sourceStartSeconds).slice(0, 8)}`
                              : null,
                            segment.reviewStatus,
                            segment.deactivated ? "held from edit" : null,
                          ].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="mt-4 rounded-2xl border border-[#405a49] bg-[#08110d] p-4 text-sm text-[#b7c4b8]">
                <strong className="block text-[#f2ead8]">Timed transcript unavailable</strong>
                <span className="mt-1 block">{payload.transcript.reason}</span>
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-[#2d4638] bg-[#0d1712] p-4" aria-labelledby="episode-audio-evidence-heading">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#d8ad56]">Audio evidence</p>
                <h2 id="episode-audio-evidence-heading" className="mt-1 font-serif text-2xl">See the recording before changing it</h2>
                <p className="mt-1 max-w-3xl text-sm text-[#8fa094]">Complete-decode level and frequency evidence stays bound to one immutable source. Quipsly will not guess when several sources could own the waveform.</p>
              </div>
              <span className={`rounded-full px-3 py-2 text-xs font-black uppercase ${payload.signalInspection.status === "available" ? "bg-[#244b34] text-[#b8e0c4]" : payload.signalInspection.status === "held" || payload.signalInspection.status === "ambiguous" ? "bg-amber-900/50 text-amber-100" : "bg-[#26342c] text-[#a7b6ab]"}`}>
                {payload.signalInspection.status}
              </span>
            </div>
            <p className="mt-3 rounded-xl bg-[#14231b] px-3 py-2 text-xs font-semibold text-[#b7c4b8]">{payload.signalInspection.reason}</p>
            {payload.mediaChoices.length > 1 && episode ? (
              <label className="mt-3 grid gap-2 rounded-xl border border-[#405a49] bg-[#101b15] p-3 text-xs font-black uppercase tracking-wide text-[#b7c4b8]">
                Exact transcript / audio source
                <select
                  aria-label="Exact transcript and audio source"
                  value={payload.selectedMediaAssetId ?? ""}
                  onChange={(event) => {
                    const source = event.target.value;
                    const base = `/nests/${encodeURIComponent(payload.projectSlug)}/episodes/${encodeURIComponent(episode.slug)}?mode=edit`;
                    router.push(source ? `${base}&source=${encodeURIComponent(source)}` : base);
                  }}
                  className="rounded-xl border border-[#587160] bg-[#07110d] px-3 py-3 text-sm font-semibold normal-case tracking-normal text-[#f2ead8]"
                >
                  <option value="">Choose one source (Quipsly will not guess)</option>
                  {payload.mediaChoices.map((choice) => (
                    <option key={choice.id} value={choice.id}>{choice.label} · {choice.kind}{choice.role ? ` · ${choice.role}` : ""}</option>
                  ))}
                </select>
              </label>
            ) : null}
            {episode && selectedMediaChoice?.captureGroupId && payload.timelineFingerprint ? (
              <EpisodeCaptureTakeHandoff
                projectSlug={payload.projectSlug}
                episodeSlug={episode.slug}
                captureGroupId={selectedMediaChoice.captureGroupId}
                expectedTimelineFingerprint={payload.timelineFingerprint}
                canEdit={payload.canEdit}
                onMaterialized={refreshCanonicalProjection}
              />
            ) : null}
            {signalEvidence ? (
              <AudioEvidenceMap
                signal={signalEvidence.signal}
                timelineEvents={[]}
                transcriptEndSeconds={transcriptEndSeconds}
                playbackReady={false}
                selectedSeconds={playhead}
                onSelect={(seconds) => seek(seconds)}
                transcriptScopeLabel={`${payload.transcript.segmentCount} timed Episode segments`}
              />
            ) : (
              <div className="mt-3 rounded-xl border border-dashed border-[#405a49] p-4 text-sm text-[#8fa094]">
                {payload.signalInspection.status === "ambiguous"
                  ? `${payload.signalInspection.candidateCount} released signal sources are attached. Source selection is required before waveform inspection.`
                  : "Use Audio to decode, diagnose, and release source-bound evidence; this editor will pick it up without copying the source."}
              </div>
            )}
            {studioReviewEvidence && episode ? (
              <div className="mt-4 border-t border-[#30483a] pt-4">
                <StudioTranscriptReviewDesk
                  projectId={payload.projectId ?? undefined}
                  projectSlug={payload.projectSlug}
                  episodeSlug={episode.slug}
                  assetId={studioReviewEvidence.mediaAssetId}
                  sourceId={studioReviewEvidence.protectedPlayback!.sourceId}
                  audioSignal={studioReviewEvidence.signal}
                  audioSignalStatus="completed"
                />
              </div>
            ) : (
              <p className="mt-3 text-xs text-[#7f9787]">Playback-correction controls appear here only when one exact protected Studio source owns both transcript and signal evidence. Capture review remains in the source Session until that binding is materialized.</p>
            )}
          </section>

          {noteOpen ? (
            <div className="rounded-3xl border border-[#7b6842] bg-[#151d16] p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-xl">Note at {formatEditClock(playhead)}</h2>
                <button onClick={() => setNoteOpen(false)} className="text-[#9faf9f]">Close</button>
              </div>
              <textarea
                ref={noteRef}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="What should happen here?"
                className="mt-3 min-h-24 w-full rounded-2xl border border-[#405a49] bg-[#09120d] p-4 text-[#f2ead8] outline-none focus:border-[#d8ad56]"
              />
              <input
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                placeholder="Tags, comma separated: intro, drop, story"
                className="mt-2 w-full rounded-xl border border-[#405a49] bg-[#09120d] px-4 py-3 text-[#f2ead8]"
              />
              <button
                disabled={!note.trim() || saving}
                onClick={submitNote}
                className="mt-3 rounded-xl bg-[#d8ad56] px-5 py-3 font-black text-[#172018] disabled:opacity-40"
              >
                Save note
              </button>
            </div>
          ) : null}
        </section>

        <aside className="space-y-3 xl:max-h-[calc(100vh-92px)] xl:overflow-y-auto xl:pr-1">
          <div className="rounded-2xl border border-[#2d4638] bg-[#0d1712] p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#d8ad56]">Protected sync baseline</p>
            <h2 className="mt-1 font-serif text-xl">{payload.baseline?.label ?? "Waiting for baseline"}</h2>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-xl bg-[#14231b] p-2"><strong className="block text-lg">{state.sources.length}</strong>sources</div>
              <div className="rounded-xl bg-[#14231b] p-2"><strong className="block text-lg">{String(payload.baseline?.syncSummary.proxyReadyCount ?? 0)}</strong>proxies</div>
              <div className="rounded-xl bg-[#14231b] p-2"><strong className="block text-lg">v{payload.baseline?.version ?? 0}</strong>baseline</div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#2d4638] bg-[#0d1712] p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#d8ad56]">Every synced source</p>
            <p className="mt-1 text-xs text-[#8fa094]">Three editorial monitors. Segmented files stay whole underneath.</p>
          </div>
          {logicalMonitors.map((monitor) => (
            <article key={monitor.id} className="overflow-hidden rounded-2xl border border-[#30483a] bg-[#101b15]">
              <div className="flex items-center justify-between px-3 py-2">
                <strong className="truncate text-sm">{monitor.label}</strong>
                <span className="rounded-full bg-[#1e3828] px-2 py-1 text-[10px] uppercase text-[#8bc59c]">
                  {monitor.source ? "in range" : "gap"}
                </span>
              </div>
              <SourceMonitorCanvas source={monitor.source} videoRefs={videoRefs} />
              <div className="flex justify-between px-3 py-2 font-mono text-[10px] text-[#8fa094]">
                <span className="truncate pr-2">{monitor.source?.label ?? "No source at this time"}</span>
                <span>{monitor.source ? formatEditClock(playhead - monitor.source.offsetSeconds) : "--:--"}</span>
              </div>
            </article>
          ))}

          <div className="rounded-2xl border border-[#2d4638] bg-[#0d1712] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#d8ad56]">Compute and delivery</p>
              <span className="rounded-full bg-[#244b34] px-2 py-1 text-[10px] font-black uppercase text-[#b8e0c4]">browser ready</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-[#b7c4b8]">{payload.executionInspection.browser.detail}</p>
            <div className="mt-3 rounded-xl border border-[#405a49] bg-[#14231b] p-3">
              <div className="flex items-center justify-between gap-2">
                <strong className="text-sm">Advanced Studio</strong>
                <span className="rounded-full bg-[#26342c] px-2 py-1 text-[9px] font-black uppercase text-[#a7b6ab]">heartbeat unobserved</span>
              </div>
              <p className="mt-1 text-xs leading-5 text-[#8fa094]">{payload.executionInspection.native.detail}</p>
              {episode ? <Link href={`/editor?project=${encodeURIComponent(payload.projectSlug)}&episode=${encodeURIComponent(episode.slug)}`} className="mt-2 inline-flex min-h-9 items-center rounded-lg border border-[#587160] px-3 text-xs font-black text-[#e7c97d] hover:border-[#d8ad56]">Open Advanced Studio</Link> : null}
            </div>
            <div className="mt-3 space-y-2">
              {payload.executionInspection.jobs.map((job) => (
                <div key={job.id} className="rounded-xl bg-[#14231b] p-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <strong className="truncate">{job.type.replaceAll("-", " ")}</strong>
                    <span className="shrink-0 rounded-full bg-[#26342c] px-2 py-1 text-[9px] font-black uppercase text-[#b7c4b8]">{job.status}</span>
                  </div>
                  <p className="mt-1 text-[#8fa094]">{job.lane.replaceAll("-", " ")}{job.provider ? ` · ${job.provider}` : " · provider not recorded"}</p>
                  {job.error ? <p className="mt-1 line-clamp-3 text-rose-200">{job.error}</p> : null}
                </div>
              ))}
              {!payload.executionInspection.jobs.length ? <p className="rounded-xl border border-dashed border-[#405a49] p-3 text-xs text-[#8fa094]">No render, proxy, mastery, or delivery job is queued for this Episode. Browser edits are still saved normally.</p> : null}
            </div>
          </div>

          <div className="rounded-2xl border border-[#2d4638] bg-[#0d1712] p-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#d8ad56]">Notes and tags</p>
              <span className="text-xs text-[#8fa094]">{payload.annotations.length}</span>
            </div>
            <div className="mt-3 space-y-2">
              {payload.annotations.slice(-12).reverse().map((annotation) => (
                <button
                  key={annotation.id}
                  onClick={() => seek(annotation.startSeconds)}
                  className="block w-full rounded-xl bg-[#14231b] p-3 text-left hover:bg-[#1b3024]"
                >
                  <span className="font-mono text-xs text-[#d8ad56]">{formatEditClock(annotation.startSeconds)}</span>
                  <span className="mt-1 block text-sm">{annotation.body}</span>
                  <span className="mt-1 block text-[10px] text-[#7f9787]">
                    {annotation.createdByEmail ?? annotation.createdByActorType}
                  </span>
                </button>
              ))}
              {!payload.annotations.length ? <p className="text-sm text-[#7f9787]">Press M to leave the first note.</p> : null}
            </div>
          </div>
        </aside>
      </div>
      <div className="hidden" aria-hidden="true">
        {visualSources.filter((source) => source.playbackUrl).map((source) => (
          <video
            key={source.id}
            ref={(element) => {
              if (element) videoRefs.current.set(source.id, element);
              else videoRefs.current.delete(source.id);
            }}
            src={source.playbackUrl}
            onError={() => reportSourcePlaybackFailure(source.id)}
            muted
            playsInline
            preload="metadata"
          />
        ))}
        {state.sources.filter((source) => source.role === "audio" && source.playbackUrl).map((source) => (
          <audio
            key={source.id}
            ref={(element) => {
              if (element) audioRefs.current.set(source.id, element);
              else audioRefs.current.delete(source.id);
            }}
            src={source.playbackUrl}
            onError={() => reportSourcePlaybackFailure(source.id)}
            preload="metadata"
          />
        ))}
        {state.listenAudioUrl ? <audio ref={listenAudioRef} src={state.listenAudioUrl} onError={() => reportSourcePlaybackFailure("episode-listen-audio")} preload="metadata" /> : null}
      </div>
    </main>
  );
}
