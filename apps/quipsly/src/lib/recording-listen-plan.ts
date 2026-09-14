import {recordingKeptRanges} from "./recording-manual-cuts";
export type ListenRange = { startSeconds: number; endSeconds: number };
export type ListenSpan = ListenRange & { outputStart: number; outputEnd: number };
export type ListenSource = { id: string; label: string; url: string; offset: number; duration: number };

/** Projection of the canonical edit, never another saved timeline. */
export function recordingListenPlan(start: number, end: number, cuts: ListenRange[]): ListenSpan[] {
  let output = 0;
  return recordingKeptRanges(start, end, cuts).map(range => {
    const outputStart = output;
    output += range.endSeconds - range.startSeconds;
    return {...range, outputStart, outputEnd: output};
  });
}

export function listenProgramPosition(spans: ListenSpan[], seconds: number) {
  const duration = spans.at(-1)?.outputEnd ?? 0;
  const bounded = Math.max(0, Math.min(duration, Number.isFinite(seconds) ? seconds : 0));
  const span = spans.find(part => bounded < part.outputEnd) ?? spans.at(-1);
  return span ? {seconds: span.startSeconds + bounded - span.outputStart, span, output: bounded} : null;
}

export function listenSourcePositions(sources: ListenSource[], programSeconds: number) {
  return sources.filter(source => Number.isFinite(source.offset) && Number.isFinite(source.duration) && source.duration > 0
    && programSeconds >= source.offset && programSeconds < source.offset + source.duration)
    .map(source => ({source, seconds: programSeconds - source.offset}));
}
