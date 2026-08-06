"use client";

import { Headphones, Pause, Play, RotateCcw, ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { EpisodeAudioComparisonPlan } from "@/lib/episode-audio-comparison";

function timestamp(seconds: number) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${String(Math.floor(safe % 60)).padStart(2, "0")}.${String(Math.floor((safe % 1) * 10))}`;
}

export function EpisodeAudioMatchedAudition({
  plan,
  onClose,
  onPausePrimarySource,
}: {
  plan: EpisodeAudioComparisonPlan;
  onClose: () => void;
  onPausePrimarySource?: () => void;
}) {
  const mediaByAsset = useRef(new Map<string, HTMLMediaElement>());
  const [monitor, setMonitor] = useState<"all" | string>("all");
  const [progressSeconds, setProgressSeconds] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readyAssetIds, setReadyAssetIds] = useState<string[]>([]);
  const leaderAssetId = monitor === "all" ? plan.sources[0]?.assetId ?? null : monitor;
  const monitorGain = useMemo(() => Math.min(0.68, 0.96 / Math.sqrt(Math.max(1, plan.sources.length))), [plan.sources.length]);
  const allSourcesReady = readyAssetIds.length === plan.sources.length;

  const pauseAll = useCallback(() => {
    for (const media of mediaByAsset.current.values()) media.pause();
    setPlaying(false);
  }, []);

  const seekAll = useCallback((progress: number) => {
    const bounded = Math.max(0, Math.min(plan.durationSeconds, progress));
    for (const source of plan.sources) {
      const media = mediaByAsset.current.get(source.assetId);
      if (media) {
        try {
          media.currentTime = source.sourceStartSeconds + bounded;
        } catch {
          // onLoadedMetadata applies the same exact source-clock seek.
        }
      }
    }
    setProgressSeconds(bounded);
  }, [plan]);

  const applyMonitor = useCallback((mode: "all" | string) => {
    for (const source of plan.sources) {
      const media = mediaByAsset.current.get(source.assetId);
      if (!media) continue;
      media.volume = mode === "all" ? monitorGain : source.assetId === mode ? 1 : 0;
    }
  }, [monitorGain, plan.sources]);

  const playAll = useCallback(async () => {
    setError(null);
    if (!allSourcesReady) {
      setError("Protected source metadata is still loading. Quipsly will not claim a synchronized start until every source is seekable.");
      return;
    }
    onPausePrimarySource?.();
    if (progressSeconds >= plan.durationSeconds - 0.03) seekAll(0);
    applyMonitor(monitor);
    const attempts = plan.sources.map((source) => {
      const media = mediaByAsset.current.get(source.assetId);
      if (!media) return Promise.reject(new Error(`Playback element is unavailable for ${source.title}.`));
      return media.play();
    });
    const results = await Promise.allSettled(attempts);
    if (results.some((result) => result.status === "rejected")) {
      pauseAll();
      setError("The protected sources could not all start together. Nothing was classified; retry after the media finishes loading.");
      return;
    }
    setPlaying(true);
  }, [allSourcesReady, applyMonitor, monitor, onPausePrimarySource, pauseAll, plan, progressSeconds, seekAll]);

  const updateFromLeader = useCallback((assetId: string, media: HTMLMediaElement) => {
    if (assetId !== leaderAssetId) return;
    const leader = plan.sources.find((source) => source.assetId === assetId);
    if (!leader) return;
    const progress = Math.max(0, media.currentTime - leader.sourceStartSeconds);
    if (progress >= plan.durationSeconds - 0.03) {
      pauseAll();
      seekAll(plan.durationSeconds);
      return;
    }
    for (const source of plan.sources) {
      if (source.assetId === assetId) continue;
      const follower = mediaByAsset.current.get(source.assetId);
      if (!follower) continue;
      const expected = source.sourceStartSeconds + progress;
      if (Math.abs(follower.currentTime - expected) > 0.08) follower.currentTime = expected;
    }
    setProgressSeconds(progress);
  }, [leaderAssetId, pauseAll, plan, seekAll]);

  useEffect(() => {
    pauseAll();
    seekAll(0);
    setMonitor("all");
    setError(null);
    setReadyAssetIds([]);
    return pauseAll;
  }, [pauseAll, plan.momentId, seekAll]);

  useEffect(() => applyMonitor(monitor), [applyMonitor, monitor]);

  return (
    <section className="overflow-hidden rounded-2xl border border-indigo-300 bg-white shadow-lg" aria-labelledby="matched-audition-heading">
      <div className="flex flex-col gap-3 border-b border-indigo-200 bg-gradient-to-r from-indigo-950 to-slate-950 p-4 text-white sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-indigo-200"><Headphones className="h-4 w-4" aria-hidden="true" /> Matched-source audition</div>
          <h2 id="matched-audition-heading" className="mt-1 text-xl font-black">{plan.label}</h2>
          <p className="mt-1 text-[10px] font-semibold leading-4 text-indigo-100/80">Program {timestamp(plan.programStartSeconds)}–{timestamp(plan.programEndSeconds)} · {plan.sources.length} retained source{plan.sources.length === 1 ? "" : "s"} · {plan.detail}</p>
        </div>
        <button type="button" onClick={() => { pauseAll(); onClose(); }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 text-xs font-black hover:bg-white/20"><X className="h-4 w-4" aria-hidden="true" /> Close comparison</button>
      </div>

      <div className="p-4">
        <div className="flex flex-wrap gap-2" aria-label="Audition monitor">
          <button type="button" aria-pressed={monitor === "all"} onClick={() => setMonitor("all")} className={`min-h-11 rounded-xl border px-3 text-xs font-black ${monitor === "all" ? "border-indigo-700 bg-indigo-100 text-indigo-950" : "border-slate-300 bg-white text-slate-700"}`}>All sources</button>
          {plan.sources.map((source) => <button key={source.assetId} type="button" aria-pressed={monitor === source.assetId} onClick={() => setMonitor(source.assetId)} className={`min-h-11 rounded-xl border px-3 text-left text-xs font-black ${monitor === source.assetId ? "border-indigo-700 bg-indigo-100 text-indigo-950" : "border-slate-300 bg-white text-slate-700"}`}><span className="block">{source.participantLabel || source.title}</span><span className="block text-[9px] font-semibold opacity-65">Solo monitor</span></button>)}
        </div>

        <div className="mt-4 grid gap-2" aria-label="Protected comparison sources">
          {plan.sources.map((source) => (
            <div key={source.assetId} className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[minmax(10rem,1fr)_auto] sm:items-center">
              <div className="min-w-0"><div className="truncate text-xs font-black text-slate-950">{source.participantLabel || source.title}</div><div className="mt-1 truncate text-[9px] font-bold uppercase tracking-wide text-slate-500">{source.role.replaceAll("-", " ")} · {source.alignment.replaceAll("-", " ")}</div></div>
              <div className="font-mono text-[10px] font-black text-slate-700">source {timestamp(source.sourceStartSeconds)}–{timestamp(source.sourceEndSeconds)}</div>
              <audio
                ref={(node) => { if (node) mediaByAsset.current.set(source.assetId, node); else mediaByAsset.current.delete(source.assetId); }}
                src={source.playbackUrl}
                preload="metadata"
                onLoadedMetadata={(event) => {
                  event.currentTarget.currentTime = source.sourceStartSeconds;
                  setReadyAssetIds((current) => current.includes(source.assetId) ? current : [...current, source.assetId]);
                }}
                onError={() => {
                  setReadyAssetIds((current) => current.filter((assetId) => assetId !== source.assetId));
                  setError(`Protected playback metadata could not load for ${source.title}.`);
                }}
                onTimeUpdate={(event) => updateFromLeader(source.assetId, event.currentTarget)}
                onEnded={() => { pauseAll(); seekAll(plan.durationSeconds); }}
                aria-hidden="true"
              />
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 p-3">
          <label className="flex items-center justify-between gap-3 text-[10px] font-black text-indigo-950" htmlFor={`matched-audition-position-${plan.momentId}`}><span>Comparison position</span><span className="font-mono">+{progressSeconds.toFixed(2)}s / {plan.durationSeconds.toFixed(2)}s</span></label>
          <input id={`matched-audition-position-${plan.momentId}`} type="range" min={0} max={plan.durationSeconds} step={0.01} value={Math.min(plan.durationSeconds, progressSeconds)} disabled={!allSourcesReady} onChange={(event) => { pauseAll(); seekAll(Number(event.currentTarget.value)); }} className="mt-2 w-full accent-indigo-700 disabled:cursor-wait disabled:opacity-50" />
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => { if (playing) pauseAll(); else void playAll(); }} disabled={!playing && !allSourcesReady} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-800 px-4 text-xs font-black text-white hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-60">{playing ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}{playing ? "Pause together" : allSourcesReady ? "Play together" : `Loading sources ${readyAssetIds.length}/${plan.sources.length}`}</button>
            <button type="button" onClick={() => { pauseAll(); seekAll(0); }} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-indigo-300 bg-white px-4 text-xs font-black text-indigo-950"><RotateCcw className="h-4 w-4" aria-hidden="true" /> Reset</button>
          </div>
        </div>

        {error ? <p className="mt-3 rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs font-bold text-rose-950" role="alert">{error}</p> : null}
        {plan.omitted.length ? <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-[10px] font-semibold text-amber-950"><span className="font-black">Coverage limit:</span> {plan.omitted.map((item) => item.reason).join(" ")}</div> : null}
        <div className="mt-3 flex items-start gap-2 text-[10px] font-semibold leading-4 text-slate-600"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" /><p>All mode applies monitor-only attenuation to reduce summed playback level. Solo and timing controls never alter retained bytes, alignment, the timeline, or a classification. A later review receipt must still name what was actually heard.</p></div>
      </div>
    </section>
  );
}
