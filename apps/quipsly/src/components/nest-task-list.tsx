"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { updateWorkTaskStatus } from "@/app/(app)/work/actions";
import { WorkTaskEditor } from "./work-task-editor";
import { tagChipColors } from "@/lib/tag-color";

export type NestTask = {
  id: string; title: string; detail: string | null; status: "OPEN" | "DONE" | "CANCELED";
  dueAt: string | null; updatedAt: string; canEdit: boolean; recurring: boolean;
  tags: { id: string; label: string; hexColor: string | null; isActive: boolean }[];
  conversationSourceHref: string | null;
  sourceAnchor: { roomId: string; segmentId: string; startSeconds: number; endSeconds: number } | null;
};

function mediaTime(value: number) {
  const seconds = Math.max(0, Math.floor(value));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = String(seconds % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${remainder}` : `${minutes}:${remainder}`;
}

export function NestTaskList({ tasks, projectId }: { tasks: NestTask[]; projectId: string }) {
  const [status, setStatus] = useState<"OPEN" | "RESOLVED" | "ALL">("OPEN");
  const [query, setQuery] = useState("");
  const [tagId, setTagId] = useState<string | null>(null);
  const tags = [...new Map(tasks.flatMap(task => task.tags).map(tag => [tag.id, tag])).values()].sort((a, b) => a.label.localeCompare(b.label));
  const visible = tasks.filter(task => (status === "ALL" || (status === "OPEN" ? task.status === "OPEN" : task.status !== "OPEN"))
    && (!tagId || task.tags.some(tag => tag.id === tagId))
    && `${task.title} ${task.detail ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const activeTag = tags.find(tag => tag.id === tagId);

  return <section aria-label="Nest tasks" className="order-1 min-w-0 rounded-2xl border border-border bg-card p-4 text-foreground">
    <h3 className="font-serif text-2xl font-semibold">Tasks</h3>
    <div className="my-3 flex flex-wrap gap-2" role="group" aria-label="Task status">
      {(["OPEN", "RESOLVED", "ALL"] as const).map(value => <button key={value} type="button" aria-pressed={status === value} onClick={() => setStatus(value)}
        className={`min-h-11 rounded-full border px-3 text-sm font-semibold ${status === value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}>
        {value === "OPEN" ? "Open" : value === "RESOLVED" ? "Completed & canceled" : "All"} ({tasks.filter(task => value === "ALL" || (value === "OPEN" ? task.status === "OPEN" : task.status !== "OPEN")).length})
      </button>)}
    </div>
    <input type="search" aria-label="Find tasks in this Nest" placeholder="Find a task…" value={query} onChange={event => setQuery(event.target.value)} className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm" />
    {tags.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Filter tasks by tag">
      <button type="button" aria-pressed={!tagId} onClick={() => setTagId(null)} className="min-h-11 rounded-full border border-border px-3 text-sm">All tags</button>
      {tags.map(tag => <button key={tag.id} type="button" aria-label={`Filter by ${tag.label}${tag.isActive ? "" : " (archived)"}`} aria-pressed={tagId === tag.id} onClick={() => setTagId(tagId === tag.id ? null : tag.id)}
        style={tagChipColors(tag.hexColor)} className={`min-h-11 max-w-full rounded-full border border-border px-3 text-sm font-semibold [overflow-wrap:anywhere] ${tagId === tag.id ? "ring-2 ring-ring ring-offset-2" : ""}`}>
        {tag.label}{!tag.isActive && " · archived"}
      </button>)}
    </div>}
    {tagId && !activeTag && <button type="button" onClick={() => setTagId(null)} className="mt-2 min-h-11 text-sm underline">Clear unavailable tag filter</button>}
    <p role="status" className="mt-3 text-sm text-muted-foreground">{visible.length} {visible.length === 1 ? "task" : "tasks"}{activeTag ? ` tagged ${activeTag.label}` : ""}</p>
    {visible.length ? <ul className="mt-3 space-y-3">{visible.map(task => <li key={task.id}><NestTaskCard task={task} onTag={setTagId} /></li>)}</ul>
      : <p className="mt-3 text-sm text-muted-foreground">{tasks.length ? "No tasks match. Try another status, tag, or search." : "Create a task above or turn a conversation idea into one."}</p>}
    {tasks.length >= 32 && <p className="mt-4 text-sm text-muted-foreground">Showing recent tasks. <Link href={`/work?project=${encodeURIComponent(projectId)}`} className="underline">Open the full task queue</Link></p>}
  </section>;
}

function NestTaskCard({ task, onTag }: { task: NestTask; onTag: (tagId: string) => void }) {
  const router = useRouter();
  const [current, setCurrent] = useState(task);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  useEffect(() => { setCurrent(task); }, [task]);

  async function toggle() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true); setError(null);
    try {
      const result = await updateWorkTaskStatus({ taskId: current.id, nextStatus: current.status === "OPEN" ? "DONE" : "OPEN", expectedUpdatedAt: current.updatedAt });
      if (!result.ok) { setError(result.error); if (result.code === "CONFLICT") router.refresh(); return; }
      setCurrent(value => ({ ...value, status: result.status, updatedAt: result.updatedAt }));
      router.refresh();
    } catch { setError("Couldn't save the task. Try again."); }
    finally { inFlight.current = false; setPending(false); }
  }

  return <article aria-label={current.title} className="min-w-0 rounded-xl border border-border bg-background p-4">
    <div className="flex items-start justify-between gap-3">
      <Link href={`/work?task=${encodeURIComponent(current.id)}`} className="min-w-0 font-semibold hover:underline [overflow-wrap:anywhere]">{current.title}</Link>
      {current.canEdit && !current.recurring && <button type="button" disabled={pending} onClick={() => void toggle()} aria-label={`${current.status === "OPEN" ? "Complete" : "Reopen"} ${current.title}`}
        className="min-h-11 shrink-0 rounded-lg border border-border px-3 text-sm font-semibold disabled:opacity-50">{pending ? "Saving…" : current.status === "OPEN" ? "Done" : "Reopen"}</button>}
    </div>
    <p className="mt-1 text-xs text-muted-foreground">{current.status === "OPEN" ? "Open" : current.status === "DONE" ? "Completed" : "Canceled"}{current.dueAt ? ` · Due ${new Date(current.dueAt).toLocaleDateString()}` : ""}{current.recurring ? " · Repeating task" : ""}</p>
    {current.detail && <p className="mt-2 whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{current.detail}</p>}
    {current.tags.length > 0 && <div className="mt-3 flex flex-wrap gap-2" aria-label="Task tags">{current.tags.map(tag => <button key={tag.id} type="button" onClick={() => onTag(tag.id)} aria-label={`Show ${tag.label} tasks`}
      style={tagChipColors(tag.hexColor)} className="min-h-9 max-w-full rounded-full border border-border px-3 text-xs font-semibold [overflow-wrap:anywhere]">{tag.label}{!tag.isActive && " · archived"}</button>)}</div>}
    <div className="mt-2 flex flex-wrap gap-3 text-sm">
      {current.conversationSourceHref && <Link href={current.conversationSourceHref} className="inline-flex min-h-11 items-center underline">View conversation</Link>}
      {current.sourceAnchor && <Link href={`/sessions/${encodeURIComponent(current.sourceAnchor.roomId)}#transcript-segment-${encodeURIComponent(current.sourceAnchor.segmentId)}`} className="inline-flex min-h-11 items-center underline">Return to {mediaTime(current.sourceAnchor.startSeconds)}–{mediaTime(current.sourceAnchor.endSeconds)}</Link>}
      {current.recurring && <Link href={`/work?task=${encodeURIComponent(current.id)}`} className="inline-flex min-h-11 items-center underline">Manage repeat</Link>}
    </div>
    <WorkTaskEditor task={{ ...current, canEdit: current.canEdit && !pending, recurrence: current.recurring }} onRefresh={() => router.refresh()} />
    {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
  </article>;
}
