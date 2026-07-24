/** @jest-environment node */

import { randomUUID } from "node:crypto";

import { getPrismaClient } from "@/lib/prisma";
import { initialOccurrencePlan, type TaskRecurrenceRule } from "@/lib/task-recurrence";
import { updateCanonicalTaskStatusInTransaction } from "./canonical-task-status";

import {
  ensureActiveSeriesHorizon,
  materializeTaskOccurrence,
  replaceTaskRecurrenceFromOccurrenceInTransaction,
  updateTaskRecurrenceStatusInTransaction,
  type PersistedTaskRecurrenceSeries,
} from "./task-recurrence";

jest.mock("@/auth", () => ({ auth: jest.fn() }));

const runLocalDatabaseSmoke = process.env.QUIPSLY_RECURRENCE_DB_SMOKE === "1" ? describe : describe.skip;
if (process.env.QUIPSLY_RECURRENCE_DB_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) throw new Error("QUIPSLY_LOCAL_DATABASE_URL is required for the recurrence smoke.");
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

runLocalDatabaseSmoke("task recurrence local database smoke", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID().slice(0, 8);
  let ownerUserId = "";
  let otherUserId = "";
  let seriesId = "";
  const revisedSeriesIds: string[] = [];
  const actionItemIds: string[] = [];

  beforeAll(async () => {
    const [owner, other] = await Promise.all([
      prisma.user.create({ data: { primaryEmail: `recurrence-owner-${nonce}@example.test`, name: "Recurrence owner" } }),
      prisma.user.create({ data: { primaryEmail: `recurrence-other-${nonce}@example.test`, name: "Other account" } }),
    ]);
    ownerUserId = owner.id;
    otherUserId = other.id;
  });

  afterAll(async () => {
    try {
      if (actionItemIds.length) await prisma.actionItem.deleteMany({ where: { id: { in: actionItemIds } } });
      if (seriesId || revisedSeriesIds.length) await prisma.taskRecurrenceSeries.deleteMany({ where: { id: { in: [seriesId, ...revisedSeriesIds].filter(Boolean) } } });
      await prisma.user.deleteMany({ where: { id: { in: [ownerUserId, otherUserId].filter(Boolean) } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it("persists DST-safe exact occurrences and makes materialization retries idempotent", async () => {
    const rule: TaskRecurrenceRule = {
      cadence: "FIXED", frequency: "DAILY", interval: 1, timezone: "America/Denver",
      localTimeMinutes: 540, anchorLocalDate: "2026-03-07", anchorDayOfMonth: 7,
    };
    const created = await prisma.taskRecurrenceSeries.create({
      data: {
        ownerUserId, title: "Review coaching goals", detail: "Use the source-linked notes", status: "ACTIVE",
        sourceJson: { source: "quipsly-task-recurrence-v1", externalSideEffects: false }, ...rule,
      },
    });
    seriesId = created.id;
    const series: PersistedTaskRecurrenceSeries = { ...created, projectId: null, detail: created.detail ?? null };
    const [beforeDst, afterDst] = initialOccurrencePlan(rule, 2);
    const raced = await Promise.all([
      prisma.$transaction((tx) => materializeTaskOccurrence({ tx, series, occurrence: beforeDst, actorUserId: ownerUserId, reason: "series-created" })),
      prisma.$transaction((tx) => materializeTaskOccurrence({ tx, series, occurrence: beforeDst, actorUserId: ownerUserId, reason: "series-created" })),
    ]);
    const after = await prisma.$transaction((tx) => materializeTaskOccurrence({
      tx, series, occurrence: afterDst, actorUserId: ownerUserId, reason: "series-created",
    }));
    const results = [...raced, after];
    actionItemIds.push(...results.map((result) => result.actionItemId).filter((value): value is string => Boolean(value)));
    expect(raced.map((result) => result.created).sort()).toEqual([false, true]);
    expect(raced[0]?.actionItemId).toBe(raced[1]?.actionItemId);
    expect(results[2]).toMatchObject({ created: true });

    const occurrences = await prisma.taskOccurrence.findMany({
      where: { seriesId }, orderBy: { scheduledFor: "asc" }, include: { actionItem: true },
    });
    expect(occurrences).toHaveLength(2);
    expect(occurrences.map((occurrence) => occurrence.scheduledFor.toISOString())).toEqual([
      "2026-03-07T16:00:00.000Z", "2026-03-08T15:00:00.000Z",
    ]);
    expect(occurrences[0]?.actionItem?.sourceJson).toMatchObject({
      materializationReceipt: { externalSideEffects: false, notificationScheduled: false, providerCalendarEventCreated: false },
    });

    await prisma.actionItem.updateMany({
      where: { id: { in: actionItemIds } },
      data: { status: "DONE", completedAt: new Date("2026-03-09T18:00:00.000Z") },
    });
    const restored = await prisma.$transaction((tx) => ensureActiveSeriesHorizon({
      tx,
      series,
      basisAt: new Date("2026-03-09T18:00:00.000Z"),
      actorUserId: ownerUserId,
    }));
    actionItemIds.push(...restored.map((result) => result.actionItemId).filter((value): value is string => Boolean(value)));
    expect(restored).toHaveLength(3);
    await expect(prisma.taskOccurrence.count({
      where: { seriesId, actionItem: { is: { status: "OPEN" } } },
    })).resolves.toBe(3);
  });

  it("does not return another account's private series through the owner-scoped lookup", async () => {
    await expect(prisma.taskRecurrenceSeries.findFirst({ where: { id: seriesId, ownerUserId: otherUserId } })).resolves.toBeNull();
    await expect(prisma.taskRecurrenceSeries.findFirst({ where: { id: seriesId, ownerUserId } })).resolves.toMatchObject({ id: seriesId });
  });

  it("persists an auditable iPhone pause and resume history without external side effects", async () => {
    const active = await prisma.taskRecurrenceSeries.findUniqueOrThrow({ where: { id: seriesId } });
    const paused = await prisma.$transaction((tx) => updateTaskRecurrenceStatusInTransaction({
      tx,
      seriesId,
      actorUserId: ownerUserId,
      expectedUpdatedAt: active.updatedAt,
      nextStatus: "PAUSED",
      surface: "ios-capture-today",
    }));
    expect(paused).toMatchObject({ kind: "saved", persisted: { status: "PAUSED" }, materializedCount: 0 });

    const pausedRecord = await prisma.taskRecurrenceSeries.findUniqueOrThrow({ where: { id: seriesId } });
    const resumed = await prisma.$transaction((tx) => updateTaskRecurrenceStatusInTransaction({
      tx,
      seriesId,
      actorUserId: ownerUserId,
      expectedUpdatedAt: pausedRecord.updatedAt,
      nextStatus: "ACTIVE",
      surface: "ios-capture-today",
    }));
    expect(resumed).toMatchObject({ kind: "saved", persisted: { status: "ACTIVE" }, materializedCount: 0 });

    const persisted = await prisma.taskRecurrenceSeries.findUniqueOrThrow({ where: { id: seriesId } });
    expect(persisted.sourceJson).toMatchObject({
      statusReceipts: [
        { surface: "ios-capture-today", previousStatus: "ACTIVE", nextStatus: "PAUSED", externalSideEffects: false },
        { surface: "ios-capture-today", previousStatus: "PAUSED", nextStatus: "ACTIVE", externalSideEffects: false },
      ],
    });
  });

  it("explicitly skips the oldest missed occurrence, preserves its receipt, and keeps the fixed horizon", async () => {
    const nextOpen = await prisma.taskOccurrence.findFirstOrThrow({
      where: { seriesId, actionItem: { is: { status: "OPEN" } } },
      orderBy: [{ scheduledFor: "asc" }, { createdAt: "asc" }],
      include: { actionItem: true },
    });
    if (!nextOpen.actionItem) throw new Error("Expected an overdue open occurrence for missed-work smoke.");
    const result = await prisma.$transaction((tx) => updateCanonicalTaskStatusInTransaction({
      tx,
      taskId: nextOpen.actionItem!.id,
      actorUserId: ownerUserId,
      accessOr: [{ assignedUserId: ownerUserId }],
      expectedUpdatedAt: nextOpen.actionItem!.updatedAt,
      nextStatus: "CANCELED",
      decisionReason: "MISSED_OCCURRENCE_SKIPPED",
      surface: "ios-capture-today",
      now: new Date("2026-03-20T18:00:00.000Z"),
    }));
    expect(result).toMatchObject({ kind: "saved", nextOccurrenceTaskId: expect.any(String) });
    if (result.kind === "saved" && result.nextOccurrenceTaskId) actionItemIds.push(result.nextOccurrenceTaskId);

    const [resolved, openCount] = await Promise.all([
      prisma.taskOccurrence.findUniqueOrThrow({ where: { id: nextOpen.id }, include: { actionItem: true } }),
      prisma.taskOccurrence.count({ where: { seriesId, actionItem: { is: { status: "OPEN" } } } }),
    ]);
    expect(resolved.status).toBe("SKIPPED");
    expect(resolved.actionItem?.status).toBe("CANCELED");
    expect(resolved.sourceJson).toMatchObject({
      resolutionReceipts: [{
        kind: "quipsly-task-occurrence-resolution-v1",
        decisionReason: "MISSED_OCCURRENCE_SKIPPED",
        historicalRecordPreserved: true,
        externalSideEffects: false,
      }],
      followingOccurrenceReceipt: { nextActionItemId: result.kind === "saved" ? result.nextOccurrenceTaskId : null },
    });
    expect(openCount).toBe(3);
  });

  it("versions this-and-future work without rewriting completed recurrence history", async () => {
    const prior = await prisma.taskRecurrenceSeries.findUniqueOrThrow({ where: { id: seriesId } });
    const nextOpen = await prisma.taskOccurrence.findFirstOrThrow({
      where: { seriesId, actionItem: { is: { status: "OPEN" } } },
      orderBy: [{ scheduledFor: "asc" }, { createdAt: "asc" }],
      include: { actionItem: true },
    });
    if (!nextOpen.actionItem) throw new Error("Expected a next open task for recurrence revision smoke.");
    const nextSeriesId = `recurrence-revision-${randomUUID()}`;
    const clientRequestId = randomUUID();
    const input = {
      priorSeriesId: seriesId,
      anchorTaskId: nextOpen.actionItem.id,
      actorUserId: ownerUserId,
      expectedSeriesUpdatedAt: prior.updatedAt,
      expectedTaskUpdatedAt: nextOpen.actionItem.updatedAt,
      nextSeriesId,
      clientRequestId,
      title: "Biweekly coaching source review",
      detail: "Use immutable playback evidence",
      nextRule: {
        cadence: "FIXED" as const,
        frequency: "WEEKLY" as const,
        interval: 2,
        timezone: "America/New_York",
        localTimeMinutes: 10 * 60,
        anchorLocalDate: "2026-04-01",
        anchorDayOfMonth: 1,
      },
      surface: "ios-capture-today" as const,
    };
    const result = await prisma.$transaction((tx) => replaceTaskRecurrenceFromOccurrenceInTransaction({ tx, ...input }));
    expect(result).toMatchObject({ kind: "saved", reused: false, priorSeriesId: seriesId, nextSeriesId, materializedCount: 3 });
    revisedSeriesIds.push(nextSeriesId);

    const [endedPrior, revised, superseded] = await Promise.all([
      prisma.taskRecurrenceSeries.findUniqueOrThrow({ where: { id: seriesId } }),
      prisma.taskRecurrenceSeries.findUniqueOrThrow({ where: { id: nextSeriesId }, include: { occurrences: { include: { actionItem: true }, orderBy: { scheduledFor: "asc" } } } }),
      prisma.taskOccurrence.findMany({ where: { seriesId, scheduledFor: { gte: nextOpen.scheduledFor } }, include: { actionItem: true } }),
    ]);
    expect(endedPrior.status).toBe("ENDED");
    expect(endedPrior.sourceJson).toMatchObject({
      lastRevisionReceipt: {
        priorSeriesId: seriesId,
        nextSeriesId,
        historicalOccurrencesPreserved: true,
        externalSideEffects: false,
        notificationChanged: false,
        providerCalendarChanged: false,
      },
    });
    expect(superseded.length).toBeGreaterThan(0);
    expect(superseded.every((occurrence) => occurrence.status === "SKIPPED" && occurrence.actionItem?.status === "CANCELED")).toBe(true);
    expect(revised.occurrences.map((occurrence) => occurrence.scheduledLocalDate)).toEqual(["2026-04-01", "2026-04-15", "2026-04-29"]);
    expect(revised.occurrences.every((occurrence) => occurrence.actionItem?.title === "Biweekly coaching source review")).toBe(true);
    expect(revised.occurrences.every((occurrence) => (occurrence.actionItem?.sourceJson as any)?.materializationReceipt?.externalSideEffects === false)).toBe(true);
    actionItemIds.push(...revised.occurrences.map((occurrence) => occurrence.actionItemId).filter((value): value is string => Boolean(value)));

    const retried = await prisma.$transaction((tx) => replaceTaskRecurrenceFromOccurrenceInTransaction({ tx, ...input }));
    expect(retried).toMatchObject({ kind: "saved", reused: true, nextSeriesId, materializedCount: 3 });
    const reusedIdentityWithDifferentIntent = await prisma.$transaction((tx) => replaceTaskRecurrenceFromOccurrenceInTransaction({
      tx,
      ...input,
      title: "A different edit must not borrow this request identity",
    }));
    expect(reusedIdentityWithDifferentIntent).toEqual({ kind: "identity-conflict" });
    await expect(prisma.taskRecurrenceSeries.count({ where: { id: nextSeriesId } })).resolves.toBe(1);
  });
});
