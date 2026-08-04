/** @jest-environment jsdom */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { TranscriptCorrectionDesk } from "./transcript-correction-desk";
import { buildAudioTranscriptEvidence } from "@/lib/transcript-evidence";

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

  it("identifies a diarized voice once without presenting its words as reviewed", async () => {
    const providerSnapshotSha256 = "b".repeat(64);
    const speakerDesk = {
      ...desk(true),
      participants: [{ id: "participant-1", userId: "user-2", displayLabel: "Scott Sparrow", role: "GUEST", isCurrentActor: false }],
      speakerGroups: [{
        providerSpeakerLabel: "Speaker",
        turnCount: 7,
        providerSnapshotSha256,
        attribution: null,
        staleAttribution: false,
        samples: [{ segmentId: "segment-1", startSeconds: 3.66, endSeconds: 4.84, text: "Welcome, everybody." }],
      }],
    };
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => speakerDesk })
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        ok: true,
        attribution: {
          id: "attribution-1",
          providerSpeakerLabel: "Speaker",
          participantId: "participant-1",
          attributedLabel: "Scott Sparrow",
        },
      }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...speakerDesk, segments: [{ ...segment, speakerLabel: "Scott Sparrow", speakerAttribution: { id: "attribution-1", attributedLabel: "Scott Sparrow" } }] }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<TranscriptCorrectionDesk roomId="room-1" />);
    await screen.findByText("Identify a voice once");
    expect(screen.getByText(/does not mark those words playback-reviewed/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^participant$/i), { target: { value: "participant-1" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /play speaker sample from 00:03/i }));
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /recognize this voice/i }));
    fireEvent.click(screen.getByRole("button", { name: /apply voice identity/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      operation: "attribute-provider-speaker",
      roomId: "room-1",
      providerSpeakerLabel: "Speaker",
      participantId: "participant-1",
      expectedProviderSnapshotSha256: providerSnapshotSha256,
      samples: [{ segmentId: "segment-1", playbackPositionSeconds: 3.66 }],
      confirmedAgainstPlayback: true,
    });
    expect(await screen.findByText(/speaker is now identified as scott sparrow.*word review remains unchanged/i)).toBeInTheDocument();
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

  it("classifies and explicitly freezes a fully reviewed private accuracy window", async () => {
    const evaluation = {
      schema: "quipsly-transcript-evaluation-window-v1",
      eligible: true,
      canApprove: true,
      suggestedWorkload: "podcast",
      sourceDurationSeconds: 60,
      sourceSha256: "a".repeat(64),
      reviewedSegmentCount: 1,
      totalSegmentCount: 1,
      referenceWordCount: 2,
      timingEvidenceWordCount: 2,
      speakerReviewedWordCount: 2,
      availableSegments: [{ id: "segment-1", startSeconds: 0, endSeconds: 60, reviewed: true }],
      suggestedRange: { startSegmentId: "segment-1", endSegmentId: "segment-1", startSeconds: 0, endSeconds: 60, durationSeconds: 60, segmentIds: ["segment-1"] },
      blockers: [],
      conditions: {
        podcast: ["normal-exchange", "overlap-or-interruption"],
        coaching: ["coach-client-turn-taking"],
      },
      approvedWindows: [],
    };
    const readyDesk = { ...desk(true), evaluation };
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => readyDesk })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, idempotentReplay: false, window: { id: "window-1" } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...readyDesk, evaluation: { ...evaluation, approvedWindows: [{ id: "window-1", workload: "podcast", conditions: ["normal-exchange"], sourceDurationSeconds: 60, referenceWordCount: 2, referenceRevisionId: "reviewed-reference-1", approvedAt: "2026-08-03T18:30:00.000Z", staleAgainstCurrentReview: false }], candidates: [{ id: "candidate-1", windowId: "window-1", runKey: "run-1", providerKey: "openai-diarized", providerName: "OpenAI diarized transcription", model: "gpt-4o-transcribe-diarize", adapterVersion: "adapter-v1", inputMediaSha256: "7".repeat(64), speakerAttribution: "segment", timingGranularity: "unavailable", outcome: "succeeded", elapsedMilliseconds: 2345, estimatedCostUsd: 0.004, metrics: { words: { wordErrorRate: 0.05, wordErrorCount: 1, referenceWordCount: 20 }, speakers: { speakerErrorRate: 0.02 }, timing: { p95AbsoluteStartDriftMilliseconds: null } }, errorCode: null, retryable: null, policyReceiptSha256: "f".repeat(64), correctionObservationCount: 1, completedAt: "2026-08-03T18:31:00.000Z" }] } }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<TranscriptCorrectionDesk roomId="room-1" />);
    expect(await screen.findByText("Build accuracy truth from real listening")).toBeInTheDocument();
    const media = screen.getByLabelText("Protected session recording");
    Object.defineProperty(media, "paused", { configurable: true, value: false });
    Object.defineProperty(media, "duration", { configurable: true, value: 60 });
    for (let second = 0; second < 60; second += 1) {
      Object.defineProperty(media, "currentTime", { configurable: true, value: second + 0.25 });
      fireEvent.timeUpdate(media);
    }
    fireEvent.click(screen.getByRole("checkbox", { name: /normal exchange/i }));
    fireEvent.click(screen.getByRole("button", { name: /add to private accuracy corpus/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      operation: "approve-evaluation-window",
      roomId: "room-1",
      workload: "podcast",
      conditions: ["normal-exchange"],
      startSegmentId: "segment-1",
      endSegmentId: "segment-1",
      sourcePlaybackEvidence: expect.objectContaining({
        schema: "quipsly-window-playback-v1",
        playbackSourceId: "source-1",
        startSeconds: 0,
        endSeconds: 60,
        durationSeconds: 60,
        listenedSecondBins: Array.from({ length: 60 }, (_, index) => index),
      }),
    });
    expect(await screen.findByText(/matches current review/i)).toBeInTheDocument();
    expect(screen.getByText("Provider evidence scorecards")).toBeInTheDocument();
    expect(screen.getByText("OpenAI diarized transcription")).toBeInTheDocument();
    expect(screen.getByText("5.0%")).toBeInTheDocument();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.getByText(/input 7777777777/i)).toBeInTheDocument();
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

  it("separates provider confidence, measured accuracy, and review coverage", async () => {
    const evidence = buildAudioTranscriptEvidence({
      provider: "deepgram",
      providerModel: "nova-3",
      language: "en-US",
      recordingDurationSeconds: 60,
      sourceProfile: {
        container: "wav",
        codec: "pcm",
        includesAudio: true,
        audioSampleRate: 48_000,
        audioChannelCount: 1,
        audioRouteName: "Shure MV7i",
        audioRoutePortType: "USBAudio",
        recordedMedia: { audioTrackCount: 1, audioSampleRate: 48_000, audioChannelCount: 1 },
        audioSignal: {
          schemaVersion: 1,
          algorithm: "quipsly-audio-signal-window-v1",
          sampleRate: 48_000,
          channelCount: 1,
          analyzedFrameCount: 2_880_000,
          durationSeconds: 60,
          windowDurationSeconds: 10,
          rmsDbfs: -20,
          samplePeakDbfs: -0.8,
          clippedFrameCount: 3,
          clippedFrameFraction: 0.000001,
          nearSilentFrameFraction: 0.12,
          leftRmsDbfs: -20,
          rightRmsDbfs: null,
          stereoBalanceDb: null,
          signalStatus: "attention",
          thresholds: {
            clippingAmplitude: 0.999,
            nearSilenceDbfs: -72,
            possibleDropoutMinimumSeconds: 0.25,
            surroundingSignalDbfs: -45,
            stereoImbalanceDb: 12,
          },
          waveform: [
            { startSeconds: 0, durationSeconds: 10, rmsDbfs: -18, samplePeakDbfs: -0.8, clippedFrameCount: 3 },
            { startSeconds: 10, durationSeconds: 10, rmsDbfs: -80, samplePeakDbfs: -76, clippedFrameCount: 0 },
            { startSeconds: 20, durationSeconds: 40, rmsDbfs: -22, samplePeakDbfs: -3, clippedFrameCount: 0 },
          ],
          observations: [{
            kind: "possible-dropout",
            severity: "attention",
            startSeconds: 10,
            endSeconds: 20,
            detail: "Near-silent interval surrounded by measurable signal; listen before classifying.",
          }],
        },
      },
      recordingStartedAt: "2026-08-03T18:00:00.000Z",
      recordingSegments: [{
        startedAt: "2026-08-03T18:00:00.000Z",
        stoppedAt: "2026-08-03T18:00:08.000Z",
        durationSeconds: 8,
        stopReason: "interruption",
        boundaryDetail: "active-audio-route-unavailable",
        boundaryAudioRouteName: "Shure MV7i",
        boundaryAudioRoutePortType: "USBAudio",
      }],
      segments: [{
        ...segment,
        text: "Welcome, everyone.",
        acceptedCorrection: { id: "correction-1" },
        acceptedVerification: null,
      }],
      speakerGroups: [{ attribution: null }],
    });
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ...desk(true), evidence }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<TranscriptCorrectionDesk roomId="room-1" />);

    expect(await screen.findByRole("heading", { name: /what quipsly heard/i })).toBeInTheDocument();
    expect(screen.getByText("85.0%", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText(/50\.0% WER/i)).toBeInTheDocument();
    expect(screen.getByText(/provider confidence helps prioritize listening; it is not measured accuracy/i)).toBeInTheDocument();
    expect(screen.getByText(/1 corrected · 0 confirmed · 0 unchecked/i)).toBeInTheDocument();
    expect(screen.getAllByText(/shure mv7i/i)).not.toHaveLength(0);
    expect(screen.getByText(/decoded signal scan/i)).toBeInTheDocument();
    expect(screen.getByText(/RMS dBFS is not perceptual LUFS/i)).toBeInTheDocument();
    expect(screen.getByText(/measurable signal continues after the last timed transcript word/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /audio evidence map/i })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: /selected time/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /play selected time/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /00:10 · Possible Dropout/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /00:08 · Interruption/i })).toBeInTheDocument();
  });
});
