"use client";

import type { AudioTranscriptEvidence } from "@/lib/transcript-evidence";

type AudioSignal = NonNullable<AudioTranscriptEvidence["audio"]["signal"]>;

export type SourceSyncDriftModel = {
  measured: boolean;
  observationTimelineSeconds: number | null;
  observedPartsPerMillion: number | null;
  projectedEndDriftMilliseconds: number | null;
  direction: "target-late" | "target-early" | "aligned" | "unknown";
  videoPerceptionContext: "not-applicable" | "not-measured" | "average-undetectable-window" | "average-detectable-window" | "beyond-average-acceptability";
};

export function sourceSyncDriftModel(input: {
  anchorSeconds: number;
  observationIntervalSeconds: number | null;
  residualDriftMilliseconds: number | null;
  targetDurationSeconds: number | null;
  targetKind: "audio" | "video" | "unknown";
}): SourceSyncDriftModel {
  const interval = input.observationIntervalSeconds;
  const residual = input.residualDriftMilliseconds;
  const measured = typeof interval === "number"
    && Number.isFinite(interval)
    && interval > 0
    && typeof residual === "number"
    && Number.isFinite(residual);
  const ppm = measured ? residual * 1_000 / interval : null;
  const targetDuration = typeof input.targetDurationSeconds === "number"
    && Number.isFinite(input.targetDurationSeconds)
    && input.targetDurationSeconds > 0
    ? input.targetDurationSeconds
    : null;
  const projectedEndDrift = ppm !== null && targetDuration !== null
    ? ppm * targetDuration / 1_000
    : null;
  const direction = !measured
    ? "unknown"
    : Math.abs(residual) < 0.0005
      ? "aligned"
      : residual > 0
        ? "target-late"
        : "target-early";
  let videoPerceptionContext: SourceSyncDriftModel["videoPerceptionContext"] = input.targetKind === "video"
    ? "not-measured"
    : "not-applicable";
  if (input.targetKind === "video" && measured) {
    // Positive means the target picture is late relative to the audio spine.
    // These are ITU-R BT.1359 average human thresholds, context only—not an
    // automatic approval or a substitute for content-specific listening.
    videoPerceptionContext = residual >= -125 && residual <= 45
      ? "average-undetectable-window"
      : residual >= -185 && residual <= 90
        ? "average-detectable-window"
        : "beyond-average-acceptability";
  }
  return {
    measured,
    observationTimelineSeconds: measured ? input.anchorSeconds + interval : null,
    observedPartsPerMillion: ppm,
    projectedEndDriftMilliseconds: projectedEndDrift,
    direction,
    videoPerceptionContext,
  };
}

