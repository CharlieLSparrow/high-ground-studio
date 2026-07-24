/** @jest-environment node */

jest.mock("@/lib/prisma", () => ({
  getPrismaClient: jest.fn(),
}));

jest.mock("@/lib/server/quipsly-session", () => ({
  getQuipslySessionFromRequest: jest.fn(),
}));

import { getPrismaClient } from "@/lib/prisma";
import { CAPTURE_SESSION_CONTEXT_SOURCE } from "@/lib/server/mobile-capture-session-context";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { GET, POST } from "./route";

const USER_ID = "context-owner";
const ROOM_ID = "room-context-v2";
const session = {
  user: {
    id: USER_ID,
    primaryEmail: "owner@example.com",
    name: "Owner",
    isStaff: false,
  },
};

function request(payload: Record<string, unknown>) {
  return new Request("http://localhost/api/mobile/capture/sessions/context", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ callRoomId: ROOM_ID, ...payload }),
  });
}

function getRequest() {
  return new Request(`http://localhost/api/mobile/capture/sessions/context?callRoomId=${ROOM_ID}`);
}

function createInMemoryPrisma(initialContext: unknown = {}) {
  let sequence = 0;
  let room = {
    id: ROOM_ID,
    bookingId: "booking-1",
    projectId: "project-1",
    createdByUserId: USER_ID,
    title: "Homer coaching session",
    purpose: "COACHING",
    status: "PLANNED",
    metadataJson: { captureSessionContext: initialContext },
    updatedAt: new Date("2026-07-18T12:00:00.000Z"),
  };
  const notes: any[] = [];
  const tasks: any[] = [];
  const goals: any[] = [];

  const tx: any = {
    callRoom: {
      findFirst: jest.fn(async () => ({ ...room })),
      updateMany: jest.fn(async ({ where, data }: any) => {
        if (where.id !== room.id || where.updatedAt.getTime() !== room.updatedAt.getTime()) return { count: 0 };
        room = {
          ...room,
          ...data,
          updatedAt: new Date(room.updatedAt.getTime() + 1_000),
        };
        return { count: 1 };
      }),
    },
    coachingNote: {
      findMany: jest.fn(async () => notes.map((item) => ({ ...item }))),
      create: jest.fn(async ({ data }: any) => {
        const created = {
          id: `note-${++sequence}`,
          createdAt: new Date(),
          ...data,
        };
        notes.push(created);
        return { ...created };
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const item = notes.find((candidate) => candidate.id === where.id && candidate.roomId === where.roomId);
        if (!item) return { count: 0 };
        Object.assign(item, data);
        return { count: 1 };
      }),
    },
    actionItem: {
      findMany: jest.fn(async () => tasks.map((item) => ({ ...item }))),
      create: jest.fn(async ({ data }: any) => {
        const created = {
          id: `task-${++sequence}`,
          completedAt: null,
          createdAt: new Date(),
          ...data,
        };
        tasks.push(created);
        return { ...created };
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const item = tasks.find((candidate) => candidate.id === where.id && candidate.roomId === where.roomId);
        if (!item) return { count: 0 };
        Object.assign(item, data);
        return { count: 1 };
      }),
    },
    goal: {
      findMany: jest.fn(async () => goals.map((item) => ({ ...item }))),
      create: jest.fn(async ({ data }: any) => {
        const created = {
          id: `goal-${++sequence}`,
          description: null,
          achievedAt: null,
          createdAt: new Date(),
          ...data,
        };
        goals.push(created);
        return { ...created };
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const item = goals.find((candidate) => candidate.id === where.id && candidate.roomId === where.roomId);
        if (!item) return { count: 0 };
        Object.assign(item, data);
        return { count: 1 };
      }),
    },
  };

  const prisma = {
    ...tx,
    $transaction: jest.fn(async (callback: (client: any) => Promise<unknown>) => callback(tx)),
  };

  return {
    prisma,
    notes,
    tasks,
    goals,
    room: () => room,
  };
}

