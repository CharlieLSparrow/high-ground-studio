import type { RecordingEditVersion, SavedRecordingEdit } from "./recording-edit-draft";

export type EditSyncStatus = "saved" | "unsaved" | "saving" | "error" | "conflict";
export function recordingEditKey(state: SavedRecordingEdit) {
  return JSON.stringify([state.selected.slice().sort(), state.startSeconds, state.endSeconds, state.title,
    state.outputMediaKind, state.primaryVideoSourceId, state.excludedTranscriptKeys.slice().sort(), state.editing,
    state.baseOutputId, state.baseOutputRevision]);
}

/** One serialized autosave stream per actor and take. Retrying an uncertain
 * response reuses its request ID before sending newer edits. */
export class RecordingEditSync {
  state: SavedRecordingEdit | null;
  revision: number;
  status: EditSyncStatus = "saved";
  error: string | null = null;
  conflictRevision: number | null = null;
  onChange?: () => void;
  private pending: SavedRecordingEdit | null = null;
  private attempt: {state: SavedRecordingEdit; expectedRevision: number; clientRequestId: string} | null = null;
  private running: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(readonly url: string, readonly actorUserId: string, initial: RecordingEditVersion | null) {
    this.revision = initial?.revision ?? 0;
    this.state = initial?.state ?? null;
  }
  set(state: SavedRecordingEdit) {
    if (this.state && recordingEditKey(state) === recordingEditKey(this.state)) return;
    this.state = state;
    this.pending = state;
    if (this.status !== "conflict") this.status = "unsaved";
    this.onChange?.();
    if (this.timer) clearTimeout(this.timer);
    if (this.status !== "conflict") this.timer = setTimeout(() => { void this.flush(); }, 500);
  }
  flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.running) return this.running;
    if (this.status === "conflict") return Promise.resolve();
    this.running = this.drain().finally(() => { this.running = null; });
    return this.running;
  }
  keepThisEdit() {
    if (this.conflictRevision === null || !this.state) return;
    this.revision = this.conflictRevision;
    this.conflictRevision = null;
    this.attempt = null;
    this.pending = this.state;
    this.status = "unsaved";
    void this.flush();
  }
  private async drain() {
    while (this.pending || this.attempt) {
      if (!this.attempt) {
        this.attempt = {state: this.pending!, expectedRevision: this.revision, clientRequestId: crypto.randomUUID()};
        this.pending = null;
      }
      const attempt = this.attempt;
      this.status = "saving";
      this.error = null;
      this.onChange?.();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20_000);
      try {
        const body = JSON.stringify({...attempt, actorUserId: this.actorUserId});
        const response = await fetch(this.url, {method: "PUT", credentials: "same-origin", headers: {"Content-Type": "application/json"},
          body, signal: controller.signal, keepalive: body.length < 60_000});
        const result = await response.json();
        if (!response.ok || !result.ok) {
          this.conflictRevision = result.code === "RECORDING_EDIT_CONFLICT" && Number.isSafeInteger(result.currentRevision) ? result.currentRevision : null;
          this.status = response.status === 409 ? "conflict" : "error";
          this.error = result.error || "Your edit could not sync. Your changes are still here.";
          if (response.status >= 400 && response.status < 500 && response.status !== 409) {
            // A definite rejection did not save anything. A corrected draft
            // must not be trapped behind the rejected request on the next try.
            this.pending ??= attempt.state;
            this.attempt = null;
          }
          this.onChange?.();
          return;
        }
        if (result.actorUserId !== this.actorUserId || !Number.isSafeInteger(result.edit?.revision)) throw new Error("The saved edit could not be confirmed. Please retry.");
        this.revision = result.edit.revision;
        this.attempt = null;
        if (this.pending && recordingEditKey(this.pending) === recordingEditKey(attempt.state)) this.pending = null;
      } catch (error) {
        this.status = "error";
        this.error = controller.signal.aborted ? "Saving is taking too long. Your changes are still here; retry when connected."
          : error instanceof Error ? error.message : "Your edit could not sync.";
        this.onChange?.();
        return;
      } finally { clearTimeout(timeout); }
    }
    this.status = "saved";
    this.error = null;
    this.onChange?.();
  }
}
