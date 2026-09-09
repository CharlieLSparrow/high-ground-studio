import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BrowserSourceRecorder } from "./browser-source-recorder";
import type { BrowserCaptureStudioHandoff } from "@/lib/browser-capture-studio-handoff";
import { issueBrowserRecordingDirective } from "@/lib/browser-recording-directive";
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
    expect(screen.getByText(/Recording health · Ready/)).toBeInTheDocument();
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
    render(<BrowserSourceRecorder {...props} microphoneId="" />);
    await waitFor(() => expect(screen.getByTestId("recording-readiness-message")).toHaveTextContent("Choose a microphone."));
    expect(screen.queryByRole("button", { name: "Record" })).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "Allow recording" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
    const submitted = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(submitted![1].body)).toMatchObject({ canTranscribe: false });
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
    await waitFor(() => expect(record).toBeEnabled());
    fireEvent.click(record);
    expect(await screen.findByRole("alert")).toHaveTextContent("Recording coordination is temporarily unavailable.");
    expect(record).toBeEnabled();
    fireEvent.click(record);
    await waitFor(() => expect(issueBrowserRecordingDirective).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("button", { name: "Stop recording" })).not.toBeInTheDocument();
  });
});
