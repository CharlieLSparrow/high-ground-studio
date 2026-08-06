import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { AudioMasteryWorkspaceClient } from "./audio-mastery-workspace-client";

const replace = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

jest.mock("../editor/DialogueRepairDesk", () => ({
  DialogueRepairDesk: () => <div>Dialogue Repair workspace</div>,
}));

jest.mock("../editor/AudioMasteryAudition", () => ({
  AudioMasteryAudition: () => <div>Matched audition workspace</div>,
}));

jest.mock("../editor/StudioTranscriptReviewDesk", () => ({
  StudioTranscriptReviewDesk: () => <div>Protected transcript review workspace</div>,
}));

const projects = [{
  id: "project-1",
  slug: "high-ground-odyssey",
  name: "High Ground Odyssey",
  role: "EDITOR" as const,
  episodes: [{
    id: "episode-1",
    slug: "episode-9",
    title: "Episode 9",
    status: "active",
    updatedAt: "2026-08-05T20:00:00.000Z",
  }],
}];

function response(payload: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response);
}

function inventory(released: boolean) {
  return {
    ok: true,
    project: { id: "project-1", slug: "high-ground-odyssey", name: "High Ground Odyssey" },
    episode: { found: true, id: "episode-1", slug: "episode-9", title: "Episode 9" },
    importedMedia: [{
      id: "asset-1",
      sourceId: "source-1",
      originalName: "Homer local master.wav",
      kind: "audio",
      contentType: "audio/wav",
      importRole: "local-audio-master",
      recordingAssetId: "recording-1",
      unresolvedRecordingReference: false,
      syncStatus: "synced",
      storage: { playbackUrl: "/api/media-vault/source/source-1" },
      asset: { readiness: { sourceSafe: true } },
      recording: { readiness: { mediaProcessingReleased: released, transcriptProcessingReleased: released } },
      safeNextAction: released ? "Review sync role and timeline use in the episode editor." : "Preserve only; media processing is held.",
    }],
    summary: { importedMediaCount: 1, audioCount: 1 },
    safeNextActions: [],
  };
}

function masteryStatus() {
  return {
    ok: true,
    jobId: null,
    status: "not-queued",
    profileId: null,
    sourceMeasurement: null,
    signalDiagnosis: null,
    proposal: null,
    derivative: null,
    review: { latest: null, approvalCount: 0, rejectionCount: 0 },
    promotion: { active: false, latest: null, activePromotion: null, promoteCount: 0, withdrawalCount: 0, candidatePlaybackUrl: null, boundaries: {} },
    delivery: { jobId: null, status: "not-queued", masteryJobId: null, promotionReceiptId: null, profileId: null, output: null, review: { latest: null, approvalCount: 0, rejectionCount: 0 }, promotionStillActive: false, error: null, updatedAt: null, boundaries: {} },
    error: null,
    updatedAt: null,
    boundaries: { originalRemainsSourceTruth: true, outputIsUnpromotedPreview: true, explicitApprovalStillRequired: true },
  };
}

function signalStatus(status: "not-queued" | "completed" | "failed" = "not-queued") {
  return {
    ok: true,
    jobId: status === "not-queued" ? null : "signal-1",
    status,
    media: status === "completed" ? { container: "wav", codec: "pcm_s16le", sampleRate: 48_000, channelCount: 1, durationSeconds: 12 } : null,
    audioSignal: status === "completed" ? {
      schemaVersion: 1,
      algorithm: "quipsly-audio-signal-window-v1",
      signalStatus: "signal-present",
      sampleRate: 48_000,
      channelCount: 1,
      analyzedFrameCount: 576_000,
      durationSeconds: 12,
      windowDurationSeconds: 1,
      rmsDbfs: -24,
      samplePeakDbfs: -3,
      clippedFrameCount: 0,
      clippedFrameFraction: 0,
      nearSilentFrameFraction: 0,
      thresholds: { clippingAmplitude: 0.999, nearSilenceDbfs: -72, possibleDropoutMinimumSeconds: 1.25, surroundingSignalDbfs: -45, stereoImbalanceDb: 12 },
      waveform: [{ startSeconds: 0, durationSeconds: 12, rmsDbfs: -24, samplePeakDbfs: -3, clippedFrameCount: 0 }],
      observations: [],
    } : null,
    analyzer: status === "completed" ? { algorithm: "quipsly-audio-signal-window-v1", completeDecode: true, maximumWindows: 1_200 } : null,
    error: status === "failed" ? "Complete decode could not be verified." : null,
    updatedAt: null,
    boundaries: { originalRemainsSourceTruth: true, analysisDoesNotChangeMedia: true, observationsRequireHumanInterpretation: true },
  };
}

