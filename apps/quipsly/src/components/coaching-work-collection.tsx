"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, CheckCircle2, Circle, LockKeyhole, NotebookPen, Search, Target } from "lucide-react";
import type { CoachingEngagementWorkEntry } from "./coaching-engagement-workspace";

export function CoachingWorkCollection({ entries, selectedId, onSelect, onToggleTask, busyIds, search, onSearch, loading, hasMore, onLoadMore, children }: {
  entries: CoachingEngagementWorkEntry[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onToggleTask?: (entry: CoachingEngagementWorkEntry) => void;
  busyIds?: ReadonlySet<string>;
  search?: string;
  onSearch?: (value: string) => void;
  loading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  children: ReactNode;
}) {
  const [localQuery, setLocalQuery] = useState("");
  const query = search ?? localQuery;
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const previousSelection = useRef<string | null>(null);
  const selected = entries.find((entry) => entry.id === selectedId);
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  // Controlled results have already been searched by the authorized server,
  // including fields (such as a member's email) not repeated in the UI label.
  const matches = onSearch ? entries : entries.filter((entry) => {
    const searchable = [entry.title, entry.body, entry.owner?.label].filter(Boolean).join(" ").toLocaleLowerCase();
    return terms.every((term) => searchable.includes(term));
  });

  useEffect(() => {
    if (selected) {
      previousSelection.current = selected.id;
      detailHeading.current?.focus({ preventScroll: true });
    }
  }, [selected?.id]);

  function backToList() {
    onSelect(null);
    requestAnimationFrame(() => {
      const buttons = list.current?.querySelectorAll<HTMLButtonElement>("button[data-work-item]");
      const previous = Array.from(buttons ?? []).find((button) => button.dataset.workItem === previousSelection.current);
      (previous ?? list.current?.querySelector<HTMLInputElement>("input"))?.focus({ preventScroll: true });
    });
  }

  return (
    <div className="mt-5 grid min-w-0 gap-4 lg:grid-cols-[minmax(15rem,0.8fr)_minmax(0,1.6fr)]">
      <div ref={list} className={`min-w-0 ${selected ? "hidden lg:block" : ""}`}>
        <label className="flex min-h-11 items-center gap-2 rounded-xl border border-[#d8c7a7] bg-white px-3 text-[#765f40]">
          <Search size={17} aria-hidden="true" />
          <input type="search" maxLength={200} aria-label="Search this work" placeholder="Find a note, task, or goal" value={query}
            onChange={(event) => onSearch ? onSearch(event.target.value) : setLocalQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent py-3 text-sm text-[#3d3122] outline-none" />
        </label>
        <div aria-label="Work items" className="mt-3 space-y-1 lg:max-h-[65dvh] lg:overflow-y-auto lg:overscroll-contain">
          {matches.map((entry) => {
            const Icon = entry.kind === "NOTE" ? NotebookPen : entry.kind === "TASK" ? CheckCircle2 : Target;
            const complete = entry.status === "DONE" || entry.status === "ACHIEVED";
            const canComplete = entry.kind === "TASK" && entry.canEdit && onToggleTask;
            return <div key={entry.id} className="flex min-w-0 items-start">
              {canComplete ? <button type="button" aria-label={`${complete ? "Reopen" : "Complete"} task: ${entry.title || "Untitled"}`} aria-pressed={complete}
                disabled={busyIds?.has(entry.id)} onClick={() => onToggleTask(entry)}
                className="mt-1 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-[#41624b] hover:bg-[#e4eadc] disabled:opacity-50">
                {complete ? <CheckCircle2 size={20} aria-hidden="true" /> : <Circle size={20} aria-hidden="true" />}
              </button> : null}
              <button type="button" data-work-item={entry.id} aria-current={selected?.id === entry.id ? "true" : undefined}
              aria-label={`Open ${entry.kind.toLowerCase()}: ${entry.title || "Untitled"}`} onClick={() => onSelect(entry.id)}
              className={`flex min-h-16 min-w-0 flex-1 items-start gap-3 rounded-xl border p-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#41624b] ${selected?.id === entry.id ? "border-[#879a77] bg-[#e4eadc]" : "border-transparent hover:bg-[#f1eadb]"}`}>
              {!canComplete ? <Icon size={18} aria-hidden="true" className="mt-1 shrink-0 text-[#41624b]" /> : null}
              <span className="min-w-0 flex-1">
                <span className={`block break-words text-sm font-bold text-[#3d3122] ${complete ? "line-through opacity-65" : ""}`}>{entry.title || "Untitled"}</span>
                {entry.body ? <span className="mt-1 line-clamp-2 break-words text-xs leading-5 text-[#765f40]">{entry.body.replace(/\s+/g, " ").slice(0, 160)}{entry.body.replace(/\s+/g, " ").length > 160 ? "…" : ""}</span> : null}
                <span className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-[#765f40]">
                  {entry.visibility === "PRIVATE" ? <span className="inline-flex items-center gap-1"><LockKeyhole size={11} aria-hidden="true" />Only me</span> : null}
                  {complete ? <span>Completed</span> : null}
                  {entry.dueAt ? <span>{entry.kind === "TASK" ? "Due" : "Target"} {new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(entry.dueAt))}</span> : null}
                </span>
              </span>
            </button></div>;
          })}
          {loading ? <p role="status" className="px-3 py-3 text-sm text-[#765f40]">Finding your work…</p> : null}
          {query && !matches.length && !loading ? <p role="status" className="px-3 py-6 text-sm text-[#765f40]">No matching work. Try another word.</p> : null}
          {hasMore ? <button type="button" onClick={onLoadMore} disabled={loading}
            className="my-2 min-h-11 w-full rounded-xl border border-[#d8c7a7] px-4 text-sm font-bold text-[#41624b] disabled:opacity-50">Show more work</button> : null}
        </div>
      </div>
      <div className={`min-w-0 ${selected ? "" : "hidden lg:block"}`}>
        {selected ? <div className="mb-3 flex min-w-0 items-center gap-3">
          <button type="button" onClick={backToList} className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 text-sm font-bold text-[#41624b] lg:hidden"><ArrowLeft size={17} aria-hidden="true" />Back to work</button>
          <h3 ref={detailHeading} tabIndex={-1} className="min-w-0 text-sm font-semibold text-[#765f40] focus:outline-none">{selected.kind === "NOTE" ? "Note" : selected.kind === "TASK" ? "Task" : "Goal"} details</h3>
        </div> : <p className="rounded-2xl border border-dashed border-[#d8c7a7] px-6 py-16 text-center text-sm text-[#765f40]">Choose a note, task, or goal to work on.</p>}
        {children}
      </div>
    </div>
  );
}
