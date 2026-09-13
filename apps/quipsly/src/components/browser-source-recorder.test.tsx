import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { BrowserSourceRecorder } from "./browser-source-recorder";
import type { BrowserCaptureStudioHandoff } from "@/lib/browser-capture-studio-handoff";
import { issueBrowserRecordingDirective, type BrowserRecordingDirective } from "@/lib/browser-recording-directive";
import { browserSourceVaultReadiness } from "@/lib/browser-source-vault";

let mockHandoff: BrowserCaptureStudioHandoff | null = null;
jest.mock("@/lib/browser-capture-studio-handoff", () => ({
  ...jest.requireActual("@/lib/browser-capture-studio-handoff"),
  browserCaptureStudioHandoff: () => mockHandoff,
}));

jest.mock("@/lib/browser-source-vault", () => ({
  ...jest.requireActual("@/lib/browser-source-vault"),
  browserSourceVaultReadiness: jest.fn(async () => ({ available: true, persistent: true, quotaBytes: 10 ** 10, usageBytes: 0 })),
  listBrowserSourceLedgersForParticipant: jest.fn(async () => []),
}));
jest.mock("@/lib/browser-recording-receipt-outbox", () => ({ flushBrowserRecordingReceiptOutbox: jest.fn(async () => ({ pendingCount: 0, latestError: null })) }));
jest.mock("@/lib/browser-endpoint-queue", () => ({ publishBrowserEndpointQueue: jest.fn(async () => undefined) }));
jest.mock("@/lib/browser-recording-directive", () => ({
  ...jest.requireActual("@/lib/browser-recording-directive"),
  readBrowserRecordingDirective: jest.fn(async () => null),
  issueBrowserRecordingDirective: jest.fn(),
}));

const props = { callRoomId: "room", captureGroupId: "take", sessionTitle: "Coaching", sessionKind: "coaching" as const,
  microphoneId: "mic", microphoneLabel: "Test microphone", cameraId: "", cameraLabel: "", conversationConnected: true };
const originalFetch = global.fetch;
const fetchMock = jest.fn();
let session: Record<string, unknown>;

