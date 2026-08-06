import { fireEvent, render, screen } from "@testing-library/react";

import { StudioSoundCheck } from "./studio-sound-check";

class TestMediaRecorder {
  static isTypeSupported(type: string) {
    return type === "audio/webm;codecs=opus";
  }

  state: "inactive" | "recording" = "inactive";
  mimeType: string;
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
    this.mimeType = options?.mimeType || "audio/webm";
  }

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["private sample"], { type: this.mimeType }) } as BlobEvent);
    this.onstop?.();
  }
}

describe("StudioSoundCheck", () => {
  const OriginalMediaRecorder = global.MediaRecorder;
  const OriginalMediaStream = global.MediaStream;
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;

  beforeEach(() => {
    Object.defineProperty(global, "MediaRecorder", { configurable: true, value: TestMediaRecorder });
    Object.defineProperty(global, "MediaStream", {
      configurable: true,
      value: class {
        constructor(public tracks: MediaStreamTrack[]) {}
      },
    });
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: jest.fn(() => "blob:private-sound-check") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: jest.fn() });
  });

  afterEach(() => {
    Object.defineProperty(global, "MediaRecorder", { configurable: true, value: OriginalMediaRecorder });
    Object.defineProperty(global, "MediaStream", { configurable: true, value: OriginalMediaStream });
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: originalCreateObjectUrl });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: originalRevokeObjectUrl });
    jest.restoreAllMocks();
  });

  it("keeps the local sample unavailable until the selected setup is live", () => {
    render(<StudioSoundCheck getInputStream={() => null} microphoneLabel="Shure MV7i" outputId="" evidence={null} disabled />);

    expect(screen.getByRole("region", { name: "Private studio sound check" })).toHaveTextContent(/never uploaded, attached, or treated as a retained recording/i);
    expect(screen.getByRole("button", { name: "Record private sample" })).toBeDisabled();
    expect(screen.queryByLabelText("Private call-path sound-check sample")).not.toBeInTheDocument();
  });

  it("records, stops, and exposes only a tab-local playback sample", () => {
    const track = { readyState: "live" } as MediaStreamTrack;
    const stream = { getAudioTracks: () => [track] } as unknown as MediaStream;
    render(<StudioSoundCheck getInputStream={() => stream} microphoneLabel="Shure MV7i" outputId="" evidence={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Record private sample" }));
    expect(screen.getByRole("button", { name: "Stop and listen" })).toBeEnabled();
    expect(screen.getByText(/Recording 10 private seconds from Shure MV7i/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Stop and listen" }));
    expect(screen.getByLabelText("Private call-path sound-check sample")).toHaveAttribute("src", "blob:private-sound-check");
    expect(screen.getByText(/bytes remain only in this browser tab/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear sample" })).toBeEnabled();
  });
});
