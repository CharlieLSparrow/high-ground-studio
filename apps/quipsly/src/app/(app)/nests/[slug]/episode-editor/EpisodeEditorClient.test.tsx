import { render, screen } from "@testing-library/react";

import type { EpisodeEditDeskPayload } from "@/lib/editor/program-edit-contract";

import EpisodeEditorClient from "./EpisodeEditorClient";

const payload: EpisodeEditDeskPayload = {
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
  transcript: null,
  document: {
    id: "document-1",
    title: "Episode 4 Part 2 manuscript",
  },
  canEdit: true,
};

describe("EpisodeEditorClient Shared Watch lane", () => {
  beforeEach(() => {
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
});
