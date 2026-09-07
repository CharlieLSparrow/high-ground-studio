"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { editWorkGoal, editWorkTask, updateWorkGoalStatus, updateWorkTaskStatus } from "../../work/actions";
import type { SessionQuickEntry } from "./session-review-client";

function localDateTime(iso?: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function SessionWorkControls({ entry, onUpdate }: {
  entry: SessionQuickEntry;
  onUpdate: (update: Partial<SessionQuickEntry>) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const canEdit = entry.canEdit ?? entry.ownedByCurrentActor !== false;
  if (entry.kind === "NOTE" || !canEdit) return null;
  const task = entry.kind === "TASK";
  const open = task ? entry.status === "OPEN" : ["ACTIVE", "PAUSED"].includes(entry.status);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const initialDate = localDateTime(entry.dueAt);

  async function toggleStatus() {
    setBusy(true); setError(null); setNotice(null);
    try {
      const result = task
        ? await updateWorkTaskStatus({ taskId: entry.id, nextStatus: open ? "DONE" : "OPEN", expectedUpdatedAt: entry.updatedAt })
        : await updateWorkGoalStatus({ goalId: entry.id, nextStatus: open ? "ACHIEVED" : "ACTIVE", expectedUpdatedAt: entry.updatedAt });
      if (!result.ok) throw new Error(result.error);
      onUpdate({ status: result.status, updatedAt: result.updatedAt });
      setNotice(open ? (task ? "Task completed." : "Goal achieved.") : "Reopened.");
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Your change could not be saved. Try again.");
    } finally { setBusy(false); }
  }

  async function save(form: FormData) {
    setBusy(true); setError(null); setNotice(null);
    const title = String(form.get("title") || "");
    const body = String(form.get("body") || "");
    const target = String(form.get("targetAt") || "");
    try {
      if (task) {
        const result = await editWorkTask({ taskId: entry.id, title, detail: body,
          dueLocal: target || null, timezone, expectedUpdatedAt: entry.updatedAt });
        if (!result.ok) throw new Error(result.error);
        onUpdate({ title: result.title, body: result.detail, dueAt: result.dueAt, updatedAt: result.updatedAt });
      } else {
        const result = await editWorkGoal({ goalId: entry.id, title, description: body,
          targetDecision: target === initialDate.slice(0, 10) ? "KEEP" : target ? "SET" : "CLEAR",
          targetLocalDate: target || null, timezone, expectedUpdatedAt: entry.updatedAt });
        if (!result.ok) throw new Error(result.error);
        onUpdate({ title: result.title, body: result.description, dueAt: result.targetAt, updatedAt: result.updatedAt });
      }
      setNotice("Saved.");
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Your changes could not be saved. Try again.");
    } finally { setBusy(false); }
  }

  const inputClass = "mt-1 block w-full rounded-lg border border-[#cdbda5] bg-[#fffaf0] px-3 py-2 text-sm font-medium text-[#3d3122]";
  return <div className="mt-3 space-y-3">
    <button type="button" onClick={() => void toggleStatus()} disabled={busy}
      className="min-h-11 rounded-full bg-[#435847] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
      {busy ? "Saving…" : open ? (task ? "Mark done" : "Mark achieved") : "Reopen"}
    </button>
    {open && <details className="rounded-xl border border-[#d8cbb7] p-3">
      <summary className="cursor-pointer text-sm font-semibold text-[#3d3122]">Edit {task ? "task" : "goal"}</summary>
      <form onSubmit={(event) => { event.preventDefault(); void save(new FormData(event.currentTarget)); }} className="mt-3 grid gap-3">
        <label className="text-sm font-semibold">Title<input name="title" required maxLength={500} defaultValue={entry.title || ""} className={inputClass} /></label>
        <label className="text-sm font-semibold">Details<textarea name="body" rows={3} maxLength={5000} defaultValue={entry.body || ""} className={inputClass} /></label>
        <label className="text-sm font-semibold">{task ? "Due date" : "Target date"} (optional)
          <input name="targetAt" type={task ? "datetime-local" : "date"} defaultValue={task ? initialDate : initialDate.slice(0, 10)} className={inputClass} />
        </label>
        <button disabled={busy} type="submit" className="min-h-11 justify-self-start rounded-full bg-[#435847] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Save changes</button>
      </form>
    </details>}
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="text-sm text-[#435847]">{notice}</p>}
  </div>;
}
