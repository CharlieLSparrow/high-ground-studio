"use client";

import { AudioLines, CircleAlert, Clock3, Pause, Play, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { timestampForSeconds } from "./session-review-model";
import type { SessionRecordingHealth } from "./session-recording-health";
import type { SessionSourceEvidence } from "./session-source-evidence-model";

type EvidenceSource = SessionSourceEvidence["sources"][number];

type AuditionSource = {
  recordingAssetId: string;
  label: string;
  participantLabel: string;
  state: SessionRecordingHealth["state"];
  url: string;
  kind: "audio" | "video";
  durationSeconds: number;
  signal: NonNullable<NonNullable<EvidenceSource["captureRuntime"]["audioFormat"]>["signal"]> | null;
};

function finiteDuration(...values: unknown[]) {
  for (const value of values) {
    const parsed = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 86_400) return parsed;
  }
  return 0;
}

function stateTone(state: AuditionSource["state"]) {
  if (state === "READY") return "border-emerald-300 bg-emerald-50 text-emerald-950";
  if (state === "BLOCKED") return "border-rose-300 bg-rose-50 text-rose-950";
  if (state === "REVIEW") return "border-amber-300 bg-amber-50 text-amber-950";
  return "border-slate-300 bg-slate-50 text-slate-800";
}

function compactWaveform(signal: AuditionSource["signal"], maximumPoints = 180) {
  if (!signal?.waveform.length) return [];
  const bucketSize = Math.max(1, Math.ceil(signal.waveform.length / maximumPoints));
  const points = [];
  for (let index = 0; index < signal.waveform.length; index += bucketSize) {
    const bucket = signal.waveform.slice(index, index + bucketSize);
    const loudest = bucket.reduce((best, point) => point.samplePeakDbfs > best.samplePeakDbfs ? point : best, bucket[0]!);
    points.push(loudest);
  }
  return points;
}

function waveformHeight(dbfs: number) {
  return Math.max(3, Math.min(100, ((Math.max(-72, Math.min(0, dbfs)) + 72) / 72) * 100));
}

