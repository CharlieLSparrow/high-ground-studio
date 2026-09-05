"use client";

import { useId, useMemo, useState, type MouseEvent } from "react";

export type AudioProcessingSeriesPoint = {
  timeMs: number;
  shortTermLufs: number | null;
};

export type AudioProcessingMeasurement = {
  durationSeconds: number;
  integratedLufs: number;
  seriesResolutionMs: number;
  series: AudioProcessingSeriesPoint[];
};

export type AudioProcessingObservation = {
  kind: string;
  severity: "attention" | "warning";
  startSeconds: number;
  endSeconds: number;
  detail: string;
};

export type AudioProcessingDeltaPoint = {
  timeSeconds: number;
  sourceShortTermLufs: number;
  candidateShortTermLufs: number;
  levelDeltaLu: number;
  shapeDeltaLu: number;
};

export type AudioProcessingAttentionMoment = {
  id: string;
  category: "source-signal" | "candidate-signal" | "dynamic-shape";
  timeSeconds: number;
  endSeconds: number;
  label: string;
  detail: string;
  severity: "attention" | "warning";
};

export type AudioProcessingViewMode = "whole" | "minute" | "detail";

export type AudioProcessingViewSpan = {
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
};

function finite(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function clock(seconds: number) {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  return `${Math.floor(safe / 60)}:${Math.floor(safe % 60).toString().padStart(2, "0")}`;
}

function alignedPoint(series: AudioProcessingSeriesPoint[], timeMs: number, toleranceMs: number) {
  let best: AudioProcessingSeriesPoint | null = null;
  let distance = Number.POSITIVE_INFINITY;
  for (const point of series) {
    const candidateDistance = Math.abs(point.timeMs - timeMs);
    if (candidateDistance <= toleranceMs && candidateDistance < distance) {
      best = point;
      distance = candidateDistance;
    }
  }
  return best;
}

export function audioProcessingViewSpan(
  durationSeconds: number,
  selectedSeconds: number,
  mode: AudioProcessingViewMode,
): AudioProcessingViewSpan {
  const duration = Math.max(0.001, Number.isFinite(durationSeconds) ? durationSeconds : 0.001);
  if (mode === "whole") return { startSeconds: 0, endSeconds: duration, durationSeconds: duration };
  const requestedDuration = Math.min(duration, mode === "minute" ? 60 : 15);
  const startSeconds = clamp(
    selectedSeconds - requestedDuration / 2,
    0,
    Math.max(0, duration - requestedDuration),
  );
  return { startSeconds, endSeconds: startSeconds + requestedDuration, durationSeconds: requestedDuration };
}

export function audioProcessingDeltaSeries(
  source: AudioProcessingMeasurement,
  candidate: AudioProcessingMeasurement,
): AudioProcessingDeltaPoint[] {
  const toleranceMs = Math.max(source.seriesResolutionMs, candidate.seriesResolutionMs);
  const programShiftLu = candidate.integratedLufs - source.integratedLufs;
  return source.series.flatMap((sourcePoint) => {
    if (!finite(sourcePoint.shortTermLufs)) return [];
    const candidatePoint = alignedPoint(candidate.series, sourcePoint.timeMs, toleranceMs);
    if (!candidatePoint || !finite(candidatePoint.shortTermLufs)) return [];
    const levelDeltaLu = candidatePoint.shortTermLufs - sourcePoint.shortTermLufs;
    return [{
      timeSeconds: sourcePoint.timeMs / 1_000,
      sourceShortTermLufs: sourcePoint.shortTermLufs,
      candidateShortTermLufs: candidatePoint.shortTermLufs,
      levelDeltaLu,
      shapeDeltaLu: levelDeltaLu - programShiftLu,
    }];
  });
}

export function audioProcessingPointAt(points: AudioProcessingDeltaPoint[], seconds: number) {
  return points.reduce<AudioProcessingDeltaPoint | null>((nearest, point) => {
    if (!nearest) return point;
    return Math.abs(point.timeSeconds - seconds) < Math.abs(nearest.timeSeconds - seconds) ? point : nearest;
  }, null);
}

export function audioProcessingSummary(points: AudioProcessingDeltaPoint[]) {
  if (points.length === 0) {
    return { pointCount: 0, meanAbsoluteShapeDeltaLu: null, largestShapeDelta: null };
  }
  const largestShapeDelta = points.reduce((largest, point) => (
    Math.abs(point.shapeDeltaLu) > Math.abs(largest.shapeDeltaLu) ? point : largest
  ));
  return {
    pointCount: points.length,
    meanAbsoluteShapeDeltaLu: points.reduce((sum, point) => sum + Math.abs(point.shapeDeltaLu), 0) / points.length,
    largestShapeDelta,
  };
}

function readableKind(value: string) {
  return value.replaceAll("-", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function audioProcessingAttentionMoments(
  points: AudioProcessingDeltaPoint[],
  observations: AudioProcessingObservation[],
  candidateObservations: AudioProcessingObservation[] = [],
): AudioProcessingAttentionMoment[] {
  const dynamicMoments = [...points]
    .filter((point) => Math.abs(point.shapeDeltaLu) > 0.000_001)
    .sort((left, right) => Math.abs(right.shapeDeltaLu) - Math.abs(left.shapeDeltaLu) || left.timeSeconds - right.timeSeconds)
    .reduce<AudioProcessingDeltaPoint[]>((selected, point) => {
      if (selected.length >= 8 || selected.some((candidate) => Math.abs(candidate.timeSeconds - point.timeSeconds) < 3)) return selected;
      return [...selected, point];
    }, [])
    .map((point): AudioProcessingAttentionMoment => ({
      id: `dynamic-${point.timeSeconds}`,
      category: "dynamic-shape",
      timeSeconds: point.timeSeconds,
      endSeconds: point.timeSeconds,
      label: `Dynamics ${point.shapeDeltaLu >= 0 ? "+" : ""}${point.shapeDeltaLu.toFixed(1)} LU`,
      detail: `The processed candidate is ${Math.abs(point.shapeDeltaLu).toFixed(1)} LU ${point.shapeDeltaLu >= 0 ? "louder" : "quieter"} here after removing the uniform program-level shift. Compare both versions at matched loudness.`,
      severity: "attention",
    }));
  const signalMoments = (
    category: "source-signal" | "candidate-signal",
    values: AudioProcessingObservation[],
  ) => values.map((observation, index): AudioProcessingAttentionMoment => ({
    id: `${category}-${observation.kind}-${observation.startSeconds}-${index}`,
    category,
    timeSeconds: observation.startSeconds,
    endSeconds: observation.endSeconds,
    label: `${category === "source-signal" ? "Source" : "Candidate"} · ${readableKind(observation.kind)}`,
    detail: observation.detail,
    severity: observation.severity,
  }));
  return [
    ...signalMoments("source-signal", observations),
    ...signalMoments("candidate-signal", candidateObservations),
    ...dynamicMoments,
  ]
    .sort((left, right) => left.timeSeconds - right.timeSeconds || left.id.localeCompare(right.id))
    .slice(0, 200);
}

export function audioProcessingAdjacentMoment(
  moments: AudioProcessingAttentionMoment[],
  selectedSeconds: number,
  direction: "previous" | "next",
) {
  if (moments.length === 0) return null;
  if (direction === "next") {
    return moments.find((moment) => moment.timeSeconds > selectedSeconds + 0.001) ?? moments[0];
  }
  return [...moments].reverse().find((moment) => moment.timeSeconds < selectedSeconds - 0.001) ?? moments.at(-1) ?? null;
}

export function AudioProcessingChangeMap({
  source,
  candidate,
  observations,
  candidateObservations,
  selectedSeconds,
  onSelect,
  title = "Processing change map",
  candidateLabel = "processed candidate",
  candidateObservationLabel = "Candidate signal flag",
  levelDeltaLabel = "Delivery delta LU",
  caveat = "Neither value identifies a specific processor or certifies sound quality; use the map to seek, then compare at matched loudness.",
}: {
  source: AudioProcessingMeasurement;
  candidate: AudioProcessingMeasurement;
  observations: AudioProcessingObservation[];
  candidateObservations?: AudioProcessingObservation[];
  selectedSeconds: number;
  onSelect: (seconds: number) => void;
  title?: string;
  candidateLabel?: string;
  candidateObservationLabel?: string;
  levelDeltaLabel?: string;
  caveat?: string;
}) {
  const [viewMode, setViewMode] = useState<AudioProcessingViewMode>("whole");
  const titleId = useId();
  const descriptionId = useId();
  const width = 1_000;
  const height = 174;
  const plotTop = 24;
  const plotBottom = 146;
  const center = (plotTop + plotBottom) / 2;
  const duration = Math.max(source.durationSeconds, candidate.durationSeconds, 0.001);
  const span = audioProcessingViewSpan(duration, selectedSeconds, viewMode);
  const points = useMemo(() => audioProcessingDeltaSeries(source, candidate), [candidate, source]);
  const summary = useMemo(() => audioProcessingSummary(points), [points]);
  const attentionMoments = useMemo(
    () => audioProcessingAttentionMoments(points, observations, candidateObservations),
    [candidateObservations, observations, points],
  );
  const nearbyAttentionMoments = useMemo(() => {
    if (attentionMoments.length <= 10) return attentionMoments;
    const nextIndex = attentionMoments.findIndex((moment) => moment.timeSeconds >= selectedSeconds);
    const centerIndex = nextIndex < 0 ? attentionMoments.length - 1 : nextIndex;
    const startIndex = clamp(centerIndex - 3, 0, attentionMoments.length - 10);
    return attentionMoments.slice(startIndex, startIndex + 10);
  }, [attentionMoments, selectedSeconds]);
  const selectedPoint = useMemo(() => audioProcessingPointAt(points, selectedSeconds), [points, selectedSeconds]);
  const visiblePoints = points.filter((point) => point.timeSeconds >= span.startSeconds && point.timeSeconds <= span.endSeconds);
  const visibleObservations = observations.filter((observation) => observation.startSeconds <= span.endSeconds && observation.endSeconds >= span.startSeconds);
  const visibleCandidateObservations = candidateObservations?.filter((observation) => observation.startSeconds <= span.endSeconds && observation.endSeconds >= span.startSeconds) ?? [];
  const maximumShapeDeltaLu = Math.max(1, ...visiblePoints.map((point) => Math.abs(point.shapeDeltaLu)));
  const displayLimitLu = Math.max(3, Math.ceil(maximumShapeDeltaLu));
  const x = (seconds: number) => clamp(((seconds - span.startSeconds) / span.durationSeconds) * width, 0, width);
  const y = (deltaLu: number) => center - clamp(deltaLu / displayLimitLu, -1, 1) * ((plotBottom - plotTop) / 2 - 4);
  const programShiftLu = candidate.integratedLufs - source.integratedLufs;

  function selectFromMap(event: MouseEvent<HTMLButtonElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const fraction = bounds.width > 0 ? clamp((event.clientX - bounds.left) / bounds.width, 0, 1) : 0;
    onSelect(span.startSeconds + fraction * span.durationSeconds);
  }

  function inspectMoment(moment: AudioProcessingAttentionMoment) {
    setViewMode("detail");
    onSelect(moment.timeSeconds);
  }

  function inspectAdjacent(direction: "previous" | "next") {
    const moment = audioProcessingAdjacentMoment(attentionMoments, selectedSeconds, direction);
    if (moment) inspectMoment(moment);
  }

  return <section className="mt-3 rounded-lg border border-sky-800 bg-[#111827] p-3" aria-label={title}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="text-xs font-black text-white">{title}</div>
        <p className="mt-1 max-w-3xl text-[9px] font-bold leading-4 text-slate-300">Short-term loudness difference on the shared decoded clock. Bars remove the uniform {programShiftLu >= 0 ? "+" : ""}{programShiftLu.toFixed(1)} LU program shift so dynamic-shape changes are visible. This is not compressor gain reduction.</p>
      </div>
      <div className="grid grid-cols-3 gap-1 rounded-lg border border-slate-700 bg-slate-900 p-1" role="group" aria-label={`${title} zoom`}>
        {(["whole", "minute", "detail"] as const).map((mode) => <button key={mode} type="button" aria-pressed={viewMode === mode} onClick={() => setViewMode(mode)} className={`min-h-9 rounded-md px-2 text-[9px] font-black uppercase tracking-wide ${viewMode === mode ? "bg-sky-200 text-sky-950" : "text-slate-300 hover:bg-slate-800"}`}>{mode === "whole" ? "Whole" : mode === "minute" ? "60 sec" : "15 sec"}</button>)}
      </div>
    </div>

    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[9px] font-black uppercase tracking-wide text-slate-300" aria-label={`${title} legend`}>
      <span><span className="mr-1 inline-block h-2 w-3 rounded-sm bg-emerald-400 align-middle" />Relatively louder</span>
      <span><span className="mr-1 inline-block h-2 w-3 rounded-sm bg-violet-400 align-middle" />Relatively quieter</span>
      <span><span className="mr-1 inline-block h-3 w-0.5 bg-amber-300 align-middle" />Source signal flag</span>
      {candidateObservations && <span><span className="mr-1 inline-block h-3 w-0.5 bg-blue-400 align-middle" />{candidateObservationLabel}</span>}
      <span><span className="mr-1 inline-block h-3 w-0.5 bg-cyan-300 align-middle" />Selected playhead</span>
    </div>

    <section className="mt-3 rounded-lg border border-slate-700 bg-slate-900 p-2.5" aria-label={`${title} review navigator`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.14em] text-sky-200">Change navigator</p>
          <p className="mt-0.5 text-[9px] font-bold leading-4 text-slate-400">{attentionMoments.length} bounded source-clock comparison point{attentionMoments.length === 1 ? "" : "s"}: strongest relative dynamic changes and deterministic signal flags.</p>
        </div>
        <div className="flex gap-1">
          <button type="button" disabled={attentionMoments.length === 0} onClick={() => inspectAdjacent("previous")} className="min-h-9 rounded-md border border-slate-600 px-2.5 text-[9px] font-black text-slate-200 hover:bg-slate-800 disabled:opacity-40">← Previous</button>
          <button type="button" disabled={attentionMoments.length === 0} onClick={() => inspectAdjacent("next")} className="min-h-9 rounded-md bg-sky-200 px-2.5 text-[9px] font-black text-sky-950 hover:bg-sky-100 disabled:opacity-40">Next change →</button>
        </div>
      </div>
      {attentionMoments.length > 0 ? <><div className="mt-2 flex gap-1.5 overflow-x-auto pb-1" aria-label={`${title} comparison points`}>
        {nearbyAttentionMoments.map((moment) => <button key={moment.id} type="button" onClick={() => inspectMoment(moment)} title={moment.detail} className={`min-h-9 shrink-0 rounded-md border px-2.5 text-left text-[9px] font-black ${moment.severity === "warning" ? "border-rose-500/70 bg-rose-950/40 text-rose-200" : moment.category === "dynamic-shape" ? "border-fuchsia-500/70 bg-fuchsia-950/40 text-fuchsia-200" : moment.category === "candidate-signal" ? "border-blue-500/70 bg-blue-950/40 text-blue-200" : "border-amber-500/70 bg-amber-950/40 text-amber-200"}`}><span className="font-mono">{clock(moment.timeSeconds)}</span> · {moment.label}</button>)}
      </div>{attentionMoments.length > nearbyAttentionMoments.length ? <p className="mt-1 text-[8px] font-bold text-slate-500">Showing {nearbyAttentionMoments.length} points nearest the playhead. Previous and Next traverse the full {attentionMoments.length}-point bounded comparison queue.</p> : null}</> : <p className="mt-2 rounded-md border border-emerald-800 bg-emerald-950/30 p-2 text-[9px] font-bold text-emerald-200">No measurable dynamic-shape change or deterministic signal flag needs comparison.</p>}
    </section>

    <button type="button" onClick={selectFromMap} className="mt-3 block w-full overflow-hidden rounded-lg border border-slate-700 bg-slate-950 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300" aria-label={`${title} from ${clock(span.startSeconds)} to ${clock(span.endSeconds)}. Select a position to move synchronized audition playback.`}>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full" role="img" aria-labelledby={`${titleId} ${descriptionId}`} preserveAspectRatio="none">
        <title id={titleId}>{title} over the source clock</title>
        <desc id={descriptionId}>Bars above zero are relatively louder in the {candidateLabel} after the uniform program shift is removed. Bars below zero are relatively quieter. Amber markers are deterministic source-signal observations. Cyan marks the synchronized audition playhead.</desc>
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
          const gridX = fraction * width;
          const gridSeconds = span.startSeconds + fraction * span.durationSeconds;
          return <g key={fraction}><line x1={gridX} x2={gridX} y1={plotTop} y2={plotBottom} stroke="#334155" strokeDasharray="2 7" /><text x={clamp(gridX + 5, 5, width - 55)} y="14" fill="#94a3b8" fontSize="10" fontWeight="700">{clock(gridSeconds)}</text></g>;
        })}
        <line x1="0" x2={width} y1={center} y2={center} stroke="#94a3b8" strokeWidth="1.5" />
        <text x="6" y={center - 5} fill="#94a3b8" fontSize="9" fontWeight="700">Uniform program shift</text>
        <text x="6" y={plotTop + 10} fill="var(--color-quipsly-fern-300)" fontSize="9" fontWeight="800">+{displayLimitLu} LU shape</text>
        <text x="6" y={plotBottom - 5} fill="var(--color-quipsly-inkberry-300)" fontSize="9" fontWeight="800">-{displayLimitLu} LU shape</text>
        {visiblePoints.map((point, index) => {
          const pointX = x(point.timeSeconds);
          const next = visiblePoints[index + 1];
          const pointEndX = next ? x(next.timeSeconds) : Math.min(width, pointX + width / Math.max(1, visiblePoints.length));
          const pointWidth = Math.max(1.5, pointEndX - pointX - 0.5);
          const pointY = y(point.shapeDeltaLu);
          return <rect key={`${point.timeSeconds}-${index}`} x={pointX} y={Math.min(center, pointY)} width={pointWidth} height={Math.max(1, Math.abs(center - pointY))} fill={point.shapeDeltaLu >= 0 ? "var(--color-quipsly-fern-400)" : "var(--color-quipsly-inkberry-500)"} opacity="0.82"><title>{clock(point.timeSeconds)} level {point.levelDeltaLu >= 0 ? "+" : ""}{point.levelDeltaLu.toFixed(1)} LU; shape {point.shapeDeltaLu >= 0 ? "+" : ""}{point.shapeDeltaLu.toFixed(1)} LU</title></rect>;
        })}
        {visibleObservations.map((observation, index) => <line key={`${observation.kind}-${observation.startSeconds}-${index}`} x1={x(observation.startSeconds)} x2={x(observation.startSeconds)} y1={plotTop} y2={plotBottom} stroke={observation.severity === "warning" ? "var(--color-quipsly-rosewood-400)" : "var(--color-quipsly-brass-400)"} strokeWidth="2" strokeDasharray="5 3"><title>{clock(observation.startSeconds)} {observation.detail}</title></line>)}
        {visibleCandidateObservations.map((observation, index) => <line key={`candidate-${observation.kind}-${observation.startSeconds}-${index}`} x1={x(observation.startSeconds)} x2={x(observation.startSeconds)} y1={plotTop} y2={plotBottom} stroke={observation.severity === "warning" ? "var(--color-quipsly-rosewood-500)" : "var(--color-quipsly-lake-400)"} strokeWidth="2" strokeDasharray="2 4"><title>{clock(observation.startSeconds)} {candidateLabel}: {observation.detail}</title></line>)}
        <line x1={x(selectedSeconds)} x2={x(selectedSeconds)} y1={plotTop - 5} y2={plotBottom + 5} stroke="var(--color-quipsly-lake-300)" strokeWidth="2.5" />
      </svg>
    </button>

    <div className="mt-3 grid grid-cols-2 gap-2 text-[9px] font-bold sm:grid-cols-5">
      <div className="rounded-lg bg-slate-900 p-2"><div className="font-mono text-sm font-black text-cyan-200">{clock(selectedSeconds)}</div><div className="text-slate-400">Selected time</div></div>
      <div className="rounded-lg bg-slate-900 p-2"><div className="font-mono text-sm font-black text-sky-200">{selectedPoint ? `${selectedPoint.levelDeltaLu >= 0 ? "+" : ""}${selectedPoint.levelDeltaLu.toFixed(1)}` : "—"}</div><div className="text-slate-400">{levelDeltaLabel}</div></div>
      <div className="rounded-lg bg-slate-900 p-2"><div className={`font-mono text-sm font-black ${selectedPoint && selectedPoint.shapeDeltaLu < 0 ? "text-violet-200" : "text-emerald-200"}`}>{selectedPoint ? `${selectedPoint.shapeDeltaLu >= 0 ? "+" : ""}${selectedPoint.shapeDeltaLu.toFixed(1)}` : "—"}</div><div className="text-slate-400">Shape delta LU</div></div>
      <div className="rounded-lg bg-slate-900 p-2"><div className="font-mono text-sm font-black text-slate-200">{summary.meanAbsoluteShapeDeltaLu === null ? "—" : summary.meanAbsoluteShapeDeltaLu.toFixed(1)}</div><div className="text-slate-400">Mean |shape| LU</div></div>
      <div className="col-span-2 rounded-lg bg-slate-900 p-2 sm:col-span-1"><div className="font-mono text-sm font-black text-amber-200">{summary.largestShapeDelta ? clock(summary.largestShapeDelta.timeSeconds) : "—"}</div><div className="text-slate-400">Largest shape change · {summary.pointCount} windows</div></div>
    </div>
    <p className="mt-3 text-[9px] font-bold leading-4 text-slate-400">Level delta includes overall level change. Shape delta subtracts the integrated program shift to expose relative dynamics. {caveat}</p>
  </section>;
}
