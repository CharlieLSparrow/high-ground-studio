"use client";

import { forwardRef, useCallback, useEffect, useState, type ComponentPropsWithoutRef } from "react";
import { RecordingAudioControls } from "./recording-audio-controls";

type Props = Omit<ComponentPropsWithoutRef<"audio">, "src"> & { src?: string; contentType?: string };
const sourcePath = /^\/api\/sessions\/([^/]+)\/recordings\/([^/]+)\/media$/;

/** A normal player backed by the original recording or its exact-source AAC copy.
 * Conversion is automatic, private, idempotent and shared with native playback.
 */
export const SessionRecordingAudio = forwardRef<HTMLAudioElement, Props>(function SessionRecordingAudio(
  { src, contentType, onError, controls, className, ...props }, ref,
) {
  const [media, setMedia] = useState<HTMLAudioElement | null>(null);
  const attach = useCallback((node: HTMLAudioElement | null) => {
    setMedia(node);
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  }, [ref]);
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
      const request = new AbortController();
      const cancel = () => request.abort();
      controller.signal.addEventListener("abort", cancel, { once: true });
      const timeout = setTimeout(() => request.abort(), 20_000);
      try {
        const response = await fetch(endpoint, { method, signal: request.signal, credentials: "same-origin", cache: "no-store" });
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
        if (result.state === "FAILED") throw new Error("The playback copy could not be prepared. Check recording details for recovery options.");
        if (result.state === "HELD") throw new Error("Playback needs attention. Check recording details before retrying.");
        if (++polls > 180) throw new Error("This recording is still processing. Try again in a moment.");
        timer = setTimeout(() => void check("GET"), polls < 10 ? 2000 : 5000);
      } catch (error) {
        if (!controller.signal.aborted) setState({ source: src, error: request.signal.aborted
          ? "Preparing playback is taking longer than expected. Try again when connected."
          : error instanceof Error ? error.message : "Playback couldn't be prepared." });
      } finally {
        clearTimeout(timeout);
        controller.signal.removeEventListener("abort", cancel);
      }
    };
    void check("POST");
    return () => { controller.abort(); clearTimeout(timer); };
  }, [prepare, endpoint, src, attempt]);

  const preparing = Boolean(prepare && (!current || current.preparing));
  const resolvedSource = prepare ? current?.url : src;
  return <>
    <audio {...props} ref={attach} className={controls ? "hidden" : className} src={resolvedSource} onError={(event) => {
      if (endpoint && !prepare && [3, 4].includes(event.currentTarget.error?.code ?? 4)) setFallbackSource(src ?? null);
      else onError?.(event);
    }} />
    {controls ? <RecordingAudioControls media={media} src={resolvedSource} preparing={preparing}
      label={props["aria-label"] ?? "Recording"} className={className} /> : null}
    {preparing ? <p role="status" className="mt-2 text-sm text-current/70">Preparing playback…</p> : null}
    {current?.error ? <div role="status" className="mt-2 text-sm">
      <p>{current.error}</p>
      <button type="button" className="mt-2 min-h-10 rounded-full border border-current px-4 font-semibold" onClick={() => { setState({ source: src!, preparing: true }); setAttempt((value) => value + 1); }}>Retry playback</button>
    </div> : null}
  </>;
});
