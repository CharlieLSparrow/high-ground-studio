import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";

const mockRouterRefresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRouterRefresh }),
}));

jest.mock("livekit-client", () => {
  const actual = jest.requireActual("livekit-client") as typeof import("livekit-client");
  let state = actual.ConnectionState.Disconnected;
  const localParticipant = {
    identity: "browser-test-person",
    name: "Browser tester",
    publishData: jest.fn().mockResolvedValue(undefined),
    setMicrophoneEnabled: jest.fn().mockResolvedValue(undefined),
    setCameraEnabled: jest.fn().mockResolvedValue(undefined),
  };
  type RoomMock = {
    readonly state: import("livekit-client").ConnectionState;
    activeSpeakers: never[];
    remoteParticipants: Map<unknown, unknown>;
    localParticipant: typeof localParticipant;
    on: jest.Mock;
    connect: jest.Mock;
    disconnect: jest.Mock;
    switchActiveDevice: jest.Mock;
    __reset: () => void;
  };
  let room: RoomMock;
  room = {
    get state() { return state; },
    activeSpeakers: [],
    remoteParticipants: new Map(),
    localParticipant,
    on: jest.fn(function on() { return room; }),
    connect: jest.fn(async () => { state = actual.ConnectionState.Connected; }),
    disconnect: jest.fn(() => { state = actual.ConnectionState.Disconnected; }),
    switchActiveDevice: jest.fn().mockResolvedValue(undefined),
    __reset: () => {
      state = actual.ConnectionState.Disconnected;
      room.on.mockClear();
      room.connect.mockClear();
      room.disconnect.mockClear();
      room.switchActiveDevice.mockClear();
      localParticipant.publishData.mockClear();
      localParticipant.setMicrophoneEnabled.mockClear();
      localParticipant.setCameraEnabled.mockClear();
    },
  };
  return {
    ...actual,
    Room: jest.fn(() => room),
    __mockRoom: room,
  };
});

import { LiveSessionRoom, liveMicrophoneStatusPresentation } from "./live-session-room";

type MockLiveKitRoom = {
  __reset: () => void;
  connect: jest.Mock;
  disconnect: jest.Mock;
  switchActiveDevice: jest.Mock;
  localParticipant: {
    setMicrophoneEnabled: jest.Mock;
    setCameraEnabled: jest.Mock;
  };
};

const mockLiveKitRoom = (jest.requireMock("livekit-client") as { __mockRoom: MockLiveKitRoom }).__mockRoom;

jest.mock("@/components/browser-source-recorder", () => ({
  BrowserSourceRecorder: ({
    captureGroupId,
    projectSlug,
    conversationConnected,
    stopRequestVersion,
    onSourceLockChange,
    onPreparationStateChange,
  }: {
    captureGroupId: string;
    projectSlug?: string | null;
    conversationConnected?: boolean;
    stopRequestVersion?: number;
    onSourceLockChange?: (locked: boolean) => void;
    onPreparationStateChange?: (state: { participantReady: boolean; everyoneReady: boolean }) => void;
  }) => {
    useEffect(() => {
      if (stopRequestVersion) onSourceLockChange?.(false);
    }, [onSourceLockChange, stopRequestVersion]);
    return <div>
      <span data-testid="browser-source-capture-group">{captureGroupId}</span>
      <span data-testid="browser-source-project">{projectSlug || "unbound"}</span>
      <span data-testid="browser-source-conversation">{conversationConnected ? "connected" : "lobby"}</span>
      <button type="button" onClick={() => onSourceLockChange?.(true)}>Simulate retained source start</button>
      <button type="button" onClick={() => onSourceLockChange?.(false)}>Simulate retained source stop</button>
      <button type="button" onClick={() => onPreparationStateChange?.({ participantReady: true, everyoneReady: false })}>Simulate recording choice ready</button>
    </div>
  },
}));

