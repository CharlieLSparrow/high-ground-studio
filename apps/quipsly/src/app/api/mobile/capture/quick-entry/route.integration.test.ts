/** @jest-environment node */

import { randomUUID } from "node:crypto";

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { ensureStudioWorkspace } from "@/lib/studio/project-registry";
import { loadLibrary } from "@/app/(app)/library/page";

import { POST } from "./route";

jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));

const runLocalDatabaseSmoke = process.env.QUIPSLY_LOCAL_DB_SMOKE === "1" ? describe : describe.skip;
if (process.env.QUIPSLY_LOCAL_DB_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) throw new Error("QUIPSLY_LOCAL_DATABASE_URL is required for the quick-entry smoke.");
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

runLocalDatabaseSmoke("iPhone quick-entry local database smoke", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID().slice(0, 8);
  const actorEmail = `quick-entry-${nonce}@example.test`;
  const outsiderEmail = `quick-entry-outsider-${nonce}@example.test`;
  let actorUserId = "";
  let outsiderUserId = "";
  let projectId = "";
  let tagId = "";
  let roomId = "";
  const requestIds = Array.from({ length: 10 }, () => randomUUID());

  beforeAll(async () => {
    const [actor, outsider] = await Promise.all([
      prisma.user.create({ data: { primaryEmail: actorEmail, name: "Quick capture actor" } }),
      prisma.user.create({ data: { primaryEmail: outsiderEmail, name: "Quick capture outsider" } }),
    ]);
    actorUserId = actor.id;
    outsiderUserId = outsider.id;
    const workspace = await ensureStudioWorkspace(prisma);
    const project = await prisma.studioProject.create({ data: { workspaceId: workspace.id, slug: `quick-entry-${nonce}`, name: "Quick capture Nest" } });
    projectId = project.id;
    const tag = await prisma.studioTag.create({ data: { projectId, slug: `follow-through-${nonce}`, label: "Follow through" } });
    tagId = tag.id;
    await prisma.studioProjectAccessGrant.create({ data: { projectId, email: actorEmail, role: "EDITOR", status: "ACTIVE", createdByUserId: actorUserId, createdByEmail: actorEmail } });
    const room = await prisma.callRoom.create({ data: { createdByUserId: actorUserId, projectId, title: "Episode quick capture" } });
    roomId = room.id;
  });

  afterAll(async () => {
    try {
      await prisma.goal.deleteMany({ where: { id: { in: requestIds.map((id) => `mobile-goal-${id}`) } } });
      await prisma.taskRecurrenceSeries.deleteMany({ where: { id: { in: requestIds.map((id) => `mobile-task-series-${id}`) } } });
      if (actorUserId) await prisma.actionItem.deleteMany({ where: { assignedUserId: actorUserId, projectId } });
      if (roomId) await prisma.callRoom.deleteMany({ where: { id: roomId } });
      if (projectId) await prisma.studioProject.deleteMany({ where: { id: projectId } });
      if (actorUserId || outsiderUserId) await prisma.user.deleteMany({ where: { id: { in: [actorUserId, outsiderUserId].filter(Boolean) } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  function signedInAs(id: string, email: string) {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: { id, primaryEmail: email, isStaff: false } } as any);
  }

  function post(kind: "NOTE" | "TASK" | "GOAL" | "SOURCE", requestId: string, title: string | null, body: string, sourceUrl?: string, capturedAt = "2026-07-19T09:00:00.000Z", tagIds: string[] = []) {
    return POST(new Request("http://localhost/api/mobile/capture/quick-entry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientRequestId: requestId, callRoomId: kind === "SOURCE" ? null : roomId, kind, title, body, sourceUrl, capturedAt, tagIds }),
    }));
  }

  it("commits Note, Task, and Goal once, replays one task idempotently, and denies another account", async () => {
    signedInAs(actorUserId, actorEmail);
    const noteResponse = await post("NOTE", requestIds[0], null, "Let the opening breathe before the first cut.", undefined, undefined, [tagId]);
    const taskResponse = await post("TASK", requestIds[1], "Proof-listen act one", "Use the immutable room mix.", undefined, undefined, [tagId]);
    const goalResponse = await post("GOAL", requestIds[2], "Make episode follow-through obvious", "Every promise returns to source evidence.", undefined, undefined, [tagId]);
    const taskReplayResponse = await post("TASK", requestIds[1], "Proof-listen act one", "Use the immutable room mix.", undefined, undefined, [tagId]);

    expect(await noteResponse.json()).toMatchObject({ ok: true, idempotentReplay: false, entry: { id: `mobile-note-${requestIds[0]}`, projectId, tags: [{ id: tagId, label: "Follow through" }] } });
    expect(await taskResponse.json()).toMatchObject({ ok: true, idempotentReplay: false, entry: { id: `mobile-task-${requestIds[1]}`, projectId, status: "OPEN", tags: [{ id: tagId, label: "Follow through" }] } });
    expect(await goalResponse.json()).toMatchObject({ ok: true, idempotentReplay: false, entry: { id: `mobile-goal-${requestIds[2]}`, projectId, status: "ACTIVE", tags: [{ id: tagId, label: "Follow through" }] } });
    expect(await taskReplayResponse.json()).toMatchObject({ ok: true, idempotentReplay: true, entry: { id: `mobile-task-${requestIds[1]}` } });

    const [note, task, goal, taskCount, noteTags, taskTags, goalTags] = await Promise.all([
      prisma.coachingNote.findUniqueOrThrow({ where: { id: `mobile-note-${requestIds[0]}` } }),
      prisma.actionItem.findUniqueOrThrow({ where: { id: `mobile-task-${requestIds[1]}` } }),
      prisma.goal.findUniqueOrThrow({ where: { id: `mobile-goal-${requestIds[2]}` } }),
      prisma.actionItem.count({ where: { id: `mobile-task-${requestIds[1]}` } }),
      prisma.coachingNoteTagLink.findMany({ where: { noteId: `mobile-note-${requestIds[0]}` } }),
      prisma.actionItemTagLink.findMany({ where: { actionItemId: `mobile-task-${requestIds[1]}` } }),
      prisma.goalTagLink.findMany({ where: { goalId: `mobile-goal-${requestIds[2]}` } }),
    ]);
    expect(note).toMatchObject({ roomId, authorUserId: actorUserId, body: "Let the opening breathe before the first cut.", sourceJson: { schema: "quipsly-mobile-quick-entry-v1", humanCommitted: true, externalSideEffects: false } });
    expect(task).toMatchObject({ roomId, projectId, assignedUserId: actorUserId, status: "OPEN" });
    expect(goal).toMatchObject({ roomId, projectId, ownerUserId: actorUserId, status: "ACTIVE" });
    expect(taskCount).toBe(1);
    expect(noteTags).toHaveLength(1);
    expect(taskTags).toHaveLength(1);
    expect(goalTags).toHaveLength(1);
    expect([noteTags[0]?.tagId, taskTags[0]?.tagId, goalTags[0]?.tagId]).toEqual([tagId, tagId, tagId]);

    const library = await loadLibrary(actorUserId, actorEmail, false);
    expect(library.entries.find((entry) => entry.id === `note:${note.id}`)).toMatchObject({
      kind: "NOTE",
      href: `/sessions/${roomId}#quick-entry-${note.id}`,
      projectName: "Quick capture Nest",
      stateLabel: "iPhone capture",
      badges: expect.arrayContaining(["#Follow through", "Offline retry safe"]),
    });
    expect(library.counts.notes).toBe(1);

    signedInAs(outsiderUserId, outsiderEmail);
    const denied = await post("NOTE", requestIds[3], null, "This must not cross accounts.");
    expect(denied.status).toBe(404);
    await expect(prisma.coachingNote.count({ where: { id: `mobile-note-${requestIds[3]}` } })).resolves.toBe(0);
  });

  it("deduplicates personal source identities while preserving every distinct capture receipt", async () => {
    signedInAs(actorUserId, actorEmail);
    const bookmarkResponse = await post("SOURCE", requestIds[4], "Coaching evidence", "https://example.com/coaching-evidence");
    const snippetResponse = await post("SOURCE", requestIds[5], "Opening quote", "Let the question breathe before answering it.", "https://example.com/coaching-evidence#opening");
    const bookmarkReplay = await post("SOURCE", requestIds[4], "Coaching evidence", "https://example.com/coaching-evidence");
    const bookmarkRecapture = await post("SOURCE", requestIds[6], "Coaching evidence revisited", "https://example.com/coaching-evidence", undefined, "2026-07-19T10:00:00.000Z");
    const snippetRecapture = await post("SOURCE", requestIds[7], "Opening quote revisited", "Let the question breathe before answering it.", "https://example.com/coaching-evidence#opening", "2026-07-19T11:00:00.000Z");

    expect(await bookmarkResponse.json()).toMatchObject({ ok: true, idempotentReplay: false, entry: { id: `mobile-source-${requestIds[4]}`, destination: "INBOX", sourceType: "BOOKMARK", callRoomId: null }, sourceCapture: { captureCount: 1, sourceIdentityReused: false } });
    expect(await snippetResponse.json()).toMatchObject({ ok: true, idempotentReplay: false, entry: { id: `mobile-source-${requestIds[5]}`, destination: "INBOX", sourceType: "SNIPPET", callRoomId: null }, sourceCapture: { captureCount: 1, sourceIdentityReused: false } });
    expect(await bookmarkReplay.json()).toMatchObject({ ok: true, idempotentReplay: true, entry: { id: `mobile-source-${requestIds[4]}` }, sourceCapture: { captureCount: 1, sourceIdentityReused: true } });
    expect(await bookmarkRecapture.json()).toMatchObject({ ok: true, idempotentReplay: false, entry: { id: `mobile-source-${requestIds[4]}` }, sourceCapture: { captureCount: 2, sourceIdentityReused: true, capturedAt: "2026-07-19T10:00:00.000Z" } });
    expect(await snippetRecapture.json()).toMatchObject({ ok: true, idempotentReplay: false, entry: { id: `mobile-source-${requestIds[5]}` }, sourceCapture: { captureCount: 2, sourceIdentityReused: true, capturedAt: "2026-07-19T11:00:00.000Z" } });

    await expect(prisma.bookmark.findUnique({ where: { id: `mobile-source-${requestIds[4]}` }, select: { userId: true, url: true, metadataJson: true } })).resolves.toMatchObject({
      userId: actorUserId,
      url: "https://example.com/coaching-evidence",
      metadataJson: { kind: "quipsly-mobile-source-capture-v1", triageStatus: "INBOX", actorUserId },
    });
    await expect(prisma.snippet.findUnique({ where: { id: `mobile-source-${requestIds[5]}` }, select: { userId: true, highlightedText: true, sourceUrl: true, metadataJson: true } })).resolves.toMatchObject({
      userId: actorUserId,
      highlightedText: "Let the question breathe before answering it.",
      sourceUrl: "https://example.com/coaching-evidence#opening",
      metadataJson: { captureMode: "PASSAGE_WITH_WEBPAGE", capturedAt: "2026-07-19T09:00:00.000Z", actorUserId },
    });
    await expect(prisma.bookmark.count({ where: { userId: actorUserId, url: "https://example.com/coaching-evidence" } })).resolves.toBe(1);
    await expect(prisma.snippet.count({ where: { userId: actorUserId, highlightedText: "Let the question breathe before answering it.", sourceUrl: "https://example.com/coaching-evidence#opening" } })).resolves.toBe(1);
    await expect(prisma.studioPersonalSourceCaptureReceipt.count({ where: { bookmarkId: `mobile-source-${requestIds[4]}` } })).resolves.toBe(2);
    await expect(prisma.studioPersonalSourceCaptureReceipt.count({ where: { snippetId: `mobile-source-${requestIds[5]}` } })).resolves.toBe(2);
  });

  it("authors fixed and completion series from iPhone with retry-safe exact occurrences", async () => {
    signedInAs(actorUserId, actorEmail);
    const recurrenceRequest = (requestId: string, cadence: "FIXED" | "COMPLETION", frequency: "WEEKLY" | "DAILY", anchorLocalDate: string) => POST(new Request("http://localhost/api/mobile/capture/quick-entry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientRequestId: requestId,
        callRoomId: roomId,
        kind: "TASK",
        title: cadence === "FIXED" ? "Weekly iPhone production review" : "Coaching reflection after completion",
        body: "Return to the retained Session evidence.",
        capturedAt: "2026-07-19T12:00:00.000Z",
        recurrence: { cadence, frequency, interval: 1, timezone: "America/Denver", localTimeMinutes: cadence === "FIXED" ? 540 : 1200, anchorLocalDate },
      }),
    }));

    const fixed = await recurrenceRequest(requestIds[8], "FIXED", "WEEKLY", "2026-07-27");
    const completion = await recurrenceRequest(requestIds[9], "COMPLETION", "DAILY", "2026-07-20");
    const fixedReplay = await recurrenceRequest(requestIds[8], "FIXED", "WEEKLY", "2026-07-27");
    const [fixedPayload, completionPayload, replayPayload] = await Promise.all([fixed.json(), completion.json(), fixedReplay.json()]);

    expect(fixedPayload).toMatchObject({ ok: true, idempotentReplay: false, entry: { callRoomId: roomId, recurrence: { seriesId: `mobile-task-series-${requestIds[8]}`, cadence: "FIXED" } } });
    expect(completionPayload).toMatchObject({ ok: true, idempotentReplay: false, entry: { callRoomId: roomId, recurrence: { seriesId: `mobile-task-series-${requestIds[9]}`, cadence: "COMPLETION" } } });
    expect(replayPayload).toMatchObject({ ok: true, idempotentReplay: true, entry: { id: fixedPayload.entry.id } });

    const [fixedSeries, completionSeries] = await Promise.all([
      prisma.taskRecurrenceSeries.findUniqueOrThrow({ where: { id: `mobile-task-series-${requestIds[8]}` }, include: { occurrences: { include: { actionItem: true }, orderBy: { scheduledFor: "asc" } } } }),
      prisma.taskRecurrenceSeries.findUniqueOrThrow({ where: { id: `mobile-task-series-${requestIds[9]}` }, include: { occurrences: { include: { actionItem: true }, orderBy: { scheduledFor: "asc" } } } }),
    ]);
    expect(fixedSeries.occurrences).toHaveLength(3);
    expect(fixedSeries.occurrences.map((occurrence) => occurrence.actionItem?.roomId)).toEqual([roomId, roomId, roomId]);
    expect(fixedSeries.occurrences.map((occurrence) => occurrence.occurrenceKey)).toEqual([
      "2026-07-27T09:00[America/Denver]",
      "2026-08-03T09:00[America/Denver]",
      "2026-08-10T09:00[America/Denver]",
    ]);
    expect(completionSeries.occurrences).toHaveLength(1);
    expect(completionSeries.occurrences[0]?.actionItem).toMatchObject({ roomId, projectId, assignedUserId: actorUserId, status: "OPEN" });
    expect(fixedSeries.sourceJson).toMatchObject({
      surface: "ios-capture",
      recurrenceRoomId: roomId,
      creationReceipt: { notificationScheduled: false, providerCalendarEventCreated: false, externalSideEffects: false },
    });
  });
});
