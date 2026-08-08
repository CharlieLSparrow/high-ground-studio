import { fireEvent, render, screen } from "@testing-library/react";

import { SourceNavigationRail } from "./SourceStoryClient";

jest.mock("../actions", () => ({
  createNestQuickWorkAction: jest.fn(),
}));

const visualOverview = {
  id: "visual-1",
  kind: "source-visual-overview",
  profile: "contact-sheet-4x2-jpeg-v1",
  sizeBytes: "53369",
  mimeType: "image/jpeg",
  durationSeconds: 60,
  widthPixels: 1140,
  heightPixels: 328,
  framesPerSecond: null,
  createdAt: "2026-08-07T21:34:36.490Z",
  playbackUrl: "/api/media/derivatives/visual-1",
  navigationFrames: {
    columns: 4,
    rows: 2,
    sampleTimesSeconds: [3.75, 11.25, 18.75, 26.25, 33.75, 41.25, 48.75, 56.25],
  },
};

const audioNavigation = {
  id: "audio-1",
  status: "output-ready",
  failureCode: null,
  error: null,
  updatedAt: "2026-08-07T21:34:44.931Z",
  profile: "complete-decode-source-navigation-v1",
  evidence: {
    durationSeconds: 60,
    sampleRate: 48_000,
    channelCount: 2,
    rmsDbfs: -27.8,
    samplePeakDbfs: -5.7,
    clippedFrameFraction: 0,
    nearSilentFrameFraction: 0,
    stereoBalanceDb: 0.2,
    signalStatus: "signal-present" as const,
    waveform: [
      {
        startSeconds: 0,
        durationSeconds: 20,
        rmsDbfs: -30,
        samplePeakDbfs: -8,
        clippedFrameCount: 0,
      },
      {
        startSeconds: 20,
        durationSeconds: 20,
        rmsDbfs: -25,
        samplePeakDbfs: -5.7,
        clippedFrameCount: 0,
      },
      {
        startSeconds: 40,
        durationSeconds: 20,
        rmsDbfs: -28,
        samplePeakDbfs: -7,
        clippedFrameCount: 0,
      },
    ],
    observations: [],
    frequencyBands: [
      { id: "speech", label: "Speech", minimumHz: 250, maximumHz: 2_000 },
    ],
    overallBandRmsDbfs: [-24],
    source: {
      sourceRevisionId: "source-revision-1",
      inputDerivativeId: "proxy-1",
      inputGeneration: "1",
    },
    boundaries: {
      originalRemainsSourceTruth: true as const,
      inputDerivativeRemainsUnchanged: true as const,
      analysisDoesNotChangeMedia: true as const,
      observationsRequireHumanInterpretation: true as const,
    },
  },
};

describe("SourceNavigationRail", () => {
  it("keeps picture, sound, and exact source-range transport in one interaction surface", () => {
    const onSeek = jest.fn();
    const onSetIn = jest.fn();
    const onSetOut = jest.fn();
    const onUseFullRange = jest.fn();
    const onClearRange = jest.fn();
    const onPlayRange = jest.fn();

    render(
      <SourceNavigationRail
        visualOverview={visualOverview}
        audioNavigation={audioNavigation}
        durationSeconds={60}
        playbackSeconds={12.5}
        inPoint={5}
        outPoint={20}
        canWrite
        pending={false}
        sourceRevisionId="source-revision-1"
        sourceLabel="Episode 5 segment 4"
        onSeek={onSeek}
        onSetIn={onSetIn}
        onSetOut={onSetOut}
        onUseFullRange={onUseFullRange}
        onClearRange={onClearRange}
        onPlayRange={onPlayRange}
        onRequestAudio={jest.fn()}
      />,
    );

    expect(
      screen.getByText(/00:05.00 – 00:20.00 · 15.00 seconds/),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /Seek to visual sample/ }),
    ).toHaveLength(8);

    fireEvent.click(screen.getByRole("button", { name: "Mark In · 00:12.50" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Mark Out · 00:12.50" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Play selected range" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Use full take" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear range" }));

    expect(onSetIn).toHaveBeenCalledWith(12.5);
    expect(onSetOut).toHaveBeenCalledWith(12.5);
    expect(onPlayRange).toHaveBeenCalledWith(5, 20);
    expect(onUseFullRange).toHaveBeenCalledWith(60);
    expect(onClearRange).toHaveBeenCalledTimes(1);
  });

  it("does not offer selection playback until Out is after In", () => {
    render(
      <SourceNavigationRail
        visualOverview={visualOverview}
        audioNavigation={audioNavigation}
        durationSeconds={60}
        playbackSeconds={12.5}
        inPoint={20}
        outPoint={5}
        canWrite
        pending={false}
        sourceRevisionId="source-revision-1"
        sourceLabel="Episode 5 segment 4"
        onSeek={jest.fn()}
        onSetIn={jest.fn()}
        onSetOut={jest.fn()}
        onUseFullRange={jest.fn()}
        onClearRange={jest.fn()}
        onPlayRange={jest.fn()}
        onRequestAudio={jest.fn()}
      />,
    );

    expect(screen.getByText("No source range marked")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Play selected range" }),
    ).toBeDisabled();
  });
});
