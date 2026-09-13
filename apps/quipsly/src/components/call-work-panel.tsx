"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { SessionWorkWorkspace } from "@/app/(app)/sessions/[roomId]/session-work-workspace";
import type { SessionQuickEntry } from "@/app/(app)/sessions/[roomId]/session-review-client";
import type { SessionWorkAssignmentContext } from "@/lib/session-work-assignment";

type Work = { actorUserId: string; entries: SessionQuickEntry[]; canCreate: boolean; assignmentContext: SessionWorkAssignmentContext | null };

/** A live view of canonical Session work, never a separate meeting checklist. */
export function CallWorkPanel({roomId, active, onOpenWorkspace}: {
  roomId: string; active: boolean; onOpenWorkspace: () => void;
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
      const data = await response.json();
      if (!alive.current || request !== sequence.current) return;
      if (!response.ok || !data.ok || !Array.isArray(data.entries) || typeof data.actorUserId !== "string") {
        if ([401, 403, 404].includes(response.status)) setWork(null);
        throw new Error(data.error || "Tasks couldn’t load. Try again.");
      }
      setWork(data); setError(null);
    } catch (failure) {
      if (alive.current && request === sequence.current) setError(failure instanceof Error ? failure.message : "Tasks couldn’t load.");
    }
  }, [roomId]);

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
      onChanged={() => { sequence.current++; }} />}
    <Link onClick={onOpenWorkspace} href={`/sessions/${encodeURIComponent(roomId)}?mode=work`}
      className="inline-flex min-h-11 items-center text-sm font-semibold underline">Open session work</Link>
  </div>;
}
