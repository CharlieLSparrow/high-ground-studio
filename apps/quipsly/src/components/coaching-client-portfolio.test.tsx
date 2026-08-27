import { fireEvent, render, screen } from "@testing-library/react";

import {
  CoachingClientPortfolio,
  type CoachingClientPortfolioItem,
} from "./coaching-client-portfolio";
import { CoachingSuiteNav } from "./coaching-suite-nav";

jest.mock("next/navigation", () => ({
  usePathname: () => "/coaching/engagements",
}));

function client(
  overrides: Partial<CoachingClientPortfolioItem>,
): CoachingClientPortfolioItem {
  return {
    id: "engagement-1",
    title: "Coaching with Riley",
    status: "ACTIVE",
    people: [
      { label: "Morgan Coach", role: "COACH" },
      { label: "Riley Client", role: "CLIENT" },
    ],
    primaryClientLabel: "Riley Client",
    nextSession: null,
    lastSession: null,
    openTaskCount: 2,
    overdueTaskCount: 1,
    activeGoalCount: 1,
    visibleNoteCount: 3,
    followUpCount: 1,
    nextAction: {
      label: "Review follow-up",
      detail: "The recording and transcript are ready.",
      href: "/sessions/room-1?mode=transcript",
      tone: "attention",
    },
    updatedAt: "2026-08-25T12:00:00.000Z",
    ...overrides,
  };
}

describe("coaching client portfolio", () => {
  it("starts with the attention queue, then supports all-client search", () => {
    render(
      <CoachingClientPortfolio
        asOf="2026-08-25T12:00:00.000Z"
        clients={[
          client({}),
          client({
            id: "engagement-2",
            title: "Coaching with Sam",
            primaryClientLabel: "Sam Client",
            people: [{ label: "Sam Client", role: "CLIENT" }],
            overdueTaskCount: 0,
            followUpCount: 0,
            nextAction: {
              label: "Open client space",
              detail: "Review the relationship.",
              href: "/coaching/engagements/engagement-2",
              tone: "steady",
            },
          }),
        ]}
      />,
    );

    expect(screen.getByText("Riley Client")).toBeInTheDocument();
    expect(screen.queryByText("Sam Client")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Review follow-up/i })).toHaveAttribute(
      "href",
      "/sessions/room-1?mode=transcript",
    );

    fireEvent.click(screen.getByRole("button", { name: "All clients" }));
    expect(screen.getByText("Sam Client")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search clients" }), {
      target: { value: "Sam" },
    });
    expect(screen.queryByText("Riley Client")).not.toBeInTheDocument();
    expect(screen.getByText("Sam Client")).toBeInTheDocument();
  });

  it("exposes a stable coaching information architecture", () => {
    render(<CoachingSuiteNav canSchedule />);

    expect(screen.getByRole("link", { name: "Clients" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Today" })).toHaveAttribute(
      "href",
      "/coaching",
    );
    expect(screen.getByRole("link", { name: /New session/i })).toHaveAttribute(
      "href",
      "/coaching#create-appointment",
    );
  });

  it("does not show a coach-only creation action to a client", () => {
    render(<CoachingSuiteNav canSchedule={false} />);

    expect(
      screen.queryByRole("link", { name: /New session/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Clients" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "My sessions" })).toBeInTheDocument();
  });
});