function transcriptStatus(status: "not-queued" | "completed" | "failed" = "not-queued", reviewRequired = false) {
  const completed = status === "completed";
  return {
    ok: true,
    jobId: completed ? "source-transcript-1" : null,
    transcriptJobId: completed ? "transcript-1" : null,
    status,
    provider: completed ? "deepgram" : null,
    language: completed ? "en" : null,
    authorization: completed ? { kind: "participant-consent-confirmed", importRole: "local-audio-master", acceptedAt: "2026-08-05T20:00:00.000Z", acceptedByEmail: "tester@example.com" } : null,
    coverage: completed ? { segmentCount: 2, wordCount: 12, timedWordCount: 12, confidenceWordCount: 12, speakerLabeledWordCount: 0, transcriptStartSeconds: 0, transcriptEndSeconds: 12, correctionCount: 1, playbackVerificationCount: 2 } : null,
    segmentPreview: { count: completed ? 2 : 0, total: completed ? 2 : 0, truncated: false },
    segments: [],
    capabilities: null,
    terminology: null,
    quality: completed ? {
      disposition: reviewRequired ? "review-required" : "provider-evidence",
      warnings: reviewRequired ? ["implausible-timing-density", "very-low-provider-confidence"] : [],
      metrics: { activeTranscriptSeconds: reviewRequired ? 0.08 : 12, wordsPerActiveMinute: reviewRequired ? 5_250 : 60, zeroDurationWordRatio: reviewRequired ? 0.4 : 0, lowConfidenceWordRatio: reviewRequired ? 0.8 : 0.1 },
      boundaries: { deterministicTriageNotMeasuredAccuracy: true, playbackReviewRequiredForTrust: true, providerOutputRemainsInspectible: true },
    } : null,
    error: status === "failed" ? "Provider transcript evidence was unavailable." : null,
    updatedAt: null,
    boundaries: { originalRemainsSourceTruth: true, confidenceIsNotMeasuredAccuracy: true, correctionsRequirePlaybackReview: true, createsNoTasksGoalsOrEdits: true },
  };
}

function workspaceFetch(options: { released: boolean; signal?: "not-queued" | "completed" | "failed"; transcript?: "not-queued" | "completed" | "failed"; transcriptReviewRequired?: boolean }) {
  return jest.fn((input) => {
    const url = String(input);
    if (url.includes("episode-inventory")) return response(inventory(options.released));
    if (url.includes("audio-signal-profile")) return response(signalStatus(options.signal));
    if (url.includes("transcript-terminology")) return response({ ok: true, terms: [], candidates: [], activeRevisionToken: null, activeTermCount: 0 });
    if (url.includes("source-transcript")) return response(transcriptStatus(options.transcript, options.transcriptReviewRequired));
    return response(masteryStatus());
  });
}

