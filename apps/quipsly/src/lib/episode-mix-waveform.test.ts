import { compactEpisodeMixWaveform, episodeMixDbfsHeight } from "./episode-mix-waveform";

describe("episode mix waveform projection", () => {
  it("compacts measured windows without inventing signal or losing peaks and clipping", () => {
    const compacted = compactEpisodeMixWaveform([
      { startSeconds: 0, durationSeconds: 1, rmsDbfs: -30, samplePeakDbfs: -8, clippedFrameCount: 0 },
      { startSeconds: 1, durationSeconds: 1, rmsDbfs: -18, samplePeakDbfs: -1, clippedFrameCount: 2 },
      { startSeconds: 2, durationSeconds: 1, rmsDbfs: -24, samplePeakDbfs: -4, clippedFrameCount: 0 },
      { startSeconds: 3, durationSeconds: 1, rmsDbfs: -12, samplePeakDbfs: -0.5, clippedFrameCount: 3 },
    ], 2);
    expect(compacted).toEqual([
      { startSeconds: 0, durationSeconds: 2, rmsDbfs: -18, samplePeakDbfs: -1, clippedFrameCount: 2 },
      { startSeconds: 2, durationSeconds: 2, rmsDbfs: -12, samplePeakDbfs: -0.5, clippedFrameCount: 3 },
    ]);
  });

  it("maps the declared display floor and digital full scale into bounded geometry", () => {
    expect(episodeMixDbfsHeight(-72, 30)).toBe(0);
    expect(episodeMixDbfsHeight(0, 30)).toBe(30);
    expect(episodeMixDbfsHeight(-36, 30)).toBe(15);
    expect(episodeMixDbfsHeight(-120, 30)).toBe(0);
    expect(episodeMixDbfsHeight(4, 30)).toBe(30);
  });
});
