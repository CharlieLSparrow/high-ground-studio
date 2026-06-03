import {
  STUDIO_COLLABORATION_ANNOTATION_EVENT_LOG_VERSION,
  replayAnnotationEventLog,
  summarizeAnnotationEventLog,
  validateAnnotationEventLog,
  type StudioCollaborationAnnotationEventLog,
} from "./studio-collaboration-annotation-event-log";
import {
  STUDIO_COLLABORATION_REVIEW_NOTES_VERSION,
  summarizeSyntheticReviewNotes,
  validateSyntheticReviewNoteState,
  type StudioCollaborationReviewNote,
  type StudioCollaborationReviewNoteStatus,
  type StudioCollaborationReviewNoteSummary,
} from "./studio-collaboration-review-note-model";

export const STUDIO_COLLABORATION_ANNOTATION_STATE_VERSION =
  "studio-collaboration-annotation-state-v1";

export type StudioCollaborationMaterializedAnnotationState = {
  stateVersion: typeof STUDIO_COLLABORATION_ANNOTATION_STATE_VERSION;
  annotationStateVersion: string;
  materializedAt: string;
  source: {
    sourceKind: "annotation-event-log";
    eventLogVersion: typeof STUDIO_COLLABORATION_ANNOTATION_EVENT_LOG_VERSION;
    eventCount: number;
    latestEventId: string | null;
  };
  notes: StudioCollaborationReviewNote[];
  indexes: {
    noteIdsBySpan: Record<string, string[]>;
    noteIdsByBlock: Record<string, string[]>;
    noteIdsByStatus: Record<StudioCollaborationReviewNoteStatus, string[]>;
  };
  summary: StudioCollaborationReviewNoteSummary;
  safety: {
    syntheticDataOnly: true;
    materializedViewOnly: true;
    sourceTextMutation: false;
    persistenceAdded: false;
    serverWrites: false;
    localStorage: false;
    dbSchema: false;
    productionManuscriptEditing: false;
    productionSnapshot: false;
    manualSnapshotEmbedsAnnotations: false;
  };
  warnings: string[];
};

export type StudioCollaborationMaterializedAnnotationStateReference = {
  referenceVersion: "studio-annotation-state-reference-v1";
  annotationStateVersion: string;
  eventLogVersion: typeof STUDIO_COLLABORATION_ANNOTATION_EVENT_LOG_VERSION;
  eventCount: number;
  latestEventId: string | null;
  noteCount: number;
  openCount: number;
  addressedCount: number;
  archivedCount: number;
  manualSnapshotEmbedsAnnotations: false;
};

export type StudioCollaborationMaterializedAnnotationStateValidation = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

