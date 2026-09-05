"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";

import type { AudioEvidenceTranscriptWord } from "./AudioEvidenceMap";
import {
  adjacentSpectralMoment,
  nearestSpectralLoudnessPoint,
  spectralEvidenceAtTime,
  spectralOverlayMoments,
  spectralTranscriptSlices,
  type SpectralEvidenceMarker,
  type SpectralLoudnessEvidence,
} from "./spectral-evidence-overlay";

type LevelId = "overview" | "browse" | "detail";
type SpectralStatus = {
  ok?: boolean;
  jobId: string | null;
  status: "not-queued" | "queued" | "processing" | "output-ready" | "completed" | "blocked" | "failed";
  media: null | { sampleRate: number; channelCount: number; durationSeconds: number; minimumFrequencyHz: number; maximumFrequencyHz: number };
  pyramid: null | {
    tileWidth: 512;
    tileHeight: 192;
    frequencyScale: "logarithmic";
    frequencyOrientation: "high-to-low";
    dynamicRangeDb: 120;
    upperLimitDbfs: 0;
    levels: Array<{ id: LevelId; tileSpanSeconds: number; tileCount: number }>;
  };
  error: string | null;
  updatedAt: string | null;
};

type ViewMode = "whole" | "minute" | "detail";
const EMPTY: SpectralStatus = { jobId: null, status: "not-queued", media: null, pyramid: null, error: null, updatedAt: null };
const NO_WORDS: AudioEvidenceTranscriptWord[] = [];
const NO_MARKERS: SpectralEvidenceMarker[] = [];

function clock(seconds: number) {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainder = Math.floor(safe % 60).toString().padStart(2, "0");
  return hours ? `${hours}:${minutes.toString().padStart(2, "0")}:${remainder}` : `${minutes}:${remainder}`;
}

function viewFor(mode: ViewMode, duration: number, selectedSeconds: number) {
  const requested = mode === "whole" ? duration : mode === "minute" ? 60 : 10;
  const span = Math.min(Math.max(requested, 0.01), duration);
  const start = Math.max(0, Math.min(duration - span, selectedSeconds - span / 2));
  return { start, end: start + span, span };
}

function levelFor(mode: ViewMode): LevelId { return mode === "whole" ? "overview" : mode === "minute" ? "browse" : "detail"; }

