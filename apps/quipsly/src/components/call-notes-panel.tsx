"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, LoaderCircle, LockKeyhole, Plus, Users } from "lucide-react";
import type { SessionWorkspaceNote } from "@/app/(app)/sessions/[roomId]/session-notes-model";
import { reconcileNoteText } from "@/lib/note-text-reconcile";

type Draft = {
  key: string;
  note: SessionWorkspaceNote | null;
  title: string;
  body: string;
  visibility: "AUTHOR_PRIVATE" | "SESSION_SHARED";
  version: number;
  savedVersion: number;
  error: string | null;
  conflict: Partial<SessionWorkspaceNote> | null;
  reconciled?: boolean;
  unavailable?: boolean;
};
type Attempt = { requestId: string; version: number; title: string; body: string; visibility: string; note: SessionWorkspaceNote | null };

function draftFor(note: SessionWorkspaceNote): Draft {
  return { key: note.id, note, title: note.title || "", body: note.body, visibility: note.visibility === "AUTHOR_PRIVATE" ? "AUTHOR_PRIVATE" : "SESSION_SHARED", version: 0, savedVersion: 0, error: null, conflict: null };
}

/** A small editor over canonical Session notes. Kept mounted by the call dock,
 * so switching tools, minimizing, and reconnecting do not discard drafts. */
