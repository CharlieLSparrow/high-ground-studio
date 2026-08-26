"use client";

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
  sessionNotesHref,
  sessionNoteViewCounts,
  sessionNoteVisibilityLabel,
  type EditableSessionNoteKind,
  type SessionNoteView,
  type SessionNoteVisibility,
  type SessionWorkspaceNote,
} from "./session-notes-model";
import { timestampForSeconds } from "./session-review-model";

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
  const createForm = useRef<HTMLFormElement>(null);

  useEffect(() => setNotes(initialNotes), [initialNotes]);

  const counts = sessionNoteViewCounts(notes);
  const visibleNotes = notes.filter((note) => noteAppearsInView(note, activeView));

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
      const response = await fetch(`/api/sessions/${encodeURIComponent(roomId)}/notes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientRequestId: crypto.randomUUID(),
          title: String(formData.get("title") || ""),
          body: String(formData.get("body") || ""),
          kind: String(formData.get("kind") || "SESSION_NOTE"),
          visibility: String(formData.get("visibility") || "SESSION_SHARED"),
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
      createForm.current?.reset();
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

  async function saveNote(note: SessionWorkspaceNote, formData: FormData) {
    setBusyId(note.id);
    setNotice(null);
    try {
      const response = await fetch(`/api/notes/${encodeURIComponent(note.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: String(formData.get("title") || ""),
          body: String(formData.get("body") || ""),
          kind: String(formData.get("kind") || note.kind),
          visibility: String(formData.get("visibility") || note.visibility),
          expectedUpdatedAt: note.updatedAt,
        }),
      });
      const payload = await response.json() as {
        ok?: boolean;
        error?: string;
        note?: {
          title: string | null;
          body: string;
          kind: SessionWorkspaceNote["kind"];
          visibility: SessionNoteVisibility;
          updatedAt: string;
          revisionCount: number;
          tags: SessionWorkspaceNote["tags"];
        };
      };
      if (!response.ok || !payload.ok || !payload.note) {
        throw new Error(payload.error || "The Session note was not saved.");
      }
      replaceNote({ ...note, ...payload.note });
      setNotice("Note updated. Its earlier versions remain available in the history.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The Session note was not saved.");
    } finally {
      setBusyId(null);
    }
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
          .map(({ id, label, slug }) => ({ id, label, slug })),
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
      <section className="rounded-2xl border border-orange-200 bg-orange-50/45 p-5" aria-labelledby="session-notes-heading">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-white p-2 text-orange-700"><NotebookPen aria-hidden="true" /></span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-orange-800">Session notes</p>
              <h2 id="session-notes-heading" className="mt-1 font-serif text-3xl font-black text-[#3d3122]">{notes.length} note{notes.length === 1 ? "" : "s"}</h2>
              <p className="mt-1 max-w-3xl text-xs font-semibold leading-5 text-[#765f40]">
                Capture what matters, then choose whether each note stays private or is shared in this Session.
              </p>
            </div>
          </div>
          <span className="rounded-full border border-orange-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-orange-900">
            {counts.private} private · {counts.shared} shared · {counts["client-safe"]} client-safe
          </span>
        </div>

        <nav aria-label="Session note views" className="mt-5 flex gap-2 overflow-x-auto pb-1">
          {SESSION_NOTE_VIEWS.map((view) => (
            <Link
              key={view.id}
              href={sessionNotesHref(roomId, view.id)}
              aria-current={activeView === view.id ? "page" : undefined}
              className={`inline-flex min-h-11 shrink-0 items-center rounded-full border px-3 py-2 text-xs font-black ${
                activeView === view.id
                  ? "border-orange-700 bg-orange-800 text-white"
                  : "border-orange-200 bg-white text-orange-950"
              }`}
            >
              {view.label}<span className="ml-2 rounded-full bg-black/10 px-1.5 py-0.5 text-[10px]">{counts[view.id]}</span>
            </Link>
          ))}
        </nav>

        {notice ? <p role="status" className="mt-4 rounded-xl border border-orange-200 bg-white px-4 py-3 text-xs font-bold leading-5 text-orange-950">{notice}</p> : null}

        <form ref={createForm} action={(formData) => void createNote(formData)} className="mt-5 grid gap-3 rounded-2xl border border-orange-200 bg-white p-4">
          <p className="text-sm font-black text-orange-950">Add a note</p>
          <label className="text-[10px] font-black uppercase tracking-wide text-orange-900">Note<textarea name="body" required maxLength={20_000} rows={4} placeholder="Write a note…" className="mt-1 block w-full rounded-lg border border-orange-200 bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal" /></label>
          <label className="text-[10px] font-black uppercase tracking-wide text-orange-900">Title <span className="normal-case tracking-normal text-orange-700">(optional)</span><input name="title" maxLength={500} placeholder="Add a title" className="mt-1 block min-h-11 w-full rounded-lg border border-orange-200 bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal" /></label>
          <details className="rounded-xl border border-orange-100 bg-orange-50/45 p-3">
            <summary className="cursor-pointer text-xs font-black text-orange-950">Note type and sharing</summary>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="text-[10px] font-black uppercase tracking-wide text-orange-900">
                Note type
                <select name="kind" defaultValue="SESSION_NOTE" className="mt-1 block min-h-11 w-full rounded-lg border border-orange-200 bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal">
                  {editableKinds(canUseProjectTeamNotes).map((kind) => <option key={kind} value={kind}>{sessionNoteKindLabel(kind)}</option>)}
                </select>
              </label>
              <label className="text-[10px] font-black uppercase tracking-wide text-orange-900">
                Who can read it
                <select name="visibility" defaultValue="SESSION_SHARED" className="mt-1 block min-h-11 w-full rounded-lg border border-orange-200 bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal">
                  {editableVisibilities(canUseProjectTeamNotes).map((visibility) => <option key={visibility} value={visibility}>{sessionNoteVisibilityLabel(visibility)}</option>)}
                </select>
              </label>
            </div>
          </details>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-bold leading-5 text-orange-950">Shared with this Session by default. Choose Only me when a note is private.</p>
            <button type="submit" disabled={busyId === "create"} className="min-h-11 rounded-full bg-orange-800 px-5 py-2 text-xs font-black text-white disabled:opacity-50">{busyId === "create" ? "Saving…" : "Save note"}</button>
          </div>
        </form>
      </section>

      {visibleNotes.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {visibleNotes.map((note) => (
            <article id={`session-note-${note.id}`} key={note.id} tabIndex={-1} className="scroll-mt-24 rounded-2xl border border-orange-200 bg-white p-5 shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black uppercase tracking-wide text-[#8a7354]">{sessionNoteKindLabel(note.kind)} · {note.originLabel}</p>
                  <h3 className="mt-1 font-serif text-2xl font-black text-[#3d3122]">{note.title || sessionNoteKindLabel(note.kind)}</h3>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[10px] font-black uppercase text-orange-950">
                  <NoteAudienceIcon visibility={note.visibility} />{sessionNoteVisibilityLabel(note.visibility)}
                </span>
              </div>
              <p className="mt-4 whitespace-pre-wrap text-sm font-semibold leading-6 text-[#5f4d37]">{note.body}</p>
              {note.sourceAnchor ? (
                <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50/70 p-3">
                  <p className="text-[10px] font-black uppercase tracking-wide text-sky-800">Transcript source</p>
                  <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-sky-950">{note.sourceAnchor.effectiveSpeakerLabelSnapshot ? `${note.sourceAnchor.effectiveSpeakerLabelSnapshot}: ` : ""}{note.sourceAnchor.effectiveTextSnapshot}</p>
                  <TranscriptSpeakerEvidenceBadge authority={note.sourceAnchor.speakerAuthority} />
                  <Link href={`/sessions/${encodeURIComponent(roomId)}?mode=transcript#transcript-segment-${encodeURIComponent(note.sourceAnchor.segmentId)}`} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-full border border-sky-300 bg-white px-3 py-2 text-xs font-black text-sky-900 hover:underline">
                    <Play size={14} aria-hidden="true" />Return to {timestampForSeconds(note.sourceAnchor.startSeconds)}–{timestampForSeconds(note.sourceAnchor.endSeconds)}
                  </Link>
                </div>
              ) : null}
              {note.lastMergedSource ? (
                <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50/70 p-3">
                  <p className="text-[10px] font-black uppercase tracking-wide text-violet-800">Latest merged transcript source</p>
                  <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-violet-950">{note.lastMergedSource.sourceAnchor.effectiveSpeakerLabelSnapshot ? `${note.lastMergedSource.sourceAnchor.effectiveSpeakerLabelSnapshot}: ` : ""}{note.lastMergedSource.sourceAnchor.effectiveTextSnapshot}</p>
                  <TranscriptSpeakerEvidenceBadge authority={note.lastMergedSource.sourceAnchor.speakerAuthority} />
                  <Link href={`/sessions/${encodeURIComponent(roomId)}?mode=transcript#transcript-segment-${encodeURIComponent(note.lastMergedSource.sourceAnchor.segmentId)}`} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-full border border-violet-300 bg-white px-3 py-2 text-xs font-black text-violet-900 hover:underline">
                    <Play size={14} aria-hidden="true" />Return to merged source at {timestampForSeconds(note.lastMergedSource.sourceAnchor.startSeconds)}–{timestampForSeconds(note.lastMergedSource.sourceAnchor.endSeconds)}
                  </Link>
                </div>
              ) : null}
              <TagSearchChips tags={note.tags} label={`${note.title || "Session note"} tags`} />
              <div className="mt-4 rounded-xl border border-orange-100 bg-orange-50/45 p-3 text-xs font-semibold leading-5 text-orange-950">
                <p>{note.author.isCurrentActor ? "By you" : `By ${note.author.label}`} · {audienceHelp(note.visibility)} · {note.revisionCount} version{note.revisionCount === 1 ? "" : "s"} · updated {new Date(note.updatedAt).toLocaleString()}</p>
              </div>

              {note.canEdit ? (
                <details className="mt-4 rounded-xl border border-orange-100 bg-orange-50/35 p-3">
                  <summary className="cursor-pointer text-xs font-black text-orange-950">Edit note, audience, and tags</summary>
                  <form key={`${note.id}-${note.updatedAt}`} action={(formData) => void saveNote(note, formData)} className="mt-4 grid gap-3">
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="text-[10px] font-black uppercase tracking-wide text-orange-900">
                        Note type
                        <select name="kind" defaultValue={note.kind} className="mt-1 block min-h-11 w-full rounded-lg border border-orange-200 bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal">
                          {editableKinds(canUseProjectTeamNotes).map((kind) => <option key={kind} value={kind}>{sessionNoteKindLabel(kind)}</option>)}
                        </select>
                      </label>
                      {note.canChangeVisibility !== false ? (
                        <label className="text-[10px] font-black uppercase tracking-wide text-orange-900">
                          Who can read it
                          <select name="visibility" defaultValue={note.visibility} className="mt-1 block min-h-11 w-full rounded-lg border border-orange-200 bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal">
                            {editableVisibilities(canUseProjectTeamNotes).map((visibility) => <option key={visibility} value={visibility}>{sessionNoteVisibilityLabel(visibility)}</option>)}
                          </select>
                        </label>
                      ) : (
                        <div className="text-[10px] font-black uppercase tracking-wide text-orange-900">
                          Shared with
                          <input type="hidden" name="visibility" value={note.visibility} />
                          <p className="mt-1 flex min-h-11 items-center rounded-lg border border-orange-100 bg-orange-50 px-3 py-2 text-sm font-semibold normal-case tracking-normal text-orange-950">{sessionNoteVisibilityLabel(note.visibility)}</p>
                        </div>
                      )}
                    </div>
                    <label className="text-[10px] font-black uppercase tracking-wide text-orange-900">Title<input name="title" maxLength={500} defaultValue={note.title ?? ""} className="mt-1 block min-h-11 w-full rounded-lg border border-orange-200 bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal" /></label>
                    <label className="text-[10px] font-black uppercase tracking-wide text-orange-900">Note<textarea name="body" required maxLength={20_000} defaultValue={note.body} rows={6} className="mt-1 block w-full rounded-lg border border-orange-200 bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal" /></label>
                    <button type="submit" disabled={busyId === note.id} className="min-h-11 justify-self-start rounded-full bg-orange-800 px-4 py-2 text-xs font-black text-white disabled:opacity-50">Save revision</button>
                  </form>

                  {taxonomy?.canManageVocabulary ? (
                    <div className="mt-5 border-t border-orange-100 pt-4">
                      <form action={(formData) => void saveNoteTags(note, formData)}>
                        <fieldset className="grid gap-2 sm:grid-cols-2">
                          <legend className="mb-2 text-[10px] font-black uppercase tracking-wide text-sky-900">Canonical {taxonomy.project.name} tags</legend>
                          {taxonomy.catalog.map((tag) => (
                            <label key={tag.id} className="flex min-h-11 items-center gap-2 rounded-lg border border-sky-100 bg-white px-3 py-2 text-xs font-bold text-sky-950">
                              <input name="noteTagId" value={tag.id} type="checkbox" defaultChecked={note.tags.some((selected) => selected.id === tag.id)} />#{tag.label}
                            </label>
                          ))}
                        </fieldset>
                        <button type="submit" disabled={busyId === note.id} className="mt-3 min-h-11 rounded-full border border-sky-300 bg-white px-4 py-2 text-xs font-black text-sky-950 disabled:opacity-50">Save tags</button>
                      </form>
                      <form action={(formData) => void createNoteTag(note, formData)} className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <label className="flex-1 text-[10px] font-black uppercase tracking-wide text-violet-900">New reusable tag<input name="label" required maxLength={80} placeholder="e.g. Opening craft" className="mt-1 block min-h-11 w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal" /></label>
                        <button type="submit" disabled={busyId === note.id} className="min-h-11 self-end rounded-full border border-violet-300 bg-violet-50 px-4 py-2 text-xs font-black text-violet-950 disabled:opacity-50">Create and attach</button>
                      </form>
                    </div>
                  ) : null}
                </details>
              ) : (
                <p className="mt-4 text-xs font-bold text-slate-600">Read-only</p>
              )}
            </article>
          ))}
        </div>
      ) : (
        <section className="rounded-2xl border border-dashed border-orange-200 bg-white/65 p-6 text-center" aria-label="No notes in this view">
          <MessageSquarePlus className="mx-auto text-orange-600" aria-hidden="true" />
          <h3 className="mt-3 font-serif text-2xl font-black text-[#3d3122]">No notes in this view</h3>
          <p className="mt-2 text-sm font-semibold text-[#765f40]">Add the first note for this Session.</p>
        </section>
      )}
    </div>
  );
}
