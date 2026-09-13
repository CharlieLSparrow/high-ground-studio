"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { SessionReadinessTopology } from "./session-readiness-topology";
import type { SessionSourceEvidence } from "./session-source-evidence-model";

const RecordingToolsActive = createContext(true);
export function useRecordingToolsActive() { return useContext(RecordingToolsActive); }

// Diagnostics stay reachable through existing source-specific links, including
// links opened from another screen. Opening details never changes recording data.
function RecordingDisclosure({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  const parentActive = useRecordingToolsActive();
  useEffect(() => {
    function revealTarget() {
      let id: string;
      try { id = decodeURIComponent(window.location.hash.slice(1)); } catch { return; }
      const target = id ? document.getElementById(id) : null;
      if (!target || !ref.current?.contains(target)) return;
      setOpen(true);
      let details = target.closest("details");
      while (details && ref.current.contains(details)) {
        details.open = true;
        details = details.parentElement?.closest("details") ?? null;
      }
      target.scrollIntoView?.({ block: "start" });
    }
    revealTarget();
    window.addEventListener("hashchange", revealTarget);
    return () => window.removeEventListener("hashchange", revealTarget);
  }, []);
  return <details ref={ref} id={id} onToggle={event => setOpen(event.currentTarget.open)} className="rounded-2xl border border-[#ddcdaf] bg-[#fffdf8] p-4 sm:p-5">
    <summary className="min-h-11 cursor-pointer content-center text-sm font-bold text-[#5b472f]">{label}</summary>
    <RecordingToolsActive.Provider value={parentActive && open}>
      <div className="mt-4 space-y-5">{children}</div>
    </RecordingToolsActive.Provider>
  </details>;
}

export function RecordingDetails({ children }: { children: ReactNode }) {
  return <RecordingDisclosure id="session-recording-details" label="Recording details & troubleshooting">{children}</RecordingDisclosure>;
}

export function OriginalRecordings({ children }: { children: ReactNode }) {
  return <RecordingDisclosure id="session-original-recordings" label="Original recordings">{children}</RecordingDisclosure>;
}

export function RecordingUploadStatus({ topology, evidence, sourceIds = null }: {
  topology: SessionReadinessTopology;
  evidence: SessionSourceEvidence;
  /** The selected attempt's full track set, not just its currently playing track. */
  sourceIds?: string[] | null;
}) {
  const scoped = sourceIds !== null;
  const selectedIds = new Set(sourceIds ?? []);
  const selected = evidence.sources.filter(source => !scoped || selectedIds.has(source.recordingAssetId));
  const saved = scoped ? selected.filter(source => source.status === "VERIFIED_MATCH").length : evidence.counts.VERIFIED_MATCH;
  const held = scoped ? selected.filter(source => source.status === "HELD" || source.status === "DRIFT").length : evidence.counts.HELD + evidence.counts.DRIFT;
  const incomplete = scoped ? selected.filter(source => source.status === "INCOMPLETE").length : evidence.counts.INCOMPLETE;
  const unknown = scoped && selected.length < selectedIds.size;
  // Queue receipts describe an installation, often across several attempts.
  // Neither their age nor a saved file proves the remaining queue is resolved.
  const queues = topology.people.flatMap(person => person.endpointQueues
    .filter(queue => queue.queueState !== "DRAINED")
    .map(queue => ({person, queue})));
  const awaiting = [...topology.people.flatMap(person => person.sources), ...topology.unassignedSources]
    .filter(source => source.serverRetention.state === "CAPTURE_AWAITING_MEDIA");
  const missingPlanned = topology.expectedSources.filter(source => source.status === "active" && source.blocking);
  const problemSources = evidence.sources.filter(source => source.status !== "VERIFIED_MATCH");
  const hasRecovery = queues.length > 0 || problemSources.length > 0 || awaiting.length > 0 || missingPlanned.length > 0
    || evidence.counts.HELD + evidence.counts.DRIFT + evidence.counts.INCOMPLETE > 0 || topology.exitReadiness.pendingCaptureCount > 0;
  const selectedProblem = scoped && (held > 0 || incomplete > 0 || unknown);
  const title = selectedProblem
    ? held > 0 ? "This recording needs attention" : "This recording is not ready yet"
    : saved > 0 ? scoped ? saved === 1 ? "Recording saved" : `${saved} tracks saved` : `${saved} ${saved === 1 ? "recording saved" : "recordings saved"}`
      : !scoped && held > 0 ? "A recording needs attention"
        : !scoped && hasRecovery ? "Waiting for recordings"
          : "Recordings will appear here";
  return <section aria-label="Recording upload status" className="rounded-2xl border border-quipsly-divider bg-quipsly-surface p-4">
    <h2 className="font-semibold text-quipsly-ink">{title}</h2>
    <p className="mt-1 text-sm leading-6 text-quipsly-ink-soft">
      {selectedProblem ? "Some tracks in this take are not ready to play. Saved originals are unchanged; see the recording details below."
        : saved > 0 ? "Listen below or open the transcript to continue editing."
          : !scoped && hasRecovery ? "Open Quipsly on the device you recorded with to resume any unfinished uploads. You can keep working here."
            : "Record a call or import an audio or video file. Quipsly will prepare it here."}
    </p>
    {hasRecovery ? <details className="mt-2 border-t border-quipsly-divider pt-2" aria-label="Recording recovery">
      <summary className="min-h-11 cursor-pointer content-center text-sm font-medium text-quipsly-ink">
        Uploads and recording issues{queues.length ? ` · ${queues.length} ${queues.length === 1 ? "device" : "devices"} to check` : ""}
      </summary>
      <p className="mb-3 text-sm leading-6 text-quipsly-ink-soft">These reports cover the session’s recording attempts. They do not change files already saved. Keep Quipsly open on a device with unfinished uploads so it can resume them.</p>
      <ul className="space-y-3 text-sm text-quipsly-ink">
        {queues.map(({person, queue}) => <li key={queue.id}>
          <p className="font-semibold">{person.label} · {queue.deviceLabel}</p>
          <p className="text-quipsly-ink-soft">{queue.failedSourceCount > 0 ? `${queue.failedSourceCount} ${queue.failedSourceCount === 1 ? "upload needs" : "uploads need"} a retry.` : queue.pendingSourceCount > 0 ? `${queue.pendingSourceCount} ${queue.pendingSourceCount === 1 ? "upload is" : "uploads are"} not yet confirmed.` : "This device last reported unfinished recordings."}</p>
          {Number.isFinite(Date.parse(queue.reconciledAt)) ? <p className="text-xs text-quipsly-ink-soft">Last report: <time dateTime={queue.reconciledAt}>{new Date(queue.reconciledAt).toISOString().replace("T", " ").slice(0, 16)} UTC</time></p> : null}
        </li>)}
        {problemSources.map(source => <li key={source.recordingAssetId}><p className="font-semibold">{source.fileName}</p><p className="text-quipsly-ink-soft">{source.status === "INCOMPLETE" ? "The saved file is not ready to play yet." : "This source needs attention before it can be used."}</p></li>)}
        {awaiting.map(source => <li key={source.id}><p className="font-semibold">{source.label}</p><p className="text-quipsly-ink-soft">The recording device has not delivered this file yet.</p></li>)}
        {missingPlanned.map(source => <li key={source.id}><p className="font-semibold">{source.label}</p><p className="text-quipsly-ink-soft">An extra source listed for this session has not arrived. You can change the source list in recording details.</p></li>)}
      </ul>
      <a href="#session-readiness-topology-heading" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-quipsly-ink underline underline-offset-4">View recording details</a>
    </details> : selectedProblem ? <a href="#source-evidence-heading" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-quipsly-ink underline underline-offset-4">View recording details</a> : null}
  </section>;
}
