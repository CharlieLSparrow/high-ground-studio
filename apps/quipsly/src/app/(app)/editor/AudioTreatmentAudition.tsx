"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { audioMasteryAuditionGains, type AudioMasteryMeasurement, type AudioMasteryMonitorMode } from "./AudioMasteryAudition";

function clock(seconds: number) {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  return `${Math.floor(safe / 60)}:${Math.floor(safe % 60).toString().padStart(2, "0")}`;
}

export function AudioTreatmentAudition({ sourceUrl, treatedUrl, source, treated, verification }: {
  sourceUrl: string;
  treatedUrl: string;
  source: AudioMasteryMeasurement;
  treated: AudioMasteryMeasurement;
  verification: { maximumAbsoluteDcBefore: number; maximumAbsoluteDcAfter: number; relativeReduction: number; durationDeltaSeconds: number; passes: true };
}) {
  const sourceRef = useRef<HTMLAudioElement>(null);
  const treatedRef = useRef<HTMLAudioElement>(null);
  const [version, setVersion] = useState<"source" | "treated">("treated");
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [monitorMode, setMonitorMode] = useState<AudioMasteryMonitorMode>("matched");
  const duration = Math.max(source.durationSeconds, treated.durationSeconds, 0.001);
  const gains = useMemo(() => audioMasteryAuditionGains(source.integratedLufs, treated.integratedLufs, monitorMode), [monitorMode, source.integratedLufs, treated.integratedLufs]);
  const activeRef = version === "source" ? sourceRef : treatedRef;

  useEffect(() => {
    if (sourceRef.current) sourceRef.current.volume = gains.sourceGain;
    if (treatedRef.current) treatedRef.current.volume = gains.masteredGain;
  }, [gains]);

  const seek = (seconds: number) => {
    const next = Math.max(0, Math.min(duration, seconds));
    if (sourceRef.current) sourceRef.current.currentTime = next;
    if (treatedRef.current) treatedRef.current.currentTime = next;
    setCurrentTime(next);
  };
  const switchVersion = async (next: "source" | "treated") => {
    if (next === version) return;
    const current = activeRef.current;
    const target = next === "source" ? sourceRef.current : treatedRef.current;
    const continuePlaying = Boolean(current && !current.paused);
    const time = current?.currentTime ?? currentTime;
    current?.pause();
    if (target) target.currentTime = time;
    setVersion(next);
    if (continuePlaying && target) {
      try { await target.play(); setPlaying(true); } catch { setPlaying(false); }
    }
  };
  const toggle = async () => {
    const active = activeRef.current;
    if (!active) return;
    if (active.paused) {
      try { await active.play(); setPlaying(true); } catch { setPlaying(false); }
    } else { active.pause(); setPlaying(false); }
  };

  return (
    <section className="mt-3 rounded-lg border border-cyan-700 bg-slate-950 p-3 text-white" aria-label="Audio treatment evidence audition">
      <audio ref={sourceRef} src={sourceUrl} preload="metadata" onTimeUpdate={(event) => version === "source" && setCurrentTime(event.currentTarget.currentTime)} onEnded={() => setPlaying(false)} />
      <audio ref={treatedRef} src={treatedUrl} preload="metadata" onTimeUpdate={(event) => version === "treated" && setCurrentTime(event.currentTarget.currentTime)} onEnded={() => setPlaying(false)} />
      <div className="flex items-start justify-between gap-3">
        <div><div className="text-xs font-black">Treatment evidence audition</div><p className="mt-1 text-[9px] font-bold leading-4 text-slate-400">Same playhead, loudness-matched by default. Listen for bass loss, phase change, or speech coloration before approval.</p></div>
        <span className="shrink-0 rounded-full border border-emerald-700 bg-emerald-950 px-2 py-1 text-[8px] font-black uppercase tracking-[0.1em] text-emerald-200">Signal gate passed</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-center text-[9px] font-bold">
        <div className="rounded-md bg-slate-900 px-2 py-2"><div className="font-mono text-sm font-black text-amber-200">{verification.maximumAbsoluteDcBefore.toFixed(5)}</div><div className="text-slate-400">DC before</div></div>
        <div className="rounded-md bg-slate-900 px-2 py-2"><div className="font-mono text-sm font-black text-cyan-200">{verification.maximumAbsoluteDcAfter.toFixed(5)}</div><div className="text-slate-400">DC after</div></div>
      </div>
      <div className="mt-2 rounded-md border border-slate-700 bg-slate-900 px-2 py-2 text-[9px] font-bold text-slate-300">{(verification.relativeReduction * 100).toFixed(1)}% measured reduction · {(verification.durationDeltaSeconds * 1_000).toFixed(1)} ms duration drift · original bytes retained</div>
      <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg border border-slate-700 bg-slate-900 p-1" role="group" aria-label="Treatment audition version">
        {(["source", "treated"] as const).map((candidate) => <button key={candidate} type="button" aria-pressed={version === candidate} onClick={() => void switchVersion(candidate)} className={`rounded-md px-2 py-2 text-[10px] font-black ${version === candidate ? "bg-white text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}>{candidate === "source" ? "Immutable source" : "Treatment experiment"}</button>)}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1" role="group" aria-label="Treatment monitor level">
        {(["matched", "delivery"] as const).map((candidate) => <button key={candidate} type="button" aria-pressed={monitorMode === candidate} onClick={() => setMonitorMode(candidate)} className={`rounded-md border px-2 py-2 text-[9px] font-black ${monitorMode === candidate ? "border-sky-300 bg-sky-200 text-sky-950" : "border-slate-700 bg-slate-900 text-slate-300"}`}>{candidate === "matched" ? "Matched loudness" : "Recorded level"}</button>)}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button type="button" onClick={() => void toggle()} className="rounded-md bg-cyan-300 px-3 py-2 text-[10px] font-black text-cyan-950">{playing ? "Pause" : "Play"}</button>
        <input type="range" min={0} max={duration} step={0.01} value={Math.min(currentTime, duration)} onChange={(event) => seek(Number(event.target.value))} className="min-w-0 flex-1 accent-cyan-300" aria-label="Treatment audition playhead" />
        <span className="shrink-0 font-mono text-[9px] text-slate-300">{clock(currentTime)} / {clock(duration)}</span>
      </div>
      <p className="mt-2 text-[9px] font-bold leading-4 text-slate-400">This is a review-only experiment, not a mastered file and not selected for export.</p>
    </section>
  );
}
