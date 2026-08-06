import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { EpisodeAudioMixDesk } from "./EpisodeAudioMixDesk";

describe("EpisodeAudioMixDesk", () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; jest.useRealTimers(); });
  it("queues a reversible mix proposal and explains held judgments", async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true, status: "not-queued", jobId: null, actionCount: 0, unresolvedCount: 0 }) })
      .mockResolvedValueOnce({ ok: true, status: 202, json: async () => ({ ok: true, status: "queued", jobId: "mix_0001", proposalId: "mix_0001", programFingerprintSha256: "f".repeat(64), actionCount: 1, unresolvedCount: 2 }) });
    global.fetch = fetchMock;
    render(<EpisodeAudioMixDesk projectId="project_0001" projectSlug="nest-one" episodeProductionId="episode_0001" programFingerprintSha256={"f".repeat(64)} canWrite eligible eligibilityDetail="Ready" />);
    expect(await screen.findByText("Automatic, inspectable, undoable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Build mix proposal" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/Proposed 1 evidence-linked gain move/)).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "POST" });
  });
  it("keeps queueing unreachable when the canonical program is incomplete", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, status: "not-queued", jobId: null }) });
    render(<EpisodeAudioMixDesk projectId="project_0001" projectSlug="nest-one" episodeProductionId="episode_0001" programFingerprintSha256={null} canWrite eligible={false} eligibilityDetail="Choose a program clock and align every included track." />);
    expect(await screen.findByText("Choose a program clock and align every included track.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Build mix proposal" })).toBeDisabled();
  });
  it("shows an exact-clock matched A/B surface only when both verified derivatives exist", async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({
      ok: true,
      status: "completed",
      jobId: "mix_0002",
      proposalId: "mix_0002",
      programFingerprintSha256: "f".repeat(64),
      actionCount: 1,
      unresolvedCount: 0,
      requiredReviewSecondBins: [2, 30, 58],
      transcriptReview: { status: "partial", detail: "1 of 2 included tracks have exact-source timed transcript context.", transcribedTrackCount: 1, missingTrackCount: 1, tracks: [], checkpoints: [{ second: 2, snippets: [] }, { second: 30, snippets: [{ id: "snippet-1", trackTitle: "Charlie MV7i", participantLabel: "Charlie", transcriptJobId: "transcript-1", segmentId: "segment-1", programStartSeconds: 29.5, programEndSeconds: 33.1, sourceStartSeconds: 29.5, sourceEndSeconds: 33.1, text: "The human-reviewed words remain an overlay.", speakerLabel: "Charlie", provider: "openai-whisper-local", providerModel: "large-v3-turbo", reviewStatus: "human-corrected", reviewReceiptId: "correction-1", providerConfidence: 0.82 }] }, { second: 58, snippets: [] }] },
      waveformReview: { status: "completed", detail: "One complete-decode profile represents both bit-identical files.", sharedByBitExactIdentity: true, baseline: { jobId: "signal-1", status: "completed", durationSeconds: 60, windowDurationSeconds: 30, rmsDbfs: -18, samplePeakDbfs: -1, signalStatus: "signal-present", waveform: [{ startSeconds: 0, durationSeconds: 30, rmsDbfs: -20, samplePeakDbfs: -2, clippedFrameCount: 0 }, { startSeconds: 30, durationSeconds: 30, rmsDbfs: -16, samplePeakDbfs: -1, clippedFrameCount: 0 }], error: null }, proposal: { jobId: "signal-1", status: "completed", durationSeconds: 60, windowDurationSeconds: 30, rmsDbfs: -18, samplePeakDbfs: -1, signalStatus: "signal-present", waveform: [{ startSeconds: 0, durationSeconds: 30, rmsDbfs: -20, samplePeakDbfs: -2, clippedFrameCount: 0 }, { startSeconds: 30, durationSeconds: 30, rmsDbfs: -16, samplePeakDbfs: -1, clippedFrameCount: 0 }], error: null } },
      preview: { assetId: "proposal_asset", playbackUrl: "/proposal.wav", sha256: "a".repeat(64), durationSeconds: 60, integratedLufs: -16, truePeakDbtp: -1.5, baselineAssetId: "baseline_asset", baselinePlaybackUrl: "/baseline.wav", baselineSha256: "b".repeat(64), baselineDurationSeconds: 60, baselineIntegratedLufs: -15.9, baselineTruePeakDbtp: -1.7, levelMatchedDeltaLufs: 0.1, outputByteRelationship: "bit-identical" },
      }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true, review: { latest: null, approvalCount: 0, rejectionCount: 0 }, promotion: { active: false, activePromotion: null, candidatePlaybackUrl: null, promoteCount: 0, withdrawalCount: 0 } }) });
    render(<EpisodeAudioMixDesk projectId="project_0001" projectSlug="nest-one" episodeProductionId="episode_0001" programFingerprintSha256={"f".repeat(64)} canWrite eligible eligibilityDetail="Ready" />);
    expect(await screen.findByText("Matched A/B ready for a deliberate listen")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Baseline · no gain moves" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Proposal · reviewed moves" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("0.10 LU apart")).toBeInTheDocument();
    expect(screen.getByText("Bit-exact no-op")).toBeInTheDocument();
    expect(screen.getByLabelText("Episode mix audition playhead")).toBeInTheDocument();
    expect(screen.getByLabelText("Measured matched A/B signal overview")).toHaveTextContent("not a sample-level waveform");
    expect(screen.getByText("One profile · bit-exact files")).toBeInTheDocument();
    expect(screen.getByLabelText("Transcript-linked review context")).toHaveTextContent("1 of 2 included tracks");
    expect(screen.getByText(/The human-reviewed words remain an overlay/)).toBeInTheDocument();
    expect(screen.getByText("Human corrected")).toBeInTheDocument();
    expect(screen.getAllByText(/No exact timed transcript segment/)).toHaveLength(2);
    expect(screen.getByRole("button", { name: /Approve as heard/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "0:30 B○ P○" })).toBeInTheDocument();
  });
  it("keeps polling when the worker has not changed state yet", async () => {
    jest.useFakeTimers();
    const processing = { ok: true, status: "processing", jobId: "mix_poll_0001", proposalId: "mix_poll_0001", programFingerprintSha256: "f".repeat(64), actionCount: 0, unresolvedCount: 0, requiredReviewSecondBins: [], preview: null, error: null, updatedAt: "2026-08-06T12:00:00.000Z" };
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => processing })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => processing })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ...processing, status: "completed", updatedAt: "2026-08-06T12:01:00.000Z" }) });
    global.fetch = fetchMock;
    render(<EpisodeAudioMixDesk projectId="project_0001" projectSlug="nest-one" episodeProductionId="episode_0001" programFingerprintSha256={"f".repeat(64)} canWrite eligible eligibilityDetail="Ready" />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { jest.advanceTimersByTime(1_400); await Promise.resolve(); await Promise.resolve(); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => { jest.advanceTimersByTime(1_400); await Promise.resolve(); await Promise.resolve(); });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(screen.getByRole("button", { name: "Build a new proposal" })).toBeInTheDocument();
  });
});
