import type { StudioCollaborationSpanTag } from "./studio-collaboration-span-model";

export const STUDIO_COLLABORATION_REVIEW_NOTES_VERSION =
  "studio-collaboration-review-notes-v1";

export type StudioCollaborationReviewNoteAuthorId = "charlie" | "homer";

export type StudioCollaborationReviewNoteStatus =
  | "open"
  | "addressed"
  | "archived";

export type StudioCollaborationReviewNote = {
  noteId: string;
  spanId: string;
  blockId: string;
  authorId: StudioCollaborationReviewNoteAuthorId;
  body: string;
  status: StudioCollaborationReviewNoteStatus;
  createdAt: string;
  updatedAt: string;
  resolvedBy?: StudioCollaborationReviewNoteAuthorId;
  resolvedAt?: string;
};

export type StudioCollaborationReviewNoteState = {
  schemaVersion: typeof STUDIO_COLLABORATION_REVIEW_NOTES_VERSION;
  notes: StudioCollaborationReviewNote[];
  safety: {
    syntheticDataOnly: true;
    sourceTextMutation: false;
    serverWrites: false;
    localStorage: false;
    productionManuscriptEditing: false;
    durableAnnotation: false;
  };
};

export type StudioCollaborationReviewNoteSummary = {
  noteCount: number;
  openCount: number;
  addressedCount: number;
  archivedCount: number;
  notesBySpan: Array<{
    spanId: string;
    noteCount: number;
    openCount: number;
  }>;
  notesByBlock: Array<{
    blockId: string;
    noteCount: number;
    openCount: number;
  }>;
};

export type StudioCollaborationReviewNoteValidation = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

