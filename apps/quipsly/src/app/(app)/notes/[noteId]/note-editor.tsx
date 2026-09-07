"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Copy, Download, LoaderCircle } from "lucide-react";
import type { CanonicalDocumentNoteSnapshot, CanonicalDocumentNoteEditInput } from "@/lib/server/canonical-document-note-edit";

type Note = CanonicalDocumentNoteSnapshot & { projectName: string };
type Draft = { title: string; blocks: CanonicalDocumentNoteSnapshot["blocks"] };
type SaveRequest = Pick<CanonicalDocumentNoteEditInput, "expectedContentRevision" | "clientRequestId" | "title" | "blocks">;
type Recovery = { version: 1; revision: string; draft: Draft; request: SaveRequest | null };
const content = (draft: Draft) => JSON.stringify({ title: draft.title.trim() || "Untitled note", blocks: draft.blocks.map(({ id, stableId, body }) => ({ id, stableId, body })) });

export function NoteEditor({ initial, actorId }: { initial: Note; actorId: string }) {
  const storageKey = `quipsly:note:${actorId}:${initial.id}`;
  const [draft, setDraft] = useState<Draft>({ title: initial.title, blocks: initial.blocks });
  const draftRef = useRef(draft);
  const revision = useRef(initial.contentRevision);
  const saved = useRef(content(draft));
  const request = useRef<SaveRequest | null>(null);
  const saving = useRef(false);
  const blocked = useRef(false);
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<"saved" | "changed" | "saving" | "error">("saved");
  const [message, setMessage] = useState("");
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [copied, setCopied] = useState(false);

  const retain = useCallback(() => {
    try {
      if (content(draftRef.current) === saved.current && !request.current) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, JSON.stringify({ version: 1, revision: revision.current, draft: draftRef.current, request: request.current } satisfies Recovery));
      setStorageAvailable(true);
    } catch { setStorageAvailable(false); }
  }, [storageKey]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const recovery = JSON.parse(raw) as Recovery;
        const valid = recovery.version === 1 && typeof recovery.revision === "string"
          && typeof recovery.draft?.title === "string" && Array.isArray(recovery.draft.blocks)
          && recovery.draft.blocks.length > 0 && recovery.draft.blocks.length <= 100
          && recovery.draft.blocks.every((block) => typeof block.id === "string" && typeof block.stableId === "string" && typeof block.body === "string");
        if (valid && content(recovery.draft) !== saved.current && initial.canEditContent) {
          draftRef.current = recovery.draft;
          setDraft(recovery.draft);
          revision.current = recovery.revision;
          request.current = recovery.request;
          const sameBlocks = recovery.draft.blocks.length === initial.blocks.length
            && recovery.draft.blocks.every((block, index) => block.id === initial.blocks[index].id && block.stableId === initial.blocks[index].stableId);
          if (!sameBlocks || recovery.revision !== initial.contentRevision && !recovery.request) {
            blocked.current = true;
            setState("error");
            setMessage("This note changed on another device. Your unsaved words are here; copy or download them before loading the latest version.");
          } else setState("changed");
        } else if (valid && content(recovery.draft) === saved.current) localStorage.removeItem(storageKey);
      }
    } catch { setStorageAvailable(false); }
    setReady(true);
  }, [storageKey, initial]);

  const persist = useCallback(async () => {
    if (saving.current || blocked.current || !initial.canEditContent) return;
    if (content(draftRef.current) === saved.current && !request.current) return;
    saving.current = true;
    setState("saving");
    setMessage("");
    try {
      // Reuse an uncertain request verbatim. A retry after a lost response cannot
      // turn into a second mutation or overwrite a newer local keystroke.
      while (request.current || content(draftRef.current) !== saved.current) {
        request.current ??= {
          expectedContentRevision: revision.current,
          clientRequestId: crypto.randomUUID(),
          title: draftRef.current.title.trim() || "Untitled note",
          blocks: draftRef.current.blocks.map(({ id, stableId, body }) => ({ id, stableId, body })),
        };
        retain();
        const response = await fetch(`/api/mobile/capture/work/notes/${encodeURIComponent(initial.id)}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request.current),
        });
        const result = await response.json();
        if (!response.ok || !result.ok) {
          if (response.status === 409) {
            blocked.current = true;
            throw new Error("This note changed elsewhere. Your words are kept here; copy or download them before loading the latest version.");
          }
          throw new Error(response.status === 401 ? "Sign in again to save. Your words are kept on this browser." : "Couldn't sync your note. You can keep writing and retry.");
        }
        const sent = request.current;
        revision.current = result.note.contentRevision;
        saved.current = content({ title: sent.title, blocks: sent.blocks.map((block, index) => ({ ...block, order: index })) });
        request.current = null;
        retain();
      }
      setState("saved");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Couldn't sync your note. Try again.");
    } finally { saving.current = false; }
  }, [initial.id, initial.canEditContent, retain]);

  function update(next: Draft) {
    draftRef.current = next;
    setDraft(next);
    retain();
    if (!blocked.current) setState("changed");
  }
  useEffect(() => {
    if (!ready || state !== "changed") return;
    const timer = window.setTimeout(() => { void persist(); }, 700);
    return () => window.clearTimeout(timer);
  }, [draft, ready, state, persist]);
  useEffect(() => {
    function leave(event: BeforeUnloadEvent) {
      if (content(draftRef.current) !== saved.current || request.current) { retain(); event.preventDefault(); }
    }
    function background() { if (document.visibilityState === "hidden") { retain(); void persist(); } }
    function reconnect() { if (!blocked.current) void persist(); }
    window.addEventListener("beforeunload", leave);
    window.addEventListener("online", reconnect);
    document.addEventListener("visibilitychange", background);
    return () => { window.removeEventListener("beforeunload", leave); window.removeEventListener("online", reconnect); document.removeEventListener("visibilitychange", background); };
  }, [persist, retain]);

  const text = () => `${draftRef.current.title || "Untitled note"}\n\n${draftRef.current.blocks.map((block) => block.body).join("\n\n")}`;
  function download() {
    const url = URL.createObjectURL(new Blob([text()], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${(draft.title || "note").replace(/[^a-zA-Z0-9 _-]/g, "").slice(0, 80) || "note"}.txt`; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return <article className="mx-auto max-w-4xl text-quipsly-ink">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <Link href="/library" className="inline-flex min-h-11 items-center gap-2 text-sm text-quipsly-muted"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Notes</Link>
      <div className="flex items-center gap-2">
        <span role="status" className="flex items-center gap-1.5 text-xs text-quipsly-muted">{state === "saving" ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : state === "saved" ? <Check className="h-4 w-4" aria-hidden="true" /> : null}{!initial.canEditContent ? "Read only" : state === "saved" ? "Saved" : state === "saving" ? "Saving…" : storageAvailable ? "Saved on this browser" : "Unsaved"}</span>
        <button type="button" aria-label="Copy note" className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-quipsly-surface-muted" onClick={async () => { try { await navigator.clipboard.writeText(text()); setCopied(true); } catch { setMessage("Copy isn't available here. Use Download instead."); } }}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</button>
        <button type="button" aria-label="Download note" onClick={download} className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-quipsly-surface-muted"><Download className="h-4 w-4" /></button>
      </div>
    </div>
    {(message || !storageAvailable) && <div role="alert" className="mb-4 rounded-xl border border-quipsly-divider bg-quipsly-surface p-4 text-sm"><p>{message || "Browser storage is unavailable. Keep this page open until your note is saved."}</p>{state === "error" && !blocked.current && <button type="button" onClick={() => void persist()} className="mt-2 min-h-11 font-semibold underline">Retry save</button>}{blocked.current && <button type="button" onClick={() => { download(); localStorage.removeItem(storageKey); window.location.reload(); }} className="mt-2 min-h-11 font-semibold underline">Download my words and load latest</button>}</div>}
    <div className="rounded-2xl border border-quipsly-divider bg-quipsly-surface p-5 shadow-sm sm:p-9">
      <Link href={`/nests/${encodeURIComponent(initial.projectSlug)}`} className="text-xs text-quipsly-muted hover:underline">{initial.projectName}</Link>
      <input aria-label="Note title" maxLength={160} readOnly={!initial.canEditContent || !ready} value={draft.title} placeholder="Untitled note" onChange={(event) => update({ ...draftRef.current, title: event.target.value })} onBlur={() => void persist()} className="mt-4 mb-6 block w-full border-0 bg-transparent font-serif text-3xl font-bold outline-none placeholder:text-quipsly-muted sm:text-4xl" />
      {draft.blocks.map((block, index) => <textarea key={block.id} id={`note-block-${block.id}`} aria-label={draft.blocks.length === 1 ? "Note text" : `Note text ${index + 1}`} readOnly={!initial.canEditContent || !ready} maxLength={20_000} value={block.body} placeholder="Start writing…" rows={Math.max(14, block.body.split("\n").length + 2)} onChange={(event) => update({ ...draftRef.current, blocks: draftRef.current.blocks.map((item) => item.id === block.id ? { ...item, body: event.target.value } : item) })} onBlur={() => void persist()} className="block min-h-64 w-full scroll-mt-6 resize-y border-0 bg-transparent text-base leading-8 outline-none placeholder:text-quipsly-muted" />)}
    </div>
  </article>;
}