describe("LiveSessionRoom", () => {
  const originalMediaDevices = navigator.mediaDevices;
  const originalFetch = global.fetch;

  beforeEach(() => {
    window.localStorage.removeItem("quipsly-live-preferred-devices-v1");
    window.localStorage.removeItem("quipsly-live-preferred-devices-v2");
    jest.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    mockLiveKitRoom.__reset();
  });

  afterEach(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: originalMediaDevices,
    });
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it.each([
    [null, false, false, "Checking microphone"],
    ["ready", false, false, "Microphone sounds healthy"],
    ["low", false, false, "Microphone is low"],
    ["hot", false, false, "Microphone is loud"],
    ["clipping-risk", false, false, "Microphone may clip"],
    ["no-signal", false, false, "No microphone signal"],
    ["ready", true, false, "Microphone muted"],
    ["ready", false, true, "Microphone needs attention"],
  ] as const)("projects %s, muted %s, recovery %s as %s", (state, muted, recoveryHeld, label) => {
    const evidence = state === null ? null : {
      state,
      rmsDbfs: -24,
      samplePeakDbfs: -8,
      clippedSampleCount: 0,
      sampleCount: 2_048,
      peakHoldDbfs: -8,
      clippedSampleCountSinceStart: 0,
      sampleRateHz: 48_000,
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };
    expect(liveMicrophoneStatusPresentation({ evidence, muted, recoveryHeld }).label).toBe(label);
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
      render(<LiveSessionRoom callRoomId="room-1" captureGroupId="55555555-5555-4555-8555-555555555551" sessionTitle="Episode test" kind="episode" purpose="PODCAST" projectSlug="high-ground-odyssey" />);
    });

    expect(await screen.findByRole("option", { name: "Shure MV7i" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Canon EOS R8" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Episode test" })).toBeInTheDocument();
    expect(screen.getByText(/This browser will handle call audio.*Joining doesn’t start recording/i)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Call-path microphone evidence" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Private studio sound check" })).toBeInTheDocument();
    expect(screen.getByTestId("call-technical-device-details")).not.toHaveAttribute("open");
    expect(screen.getByRole("button", { name: "Record private sample" })).toBeEnabled();
    expect(screen.getByText("Call-path input evidence")).toBeInTheDocument();
    expect(screen.getByText(/not LUFS, true peak, or proof of the retained source/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Join call/i })).toBeEnabled();
    expect(screen.queryByRole("heading", { name: /Record the episode together from browser and iPhone/i })).not.toBeInTheDocument();
    expect(screen.getByText(/live call, each retained local source, shared Watch, and the production timeline/i)).toBeInTheDocument();
    expect(screen.getByText(/Turning this copy off cannot change take synchronization/i)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Session Guardian" })).toHaveTextContent(/Checking the retained-source recorder/i);
    expect(screen.getByText("Why Quipsly says this")).toBeInTheDocument();
    expect(screen.queryByTestId("browser-source-capture-group")).not.toBeInTheDocument();
  });

  it("asks for media only from Join and continues without a separate permission ritual", async () => {
    const getUserMedia = jest.fn().mockResolvedValue({
      getTracks: () => [{ stop: jest.fn() }],
    });
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
      render(<LiveSessionRoom callRoomId="room-2" captureGroupId="55555555-5555-4555-8555-555555555552" sessionTitle="Coaching test" kind="coaching" />);
    });
    expect(getUserMedia).not.toHaveBeenCalled();
    const join = screen.getByRole("button", { name: "Join call" });
    expect(join).toBeEnabled();
    expect(screen.getByTestId("call-device-settings")).not.toHaveAttribute("open");
    expect(screen.queryByTestId("call-status-message")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Record private sample" })).toBeEnabled();
    fireEvent.click(join);
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
    await screen.findByText(/Microphone access is off/i);
  });

  it("remembers safe join choices and falls back by device label when browser ids rotate", async () => {
    window.localStorage.setItem("quipsly-live-preferred-devices-v2", JSON.stringify({
      microphoneId: "old-mic-id",
      microphoneLabel: "Shure MV7i",
      cameraId: "old-camera-id",
      cameraLabel: "Canon EOS R8",
      cameraWanted: false,
      joinMuted: true,
    }));
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: jest.fn().mockResolvedValue([
          { kind: "audioinput", deviceId: "new-mic-id", label: "Shure MV7i" },
          { kind: "videoinput", deviceId: "new-camera-id", label: "Canon EOS R8" },
        ]),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
    });

    await act(async () => {
      render(<LiveSessionRoom callRoomId="room-remembered" captureGroupId="55555555-5555-4555-8555-555555555547" sessionTitle="Remembered setup" kind="episode" />);
    });

    expect(await screen.findByRole("button", { name: "Muted" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/join muted.*other device to prevent echo/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Camera off" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("combobox", { name: "Microphone" })).toHaveValue("new-mic-id");
    expect(screen.getByRole("combobox", { name: "Camera" })).toHaveValue("new-camera-id");
    expect(screen.getByRole("button", { name: "Join call" })).toBeEnabled();
  });

  it("debounces device changes, selects an honest fallback, and keeps the preferred studio microphone", async () => {
    let onDeviceChange: (() => void) | undefined;
    const enumerateDevices = jest.fn()
      .mockResolvedValueOnce([
        { kind: "audioinput", deviceId: "mv7i", label: "Shure MV7i" },
        { kind: "audioinput", deviceId: "mac-mic", label: "MacBook Microphone" },
      ])
      .mockResolvedValue([
        { kind: "audioinput", deviceId: "mac-mic", label: "MacBook Microphone" },
      ]);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices,
        addEventListener: jest.fn((event: string, listener: () => void) => {
          if (event === "devicechange") onDeviceChange = listener;
        }),
        removeEventListener: jest.fn(),
      },
    });

    await act(async () => {
      render(<LiveSessionRoom callRoomId="room-device-recovery" captureGroupId="55555555-5555-4555-8555-555555555548" sessionTitle="Device recovery" kind="coaching" />);
    });
    expect(await screen.findByRole("combobox", { name: "Microphone" })).toHaveValue("mv7i");
    expect(onDeviceChange).toBeDefined();

    await act(async () => {
      onDeviceChange?.();
      onDeviceChange?.();
      await new Promise((resolve) => setTimeout(resolve, 300));
    });

    expect(enumerateDevices).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("combobox", { name: "Microphone" })).toHaveValue("mac-mic");
    expect(screen.getByText(/Microphone disconnected.*MacBook Microphone/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Join call" })).toBeEnabled();
    expect(JSON.parse(window.localStorage.getItem("quipsly-live-preferred-devices-v2") || "{}"))
      .toMatchObject({ microphoneId: "mv7i", microphoneLabel: "Shure MV7i" });
  });

  it("switches the published call route when the connected microphone disappears", async () => {
    let onDeviceChange: (() => void) | undefined;
    const enumerateDevices = jest.fn()
      .mockResolvedValueOnce([
        { kind: "audioinput", deviceId: "mv7i", label: "Shure MV7i" },
        { kind: "audioinput", deviceId: "mac-mic", label: "MacBook Microphone" },
      ])
      .mockResolvedValue([
        { kind: "audioinput", deviceId: "mac-mic", label: "MacBook Microphone" },
      ]);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices,
        addEventListener: jest.fn((event: string, listener: () => void) => {
          if (event === "devicechange") onDeviceChange = listener;
        }),
        removeEventListener: jest.fn(),
      },
    });
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/mobile/capture/rooms/join")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            canJoin: true,
            serverUrl: "wss://live.test",
            participantToken: "room-scoped-test-token",
            recordingConsentGranted: true,
          }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      } as Response;
    }) as typeof fetch;

    await act(async () => {
      render(<LiveSessionRoom callRoomId="room-live-device-recovery" captureGroupId="55555555-5555-4555-8555-555555555546" sessionTitle="Live device recovery" kind="coaching" />);
    });
    await screen.findByRole("option", { name: "Shure MV7i" });
    fireEvent.click(screen.getByRole("button", { name: "Join call" }));
    expect(await screen.findByRole("button", { name: "Leave" })).toBeInTheDocument();
    expect(screen.getByText("1 in call")).toBeInTheDocument();
    mockLiveKitRoom.switchActiveDevice.mockClear();
    mockLiveKitRoom.localParticipant.setMicrophoneEnabled.mockClear();

    await act(async () => {
      onDeviceChange?.();
      await new Promise((resolve) => setTimeout(resolve, 300));
    });

    expect(mockLiveKitRoom.switchActiveDevice).toHaveBeenCalledWith("audioinput", "mac-mic");
    expect(mockLiveKitRoom.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(true, {
      deviceId: "mac-mic",
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });
    expect(screen.getByRole("combobox", { name: "Microphone" })).toHaveValue("mac-mic");
    expect(screen.getByText(/The call moved to MacBook Microphone/i)).toBeInTheDocument();
  });

  it("presents one familiar coaching green room with optional settings and separate recording consent", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: jest.fn().mockResolvedValue([
          { kind: "audioinput", deviceId: "coach-mic", label: "Coach microphone" },
        ]),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
    });

    let view: ReturnType<typeof render>;
    await act(async () => {
      view = render(
        <LiveSessionRoom
          callRoomId="room-coaching-order"
          captureGroupId="55555555-5555-4555-8555-555555555549"
          sessionTitle="Simple coaching Session"
          kind="coaching"
          purpose="COACHING"
        />,
      );
    });

    expect(
      screen.getByRole("heading", { name: "Simple coaching Session" }),
    ).toBeInTheDocument();
    const greenRoom = screen.getByRole("region", { name: "Ready to join" });
    expect(greenRoom).toHaveTextContent(/Check how you’ll enter the call/i);
    expect(greenRoom).toHaveTextContent(/Coach microphone/i);
    expect(greenRoom).toHaveTextContent(/Preview optional/i);
    expect(greenRoom).toHaveTextContent(/Joining doesn’t start recording/i);
    const join = screen.getByRole("button", { name: /Join call/i });
    const devices = screen.getByRole("group", { name: "Preflight studio devices" });
    const soundCheck = screen.getByRole("region", { name: "Private studio sound check" });
    const preview = view!.container.querySelector("video");
    expect(preview).not.toBeNull();
    expect(
      preview!.compareDocumentPosition(devices) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      devices.compareDocumentPosition(soundCheck)
        & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(join).toBeEnabled();
    expect(screen.queryByTestId("browser-source-conversation")).not.toBeInTheDocument();
    expect(preview?.parentElement).toHaveClass("h-28");
  });

  it("reveals recording only after the participant enters the call", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: jest.fn().mockResolvedValue([
          { kind: "audioinput", deviceId: "coach-mic", label: "Coach microphone" },
        ]),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
    });
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/mobile/capture/rooms/join")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            canJoin: true,
            serverUrl: "wss://live.test",
            participantToken: "room-scoped-test-token",
            recordingConsentGranted: false,
          }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      } as Response;
    }) as typeof fetch;

    await act(async () => {
      render(<LiveSessionRoom callRoomId="room-outer-room" captureGroupId="55555555-5555-4555-8555-555555555545" sessionTitle="Outer room" kind="coaching" />);
    });

    expect(screen.getByText("Ready to join", { selector: "span" })).toBeInTheDocument();
    expect(screen.queryByTestId("browser-source-capture-group")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Join call" }));

    expect(await screen.findByRole("button", { name: "Leave" })).toBeInTheDocument();
    expect(screen.getByTestId("live-microphone-status")).toHaveTextContent("Checking microphone");
    fireEvent.click(screen.getByRole("button", { name: "Mute" }));
    await waitFor(() => expect(screen.getByTestId("live-microphone-status")).toHaveTextContent("Microphone muted"));
    fireEvent.click(screen.getByRole("button", { name: "Unmute" }));
    await waitFor(() => expect(screen.getByTestId("live-microphone-status")).toHaveTextContent("Checking microphone"));
    expect(screen.getByTestId("browser-source-capture-group")).toHaveTextContent("55555555-5555-4555-8555-555555555545");
    expect(screen.getByTestId("browser-source-conversation")).toHaveTextContent("connected");
  });

  it("keeps browser call recovery ordinary while retaining the technical cause", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: jest.fn().mockResolvedValue([
          { kind: "audioinput", deviceId: "coach-mic", label: "Coach microphone" },
        ]),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
    });
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/mobile/capture/rooms/join")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            canJoin: true,
            serverUrl: "wss://live.test",
            participantToken: "room-scoped-test-token",
          }),
        } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
    }) as typeof fetch;
    mockLiveKitRoom.connect.mockRejectedValueOnce(
      new Error("LiveKit websocket token rejected"),
    );

    await act(async () => {
      render(<LiveSessionRoom callRoomId="room-join-failure" captureGroupId="55555555-5555-4555-8555-555555555543" sessionTitle="Retry call" kind="coaching" />);
    });
    fireEvent.click(screen.getByRole("button", { name: "Join call" }));

    await waitFor(() => expect(screen.getByTestId("call-status-message")).toHaveTextContent(
      "The call couldn't connect. Check your internet connection and try again.",
    ));
    expect(screen.queryByText("LiveKit websocket token rejected")).not.toBeVisible();
    fireEvent.click(screen.getByText("Technical device details"));
    expect(screen.getByTestId("call-technical-error")).toHaveTextContent(
      "LiveKit websocket token rejected",
    );
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
      render(<LiveSessionRoom callRoomId="room-3" captureGroupId="55555555-5555-4555-8555-555555555553" sessionTitle="Coaching test" kind="coaching" />);
    });
    expect(screen.queryByRole("button", { name: /Allow camera/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Camera off/i }));
    expect(getUserMedia).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Test selected setup/i }));
    await act(async () => undefined);

    expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({
      audio: expect.objectContaining({ deviceId: { exact: "mv7i" } }),
      video: expect.objectContaining({ deviceId: { exact: "canon-r8" } }),
    }));
  });

  it("does not claim a camera join is ready when the browser exposes no usable camera id", async () => {
    const getUserMedia = jest.fn().mockRejectedValue(new Error("Permission denied"));
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: jest.fn().mockResolvedValue([
          { kind: "audioinput", deviceId: "mv7i", label: "Shure MV7i" },
          { kind: "videoinput", deviceId: "", label: "" },
        ]),
        getUserMedia,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
    });

    await act(async () => {
      render(<LiveSessionRoom callRoomId="room-4" captureGroupId="55555555-5555-4555-8555-555555555554" sessionTitle="Podcast test" kind="episode" />);
    });

    expect(screen.getByRole("combobox", { name: "Camera" })).toHaveValue("");
    expect(screen.getByRole("button", { name: /Test selected setup/i })).toBeDisabled();
    const join = screen.getByRole("button", { name: /Join call/i });
    expect(join).toBeEnabled();
    fireEvent.click(join);
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: true });
    await screen.findByText(/Camera access is off/i);
  });

  it("turns the Canon virtual-camera ownership failure into explicit preflight guidance", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: jest.fn().mockResolvedValue([
          { kind: "audioinput", deviceId: "mv7i", label: "Shure MV7i" },
          { kind: "videoinput", deviceId: "canon-virtual", label: "EOS Webcam Utility" },
        ]),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
    });

    await act(async () => {
      render(<LiveSessionRoom callRoomId="room-canon" captureGroupId="55555555-5555-4555-8555-555555555550" sessionTitle="Canon preflight" kind="episode" />);
    });

    expect(await screen.findByRole("region", { name: "Call-path camera evidence" })).toBeInTheDocument();
    expect(screen.getByText("Canon handoff check")).toBeInTheDocument();
    expect(screen.getByText(/background launcher can own the camera/i)).toBeInTheDocument();
    expect(screen.getByText(/Record the R8's 4K master on-camera/i)).toBeInTheDocument();
  });

  it("locks call device identity while a retained local source is active", async () => {
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
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/mobile/capture/rooms/join")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, canJoin: true, serverUrl: "wss://live.test", participantToken: "room-scoped-test-token" }),
        } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
    }) as typeof fetch;

    await act(async () => {
      render(<LiveSessionRoom callRoomId="room-5" captureGroupId="55555555-5555-4555-8555-555555555555" sessionTitle="Locked source" kind="episode" />);
    });

    fireEvent.click(screen.getByRole("button", { name: "Join call" }));
    expect(await screen.findByRole("button", { name: "Leave" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Simulate retained source start" }));
    expect(screen.getByRole("combobox", { name: "Microphone" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Camera" })).toBeDisabled();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Simulate retained source stop" }));
    });
    await waitFor(() => expect(enumerateDevices).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("combobox", { name: "Microphone" })).toBeEnabled();
    expect(screen.getByRole("combobox", { name: "Camera" })).toBeEnabled();
  });

  it("stops and protects a retained source before leaving the call", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: jest.fn().mockResolvedValue([
          { kind: "audioinput", deviceId: "coach-mic", label: "Coach microphone" },
        ]),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
    });
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/mobile/capture/rooms/join")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            canJoin: true,
            serverUrl: "wss://live.test",
            participantToken: "room-scoped-test-token",
          }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      } as Response;
    }) as typeof fetch;

    await act(async () => {
      render(<LiveSessionRoom callRoomId="room-safe-leave" captureGroupId="55555555-5555-4555-8555-555555555544" sessionTitle="Safe leave" kind="coaching" />);
    });
    fireEvent.click(screen.getByRole("button", { name: "Join call" }));
    expect(await screen.findByRole("button", { name: "Leave" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Simulate retained source start" }));

    fireEvent.click(screen.getByRole("button", { name: "Stop recording & leave" }));

    expect(await screen.findByText("Call ended")).toBeInTheDocument();
    expect(screen.getByTestId("call-status-message")).toHaveTextContent(
      /local recording stopped safely.*upload recovery continues automatically/i,
    );
    expect(mockLiveKitRoom.disconnect).toHaveBeenCalledWith(true);
  });

  it("keeps device testing and conversation available while missing capture identity holds retained recording", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: jest.fn().mockResolvedValue([
          { kind: "audioinput", deviceId: "mv7i", label: "Shure MV7i" },
          { kind: "videoinput", deviceId: "canon-r8", label: "Canon EOS R8" },
        ]),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
    });
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/mobile/capture/rooms/join")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, canJoin: true, serverUrl: "wss://live.test", participantToken: "room-scoped-test-token" }),
        } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
    }) as typeof fetch;

    await act(async () => {
      render(<LiveSessionRoom callRoomId="room-unbound" captureGroupId={null} sessionTitle="Unbound take" kind="episode" />);
    });

    expect(screen.getByRole("button", { name: /Test selected setup/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Join call/i })).toBeEnabled();
    expect(screen.queryByTestId("browser-source-capture-group")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Join call" }));
    expect(await screen.findByRole("region", { name: "Retained source unavailable" })).toHaveTextContent(/recording held/i);
  });

  it("reuses the same provider START request after an ambiguous transport failure", async () => {
    const postBodies: Array<{ requestId: string }> = [];
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method || init.method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            providerRecording: {
              state: "off",
              optionalWitness: true,
              affectsCaptureGroupSync: false,
              syncAuthority: "capture group and local masters",
              canOperate: true,
              configured: true,
              enabled: true,
              paymentHeld: false,
              nextAction: "Provider safety copy is off.",
              activeRecordingAssetId: null,
              latestCommand: null,
            },
          }),
        } as Response;
      }
      postBodies.push(JSON.parse(String(init.body)) as { requestId: string });
      throw new Error(`response lost for ${String(input)}`);
    }) as typeof fetch;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: jest.fn().mockResolvedValue([
          { kind: "audioinput", deviceId: "mv7i", label: "Shure MV7i" },
        ]),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
    });

    await act(async () => {
      render(<LiveSessionRoom callRoomId="room-provider-retry" captureGroupId="55555555-5555-4555-8555-555555555556" sessionTitle="Provider retry" kind="coaching" />);
    });
    await screen.findByRole("option", { name: "Shure MV7i" });
    fireEvent.click(screen.getByText("More call and recording options"));
    fireEvent.click(await screen.findByRole("button", { name: "Cloud recording backup" }));
    fireEvent.click(screen.getByRole("button", { name: "Start backup recording" }));
    await waitFor(() => expect(postBodies).toHaveLength(1));
    await screen.findByText(/Retry uses the same request ID/i);

    fireEvent.click(screen.getByRole("button", { name: "Cloud recording backup" }));
    fireEvent.click(screen.getByRole("button", { name: "Start backup recording" }));
    await waitFor(() => expect(postBodies).toHaveLength(2));
    expect(postBodies[1].requestId).toBe(postBodies[0].requestId);
  });
});
