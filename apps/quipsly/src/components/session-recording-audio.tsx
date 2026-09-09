"use client";

import { forwardRef, useEffect, useState, type ComponentPropsWithoutRef } from "react";

type Props = Omit<ComponentPropsWithoutRef<"audio">, "src"> & { src?: string; contentType?: string };
const sourcePath = /^\/api\/sessions\/([^/]+)\/recordings\/([^/]+)\/media$/;

/** A normal player backed by the original recording or its exact-source AAC copy.
 * Conversion is automatic, private, idempotent and shared with native playback.
 */
export const SessionRecordingAudio = forwardRef<HTMLAudioElement, Props>(function SessionRecordingAudio(
  { src, contentType, onError, ...props }, ref,
) {
  const endpoint = typeof src === "string" && sourcePath.test(src)
    ? src.replace(/\/media$/, "/audition") : null;
  const needsCopy = /^audio\/(x-)?caf(?:;|$)/i.test(contentType ?? "");
  const [fallbackSource, setFallbackSource] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ source: string; url?: string; error?: string; preparing?: boolean } | null>(null);
  const prepare = Boolean(endpoint && (needsCopy || fallbackSource === src));
  const current = state?.source === src ? state : null;

  useEffect(() => {
    if (!prepare || !endpoint || !src) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let polls = 0;
    setState({ source: src, preparing: true });
    const check = async (method: "POST" | "GET") => {
      try {
        const response = await fetch(endpoint, { method, signal: controller.signal, credentials: "same-origin", cache: "no-store" });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || "Playback couldn't be prepared. Please try again.");
        if (controller.signal.aborted) return;
        if (result.state === "NOT_REQUIRED") { setState({ source: src, url: src }); return; }
        if (result.state === "READY") {
          // Do not let a response substitute media from another recording.
          if (result.derivative?.url !== `${endpoint}/media`) throw new Error("The playback copy did not match this recording.");
          setState({ source: src, url: result.derivative.url });
          return;
        }
        if (result.state === "FAILED" || result.state === "HELD") throw new Error("Playback isn't available yet. Your original recording is saved; please try again shortly.");
        if (++polls > 180) throw new Error("This recording is still processing. Try again in a moment.");
        timer = setTimeout(() => void check("GET"), polls < 10 ? 2000 : 5000);
      } catch (error) {
        if (!controller.signal.aborted) setState({ source: src, error: error instanceof Error ? error.message : "Playback couldn't be prepared." });
      }
    };
    void check("POST");
    return () => { controller.abort(); clearTimeout(timer); };
  }, [prepare, endpoint, src, attempt]);

  const preparing = prepare && (!current || current.preparing);
  return <>
    <audio {...props} ref={ref} src={prepare ? current?.url : src} onError={(event) => {
      if (endpoint && !prepare) setFallbackSource(src ?? null);
      else onError?.(event);
    }} />
    {preparing ? <p role="status" className="mt-2 text-sm text-current/70">Preparing playback…</p> : null}
    {current?.error ? <div role="status" className="mt-2 text-sm">
      <p>{current.error}</p>
      <button type="button" className="mt-2 min-h-10 rounded-full border border-current px-4 font-semibold" onClick={() => { setState({ source: src!, preparing: true }); setAttempt((value) => value + 1); }}>Retry playback</button>
    </div> : null}
  </>;
});
