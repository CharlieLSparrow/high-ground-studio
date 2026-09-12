import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BrowserSourceRecorder } from "./browser-source-recorder";
import { acknowledgeBrowserRecordingDirective, readBrowserRecordingDirective, type BrowserRecordingDirective } from "@/lib/browser-recording-directive";
import { createBrowserSourceDurableWriter, hashBrowserSourceFile } from "@/lib/browser-source-vault";

jest.mock("@/lib/browser-source-vault", () => ({
  ...jest.requireActual("@/lib/browser-source-vault"),
  browserSourceVaultReadiness: jest.fn(async () => ({ available: true, persistent: true, quotaBytes: 10 ** 10, usageBytes: 0 })),
  listBrowserSourceLedgersForParticipant: jest.fn(async () => []),
  saveBrowserSourceLedger: jest.fn(async () => undefined),
  createBrowserSourceDurableWriter: jest.fn(),
  loadBrowserSourceFile: jest.fn(async () => new File(["abc"], "source.webm", { type: "audio/webm" })),
  hashBrowserSourceFile: jest.fn(async () => ({ sizeBytes: 3, sha256: "a".repeat(64) })),
}));
jest.mock("@/lib/browser-capture-clock", () => ({
  ...jest.requireActual("@/lib/browser-capture-clock"), measureBrowserCaptureClockBurst: jest.fn(async () => []),
}));
jest.mock("@/lib/browser-recording-directive", () => ({
  ...jest.requireActual("@/lib/browser-recording-directive"),
  readBrowserRecordingDirective: jest.fn(), acknowledgeBrowserRecordingDirective: jest.fn(),
}));
jest.mock("@/lib/browser-recording-receipt-outbox", () => ({ flushBrowserRecordingReceiptOutbox: jest.fn(async () => ({ pendingCount: 0, latestError: null })) }));
jest.mock("@/lib/browser-endpoint-queue", () => ({ publishBrowserEndpointQueue: jest.fn(async () => undefined) }));
jest.mock("@/lib/product-analytics", () => ({ dispatchQuipslyProductEvent: jest.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

class TestRecorder {
  static isTypeSupported = () => true;
  state = "inactive";
  mimeType = "audio/webm";
  onstop: (() => void) | null = null;
  start() { this.state = "recording"; }
  stop() { this.state = "inactive"; this.onstop?.(); }
}

const props = { callRoomId: "room", captureGroupId: "take", sessionTitle: "Coaching", sessionKind: "coaching" as const,
  microphoneId: "mic", microphoneLabel: "Test microphone", cameraId: "", cameraLabel: "", conversationConnected: true };
const originalFetch = global.fetch;
const originalRecorder = global.MediaRecorder;
const originalDevices = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
let activeTrack: EventTarget;

describe("browser recording lifecycle", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    localStorage.clear();
    global.MediaRecorder = TestRecorder as unknown as typeof MediaRecorder;
    const track = new EventTarget();
    activeTrack = track;
    Object.assign(track, { kind: "audio", id: "track", label: "Test microphone", readyState: "live", getSettings: () => ({}), stop: jest.fn() });
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: {
      getUserMedia: jest.fn(async () => ({ getTracks: () => [track], getAudioTracks: () => [track], getVideoTracks: () => [] })),
    } });
  });
  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
    global.MediaRecorder = originalRecorder;
    if (originalDevices) Object.defineProperty(navigator, "mediaDevices", originalDevices);
    else Reflect.deleteProperty(navigator, "mediaDevices");
  });

  it.each(["host", "device"])("reports a %s stop after the durable file closes, without waiting for upload or receipt delivery", async (stopOrigin) => {
    const writerClose = deferred<void>();
    const upload = deferred<Response>();
    const stopDelivery = deferred<any>();
    jest.mocked(createBrowserSourceDurableWriter).mockResolvedValue({ close: jest.fn(() => writerClose.promise), write: jest.fn() } as any);
    let directive: BrowserRecordingDirective | null = null;
    jest.mocked(readBrowserRecordingDirective).mockImplementation(async () => directive);
    jest.mocked(acknowledgeBrowserRecordingDirective).mockImplementation(async input => input.state === "STOPPED"
      ? stopDelivery.promise : { acknowledgedCount: 1, rejectedCount: 0, pendingCount: 0, latestError: null });
    const response = (packet: unknown) => ({ ok: true, status: 200, headers: new Headers(), json: async () => packet }) as Response;
    const fetchMock = jest.fn(async (url: string) => {
      if (url.includes("/consent")) return response({ ok: true, currentPolicy: { version: "test", text: "Policy", sha256: "a".repeat(64) },
        session: { participantId: "participant", roomStatus: "OPEN", recordingConsentId: "consent", recordingConsentStatus: "GRANTED",
          recordingConsentCanRecordAudio: true, allRegisteredParticipantConsentGranted: true } });
      if (url.endsWith("/rooms/state")) return response({ ok: true, stateApplied: true, receiptPersisted: true });
      if (url.endsWith("/resumable")) return upload.promise;
      if (url.endsWith("/finalize")) return response({ ok: true, uploadStage: "verified", finalization: { recordingAssetId: "asset" } });
      return response({ ok: true, sessions: [] });
    });
    global.fetch = fetchMock as typeof fetch;
    const {rerender} = render(<BrowserSourceRecorder {...props} />);
    await screen.findByText("Recording starts when the coach or host presses Record.");
    const base = { id: "start", sequence: "1", action: "START", captureGroupId: "take", issuedAt: new Date().toISOString(), shouldRecord: true,
      participantStatuses: [], endpointReceipts: [], recordingHealth: { expectedParticipantCount: 0, participantWithEndpointCount: 0,
        recordingParticipantCount: 0, attentionParticipantCount: 0, waitingParticipantCount: 0, allParticipantsRecording: false, allParticipantsStoppedSafely: false } } satisfies BrowserRecordingDirective;
    directive = base;
    await act(async () => { await jest.advanceTimersByTimeAsync(2000); });
    await screen.findByText("Recording on this device. Your call continues normally.");
    act(() => { activeTrack.dispatchEvent(new Event("mute")); });
    expect(screen.getByTestId("recording-health-issue")).toHaveTextContent("stopped delivering media");
    act(() => { activeTrack.dispatchEvent(new Event("unmute")); });
    expect(screen.queryByTestId("recording-health-issue")).not.toBeInTheDocument();
    if (stopOrigin === "host") {
      directive = { ...base, id: "stop", sequence: "2", action: "STOP", shouldRecord: false };
      await act(async () => { await jest.advanceTimersByTimeAsync(2000); });
      expect(jest.mocked(acknowledgeBrowserRecordingDirective).mock.calls.some(([input]) => input.state === "STOPPING")).toBe(true);
    } else {
      fireEvent.click(screen.getByRole("button", { name: "Stop my recording" }));
    }
    expect(jest.mocked(acknowledgeBrowserRecordingDirective).mock.calls.some(([input]) => input.state === "STOPPED")).toBe(false);
    expect(hashBrowserSourceFile).not.toHaveBeenCalled();
    await act(async () => { writerClose.resolve(); });
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.endsWith("/resumable"))).toBe(true));
    expect(acknowledgeBrowserRecordingDirective).toHaveBeenCalledWith(expect.objectContaining({ directiveId: stopOrigin === "host" ? "stop" : "start", state: "STOPPED", captureId: expect.any(String) }));
    expect(screen.queryByText("Recording saved and verified in Quipsly.")).not.toBeInTheDocument();
    rerender(<BrowserSourceRecorder {...props} conversationConnected={false} />);
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", {name: "Record"})).not.toBeInTheDocument();
    expect(screen.queryByText(/Next, check your microphone/)).not.toBeInTheDocument();
    await act(async () => { upload.resolve(response({ ok: true })); stopDelivery.resolve({ acknowledgedCount: 1, rejectedCount: 0, pendingCount: 0, latestError: null }); });
    expect(await screen.findByText("Recording saved and verified in Quipsly.")).toBeVisible();
  });
});