describe("AudioMasteryWorkspaceClient", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    replace.mockReset();
  });

  it("opens a real episode source and exposes its source-to-delivery workflow", async () => {
    global.fetch = workspaceFetch({ released: true });

    render(<AudioMasteryWorkspaceClient projects={projects} initialProjectId="project-1" initialProjectSlug="high-ground-odyssey" initialEpisodeSlug="episode-9" initialAssetId="asset-1" />);

    expect(await screen.findByRole("heading", { name: "Homer local master.wav" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "One program, every retained track" })).toBeInTheDocument();
    expect(screen.getByLabelText("Episode audio track readiness")).toHaveTextContent("Homer local master.wav");
    expect(screen.getByText(/Evidence, not an automatic mix/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Measure and prepare mastering preview/ })).toBeEnabled();
    expect(screen.getByLabelText("Audio delivery lifecycle")).toHaveTextContent("Measure");
    expect(screen.getByRole("link", { name: /Open video editor/ })).toHaveAttribute("href", "/editor?project=high-ground-odyssey&episode=episode-9&asset=asset-1");
    expect(screen.getByRole("button", { name: /Build signal map/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Transcribe canonical source/ })).toBeEnabled();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("/api/media-vault/audio-mastery?"), expect.objectContaining({ cache: "no-store" })));
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("episode-inventory?projectId=project-1&projectSlug=high-ground-odyssey"),
      expect.objectContaining({ cache: "no-store" }),
    );
    for (const endpoint of ["audio-mastery", "audio-signal-profile", "source-transcript"]) {
      const call = jest.mocked(global.fetch).mock.calls.find(([input]) => String(input).includes(`/api/media-vault/${endpoint}?`));
      expect(call).toBeDefined();
      const query = new URL(String(call?.[0]), "http://localhost").searchParams;
      expect(query.get("projectId")).toBe("project-1");
      expect(query.get("projectSlug")).toBe("high-ground-odyssey");
    }
  });

  it("opens an exact source-clock handoff without claiming playback", async () => {
    global.fetch = workspaceFetch({ released: true });

    render(<AudioMasteryWorkspaceClient projects={projects} initialProjectSlug="high-ground-odyssey" initialEpisodeSlug="episode-9" initialAssetId="asset-1" initialFocusSeconds={8.25} initialFocusId="transcript_attempt:segment-1" />);

    const media = await screen.findByLabelText("Immutable source audio for Homer local master.wav") as HTMLMediaElement;
    Object.defineProperty(media, "duration", { configurable: true, value: 30 });
    fireEvent.loadedMetadata(media);
    expect(media.currentTime).toBeCloseTo(8.25, 3);
    expect(media.paused).toBe(true);
    expect(screen.getByRole("status")).toHaveTextContent("Opened at exact source time 8.250s");
    expect(screen.getByRole("status")).toHaveTextContent("Playback remains a deliberate human action");
  });

  it.each([
    [/Measure and prepare mastering preview/, "/api/media-vault/audio-mastery"],
    [/Build signal map/, "/api/media-vault/audio-signal-profile"],
    [/Transcribe canonical source/, "/api/media-vault/source-transcript"],
  ] as const)("carries the stable project pair into the %s mutation", async (buttonName, endpoint) => {
    global.fetch = workspaceFetch({ released: true });
    jest.spyOn(window, "confirm").mockReturnValue(true);

    render(<AudioMasteryWorkspaceClient projects={projects} initialProjectId="project-1" initialProjectSlug="high-ground-odyssey" initialEpisodeSlug="episode-9" initialAssetId="asset-1" />);

    await screen.findByRole("heading", { name: "Homer local master.wav" });
    const button = screen.getByRole("button", { name: buttonName });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() => expect(jest.mocked(global.fetch).mock.calls.some(([input, init]) => String(input) === endpoint && init?.method === "POST")).toBe(true));
    const call = jest.mocked(global.fetch).mock.calls.find(([input, init]) => String(input) === endpoint && init?.method === "POST");
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({
      projectId: "project-1",
      projectSlug: "high-ground-odyssey",
      assetId: "asset-1",
      sourceId: "source-1",
    });
  });

  it("shows held source evidence but disables processing operations", async () => {
    global.fetch = workspaceFetch({ released: false });

    render(<AudioMasteryWorkspaceClient projects={projects} initialProjectSlug="high-ground-odyssey" initialEpisodeSlug="episode-9" initialAssetId="asset-1" />);

    expect(await screen.findByRole("heading", { name: "Homer local master.wav" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Processing held/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Signal analysis held/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Transcription held/ })).toBeDisabled();
    expect(screen.getByText(/will not derive new media until its current release ledger authorizes processing/i)).toBeInTheDocument();
  });

  it("opens completed transcript review on the same decoded source clock", async () => {
    global.fetch = workspaceFetch({ released: true, signal: "completed", transcript: "completed" });

    render(<AudioMasteryWorkspaceClient projects={projects} initialProjectSlug="high-ground-odyssey" initialEpisodeSlug="episode-9" initialAssetId="asset-1" />);

    expect(await screen.findByText("Protected transcript review workspace")).toBeInTheDocument();
    expect(screen.getByText("12.0s")).toBeInTheDocument();
    expect(screen.getByText("Timed words").previousSibling).toHaveTextContent("12");
    expect(screen.getByRole("button", { name: /Verified signal map ready/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Timed provider transcript ready/ })).toBeDisabled();
  });

  it("keeps implausible provider words visible without labeling them ready", async () => {
    global.fetch = workspaceFetch({ released: true, signal: "completed", transcript: "completed", transcriptReviewRequired: true });

    render(<AudioMasteryWorkspaceClient projects={projects} initialProjectSlug="high-ground-odyssey" initialEpisodeSlug="episode-9" initialAssetId="asset-1" />);

    expect(await screen.findByText(/Provider output needs listening review/i)).toHaveTextContent(/too dense to represent plausible speech/i);
    expect(screen.getByText(/Provider output needs listening review/i)).toHaveTextContent(/word confidences are very low/i);
    expect(screen.getByRole("button", { name: /Provider transcript needs review/ })).toBeDisabled();
  });

  it("keeps failed signal and transcript evidence visible and retryable", async () => {
    global.fetch = workspaceFetch({ released: true, signal: "failed", transcript: "failed" });

    render(<AudioMasteryWorkspaceClient projects={projects} initialProjectSlug="high-ground-odyssey" initialEpisodeSlug="episode-9" initialAssetId="asset-1" />);

    expect(await screen.findByText("Complete decode could not be verified.")).toBeInTheDocument();
    expect(screen.getByText("Provider transcript evidence was unavailable.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Retry signal map/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Retry source transcription/ })).toBeEnabled();
  });

  it("holds a stale project locator without fetching or substituting a different Nest", async () => {
    global.fetch = workspaceFetch({ released: true });

    render(<AudioMasteryWorkspaceClient
      projects={projects}
      initialProjectId="stale-project-id"
      initialProjectSlug="high-ground-odyssey"
      initialEpisodeSlug=""
      initialAssetId={null}
      loadError="This Audio Studio link has a stale or mismatched Nest identity."
    />);

    expect(screen.getByText(/stale or mismatched Nest identity/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(replace).not.toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
