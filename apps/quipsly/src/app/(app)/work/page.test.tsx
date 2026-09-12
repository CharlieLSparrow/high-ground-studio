import React from "react";
import { render, screen } from "@testing-library/react";

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySession } from "@/lib/server/quipsly-session";
import { coachingBookingParticipantWhere, personalOrSharedCoachingGoalAccessWhere } from "@/lib/server/coaching-work-access";
import { workQueueGoalWhere, workQueueGoalRelations } from "@/lib/server/work-queue-goal-access";
import { sessionActorAccessWhere } from "@/lib/server/session-access";
import { WorkClient } from "./work-client";

import WorkPage from "./page";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySession: jest.fn() }));
jest.mock("../studio-access-shell", () => ({ StudioAccessShell: ({ mode, redirectTo }: { mode: string; redirectTo: string }) => <div>{mode}:{redirectTo}</div> }));
jest.mock("./work-client", () => ({ WorkClient: jest.fn(() => <div>Persisted work queue</div>) }));

describe("Work Queue page truth states", () => {
  beforeEach(() => jest.clearAllMocks());

  it("requires a signed-in account before reading private records", async () => {
    jest.mocked(getQuipslySession).mockResolvedValue(null as any);
    render(await WorkPage({}));
    expect(screen.getByText("signed-out:/work")).toBeInTheDocument();
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("preserves the attention destination across the sign-in boundary", async () => {
    jest.mocked(getQuipslySession).mockResolvedValue(null as any);
    render(await WorkPage({ searchParams: Promise.resolve({ view: "attention" }) }));
    expect(screen.getByText("signed-out:/work?view=attention")).toBeInTheDocument();
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("preserves the dedicated tag manager destination across the sign-in boundary", async () => {
    jest.mocked(getQuipslySession).mockResolvedValue(null as any);
    render(await WorkPage({ searchParams: Promise.resolve({ manage: "tags" }) }));
    expect(screen.getByText("signed-out:/work?manage=tags")).toBeInTheDocument();
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it.each(["goals", "weekly"])("preserves the %s workspace view through sign-in", async view => {
    jest.mocked(getQuipslySession).mockResolvedValue(null as any);
    render(await WorkPage({ searchParams: Promise.resolve({ view }) }));
    expect(screen.getByText(`signed-out:/work?view=${view}`)).toBeInTheDocument();
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("preserves a specific conversation task through sign-in without fetching it anonymously", async () => {
    jest.mocked(getQuipslySession).mockResolvedValue(null as any);
    render(await WorkPage({ searchParams: Promise.resolve({ task: "task-from-chat" }) }));
    expect(screen.getByText("signed-out:/work?task=task-from-chat")).toBeInTheDocument();
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("shows an honest unavailable state instead of sample work", async () => {
    jest.mocked(getQuipslySession).mockResolvedValue({ user: { id: "user-1" } } as any);
    jest.mocked(getPrismaClient).mockReturnValue({
      coachingBooking: { findMany: jest.fn().mockRejectedValue(Object.assign(new Error("ECONNREFUSED"), { code: "ECONNREFUSED" })) },
    } as any);
    render(await WorkPage({}));
    expect(screen.getByRole("status", { name: "Work queue unavailable" })).toHaveTextContent("database connection is unavailable");
    expect(screen.queryByText("Persisted work queue")).not.toBeInTheDocument();
  });

  it.each([false, true])("uses current goal mutation access for edit controls (editable: %s)", async editable => {
    jest.mocked(getQuipslySession).mockResolvedValue({ user: { id: "member" } } as never);
    const goal = { id: "goal", ownerUserId: "coach", title: "Shared appointment goal", status: "ACTIVE",
      createdAt: new Date(), updatedAt: new Date(), sourceJson: { visibility: "SESSION_SHARED" },
      booking: { id: "booking" }, engagement: null, taskLinks: [],
      project: { id: "private-nest", name: "Private Nest", slug: "private-nest" },
      tagLinks: [
        { tag: { id: "shared-tag", projectId: "private-nest", label: "Research", hexColor: "#506b46" } },
        { tag: { id: "cross-project-tag", projectId: "different-nest", label: "Unrelated" } },
      ] };
    const prisma = {
      coachingBooking: { findMany: jest.fn().mockResolvedValue([{ id: "booking" }]) },
      callRoom: { findMany: jest.fn().mockResolvedValue([
        { id: "client-room", bookingId: null, coachingEngagementId: "private-client" },
        { id: "team-room", bookingId: null, coachingEngagementId: null },
      ]) },
      actionItem: { findMany: jest.fn().mockResolvedValue([]) },
      coachingNote: { findMany: jest.fn().mockResolvedValue([]) },
      goal: { findMany: jest.fn().mockResolvedValueOnce([goal]).mockResolvedValueOnce(editable ? [{ id: "goal" }] : []) },
      weeklyCommitment: { findMany: jest.fn().mockResolvedValue([]) },
      workPlanBlock: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);
    render(await WorkPage({}));
    expect(screen.getByText("Persisted work queue")).toBeInTheDocument();
    expect(jest.mocked(WorkClient).mock.calls[0]![0].initialSnapshot.goals).toEqual([
      expect.objectContaining({ id: "goal", canEdit: editable, canManageTags: editable, project: null,
        tags: [expect.objectContaining({ id: "shared-tag", label: "Research", hexColor: "#506b46" })] }),
    ]);
    expect(prisma.coachingBooking.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: coachingBookingParticipantWhere("member") }));
    expect(prisma.callRoom.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: sessionActorAccessWhere({ id: "member" }) }));
    expect(prisma.goal.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: workQueueGoalWhere("member"), select: expect.objectContaining(workQueueGoalRelations("member")),
    }));
    expect(prisma.goal.findMany).toHaveBeenNthCalledWith(2, {
      where: { id: { in: ["goal"] }, OR: personalOrSharedCoachingGoalAccessWhere("member", "write") }, select: { id: true },
    });
    expect(prisma.coachingNote.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { AND: [
      { OR: [{ authorUserId: "member" }, { roomId: { in: ["team-room"] } }, { bookingId: { in: ["booking"] } }] },
      { OR: [{ authorUserId: "member" }, { visibility: "SESSION_SHARED" }] },
    ] } }));
  });
});
