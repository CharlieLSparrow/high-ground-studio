import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { notFound } from "next/navigation";
import Page from "./page";
import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySession } from "@/lib/server/quipsly-session";
import { coachingEngagementAccessWhere } from "@/lib/server/coaching-engagement";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySession: jest.fn() }));
jest.mock("next/navigation", () => ({ notFound: jest.fn(() => { throw new Error("NOT_FOUND"); }) }));
jest.mock("@/components/session-thread", () => ({ CollaborationThread: () => null }));
jest.mock("@/components/coaching-engagement-member-manager", () => ({ CoachingEngagementMemberManager: () => <h2>Manage people</h2> }));
jest.mock("@/components/coaching-engagement-workspace", () => ({ CoachingEngagementWorkspace: ({ canWrite }: { canWrite: boolean }) => <button disabled={!canWrite}>Add shared note</button> }));
jest.mock("@/components/coaching-space-tabs", () => ({ CoachingSpaceTabs: ({ work, people }: { work: ReactNode; people?: ReactNode }) => <>{work}{people}</> }));

const prisma = { coachingEngagement: { findFirst: jest.fn() } };
const params = Promise.resolve({ engagementId: "space" });
const person = { id: "person", primaryEmail: "person@example.test", isStaff: false };
function arrange(role: "COACH" | "CLIENT" | "OBSERVER", canManage = false) {
  prisma.coachingEngagement.findFirst.mockResolvedValueOnce({
    id: "space", title: "Our shared work", status: "ACTIVE",
    primaryCoachUserId: "coach", primaryClientUserId: "client",
    project: { id: "project", slug: "private-space", name: "Private space" },
    members: [{ role, userId: person.id, user: { name: "Test person", primaryEmail: person.primaryEmail } }],
    callRooms: [], notes: [], actionItems: [], goals: [], formAssignments: [],
  }).mockResolvedValueOnce(canManage ? { id: "space" } : null);
}

describe("client space page behavior", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.coachingEngagement.findFirst.mockReset();
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
    expect(query.select.notes.where).toEqual({ OR: [
      { visibility: { in: ["SESSION_SHARED", "CLIENT_SAFE"] } }, { authorUserId: person.id },
    ] });
    expect(query.select.actionItems.where).toEqual({ sourceJson: { path: ["visibility"], equals: "engagement-shared" } });
    expect(query.select.goals.where).toEqual(query.select.actionItems.where);
  });

  it("shows the coach's client list, scheduling, and independently authorized people controls", async () => {
    arrange("COACH", true);
    render(await Page({ params }));
    expect(screen.getByRole("link", { name: "All clients" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /schedule/i })).toHaveAttribute("href", "/coaching?clientSpace=space#create-appointment");
    expect(screen.getByRole("heading", { name: "Manage people" })).toBeInTheDocument();
    expect(prisma.coachingEngagement.findFirst.mock.calls[1][0].where).toEqual(coachingEngagementAccessWhere("space", person, "manage"));
  });

  it("keeps observers read-only", async () => {
    arrange("OBSERVER");
    render(await Page({ params }));
    expect(screen.getByRole("button", { name: "Add shared note" })).toBeDisabled();
    expect(screen.queryByRole("heading", { name: "Manage people" })).not.toBeInTheDocument();
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
