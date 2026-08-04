"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { audioMasteryAuditionGains, type AudioMasteryMeasurement, type AudioMasteryMonitorMode, type AudioSignalDiagnosisSummary } from "./AudioMasteryAudition";
import { AudioProcessingChangeMap } from "./AudioProcessingChangeMap";

function clock(seconds: number) {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  return `${Math.floor(safe / 60)}:${Math.floor(safe % 60).toString().padStart(2, "0")}`;
}

export function audioTreatmentSignalComparison(source: AudioSignalDiagnosisSummary, treated: AudioSignalDiagnosisSummary) {
  return {
    rmsDeltaDb: treated.overall.rmsDbfs - source.overall.rmsDbfs,
    samplePeakDeltaDb: treated.overall.peakDbfs - source.overall.peakDbfs,
    estimatedFloorDeltaDb: source.overall.noiseFloorDbfs === null || treated.overall.noiseFloorDbfs === null
      ? null
      : treated.overall.noiseFloorDbfs - source.overall.noiseFloorDbfs,
    sourceObservationCount: source.observations.length,
    treatedObservationCount: treated.observations.length,
  };
}

export function AudioTreatmentAudition({ sourceUrl, treatedUrl, source, treated, sourceDiagnosis, treatedDiagnosis, verification }: {
  sourceUrl: string;
  treatedUrl: string;
  source: AudioMasteryMeasurement;
  treated: AudioMasteryMeasurement;
  sourceDiagnosis: AudioSignalDiagnosisSummary;
  treatedDiagnosis: AudioSignalDiagnosisSummary;
  verification: { maximumAbsoluteDcBefore: number; maximumAbsoluteDcAfter: number; relativeReduction: number; durationDeltaSeconds: number; passes: true };
}) {
  const sourceRef = useRef<HTMLAudioElement>(null);
  const treatedRef = useRef<HTMLAudioElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [version, setVersion] = useState<"source" | "treated">("treated");
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [monitorMode, setMonitorMode] = useState<AudioMasteryMonitorMode>("matched");
  const duration = Math.max(source.durationSeconds, treated.durationSeconds, 0.001);
  const gains = useMemo(() => audioMasteryAuditionGains(source.integratedLufs, treated.integratedLufs, monitorMode), [monitorMode, source.integratedLufs, treated.integratedLufs]);
  const signalComparison = useMemo(() => audioTreatmentSignalComparison(sourceDiagnosis, treatedDiagnosis), [sourceDiagnosis, treatedDiagnosis]);
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
    const time = Math.max(0, Math.min(duration, current?.currentTime ?? currentTime));
    current?.pause();
    if (target) target.currentTime = time;
    setVersion(next);
    setCurrentTime(time);
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
  const closeDesk = useCallback(() => {
    sourceRef.current?.pause();
    treatedRef.current?.pause();
    setPlaying(false);
    setExpanded(false);
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDesk();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      openerRef.current?.focus();
    };
  }, [closeDesk, expanded]);

  return (
    <>
    <section className="mt-3 rounded-lg border border-cyan-700 bg-slate-950 p-3 text-white" aria-label="Audio treatment audition summary">
      <div className="flex items-start justify-between gap-3">
        <div><div className="text-xs font-black">Treatment evidence ready</div><p className="mt-1 text-[9px] font-bold leading-4 text-slate-400">Verified reversible experiment · two complete decodes · explicit listening still required.</p></div>
        <span className="shrink-0 rounded-full border border-emerald-700 bg-emerald-950 px-2 py-1 text-[8px] font-black uppercase tracking-[0.1em] text-emerald-200">Signal gate passed</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-center text-[9px] font-bold">
        <div className="rounded-md bg-slate-900 px-2 py-2"><span className="font-mono font-black text-amber-200">{verification.maximumAbsoluteDcBefore.toFixed(5)}</span><br /><span className="text-slate-400">DC before</span></div>
        <div className="rounded-md bg-slate-900 px-2 py-2"><span className="font-mono font-black text-cyan-200">{verification.maximumAbsoluteDcAfter.toFixed(5)}</span><br /><span className="text-slate-400">DC after</span></div>
      </div>
      <button type="button" onClick={(event) => { openerRef.current = event.currentTarget; setExpanded(true); }} className="mt-2 w-full rounded-md bg-cyan-300 px-3 py-2 text-[10px] font-black text-cyan-950 hover:bg-cyan-200">Open full treatment desk</button>
    </section>
    {expanded && createPortal(
      <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-labelledby="audio-treatment-dialog-title" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDesk(); }}>
        <div className="max-h-[94vh] w-full max-w-6xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 p-3 shadow-2xl sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3 text-white">
            <div><div className="text-[9px] font-black uppercase tracking-[0.16em] text-cyan-200">Audio treatment</div><h2 id="audio-treatment-dialog-title" className="mt-1 text-xl font-black">Source-to-treatment evidence desk</h2></div>
            <button ref={closeButtonRef} type="button" onClick={closeDesk} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-xs font-black hover:bg-slate-800">Close</button>
          </div>
    <section className="mt-3 rounded-lg border border-cyan-700 bg-slate-950 p-3 text-white" aria-label="Audio treatment evidence audition">
      <audio ref={sourceRef} src={sourceUrl} preload="metadata" data-treatment-version="source" data-monitor-gain={gains.sourceGain} onTimeUpdate={(event) => version === "source" && setCurrentTime(event.currentTarget.currentTime)} onEnded={() => setPlaying(false)} />
      <audio ref={treatedRef} src={treatedUrl} preload="metadata" data-treatment-version="treated" data-monitor-gain={gains.masteredGain} onTimeUpdate={(event) => version === "treated" && setCurrentTime(event.currentTarget.currentTime)} onEnded={() => setPlaying(false)} />
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
      <section className="mt-3 rounded-lg border border-slate-700 bg-slate-900 p-3" aria-label="Treatment signal diagnosis comparison">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><div className="text-xs font-black">Before/after complete-decode evidence</div><p className="mt-1 text-[9px] font-bold leading-4 text-slate-400">Measured signal changes describe the experiment; they do not prove that bass, phase, tone, or speech quality improved.</p></div>
          <span className="rounded-full border border-sky-700 bg-sky-950 px-2 py-1 text-[8px] font-black uppercase tracking-[0.1em] text-sky-200">Two complete decodes</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-center text-[9px] font-bold sm:grid-cols-4">
          <div className="rounded-md bg-slate-950 px-2 py-2"><div className="font-mono text-sm font-black text-sky-200">{sourceDiagnosis.overall.rmsDbfs.toFixed(2)} → {treatedDiagnosis.overall.rmsDbfs.toFixed(2)}</div><div className="text-slate-400">RMS dBFS · Δ {signalComparison.rmsDeltaDb >= 0 ? "+" : ""}{signalComparison.rmsDeltaDb.toFixed(2)}</div></div>
          <div className="rounded-md bg-slate-950 px-2 py-2"><div className="font-mono text-sm font-black text-violet-200">{sourceDiagnosis.overall.peakDbfs.toFixed(2)} → {treatedDiagnosis.overall.peakDbfs.toFixed(2)}</div><div className="text-slate-400">Sample peak dBFS · Δ {signalComparison.samplePeakDeltaDb >= 0 ? "+" : ""}{signalComparison.samplePeakDeltaDb.toFixed(2)}</div></div>
          <div className="rounded-md bg-slate-950 px-2 py-2"><div className="font-mono text-sm font-black text-slate-200">{sourceDiagnosis.overall.noiseFloorDbfs === null || treatedDiagnosis.overall.noiseFloorDbfs === null ? "—" : `${sourceDiagnosis.overall.noiseFloorDbfs.toFixed(2)} → ${treatedDiagnosis.overall.noiseFloorDbfs.toFixed(2)}`}</div><div className="text-slate-400">Estimated floor dBFS{signalComparison.estimatedFloorDeltaDb === null ? "" : ` · Δ ${signalComparison.estimatedFloorDeltaDb >= 0 ? "+" : ""}${signalComparison.estimatedFloorDeltaDb.toFixed(2)}`}</div></div>
          <div className="rounded-md bg-slate-950 px-2 py-2"><div className="font-mono text-sm font-black text-amber-200">{signalComparison.sourceObservationCount} → {signalComparison.treatedObservationCount}</div><div className="text-slate-400">Signal flags</div></div>
        </div>
      </section>
      <AudioProcessingChangeMap
        source={source}
        candidate={treated}
        observations={sourceDiagnosis.observations}
        candidateObservations={treatedDiagnosis.observations}
        selectedSeconds={currentTime}
        onSelect={seek}
        title="Treatment loudness-change map"
        candidateLabel="treatment experiment"
        candidateObservationLabel="Treatment signal flag"
        levelDeltaLabel="Treatment delta LU"
        caveat="This map cannot measure phase or frequency response; use exact-clock A/B to judge bass loss, phase change, and coloration."
      />
      <p className="mt-2 text-[9px] font-bold leading-4 text-slate-400">This is a review-only experiment, not a mastered file and not selected for export.</p>
    </section>
        </div>
      </div>,
      document.body,
    )}
    </>
  );
}
