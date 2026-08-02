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
  words: [
    {
      id: "word-1",
      providerWordIndex: 0,
      startSeconds: 3.66,
      endSeconds: 4.02,
      word: "welcome",
      punctuatedWord: "Welcome,",
      confidence: 0.9,
      speakerLabel: "Speaker",
      channel: 0,
    },
    {
      id: "word-2",
      providerWordIndex: 1,
      startSeconds: 4.08,
      endSeconds: 4.84,
      word: "everybody",
      punctuatedWord: "everybody.",
      confidence: 0.8,
      speakerLabel: "Speaker",
      channel: 0,
    },
  ],
  acceptedCorrection: null,
  acceptedVerification: null,
  proposals: [],
  correctionHistory: [],
};

function desk(playback: boolean) {
  return {
    ok: true,
    roomId: "room-1",
    transcriptJobId: "job-1",
    transcriptStatus: "COMPLETED",
    processing: {
      status: "COMPLETED",
      message: null,
      wordCount: 2,
      sourceBound: true,
      executionRequestedAt: "2026-07-30T18:30:00.000Z",
      resultReceived: true,
      providerReceiptReceived: true,
      workerBuildId: "build-1",
    },
    gate: { allowed: true },
    recording: {
      id: "asset-1",
      status: "VERIFIED",
      kind: "LOCAL_AUDIO",
      fileName: "session.wav",
      durationSeconds: 120,
      eligibleForProtectedPlaybackPreparation: true,
    },
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

  it("prepares protected playback through the canonical recording handoff", async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => desk(false) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, message: "Verified recording is now available as Quipsly media." }) })
      .mockResolvedValueOnce({ ok: true, json: async () => desk(true) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<TranscriptCorrectionDesk roomId="room-1" />);
    fireEvent.click(await screen.findByRole("button", { name: /prepare protected playback/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[1][0]).toBe("/api/mobile/capture/recordings/promote");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ recordingAssetId: "asset-1" });
    expect(await screen.findByLabelText("Protected session recording")).toBeInTheDocument();
  });

  it("records a playback-backed reviewed-as-is decision without fabricating a correction", async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => desk(true) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, idempotentReplay: false, verification: { id: "verification-1" } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        ...desk(true),
        segments: [{
          ...segment,
          acceptedVerification: { id: "verification-1", segmentId: "segment-1", reviewKind: "confirmed-as-is", reviewedAt: "2026-08-01T23:30:00.000Z" },
        }],
      }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<TranscriptCorrectionDesk roomId="room-1" />);
    await screen.findByText("Welcome, everybody.");
    fireEvent.click(screen.getByRole("button", { name: /play transcript segment/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm correct as heard/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      operation: "confirm-segment-as-is",
      roomId: "room-1",
      segmentId: "segment-1",
      expectedText: "Welcome, everybody.",
      expectedSpeakerLabel: "Speaker",
      expectedAcceptedCorrectionId: null,
      confirmedAgainstPlayback: true,
      playbackPositionSeconds: 3.66,
    });
    expect(await screen.findByText(/reviewed as heard/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /confirm correct as heard/i })).not.toBeInTheDocument();
  });

  it("opens precise word anchors and seeks protected playback to the selected word", async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => desk(true) })) as unknown as typeof fetch;
    render(<TranscriptCorrectionDesk roomId="room-1" />);
    await screen.findByText("Welcome, everybody.");
    fireEvent.click(screen.getByText(/precise word timing/i));
    const wordButton = screen.getByRole("button", { name: /play everybody.*00:04/i });
    fireEvent.click(wordButton);
    const media = screen.getByLabelText("Protected session recording") as HTMLMediaElement;
    expect(media.currentTime).toBe(4.08);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
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

  it("saves a deliberate client-safe Session note with the exact transcript identity", async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => desk(true) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        ok: true,
        idempotentReplay: false,
        note: { id: "note-1", title: "Coaching insight", href: "/sessions/room-1?mode=notes" },
      }) })
      .mockResolvedValueOnce({ ok: true, json: async () => desk(true) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<TranscriptCorrectionDesk roomId="room-1" />);
    await screen.findByText("Welcome, everybody.");
    fireEvent.click(screen.getByRole("button", { name: /save as session note/i }));
    fireEvent.change(screen.getByLabelText(/note title/i), { target: { value: "Coaching insight" } });
    fireEvent.change(screen.getByLabelText(/^note$/i), { target: { value: "Ask what support would make the next step realistic." } });
    fireEvent.change(screen.getByLabelText(/purpose/i), { target: { value: "DECISION" } });
    fireEvent.change(screen.getByLabelText(/audience/i), { target: { value: "CLIENT_SAFE" } });
    expect(screen.getByText(/eligible for a reviewed client follow-up.*not sent automatically/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /save source-linked note/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const request = fetchMock.mock.calls[1];
    expect(request[0]).toBe("/api/mobile/capture/transcripts/notes");
    expect(JSON.parse(request[1].body)).toMatchObject({
      roomId: "room-1",
      segmentId: "segment-1",
      expectedProviderTextSha256: "a".repeat(64),
      title: "Coaching insight",
      body: "Ask what support would make the next step realistic.",
      kind: "DECISION",
      visibility: "CLIENT_SAFE",
      surface: "nest-session-transcript-review",
    });
    expect(await screen.findByRole("link", { name: /open session notes/i })).toHaveAttribute("href", "/sessions/room-1?mode=notes");
    expect(screen.getByText(/audience can be revised later without losing the source or revision history/i)).toBeInTheDocument();
  });

  it("only offers production-team note choices when the Session grants that authority", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => desk(true) });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { rerender } = render(<TranscriptCorrectionDesk roomId="room-1" />);
    await screen.findByText("Welcome, everybody.");
    fireEvent.click(screen.getByRole("button", { name: /save as session note/i }));
    expect(screen.queryByRole("option", { name: "Production note" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Project team" })).not.toBeInTheDocument();

    rerender(<TranscriptCorrectionDesk roomId="room-1" canUseProjectTeamNotes />);
    expect(screen.getByRole("option", { name: "Production note" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Project team" })).toBeInTheDocument();
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
