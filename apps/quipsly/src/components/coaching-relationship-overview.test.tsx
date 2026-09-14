import "@testing-library/jest-dom";

import { fireEvent, render, screen } from "@testing-library/react";

import {
  CoachingRelationshipOverview,
  CoachingRelationshipBrief,
  type CoachingRelationshipOverviewItem,
} from "./coaching-relationship-overview";

function overview(
  patch: Partial<CoachingRelationshipOverviewItem> = {},
): CoachingRelationshipOverviewItem {
  return {
    nextSession: {
      id: "room-live",
      title: "Tuesday coaching",
      startsAt: "2026-08-25T18:00:00.000Z",
      status: "OPEN",
    },
    lastSession: {
      id: "room-last",
      title: "Last coaching session",
      startsAt: "2026-08-18T18:00:00.000Z",
      recordingCount: 2,
      transcriptStatus: "COMPLETED",
      followUpReleased: true,
    },
    tasks: [
      {
        id: "task-1",
        title: "Practice the opening question",
        dueAt: "2026-08-24T18:00:00.000Z",
        ownerLabel: "Client Person",
        overdue: true,
      },
    ],
    goals: [
      {
        id: "goal-1",
        title: "Lead a confident session",
        targetAt: null,
        ownerLabel: "Client Person",
      },
    ],
    recentNotes: [
      {
        id: "note-1",
        title: "Listen for pacing",
        body: "Leave more room after the first question.",
        private: true,
      },
    ],
    openTaskCount: 1,
    overdueTaskCount: 1,
    activeGoalCount: 1,
    sharedNoteCount: 3,
    privateNoteCount: 1,
    ...patch,
  };
}

describe("CoachingRelationshipOverview", () => {
  it("keeps task and goal calendar dates on their selected day west of UTC", () => {
    const Formatter = Intl.DateTimeFormat;
    const spy = jest.spyOn(Intl, "DateTimeFormat").mockImplementation((locale, options) =>
      new Formatter(locale || "en-US", { ...options, timeZone: options?.timeZone || "America/Denver" }));
    try {
      const data = overview();
      data.tasks[0].dueAt = "2026-09-08T00:00:00.000Z";
      data.goals[0].targetAt = "2026-09-08T00:00:00.000Z";
      render(<CoachingRelationshipBrief overview={data} />);
      fireEvent.click(screen.getByText("Session brief"));
      expect(screen.getByText(/Past due Sep 8, 2026/)).toBeVisible();
      expect(screen.getByText(/Target Sep 8, 2026/)).toBeVisible();
    } finally { spy.mockRestore(); }
  });
  it("keeps scheduling in the selected client space without putting email in the URL", () => {
    render(<CoachingRelationshipOverview overview={overview({ nextSession: null })} canSchedule engagementId="client-space" />);
    expect(screen.getByRole("link", { name: "Schedule next session" })).toHaveAttribute("href", "/coaching?clientSpace=client-space#create-appointment");
  });
  it("turns a live relationship into one obvious join action and a compact continuity brief", () => {
    render(<><CoachingRelationshipOverview overview={overview()} canSchedule /><CoachingRelationshipBrief overview={overview()} /></>);
    expect(screen.getByText("Session open")).toBeVisible();
    expect(screen.queryByText("Happening now")).not.toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Join session" })).toHaveAttribute(
      "href",
      "/sessions/room-live?mode=live",
    );
    expect(screen.getByText("Practice the opening question")).not.toBeVisible();
    fireEvent.click(screen.getByText("Session brief"));
    expect(screen.getByText("Practice the opening question")).toBeVisible();
    expect(screen.getByText("Lead a confident session")).toBeVisible();
    expect(
      screen.getByText("Transcript ready", { exact: false }),
    ).toBeVisible();
    expect(
      screen.getByText("Follow-up shared", { exact: false }),
    ).toBeVisible();
    expect(
      screen.getByText("1 private note is visible only to you."),
    ).toBeVisible();
  });

  it("preserves session instants for local presentation and reports recording separately", () => {
    const data = overview();
    data.nextSession!.status = "RECORDING";
    const { container } = render(<><CoachingRelationshipOverview overview={data} canSchedule /><CoachingRelationshipBrief overview={data} /></>);
    expect(screen.getByText("Recording in progress")).toBeVisible();
    expect([...container.querySelectorAll("time")].map(el => el.getAttribute("datetime"))).toEqual([
      data.nextSession!.startsAt, data.lastSession!.startsAt,
    ]);
  });

  it("gives a client without a scheduled Session a standard conversation action", () => {
    render(
      <CoachingRelationshipOverview
        overview={overview({
          nextSession: null,
          lastSession: null,
          tasks: [],
          goals: [],
          recentNotes: [],
          openTaskCount: 0,
          overdueTaskCount: 0,
          activeGoalCount: 0,
          sharedNoteCount: 0,
          privateNoteCount: 0,
        })}
        canSchedule={false}
      />,
    );

    expect(
      screen.getByRole("link", { name: "Message your coach" }),
    ).toHaveAttribute("href", "#relationship-conversation");
    expect(screen.queryByText(/private note/i)).not.toBeInTheDocument();
  });

  it("surfaces an overdue planned Session without pretending it is live", () => {
    render(
      <CoachingRelationshipOverview
        overview={overview({
          nextSession: {
            id: "room-late",
            title: "Session needing review",
            startsAt: "2026-08-20T18:00:00.000Z",
            status: "PLANNED_LATE",
          },
        })}
        canSchedule
      />,
    );

    expect(screen.getByRole("link", { name: "Open session" })).toHaveAttribute(
      "href",
      "/sessions/room-late?mode=live",
    );
    expect(screen.queryByText("Happening now")).not.toBeInTheDocument();
    expect(screen.getByText(/open it or reschedule/i)).toBeVisible();
  });
});
