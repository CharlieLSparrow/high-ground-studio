import { createHash } from "node:crypto";
import { normalizeWorkTagLabel } from "@/lib/server/work-tags";
import { validateTaskRecurrenceRule, type TaskRecurrenceRule } from "@/lib/task-recurrence";

export const MOBILE_CAPTURE_QUICK_ENTRY_SCHEMA = "quipsly-mobile-quick-entry-v1" as const;

export const MOBILE_CAPTURE_QUICK_ENTRY_KINDS = ["NOTE", "TASK", "GOAL", "SOURCE"] as const;
export type MobileCaptureQuickEntryKind = typeof MOBILE_CAPTURE_QUICK_ENTRY_KINDS[number];

export type MobileCaptureQuickEntryInput = {
  clientRequestId: string;
  callRoomId: string | null;
  kind: MobileCaptureQuickEntryKind;
  title: string | null;
  body: string;
  sourceUrl: string | null;
  tagIds: string[];
  newTagLabels: string[];
  capturedAt: Date;
  dueAt: Date | null;
  reminderAt: Date | null;
  recurrence: TaskRecurrenceRule | null;
};

export type MobileCaptureQuickEntryValidation =
  | { ok: true; value: MobileCaptureQuickEntryInput }
  | { ok: false; code: string; error: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizedText(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function fullText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function parsedCapturedAt(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return new Date();
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function parsedOptionalDate(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !value.trim()) return "invalid" as const;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : "invalid" as const;
}

export function validateMobileCaptureQuickEntry(value: unknown): MobileCaptureQuickEntryValidation {
  const body = record(value);
  const clientRequestId = normalizedText(body.clientRequestId, 80).toLowerCase();
  const callRoomId = normalizedText(body.callRoomId, 200);
  const kind = normalizedText(body.kind, 20).toUpperCase() as MobileCaptureQuickEntryKind;
  const title = normalizedText(body.title, 500);
  const entryBody = fullText(body.body, kind === "NOTE" || kind === "SOURCE" ? 20_000 : 5_000);
  const rawSourceUrl = fullText(body.sourceUrl, 20_000);
  const sourceUrl = rawSourceUrl ? mobileCaptureQuickEntryUrl(rawSourceUrl) : null;
  const rawTagIds = Array.isArray(body.tagIds) ? body.tagIds : [];
  const tagIds = [...new Set(rawTagIds.map((value) => normalizedText(value, 200)).filter(Boolean))].sort();
  const rawNewTagLabels = Array.isArray(body.newTagLabels) ? body.newTagLabels : [];
  const newTagLabels = rawNewTagLabels.map(normalizeWorkTagLabel).filter(Boolean);
  const canonicalNewTagLabels = newTagLabels.map((label) => label.normalize("NFKC").toLocaleLowerCase("en-US"));
  const capturedAt = parsedCapturedAt(body.capturedAt);
  const dueAt = parsedOptionalDate(body.dueAt);
  const reminderAt = parsedOptionalDate(body.reminderAt);
  const rawRecurrence = record(body.recurrence);
  const hasRecurrence = Object.keys(rawRecurrence).length > 0;
  const cadence = normalizedText(rawRecurrence.cadence, 20).toUpperCase();
  const frequency = normalizedText(rawRecurrence.frequency, 20).toUpperCase();
  const interval = Number(rawRecurrence.interval);
  const timezone = normalizedText(rawRecurrence.timezone, 100);
  const localTimeMinutes = Number(rawRecurrence.localTimeMinutes);
  const anchorLocalDate = normalizedText(rawRecurrence.anchorLocalDate, 20);
  const anchorDayOfMonth = Number(anchorLocalDate.slice(8, 10));
  const recurrence = hasRecurrence ? {
    cadence,
    frequency,
    interval,
    timezone,
    localTimeMinutes,
    anchorLocalDate,
    anchorDayOfMonth,
  } as TaskRecurrenceRule : null;

  if (!UUID_PATTERN.test(clientRequestId)) {
    return { ok: false, code: "QUICK_ENTRY_REQUEST_ID_INVALID", error: "Quick capture requires one stable UUID so an offline retry cannot create a duplicate." };
  }
  if ((kind === "TASK" || kind === "GOAL") && !callRoomId) {
    return { ok: false, code: "QUICK_ENTRY_SESSION_REQUIRED", error: "Choose a Session before saving a task or goal." };
  }
  if (!MOBILE_CAPTURE_QUICK_ENTRY_KINDS.includes(kind)) {
    return { ok: false, code: "QUICK_ENTRY_KIND_INVALID", error: "Quick capture kind must be Note, Task, Goal, or Source." };
  }
  if (!capturedAt) {
    return { ok: false, code: "QUICK_ENTRY_CAPTURED_AT_INVALID", error: "Quick capture time must be a valid ISO date." };
  }
  if (dueAt === "invalid") {
    return { ok: false, code: "QUICK_ENTRY_DUE_AT_INVALID", error: "The task due date must be a valid date and time." };
  }
  if (dueAt && kind !== "TASK") {
    return { ok: false, code: "QUICK_ENTRY_DUE_AT_TASK_ONLY", error: "Only a Task can have a due date." };
  }
  if (reminderAt === "invalid") {
    return { ok: false, code: "QUICK_ENTRY_REMINDER_AT_INVALID", error: "The task reminder must be a valid date and time." };
  }
  if (reminderAt && kind !== "TASK") {
    return { ok: false, code: "QUICK_ENTRY_REMINDER_AT_TASK_ONLY", error: "Only a Task can have a reminder." };
  }
  if (reminderAt && (
    reminderAt.getTime() <= capturedAt.getTime()
    || reminderAt.getTime() - capturedAt.getTime() > 10 * 365 * 86_400_000
  )) {
    return { ok: false, code: "QUICK_ENTRY_REMINDER_RANGE_INVALID", error: "Choose a reminder after capture and within the next ten years." };
  }
  if (kind === "NOTE" && !entryBody) {
    return { ok: false, code: "QUICK_ENTRY_NOTE_REQUIRED", error: "Write the note before saving it." };
  }
  if (kind === "SOURCE" && !entryBody) {
    return { ok: false, code: "QUICK_ENTRY_SOURCE_REQUIRED", error: "Paste a web link or quoted text before saving the source." };
  }
  if (rawSourceUrl && (!sourceUrl || kind !== "SOURCE")) {
    return { ok: false, code: "QUICK_ENTRY_SOURCE_URL_INVALID", error: "Source provenance must be an HTTP(S) webpage URL attached to a source capture." };
  }
  if (
    rawTagIds.length + rawNewTagLabels.length > 8
    || tagIds.length !== rawTagIds.length
    || newTagLabels.length !== rawNewTagLabels.length
    || new Set(canonicalNewTagLabels).size !== canonicalNewTagLabels.length
  ) {
    return { ok: false, code: "QUICK_ENTRY_TAGS_INVALID", error: "Choose or name at most eight distinct canonical Nest tags." };
  }
  if (kind === "SOURCE" && (tagIds.length > 0 || newTagLabels.length > 0)) {
    return { ok: false, code: "QUICK_ENTRY_SOURCE_TAGS_REQUIRE_FILING", error: "Choose tags after filing this private source into a Research Nest." };
  }
  const bodyUrl = kind === "SOURCE" ? mobileCaptureQuickEntryUrl(entryBody) : null;
  if (bodyUrl && sourceUrl && bodyUrl !== sourceUrl) {
    return { ok: false, code: "QUICK_ENTRY_SOURCE_URL_CONFLICT", error: "The shared link and its source provenance disagree. Review the capture before retrying." };
  }
  if ((kind === "TASK" || kind === "GOAL") && !title) {
    return { ok: false, code: "QUICK_ENTRY_TITLE_REQUIRED", error: `Name the ${kind.toLowerCase()} before saving it.` };
  }
  if (hasRecurrence && kind !== "TASK") {
    return { ok: false, code: "QUICK_ENTRY_RECURRENCE_TASK_ONLY", error: "Only a Task can repeat. Save the note, goal, or source without recurrence." };
  }
  if (dueAt && recurrence) {
    return { ok: false, code: "QUICK_ENTRY_DUE_AT_RECURRENCE_CONFLICT", error: "A repeating Task gets its timing from the recurrence rule. Remove the separate due date before saving." };
  }
  if (reminderAt && recurrence) {
    return { ok: false, code: "QUICK_ENTRY_REMINDER_RECURRENCE_CONFLICT", error: "Repeating reminders need occurrence-aware controls. Save this as a one-time Task reminder for now." };
  }
  if (recurrence && (
    !["FIXED", "COMPLETION"].includes(recurrence.cadence)
    || !["DAILY", "WEEKLY", "MONTHLY"].includes(recurrence.frequency)
    || !validateTaskRecurrenceRule(recurrence)
  )) {
    return { ok: false, code: "QUICK_ENTRY_RECURRENCE_INVALID", error: "Review the repeat cadence, first local due time, interval, and timezone before saving." };
  }

  return {
    ok: true,
    value: {
      clientRequestId,
      callRoomId: callRoomId || null,
      kind,
      title: title || null,
      body: entryBody,
      sourceUrl,
      tagIds,
      newTagLabels,
      capturedAt,
      dueAt,
      reminderAt,
      recurrence,
    },
  };
}

export function mobileCaptureQuickEntryId(kind: MobileCaptureQuickEntryKind, clientRequestId: string) {
  return `mobile-${kind.toLowerCase()}-${clientRequestId.toLowerCase()}`;
}

export function mobileCaptureQuickEntrySeriesId(clientRequestId: string) {
  return `mobile-task-series-${clientRequestId.toLowerCase()}`;
}

export function mobileCaptureQuickEntryReminderId(clientRequestId: string) {
  return `mobile-task-reminder-${clientRequestId.toLowerCase()}`;
}

export function mobileCaptureQuickEntrySource(input: MobileCaptureQuickEntryInput, actorUserId: string, projectId: string | null) {
  return {
    schema: MOBILE_CAPTURE_QUICK_ENTRY_SCHEMA,
    surface: "ios-capture",
    origin: "explicit-human-capture",
    clientRequestId: input.clientRequestId,
    callRoomId: input.callRoomId,
    projectId,
    sourceUrl: input.sourceUrl,
    tagIds: input.tagIds,
    newTagLabels: input.newTagLabels,
    capturedAt: input.capturedAt.toISOString(),
    dueAt: input.dueAt?.toISOString() ?? null,
    reminderAt: input.reminderAt?.toISOString() ?? null,
    actorUserId,
    humanCommitted: true,
    offlineRetrySafe: true,
    recurrence: input.recurrence,
    externalSideEffects: false,
    calendarMutated: false,
    messageSent: false,
    published: false,
  };
}

export function isMobileCaptureQuickEntrySource(
  value: unknown,
  expected: Pick<MobileCaptureQuickEntryInput, "clientRequestId" | "callRoomId" | "kind" | "tagIds" | "newTagLabels" | "dueAt" | "reminderAt">,
  actorUserId: string,
) {
  const source = record(value);
  const sourceTagIds = Array.isArray(source.tagIds)
    ? source.tagIds.map((value) => normalizedText(value, 200)).filter(Boolean).sort()
    : [];
  const sourceNewTagLabels = Array.isArray(source.newTagLabels)
    ? source.newTagLabels.map(normalizeWorkTagLabel).filter(Boolean)
    : [];
  return source.schema === MOBILE_CAPTURE_QUICK_ENTRY_SCHEMA
    && source.clientRequestId === expected.clientRequestId
    && source.callRoomId === expected.callRoomId
    && source.actorUserId === actorUserId
    && JSON.stringify(sourceTagIds) === JSON.stringify(expected.tagIds)
    && JSON.stringify(sourceNewTagLabels) === JSON.stringify(expected.newTagLabels)
    && (source.dueAt ?? null) === (expected.dueAt?.toISOString() ?? null)
    && (source.reminderAt ?? null) === (expected.reminderAt?.toISOString() ?? null)
    && source.origin === "explicit-human-capture";
}

export function mobileCaptureQuickEntryUrl(value: string) {
  try {
    const parsed = new URL(value.trim());
    return (parsed.protocol === "https:" || parsed.protocol === "http:") && parsed.username === "" && parsed.password === ""
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

export function mobileCaptureSourceFingerprint(input: Pick<MobileCaptureQuickEntryInput, "kind" | "body" | "sourceUrl">) {
  if (input.kind !== "SOURCE") return null;
  const bodyUrl = mobileCaptureQuickEntryUrl(input.body);
  const mode = bodyUrl ? "BOOKMARK" : "SNIPPET";
  const sourceUrl = bodyUrl || input.sourceUrl || "";
  return createHash("sha256")
    .update([MOBILE_CAPTURE_QUICK_ENTRY_SCHEMA, mode, sourceUrl, input.body].join("\u0000"), "utf8")
    .digest("hex");
}
