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

export function RecordingUploadStatus({ topology, evidence }: {
  topology: SessionReadinessTopology;
  evidence: SessionSourceEvidence;
}) {
  const pendingPeople = topology.people.filter((person) =>
    person.endpointQueues.some((queue) => queue.queueState !== "DRAINED"),
  );
  const hasPendingUpload = pendingPeople.length > 0 || topology.exitReadiness.pendingCaptureCount > 0;
  const hasFailedUpload = pendingPeople.some((person) => person.endpointQueues.some((queue) => queue.failedSourceCount > 0));
  const needsAttention = evidence.counts.HELD + evidence.counts.DRIFT > 0 || hasFailedUpload;
  const missingPlanned = topology.expectedSources.some((source) => source.status === "active" && source.blocking);
  const saved = evidence.counts.VERIFIED_MATCH;
  const title = needsAttention ? "A recording needs attention"
    : hasPendingUpload ? "Recording upload in progress"
      : missingPlanned ? "An expected recording hasn't arrived"
        : saved > 0 ? `${saved} ${saved === 1 ? "recording saved" : "recordings saved"}`
          : "Recordings will appear here";
  return <section aria-label="Recording upload status" className={`rounded-2xl border p-4 ${needsAttention || hasPendingUpload || missingPlanned ? "border-[#d6b986] bg-[#fff5df]" : "border-[#ccd4bf] bg-[#f3f5eb]"}`}>
    <h2 className="font-bold text-[#3d3122]">{title}</h2>
    <p className="mt-1 text-sm leading-6 text-[#5b472f]">
      {hasPendingUpload
        ? `${pendingPeople.length ? `${pendingPeople.map((person) => person.label).join(", ")}: keep` : "Keep"} Quipsly open on the recording devices that are still uploading. You can work with recordings already saved below.`
        : needsAttention ? "Your saved originals are unchanged. Open recording details to see the affected recording and recovery options."
          : missingPlanned ? "You can work with saved recordings now. Check recording details for the missing source."
            : saved > 0 ? "Listen below or open the transcript to continue editing. Your originals stay unchanged."
              : "Record a call or import an audio or video file. Quipsly will prepare it here."}
    </p>
    {needsAttention || hasPendingUpload || missingPlanned ? <a href="#session-readiness-topology-heading" className="mt-2 inline-flex min-h-11 items-center text-sm font-bold text-[#41624b] underline underline-offset-4">View recording details</a> : null}
  </section>;
}
