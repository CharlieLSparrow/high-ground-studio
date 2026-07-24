import "server-only";

import { createHash, randomUUID } from "node:crypto";

export const CAPTURE_SESSION_CONTEXT_SCHEMA_VERSION = 2;
export const CAPTURE_SESSION_CONTEXT_SOURCE = "quipsly-capture-session-context-v2";
export const CAPTURE_SESSION_CONTEXT_RECEIPT_LIMIT = 24;

const MAX_NOTE_LENGTH = 12_000;
const MAX_ITEM_LENGTH = 500;
const MAX_ITEMS = 80;
const PROJECTION_RECEIPT_LIMIT = 16;

export type CaptureSessionContextEntryKind = "quick-note" | "goal" | "task";

export type CaptureSessionContextEntry = {
  id: string;
  kind: CaptureSessionContextEntryKind;
  text: string;
  position: number;
  projectionId: string | null;
  createdAt: string;
  updatedAt: string;
  source: string;
};

export type CaptureSessionContextRevisionReceipt = {
  revisionId: string;
  parentRevisionId: string | null;
  actorUserId: string;
  source: string;
  createdAt: string;
  contentHash: string;
  notePresent: boolean;
  goalCount: number;
  taskCount: number;
};

export type CaptureSessionContextV2 = {
  schemaVersion: 2;
  revisionId: string;
  revisionNumber: number;
  parentRevisionId: string | null;
  note: string;
  goals: string[];
  tasks: string[];
  entries: {
    note: CaptureSessionContextEntry | null;
    goals: CaptureSessionContextEntry[];
    tasks: CaptureSessionContextEntry[];
  };
  updatedAt: string | null;
  updatedByUserId: string | null;
  source: string;
  revisionReceipts: CaptureSessionContextRevisionReceipt[];
};

