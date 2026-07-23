/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
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
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ lockAcquired: false }]),
    callRoom: { findFirst: jest.fn().mockResolvedValue(room) },
    studioTag: {
      findMany: jest.fn(async ({ where }: any) => (where.id.in as string[]).map((id) => ({ id, slug: `slug-${id}`, label: `Tag ${id}` }))),
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
  beforeEach(() => jest.clearAllMocks());

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
      title: "Quick task",
      detail: "Captured deliberately on iPhone.",
      status: "OPEN",
      createdAt,
      updatedAt: createdAt,
      sourceJson: { schema: "quipsly-mobile-quick-entry-v1", origin: "explicit-human-capture", clientRequestId: requestId, callRoomId: "room-1", actorUserId: "user-1" },
    };
    const tx = harness(existing);
    const response = await POST(request("TASK"));
    expect(await response.json()).toMatchObject({ ok: true, idempotentReplay: true, entry: { id: existing.id } });
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
