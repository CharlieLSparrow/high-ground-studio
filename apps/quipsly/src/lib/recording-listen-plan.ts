export type ListenRange = { startSeconds: number; endSeconds: number };
export type ListenSpan = ListenRange & { outputStart: number; outputEnd: number };
export type ListenSource = { id: string; label: string; url: string; offset: number; duration: number };

/** Projection of the canonical edit, never another saved timeline. */
export function recordingListenPlan(start: number, end: number, cuts: ListenRange[]): ListenSpan[] {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) return [];
  const removed = cuts.filter(cut => Number.isFinite(cut.startSeconds) && Number.isFinite(cut.endSeconds) && cut.endSeconds > cut.startSeconds)
    .map(cut => ({startSeconds: Math.max(start, cut.startSeconds), endSeconds: Math.min(end, cut.endSeconds)}))
    .filter(cut => cut.endSeconds > cut.startSeconds).sort((a, b) => a.startSeconds - b.startSeconds);
  const spans: ListenSpan[] = [];
  let cursor = start, output = 0;
  const append = (until: number) => {
    if (until <= cursor) return;
    spans.push({startSeconds: cursor, endSeconds: until, outputStart: output, outputEnd: output + until - cursor});
    output += until - cursor;
  };
  for (const cut of removed) { append(cut.startSeconds); cursor = Math.max(cursor, cut.endSeconds); }
  append(end);
  return spans;
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