describe("capture session context v2", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(session as never);
  });

  it("fails closed before opening Prisma when no signed-in user exists", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null);

    const response = await POST(request({ note: "private note", goals: [], tasks: [] }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ ok: false, code: "UNAUTHORIZED" });
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("rejects an omitted replacement instead of interpreting it as delete all", async () => {
    const response = await POST(request({}));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "SESSION_CONTEXT_REPLACEMENT_REQUIRED",
      localDraftAllowed: true,
    });
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("rejects partial and malformed legacy replacements before mutation", async () => {
    const partial = await POST(request({ note: "Do not erase the rest" }));
    expect(partial.status).toBe(400);
    await expect(partial.json()).resolves.toMatchObject({
      code: "SESSION_CONTEXT_REPLACEMENT_INCOMPLETE",
    });

    const malformed = await POST(request({
      note: "Complete keys, bad list",
      goals: ["valid", { text: "not a legacy string" }],
      tasks: [],
    }));
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toMatchObject({
      code: "SESSION_CONTEXT_LIST_INVALID",
    });
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("rejects contradictory legacy and structured replacements", async () => {
    const response = await POST(request({
      note: "Same note",
      goals: ["Legacy goal"],
      tasks: [],
      entries: {
        note: { kind: "quick-note", text: "Same note", position: 0 },
        goals: [{ kind: "goal", text: "Different structured goal", position: 0 }],
        tasks: [],
      },
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "SESSION_CONTEXT_REPLACEMENT_MISMATCH",
    });
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("accepts a complete structured-only v2 replacement", async () => {
    const state = createInMemoryPrisma();
    jest.mocked(getPrismaClient).mockReturnValue(state.prisma as never);

    const response = await POST(request({
      entries: {
        note: { kind: "quick-note", text: "Structured note", position: 0 },
        goals: [{ kind: "goal", text: "Structured goal", position: 0 }],
        tasks: [{ kind: "task", text: "Structured task", position: 0 }],
      },
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.context).toMatchObject({
      note: "Structured note",
      goals: ["Structured goal"],
      tasks: ["Structured task"],
    });
    expect(state.notes).toHaveLength(2);
    expect(state.tasks).toHaveLength(1);
    expect(state.goals).toHaveLength(1);
  });

  it("returns not found and makes no projection when room access is denied", async () => {
    const state = createInMemoryPrisma();
    state.prisma.callRoom.findFirst.mockResolvedValue(null);
    jest.mocked(getPrismaClient).mockReturnValue(state.prisma as never);

    const response = await POST(request({ note: "private note", goals: [], tasks: [] }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ ok: false, code: "CALL_ROOM_NOT_FOUND" });
    expect(state.prisma.coachingNote.create).not.toHaveBeenCalled();
    expect(state.prisma.actionItem.create).not.toHaveBeenCalled();
    expect(state.prisma.callRoom.updateMany).not.toHaveBeenCalled();
  });

  it("upgrades legacy strings to stable structured entries without mutating on GET", async () => {
    const state = createInMemoryPrisma({
      note: "Prepare the coaching arc",
      goals: ["Name the real decision"],
      tasks: ["Send the recap"],
      updatedAt: "2026-07-18T11:00:00.000Z",
    });
    jest.mocked(getPrismaClient).mockReturnValue(state.prisma as never);

    const first = await GET(getRequest());
    const second = await GET(getRequest());
    const firstBody = await first.json();
    const secondBody = await second.json();

    expect(first.status).toBe(200);
    expect(firstBody.context).toMatchObject({
      schemaVersion: 2,
      note: "Prepare the coaching arc",
      goals: ["Name the real decision"],
      tasks: ["Send the recap"],
      entries: {
        note: { kind: "quick-note", text: "Prepare the coaching arc" },
        goals: [{ kind: "goal", text: "Name the real decision" }],
        tasks: [{ kind: "task", text: "Send the recap" }],
      },
    });
    expect(firstBody.context.revisionId).toBe(secondBody.context.revisionId);
    expect(firstBody.context.entries.goals[0].id).toBe(secondBody.context.entries.goals[0].id);
    expect(state.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("projects one explicit revision transactionally and makes exact resaves idempotent", async () => {
    const state = createInMemoryPrisma();
    jest.mocked(getPrismaClient).mockReturnValue(state.prisma as never);

    const first = await POST(request({
      note: "Capture the decision in the client's own language.",
      goals: ["Choose one next move"],
      tasks: ["Send a two-sentence follow-up"],
    }));
    const firstBody = await first.json();

    expect(first.status).toBe(200);
    expect(firstBody).toMatchObject({
      ok: true,
      saved: true,
      unchanged: false,
      durableProjections: true,
      projectionStats: { notesCreated: 2, goalsCreated: 1, tasksCreated: 1 },
    });
    expect(firstBody.context.revisionId).not.toMatch(/^legacy-/);
    expect(firstBody.context.entries.note.projectionId).toBe(state.notes[0].id);
    expect(firstBody.context.entries.tasks[0].projectionId).toBe(state.tasks[0].id);
    expect(state.notes).toHaveLength(2);
    expect(state.tasks).toHaveLength(1);
    expect(state.goals).toHaveLength(1);
    expect(state.notes[0].sourceJson.source).toBe(CAPTURE_SESSION_CONTEXT_SOURCE);
    expect(state.tasks[0].sourceJson.source).toBe(CAPTURE_SESSION_CONTEXT_SOURCE);
    expect(state.tasks[0].projectId).toBe("project-1");
    expect(state.goals[0].projectId).toBe("project-1");
    expect(state.goals[0].sourceJson).toMatchObject({
      source: CAPTURE_SESSION_CONTEXT_SOURCE,
      contextKind: "goal",
      legacyCoachingNoteId: state.notes[1].id,
    });

    const resave = await POST(request({
      revisionId: firstBody.context.revisionId,
      note: firstBody.context.note,
      goals: firstBody.context.goals,
      tasks: firstBody.context.tasks,
      entries: firstBody.context.entries,
    }));
    const resaveBody = await resave.json();

    expect(resave.status).toBe(200);
    expect(resaveBody).toMatchObject({ saved: true, unchanged: true });
    expect(resaveBody.context.revisionId).toBe(firstBody.context.revisionId);
    expect(state.notes).toHaveLength(2);
    expect(state.tasks).toHaveLength(1);
    expect(state.goals).toHaveLength(1);
  });

  it("reconciles a legacy string-array edit by exact text and then position", async () => {
    const state = createInMemoryPrisma();
    jest.mocked(getPrismaClient).mockReturnValue(state.prisma as never);

    const first = await POST(request({
      note: "Working note",
      goals: ["First goal", "Unchanged goal"],
      tasks: [],
    }));
    const firstBody = await first.json();
    const firstGoal = firstBody.context.entries.goals[0];
    const unchangedGoal = firstBody.context.entries.goals[1];

    const edited = await POST(request({
      revisionId: firstBody.context.revisionId,
      note: "Working note",
      goals: ["First goal, clarified", "Unchanged goal"],
      tasks: [],
      // Intentionally omit entries to exercise the installed string client.
    }));
    const editedBody = await edited.json();

    expect(edited.status).toBe(200);
    expect(editedBody.context.entries.goals[0]).toMatchObject({
      id: firstGoal.id,
      projectionId: firstGoal.projectionId,
      text: "First goal, clarified",
    });
    expect(editedBody.context.entries.goals[1]).toMatchObject({
      id: unchangedGoal.id,
      projectionId: unchangedGoal.projectionId,
      text: "Unchanged goal",
    });
    expect(state.notes).toHaveLength(3);
    expect(state.notes.filter((note) => note.sourceJson.active !== false)).toHaveLength(3);
    expect(state.goals).toHaveLength(2);
    expect(state.goals.every((goal) => goal.sourceJson.active !== false)).toBe(true);
  });

  it("returns both versions on a stale save and performs no stale projection mutation", async () => {
    const state = createInMemoryPrisma();
    jest.mocked(getPrismaClient).mockReturnValue(state.prisma as never);

    const first = await POST(request({ note: "Phone base", goals: ["Base goal"], tasks: [] }));
    const firstBody = await first.json();
    const second = await POST(request({
      revisionId: firstBody.context.revisionId,
      note: "Nest edit",
      goals: ["Current goal"],
      tasks: [],
    }));
    const secondBody = await second.json();
    const noteWritesBeforeConflict = state.prisma.coachingNote.updateMany.mock.calls.length;

    const stale = await POST(request({
      revisionId: firstBody.context.revisionId,
      note: "Offline phone edit",
      goals: ["Base goal"],
      tasks: ["Offline task"],
    }));
    const staleBody = await stale.json();

    expect(secondBody.context.revisionId).not.toBe(firstBody.context.revisionId);
    expect(stale.status).toBe(409);
    expect(staleBody).toMatchObject({
      ok: false,
      conflict: true,
      code: "SESSION_CONTEXT_STALE_REVISION",
      revisionId: secondBody.context.revisionId,
      submittedRevisionId: firstBody.context.revisionId,
      remoteContext: { note: "Nest edit", goals: ["Current goal"] },
      localContext: { note: "Offline phone edit", tasks: ["Offline task"] },
    });
    expect(state.prisma.coachingNote.updateMany).toHaveBeenCalledTimes(noteWritesBeforeConflict);
    expect(state.tasks).toHaveLength(0);
  });

  it("archives note and goal evidence while canceling only removed OPEN context tasks", async () => {
    const state = createInMemoryPrisma();
    jest.mocked(getPrismaClient).mockReturnValue(state.prisma as never);

    const first = await POST(request({
      note: "Keep this source note",
      goals: ["Keep this source goal"],
      tasks: ["Open follow-up", "Already completed follow-up"],
    }));
    const firstBody = await first.json();
    state.tasks[1].status = "DONE";
    state.tasks[1].completedAt = new Date("2026-07-18T13:00:00.000Z");

    const removed = await POST(request({
      revisionId: firstBody.context.revisionId,
      note: "",
      goals: [],
      tasks: [],
      entries: { note: null, goals: [], tasks: [] },
    }));
    const removedBody = await removed.json();

    expect(removed.status).toBe(200);
    expect(removedBody.projectionStats).toMatchObject({
      notesArchived: 2,
      goalsArchived: 1,
      tasksCanceled: 1,
      tasksArchived: 1,
    });
    expect(state.notes.every((note) => note.sourceJson.active === false && note.body.includes("Keep this source"))).toBe(true);
    expect(state.tasks[0].status).toBe("CANCELED");
    expect(state.tasks[1].status).toBe("DONE");
    expect(state.tasks[1].completedAt).toEqual(new Date("2026-07-18T13:00:00.000Z"));
    expect(state.tasks.every((task) => task.sourceJson.active === false)).toBe(true);
    expect(state.goals).toHaveLength(1);
    expect(state.goals[0]).toMatchObject({ status: "ARCHIVED", achievedAt: null });
    expect(state.goals[0].sourceJson.active).toBe(false);
  });
});
