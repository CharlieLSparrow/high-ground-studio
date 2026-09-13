"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { transcriptionProgressLabel, type TranscriptionProgressSource } from "@/lib/transcription-progress";

export function SessionTranscriptionProgress({sources, onUpdated}: {
  sources: TranscriptionProgressSource[];
  onUpdated: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const activeRequest = useRef<AbortController | null>(null);
  useEffect(() => () => {
    activeRequest.current?.abort();
    activeRequest.current = null;
  }, []);
  async function retry(source: TranscriptionProgressSource) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(source.recordingAssetId);
    setError(null);
    const controller = new AbortController();
    activeRequest.current = controller;
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 30_000);
    try {
      const response = await fetch("/api/mobile/capture/transcripts/run", {
        method: "POST", credentials: "same-origin", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({recordingAssetId: source.recordingAssetId}),
        signal: controller.signal,
      });
      const body = await response.json().catch(() => null);
      if (activeRequest.current !== controller) return;
      if (!response.ok || !body?.ok) throw new Error(body?.error || "Transcription could not start. Please try again.");
      await onUpdated();
    } catch (failure) {
      if (activeRequest.current === controller) setError(timedOut
        ? "Starting transcription is taking too long. Your recording is saved; please try again."
        : failure instanceof Error ? failure.message : "Transcription could not start. Please try again.");
    } finally {
      window.clearTimeout(timeout);
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        inFlight.current = false;
        setBusy(null);
      }
    }
  }
  if (!sources.length) return null;
  return <section aria-label="Transcription progress" className="mt-4 space-y-2">
    {sources.map(source => {
      const active = ["QUEUED", "RUNNING", "PROCESSING"].includes(source.status ?? "");
      return <div key={source.recordingAssetId} className="rounded-xl border border-border bg-muted/30 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{source.participantLabel}</p>
            <p role="status" className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              {active ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> : null}
              {transcriptionProgressLabel(source.status)}
            </p>
          </div>
          {!active && source.status !== "COMPLETED" ? <button type="button" disabled={Boolean(busy)} onClick={() => void retry(source)}
            aria-label={`${source.transcriptJobId ? "Retry" : "Start"} transcription for ${source.participantLabel}`}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm font-semibold disabled:opacity-50">
            {busy === source.recordingAssetId ? <LoaderCircle size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            {busy === source.recordingAssetId ? "Starting…" : source.transcriptJobId ? "Retry transcription" : "Transcribe"}
          </button> : null}
        </div>
        {source.error ? <details className="mt-2 text-xs text-muted-foreground"><summary className="cursor-pointer">What happened?</summary><p className="mt-2 break-words">{source.error}</p></details> : null}
      </div>;
    })}
    {error ? <p role="alert" className="rounded-xl border border-destructive/30 p-3 text-sm text-destructive">{error}</p> : null}
    <p className="text-xs text-muted-foreground">Your recording is saved. You can keep working while transcription finishes.</p>
  </section>;
}
