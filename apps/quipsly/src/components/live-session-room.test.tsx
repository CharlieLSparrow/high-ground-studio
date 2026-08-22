import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

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

import { LiveSessionRoom } from "./live-session-room";

type MockLiveKitRoom = {
  __reset: () => void;
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
    onSourceLockChange,
    onPreparationStateChange,
  }: {
    captureGroupId: string;
    projectSlug?: string | null;
    conversationConnected?: boolean;
    onSourceLockChange?: (locked: boolean) => void;
    onPreparationStateChange?: (state: { participantReady: boolean; everyoneReady: boolean }) => void;
  }) => (
    <div>
      <span data-testid="browser-source-capture-group">{captureGroupId}</span>
      <span data-testid="browser-source-project">{projectSlug || "unbound"}</span>
      <span data-testid="browser-source-conversation">{conversationConnected ? "connected" : "lobby"}</span>
      <button type="button" onClick={() => onSourceLockChange?.(true)}>Simulate retained source start</button>
      <button type="button" onClick={() => onSourceLockChange?.(false)}>Simulate retained source stop</button>
      <button type="button" onClick={() => onPreparationStateChange?.({ participantReady: true, everyoneReady: false })}>Simulate recording choice ready</button>
    </div>
  ),
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
    expect(screen.getByRole("heading", { name: "Joining does not record" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Call-path microphone evidence" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Private studio sound check" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Record private sample" })).toBeDisabled();
    expect(screen.getByText("Call-path input evidence")).toBeInTheDocument();
    expect(screen.getByText(/not LUFS, true peak, or proof of the retained source/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Join call/i })).toBeEnabled();
    expect(screen.getByRole("heading", { name: /Record the episode together from browser and iPhone/i })).toBeInTheDocument();
    expect(screen.getByText(/live call, each retained local source, shared Watch, and the production timeline/i)).toBeInTheDocument();
    expect(screen.getByText(/Turning this copy off cannot change take synchronization/i)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Session Guardian" })).toHaveTextContent(/Checking the retained-source recorder/i);
    expect(screen.getByText("Why Quipsly says this")).toBeInTheDocument();
    expect(screen.getByTestId("browser-source-capture-group")).toHaveTextContent(
      "55555555-5555-4555-8555-555555555551",
    );
    expect(screen.getByTestId("browser-source-project")).toHaveTextContent("high-ground-odyssey");
  });

  it("does not request media permission until the person acts", async () => {
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
    const allowMicrophone = screen.getByRole("button", { name: /Allow microphone/i });
    expect(allowMicrophone.closest("details")).toHaveAttribute("open");
    fireEvent.click(allowMicrophone);
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
    await screen.findByText(/No microphone was found/i);
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
      screen.getByRole("heading", { name: "Start this coaching call" }),
    ).toBeInTheDocument();
    const greenRoom = screen.getByRole("region", { name: "Ready to join" });
    expect(greenRoom).toHaveTextContent(/Check how you’ll enter the call/i);
    expect(greenRoom).toHaveTextContent(/Coach microphone/i);
    expect(greenRoom).toHaveTextContent(/Preview optional/i);
    fireEvent.click(screen.getByRole("button", { name: "Simulate recording choice ready" }));
    expect(screen.getByRole("heading", { name: "Joining does not record" })).toBeInTheDocument();
    const join = screen.getByRole("button", { name: /Join call/i });
    const recorder = screen.getByTestId("browser-source-capture-group");
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
    expect(
      devices.compareDocumentPosition(recorder)
        & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(join).toBeEnabled();
    expect(screen.getByTestId("browser-source-conversation")).toHaveTextContent("lobby");
    expect(preview?.parentElement).toHaveClass("h-28");
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
      render(<LiveSessionRoom callRoomId="room-4" captureGroupId="55555555-5555-4555-8555-555555555554" sessionTitle="Podcast test" kind="episode" />);
    });

    expect(screen.getByRole("combobox", { name: "Camera" })).toHaveValue("");
    expect(screen.getByRole("button", { name: /Test selected setup/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Join call/i })).toBeDisabled();
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

    await act(async () => {
      render(<LiveSessionRoom callRoomId="room-5" captureGroupId="55555555-5555-4555-8555-555555555555" sessionTitle="Locked source" kind="episode" />);
    });

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

    await act(async () => {
      render(<LiveSessionRoom callRoomId="room-unbound" captureGroupId={null} sessionTitle="Unbound take" kind="episode" />);
    });

    expect(await screen.findByRole("region", { name: "Retained source unavailable" })).toHaveTextContent(/recording held/i);
    expect(screen.getByRole("button", { name: /Test selected setup/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Join call/i })).toBeEnabled();
    expect(screen.queryByTestId("browser-source-capture-group")).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByText("Advanced room and recording details"));
    fireEvent.click(await screen.findByRole("button", { name: "Review provider safety copy" }));
    fireEvent.click(screen.getByRole("button", { name: "Start provider copy" }));
    await waitFor(() => expect(postBodies).toHaveLength(1));
    await screen.findByText(/Retry uses the same request ID/i);

    fireEvent.click(screen.getByRole("button", { name: "Review provider safety copy" }));
    fireEvent.click(screen.getByRole("button", { name: "Start provider copy" }));
    await waitFor(() => expect(postBodies).toHaveLength(2));
    expect(postBodies[1].requestId).toBe(postBodies[0].requestId);
  });
});
