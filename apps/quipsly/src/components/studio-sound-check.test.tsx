/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";

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

  it("offers private playback without requiring a review, receipt, or approval", async () => {
    const stream = { getAudioTracks: () => [{ readyState: "live" }] } as unknown as MediaStream;
    render(<StudioSoundCheck getInputStream={() => stream} microphoneLabel="Shure MV7i"
      outputId="mv7i-headphones" evidence={evidence} setupKey="mv7i:canon:mv7i-headphones" />);
    fireEvent.click(screen.getByRole("button", { name: "Test microphone" }));
    expect(screen.getByText("Use your normal voice")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stop test" }));
    const audio = await screen.findByLabelText("Microphone test playback");
    expect(screen.queryByRole("button", { name: /Sounds clear|Needs adjustment|Approve/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test microphone" })).toBeEnabled();
    fireEvent.ended(audio);
    expect(screen.getByRole("status")).toHaveTextContent("You can join whenever");
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

    fireEvent.click(screen.getByRole("button", { name: "Test microphone" }));

    expect(await screen.findByRole("button", { name: "Stop test" })).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "Test microphone" }));
    fireEvent.click(screen.getByRole("button", { name: "Stop test" }));
    await screen.findByLabelText("Microphone test playback");

    rerender(
      <StudioSoundCheck
        getInputStream={() => stream}
        microphoneLabel="Shure MV7i"
        outputId="mac-speakers"
        evidence={evidence}
        setupKey="mv7i:canon:mac-speakers"
      />,
    );

    expect(screen.queryByLabelText("Microphone test playback")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/devices changed/i);
  });

  it("does not start a late microphone test after its setup changes", async () => {
    let resolve!: (stream: MediaStream) => void;
    const prepare = jest.fn(() => new Promise<MediaStream>(done => { resolve = done; }));
    const props = { getInputStream: () => null, prepareInputStream: prepare, microphoneLabel: "Mic", outputId: "", evidence: null };
    const { rerender } = render(<StudioSoundCheck {...props} setupKey="first" />);
    fireEvent.click(screen.getByRole("button", { name: "Test microphone" }));
    fireEvent.click(screen.getByRole("button", { name: "Test microphone" }));
    expect(prepare).toHaveBeenCalledTimes(1);
    rerender(<StudioSoundCheck {...props} setupKey="second" />);
    await act(async () => { resolve({ getAudioTracks: () => [{ readyState: "live" }] } as unknown as MediaStream); });
    expect(screen.queryByRole("button", { name: "Stop test" })).not.toBeInTheDocument();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("drops an outstanding microphone test when leaving the lobby", async () => {
    let resolve!: (stream: MediaStream) => void;
    const prepare = () => new Promise<MediaStream>(done => { resolve = done; });
    const start = jest.spyOn(TestMediaRecorder.prototype, "start");
    const { unmount } = render(<StudioSoundCheck getInputStream={() => null} prepareInputStream={prepare}
      microphoneLabel="Mic" outputId="" evidence={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Test microphone" }));
    unmount();
    await act(async () => { resolve({ getAudioTracks: () => [{ readyState: "live" }] } as unknown as MediaStream); });
    expect(start).not.toHaveBeenCalled();
    start.mockRestore();
  });
});
