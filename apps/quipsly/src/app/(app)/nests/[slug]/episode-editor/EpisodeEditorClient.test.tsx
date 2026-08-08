import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { EpisodeEditDeskPayload } from "@/lib/editor/program-edit-contract";

import EpisodeEditorClient from "./EpisodeEditorClient";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));

const payload: EpisodeEditDeskPayload = {
  inspectionFresh: true,
  projectId: "project-1",
  projectSlug: "high-ground-odyssey",
  timelineFingerprint: "timeline-fingerprint-1",
  timelineFingerprintSha256: "b".repeat(64),
  episodes: [{
    id: "episode-1",
    slug: "episode-4-part-2",
    title: "Episode 4 Part 2",
    status: "draft",
    updatedAt: "2026-07-27T19:00:00.000Z",
  }],
  selectedEpisode: {
    id: "episode-1",
    slug: "episode-4-part-2",
    title: "Episode 4 Part 2",
    status: "draft",
    updatedAt: "2026-07-27T19:00:00.000Z",
  },
  baseline: {
    id: "baseline-1",
    label: "Protected baseline",
    version: 1,
    durationSeconds: 60,
    syncSummary: {},
    importReceipt: {},
  },
  branch: {
    id: "branch-1",
    slug: "shared-editor-cut",
    name: "Shared editor cut",
    headRevision: 0,
    stateFingerprint: "a".repeat(64),
    updatedAt: "2026-07-27T19:00:00.000Z",
  },
  state: {
    version: "quipsly-program-edit.v1",
    durationSeconds: 60,
    sources: [],
    sourceProjectionFingerprint: "c".repeat(64),
    programDecisions: [],
  },
  watchDerivatives: [{
    id: "episode-room-watch-segment-1",
    assetId: "asset-clip",
    name: "Watched · reference clip",
    kind: "video",
    startSeconds: 12.5,
    durationSeconds: 4,
    sourceStartSeconds: 2,
    sourceEndSeconds: 6,
    color: "#d37b43",
    episodeRoomSessionId: "episode-room-session-1",
    watchSegmentId: "segment-1",
    startReceiptId: "receipt-start",
    endReceiptId: "receipt-end",
    watchedAt: "2026-07-27T19:00:00.000Z",
    recordingRoomId: "call-room-1",
  }],
  annotations: [],
  transcript: {
    status: "unavailable",
    reason: "This Episode does not contain a timed transcript projection yet.",
    sourceFormat: null,
    segmentCount: 0,
    reviewedSegmentCount: 0,
    segments: [],
  },
  mediaChoices: [],
  selectedMediaAssetId: null,
  signalInspection: {
    status: "unavailable",
    reason: "No episode media is attached for edit evidence.",
    evidence: null,
    candidateCount: 0,
  },
  executionInspection: {
    browser: { status: "ready", detail: "Browser editing is ready." },
    native: { status: "available-unobserved", detail: "Native heartbeat is not connected." },
    workers: [],
    jobs: [],
  },
  document: {
    id: "document-1",
    title: "Episode 4 Part 2 manuscript",
  },
  canEdit: true,
};

