"use client";

import {useCallback, useEffect, useRef, useState} from "react";
import {sessionWorkspaceHref, type SessionMediaFocus} from "./session-workspace-model";

/** One navigation focus, not another media model. Reads still use scoped APIs. */
export function useSessionMediaNavigation(roomId: string, sourceId: string | null, seconds: number | null) {
  const scope = `${roomId}|${sourceId || ""}|${seconds ?? ""}`;
  const [local, setLocal] = useState<{scope: string; focus: SessionMediaFocus} | null>(null);
  const focus = local?.scope === scope ? local.focus : {sourceId, seconds};
  const current = useRef({scope, focus});
  current.current = {scope, focus};
  const select = useCallback((nextSourceId: string, at: number | null = null) => {
    if (current.current.scope !== scope || !nextSourceId.trim()) return;
    const next = {sourceId: nextSourceId.trim().slice(0, 240), seconds: at !== null && Number.isFinite(at) && at >= 0 && at <= 86_400 ? at : null};
    if (next.sourceId === current.current.focus.sourceId && next.seconds === current.current.focus.seconds) return;
    current.current = {scope, focus: next};
    setLocal({scope, focus: next});
  }, [scope]);
  const selectTake = useCallback((sources: string[]) => {
    if (current.current.scope !== scope || !sources.length || sources.includes(current.current.focus.sourceId || "")) return;
    select(sources[0]!);
  }, [scope, select]);

  useEffect(() => {
    if (local?.scope !== scope || !local.focus.sourceId) return;
    const url = new URL(window.location.href);
    if (url.pathname !== `/sessions/${encodeURIComponent(roomId)}`) return;
    url.searchParams.set("source", local.focus.sourceId);
    if (local.focus.seconds === null) url.searchParams.delete("at");
    else url.searchParams.set("at", String(Number(local.focus.seconds.toFixed(3))));
    const next = `${url.pathname}${url.search}${url.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`)
      window.history.replaceState(window.history.state, "", next);
  }, [local, roomId, scope]);

  return {focus, select, selectTake, href: (mode: Parameters<typeof sessionWorkspaceHref>[1]) => sessionWorkspaceHref(roomId, mode, focus)};
}
