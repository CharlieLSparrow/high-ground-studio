"use client";

import { transcriptSourceHref } from "@/lib/session-work-source-link";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Clapperboard,
  LockKeyhole,
  MessageSquarePlus,
  NotebookPen,
  Play,
  ShieldCheck,
  Users,
} from "lucide-react";

import { TagSearchChips } from "@/components/tag-search-chips";
import { TranscriptSpeakerEvidenceBadge } from "@/components/transcript-speaker-evidence-badge";

import type { SessionTaxonomy } from "./session-review-client";
import {
  EDITABLE_SESSION_NOTE_KINDS,
  noteAppearsInView,
  SESSION_NOTE_VIEWS,
  SESSION_NOTE_VISIBILITIES,
  sessionNoteKindLabel,
  sessionNoteCreationDefaults,
  sessionNotesHref,
  sessionNoteViewCounts,
  sessionNoteVisibilityLabel,
  type EditableSessionNoteKind,
  type SessionNoteView,
  type SessionNoteVisibility,
  type SessionWorkspaceNote,
} from "./session-notes-model";
import { timestampForSeconds } from "./session-review-model";
import { isGeneratedSessionNoteKind } from "@/lib/session-note-contract";
import { reconcileNoteText } from "@/lib/note-text-reconcile";

function NoteAudienceIcon({ visibility }: { visibility: SessionNoteVisibility }) {
  if (visibility === "AUTHOR_PRIVATE") return <LockKeyhole className="h-4 w-4" aria-hidden="true" />;
  if (visibility === "CLIENT_SAFE") return <ShieldCheck className="h-4 w-4" aria-hidden="true" />;
  if (visibility === "PROJECT_TEAM") return <Clapperboard className="h-4 w-4" aria-hidden="true" />;
  return <Users className="h-4 w-4" aria-hidden="true" />;
}

function audienceHelp(visibility: SessionNoteVisibility) {
  if (visibility === "AUTHOR_PRIVATE") return "Only you.";
  if (visibility === "SESSION_SHARED") return "Everyone in this Session.";
  if (visibility === "CLIENT_SAFE") return "Everyone in this Session; available in client follow-up.";
  return "Your project team.";
}

function editableKinds(canUseProjectTeamNotes: boolean) {
  return EDITABLE_SESSION_NOTE_KINDS.filter((kind) => kind !== "PRODUCTION" || canUseProjectTeamNotes);
}

function editableVisibilities(canUseProjectTeamNotes: boolean) {
  return SESSION_NOTE_VISIBILITIES.filter((visibility) => (
    visibility !== "PROJECT_TEAM" || canUseProjectTeamNotes
  ));
}

