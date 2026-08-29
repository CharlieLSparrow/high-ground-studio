import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { ensureHomeNestForEmail } from "@/lib/server/home-nest";
import { captureRoomAccessWhere } from "@/lib/server/mobile-capture-room-join-diagnostics";
import {
  isMobileCaptureQuickEntrySource,
  mobileCaptureQuickEntryId,
  mobileCaptureQuickEntryReminderId,
  mobileCaptureQuickEntrySeriesId,
  mobileCaptureQuickEntrySource,
  mobileCaptureQuickEntryUrl,
  mobileCaptureSourceFingerprint,
  validateMobileCaptureQuickEntry,
  type MobileCaptureQuickEntryInput,
} from "@/lib/server/mobile-capture-quick-entry";
import { resolveQuickEntryTags } from "@/lib/server/quick-entry-tags";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { canUseProjectTeamNotes } from "@/lib/server/session-note-access";
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

type SavedModel = "note" | "document-note" | "task" | "goal" | "snippet" | "bookmark";

function publicEntry(kind: MobileCaptureQuickEntryInput["kind"], row: any, room: any, model: SavedModel, tags: any[], recurrenceSeries?: any, reminder?: any) {
  return {
    id: row.id,
    kind,
    title: model === "snippet" ? row.sourceTitle : row.title,
    body: model === "note" || model === "document-note" ? row.body : model === "task" ? row.detail : model === "goal" ? row.description : model === "snippet" ? row.highlightedText : row.url,
    status: model === "task" || model === "goal" ? row.status : "CAPTURED",
    noteKind: model === "note" ? row.kind : null,
    noteVisibility: model === "note" ? row.visibility : null,
    callRoomId: room?.id || null,
    sessionTitle: room?.id ? room.title : null,
    projectId: room?.projectId || null,
    projectName: room?.projectName || (room?.id ? null : room?.title || null),
    dueAt: model === "task" ? row.dueAt?.toISOString?.() || null : null,
    destination: kind === "SOURCE" ? "INBOX" : room?.destination || (room?.id ? "SESSION" : "HOME_NEST"),
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
    reminder: reminder ? {
      id: reminder.id,
      actionItemId: reminder.actionItemId,
      remindAt: reminder.remindAt.toISOString(),
      status: reminder.status,
      deviceNotificationScheduled: false,
    } : null,
  };
}

