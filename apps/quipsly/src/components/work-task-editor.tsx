"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { editWorkTask } from "@/app/(app)/work/actions";
import { localDateTimeInput } from "@/lib/local-date-time-input";

export type EditableWorkTask = {
  id: string; title: string; detail: string | null; dueAt: string | null;
  updatedAt: string; status: string; canEdit?: boolean; recurrence?: unknown;
};

/** Shared by the global queue and contextual Nest views; saving uses one command. */
export function WorkTaskEditor({ task, onRefresh }: { task: EditableWorkTask; onRefresh: () => void }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const [title, setTitle] = useState(task.title);
  const [detail, setDetail] = useState(task.detail ?? "");
  const [dueLocal, setDueLocal] = useState(task.dueAt ? localDateTimeInput(task.dueAt, timezone) : "");
  const dirty = useRef(false);
  useEffect(() => {
    if (dirty.current) return;
    setTitle(task.title); setDetail(task.detail ?? "");
    setDueLocal(task.dueAt ? localDateTimeInput(task.dueAt, timezone) : "");
  }, [task.title, task.detail, task.dueAt, timezone]);
  if (!task.canEdit || task.status !== "OPEN" || task.recurrence) return null;

  function save(formData: FormData) {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await editWorkTask({ taskId: task.id, title: String(formData.get("title") || ""),
          detail: String(formData.get("detail") || ""), dueLocal: String(formData.get("dueLocal") || "") || null,
          timezone, expectedUpdatedAt: task.updatedAt });
        if (!result.ok) { setMessage(result.error); if (result.code === "CONFLICT") onRefresh(); return; }
        dirty.current = false;
        setMessage("Task saved.");
        onRefresh();
      } catch { setMessage("Couldn't save the task. Your changes are still here; try again."); }
    });
  }

  return <details className="mt-3 rounded-xl border border-border bg-card p-3">
    <summary className="min-h-8 cursor-pointer text-sm font-semibold text-foreground">Edit task</summary>
    <form action={save} className="mt-3 space-y-3">
      <fieldset disabled={pending} className="space-y-3">
        <label className="block text-sm font-medium">Edit task title
          <input name="title" required maxLength={500} value={title} onChange={event => { dirty.current = true; setTitle(event.target.value); }} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-foreground" />
        </label>
        <label className="block text-sm font-medium">Edit task detail
          <textarea name="detail" maxLength={5000} value={detail} onChange={event => { dirty.current = true; setDetail(event.target.value); }} rows={3} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground" />
        </label>
        <label className="block text-sm font-medium">Edit due date (optional)
          <input type="datetime-local" name="dueLocal" value={dueLocal} onChange={event => { dirty.current = true; setDueLocal(event.target.value); }} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-foreground" />
        </label>
        <button type="submit" className="min-h-11 rounded-lg bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-50">{pending ? "Saving…" : "Save task changes"}</button>
      </fieldset>
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    </form>
  </details>;
}
