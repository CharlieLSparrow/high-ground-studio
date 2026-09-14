"use client";

import Link from "next/link";
import { CheckCircle2, CircleAlert, FileText, ListTodo, LoaderCircle, MessageSquareText, PhoneOff, Play } from "lucide-react";
import type { BrowserRecordingHandoff } from "@/lib/browser-source-upload-recovery";
import { useSessionAfterCall } from "@/hooks/use-session-after-call";

export function CallFollowThrough({ roomId, recording, onOpenWork, onOpenNotes, onOpenTasks, onOpenChat, onOpenRecording, onRejoin }: {
  roomId: string;
  recording: BrowserRecordingHandoff | null;
  onOpenWork?: () => void;
  onOpenNotes?: (noteId?: string) => void;
  onOpenTasks?: () => void;
  onOpenChat?: () => void;
  onOpenRecording: () => void;
  onRejoin?: () => void;
}) {
  const base = `/sessions/${encodeURIComponent(roomId)}`;
  const pending = recording && recording.phase !== "ready";
  const attention = recording?.phase === "attention";
  const { summary, error, retry } = useSessionAfterCall(roomId, recording?.phase);
  const work = summary?.followThrough;
  const sharedRecordingAvailable = Boolean(summary?.recordings.uploaded);
  const sharedTranscriptExists = summary && Object.values(summary.transcripts).some(count => count > 0);
  const recordingHref = !pending && recording?.recordingHref ? recording.recordingHref
    : `${base}?mode=recordings${summary?.recordingSourceId ? `&source=${encodeURIComponent(summary.recordingSourceId)}` : ""}`;
  const transcriptHref = summary && summary.recordings.uploaded + summary.recordings.pending + summary.recordings.attention > 1
    ? `${base}?mode=transcript`
    : recording?.transcriptHref || `${base}?mode=transcript${summary?.transcriptSourceId ? `&source=${encodeURIComponent(summary.transcriptSourceId)}` : ""}`;
  const actionClass = "flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-semibold hover:bg-muted";
  return <section aria-label="After the call" className="mx-auto flex w-full max-w-2xl flex-1 flex-col py-4 sm:py-6">
    <header className="flex items-center gap-3">
      <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-muted"><PhoneOff size={22} aria-hidden="true" /></div>
      <div><h3 className="text-xl font-semibold sm:text-2xl">You’ve left the call</h3>
        <p className="mt-1 text-sm text-muted-foreground">Pick up your work here.</p></div>
    </header>
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
    <nav aria-label="Continue session work" className="mt-5 grid grid-cols-2 gap-2 sm:gap-3">
      {!pending || sharedRecordingAvailable ? <Link onClick={onOpenWork} href={recordingHref} className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground col-span-2"><Play size={18} aria-hidden="true" />{pending ? "Open session recordings" : recording?.recordingHref || sharedRecordingAvailable ? "Listen and edit recording" : "Open recordings"}</Link> : null}
      {recording?.transcriptHref || sharedTranscriptExists ? <Link onClick={onOpenWork} href={transcriptHref} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-semibold col-span-2"><FileText size={18} aria-hidden="true" />{recording?.transcriptHref || summary?.transcripts.available ? "Open transcript" : "Check transcription"}</Link> : null}
      {onOpenNotes ? <button type="button" onClick={() => onOpenNotes()} className={actionClass}><FileText size={18} aria-hidden="true" />Notes and recap</button>
        : <Link onClick={onOpenWork} href={`${base}?mode=notes`} className={actionClass}><FileText size={18} aria-hidden="true" />Notes and recap</Link>}
      {onOpenTasks ? <button type="button" onClick={onOpenTasks} className={actionClass}><ListTodo size={18} aria-hidden="true" />Tasks and goals</button>
        : <Link onClick={onOpenWork} href={`${base}?mode=work`} className={actionClass}><ListTodo size={18} aria-hidden="true" />Tasks and goals</Link>}
      {onOpenChat ? <button type="button" onClick={onOpenChat} className={`${actionClass} col-span-2`}><MessageSquareText size={18} aria-hidden="true" />Continue conversation</button>
        : <Link onClick={onOpenWork} href={`${base}?mode=conversation`} className={`${actionClass} col-span-2`}><MessageSquareText size={18} aria-hidden="true" />Continue conversation</Link>}
    </nav>
    {onRejoin ? <button type="button" onClick={onRejoin} className="mt-2 min-h-11 self-center px-4 text-sm underline underline-offset-4">Rejoin call</button> : null}
    {summary ? <div className="mt-5 rounded-2xl border border-border p-4" aria-label="Session updates" aria-live="polite">
      <h4 className="text-sm font-semibold">{summary.otherRecordingCount ? "Latest recording" : "In this session"}</h4>
      {Boolean(summary.otherRecordingCount) && <Link href={`${base}?mode=recordings`} onClick={onOpenWork}
        className="mt-1 inline-flex min-h-11 items-center text-sm underline underline-offset-4">
        View all session recordings
      </Link>}
      <p className="mt-2 text-sm text-muted-foreground">{sharedRecordingAvailable
        ? `${summary.recordings.uploaded} uploaded recording${summary.recordings.uploaded === 1 ? "" : "s"} available`
        : summary.recordings.pending ? "Recordings are arriving from your devices."
          : summary.recordings.attention ? "An upload needs attention."
            : recording ? "Other device recordings appear here as they upload."
              : "No recordings have arrived yet. Recordings saved on a phone appear here after upload."}</p>
      {summary.recordings.pending > 0 && sharedRecordingAvailable ? <p className="mt-1 text-sm text-muted-foreground">{summary.recordings.pending} more uploading or being checked.</p> : null}
      {summary.recordings.attention > 0 ? <Link href={`${base}?mode=recordings`} onClick={onOpenWork} className="mt-2 inline-flex min-h-11 items-center text-sm underline underline-offset-4">Check {summary.recordings.attention} recording{summary.recordings.attention === 1 ? "" : "s"} needing attention</Link> : null}
      {summary.transcripts.available > 0 ? <p className="mt-2 text-sm">{summary.transcripts.available} transcript{summary.transcripts.available === 1 ? "" : "s"} available to open and edit.</p> : null}
      {summary.transcripts.processing > 0 ? <p className="mt-2 text-sm text-muted-foreground">Transcribing {summary.transcripts.processing} recording{summary.transcripts.processing === 1 ? "" : "s"}… You can keep working here.</p> : null}
      {summary.transcriptIssues?.length ? <ul aria-label="Recording next steps" className="mt-3 space-y-3">{summary.transcriptIssues.map(issue => <li key={issue.recordingAssetId} className="rounded-xl border border-border p-3">
        <p className="text-sm leading-6 text-muted-foreground">{issue.message}</p>
        <div className="flex flex-wrap gap-x-4">
          <Link href={`${base}?mode=recordings&source=${encodeURIComponent(issue.recordingAssetId)}`} onClick={onOpenWork} className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">Listen to recording</Link>
          {issue.retryable ? <Link href={`${base}?mode=transcript&source=${encodeURIComponent(issue.recordingAssetId)}`} onClick={onOpenWork} className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">Open transcription</Link> : null}
          {issue.failureCode === "NO_AUDIO_SIGNAL" && onRejoin ? <button type="button" onClick={onRejoin} className="min-h-11 text-sm font-semibold underline underline-offset-4">Return to call</button> : null}
        </div>
      </li>)}</ul> : summary.transcripts.attention > 0 ? <p className="mt-2 text-sm text-muted-foreground">Transcription couldn't finish for {summary.transcripts.attention} recording{summary.transcripts.attention === 1 ? "" : "s"}. Your recordings and other work are still available.</p> : null}
    </div> : error ? <div className="mt-5 text-sm text-muted-foreground"><p>{error}</p><button type="button" onClick={retry} className="mt-1 min-h-11 underline underline-offset-4">Refresh session updates</button></div> : null}
    {work?.recap ? <section aria-label="Session recap" className="mt-5 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3"><h4 className="font-semibold">{work.recap.title}</h4>
        <span className="shrink-0 text-xs text-muted-foreground">{work.recap.visibility === "AUTHOR_PRIVATE" ? "Only you" : work.recap.visibility === "PROJECT_TEAM" ? "Project team" : "Shared"}</span></div>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{work.recap.excerpt}</p>
      {onOpenNotes ? <button type="button" onClick={() => onOpenNotes(work.recap!.id)} className="mt-2 min-h-11 text-sm font-semibold underline underline-offset-4">Open recap</button>
        : <Link href={`${base}?mode=notes`} onClick={onOpenWork} className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">Open recap</Link>}
    </section> : null}
    {work && work.nextSteps.length > 0 ? <section aria-label="Session next steps" className="mt-5 rounded-2xl border border-border bg-card p-4">
      <h4 className="font-semibold">Next steps in this session</h4>
      <p className="mt-1 text-xs text-muted-foreground">{work.openTasks} open {work.openTasks === 1 ? "task" : "tasks"} · {work.openGoals} {work.openGoals === 1 ? "goal" : "goals"}</p>
      <ul className="mt-3 divide-y divide-border">{work.nextSteps.map(entry => <li key={entry.id} className="py-3 first:pt-0 last:pb-0">
        <p className="break-words text-sm font-medium">{entry.title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{entry.kind === "GOAL" ? "Goal" : "Task"} · {entry.ownerLabel}{entry.visibility === "AUTHOR_PRIVATE" ? " · Only you" : " · Shared"}</p>
      </li>)}</ul>
    </section> : null}
  </section>;
}
