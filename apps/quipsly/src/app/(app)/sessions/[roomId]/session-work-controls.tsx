"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Circle, LoaderCircle, Target } from "lucide-react";
import { editWorkGoal, editWorkTask, updateWorkGoalStatus, updateWorkTaskStatus } from "../../work/actions";
import type { SessionQuickEntry } from "./session-review-client";
import type { SessionWorkAssignmentContext } from "@/lib/session-work-assignment";

function localDateTime(iso?: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function SessionWorkControls({ entry, onUpdate, assignmentContext = null, compactSummary, children, revealRequest }: {
  entry: SessionQuickEntry;
  onUpdate: (update: Partial<SessionQuickEntry>, interaction?: {restoreFocus: boolean}) => void;
  assignmentContext?: SessionWorkAssignmentContext | null;
  compactSummary?: ReactNode;
  children?: ReactNode;
  revealRequest?: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const editAttempt = useRef<{fingerprint: string; id: string} | null>(null);
  const editingVersion = useRef<string | null>(null);
  const inFlight = useRef(false);
  const statusButton = useRef<HTMLButtonElement>(null);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { if (revealRequest !== undefined) setExpanded(true); }, [revealRequest]);
  const canEdit = entry.canEdit ?? entry.ownedByCurrentActor !== false;
  if (entry.kind === "NOTE" || (!canEdit && !compactSummary)) return null;
  const task = entry.kind === "TASK";
  const open = task ? entry.status === "OPEN" : ["ACTIVE", "PAUSED"].includes(entry.status);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const initialDate = localDateTime(entry.dueAt);
  const canAssign = Boolean(assignmentContext && entry.engagementId === assignmentContext.engagementId && entry.visibility === "ENGAGEMENT_SHARED");

  async function toggleStatus() {
    if (!canEdit || inFlight.current) return;
    const restoreFocus = document.activeElement === statusButton.current;
    inFlight.current = true;
    setBusy(true); setError(null); setNotice(null);
    try {
      const result = task
        ? await updateWorkTaskStatus({ taskId: entry.id, nextStatus: open ? "DONE" : "OPEN", expectedUpdatedAt: entry.updatedAt })
        : await updateWorkGoalStatus({ goalId: entry.id, nextStatus: open ? "ACHIEVED" : "ACTIVE", expectedUpdatedAt: entry.updatedAt });
      if (!result.ok) throw new Error(result.error);
      onUpdate({ status: result.status, updatedAt: result.updatedAt }, {restoreFocus});
      setNotice(open ? (task ? "Task completed." : "Goal achieved.") : "Reopened.");
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Your change could not be saved. Try again.");
    } finally { inFlight.current = false; setBusy(false); }
  }

  async function save(form: FormData) {
    if (!canEdit || inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError(null); setNotice(null);
    const title = String(form.get("title") || "");
    const body = String(form.get("body") || "");
    const target = String(form.get("targetAt") || "");
    const expectedUpdatedAt = editingVersion.current || entry.updatedAt;
    try {
      if (canAssign && assignmentContext) {
        const content = {kind: entry.kind, id: entry.id, title, body, status: entry.status,
          ownerUserId: String(form.get("ownerUserId") || entry.ownerUserId || assignmentContext.currentUserId),
          targetAt: target ? new Date(task ? target : `${target}T12:00:00`).toISOString() : null,
          expectedUpdatedAt};
        const fingerprint = JSON.stringify(content);
        if (editAttempt.current?.fingerprint !== fingerprint) editAttempt.current = {fingerprint, id: crypto.randomUUID()};
        const response = await fetch(`/api/coaching/engagements/${encodeURIComponent(assignmentContext.engagementId)}/work`, {
          method: "PATCH", headers: {"content-type": "application/json"},
          body: JSON.stringify({...content, clientRequestId: editAttempt.current.id}),
        });
        const result = await response.json() as {ok?: boolean; error?: string; entry?: {
          title: string; body: string | null; dueAt: string | null; status: string; updatedAt: string;
          owner: {id: string; label: string | null} | null;
        }};
        if (!response.ok || !result.ok || !result.entry) throw new Error(result.error || "Your changes could not be saved. Try again.");
        const saved = result.entry;
        onUpdate({title: saved.title, body: saved.body, dueAt: saved.dueAt, status: saved.status, updatedAt: saved.updatedAt,
          ownerUserId: saved.owner?.id, ownerLabel: saved.owner?.label || "Collaborator",
          ownedByCurrentActor: saved.owner?.id === assignmentContext.currentUserId});
        editAttempt.current = null;
      } else if (task) {
        const result = await editWorkTask({ taskId: entry.id, title, detail: body,
          dueLocal: target || null, timezone, expectedUpdatedAt });
        if (!result.ok) throw new Error(result.error);
        onUpdate({ title: result.title, body: result.detail, dueAt: result.dueAt, updatedAt: result.updatedAt });
      } else {
        const result = await editWorkGoal({ goalId: entry.id, title, description: body,
          targetDecision: target === initialDate.slice(0, 10) ? "KEEP" : target ? "SET" : "CLEAR",
          targetLocalDate: target || null, timezone, expectedUpdatedAt });
        if (!result.ok) throw new Error(result.error);
        onUpdate({ title: result.title, body: result.description, dueAt: result.targetAt, updatedAt: result.updatedAt });
      }
      editingVersion.current = null;
      setNotice("Saved.");
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Your changes could not be saved. Try again.");
    } finally { inFlight.current = false; setBusy(false); }
  }

  const inputClass = "mt-1 block min-h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-medium text-foreground";
  const form = open && canEdit ? <form onFocusCapture={() => { editingVersion.current ??= entry.updatedAt; }}
        onSubmit={(event) => { event.preventDefault(); void save(new FormData(event.currentTarget)); }} className="mt-3 grid gap-3">
        <fieldset disabled={busy} className="contents">
        <label className="text-sm font-semibold">Title<input name="title" required maxLength={500} defaultValue={entry.title || ""} className={inputClass} /></label>
        <label className="text-sm font-semibold">Details<textarea name="body" rows={3} maxLength={5000} defaultValue={entry.body || ""} className={inputClass} /></label>
        {canAssign && assignmentContext && <label className="text-sm font-semibold">Assigned to
          <select name="ownerUserId" defaultValue={entry.ownerUserId || assignmentContext.currentUserId} className={inputClass}>
            {assignmentContext.members.map(member => <option key={member.id} value={member.id}>{member.id === assignmentContext.currentUserId ? "Me" : `${member.label} · ${member.role.toLowerCase()}`}</option>)}
          </select>
        </label>}
        <label className="text-sm font-semibold">{task ? "Due date" : "Target date"} (optional)
          <input name="targetAt" type={task ? "datetime-local" : "date"} defaultValue={task ? initialDate : initialDate.slice(0, 10)} className={inputClass} />
        </label>
        <button disabled={busy} type="submit" className="min-h-11 justify-self-start rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Save changes</button>
        </fieldset>
      </form> : null;
  const action = open ? (task ? "Mark done" : "Mark achieved") : "Reopen";
  if (compactSummary) return <div>
    <div className="flex items-start gap-1">
      {canEdit ? <button ref={statusButton} type="button" role="checkbox" aria-checked={!open} aria-label={`${action}: ${entry.title || (task ? "Untitled task" : "Untitled goal")}`}
        title={action} disabled={busy} onClick={() => void toggleStatus()}
        className="grid size-11 shrink-0 place-items-center rounded-lg text-primary hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50">
        {busy ? <LoaderCircle size={21} className="animate-spin" /> : !open ? <Check size={21} /> : task ? <Circle size={21} /> : <Target size={21} />}
      </button> : <span className="grid size-11 shrink-0 place-items-center text-muted-foreground" aria-label={!open ? "Completed" : task ? "Task" : "Goal"}>{!open ? <Check size={20} /> : task ? <Circle size={20} /> : <Target size={20} />}</span>}
      <details open={expanded} onToggle={event => setExpanded(event.currentTarget.open)} className="group min-w-0 flex-1">
        <summary aria-label={`Open ${task ? "task" : "goal"}: ${entry.title || "Untitled"}`} className="flex min-h-11 cursor-pointer list-none items-start gap-2 rounded-lg p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
          <div className="min-w-0 flex-1">{compactSummary}</div><ChevronDown size={16} className="mt-1 shrink-0 text-muted-foreground group-open:rotate-180" />
        </summary>
        <div className="p-2 pt-0">{children}{form}</div>
      </details>
    </div>
    {error && <p role="alert" className="px-2 pb-2 text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="px-2 pb-2 text-xs text-muted-foreground">{notice}</p>}
  </div>;
  return <div className="mt-3 space-y-3">
    <button type="button" onClick={() => void toggleStatus()} disabled={busy}
      className="min-h-11 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
      {busy ? "Saving…" : action}
    </button>
    {open && <details className="rounded-xl border border-border p-3">
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-foreground">Edit {task ? "task" : "goal"}</summary>
      {form}
    </details>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
  </div>;
}
