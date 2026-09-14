"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { SessionWorkspaceNote } from "@/app/(app)/sessions/[roomId]/session-notes-model";
import { tagChipColors } from "@/lib/tag-color";

export type CallNoteCursor = { before: string; afterId: string };

export function CallNoteTags({ tags }: { tags: SessionWorkspaceNote["tags"] }) {
  if (!tags.length) return null;
  return <span className="mt-2 flex flex-wrap gap-1.5" aria-label="Note tags">
    {tags.map(tag => <span key={tag.id} style={tagChipColors(tag.hexColor)} className="max-w-full break-words rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium">#{tag.label}</span>)}
  </span>;
}

/** The call browses canonical notes, including older work, without unloading
 * the editor or creating a second note store. Every page is actor scoped. */
export function CallNoteBrowser({ roomId, actorId, active, audience, notes, cursor, onOpen, onAccessLost, unsavedIds }: {
  roomId: string; actorId: string; active: boolean; audience: "shared" | "private";
  notes: SessionWorkspaceNote[]; cursor: CallNoteCursor | null;
  onOpen: (note: SessionWorkspaceNote) => void; onAccessLost: (message: string) => void;
  unsavedIds: Set<string>;
}) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ key: string; notes: SessionWorkspaceNote[]; cursor: CallNoteCursor | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const lastAttempt = useRef<{ after: CallNoteCursor | null; append: boolean }>({ after: null, append: false });
  const key = `${audience}:${query.trim()}`;
  const base = notes.filter(note => audience === "private" ? note.visibility === "AUTHOR_PRIVATE" : note.visibility !== "AUTHOR_PRIVATE");
  const current = result?.key === key ? result : null;
  const visible = current?.notes ?? (query.trim() ? [] : base);
  const next = current ? current.cursor : query.trim() ? null : cursor;

  async function fetchPage(after: CallNoteCursor | null, append: boolean) {
    const request = ++sequence.current;
    lastAttempt.current = { after, append };
    setBusy(true); setError(null);
    const params = new URLSearchParams({ audience });
    if (query.trim()) params.set("q", query.trim());
    if (after) { params.set("before", after.before); params.set("afterId", after.afterId); }
    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(roomId)}/notes?${params}`, { cache: "no-store" });
      if (request !== sequence.current) return;
      if ([401, 403, 404].includes(response.status)) {
        onAccessLost(response.status === 401 ? "Sign in again to open notes." : "This session is no longer available to this account.");
        return;
      }
      const data = await response.json();
      if (request !== sequence.current) return;
      if (!response.ok || !data.ok || !Array.isArray(data.notes)) throw new Error(data.error || "Notes couldn’t load. Try again.");
      if (data.actorUserId !== actorId || data.roomId !== roomId) {
        onAccessLost("Your account changed. Open notes again to continue."); return;
      }
      const combined = append ? [...visible, ...data.notes] : data.notes;
      setResult({ key, notes: [...new Map(combined.map((note: SessionWorkspaceNote) => [note.id, note])).values()] as SessionWorkspaceNote[], cursor: data.nextCursor || null });
    } catch (failure) {
      if (request === sequence.current) setError(failure instanceof Error ? failure.message : "Notes couldn’t load. Try again.");
    } finally { if (request === sequence.current) setBusy(false); }
  }

  useEffect(() => {
    sequence.current++; setError(null); setBusy(Boolean(active && query.trim()));
    if (!active || !query.trim()) { setResult(null); return; }
    const timer = setTimeout(() => void fetchPage(null, false), 250);
    return () => { clearTimeout(timer); sequence.current++; };
    // A new query/actor replaces a result. Routine note polling must not reset
    // search or interrupt pagination while someone is choosing a note.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, active, roomId, actorId]);
  useEffect(() => () => { sequence.current++; }, []);

  return <div className="space-y-3">
    <div className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-3">
      <Search size={17} aria-hidden="true" />
      <input type="search" aria-label="Search session notes" placeholder="Search session notes" value={query} maxLength={200}
        onChange={event => setQuery(event.target.value)} className="min-h-11 min-w-0 flex-1 bg-transparent text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary" />
      {query && <button type="button" aria-label="Clear note search" onClick={() => setQuery("")} className="grid size-9 place-items-center rounded-lg hover:bg-muted"><X size={16} /></button>}
    </div>
    {error && <div role="alert" className="text-sm text-destructive">{error} <button type="button" className="min-h-11 underline" onClick={() => void fetchPage(lastAttempt.current.after, lastAttempt.current.append)}>Try again</button></div>}
    {busy && <p role="status" className="text-xs text-muted-foreground">Finding notes…</p>}
    {!busy && !error && query.trim() && !visible.length && <p role="status" className="py-4 text-sm text-muted-foreground">No {audience === "private" ? "private" : "shared"} notes match “{query.trim()}”.</p>}
    {!query.trim() && !visible.length && !next && <div className="py-6 text-center"><p className="text-sm font-medium">{audience === "shared" ? "A place to think together" : "Your private notes"}</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{audience === "shared" ? "Keep questions and next steps here during your conversation." : "Only you can see notes you create here."}</p></div>}
    {visible.map(note => <button key={note.id} type="button" onClick={() => onOpen(note)} aria-label={`${note.title || "Untitled note"}, ${note.author.label}${unsavedIds.has(note.id) ? ", unsaved changes" : ""}`} className="block w-full min-w-0 rounded-xl border border-border bg-card p-3 text-left hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
      <span className="block truncate text-sm font-semibold">{note.title || "Untitled note"}</span>
      <span className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{note.body}</span>
      <CallNoteTags tags={note.tags} />
      <span className="mt-2 block text-xs text-muted-foreground">{note.author.label}{unsavedIds.has(note.id) ? " · Unsaved changes" : ""}</span>
    </button>)}
    {next && <button type="button" disabled={busy} onClick={() => void fetchPage(next, true)} className="min-h-11 w-full rounded-xl border border-border px-3 text-sm font-medium disabled:opacity-50">Load more notes</button>}
  </div>;
}
