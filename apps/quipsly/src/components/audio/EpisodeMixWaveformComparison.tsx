"use client";

import type { MouseEvent } from "react";

import { compactEpisodeMixWaveform, episodeMixDbfsHeight, type EpisodeMixSignalWindow } from "@/lib/episode-mix-waveform";

export type EpisodeMixWaveformProfile = {
  durationSeconds: number | null;
  windowDurationSeconds: number | null;
  rmsDbfs: number | null;
  samplePeakDbfs: number | null;
  signalStatus: "signal-present" | "attention" | "near-digital-silence" | null;
  waveform: EpisodeMixSignalWindow[];
};

export function EpisodeMixWaveformComparison({
  baseline,
  proposal,
  durationSeconds,
  currentTime,
  actions,
  checkpoints,
  sharedByBitExactIdentity,
  seek,
}: {
  baseline: EpisodeMixWaveformProfile;
  proposal: EpisodeMixWaveformProfile;
  durationSeconds: number;
  currentTime: number;
  actions: Array<{ id: string; startSeconds: number; endSeconds: number; gainDb: number; targetTitle: string }>;
  checkpoints: number[];
  sharedByBitExactIdentity: boolean;
  seek: (seconds: number) => void;
}) {
  const width = 1_000;
  const height = 186;
  const baselinePoints = compactEpisodeMixWaveform(baseline.waveform);
  const proposalPoints = compactEpisodeMixWaveform(proposal.waveform);
  const safeDuration = Math.max(0.001, durationSeconds);
  const seekFromPointer = (event: MouseEvent<HTMLButtonElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    seek(Math.max(0, Math.min(safeDuration, ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * safeDuration)));
  };
  const lane = (points: EpisodeMixSignalWindow[], centerY: number, color: string) => points.map((point, index) => {
    const x = Math.max(0, Math.min(width, (point.startSeconds / safeDuration) * width));
    const pointWidth = Math.max(1, Math.min(width - x, (point.durationSeconds / safeDuration) * width));
    const rmsHeight = Math.max(1.5, episodeMixDbfsHeight(point.rmsDbfs, 28));
    const peakHeight = Math.max(rmsHeight, episodeMixDbfsHeight(point.samplePeakDbfs, 32));
    return <g key={`${point.startSeconds}:${index}`}>
      <rect x={x} y={centerY - peakHeight} width={pointWidth} height={peakHeight * 2} fill={point.clippedFrameCount > 0 ? "var(--color-quipsly-rosewood-400)" : color} opacity="0.2" />
      <rect x={x} y={centerY - rmsHeight} width={pointWidth} height={rmsHeight * 2} fill={point.clippedFrameCount > 0 ? "var(--color-quipsly-rosewood-400)" : color} opacity="0.88" />
    </g>;
  });

  return <div className="mt-3 rounded-lg border border-cyan-800/70 bg-slate-950/90 p-3" aria-label="Measured matched A/B signal overview">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><div className="text-[10px] font-black uppercase tracking-[0.1em] text-cyan-200">Same-clock signal evidence</div><p id="mix-waveform-explanation" className="mt-1 text-[9px] font-bold leading-4 text-slate-300">Windowed RMS energy and sample peaks from a complete decode—not a sample-level waveform. Fuchsia regions are proposed automation; listening still decides what any measurement means.</p></div>
      {sharedByBitExactIdentity ? <span className="rounded-full border border-sky-600 px-2 py-1 text-[8px] font-black uppercase tracking-[0.08em] text-sky-200">One profile · bit-exact files</span> : <span className="rounded-full border border-cyan-700 px-2 py-1 text-[8px] font-black uppercase tracking-[0.08em] text-cyan-200">Two independent profiles</span>}
    </div>
    <button type="button" onClick={seekFromPointer} aria-describedby="mix-waveform-explanation" aria-label="Seek the matched A/B timeline by measured waveform position" className="mt-3 block w-full overflow-hidden rounded-md border border-slate-700 bg-slate-950 text-left focus:outline-none focus:ring-2 focus:ring-cyan-300">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-48 w-full" role="img" aria-label="Complete-decode baseline and proposal windowed RMS comparison">
        <rect width={width} height={height} fill="#020617" />
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => <g key={fraction}><line x1={fraction * width} x2={fraction * width} y1="18" y2="164" stroke="#334155" strokeDasharray="3 8" /><text x={Math.min(width - 55, fraction * width + 5)} y="13" fill="#94a3b8" fontSize="10" fontWeight="700">{clock(safeDuration * fraction)}</text></g>)}
        <text x="8" y="38" fill="var(--color-quipsly-lake-300)" fontSize="11" fontWeight="800">BASELINE</text>
        <text x="8" y="112" fill="var(--color-quipsly-inkberry-300)" fontSize="11" fontWeight="800">PROPOSAL</text>
        <line x1="0" x2={width} y1="68" y2="68" stroke="var(--color-quipsly-lake-800)" />
        <line x1="0" x2={width} y1="142" y2="142" stroke="var(--color-quipsly-inkberry-800)" />
        {lane(baselinePoints, 68, "var(--color-quipsly-lake-400)")}
        {lane(proposalPoints, 142, "var(--color-quipsly-inkberry-400)")}
        {actions.map((action) => { const x = Math.max(0, Math.min(width, action.startSeconds / safeDuration * width)); const actionWidth = Math.max(2, Math.min(width - x, (action.endSeconds - action.startSeconds) / safeDuration * width)); return <g key={action.id}><rect x={x} y="18" width={actionWidth} height="146" fill="var(--color-quipsly-inkberry-500)" opacity="0.18"><title>{action.targetTitle} · {action.gainDb.toFixed(1)} dB · {clock(action.startSeconds)}–{clock(action.endSeconds)}</title></rect><line x1={x} x2={x} y1="18" y2="164" stroke="var(--color-quipsly-inkberry-300)" strokeWidth="1.5" /></g>; })}
        {checkpoints.map((second) => { const x = Math.max(0, Math.min(width, second / safeDuration * width)); return <line key={second} x1={x} x2={x} y1="18" y2="164" stroke="var(--color-quipsly-brass-400)" strokeWidth="1.5" strokeDasharray="5 4"><title>Required listening checkpoint · {clock(second)}</title></line>; })}
        <line x1={Math.max(0, Math.min(width, currentTime / safeDuration * width))} x2={Math.max(0, Math.min(width, currentTime / safeDuration * width))} y1="18" y2="164" stroke="#ffffff" strokeWidth="2.5" />
      </svg>
    </button>
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[8px] font-black uppercase tracking-[0.08em] text-slate-400"><span><span className="text-cyan-300">■</span> Baseline RMS</span><span><span className="text-violet-300">■</span> Proposal RMS</span><span><span className="text-rose-400">■</span> Clipped measured window</span><span><span className="text-fuchsia-300">│</span> Proposed gain range</span><span><span className="text-amber-300">┆</span> Review checkpoint</span></div>
  </div>;
}

function clock(seconds: number) { const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0; return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`; }
