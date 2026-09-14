"use client";

import { CircleAlert, MicOff, Radio } from "lucide-react";
import { projectBrowserRecordingHealth, type BrowserRecordingDirective } from "@/lib/browser-recording-directive";

/** One compact view of the existing coordinated recording receipts, not a
 * second source of recording state. A command alone is never a green light. */
export function CallRecordingStatus({ directive, unavailable, localRecording, muted, onOpen }: {
  directive: BrowserRecordingDirective;
  unavailable: boolean;
  localRecording: boolean;
  muted: boolean;
  onOpen?: () => void;
}) {
  const health = projectBrowserRecordingHealth(directive);
  const count = directive.recordingHealth;
  const recording = directive.shouldRecord;
  const pending = health.participants.filter(person => person.state !== "RECORDING");
  const title = unavailable ? "Recording status reconnecting"
    : recording && count.expectedParticipantCount > 0
      ? `${count.recordingParticipantCount} of ${count.expectedParticipantCount} ${count.expectedParticipantCount === 1 ? "person" : "people"} recording`
      : health.title;
  const detail = unavailable ? "Status updates will resume automatically. Check each device before continuing."
    : recording && pending.length ? `${pending.slice(0, 2).map(person => `${person.participantLabel}: ${person.label.toLowerCase()}`).join(" · ")}${pending.length > 2 ? ` · +${pending.length - 2} more` : ""}`
      : recording ? "Local recordings are running."
        : health.detail;
  return <section aria-label="Call recording status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-card px-3 py-2 text-sm">
    <div className="min-w-0 flex-1" role="status">
      <p className="flex items-center gap-2 font-semibold">
        {unavailable || health.tone === "attention" ? <CircleAlert size={16} className="shrink-0" aria-hidden="true" /> : <Radio size={16} className="shrink-0" aria-hidden="true" />}
        {title}
      </p>
      <p className="mt-1 break-words text-xs text-muted-foreground">{detail}</p>
      {localRecording && muted ? <p className="mt-1 flex items-center gap-2 text-xs"><MicOff size={14} aria-hidden="true" />Your microphone is muted in the call and recording.</p> : null}
    </div>
    {onOpen ? <button type="button" onClick={onOpen} className="min-h-11 shrink-0 rounded-lg px-3 text-xs font-semibold underline underline-offset-4">Recording details</button> : null}
  </section>;
}
