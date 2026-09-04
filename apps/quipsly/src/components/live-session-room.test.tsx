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
    __emit: (event: import("livekit-client").RoomEvent, ...args: unknown[]) => void;
    __reset: () => void;
  };
  const handlers = new Map<import("livekit-client").RoomEvent, (...args: unknown[]) => void>();
  let room: RoomMock;
  room = {
    get state() { return state; },
    activeSpeakers: [],
    remoteParticipants: new Map(),
    localParticipant,
    on: jest.fn(function on(event: import("livekit-client").RoomEvent, handler: (...args: unknown[]) => void) {
      handlers.set(event, handler);
      return room;
    }),
    connect: jest.fn(async () => { state = actual.ConnectionState.Connected; }),
    disconnect: jest.fn(() => { state = actual.ConnectionState.Disconnected; }),
    switchActiveDevice: jest.fn().mockResolvedValue(undefined),
    __emit: (event, ...args) => {
      if (event === actual.RoomEvent.Reconnecting) state = actual.ConnectionState.Reconnecting;
      if (event === actual.RoomEvent.Reconnected) state = actual.ConnectionState.Connected;
      if (event === actual.RoomEvent.Disconnected) state = actual.ConnectionState.Disconnected;
      handlers.get(event)?.(...args);
    },
    __reset: () => {
      state = actual.ConnectionState.Disconnected;
      room.on.mockClear();
      room.connect.mockClear();
      room.disconnect.mockClear();
      room.switchActiveDevice.mockClear();
      localParticipant.publishData.mockClear();
      localParticipant.setMicrophoneEnabled.mockClear();
      localParticipant.setCameraEnabled.mockClear();
      handlers.clear();
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
  __emit: (event: import("livekit-client").RoomEvent, ...args: unknown[]) => void;
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
    conversationEnded,
    callTransportInterrupted,
    stopRequestVersion,
    onSourceLockChange,
    onPreparationStateChange,
  }: {
    captureGroupId: string;
    projectSlug?: string | null;
    conversationConnected?: boolean;
    conversationEnded?: boolean;
    callTransportInterrupted?: boolean;
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
      <span data-testid="browser-source-ended">{conversationEnded ? "ended" : "active"}</span>
      <span data-testid="browser-source-call-transport">{callTransportInterrupted ? "interrupted" : "available"}</span>
      <button type="button" onClick={() => onSourceLockChange?.(true)}>Simulate retained source start</button>
      <button type="button" onClick={() => onSourceLockChange?.(false)}>Simulate retained source stop</button>
      <button type="button" onClick={() => onPreparationStateChange?.({ participantReady: true, everyoneReady: false })}>Simulate recording choice ready</button>
      <button type="button" onClick={() => onPreparationStateChange?.({ participantReady: true, everyoneReady: true })}>Simulate everyone ready</button>
    </div>
  },
}));

