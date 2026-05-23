import type { StudioCollaborationSpanTag } from "./studio-collaboration-span-model";
import {
  createSyntheticReviewNoteState,
  summarizeSyntheticReviewNotes,
  validateSyntheticReviewNoteState,
  type StudioCollaborationReviewNote,
  type StudioCollaborationReviewNoteAuthorId,
  type StudioCollaborationReviewNoteState,
  type StudioCollaborationReviewNoteStatus,
  type StudioCollaborationReviewNoteSummary,
} from "./studio-collaboration-review-note-model";

export const STUDIO_COLLABORATION_ANNOTATION_EVENT_LOG_VERSION =
  "studio-collaboration-annotation-event-log-v1";

export type StudioCollaborationAnnotationEventType =
  | "review-note-created"
  | "review-note-body-edited"
  | "review-note-status-changed";

export type StudioCollaborationAnnotationEventBase = {
  eventId: string;
  eventType: StudioCollaborationAnnotationEventType;
  createdAt: string;
  actorId: StudioCollaborationReviewNoteAuthorId;
};

export type StudioCollaborationReviewNoteCreatedEvent =
  StudioCollaborationAnnotationEventBase & {
    eventType: "review-note-created";
    noteId: string;
    spanId: string;
    blockId: string;
    body: string;
  };

export type StudioCollaborationReviewNoteBodyEditedEvent =
  StudioCollaborationAnnotationEventBase & {
    eventType: "review-note-body-edited";
    noteId: string;
    nextBody: string;
  };

export type StudioCollaborationReviewNoteStatusChangedEvent =
  StudioCollaborationAnnotationEventBase & {
    eventType: "review-note-status-changed";
    noteId: string;
    nextStatus: StudioCollaborationReviewNoteStatus;
  };

export type StudioCollaborationAnnotationEvent =
  | StudioCollaborationReviewNoteCreatedEvent
  | StudioCollaborationReviewNoteBodyEditedEvent
  | StudioCollaborationReviewNoteStatusChangedEvent;

export type StudioCollaborationAnnotationEventLog = {
  schemaVersion: typeof STUDIO_COLLABORATION_ANNOTATION_EVENT_LOG_VERSION;
  events: StudioCollaborationAnnotationEvent[];
  safety: {
    syntheticDataOnly: true;
    sourceTextMutation: false;
    serverWrites: false;
    localStorage: false;
    dbSchema: false;
    productionManuscriptEditing: false;
    productionSnapshot: false;
    checkpointMetadataPrimaryStore: false;
  };
};

export type StudioCollaborationAnnotationEventLogSummary = {
  eventCount: number;
  createdCount: number;
  editedCount: number;
  statusChangedCount: number;
  noteIds: string[];
  latestEventId: string | null;
};

export type StudioCollaborationAnnotationReplayResult = {
  ok: boolean;
  state: StudioCollaborationReviewNoteState;
  summary: StudioCollaborationReviewNoteSummary;
  eventLogSummary: StudioCollaborationAnnotationEventLogSummary;
  appliedEventCount: number;
  errors: string[];
  warnings: string[];
};

export type StudioCollaborationAnnotationEventLogReference = {
  referenceVersion: "studio-annotation-event-log-reference-v1";
  eventLogVersion: typeof STUDIO_COLLABORATION_ANNOTATION_EVENT_LOG_VERSION;
  eventCount: number;
  latestEventId: string | null;
  annotationStateVersion: string;
  checkpointMetadataPrimaryStore: false;
  manualSnapshotEmbedsEvents: false;
};

export type StudioCollaborationAnnotationEventLogValidation = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

