import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { notFound } from "next/navigation";
import Page from "./page";
import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySession } from "@/lib/server/quipsly-session";
import { coachingEngagementAccessWhere } from "@/lib/server/coaching-engagement";
import { sharedCoachingWorkVisibilityWhere } from "@/lib/server/coaching-work-access";
import type { CoachingEngagementWorkEntry } from "@/components/coaching-engagement-workspace";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySession: jest.fn() }));
jest.mock("next/navigation", () => ({ notFound: jest.fn(() => { throw new Error("NOT_FOUND"); }) }));
jest.mock("@/components/session-thread", () => ({ CollaborationThread: () => null }));
jest.mock("@/components/coaching-engagement-member-manager", () => ({ CoachingEngagementMemberManager: () => <h2>Manage people</h2> }));
jest.mock("@/components/coaching-engagement-workspace", () => ({ CoachingEngagementWorkspace: ({ canWrite, initialEntries }: { canWrite: boolean; initialEntries: CoachingEngagementWorkEntry[] }) => <>
  <button disabled={!canWrite}>Add shared note</button>
  {initialEntries.map((entry) => <div key={entry.id}>
    {entry.sourceHref ? <a href={entry.sourceHref}>{entry.title} source</a> : null}
    {(entry.tags ?? []).map(tag => <span key={tag.id} data-color={tag.hexColor}>{tag.label}</span>)}
  </div>)}
</> }));
jest.mock("@/components/coaching-space-tabs", () => ({ CoachingSpaceTabs: ({ work, people, sessions }: { work: ReactNode; people?: ReactNode; sessions?: ReactNode }) => <>{work}{sessions}{people}</> }));

const prisma = { coachingEngagement: { findFirst: jest.fn() }, callRoom: { findFirst: jest.fn() } };
const params = Promise.resolve({ engagementId: "space" });
const person = { id: "person", primaryEmail: "person@example.test", isStaff: false };
function arrange(role: "COACH" | "CLIENT" | "OBSERVER", canManage = false, work: Record<string, unknown> = {}) {
  prisma.coachingEngagement.findFirst.mockResolvedValueOnce({
    id: "space", title: "Our shared work", status: "ACTIVE",
    primaryCoachUserId: "coach", primaryClientUserId: "client",
    project: { id: "project", slug: "private-space", name: "Private space" },
    members: [{ role, userId: person.id, user: { name: "Test person", primaryEmail: person.primaryEmail } }],
    callRooms: [], notes: [], actionItems: [], goals: [], formAssignments: [],
    ...work,
  }).mockResolvedValueOnce(canManage ? { id: "space" } : null);
}