function clock(seconds: number) {
  const safe = Math.max(0, seconds);
  const totalMilliseconds = Math.round(safe * 1_000);
  const minutes = Math.floor(totalMilliseconds / 60_000);
  const wholeSeconds = Math.floor((totalMilliseconds % 60_000) / 1_000);
  const milliseconds = totalMilliseconds % 1_000;
  return `${minutes}:${String(wholeSeconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

function signedMilliseconds(value: number | null) {
  if (value === null) return "not measured";
  return `${value > 0 ? "+" : ""}${value.toFixed(3)} ms`;
}

function waveformBars(input: {
  signal: AudioSignal;
  offsetSeconds: number;
  viewStart: number;
  viewDuration: number;
  laneCenter: number;
  color: string;
}) {
  return input.signal.waveform.flatMap((point, index) => {
    const timelineStart = input.offsetSeconds + point.startSeconds;
    const timelineEnd = timelineStart + point.durationSeconds;
    if (timelineEnd < input.viewStart || timelineStart > input.viewStart + input.viewDuration) return [];
    const x = ((timelineStart - input.viewStart) / input.viewDuration) * 1_000;
    const width = Math.max(1, point.durationSeconds / input.viewDuration * 1_000);
    const amplitude = Math.max(0.04, Math.min(1, (point.rmsDbfs + 80) / 80));
    const height = 42 * amplitude;
    return [<rect key={`${input.color}-${index}`} x={x} y={input.laneCenter - height / 2} width={width} height={height} rx={1} fill={input.color} opacity={0.86} />];
  });
}

export function SourceSyncEvidenceMap({
  spineLabel,
  targetLabel,
  targetKind,
  anchorSeconds,
  observationIntervalSeconds,
  residualDriftMilliseconds,
  targetDurationSeconds,
  spineSignal,
  targetSignal,
}: {
  spineLabel: string;
  targetLabel: string;
  targetKind: "audio" | "video" | "unknown";
  anchorSeconds: number;
  observationIntervalSeconds: number | null;
  residualDriftMilliseconds: number | null;
  targetDurationSeconds: number | null;
  spineSignal: AudioSignal | null;
  targetSignal: AudioSignal | null;
}) {
  const model = sourceSyncDriftModel({
    anchorSeconds,
    observationIntervalSeconds,
    residualDriftMilliseconds,
    targetDurationSeconds,
    targetKind,
  });
  const duration = Math.max(
    1,
    spineSignal?.durationSeconds ?? 0,
    anchorSeconds + (targetDurationSeconds ?? targetSignal?.durationSeconds ?? 0),
    model.observationTimelineSeconds ?? 0,
  );
  const viewStart = 0;
  const viewDuration = duration;
  const anchorX = Math.max(0, Math.min(1_000, anchorSeconds / viewDuration * 1_000));
  const observationX = model.observationTimelineSeconds === null
    ? null
    : Math.max(0, Math.min(1_000, model.observationTimelineSeconds / viewDuration * 1_000));
  const driftScale = Math.max(200, Math.abs(residualDriftMilliseconds ?? 0) * 1.25);
  const driftX = residualDriftMilliseconds === null
    ? null
    : 500 + residualDriftMilliseconds / driftScale * 450;
  const contextLabel = model.videoPerceptionContext === "average-undetectable-window"
    ? "Inside the ITU average detectability window"
    : model.videoPerceptionContext === "average-detectable-window"
      ? "Inside the ITU detectable-to-acceptable band"
      : model.videoPerceptionContext === "beyond-average-acceptability"
        ? "Beyond the ITU average acceptability threshold"
        : model.videoPerceptionContext === "not-measured"
          ? "Video perception context awaits a later measurement"
          : "No video perception threshold applied";

  return (
    <section aria-label="Source sync evidence map" className="mt-3 rounded-xl border border-violet-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-black text-violet-950">Shared-clock sync evidence</h4>
          <p className="mt-1 text-[11px] font-bold leading-5 text-violet-900">Opening placement and later drift stay visible together. Positive residual means the target event arrived late relative to the audio spine.</p>
        </div>
        <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-1 font-mono text-[10px] font-black uppercase tracking-[0.12em] text-violet-900">{model.measured ? "later point measured" : "later point not measured"}</span>
      </div>

      <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-[#0b1220] p-2">
        <svg viewBox="0 0 1000 170" className="h-44 w-full" role="img" aria-label="Spine and target decoded waveforms aligned on the shared episode clock" preserveAspectRatio="none">
          <rect x="0" y="0" width="1000" height="170" fill="#0b1220" />
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => <line key={fraction} x1={fraction * 1_000} y1="16" x2={fraction * 1_000} y2="150" stroke="#334155" strokeWidth="1" />)}
          <line x1="0" y1="62" x2="1000" y2="62" stroke="#475569" />
          <line x1="0" y1="126" x2="1000" y2="126" stroke="#475569" />
          {spineSignal && waveformBars({ signal: spineSignal, offsetSeconds: 0, viewStart, viewDuration, laneCenter: 52, color: "var(--color-quipsly-lake-400)" })}
          {targetSignal && waveformBars({ signal: targetSignal, offsetSeconds: anchorSeconds, viewStart, viewDuration, laneCenter: 116, color: "var(--color-quipsly-inkberry-400)" })}
          <line x1={anchorX} y1="12" x2={anchorX} y2="148" stroke="#f8fafc" strokeWidth="2" />
          {observationX !== null && <line x1={observationX} y1="12" x2={observationX} y2="148" stroke="var(--color-quipsly-brass-400)" strokeWidth="2" strokeDasharray="8 5" />}
          {!spineSignal && <text x="500" y="56" textAnchor="middle" fill="#67e8f9" fontSize="12" fontWeight="800">Spine decoded waveform not attached</text>}
          {!targetSignal && <text x="500" y="120" textAnchor="middle" fill="#c4b5fd" fontSize="12" fontWeight="800">Target decoded waveform not attached</text>}
          <text x="8" y="20" fill="#67e8f9" fontSize="11" fontWeight="900">SPINE</text>
          <text x="8" y="84" fill="#c4b5fd" fontSize="11" fontWeight="900">TARGET</text>
          <text x={Math.min(940, anchorX + 6)} y="164" fill="#f8fafc" fontSize="10" fontWeight="900">OPEN {clock(anchorSeconds)}</text>
          {observationX !== null && <text x={Math.max(8, Math.min(890, observationX - 96))} y="20" fill="var(--color-quipsly-brass-400)" fontSize="10" fontWeight="900">LATER {clock(model.observationTimelineSeconds!)}</text>}
        </svg>
        <div className="mt-1 grid gap-1 text-[9px] font-bold text-slate-300 sm:grid-cols-2"><span className="truncate text-cyan-200">Spine · {spineLabel}</span><span className="truncate text-violet-200">Target · {targetLabel}</span></div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-violet-200 bg-violet-50 p-2"><div className="text-[9px] font-black uppercase tracking-wider text-violet-700">Later residual</div><div className="mt-1 font-mono text-lg font-black text-violet-950">{signedMilliseconds(residualDriftMilliseconds)}</div></div>
        <div className="rounded-lg border border-violet-200 bg-violet-50 p-2"><div className="text-[9px] font-black uppercase tracking-wider text-violet-700">Observed rate</div><div className="mt-1 font-mono text-lg font-black text-violet-950">{model.observedPartsPerMillion === null ? "not measured" : `${model.observedPartsPerMillion.toFixed(3)} ppm`}</div></div>
        <div className="rounded-lg border border-violet-200 bg-violet-50 p-2"><div className="text-[9px] font-black uppercase tracking-wider text-violet-700">Projected at source end</div><div className="mt-1 font-mono text-lg font-black text-violet-950">{signedMilliseconds(model.projectedEndDriftMilliseconds)}</div></div>
      </div>

      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2">
        <div className="relative h-10 overflow-hidden rounded bg-slate-200" role="img" aria-label="Magnified residual drift from minus to plus milliseconds">
          <div className="absolute inset-y-0 left-1/2 w-px bg-slate-900" />
          {driftX !== null && <div className="absolute inset-y-1 w-1 rounded bg-violet-700" style={{ left: `${Math.max(0, Math.min(100, driftX / 10))}%` }} />}
          <span className="absolute bottom-0.5 left-1 text-[8px] font-black text-slate-600">target early</span><span className="absolute bottom-0.5 right-1 text-[8px] font-black text-slate-600">target late</span>
        </div>
        <p className="mt-2 text-[10px] font-bold leading-4 text-slate-700">{contextLabel}. {targetKind === "video" ? "ITU-R BT.1359 population thresholds are context only; the exact content still requires human eyes and ears." : "Audio-to-audio drift remains an engineering measurement and listening decision."}</p>
      </div>
    </section>
  );
}