describe("LiveSessionRoom", () => {
  const originalMediaDevices = navigator.mediaDevices;
  const originalPermissions = navigator.permissions;
  const originalFetch = global.fetch;

  beforeEach(() => {
    window.localStorage.removeItem("quipsly-live-preferred-devices-v1");
    window.localStorage.removeItem("quipsly-live-preferred-devices-v2");
    window.localStorage.removeItem("quipsly-live-preferred-devices-v3");
    jest.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    mockLiveKitRoom.__reset();
  });

  afterEach(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: originalMediaDevices,
    });
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: originalPermissions,
    });
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it.each([
    [null, false, false, "Checking microphone"],
    ["ready", false, false, "Microphone level looks good"],
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
    expect(screen.getByText(/This device will handle the conversation audio.*Joining doesn’t start recording/i)).toBeInTheDocument();
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

  it("asks for media only from Join and enters muted when permission stays unavailable", async () => {
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
    global.fetch = jest.fn(async (input: RequestInfo | URL) => ({
      ok: true,
      status: 200,
      json: async () => String(input).includes("/api/mobile/capture/rooms/join")
        ? {
            ok: true,
            canJoin: true,
            serverUrl: "wss://live.test",
            participantToken: "room-scoped-test-token",
            recordingConsentGranted: false,
          }
        : { ok: true },
    })) as unknown as typeof fetch;

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
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: false }));
    expect(await screen.findByRole("button", { name: "Leave" })).toBeInTheDocument();
    expect(screen.getByText(/You joined muted/i)).toBeInTheDocument();
    expect(mockLiveKitRoom.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(false);
    expect(screen.getByRole("button", { name: "Unmute" })).toBeDisabled();
  });

  it("uses Join as the bounded permission boundary even when device ids are already visible", async () => {
    const stop = jest.fn();
    const getUserMedia = jest.fn().mockResolvedValue({
      getTracks: () => [{ stop }],
    });
    const query = jest.fn().mockResolvedValue({ state: "prompt" });
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: { query },
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: jest.fn().mockResolvedValue([
          { kind: "audioinput", deviceId: "visible-before-grant", label: "Coach microphone" },
        ]),
        getUserMedia,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
    });
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        canJoin: true,
        serverUrl: "wss://live.test",
        participantToken: "room-scoped-test-token",
        recordingConsentGranted: false,
      }),
    })) as unknown as typeof fetch;

    await act(async () => {
      render(<LiveSessionRoom callRoomId="room-visible-before-grant" captureGroupId="55555555-5555-4555-8555-555555555553" sessionTitle="Join permission" kind="coaching" />);
    });
    expect(getUserMedia).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Join call" }));

    await waitFor(() => expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: false }));
    expect(stop).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("button", { name: "Leave" })).toBeInTheDocument();
    expect(mockLiveKitRoom.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(true, expect.objectContaining({
      deviceId: "visible-before-grant",
    }));
  });

  it("waits for a newly granted microphone to appear without asking for manual refresh", async () => {
    const stop = jest.fn();
    const getUserMedia = jest.fn().mockResolvedValue({
      getTracks: () => [{ stop }],
    });
    const enumerateDevices = jest.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValue([
        { kind: "audioinput", deviceId: "settled-mic", label: "Coach microphone" },
      ]);
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: { query: jest.fn().mockResolvedValue({ state: "prompt" }) },
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices,
        getUserMedia,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
    });
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        canJoin: true,
        serverUrl: "wss://live.test",
        participantToken: "room-scoped-test-token",
        recordingConsentGranted: false,
      }),
    })) as unknown as typeof fetch;

    await act(async () => {
      render(<LiveSessionRoom callRoomId="room-delayed-device" captureGroupId="55555555-5555-4555-8555-555555555549" sessionTitle="Delayed microphone" kind="coaching" />);
    });
    await waitFor(() => expect(enumerateDevices).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Join call" }));

    expect(await screen.findByRole("button", { name: "Leave" })).toBeInTheDocument();
    expect(enumerateDevices).toHaveBeenCalledTimes(3);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(mockLiveKitRoom.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ deviceId: "settled-mic" }),
    );
  });

  it("joins deliberately muted without opening a first-time microphone prompt", async () => {
    const getUserMedia = jest.fn();
    const query = jest.fn().mockResolvedValue({ state: "prompt" });
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: { query },
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
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        canJoin: true,
        serverUrl: "wss://live.test",
        participantToken: "room-scoped-test-token",
        recordingConsentGranted: false,
      }),
    })) as unknown as typeof fetch;

    await act(async () => {
      render(<LiveSessionRoom callRoomId="room-muted-first-join" captureGroupId="55555555-5555-4555-8555-555555555554" sessionTitle="Muted join" kind="coaching" />);
    });
    fireEvent.click(screen.getByRole("button", { name: "Mic on" }));
    fireEvent.click(screen.getByRole("button", { name: "Join call" }));

    expect(await screen.findByRole("button", { name: "Unmute" })).toBeEnabled();
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalledWith({ name: "microphone" });
    expect(mockLiveKitRoom.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(false);
  });

  it("reopens a remembered setup automatically only when browser permission is already granted", async () => {
    window.localStorage.setItem("quipsly-live-preferred-devices-v3", JSON.stringify({
      callAudioMode: "other-device",
      cameraWanted: true,
      cameraId: "remembered-camera",
      cameraLabel: "Remembered camera",
    }));
    const videoTrack = {
      label: "Remembered camera",
      readyState: "live",
      stop: jest.fn(),
      getSettings: () => ({ width: 1920, height: 1080, frameRate: 30 }),
    };
    const getUserMedia = jest.fn().mockResolvedValue({
      getTracks: () => [videoTrack],
      getVideoTracks: () => [videoTrack],
      getAudioTracks: () => [],
    });
    const query = jest.fn().mockResolvedValue({ state: "granted" });
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: { query },
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: jest.fn().mockResolvedValue([
          { kind: "videoinput", deviceId: "remembered-camera", label: "Remembered camera" },
        ]),
        getUserMedia,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
    });

    await act(async () => {
      render(<LiveSessionRoom callRoomId="room-returning-preview" captureGroupId="55555555-5555-4555-8555-555555555540" sessionTitle="Returning setup" kind="coaching" />);
    });

    await waitFor(() => expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: expect.objectContaining({ deviceId: { exact: "remembered-camera" } }),
    }));
    expect(query).toHaveBeenCalledWith({ name: "camera" });
    expect(screen.getByText("Preview ready")).toBeInTheDocument();
  });

  it("does not open devices automatically when a first-time browser still needs permission", async () => {
    const getUserMedia = jest.fn();
    const query = jest.fn().mockResolvedValue({ state: "prompt" });
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: { query },
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: jest.fn().mockResolvedValue([
          { kind: "audioinput", deviceId: "first-mic", label: "First microphone" },
        ]),
        getUserMedia,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
    });

    await act(async () => {
      render(<LiveSessionRoom callRoomId="room-first-permission" captureGroupId="55555555-5555-4555-8555-555555555539" sessionTitle="First setup" kind="coaching" />);
    });

    await waitFor(() => expect(query).toHaveBeenCalledWith({ name: "microphone" }));
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Join call" })).toBeEnabled();
  });

  it("shows ordinary microphone activity in the lobby after a person opens the preview", async () => {
    const audioTrack = {
      label: "Coach microphone",
      readyState: "live",
      stop: jest.fn(),
      getSettings: () => ({ channelCount: 1 }),
    };
    const getUserMedia = jest.fn().mockResolvedValue({
      getTracks: () => [audioTrack],
      getAudioTracks: () => [audioTrack],
      getVideoTracks: () => [],
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: jest.fn().mockResolvedValue([
          { kind: "audioinput", deviceId: "coach-mic", label: "Coach microphone" },
        ]),
        getUserMedia,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
    });

    await act(async () => {
      render(<LiveSessionRoom callRoomId="room-lobby-meter" captureGroupId="55555555-5555-4555-8555-555555555538" sessionTitle="Lobby meter" kind="coaching" />);
    });

    fireEvent.click(screen.getByRole("button", { name: "Test selected setup" }));
    expect(await screen.findByTestId("prejoin-microphone-activity")).toHaveTextContent(
      /Checking microphone/i,
    );
    expect(screen.getByRole("meter", { name: "Microphone activity" })).toBeInTheDocument();
    expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({
      audio: expect.objectContaining({ deviceId: { exact: "coach-mic" } }),
      video: false,
    }));
  });

  it("joins as a remembered second device without asking for call-audio permission", async () => {
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
    let joinBody: Record<string, unknown> | null = null;
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/api/mobile/capture/rooms/join")) {
        joinBody = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
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
      return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
    }) as typeof fetch;

    await act(async () => {
      render(<LiveSessionRoom callRoomId="room-second-device" captureGroupId="55555555-5555-4555-8555-555555555541" sessionTitle="Second device" kind="coaching" />);
    });
    const settings = screen.getByTestId("call-device-settings");
    expect(settings).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("Audio and video settings"));
    expect(settings).toHaveAttribute("open");
    fireEvent.click(screen.getByRole("button", { name: /Audio on another device/i }));

    expect(screen.getByText(/keeps this device’s call microphone and speakers off/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Join call" }));

    expect(await screen.findByText(/Audio on other device/i)).toBeInTheDocument();
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(mockLiveKitRoom.switchActiveDevice).not.toHaveBeenCalledWith("audioinput", expect.anything());
    expect(mockLiveKitRoom.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(false);
    expect(joinBody).toMatchObject({ endpointRole: "companion", clientKind: "web" });
    expect(JSON.parse(window.localStorage.getItem("quipsly-live-preferred-devices-v3") || "{}"))
      .toMatchObject({ callAudioMode: "other-device" });
  });

  it("turns off live provider audio before moving an active call to another device", async () => {
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: { query: jest.fn().mockResolvedValue({ state: "granted" }) },
    });
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
    global.fetch = jest.fn(async (input: RequestInfo | URL) => ({
      ok: true,
      status: 200,
      json: async () => String(input).includes("/api/mobile/capture/rooms/join")
        ? {
            ok: true,
            canJoin: true,
            serverUrl: "wss://live.test",
            participantToken: "room-scoped-test-token",
            recordingConsentGranted: true,
          }
        : { ok: true },
    })) as unknown as typeof fetch;

    await act(async () => {
      render(<LiveSessionRoom callRoomId="room-live-audio-handoff" captureGroupId="55555555-5555-4555-8555-555555555542" sessionTitle="Audio handoff" kind="coaching" />);
    });
    fireEvent.click(screen.getByRole("button", { name: "Join call" }));
    expect(await screen.findByRole("button", { name: "Leave" })).toBeInTheDocument();
    const remoteAudio = document.createElement("audio");
    screen.getByLabelText("Remote participant media").appendChild(remoteAudio);
    fireEvent.click(screen.getByText("Audio and video settings"));

    fireEvent.click(screen.getByRole("button", { name: /Audio on another device/i }));
    await waitFor(() => expect(mockLiveKitRoom.localParticipant.setMicrophoneEnabled).toHaveBeenLastCalledWith(false));
    expect(await screen.findByText(/Call microphone and speakers are off on this device/i)).toBeInTheDocument();
    expect(remoteAudio.muted).toBe(true);
    expect(remoteAudio.volume).toBe(0);

    const providerActionCount = mockLiveKitRoom.localParticipant.setMicrophoneEnabled.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: /Audio on this device/i }));
    expect(await screen.findByText(/You can listen now; tap Unmute/i)).toBeInTheDocument();
    expect(remoteAudio.muted).toBe(false);
    expect(remoteAudio.volume).toBe(1);
    expect(screen.getByRole("button", { name: "Unmute" })).toBeEnabled();
    expect(mockLiveKitRoom.localParticipant.setMicrophoneEnabled).toHaveBeenCalledTimes(providerActionCount);
    fireEvent.click(screen.getByRole("button", { name: "Unmute" }));
    await waitFor(() => expect(mockLiveKitRoom.localParticipant.setMicrophoneEnabled).toHaveBeenLastCalledWith(true, {
      deviceId: "coach-mic",
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    }));
  });

  it("keeps the live audio mode truthful when provider mute fails", async () => {
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: { query: jest.fn().mockResolvedValue({ state: "granted" }) },
    });
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
    global.fetch = jest.fn(async (input: RequestInfo | URL) => ({
      ok: true,
      status: 200,
      json: async () => String(input).includes("/api/mobile/capture/rooms/join")
        ? {
            ok: true,
            canJoin: true,
            serverUrl: "wss://live.test",
            participantToken: "room-scoped-test-token",
            recordingConsentGranted: true,
          }
        : { ok: true },
    })) as unknown as typeof fetch;

    await act(async () => {
      render(<LiveSessionRoom callRoomId="room-live-audio-handoff-failure" captureGroupId="55555555-5555-4555-8555-555555555543" sessionTitle="Audio handoff failure" kind="coaching" />);
    });
    fireEvent.click(screen.getByRole("button", { name: "Join call" }));
    expect(await screen.findByRole("button", { name: "Leave" })).toBeInTheDocument();
    fireEvent.click(screen.getByText("Audio and video settings"));
    mockLiveKitRoom.localParticipant.setMicrophoneEnabled.mockRejectedValueOnce(new Error("provider mute rejected"));

    fireEvent.click(screen.getByRole("button", { name: /Audio on another device/i }));
    expect(await screen.findByText(/Call audio stayed on this device/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Audio on this device/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Audio on another device/i })).toHaveAttribute("aria-pressed", "false");
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
    expect(screen.getByText(/This device will join muted.*Joining doesn’t start recording/i)).toBeInTheDocument();
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
    expect(JSON.parse(window.localStorage.getItem("quipsly-live-preferred-devices-v3") || "{}"))
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

    await act(async () => {
      render(
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
    expect(greenRoom).toHaveTextContent(/Call lobby/i);
    expect(greenRoom).toHaveTextContent(/Ready to join/i);
    expect(greenRoom).toHaveTextContent(/Coach microphone/i);
    expect(greenRoom).not.toHaveTextContent(/permission|setup required|preview required/i);
    expect(greenRoom).toHaveTextContent(/Joining doesn’t start recording/i);
    const join = screen.getByRole("button", { name: /Join call/i });
    const devices = screen.getByRole("group", { name: "Preflight studio devices" });
    const soundCheck = screen.getByRole("region", { name: "Private studio sound check" });
    const stage = screen.getByTestId("call-video-stage");
    const preview = stage.querySelector("video");
    expect(greenRoom).toContainElement(stage);
    expect(preview).not.toBeNull();
    expect(
      stage.compareDocumentPosition(join) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      preview!.compareDocumentPosition(devices) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      devices.compareDocumentPosition(soundCheck)
        & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(join).toBeEnabled();
    expect(screen.getByRole("button", { name: "Test speakers" })).toBeEnabled();
    expect(screen.queryByTestId("browser-source-conversation")).not.toBeInTheDocument();
    expect(preview?.parentElement).toHaveClass("h-28");
  });

  it("promotes remote video to the main stage and keeps the local camera in picture-in-picture", async () => {
    const livekit = jest.requireActual("livekit-client") as typeof import("livekit-client");
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: jest.fn().mockResolvedValue([
          { kind: "audioinput", deviceId: "coach-mic", label: "Coach microphone" },
          { kind: "videoinput", deviceId: "coach-camera", label: "Coach camera" },
        ]),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
    });
    global.fetch = jest.fn(async (input: RequestInfo | URL) => ({
      ok: true,
      status: 200,
      json: async () => String(input).includes("/api/mobile/capture/rooms/join")
        ? {
            ok: true,
            canJoin: true,
            serverUrl: "wss://live.test",
            participantToken: "room-scoped-test-token",
            recordingConsentGranted: true,
          }
        : { ok: true },
    })) as unknown as typeof fetch;

    await act(async () => {
      render(<LiveSessionRoom callRoomId="room-video-stage" captureGroupId="55555555-5555-4555-8555-555555555545" sessionTitle="Coaching call" kind="coaching" />);
    });
    fireEvent.click(await screen.findByRole("button", { name: "Camera off" }));
    fireEvent.click(screen.getByRole("button", { name: "Join call" }));
    expect(await screen.findByRole("button", { name: "Leave" })).toBeInTheDocument();

    const remoteVideo = document.createElement("video");
    const remoteTrack = {
      sid: "remote-video-1",
      kind: livekit.Track.Kind.Video,
      attach: jest.fn(() => remoteVideo),
      detach: jest.fn(() => [remoteVideo]),
    };
    await act(async () => {
      mockLiveKitRoom.__emit(livekit.RoomEvent.TrackSubscribed, remoteTrack);
    });

    const stage = screen.getByTestId("call-video-stage");
    expect(stage).toHaveAttribute("aria-label", "Call video stage with your preview");
    expect(screen.getByLabelText("Remote participant media")).toContainElement(remoteVideo);
    expect(screen.getByLabelText("Your camera")).toHaveClass("w-[32%]");
    expect(screen.getByText("You")).toBeInTheDocument();

    await act(async () => {
      mockLiveKitRoom.__emit(livekit.RoomEvent.TrackMuted, { track: remoteTrack });
    });
    expect(stage).toHaveAttribute("aria-label", "Your camera preview");
    expect(screen.getByLabelText("Remote participant media")).not.toContainElement(remoteVideo);

    await act(async () => {
      mockLiveKitRoom.__emit(livekit.RoomEvent.TrackUnmuted, { track: remoteTrack });
    });
    expect(stage).toHaveAttribute("aria-label", "Call video stage with your preview");
    expect(screen.getByLabelText("Remote participant media")).toContainElement(remoteVideo);

    await act(async () => {
      mockLiveKitRoom.__emit(livekit.RoomEvent.TrackUnsubscribed, remoteTrack);
    });
    expect(stage).toHaveAttribute("aria-label", "Your camera preview");
  });

  it("keeps the call connected when a requested camera cannot start", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: jest.fn().mockResolvedValue([
          { kind: "audioinput", deviceId: "coach-mic", label: "Coach microphone" },
          { kind: "videoinput", deviceId: "busy-camera", label: "Busy camera" },
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
            recordingConsentGranted: true,
          }),
        } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
    }) as typeof fetch;
    mockLiveKitRoom.localParticipant.setCameraEnabled.mockRejectedValueOnce(
      new DOMException("Camera is already in use", "NotReadableError"),
    );

    await act(async () => {
      render(<LiveSessionRoom callRoomId="room-camera-fallback" captureGroupId="55555555-5555-4555-8555-555555555544" sessionTitle="Camera fallback" kind="coaching" />);
    });
    fireEvent.click(await screen.findByRole("button", { name: "Camera off" }));
    fireEvent.click(screen.getByRole("button", { name: "Join call" }));

    expect(await screen.findByRole("button", { name: "Leave" })).toBeInTheDocument();
    expect(screen.getByText(/joined with the camera off/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start camera" })).toBeEnabled();
    expect(mockLiveKitRoom.disconnect).not.toHaveBeenCalled();
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
    expect(screen.getByTestId("call-status-message")).toHaveTextContent(/Recording is off until everyone chooses/i);
    fireEvent.click(screen.getByRole("button", { name: "Simulate recording choice ready" }));
    expect(screen.getByTestId("call-status-message")).toHaveTextContent(/Your recording choice is saved.*Waiting for the other participant/i);
    fireEvent.click(screen.getByRole("button", { name: "Simulate everyone ready" }));
    expect(screen.getByTestId("call-status-message")).toHaveTextContent(/Everyone is ready to record/i);
    const recorder = screen.getByTestId("browser-source-capture-group").parentElement;
    const optionalSettings = screen.getByTestId("call-device-settings");
    expect(recorder).not.toBeNull();
    expect(recorder!.compareDocumentPosition(optionalSettings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(optionalSettings).not.toHaveAttribute("open");
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
      "The live call couldn't connect. Retry Join call, or continue with the protected recorder on this device.",
    ));
    expect(screen.queryByText("LiveKit websocket token rejected")).not.toBeVisible();
    fireEvent.click(screen.getByText("Technical device details"));
    expect(screen.getByTestId("call-technical-error")).toHaveTextContent(
      "LiveKit websocket token rejected",
    );
    expect(screen.getByRole("region", { name: "Local recording fallback" })).toHaveTextContent(
      /protected recorder below/i,
    );
    expect(screen.getByTestId("browser-source-conversation")).toHaveTextContent("connected");
    expect(screen.getByTestId("browser-source-call-transport")).toHaveTextContent("interrupted");
  });

  it("explains an unconfigured call provider and keeps the consent-gated local recorder usable", async () => {
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
            canJoin: false,
            providerReadiness: "provider-not-configured",
            nextAction: "Configure LiveKit before joining the live call.",
            localFallback: {
              available: true,
              safeToRecordLocally: false,
              reason: "provider-not-configured",
              nextAction: "Allow recording before starting a retained source.",
            },
          }),
        } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
    }) as typeof fetch;

    await act(async () => {
      render(<LiveSessionRoom callRoomId="room-provider-planned" captureGroupId="55555555-5555-4555-8555-555555555542" sessionTitle="Local fallback" kind="coaching" />);
    });
    fireEvent.click(screen.getByRole("button", { name: "Join call" }));

    await waitFor(() => expect(screen.getByTestId("call-status-message")).toHaveTextContent(
      /live call isn't configured.*still record a high-quality copy/i,
    ));
    expect(screen.getByRole("region", { name: "Local recording fallback" })).toHaveTextContent(
      /still waits for consent/i,
    );
    expect(screen.getByTestId("browser-source-conversation")).toHaveTextContent("connected");
    expect(screen.getByTestId("browser-source-call-transport")).toHaveTextContent("interrupted");
    expect(mockLiveKitRoom.connect).not.toHaveBeenCalled();
  });

  it("keeps the retained source active when automatic reconnect is exhausted and rejoins with one action", async () => {
    const livekit = jest.requireActual("livekit-client") as typeof import("livekit-client");
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
    let joinRequests = 0;
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/mobile/capture/rooms/join")) {
        joinRequests += 1;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            canJoin: true,
            serverUrl: "wss://live.test",
            participantToken: `room-scoped-test-token-${joinRequests}`,
            recordingConsentGranted: true,
          }),
        } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
    }) as typeof fetch;

    await act(async () => {
      render(<LiveSessionRoom callRoomId="room-rejoin" captureGroupId="55555555-5555-4555-8555-555555555537" sessionTitle="Recovery call" kind="coaching" />);
    });
    fireEvent.click(screen.getByRole("button", { name: "Join call" }));
    expect(await screen.findByRole("button", { name: "Leave" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Simulate retained source start" }));

    await act(async () => {
      mockLiveKitRoom.__emit(livekit.RoomEvent.Reconnecting);
    });
    expect(screen.getByText("Reconnecting", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByTestId("browser-source-ended")).toHaveTextContent("active");
    expect(screen.getByTestId("browser-source-call-transport")).toHaveTextContent("interrupted");

    await act(async () => {
      mockLiveKitRoom.__emit(livekit.RoomEvent.Disconnected);
    });
    expect(screen.getByText("Call disconnected", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Ready to rejoin" })).toHaveTextContent("Ready to rejoin");
    expect(screen.getByRole("button", { name: "Rejoin call" })).toBeEnabled();
    expect(screen.getByTestId("call-status-message")).toHaveTextContent(/local recording is still protected/i);
    expect(screen.getByTestId("browser-source-conversation")).toHaveTextContent("connected");
    expect(screen.getByTestId("browser-source-ended")).toHaveTextContent("active");
    expect(screen.getByTestId("browser-source-call-transport")).toHaveTextContent("interrupted");

    fireEvent.click(screen.getByRole("button", { name: "Rejoin call" }));
    expect(await screen.findByRole("button", { name: "Stop recording & leave" })).toBeInTheDocument();
    expect(joinRequests).toBe(2);
    expect(mockLiveKitRoom.connect).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("browser-source-ended")).toHaveTextContent("active");
    expect(screen.getByTestId("browser-source-call-transport")).toHaveTextContent("available");
  });

  it("preserves deliberate microphone and camera privacy through manual Rejoin", async () => {
    const livekit = jest.requireActual("livekit-client") as typeof import("livekit-client");
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: jest.fn().mockResolvedValue([
          { kind: "audioinput", deviceId: "podcast-mic", label: "Podcast microphone" },
          { kind: "videoinput", deviceId: "podcast-camera", label: "Podcast camera" },
        ]),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
    });
    let joinRequests = 0;
    global.fetch = jest.fn(async (input: RequestInfo | URL) => ({
      ok: true,
      status: 200,
      json: async () => {
        if (String(input).includes("/api/mobile/capture/rooms/join")) {
          joinRequests += 1;
          return {
            ok: true,
            canJoin: true,
            serverUrl: "wss://live.test",
            participantToken: `privacy-rejoin-token-${joinRequests}`,
            recordingConsentGranted: true,
          };
        }
        return { ok: true };
      },
    })) as unknown as typeof fetch;

    await act(async () => {
      render(<LiveSessionRoom callRoomId="room-private-rejoin" captureGroupId="55555555-5555-4555-8555-555555555544" sessionTitle="Private rejoin" kind="episode" />);
    });
    fireEvent.click(screen.getByRole("button", { name: "Join call" }));
    expect(await screen.findByRole("button", { name: "Leave" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mute" }));
    fireEvent.click(screen.getByRole("button", { name: "Stop camera" }));
    expect(await screen.findByRole("button", { name: "Unmute" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Start camera" })).toBeEnabled();

    await act(async () => {
      mockLiveKitRoom.__emit(livekit.RoomEvent.Disconnected);
    });
    expect(screen.getByRole("button", { name: "Rejoin call" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Muted" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Camera off" })).toHaveAttribute("aria-pressed", "false");
    mockLiveKitRoom.localParticipant.setMicrophoneEnabled.mockClear();
    mockLiveKitRoom.localParticipant.setCameraEnabled.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Rejoin call" }));
    expect(await screen.findByRole("button", { name: "Leave" })).toBeInTheDocument();
    expect(mockLiveKitRoom.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(false);
    expect(mockLiveKitRoom.localParticipant.setCameraEnabled).toHaveBeenCalledWith(false);
    expect(screen.getByRole("button", { name: "Unmute" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Start camera" })).toBeEnabled();
    expect(screen.getByTestId("call-status-message")).toHaveTextContent(/rejoined muted.*camera stayed off/i);
    expect(joinRequests).toBe(2);
  });

  it("ends the rejoin loop when Nest confirms the call is closed while preserving source controls", async () => {
    const livekit = jest.requireActual("livekit-client") as typeof import("livekit-client");
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
    let joinRequests = 0;
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/mobile/capture/rooms/join")) {
        joinRequests += 1;
        if (joinRequests === 2) {
          return {
            ok: false,
            status: 409,
            json: async () => ({
              ok: false,
              code: "ROOM_NOT_OPEN",
              error: "This call has ended and is no longer open for joining.",
            }),
          } as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            canJoin: true,
            serverUrl: "wss://live.test",
            participantToken: "room-scoped-first-token",
            recordingConsentGranted: true,
          }),
        } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
    }) as typeof fetch;

    await act(async () => {
      render(<LiveSessionRoom callRoomId="room-closed-during-recovery" captureGroupId="55555555-5555-4555-8555-555555555538" sessionTitle="Completed call" kind="coaching" />);
    });
    fireEvent.click(screen.getByRole("button", { name: "Join call" }));
    expect(await screen.findByRole("button", { name: "Leave" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Simulate retained source start" }));
    await act(async () => {
      mockLiveKitRoom.__emit(livekit.RoomEvent.Disconnected);
    });

    fireEvent.click(screen.getByRole("button", { name: "Rejoin call" }));

    expect(await screen.findByRole("region", { name: "Call closed" })).toHaveTextContent("This Session is closed");
    expect(screen.queryByRole("button", { name: /join call/i })).not.toBeInTheDocument();
    expect(screen.getByTestId("call-status-message")).toHaveTextContent(/local recording is still protected/i);
    expect(screen.getByTestId("browser-source-ended")).toHaveTextContent("ended");
    expect(screen.getByTestId("browser-source-call-transport")).toHaveTextContent("available");
    expect(joinRequests).toBe(2);
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

  it("joins with camera off when the browser exposes no usable camera id", async () => {
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
    global.fetch = jest.fn(async (input: RequestInfo | URL) => ({
      ok: true,
      status: 200,
      json: async () => String(input).includes("/api/mobile/capture/rooms/join")
        ? {
            ok: true,
            canJoin: true,
            serverUrl: "wss://live.test",
            participantToken: "room-scoped-test-token",
            recordingConsentGranted: false,
          }
        : { ok: true },
    })) as unknown as typeof fetch;

    await act(async () => {
      render(<LiveSessionRoom callRoomId="room-4" captureGroupId="55555555-5555-4555-8555-555555555554" sessionTitle="Podcast test" kind="episode" />);
    });

    expect(screen.getByRole("combobox", { name: "Camera" })).toHaveValue("");
    expect(screen.getByRole("button", { name: /Test selected setup/i })).toBeDisabled();
    const join = screen.getByRole("button", { name: /Join call/i });
    expect(join).toBeEnabled();
    fireEvent.click(join);
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: true }));
    expect(await screen.findByRole("button", { name: "Leave" })).toBeInTheDocument();
    expect(screen.getByText(/Your camera is off/i)).toBeInTheDocument();
    expect(mockLiveKitRoom.localParticipant.setCameraEnabled).toHaveBeenCalledWith(false);
    expect(screen.getByRole("button", { name: "Start camera" })).toBeDisabled();
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
    const onExitComplete = jest.fn();
    const onProtectionChange = jest.fn();
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

    let rerender!: ReturnType<typeof render>["rerender"];
    await act(async () => {
      ({ rerender } = render(<LiveSessionRoom callRoomId="room-safe-leave" captureGroupId="55555555-5555-4555-8555-555555555544" sessionTitle="Safe leave" kind="coaching" onProtectionChange={onProtectionChange} onExitComplete={onExitComplete} />));
    });
    fireEvent.click(screen.getByRole("button", { name: "Join call" }));
    expect(await screen.findByRole("button", { name: "Leave" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Simulate retained source start" }));

    await waitFor(() => expect(onProtectionChange).toHaveBeenLastCalledWith(true));
    rerender(<LiveSessionRoom callRoomId="room-safe-leave" captureGroupId="55555555-5555-4555-8555-555555555544" sessionTitle="Safe leave" kind="coaching" onProtectionChange={onProtectionChange} onExitComplete={onExitComplete} leaveRequestVersion={1} />);

    expect(await screen.findByText("Call ended")).toBeInTheDocument();
    expect(screen.getByTestId("call-status-message")).toHaveTextContent(
      /local recording is protected.*Safe to close/i,
    );
    expect(screen.getByTestId("browser-source-conversation")).toHaveTextContent("lobby");
    expect(screen.getByTestId("browser-source-ended")).toHaveTextContent("ended");
    expect(mockLiveKitRoom.disconnect).toHaveBeenCalledWith(true);
    expect(onProtectionChange).toHaveBeenLastCalledWith(false);
    expect(onExitComplete).toHaveBeenCalledTimes(1);
  });

  it("does not resurrect provider media when safe exit wins a pending Join", async () => {
    let finishConnect!: () => void;
    mockLiveKitRoom.connect.mockImplementationOnce(() => new Promise<void>((resolve) => {
      finishConnect = resolve;
    }));
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
    global.fetch = jest.fn(async (input: RequestInfo | URL) => ({
      ok: true,
      status: 200,
      json: async () => String(input).includes("/api/mobile/capture/rooms/join")
        ? {
            ok: true,
            canJoin: true,
            serverUrl: "wss://live.test",
            participantToken: "pending-join-token",
            recordingConsentGranted: true,
          }
        : { ok: true },
    })) as unknown as typeof fetch;
    const onExitComplete = jest.fn();
    const view = render(<LiveSessionRoom callRoomId="room-pending-join-exit" captureGroupId="55555555-5555-4555-8555-555555555545" sessionTitle="Pending join exit" kind="coaching" onExitComplete={onExitComplete} />);

    fireEvent.click(screen.getByRole("button", { name: "Join call" }));
    await waitFor(() => expect(mockLiveKitRoom.connect).toHaveBeenCalledTimes(1));
    view.rerender(<LiveSessionRoom callRoomId="room-pending-join-exit" captureGroupId="55555555-5555-4555-8555-555555555545" sessionTitle="Pending join exit" kind="coaching" onExitComplete={onExitComplete} leaveRequestVersion={1} />);
    expect(await screen.findByText("Call ended")).toBeInTheDocument();
    expect(onExitComplete).toHaveBeenCalledTimes(1);

    await act(async () => finishConnect());
    await waitFor(() => expect(mockLiveKitRoom.disconnect).toHaveBeenCalled());
    expect(mockLiveKitRoom.localParticipant.setMicrophoneEnabled).not.toHaveBeenCalledWith(true, expect.anything());
    expect(screen.queryByRole("button", { name: "Leave" })).not.toBeInTheDocument();
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
