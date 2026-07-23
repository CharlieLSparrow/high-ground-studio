import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { captureRoomAccessWhere } from "@/lib/server/mobile-capture-room-join-diagnostics";
import {
  isMobileCaptureQuickEntrySource,
  mobileCaptureQuickEntryId,
  mobileCaptureQuickEntrySeriesId,
  mobileCaptureQuickEntrySource,
  mobileCaptureQuickEntryUrl,
  mobileCaptureSourceFingerprint,
  validateMobileCaptureQuickEntry,
  type MobileCaptureQuickEntryInput,
} from "@/lib/server/mobile-capture-quick-entry";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { materializeTaskOccurrence, type PersistedTaskRecurrenceSeries } from "@/lib/server/task-recurrence";
import { initialOccurrencePlan } from "@/lib/task-recurrence";

export const runtime = "nodejs";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function requestBody(request: Request) {
  try { return record(await request.json()); } catch { return {}; }
}

type SavedModel = "note" | "task" | "goal" | "snippet" | "bookmark";

function publicEntry(kind: MobileCaptureQuickEntryInput["kind"], row: any, room: any, model: SavedModel, tags: any[], recurrenceSeries?: any) {
  return {
    id: row.id,
    kind,
    title: model === "snippet" ? row.sourceTitle : row.title,
    body: model === "note" ? row.body : model === "task" ? row.detail : model === "goal" ? row.description : model === "snippet" ? row.highlightedText : row.url,
    status: model === "task" || model === "goal" ? row.status : "CAPTURED",
    callRoomId: room?.id || null,
    sessionTitle: room?.title || null,
    projectId: room?.projectId || null,
    destination: kind === "SOURCE" ? "INBOX" : "SESSION",
    sourceType: model === "bookmark" ? "BOOKMARK" : model === "snippet" ? "SNIPPET" : null,
    sourceUrl: model === "bookmark" ? row.url : model === "snippet" ? row.sourceUrl : null,
    tags: tags.map((tag) => ({ id: tag.id, slug: tag.slug, label: tag.label })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    recurrence: recurrenceSeries ? {
      seriesId: recurrenceSeries.id,
      cadence: recurrenceSeries.cadence,
      frequency: recurrenceSeries.frequency,
      interval: recurrenceSeries.interval,
      timezone: recurrenceSeries.timezone,
      localTimeMinutes: recurrenceSeries.localTimeMinutes,
      anchorLocalDate: recurrenceSeries.anchorLocalDate,
      status: recurrenceSeries.status,
    } : null,
  };
}

async function existingEntry(tx: any, input: MobileCaptureQuickEntryInput, actorUserId: string): Promise<{ row: any; model: SavedModel; captureReceipt?: any; recurrenceSeries?: any } | null> {
  const id = mobileCaptureQuickEntryId(input.kind, input.clientRequestId);
  if (input.kind === "NOTE") return tx.coachingNote.findUnique({ where: { id } }).then((row: any) => row ? ({ row, model: "note" as const }) : null);
  if (input.kind === "TASK" && input.recurrence) {
    const recurrenceSeries = await tx.taskRecurrenceSeries.findUnique({
      where: { id: mobileCaptureQuickEntrySeriesId(input.clientRequestId) },
      include: { occurrences: { orderBy: { scheduledFor: "asc" }, take: 1, include: { actionItem: true } } },
    });
    const row = recurrenceSeries?.occurrences?.[0]?.actionItem;
    if (row) return { row, model: "task", recurrenceSeries };
    const nonRecurringRow = await tx.actionItem.findUnique({ where: { id } });
    return nonRecurringRow ? { row: nonRecurringRow, model: "task" } : null;
  }
  if (input.kind === "TASK") {
    const row = await tx.actionItem.findUnique({ where: { id } });
    if (row) return { row, model: "task" };
    const recurrenceSeries = await tx.taskRecurrenceSeries.findUnique({
      where: { id: mobileCaptureQuickEntrySeriesId(input.clientRequestId) },
      include: { occurrences: { orderBy: { scheduledFor: "asc" }, take: 1, include: { actionItem: true } } },
    });
    const recurringRow = recurrenceSeries?.occurrences?.[0]?.actionItem;
    return recurringRow ? { row: recurringRow, model: "task", recurrenceSeries } : null;
  }
  if (input.kind === "GOAL") return tx.goal.findUnique({ where: { id } }).then((row: any) => row ? ({ row, model: "goal" as const }) : null);
  const captureReceipt = await tx.studioPersonalSourceCaptureReceipt.findUnique({
    where: { createdByUserId_clientRequestId: { createdByUserId: actorUserId, clientRequestId: input.clientRequestId } },
    include: { snippet: true, bookmark: true },
  });
  if (captureReceipt?.snippet) return { row: captureReceipt.snippet, model: "snippet", captureReceipt };
  if (captureReceipt?.bookmark) return { row: captureReceipt.bookmark, model: "bookmark", captureReceipt };

  // Compatibility read for source rows created before capture receipts existed.
  const sourceUrl = mobileCaptureQuickEntryUrl(input.body);
  const row = sourceUrl
    ? await tx.bookmark.findUnique({ where: { id } })
    : await tx.snippet.findUnique({ where: { id } });
  return row ? { row, model: sourceUrl ? "bookmark" : "snippet" } : null;
}

function tagLinkSource(input: MobileCaptureQuickEntryInput) {
  return {
    schema: "quipsly-record-tag-link-v1",
    surface: "ios-capture",
    clientRequestId: input.clientRequestId,
    explicitHumanCapture: true,
  };
}

async function createEntry(tx: any, input: MobileCaptureQuickEntryInput, actorUserId: string, room: any, tags: any[]): Promise<{ row: any; model: SavedModel; sourceIdentityReused?: boolean; recurrenceSeries?: any }> {
  const id = mobileCaptureQuickEntryId(input.kind, input.clientRequestId);
  const sourceJson = mobileCaptureQuickEntrySource(input, actorUserId, room.projectId || null);
  const linkSource = tagLinkSource(input);
  if (input.kind === "NOTE") {
    const row = await tx.coachingNote.upsert({
      where: { id },
      update: {},
      create: { id, roomId: room.id, authorUserId: actorUserId, kind: "SESSION_NOTE", title: input.title || "Quick note", body: input.body, sourceJson },
    });
    if (tags.length) await tx.coachingNoteTagLink.createMany({
      data: tags.map((tag) => ({ noteId: row.id, tagId: tag.id, createdByUserId: actorUserId, sourceJson: linkSource })),
      skipDuplicates: true,
    });
    return { row, model: "note" };
  }
  if (input.kind === "TASK") {
    if (input.recurrence) {
      const seriesSource = {
        ...sourceJson,
        source: "quipsly-task-recurrence-v1",
        recurrenceRoomId: room.id,
        creationReceipt: {
          kind: "quipsly-task-recurrence-create-v1",
          surface: "ios-capture",
          createdByUserId: actorUserId,
          initialMaterializationCount: input.recurrence.cadence === "FIXED" ? 3 : 1,
          externalSideEffects: false,
          notificationScheduled: false,
          providerCalendarEventCreated: false,
        },
      };
      const recurrenceSeries = await tx.taskRecurrenceSeries.create({
        data: {
          id: mobileCaptureQuickEntrySeriesId(input.clientRequestId),
          ownerUserId: actorUserId,
          projectId: room.projectId || null,
          title: input.title,
          detail: input.body || null,
          ...input.recurrence,
          sourceJson: seriesSource,
        },
      });
      const persistedSeries: PersistedTaskRecurrenceSeries = { ...recurrenceSeries, sourceJson: seriesSource };
      const materialized = [];
      for (const occurrence of initialOccurrencePlan(input.recurrence)) {
        materialized.push(await materializeTaskOccurrence({
          tx,
          series: persistedSeries,
          occurrence,
          actorUserId,
          reason: "series-created",
        }));
      }
      const firstActionItemId = materialized[0]?.actionItemId;
      const row = firstActionItemId ? await tx.actionItem.findUnique({ where: { id: firstActionItemId } }) : null;
      if (!row) throw new Error("Recurring iPhone task did not materialize its first occurrence.");
      if (tags.length) await tx.actionItemTagLink.createMany({
        data: materialized.flatMap((item) => tags.map((tag) => ({ actionItemId: item.actionItemId, tagId: tag.id, createdByUserId: actorUserId, sourceJson: linkSource }))),
        skipDuplicates: true,
      });
      return { row, model: "task", recurrenceSeries };
    }
    const row = await tx.actionItem.upsert({
      where: { id },
      update: {},
      create: { id, roomId: room.id, projectId: room.projectId || null, assignedUserId: actorUserId, title: input.title, detail: input.body || null, status: "OPEN", sourceJson },
    });
    if (tags.length) await tx.actionItemTagLink.createMany({
      data: tags.map((tag) => ({ actionItemId: row.id, tagId: tag.id, createdByUserId: actorUserId, sourceJson: linkSource })),
      skipDuplicates: true,
    });
    return { row, model: "task" };
  }
  if (input.kind === "GOAL") {
    const row = await tx.goal.upsert({
      where: { id },
      update: {},
      create: { id, ownerUserId: actorUserId, roomId: room.id, projectId: room.projectId || null, title: input.title, description: input.body || null, status: "ACTIVE", sourceJson },
    });
    if (tags.length) await tx.goalTagLink.createMany({
      data: tags.map((tag) => ({ goalId: row.id, tagId: tag.id, createdByUserId: actorUserId, sourceJson: linkSource })),
      skipDuplicates: true,
    });
    return { row, model: "goal" };
  }

  const sourceUrl = mobileCaptureQuickEntryUrl(input.body);
  if (sourceUrl) {
    const row = await tx.bookmark.upsert({
      where: { userId_url: { userId: actorUserId, url: sourceUrl } },
      update: {},
      create: {
        id,
        userId: actorUserId,
        url: sourceUrl,
        title: input.title || new URL(sourceUrl).hostname,
        metadataJson: { ...sourceJson, kind: "quipsly-mobile-source-capture-v1", triageStatus: "INBOX" },
      },
    });
    return { row, model: "bookmark", sourceIdentityReused: row.id !== id };
  }
  const captureFingerprint = mobileCaptureSourceFingerprint(input)!;
  const legacyMatch = await tx.snippet.findFirst({
    where: { userId: actorUserId, sourceUrl: input.sourceUrl, highlightedText: input.body },
  });
  if (legacyMatch) return { row: legacyMatch, model: "snippet", sourceIdentityReused: true };
  const row = await tx.snippet.upsert({
    where: { userId_captureFingerprint: { userId: actorUserId, captureFingerprint } },
    update: {},
    create: {
      id,
      userId: actorUserId,
      sourceTitle: input.title || "iPhone source capture",
      sourceUrl: input.sourceUrl,
      highlightedText: input.body,
      captureFingerprint,
      metadataJson: { ...sourceJson, kind: "quipsly-mobile-source-capture-v1", triageStatus: "INBOX", captureMode: input.sourceUrl ? "PASSAGE_WITH_WEBPAGE" : "PASSAGE" },
    },
  });
  return { row, model: "snippet", sourceIdentityReused: row.id !== id };
}

function captureReceiptMatches(receipt: any, input: MobileCaptureQuickEntryInput, actorUserId: string, row: any, model: SavedModel) {
  const fingerprint = mobileCaptureSourceFingerprint(input);
  return fingerprint
    && receipt.createdByUserId === actorUserId
    && receipt.clientRequestId === input.clientRequestId
    && receipt.sourceFingerprint === fingerprint
    && receipt.captureType === (model === "bookmark" ? "BOOKMARK" : "SNIPPET")
    && (receipt.bookmarkId || null) === (model === "bookmark" ? row.id : null)
    && (receipt.snippetId || null) === (model === "snippet" ? row.id : null);
}

async function ensureSourceCaptureReceipt(
  tx: any,
  input: MobileCaptureQuickEntryInput,
  actor: { id: string; primaryEmail?: string | null; email?: string | null },
  saved: { row: any; model: SavedModel; captureReceipt?: any },
) {
  if (input.kind !== "SOURCE" || (saved.model !== "bookmark" && saved.model !== "snippet")) return { ok: true as const, receipt: null, replay: false, captureCount: null };
  const fingerprint = mobileCaptureSourceFingerprint(input)!;
  const existing = saved.captureReceipt || await tx.studioPersonalSourceCaptureReceipt.findUnique({
    where: { createdByUserId_clientRequestId: { createdByUserId: actor.id, clientRequestId: input.clientRequestId } },
  });
  if (existing) {
    if (!captureReceiptMatches(existing, input, actor.id, saved.row, saved.model)) return { ok: false as const };
    const captureCount = await tx.studioPersonalSourceCaptureReceipt.count({
      where: saved.model === "bookmark" ? { bookmarkId: saved.row.id } : { snippetId: saved.row.id },
    });
    return { ok: true as const, receipt: existing, replay: true, captureCount };
  }

  const sourceUrl = saved.model === "bookmark" ? saved.row.url : saved.row.sourceUrl || null;
  const receipt = await tx.studioPersonalSourceCaptureReceipt.create({
    data: {
      createdByUserId: actor.id,
      createdByEmailSnapshot: (actor.primaryEmail || actor.email || "").trim().toLowerCase() || null,
      clientRequestId: input.clientRequestId,
      captureType: saved.model === "bookmark" ? "BOOKMARK" : "SNIPPET",
      bookmarkId: saved.model === "bookmark" ? saved.row.id : null,
      snippetId: saved.model === "snippet" ? saved.row.id : null,
      sourceFingerprint: fingerprint,
      capturedAt: input.capturedAt,
      captureSnapshotJson: {
        kind: "quipsly-personal-source-capture-receipt-v1",
        title: input.title,
        sourceFingerprint: fingerprint,
        sourceUrl,
        surface: "ios-capture",
        sourceIdentityReused: saved.row.id !== mobileCaptureQuickEntryId(input.kind, input.clientRequestId),
        privateCaptureMutated: false,
        externalSideEffects: false,
      },
    },
  });
  const captureCount = await tx.studioPersonalSourceCaptureReceipt.count({
    where: saved.model === "bookmark" ? { bookmarkId: saved.row.id } : { snippetId: saved.row.id },
  });
  return { ok: true as const, receipt, replay: false, captureCount };
}

function entryMatches(input: MobileCaptureQuickEntryInput, saved: { row: any; model: SavedModel }, actorUserId: string) {
  const recurrenceSeries = (saved as { recurrenceSeries?: any }).recurrenceSeries;
  if (input.kind === "TASK" && input.recurrence) {
    const seriesSource = record(recurrenceSeries?.sourceJson);
    return Boolean(recurrenceSeries)
      && recurrenceSeries.ownerUserId === actorUserId
      && recurrenceSeries.title === input.title
      && (recurrenceSeries.detail || "") === input.body
      && recurrenceSeries.cadence === input.recurrence.cadence
      && recurrenceSeries.frequency === input.recurrence.frequency
      && recurrenceSeries.interval === input.recurrence.interval
      && recurrenceSeries.timezone === input.recurrence.timezone
      && recurrenceSeries.localTimeMinutes === input.recurrence.localTimeMinutes
      && recurrenceSeries.anchorLocalDate === input.recurrence.anchorLocalDate
      && isMobileCaptureQuickEntrySource(seriesSource, input, actorUserId);
  }
  if (input.kind !== "SOURCE") return isMobileCaptureQuickEntrySource(saved.row.sourceJson, input, actorUserId);
  if (saved.row.userId !== actorUserId) return false;
  const sourceUrl = mobileCaptureQuickEntryUrl(input.body);
  return saved.model === "bookmark"
    ? saved.row.url === sourceUrl
    : saved.model === "snippet"
      && saved.row.highlightedText === input.body
      && (saved.row.sourceUrl || null) === input.sourceUrl;
}

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) {
    return NextResponse.json(
      { ok: false, code: "UNAUTHORIZED", error: "Sign in before syncing private Session quick capture." },
      { status: 401 },
    );
  }

  const validation = validateMobileCaptureQuickEntry(await requestBody(request));
  if (!validation.ok) {
    return NextResponse.json(
      { ok: false, code: validation.code, error: validation.error, localOutboxRetained: true },
      { status: 400 },
    );
  }

  const input = validation.value;
  const prisma = getPrismaClient() as any;
  const commit = () => prisma.$transaction(async (tx: any) => {
    const room = input.kind === "SOURCE" ? null : await tx.callRoom.findFirst({
      where: captureRoomAccessWhere(input.callRoomId!, session.user),
      select: { id: true, title: true, projectId: true },
    });
    if (input.kind !== "SOURCE" && !room) return { kind: "missing-room" as const };
    if (input.tagIds.length > 0 && !room?.projectId) return { kind: "invalid-tags" as const };
    const tags = input.tagIds.length > 0
      ? await tx.studioTag.findMany({
          where: { id: { in: input.tagIds }, projectId: room.projectId, isActive: true },
          orderBy: { label: "asc" },
          select: { id: true, slug: true, label: true },
        })
      : [];
    if (tags.length !== input.tagIds.length) return { kind: "invalid-tags" as const };

    const existing = await existingEntry(tx, input, session.user.id);
    if (existing) {
      if (!entryMatches(input, existing, session.user.id)) {
        return { kind: "identity-conflict" as const };
      }
      const receipt = await ensureSourceCaptureReceipt(tx, input, session.user, existing);
      if (!receipt.ok) return { kind: "identity-conflict" as const };
      return { kind: "saved" as const, room, tags, ...existing, ...receipt, idempotentReplay: true, sourceIdentityReused: input.kind === "SOURCE" };
    }

    const saved = await createEntry(tx, input, session.user.id, room || { id: null, projectId: null }, tags);
    if (!entryMatches(input, saved, session.user.id)) {
      return { kind: "identity-conflict" as const };
    }
    const receipt = await ensureSourceCaptureReceipt(tx, input, session.user, saved);
    if (!receipt.ok) return { kind: "identity-conflict" as const };
    return { kind: "saved" as const, room, tags, ...saved, ...receipt, idempotentReplay: false };
  }, { isolationLevel: "Serializable" });
  let result;
  try {
    result = await commit();
  } catch (error) {
    const code = record(error).code;
    if (code !== "P2002" && code !== "P2034") throw error;
    // A simultaneous offline retry may win either the source-identity or
    // receipt uniqueness race. One bounded replay turns that database result
    // into the same idempotent API contract; a true identity conflict still
    // returns 409 through the normal matching checks below.
    result = await commit();
  }

  if (result.kind === "missing-room") {
    return NextResponse.json(
      { ok: false, code: "QUICK_ENTRY_SESSION_NOT_FOUND", error: "This account no longer has access to that Session. The phone copy remains in its protected outbox.", localOutboxRetained: true },
      { status: 404 },
    );
  }
  if (result.kind === "identity-conflict") {
    return NextResponse.json(
      { ok: false, code: "QUICK_ENTRY_IDENTITY_CONFLICT", error: "That retry identity already belongs to different saved evidence. Quipsly kept the phone copy and changed nothing.", localOutboxRetained: true },
      { status: 409 },
    );
  }
  if (result.kind === "invalid-tags") {
    return NextResponse.json(
      { ok: false, code: "QUICK_ENTRY_TAGS_UNAVAILABLE", error: "One or more selected tags no longer belong to this Session's Nest. The phone copy remains available for review.", localOutboxRetained: true },
      { status: 409 },
    );
  }

  return NextResponse.json({
    ok: true,
    schema: "quipsly-mobile-quick-entry-v1",
    idempotentReplay: result.idempotentReplay,
    entry: publicEntry(input.kind, result.row, result.room, result.model, result.tags, result.recurrenceSeries),
    sourceCapture: input.kind === "SOURCE" ? {
      receiptId: result.receipt?.id || null,
      captureCount: result.captureCount,
      sourceIdentityReused: result.sourceIdentityReused === true,
      capturedAt: result.receipt?.capturedAt?.toISOString?.() || input.capturedAt.toISOString(),
    } : null,
    boundaries: {
      explicitHumanCapture: true,
      canonicalRecordCommitted: true,
      recurrenceAppOwned: input.recurrence !== null,
      recurrenceNotificationsScheduled: false,
      externalCalendarMutated: false,
      providerMutated: false,
      messageSent: false,
      delivered: false,
      published: false,
      originalMediaMutated: false,
    },
    nextAction: input.kind === "SOURCE"
      ? "The private source is in Nest Inbox. Review it there before deliberately filing it into Research."
      : input.kind === "NOTE"
      ? "The private Session note is saved. Review or expand it from the Session workspace."
      : input.kind === "TASK"
        ? input.recurrence
          ? "The repeating task is saved in Quipsly. Today and Work now share its exact occurrences; no reminder or provider event was scheduled."
          : "The task is saved and assigned to you. Set its timing from Today, Work, or Calendar when useful."
        : "The goal is saved as active. Add progress evidence or supporting tasks when useful.",
  });
}
