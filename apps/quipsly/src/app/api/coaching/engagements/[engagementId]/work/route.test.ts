/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { PATCH, POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({
  getQuipslySessionFromRequest: jest.fn(),
}));

const engagementId = "engagement-1";
const actor = {
  id: "coach-1",
  primaryEmail: "coach@example.test",
  isStaff: false,
};
const coachMember = { userId: actor.id };
const clientMember = { userId: "client-1" };
const now = new Date("2026-08-19T21:00:00.000Z");

function request(method: "POST" | "PATCH", body: Record<string, unknown>) {
  return new Request(
    `http://localhost/api/coaching/engagements/${engagementId}/work`,
    {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

function transaction(prisma: any) {
  prisma.$transaction = jest.fn((callback: (tx: any) => Promise<unknown>) =>
    callback(prisma),
  );
  jest.mocked(getPrismaClient).mockReturnValue(prisma);
  return prisma;
}

describe("coaching engagement work", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(getQuipslySessionFromRequest)
      .mockResolvedValue({ user: actor } as any);
  });

  it("creates a retry-safe client-owned task on the relationship boundary", async () => {
    const prisma = transaction({
      coachingEngagement: {
        findFirst: jest.fn().mockResolvedValue({
          id: engagementId,
          projectId: "project-1",
          members: [coachMember, clientMember],
        }),
      },
      actionItem: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: "task-1",
          assignedUserId: "client-1",
          title: "Practice the opening question",
          detail: "Try it twice before Friday.",
          status: "OPEN",
          dueAt: null,
          createdAt: now,
          updatedAt: now,
          assignedUser: { name: "Client", primaryEmail: "client@example.test" },
        }),
      },
      coachingNote: { findUnique: jest.fn(), create: jest.fn() },
      goal: { findUnique: jest.fn(), create: jest.fn() },
    });

    const response = await POST(
      request("POST", {
        clientRequestId: "18c70a70-521a-4d3f-9ec0-657ee72337d4",
        kind: "TASK",
        title: "Practice the opening question",
        body: "Try it twice before Friday.",
        ownerUserId: "client-1",
      }),
      { params: Promise.resolve({ engagementId }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      entry: {
        kind: "TASK",
        owner: { id: "client-1", label: "Client" },
        visibility: "SHARED",
      },
      boundaries: {
        explicitHumanCapture: true,
        engagementScoped: true,
        externalSideEffects: false,
      },
    });
    expect(prisma.actionItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        engagementId,
        projectId: "project-1",
        assignedUserId: "client-1",
        sourceJson: expect.objectContaining({
          schema: "quipsly-coaching-engagement-work-v1",
          visibility: "engagement-shared",
          createdByUserId: actor.id,
          externalSideEffects: false,
        }),
      }),
      select: expect.any(Object),
    });
  });

  it("creates a private relationship note without exposing it as shared", async () => {
    const prisma = transaction({
      coachingEngagement: {
        findFirst: jest.fn().mockResolvedValue({
          id: engagementId,
          projectId: "project-1",
          members: [coachMember, clientMember],
        }),
      },
      coachingNote: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: "note-1",
          authorUserId: actor.id,
          title: "Coach reflection",
          body: "Ask less and listen longer.",
          visibility: "AUTHOR_PRIVATE",
          createdAt: now,
          updatedAt: now,
          authorUser: { name: "Coach", primaryEmail: actor.primaryEmail },
        }),
      },
      actionItem: { findUnique: jest.fn(), create: jest.fn() },
      goal: { findUnique: jest.fn(), create: jest.fn() },
    });

    const response = await POST(
      request("POST", {
        clientRequestId: "20debe44-f671-4a2f-a3d6-6f11ce0c344e",
        kind: "NOTE",
        title: "Coach reflection",
        body: "Ask less and listen longer.",
        visibility: "PRIVATE",
      }),
      { params: Promise.resolve({ engagementId }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.entry).toMatchObject({
      kind: "NOTE",
      visibility: "PRIVATE",
      canEdit: true,
    });
    expect(prisma.coachingNote.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        engagementId,
        authorUserId: actor.id,
        visibility: "AUTHOR_PRIVATE",
        sourceJson: expect.objectContaining({ visibility: "author-private" }),
      }),
      select: expect.any(Object),
    });
  });

  it("refuses to assign shared work outside the active relationship", async () => {
    const prisma = transaction({
      coachingEngagement: {
        findFirst: jest.fn().mockResolvedValue({
          id: engagementId,
          projectId: "project-1",
          members: [coachMember, clientMember],
        }),
      },
      actionItem: { findUnique: jest.fn(), create: jest.fn() },
      coachingNote: { findUnique: jest.fn(), create: jest.fn() },
      goal: { findUnique: jest.fn(), create: jest.fn() },
    });

    const response = await POST(
      request("POST", {
        clientRequestId: "b457c159-a011-45f9-b375-32d0084390ab",
        kind: "GOAL",
        title: "Build a sustainable routine",
        ownerUserId: "unrelated-user",
      }),
      { params: Promise.resolve({ engagementId }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Choose an active member of this coaching relationship.",
    });
    expect(prisma.goal.create).not.toHaveBeenCalled();
  });

  it("completes an existing relationship task and records who changed it", async () => {
    const prisma = transaction({
      coachingEngagement: {
        findFirst: jest.fn().mockResolvedValue({
          id: engagementId,
          members: [coachMember, clientMember],
        }),
      },
      actionItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: "task-1",
          assignedUserId: "client-1",
          title: "Practice the opening question",
          detail: null,
          status: "OPEN",
          dueAt: null,
          sourceJson: { schema: "quipsly-coaching-engagement-work-v1" },
          createdAt: now,
          updatedAt: now,
          assignedUser: { name: "Client", primaryEmail: "client@example.test" },
        }),
        update: jest.fn().mockResolvedValue({
          id: "task-1",
          assignedUserId: "client-1",
          title: "Practice the opening question",
          detail: null,
          status: "DONE",
          dueAt: null,
          createdAt: now,
          updatedAt: new Date("2026-08-19T21:05:00.000Z"),
          assignedUser: { name: "Client", primaryEmail: "client@example.test" },
        }),
      },
      coachingNote: { findFirst: jest.fn(), update: jest.fn() },
      goal: { findFirst: jest.fn(), update: jest.fn() },
    });

    const response = await PATCH(
      request("PATCH", {
        id: "task-1",
        kind: "TASK",
        title: "Practice the opening question",
        body: "",
        ownerUserId: "client-1",
        status: "DONE",
        expectedUpdatedAt: now.toISOString(),
      }),
      { params: Promise.resolve({ engagementId }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.entry).toMatchObject({ kind: "TASK", status: "DONE" });
    expect(prisma.actionItem.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: expect.objectContaining({
        status: "DONE",
        completedAt: expect.any(Date),
        sourceJson: expect.objectContaining({
          editReceipts: [
            expect.objectContaining({
              actorUserId: actor.id,
              externalSideEffects: false,
            }),
          ],
        }),
      }),
      select: expect.any(Object),
    });
  });
});