export function SessionNotesWorkspace({
  roomId,
  initialNotes,
  activeView,
  taxonomy,
  canUseProjectTeamNotes,
}: {
  roomId: string;
  initialNotes: SessionWorkspaceNote[];
  activeView: SessionNoteView;
  taxonomy: SessionTaxonomy | null;
  canUseProjectTeamNotes: boolean;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [undoEdit, setUndoEdit] = useState<{ previous: SessionWorkspaceNote; savedAt: string } | null>(null);
  const createForm = useRef<HTMLFormElement>(null);
  const createDisclosure = useRef<HTMLDetailsElement>(null);
  const createAttempt = useRef<{payload: string; requestId: string} | null>(null);
  const editAttempts = useRef(new Map<string, { payload: string; requestId: string; submission: string; base: SessionWorkspaceNote }>());
  const [editDrafts, setEditDrafts] = useState<Record<string, { base: SessionWorkspaceNote; title: string; body: string; kind: string; visibility: string }>>({});
  const [creationDefaults, setCreationDefaults] = useState(() => sessionNoteCreationDefaults(activeView, canUseProjectTeamNotes));
  const [draftVisibility, setDraftVisibility] = useState(creationDefaults.visibility);
  const [draftKind, setDraftKind] = useState(creationDefaults.kind);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => setNotes(initialNotes), [initialNotes]);
  useEffect(() => {
    const form = createForm.current;
    const draft = form ? new FormData(form) : null;
    // Switching filters must not silently change the audience of an existing draft.
    if (String(draft?.get("body") ?? "").trim() || String(draft?.get("title") ?? "").trim()) return;
    const defaults = sessionNoteCreationDefaults(activeView, canUseProjectTeamNotes);
    setCreationDefaults(defaults);
    setDraftVisibility(defaults.visibility);
    setDraftKind(defaults.kind);
  }, [activeView, canUseProjectTeamNotes]);

  const counts = sessionNoteViewCounts(notes);
  const searchTerms = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const visibleNotes = notes.filter((note) => {
    if (!noteAppearsInView(note, activeView)) return false;
    const text = [note.title, note.body, note.author.label, ...note.tags.map(tag => tag.label)].join(" ").toLocaleLowerCase();
    return searchTerms.every(term => text.includes(term));
  });

  function replaceNote(note: SessionWorkspaceNote) {
    setNotes((current) => [
      note,
      ...current.filter((candidate) => candidate.id !== note.id),
    ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)));
  }

  async function createNote(formData: FormData) {
    setBusyId("create");
    setNotice(null);
    try {
      const content = {
        title: String(formData.get("title") || ""),
        body: String(formData.get("body") || ""),
        kind: String(formData.get("kind") || creationDefaults.kind),
        visibility: String(formData.get("visibility") || draftVisibility),
      };
      const payloadKey = JSON.stringify({roomId, ...content});
      if (createAttempt.current?.payload !== payloadKey) createAttempt.current = {payload: payloadKey, requestId: crypto.randomUUID()};
      const response = await fetch(`/api/sessions/${encodeURIComponent(roomId)}/notes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientRequestId: createAttempt.current.requestId,
          ...content,
        }),
      });
      const payload = await response.json() as {
        ok?: boolean;
        error?: string;
        idempotentReplay?: boolean;
        note?: SessionWorkspaceNote;
      };
      if (!response.ok || !payload.ok || !payload.note) {
        throw new Error(payload.error || "The Session note was not saved.");
      }
      replaceNote(payload.note);
      setDraftTitle("");
      setDraftBody("");
      const nextDefaults = sessionNoteCreationDefaults(activeView, canUseProjectTeamNotes);
      setCreationDefaults(nextDefaults);
      setDraftVisibility(nextDefaults.visibility);
      setDraftKind(nextDefaults.kind);
      createAttempt.current = null;
      if (createDisclosure.current) createDisclosure.current.open = false;
      const appearsHere = noteAppearsInView(payload.note, activeView);
      setNotice(
        `${payload.idempotentReplay ? "This note was already saved." : "Note saved."} ${audienceHelp(payload.note.visibility)}`
        + `${appearsHere ? "" : " Open All notes to see it."}`
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The Session note was not saved.");
    } finally {
      setBusyId(null);
    }
  }

  async function saveNote(note: SessionWorkspaceNote, formData: FormData, restoring = false) {
    setBusyId(note.id);
    setNotice(null);
    try {
      let base = note;
      let title = String(formData.get("title") || "");
      let body = String(formData.get("body") || "");
      const kind = String(formData.get("kind") || note.kind);
      const visibility = String(formData.get("visibility") || note.visibility);
      const submission = JSON.stringify({ updatedAt: note.updatedAt, title, body, kind, visibility, restoring });
      const interrupted = editAttempts.current.get(note.id);
      if (interrupted?.submission === submission) {
        base = interrupted.base;
        const retainedCommand = JSON.parse(interrupted.payload);
        title = retainedCommand.title; body = retainedCommand.body;
      }
      for (let rebases = 0; ; rebases++) {
        const command = JSON.stringify({ title, body, kind, visibility, tagIds: base.tags.map(tag => tag.id), expectedUpdatedAt: base.updatedAt });
        const retained = editAttempts.current.get(note.id);
        const attempt = retained?.payload === command && retained.submission === submission ? retained : { payload: command, requestId: crypto.randomUUID(), submission, base };
        editAttempts.current.set(note.id, attempt);
        const response = await fetch(`/api/notes/${encodeURIComponent(note.id)}`, {
          method: "PATCH", headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...JSON.parse(command), clientRequestId: attempt.requestId }),
        });
        const payload = await response.json().catch(() => { throw new Error("Not saved yet. Your draft is still here. Try again."); }) as {
          ok?: boolean; error?: string; code?: string; idempotentReplay?: boolean;
          note?: SessionWorkspaceNote; current?: SessionWorkspaceNote;
        };
        if (!response.ok || !payload.ok || !payload.note) {
          const remote = payload.current;
          if (!restoring && payload.code === "CONFLICT" && remote?.id === note.id && rebases < 3
            && remote.kind === base.kind && remote.visibility === base.visibility
            && kind === base.kind && visibility === base.visibility
            && typeof remote.body === "string" && typeof remote.updatedAt === "string" && remote.updatedAt !== base.updatedAt) {
            const mergedTitle = reconcileNoteText(base.title || "", title, remote.title || "");
            const mergedBody = reconcileNoteText(base.body, body, remote.body);
            if (mergedTitle !== null && mergedTitle.length <= 500 && mergedBody !== null && mergedBody.trim()) {
              title = mergedTitle; body = mergedBody; base = { ...base, ...remote };
              editAttempts.current.delete(note.id);
              continue;
            }
          }
          if (response.status === 409) editAttempts.current.delete(note.id);
          throw new Error(payload.error || "The note was not saved. Your draft is still here.");
        }
        editAttempts.current.delete(note.id);
        replaceNote({ ...base, ...payload.note });
        setEditDrafts(current => { const next = { ...current }; delete next[note.id]; return next; });
        const subsequentEdit = payload.idempotentReplay && (payload.note.body !== body.trim() || (payload.note.title || "") !== title.replace(/\s+/g, " ").trim());
        setUndoEdit(restoring || subsequentEdit ? null : { previous: base, savedAt: payload.note.updatedAt });
        setNotice(restoring ? "Previous version restored." : subsequentEdit ? "Your edit was already saved. Showing the latest shared version." : rebases ? "Note updated, including the latest shared edits." : "Note updated.");
        break;
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The Session note was not saved.");
    } finally {
      setBusyId(null);
    }
  }

  async function undoLastEdit() {
    if (!undoEdit) return;
    const current = notes.find((note) => note.id === undoEdit.previous.id);
    if (!current) return;
    const form = new FormData();
    form.set("title", undoEdit.previous.title || "");
    form.set("body", undoEdit.previous.body);
    form.set("kind", undoEdit.previous.kind);
    form.set("visibility", undoEdit.previous.visibility);
    // Use the saved edit's version, not a later refreshed value. A collaborator's
    // intervening edit must produce a conflict rather than be silently undone.
    await saveNote({ ...current, updatedAt: undoEdit.savedAt }, form, true);
  }

  async function saveNoteTags(note: SessionWorkspaceNote, formData: FormData) {
    setBusyId(note.id);
    setNotice(null);
    try {
      const tagIds = formData.getAll("noteTagId").map(String);
      const response = await fetch("/api/work/tags", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entityKind: "note",
          entityId: note.id,
          tagIds,
          expectedUpdatedAt: note.updatedAt,
        }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; updatedAt?: string };
      if (!response.ok || !payload.ok || !payload.updatedAt) {
        throw new Error(payload.error || "The note tags were not saved.");
      }
      const catalog = taxonomy?.catalog ?? [];
      replaceNote({
        ...note,
        tags: catalog
          .filter((tag) => tagIds.includes(tag.id))
          .map(({ id, label, slug, hexColor }) => ({ id, label, slug, hexColor })),
        updatedAt: payload.updatedAt,
      });
      setNotice("Tags saved.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The note tags were not saved.");
    } finally {
      setBusyId(null);
    }
  }

  async function createNoteTag(note: SessionWorkspaceNote, formData: FormData) {
    setBusyId(note.id);
    setNotice(null);
    try {
      const response = await fetch("/api/work/tags", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entityKind: "note",
          entityId: note.id,
          operation: "CREATE_AND_ASSIGN",
          label: String(formData.get("label") || ""),
          expectedUpdatedAt: note.updatedAt,
        }),
      });
      const payload = await response.json() as {
        ok?: boolean;
        error?: string;
        updatedAt?: string;
        tag?: { id: string; label: string; slug: string };
      };
      if (!response.ok || !payload.ok || !payload.updatedAt || !payload.tag) {
        throw new Error(payload.error || "The reusable tag was not created.");
      }
      replaceNote({
        ...note,
        tags: [...note.tags.filter((tag) => tag.id !== payload.tag!.id), payload.tag],
        updatedAt: payload.updatedAt,
      });
      setNotice(`#${payload.tag.label} created and added to this note.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The reusable tag was not created.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border bg-card p-4 text-card-foreground" aria-labelledby="session-notes-heading">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-card p-2 text-muted-foreground"><NotebookPen aria-hidden="true" /></span>
            <div>
              <h2 id="session-notes-heading" className="text-xl font-semibold">{notes.length} note{notes.length === 1 ? "" : "s"}</h2>
            </div>
          </div>
        </div>

        <nav aria-label="Session note views" className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {SESSION_NOTE_VIEWS.filter(view => ["all", "private", "shared"].includes(view.id) || view.id === activeView || counts[view.id] > 0).map((view) => (
            <Link
              key={view.id}
              href={sessionNotesHref(roomId, view.id)}
              aria-current={activeView === view.id ? "page" : undefined}
              className={`inline-flex min-h-11 shrink-0 items-center rounded-full border px-3 py-2 text-xs font-black ${
                activeView === view.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground"
              }`}
            >
              {view.label}<span className="ml-2 rounded-full bg-black/10 px-1.5 py-0.5 text-[10px]">{counts[view.id]}</span>
            </Link>
          ))}
        </nav>
        <div className="mt-3 flex items-end gap-2">
          <label className="min-w-0 flex-1 text-sm font-medium">Find a note
            <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search notes, people, or tags"
              className="mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-foreground" />
          </label>
          {search ? <button type="button" onClick={() => setSearch("")} className="min-h-11 rounded-xl border border-border px-3 text-sm">Clear search</button> : null}
        </div>
        {searchTerms.length > 0 ? <p role="status" className="mt-2 text-sm text-muted-foreground">{visibleNotes.length} matching note{visibleNotes.length === 1 ? "" : "s"}</p> : null}

        {notice ? <div role="status" className="mt-4 rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground">
          <p>{notice}</p>
          {undoEdit ? <button type="button" disabled={busyId !== null} onClick={() => void undoLastEdit()}
            className="mt-1 min-h-11 font-semibold underline underline-offset-4 disabled:opacity-50">Undo last edit</button> : null}
        </div> : null}

        <details ref={createDisclosure} open={initialNotes.length === 0 || undefined} className="mt-3 rounded-xl border border-border bg-background p-3">
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">Add a note</summary>
        <form ref={createForm} onSubmit={event => { event.preventDefault(); void createNote(new FormData(event.currentTarget)); }} className="mt-3 grid gap-3" aria-label="New session note">
          <fieldset disabled={busyId === "create"} className="contents">
          <label className="text-[10px] font-black uppercase tracking-wide text-foreground">Note<textarea name="body" required maxLength={20_000} rows={4} value={draftBody} onChange={event => setDraftBody(event.target.value)} placeholder="Write a note…" className="mt-1 block w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold normal-case tracking-normal" /></label>
          <label className="text-[10px] font-black uppercase tracking-wide text-foreground">Title <span className="normal-case tracking-normal text-muted-foreground">(optional)</span><input name="title" maxLength={500} value={draftTitle} onChange={event => setDraftTitle(event.target.value)} placeholder="Add a title" className="mt-1 block min-h-11 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold normal-case tracking-normal" /></label>
          <details className="rounded-xl border border-border bg-muted/45 p-3">
            <summary className="cursor-pointer text-xs font-black text-foreground">Note type and sharing</summary>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="text-[10px] font-black uppercase tracking-wide text-foreground">
                Note type
                <select name="kind" value={draftKind} onChange={event => setDraftKind(event.target.value as EditableSessionNoteKind)} className="mt-1 block min-h-11 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold normal-case tracking-normal">
                  {editableKinds(canUseProjectTeamNotes).map((kind) => <option key={kind} value={kind}>{sessionNoteKindLabel(kind)}</option>)}
                </select>
              </label>
              <label className="text-[10px] font-black uppercase tracking-wide text-foreground">
                Who can read it
                <select name="visibility" value={draftVisibility} onChange={event => setDraftVisibility(event.target.value as SessionNoteVisibility)} className="mt-1 block min-h-11 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold normal-case tracking-normal">
                  {editableVisibilities(canUseProjectTeamNotes).map((visibility) => <option key={visibility} value={visibility}>{sessionNoteVisibilityLabel(visibility)}</option>)}
                </select>
              </label>
            </div>
          </details>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-semibold leading-5 text-muted-foreground" data-testid="new-note-audience">{audienceHelp(draftVisibility)}</p>
            <button type="submit" disabled={busyId === "create"} className="min-h-11 rounded-full bg-primary px-5 py-2 text-xs font-black text-primary-foreground disabled:opacity-50">{busyId === "create" ? "Saving…" : "Save note"}</button>
          </div>
          </fieldset>
        </form>
        </details>
      </section>

      {visibleNotes.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {visibleNotes.map((note) => {
            const editor = editDrafts[note.id] || { base: note, ...note };
            return (
            <article id={`session-note-${note.id}`} key={note.id} tabIndex={-1} className="scroll-mt-24 rounded-2xl border border-border bg-card p-5 shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">{sessionNoteKindLabel(note.kind)} · {note.originLabel}</p>
                  <h3 className="mt-1 font-serif text-2xl font-black text-foreground">{note.title || sessionNoteKindLabel(note.kind)}</h3>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-[10px] font-black uppercase text-foreground">
                  <NoteAudienceIcon visibility={note.visibility} />{sessionNoteVisibilityLabel(note.visibility)}
                </span>
              </div>
              <p className="mt-4 whitespace-pre-wrap text-sm font-semibold leading-6 text-foreground">{note.body}</p>
              {note.sourceAnchor ? (
                <div className="mt-4 rounded-xl border border-border bg-muted/70 p-3">
                  <p className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">Transcript source</p>
                  <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-foreground">{note.sourceAnchor.effectiveSpeakerLabelSnapshot ? `${note.sourceAnchor.effectiveSpeakerLabelSnapshot}: ` : ""}{note.sourceAnchor.effectiveTextSnapshot}</p>
                  <TranscriptSpeakerEvidenceBadge authority={note.sourceAnchor.speakerAuthority} />
                  <Link href={transcriptSourceHref(note.sourceAnchor)} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs font-black text-foreground hover:underline">
                    <Play size={14} aria-hidden="true" />Return to {timestampForSeconds(note.sourceAnchor.startSeconds)}–{timestampForSeconds(note.sourceAnchor.endSeconds)}
                  </Link>
                </div>
              ) : null}
              {!note.sourceAnchor && note.sourceHref ? <Link href={note.sourceHref} className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold underline underline-offset-4">
                <Play size={14} aria-hidden="true" />Open source transcript
              </Link> : null}
              {note.lastMergedSource ? (
                <div className="mt-4 rounded-xl border border-border bg-muted/70 p-3">
                  <p className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">Latest merged transcript source</p>
                  <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-foreground">{note.lastMergedSource.sourceAnchor.effectiveSpeakerLabelSnapshot ? `${note.lastMergedSource.sourceAnchor.effectiveSpeakerLabelSnapshot}: ` : ""}{note.lastMergedSource.sourceAnchor.effectiveTextSnapshot}</p>
                  <TranscriptSpeakerEvidenceBadge authority={note.lastMergedSource.sourceAnchor.speakerAuthority} />
                  <Link href={transcriptSourceHref(note.lastMergedSource.sourceAnchor)} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs font-black text-foreground hover:underline">
                    <Play size={14} aria-hidden="true" />Return to merged source at {timestampForSeconds(note.lastMergedSource.sourceAnchor.startSeconds)}–{timestampForSeconds(note.lastMergedSource.sourceAnchor.endSeconds)}
                  </Link>
                </div>
              ) : null}
              <TagSearchChips tags={note.tags} label={`${note.title || "Session note"} tags`} />
              <div className="mt-4 rounded-xl border border-border bg-muted/45 p-3 text-xs font-semibold leading-5 text-foreground">
                <p>{note.author.isCurrentActor ? "By you" : `By ${note.author.label}`} · {audienceHelp(note.visibility)} · {note.revisionCount} version{note.revisionCount === 1 ? "" : "s"} · updated {new Date(note.updatedAt).toLocaleString()}</p>
              </div>

              {note.canEdit ? (
                <details className="mt-4 rounded-xl border border-border bg-muted/35 p-3">
                  <summary className="cursor-pointer text-xs font-black text-foreground">Edit note, audience, and tags</summary>
                  <form key={`${note.id}-${editor.base.updatedAt}`} onChange={event => {
                    const form = new FormData(event.currentTarget);
                    setEditDrafts(current => ({ ...current, [note.id]: {
                      base: current[note.id]?.base || note,
                      title: String(form.get("title") || ""), body: String(form.get("body") || ""),
                      kind: String(form.get("kind") || note.kind), visibility: String(form.get("visibility") || note.visibility),
                    } }));
                  }} onSubmit={event => { event.preventDefault(); void saveNote(editor.base, new FormData(event.currentTarget)); }} className="mt-4 grid gap-3">
                    <fieldset disabled={busyId === note.id} className="contents">
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="text-[10px] font-black uppercase tracking-wide text-foreground">
                        Note type
                        {isGeneratedSessionNoteKind(note.kind) ? <>
                          <input type="hidden" name="kind" value={note.kind} />
                          <span className="mt-1 block py-3 text-sm font-semibold normal-case tracking-normal">{sessionNoteKindLabel(note.kind)}</span>
                        </> : <select name="kind" defaultValue={editor.kind} className="mt-1 block min-h-11 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold normal-case tracking-normal">
                          {editableKinds(canUseProjectTeamNotes).map((kind) => <option key={kind} value={kind}>{sessionNoteKindLabel(kind)}</option>)}
                        </select>}
                      </label>
                      {note.canChangeVisibility !== false ? (
                        <label className="text-[10px] font-black uppercase tracking-wide text-foreground">
                          Who can read it
                          <select name="visibility" defaultValue={editor.visibility} className="mt-1 block min-h-11 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold normal-case tracking-normal">
                            {editableVisibilities(canUseProjectTeamNotes).map((visibility) => <option key={visibility} value={visibility}>{sessionNoteVisibilityLabel(visibility)}</option>)}
                          </select>
                        </label>
                      ) : (
                        <div className="text-[10px] font-black uppercase tracking-wide text-foreground">
                          Shared with
                          <input type="hidden" name="visibility" value={note.visibility} />
                          <p className="mt-1 flex min-h-11 items-center rounded-lg border border-border bg-muted px-3 py-2 text-sm font-semibold normal-case tracking-normal text-foreground">{sessionNoteVisibilityLabel(note.visibility)}</p>
                        </div>
                      )}
                    </div>
                    <label className="text-[10px] font-black uppercase tracking-wide text-foreground">Title<input name="title" maxLength={500} defaultValue={editor.title ?? ""} className="mt-1 block min-h-11 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold normal-case tracking-normal" /></label>
                    <label className="text-[10px] font-black uppercase tracking-wide text-foreground">Note<textarea name="body" required maxLength={20_000} defaultValue={editor.body} rows={6} className="mt-1 block w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold normal-case tracking-normal" /></label>
                    <button type="submit" disabled={busyId === note.id} className="min-h-11 justify-self-start rounded-full bg-primary px-4 py-2 text-xs font-black text-primary-foreground disabled:opacity-50">Save revision</button>
                    </fieldset>
                  </form>

                  {taxonomy?.canManageVocabulary ? (
                    <div className="mt-5 border-t border-border pt-4">
                      <form onSubmit={event => { event.preventDefault(); void saveNoteTags(note, new FormData(event.currentTarget)); }}>
                        <fieldset className="grid gap-2 sm:grid-cols-2">
                          <legend className="mb-2 text-[10px] font-black uppercase tracking-wide text-foreground">Canonical {taxonomy.project.name} tags</legend>
                          {taxonomy.catalog.map((tag) => (
                            <label key={tag.id} className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold text-foreground">
                              <input name="noteTagId" value={tag.id} type="checkbox" defaultChecked={note.tags.some((selected) => selected.id === tag.id)} />#{tag.label}
                            </label>
                          ))}
                        </fieldset>
                        <button type="submit" disabled={busyId === note.id} className="mt-3 min-h-11 rounded-full border border-border bg-card px-4 py-2 text-xs font-black text-foreground disabled:opacity-50">Save tags</button>
                      </form>
                      <form onSubmit={event => { event.preventDefault(); void createNoteTag(note, new FormData(event.currentTarget)); }} className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <label className="flex-1 text-[10px] font-black uppercase tracking-wide text-foreground">New reusable tag<input name="label" required maxLength={80} placeholder="e.g. Opening craft" className="mt-1 block min-h-11 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold normal-case tracking-normal" /></label>
                        <button type="submit" disabled={busyId === note.id} className="min-h-11 self-end rounded-full border border-border bg-muted px-4 py-2 text-xs font-black text-foreground disabled:opacity-50">Create and attach</button>
                      </form>
                    </div>
                  ) : null}
                </details>
              ) : (
                <p className="mt-4 text-xs font-bold text-slate-600">Read-only</p>
              )}
            </article>
          ); })}
        </div>
      ) : (
        <section className="rounded-2xl border border-dashed border-border bg-card/65 p-6 text-center" aria-label="No notes in this view">
          <MessageSquarePlus className="mx-auto text-muted-foreground" aria-hidden="true" />
          <h3 className="mt-3 font-serif text-2xl font-black text-foreground">{searchTerms.length ? "No matching notes" : "No notes in this view"}</h3>
          <p className="mt-2 text-sm font-semibold text-muted-foreground">{searchTerms.length ? "Try another word or clear the search." : "Add the first note for this Session."}</p>
        </section>
      )}
    </div>
  );
}
