"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WorkTagPicker, type WorkTagOption } from "./work-tag-picker";

type Context = { projectId: string; updatedAt: string; tagRevision: number; selectedTagIds: string[]; tags: WorkTagOption[] };
type TagRequest = { entityKind: "document"; entityId: string; tagIds: string[]; expectedUpdatedAt: string; expectedTagRevision: number; clientRequestId: string };
type Pending = { version: 1; projectId: string; selected: WorkTagOption[]; request: TagRequest };

function validRecovery(value: Pending | null, projectId: string, documentId: string): value is Pending {
  const request = value?.request;
  return value?.version === 1 && value.projectId === projectId
    && request?.entityKind === "document" && request.entityId === documentId
    && Array.isArray(request.tagIds) && request.tagIds.length <= 24 && request.tagIds.every(id => typeof id === "string")
    && Array.isArray(value.selected) && value.selected.length === request.tagIds.length
    && value.selected.every(tag => tag && typeof tag.id === "string" && typeof tag.label === "string" && typeof tag.isActive === "boolean")
    && JSON.stringify(value.selected.map(tag => tag.id).sort()) === JSON.stringify([...request.tagIds].sort())
    && Number.isInteger(request.expectedTagRevision) && request.expectedTagRevision >= 0
    && typeof request.expectedUpdatedAt === "string" && Number.isFinite(Date.parse(request.expectedUpdatedAt))
    && typeof request.clientRequestId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(request.clientRequestId);
}

/** Classification saves independently of prose. Uncertain writes keep their
 * request identity across reloads, scoped to the person and document. */
export function DocumentTags({ documentId, projectId, actorId }: { documentId: string; projectId: string; actorId: string }) {
  const storageKey = `quipsly:document-tags:${actorId}:${projectId}:${documentId}`;
  const [context, setContext] = useState<Context | null>(null);
  const [selected, setSelected] = useState<WorkTagOption[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [storageWarning, setStorageWarning] = useState(false);
  const pending = useRef<Pending | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  const blocked = useRef(false);

  const retain = useCallback(() => {
    try {
      if (pending.current) localStorage.setItem(storageKey, JSON.stringify(pending.current));
      else localStorage.removeItem(storageKey);
      setStorageWarning(false);
    } catch { setStorageWarning(true); }
  }, [storageKey]);

  const save = useCallback(async () => {
    if (!pending.current || busy.current || blocked.current) return;
    busy.current = true;
    setSaving(true);
    setMessage("");
    retain();
    try {
      const response = await fetch("/api/work/tags", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pending.current.request) });
      const result = await response.json();
      if (!mounted.current) return;
      if (!response.ok || !result.ok) {
        if (response.status === 409) { blocked.current = true; setConflict(true); }
        throw new Error(response.status === 409
          ? "Tags changed elsewhere. Your selection is still shown below. Load the current tags to continue."
          : response.status === 401 ? "Sign in again to sync your tags." : "Tags haven't synced yet. Your selection is kept here.");
      }
      if (!Number.isInteger(result.tagRevision) || typeof result.updatedAt !== "string") throw new Error("Couldn't confirm saved tags. Try again.");
      setContext(current => current ? { ...current, tagRevision: result.tagRevision, updatedAt: result.updatedAt, selectedTagIds: result.tagIds } : current);
      pending.current = null;
      retain();
    } catch (error) {
      if (mounted.current) setMessage(error instanceof Error ? error.message : "Tags haven't synced yet. Try again.");
    } finally {
      busy.current = false;
      if (mounted.current) setSaving(false);
    }
  }, [retain]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setMessage("");
    void (async () => {
      try {
        const params = new URLSearchParams({ entityKind: "document", entityId: documentId });
        const response = await fetch(`/api/work/tags?${params}`, { cache: "no-store", signal: controller.signal });
        const result = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok || !result.ok || result.projectId !== projectId || !Number.isInteger(result.tagRevision)
          || !Array.isArray(result.tags) || !Array.isArray(result.selectedTagIds)) throw new Error("Tags couldn't load. You can keep writing.");
        setContext(result);
        setSelected(result.tags.filter((tag: WorkTagOption) => result.selectedTagIds.includes(tag.id)));
        // Authorize this document before displaying an actor's local recovery.
        let recovery: Pending | null = null;
        try { recovery = JSON.parse(localStorage.getItem(storageKey) || "null"); } catch { setStorageWarning(true); }
        if (validRecovery(recovery, projectId, documentId)) {
          pending.current = recovery;
          setSelected(recovery.selected);
          void save();
        }
      } catch (error) {
        if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Tags couldn't load. You can keep writing.");
      }
    })();
    return () => controller.abort();
  }, [documentId, projectId, storageKey, attempt, save]);

  useEffect(() => {
    const reconnect = () => { void save(); };
    const leave = (event: BeforeUnloadEvent) => { if (pending.current) event.preventDefault(); };
    window.addEventListener("online", reconnect);
    window.addEventListener("beforeunload", leave);
    return () => { window.removeEventListener("online", reconnect); window.removeEventListener("beforeunload", leave); };
  }, [save]);

  function change(tags: WorkTagOption[]) {
    if (!context || busy.current || pending.current) return;
    setSelected(tags);
    pending.current = { version: 1, projectId, selected: tags, request: {
      entityKind: "document", entityId: documentId, tagIds: tags.map(tag => tag.id), expectedUpdatedAt: context.updatedAt,
      expectedTagRevision: context.tagRevision, clientRequestId: crypto.randomUUID(),
    } };
    void save();
  }

  function loadCurrent() {
    pending.current = null;
    retain();
    blocked.current = false;
    setConflict(false);
    setContext(null);
    setAttempt(value => value + 1);
  }

  return <section aria-label="Document tags" className="my-3 min-w-0">
    {message && <div role="status" className="text-sm text-muted-foreground">
      <p>{message}</p>
      {conflict ? <button type="button" onClick={loadCurrent} className="min-h-11 font-semibold underline">Use current tags</button>
        : <button type="button" disabled={saving} onClick={() => pending.current ? void save() : setAttempt(value => value + 1)} className="min-h-11 font-semibold underline">Retry tags</button>}
    </div>}
    {storageWarning && <p className="text-sm text-muted-foreground">Browser storage is unavailable. Keep this page open until tags finish saving.</p>}
    {!context && !message && <p className="text-xs text-muted-foreground">Loading tags…</p>}
    {context && <WorkTagPicker navigateSelected entityKind="document" entityId={documentId} selected={selected} onChange={change}
      disabled={saving || creating || Boolean(pending.current)} onPendingChange={setCreating} />}
    {saving && <p role="status" className="text-xs text-muted-foreground">Saving tags…</p>}
  </section>;
}
