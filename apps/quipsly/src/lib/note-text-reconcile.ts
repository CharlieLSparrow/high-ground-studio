import { DiffMatchPatch, DiffOperation } from "diff-match-patch-typescript";

type Edit = { start: number; end: number; text: string };

function edits(base: string, changed: string): Edit[] {
  const diff = new DiffMatchPatch();
  diff.diffTimeout = 0.1;
  const result: Edit[] = [];
  let position = 0;
  let pending: Edit | null = null;
  for (const [operation, text] of diff.diff_main(base, changed)) {
    if (operation === DiffOperation.DIFF_EQUAL) {
      if (pending) result.push(pending);
      pending = null;
      position += text.length;
    } else {
      pending ??= { start: position, end: position, text: "" };
      if (operation === DiffOperation.DIFF_DELETE) {
        position += text.length;
        pending.end = position;
      } else pending.text += text;
    }
  }
  if (pending) result.push(pending);
  return result;
}

/** Reconcile exact, disjoint edits against a common saved revision. This uses
 * diff coordinates, not fuzzy patch application: a conflicting replacement is
 * returned to the editor with both versions intact. No text is sent to AI. */
export function reconcileNoteText(base: string, local: string, remote: string): string | null {
  if (local === remote || remote === base) return local;
  if (local === base) return remote;
  if (Math.max(base.length, local.length, remote.length) > 20_000) return null;
  const localEdits = edits(base, local);
  const combined = [...localEdits];
  for (const right of edits(base, remote)) {
    let duplicate = false;
    for (const left of localEdits) {
      if (left.start === right.start && left.end === right.end && left.text === right.text) {
        duplicate = true;
        continue;
      }
      const insertion = left.start === left.end || right.start === right.end;
      if (insertion ? left.start <= right.end && right.start <= left.end
        : left.start < right.end && right.start < left.end) return null;
    }
    if (!duplicate) combined.push(right);
  }
  let result = base;
  for (const edit of combined.sort((a, b) => b.start - a.start)) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }
  return result.length <= 20_000 ? result : null;
}