export function SessionRecordingHealthListeningNavigator({
  roomId,
  health,
  evidence,
}: {
  roomId: string;
  health: SessionRecordingHealth;
  evidence: SessionSourceEvidence;
}) {
  const sources = useMemo<AuditionSource[]>(() => {
    const evidenceByAsset = new Map(evidence.sources.map((source) => [source.recordingAssetId, source]));
    return health.sources.flatMap((source) => {
      if (!source.recordingAssetId) return [];
      const sourceEvidence = evidenceByAsset.get(source.recordingAssetId);
      const playback = sourceEvidence?.protectedPlayback;
      if (!sourceEvidence || !playback) return [];
      const derivedSignal = sourceEvidence.analysis?.completeDecode ? sourceEvidence.analysis.signal : null;
      const capturedSignal = sourceEvidence.captureRuntime.audioFormat?.signal ?? null;
      const signal = derivedSignal ?? capturedSignal;
      const durationSeconds = finiteDuration(
        sourceEvidence.analysis?.media?.durationSeconds,
        signal?.durationSeconds,
        playback.durationSeconds,
      );
      if (!durationSeconds) return [];
      return [{
        recordingAssetId: source.recordingAssetId,
        label: source.label,
        participantLabel: source.participantLabel,
        state: source.state,
        url: playback.url,
        kind: playback.kind,
        durationSeconds,
        signal,
      }];
    });
  }, [evidence.sources, health.sources]);
  const initialId = sources.find((source) => source.state === "READY")?.recordingAssetId ?? sources[0]?.recordingAssetId ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(initialId);
  const [selectedSeconds, setSelectedSeconds] = useState(0);
  const [playbackState, setPlaybackState] = useState<"loading" | "ready" | "playing" | "paused" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const stopAtRef = useRef<number | null>(null);
  const selected = sources.find((source) => source.recordingAssetId === selectedId) ?? sources[0] ?? null;
  const waveform = useMemo(() => compactWaveform(selected?.signal ?? null), [selected?.signal]);
  const transcriptHref = selected
    ? `/sessions/${encodeURIComponent(roomId)}?mode=transcript&source=${encodeURIComponent(selected.recordingAssetId)}&at=${encodeURIComponent(String(Number(selectedSeconds.toFixed(3))))}#transcript-audio-review`
    : null;

  useEffect(() => {
    if (!selected && selectedId !== null) setSelectedId(null);
    if (selected && selected.recordingAssetId !== selectedId) setSelectedId(selected.recordingAssetId);
  }, [selected, selectedId]);

  useEffect(() => {
    setSelectedSeconds(0);
    setMessage(null);
    stopAtRef.current = null;
  }, [selected?.recordingAssetId]);

  function choose(recordingAssetId: string) {
    mediaRef.current?.pause();
    setPlaybackState("loading");
    setSelectedId(recordingAssetId);
  }

  function seek(seconds: number) {
    if (!selected) return;
    const bounded = Math.max(0, Math.min(selected.durationSeconds, Number.isFinite(seconds) ? seconds : 0));
    setSelectedSeconds(bounded);
    const media = mediaRef.current;
    if (media && media.readyState >= 1) {
      try { media.currentTime = bounded; } catch { /* metadata remains the authority for seek availability */ }
    }
  }

  async function play(checkSeconds: number | null, requestedStartSeconds = selectedSeconds) {
    const media = mediaRef.current;
    if (!media || !selected || playbackState === "error") {
      setMessage("Protected source bytes are not ready for audition.");
      return;
    }
    try {
      const playStart = Math.max(0, Math.min(requestedStartSeconds, Math.max(0, selected.durationSeconds - 0.001)));
      media.currentTime = playStart;
      const stopAt = checkSeconds === null
        ? null
        : Math.min(selected.durationSeconds, playStart + checkSeconds);
      stopAtRef.current = stopAt;
      await media.play();
      setPlaybackState("playing");
      setMessage(checkSeconds === null
        ? `Playing ${selected.label} from ${timestampForSeconds(playStart)}.`
        : `Playing a bounded ${Math.max(1, Math.ceil((stopAt ?? playStart) - playStart))}-second source check from ${timestampForSeconds(playStart)}.`);
    } catch {
      setMessage("Playback needs a direct browser interaction. Use the native source controls, then retry the selected time.");
    }
  }

  function observe(media: HTMLMediaElement) {
    const current = Math.max(0, media.currentTime);
    setSelectedSeconds(current);
    if (stopAtRef.current !== null && current >= stopAtRef.current - 0.03) {
      media.pause();
      stopAtRef.current = null;
      setPlaybackState("paused");
      setMessage(`Bounded source check stopped at ${timestampForSeconds(current)}.`);
    }
  }

  if (!sources.length) return <section className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-5" data-flight-deck-listening="unavailable" aria-labelledby="flight-deck-listening-heading">
    <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-700"><AudioLines size={16} aria-hidden="true" />Source audition</p>
    <h3 id="flight-deck-listening-heading" className="mt-1 font-serif text-2xl font-black text-[#3d3122]">Protected playback is not attached</h3>
    <p className="mt-2 text-sm font-semibold leading-6 text-[#765f40]">Health evidence remains inspectable, but Quipsly will not turn a private storage locator into browser playback. Promote or repair an authorized protected source first.</p>
  </section>;

  return <section className="rounded-2xl border border-cyan-200 bg-white/90 p-4 sm:p-5" data-flight-deck-listening="ready" aria-labelledby="flight-deck-listening-heading">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="max-w-3xl">
        <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-800"><AudioLines size={16} aria-hidden="true" />Source audition</p>
        <h3 id="flight-deck-listening-heading" className="mt-1 font-serif text-2xl font-black text-[#3d3122]">Open the actual master</h3>
        <p className="mt-2 text-sm font-semibold leading-6 text-[#765f40]">Choose an independently identified source, scrub its complete-decode clock, or run a bounded ten-second check. Playback navigation creates no proof-listen receipt and changes no media.</p>
      </div>
      <span className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-[9px] font-black uppercase tracking-wide text-cyan-900"><ShieldCheck size={13} aria-hidden="true" />Protected route</span>
    </div>

    <ul className="mt-4 flex gap-2 overflow-x-auto pb-2" aria-label="Protected recording sources">
      {sources.map((source) => <li key={source.recordingAssetId}><button type="button" aria-pressed={selected?.recordingAssetId === source.recordingAssetId} onClick={() => choose(source.recordingAssetId)} data-flight-deck-audition-source={source.recordingAssetId} className={`min-h-16 min-w-52 rounded-xl border px-3 py-2 text-left transition ${stateTone(source.state)} ${selected?.recordingAssetId === source.recordingAssetId ? "ring-2 ring-cyan-500 ring-offset-2" : ""}`}>
        <span className="block text-[9px] font-black uppercase tracking-wide">{source.state} · {source.participantLabel}</span>
        <span className="mt-1 block truncate text-xs font-black">{source.label}</span>
        <span className="mt-1 block font-mono text-[9px] font-bold">{timestampForSeconds(source.durationSeconds)}</span>
      </button></li>)}
    </ul>

    {selected ? <div className="mt-3 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(260px,0.42fr)]">
      <div className="min-w-0 rounded-xl border border-slate-800 bg-slate-950 p-4 text-white">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-wide text-cyan-200">{selected.participantLabel} · {selected.state}</p><p className="mt-1 font-black">{selected.label}</p></div><p className="inline-flex items-center gap-1 font-mono text-xs font-black text-cyan-100"><Clock3 size={13} aria-hidden="true" />{timestampForSeconds(selectedSeconds)} / {timestampForSeconds(selected.durationSeconds)}</p></div>
        {selected.kind === "video"
          ? <video key={selected.recordingAssetId} ref={(node) => { mediaRef.current = node; }} src={selected.url} controls preload="metadata" data-flight-deck-audition-media={selected.recordingAssetId} className="mt-4 max-h-80 w-full rounded-lg bg-black" aria-label={`Protected source ${selected.label}`} onLoadedMetadata={(event) => { setPlaybackState("ready"); seek(Math.min(selectedSeconds, event.currentTarget.duration || selected.durationSeconds)); }} onPlay={() => setPlaybackState("playing")} onPause={() => setPlaybackState((current) => current === "error" ? current : "paused")} onTimeUpdate={(event) => observe(event.currentTarget)} onError={() => { setPlaybackState("error"); setMessage("Protected source bytes could not be decoded in this browser."); }} />
          : <audio key={selected.recordingAssetId} ref={(node) => { mediaRef.current = node; }} src={selected.url} controls preload="metadata" data-flight-deck-audition-media={selected.recordingAssetId} className="mt-4 w-full" aria-label={`Protected source ${selected.label}`} onLoadedMetadata={(event) => { setPlaybackState("ready"); seek(Math.min(selectedSeconds, event.currentTarget.duration || selected.durationSeconds)); }} onPlay={() => setPlaybackState("playing")} onPause={() => setPlaybackState((current) => current === "error" ? current : "paused")} onTimeUpdate={(event) => observe(event.currentTarget)} onError={() => { setPlaybackState("error"); setMessage("Protected source bytes could not be decoded in this browser."); }} />}

        {waveform.length ? <div className="mt-4 flex h-24 items-end gap-px overflow-hidden rounded-lg border border-slate-700 bg-slate-900 px-2 pt-2" aria-label="Complete-decode waveform overview" role="img">{waveform.map((point, index) => <span key={`${point.startSeconds}-${index}`} className="min-w-px flex-1 rounded-t-sm bg-cyan-300/80" style={{ height: `${waveformHeight(point.rmsDbfs)}%` }} />)}</div> : <p className="mt-4 rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs font-bold text-slate-300">No waveform overview is attached. Native playback remains available, but Quipsly does not invent a visual signal trace.</p>}

        <label htmlFor="flight-deck-source-clock" className="mt-4 block text-[10px] font-black uppercase tracking-wide text-cyan-100">Selected source time</label>
        <input id="flight-deck-source-clock" type="range" min={0} max={selected.durationSeconds} step={0.01} value={Math.min(selectedSeconds, selected.durationSeconds)} onChange={(event) => seek(Number(event.target.value))} className="mt-2 w-full accent-cyan-300" />
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => void play(null)} disabled={playbackState === "error"} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-cyan-200 px-4 text-xs font-black text-slate-950 disabled:opacity-50"><Play size={14} fill="currentColor" aria-hidden="true" />Play from selected time</button>
          <button type="button" onClick={() => void play(10)} disabled={playbackState === "error"} data-flight-deck-ten-second-check className="inline-flex min-h-11 items-center gap-2 rounded-full border border-cyan-300 bg-slate-900 px-4 text-xs font-black text-cyan-100 disabled:opacity-50"><Clock3 size={14} aria-hidden="true" />Check up to 10 seconds</button>
          <button type="button" onClick={() => { mediaRef.current?.pause(); stopAtRef.current = null; setPlaybackState("paused"); }} disabled={playbackState !== "playing"} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-600 bg-slate-900 px-4 text-xs font-black text-slate-200 disabled:opacity-50"><Pause size={14} aria-hidden="true" />Pause</button>
          {transcriptHref ? <Link href={transcriptHref} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-violet-300 bg-violet-100 px-4 text-xs font-black text-violet-950">Open in Transcript at {timestampForSeconds(selectedSeconds)}</Link> : null}
        </div>
        {message ? <p role="status" className="mt-3 rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs font-bold text-cyan-100">{message}</p> : null}
        <p className="mt-3 text-[9px] font-black uppercase tracking-wide text-slate-500">Client playback is navigation only · no heard/approved claim is written</p>
      </div>

      <aside className="rounded-xl border border-cyan-200 bg-cyan-50/50 p-4" aria-label="Signal observations for selected source">
        <p className="text-[10px] font-black uppercase tracking-wide text-cyan-900">Exact-time observations</p>
        {selected.signal?.observations.length ? <ol className="mt-3 space-y-2">{selected.signal.observations.map((observation, index) => <li key={`${observation.kind}-${observation.startSeconds}-${index}`}><button type="button" onClick={() => { seek(observation.startSeconds); void play(10, observation.startSeconds); }} className="min-h-11 w-full rounded-lg border border-amber-200 bg-amber-50 p-3 text-left text-xs font-bold leading-5 text-amber-950"><span className="block font-black uppercase tracking-wide">{timestampForSeconds(observation.startSeconds)} · {observation.kind.replaceAll("-", " ")}</span><span className="mt-1 block">{observation.detail}</span></button></li>)}</ol> : <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold leading-5 text-emerald-950"><ShieldCheck size={15} className="mr-1 inline" aria-hidden="true" />No configured complete-decode threshold flagged a range. Use the source controls for a representative listen; this is not proof of subjective quality.</p>}
        {playbackState === "error" ? <p className="mt-3 flex gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-bold leading-5 text-rose-950"><CircleAlert size={15} className="mt-0.5 shrink-0" aria-hidden="true" />Playback failed closed. Health evidence remains visible, but no listening claim is available.</p> : null}
      </aside>
    </div> : null}
  </section>;
}
