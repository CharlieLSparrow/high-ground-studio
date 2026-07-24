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

export type SessionNoteKind = typeof SESSION_NOTE_KINDS[number];
export type EditableSessionNoteKind = typeof EDITABLE_SESSION_NOTE_KINDS[number];
export type SessionNoteVisibility = typeof SESSION_NOTE_VISIBILITIES[number];

export function isEditableSessionNoteKind(value: unknown): value is EditableSessionNoteKind {
  return EDITABLE_SESSION_NOTE_KINDS.includes(value as EditableSessionNoteKind);
}

export function isSessionNoteVisibility(value: unknown): value is SessionNoteVisibility {
  return SESSION_NOTE_VISIBILITIES.includes(value as SessionNoteVisibility);
}
