"use client";

import {useEffect, useRef, useState, type RefObject} from "react";
import {TranscriptExportDialog} from "./transcript-export-dialog";
import type {TranscriptExportPassage} from "@/lib/transcript-export";

function time(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

type Transcript = {segments: TranscriptExportPassage[]; notice?: string; untranscribedSources?: number};

/** Reads the saved output's ripple clock, never the current unsaved edit or the
 * original source clock. The parent owns playback and output authorization. */
export function RecordingTranscriptPreview({title, sourceUrl, outputSha256, mediaRef}: {
  title: string; sourceUrl: string; outputSha256: string | null;
  mediaRef: RefObject<HTMLMediaElement | null>;
}) {
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{key: string; value?: Transcript; error?: string} | null>(null);
  const [position, setPosition] = useState(0);
  const [query, setQuery] = useState("");
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const key = `${sourceUrl}:${outputSha256}`;
  const current = result?.key === key ? result : null;
  const requestKey = useRef(key);
  requestKey.current = key;
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setResult(null);
    void fetch(`${sourceUrl}?format=json`, {signal: controller.signal, cache: "no-store"}).then(async response => {
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "The transcript couldn’t be loaded. Try again.");
      if (payload.outputSha256 !== outputSha256 || !Array.isArray(payload.segments) || payload.segments.some((s: TranscriptExportPassage) =>
        typeof s.text !== "string" || !Number.isFinite(s.startSeconds) || !Number.isFinite(s.endSeconds) || s.startSeconds < 0 || s.endSeconds <= s.startSeconds)) {
        throw new Error("This transcript does not match the selected recording. Refresh the recording and try again.");
      }
      if (!controller.signal.aborted) setResult({key, value: payload});
    }).catch(error => {
      if (!controller.signal.aborted) setResult({key, error: error instanceof Error ? error.message : "The transcript couldn’t be loaded."});
    });
    return () => controller.abort();
  }, [open, sourceUrl, outputSha256, key, attempt]);
  useEffect(() => {
    const media = mediaRef.current;
    if (!open || !media) return;
    const update = () => setPosition(media.currentTime);
    update();
    media.addEventListener("timeupdate", update);
    media.addEventListener("seeked", update);
    return () => {media.removeEventListener("timeupdate", update); media.removeEventListener("seeked", update);};
  }, [open, mediaRef, key]);
  async function playAt(seconds: number) {
    const media = mediaRef.current;
    if (!media || !current?.value) return;
    setPlaybackError(null);
    try {media.currentTime = seconds; await media.play();}
    catch {if (requestKey.current === key) setPlaybackError("Press play on the recording to continue from this passage.");}
  }
  const passages = current?.value?.segments ?? [];
  const visible = passages.map((passage, index) => ({passage, index})).filter(({passage}) =>
    `${passage.speakerLabel ?? ""} ${passage.text}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <section aria-label="Edited recording transcript" className="rounded-xl border border-border">
    <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)} className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold">
      <span>Read along with this recording</span><span aria-hidden="true">{open ? "−" : "+"}</span>
    </button>
    {open ? <div className="space-y-3 border-t border-border p-4">
      <p className="text-xs text-muted-foreground">Tap a passage to play it. Text and times match this edited recording.</p>
      {!current ? <p role="status" className="text-sm">Loading transcript…</p> : null}
      {current?.error ? <p role="alert" className="text-sm text-destructive">{current.error}</p> : null}
      {current?.value?.notice ? <p role="status" className="text-sm text-muted-foreground">{current.value.notice}</p> : null}
      {current?.value && !passages.length ? <p className="text-sm text-muted-foreground">No transcribed speech is available in this edit yet. You can still listen to or share the recording.</p> : null}
      {passages.length ? <>
        <label className="block text-sm">Find in this transcript<input type="search" value={query} onChange={event => setQuery(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3" /></label>
        <div className="max-h-80 overflow-y-auto overscroll-contain" aria-label="Transcript passages">
          {visible.map(({passage, index}) => <button key={index} type="button" aria-current={position >= passage.startSeconds && position < passage.endSeconds ? "true" : undefined}
            onClick={() => void playAt(passage.startSeconds)} className="my-1 block min-h-11 w-full rounded-lg px-3 py-3 text-left hover:bg-muted aria-[current=true]:bg-primary/10 aria-[current=true]:ring-1 aria-[current=true]:ring-primary/30">
            <span className="block text-xs font-semibold text-muted-foreground">{time(passage.startSeconds)}{passage.speakerLabel ? ` · ${passage.speakerLabel}` : ""}</span>
            <span className="mt-1 block whitespace-pre-wrap break-words text-sm leading-relaxed">{passage.text}</span>
          </button>)}
          {!visible.length ? <p className="py-3 text-sm text-muted-foreground">No passages match your search.</p> : null}
        </div>
      </> : null}
      {playbackError ? <p role="status" className="text-sm">{playbackError}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setAttempt(value => value + 1)} className="min-h-11 rounded-lg border border-border px-3 text-sm">Refresh transcript</button>
        <TranscriptExportDialog title={title} sourceUrl={sourceUrl} label="Export matching transcript" description="Only speech kept in this edited recording is included. Times match the edited file." />
      </div>
    </div> : null}
  </section>;
}
