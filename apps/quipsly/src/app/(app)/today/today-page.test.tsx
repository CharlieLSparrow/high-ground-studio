import { render, screen, within } from "@testing-library/react";
import { TodayContent, TagPills, loadToday } from "./today-page";
import { buildTodayView } from "./today-model";
import { getPrismaClient } from "@/lib/prisma";
import { listProjectsVisibleToEmail } from "@/lib/server/home-nest";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/home-nest", () => ({ listProjectsVisibleToEmail: jest.fn() }));
jest.mock("@/lib/server/client-follow-up-attention", () => ({ loadClientFollowUpAttention: jest.fn().mockResolvedValue(null) }));
jest.mock("../studio-access-shell", () => ({ StudioAccessShell: () => null }));
jest.mock("server-only", () => ({}));

const tag = { id: "book-ideas", slug: "book-ideas", label: "Book ideas", hexColor: "#506b46" };
const now = "2026-09-09T18:00:00Z";

test("the same colored tag opens scoped search from a plan, task, and goal", () => {
  const today = buildTodayView({ now, sessions: [],
    tasks: [{ id: "task", title: "Draft the opening", createdAt: now, dueAt: now, tags: [tag] }],
    goals: [{ id: "goal", title: "Finish the paper", updatedAt: now, tags: [tag] }],
    planBlocks: [{ id: "plan", startsAt: now, endsAt: "2026-09-09T19:00:00Z", timezone: "UTC", status: "PLANNED",
      actionItem: { id: "planned-task", title: "Collect examples", status: "OPEN", tags: [tag] } }],
  });
  render(<TodayContent today={today} />);
  const links = screen.getAllByRole("link", { name: "Find work tagged Book ideas" });
  expect(links).toHaveLength(3);
  for (const link of links) {
    expect(link).toHaveAttribute("href", "/find?tag=book-ideas");
    expect(link).toHaveStyle({ backgroundColor: "#506b46", color: "#ffffff" });
  }
  expect(within(screen.getByRole("region", { name: "Tasks" })).getByRole("link", { name: "Draft the opening" })).toHaveAttribute("href", "/work?task=task");
});

test("legacy colors use the theme; renaming or recoloring a canonical tag updates the chip", () => {
  const { rerender } = render(<TagPills tags={[{ ...tag, hexColor: "url(https://example.test/track)" }]} />);
  expect(screen.getByRole("link")).not.toHaveAttribute("style");
  rerender(<TagPills tags={[{ ...tag, label: "Writing", hexColor: "#ffc" }]} />);
  expect(screen.getByRole("link", { name: "Find work tagged Writing" })).toHaveStyle({ backgroundColor: "#ffffcc", color: "#000000" });
});

test("Home offers ordinary next actions without requiring a review ceremony", () => {
  render(<TodayContent today={buildTodayView({ now, sessions: [], tasks: [], goals: [], planBlocks: [] })} />);
  expect(screen.getByRole("link", { name: "Calendar" })).toHaveAttribute("href", "/schedule");
  expect(screen.getByRole("link", { name: "All tasks & goals" })).toHaveAttribute("href", "/work");
  expect(screen.getByRole("main")).not.toHaveTextContent(/bounded continuation|actor-owned|unreviewed transcript proposals|Confirm the exact snapshot|guilt list/i);
});

test("the loader requests canonical colors but does not expose a hidden Nest's tags", async () => {
  const project = { id: "visible", name: "My writing", slug: "my-writing" };
  const task = { id: "task", title: "Opening", createdAt: new Date(), dueAt: new Date(), sourceJson: {}, room: null,
    project, tagLinks: [{ tag }] };
  const prisma = {
    callRoom: { findMany: jest.fn().mockResolvedValue([]) },
    actionItem: { findMany: jest.fn().mockResolvedValue([task, { ...task, id: "shared", project: { ...project, id: "hidden" } }]) },
    goal: { findMany: jest.fn().mockResolvedValue([]) },
    workPlanBlock: { findMany: jest.fn().mockResolvedValue([]) },
  };
  jest.mocked(getPrismaClient).mockReturnValue(prisma as never);
  jest.mocked(listProjectsVisibleToEmail).mockResolvedValue([project] as never);
  const result = await loadToday("alex", "alex@example.test");
  expect(result.tasks.find(item => item.id === "task")?.tags).toEqual([tag]);
  expect(result.tasks.find(item => item.id === "shared")?.tags).toEqual([]);
  for (const collection of [prisma.actionItem, prisma.goal]) {
    expect(collection.findMany.mock.calls[0][0].select.tagLinks.select.tag.select.hexColor).toBe(true);
  }
  const planSelect = prisma.workPlanBlock.findMany.mock.calls[0][0].select;
  expect(planSelect.actionItem.select.tagLinks.select.tag.select.hexColor).toBe(true);
  expect(planSelect.goal.select.tagLinks.select.tag.select.hexColor).toBe(true);
});
