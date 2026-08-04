import { act, fireEvent, render, screen } from "@testing-library/react";

import { LiveSessionRoom } from "./live-session-room";

describe("LiveSessionRoom", () => {
  const originalMediaDevices = navigator.mediaDevices;

  afterEach(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: originalMediaDevices,
    });
    jest.restoreAllMocks();
  });

  it("makes external device choice and the no-hidden-recording boundary explicit", async () => {
    const enumerateDevices = jest.fn().mockResolvedValue([
      { kind: "audioinput", deviceId: "mv7i", label: "Shure MV7i" },
      { kind: "videoinput", deviceId: "canon-r8", label: "Canon EOS R8" },
      { kind: "audiooutput", deviceId: "mv7i-headphones", label: "Shure MV7i Headphones" },
    ]);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
    });

    await act(async () => {
      render(<LiveSessionRoom callRoomId="room-1" sessionTitle="Episode test" kind="episode" purpose="PODCAST" />);
    });

    expect(await screen.findByRole("option", { name: "Shure MV7i" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Canon EOS R8" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Conversation is not recording" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Join live room/i })).toBeEnabled();
    expect(screen.getByRole("heading", { name: /Record the episode together from browser and iPhone/i })).toBeInTheDocument();
    expect(screen.getByText(/live call, each retained local source, shared Watch, and the production timeline/i)).toBeInTheDocument();
  });

  it("does not request media permission until the person acts", async () => {
    const getUserMedia = jest.fn();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: jest.fn().mockResolvedValue([]),
        getUserMedia,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
    });

    await act(async () => {
      render(<LiveSessionRoom callRoomId="room-2" sessionTitle="Coaching test" kind="coaching" />);
    });
    expect(getUserMedia).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Allow microphone/i }));
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
  });

  it("keeps camera permission independent from an audio-only coaching join", async () => {
    const permissionStream = { getTracks: () => [{ stop: jest.fn() }] };
    const getUserMedia = jest.fn().mockResolvedValue(permissionStream);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: jest.fn().mockResolvedValue([
          { kind: "audioinput", deviceId: "mv7i", label: "Shure MV7i" },
          { kind: "videoinput", deviceId: "canon-r8", label: "Canon EOS R8" },
        ]),
        getUserMedia,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
    });

    await act(async () => {
      render(<LiveSessionRoom callRoomId="room-3" sessionTitle="Coaching test" kind="coaching" />);
    });
    expect(screen.queryByRole("button", { name: /Allow camera/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: /Join with camera/i }));
    fireEvent.click(screen.getByRole("button", { name: /Allow camera/i }));
    await act(async () => undefined);

    expect(getUserMedia).toHaveBeenCalledWith({ audio: false, video: true });
  });

  it("does not claim a camera join is ready when the browser exposes no usable camera id", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: jest.fn().mockResolvedValue([
          { kind: "audioinput", deviceId: "mv7i", label: "Shure MV7i" },
          { kind: "videoinput", deviceId: "", label: "" },
        ]),
        getUserMedia: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
    });

    await act(async () => {
      render(<LiveSessionRoom callRoomId="room-4" sessionTitle="Podcast test" kind="episode" />);
    });

    expect(screen.getByRole("combobox", { name: "Camera" })).toHaveValue("");
    expect(screen.getByRole("button", { name: /Test selected setup/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Join live room/i })).toBeDisabled();
  });
});