async function existingEntry(tx: any, input: MobileCaptureQuickEntryInput, actorUserId: string): Promise<{ row: any; model: SavedModel; captureReceipt?: any; recurrenceSeries?: any; reminder?: any } | null> {
  const id = mobileCaptureQuickEntryId(input.kind, input.clientRequestId);
  if (input.kind === "NOTE" && input.callRoomId) return tx.coachingNote.findUnique({ where: { id } }).then((row: any) => row ? ({ row, model: "note" as const }) : null);
  if (input.kind === "NOTE") {
    const document = await tx.studioDocument.findUnique({
      where: { id },
      include: {
        blocks: { where: { archivedAt: null }, orderBy: { order: "asc" } },
        documentOperations: { where: { id: `mobile-note-operation-${input.clientRequestId}` }, take: 1 },
      },
    });
    if (!document) return null;
    const bodyBlock = document.blocks.find((block: any) => block.id === `${id}-body`) || document.blocks[1];
    return {
      row: { ...document, body: bodyBlock?.body || "" },
      model: "document-note",
    };
  }
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
    if (row) {
      const reminder = await tx.taskReminder.findUnique({ where: { actionItemId: row.id } });
      return { row, model: "task", reminder };
    }
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

async function createEntry(tx: any, input: MobileCaptureQuickEntryInput, actorUserId: string, actorEmail: string, room: any, tags: any[]): Promise<{ row: any; model: SavedModel; sourceIdentityReused?: boolean; recurrenceSeries?: any; reminder?: any }> {
  const id = mobileCaptureQuickEntryId(input.kind, input.clientRequestId);
  const sourceJson = mobileCaptureQuickEntrySource(input, actorUserId, room.projectId || null);
  const linkSource = tagLinkSource(input);
  if (input.kind === "NOTE" && !input.callRoomId) {
    const title = input.title || "Quick note";
    const stableId = `mobile-document-note-${input.clientRequestId}`;
    const titleBlockId = `${id}-title`;
    const bodyBlockId = `${id}-body`;
    const document = await tx.studioDocument.create({
      data: {
        id,
        projectId: room.projectId,
        personalOwnerUserId: actorUserId,
        stableId,
        title,
        sourceLabel: "document-kind:note;origin:ios-capture",
        tagRevision: tags.length ? 1 : 0,
        blocks: {
          create: [
            {
              id: titleBlockId,
              stableId: `${stableId}-title`,
              order: 0,
              title: "Note Title",
              body: title,
              sourceLabel: "document-kind:note;origin:ios-capture",
            },
            {
              id: bodyBlockId,
              stableId: `${stableId}-body`,
              order: 1,
              body: input.body,
              sourceLabel: "document-kind:note;origin:ios-capture",
            },
          ],
        },
        documentOperations: {
          create: {
            id: `mobile-note-operation-${input.clientRequestId}`,
            projectId: room.projectId,
            actorEmail,
            origin: "ios-capture",
            operationType: "personal-note-create",
            status: "applied",
            beforeJson: null,
            afterJson: { title, body: input.body },
            payloadJson: sourceJson,
            reversible: true,
          },
        },
      },
      include: {
        blocks: { orderBy: { order: "asc" } },
        documentOperations: { where: { id: `mobile-note-operation-${input.clientRequestId}` }, take: 1 },
      },
    });
    if (tags.length) {
      await Promise.all([
        tx.studioDocumentTagLink.createMany({
          data: tags.map((tag) => ({
            documentId: document.id,
            tagId: tag.id,
            createdByUserId: actorUserId,
            sourceJson: linkSource,
          })),
          skipDuplicates: true,
        }),
        tx.studioTaggedSpan.createMany({
          data: tags.map((tag) => ({
            id: `${bodyBlockId}-${tag.id}`,
            documentId: document.id,
            blockId: bodyBlockId,
            tagId: tag.id,
            startOffset: 0,
            endOffset: input.body.length,
            selectedText: input.body,
            documentStableId: stableId,
            documentTitleSnapshot: title,
            blockStableId: `${stableId}-body`,
            blockTitleSnapshot: null,
            sourceLabel: "document-kind:note;origin:ios-capture",
            projectionStatus: "private",
            isPrivate: true,
            createdByLabel: actorEmail,
          })),
          skipDuplicates: true,
        }),
      ]);
    }
    return { row: { ...document, body: input.body }, model: "document-note" };
  }
  if (input.kind === "NOTE") {
    const row = await tx.coachingNote.upsert({
      where: { id },
      update: {},
      create: {
        id,
        roomId: room.id,
        authorUserId: actorUserId,
        kind: input.noteKind!,
        visibility: input.noteVisibility!,
        title: input.title || "Quick note",
        body: input.body,
        sourceJson,
        revisions: {
          create: {
            id: `${id}-revision-1`,
            revision: 1,
            operation: "created-from-ios-capture",
            actorUserId,
            snapshotJson: {
              title: input.title || "Quick note",
              body: input.body,
              kind: input.noteKind,
              visibility: input.noteVisibility,
              sourceJson,
            },
          },
        },
      },
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
      create: {
        id,
        roomId: room.id,
        projectId: room.projectId || null,
        assignedUserId: actorUserId,
        title: input.title,
        detail: input.body || null,
        status: "OPEN",
        dueAt: input.dueAt,
        sourceJson,
      },
    });
    if (tags.length) await tx.actionItemTagLink.createMany({
      data: tags.map((tag) => ({ actionItemId: row.id, tagId: tag.id, createdByUserId: actorUserId, sourceJson: linkSource })),
      skipDuplicates: true,
    });
    const reminder = input.reminderAt ? await tx.taskReminder.create({
      data: {
        id: mobileCaptureQuickEntryReminderId(input.clientRequestId),
        actionItemId: row.id,
        ownerUserId: actorUserId,
        remindAt: input.reminderAt,
        sourceJson: {
          schema: "quipsly-task-reminder-intent-v1",
          surface: "ios-capture",
          clientRequestId: input.clientRequestId,
          explicitHumanIntent: true,
          devicePermissionObserved: false,
          deviceNotificationScheduled: false,
          deliveryClaimed: false,
          externalSideEffects: false,
        },
      },
    }) : null;
    return { row, model: "task", reminder };
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

function entryMatches(
  input: MobileCaptureQuickEntryInput,
  saved: { row: any; model: SavedModel },
  actorUserId: string,
  expectedProjectId: string | null,
) {
  const recurrenceSeries = (saved as { recurrenceSeries?: any }).recurrenceSeries;
  if (input.kind === "TASK" && input.recurrence) {
    const seriesSource = record(recurrenceSeries?.sourceJson);
    return Boolean(recurrenceSeries)
      && recurrenceSeries.ownerUserId === actorUserId
      && recurrenceSeries.projectId === expectedProjectId
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
  if (input.kind === "NOTE") {
    if (!input.callRoomId) {
      const operation = saved.row.documentOperations?.[0];
      return saved.model === "document-note"
        && saved.row.personalOwnerUserId === actorUserId
        && saved.row.projectId === expectedProjectId
        && saved.row.title === (input.title || "Quick note")
        && saved.row.body === input.body
        && operation?.projectId === saved.row.projectId
        && operation?.documentId === saved.row.id
        && operation?.operationType === "personal-note-create"
        && isMobileCaptureQuickEntrySource(operation?.payloadJson, input, actorUserId);
    }
    return saved.model === "note"
      && saved.row.authorUserId === actorUserId
      && saved.row.roomId === input.callRoomId
      && saved.row.kind === input.noteKind
      && saved.row.visibility === input.noteVisibility
      && (saved.row.title || "Quick note") === (input.title || "Quick note")
      && saved.row.body === input.body
      && isMobileCaptureQuickEntrySource(saved.row.sourceJson, input, actorUserId);
  }
  if (input.kind === "TASK") {
    return saved.model === "task"
      && saved.row.assignedUserId === actorUserId
      && saved.row.projectId === expectedProjectId
      && saved.row.roomId === input.callRoomId
      && saved.row.title === input.title
      && (saved.row.detail || "") === input.body
      && (saved.row.dueAt?.toISOString?.() || null) === (input.dueAt?.toISOString() || null)
      && (input.reminderAt
        ? Boolean((saved as { reminder?: any }).reminder)
          && (saved as { reminder?: any }).reminder.ownerUserId === actorUserId
          && (saved as { reminder?: any }).reminder.actionItemId === saved.row.id
          && (saved as { reminder?: any }).reminder.remindAt?.toISOString?.() === input.reminderAt.toISOString()
          && (saved as { reminder?: any }).reminder.status === "ACTIVE"
        : !(saved as { reminder?: any }).reminder)
      && isMobileCaptureQuickEntrySource(saved.row.sourceJson, input, actorUserId);
  }
  if (input.kind === "GOAL") {
    return saved.model === "goal"
      && saved.row.ownerUserId === actorUserId
      && saved.row.projectId === expectedProjectId
      && saved.row.roomId === input.callRoomId
      && saved.row.title === input.title
      && (saved.row.description || "") === input.body
      && isMobileCaptureQuickEntrySource(saved.row.sourceJson, input, actorUserId);
  }
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
      { ok: false, code: "UNAUTHORIZED", error: "Sign in before syncing private quick capture." },
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
  const actorEmail = (session.user.primaryEmail || session.user.email || "").trim().toLowerCase();
  if (input.kind !== "SOURCE" && !input.callRoomId && !actorEmail) {
    return NextResponse.json(
      { ok: false, code: "QUICK_ENTRY_ACCOUNT_EMAIL_REQUIRED", error: "Verify this Quipsly account before syncing private Home Nest work. The phone copy remains protected.", localOutboxRetained: true },
      { status: 403 },
    );
  }
  const prisma = getPrismaClient() as any;
  const personalHome = input.kind !== "SOURCE" && !input.callRoomId && !input.projectId
    ? await ensureHomeNestForEmail(actorEmail, prisma)
    : null;
  const commit = () => prisma.$transaction(async (tx: any) => {
    const room = input.kind === "SOURCE"
      ? null
      : personalHome
        ? {
            id: null,
            title: personalHome.name,
            projectName: personalHome.name,
            projectId: personalHome.id,
            projectRole: "OWNER",
            destination: "HOME_NEST",
          }
        : input.projectId
          ? await tx.studioProjectAccessGrant.findFirst({
              where: {
                projectId: input.projectId,
                email: actorEmail,
                status: "ACTIVE",
                role: { in: ["OWNER", "EDITOR"] },
              },
              select: {
                project: {
                  select: { id: true, name: true },
                },
              },
            }).then((grant: any) => grant?.project ? ({
              id: null,
              title: grant.project.name,
              projectName: grant.project.name,
              projectId: grant.project.id,
              projectRole: "EDITOR",
              destination: "NEST",
            }) : null)
          : await tx.callRoom.findFirst({
              where: captureRoomAccessWhere(input.callRoomId!, session.user),
              select: {
                id: true,
                title: true,
                projectId: true,
                project: {
                  select: {
                    name: true,
                    accessGrants: actorEmail ? {
                      where: { email: actorEmail, status: "ACTIVE" },
                      take: 1,
                      select: { role: true },
                    } : undefined,
                  },
                },
              },
            }).then((found: any) => found ? ({
              ...found,
              projectName: found.project?.name || null,
              projectRole: found.project?.accessGrants?.[0]?.role || null,
              destination: "SESSION",
            }) : null);
    if (input.kind !== "SOURCE" && !room) return { kind: "missing-room" as const };

    const existing = await existingEntry(tx, input, session.user.id);
    if (existing && !entryMatches(input, existing, session.user.id, room?.projectId || null)) {
      return { kind: "identity-conflict" as const };
    }
    if (
      !existing
      && input.kind === "NOTE"
      && input.callRoomId
      && (input.noteKind === "PRODUCTION" || input.noteVisibility === "PROJECT_TEAM")
      && !canUseProjectTeamNotes(room?.projectRole, session.user.isStaff === true)
    ) {
      return { kind: "note-policy-forbidden" as const };
    }

    const tagResolution = input.kind === "SOURCE"
      ? { kind: "resolved" as const, tags: [], createdTagCount: 0, reusedTagCount: 0 }
      : await resolveQuickEntryTags({
          tx,
          projectId: room.projectId,
          actorEmail,
          tagIds: input.tagIds,
          newTagLabels: input.newTagLabels,
        });
    if (tagResolution.kind !== "resolved") return tagResolution;
    const { tags } = tagResolution;

    if (existing) {
      const receipt = await ensureSourceCaptureReceipt(tx, input, session.user, existing);
      if (!receipt.ok) return { kind: "identity-conflict" as const };
      return {
        kind: "saved" as const,
        room,
        tags,
        createdTagCount: tagResolution.createdTagCount,
        reusedTagCount: tagResolution.reusedTagCount,
        ...existing,
        ...receipt,
        idempotentReplay: true,
        sourceIdentityReused: input.kind === "SOURCE",
      };
    }

    const saved = await createEntry(tx, input, session.user.id, actorEmail, room || { id: null, projectId: null }, tags);
    if (!entryMatches(input, saved, session.user.id, room?.projectId || null)) {
      return { kind: "identity-conflict" as const };
    }
    const receipt = await ensureSourceCaptureReceipt(tx, input, session.user, saved);
    if (!receipt.ok) return { kind: "identity-conflict" as const };
    return {
      kind: "saved" as const,
      room,
      tags,
      createdTagCount: tagResolution.createdTagCount,
      reusedTagCount: tagResolution.reusedTagCount,
      ...saved,
      ...receipt,
      idempotentReplay: false,
    };
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
      {
        ok: false,
        code: input.projectId ? "QUICK_ENTRY_NEST_FORBIDDEN" : "QUICK_ENTRY_SESSION_NOT_FOUND",
        error: input.projectId
          ? "That Nest is no longer writable by this account. The phone copy remains protected for review."
          : "This account no longer has access to that Session. The phone copy remains in its protected outbox.",
        localOutboxRetained: true,
      },
      { status: input.projectId ? 403 : 404 },
    );
  }
  if (result.kind === "identity-conflict") {
    return NextResponse.json(
      { ok: false, code: "QUICK_ENTRY_IDENTITY_CONFLICT", error: "That retry identity already belongs to different saved evidence. Quipsly kept the phone copy and changed nothing.", localOutboxRetained: true },
      { status: 409 },
    );
  }
  if (result.kind === "note-policy-forbidden") {
    return NextResponse.json(
      {
        ok: false,
        code: "QUICK_ENTRY_NOTE_POLICY_FORBIDDEN",
        error: "Only a Nest owner or editor can create production or project-team Session notes. The phone copy remains protected for review.",
        localOutboxRetained: true,
      },
      { status: 403 },
    );
  }
  if (result.kind === "invalid-tags") {
    return NextResponse.json(
      { ok: false, code: "QUICK_ENTRY_TAGS_UNAVAILABLE", error: "One or more selected tags no longer belong to the destination Nest. The phone copy remains available for review.", localOutboxRetained: true },
      { status: 409 },
    );
  }
  if (result.kind === "tag-creation-forbidden") {
    return NextResponse.json(
      { ok: false, code: "QUICK_ENTRY_TAG_CREATE_FORBIDDEN", error: "Editor access to the destination Nest is required to create a reusable tag. The phone copy remains available for review.", localOutboxRetained: true },
      { status: 403 },
    );
  }
  if (result.kind === "archived-tag") {
    return NextResponse.json(
      { ok: false, code: "QUICK_ENTRY_TAG_ARCHIVED", error: `“${result.label}” is archived in this Nest. The phone copy remains available for review.`, localOutboxRetained: true },
      { status: 409 },
    );
  }
  if (result.kind === "tag-slug-conflict") {
    return NextResponse.json(
      { ok: false, code: "QUICK_ENTRY_TAG_SLUG_CONFLICT", error: `“${result.label}” conflicts with the existing “${result.existingLabel}” tag. Rename it on the phone before retrying.`, localOutboxRetained: true },
      { status: 409 },
    );
  }

  return NextResponse.json({
    ok: true,
    schema: "quipsly-mobile-quick-entry-v1",
    idempotentReplay: result.idempotentReplay,
    entry: publicEntry(input.kind, result.row, result.room, result.model, result.tags, result.recurrenceSeries, result.reminder),
    tagVocabulary: input.kind === "SOURCE" ? null : {
      requestedNewLabels: input.newTagLabels,
      createdCount: result.createdTagCount,
      reusedCount: result.reusedTagCount,
    },
    sourceCapture: input.kind === "SOURCE" ? {
      receiptId: result.receipt?.id || null,
      captureCount: result.captureCount,
      sourceIdentityReused: result.sourceIdentityReused === true,
      capturedAt: result.receipt?.capturedAt?.toISOString?.() || input.capturedAt.toISOString(),
    } : null,
    boundaries: {
      explicitHumanCapture: true,
      canonicalRecordCommitted: true,
      explicitNoteVisibility: input.kind === "NOTE" && input.callRoomId !== null,
      appendOnlyNoteRevision: input.kind === "NOTE" && input.callRoomId !== null,
      recurrenceAppOwned: input.recurrence !== null,
      dueDateCommitted: input.dueAt !== null,
      canonicalReminderIntentCommitted: input.reminderAt !== null,
      deviceNotificationScheduled: false,
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
      ? input.callRoomId
        ? input.noteVisibility === "CLIENT_SAFE"
          ? "The client-safe Session note is saved and ready for reviewed follow-up. It has not been sent."
          : input.noteVisibility === "SESSION_SHARED"
            ? "The Session note is saved for people with Session access. No message or delivery occurred."
            : input.noteVisibility === "PROJECT_TEAM"
              ? "The production-team Session note is saved. It has not been published or delivered."
              : "The author-private Session note is saved. Review or expand it from the Session workspace."
        : input.projectId
          ? `The private note is saved in ${result.room.projectName}. Continue it from that Nest, Library, or Search.`
          : "Your note is saved privately in My Nest. Continue it from Library or Search."
      : input.kind === "TASK"
        ? input.recurrence
          ? input.callRoomId
            ? "The repeating task is saved in Quipsly. Today and Work now share its exact occurrences; no reminder or provider event was scheduled."
            : input.projectId
              ? `The repeating task is saved in ${result.room.projectName}. Today and Work now share its exact occurrences; no reminder or provider event was scheduled.`
              : "The repeating task is saved in your Home Nest. Today and Work now share its exact occurrences; no reminder or provider event was scheduled."
          : input.reminderAt
            ? input.dueAt
              ? "The task, due date, and reminder intent are saved in Quipsly. This iPhone schedules the private alert only when local notification permission allows it; no provider calendar event was created."
              : "The task and reminder intent are saved in Quipsly. This iPhone schedules the private alert only when local notification permission allows it; no provider calendar event was created."
          : input.dueAt
            ? input.callRoomId
              ? "The task is saved and assigned to you with its due date visible in Today, Work, and Calendar. No reminder or provider event was scheduled."
              : input.projectId
                ? `The task is saved in ${result.room.projectName} and assigned to you, with its due date visible in Today, Work, and Calendar. No reminder or provider event was scheduled.`
                : "The task is saved in your Home Nest and assigned to you, with its due date visible in Today, Work, and Calendar. No reminder or provider event was scheduled."
            : input.callRoomId
              ? "The task is saved and assigned to you. Set its timing from Today, Work, or Calendar when useful."
              : input.projectId
                ? `The task is saved in ${result.room.projectName} and assigned to you. Set its timing from Today, Work, or Calendar when useful.`
                : "The task is saved in your Home Nest and assigned to you. Set its timing from Today, Work, or Calendar when useful."
        : input.callRoomId
          ? "The goal is saved as active. Add progress evidence or supporting tasks when useful."
          : input.projectId
            ? `The goal is saved as active in ${result.room.projectName}. Add progress evidence or supporting tasks when useful.`
            : "The goal is saved as active in your Home Nest. Add progress evidence or supporting tasks when useful.",
  });
}
