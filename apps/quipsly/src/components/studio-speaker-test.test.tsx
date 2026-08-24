import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import { StudioSpeakerTest } from "./studio-speaker-test";

describe("StudioSpeakerTest", () => {
  const originalAudioContext = window.AudioContext;
  const originalSetSinkId = (
    HTMLMediaElement.prototype as HTMLMediaElement & {
      setSinkId?: (sinkId: string) => Promise<void>;
    }
  ).setSinkId;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    jest.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation();
  });

  afterEach(() => {
    jest.useRealTimers();
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: originalAudioContext,
    });
    Object.defineProperty(HTMLMediaElement.prototype, "setSinkId", {
      configurable: true,
      value: originalSetSinkId,
    });
    jest.restoreAllMocks();
  });

  it("plays a short local tone through the selected output without requesting media", async () => {
    const setSinkId = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(HTMLMediaElement.prototype, "setSinkId", {
      configurable: true,
      value: setSinkId,
    });

    const oscillator = {
      type: "sine",
      frequency: {
        setValueAtTime: jest.fn(),
      },
      connect: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
    };
    const gain = {
      gain: {
        setValueAtTime: jest.fn(),
        exponentialRampToValueAtTime: jest.fn(),
      },
      connect: jest.fn(),
    };
    const context = {
      currentTime: 12,
      createMediaStreamDestination: jest.fn(() => ({ stream: {} })),
      createGain: jest.fn(() => gain),
      createOscillator: jest.fn(() => oscillator),
      resume: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    };
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: jest.fn(() => context),
    });
    const getUserMedia = jest.fn();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });

    render(
      <StudioSpeakerTest
        outputId="mv7i-output"
        outputLabel="Shure MV7i Headphones"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Test speakers" }));

    await waitFor(() => {
      expect(setSinkId).toHaveBeenCalledWith("mv7i-output");
    });
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(context.createMediaStreamDestination).toHaveBeenCalledTimes(1);
    expect(oscillator.start).toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /Playing test sound/i }),
    ).toBeDisabled();

    await act(async () => {
      jest.advanceTimersByTime(700);
    });
    expect(
      screen.getByText("Test sound played through Shure MV7i Headphones."),
    ).toBeInTheDocument();
  });

  it("fails closed when the browser has no audio context", async () => {
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: undefined,
    });

    render(<StudioSpeakerTest outputId="" outputLabel="the system output" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Test speakers" }));
    });

    expect(await screen.findByText(/cannot create a speaker test/i)).toBeInTheDocument();
  });
});
