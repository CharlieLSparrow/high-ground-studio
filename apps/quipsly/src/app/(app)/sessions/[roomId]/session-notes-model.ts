export const SESSION_NOTE_KINDS = [
  "SESSION_NOTE",
  "FOLLOW_UP",
  "DECISION",
  "PRODUCTION",
] as const;

export const EDITABLE_SESSION_NOTE_KINDS = [
  "SESSION_NOTE",
  "DECISION",
  "PRODUCTION",
] as const;

export const SESSION_NOTE_VISIBILITIES = [
  "AUTHOR_PRIVATE",
  "SESSION_SHARED",
  "CLIENT_SAFE",
  "PROJECT_TEAM",
] as const;

export const SESSION_NOTE_VIEWS = [
  { id: "all", label: "All notes" },
  { id: "private", label: "Private" },
  { id: "shared", label: "Shared" },
  { id: "client-safe", label: "Client-safe" },
  { id: "production", label: "Production" },
  { id: "decisions", label: "Decisions" },
] as const;

export type SessionNoteKind = typeof SESSION_NOTE_KINDS[number];
export type EditableSessionNoteKind = typeof EDITABLE_SESSION_NOTE_KINDS[number];
export type SessionNoteVisibility = typeof SESSION_NOTE_VISIBILITIES[number];
export type SessionNoteView = typeof SESSION_NOTE_VIEWS[number]["id"];

export type SessionWorkspaceNote = {
  id: string;
  title: string | null;
  body: string;
  kind: SessionNoteKind;
  visibility: SessionNoteVisibility;
  author: {
    id: string | null;
    label: string;
    isCurrentActor: boolean;
  };
  originLabel: string;
  canEdit: boolean;
  revisionCount: number;
  createdAt: string;
  updatedAt: string;
  tags: Array<{ id: string; label: string; slug: string }>;
};

export function parseSessionNoteView(value: unknown): SessionNoteView {
  const candidate = Array.isArray(value) ? value[0] : value;
  return SESSION_NOTE_VIEWS.some((view) => view.id === candidate)
    ? candidate as SessionNoteView
    : "all";
}

export function sessionNotesHref(roomId: string, view: SessionNoteView = "all") {
  const params = new URLSearchParams({ mode: "notes" });
  if (view !== "all") params.set("view", view);
  return `/sessions/${encodeURIComponent(roomId)}?${params.toString()}`;
}

export function sessionNoteVisibilityLabel(visibility: SessionNoteVisibility) {
  if (visibility === "AUTHOR_PRIVATE") return "Only me";
  if (visibility === "SESSION_SHARED") return "Session";
  if (visibility === "CLIENT_SAFE") return "Client-safe";
  return "Project team";
}

export function sessionNoteKindLabel(kind: SessionNoteKind) {
  if (kind === "FOLLOW_UP") return "Continuity brief";
  if (kind === "DECISION") return "Decision";
  if (kind === "PRODUCTION") return "Production note";
  return "Session note";
}

export function noteAppearsInView(note: SessionWorkspaceNote, view: SessionNoteView) {
  if (view === "all") return true;
  if (view === "private") return note.visibility === "AUTHOR_PRIVATE";
  if (view === "shared") return note.visibility === "SESSION_SHARED";
  if (view === "client-safe") return note.visibility === "CLIENT_SAFE";
  if (view === "production") return note.kind === "PRODUCTION" || note.visibility === "PROJECT_TEAM";
  return note.kind === "DECISION";
}

export function sessionNoteViewCounts(notes: SessionWorkspaceNote[]) {
  return Object.fromEntries(SESSION_NOTE_VIEWS.map((view) => [
    view.id,
    notes.filter((note) => noteAppearsInView(note, view.id)).length,
  ])) as Record<SessionNoteView, number>;
}
