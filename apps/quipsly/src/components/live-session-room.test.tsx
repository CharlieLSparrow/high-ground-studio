import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { LiveSessionRoom } from "./live-session-room";

const mockRouterRefresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRouterRefresh }),
}));

jest.mock("@/components/browser-source-recorder", () => ({
  BrowserSourceRecorder: ({
    captureGroupId,
    projectSlug,
    onSourceLockChange,
  }: {
    captureGroupId: string;
    projectSlug?: string | null;
    onSourceLockChange?: (locked: boolean) => void;
  }) => (
    <div>
      <span data-testid="browser-source-capture-group">{captureGroupId}</span>
      <span data-testid="browser-source-project">{projectSlug || "unbound"}</span>
      <button type="button" onClick={() => onSourceLockChange?.(true)}>Simulate retained source start</button>
      <button type="button" onClick={() => onSourceLockChange?.(false)}>Simulate retained source stop</button>
    </div>
  ),
}));

describe("LiveSessionRoom", () => {
  const originalMediaDevices = navigator.mediaDevices;
  const originalFetch = global.fetch;

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
    expect(screen.getByRole("heading", { name: "Conversation is not recording" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Call-path microphone evidence" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Private studio sound check" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Record private sample" })).toBeDisabled();
    expect(screen.getByText("Call-path input evidence")).toBeInTheDocument();
    expect(screen.getByText(/not LUFS, true peak, or proof of the retained source/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Join live room/i })).toBeEnabled();
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
    fireEvent.click(screen.getByRole("button", { name: /Allow microphone/i }));
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
    await screen.findByText(/No microphone was found/i);
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
      render(<LiveSessionRoom callRoomId="room-4" captureGroupId="55555555-5555-4555-8555-555555555554" sessionTitle="Podcast test" kind="episode" />);
    });

    expect(screen.getByRole("combobox", { name: "Camera" })).toHaveValue("");
    expect(screen.getByRole("button", { name: /Test selected setup/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Join live room/i })).toBeDisabled();
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
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: jest.fn().mockResolvedValue([
          { kind: "audioinput", deviceId: "mv7i", label: "Shure MV7i" },
          { kind: "videoinput", deviceId: "canon-r8", label: "Canon EOS R8" },
          { kind: "audiooutput", deviceId: "mv7i-headphones", label: "Shure MV7i Headphones" },
        ]),
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

    fireEvent.click(screen.getByRole("button", { name: "Simulate retained source stop" }));
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
    expect(screen.getByRole("button", { name: /Join live room/i })).toBeEnabled();
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