describe("EpisodeEditorClient Shared Watch lane", () => {
  beforeEach(() => {
    mockPush.mockReset();
    jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    Reflect.deleteProperty(global, "fetch");
  });

  it("renders receipt-backed derivatives without changing the protected baseline", () => {
    render(<EpisodeEditorClient initialPayload={payload} />);

    expect(screen.getByText("Shared Watch derivatives")).toBeInTheDocument();
    expect(screen.getByText(
      "Receipt-backed clip spans from the current Episode Room pass. The protected source baseline stays unchanged.",
    )).toBeInTheDocument();
    expect(screen.getByText("1 synced")).toBeInTheDocument();
    expect(screen.getByRole("button", {
      name: "Watched · reference clip at 00:00:12:15",
    })).toBeInTheDocument();
  });

  it("renders the editor as one mode of the canonical Episode workspace", () => {
    render(<EpisodeEditorClient
      initialPayload={payload}
      projectName="High Ground Odyssey"
      canonicalWorkspace
      recordingRoomId="call-room-1"
    />);

    expect(screen.getByRole("heading", { name: "Episode 4 Part 2" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Episode workspace" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Plan & collaborate" })).toHaveAttribute(
      "href",
      "/nests/high-ground-odyssey/episodes/episode-4-part-2",
    );
    expect(screen.getByRole("link", { name: "Review & finish" })).toHaveAttribute(
      "href",
      "/sessions/call-room-1?mode=outputs",
    );
    expect(screen.getByRole("link", { name: "Open Advanced Studio" })).toHaveAttribute(
      "href",
      `/editor?project=high-ground-odyssey&episode=episode-4-part-2&handoff=quipsly-episode-studio-handoff-v1&editBranch=branch-1&editRevision=0&editFingerprint=${"a".repeat(64)}&timelineSha256=${"b".repeat(64)}&sourceFingerprint=${"c".repeat(64)}&sequenceAt=0`,
    );
  });

  it("uses client routing when another Episode is chosen in the canonical workspace", async () => {
    const user = userEvent.setup();
    render(<EpisodeEditorClient
      initialPayload={{
        ...payload,
        episodes: [
          ...payload.episodes,
          { id: "episode-2", slug: "episode-9", title: "Episode 9", status: "draft", updatedAt: "2026-08-07T08:00:00.000Z" },
        ],
      }}
      canonicalWorkspace
    />);

    await user.selectOptions(screen.getByRole("combobox", { name: "Episode" }), "episode-9");
    expect(mockPush).toHaveBeenCalledWith("/nests/high-ground-odyssey/episodes/episode-9?mode=edit");
  });

  it("holds a derivative that crosses the protected baseline", () => {
    render(<EpisodeEditorClient initialPayload={{
      ...payload,
      watchDerivatives: [{
        ...payload.watchDerivatives[0],
        id: "episode-room-watch-outside-baseline",
        startSeconds: 58,
        durationSeconds: 4,
      }],
    }} />);

    expect(screen.getByText(
      "1 watch span is outside this protected baseline and remains held for alignment review.",
    )).toBeInTheDocument();
    expect(screen.queryByRole("button", {
      name: "Watched · reference clip at 00:00:58:00",
    })).not.toBeInTheDocument();
  });

  it("moves the shared playhead from retained transcript evidence", () => {
    render(<EpisodeEditorClient initialPayload={{
      ...payload,
      transcript: {
        status: "available",
        reason: "One source-clock segment is available.",
        sourceFormat: "transcript",
        segmentCount: 1,
        reviewedSegmentCount: 1,
        segments: [{
          id: "segment-1",
          startSeconds: 2.25,
          endSeconds: 4.5,
          timelineClock: "source",
          sourceStartSeconds: 2.25,
          sourceEndSeconds: 4.5,
          text: "The source clock owns this line.",
          speakerLabel: "Charlie",
          reviewStatus: "human-reviewed",
          sourceTranscriptJobId: "transcript-1",
          sourceSegmentId: "provider-segment-1",
          acceptedReviewId: "review-1",
          deactivated: false,
        }],
      },
    }} />);

    fireEvent.click(screen.getByRole("button", { name: /The source clock owns this line/i }));
    expect(screen.getByRole("slider", { name: "Episode playhead" })).toHaveValue("2.25");
    expect(screen.getByText("source clock · human-reviewed")).toBeInTheDocument();
  });

  it("shows the real execution lane and does not invent queued rendering", () => {
    const { rerender } = render(<EpisodeEditorClient initialPayload={payload} />);
    expect(screen.getByText("No render, proxy, mastery, or delivery job is queued for this Episode. Browser edits are still saved normally.")).toBeInTheDocument();

    rerender(<EpisodeEditorClient key="with-jobs" initialPayload={{
      ...payload,
      executionInspection: {
        ...payload.executionInspection,
        jobs: [{
          id: "job-1",
          type: "episode-program-delivery",
          status: "completed",
          lane: "local-worker",
          provider: "local",
          updatedAt: "2026-08-07T08:00:00.000Z",
          completedAt: "2026-08-07T08:01:00.000Z",
          error: null,
          manifestSha256: null,
          renderProfile: null,
          branchRevision: null,
          proofStartSeconds: null,
          proofEndSeconds: null,
          playbackUrl: null,
        }],
      },
    }} />);
    expect(screen.getByText("episode program delivery")).toBeInTheDocument();
    expect(screen.getByText("local worker · local")).toBeInTheDocument();
    expect(screen.queryByText(/No render, proxy/)).not.toBeInTheDocument();
  });

  it("plays the highest edit revision even when an older proof has a newer maintenance timestamp", () => {
    const { container } = render(<EpisodeEditorClient initialPayload={{
      ...payload,
      executionInspection: {
        ...payload.executionInspection,
        jobs: [
          {
            id: "proof-revision-1",
            type: "episode-render-proof",
            status: "completed",
            lane: "local-worker",
            provider: "local",
            updatedAt: "2026-08-07T09:10:00.000Z",
            completedAt: "2026-08-07T09:10:00.000Z",
            error: null,
            manifestSha256: "1".repeat(64),
            renderProfile: "proof-10s",
            branchRevision: 1,
            proofStartSeconds: 0,
            proofEndSeconds: 10,
            playbackUrl: "/api/ingest/media/proof-revision-1",
          },
          {
            id: "proof-revision-3",
            type: "episode-render-proof",
            status: "completed",
            lane: "local-worker",
            provider: "local",
            updatedAt: "2026-08-07T03:22:00.000Z",
            completedAt: "2026-08-07T03:22:00.000Z",
            error: null,
            manifestSha256: "3".repeat(64),
            renderProfile: "proof-10s",
            branchRevision: 3,
            proofStartSeconds: 0,
            proofEndSeconds: 10,
            playbackUrl: "/api/ingest/media/proof-revision-3",
          },
        ],
      },
    }} />);

    expect(screen.getByText("Verified fast proof · revision 3")).toBeInTheDocument();
    expect(container.querySelector("video")?.getAttribute("src")).toBe("/api/ingest/media/proof-revision-3");
  });

  it("shows an honest side-effect-free executor plan before a local render can be queued", async () => {
    const user = userEvent.setup();
    const renderPlan = {
      schema: "quipsly-episode-render-plan-v1",
      branchRevision: 0,
      renderProfile: "proof-10s",
      profileLabel: "Fast proof",
      profileDescription: "Ten seconds for checking the current cut, picture, and sound.",
      sequenceStartSeconds: 0,
      sequenceEndSeconds: 10,
      durationSeconds: 10,
      output: { width: 1280, height: 720, fps: 24, videoCodec: "h264", audioCodec: "aac" },
      sources: { requiredCount: 3, browserPlayableCount: 3, exactLocalCount: 3, totalBytes: 2_097_152, labels: ["Camera", "Charlie", "Homer"] },
      executors: [
        { id: "browser", label: "Browser preview", status: "ready", canQueue: false, detail: "Keep editing immediately.", costKind: "none", costDetail: "No render compute or upload started", qualityDetail: "Protected proxies" },
        { id: "local-mac", label: "Editing Mac", executorNodeId: "execution_worker_render_test", artifactPortability: "executor-local", status: "ready", canQueue: true, detail: "Exact sources are ready.", costKind: "none", costDetail: "No incremental cloud compute or transfer", qualityDetail: "Exact local source bytes" },
        { id: "cloud", label: "Quipsly Cloud", status: "not-configured", canQueue: false, detail: "Cloud rendering is intentionally unavailable.", costKind: "metered", costDetail: "No upload started", qualityDetail: "Planned exact originals" },
      ],
      boundaries: { createsNoJob: true, sourceMediaRemainsImmutable: true, cloudUploadNotStarted: true, publicationNotStarted: true },
    } as const;
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ...payload, operationResult: renderPlan }),
    });
    global.fetch = fetchMock as typeof fetch;
    render(<EpisodeEditorClient initialPayload={payload} />);

    await user.click(screen.getByRole("button", { name: "Render options" }));
    expect(await screen.findByText("Editing Mac")).toBeInTheDocument();
    expect(screen.getByText("Quipsly Cloud")).toBeInTheDocument();
    expect(screen.getByText(/No job, upload, or publication was started/)).toBeInTheDocument();
    expect(screen.getByText("Proof bytes stay on this executor; the shared edit remains portable.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Render fast proof on this Mac" })).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      body: expect.stringContaining('"action":"plan-render-proof"'),
    }));
    await user.click(screen.getByRole("button", { name: "Render fast proof on this Mac" }));
    expect(fetchMock).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({
      body: expect.stringContaining('"executorNodeId":"execution_worker_render_test"'),
    }));
  });

  it("makes ambiguous audio evidence actionable through exact source selection", async () => {
    const user = userEvent.setup();
    render(<EpisodeEditorClient initialPayload={{
      ...payload,
      mediaChoices: [
        { id: "recording-charlie", label: "Charlie MV7i.wav", kind: "audio", role: "primary audio", sourceId: "source-charlie", recordingAssetId: "recording-charlie", captureGroupId: null },
        { id: "recording-homer", label: "Homer iPhone.mov", kind: "video", role: "secondary camera", sourceId: "source-homer", recordingAssetId: "recording-homer", captureGroupId: null },
      ],
      signalInspection: {
        status: "ambiguous",
        reason: "Multiple sources are attached.",
        evidence: null,
        candidateCount: 2,
      },
    }} canonicalWorkspace />);

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Exact transcript and audio source" }),
      "recording-charlie",
    );
    expect(mockPush).toHaveBeenCalledWith(
      "/nests/high-ground-odyssey/episodes/episode-4-part-2?mode=edit&source=recording-charlie",
    );
  });

  it("offers a guarded Capture handoff from the canonical Episode workspace", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
      ok: true,
      captureGroupId: "capture-group-1",
      sourceCount: 2,
      transcriptJobId: "transcript-1",
      productionUpdatedAt: "2026-08-07T08:00:00.000Z",
      plan: {
        ok: true,
        status: "media-ready",
        roomId: "recording-room-1",
        changed: true,
        nextAction: "Review before materializing.",
        transcriptBinding: {
          recordingAssetId: "recording-charlie",
          blockIds: ["turn-1", "turn-2"],
          speakerAttributionComplete: false,
        },
        issues: [],
        impact: {
          operation: "initial-materialization",
          sourceLanesCreated: 2,
          sourceLanesReused: 0,
          transcriptBlocksAdded: 2,
          transcriptBlocksReplaced: 0,
          unrelatedTimelineClipsPreserved: 3,
          unrelatedTranscriptBlocksPreserved: 4,
        },
      },
    }),
    });
    Object.defineProperty(global, "fetch", { value: fetchMock, configurable: true });

    render(<EpisodeEditorClient initialPayload={{
      ...payload,
      mediaChoices: [{
        id: "recording-charlie",
        label: "Charlie MV7i.wav",
        kind: "audio",
        role: "primary audio",
        sourceId: "source-charlie",
        recordingAssetId: "recording-charlie",
        captureGroupId: "capture-group-1",
      }],
    }} canonicalWorkspace />);

    expect(await screen.findByRole("heading", { name: "Put this take on the Episode clock" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Bring sources + transcript into edit" })).toBeEnabled();
    expect(screen.getByText("2 turns")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("captureGroupId=capture-group-1"),
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("surfaces protected playback failure without pretending the edit was damaged", () => {
    const { container } = render(<EpisodeEditorClient initialPayload={{
      ...payload,
      state: {
        ...payload.state,
        sources: [{
          id: "capture-audio-1",
          label: "MV7i protected source",
          role: "audio",
          playbackUrl: "/api/ingest/media/capture-audio-1",
          offsetSeconds: 0,
          durationSeconds: 60,
        }],
      },
    }} />);

    const audio = container.querySelector("audio");
    expect(audio).not.toBeNull();
    fireEvent.error(audio!);
    expect(screen.getByRole("alert")).toHaveTextContent("1 protected source could not be loaded here.");
    expect(screen.getByRole("alert")).toHaveTextContent("The edit and source receipts remain safe.");
  });
});
