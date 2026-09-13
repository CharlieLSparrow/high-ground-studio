"use client";

import { useCallback, useEffect, useState } from "react";
import type { SessionAfterCall } from "@/lib/session-after-call";

function isSummary(value: unknown, roomId: string): value is SessionAfterCall {
  if (!value || typeof value !== "object") return false;
  const summary = value as SessionAfterCall;
  return summary.roomId === roomId && (summary.transcriptSourceId === null || typeof summary.transcriptSourceId === "string" && summary.transcriptSourceId.length > 0 && summary.transcriptSourceId.length <= 240)
    && [summary.recordings?.uploaded, summary.recordings?.pending,
    summary.recordings?.attention, summary.transcripts?.available, summary.transcripts?.processing,
    summary.transcripts?.attention].every(count => Number.isSafeInteger(count) && count >= 0);
}

export function useSessionAfterCall(roomId: string, localPhase?: string) {
  const [state, setState] = useState<{ roomId: string; summary: SessionAfterCall | null; error: string | null }>({ roomId, summary: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);

  useEffect(() => {
    let disposed = false;
    let terminal = false;
    let inFlight = false;
    let failures = 0;
    let polls = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    setState({ roomId, summary: null, error: null });
    const refresh = async () => {
      if (disposed || terminal || inFlight) return;
      clearTimeout(timer);
      if (document.visibilityState === "hidden" || navigator.onLine === false) return;
      inFlight = true;
      controller = new AbortController();
      let delay = 30_000;
      const timeout = setTimeout(() => controller?.abort(), 15_000);
      try {
        const response = await fetch(`/api/sessions/${encodeURIComponent(roomId)}/after-call`, { cache: "no-store", signal: controller.signal });
        if (disposed) return;
        if (response.status === 401 || response.status === 403 || response.status === 404) {
          terminal = true;
          setState({ roomId, summary: null, error: response.status === 401 ? "Sign in again to see session updates." : "This session is no longer available to this account." });
          return;
        }
        const payload = await response.json();
        if (disposed) return;
        if (!response.ok || !payload.ok || !isSummary(payload.summary, roomId)) throw new Error("Unavailable summary");
        failures = 0;
        const summary = payload.summary;
        polls += 1;
        delay = polls < 6 || summary.recordings.pending || summary.transcripts.processing ? 5_000 : 30_000;
        setState({ roomId, summary, error: null });
      } catch {
        if (disposed) return;
        failures += 1;
        delay = Math.min(60_000, 5_000 * 2 ** Math.min(failures, 4));
        // Do not retain a green availability claim after an unsuccessful refresh.
        setState({ roomId, summary: null, error: "Couldn't refresh session updates. You can still open your session or try again." });
      } finally {
        clearTimeout(timeout);
        inFlight = false;
        if (!disposed && !terminal) timer = setTimeout(() => void refresh(), delay);
      }
    };
    const wake = () => void refresh();
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    void refresh();
    return () => {
      disposed = true;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
    };
  }, [roomId, attempt, localPhase]);
  return { summary: state.roomId === roomId ? state.summary : null, error: state.roomId === roomId ? state.error : null, retry };
}
