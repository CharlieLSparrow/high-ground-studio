"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Download, Share2, X } from "lucide-react";
import { createTranscriptExport, PARTIAL_TRANSCRIPT_NOTICE, transcriptHasSubtitleTiming, type TranscriptExportFormat, type TranscriptExportPassage } from "@/lib/transcript-export";

const EMPTY: readonly TranscriptExportPassage[] = [];

export function TranscriptExportDialog({title, segments = EMPTY, disabled = false, sourceUrl, description, label = "Export transcript", partial = false}: {
  title: string; segments?: readonly TranscriptExportPassage[]; disabled?: boolean;
  sourceUrl?: string; description?: string; label?: string;
  partial?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<TranscriptExportFormat>("txt");
  const [timestamps, setTimestamps] = useState(true);
  const [speakers, setSpeakers] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<{url: string; output: ReturnType<typeof createTranscriptExport>} | null>(null);
  const [sharing, setSharing] = useState(false);
  const [remote, setRemote] = useState<{sourceUrl: string; segments: TranscriptExportPassage[]; notice?: string; partial?: boolean; error?: string} | null>(null);
  const currentRemote = remote?.sourceUrl === sourceUrl ? remote : null;
  const passages = sourceUrl ? currentRemote?.segments ?? EMPTY : segments;
  const timed = transcriptHasSubtitleTiming(passages);
  useEffect(() => {
    if (!open || !sourceUrl || disabled) return;
    const controller = new AbortController();
    setRemote(null);
    void fetch(`${sourceUrl}?format=json`, {signal: controller.signal, cache: "no-store"})
      .then(async response => {
        const payload = await response.json();
        if (!response.ok || !payload.ok || !Array.isArray(payload.segments)) throw new Error(payload.error || "This transcript couldn’t be loaded.");
        if (!controller.signal.aborted) setRemote({sourceUrl, segments: payload.segments, notice: payload.notice, partial: payload.partial === true});
      }).catch(error => {
        if (!controller.signal.aborted) setRemote({sourceUrl, segments: [], error: error instanceof Error ? error.message : "This transcript couldn’t be loaded."});
      });
    return () => controller.abort();
  }, [open, sourceUrl, disabled]);
  const subtitle = format === "srt" || format === "vtt";
  const output = useMemo(() => {
    if (!open || disabled || !passages.length || (subtitle && !timed)) return null;
    return createTranscriptExport({title, segments: passages, format, timestamps, speakers, partial: partial || currentRemote?.partial, notice: currentRemote?.notice});
  }, [open, disabled, passages, subtitle, timed, title, format, timestamps, speakers, partial, currentRemote?.partial, currentRemote?.notice]);
  const fileUrl = prepared?.output === output ? prepared?.url ?? null : null;
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !disabled) { if (!element.open) element.showModal(); }
    else if (element.open) element.close();
  }, [open, disabled]);
  useEffect(() => {
    setNotice(null);
    if (!output) {setPrepared(null); return;}
    const url = URL.createObjectURL(new Blob([output.content], {type: output.mimeType}));
    setPrepared({url, output});
    return () => URL.revokeObjectURL(url);
  }, [output]);

  async function share() {
    if (!output || sharing) return;
    const data = {title, files: [new File([output.content], output.filename, {type: output.mimeType})]};
    if (!navigator.share || (navigator.canShare && !navigator.canShare(data))) {
      setNotice("File sharing isn’t available in this browser. Use Download instead."); return;
    }
    setSharing(true);
    try {await navigator.share(data); setNotice("Share sheet closed. Your transcript is still available to download.");}
    catch (error) {setNotice(error instanceof Error && error.name === "AbortError" ? "Sharing canceled." : "The file couldn’t be shared. You can download it instead.");}
    finally {setSharing(false);}
  }

  return <>
    <button type="button" disabled={disabled || (!sourceUrl && !segments.length)} onClick={() => {if (sourceUrl) setRemote(null); setOpen(true);}} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"><Download size={16} />{label}</button>
    <dialog ref={dialog} aria-labelledby={headingId} onCancel={() => setOpen(false)} onClose={() => setOpen(false)} className="m-auto max-h-[90dvh] w-[min(36rem,calc(100%-2rem))] overflow-y-auto rounded-2xl border border-border bg-background p-5 text-foreground shadow-xl backdrop:bg-black/50">
      {open && <>
        {partial && <p className="mb-3 rounded-lg bg-muted p-3 text-sm">{PARTIAL_TRANSCRIPT_NOTICE}</p>}
        <div className="flex items-center justify-between gap-3"><h2 id={headingId} className="text-xl font-semibold">Export transcript</h2><button type="button" onClick={() => setOpen(false)} aria-label="Close transcript export" className="grid size-11 place-items-center rounded-lg hover:bg-muted"><X size={20} /></button></div>
        <p className="mt-2 text-sm text-muted-foreground">{description || "Includes your text corrections. Times refer to the recording timeline shown here, not a trimmed export. Export includes the full available transcript, even when you’re searching."}</p>
        {sourceUrl && !currentRemote ? <p role="status" className="mt-3 text-sm">Loading this recording’s transcript…</p> : null}
        {currentRemote?.error ? <p role="alert" className="mt-3 text-sm text-destructive">{currentRemote.error}</p> : null}
        {currentRemote?.notice ? <p role="status" className="mt-3 text-sm text-muted-foreground">{currentRemote.notice}</p> : null}
        {currentRemote && !currentRemote.error && !passages.length ? <p role="status" className="mt-3 text-sm">No transcribed speech is available in this edited recording yet.</p> : null}
        <label className="mt-5 block text-sm font-medium">File format<select value={format} onChange={event => setFormat(event.target.value as TranscriptExportFormat)} className="mt-1 block min-h-11 w-full rounded-lg border border-border bg-background px-3"><option value="txt">Plain text (.txt)</option><option value="md">Markdown (.md)</option><option value="srt" disabled={!timed}>Subtitles (.srt)</option><option value="vtt" disabled={!timed}>Web subtitles (.vtt)</option></select></label>
        <div className="my-3 flex flex-wrap gap-x-5"><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={subtitle || timestamps} disabled={subtitle} onChange={event => setTimestamps(event.target.checked)} />Include timestamps</label><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={speakers} onChange={event => setSpeakers(event.target.checked)} />Include speaker names</label></div>
        {passages.length > 0 && !timed && <p className="text-sm text-muted-foreground">Some passages don’t have usable timing. Text formats are available; subtitles need timed passages.</p>}
        {output && <details className="rounded-lg border border-border p-3"><summary className="min-h-8 cursor-pointer text-sm font-medium">Preview file</summary><pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words text-xs" aria-label="Transcript export preview">{output.content}</pre></details>}
        <div className="mt-5 flex flex-wrap gap-3">{output && fileUrl ? <a href={fileUrl} download={output.filename} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"><Download size={16} />Download {format.toUpperCase()}</a> : null}<button type="button" disabled={!output || sharing} onClick={() => void share()} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold disabled:opacity-50"><Share2 size={16} />{sharing ? "Sharing…" : "Share file"}</button></div>
        {notice && <p role="status" className="mt-3 text-sm text-muted-foreground">{notice}</p>}
      </>}
    </dialog>
  </>;
}
