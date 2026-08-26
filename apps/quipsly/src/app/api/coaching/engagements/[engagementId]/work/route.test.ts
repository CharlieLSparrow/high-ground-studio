/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { DELETE, GET, PATCH, POST, PUT } from "./route";

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

function request(
  method: "GET" | "POST" | "PATCH" | "DELETE" | "PUT",
  body?: Record<string, unknown>,
) {
  return new Request(
    `http://localhost/api/coaching/engagements/${engagementId}/work`,
    {
      method,
      ...(body
        ? {
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }
        : {}),
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

  it("reads one canonical relationship workspace with server-filtered private notes", async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce({
        id: engagementId,
        title: "Client and coach",
        status: "ACTIVE",
        members: [
          {
            userId: actor.id,
            role: "COACH",
            user: { name: "Coach", primaryEmail: actor.primaryEmail },
          },
          {
            userId: "client-1",
            role: "CLIENT",
            user: { name: "Client", primaryEmail: "client@example.test" },
          },
        ],
        notes: [
          {
            id: "note-1",
            authorUserId: actor.id,
            title: "Private reflection",
            body: "Listen longer.",
            visibility: "AUTHOR_PRIVATE",
            createdAt: now,
            updatedAt: now,
            authorUser: { name: "Coach", primaryEmail: actor.primaryEmail },
          },
          {
            id: "note-shared",
            authorUserId: "client-1",
            title: "Shared reflection",
            body: "Keep the next step small.",
            visibility: "SESSION_SHARED",
            createdAt: now,
            updatedAt: now,
            authorUser: { name: "Client", primaryEmail: "client@example.test" },
          },
        ],
        actionItems: [],
        goals: [],
      })
      .mockResolvedValueOnce({ id: engagementId });
    jest.mocked(getPrismaClient).mockReturnValue({
      coachingEngagement: { findFirst },
    } as any);

    const response = await GET(request("GET"), {
      params: Promise.resolve({ engagementId }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(payload).toMatchObject({
      ok: true,
      engagement: {
        id: engagementId,
        canWrite: true,
        currentUserId: actor.id,
        entries: [
          {
            id: "note-1",
            kind: "NOTE",
            visibility: "PRIVATE",
            canEdit: true,
            canChangeVisibility: true,
          },
          {
            id: "note-shared",
            kind: "NOTE",
            visibility: "SHARED",
            canEdit: true,
            canChangeVisibility: false,
          },
        ],
      },
      boundaries: {
        canonicalEngagementRecords: true,
        authorPrivateNotesFilteredServerSide: true,
      },
    });
    expect(findFirst.mock.calls[0][0].select.notes.where).toEqual({
      OR: [
        { visibility: { in: ["SESSION_SHARED", "CLIENT_SAFE"] } },
        { authorUserId: actor.id },
      ],
    });
  });

  it("keeps every mutation affordance off for a read-only relationship member", async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce({
        id: engagementId,
        title: "Client and observer",
        status: "ACTIVE",
        members: [],
        notes: [{
          id: "note-shared",
          authorUserId: actor.id,
          title: "Shared note",
          body: "Visible without mutation authority.",
          visibility: "SESSION_SHARED",
          sourceJson: {},
          createdAt: now,
          updatedAt: now,
          authorUser: { name: "Coach", primaryEmail: actor.primaryEmail },
        }],
        actionItems: [{
          id: "task-1",
          assignedUserId: "client-1",
          title: "Try the exercise",
          detail: null,
          status: "OPEN",
          dueAt: null,
          sourceJson: {},
          createdAt: now,
          updatedAt: now,
          assignedUser: { name: "Client", primaryEmail: "client@example.test" },
        }],
        goals: [{
          id: "goal-1",
          ownerUserId: "client-1",
          title: "Build consistency",
          description: null,
          status: "ACTIVE",
          targetAt: null,
          sourceJson: {},
          createdAt: now,
          updatedAt: now,
          owner: { name: "Client", primaryEmail: "client@example.test" },
        }],
      })
      .mockResolvedValueOnce(null);
    jest.mocked(getPrismaClient).mockReturnValue({
      coachingEngagement: { findFirst },
    } as any);

    const response = await GET(request("GET"), {
      params: Promise.resolve({ engagementId }),
    });
    const payload = await response.json();

    expect(payload.engagement.canWrite).toBe(false);
    expect(payload.engagement.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "note-shared", canEdit: false, canChangeVisibility: false }),
      expect.objectContaining({ id: "task-1", canEdit: false }),
      expect.objectContaining({ id: "goal-1", canEdit: false }),
    ]));
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
        reversibleInProductWork: true,
        sourceProvenanceVisible: true,
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

  it("lets an active collaborator edit a shared note without taking it private", async () => {
    const shared = {
      id: "note-shared",
      authorUserId: "client-1",
      title: "Shared reflection",
      body: "Keep the next step small.",
      visibility: "SESSION_SHARED",
      sourceJson: { schema: "quipsly-coaching-engagement-work-v1" },
      createdAt: now,
      updatedAt: now,
      authorUser: { name: "Client", primaryEmail: "client@example.test" },
      _count: { revisions: 1 },
    };
    const update = jest.fn().mockResolvedValue({
      ...shared,
      body: "Keep the next step tiny and specific.",
      updatedAt: new Date("2026-08-19T21:06:00.000Z"),
    });
    const prisma = transaction({
      coachingEngagement: {
        findFirst: jest.fn().mockResolvedValue({
          id: engagementId,
          members: [coachMember, clientMember],
        }),
      },
      coachingNote: { findFirst: jest.fn().mockResolvedValue(shared), update },
      actionItem: { findFirst: jest.fn(), update: jest.fn() },
      goal: { findFirst: jest.fn(), update: jest.fn() },
    });

    const response = await PATCH(
      request("PATCH", {
        id: shared.id,
        kind: "NOTE",
        title: shared.title,
        body: "Keep the next step tiny and specific.",
        visibility: "SHARED",
        expectedUpdatedAt: now.toISOString(),
      }),
      { params: Promise.resolve({ engagementId }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.entry).toMatchObject({
      id: shared.id,
      canEdit: true,
      canChangeVisibility: false,
    });
    expect(prisma.coachingNote.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: shared.id,
        engagementId,
        OR: [
          { authorUserId: actor.id },
          { visibility: { in: ["SESSION_SHARED", "CLIENT_SAFE"] } },
        ],
      }),
    }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        body: "Keep the next step tiny and specific.",
        revisions: { create: expect.objectContaining({ actorUserId: actor.id }) },
      }),
    }));
  });

  it("keeps another author's shared note shared", async () => {
    const shared = {
      id: "note-shared",
      authorUserId: "client-1",
      title: "Shared reflection",
      body: "Keep the next step small.",
      visibility: "SESSION_SHARED",
      sourceJson: {},
      createdAt: now,
      updatedAt: now,
      authorUser: { name: "Client", primaryEmail: "client@example.test" },
      _count: { revisions: 1 },
    };
    const update = jest.fn();
    transaction({
      coachingEngagement: {
        findFirst: jest.fn().mockResolvedValue({
          id: engagementId,
          members: [coachMember, clientMember],
        }),
      },
      coachingNote: { findFirst: jest.fn().mockResolvedValue(shared), update },
      actionItem: { findFirst: jest.fn(), update: jest.fn() },
      goal: { findFirst: jest.fn(), update: jest.fn() },
    });

    const response = await PATCH(
      request("PATCH", {
        id: shared.id,
        kind: "NOTE",
        title: shared.title,
        body: shared.body,
        visibility: "PRIVATE",
        expectedUpdatedAt: now.toISOString(),
      }),
      { params: Promise.resolve({ engagementId }) },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Only the note author can make a shared note private.",
    });
    expect(update).not.toHaveBeenCalled();
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

  it("removes relationship work immediately and restores it with undo", async () => {
    const removedAt = new Date("2026-08-19T21:06:00.000Z");
    const restoredAt = new Date("2026-08-19T21:07:00.000Z");
    const actionItem = {
      findFirst: jest
        .fn()
        .mockResolvedValueOnce({
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
        })
        .mockResolvedValueOnce({
          id: "task-1",
          assignedUserId: "client-1",
          title: "Practice the opening question",
          detail: null,
          status: "CANCELED",
          dueAt: null,
          sourceJson: {
            schema: "quipsly-coaching-engagement-work-v1",
            relationshipWorkRemoval: {
              active: true,
              previousStatus: "OPEN",
              removedAt: removedAt.toISOString(),
            },
          },
          createdAt: now,
          updatedAt: removedAt,
          assignedUser: { name: "Client", primaryEmail: "client@example.test" },
        }),
      update: jest
        .fn()
        .mockResolvedValueOnce({
          id: "task-1",
          assignedUserId: "client-1",
          title: "Practice the opening question",
          detail: null,
          status: "CANCELED",
          dueAt: null,
          sourceJson: {},
          createdAt: now,
          updatedAt: removedAt,
          assignedUser: { name: "Client", primaryEmail: "client@example.test" },
        })
        .mockResolvedValueOnce({
          id: "task-1",
          assignedUserId: "client-1",
          title: "Practice the opening question",
          detail: null,
          status: "OPEN",
          dueAt: null,
          sourceJson: {},
          createdAt: now,
          updatedAt: restoredAt,
          assignedUser: { name: "Client", primaryEmail: "client@example.test" },
        }),
    };
    const receiptUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    transaction({
      coachingEngagement: {
        findFirst: jest.fn().mockResolvedValue({ id: engagementId }),
      },
      actionItem,
      coachingNote: { findFirst: jest.fn(), update: jest.fn() },
      goal: { findFirst: jest.fn(), update: jest.fn() },
      coachingFormOutcomePromotionReceipt: { updateMany: receiptUpdateMany },
    });

    const removed = await DELETE(
      request("DELETE", {
        id: "task-1",
        kind: "TASK",
        expectedUpdatedAt: now.toISOString(),
      }),
      { params: Promise.resolve({ engagementId }) },
    );
    const removalPayload = await removed.json();
    expect(removed.status).toBe(200);
    expect(removalPayload).toMatchObject({
      ok: true,
      undoAvailable: true,
      removal: { id: "task-1", kind: "TASK" },
    });
    expect(actionItem.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          status: "CANCELED",
          sourceJson: expect.objectContaining({
            relationshipWorkRemoval: expect.objectContaining({
              active: true,
              previousStatus: "OPEN",
            }),
          }),
        }),
      }),
    );

    const restored = await PUT(
      request("PUT", {
        id: "task-1",
        kind: "TASK",
        expectedUpdatedAt: removalPayload.removal.updatedAt,
      }),
      { params: Promise.resolve({ engagementId }) },
    );
    expect(restored.status).toBe(200);
    expect(await restored.json()).toMatchObject({
      ok: true,
      entry: { id: "task-1", kind: "TASK", status: "OPEN" },
    });
    expect(actionItem.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          status: "OPEN",
          sourceJson: expect.objectContaining({
            relationshipWorkRemoval: expect.objectContaining({ active: false }),
          }),
        }),
      }),
    );
    expect(receiptUpdateMany).toHaveBeenCalledTimes(2);
  });
});