export function SpectralEvidenceViewer({
  projectId,
  projectSlug,
  assetId,
  sourceId,
  selectedSeconds,
  playbackReady,
  onSelect,
  transcriptWords = NO_WORDS,
  lowConfidenceThreshold = null,
  transcriptEndSeconds = null,
  transcriptScopeLabel = "Timed transcript",
  evidenceMarkers = NO_MARKERS,
  loudnessEvidence = null,
}: {
  projectId?: string;
  projectSlug: string;
  assetId: string;
  sourceId: string;
  selectedSeconds: number;
  playbackReady: boolean;
  onSelect: (seconds: number, play: boolean) => void;
  transcriptWords?: AudioEvidenceTranscriptWord[];
  lowConfidenceThreshold?: number | null;
  transcriptEndSeconds?: number | null;
  transcriptScopeLabel?: string;
  evidenceMarkers?: SpectralEvidenceMarker[];
  loudnessEvidence?: SpectralLoudnessEvidence | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const cacheRef = useRef(new Map<string, Uint8Array>());
  const [status, setStatus] = useState<SpectralStatus>(EMPTY);
  const [viewMode, setViewMode] = useState<ViewMode>("whole");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("Checking source-bound spectral evidence…");
  const [renderRevision, setRenderRevision] = useState(0);
  const [canvasWidth, setCanvasWidth] = useState(900);

  const query = useMemo(
    () => new URLSearchParams({ ...(projectId ? { projectId } : {}), projectSlug, assetId }),
    [assetId, projectId, projectSlug],
  );
  const readStatus = useCallback(async () => {
    const response = await fetch(`/api/media-vault/audio-spectral-evidence?${query.toString()}`, { cache: "no-store" });
    const payload = await response.json().catch(() => null) as (SpectralStatus & { error?: string }) | null;
    if (!response.ok || !payload?.ok || !payload.status || !["not-queued", "queued", "processing", "output-ready", "completed", "blocked", "failed"].includes(payload.status)) throw new Error(payload?.error || `Spectral status returned HTTP ${response.status}.`);
    setStatus(payload);
    return payload;
  }, [query]);

  useEffect(() => { void readStatus().catch((error) => setMessage(error instanceof Error ? error.message : "Spectral evidence is unavailable.")); }, [readStatus]);
  useEffect(() => {
    const element = shellRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => setCanvasWidth(Math.max(320, Math.floor(entries[0]?.contentRect.width || 900))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const operate = useCallback(async () => {
    setWorking(true);
    setMessage("Starting complete-decode spectral analysis…");
    try {
      const request = async (action: "queue" | "reconcile") => {
        const response = await fetch("/api/media-vault/audio-spectral-evidence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...(projectId ? { projectId } : {}), projectSlug, assetId, sourceId }) });
        const payload = await response.json().catch(() => null) as (SpectralStatus & { error?: string }) | null;
        if (!response.ok || !payload?.ok || !payload.status || !["not-queued", "queued", "processing", "output-ready", "completed", "blocked", "failed"].includes(payload.status)) throw new Error(payload?.error || `Spectral operation returned HTTP ${response.status}.`);
        setStatus(payload);
        return payload;
      };
      let next = await request("queue");
      for (let attempt = 0; attempt < 600 && next.status !== "completed"; attempt += 1) {
        if (next.status === "failed" || next.status === "blocked") throw new Error(next.error || "Spectral analysis failed.");
        setMessage(next.status === "output-ready" ? "Verifying the source and tile-pack byte receipts…" : "Building logarithmic source-clock tiles; original media remains untouched…");
        await new Promise((resolve) => window.setTimeout(resolve, 1_000));
        next = await request("reconcile");
      }
      if (next.status !== "completed" || !next.pyramid || !next.media) throw new Error("Spectral analysis is still processing and can be resumed safely.");
      cacheRef.current.clear();
      setRenderRevision((revision) => revision + 1);
      setMessage("Verified multiresolution spectral evidence is ready.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Spectral analysis could not finish.");
    } finally { setWorking(false); }
  }, [assetId, projectId, projectSlug, sourceId]);

  const duration = status.media?.durationSeconds ?? 0;
  const view = useMemo(() => viewFor(viewMode, Math.max(duration, 0.01), selectedSeconds), [duration, selectedSeconds, viewMode]);
  const currentLevel = status.pyramid?.levels.find((level) => level.id === levelFor(viewMode)) ?? null;
  const transcriptSlices = useMemo(
    () => spectralTranscriptSlices(transcriptWords, view.start, view.end, lowConfidenceThreshold),
    [lowConfidenceThreshold, transcriptWords, view.end, view.start],
  );
  const overlayMoments = useMemo(
    () => spectralOverlayMoments(evidenceMarkers, transcriptWords, lowConfidenceThreshold),
    [evidenceMarkers, lowConfidenceThreshold, transcriptWords],
  );
  const selectedEvidence = useMemo(
    () => spectralEvidenceAtTime(evidenceMarkers, transcriptWords, selectedSeconds),
    [evidenceMarkers, selectedSeconds, transcriptWords],
  );
  const selectedLoudness = useMemo(
    () => nearestSpectralLoudnessPoint(loudnessEvidence?.points ?? [], selectedSeconds),
    [loudnessEvidence?.points, selectedSeconds],
  );
  const visibleMarkers = useMemo(
    () => evidenceMarkers.filter((marker) => marker.startSeconds < view.end && marker.endSeconds >= view.start),
    [evidenceMarkers, view.end, view.start],
  );
  const visibleLoudnessPoints = useMemo(
    () => (loudnessEvidence?.points ?? []).filter((point) => point.timeSeconds >= view.start && point.timeSeconds <= view.end && point.shortTermLufs !== null),
    [loudnessEvidence?.points, view.end, view.start],
  );
  const loudnessPath = useMemo(() => visibleLoudnessPoints.map((point, index) => {
    const x = ((point.timeSeconds - view.start) / view.span) * 100;
    const y = ((0 - Math.max(-60, Math.min(0, point.shortTermLufs as number))) / 60) * 32 + 3;
    return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" "), [view.span, view.start, visibleLoudnessPoints]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || status.status !== "completed" || !status.jobId || !status.media || !status.pyramid || !currentLevel) return;
    const jobId = status.jobId;
    const media = status.media;
    const pyramid = status.pyramid;
    let canceled = false;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const displayWidth = Math.max(320, canvasWidth);
    const displayHeight = Math.max(180, Math.round(displayWidth * 0.31));
    canvas.width = Math.round(displayWidth * pixelRatio);
    canvas.height = Math.round(displayHeight * pixelRatio);
    canvas.style.height = `${displayHeight}px`;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    const paint = async () => {
      context.fillStyle = "#020617";
      context.fillRect(0, 0, displayWidth, displayHeight);
      const firstTile = Math.floor(view.start / currentLevel.tileSpanSeconds);
      const lastTile = Math.min(currentLevel.tileCount - 1, Math.floor(Math.max(view.start, view.end - 0.000001) / currentLevel.tileSpanSeconds));
      for (let tileIndex = firstTile; tileIndex <= lastTile; tileIndex += 1) {
        const cacheKey = `${jobId}:${currentLevel.id}:${tileIndex}`;
        let bytes = cacheRef.current.get(cacheKey);
        if (!bytes) {
          const params = new URLSearchParams({ ...(projectId ? { projectId } : {}), projectSlug, assetId, jobId, level: currentLevel.id, tile: String(tileIndex) });
          const response = await fetch(`/api/media-vault/audio-spectral-evidence/tile?${params.toString()}`, { cache: "force-cache" });
          if (!response.ok) throw new Error(`Spectral tile ${tileIndex} returned HTTP ${response.status}.`);
          bytes = new Uint8Array(await response.arrayBuffer());
          if (bytes.length !== pyramid.tileWidth * pyramid.tileHeight) throw new Error("Spectral tile byte length failed validation.");
          cacheRef.current.set(cacheKey, bytes);
        }
        if (canceled) return;
        const image = new ImageData(pyramid.tileWidth, pyramid.tileHeight);
        for (let index = 0; index < bytes.length; index += 1) {
          const [red, green, blue] = spectralColor(bytes[index] / 255);
          const offset = index * 4;
          image.data[offset] = red;
          image.data[offset + 1] = green;
          image.data[offset + 2] = blue;
          image.data[offset + 3] = 255;
        }
        const tileCanvas = document.createElement("canvas");
        tileCanvas.width = pyramid.tileWidth;
        tileCanvas.height = pyramid.tileHeight;
        tileCanvas.getContext("2d")?.putImageData(image, 0, 0);
        const tileStart = tileIndex * currentLevel.tileSpanSeconds;
        const tileEnd = Math.min(media.durationSeconds, tileStart + currentLevel.tileSpanSeconds);
        const visibleStart = Math.max(view.start, tileStart);
        const visibleEnd = Math.min(view.end, tileEnd);
        const sourceX = (visibleStart - tileStart) / Math.max(tileEnd - tileStart, 0.001) * pyramid.tileWidth;
        const sourceWidth = (visibleEnd - visibleStart) / Math.max(tileEnd - tileStart, 0.001) * pyramid.tileWidth;
        const targetX = (visibleStart - view.start) / view.span * displayWidth;
        const targetWidth = (visibleEnd - visibleStart) / view.span * displayWidth;
        context.drawImage(tileCanvas, sourceX, 0, sourceWidth, pyramid.tileHeight, targetX, 0, targetWidth, displayHeight);
      }
      if (selectedSeconds >= view.start && selectedSeconds <= view.end) {
        const x = (selectedSeconds - view.start) / view.span * displayWidth;
        context.fillStyle = "rgba(255,255,255,0.95)";
        context.fillRect(Math.round(x) - 1, 0, 2, displayHeight);
      }
    };
    void paint().catch((error) => { if (!canceled) setMessage(error instanceof Error ? error.message : "Spectral tiles could not be painted."); });
    return () => { canceled = true; };
  }, [assetId, canvasWidth, currentLevel, duration, projectId, projectSlug, renderRevision, selectedSeconds, status.jobId, status.media, status.pyramid, status.status, view]);

  const chooseAtClientX = useCallback((clientX: number, play: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (clientX - bounds.left) / Math.max(bounds.width, 1)));
    onSelect(view.start + fraction * view.span, play);
  }, [onSelect, view]);
  const onCanvasKey = (event: KeyboardEvent<HTMLCanvasElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Enter", " "].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Enter" || event.key === " ") onSelect(selectedSeconds, playbackReady);
    else onSelect(Math.max(view.start, Math.min(view.end, selectedSeconds + (event.key === "ArrowLeft" ? -1 : 1) * Math.max(view.span / 100, 0.1))), false);
  };
  const inspectAdjacent = (direction: "previous" | "next") => {
    const moment = adjacentSpectralMoment(overlayMoments, selectedSeconds, direction);
    if (!moment) return;
    setViewMode("detail");
    onSelect(moment.startSeconds, false);
  };
  const percentWithinView = (seconds: number) => Math.max(0, Math.min(100, ((seconds - view.start) / view.span) * 100));

  return <section className="mt-3 rounded-xl border border-indigo-300 bg-slate-950 p-3 text-white sm:p-4" aria-label="High-resolution spectral evidence">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-indigo-200">Spectral evidence view</p><h4 className="mt-1 text-sm font-black">See time, frequency, and level on the immutable source clock</h4><p className="mt-1 max-w-3xl text-[10px] font-bold leading-4 text-slate-400">Native complete-decode STFT evidence. Bright regions contain more energy; a visible pattern is a listening target, never an automatic EQ or edit decision.</p></div>
      <span className={`rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-wide ${status.status === "completed" ? "border-emerald-700 bg-emerald-950 text-emerald-200" : status.status === "failed" ? "border-rose-700 bg-rose-950 text-rose-200" : "border-amber-700 bg-amber-950 text-amber-200"}`}>{status.status.replaceAll("-", " ")}</span>
    </div>
    {status.status === "completed" && status.media && status.pyramid ? <>
      <div className="mt-3 grid grid-cols-3 gap-1 rounded-lg border border-slate-700 bg-slate-900 p-1" role="group" aria-label="Spectral zoom">
        {(["whole", "minute", "detail"] as const).map((mode) => <button key={mode} type="button" aria-pressed={viewMode === mode} onClick={() => setViewMode(mode)} className={`rounded-md px-2 py-2 text-[10px] font-black ${viewMode === mode ? "bg-indigo-200 text-indigo-950" : "text-slate-300 hover:bg-slate-800"}`}>{mode === "whole" ? "Whole source" : mode === "minute" ? "One minute" : "Ten seconds"}</button>)}
      </div>
      {(transcriptWords.length > 0 || evidenceMarkers.length > 0 || loudnessEvidence) ? <div role="region" className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-900 px-2 py-2" aria-label="Shared spectral evidence navigator">
        <div><p className="text-[9px] font-black uppercase tracking-wide text-cyan-200">One clock · {overlayMoments.length} review point{overlayMoments.length === 1 ? "" : "s"}</p><p className="mt-0.5 text-[8px] font-bold text-slate-400">Transcript, measured signal, capture, mastering, treatment, and edit evidence remain distinct overlays.</p></div>
        <div className="flex gap-1"><button type="button" disabled={!overlayMoments.length} onClick={() => inspectAdjacent("previous")} className="min-h-9 rounded-md border border-slate-600 px-2 text-[9px] font-black disabled:opacity-40">← Previous</button><button type="button" disabled={!overlayMoments.length} onClick={() => inspectAdjacent("next")} className="min-h-9 rounded-md bg-cyan-200 px-2 text-[9px] font-black text-cyan-950 disabled:opacity-40">Next evidence →</button></div>
      </div> : null}
      <div ref={shellRef} className="relative mt-3 overflow-hidden rounded-lg border border-slate-700 bg-slate-950">
        <canvas ref={canvasRef} tabIndex={0} role="slider" aria-label={`Spectral evidence from ${clock(view.start)} to ${clock(view.end)}`} aria-valuemin={view.start} aria-valuemax={view.end} aria-valuenow={selectedSeconds} onClick={(event: MouseEvent<HTMLCanvasElement>) => chooseAtClientX(event.clientX, event.detail > 1 && playbackReady)} onDoubleClick={(event) => chooseAtClientX(event.clientX, playbackReady)} onKeyDown={onCanvasKey} className="block w-full cursor-crosshair focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          {visibleMarkers.map((marker) => <span key={marker.id} className={`absolute inset-y-0 border-l-2 ${markerTone(marker.category, marker.severity)}`} style={{ left: `${percentWithinView(marker.startSeconds)}%`, width: `${Math.max(0.2, percentWithinView(Math.max(marker.endSeconds, marker.startSeconds + 0.001)) - percentWithinView(marker.startSeconds))}%` }} />)}
          {transcriptEndSeconds !== null && transcriptEndSeconds >= view.start && transcriptEndSeconds <= view.end ? <span className="absolute inset-y-0 border-l-2 border-emerald-300" style={{ left: `${percentWithinView(transcriptEndSeconds)}%` }} /> : null}
          {loudnessPath ? <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="absolute inset-x-0 top-0 h-[35%] w-full overflow-visible"><path d={loudnessPath} fill="none" stroke="var(--color-quipsly-inkberry-300)" strokeWidth="0.55" vectorEffect="non-scaling-stroke" /></svg> : null}
          <div className="absolute inset-x-0 bottom-[17%] h-[9%] border-y border-white/10 bg-slate-950/35">
            {transcriptSlices.map((slice) => <span key={slice.id} className="absolute inset-y-0" style={{ left: `${percentWithinView(slice.startSeconds)}%`, width: `${Math.max(0.15, percentWithinView(slice.endSeconds) - percentWithinView(slice.startSeconds))}%`, background: transcriptSliceBackground(slice.states) }} />)}
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between bg-gradient-to-t from-slate-950/90 to-transparent px-2 pb-1 pt-6 font-mono text-[9px] font-black"><span>{clock(view.start)}</span><span>{clock((view.start + view.end) / 2)}</span><span>{clock(view.end)}</span></div>
        <div className="pointer-events-none absolute right-1 top-1 flex h-[72%] flex-col justify-between rounded bg-slate-950/70 px-1 py-1 text-right font-mono text-[8px] font-black text-white/80"><span>{frequency(status.media.maximumFrequencyHz)}</span><span>{frequency(Math.sqrt(status.media.minimumFrequencyHz * status.media.maximumFrequencyHz))}</span><span>{frequency(status.media.minimumFrequencyHz)}</span></div>
      </div>
      {(transcriptWords.length > 0 || evidenceMarkers.length > 0 || loudnessEvidence) ? <div role="region" className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[8px] font-black uppercase tracking-wide text-slate-300" aria-label="Shared spectral evidence legend">
        {transcriptWords.length > 0 ? <><span><i className="mr-1 inline-block h-2 w-3 bg-slate-500" />Unchecked words</span><span><i className="mr-1 inline-block h-2 w-3 bg-blue-400" />Playback reviewed</span><span><i className="mr-1 inline-block h-2 w-3 bg-violet-400" />Provider attention</span></> : null}
        {evidenceMarkers.some((marker) => marker.category === "signal") ? <span><i className="mr-1 inline-block h-3 border-l-2 border-rose-400" />Signal</span> : null}
        {evidenceMarkers.some((marker) => marker.category === "capture") ? <span><i className="mr-1 inline-block h-3 border-l-2 border-amber-300" />Capture</span> : null}
        {evidenceMarkers.some((marker) => marker.category === "mastery") ? <span><i className="mr-1 inline-block h-3 border-l-2 border-fuchsia-300" />Mastery</span> : null}
        {evidenceMarkers.some((marker) => marker.category === "treatment") ? <span><i className="mr-1 inline-block h-3 border-l-2 border-cyan-300" />Treatment</span> : null}
        {evidenceMarkers.some((marker) => marker.category === "edit") ? <span><i className="mr-1 inline-block h-3 border-l-2 border-emerald-300" />Edit proposal</span> : null}
        {loudnessEvidence ? <span><i className="mr-1 inline-block h-0.5 w-3 bg-fuchsia-300 align-middle" />Short-term LUFS</span> : null}
      </div> : null}
      {(selectedEvidence.word || selectedEvidence.markers.length || selectedLoudness || loudnessEvidence) ? <section className="mt-2 rounded-lg border border-slate-700 bg-slate-900 p-2.5" aria-label="Shared evidence at selected time">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="text-[9px] font-black uppercase tracking-wide text-cyan-200">Evidence at {clock(selectedSeconds)}</p><span className="text-[8px] font-bold text-slate-500">No interpolation · no automatic decision</span></div>
        <div className="mt-1 grid gap-1 text-[9px] font-bold leading-4 text-slate-300 sm:grid-cols-2">
          <p>{selectedEvidence.word ? `Transcript “${selectedEvidence.word.text}” · ${selectedEvidence.word.reviewState}${selectedEvidence.word.confidence === null ? " · confidence unavailable" : ` · provider confidence ${Math.round(selectedEvidence.word.confidence * 100)}%`}` : `${transcriptScopeLabel}: no timed word at this cursor.`}</p>
          <p>{selectedEvidence.markers.length ? selectedEvidence.markers.map((marker) => `${marker.label}: ${marker.detail}`).join(" · ") : "No measured signal, capture, mastering, treatment, or edit marker crosses this cursor."}</p>
          {loudnessEvidence ? <p className="sm:col-span-2">Mastering measurement: {loudnessEvidence.integratedLufs.toFixed(1)} integrated LUFS · {loudnessEvidence.truePeakDbtp.toFixed(1)} dBTP source peak{selectedLoudness?.shortTermLufs === null || selectedLoudness?.shortTermLufs === undefined ? "" : ` · nearest measured short-term ${selectedLoudness.shortTermLufs.toFixed(1)} LUFS at ${clock(selectedLoudness.timeSeconds)}`}{loudnessEvidence.targetLufs === null ? "" : ` · selected profile target ${loudnessEvidence.targetLufs.toFixed(1)} LUFS`}.</p> : null}
        </div>
      </section> : null}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[9px] font-bold text-slate-400"><span>{status.media.channelCount} ch downmixed for analysis · {(status.media.sampleRate / 1_000).toFixed(1)} kHz · 20 Hz–{frequency(status.media.maximumFrequencyHz)}</span><span>{currentLevel?.tileSpanSeconds}s protected tiles · −120 to 0 dBFS display range</span></div>
      <p className="mt-2 text-[9px] font-bold leading-4 text-slate-400">Click to move the shared playhead; double-click to listen. Use ten-second detail to inspect a candidate before creating any reversible treatment experiment.</p>
    </> : <div className="mt-3 rounded-lg border border-dashed border-indigo-700 bg-slate-900 p-3"><p role="status" className="text-[10px] font-bold leading-4 text-slate-300">{status.error || message}</p><button type="button" disabled={working || ["queued", "processing", "output-ready"].includes(status.status)} onClick={() => void operate()} className="mt-3 w-full rounded-lg bg-indigo-200 px-3 py-2 text-[10px] font-black text-indigo-950 hover:bg-indigo-100 disabled:cursor-wait disabled:bg-slate-700 disabled:text-slate-300">{working ? "Analyzing the complete source…" : status.status === "failed" ? "Retry spectral analysis" : ["queued", "processing", "output-ready"].includes(status.status) ? "Spectral analysis in progress" : "Build high-resolution spectral evidence"}</button></div>}
  </section>;
}

function spectralColor(value: number): [number, number, number] {
  const stops = [[2, 6, 23], [30, 27, 75], [67, 56, 202], [8, 145, 178], [16, 185, 129], [250, 204, 21], [255, 247, 225]];
  const position = Math.max(0, Math.min(0.999999, value)) * (stops.length - 1);
  const index = Math.floor(position);
  const fraction = position - index;
  return stops[index].map((channel, channelIndex) => Math.round(channel + (stops[index + 1][channelIndex] - channel) * fraction)) as [number, number, number];
}
function frequency(value: number) { return value >= 1_000 ? `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}k` : `${Math.round(value)}`; }
function markerTone(category: SpectralEvidenceMarker["category"], severity: SpectralEvidenceMarker["severity"]) {
  if (severity === "warning") return "border-rose-400 bg-rose-500/10";
  if (category === "capture") return "border-amber-300 bg-amber-400/10";
  if (category === "mastery") return "border-fuchsia-300 bg-fuchsia-400/10";
  if (category === "treatment") return "border-cyan-300 bg-cyan-400/10";
  if (category === "edit") return "border-lime-300 bg-lime-400/10";
  return "border-sky-300 bg-sky-400/10";
}
function transcriptSliceBackground(states: Array<"unchecked" | "confirmed" | "corrected" | "attention">) {
  const colors = states.map((state) => state === "attention" ? "rgba(167,139,250,.92)" : state === "corrected" ? "rgba(103,232,249,.92)" : state === "confirmed" ? "rgba(96,165,250,.92)" : "rgba(100,116,139,.82)");
  if (colors.length <= 1) return colors[0] ?? "rgba(100,116,139,.82)";
  const width = 100 / colors.length;
  return `linear-gradient(90deg, ${colors.flatMap((color, index) => [`${color} ${(index * width).toFixed(2)}%`, `${color} ${((index + 1) * width).toFixed(2)}%`]).join(", ")})`;
}
