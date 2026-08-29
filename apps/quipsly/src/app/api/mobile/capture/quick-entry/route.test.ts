/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { ensureHomeNestForEmail } from "@/lib/server/home-nest";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/home-nest", () => ({ ensureHomeNestForEmail: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));

const requestId = "018f4f2a-7b61-7d3c-8a55-90d799e0d5f4";

function request(kind: "NOTE" | "TASK" | "GOAL" | "SOURCE", overrides: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/mobile/capture/quick-entry", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clientRequestId: requestId,
      callRoomId: "room-1",
      kind,
      title: kind === "NOTE" ? null : `Quick ${kind.toLowerCase()}`,
      body: kind === "NOTE" ? "Remember the pacing note." : kind === "SOURCE" ? "https://example.com/research" : "Captured deliberately on iPhone.",
      capturedAt: "2026-07-19T09:00:00.000Z",
      ...overrides,
    }),
  });
}

function signedIn() {
  jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: { id: "user-1", primaryEmail: "person@example.com", isStaff: false } } as any);
}

function harness(existing: any = null) {
  const createdAt = new Date("2026-07-19T09:00:01.000Z");
  const capturedAt = new Date("2026-07-19T09:00:00.000Z");
  const room = { id: "room-1", title: "Episode 4", projectId: "project-1" };
  const createdTasks = new Map<string, any>();
  const personalDocuments = new Map<string, any>();
  const tagsBySlug = new Map<string, any>();
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ lockAcquired: false }]),
    callRoom: { findFirst: jest.fn().mockResolvedValue(room) },
    studioTag: {
      findMany: jest.fn(async ({ where }: any) => (where.id.in as string[]).map((id) => ({ id, slug: `slug-${id}`, label: `Tag ${id}` }))),
      findUnique: jest.fn(async ({ where }: any) => tagsBySlug.get(where.projectId_slug.slug) || null),
      create: jest.fn(async ({ data }: any) => {
        const tag = { id: `tag-${data.slug}`, ...data };
        tagsBySlug.set(data.slug, tag);
        return tag;
      }),
    },
    studioTagAlias: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    studioProjectAccessGrant: {
      findFirst: jest.fn().mockResolvedValue({
        id: "grant-1",
        project: { id: "project-direct", name: "High Ground Odyssey" },
      }),
    },
    studioDocumentTagLink: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    studioTaggedSpan: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    studioDocument: {
      findUnique: jest.fn(async ({ where }: any) => personalDocuments.get(where.id) || null),
      create: jest.fn(async ({ data }: any) => {
        const blocks = data.blocks.create.map((block: any) => ({ ...block, documentId: data.id, archivedAt: null, createdAt, updatedAt: createdAt }));
        const documentOperations = [{
          ...data.documentOperations.create,
          documentId: data.id,
          createdAt,
        }];
        const row = { ...data, blocks, documentOperations, createdAt, updatedAt: createdAt };
        personalDocuments.set(data.id, row);
        return row;
      }),
    },
    coachingNoteTagLink: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    actionItemTagLink: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    goalTagLink: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    coachingNote: {
      findUnique: jest.fn().mockResolvedValue(existing),
      upsert: jest.fn(async ({ create }: any) => ({ ...create, createdAt, updatedAt: createdAt })),
    },
    actionItem: {
      findUnique: jest.fn(async ({ where }: any) => existing || createdTasks.get(where.id) || null),
      upsert: jest.fn(async ({ create }: any) => ({ ...create, createdAt, updatedAt: createdAt })),
      create: jest.fn(async ({ data }: any) => {
        const row = { ...data, createdAt, updatedAt: createdAt };
        createdTasks.set(data.id, row);
        return row;
      }),
    },
    taskRecurrenceSeries: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(async ({ data }: any) => ({ ...data, status: "ACTIVE", endedAt: null, createdAt, updatedAt: createdAt })),
    },
    taskOccurrence: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(async ({ data }: any) => ({ ...data, createdAt, updatedAt: createdAt })),
    },
    taskReminder: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(async ({ data }: any) => ({ ...data, status: "ACTIVE", createdAt, updatedAt: createdAt })),
    },
    goal: {
      findUnique: jest.fn().mockResolvedValue(existing),
      upsert: jest.fn(async ({ create }: any) => ({ ...create, createdAt, updatedAt: createdAt })),
    },
    bookmark: {
      findUnique: jest.fn().mockResolvedValue(existing),
      upsert: jest.fn(async ({ create }: any) => ({ ...create, createdAt, updatedAt: createdAt })),
    },
    snippet: {
      findUnique: jest.fn().mockResolvedValue(existing),
      findFirst: jest.fn().mockResolvedValue(null),
      upsert: jest.fn(async ({ create }: any) => ({ ...create, createdAt, updatedAt: createdAt })),
    },
    studioPersonalSourceCaptureReceipt: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(async ({ data }: any) => ({ id: `capture-receipt-${data.clientRequestId}`, ...data, capturedAt, createdAt })),
      count: jest.fn().mockResolvedValue(1),
    },
  };
  jest.mocked(getPrismaClient).mockReturnValue({ $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) } as any);
  return tx;
}

