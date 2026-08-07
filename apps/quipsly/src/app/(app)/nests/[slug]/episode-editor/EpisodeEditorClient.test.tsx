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
    updatedAt: "2026-07-27T19:00:00.000Z",
  },
  state: {
    version: "quipsly-program-edit.v1",
    durationSeconds: 60,
    sources: [],
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
          text: "The source clock owns this line.",
          speakerLabel: "Charlie",
          reviewStatus: "human-reviewed",
          sourceTranscriptJobId: "transcript-1",
          sourceSegmentId: "provider-segment-1",
          deactivated: false,
        }],
      },
    }} />);

    fireEvent.click(screen.getByRole("button", { name: /The source clock owns this line/i }));
    expect(screen.getByRole("slider", { name: "Episode playhead" })).toHaveValue("2.25");
    expect(screen.getByText("human-reviewed")).toBeInTheDocument();
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
        }],
      },
    }} />);
    expect(screen.getByText("episode program delivery")).toBeInTheDocument();
    expect(screen.getByText("local worker · local")).toBeInTheDocument();
    expect(screen.queryByText(/No render, proxy/)).not.toBeInTheDocument();
  });

  it("makes ambiguous audio evidence actionable through exact source selection", async () => {
    const user = userEvent.setup();
    render(<EpisodeEditorClient initialPayload={{
      ...payload,
      mediaChoices: [
        { id: "recording-charlie", label: "Charlie MV7i.wav", kind: "audio", role: "primary audio", sourceId: "source-charlie", recordingAssetId: "recording-charlie" },
        { id: "recording-homer", label: "Homer iPhone.mov", kind: "video", role: "secondary camera", sourceId: "source-homer", recordingAssetId: "recording-homer" },
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
});
