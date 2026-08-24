/** @jest-environment jsdom */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import {
  reviewedTranscriptFileName,
  reviewedTranscriptText,
  TranscriptCorrectionDesk,
} from "./transcript-correction-desk";
import { buildAudioTranscriptEvidence } from "@/lib/transcript-evidence";

const segment: any = {
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
  downstreamImpacts: [],
};

function desk(playback: boolean) {
  return {
    ok: true,
    roomId: "room-1",
    roomPurpose: "COACHING",
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
      routing: null,
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

async function markProtectedPlaybackReady() {
  const media = await screen.findByLabelText("Protected session recording");
  fireEvent.loadedMetadata(media);
  return media as HTMLMediaElement;
}

describe("TranscriptCorrectionDesk", () => {
  it("exports effective text while preserving reviewed versus provider-only truth", () => {
    const text = reviewedTranscriptText({
      title: "Coaching Session 9",
      transcriptJobId: "job-reviewed-123456789",
      segments: [
        { ...segment, speakerLabel: "Client", text: "I will bring the evidence.", acceptedVerification: { id: "verification-1" } },
        { ...segment, startSeconds: 8, endSeconds: 10, speakerLabel: null, text: "What would make that repeatable?" },
      ],
    });

    expect(reviewedTranscriptFileName("Coaching Session 9", "job-reviewed-123456789")).toBe(
      "coaching-session-9-transcript-job-review.txt",
    );
    expect(text).toContain("Playback-reviewed turns: 1/2");
    expect(text).toContain("Client (playback-reviewed)");
    expect(text).toContain("Speaker not attributed (provider-only)");
    expect(text).toContain("I will bring the evidence.");
    expect(text).toContain("Provider evidence remains immutable");
  });

  it("offers a conventional mentor report download inside a coaching Session", async () => {
    const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: jest.fn(() => "blob:mentor-report") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: jest.fn() });
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => desk(true) })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "Content-Disposition": "attachment; filename*=UTF-8''20260823%20Coaching%20Transcript.docx" }),
        blob: async () => new Blob(["PK synthetic"], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<TranscriptCorrectionDesk roomId="room-1" sessionTitle="Coaching Session" />);
    fireEvent.click(await screen.findByRole("button", { name: /mentor report/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1][0]).toBe("/api/sessions/room-1/transcript-report");
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/mentor transcript downloaded/i)).toBeInTheDocument();
  });

  beforeEach(() => {
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: jest.fn(async () => undefined),
    });
    Object.defineProperty(HTMLMediaElement.prototype, "readyState", {
      configurable: true,
      get: () => 1,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    window.history.replaceState(null, "", window.location.pathname);
  });

  it("opens audio evidence automatically from a recording-health deep link", async () => {
    window.history.replaceState(null, "", "#transcript-audio-review");
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => desk(true) })) as unknown as typeof fetch;

    render(<TranscriptCorrectionDesk roomId="room-1" />);

    const qualityToggle = await screen.findByRole("button", { name: /audio, timing, and accuracy/i });
    await waitFor(() => expect(qualityToggle).toHaveAttribute("aria-expanded", "true"));
    expect(document.getElementById("transcript-audio-review")).toBeInTheDocument();
  });

  it("sends the exact room, provider evidence, and played media position when a reviewer accepts", async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => desk(true) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, idempotentReplay: false }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...desk(true), segments: [{ ...segment, speakerLabel: "Charlie" }] }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<TranscriptCorrectionDesk roomId="room-1" />);
    await screen.findByText("Welcome, everybody.");
    await markProtectedPlaybackReady();
    expect(document.getElementById("transcript-segment-segment-1")).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Correct transcript" })); });
    await screen.findByText(/recording checked from 00:03/i);
    expect(screen.queryByRole("checkbox", { name: /listened/i })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/correct speaker/i), { target: { value: "Charlie" } });
    fireEvent.click(screen.getByRole("button", { name: /save transcript correction/i }));

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

  it("explains source identity, model movement, diarization, and vocabulary from the manifest receipt", async () => {
    const routed = desk(true);
    (routed.processing as any).routing = {
      sourceTopology: "participant-isolated",
      participantLabel: "Scott Sparrow",
      speakerAuthority: "source-binding",
      provider: "deepgram",
      model: "nova-3@latest",
      modelRevisionPolicy: "moving-latest",
      language: "en-US",
      diarizationRequested: false,
      timingGranularity: "word",
      terminologySnapshotSha256: "b".repeat(64),
      terminologyKeytermCount: 7,
      manifestBacked: true,
      providerOutputRemainsImmutable: true,
    };
    routed.segments = [{
      ...segment,
      speakerLabel: "Scott Sparrow",
      speakerAuthority: "source-binding",
      sourceBoundParticipantId: "participant-scott",
    }];
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => routed })) as unknown as typeof fetch;

    render(<TranscriptCorrectionDesk roomId="room-1" />);
    const summary = await screen.findByText("Transcription details");
    fireEvent.click(summary);
    expect(screen.getByText(/scott sparrow owns this isolated source/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Participant recording\. This speaker comes from that participant's isolated recording\./i)).toBeInTheDocument();
    expect(screen.queryByText("participant-scott")).not.toBeInTheDocument();
    expect(screen.getByText(/nova-3@latest.*moving latest/i)).toBeInTheDocument();
    expect(screen.getByText(/source binding.*diarization off/i)).toBeInTheDocument();
    expect(screen.getByText("7 frozen keyterms")).toBeInTheDocument();
  });

  it("shows source-linked work that needs deliberate review after a correction", async () => {
    const impacted = desk(true);
    impacted.segments = [{
      ...segment,
      downstreamImpacts: [
        {
          artifactId: "note-1",
          artifactKind: "note",
          label: "Episode delivery plan",
          status: "SESSION_SHARED",
          href: "/sessions/room-1?mode=notes#session-note-note-1",
          artifactUpdatedAt: "2026-08-06T18:00:00.000Z",
          canAcknowledge: true,
          state: "needs-review",
          evidenceSnapshotCount: 1,
          priorTextSnapshot: "Publish on Wednesday.",
          currentTextSnapshot: "Publish on Thursday.",
          priorSpeakerLabelSnapshot: "Charlie",
          currentSpeakerLabel: "Charlie",
          evidenceCorrectionId: null,
          currentCorrectionId: "correction-1",
          changes: { text: "changed", speaker: "unchanged", correctionReceipt: "changed" },
        },
        {
          artifactId: "task-1",
          artifactKind: "task",
          label: "Fix chapter title",
          status: "OPEN",
          href: "/work?task=task-1",
          artifactUpdatedAt: "2026-08-06T18:01:00.000Z",
          canAcknowledge: true,
          state: "current",
          evidenceSnapshotCount: 2,
          priorTextSnapshot: "Welcome, everybody.",
          currentTextSnapshot: "Welcome, everybody.",
          priorSpeakerLabelSnapshot: "Speaker",
          currentSpeakerLabel: "Speaker",
          evidenceCorrectionId: null,
          currentCorrectionId: null,
          changes: { text: "unchanged", speaker: "unchanged", correctionReceipt: "unchanged" },
        },
      ],
    }];
    const fetchMock = jest.fn(async (..._args: any[]) => ({ ok: true, json: async () => impacted }));
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<TranscriptCorrectionDesk roomId="room-1" />);
    const summary = await screen.findByText("Downstream evidence · 2 linked items");
    fireEvent.click(summary);
    expect(screen.getByText(/note · episode delivery plan/i)).toBeInTheDocument();
    expect(screen.getByText(/task · fix chapter title/i)).toBeInTheDocument();
    expect(screen.getByText("review after correction")).toBeInTheDocument();
    expect(screen.getByText("current evidence")).toBeInTheDocument();
    expect(screen.getByText("Publish on Wednesday.")).toBeInTheDocument();
    expect(screen.getByText("Publish on Thursday.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /note · episode delivery plan/i })).toHaveAttribute("href", "/sessions/room-1?mode=notes#session-note-note-1");
    expect(screen.getByText(/automatic regeneration is off/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /read the corrected source/i }));
    fireEvent.click(screen.getByRole("button", { name: /keep item as written/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      operation: "acknowledge-transcript-impact",
      roomId: "room-1",
      transcriptJobId: "job-1",
      segmentId: "segment-1",
      artifactKind: "note",
      artifactId: "note-1",
      expectedArtifactUpdatedAt: "2026-08-06T18:00:00.000Z",
      expectedAcceptedCorrectionId: "correction-1",
      expectedEffectiveText: "Publish on Thursday.",
      expectedEffectiveSpeakerLabel: "Charlie",
      confirmedContentStillValid: true,
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
    const voiceLabels = await screen.findByRole("button", { name: /name the voices/i });
    await waitFor(() => expect(voiceLabels).toHaveAttribute("aria-expanded", "true"));
    await screen.findByText("Who is speaking?");
    expect(document.getElementById("speaker-attribution-review")).toBeInTheDocument();
    expect(screen.getByText(/use that name for the matching voice throughout this Session/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^person$/i), { target: { value: "participant-1" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /play speaker sample from 00:03/i })); });
    expect(await screen.findByText(/sample played/i)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /recognize this voice/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /save name/i }));

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
    expect(await screen.findByText(/scott sparrow is now used for this voice throughout the session/i)).toBeInTheDocument();
  });

  it("unlocks an AI correction proposal from observed playback without another checkbox", async () => {
    const proposalDesk = desk(true);
    proposalDesk.segments = [{
      ...segment,
      proposals: [{
        id: "proposal-1",
        segmentId: "segment-1",
        origin: "ai",
        status: "proposed",
        correctedText: "Welcome, everyone.",
        correctedSpeakerLabel: null,
        reason: "Possible wording correction",
        reviewedAt: null,
        createdAt: "2026-08-22T00:00:00.000Z",
        updatedAt: "2026-08-22T00:00:00.000Z",
        revisions: [],
      }],
    }];
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => proposalDesk })) as unknown as typeof fetch;

    render(<TranscriptCorrectionDesk roomId="room-1" />);
    await screen.findByText("Welcome, everyone.");
    await markProtectedPlaybackReady();
    const accept = screen.getByRole("button", { name: "Accept correction" });
    expect(accept).toBeDisabled();

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Play timestamp" })); });

    expect(await screen.findByText(/recording checked from 00:03/i)).toBeInTheDocument();
    expect(accept).toBeEnabled();
    expect(screen.queryByRole("checkbox", { name: /verified the proposal/i })).not.toBeInTheDocument();
  });

  it("loads an explicitly focused RecordingAsset without room-latest fallback", async () => {
    const fetchMock = jest.fn(async () => ({ ok: true, json: async () => desk(true) }));
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<TranscriptCorrectionDesk roomId="room-1" recordingAssetId="asset-backup" />);
    await screen.findByText("Welcome, everybody.");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/mobile/capture/transcripts/corrections?callRoomId=room-1&recordingAssetId=asset-backup",
      { cache: "no-store" },
    );
  });

  it("keeps correction controls disabled when no protected playback exists", async () => {
    const unavailable = desk(false);
    unavailable.recording.eligibleForProtectedPlaybackPreparation = false;
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => unavailable })) as unknown as typeof fetch;
    render(<TranscriptCorrectionDesk roomId="room-1" />);
    const button = await screen.findByRole("button", { name: "Correct transcript" });
    expect(button).toBeDisabled();
    expect(screen.getByText(/recording still needs attention/i)).toBeInTheDocument();
  });

  it("revokes playback authority when protected source bytes fail to load", async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => desk(true) })) as unknown as typeof fetch;
    render(<TranscriptCorrectionDesk roomId="room-1" />);
    const media = await markProtectedPlaybackReady();
    expect(screen.getByRole("button", { name: "Correct transcript" })).toBeEnabled();

    fireEvent.error(media);

    expect(screen.getByRole("button", { name: "Correct transcript" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/historical review receipts remain visible/i);
  });

  it("makes a verified recording playable automatically", async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => desk(false) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, message: "Verified recording is now available as Quipsly media." }) })
      .mockResolvedValueOnce({ ok: true, json: async () => desk(true) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<TranscriptCorrectionDesk roomId="room-1" />);

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
    await screen.findByRole("heading", { name: "Transcript" });
    fireEvent.click(screen.getByRole("button", { name: /audio, timing, and accuracy/i }));
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

  it("queues a visible matched run without claiming that the worker is running", async () => {
    const approvedEvaluation = {
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
      conditions: { podcast: ["normal-exchange"], coaching: ["coach-client-turn-taking"] },
      approvedWindows: [{
        id: "window-1",
        workload: "podcast",
        conditions: ["normal-exchange"],
        sourceDurationSeconds: 60,
        referenceWordCount: 2,
        criticalTermOccurrenceCount: 1,
        referenceRevisionId: "reviewed-reference-1",
        approvedAt: "2026-08-06T18:30:00.000Z",
        staleAgainstCurrentReview: false,
      }],
      candidates: [],
    };
    const queuedRun = {
      id: "run-1",
      runKey: "terminology-run-1",
      providerName: "OpenAI Whisper local",
      model: "large-v3-turbo",
      status: "QUEUED",
      attemptCount: 0,
      maxAttempts: 3,
      leaseOwner: null,
      leaseExpiresAt: null,
      errorCode: null,
      errorMessage: null,
      createdAt: "2026-08-06T19:00:00.000Z",
      completedAt: null,
      windows: [{ id: "run-window-1", windowId: "window-1", status: "QUEUED", baselineCandidateId: null, terminologyCandidateId: null, derivativeSha256: null }],
    };
    let queued = false;
    const fetchMock = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const target = String(url);
      if (target.includes("view=runs")) return { ok: true, json: async () => ({ ok: true, runs: queued ? [queuedRun] : [] }) } as Response;
      if (target === "/api/transcript-evaluation" && init?.method === "POST") {
        queued = true;
        return { ok: true, json: async () => ({ ok: true, run: queuedRun }) } as Response;
      }
      return { ok: true, json: async () => ({ ...desk(true), evaluation: approvedEvaluation }) } as Response;
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<TranscriptCorrectionDesk roomId="room-1" />);
    await screen.findByRole("heading", { name: "Transcript" });
    fireEvent.click(screen.getByRole("button", { name: /audio, timing, and accuracy/i }));
    expect(await screen.findByText("Matched experiment queue")).toBeInTheDocument();
    expect(screen.getByText(/queued is not running/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /queue matched local run/i }));

    await screen.findByText("OpenAI Whisper local · large-v3-turbo");
    const post = fetchMock.mock.calls.find((call) => String(call[0]) === "/api/transcript-evaluation" && call[1]?.method === "POST");
    expect(post).toBeDefined();
    expect(JSON.parse(post![1]!.body as string)).toMatchObject({
      operation: "queue-terminology-run",
      roomId: "room-1",
      windowIds: ["window-1"],
      model: "large-v3-turbo",
      language: "en",
    });
    expect(screen.getByText(/queued/i, { selector: "span" })).toBeInTheDocument();
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
    await markProtectedPlaybackReady();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /play transcript segment/i })); });
    fireEvent.click(await screen.findByRole("button", { name: /mark correct/i }));

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
    expect(screen.queryByRole("button", { name: /mark correct/i })).not.toBeInTheDocument();
  });

  it("opens precise word anchors and seeks protected playback to the selected word", async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => desk(true) })) as unknown as typeof fetch;
    render(<TranscriptCorrectionDesk roomId="room-1" />);
    await screen.findByText("Welcome, everybody.");
    await markProtectedPlaybackReady();
    fireEvent.click(screen.getByText(/precise word timing/i));
    const wordButton = screen.getByRole("button", { name: /play everybody.*00:04/i });
    await act(async () => { fireEvent.click(wordButton); });
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
    await markProtectedPlaybackReady();
    fireEvent.click(screen.getByText("Create from this moment"));
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

  it("opens coaching recording edits in the transcript surface", async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => desk(true) })) as unknown as typeof fetch;

    render(<TranscriptCorrectionDesk roomId="room-1" canEditRecording recordingEditor={<div>Inline recording editor</div>} />);

    const edit = await screen.findByRole("button", { name: "Trim or cut recording" });
    expect(screen.queryByText("Inline recording editor")).not.toBeInTheDocument();
    fireEvent.click(edit);
    expect(screen.getByText("Inline recording editor")).toBeInTheDocument();
    expect(edit).toHaveAttribute("aria-expanded", "true");
  });

  it("opens the recording editor on the exact transcript passage", async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => desk(true) })) as unknown as typeof fetch;

    render(<TranscriptCorrectionDesk
      roomId="room-1"
      canEditRecording
      recordingEditor={(focus) => <div>Focused recording passage: {focus?.segmentId || "none"}</div>}
    />);

    await screen.findByText("Welcome, everybody.");
    expect(screen.queryByText(/focused recording passage/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit recording here" }));
    expect(screen.getByText("Focused recording passage: segment-1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close recording editor" })).toHaveAttribute("aria-expanded", "true");
  });

  it("offers standard transcript and recording-plus-transcript workspaces without leaving the page", async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => desk(true) })) as unknown as typeof fetch;

    render(<TranscriptCorrectionDesk roomId="room-1" />);

    const transcriptOnly = await screen.findByRole("button", { name: "Transcript" });
    const sideBySide = screen.getByRole("button", { name: "Recording + transcript" });
    expect(transcriptOnly).toHaveAttribute("aria-pressed", "true");
    expect(sideBySide).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByLabelText("Protected session recording")).toBeInTheDocument();
    expect(screen.getByText("Welcome, everybody.")).toBeInTheDocument();

    fireEvent.click(sideBySide);
    expect(sideBySide).toHaveAttribute("aria-pressed", "true");
    expect(transcriptOnly).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByLabelText("Protected session recording")).toBeInTheDocument();
    expect(screen.getByText("Welcome, everybody.")).toBeInTheDocument();
  });

  it("keeps automatic audio improvement beside transcript review", async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => desk(true) })) as unknown as typeof fetch;

    render(<TranscriptCorrectionDesk roomId="room-1" audioMastery={<div>Automatic spoken-word audio check</div>} />);

    await screen.findByText("Welcome, everybody.");
    expect(screen.getByRole("region", { name: "Session audio improvement" })).toHaveTextContent("Automatic spoken-word audio check");
    expect(screen.getByRole("heading", { name: "Transcript" })).toBeInTheDocument();
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
    await markProtectedPlaybackReady();
    fireEvent.click(screen.getByText("Create from this moment"));
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
    await markProtectedPlaybackReady();
    fireEvent.click(screen.getByText("Create from this moment"));
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
    await markProtectedPlaybackReady();
    fireEvent.click(screen.getByText("Create from this moment"));
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
    const correctedSegment = {
      ...segment,
      text: "Welcome, everyone.",
      acceptedCorrection: {
        id: "correction-1",
        segmentId: segment.id,
        origin: "human",
        status: "accepted",
        correctedText: "Welcome, everyone.",
        correctedSpeakerLabel: null,
        reason: "Reviewed against playback.",
        reviewedAt: "2026-08-03T18:30:00.000Z",
        createdAt: "2026-08-03T18:30:00.000Z",
        updatedAt: "2026-08-03T18:30:00.000Z",
        revisions: [{ revision: 1, operation: "accepted", createdAt: "2026-08-03T18:30:00.000Z" }],
      },
      acceptedVerification: null,
    };
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ...desk(true), segments: [correctedSegment], evidence }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<TranscriptCorrectionDesk roomId="room-1" />);

    expect(await screen.findByRole("heading", { name: "Transcript" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /what quipsly heard/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /audio, timing, and accuracy/i }));
    expect(await screen.findByRole("heading", { name: /what quipsly heard/i })).toBeInTheDocument();
    expect(screen.getByText("85.0%", { selector: "p" })).toBeInTheDocument();
    expect(screen.getAllByText(/50\.0% WER/i)).toHaveLength(2);
    expect(screen.getByText(/provider confidence helps prioritize listening; it is not measured accuracy/i)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Measured transcript error contributors" })).toHaveTextContent(/1\/2 word edits in this reviewed reference/i);
    expect(screen.getByText(/1 corrected · 0 confirmed · 0 unchecked/i)).toBeInTheDocument();
    expect(screen.getAllByText(/shure mv7i/i)).not.toHaveLength(0);
    expect(screen.getByText(/decoded signal scan/i)).toBeInTheDocument();
    expect(screen.getByText(/RMS dBFS is not perceptual LUFS/i)).toBeInTheDocument();
    expect(screen.getByText(/measurable signal continues after the last timed transcript word/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /audio level evidence map/i })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: /selected time/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /play selected time/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /00:10 · Possible Dropout/i })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /00:08 · Interruption/i })).toHaveLength(2);

    const protectedAudio = screen.getByLabelText("Protected session recording");
    Object.defineProperty(protectedAudio, "currentTime", { configurable: true, value: 3.8, writable: true });
    fireEvent.timeUpdate(protectedAudio);
    expect(await screen.findByRole("region", { name: "Selected transcript word evidence" })).toHaveTextContent("Welcome,");
    expect(screen.getByText(/Deepgram confidence 90%/i)).toBeInTheDocument();
    expect(screen.getByText(/provider word inside a playback-corrected segment; timing remains provider evidence/i)).toBeInTheDocument();
  });
});