type ContextProjectionStats = {
  notesCreated: number;
  notesUpdated: number;
  notesArchived: number;
  goalsCreated: number;
  goalsUpdated: number;
  goalsArchived: number;
  tasksCreated: number;
  tasksUpdated: number;
  tasksCanceled: number;
  tasksArchived: number;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function contextText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function list(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => contextText(item, MAX_ITEM_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_ITEMS);
}

function owns(value: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function validLegacyList(value: unknown) {
  return Array.isArray(value)
    && value.length <= MAX_ITEMS
    && value.every((item) => typeof item === "string" && item.length <= MAX_ITEM_LENGTH);
}

function validStructuredEntry(value: unknown, kind: CaptureSessionContextEntryKind) {
  if (!isObject(value)) return false;
  if (typeof value.text !== "string" || !value.text.trim() || value.text.length > (kind === "quick-note" ? MAX_NOTE_LENGTH : MAX_ITEM_LENGTH)) {
    return false;
  }
  if (owns(value, "kind") && value.kind !== kind) return false;
  if (owns(value, "id") && value.id !== null && typeof value.id !== "string") return false;
  if (owns(value, "projectionId") && value.projectionId !== null && typeof value.projectionId !== "string") return false;
  if (owns(value, "position") && (!Number.isInteger(value.position) || Number(value.position) < 0)) return false;
  return true;
}

function validStructuredList(value: unknown, kind: "goal" | "task") {
  return Array.isArray(value)
    && value.length <= MAX_ITEMS
    && value.every((entry) => validStructuredEntry(entry, kind));
}

function normalizedReplacementList(value: unknown) {
  return (Array.isArray(value) ? value : [])
    .map((item) => typeof item === "string" ? item.trim() : "")
    .filter(Boolean);
}

/**
 * Context POST is full-replacement semantics. Reject partial or ambiguous
 * shapes before opening a transaction so missing fields can never masquerade
 * as an explicit delete-all action.
 */
export function validateCaptureSessionContextReplacement(body: Record<string, unknown>):
  | { ok: true }
  | { ok: false; code: string; error: string } {
  const legacyKeys = ["note", "goals", "tasks"] as const;
  const presentLegacyKeys = legacyKeys.filter((key) => owns(body, key));
  const hasAnyLegacy = presentLegacyKeys.length > 0;
  const hasAllLegacy = presentLegacyKeys.length === legacyKeys.length;
  const hasEntries = owns(body, "entries");

  if (!hasAnyLegacy && !hasEntries) {
    return {
      ok: false,
      code: "SESSION_CONTEXT_REPLACEMENT_REQUIRED",
      error: "Send a complete note, goals, and tasks replacement or a complete structured entries replacement.",
    };
  }

  if (hasAnyLegacy && !hasAllLegacy) {
    return {
      ok: false,
      code: "SESSION_CONTEXT_REPLACEMENT_INCOMPLETE",
      error: "Session context replacement requires note, goals, and tasks together. No context was changed.",
    };
  }

  if (hasAllLegacy) {
    if (typeof body.note !== "string" || body.note.length > MAX_NOTE_LENGTH) {
      return {
        ok: false,
        code: "SESSION_CONTEXT_NOTE_INVALID",
        error: `Session note must be a string no longer than ${MAX_NOTE_LENGTH} characters.`,
      };
    }
    if (!validLegacyList(body.goals) || !validLegacyList(body.tasks)) {
      return {
        ok: false,
        code: "SESSION_CONTEXT_LIST_INVALID",
        error: `Goals and tasks must each be arrays of at most ${MAX_ITEMS} strings, no longer than ${MAX_ITEM_LENGTH} characters each.`,
      };
    }
  }

  if (hasEntries) {
    if (!isObject(body.entries)
      || !owns(body.entries, "note")
      || !owns(body.entries, "goals")
      || !owns(body.entries, "tasks")) {
      return {
        ok: false,
        code: "SESSION_CONTEXT_ENTRIES_INCOMPLETE",
        error: "Structured session context requires note, goals, and tasks entries together. No context was changed.",
      };
    }
    const noteIsValid = body.entries.note === null
      || validStructuredEntry(body.entries.note, "quick-note");
    if (!noteIsValid
      || !validStructuredList(body.entries.goals, "goal")
      || !validStructuredList(body.entries.tasks, "task")) {
      return {
        ok: false,
        code: "SESSION_CONTEXT_ENTRIES_INVALID",
        error: "Structured session entries are malformed or exceed the context limits. No context was changed.",
      };
    }
  }

  if (hasAllLegacy && hasEntries && isObject(body.entries)) {
    const legacyNote = contextText(body.note, MAX_NOTE_LENGTH);
    const structuredNote = isObject(body.entries.note) ? contextText(body.entries.note.text, MAX_NOTE_LENGTH) : "";
    const legacyGoals = normalizedReplacementList(body.goals);
    const structuredGoals = (body.entries.goals as unknown[]).map((entry) => contextText((entry as Record<string, unknown>).text, MAX_ITEM_LENGTH));
    const legacyTasks = normalizedReplacementList(body.tasks);
    const structuredTasks = (body.entries.tasks as unknown[]).map((entry) => contextText((entry as Record<string, unknown>).text, MAX_ITEM_LENGTH));
    if (legacyNote !== structuredNote
      || JSON.stringify(legacyGoals) !== JSON.stringify(structuredGoals)
      || JSON.stringify(legacyTasks) !== JSON.stringify(structuredTasks)) {
      return {
        ok: false,
        code: "SESSION_CONTEXT_REPLACEMENT_MISMATCH",
        error: "Legacy strings and structured session entries describe different replacements. Reload before saving.",
      };
    }
  }

  return { ok: true };
}

function safeIso(value: unknown, fallback: string | null = null) {
  const candidate = contextText(value, 100);
  if (!candidate) return fallback;
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function bounded<T>(items: T[], limit: number) {
  return items.slice(Math.max(0, items.length - limit));
}

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function legacyEntryId(roomId: string, kind: CaptureSessionContextEntryKind, text: string, position: number) {
  return `legacy-${hash({ roomId, kind, text, position }).slice(0, 32)}`;
}

function entryKind(value: unknown): CaptureSessionContextEntryKind | null {
  if (value === "quick-note" || value === "goal" || value === "task") return value;
  return null;
}

function parseEntry(input: unknown, options: {
  roomId: string;
  kind: CaptureSessionContextEntryKind;
  position: number;
  fallbackText?: string;
  fallbackUpdatedAt?: string | null;
  fallbackSource?: string;
}): CaptureSessionContextEntry | null {
  const raw = isObject(input) ? input : {};
  const text = contextText(raw.text, options.kind === "quick-note" ? MAX_NOTE_LENGTH : MAX_ITEM_LENGTH)
    || contextText(options.fallbackText, options.kind === "quick-note" ? MAX_NOTE_LENGTH : MAX_ITEM_LENGTH);
  if (!text) return null;

  const now = options.fallbackUpdatedAt || new Date(0).toISOString();
  return {
    id: contextText(raw.id, 200) || legacyEntryId(options.roomId, options.kind, text, options.position),
    kind: entryKind(raw.kind) || options.kind,
    text,
    position: options.position,
    projectionId: contextText(raw.projectionId, 200) || null,
    createdAt: safeIso(raw.createdAt, now) || now,
    updatedAt: safeIso(raw.updatedAt, now) || now,
    source: contextText(raw.source, 100) || options.fallbackSource || "legacy",
  };
}

function legacyRevisionId(roomId: string, input: {
  note: string;
  goals: string[];
  tasks: string[];
  updatedAt: string | null;
}) {
  return `legacy-${hash({ roomId, ...input }).slice(0, 32)}`;
}

function parseRevisionReceipts(value: unknown) {
  if (!Array.isArray(value)) return [];
  return bounded(value.flatMap((item): CaptureSessionContextRevisionReceipt[] => {
    if (!isObject(item)) return [];
    const revisionId = contextText(item.revisionId, 200);
    const actorUserId = contextText(item.actorUserId, 200);
    const createdAt = safeIso(item.createdAt);
    if (!revisionId || !actorUserId || !createdAt) return [];
    return [{
      revisionId,
      parentRevisionId: contextText(item.parentRevisionId, 200) || null,
      actorUserId,
      source: contextText(item.source, 100) || "unknown",
      createdAt,
      contentHash: contextText(item.contentHash, 100),
      notePresent: item.notePresent === true,
      goalCount: Number.isFinite(item.goalCount) ? Math.max(0, Number(item.goalCount)) : 0,
      taskCount: Number.isFinite(item.taskCount) ? Math.max(0, Number(item.taskCount)) : 0,
    }];
  }), CAPTURE_SESSION_CONTEXT_RECEIPT_LIMIT);
}

export function hasStoredCaptureSessionContextV2(value: unknown) {
  return isObject(value)
    && value.schemaVersion === CAPTURE_SESSION_CONTEXT_SCHEMA_VERSION
    && Boolean(contextText(value.revisionId, 200));
}

/**
 * Reads both the original string-only payload and the structured v2 payload.
 * Legacy IDs/revisions are deterministic so GET remains side-effect free while
 * still giving upgraded clients a stable base revision for their first save.
 */
export function readCaptureSessionContext(roomId: string, value: unknown): CaptureSessionContextV2 {
  const raw = isObject(value) ? value : {};
  const rawEntries = isObject(raw.entries) ? raw.entries : null;
  const updatedAt = safeIso(raw.updatedAt);
  const source = contextText(raw.source, 100) || "nest";

  const legacyNote = contextText(raw.note, MAX_NOTE_LENGTH);
  const legacyGoals = list(raw.goals);
  const legacyTasks = list(raw.tasks);

  const structuredNote = rawEntries
    ? parseEntry(rawEntries.note, {
        roomId,
        kind: "quick-note",
        position: 0,
        fallbackText: legacyNote,
        fallbackUpdatedAt: updatedAt,
        fallbackSource: source,
      })
    : null;
  const note = rawEntries ? structuredNote?.text || "" : legacyNote;

  const structuredGoals = rawEntries && Array.isArray(rawEntries.goals)
    ? rawEntries.goals.flatMap((item, position) => {
        const parsed = parseEntry(item, {
          roomId,
          kind: "goal",
          position,
          fallbackUpdatedAt: updatedAt,
          fallbackSource: source,
        });
        return parsed ? [parsed] : [];
      }).slice(0, MAX_ITEMS)
    : legacyGoals.map((text, position) => parseEntry(null, {
        roomId,
        kind: "goal",
        position,
        fallbackText: text,
        fallbackUpdatedAt: updatedAt,
        fallbackSource: source,
      })!).filter(Boolean);

  const structuredTasks = rawEntries && Array.isArray(rawEntries.tasks)
    ? rawEntries.tasks.flatMap((item, position) => {
        const parsed = parseEntry(item, {
          roomId,
          kind: "task",
          position,
          fallbackUpdatedAt: updatedAt,
          fallbackSource: source,
        });
        return parsed ? [parsed] : [];
      }).slice(0, MAX_ITEMS)
    : legacyTasks.map((text, position) => parseEntry(null, {
        roomId,
        kind: "task",
        position,
        fallbackText: text,
        fallbackUpdatedAt: updatedAt,
        fallbackSource: source,
      })!).filter(Boolean);

  const goals = rawEntries ? structuredGoals.map((entry) => entry.text) : legacyGoals;
  const tasks = rawEntries ? structuredTasks.map((entry) => entry.text) : legacyTasks;
  const fallbackRevisionId = legacyRevisionId(roomId, { note, goals, tasks, updatedAt });

  return {
    schemaVersion: CAPTURE_SESSION_CONTEXT_SCHEMA_VERSION,
    revisionId: contextText(raw.revisionId, 200) || fallbackRevisionId,
    revisionNumber: Number.isInteger(raw.revisionNumber) && Number(raw.revisionNumber) >= 0
      ? Number(raw.revisionNumber)
      : 0,
    parentRevisionId: contextText(raw.parentRevisionId, 200) || null,
    note,
    goals,
    tasks,
    entries: {
      note: rawEntries
        ? structuredNote
        : parseEntry(null, {
            roomId,
            kind: "quick-note",
            position: 0,
            fallbackText: legacyNote,
            fallbackUpdatedAt: updatedAt,
            fallbackSource: source,
          }),
      goals: structuredGoals,
      tasks: structuredTasks,
    },
    updatedAt,
    updatedByUserId: contextText(raw.updatedByUserId, 200) || null,
    source,
    revisionReceipts: parseRevisionReceipts(raw.revisionReceipts),
  };
}

function desiredStructuredEntries(body: Record<string, unknown>, key: "goals" | "tasks") {
  const entries = isObject(body.entries) && Array.isArray(body.entries[key]) ? body.entries[key] : [];
  return entries.filter(isObject);
}

function incomingStrings(body: Record<string, unknown>, key: "goals" | "tasks") {
  if (Array.isArray(body[key])) return list(body[key]);
  return desiredStructuredEntries(body, key)
    .map((entry) => contextText(entry.text, MAX_ITEM_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_ITEMS);
}

function reconcileEntryList(options: {
  roomId: string;
  kind: "goal" | "task";
  desiredTexts: string[];
  incomingEntries: Record<string, unknown>[];
  currentEntries: CaptureSessionContextEntry[];
  now: string;
  source: string;
}) {
  const used = new Set<string>();

  return options.desiredTexts.map((text, position) => {
    const incomingAtPosition = options.incomingEntries[position];
    const incomingId = contextText(incomingAtPosition?.id, 200);
    let current = incomingId
      ? options.currentEntries.find((entry) => entry.id === incomingId && !used.has(entry.id))
      : undefined;

    if (!current) {
      current = options.currentEntries.find((entry) => entry.text === text && !used.has(entry.id));
    }
    if (!current) {
      current = options.currentEntries.find((entry) => entry.position === position && !used.has(entry.id));
    }

    if (current) used.add(current.id);
    const changed = !current || current.text !== text || current.position !== position;
    return {
      id: current?.id || randomUUID(),
      kind: options.kind,
      text,
      position,
      projectionId: current?.projectionId || null,
      createdAt: current?.createdAt || options.now,
      updatedAt: changed ? options.now : current?.updatedAt || options.now,
      source: current?.source || options.source,
    } satisfies CaptureSessionContextEntry;
  });
}

function canonicalEntrySnapshot(context: CaptureSessionContextV2) {
  return {
    note: context.entries.note ? {
      id: context.entries.note.id,
      text: context.entries.note.text,
      position: 0,
    } : null,
    goals: context.entries.goals.map(({ id, text, position }) => ({ id, text, position })),
    tasks: context.entries.tasks.map(({ id, text, position }) => ({ id, text, position })),
  };
}

export function buildNextCaptureSessionContext(args: {
  roomId: string;
  body: Record<string, unknown>;
  current: CaptureSessionContextV2;
  actorUserId: string;
  now?: Date;
  source?: string;
  forceRevision?: boolean;
}) {
  const now = (args.now || new Date()).toISOString();
  const source = contextText(args.source, 100) || "ios-capture";
  const bodyEntries = isObject(args.body.entries) ? args.body.entries : {};
  const incomingNoteEntry = isObject(bodyEntries.note) ? bodyEntries.note : null;
  const note = typeof args.body.note === "string"
    ? contextText(args.body.note, MAX_NOTE_LENGTH)
    : contextText(incomingNoteEntry?.text, MAX_NOTE_LENGTH);

  const noteIncomingId = contextText(incomingNoteEntry?.id, 200);
  let currentNote = noteIncomingId && args.current.entries.note?.id === noteIncomingId
    ? args.current.entries.note
    : null;
  if (!currentNote && note && args.current.entries.note?.text === note) currentNote = args.current.entries.note;
  if (!currentNote && note) currentNote = args.current.entries.note;

  const noteChanged = Boolean(note)
    && (!currentNote || currentNote.text !== note);
  const nextNote = note
    ? {
        id: currentNote?.id || randomUUID(),
        kind: "quick-note" as const,
        text: note,
        position: 0,
        projectionId: currentNote?.projectionId || null,
        createdAt: currentNote?.createdAt || now,
        updatedAt: noteChanged ? now : currentNote?.updatedAt || now,
        source: currentNote?.source || source,
      }
    : null;

  const goals = incomingStrings(args.body, "goals");
  const tasks = incomingStrings(args.body, "tasks");
  const nextGoals = reconcileEntryList({
    roomId: args.roomId,
    kind: "goal",
    desiredTexts: goals,
    incomingEntries: desiredStructuredEntries(args.body, "goals"),
    currentEntries: args.current.entries.goals,
    now,
    source,
  });
  const nextTasks = reconcileEntryList({
    roomId: args.roomId,
    kind: "task",
    desiredTexts: tasks,
    incomingEntries: desiredStructuredEntries(args.body, "tasks"),
    currentEntries: args.current.entries.tasks,
    now,
    source,
  });

  const draft: CaptureSessionContextV2 = {
    schemaVersion: CAPTURE_SESSION_CONTEXT_SCHEMA_VERSION,
    revisionId: args.current.revisionId,
    revisionNumber: args.current.revisionNumber,
    parentRevisionId: args.current.parentRevisionId,
    note,
    goals,
    tasks,
    entries: { note: nextNote, goals: nextGoals, tasks: nextTasks },
    updatedAt: args.current.updatedAt,
    updatedByUserId: args.current.updatedByUserId,
    source,
    revisionReceipts: args.current.revisionReceipts,
  };

  const changed = args.forceRevision === true
    || hash(canonicalEntrySnapshot(draft)) !== hash(canonicalEntrySnapshot(args.current));
  if (!changed) return { context: args.current, changed: false };

  const revisionId = randomUUID();
  const receipt: CaptureSessionContextRevisionReceipt = {
    revisionId,
    parentRevisionId: args.current.revisionId,
    actorUserId: args.actorUserId,
    source,
    createdAt: now,
    contentHash: hash({ note, goals, tasks }),
    notePresent: Boolean(note),
    goalCount: goals.length,
    taskCount: tasks.length,
  };

  return {
    changed: true,
    context: {
      ...draft,
      revisionId,
      revisionNumber: args.current.revisionNumber + 1,
      parentRevisionId: args.current.revisionId,
      updatedAt: now,
      updatedByUserId: args.actorUserId,
      revisionReceipts: bounded([...args.current.revisionReceipts, receipt], CAPTURE_SESSION_CONTEXT_RECEIPT_LIMIT),
    },
  };
}

function sourceObject(value: unknown) {
  return isObject(value) ? value : {};
}

function projectionReceipts(source: Record<string, unknown>) {
  return Array.isArray(source.revisionReceipts)
    ? source.revisionReceipts.filter(isObject).slice(-PROJECTION_RECEIPT_LIMIT)
    : [];
}

function projectionSource(args: {
  existingSource?: unknown;
  entry: CaptureSessionContextEntry;
  revisionId: string;
  actorUserId: string;
  now: string;
  action: "created" | "updated" | "reactivated" | "archived";
  previousText?: string | null;
  active: boolean;
}) {
  const existing = sourceObject(args.existingSource);
  const receipt = {
    revisionId: args.revisionId,
    actorUserId: args.actorUserId,
    at: args.now,
    action: args.action,
    text: args.entry.text,
    previousText: args.previousText || null,
    position: args.entry.position,
  };
  return {
    ...existing,
    source: CAPTURE_SESSION_CONTEXT_SOURCE,
    schemaVersion: CAPTURE_SESSION_CONTEXT_SCHEMA_VERSION,
    contextEntryId: args.entry.id,
    contextKind: args.entry.kind,
    currentRevisionId: args.revisionId,
    position: args.entry.position,
    active: args.active,
    archivedAt: args.active ? null : args.now,
    revisionReceipts: bounded([...projectionReceipts(existing), receipt], PROJECTION_RECEIPT_LIMIT),
  };
}

function isOwnedProjection(record: any, kind?: CaptureSessionContextEntryKind) {
  const source = sourceObject(record?.sourceJson);
  return source.source === CAPTURE_SESSION_CONTEXT_SOURCE
    && (!kind || source.contextKind === kind)
    && Boolean(contextText(source.contextEntryId, 200));
}

function projectionEntryId(record: any) {
  return contextText(sourceObject(record?.sourceJson).contextEntryId, 200);
}

function projectionIsActive(record: any) {
  return sourceObject(record?.sourceJson).active !== false;
}

function findProjection(records: any[], entry: CaptureSessionContextEntry) {
  const byProjectionId = entry.projectionId
    ? records.find((record) => record.id === entry.projectionId && isOwnedProjection(record, entry.kind))
    : null;
  if (byProjectionId) return byProjectionId;

  return records.find((record) => projectionEntryId(record) === entry.id && isOwnedProjection(record, entry.kind) && projectionIsActive(record))
    || records.find((record) => projectionEntryId(record) === entry.id && isOwnedProjection(record, entry.kind))
    || null;
}

function emptyStats(): ContextProjectionStats {
  return {
    notesCreated: 0,
    notesUpdated: 0,
    notesArchived: 0,
    goalsCreated: 0,
    goalsUpdated: 0,
    goalsArchived: 0,
    tasksCreated: 0,
    tasksUpdated: 0,
    tasksCanceled: 0,
    tasksArchived: 0,
  };
}

/**
 * Projects explicit context saves into durable app-owned records. Only rows
 * with the exact source marker above are ever updated, canceled, or archived.
 * The caller must run this in the same transaction as the guarded room update.
 */
export async function projectCaptureSessionContext(args: {
  tx: any;
  room: { id: string; bookingId?: string | null; projectId?: string | null };
  context: CaptureSessionContextV2;
  actorUserId: string;
}) {
  const now = args.context.updatedAt || new Date().toISOString();
  const stats = emptyStats();
  const [allNotes, allTasks, allGoals] = await Promise.all([
    args.tx.coachingNote.findMany({
      where: { roomId: args.room.id },
      select: { id: true, kind: true, title: true, body: true, sourceJson: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    args.tx.actionItem.findMany({
      where: { roomId: args.room.id },
      select: { id: true, title: true, detail: true, status: true, completedAt: true, sourceJson: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    args.tx.goal.findMany({
      where: { roomId: args.room.id },
      select: { id: true, title: true, description: true, status: true, sourceJson: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const ownedNotes = allNotes.filter((record: any) => isOwnedProjection(record));
  const ownedTasks = allTasks.filter((record: any) => isOwnedProjection(record, "task"));
  const ownedGoals = allGoals.filter((record: any) => isOwnedProjection(record, "goal"));
  const selectedNoteIds = new Set<string>();
  const selectedTaskIds = new Set<string>();
  const selectedGoalIds = new Set<string>();

  const noteEntries = [args.context.entries.note, ...args.context.entries.goals]
    .filter((entry): entry is CaptureSessionContextEntry => Boolean(entry));

  for (const entry of noteEntries) {
    const existing = findProjection(ownedNotes, entry);
    const title = entry.kind === "quick-note" ? "Session quick note" : "Session goal";
    let noteId: string;
    if (!existing) {
      const created = await args.tx.coachingNote.create({
        data: {
          roomId: args.room.id,
          bookingId: args.room.bookingId || null,
          authorUserId: args.actorUserId,
          kind: "SESSION_NOTE",
          visibility: "AUTHOR_PRIVATE",
          title,
          body: entry.text,
          sourceJson: projectionSource({
            entry,
            revisionId: args.context.revisionId,
            actorUserId: args.actorUserId,
            now,
            action: "created",
            active: true,
          }),
        },
      });
      noteId = created.id;
      stats.notesCreated += 1;
    } else {
      noteId = existing.id;
      const existingSource = sourceObject(existing.sourceJson);
      const needsUpdate = existing.body !== entry.text
        || existing.title !== title
        || existingSource.active === false
        || Number(existingSource.position) !== entry.position;
      if (needsUpdate) {
        await args.tx.coachingNote.updateMany({
          where: { id: existing.id, roomId: args.room.id },
          data: {
            title,
            body: entry.text,
            sourceJson: projectionSource({
              existingSource,
              entry,
              revisionId: args.context.revisionId,
              actorUserId: args.actorUserId,
              now,
              action: existingSource.active === false ? "reactivated" : "updated",
              previousText: existing.body,
              active: true,
            }),
          },
        });
        stats.notesUpdated += 1;
      }
    }
    entry.projectionId = noteId;
    selectedNoteIds.add(noteId);

    if (entry.kind === "goal") {
      const existingGoal = findProjection(ownedGoals, entry);
      if (!existingGoal) {
        const createdGoal = await args.tx.goal.create({
          data: {
            ownerUserId: args.actorUserId,
            roomId: args.room.id,
            bookingId: args.room.bookingId || null,
            projectId: args.room.projectId || null,
            title: entry.text,
            status: "ACTIVE",
            sourceJson: {
              ...projectionSource({
                entry,
                revisionId: args.context.revisionId,
                actorUserId: args.actorUserId,
                now,
                action: "created",
                active: true,
              }),
              legacyCoachingNoteId: noteId,
            },
          },
        });
        selectedGoalIds.add(createdGoal.id);
        stats.goalsCreated += 1;
      } else {
        const existingGoalSource = sourceObject(existingGoal.sourceJson);
        const goalNeedsUpdate = existingGoal.title !== entry.text
          || existingGoal.status === "ARCHIVED"
          || existingGoalSource.active === false
          || Number(existingGoalSource.position) !== entry.position
          || existingGoalSource.legacyCoachingNoteId !== noteId;
        if (goalNeedsUpdate) {
          await args.tx.goal.updateMany({
            where: { id: existingGoal.id, roomId: args.room.id },
            data: {
              title: entry.text,
              ...(existingGoal.status === "ARCHIVED" ? { status: "ACTIVE", achievedAt: null } : {}),
              sourceJson: {
                ...projectionSource({
                  existingSource: existingGoalSource,
                  entry,
                  revisionId: args.context.revisionId,
                  actorUserId: args.actorUserId,
                  now,
                  action: existingGoalSource.active === false ? "reactivated" : "updated",
                  previousText: existingGoal.title,
                  active: true,
                }),
                legacyCoachingNoteId: noteId,
              },
            },
          });
          stats.goalsUpdated += 1;
        }
        selectedGoalIds.add(existingGoal.id);
      }
    }
  }

  for (const existing of ownedNotes) {
    if (selectedNoteIds.has(existing.id) || !projectionIsActive(existing)) continue;
    const source = sourceObject(existing.sourceJson);
    const entry: CaptureSessionContextEntry = {
      id: projectionEntryId(existing),
      kind: entryKind(source.contextKind) || "quick-note",
      text: existing.body,
      position: Number(source.position) || 0,
      projectionId: existing.id,
      createdAt: safeIso(existing.createdAt, now) || now,
      updatedAt: now,
      source: CAPTURE_SESSION_CONTEXT_SOURCE,
    };
    await args.tx.coachingNote.updateMany({
      where: { id: existing.id, roomId: args.room.id },
      data: {
        sourceJson: projectionSource({
          existingSource: source,
          entry,
          revisionId: args.context.revisionId,
          actorUserId: args.actorUserId,
          now,
          action: "archived",
          previousText: existing.body,
          active: false,
        }),
      },
    });
    stats.notesArchived += 1;
  }

  for (const existing of ownedGoals) {
    if (selectedGoalIds.has(existing.id) || !projectionIsActive(existing)) continue;
    const source = sourceObject(existing.sourceJson);
    const entry: CaptureSessionContextEntry = {
      id: projectionEntryId(existing),
      kind: "goal",
      text: existing.title,
      position: Number(source.position) || 0,
      projectionId: contextText(source.legacyCoachingNoteId, 200) || null,
      createdAt: safeIso(existing.createdAt, now) || now,
      updatedAt: now,
      source: CAPTURE_SESSION_CONTEXT_SOURCE,
    };
    await args.tx.goal.updateMany({
      where: { id: existing.id, roomId: args.room.id },
      data: {
        status: "ARCHIVED",
        achievedAt: null,
        sourceJson: {
          ...projectionSource({
            existingSource: source,
            entry,
            revisionId: args.context.revisionId,
            actorUserId: args.actorUserId,
            now,
            action: "archived",
            previousText: existing.title,
            active: false,
          }),
          legacyCoachingNoteId: source.legacyCoachingNoteId || null,
        },
      },
    });
    stats.goalsArchived += 1;
  }

  for (const entry of args.context.entries.tasks) {
    let existing = findProjection(ownedTasks, entry);
    // A completed/canceled action is durable history. Editing it creates a new
    // open action rather than rewriting the historical outcome.
    if (existing && existing.status !== "OPEN" && existing.title !== entry.text) existing = null;

    if (!existing) {
      const created = await args.tx.actionItem.create({
        data: {
          roomId: args.room.id,
          bookingId: args.room.bookingId || null,
          projectId: args.room.projectId || null,
          assignedUserId: args.actorUserId,
          title: entry.text,
          status: "OPEN",
          sourceJson: projectionSource({
            entry,
            revisionId: args.context.revisionId,
            actorUserId: args.actorUserId,
            now,
            action: "created",
            active: true,
          }),
        },
      });
      entry.projectionId = created.id;
      selectedTaskIds.add(created.id);
      stats.tasksCreated += 1;
      continue;
    }

    const existingSource = sourceObject(existing.sourceJson);
    const wasContextCanceled = existing.status === "CANCELED" && existingSource.archivedAt;
    const needsUpdate = existing.title !== entry.text
      || existingSource.active === false
      || Number(existingSource.position) !== entry.position
      || wasContextCanceled;
    if (needsUpdate) {
      await args.tx.actionItem.updateMany({
        where: { id: existing.id, roomId: args.room.id },
        data: {
          title: entry.text,
          ...(wasContextCanceled ? { status: "OPEN", completedAt: null } : {}),
          sourceJson: projectionSource({
            existingSource,
            entry,
            revisionId: args.context.revisionId,
            actorUserId: args.actorUserId,
            now,
            action: existingSource.active === false ? "reactivated" : "updated",
            previousText: existing.title,
            active: true,
          }),
        },
      });
      stats.tasksUpdated += 1;
    }
    entry.projectionId = existing.id;
    selectedTaskIds.add(existing.id);
  }

  for (const existing of ownedTasks) {
    if (selectedTaskIds.has(existing.id) || !projectionIsActive(existing)) continue;
    const source = sourceObject(existing.sourceJson);
    const entry: CaptureSessionContextEntry = {
      id: projectionEntryId(existing),
      kind: "task",
      text: existing.title,
      position: Number(source.position) || 0,
      projectionId: existing.id,
      createdAt: safeIso(existing.createdAt, now) || now,
      updatedAt: now,
      source: CAPTURE_SESSION_CONTEXT_SOURCE,
    };
    const cancelOpenTask = existing.status === "OPEN";
    await args.tx.actionItem.updateMany({
      where: { id: existing.id, roomId: args.room.id },
      data: {
        ...(cancelOpenTask ? { status: "CANCELED", completedAt: null } : {}),
        sourceJson: projectionSource({
          existingSource: source,
          entry,
          revisionId: args.context.revisionId,
          actorUserId: args.actorUserId,
          now,
          action: "archived",
          previousText: existing.title,
          active: false,
        }),
      },
    });
    if (cancelOpenTask) stats.tasksCanceled += 1;
    else stats.tasksArchived += 1;
  }

  return { context: args.context, stats };
}