describe("mobile Capture quick-entry route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(ensureHomeNestForEmail).mockResolvedValue({
      id: "project-home",
      slug: "home-person-at-example-com",
      name: "Person Home Nest",
      sourceLabel: "nest-kind:home",
    });
  });

  it("authenticates before reading private Session data", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null as any);
    const response = await POST(request("NOTE"));
    expect(response.status).toBe(401);
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it.each([
    ["NOTE", "coachingNote", "mobile-note-"],
    ["TASK", "actionItem", "mobile-task-"],
    ["GOAL", "goal", "mobile-goal-"],
  ] as const)("commits one canonical %s with the Session project and no external side effects", async (kind, model, idPrefix) => {
    signedIn();
    const tx = harness();
    const response = await POST(request(kind));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      idempotentReplay: false,
      entry: { id: `${idPrefix}${requestId}`, kind, callRoomId: "room-1", projectId: "project-1" },
      boundaries: { explicitHumanCapture: true, canonicalRecordCommitted: true, externalCalendarMutated: false, messageSent: false, published: false },
    });
    expect(tx[model].upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: `${idPrefix}${requestId}` },
      update: {},
      create: expect.objectContaining({
        id: `${idPrefix}${requestId}`,
        roomId: "room-1",
        sourceJson: expect.objectContaining({
        schema: "quipsly-mobile-quick-entry-v1",
        clientRequestId: requestId,
        projectId: "project-1",
        actorUserId: "user-1",
        humanCommitted: true,
        externalSideEffects: false,
        }),
      }),
    }));
  });

  it("commits and exactly replays a personal iPhone note as one tagged Home Nest document", async () => {
    signedIn();
    const tx = harness();
    const personalRequest = () => request("NOTE", {
      callRoomId: null,
      title: "Field thought",
      body: "Keep one honest observation in the document kernel.",
      newTagLabels: ["Field note"],
    });

    const first = await POST(personalRequest());
    const firstPayload = await first.json();
    const replay = await POST(personalRequest());
    const replayPayload = await replay.json();

    expect(first.status).toBe(200);
    expect(firstPayload).toMatchObject({
      ok: true,
      idempotentReplay: false,
      entry: {
        id: `mobile-note-${requestId}`,
        kind: "NOTE",
        title: "Field thought",
        body: "Keep one honest observation in the document kernel.",
        callRoomId: null,
        projectId: "project-home",
        destination: "HOME_NEST",
        tags: [{ label: "Field note" }],
      },
      boundaries: {
        explicitHumanCapture: true,
        canonicalRecordCommitted: true,
        messageSent: false,
        published: false,
      },
      nextAction: expect.stringContaining("My Nest"),
    });
    expect(replayPayload).toMatchObject({
      ok: true,
      idempotentReplay: true,
      entry: { id: `mobile-note-${requestId}`, destination: "HOME_NEST" },
    });
    expect(ensureHomeNestForEmail).toHaveBeenCalledWith("person@example.com", expect.anything());
    expect(tx.callRoom.findFirst).not.toHaveBeenCalled();
    expect(tx.studioDocument.create).toHaveBeenCalledTimes(1);
    expect(tx.studioDocument.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        id: `mobile-note-${requestId}`,
        projectId: "project-home",
        stableId: `mobile-document-note-${requestId}`,
        title: "Field thought",
        sourceLabel: "document-kind:note;origin:ios-capture",
        tagRevision: 1,
        documentOperations: {
          create: expect.objectContaining({
            id: `mobile-note-operation-${requestId}`,
            operationType: "personal-note-create",
            origin: "ios-capture",
            payloadJson: expect.objectContaining({
              clientRequestId: requestId,
              callRoomId: null,
              projectId: "project-home",
              actorUserId: "user-1",
              newTagLabels: ["Field note"],
              offlineRetrySafe: true,
            }),
          }),
        },
      }),
    }));
    expect(tx.studioTaggedSpan.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({
        documentId: `mobile-note-${requestId}`,
        blockId: `mobile-note-${requestId}-body`,
        selectedText: "Keep one honest observation in the document kernel.",
        startOffset: 0,
        endOffset: 51,
      })],
      skipDuplicates: true,
    }));
    expect(tx.studioDocumentTagLink.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        documentId: `mobile-note-${requestId}`,
        createdByUserId: "user-1",
        sourceJson: expect.objectContaining({
          schema: "quipsly-record-tag-link-v1",
          surface: "ios-capture",
          explicitHumanCapture: true,
        }),
      })],
      skipDuplicates: true,
    });
  });

  it("commits personal iPhone tasks and goals to the Home Nest without inventing a Session", async () => {
    signedIn();
    const tx = harness();

    const taskResponse = await POST(request("TASK", {
      callRoomId: null,
      title: "Prepare the next episode",
      body: "Turn the open research into one honest outline.",
      dueAt: "2026-07-24T18:00:00.000Z",
      newTagLabels: ["Personal work"],
    }));
    const taskPayload = await taskResponse.json();

    const goalResponse = await POST(request("GOAL", {
      callRoomId: null,
      title: "Publish consistently",
      body: "Use visible weekly evidence instead of vague intention.",
      newTagLabels: ["Personal work"],
    }));
    const goalPayload = await goalResponse.json();

    expect(taskResponse.status).toBe(200);
    expect(taskPayload).toMatchObject({
      ok: true,
      entry: {
        id: `mobile-task-${requestId}`,
        kind: "TASK",
        callRoomId: null,
        sessionTitle: null,
        projectId: "project-home",
        destination: "HOME_NEST",
        tags: [{ label: "Personal work" }],
      },
      nextAction: expect.stringContaining("Home Nest"),
    });
    expect(goalResponse.status).toBe(200);
    expect(goalPayload).toMatchObject({
      ok: true,
      entry: {
        id: `mobile-goal-${requestId}`,
        kind: "GOAL",
        callRoomId: null,
        sessionTitle: null,
        projectId: "project-home",
        destination: "HOME_NEST",
        tags: [{ label: "Personal work" }],
      },
      nextAction: expect.stringContaining("Home Nest"),
    });
    expect(ensureHomeNestForEmail).toHaveBeenCalledTimes(2);
    expect(tx.callRoom.findFirst).not.toHaveBeenCalled();
    expect(tx.actionItem.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        roomId: null,
        projectId: "project-home",
        assignedUserId: "user-1",
        title: "Prepare the next episode",
        sourceJson: expect.objectContaining({
          callRoomId: null,
          projectId: "project-home",
          actorUserId: "user-1",
        }),
      }),
    }));
    expect(tx.goal.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        roomId: null,
        projectId: "project-home",
        ownerUserId: "user-1",
        title: "Publish consistently",
        sourceJson: expect.objectContaining({
          callRoomId: null,
          projectId: "project-home",
          actorUserId: "user-1",
        }),
      }),
    }));
    expect(tx.actionItemTagLink.createMany).toHaveBeenCalledTimes(1);
    expect(tx.goalTagLink.createMany).toHaveBeenCalledTimes(1);
  });

  it("commits a tagged iPhone task directly to one writable Nest without inventing a Session", async () => {
    signedIn();
    const tx = harness();

    const response = await POST(request("TASK", {
      callRoomId: null,
      projectId: "project-direct",
      title: "Prepare the project brief",
      body: "Keep the task and taxonomy in High Ground Odyssey.",
      tagIds: ["tag-episode"],
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      entry: {
        id: `mobile-task-${requestId}`,
        callRoomId: null,
        projectId: "project-direct",
        projectName: "High Ground Odyssey",
        destination: "NEST",
        tags: [{ id: "tag-episode" }],
      },
      nextAction: expect.stringContaining("High Ground Odyssey"),
    });
    expect(ensureHomeNestForEmail).not.toHaveBeenCalled();
    expect(tx.callRoom.findFirst).not.toHaveBeenCalled();
    expect(tx.studioProjectAccessGrant.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        projectId: "project-direct",
        email: "person@example.com",
        status: "ACTIVE",
        role: { in: ["OWNER", "EDITOR"] },
      }),
    }));
    expect(tx.actionItem.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        roomId: null,
        projectId: "project-direct",
        sourceJson: expect.objectContaining({
          callRoomId: null,
          requestedProjectId: "project-direct",
          projectId: "project-direct",
        }),
      }),
    }));
  });

  it("commits direct project notes and goals through their canonical Nest models", async () => {
    signedIn();
    const tx = harness();

    const noteResponse = await POST(request("NOTE", {
      callRoomId: null,
      projectId: "project-direct",
      title: "Episode observation",
      body: "Keep the strongest opening question with the real project.",
    }));
    const goalResponse = await POST(request("GOAL", {
      callRoomId: null,
      projectId: "project-direct",
      title: "Make the next episode useful",
      body: "Ground every recommendation in the recorded conversation.",
    }));

    expect(noteResponse.status).toBe(200);
    await expect(noteResponse.json()).resolves.toMatchObject({
      ok: true,
      entry: {
        id: `mobile-note-${requestId}`,
        title: "Episode observation",
        callRoomId: null,
        projectId: "project-direct",
        projectName: "High Ground Odyssey",
        destination: "NEST",
      },
      nextAction: expect.stringContaining("High Ground Odyssey"),
    });
    expect(goalResponse.status).toBe(200);
    await expect(goalResponse.json()).resolves.toMatchObject({
      ok: true,
      entry: {
        id: `mobile-goal-${requestId}`,
        callRoomId: null,
        projectId: "project-direct",
        projectName: "High Ground Odyssey",
        destination: "NEST",
      },
      nextAction: expect.stringContaining("High Ground Odyssey"),
    });
    expect(ensureHomeNestForEmail).not.toHaveBeenCalled();
    expect(tx.callRoom.findFirst).not.toHaveBeenCalled();
    expect(tx.studioDocument.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        id: `mobile-note-${requestId}`,
        projectId: "project-direct",
        title: "Episode observation",
      }),
    }));
    expect(tx.goal.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        id: `mobile-goal-${requestId}`,
        roomId: null,
        projectId: "project-direct",
        ownerUserId: "user-1",
      }),
    }));
  });

  it("retains direct-project capture when the Nest is no longer writable", async () => {
    signedIn();
    const tx = harness();
    tx.studioProjectAccessGrant.findFirst.mockResolvedValueOnce(null);

    const response = await POST(request("GOAL", {
      callRoomId: null,
      projectId: "project-direct",
      title: "Make the project excellent",
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "QUICK_ENTRY_NEST_FORBIDDEN",
      localOutboxRetained: true,
    });
    expect(tx.goal.upsert).not.toHaveBeenCalled();
  });

  it("retains a personal note on the phone when the signed-in account has no verified email identity", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "user-1", primaryEmail: null, email: null, isStaff: false },
    } as any);
    const response = await POST(request("NOTE", {
      callRoomId: null,
      title: "Private thought",
      body: "Do not invent a Home Nest owner.",
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "QUICK_ENTRY_ACCOUNT_EMAIL_REQUIRED",
      localOutboxRetained: true,
    });
    expect(ensureHomeNestForEmail).not.toHaveBeenCalled();
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("creates a fixed iPhone recurrence through the canonical series and occurrence engine", async () => {
    signedIn();
    const tx = harness();
    const response = await POST(request("TASK", { recurrence: {
      cadence: "FIXED",
      frequency: "WEEKLY",
      interval: 1,
      timezone: "America/Denver",
      localTimeMinutes: 540,
      anchorLocalDate: "2026-07-27",
    } }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      entry: {
        kind: "TASK",
        callRoomId: "room-1",
        recurrence: {
          seriesId: `mobile-task-series-${requestId}`,
          cadence: "FIXED",
          frequency: "WEEKLY",
          timezone: "America/Denver",
          anchorLocalDate: "2026-07-27",
          status: "ACTIVE",
        },
      },
      boundaries: { recurrenceAppOwned: true, recurrenceNotificationsScheduled: false, externalCalendarMutated: false },
      nextAction: expect.stringContaining("no reminder or provider event"),
    });
    expect(tx.taskRecurrenceSeries.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      id: `mobile-task-series-${requestId}`,
      ownerUserId: "user-1",
      projectId: "project-1",
      sourceJson: expect.objectContaining({
        recurrenceRoomId: "room-1",
        clientRequestId: requestId,
        creationReceipt: expect.objectContaining({
          surface: "ios-capture",
          initialMaterializationCount: 3,
          notificationScheduled: false,
          providerCalendarEventCreated: false,
        }),
      }),
    }) });
    expect(tx.actionItem.create).toHaveBeenCalledTimes(3);
    expect(tx.actionItem.create).toHaveBeenCalledWith({ data: expect.objectContaining({ roomId: "room-1", assignedUserId: "user-1" }) });
    expect(tx.taskOccurrence.create).toHaveBeenCalledTimes(3);
  });

  it("commits an explicit one-time task due date without implying a reminder or provider event", async () => {
    signedIn();
    const tx = harness();
    const dueAt = "2026-07-24T15:30:00.000Z";
    const response = await POST(request("TASK", { dueAt }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      entry: { kind: "TASK", dueAt },
      boundaries: {
        dueDateCommitted: true,
        recurrenceAppOwned: false,
        recurrenceNotificationsScheduled: false,
        externalCalendarMutated: false,
      },
      nextAction: expect.stringContaining("No reminder or provider event was scheduled"),
    });
    expect(tx.actionItem.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        dueAt: new Date(dueAt),
        sourceJson: expect.objectContaining({ dueAt }),
      }),
    }));
  });

  it("commits a separate canonical reminder intent while leaving device permission and delivery local", async () => {
    signedIn();
    const tx = harness();
    const dueAt = "2026-07-24T15:30:00.000Z";
    const reminderAt = "2026-07-24T14:30:00.000Z";
    const response = await POST(request("TASK", { dueAt, reminderAt }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      entry: {
        id: `mobile-task-${requestId}`,
        dueAt,
        reminder: {
          id: `mobile-task-reminder-${requestId}`,
          actionItemId: `mobile-task-${requestId}`,
          remindAt: reminderAt,
          status: "ACTIVE",
          deviceNotificationScheduled: false,
        },
      },
      boundaries: {
        canonicalReminderIntentCommitted: true,
        deviceNotificationScheduled: false,
        externalCalendarMutated: false,
        delivered: false,
      },
      nextAction: expect.stringContaining("local notification permission"),
    });
    expect(tx.taskReminder.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: `mobile-task-reminder-${requestId}`,
        actionItemId: `mobile-task-${requestId}`,
        ownerUserId: "user-1",
        remindAt: new Date(reminderAt),
        sourceJson: expect.objectContaining({
          schema: "quipsly-task-reminder-intent-v1",
          explicitHumanIntent: true,
          deviceNotificationScheduled: false,
          deliveryClaimed: false,
        }),
      }),
    });
  });

  it("rejects due dates on non-tasks and alongside a recurrence before opening a transaction", async () => {
    signedIn();
    const note = await POST(request("NOTE", { dueAt: "2026-07-24T15:30:00.000Z" }));
    expect(note.status).toBe(400);
    expect(await note.json()).toMatchObject({ code: "QUICK_ENTRY_DUE_AT_TASK_ONLY" });

    const recurring = await POST(request("TASK", {
      dueAt: "2026-07-24T15:30:00.000Z",
      recurrence: {
        cadence: "FIXED",
        frequency: "WEEKLY",
        interval: 1,
        timezone: "America/Denver",
        localTimeMinutes: 540,
        anchorLocalDate: "2026-07-27",
      },
    }));
    expect(recurring.status).toBe(400);
    expect(await recurring.json()).toMatchObject({ code: "QUICK_ENTRY_DUE_AT_RECURRENCE_CONFLICT" });
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("rejects reminders on non-tasks, malformed dates, and recurrence before opening a transaction", async () => {
    signedIn();
    const note = await POST(request("NOTE", { reminderAt: "2026-07-24T14:30:00.000Z" }));
    expect(note.status).toBe(400);
    expect(await note.json()).toMatchObject({ code: "QUICK_ENTRY_REMINDER_AT_TASK_ONLY" });

    const malformed = await POST(request("TASK", { reminderAt: "tomorrow-ish" }));
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({ code: "QUICK_ENTRY_REMINDER_AT_INVALID" });

    const recurring = await POST(request("TASK", {
      reminderAt: "2026-07-24T14:30:00.000Z",
      recurrence: {
        cadence: "FIXED",
        frequency: "WEEKLY",
        interval: 1,
        timezone: "America/Denver",
        localTimeMinutes: 540,
        anchorLocalDate: "2026-07-27",
      },
    }));
    expect(recurring.status).toBe(400);
    expect(await recurring.json()).toMatchObject({ code: "QUICK_ENTRY_REMINDER_RECURRENCE_CONFLICT" });
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it.each([
    ["NOTE", "coachingNoteTagLink", "noteId", `mobile-note-${requestId}`],
    ["TASK", "actionItemTagLink", "actionItemId", `mobile-task-${requestId}`],
    ["GOAL", "goalTagLink", "goalId", `mobile-goal-${requestId}`],
  ] as const)("attaches only canonical Session-Nest tags to a captured %s", async (kind, linkModel, foreignKey, recordId) => {
    signedIn();
    const tx = harness();
    const response = await POST(request(kind, { tagIds: ["tag-two", "tag-one"] }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(tx.studioTag.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ["tag-one", "tag-two"] }, projectId: "project-1", isActive: true },
    }));
    expect(tx[linkModel].createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ [foreignKey]: recordId, tagId: "tag-one", createdByUserId: "user-1" }),
        expect.objectContaining({ [foreignKey]: recordId, tagId: "tag-two", createdByUserId: "user-1" }),
      ]),
      skipDuplicates: true,
    });
    expect(payload.entry.tags).toEqual([
      { id: "tag-one", slug: "slug-tag-one", label: "Tag tag-one" },
      { id: "tag-two", slug: "slug-tag-two", label: "Tag tag-two" },
    ]);
  });

  it("holds the phone copy when a selected tag is inactive or belongs to another Nest", async () => {
    signedIn();
    const tx = harness();
    tx.studioTag.findMany.mockResolvedValue([{ id: "tag-one", slug: "tag-one", label: "Tag one" }]);
    const response = await POST(request("TASK", { tagIds: ["tag-one", "tag-other-nest"] }));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "QUICK_ENTRY_TAGS_UNAVAILABLE", localOutboxRetained: true });
    expect(tx.actionItem.upsert).not.toHaveBeenCalled();
  });

  it("creates a new private Nest tag atomically with the captured task and returns the canonical identity", async () => {
    signedIn();
    const tx = harness();
    const response = await POST(request("TASK", { newTagLabels: ["Product development"] }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(tx.studioProjectAccessGrant.findFirst).toHaveBeenCalledWith({
      where: {
        projectId: "project-1",
        email: "person@example.com",
        status: "ACTIVE",
        role: { in: ["OWNER", "EDITOR"] },
      },
      select: { id: true },
    });
    expect(tx.studioTag.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: "project-1",
        slug: "product-development",
        label: "Product development",
        isPrivate: true,
        isActive: true,
      }),
      select: {
        id: true,
        projectId: true,
        slug: true,
        label: true,
        category: true,
        isActive: true,
      },
    });
    expect(tx.actionItemTagLink.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        actionItemId: `mobile-task-${requestId}`,
        tagId: "tag-product-development",
        createdByUserId: "user-1",
      })],
      skipDuplicates: true,
    });
    expect(payload).toMatchObject({
      entry: { tags: [{ id: "tag-product-development", slug: "product-development", label: "Product development" }] },
      tagVocabulary: { requestedNewLabels: ["Product development"], createdCount: 1, reusedCount: 0 },
    });
  });

  it("holds a new tag intent when the actor cannot edit the Session Nest", async () => {
    signedIn();
    const tx = harness();
    tx.studioProjectAccessGrant.findFirst.mockResolvedValue(null);
    const response = await POST(request("NOTE", { newTagLabels: ["Client follow-up"] }));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: "QUICK_ENTRY_TAG_CREATE_FORBIDDEN",
      localOutboxRetained: true,
    });
    expect(tx.studioTag.create).not.toHaveBeenCalled();
    expect(tx.coachingNote.upsert).not.toHaveBeenCalled();
  });

  it("rejects duplicate or over-capacity offline tag intents before reading the Session", async () => {
    signedIn();
    const duplicate = await POST(request("TASK", { newTagLabels: ["Product", " product "] }));
    expect(duplicate.status).toBe(400);
    expect(await duplicate.json()).toMatchObject({ code: "QUICK_ENTRY_TAGS_INVALID", localOutboxRetained: true });

    const overCapacity = await POST(request("TASK", {
      tagIds: ["one", "two", "three", "four"],
      newTagLabels: ["Five", "Six", "Seven", "Eight", "Nine"],
    }));
    expect(overCapacity.status).toBe(400);
    expect(await overCapacity.json()).toMatchObject({ code: "QUICK_ENTRY_TAGS_INVALID", localOutboxRetained: true });
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("commits URL and quoted-text source captures to the actor's personal Inbox without requiring a Session", async () => {
    signedIn();
    const tx = harness();
    const bookmarkResponse = await POST(request("SOURCE", { callRoomId: undefined, title: "Useful interview" }));
    expect(await bookmarkResponse.json()).toMatchObject({
      ok: true,
      entry: { id: `mobile-source-${requestId}`, kind: "SOURCE", callRoomId: null, projectId: null, destination: "INBOX", sourceType: "BOOKMARK" },
      sourceCapture: { receiptId: `capture-receipt-${requestId}`, captureCount: 1, sourceIdentityReused: false, capturedAt: "2026-07-19T09:00:00.000Z" },
      boundaries: { externalCalendarMutated: false, providerMutated: false, messageSent: false, published: false },
    });
    expect(tx.callRoom.findFirst).not.toHaveBeenCalled();
    expect(tx.bookmark.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({
      id: `mobile-source-${requestId}`,
      userId: "user-1",
      url: "https://example.com/research",
      metadataJson: expect.objectContaining({ kind: "quipsly-mobile-source-capture-v1", triageStatus: "INBOX", actorUserId: "user-1" }),
    }) }));
    expect(tx.studioPersonalSourceCaptureReceipt.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      createdByUserId: "user-1",
      clientRequestId: requestId,
      captureType: "BOOKMARK",
      bookmarkId: `mobile-source-${requestId}`,
      sourceFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
      captureSnapshotJson: expect.objectContaining({ kind: "quipsly-personal-source-capture-receipt-v1", externalSideEffects: false }),
    }) });

    jest.clearAllMocks();
    signedIn();
    const textTx = harness();
    const textResponse = await POST(request("SOURCE", { callRoomId: undefined, body: "A quoted passage worth reviewing.", sourceUrl: "https://example.com/research#quote" }));
    expect(await textResponse.json()).toMatchObject({
      entry: { sourceType: "SNIPPET", destination: "INBOX", sourceUrl: "https://example.com/research#quote" },
      sourceCapture: { captureCount: 1, sourceIdentityReused: false },
    });
    expect(textTx.snippet.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({
      userId: "user-1",
      highlightedText: "A quoted passage worth reviewing.",
      sourceUrl: "https://example.com/research#quote",
      captureFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
      metadataJson: expect.objectContaining({ captureMode: "PASSAGE_WITH_WEBPAGE", sourceUrl: "https://example.com/research#quote" }),
    }) }));
  });

  it("returns the same record for an exact replay without creating again", async () => {
    signedIn();
    const createdAt = new Date("2026-07-19T09:00:01.000Z");
    const existing = {
      id: `mobile-task-${requestId}`,
      assignedUserId: "user-1",
      roomId: "room-1",
      projectId: "project-1",
      title: "Quick task",
      detail: "Captured deliberately on iPhone.",
      dueAt: null,
      status: "OPEN",
      createdAt,
      updatedAt: createdAt,
      sourceJson: { schema: "quipsly-mobile-quick-entry-v1", origin: "explicit-human-capture", clientRequestId: requestId, callRoomId: "room-1", projectId: "project-1", actorUserId: "user-1", dueAt: null },
    };
    const tx = harness(existing);
    const response = await POST(request("TASK"));
    expect(await response.json()).toMatchObject({ ok: true, idempotentReplay: true, entry: { id: existing.id } });
    expect(tx.actionItem.upsert).not.toHaveBeenCalled();
  });

  it("rejects a changed retry before creating destination tag vocabulary", async () => {
    signedIn();
    const createdAt = new Date("2026-07-19T09:00:01.000Z");
    const existing = {
      id: `mobile-task-${requestId}`,
      assignedUserId: "user-1",
      roomId: "room-1",
      projectId: "project-1",
      title: "Quick task",
      detail: "Captured deliberately on iPhone.",
      dueAt: null,
      status: "OPEN",
      createdAt,
      updatedAt: createdAt,
      sourceJson: {
        schema: "quipsly-mobile-quick-entry-v1",
        origin: "explicit-human-capture",
        clientRequestId: requestId,
        callRoomId: "room-1",
        projectId: "project-1",
        actorUserId: "user-1",
        tagIds: [],
        newTagLabels: [],
        dueAt: null,
        reminderAt: null,
      },
    };
    const tx = harness(existing);
    const response = await POST(request("TASK", {
      title: "Changed title",
      newTagLabels: ["Must not be created"],
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "QUICK_ENTRY_IDENTITY_CONFLICT",
      localOutboxRetained: true,
    });
    expect(tx.studioTag.create).not.toHaveBeenCalled();
    expect(tx.actionItem.upsert).not.toHaveBeenCalled();
  });

  it("holds a changed same-ID task retry instead of accepting different due-date intent", async () => {
    signedIn();
    const createdAt = new Date("2026-07-19T09:00:01.000Z");
    const existingDueAt = new Date("2026-07-24T15:30:00.000Z");
    const existing = {
      id: `mobile-task-${requestId}`,
      assignedUserId: "user-1",
      roomId: "room-1",
      projectId: "project-1",
      title: "Quick task",
      detail: "Captured deliberately on iPhone.",
      dueAt: existingDueAt,
      status: "OPEN",
      createdAt,
      updatedAt: createdAt,
      sourceJson: {
        schema: "quipsly-mobile-quick-entry-v1",
        origin: "explicit-human-capture",
        clientRequestId: requestId,
        callRoomId: "room-1",
        projectId: "project-1",
        actorUserId: "user-1",
        dueAt: existingDueAt.toISOString(),
      },
    };
    const tx = harness(existing);
    const response = await POST(request("TASK", { dueAt: "2026-07-25T15:30:00.000Z" }));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "QUICK_ENTRY_IDENTITY_CONFLICT",
      localOutboxRetained: true,
    });
    expect(tx.actionItem.upsert).not.toHaveBeenCalled();
  });

  it("reuses source identity for a distinct deliberate capture while adding a new receipt", async () => {
    signedIn();
    const createdAt = new Date("2026-07-18T08:00:00.000Z");
    const existingBookmark = {
      id: "existing-bookmark",
      userId: "user-1",
      title: "Earlier title",
      url: "https://example.com/research",
      createdAt,
      updatedAt: createdAt,
    };
    const tx = harness();
    tx.bookmark.findUnique.mockResolvedValue(null);
    tx.bookmark.upsert.mockResolvedValue(existingBookmark);
    tx.studioPersonalSourceCaptureReceipt.count.mockResolvedValue(2);

    const response = await POST(request("SOURCE", { callRoomId: undefined, title: "Useful interview" }));
    expect(await response.json()).toMatchObject({
      ok: true,
      idempotentReplay: false,
      entry: { id: "existing-bookmark", sourceType: "BOOKMARK" },
      sourceCapture: { captureCount: 2, sourceIdentityReused: true },
    });
    expect(tx.bookmark.upsert).toHaveBeenCalledTimes(1);
    expect(tx.studioPersonalSourceCaptureReceipt.create).toHaveBeenCalledTimes(1);
  });

  it("deduplicates the same quoted passage even when its earlier capture has another request identity", async () => {
    signedIn();
    const createdAt = new Date("2026-07-18T08:00:00.000Z");
    const existingSnippet = {
      id: "existing-snippet",
      userId: "user-1",
      sourceTitle: "Earlier quote",
      sourceUrl: "https://example.com/research#quote",
      highlightedText: "A quoted passage worth reviewing.",
      metadataJson: { clientRequestId: "another-request-id" },
      createdAt,
      updatedAt: createdAt,
    };
    const tx = harness();
    tx.snippet.findFirst.mockResolvedValue(existingSnippet);
    tx.studioPersonalSourceCaptureReceipt.count.mockResolvedValue(2);

    const response = await POST(request("SOURCE", {
      callRoomId: undefined,
      body: "A quoted passage worth reviewing.",
      sourceUrl: "https://example.com/research#quote",
    }));
    expect(await response.json()).toMatchObject({
      ok: true,
      idempotentReplay: false,
      entry: { id: "existing-snippet", sourceType: "SNIPPET" },
      sourceCapture: { captureCount: 2, sourceIdentityReused: true },
    });
    expect(tx.snippet.upsert).not.toHaveBeenCalled();
    expect(tx.studioPersonalSourceCaptureReceipt.create).toHaveBeenCalledTimes(1);
  });

  it("replays one serializable uniqueness race instead of leaking a transient server error", async () => {
    signedIn();
    const tx = harness();
    let attempt = 0;
    const transaction = jest.fn(async (callback: (client: typeof tx) => unknown) => {
      attempt += 1;
      if (attempt === 1) throw { code: "P2034" };
      return callback(tx);
    });
    jest.mocked(getPrismaClient).mockReturnValue({ $transaction: transaction } as any);

    const response = await POST(request("SOURCE", { callRoomId: undefined }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, entry: { sourceType: "BOOKMARK" }, sourceCapture: { captureCount: 1 } });
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it("keeps the phone copy when Session access is gone", async () => {
    signedIn();
    const tx = harness();
    tx.callRoom.findFirst.mockResolvedValue(null);
    const response = await POST(request("NOTE"));
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "QUICK_ENTRY_SESSION_NOT_FOUND", localOutboxRetained: true });
    expect(tx.coachingNote.upsert).not.toHaveBeenCalled();
  });

  it("rejects malformed input before opening a transaction", async () => {
    signedIn();
    const prisma = { $transaction: jest.fn() };
    jest.mocked(getPrismaClient).mockReturnValue(prisma as any);
    const response = await POST(request("TASK", { clientRequestId: "unstable", title: "" }));
    expect(response.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
