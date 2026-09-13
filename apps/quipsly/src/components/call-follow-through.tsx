"use client";

import Link from "next/link";
import { CheckCircle2, CircleAlert, FileText, ListTodo, LoaderCircle, PhoneOff, Play } from "lucide-react";
import type { BrowserRecordingHandoff } from "@/lib/browser-source-upload-recovery";

export function CallFollowThrough({ roomId, recording, onOpenWork, onOpenRecording, onRejoin }: {
  roomId: string;
  recording: BrowserRecordingHandoff | null;
  onOpenWork?: () => void;
  onOpenRecording: () => void;
  onRejoin?: () => void;
}) {
  const base = `/sessions/${encodeURIComponent(roomId)}`;
  const pending = recording && recording.phase !== "ready";
  const attention = recording?.phase === "attention";
  return <section aria-label="After the call" className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center py-6 sm:py-10">
    <div className="mb-5 grid size-14 place-items-center rounded-2xl bg-muted"><PhoneOff size={26} aria-hidden="true" /></div>
    <h3 className="text-3xl font-semibold">You’ve left the call</h3>
    <p className="mt-3 text-sm leading-6 text-muted-foreground">Everything for this session stays together. Pick up where you left off.</p>
    {recording ? <div role="status" className="mt-5 flex items-start gap-3 rounded-2xl border border-border bg-muted/40 p-4">
      {attention ? <CircleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        : pending ? <LoaderCircle className="mt-0.5 size-5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          : <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden="true" />}
      <div className="min-w-0">
        <p className="font-semibold">{attention ? "Your recording needs attention" : recording.phase === "recording" || recording.phase === "saving" ? "Finishing your recording" : pending ? "Uploading your recording" : "Your recording is saved"}</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{attention ? "Open recording options to retry the upload or save a copy."
          : pending ? "Keep Quipsly open while it saves. You can work on notes and tasks in the meantime."
            : recording.transcriptHref ? "Listen and edit now. Your transcript will appear as it’s prepared." : "Listen, trim and export. Your original is kept unchanged."}</p>
        {pending ? <button type="button" onClick={onOpenRecording} className="mt-2 min-h-11 text-sm font-semibold underline underline-offset-4">{attention ? "Open recording options" : "View upload progress"}</button> : null}
      </div>
    </div> : null}
    <nav aria-label="Continue session work" className="mt-6 grid gap-3 sm:grid-cols-2">
      {!pending ? <Link onClick={onOpenWork} href={recording?.recordingHref || `${base}?mode=recordings`} className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground sm:col-span-2"><Play size={18} aria-hidden="true" />{recording?.recordingHref ? "Listen and edit recording" : "Open recordings"}</Link> : null}
      {recording?.transcriptHref ? <Link onClick={onOpenWork} href={recording.transcriptHref} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-semibold sm:col-span-2"><FileText size={18} aria-hidden="true" />Open transcript</Link> : null}
      <Link onClick={onOpenWork} href={`${base}?mode=notes`} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-semibold"><FileText size={18} aria-hidden="true" />Notes and recap</Link>
      <Link onClick={onOpenWork} href={`${base}?mode=work`} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-semibold"><ListTodo size={18} aria-hidden="true" />Tasks and goals</Link>
    </nav>
    {onRejoin ? <button type="button" onClick={onRejoin} className="mt-4 min-h-11 self-center px-4 text-sm underline underline-offset-4">Rejoin call</button> : null}
  </section>;
}
