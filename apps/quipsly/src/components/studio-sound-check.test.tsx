/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { StudioSoundCheck } from "./studio-sound-check";

class TestMediaRecorder {
  static isTypeSupported = jest.fn(() => true);
  state: "inactive" | "recording" = "inactive";
  mimeType = "audio/webm;codecs=opus";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onerror: (() => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(_stream: MediaStream, _options?: MediaRecorderOptions) {}

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["private-sample"], { type: this.mimeType }) });
    this.onstop?.();
  }
}

class TestMediaStream {
  private readonly tracks: MediaStreamTrack[];

  constructor(tracks: MediaStreamTrack[] = []) {
    this.tracks = tracks;
  }

  getAudioTracks() {
    return this.tracks;
  }
}

const evidence = {
  state: "ready" as const,
  rmsDbfs: -24,
  samplePeakDbfs: -8,
  clippedSampleCount: 0,
  sampleCount: 2_048,
  peakHoldDbfs: -5,
  clippedSampleCountSinceStart: 0,
  sampleRateHz: 48_000,
  channelCount: 1,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: false,
};

describe("StudioSoundCheck", () => {
  const originalMediaRecorder = global.MediaRecorder;
  const originalMediaStream = global.MediaStream;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const originalPause = HTMLMediaElement.prototype.pause;

  beforeEach(() => {
    Object.defineProperty(global, "MediaRecorder", { configurable: true, value: TestMediaRecorder });
    Object.defineProperty(global, "MediaStream", { configurable: true, value: TestMediaStream });
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: jest.fn(() => "blob:private-check") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: jest.fn() });
    Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value: jest.fn() });
    if (!crypto.randomUUID) {
      Object.defineProperty(crypto, "randomUUID", { configurable: true, value: jest.fn(() => "64c22a6b-186a-49c4-97ca-7e4c08b27ae5") });
    }
  });

  afterAll(() => {
    Object.defineProperty(global, "MediaRecorder", { configurable: true, value: originalMediaRecorder });
    Object.defineProperty(global, "MediaStream", { configurable: true, value: originalMediaStream });
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: originalCreateObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: originalRevokeObjectURL });
    Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value: originalPause });
  });

  it("requires full playback and records only the listener decision callback", async () => {
    const onDecision = jest.fn().mockResolvedValue({
      ok: true,
      status: "READY",
      message: "Setup receipt ready. No private audio was uploaded.",
    });
    const stream = { getAudioTracks: () => [{ readyState: "live" }] } as unknown as MediaStream;
    render(
      <StudioSoundCheck
        getInputStream={() => stream}
        microphoneLabel="Shure MV7i"
        outputId="mv7i-headphones"
        evidence={evidence}
        setupKey="mv7i:canon:mv7i-headphones"
        onDecision={onDecision}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Record private sample" }));
    fireEvent.click(screen.getByRole("button", { name: "Stop and listen" }));

    const clearButton = await screen.findByRole("button", { name: "Sounds clear in headphones" });
    expect(clearButton).toBeDisabled();
    const audio = screen.getByLabelText("Private call-path sound-check sample");
    fireEvent.ended(audio);
    expect(clearButton).toBeEnabled();
    fireEvent.click(clearButton);

    await waitFor(() => expect(onDecision).toHaveBeenCalledWith(expect.objectContaining({
      requestId: expect.any(String),
      playbackDecision: "HEARD_CLEAR",
      privateSamplePlaybackComplete: true,
    })));
    expect(screen.getByRole("status")).toHaveTextContent(/no private audio was uploaded/i);
  });

  it("opens the selected microphone itself when Preview has not run", async () => {
    const stream = { getAudioTracks: () => [{ readyState: "live" }] } as unknown as MediaStream;
    const prepareInputStream = jest.fn().mockResolvedValue(stream);
    render(
      <StudioSoundCheck
        getInputStream={() => null}
        prepareInputStream={prepareInputStream}
        microphoneLabel="Shure MV7i"
        outputId="mv7i-headphones"
        evidence={null}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Record private sample" }));

    expect(await screen.findByRole("button", { name: "Stop and listen" })).toBeInTheDocument();
    expect(prepareInputStream).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent(/recording 10 private seconds from Shure MV7i/i);
  });

  it("invalidates the tab-only sample when any selected studio endpoint changes", async () => {
    const stream = { getAudioTracks: () => [{ readyState: "live" }] } as unknown as MediaStream;
    const { rerender } = render(
      <StudioSoundCheck
        getInputStream={() => stream}
        microphoneLabel="Shure MV7i"
        outputId="mv7i-headphones"
        evidence={evidence}
        setupKey="mv7i:canon:mv7i-headphones"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Record private sample" }));
    fireEvent.click(screen.getByRole("button", { name: "Stop and listen" }));
    await screen.findByLabelText("Private call-path sound-check sample");

    rerender(
      <StudioSoundCheck
        getInputStream={() => stream}
        microphoneLabel="Shure MV7i"
        outputId="mac-speakers"
        evidence={evidence}
        setupKey="mv7i:canon:mac-speakers"
      />,
    );

    expect(screen.queryByLabelText("Private call-path sound-check sample")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/studio setup changed/i);
  });
});
