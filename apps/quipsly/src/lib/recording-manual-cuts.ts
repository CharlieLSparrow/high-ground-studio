export type RecordingTimeRange = {startSeconds: number; endSeconds: number};

/** One cut projection for the editor, quick listening, and the final renderer. */
export function recordingKeptRanges(start: number, end: number, cuts: RecordingTimeRange[]): RecordingTimeRange[] {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) return [];
  const merged: RecordingTimeRange[] = [];
  const removed = cuts.filter(cut => Number.isFinite(cut.startSeconds) && Number.isFinite(cut.endSeconds))
    .map(cut => ({startSeconds: Math.max(start, cut.startSeconds), endSeconds: Math.min(end, cut.endSeconds)}))
    .filter(cut => cut.endSeconds > cut.startSeconds).sort((a, b) => a.startSeconds - b.startSeconds);
  for (const cut of removed) {
    const last = merged.at(-1);
    if (last && cut.startSeconds <= last.endSeconds + 0.02) last.endSeconds = Math.max(last.endSeconds, cut.endSeconds);
    else merged.push({...cut});
  }
  const kept: RecordingTimeRange[] = [];
  let cursor = start;
  for (const cut of merged) {
    if (cut.startSeconds - cursor >= 0.05) kept.push({startSeconds: cursor, endSeconds: cut.startSeconds});
    cursor = Math.max(cursor, cut.endSeconds);
  }
  if (end - cursor >= 0.05) kept.push({startSeconds: cursor, endSeconds: end});
  return kept;
}

/** Program-clock cuts apply to all tracks together; the source files never change. */
export function parseRecordingManualCuts(value: unknown, duration: number): RecordingTimeRange[] {
  if (value === undefined) return [];
  if (!Number.isFinite(duration) || duration < 0) throw new RangeError("The recording duration is unavailable.");
  if (!Array.isArray(value) || value.length > 500) throw new RangeError("Choose up to 500 recording cuts.");
  return value.map(range => {
    if (!range || typeof range !== "object" || !Number.isFinite(range.startSeconds) || !Number.isFinite(range.endSeconds) ||
      range.startSeconds < 0 || range.endSeconds - range.startSeconds < 0.05 || range.endSeconds > duration + 0.001) {
      throw new RangeError("Choose cut times within this recording, at least 0.05 seconds apart.");
    }
    return {startSeconds: range.startSeconds, endSeconds: range.endSeconds};
  });
}