export function CallNotesPanel({ roomId, active, onOpenWorkspace, onAttentionChange }: {
  roomId: string; active: boolean; onOpenWorkspace: () => void; onAttentionChange?: (needed: boolean) => void;
}) {
  const [notes, setNotes] = useState<SessionWorkspaceNote[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"shared" | "private">("shared");
  const [selected, setSelected] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const [saving, setSaving] = useState<string | null>(null);
  const [draftStorageError, setDraftStorageError] = useState(false);
  const savingRef = useRef<string | null>(null);
  const attempts = useRef(new Map<string, Attempt>());
  const recoveryKey = useRef<string | null>(null);
  const accessEpoch = useRef(0);
  const rebaseAttempts = useRef(new Map<string, number>());
  const refreshSequence = useRef(0);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const clearAccess = useCallback((message: string) => {
    // Keep the previous actor's retry journal, but no longer display or save it.
    // Restoring it requires a new successful scoped read for that same actor.
    if (recoveryKey.current) {
      try {
        const pending = Object.values(draftsRef.current).filter(draft => draft.version !== draft.savedVersion || attempts.current.has(draft.key));
        if (pending.length) sessionStorage.setItem(recoveryKey.current, JSON.stringify({ version: 1, drafts: pending, attempts: [...attempts.current] }));
      } catch { setDraftStorageError(true); }
    }
    accessEpoch.current++;
    recoveryKey.current = null;
    draftsRef.current = {};
    attempts.current.clear(); rebaseAttempts.current.clear();
    savingRef.current = null;
    setSaving(null); setDrafts({}); setSelected(null); setNotes([]);
    setCanCreate(false); setLoaded(false); setLoadError(message);
  }, []);

  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(roomId)}/notes`, { cache: "no-store" });
      if (!alive.current || sequence !== refreshSequence.current) return;
      if ([401, 403, 404].includes(response.status)) {
        clearAccess(response.status === 401 ? "Sign in again to open your notes." : "This session is no longer available to this account.");
        return;
      }
      const payload = await response.json().catch(() => { throw new Error("Notes couldn’t load. Try again."); });
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Notes couldn’t load. Try again.");
      if (!alive.current || sequence !== refreshSequence.current) return;
      if (typeof payload.actorUserId !== "string" || !payload.actorUserId || !Array.isArray(payload.notes)) {
        clearAccess("Notes couldn’t be verified. Try again.");
        return;
      }
      const actorRecoveryKey = typeof payload.actorUserId === "string" ? `quipsly.call-note-drafts.v1:${payload.actorUserId}:${roomId}` : null;
      if (actorRecoveryKey && recoveryKey.current !== actorRecoveryKey) {
        accessEpoch.current++;
        // Restore only after the server confirms this actor can read this room.
        // Tab-local storage is a retry journal, never an alternate notes database.
        if (recoveryKey.current) { setDrafts({}); draftsRef.current = {}; attempts.current.clear(); rebaseAttempts.current.clear(); setSelected(null); savingRef.current = null; setSaving(null); }
        recoveryKey.current = actorRecoveryKey;
        try {
          const retained = JSON.parse(sessionStorage.getItem(recoveryKey.current) || "null");
          if (retained?.version === 1 && Array.isArray(retained.drafts)) {
            const recovered: Record<string, Draft> = {};
            for (const draft of retained.drafts) {
              if (!draft || typeof draft.key !== "string" || typeof draft.body !== "string" || typeof draft.title !== "string" || !Number.isSafeInteger(draft.version) || !Number.isSafeInteger(draft.savedVersion)) continue;
              recovered[draft.key] = draft;
            }
            if (Array.isArray(retained.attempts)) for (const entry of retained.attempts) {
              if (Array.isArray(entry) && recovered[entry[0]] && typeof entry[1]?.requestId === "string") attempts.current.set(entry[0], entry[1]);
            }
            setDrafts(current => ({ ...recovered, ...current }));
          }
        } catch { setDraftStorageError(true); }
      }
      setNotes(payload.notes);
      setCanCreate(payload.canCreate === true);
      setLoaded(true);
      setLoadError(null);
      setDrafts(current => Object.fromEntries(Object.entries(current).map(([key, draft]) => {
        const latest = payload.notes.find((note: SessionWorkspaceNote) => note.id === draft.note?.id);
        // Never replace typing, a failed request, or a pending save with a poll.
        if (latest && draft.version === draft.savedVersion && !attempts.current.has(key) && savingRef.current !== key) return [key, { ...draftFor(latest), key }];
        return [key, { ...draft, unavailable: draft.note ? !latest : payload.canCreate !== true,
          note: draft.note && latest ? { ...draft.note, canEdit: latest.canEdit, canChangeVisibility: latest.canChangeVisibility } : draft.note }];
      })));
    } catch (error) {
      if (alive.current && sequence === refreshSequence.current) setLoadError(error instanceof Error ? error.message : "Notes couldn’t load.");
    }
  }, [roomId, clearAccess]);

  useEffect(() => {
    if (!recoveryKey.current || !loaded) return;
    try {
      const pending = Object.values(drafts).filter(draft => draft.version !== draft.savedVersion || attempts.current.has(draft.key));
      if (pending.length) sessionStorage.setItem(recoveryKey.current, JSON.stringify({ version: 1, drafts: pending, attempts: [...attempts.current] }));
      else sessionStorage.removeItem(recoveryKey.current);
      setDraftStorageError(false);
    } catch { setDraftStorageError(true); }
  }, [drafts, saving, loaded]);

  const needsAttention = draftStorageError || Object.values(drafts).some(draft => Boolean(draft.error || draft.conflict));
  useEffect(() => { onAttentionChange?.(needsAttention); }, [needsAttention, onAttentionChange]);
  useEffect(() => () => onAttentionChange?.(false), [onAttentionChange]);

  useEffect(() => {
    if (!active) return;
    void refresh();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 8_000);
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [active, refresh]);

  const update = (key: string, change: Partial<Draft>) => {
    rebaseAttempts.current.delete(key);
    setDrafts(current => ({ ...current, [key]: { ...current[key], ...change, version: current[key].version + 1 } }));
  };

  const save = useCallback(async (key: string, retry = false) => {
    const draft = draftsRef.current[key];
    if (!draft || draft.unavailable || (draft.note && !draft.note.canEdit) || !recoveryKey.current || savingRef.current || draft.conflict || (!retry && draft.error) || !draft.body.trim() || draft.version === draft.savedVersion) return;
    const attempt = attempts.current.get(key) ?? { requestId: crypto.randomUUID(), version: draft.version, title: draft.title, body: draft.body, visibility: draft.note?.visibility || draft.visibility, note: draft.note };
    const attemptActor = recoveryKey.current;
    const attemptEpoch = accessEpoch.current;
    attempts.current.set(key, attempt);
    savingRef.current = key;
    setSaving(key);
    try {
      const response = await fetch(attempt.note ? `/api/notes/${encodeURIComponent(attempt.note.id)}` : `/api/sessions/${encodeURIComponent(roomId)}/notes`, {
        method: attempt.note ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientRequestId: attempt.requestId, title: attempt.title, body: attempt.body, visibility: attempt.visibility,
          kind: attempt.note?.kind || "SESSION_NOTE", ...(attempt.note ? { expectedUpdatedAt: attempt.note.updatedAt, tagIds: attempt.note.tags.map(tag => tag.id), surface: "nest-session-notes" } : {}) }),
      });
      if (!alive.current || recoveryKey.current !== attemptActor || accessEpoch.current !== attemptEpoch) return;
      if ([401, 403, 404].includes(response.status)) {
        refreshSequence.current++;
        draftsRef.current = { ...draftsRef.current, [key]: { ...draftsRef.current[key], error: "Your note access changed. Refresh before continuing." } };
        clearAccess(response.status === 401 ? "Sign in again to finish saving your notes." : "Your note access changed. Refresh before continuing.");
        return;
      }
      const payload = await response.json().catch(() => { throw new Error("Not saved yet. Your draft is still here. Try again."); });
      if (!alive.current || recoveryKey.current !== attemptActor || accessEpoch.current !== attemptEpoch) return;
      if (!response.ok || !payload.ok || !payload.note) {
        if (payload.code === "CONFLICT" && payload.current) {
          attempts.current.delete(key);
          const remote = payload.current;
          const latest = draftsRef.current[key];
          const retries = rebaseAttempts.current.get(key) || 0;
          if (latest && attempt.note && retries < 3 && remote.id === attempt.note.id
            && remote.visibility === attempt.note.visibility && remote.kind === attempt.note.kind
            && typeof remote.body === "string" && typeof remote.updatedAt === "string"
            && remote.updatedAt !== attempt.note.updatedAt) {
            const title = reconcileNoteText(attempt.note.title || "", latest.title, remote.title || "");
            const body = reconcileNoteText(attempt.note.body, latest.body, remote.body);
            if (title !== null && body !== null && title.length <= 500 && body.trim()) {
              rebaseAttempts.current.set(key, retries + 1);
              setDrafts(current => ({ ...current, [key]: { ...current[key], note: { ...attempt.note, ...remote }, title, body,
                version: current[key].version + 1, error: null, conflict: null, reconciled: true } }));
              return;
            }
          }
          setDrafts(current => ({ ...current, [key]: { ...current[key], error: null, conflict: remote } }));
          return;
        }
        throw new Error(payload.error || "Not saved yet. Your draft is still here.");
      }
      const note = { ...attempt.note, ...payload.note } as SessionWorkspaceNote;
      attempts.current.delete(key);
      rebaseAttempts.current.delete(key);
      setNotes(current => [note, ...current.filter(item => item.id !== note.id)]);
      setDrafts(current => {
        const latest = current[key];
        // A retry can read a subsequent collaborator revision. Retain the draft
        // for comparison rather than claiming those other words were our save.
        const replayChanged = payload.idempotentReplay && (note.body !== attempt.body.trim() || (note.title || "") !== attempt.title.replace(/\s+/g, " ").trim());
        return { ...current, [key]: { ...latest, note,
          savedVersion: replayChanged ? latest.savedVersion : attempt.version,
          conflict: replayChanged ? note : null, error: null } };
      });
    } catch (error) {
      if (alive.current && recoveryKey.current === attemptActor && accessEpoch.current === attemptEpoch) setDrafts(current => ({ ...current, [key]: { ...current[key], error: error instanceof Error ? error.message : "Not saved yet. Your draft is still here." } }));
    } finally {
      if (accessEpoch.current === attemptEpoch) {
        savingRef.current = null;
        if (alive.current) setSaving(null);
      }
    }
  }, [roomId, clearAccess]);

  useEffect(() => {
    // Save even when another tool is visible, and drain drafts sequentially.
    const next = Object.values(drafts).find(draft => !draft.unavailable && (!draft.note || draft.note.canEdit) && draft.version !== draft.savedVersion && draft.body.trim() && !draft.error && !draft.conflict);
    if (!next || saving) return;
    const timer = setTimeout(() => void save(next.key), 800);
    return () => clearTimeout(timer);
  }, [drafts, saving, save]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (Object.values(draftsRef.current).some(draft => draft.version !== draft.savedVersion && (draft.body.trim() || draft.title.trim()))) {
        event.preventDefault(); event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);

  function newNote() {
    const key = crypto.randomUUID();
    setDrafts(current => ({ ...current, [key]: { key, note: null, title: "", body: "", visibility: filter === "private" ? "AUTHOR_PRIVATE" : "SESSION_SHARED", version: 0, savedVersion: 0, error: null, conflict: null } }));
    setSelected(key);
  }
  function openNote(note: SessionWorkspaceNote) {
    const retained = Object.values(draftsRef.current).find(draft => draft.note?.id === note.id);
    if (retained) { setSelected(retained.key); return; }
    setDrafts(current => ({ ...current, [note.id]: draftFor(note) })); setSelected(note.id);
  }
  const draft = selected && !drafts[selected]?.unavailable ? drafts[selected] : null;
  const visibleNotes = notes.filter(note => filter === "private" ? note.visibility === "AUTHOR_PRIVATE" : note.visibility !== "AUTHOR_PRIVATE");
  const readOnly = Boolean(draft?.note && !draft.note.canEdit);
  return <div className="flex min-h-0 flex-col gap-4">
    {draftStorageError ? <p role="alert" className="text-sm text-destructive">This browser couldn’t keep a recovery copy. Wait for “Saved” before closing.</p> : null}
    {loadError ? <div role="alert" className="rounded-xl border border-destructive/30 p-3 text-sm">{loadError}<button type="button" onClick={() => void refresh()} className="ml-2 underline">Retry</button></div> : null}
    {draft ? <>
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => setSelected(null)} className="inline-flex min-h-11 items-center gap-2 text-sm font-medium"><ArrowLeft size={17} />All notes</button>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">{(draft.note?.visibility || draft.visibility) === "AUTHOR_PRIVATE" ? <><LockKeyhole size={14} />Only you</> : <><Users size={14} />{draft.note?.visibility === "PROJECT_TEAM" ? "Project team" : "Shared"}</>}</span>
      </div>
      <label className="sr-only" htmlFor={`call-note-title-${roomId}`}>Note title</label>
      <input id={`call-note-title-${roomId}`} value={draft.title} readOnly={readOnly} maxLength={500} placeholder="Untitled note" onChange={event => update(draft.key, { title: event.target.value })} className="min-h-11 w-full min-w-0 border-0 bg-transparent text-xl font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary" />
      <label className="sr-only" htmlFor={`call-note-body-${roomId}`}>Note text</label>
      <textarea id={`call-note-body-${roomId}`} value={draft.body} readOnly={readOnly} maxLength={20_000} placeholder="Write a thought, a question, or your next step…" onChange={event => update(draft.key, { body: event.target.value })} className="min-h-56 w-full resize-y rounded-xl border border-border bg-card p-3 text-base leading-7 outline-none focus-visible:ring-2 focus-visible:ring-primary" />
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground" role="status">
        {readOnly ? "Read-only note" : saving === draft.key ? <span className="inline-flex items-center gap-1"><LoaderCircle size={14} className="animate-spin" />Saving…</span> : draft.error ? "Not saved" : draft.conflict ? "Changed elsewhere" : draft.version === draft.savedVersion ? <span className="inline-flex items-center gap-1"><Check size={14} />{draft.note ? "Saved" : "Saves as you write"}</span> : draft.body.trim() ? "Saving soon…" : "Add note text to save"}
        {draft.note ? <span>{draft.note.author?.label}</span> : null}
      </div>
      {draft.reconciled && !draft.conflict ? <p className="text-xs text-muted-foreground">Includes your changes and the latest shared edits.</p> : null}
      {draft.error ? <div role="alert" className="rounded-xl border border-destructive/30 p-3 text-sm"><p>{draft.error}</p>{!readOnly ? <button type="button" onClick={() => void save(draft.key, true)} className="mt-2 min-h-11 rounded-xl border border-border px-3 font-semibold">Retry save</button> : null}</div> : null}
      {draft.conflict && !readOnly ? <section className="rounded-xl border border-border p-3 text-sm" aria-label="Note updated elsewhere">
        <p className="font-semibold">Someone updated this note. Your words are still above.</p>
        <p className="mt-3 font-semibold">Latest saved version</p><p className="mt-1 whitespace-pre-wrap break-words">{draft.conflict.title}</p><p className="mt-2 max-h-44 overflow-y-auto whitespace-pre-wrap break-words">{draft.conflict.body}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => { const key = crypto.randomUUID(); setDrafts(current => ({ ...current, [draft.key]: { ...draftFor({ ...draft.note, ...draft.conflict } as SessionWorkspaceNote), key: draft.key }, [key]: { ...draft, key, note: null, visibility: "AUTHOR_PRIVATE", conflict: null, error: null, version: 1, savedVersion: 0 } })); setSelected(key); }} className="min-h-11 rounded-xl bg-primary px-3 font-semibold text-primary-foreground">Save my draft as a private copy</button>
          <button type="button" onClick={() => setDrafts(current => ({ ...current, [draft.key]: { ...draft, note: { ...draft.note, ...draft.conflict } as SessionWorkspaceNote, conflict: null, error: null, version: draft.version + 1 } }))} className="min-h-11 rounded-xl border border-border px-3 font-semibold">Save my text to this note</button>
        </div>
      </section> : null}
    </> : <>
      <div className="flex items-center gap-2">
        <div className="flex flex-1 rounded-xl bg-muted p-1" role="group" aria-label="Note audience">
          <button type="button" aria-pressed={filter === "shared"} onClick={() => setFilter("shared")} className={`min-h-10 flex-1 rounded-lg px-2 text-sm font-medium ${filter === "shared" ? "bg-card shadow-sm" : ""}`}>Shared</button>
          <button type="button" aria-pressed={filter === "private"} onClick={() => setFilter("private")} className={`min-h-10 flex-1 rounded-lg px-2 text-sm font-medium ${filter === "private" ? "bg-card shadow-sm" : ""}`}>Only me</button>
        </div>
        {canCreate ? <button type="button" onClick={newNote} aria-label="New note" className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><Plus size={18} /></button> : null}
      </div>
      {!loaded && !loadError ? <p role="status" className="text-sm text-muted-foreground">Loading notes…</p> : null}
      {Object.values(drafts).filter(item => !item.unavailable && !item.note && (item.title || item.body)).map(item => <button key={item.key} type="button" onClick={() => setSelected(item.key)} className="rounded-xl border border-border p-3 text-left"><span className="block text-sm font-semibold">{item.title || "Untitled draft"}</span><span className="text-xs text-muted-foreground">{item.error ? "Retry needed" : "Draft"} · {item.visibility === "AUTHOR_PRIVATE" ? "Only you" : "Shared"}</span></button>)}
      {loaded && !visibleNotes.length ? <div className="py-6 text-center"><p className="text-sm font-medium">{filter === "shared" ? "A place to think together" : "Your private notes"}</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{filter === "shared" ? "Keep questions and next steps here during your conversation." : "Only you can see notes you create here."}</p>{canCreate ? <button type="button" onClick={newNote} className="mt-3 min-h-11 rounded-xl border border-border px-4 text-sm font-semibold">Write a note</button> : null}</div> : null}
      {visibleNotes.map(note => <button key={note.id} type="button" onClick={() => openNote(note)} className="rounded-xl border border-border bg-card p-3 text-left hover:bg-muted">
        <span className="block truncate text-sm font-semibold">{note.title || "Untitled note"}</span><span className="mt-1 line-clamp-2 block whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{note.body}</span><span className="mt-2 block text-xs text-muted-foreground">{note.author.label}{Object.values(drafts).some(item => item.note?.id === note.id && item.version !== item.savedVersion) ? " · Unsaved changes" : ""}</span>
      </button>)}
    </>}
    <Link href={`/sessions/${encodeURIComponent(roomId)}?mode=notes`} onClick={onOpenWorkspace} className="mt-2 min-h-11 py-3 text-sm text-muted-foreground underline underline-offset-4">Open full notes workspace</Link>
  </div>;
}
