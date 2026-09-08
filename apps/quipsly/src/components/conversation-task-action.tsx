"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { tagChipColors } from "@/lib/tag-color";

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
      <ConversationTaskTags engagementId={engagementId} projectSlug={projectSlug} selected={selectedTags} onChange={setSelectedTags} disabled={pending} onPendingChange={setTagPending} />
      <p className="text-xs text-muted-foreground">Shared in this space and linked to this message. You can change the task anytime.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2"><button type="submit" disabled={pending || tagPending || !title.trim() || !canCreate} className="min-h-11 rounded-lg bg-primary px-3 font-semibold text-primary-foreground disabled:opacity-50">{pending ? "Creating…" : "Add task"}</button>
        <button type="button" disabled={pending || tagPending} onClick={() => setOpen(false)} className="min-h-11 px-3 text-sm">Cancel</button></div>
    </form>}
  </div>;
}

function ConversationTaskTags({ engagementId, projectSlug, selected, onChange, disabled, onPendingChange }: {
  engagementId?: string;
  projectSlug?: string;
  selected: NonNullable<ConversationLinkedTask["tags"]>;
  onChange: (tags: NonNullable<ConversationLinkedTask["tags"]>) => void;
  disabled: boolean;
  onPendingChange: (pending: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [tags, setTags] = useState<NonNullable<ConversationLinkedTask["tags"]>>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [canCreateTags, setCanCreateTags] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [newColor, setNewColor] = useState<string | null>("#506b46");
  const creatingRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setTags([]);
    setProjectId(null);
    setCanCreateTags(false);
    const params = new URLSearchParams({ entityKind: "task", ...(engagementId ? { engagementId } : { projectSlug: projectSlug! }) });
    void (async () => {
      try {
        const response = await fetch(`/api/work/tags?${params}`, { cache: "no-store", signal: controller.signal });
        const payload = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok || !payload.ok || !Array.isArray(payload.tags)) throw new Error("Tags couldn't load. You can still add your task.");
        setTags(payload.tags.filter((tag: NonNullable<ConversationLinkedTask["tags"]>[number]) => tag.isActive));
        setProjectId(typeof payload.projectId === "string" ? payload.projectId : null);
        setCanCreateTags(payload.canCreateTags === true);
      } catch {
        if (!controller.signal.aborted) setError("Tags couldn't load. You can still add your task.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [expanded, engagementId, projectSlug, attempt]);

  async function createTag() {
    const label = query.trim();
    if (!projectId || !canCreateTags || !label || disabled || selected.length >= 24 || creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    onPendingChange(true);
    setCreateError("");
    try {
      const response = await fetch("/api/work/tags", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "CREATE", projectId, label, hexColor: newColor }) });
      const result = await response.json();
      if (!response.ok || !result.ok || !result.tag?.id) throw new Error(result.error || "The tag couldn't save. Try again.");
      if (!mountedRef.current) return;
      // An existing label is reused without changing its shared color.
      const tag = { id: result.tag.id, label: result.tag.label, hexColor: result.tag.hexColor ?? null, isActive: result.tag.isActive };
      setTags(current => [...current.filter(value => value.id !== tag.id), tag].sort((a, b) => a.label.localeCompare(b.label)));
      onChange([...selected.filter(value => value.id !== tag.id), tag]);
      setQuery("");
    } catch (failure) {
      if (mountedRef.current) setCreateError(failure instanceof Error ? failure.message : "The tag couldn't save. Your name and color are still here.");
    } finally {
      creatingRef.current = false;
      if (mountedRef.current) { setCreating(false); onPendingChange(false); }
    }
  }

  const visible = tags.filter(tag => tag.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const newLabel = query.trim();
  const canOfferCreation = canCreateTags && projectId && newLabel && !tags.some(tag => tag.label.normalize("NFKC").toLocaleLowerCase() === newLabel.normalize("NFKC").toLocaleLowerCase());
  return <div className="min-w-0 space-y-2">
    <button type="button" disabled={disabled || creating} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}
      className="min-h-11 text-sm font-semibold text-primary underline underline-offset-4">
      {selected.length ? `Tags (${selected.length})` : "Add tags"}
    </button>
    {!expanded && selected.length > 0 && <div className="flex flex-wrap gap-1" aria-label="Selected tags">
      {selected.map(tag => <span key={tag.id} style={tagChipColors(tag.hexColor)} className="max-w-full rounded-full border px-2 py-1 text-xs [overflow-wrap:anywhere]">{tag.label}</span>)}
    </div>}
    {expanded && <fieldset disabled={disabled || creating} className="min-w-0 space-y-2">
      <legend className="sr-only">Task tags</legend>
      <input type="search" aria-label="Find task tags" value={query} maxLength={80} onChange={event => { setQuery(event.target.value); setCreateError(""); }} placeholder={canCreateTags ? "Find or create a tag…" : "Find a tag…"}
        className="block min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground" />
      {loading && <p role="status" className="text-sm text-muted-foreground">Loading tags…</p>}
      {error && <div role="status" className="text-sm text-muted-foreground">{error} <button type="button" onClick={() => setAttempt(value => value + 1)} className="min-h-11 font-semibold underline">Retry tags</button></div>}
      {!loading && !error && <div className="max-h-48 overflow-y-auto space-y-1">
        {visible.map(tag => {
          const checked = selected.some(value => value.id === tag.id);
          return <label key={tag.id} className="flex min-h-11 cursor-pointer items-center gap-2">
            <input type="checkbox" checked={checked} disabled={!checked && selected.length >= 24}
              onChange={() => onChange(checked ? selected.filter(value => value.id !== tag.id) : [...selected, tag])} />
            <span style={tagChipColors(tag.hexColor)} className="min-w-0 rounded-full border border-border bg-muted px-2 py-1 text-xs font-semibold text-foreground [overflow-wrap:anywhere]">{tag.label}</span>
          </label>;
        })}
        {!visible.length && <p className="text-sm text-muted-foreground">{tags.length ? "No matching tags." : canCreateTags ? "Type a name to create your first shared tag." : "No shared tags yet. You can add tags after creating the task."}</p>}
      </div>}
      {canOfferCreation && !loading && !error && <div className="space-y-2 rounded-lg border border-border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span style={tagChipColors(newColor)} className="max-w-full rounded-full border border-border bg-muted px-3 py-1 text-sm font-semibold [overflow-wrap:anywhere]">{newLabel}</span>
          <label className="flex min-h-11 items-center gap-2 text-sm">Tag color
            <input type="color" aria-label="New tag color" value={newColor ?? "#506b46"} onChange={event => setNewColor(event.target.value)} className="h-11 w-12 cursor-pointer rounded border border-border" />
          </label>
          <button type="button" disabled={newColor === null} onClick={() => setNewColor(null)} className="min-h-11 text-sm underline">Use theme color</button>
        </div>
        <button type="button" onClick={() => void createTag()} disabled={selected.length >= 24} className="min-h-11 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {creating ? "Creating tag…" : `Create “${newLabel}” tag`}
        </button>
        <p className="text-xs text-muted-foreground">Reusable by everyone in this Nest.</p>
      </div>}
      {createError && <p role="alert" className="text-sm text-destructive">{createError}</p>}
      {selected.length >= 24 && <p role="status" className="text-sm text-muted-foreground">24 tags selected. Remove one to choose another.</p>}
    </fieldset>}
  </div>;
}