describe("browser recorder before recording", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockHandoff = null;
    session = { participantId: "participant", roomStatus: "OPEN", canControlRoom: false,
      recordingConsentStatus: "REQUESTED", recordingConsentCanRecordAudio: false,
      recordingConsentCanRecordVideo: false, recordingConsentCanTranscribe: false,
      allRegisteredParticipantConsentGranted: false };
    fetchMock.mockReset();
    jest.mocked(issueBrowserRecordingDirective).mockReset();
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes("/consent")) {
        if (init?.method === "POST") {
          const body = JSON.parse(String(init.body));
          session = { ...session, recordingConsentStatus: "GRANTED", recordingConsentId: "consent",
            recordingConsentCanRecordAudio: body.canRecordAudio, recordingConsentCanRecordVideo: body.canRecordVideo,
            recordingConsentCanTranscribe: body.canTranscribe };
        }
        return { ok: true, json: async () => ({ ok: true, currentPolicy: { version: "test", text: "Synthetic policy", sha256: "a".repeat(64), surface: "web", presentationVersion: 1 }, session }) };
      }
      return { ok: true, json: async () => ({ ok: true, sessions: [] }) };
    });
    global.fetch = fetchMock;
    localStorage.clear();
  });
  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
  });

  it("offers one recording action without duplicate warnings or imaginary processing", async () => {
    render(<BrowserSourceRecorder {...props} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Allow recording" })).toBeEnabled());
    expect(screen.getAllByRole("button", { name: "Allow recording" })).toHaveLength(1);
    expect(screen.getByText("Recording off")).toBeInTheDocument();
    expect(screen.queryByTestId("recording-readiness-message")).not.toBeInTheDocument();
    expect(screen.queryByText("Recording processing")).not.toBeInTheDocument();
    expect(screen.queryByText(/Allow recording above/)).not.toBeInTheDocument();
  });

  it("lets a client allow recording on the call stage while recorder details remain closed", async () => {
    const stage = document.createElement("div");
    document.body.appendChild(stage);
    const onOpenRecordingSettings = jest.fn();
    const view = render(<div hidden><BrowserSourceRecorder {...props} consentContainer={stage} onOpenRecordingSettings={onOpenRecordingSettings} /></div>);
    try {
      const allow = await within(stage).findByRole("button", { name: "Allow recording" });
      await waitFor(() => expect(allow).toBeEnabled());
      expect(allow).toBeVisible();
      expect(within(stage).getByText(/Allow audio recording and transcription/)).toBeVisible();
      fireEvent.click(within(stage).getByRole("button", { name: "Recording settings" }));
      expect(onOpenRecordingSettings).toHaveBeenCalledTimes(1);
      fireEvent.click(allow);
      await waitFor(() => expect(within(stage).queryByRole("button", { name: "Allow recording" })).not.toBeInTheDocument());
      const writes = fetchMock.mock.calls.filter(([url, init]) => url.includes("/consent") && init?.method === "POST");
      expect(writes).toHaveLength(1);
      expect(JSON.parse(writes[0][1].body)).toMatchObject({ callRoomId: "room", consentAction: "GRANT", canRecordAudio: true, canTranscribe: true });
      expect(issueBrowserRecordingDirective).not.toHaveBeenCalled();
    } finally { view.unmount(); stage.remove(); }
  });

  it("explains the client's role instead of promising a Record button they do not have", async () => {
    session = { ...session, recordingConsentStatus: "GRANTED", recordingConsentId: "consent",
      recordingConsentCanRecordAudio: true, allRegisteredParticipantConsentGranted: true };
    render(<BrowserSourceRecorder {...props} />);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Allow recording" })).not.toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Your recording" })).toBeInTheDocument();
    expect(screen.getByText(/Your coach starts recording/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Record" })).not.toBeInTheDocument();
  });

  it("starts from the call toolbar without opening recorder details and prevents a duplicate command", async () => {
    session = {...session,canControlRoom:true,recordingConsentStatus:"GRANTED",recordingConsentId:"consent",
      recordingConsentCanRecordAudio:true,allRegisteredParticipantConsentGranted:true};
    const controls = document.createElement("div"); document.body.appendChild(controls);
    const openSettings = jest.fn();
    let finish!: (value: BrowserRecordingDirective) => void;
    jest.mocked(issueBrowserRecordingDirective).mockImplementation(() => new Promise(resolve => {finish = resolve;}));
    const view = render(<div hidden><BrowserSourceRecorder {...props} controlsContainer={controls} onOpenRecordingSettings={openSettings} /></div>);
    try {
      const record = await within(controls).findByRole("button", {name:"Record"});
      await waitFor(() => expect(record).toBeEnabled());
      fireEvent.click(record); fireEvent.click(record);
      expect(issueBrowserRecordingDirective).toHaveBeenCalledTimes(1);
      expect(issueBrowserRecordingDirective).toHaveBeenCalledWith("room","START");
      expect(openSettings).not.toHaveBeenCalled();
      await act(async () => {finish({id:"directive",sequence:"1",action:"START",captureGroupId:"take",issuedAt:new Date().toISOString(),shouldRecord:true,
        participantStatuses:[],endpointReceipts:[],recordingHealth:{expectedParticipantCount:1,participantWithEndpointCount:0,
          recordingParticipantCount:0,attentionParticipantCount:0,waitingParticipantCount:1,allParticipantsRecording:false,allParticipantsStoppedSafely:false}});});
      expect(within(controls).getByRole("button", {name:"Stop recording"})).toBeEnabled();
      fireEvent.click(within(controls).getByRole("button", {name:"Recording settings and status"}));
      expect(openSettings).toHaveBeenCalledTimes(1);
    } finally {view.unmount();controls.remove();}
  });

  it("does not tell a client they are recording before the host starts", async () => {
    session = {...session, recordingConsentStatus:"GRANTED", recordingConsentId:"consent",
      recordingConsentCanRecordAudio:true, allRegisteredParticipantConsentGranted:true};
    const controls = document.createElement("div"); document.body.appendChild(controls);
    const openSettings = jest.fn();
    const view = render(<div hidden><BrowserSourceRecorder {...props} controlsContainer={controls} onOpenRecordingSettings={openSettings} /></div>);
    try {
      const control = await within(controls).findByRole("button", {name:"Recording off"});
      await waitFor(() => expect(control).toBeEnabled());
      expect(within(controls).queryByRole("button", {name:"Recording"})).not.toBeInTheDocument();
      fireEvent.click(control);
      expect(openSettings).toHaveBeenCalledTimes(1);
      expect(issueBrowserRecordingDirective).not.toHaveBeenCalled();
    } finally {view.unmount();controls.remove();}
  });

  it("opens setup for an unready host instead of sending a recording command", async () => {
    session = {...session,canControlRoom:true,recordingConsentStatus:"GRANTED",recordingConsentId:"consent",
      recordingConsentCanRecordAudio:true,allRegisteredParticipantConsentGranted:true};
    const controls = document.createElement("div"); document.body.appendChild(controls);
    const openSettings = jest.fn();
    const view = render(<div hidden><BrowserSourceRecorder {...props} microphoneId="" controlsContainer={controls} onOpenRecordingSettings={openSettings} /></div>);
    try {
      const record = await within(controls).findByRole("button", {name:"Record"});
      await waitFor(() => expect(record).toBeEnabled());
      fireEvent.click(record);
      expect(openSettings).toHaveBeenCalledTimes(1);
      expect(issueBrowserRecordingDirective).not.toHaveBeenCalled();
    } finally {view.unmount();controls.remove();}
  });

  it("reports saved consent independently of missing microphone readiness", async () => {
    session = { ...session, recordingConsentStatus: "GRANTED", recordingConsentId: "consent",
      recordingConsentCanRecordAudio: true, allRegisteredParticipantConsentGranted: true };
    const onRecordingConsentChange = jest.fn();
    render(<BrowserSourceRecorder {...props} microphoneId="" onRecordingConsentChange={onRecordingConsentChange} />);
    await waitFor(() => expect(onRecordingConsentChange).toHaveBeenLastCalledWith({
      participantConsentGranted: true, everyoneConsentGranted: true,
    }));
    expect(screen.getByTestId("recording-readiness-message")).toHaveTextContent("Choose a microphone.");
    expect(screen.queryByText(/Everyone is ready to record/)).not.toBeInTheDocument();
  });

  it("shows preparation rather than a storage failure while readiness is still loading", async () => {
    let finishStorageCheck!: (value: Awaited<ReturnType<typeof browserSourceVaultReadiness>>) => void;
    jest.mocked(browserSourceVaultReadiness).mockImplementationOnce(() => new Promise((resolve) => {
      finishStorageCheck = resolve;
    }));
    render(<BrowserSourceRecorder {...props} />);
    expect(screen.getByText("Getting recording ready…")).toBeInTheDocument();
    expect(screen.getByText(/Recording health · Checking/)).toBeInTheDocument();
    expect(screen.queryByText(/Needs attention/)).not.toBeInTheDocument();
    expect(screen.queryByText(/On-device protection unavailable/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("recording-readiness-message")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Record" })).not.toBeInTheDocument();
    await act(async () => {
      finishStorageCheck({ available: true, persistent: true, quotaBytes: 10 ** 10, usageBytes: 0 });
    });
    expect(await screen.findByRole("button", { name: "Allow recording" })).toBeEnabled();
    expect(screen.getByText(/Recording health · Recording off/)).toBeInTheDocument();
  });

  it("still explains a confirmed storage failure and does not offer recording", async () => {
    jest.mocked(browserSourceVaultReadiness).mockResolvedValueOnce({
      available: false, persistent: false, quotaBytes: null, usageBytes: null,
    });
    render(<BrowserSourceRecorder {...props} />);
    expect(await screen.findByTestId("recording-readiness-message")).toHaveTextContent(/storage.*unavailable/i);
    expect(screen.getByText(/Recording health · Needs attention/)).toBeInTheDocument();
    expect(screen.getByText(/Recording is not supported in this browser/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Record" })).not.toBeInTheDocument();
  });

  it("does not mislabel a failed session setup request as unavailable browser storage", async () => {
    const normalFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => url.includes("/consent")
      ? Promise.resolve({ ok: false, status: 403, json: async () => ({ error: "This session is not available to your account." }) })
      : normalFetch(url, init));
    render(<BrowserSourceRecorder {...props} />);
    expect(await screen.findByText("This session is not available to your account.")).toBeInTheDocument();
    expect(screen.getByText(/Recording health · Not checked/)).toBeInTheDocument();
    expect(screen.queryByText(/On-device protection unavailable/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("recording-readiness-message")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Record" })).not.toBeInTheDocument();
  });

  it("does not silently turn off a new participant's transcript choice during background refresh", async () => {
    render(<BrowserSourceRecorder {...props} />);
    fireEvent.click(screen.getByText(/Recording settings ·/));
    const choice = await screen.findByRole("checkbox", { name: /Create a transcript/ });
    await waitFor(() => expect(screen.getByRole("button", { name: "Allow recording" })).toBeEnabled());
    expect(choice).toBeChecked();
    await act(async () => { await jest.advanceTimersByTimeAsync(2600); });
    expect(choice).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Allow recording" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
    const submitted = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(submitted![1].body)).toMatchObject({ canTranscribe: true, consentAction: "GRANT" });
  });

  it("retains an explicitly saved transcript-off choice without asking for recording again", async () => {
    session = { ...session, recordingConsentStatus: "GRANTED", recordingConsentId: "consent", recordingConsentCanRecordAudio: true };
    render(<BrowserSourceRecorder {...props} />);
    fireEvent.click(screen.getByText(/Recording settings ·/));
    const choice = await screen.findByRole("checkbox", { name: /Create a transcript/ });
    await waitFor(() => expect(choice).not.toBeChecked());
    await act(async () => { await jest.advanceTimersByTimeAsync(2600); });
    expect(choice).not.toBeChecked();
    expect(screen.queryByRole("button", { name: "Allow recording" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Waiting for recording consent")).toBeInTheDocument();
  });

  it("keeps a real microphone problem visible even before consent", async () => {
    const onOpenDeviceSettings = jest.fn();
    render(<BrowserSourceRecorder {...props} microphoneId="" onOpenDeviceSettings={onOpenDeviceSettings} />);
    await waitFor(() => expect(screen.getByTestId("recording-readiness-message")).toHaveTextContent("Choose a microphone."));
    expect(screen.queryByRole("button", { name: "Record" })).not.toBeInTheDocument();
    expect(screen.getByText(/Recording health · Choose microphone/)).toBeInTheDocument();
    expect(screen.queryByText(/Recording health · Ready/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Choose devices" }));
    expect(onOpenDeviceSettings).toHaveBeenCalledTimes(1);
  });

  it("updates recording health when a microphone becomes available without remounting", async () => {
    session = { ...session, canControlRoom: true, recordingConsentStatus: "GRANTED",
      recordingConsentId: "consent", recordingConsentCanRecordAudio: true,
      allRegisteredParticipantConsentGranted: true };
    const { rerender } = render(<BrowserSourceRecorder {...props} microphoneId="" onOpenDeviceSettings={jest.fn()} />);
    await waitFor(() => expect(screen.getByText(/Recording health · Choose microphone/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Record" })).toBeDisabled();
    rerender(<BrowserSourceRecorder {...props} onOpenDeviceSettings={jest.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Record" })).toBeEnabled());
    expect(screen.getByText(/Recording health · Ready/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Choose devices" })).not.toBeInTheDocument();
  });

  it("preserves an unsaved transcription opt-out while fresh server status arrives", async () => {
    render(<BrowserSourceRecorder {...props} />);
    fireEvent.click(screen.getByText(/Recording settings ·/));
    await waitFor(() => expect(screen.getByRole("button", { name: "Allow recording" })).toBeEnabled());
    const choice = screen.getByRole("checkbox", { name: /Create a transcript/ });
    fireEvent.click(choice);
    expect(choice).not.toBeChecked();
    await act(async () => { await jest.advanceTimersByTimeAsync(2600); });
    expect(choice).not.toBeChecked();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Allow recording" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
    const submitted = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(submitted![1].body)).toMatchObject({ canTranscribe: false });
  });

  it("places the recording action before settings in the call panel", async () => {
    session = { ...session, canControlRoom: true, recordingConsentStatus: "GRANTED", recordingConsentId: "consent",
      recordingConsentCanRecordAudio: true, allRegisteredParticipantConsentGranted: true };
    render(<BrowserSourceRecorder {...props} presentation="panel" />);
    const record = await screen.findByRole("button", {name: "Record"});
    await waitFor(() => expect(record).toBeEnabled());
    const settings = screen.getByText(/Recording settings ·/);
    expect(record.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("button", {name: /Update choices/i})).not.toBeInTheDocument();
  });

  it("saves a transcript toggle directly without changing previously granted video access", async () => {
    session = { ...session, recordingConsentStatus: "GRANTED", recordingConsentId: "consent",
      recordingConsentCanRecordAudio: true, recordingConsentCanRecordVideo: true, allRegisteredParticipantConsentGranted: true };
    render(<BrowserSourceRecorder {...props} />);
    fireEvent.click(screen.getByText(/Recording settings ·/));
    const choice = await screen.findByRole("checkbox", {name: /Create a transcript/});
    await waitFor(() => expect(choice).toBeEnabled());
    expect(choice).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", {name: "Audio only"}));
    fireEvent.click(choice);
    await waitFor(() => expect(screen.getByText("Saved automatically")).toBeInTheDocument());
    expect(choice).toBeChecked();
    const writes = fetchMock.mock.calls.filter(([url, init]) => url.includes("/consent") && init?.method === "POST");
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0][1].body)).toMatchObject({canRecordAudio: true, canRecordVideo: true, canTranscribe: true});
    expect(issueBrowserRecordingDirective).not.toHaveBeenCalled();
    await act(async () => { await jest.advanceTimersByTimeAsync(2600); });
    expect(choice).toBeChecked();
  });

  it("waits for a pending transcript save before starting a new recording", async () => {
    session = { ...session, canControlRoom: true, recordingConsentStatus: "GRANTED", recordingConsentId: "consent",
      recordingConsentCanRecordAudio: true, recordingConsentCanTranscribe: true, allRegisteredParticipantConsentGranted: true };
    const normalFetch = fetchMock.getMockImplementation()!;
    let finishSave!: () => void;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => init?.method === "POST" && url.includes("/consent")
      ? new Promise(resolve => { finishSave = () => resolve(normalFetch(url, init)); }) : normalFetch(url, init));
    render(<BrowserSourceRecorder {...props} />);
    fireEvent.click(screen.getByText(/Recording settings ·/));
    const record = await screen.findByRole("button", {name: "Record"});
    await waitFor(() => expect(record).toBeEnabled());
    const choice = screen.getByRole("checkbox", {name: /Create a transcript/});
    fireEvent.click(choice);
    expect(choice).not.toBeChecked();
    expect(choice).toBeDisabled();
    expect(screen.getByText("Saving…")).toBeInTheDocument();
    expect(record).toBeDisabled();
    fireEvent.click(record);
    expect(issueBrowserRecordingDirective).not.toHaveBeenCalled();
    await act(async () => { finishSave(); });
    await waitFor(() => expect(record).toBeEnabled());
    expect(choice).not.toBeChecked();
    expect(choice).toBeEnabled();
  });

  it("keeps a failed transcript opt-out visible and retries the intended value", async () => {
    session = { ...session, canControlRoom: true, recordingConsentStatus: "GRANTED", recordingConsentId: "consent",
      recordingConsentCanRecordAudio: true, recordingConsentCanTranscribe: true, allRegisteredParticipantConsentGranted: true };
    const normalFetch = fetchMock.getMockImplementation()!;
    let failSave = true;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => failSave && init?.method === "POST" && url.includes("/consent")
      ? Promise.resolve({ok: false, json: async () => ({error: "Connection interrupted. Please retry."})}) : normalFetch(url, init));
    render(<BrowserSourceRecorder {...props} />);
    fireEvent.click(screen.getByText(/Recording settings ·/));
    const record = await screen.findByRole("button", {name: "Record"});
    await waitFor(() => expect(record).toBeEnabled());
    const choice = screen.getByRole("checkbox", {name: /Create a transcript/});
    fireEvent.click(choice);
    expect(await screen.findByRole("button", {name: "Retry saving"})).toBeEnabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Connection interrupted");
    expect(record).toBeDisabled();
    await act(async () => { await jest.advanceTimersByTimeAsync(2600); });
    expect(choice).not.toBeChecked();
    failSave = false;
    fireEvent.click(screen.getByRole("button", {name: "Retry saving"}));
    await waitFor(() => expect(record).toBeEnabled());
    expect(choice).not.toBeChecked();
    expect(screen.queryByRole("button", {name: "Retry saving"})).not.toBeInTheDocument();
    const writes = fetchMock.mock.calls.filter(([url, init]) => url.includes("/consent") && init?.method === "POST");
    expect(writes).toHaveLength(2);
    for (const [,init] of writes) expect(JSON.parse(init.body)).toMatchObject({canTranscribe: false, canRecordVideo: false});
  });

  it("does not apply a delayed save from a previous session to the next session", async () => {
    session = { ...session, canControlRoom: true, recordingConsentStatus: "GRANTED", recordingConsentId: "first-consent",
      recordingConsentCanRecordAudio: true, recordingConsentCanTranscribe: true, allRegisteredParticipantConsentGranted: true };
    const firstSession = {...session};
    const normalFetch = fetchMock.getMockImplementation()!;
    let finishOldSave!: () => void;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => init?.method === "POST" && url.includes("/consent")
      ? new Promise(resolve => { finishOldSave = () => resolve({ok: true, json: async () => ({ok: true,
          session: {...firstSession, recordingConsentCanTranscribe: false}})}); }) : normalFetch(url, init));
    const view = render(<BrowserSourceRecorder {...props} />);
    fireEvent.click(screen.getByText(/Recording settings ·/));
    await waitFor(() => expect(screen.getByRole("button", {name: "Record"})).toBeEnabled());
    fireEvent.click(screen.getByRole("checkbox", {name: /Create a transcript/}));
    expect(screen.getByText("Saving…")).toBeInTheDocument();
    session = {...firstSession, participantId: "second-participant", recordingConsentId: "second-consent"};
    view.rerender(<BrowserSourceRecorder {...props} callRoomId="second-room" captureGroupId="second-take" />);
    await waitFor(() => expect(screen.getByRole("checkbox", {name: /Create a transcript/})).toBeChecked());
    await act(async () => { finishOldSave(); });
    expect(screen.getByRole("checkbox", {name: /Create a transcript/})).toBeChecked();
    expect(screen.getByRole("button", {name: "Record"})).toBeEnabled();
    expect(screen.queryByRole("button", {name: "Retry saving"})).not.toBeInTheDocument();
  });

  it("shows processing when a real source from this take is present", async () => {
    mockHandoff = { roomId: "room", captureGroupId: "take", projectSlug: "space", episodeSlug: null,
      sourceCount: 1, requiredSourceCount: 1, verifiedSourceCount: 0, verifiedRequiredSourceCount: 0,
      promotedSourceCount: 0, promotedRequiredSourceCount: 0, providerWitnessCount: 0, ready: false, complete: false,
      sources: [{ recordingAssetId: "asset", captureGroupId: "take", fileName: "client.webm", kind: "AUDIO",
        recordingStatus: "UPLOADING", exactBytesVerified: false, processingDisposition: "PENDING", mediaAssetId: null,
        playbackUrl: null, interruptionRepairRequired: false, verifiedForStudio: false, promotedToStudio: false,
        providerWitness: false, requiredForStudio: true }] };
    render(<BrowserSourceRecorder {...props} />);
    expect(await screen.findByText("Recording processing")).toBeInTheDocument();
    expect(screen.getByText("Preparing recordings")).toBeInTheDocument();
    expect(screen.getByText("client.webm")).toBeInTheDocument();
    expect(screen.queryByText("Waiting for upload")).not.toBeInTheDocument();
  });

  it("shows a failed Record command while devices remain ready and lets the coach retry", async () => {
    session = { ...session, canControlRoom: true, recordingConsentStatus: "GRANTED",
      recordingConsentId: "consent", recordingConsentCanRecordAudio: true,
      allRegisteredParticipantConsentGranted: true };
    jest.mocked(issueBrowserRecordingDirective).mockRejectedValue(new Error("Recording coordination is temporarily unavailable."));
    render(<BrowserSourceRecorder {...props} />);
    const record = await screen.findByRole("button", { name: "Record" });
    expect(screen.getByRole("heading", { name: "Record session" })).toBeInTheDocument();
    await waitFor(() => expect(record).toBeEnabled());
    fireEvent.click(record);
    expect(await screen.findByRole("alert")).toHaveTextContent("Recording coordination is temporarily unavailable.");
    expect(record).toBeEnabled();
    fireEvent.click(record);
    await waitFor(() => expect(issueBrowserRecordingDirective).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("button", { name: "Stop recording" })).not.toBeInTheDocument();
  });
});
