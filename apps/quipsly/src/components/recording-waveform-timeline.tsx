"use client";

import {useEffect, useId, useMemo, useState} from "react";

export type WaveformPoint = {startSeconds: number; durationSeconds: number; rmsDbfs: number};
export type TimelineRange = {startSeconds: number; endSeconds: number};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
function clock(seconds: number) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${(safe % 60).toFixed(1).padStart(4, "0")}`;
}

/** Source-clock navigation only. Editing remains owned by the session's saved edit. */
export function RecordingWaveformTimeline({duration, position, points, disabled = false, onSeek, keptRange, removedRanges = []}: {
  duration: number;
  position: number;
  points: WaveformPoint[];
  disabled?: boolean;
  onSeek: (seconds: number) => void;
  keptRange?: TimelineRange | null;
  removedRanges?: TimelineRange[];
}) {
  const id = useId();
  const [zoom, setZoom] = useState(1);
  const [windowStart, setWindowStart] = useState(0);
  const validDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const span = validDuration / zoom;
  const start = clamp(windowStart, 0, Math.max(0, validDuration - span));
  const end = start + span;
  const current = clamp(Number.isFinite(position) ? position : 0, 0, validDuration);
  const inView = current >= start && current <= end;
  const percent = (seconds: number) => span ? clamp((seconds - start) / span * 100, 0, 100) : 0;

  useEffect(() => {setWindowStart(0); setZoom(1);}, [duration]);

  // Bin actual source timestamps, not point indexes: analysis windows need not
  // be equally spaced, and a sparse trace must not be stretched into fake audio.
  const bars = useMemo(() => {
    if (!span) return [];
    const count = 240;
    const bins: Array<number | null> = Array.from({length: count}, () => null);
    for (const point of points) {
      if (!Number.isFinite(point.startSeconds) || !Number.isFinite(point.durationSeconds)
        || !Number.isFinite(point.rmsDbfs) || point.durationSeconds <= 0) continue;
      const left = Math.max(start, point.startSeconds);
      const right = Math.min(end, point.startSeconds + point.durationSeconds);
      if (right <= left) continue;
      const first = clamp(Math.floor((left - start) / span * count), 0, count - 1);
      const last = clamp(Math.ceil((right - start) / span * count) - 1, 0, count - 1);
      for (let index = first; index <= last; index++) bins[index] = Math.max(bins[index] ?? -96, point.rmsDbfs);
    }
    return bins;
  }, [points, span, start, end]);

  const visibleRange = (range: TimelineRange) => {
    const left = Math.max(start, range.startSeconds);
    const right = Math.min(end, range.endSeconds);
    return Number.isFinite(left) && Number.isFinite(right) && right > left
      ? {left: `${percent(left)}%`, width: `${percent(right) - percent(left)}%`} : null;
  };
  const trimmed = keptRange ? [
    {startSeconds: 0, endSeconds: clamp(keptRange.startSeconds, 0, validDuration)},
    {startSeconds: clamp(keptRange.endSeconds, 0, validDuration), endSeconds: validDuration},
  ] : [];

  return <section className="space-y-2" aria-label="Recording waveform timeline">
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
      <label htmlFor={id} className="font-semibold">Waveform · {clock(current)}</label>
      <label className="flex items-center gap-2">Zoom
        <select aria-label="Waveform zoom" value={zoom} disabled={!validDuration}
          className="min-h-11 rounded-lg border border-border bg-card px-2 text-foreground"
          onChange={event => {const next = Number(event.target.value); setZoom(next); setWindowStart(clamp(current - validDuration / next / 2, 0, validDuration - validDuration / next));}}>
          {[1, 2, 4, 8, 16].map(value => <option key={value} value={value}>{value}×</option>)}
        </select>
      </label>
    </div>
    <div className="relative h-28 overflow-hidden rounded-xl border border-border bg-muted focus-within:ring-2 focus-within:ring-ring">
      <svg viewBox="0 0 240 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full text-primary" role="img" aria-label="Source waveform overview">
        {bars.map((db, index) => db === null ? null : <rect key={index} x={index} width={0.8}
          y={50 - clamp((db + 72) / 72, 0.02, 1) * 46} height={clamp((db + 72) / 72, 0.02, 1) * 92}
          fill="currentColor" opacity={0.65} />)}
      </svg>
      {trimmed.map((range, index) => {const style = visibleRange(range); return style && <span key={index} data-trimmed-range className="pointer-events-none absolute inset-y-0 bg-background/75" style={style} />;})}
      {removedRanges.map((range, index) => {const style = visibleRange(range); return style && <span key={index} data-removed-range className="pointer-events-none absolute inset-y-0 border-x border-destructive/50 bg-destructive/20" style={style} />;})}
      {keptRange && [keptRange.startSeconds, keptRange.endSeconds].map((boundary, index) => boundary >= start && boundary <= end
        ? <span key={index} className="pointer-events-none absolute inset-y-0 w-0.5 bg-primary" style={{left: `${percent(boundary)}%`}} /> : null)}
      {inView && <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-0.5 bg-foreground" style={{left: `${percent(current)}%`}} />}
      <input id={id} type="range" aria-label="Seek recording waveform" aria-valuetext={clock(clamp(current, start, end))}
        min={start} max={end || 0} step={0.01} value={clamp(current, start, end)} disabled={disabled || !validDuration}
        className="absolute inset-0 h-full w-full cursor-crosshair opacity-0 disabled:cursor-not-allowed"
        onChange={event => onSeek(clamp(Number(event.target.value), start, end))} />
      {!points.length && <span className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-muted-foreground">Waveform is being prepared. You can still scrub and listen.</span>}
    </div>
    <div className="flex justify-between text-xs tabular-nums text-muted-foreground" aria-hidden="true"><span>{clock(start)}</span><span>{clock(start + span / 2)}</span><span>{clock(end)}</span></div>
    {zoom > 1 && <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={start <= 0} onClick={() => setWindowStart(Math.max(0, start - span / 2))} className="min-h-11 rounded-lg border border-border px-3 text-xs disabled:opacity-40">Earlier audio</button>
      <button type="button" disabled={end >= validDuration} onClick={() => setWindowStart(Math.min(validDuration - span, start + span / 2))} className="min-h-11 rounded-lg border border-border px-3 text-xs disabled:opacity-40">Later audio</button>
      {!inView && <button type="button" onClick={() => setWindowStart(clamp(current - span / 2, 0, validDuration - span))} className="min-h-11 px-3 text-xs underline">Show playhead</button>}
    </div>}
    {keptRange && <p className="text-xs text-muted-foreground">Faded audio is outside your trim.{removedRanges.length ? " Marked passages are removed from the edited copy." : ""} Playback here is the original track.</p>}
  </section>;
}