const knownStatuses: StudioCollaborationReviewNoteStatus[] = [
  "open",
  "addressed",
  "archived",
];
const forbiddenMaterializedAnnotationMarkers = [
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

function normalizeVersionPart(value: string | null) {
  return (value ?? "none")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function cloneNote(note: StudioCollaborationReviewNote) {
  return {
    ...note,
  };
}

function createIndexes(notes: StudioCollaborationReviewNote[]) {
  const noteIdsBySpan: Record<string, string[]> = {};
  const noteIdsByBlock: Record<string, string[]> = {};
  const noteIdsByStatus: Record<StudioCollaborationReviewNoteStatus, string[]> = {
    open: [],
    addressed: [],
    archived: [],
  };

  for (const note of notes) {
    noteIdsBySpan[note.spanId] = [...(noteIdsBySpan[note.spanId] ?? []), note.noteId];
    noteIdsByBlock[note.blockId] = [
      ...(noteIdsByBlock[note.blockId] ?? []),
      note.noteId,
    ];
    noteIdsByStatus[note.status] = [
      ...(noteIdsByStatus[note.status] ?? []),
      note.noteId,
    ];
  }

  return {
    noteIdsBySpan,
    noteIdsByBlock,
    noteIdsByStatus,
  };
}

function containsForbiddenMarker(input: unknown) {
  const serialized = JSON.stringify(input);

  return forbiddenMaterializedAnnotationMarkers.filter((marker) =>
    serialized.includes(marker),
  );
}

export function createMaterializedAnnotationStateFromEventLog(
  log: StudioCollaborationAnnotationEventLog,
): StudioCollaborationMaterializedAnnotationState {
  const replay = replayAnnotationEventLog(log);
  const eventLogSummary = summarizeAnnotationEventLog(log);
  const notes = replay.state.notes.map(cloneNote);
  const summary = summarizeSyntheticReviewNotes({
    schemaVersion: STUDIO_COLLABORATION_REVIEW_NOTES_VERSION,
    notes,
    safety: replay.state.safety,
  });
  const annotationStateVersion = [
    "studio-annotation-state",
    eventLogSummary.eventCount,
    summary.noteCount,
    summary.openCount,
    summary.addressedCount,
    summary.archivedCount,
    normalizeVersionPart(eventLogSummary.latestEventId),
  ].join("-");

  return {
    stateVersion: STUDIO_COLLABORATION_ANNOTATION_STATE_VERSION,
    annotationStateVersion,
    materializedAt: nowIso(),
    source: {
      sourceKind: "annotation-event-log",
      eventLogVersion: log.schemaVersion,
      eventCount: eventLogSummary.eventCount,
      latestEventId: eventLogSummary.latestEventId,
    },
    notes,
    indexes: createIndexes(notes),
    summary,
    safety: {
      syntheticDataOnly: true,
      materializedViewOnly: true,
      sourceTextMutation: false,
      persistenceAdded: false,
      serverWrites: false,
      localStorage: false,
      dbSchema: false,
      productionManuscriptEditing: false,
      productionSnapshot: false,
      manualSnapshotEmbedsAnnotations: false,
    },
    warnings: [
      "Synthetic materialized annotation state only.",
      "This is a replayed view, not persistence.",
      "Manual snapshots should reference this state/version later instead of embedding comments by default.",
    ],
  };
}

export function summarizeMaterializedAnnotationState(
  state: StudioCollaborationMaterializedAnnotationState,
): StudioCollaborationReviewNoteSummary {
  return {
    ...state.summary,
    notesBySpan: state.summary.notesBySpan.map((entry) => ({ ...entry })),
    notesByBlock: state.summary.notesByBlock.map((entry) => ({ ...entry })),
  };
}

export function listMaterializedAnnotationsForSpan(
  state: StudioCollaborationMaterializedAnnotationState,
  spanId: string,
) {
  const ids = new Set(state.indexes.noteIdsBySpan[spanId] ?? []);

  return state.notes.filter((note) => ids.has(note.noteId)).map(cloneNote);
}

export function listMaterializedAnnotationsForBlock(
  state: StudioCollaborationMaterializedAnnotationState,
  blockId: string,
) {
  const ids = new Set(state.indexes.noteIdsByBlock[blockId] ?? []);

  return state.notes.filter((note) => ids.has(note.noteId)).map(cloneNote);
}

export function listMaterializedAnnotationsByStatus(
  state: StudioCollaborationMaterializedAnnotationState,
  status: StudioCollaborationReviewNoteStatus,
) {
  const ids = new Set(state.indexes.noteIdsByStatus[status] ?? []);

  return state.notes.filter((note) => ids.has(note.noteId)).map(cloneNote);
}

export function createMaterializedAnnotationStateReference(
  state: StudioCollaborationMaterializedAnnotationState,
): StudioCollaborationMaterializedAnnotationStateReference {
  return {
    referenceVersion: "studio-annotation-state-reference-v1",
    annotationStateVersion: state.annotationStateVersion,
    eventLogVersion: state.source.eventLogVersion,
    eventCount: state.source.eventCount,
    latestEventId: state.source.latestEventId,
    noteCount: state.summary.noteCount,
    openCount: state.summary.openCount,
    addressedCount: state.summary.addressedCount,
    archivedCount: state.summary.archivedCount,
    manualSnapshotEmbedsAnnotations: false,
  };
}

export function compareMaterializedAnnotationStateToEventLog(
  state: StudioCollaborationMaterializedAnnotationState,
  log: StudioCollaborationAnnotationEventLog,
) {
  const replayed = createMaterializedAnnotationStateFromEventLog(log);
  const details: string[] = [];

  if (state.source.eventCount !== replayed.source.eventCount) {
    details.push("Materialized state event count does not match event log.");
  }

  if (state.source.latestEventId !== replayed.source.latestEventId) {
    details.push("Materialized state latest event id does not match event log.");
  }

  if (JSON.stringify(state.notes) !== JSON.stringify(replayed.notes)) {
    details.push("Materialized state notes do not match event-log replay.");
  }

  if (JSON.stringify(state.indexes) !== JSON.stringify(replayed.indexes)) {
    details.push("Materialized state indexes do not match event-log replay.");
  }

  return {
    matches: details.length === 0,
    details,
  };
}

export function validateMaterializedAnnotationState(
  state: unknown,
): StudioCollaborationMaterializedAnnotationStateValidation {
  const errors: string[] = [];
  const warnings = [
    "Synthetic materialized annotation state only.",
    "No persistence or server writes are implied by this state.",
  ];

  if (!isRecord(state)) {
    return {
      ok: false,
      errors: ["Materialized annotation state must be an object."],
      warnings,
    };
  }

  if (state.stateVersion !== STUDIO_COLLABORATION_ANNOTATION_STATE_VERSION) {
    errors.push(
      `Materialized annotation stateVersion must be ${STUDIO_COLLABORATION_ANNOTATION_STATE_VERSION}.`,
    );
  }

  if (typeof state.annotationStateVersion !== "string" || !state.annotationStateVersion.trim()) {
    errors.push("Materialized annotation state annotationStateVersion is required.");
  }

  if (!isRecord(state.source)) {
    errors.push("Materialized annotation state source is required.");
  } else {
    if (state.source.sourceKind !== "annotation-event-log") {
      errors.push("Materialized annotation state sourceKind must be annotation-event-log.");
    }

    const sourceEventLog = state.source.eventLogVersion;

    if (sourceEventLog !== STUDIO_COLLABORATION_ANNOTATION_EVENT_LOG_VERSION) {
      errors.push(
        `Materialized annotation state source eventLogVersion must be ${STUDIO_COLLABORATION_ANNOTATION_EVENT_LOG_VERSION}.`,
      );
    }

    if (typeof state.source.eventCount !== "number" || state.source.eventCount < 0) {
      errors.push("Materialized annotation state source eventCount must be non-negative.");
    }
  }

  const noteState = {
    schemaVersion: STUDIO_COLLABORATION_REVIEW_NOTES_VERSION,
    notes: Array.isArray(state.notes) ? state.notes : [],
    safety: {
      syntheticDataOnly: true,
      sourceTextMutation: false,
      serverWrites: false,
      localStorage: false,
      productionManuscriptEditing: false,
      durableAnnotation: false,
    },
  };
  const noteValidation = validateSyntheticReviewNoteState(noteState);

  if (!Array.isArray(state.notes)) {
    errors.push("Materialized annotation state notes must be an array.");
  }

  if (!noteValidation.ok) {
    errors.push(
      `Materialized annotation state notes are invalid: ${noteValidation.errors.join(" ")}`,
    );
  }

  if (!isRecord(state.indexes)) {
    errors.push("Materialized annotation state indexes are required.");
  } else {
    if (!isRecord(state.indexes.noteIdsBySpan)) {
      errors.push("Materialized annotation state noteIdsBySpan index is required.");
    }

    if (!isRecord(state.indexes.noteIdsByBlock)) {
      errors.push("Materialized annotation state noteIdsByBlock index is required.");
    }

    if (!isRecord(state.indexes.noteIdsByStatus)) {
      errors.push("Materialized annotation state noteIdsByStatus index is required.");
    } else {
      for (const status of knownStatuses) {
        if (!Array.isArray(state.indexes.noteIdsByStatus[status])) {
          errors.push(
            `Materialized annotation state status index ${status} must be an array.`,
          );
        }
      }
    }
  }

  if (!isRecord(state.summary)) {
    errors.push("Materialized annotation state summary is required.");
  }

  if (!isRecord(state.safety)) {
    errors.push("Materialized annotation state safety flags are required.");
  } else {
    if (state.safety.syntheticDataOnly !== true) {
      errors.push("Materialized annotation state safety.syntheticDataOnly must be true.");
    }

    if (state.safety.materializedViewOnly !== true) {
      errors.push("Materialized annotation state safety.materializedViewOnly must be true.");
    }

    for (const key of [
      "sourceTextMutation",
      "persistenceAdded",
      "serverWrites",
      "localStorage",
      "dbSchema",
      "productionManuscriptEditing",
      "productionSnapshot",
      "manualSnapshotEmbedsAnnotations",
    ] as const) {
      if (state.safety[key] !== false) {
        errors.push(`Materialized annotation state safety.${key} must be false.`);
      }
    }
  }

  const foundMarkers = containsForbiddenMarker(state);

  if (foundMarkers.length) {
    errors.push(
      `Materialized annotation state contains forbidden real-content or secret markers: ${foundMarkers.join(", ")}.`,
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

export function validateMaterializedAnnotationStateSourceLog(
  log: unknown,
): StudioCollaborationMaterializedAnnotationStateValidation {
  const logValidation = validateAnnotationEventLog(log);

  return {
    ok: logValidation.ok,
    errors: logValidation.errors,
    warnings: [
      ...logValidation.warnings,
      "Materialized annotation state should be rebuilt from valid event logs only.",
    ],
  };
}
