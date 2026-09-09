"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { tagChipColors } from "@/lib/tag-color";
import { TaskTagPicker } from "./task-tag-picker";

export type ConversationLinkedTask = {
  id: string; title: string; status: string;
  tags?: { id: string; label: string; hexColor: string | null; isActive: boolean }[];
};

type ConversationTaskTarget = { engagementId: string; projectSlug?: never } | { engagementId?: never; projectSlug: string };

export function ConversationTaskAction({ engagementId, projectSlug, messageId, body, canCreate, tasks = [] }: ConversationTaskTarget & {
  messageId: string; body: string; canCreate: boolean; tasks?: ConversationLinkedTask[];
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(body.replace(/\s+/g, " ").trim().slice(0, 160));
  const [pending, setPending] = useState(false);
  const [tagPending, setTagPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<ConversationLinkedTask[]>([]);
  const [selectedTags, setSelectedTags] = useState<NonNullable<ConversationLinkedTask["tags"]>>([]);
  const inFlight = useRef(false);
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  const linked = [...new Map([...saved, ...tasks].map(task => [task.id, task])).values()];

  // Once a refresh confirms a task, canonical state owns its subsequent edits/removal.
  useEffect(() => {
    setSaved(current => current.some(task => tasks.some(confirmed => confirmed.id === task.id))
      ? current.filter(task => !tasks.some(confirmed => confirmed.id === task.id))
      : current);
  }, [tasks]);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!canCreate || !title.trim() || tagPending || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError("");
    const normalized = title.trim();
    const tagIds = selectedTags.map(tag => tag.id).sort();
    const fingerprint = JSON.stringify([engagementId, projectSlug, messageId, normalized, tagIds]);
    const intent = request.current?.fingerprint === fingerprint ? request.current : { fingerprint, id: crypto.randomUUID() };
    request.current = intent;
    try {
      const endpoint = engagementId ? `/api/coaching/engagements/${encodeURIComponent(engagementId)}/work` : "/api/nest-chat/tasks";
      const response = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "TASK", title: normalized, body, sourceMessageId: messageId, clientRequestId: intent.id,
          ...(projectSlug ? { projectSlug } : {}), ...(tagIds.length ? { tags: { tagIds } } : {}) }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok || !result.entry?.id) throw new Error(result.error || "Could not create the task. Try again.");
      setSaved(current => [...current.filter(task => task.id !== result.entry.id), result.entry]);
      request.current = null;
      setSelectedTags([]);
      setOpen(false);
      window.dispatchEvent(new CustomEvent("quipsly-coaching-work-changed", { detail: { engagementId } }));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not create the task. Your title is still here.");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return <div className="mt-2 space-y-2">
    {linked.map(task => <Link key={task.id} href={`/work?task=${encodeURIComponent(task.id)}`}
      className="flex min-h-11 min-w-0 items-start gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground hover:bg-accent">
      <span aria-hidden="true">{task.status === "DONE" ? "✓" : "☐"}</span>
      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        <span>{task.title}</span>
        {Boolean(task.tags?.length) && <span className="mt-1 flex flex-wrap gap-1">
          <span className="sr-only">Tags: </span>
          {task.tags?.map(tag => <span key={tag.id} style={tagChipColors(tag.hexColor)}
            className="max-w-full rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">
            {tag.label}{!tag.isActive && <span className="sr-only"> (archived tag)</span>}
          </span>)}
        </span>}
      </span>
      <span className="sr-only"> — {task.status.toLowerCase()} task</span>
    </Link>)}
    {canCreate && body.trim() && !open && <button type="button" onClick={() => setOpen(true)} className="min-h-11 text-sm font-semibold text-primary underline underline-offset-4">{linked.length ? "Create another task" : "Create task"}</button>}
    {open && <form onSubmit={create} className="space-y-2 rounded-xl border border-border bg-card p-3">
      <label className="block text-sm font-semibold">Task title<input aria-label="Task title from message" value={title} onChange={event => setTitle(event.target.value)} maxLength={500} required disabled={pending}
        className="mt-1 block min-h-11 w-full rounded-lg border border-border bg-background px-3 text-foreground" autoFocus /></label>
      <TaskTagPicker engagementId={engagementId} projectSlug={projectSlug} selected={selectedTags} onChange={setSelectedTags} disabled={pending} onPendingChange={setTagPending} />
      <p className="text-xs text-muted-foreground">Shared in this space and linked to this message. You can change the task anytime.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2"><button type="submit" disabled={pending || tagPending || !title.trim() || !canCreate} className="min-h-11 rounded-lg bg-primary px-3 font-semibold text-primary-foreground disabled:opacity-50">{pending ? "Creating…" : "Add task"}</button>
        <button type="button" disabled={pending || tagPending} onClick={() => setOpen(false)} className="min-h-11 px-3 text-sm">Cancel</button></div>
    </form>}
  </div>;
}