const knownAuthorIds: StudioCollaborationReviewNoteAuthorId[] = [
  "charlie",
  "homer",
];
const knownStatuses: StudioCollaborationReviewNoteStatus[] = [
  "open",
  "addressed",
  "archived",
];
const forbiddenReviewNoteMarkers = [
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

function createNoteId(input: {
  spanId: string;
  authorId: StudioCollaborationReviewNoteAuthorId;
  body: string;
}) {
  const bodyPart = normalizeSlug(input.body).slice(0, 32) || "note";

  return ["synthetic-review-note", input.spanId, input.authorId, bodyPart].join(
    "-",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cloneNote(
  note: StudioCollaborationReviewNote,
): StudioCollaborationReviewNote {
  return {
    ...note,
  };
}

function cloneState(
  state: StudioCollaborationReviewNoteState,
): StudioCollaborationReviewNoteState {
  return {
    schemaVersion: state.schemaVersion,
    notes: state.notes.map(cloneNote),
    safety: { ...state.safety },
  };
}

function countByStatus(
  notes: StudioCollaborationReviewNote[],
  status: StudioCollaborationReviewNoteStatus,
) {
  return notes.filter((note) => note.status === status).length;
}

function groupNotesBy(
  notes: StudioCollaborationReviewNote[],
  key: "spanId" | "blockId",
) {
  const groups = new Map<string, StudioCollaborationReviewNote[]>();

  for (const note of notes) {
    const group = groups.get(note[key]) ?? [];

    group.push(note);
    groups.set(note[key], group);
  }

  return [...groups.entries()]
    .map(([id, group]) => ({
      [key]: id,
      noteCount: group.length,
      openCount: countByStatus(group, "open"),
    }))
    .sort((first, second) =>
      String(first[key]).localeCompare(String(second[key])),
    );
}

export function createSyntheticReviewNoteState(): StudioCollaborationReviewNoteState {
  return {
    schemaVersion: STUDIO_COLLABORATION_REVIEW_NOTES_VERSION,
    notes: [],
    safety: {
      syntheticDataOnly: true,
      sourceTextMutation: false,
      serverWrites: false,
      localStorage: false,
      productionManuscriptEditing: false,
      durableAnnotation: false,
    },
  };
}

export function createSyntheticReviewNote(
  span: StudioCollaborationSpanTag,
  authorId: StudioCollaborationReviewNoteAuthorId,
  body: string,
): StudioCollaborationReviewNote | null {
  const normalizedBody = body.trim();

  if (!span.spanId.trim() || !span.blockId.trim() || !normalizedBody) {
    return null;
  }

  const timestamp = nowIso();

  return {
    noteId: createNoteId({
      spanId: span.spanId,
      authorId,
      body: normalizedBody,
    }),
    spanId: span.spanId,
    blockId: span.blockId,
    authorId,
    body: normalizedBody,
    status: "open",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function validateSyntheticReviewNote(
  note: unknown,
): StudioCollaborationReviewNoteValidation {
  const errors: string[] = [];
  const warnings = [
    "Synthetic review note only.",
    "Review notes are annotations, not source text.",
    "Review notes are local-only for this sprint.",
  ];

  if (!isRecord(note)) {
    return {
      ok: false,
      errors: ["Review note must be an object."],
      warnings,
    };
  }

  for (const key of ["noteId", "spanId", "blockId", "body", "createdAt", "updatedAt"] as const) {
    if (typeof note[key] !== "string" || !note[key].trim()) {
      errors.push(`Review note ${key} is required.`);
    }
  }

  if (!knownAuthorIds.includes(note.authorId as StudioCollaborationReviewNoteAuthorId)) {
    errors.push("Review note authorId must be charlie or homer.");
  }

  if (!knownStatuses.includes(note.status as StudioCollaborationReviewNoteStatus)) {
    errors.push("Review note status must be open addressed or archived.");
  }

  if (
    note.resolvedBy !== undefined &&
    !knownAuthorIds.includes(note.resolvedBy as StudioCollaborationReviewNoteAuthorId)
  ) {
    errors.push("Review note resolvedBy must be charlie or homer when present.");
  }

  if (
    note.resolvedAt !== undefined &&
    (typeof note.resolvedAt !== "string" || !note.resolvedAt.trim())
  ) {
    errors.push("Review note resolvedAt must be a non-empty string when present.");
  }

  const serialized = JSON.stringify(note);
  const foundMarkers = forbiddenReviewNoteMarkers.filter((marker) =>
    serialized.includes(marker),
  );

  if (foundMarkers.length) {
    errors.push(
      `Review note contains forbidden real-content or secret markers: ${foundMarkers.join(", ")}.`,
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

export function validateSyntheticReviewNoteState(
  input: unknown,
): StudioCollaborationReviewNoteValidation {
  const errors: string[] = [];
  const warnings = [
    "Synthetic review notes are local-only annotations.",
    "Future durable annotation rules still need checkpoint and rollback design.",
  ];

  if (!isRecord(input)) {
    return {
      ok: false,
      errors: ["Review note state must be an object."],
      warnings,
    };
  }

  if (input.schemaVersion !== STUDIO_COLLABORATION_REVIEW_NOTES_VERSION) {
    errors.push(
      `Review note state schemaVersion must be ${STUDIO_COLLABORATION_REVIEW_NOTES_VERSION}.`,
    );
  }

  if (!Array.isArray(input.notes)) {
    errors.push("Review note state notes must be an array.");
  } else {
    for (const [index, note] of input.notes.entries()) {
      const validation = validateSyntheticReviewNote(note);

      if (!validation.ok) {
        errors.push(
          `Review note ${index + 1} is invalid: ${validation.errors.join(" ")}`,
        );
      }
    }
  }

  const safety = isRecord(input.safety) ? input.safety : null;

  if (!safety) {
    errors.push("Review note state safety flags are required.");
  } else {
    if (safety.syntheticDataOnly !== true) {
      errors.push("Review note state safety.syntheticDataOnly must be true.");
    }

    for (const key of [
      "sourceTextMutation",
      "serverWrites",
      "localStorage",
      "productionManuscriptEditing",
      "durableAnnotation",
    ] as const) {
      if (safety[key] !== false) {
        errors.push(`Review note state safety.${key} must be false.`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

export function addSyntheticReviewNote(
  state: StudioCollaborationReviewNoteState,
  note: StudioCollaborationReviewNote,
): StudioCollaborationReviewNoteState {
  const validation = validateSyntheticReviewNote(note);

  if (!validation.ok || state.notes.some((existing) => existing.noteId === note.noteId)) {
    return cloneState(state);
  }

  return {
    ...cloneState(state),
    notes: [...state.notes.map(cloneNote), cloneNote(note)],
  };
}

export function updateSyntheticReviewNoteStatus(
  state: StudioCollaborationReviewNoteState,
  noteId: string,
  status: StudioCollaborationReviewNoteStatus,
  actorId: StudioCollaborationReviewNoteAuthorId,
): StudioCollaborationReviewNoteState {
  if (!knownStatuses.includes(status) || !knownAuthorIds.includes(actorId)) {
    return cloneState(state);
  }

  return {
    ...cloneState(state),
    notes: state.notes.map((note) => {
      if (note.noteId !== noteId) {
        return cloneNote(note);
      }

      const timestamp = nowIso();
      const nextNote: StudioCollaborationReviewNote = {
        ...note,
        status,
        updatedAt: timestamp,
      };

      if (status === "open") {
        delete nextNote.resolvedBy;
        delete nextNote.resolvedAt;
      } else {
        nextNote.resolvedBy = actorId;
        nextNote.resolvedAt = timestamp;
      }

      return nextNote;
    }),
  };
}

export function listSyntheticReviewNotes(
  state: StudioCollaborationReviewNoteState,
) {
  return state.notes
    .map(cloneNote)
    .sort(
      (first, second) =>
        first.blockId.localeCompare(second.blockId) ||
        first.spanId.localeCompare(second.spanId) ||
        first.createdAt.localeCompare(second.createdAt) ||
        first.noteId.localeCompare(second.noteId),
    );
}

export function listSyntheticReviewNotesForSpan(
  state: StudioCollaborationReviewNoteState,
  spanId: string,
) {
  return listSyntheticReviewNotes(state).filter((note) => note.spanId === spanId);
}

export function listSyntheticReviewNotesForBlock(
  state: StudioCollaborationReviewNoteState,
  blockId: string,
) {
  return listSyntheticReviewNotes(state).filter((note) => note.blockId === blockId);
}

export function summarizeSyntheticReviewNotes(
  state: StudioCollaborationReviewNoteState,
): StudioCollaborationReviewNoteSummary {
  const notes = listSyntheticReviewNotes(state);

  return {
    noteCount: notes.length,
    openCount: countByStatus(notes, "open"),
    addressedCount: countByStatus(notes, "addressed"),
    archivedCount: countByStatus(notes, "archived"),
    notesBySpan: groupNotesBy(notes, "spanId") as StudioCollaborationReviewNoteSummary["notesBySpan"],
    notesByBlock: groupNotesBy(notes, "blockId") as StudioCollaborationReviewNoteSummary["notesByBlock"],
  };
}
