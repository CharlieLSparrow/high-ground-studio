"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { SessionWorkWorkspace } from "@/app/(app)/sessions/[roomId]/session-work-workspace";
import type { SessionQuickEntry } from "@/app/(app)/sessions/[roomId]/session-review-client";
import type { SessionWorkAssignmentContext } from "@/lib/session-work-assignment";

type Work = { actorUserId: string; entries: SessionQuickEntry[]; canCreate: boolean; assignmentContext: SessionWorkAssignmentContext | null };

/** A live view of canonical Session work, never a separate meeting checklist. */
export function CallWorkPanel({roomId, active, entryToOpen, onOpenConversation, onOpenWorkspace}: {
  roomId: string; active: boolean; onOpenWorkspace: () => void;
  entryToOpen?: {id: string; request: number} | null;
  onOpenConversation?: (messageId: string) => void;
}) {
  const [work, setWork] = useState<Work | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; sequence.current++; }; }, []);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(roomId)}/work`, {cache: "no-store"});
      if (!alive.current || request !== sequence.current) return;
      if ([401, 403, 404].includes(response.status)) {
        setWork(null);
        throw new Error(response.status === 401 ? "Sign in again to open tasks." : "This session is no longer available to this account.");
      }
      const data = await response.json().catch(() => { throw new Error("Tasks couldn’t load. Try again."); });
      if (!alive.current || request !== sequence.current) return;
      if (!response.ok || !data.ok || !Array.isArray(data.entries) || typeof data.actorUserId !== "string") {
        throw new Error(data.error || "Tasks couldn’t load. Try again.");
      }
      let targetError: string | null = null;
      // A chat can link to work older than the recent-items window. Resolve it
      // through the exact same scoped query, never assume the link grants access.
      if (entryToOpen && !data.entries.some((entry: SessionQuickEntry) => entry.id === entryToOpen.id)) {
        const target = await fetch(`/api/sessions/${encodeURIComponent(roomId)}/work?entryId=${encodeURIComponent(entryToOpen.id)}`, {cache: "no-store"});
        if (!alive.current || request !== sequence.current) return;
        if (target.status === 401) { setWork(null); throw new Error("Sign in again to open tasks."); }
        const payload = await target.json().catch(() => null);
        if (target.ok && payload?.ok && (payload.actorUserId !== data.actorUserId || payload.roomId !== roomId)) {
          setWork(null); throw new Error("Your account changed. Open tasks again to continue.");
        }
        if (target.ok && payload?.ok && payload.entry?.id === entryToOpen.id) data.entries = [payload.entry, ...data.entries];
        else targetError = target.status === 403 || target.status === 404 ? "This task is no longer available in this session." : "This task couldn’t load. Try again.";
      }
      if (!alive.current || request !== sequence.current) return;
      setWork(data); setError(targetError);
    } catch (failure) {
      if (alive.current && request === sequence.current) setError(failure instanceof Error ? failure.message : "Tasks couldn’t load.");
    }
  }, [roomId, entryToOpen]);

  useEffect(() => {
    if (!active) return;
    void refresh();
    const changed = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail?.roomId || detail.roomId === roomId) void refresh();
    };
    const focused = () => { void refresh(); };
    const timer = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 15_000);
    window.addEventListener("quipsly-coaching-work-changed", changed);
    window.addEventListener("focus", focused);
    return () => { clearInterval(timer); window.removeEventListener("quipsly-coaching-work-changed", changed); window.removeEventListener("focus", focused); };
  }, [active, roomId, refresh]);

  return <div className="space-y-4">
    {error && <div role="alert" className="text-sm text-destructive">{error} <button type="button" onClick={() => void refresh()} className="min-h-11 px-2 font-semibold underline">Try again</button></div>}
    {!work && !error && <p role="status" className="text-sm text-muted-foreground">Loading tasks and goals…</p>}
    {work && <SessionWorkWorkspace key={`${roomId}:${work.actorUserId}`} roomId={roomId} entries={work.entries}
      assignmentContext={work.assignmentContext} canCreate={work.canCreate} compact onOpenWorkspace={onOpenWorkspace}
      entryToOpen={entryToOpen} active={active} onOpenConversation={onOpenConversation}
      onChanged={() => { sequence.current++; }} />}
    <Link onClick={onOpenWorkspace} href={`/sessions/${encodeURIComponent(roomId)}?mode=work`}
      className="inline-flex min-h-11 items-center text-sm font-semibold underline">Open session work</Link>
  </div>;
}