const knownEventTypes: StudioCollaborationAnnotationEventType[] = [
  "review-note-created",
  "review-note-body-edited",
  "review-note-status-changed",
];
const knownAuthorIds: StudioCollaborationReviewNoteAuthorId[] = [
  "charlie",
  "homer",
];
const knownStatuses: StudioCollaborationReviewNoteStatus[] = [
  "open",
  "addressed",
  "archived",
];
const forbiddenAnnotationEventMarkers = [
  "learning-to-lead.living",
  "real-manuscript-draft.docx",
  "apps/web/content",
  "apps/web/content/_inbox",
  "apps/web/content/_staging",
  "apps/web/content/publish",
  "localStorageData",
  "sessionStorageData",
  "cookie",
  "auth-storage-state",
  "access_token",
  "refresh_token",
  "id_token",
  "DATABASE_URL",
  "AUTH_SECRET",
  "GOOGLE_CLIENT_SECRET",
  "ManuscriptBlock",
  "StoryDraft",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function createEventId(parts: string[]) {
  return ["synthetic-annotation-event", ...parts.map(normalizeSlug)].join("-");
}

function createNoteId(input: {
  spanId: string;
  actorId: StudioCollaborationReviewNoteAuthorId;
  body: string;
}) {
  return [
    "synthetic-review-note",
    input.spanId,
    input.actorId,
    normalizeSlug(input.body).slice(0, 32) || "note",
  ].join("-");
}

function cloneEvent(
  event: StudioCollaborationAnnotationEvent,
): StudioCollaborationAnnotationEvent {
  return {
    ...event,
  };
}

function cloneEventLog(
  log: StudioCollaborationAnnotationEventLog,
): StudioCollaborationAnnotationEventLog {
  return {
    schemaVersion: log.schemaVersion,
    events: log.events.map(cloneEvent),
    safety: { ...log.safety },
  };
}

function containsForbiddenMarker(input: unknown) {
  const serialized = JSON.stringify(input);

  return forbiddenAnnotationEventMarkers.filter((marker) =>
    serialized.includes(marker),
  );
}

function createReviewNoteFromEvent(
  event: StudioCollaborationReviewNoteCreatedEvent,
): StudioCollaborationReviewNote {
  return {
    noteId: event.noteId,
    spanId: event.spanId,
    blockId: event.blockId,
    authorId: event.actorId,
    body: event.body,
    status: "open",
    createdAt: event.createdAt,
    updatedAt: event.createdAt,
  };
}

function replayEvents(
  events: StudioCollaborationAnnotationEvent[],
  errors: string[],
) {
  const notes = new Map<string, StudioCollaborationReviewNote>();

  for (const event of events) {
    if (event.eventType === "review-note-created") {
      if (notes.has(event.noteId)) {
        errors.push(`Duplicate review note create event for ${event.noteId}.`);
        continue;
      }

      notes.set(event.noteId, createReviewNoteFromEvent(event));
      continue;
    }

    const note = notes.get(event.noteId);

    if (!note) {
      errors.push(`Annotation event references missing note ${event.noteId}.`);
      continue;
    }

    if (event.eventType === "review-note-body-edited") {
      notes.set(event.noteId, {
        ...note,
        body: event.nextBody,
        updatedAt: event.createdAt,
      });
      continue;
    }

    const nextNote: StudioCollaborationReviewNote = {
      ...note,
      status: event.nextStatus,
      updatedAt: event.createdAt,
    };

    if (event.nextStatus === "open") {
      delete nextNote.resolvedBy;
      delete nextNote.resolvedAt;
    } else {
      nextNote.resolvedBy = event.actorId;
      nextNote.resolvedAt = event.createdAt;
    }

    notes.set(event.noteId, nextNote);
  }

  return [...notes.values()].sort(
    (first, second) =>
      first.blockId.localeCompare(second.blockId) ||
      first.spanId.localeCompare(second.spanId) ||
      first.createdAt.localeCompare(second.createdAt) ||
      first.noteId.localeCompare(second.noteId),
  );
}

export function createEmptyAnnotationEventLog(): StudioCollaborationAnnotationEventLog {
  return {
    schemaVersion: STUDIO_COLLABORATION_ANNOTATION_EVENT_LOG_VERSION,
    events: [],
    safety: {
      syntheticDataOnly: true,
      sourceTextMutation: false,
      serverWrites: false,
      localStorage: false,
      dbSchema: false,
      productionManuscriptEditing: false,
      productionSnapshot: false,
      checkpointMetadataPrimaryStore: false,
    },
  };
}

export function createReviewNoteCreatedEvent(
  span: StudioCollaborationSpanTag,
  actorId: StudioCollaborationReviewNoteAuthorId,
  body: string,
): StudioCollaborationReviewNoteCreatedEvent | null {
  const normalizedBody = body.trim();

  if (!span.spanId.trim() || !span.blockId.trim() || !normalizedBody) {
    return null;
  }

  const noteId = createNoteId({
    spanId: span.spanId,
    actorId,
    body: normalizedBody,
  });

  return {
    eventId: createEventId(["create", noteId]),
    eventType: "review-note-created",
    createdAt: nowIso(),
    actorId,
    noteId,
    spanId: span.spanId,
    blockId: span.blockId,
    body: normalizedBody,
  };
}

export function createReviewNoteBodyEditedEvent(
  noteId: string,
  actorId: StudioCollaborationReviewNoteAuthorId,
  nextBody: string,
): StudioCollaborationReviewNoteBodyEditedEvent | null {
  const normalizedBody = nextBody.trim();

  if (!noteId.trim() || !normalizedBody) {
    return null;
  }

  return {
    eventId: createEventId(["edit", noteId, normalizedBody.slice(0, 32)]),
    eventType: "review-note-body-edited",
    createdAt: nowIso(),
    actorId,
    noteId,
    nextBody: normalizedBody,
  };
}

export function createReviewNoteStatusChangedEvent(
  noteId: string,
  actorId: StudioCollaborationReviewNoteAuthorId,
  nextStatus: StudioCollaborationReviewNoteStatus,
): StudioCollaborationReviewNoteStatusChangedEvent | null {
  if (!noteId.trim() || !knownStatuses.includes(nextStatus)) {
    return null;
  }

  return {
    eventId: createEventId(["status", noteId, nextStatus, actorId]),
    eventType: "review-note-status-changed",
    createdAt: nowIso(),
    actorId,
    noteId,
    nextStatus,
  };
}

export function validateAnnotationEvent(
  event: unknown,
): StudioCollaborationAnnotationEventLogValidation {
  const errors: string[] = [];
  const warnings = [
    "Synthetic annotation event only.",
    "Annotation events do not persist or publish anything in this lab.",
  ];

  if (!isRecord(event)) {
    return {
      ok: false,
      errors: ["Annotation event must be an object."],
      warnings,
    };
  }

  for (const key of ["eventId", "createdAt"] as const) {
    if (typeof event[key] !== "string" || !event[key].trim()) {
      errors.push(`Annotation event ${key} is required.`);
    }
  }

  if (
    !knownEventTypes.includes(
      event.eventType as StudioCollaborationAnnotationEventType,
    )
  ) {
    errors.push("Annotation event eventType is unknown.");
  }

  if (!knownAuthorIds.includes(event.actorId as StudioCollaborationReviewNoteAuthorId)) {
    errors.push("Annotation event actorId must be charlie or homer.");
  }

  if (event.eventType === "review-note-created") {
    for (const key of ["noteId", "spanId", "blockId", "body"] as const) {
      if (typeof event[key] !== "string" || !event[key].trim()) {
        errors.push(`Annotation create event ${key} is required.`);
      }
    }
  }

  if (event.eventType === "review-note-body-edited") {
    if (typeof event.noteId !== "string" || !event.noteId.trim()) {
      errors.push("Annotation edit event noteId is required.");
    }

    if (typeof event.nextBody !== "string" || !event.nextBody.trim()) {
      errors.push("Annotation edit event nextBody is required.");
    }
  }

  if (event.eventType === "review-note-status-changed") {
    if (typeof event.noteId !== "string" || !event.noteId.trim()) {
      errors.push("Annotation status event noteId is required.");
    }

    if (!knownStatuses.includes(event.nextStatus as StudioCollaborationReviewNoteStatus)) {
      errors.push("Annotation status event nextStatus is unknown.");
    }
  }

  const foundMarkers = containsForbiddenMarker(event);

  if (foundMarkers.length) {
    errors.push(
      `Annotation event contains forbidden real-content or secret markers: ${foundMarkers.join(", ")}.`,
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

export function appendAnnotationEvent(
  log: StudioCollaborationAnnotationEventLog,
  event: StudioCollaborationAnnotationEvent,
): StudioCollaborationAnnotationEventLog {
  const validation = validateAnnotationEvent(event);

  if (
    !validation.ok ||
    log.events.some((existing) => existing.eventId === event.eventId)
  ) {
    return cloneEventLog(log);
  }

  return {
    ...cloneEventLog(log),
    events: [...log.events.map(cloneEvent), cloneEvent(event)],
  };
}

export function summarizeAnnotationEventLog(
  log: StudioCollaborationAnnotationEventLog,
): StudioCollaborationAnnotationEventLogSummary {
  const noteIds = [...new Set(log.events.map((event) => event.noteId))].sort();

  return {
    eventCount: log.events.length,
    createdCount: log.events.filter(
      (event) => event.eventType === "review-note-created",
    ).length,
    editedCount: log.events.filter(
      (event) => event.eventType === "review-note-body-edited",
    ).length,
    statusChangedCount: log.events.filter(
      (event) => event.eventType === "review-note-status-changed",
    ).length,
    noteIds,
    latestEventId: log.events.at(-1)?.eventId ?? null,
  };
}

export function validateAnnotationEventLog(
  log: unknown,
): StudioCollaborationAnnotationEventLogValidation {
  const errors: string[] = [];
  const warnings = [
    "Synthetic annotation event log only.",
    "Event log is pure lab state and not persistence.",
    "Manual snapshots should reference annotation versions, not embed comment history by default.",
  ];

  if (!isRecord(log)) {
    return {
      ok: false,
      errors: ["Annotation event log must be an object."],
      warnings,
    };
  }

  if (log.schemaVersion !== STUDIO_COLLABORATION_ANNOTATION_EVENT_LOG_VERSION) {
    errors.push(
      `Annotation event log schemaVersion must be ${STUDIO_COLLABORATION_ANNOTATION_EVENT_LOG_VERSION}.`,
    );
  }

  if (!Array.isArray(log.events)) {
    errors.push("Annotation event log events must be an array.");
  } else {
    const seenEventIds = new Set<string>();

    for (const [index, event] of log.events.entries()) {
      const validation = validateAnnotationEvent(event);

      if (!validation.ok) {
        errors.push(
          `Annotation event ${index + 1} is invalid: ${validation.errors.join(" ")}`,
        );
      }

      if (isRecord(event) && typeof event.eventId === "string") {
        if (seenEventIds.has(event.eventId)) {
          errors.push(`Annotation event id is duplicated: ${event.eventId}.`);
        }

        seenEventIds.add(event.eventId);
      }
    }
  }

  const safety = isRecord(log.safety) ? log.safety : null;

  if (!safety) {
    errors.push("Annotation event log safety flags are required.");
  } else {
    if (safety.syntheticDataOnly !== true) {
      errors.push("Annotation event log safety.syntheticDataOnly must be true.");
    }

    for (const key of [
      "sourceTextMutation",
      "serverWrites",
      "localStorage",
      "dbSchema",
      "productionManuscriptEditing",
      "productionSnapshot",
      "checkpointMetadataPrimaryStore",
    ] as const) {
      if (safety[key] !== false) {
        errors.push(`Annotation event log safety.${key} must be false.`);
      }
    }
  }

  const foundMarkers = containsForbiddenMarker(log);

  if (foundMarkers.length) {
    errors.push(
      `Annotation event log contains forbidden real-content or secret markers: ${foundMarkers.join(", ")}.`,
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

export function replayAnnotationEventLog(
  log: StudioCollaborationAnnotationEventLog,
  options: { throughEventIndex?: number } = {},
): StudioCollaborationAnnotationReplayResult {
  const logValidation = validateAnnotationEventLog(log);
  const errors = [...logValidation.errors];
  const warnings = [...logValidation.warnings];
  const events =
    typeof options.throughEventIndex === "number"
      ? log.events.slice(0, Math.max(0, options.throughEventIndex))
      : log.events;
  const state: StudioCollaborationReviewNoteState = {
    ...createSyntheticReviewNoteState(),
    notes: replayEvents(events, errors),
  };
  const stateValidation = validateSyntheticReviewNoteState(state);

  if (!stateValidation.ok) {
    errors.push(
      `Replayed annotation state is invalid: ${stateValidation.errors.join(" ")}`,
    );
  }

  return {
    ok: errors.length === 0,
    state,
    summary: summarizeSyntheticReviewNotes(state),
    eventLogSummary: summarizeAnnotationEventLog({
      ...log,
      events,
    }),
    appliedEventCount: events.length,
    errors,
    warnings,
  };
}

export function createAnnotationEventLogReference(
  log: StudioCollaborationAnnotationEventLog,
): StudioCollaborationAnnotationEventLogReference {
  const replay = replayAnnotationEventLog(log);

  return {
    referenceVersion: "studio-annotation-event-log-reference-v1",
    eventLogVersion: log.schemaVersion,
    eventCount: log.events.length,
    latestEventId: log.events.at(-1)?.eventId ?? null,
    annotationStateVersion: [
      "annotation-state",
      replay.summary.noteCount,
      replay.summary.openCount,
      replay.summary.addressedCount,
      replay.summary.archivedCount,
      log.events.length,
    ].join("-"),
    checkpointMetadataPrimaryStore: false,
    manualSnapshotEmbedsEvents: false,
  };
}
