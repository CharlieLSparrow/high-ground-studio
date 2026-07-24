/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { TranscriptCorrectionDesk } from "./transcript-correction-desk";

const segment = {
  id: "segment-1",
  speakerLabel: "Speaker",
  providerSpeakerLabel: "Speaker",
  startSeconds: 3.66,
  endSeconds: 4.84,
  text: "Welcome, everybody.",
  providerText: "Welcome, everybody.",
  providerTextSha256: "a".repeat(64),
  confidence: 0.8,
  acceptedCorrection: null,
  proposals: [],
  correctionHistory: [],
};

function desk(playback: boolean) {
  return {
    ok: true,
    roomId: "room-1",
    transcriptJobId: "job-1",
    gate: { allowed: true },
    playback: playback ? {
      sourceId: "source-1",
      url: "/api/ingest/media/source-1",
      kind: "audio",
      recordingAssetId: "asset-1",
      durationSeconds: 60,
      label: "episode.wav",
    } : null,
    segments: [segment],
    boundaries: { providerSegmentsImmutable: true },
  };
}

describe("TranscriptCorrectionDesk", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: jest.fn(async () => undefined),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("sends the exact room, provider evidence, and played media position when a reviewer accepts", async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => desk(true) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, idempotentReplay: false }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...desk(true), segments: [{ ...segment, speakerLabel: "Charlie" }] }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<TranscriptCorrectionDesk roomId="room-1" />);
    await screen.findByText("Welcome, everybody.");
    expect(document.getElementById("transcript-segment-segment-1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /play transcript segment/i }));
    fireEvent.click(screen.getByRole("button", { name: /correct against playback/i }));
    fireEvent.change(screen.getByLabelText(/correct speaker/i), { target: { value: "Charlie" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /listened to this exact timestamp/i }));
    fireEvent.click(screen.getByRole("button", { name: /accept reviewed correction/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const request = fetchMock.mock.calls[1];
    expect(request[0]).toBe("/api/mobile/capture/transcripts/corrections");
    expect(JSON.parse(request[1].body)).toMatchObject({
      operation: "accept-human-correction",
      roomId: "room-1",
      segmentId: "segment-1",
      expectedText: "Welcome, everybody.",
      expectedSpeakerLabel: "Speaker",
      correctedSpeakerLabel: "Charlie",
      confirmedAgainstPlayback: true,
      playbackPositionSeconds: 3.66,
    });
  });

  it("keeps correction controls disabled when no protected playback exists", async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => desk(false) })) as unknown as typeof fetch;
    render(<TranscriptCorrectionDesk roomId="room-1" />);
    const button = await screen.findByRole("button", { name: /correct against playback/i });
    expect(button).toBeDisabled();
    expect(screen.getByText(/prevents “I listened” from becoming a paperwork checkbox/i)).toBeInTheDocument();
  });

  it("creates an explicit self-owned task with the exact provider segment identity", async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => desk(true) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, idempotentReplay: false, task: { id: "task-1", title: "Prepare the opening", status: "OPEN" } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => desk(true) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<TranscriptCorrectionDesk roomId="room-1" />);
    await screen.findByText("Welcome, everybody.");
    fireEvent.click(screen.getByRole("button", { name: /make this my task/i }));
    fireEvent.change(screen.getByLabelText(/task title/i), { target: { value: "Prepare the opening" } });
    fireEvent.click(screen.getByRole("button", { name: /create my task/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const request = fetchMock.mock.calls[1];
    expect(request[0]).toBe("/api/mobile/capture/transcripts/tasks");
    expect(JSON.parse(request[1].body)).toMatchObject({
      roomId: "room-1",
      segmentId: "segment-1",
      expectedProviderTextSha256: "a".repeat(64),
      title: "Prepare the opening",
      surface: "nest-session-transcript-review",
    });
  });

  it("starts a private writing page with the same immutable transcript identity", async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => desk(true) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, idempotentReplay: false, document: { id: "document-1", title: "Episode opening", href: "/create?project=high-ground&document=document-1&block=draft-block" } }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<TranscriptCorrectionDesk roomId="room-1" />);
    await screen.findByText("Welcome, everybody.");
    fireEvent.click(screen.getByRole("button", { name: /start source-linked draft/i }));
    fireEvent.change(screen.getByLabelText(/page title/i), { target: { value: "Episode opening" } });
    fireEvent.change(screen.getByLabelText(/starting thought/i), { target: { value: "This is why the story matters." } });
    fireEvent.click(screen.getByRole("button", { name: /create source-linked draft/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const request = fetchMock.mock.calls[1];
    expect(request[0]).toBe("/api/mobile/capture/transcripts/drafts");
    expect(JSON.parse(request[1].body)).toMatchObject({
      roomId: "room-1",
      segmentId: "segment-1",
      expectedProviderTextSha256: "a".repeat(64),
      title: "Episode opening",
      openingNote: "This is why the story matters.",
      surface: "nest-session-transcript-review",
    });
    expect(await screen.findByRole("link", { name: "Open source-linked draft" })).toHaveAttribute("href", "/create?project=high-ground&document=document-1&block=draft-block");
    expect(screen.getByText(/source recording and transcript remain unchanged/i)).toBeInTheDocument();
  });
});
