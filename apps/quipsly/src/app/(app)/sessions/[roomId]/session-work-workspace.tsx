"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { TagSearchChips } from "@/components/tag-search-chips";
import type { SessionQuickEntry } from "./session-review-client";
import { SessionWorkControls } from "./session-work-controls";
import type { SessionWorkAssignmentContext } from "@/lib/session-work-assignment";

type WorkKind = "TASK" | "GOAL";
type WorkFilter = "ALL" | WorkKind;
const isFinished = (entry: SessionQuickEntry) => ["DONE", "ACHIEVED", "CANCELED", "CANCELLED", "ARCHIVED"].includes(entry.status);
const workEntries = (entries: SessionQuickEntry[]) => entries.filter(entry => entry.kind === "TASK" || entry.kind === "GOAL");
const inputClass = "mt-1 block min-h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground";

export function SessionWorkWorkspace({ roomId, entries, assignmentContext = null, canCreate = true, compact = false, active = true, entryToOpen, onOpenConversation, onOpenWorkspace, onChanged }: {
  roomId: string; entries: SessionQuickEntry[]; assignmentContext?: SessionWorkAssignmentContext | null; canCreate?: boolean;
  compact?: boolean; onOpenWorkspace?: () => void; onChanged?: () => void;
  active?: boolean; entryToOpen?: {id: string; request: number} | null;
  onOpenConversation?: (messageId: string) => void;
}) {
  const router = useRouter();
  const headingId = useId();
  const [current, setCurrent] = useState(() => workEntries(entries));
  const [filter, setFilter] = useState<WorkFilter>("ALL");
  const [query, setQuery] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [focusedEntryId, setFocusedEntryId] = useState<string | null>(null);
  const [focusPending, setFocusPending] = useState(false);
  const [expandedCompleted, setExpandedCompleted] = useState(false);
  const handledOpen = useRef<typeof entryToOpen>(null);
  const [kind, setKind] = useState<WorkKind>("TASK");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [targetAt, setTargetAt] = useState("");
  const [visibility, setVisibility] = useState(assignmentContext ? "ENGAGEMENT_SHARED" : "SESSION_SHARED");
  const [ownerUserId, setOwnerUserId] = useState(assignmentContext?.currentUserId || "");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [composerOpen, setComposerOpen] = useState(!compact && workEntries(entries).length === 0);
  const composerToggle = useRef<HTMLButtonElement>(null);
  const composerId = useId();
  const inFlight = useRef(false);
  const attempt = useRef<{fingerprint: string; id: string} | null>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const options = useRef<HTMLDetailsElement>(null);
  useEffect(() => setCurrent(workEntries(entries)), [entries]);
  useEffect(() => {
    if (!active || !entryToOpen || handledOpen.current === entryToOpen) return;
    const entry = current.find(entry => entry.id === entryToOpen.id);
    if (!entry) return;
    handledOpen.current = entryToOpen;
    setQuery(""); setFilter("ALL"); setOnlyMine(false);
    if (isFinished(entry)) setExpandedCompleted(true);
    setFocusedEntryId(entry.id); setFocusPending(true);
  }, [active, current, entryToOpen]);
  useEffect(() => {
    if (!active || !focusPending || !focusedEntryId || query || onlyMine || filter !== "ALL") return;
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(`${compact ? "call-work" : "quick-entry"}-${focusedEntryId}`);
      if (target) { target.scrollIntoView?.({block: "nearest"}); target.focus({preventScroll: true}); setFocusPending(false); }
    });
    return () => cancelAnimationFrame(frame);
  }, [active, focusPending, focusedEntryId, compact, query, onlyMine, filter, expandedCompleted]);

  async function createWork(form: FormData) {
    if (inFlight.current) return;
    // Read the submitted controls, including native date-picker/autofill values
    // that may not have delivered a React change event before submit.
    const submittedVisibility = String(form.get("visibility") || "SESSION_SHARED");
    const submitted = {title: String(form.get("title") || ""), body: String(form.get("body") || ""),
      targetAt: String(form.get("targetAt") || ""), visibility: submittedVisibility,
      ...(assignmentContext ? {ownerUserId: submittedVisibility === "AUTHOR_PRIVATE" ? assignmentContext.currentUserId : String(form.get("ownerUserId") || assignmentContext.currentUserId)} : {})};
    setTitle(submitted.title); setBody(submitted.body); setTargetAt(submitted.targetAt); setVisibility(submitted.visibility);
    inFlight.current = true;
    setBusy(true); setNotice(null); setFailed(false);
    let saved = false;
    try {
      const content = {kind, ...submitted, targetAt: submitted.targetAt ? new Date(`${submitted.targetAt}T12:00:00`).toISOString() : null};
      const fingerprint = JSON.stringify({roomId, ...content});
      if (attempt.current?.fingerprint !== fingerprint) attempt.current = {fingerprint, id: crypto.randomUUID()};
      const response = await fetch(`/api/sessions/${encodeURIComponent(roomId)}/work`, {
        method: "POST", headers: {"content-type": "application/json"},
        body: JSON.stringify({...content, clientRequestId: attempt.current.id}),
      });
      const payload = await response.json() as {ok?: boolean; error?: string; entry?: SessionQuickEntry};
      if (!response.ok || !payload.ok || !payload.entry) throw new Error(payload.error || "Could not save. Your draft is here; try again.");
      saved = true;
      setCurrent(previous => [payload.entry!, ...previous.filter(entry => entry.id !== payload.entry!.id)]);
      setTitle(""); setBody(""); setTargetAt("");
      if (compact) setComposerOpen(false);
      attempt.current = null;
      setFilter("ALL");
      setQuery(""); setOnlyMine(false);
      if (options.current) options.current.open = false;
      setNotice(`${kind === "TASK" ? "Task" : "Goal"} saved. ${submitted.visibility === "AUTHOR_PRIVATE" ? "Only you can see it." : submitted.visibility === "ENGAGEMENT_SHARED" ? "Shared with your client space." : "Shared with this session."}`);
      onChanged?.();
      window.dispatchEvent(new CustomEvent("quipsly-coaching-work-changed", {detail: {roomId}}));
      router.refresh();
    } catch (error) {
      setFailed(true);
      setNotice(error instanceof Error ? error.message : "Could not save. Your draft is here; try again.");
    } finally {
      inFlight.current = false; setBusy(false);
      // Keep quick entry ready for the next thought without scrolling away.
      requestAnimationFrame(() => {
        const target = compact && saved ? composerToggle.current : titleInput.current;
        target?.focus({preventScroll: true});
      });
    }
  }

  const searchTerms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const hasFilters = searchTerms.length > 0 || onlyMine || filter !== "ALL";
  const filtered = current.filter(entry => {
    if (filter !== "ALL" && entry.kind !== filter) return false;
    if (onlyMine && entry.ownedByCurrentActor !== true) return false;
    const text = [entry.title, entry.body, entry.ownerLabel, ...entry.tags.map(tag => tag.label)].filter(Boolean).join(" ").toLocaleLowerCase();
    return searchTerms.every(term => text.includes(term));
  });
  const unfinished = filtered.filter(entry => !isFinished(entry));
  const completed = filtered.filter(isFinished);
  const hasArchived = completed.some(entry => !["DONE", "ACHIEVED"].includes(entry.status));
  const tasks = current.filter(entry => entry.kind === "TASK").length;
  const goals = current.filter(entry => entry.kind === "GOAL").length;

  function renderEntry(entry: SessionQuickEntry) {
    const finished = isFinished(entry);
    const mine = entry.ownedByCurrentActor !== false;
    const due = entry.dueAt ? new Date(entry.dueAt) : null;
    const dateLabel = due && Number.isFinite(due.getTime()) ? due.toLocaleDateString(undefined, {month: "short", day: "numeric", year: "numeric"}) : null;
    return <article id={`${compact ? "call-work" : "quick-entry"}-${entry.id}`} key={entry.id} tabIndex={-1}
      className={`scroll-mt-24 rounded-xl border border-border bg-card p-4 text-card-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring ${entry.id === focusedEntryId ? "ring-2 ring-primary/50" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className={`min-w-0 break-words font-semibold ${finished ? "text-muted-foreground" : ""}`}>{entry.title || `Untitled ${entry.kind.toLowerCase()}`}</h3>
        <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">{entry.kind === "GOAL" ? "Goal" : "Task"}{finished ? ["DONE", "ACHIEVED"].includes(entry.status) ? " · Completed" : entry.status === "ARCHIVED" ? " · Archived" : " · Canceled" : entry.status === "PAUSED" ? " · Paused" : ""}</span>
      </div>
      {entry.body && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{entry.body}</p>}
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        {entry.visibility === "ENGAGEMENT_SHARED" ? "Shared client space" : entry.visibility === "SESSION_SHARED" ? "Everyone in this Session" : "Only me"} · {entry.ownerLabel || (mine ? "Mine" : "Another participant")}
        {dateLabel && <> · {entry.kind === "GOAL" ? "Target" : "Due"} <time dateTime={entry.dueAt!}>{dateLabel}</time></>}
      </p>
      <TagSearchChips tags={entry.tags} label={`${entry.title || entry.kind} tags`} />
      <SessionWorkControls entry={entry} assignmentContext={assignmentContext} onUpdate={update => {
        setCurrent(previous => previous.map(item => item.id === entry.id ? {...item, ...update} : item));
        onChanged?.();
        window.dispatchEvent(new CustomEvent("quipsly-coaching-work-changed", {detail: {roomId}}));
      }} />
      <div className="mt-2 flex flex-wrap gap-x-4">
        {entry.sourceHref && <Link onClick={event => {
          if (entry.fromConversation && onOpenConversation && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
            const source = new URL(entry.sourceHref!, window.location.origin);
            const messageId = source.searchParams.get("message");
            if (source.origin === window.location.origin && source.pathname === `/sessions/${encodeURIComponent(roomId)}` && messageId) {
              event.preventDefault(); onOpenConversation(messageId); return;
            }
          }
          onOpenWorkspace?.();
        }} href={entry.sourceHref} className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">{entry.fromConversation ? "From conversation" : "From recording"}</Link>}
        {mine && <Link onClick={onOpenWorkspace} href={`/work?${entry.kind === "TASK" ? "task" : "goal"}=${encodeURIComponent(entry.id)}`} className="inline-flex min-h-11 items-center text-sm text-muted-foreground underline underline-offset-4">Open in Work</Link>}
      </div>
    </article>;
  }

  return <section aria-labelledby={headingId} className="space-y-4">
    <header className={compact ? "sr-only" : "flex flex-wrap items-center justify-between gap-3"}>
      <div><h2 id={headingId} className={`${compact ? "text-lg" : "font-serif text-2xl"} font-semibold`}>Tasks and goals</h2>
        <p className="mt-1 text-sm text-muted-foreground">{tasks} task{tasks === 1 ? "" : "s"} · {goals} goal{goals === 1 ? "" : "s"}</p></div>
      {!compact && <Link onClick={onOpenWorkspace} href="/work" className="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm font-semibold">All my work</Link>}
    </header>
    {canCreate && <>
    <button ref={composerToggle} type="button" aria-expanded={composerOpen} aria-controls={composerId}
      onClick={() => {setComposerOpen(value => !value); if (!composerOpen) requestAnimationFrame(() => titleInput.current?.focus({preventScroll: true}));}}
      className="min-h-11 w-full rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-card-foreground">
      {composerOpen ? "Close draft" : title || body ? "Continue draft" : "Add task or goal"}
    </button>
    <div id={composerId} hidden={!composerOpen}>
    <form aria-label="New session work" onSubmit={event => {event.preventDefault(); void createWork(new FormData(event.currentTarget));}}
      className="rounded-xl border border-border bg-card p-4 text-card-foreground">
      <fieldset disabled={busy} className="min-w-0 space-y-3">
        <div className="flex gap-1" role="group" aria-label="Create work type">
          {(["TASK", "GOAL"] as const).map(value => <button key={value} type="button" aria-pressed={kind === value} onClick={() => setKind(value)}
            className={`min-h-11 rounded-full px-4 text-sm font-semibold ${kind === value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{value === "TASK" ? "Task" : "Goal"}</button>)}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-[1_1_12rem] text-sm font-medium">{kind === "TASK" ? "Task" : "Goal"} title
            <input ref={titleInput} name="title" required maxLength={500} value={title} onChange={event => setTitle(event.target.value)}
              placeholder={kind === "TASK" ? "What happens next?" : "What are we working toward?"} className={inputClass} />
          </label>
          <button type="submit" className="min-h-11 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Saving…" : `Save ${kind.toLowerCase()}`}</button>
        </div>
        {assignmentContext && visibility === "ENGAGEMENT_SHARED" && <label className="flex flex-wrap items-center gap-2 text-sm font-medium">Assigned to
          <select name="ownerUserId" value={ownerUserId} onChange={event => setOwnerUserId(event.target.value)} className="min-h-11 rounded-lg border border-input bg-background px-3 text-foreground">
            {assignmentContext.members.map(member => <option key={member.id} value={member.id}>{member.id === assignmentContext.currentUserId ? "Me" : `${member.label} · ${member.role.toLowerCase()}`}</option>)}
          </select>
        </label>}
        <details ref={options}>
          <summary className="min-h-11 cursor-pointer py-3 text-sm text-muted-foreground">Details, date and sharing · {visibility === "AUTHOR_PRIVATE" ? "Only me" : visibility === "ENGAGEMENT_SHARED" ? "Shared client space" : "Shared"}</summary>
          <div className={`grid gap-3 pt-2 ${compact ? "" : "sm:grid-cols-2"}`}>
            <label className={`text-sm font-medium ${compact ? "" : "sm:col-span-2"}`}>Context (optional)<textarea name="body" maxLength={5000} rows={3} value={body} onChange={event => setBody(event.target.value)} className={inputClass} /></label>
            <label className="text-sm font-medium">{kind === "TASK" ? "Due date" : "Target date"} (optional)<input name="targetAt" type="date" value={targetAt} onChange={event => setTargetAt(event.target.value)} className={inputClass} /></label>
            <label className="text-sm font-medium">Who can see it<select name="visibility" value={visibility} onChange={event => setVisibility(event.target.value)} className={inputClass}>
              {assignmentContext ? <option value="ENGAGEMENT_SHARED">Shared client space</option> : <option value="SESSION_SHARED">Everyone in this Session</option>}<option value="AUTHOR_PRIVATE">Only me</option>
            </select></label>
          </div>
        </details>
      </fieldset>
    </form>
    </div>
    {notice && <p role={failed ? "alert" : "status"} className={`mt-2 text-sm ${failed ? "text-destructive" : "text-muted-foreground"}`}>{notice}</p>}
    </>}
    {current.length > 0 && <div className="space-y-2">
      <div className="flex items-end gap-2">
        <label className="min-w-0 flex-1 text-sm font-medium">Find a task or goal
          <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search words, people or tags" className={inputClass} />
        </label>
        {query && <button type="button" onClick={() => setQuery("")} className="min-h-11 rounded-lg px-3 text-sm font-medium hover:bg-muted">Clear search</button>}
      </div>
      <div role="group" aria-label="Filter session work" className="flex flex-wrap gap-2">
      {(["ALL", "TASK", "GOAL"] as const).map(value => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}
        className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${filter === value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}>{value === "ALL" ? "All" : value === "TASK" ? "Tasks" : "Goals"}</button>)}
        <button type="button" aria-pressed={onlyMine} onClick={() => setOnlyMine(value => !value)} className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${onlyMine ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}>Assigned to me</button>
      </div>
      {hasFilters && <p role="status" className="text-xs text-muted-foreground">{filtered.length} of {current.length} items</p>}
    </div>}
    <div className="space-y-3" aria-label="Unfinished work">
      {unfinished.map(renderEntry)}
      {!unfinished.length && <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">{hasFilters ? filtered.length ? "No unfinished work matches these filters." : "No matching tasks or goals. Try another search or filter." : current.length ? "You're caught up here." : canCreate ? "Add a next step, or find the editable tasks and goals Quipsly creates from your transcript here." : "No tasks or goals yet."}</p>}
    </div>
    {completed.length > 0 && <details open={searchTerms.length > 0 || expandedCompleted} onToggle={event => setExpandedCompleted(event.currentTarget.open)} className="rounded-xl border border-border p-3">
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">{hasArchived ? "Completed and archived" : "Completed"} ({completed.length})</summary>
      <div className="mt-2 space-y-3">{completed.map(renderEntry)}</div>
    </details>}
  </section>;
}
