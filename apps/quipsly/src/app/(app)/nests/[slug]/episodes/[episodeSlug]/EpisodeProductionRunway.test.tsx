import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { EpisodeRoomMilestone } from "@/lib/server/episode-room-store";

import EpisodeProductionRunway from "./EpisodeProductionRunway";

const originalFetch = globalThis.fetch;

const prerequisite: EpisodeRoomMilestone = {
  id: "milestone-source-upload",
  stableId: "episode-milestone-source-upload",
  episodeProductionId: "episode-production-1",
  kind: "SOURCE_UPLOAD_VERIFIED",
  title: "Source upload verified",
  detail: "Confirm every local recording reached the immutable source vault.",
  startsAt: "2026-08-10T18:00:00.000Z",
  endsAt: null,
  timezone: "America/Denver",
  status: "IN_PROGRESS",
  revision: 1,
  assignee: {
    id: "user-scott",
    email: "scott@example.test",
    label: "Scott Sparrow",
  },
  dependsOn: null,
  blocked: false,
  completedAt: null,
  canceledAt: null,
  createdAt: "2026-08-02T12:00:00.000Z",
  updatedAt: "2026-08-02T12:00:00.000Z",
};

const dependent: EpisodeRoomMilestone = {
  ...prerequisite,
  id: "milestone-rough-cut",
  stableId: "episode-milestone-rough-cut",
  kind: "ROUGH_CUT",
  title: "Rough cut ready for review",
  detail: null,
  startsAt: "2026-08-12T18:00:00.000Z",
  status: "PLANNED",
  assignee: null,
  dependsOn: {
    id: prerequisite.id,
    title: prerequisite.title,
    status: prerequisite.status,
  },
  blocked: true,
};

describe("Episode production runway", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    if (originalFetch) globalThis.fetch = originalFetch;
    else Reflect.deleteProperty(globalThis, "fetch");
  });

  it("keeps viewer access read-only while exposing dependency and calendar truth", () => {
    render(
      <EpisodeProductionRunway
        projectSlug="high-ground-odyssey"
        episodeSlug="the-swear-jar"
        initialMilestones={[prerequisite, dependent]}
        initialAssignees={[]}
        canEdit={false}
      />,
    );

    expect(screen.getByRole("heading", { name: "Dates the whole episode can trust" })).toBeInTheDocument();
    expect(screen.getByText("Waiting on: Source upload verified")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Calendar" })).toHaveAttribute("href", "/schedule");
    expect(screen.getByText("Aug 10, 2026 · 12:00")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add milestone" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
  });

  it("edits the canonical wall clock in its stored IANA timezone", () => {
    render(
      <EpisodeProductionRunway
        projectSlug="high-ground-odyssey"
        episodeSlug="the-swear-jar"
        initialMilestones={[prerequisite]}
        initialAssignees={[]}
        canEdit
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByRole("textbox", { name: "Timezone" })).toHaveValue("America/Denver");
    expect(screen.getByLabelText("Starts")).toHaveValue("2026-08-10T12:00");
  });

  it("accepts the canonical mutation response even when the follow-up refresh is unavailable", async () => {
    const started = {
      ...dependent,
      status: "IN_PROGRESS" as const,
      revision: 2,
      updatedAt: "2026-08-02T12:05:00.000Z",
    };
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, milestone: started, replayed: false }),
      } as Response)
      .mockRejectedValueOnce(new Error("refresh unavailable"));
    globalThis.fetch = fetchMock;

    render(
      <EpisodeProductionRunway
        projectSlug="high-ground-odyssey"
        episodeSlug="the-swear-jar"
        initialMilestones={[dependent]}
        initialAssignees={[]}
        canEdit
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    await waitFor(() => expect(screen.getByText("In progress")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(
      "was saved. Team dependency status will refresh on the next page load.",
    ));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/nests/high-ground-odyssey/episode-milestones",
    );
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ method: "PATCH" }));
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual(expect.objectContaining({
      episodeSlug: "the-swear-jar",
      milestoneId: dependent.id,
      expectedRevision: 1,
      status: "IN_PROGRESS",
    }));
  });
});