describe("client space page behavior", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.coachingEngagement.findFirst.mockReset();
    prisma.callRoom.findFirst.mockResolvedValue(null);
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);
    jest.mocked(getQuipslySession).mockResolvedValue({ user: person } as never);
  });

  it("gives clients their own navigation without coach scheduling or access controls", async () => {
    arrange("CLIENT");
    render(await Page({ params }));
    expect(screen.getByRole("link", { name: "My coaching spaces" })).toHaveAttribute("href", "/coaching/engagements");
    expect(screen.queryByRole("link", { name: "All clients" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /schedule/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Manage people" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add shared note" })).toBeEnabled();
    const query = prisma.coachingEngagement.findFirst.mock.calls[0][0];
    expect(query.where).toEqual(coachingEngagementAccessWhere("space", person, "read"));
    expect(query.select.notes.where).toMatchObject({ OR: [
      { visibility: { in: ["SESSION_SHARED", "CLIENT_SAFE"] } }, { authorUserId: person.id },
    ] });
    expect(query.select.actionItems.where).toMatchObject(sharedCoachingWorkVisibilityWhere());
    expect(query.select.goals.where).toEqual(query.select.actionItems.where);
  });

  it("shows the coach's client list, scheduling, and independently authorized people controls", async () => {
    arrange("COACH", true);
    render(await Page({ params }));
    expect(screen.getByRole("link", { name: "All clients" })).toBeInTheDocument();
    for (const link of screen.getAllByRole("link", { name: /schedule/i })) {
      expect(link).toHaveAttribute("href", "/coaching?clientSpace=space#create-appointment");
    }
    expect(screen.getByRole("heading", { name: "Manage people" })).toBeInTheDocument();
    expect(prisma.coachingEngagement.findFirst.mock.calls[1][0].where).toEqual(coachingEngagementAccessWhere("space", person, "manage"));
  });

  it("keeps scheduling available in Sessions even when a client already has an appointment", async () => {
    const room = { id: "next-room", title: "Next appointment", status: "PLANNED", scheduledStart: new Date("2026-09-09T16:00:00Z"), scheduledEnd: new Date("2026-09-09T17:00:00Z"), createdAt: new Date(), transcriptJobs: [], outputs: [], _count: { recordingAssets: 0 } };
    arrange("COACH", true, { callRooms: [room] });
    prisma.callRoom.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(room);
    render(await Page({ params }));
    expect(screen.getByRole("link", { name: "Schedule session" })).toHaveAttribute("href", "/coaching?clientSpace=space#create-appointment");
    expect(screen.getAllByRole("link", { name: /Prepare session/i }).length).toBeGreaterThan(0);
  });

  it("projects notes, tasks, and goals back to their stored session without inventing manual-note sources", async () => {
    const common = {roomId: "room-1", createdAt: new Date(), updatedAt: new Date(),
      sourceJson: {origin: "quipsly-session-follow-through", roomId: "room-1", recordingAssetId: "asset-1", sourceStartSeconds: 4},
    };
    arrange("CLIENT", false, {
      notes: [{...common, id: "note", title: "Recap", body: "Our session", visibility: "SESSION_SHARED"},
        {...common, id: "manual", title: "Manual", body: "My words", visibility: "SESSION_SHARED", roomId: null}],
      actionItems: [{...common, id: "task", title: "Task", status: "OPEN"}],
      goals: [{...common, id: "goal", title: "Goal", status: "ACTIVE", ownerUserId: person.id, owner: person}],
    });
    render(await Page({params}));
    for (const title of ["Recap", "Task", "Goal"]) {
      expect(screen.getByRole("link", {name: `${title} source`})).toHaveAttribute("href", "/sessions/room-1?mode=transcript&source=asset-1&at=4");
    }
    expect(screen.queryByRole("link", {name: "Manual source"})).not.toBeInTheDocument();
    const query = prisma.coachingEngagement.findFirst.mock.calls[0][0];
    for (const relation of ["notes", "actionItems", "goals"]) {
      expect(query.select[relation].select).toMatchObject({roomId: true, sourceJson: true});
    }
  });

  it("keeps observers read-only", async () => {
    arrange("OBSERVER");
    render(await Page({ params }));
    expect(screen.getByRole("button", { name: "Add shared note" })).toBeDisabled();
    expect(screen.queryByRole("heading", { name: "Manage people" })).not.toBeInTheDocument();
  });

  it("uses the same source and colored tag projection on the initial page as on refresh", async () => {
    arrange("CLIENT", false, {actionItems: [{id: "from-chat", engagementId: "space", roomId: null,
      title: "Outline our chapter", detail: "Start with our first question", status: "OPEN", createdAt: new Date(), updatedAt: new Date(),
      sourceJson: {conversationSource: {schema: "quipsly-conversation-work-v1", engagementId: "space", messageId: "chat-original"}},
      tagLinks: [{tag: {id: "research", label: "Research", hexColor: "#23543a", isActive: true}}],
    }]});
    render(await Page({params}));
    expect(screen.getByRole("link", {name: "Outline our chapter source"})).toHaveAttribute("href", "/coaching/engagements/space?message=chat-original#relationship-conversation");
    expect(screen.getByText("Research")).toHaveAttribute("data-color", "#23543a");
    const query = prisma.coachingEngagement.findFirst.mock.calls[0][0];
    for (const relation of ["notes", "actionItems", "goals"]) {
      expect(query.select[relation].select.tagLinks.select.tag.select).toEqual({id: true, label: true, hexColor: true, isActive: true});
    }
  });

  it("does not reveal the space or its work when scoped lookup denies access", async () => {
    prisma.coachingEngagement.findFirst.mockResolvedValue(null);
    await expect(Page({ params })).rejects.toThrow("NOT_FOUND");
    expect(notFound).toHaveBeenCalledTimes(1);
    expect(prisma.coachingEngagement.findFirst).toHaveBeenCalledTimes(1);
  });

  it("retains the destination at sign-in without querying private data", async () => {
    jest.mocked(getQuipslySession).mockResolvedValue(null as never);
    render(await Page({ params }));
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login?callbackUrl=%2Fcoaching%2Fengagements%2Fspace");
    expect(prisma.coachingEngagement.findFirst).not.toHaveBeenCalled();
  });
});
