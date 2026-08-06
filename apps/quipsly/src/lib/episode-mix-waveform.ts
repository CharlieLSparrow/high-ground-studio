export type EpisodeMixSignalWindow = {
  startSeconds: number;
  durationSeconds: number;
  rmsDbfs: number;
  samplePeakDbfs: number;
  clippedFrameCount: number;
};

export function compactEpisodeMixWaveform(points: EpisodeMixSignalWindow[], maximumPoints = 180): EpisodeMixSignalWindow[] {
  if (!Number.isSafeInteger(maximumPoints) || maximumPoints < 1) throw new Error("A positive waveform display limit is required.");
  if (points.length <= maximumPoints) return points;
  const groupSize = Math.ceil(points.length / maximumPoints);
  const compacted: EpisodeMixSignalWindow[] = [];
  for (let index = 0; index < points.length; index += groupSize) {
    const group = points.slice(index, index + groupSize);
    const first = group[0]!;
    const last = group.at(-1)!;
    compacted.push({
      startSeconds: first.startSeconds,
      durationSeconds: last.startSeconds + last.durationSeconds - first.startSeconds,
      rmsDbfs: Math.max(...group.map((point) => point.rmsDbfs)),
      samplePeakDbfs: Math.max(...group.map((point) => point.samplePeakDbfs)),
      clippedFrameCount: group.reduce((sum, point) => sum + point.clippedFrameCount, 0),
    });
  }
  return compacted;
}

export function episodeMixDbfsHeight(dbfs: number, maximumHeight: number) {
  if (!Number.isFinite(dbfs) || !Number.isFinite(maximumHeight) || maximumHeight <= 0) return 0;
  return Math.max(0, Math.min(maximumHeight, ((Math.max(-72, Math.min(0, dbfs)) + 72) / 72) * maximumHeight));
}
