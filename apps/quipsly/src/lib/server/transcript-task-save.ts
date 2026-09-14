export type TranscriptTaskFields = { title: string; detail: string | null };
export type TranscriptTaskSave = { revision: number; original: TranscriptTaskFields };
export type TranscriptTaskSaveState = { revision: number; fields: TranscriptTaskFields };

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function readTranscriptTaskFields(value: unknown): TranscriptTaskFields | null {
  const input = object(value);
  if (typeof input.title !== "string" || (input.detail != null && typeof input.detail !== "string")) return null;
  const title = input.title.trim();
  const detail = typeof input.detail === "string" ? input.detail.trim() || null : null;
  if (!title || title.length > 500 || (detail?.length ?? 0) > 5_000) return null;
  return { title, detail };
}

export function readTranscriptTaskSave(value: unknown): TranscriptTaskSave | null {
  const input = object(value);
  const original = readTranscriptTaskFields(input.original);
  return Number.isSafeInteger(input.revision) && Number(input.revision) >= 0 && original
    ? { revision: Number(input.revision), original } : null;
}

export function readTranscriptTaskSaveState(value: unknown): TranscriptTaskSaveState | null {
  const input = object(value);
  const fields = readTranscriptTaskFields(input.fields);
  return Number.isSafeInteger(input.revision) && Number(input.revision) >= 0 && fields
    ? { revision: Number(input.revision), fields } : null;
}

export function sameTranscriptTaskFields(left: TranscriptTaskFields, right: TranscriptTaskFields) {
  return left.title === right.title && left.detail === right.detail;
}

/** Compare against this client's last applied command, not its first save.
 * This permits multiple lost replies while preserving unrelated canonical edits.
 */
export function planTranscriptTaskSave(input: {
  previous: TranscriptTaskSaveState; revision: number;
  desired: TranscriptTaskFields; current: TranscriptTaskFields;
}): { kind: "replay" } | { kind: "conflict" } | { kind: "amend"; fields: TranscriptTaskFields } {
  const { previous, revision, desired, current } = input;
  if (revision < previous.revision) return { kind: "conflict" };
  if (revision === previous.revision) return { kind: sameTranscriptTaskFields(previous.fields, desired) ? "replay" : "conflict" };
  const fields = { ...current };
  for (const key of ["title", "detail"] as const) {
    if (desired[key] === previous.fields[key]) continue;
    if (current[key] !== previous.fields[key] && current[key] !== desired[key]) return { kind: "conflict" };
    if (key === "title") fields.title = desired.title;
    else fields.detail = desired.detail;
  }
  return { kind: "amend", fields };
}
