"use client";

import { CheckCircle2, Ear, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";

import type { AudibleEventReviewDecision } from "@/lib/audio/audible-event-review";

import type { SessionSourceClockAttentionItem } from "./session-source-clock-attention";

function secondBins(startSeconds: number, endSeconds: number) {
  if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || endSeconds <= startSeconds) return [];
  const start = Math.floor(startSeconds);
  const end = Math.max(start, Math.ceil(endSeconds) - 1);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function clientRequestId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `audible-review-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const decisionLabels: Record<AudibleEventReviewDecision, string> = {
  confirmed: "Audible event confirmed",
  "false-positive": "Detector false positive",
  "needs-comparison": "Needs source comparison",
};

export function SessionAudibleEventDecision({
  item,
  listenedSecondBins,
  onSaved,
}: {
  item: SessionSourceClockAttentionItem;
  listenedSecondBins: ReadonlySet<number>;
  onSaved: () => void;
}) {
  const target = item.decisionTarget?.kind === "AUDIBLE_EVENT_REVIEW" ? item.decisionTarget : null;
  const [decision, setDecision] = useState<AudibleEventReviewDecision>("confirmed");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const requiredBins = useMemo(
    () => target ? secondBins(target.contextStartSeconds, target.contextEndSeconds) : [],
    [target],
  );
  const observedBins = requiredBins.filter((bin) => listenedSecondBins.has(bin));
  const listened = requiredBins.length > 0 && observedBins.length === requiredBins.length;
  const noteRequired = decision !== "confirmed";

  if (!target) return null;

  async function save() {
    const activeTarget = target;
    if (!activeTarget || !listened || busy || (noteRequired && note.trim().length < 2)) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/media-vault/audible-event-reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectSlug: item.source.projectSlug,
          assetId: item.source.mediaAssetId,
          sourceId: item.source.sourceId,
          action: "review-suggestion",
          analysisId: activeTarget.analysisId,
          eventId: activeTarget.eventId,
          clientRequestId: clientRequestId(),
          decision,
          playbackEvidence: {
            protectedPlaybackSourceId: item.source.sourceId,
            contextStartSeconds: activeTarget.contextStartSeconds,
            contextEndSeconds: activeTarget.contextEndSeconds,
            listenedSecondBins: requiredBins,
            clientTrackedPlaybackIsNotProofOfAudibility: true,
          },
          note: note.trim() || null,
        }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || `Listening decision returned HTTP ${response.status}.`);
      setMessage(`${decisionLabels[decision]} saved as append-only evidence. No repair or edit was authorized.`);
      setNote("");
      onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The listening decision could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="mt-3 rounded-xl border border-fuchsia-200 bg-white p-3" aria-label={`Listening decision for ${item.title}`}>
    <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-fuchsia-900"><Ear size={14} aria-hidden="true" />Detector listening conclusion</p>
    <p className="mt-1 text-[10px] font-semibold leading-4 text-[#765f40]">Current state: {item.reviewState}. Listen through {target.contextStartSeconds.toFixed(2)}–{target.contextEndSeconds.toFixed(2)}s before adding a new receipt.</p>
    <div className="mt-2 flex flex-wrap items-end gap-2">
      <label className="text-[10px] font-black uppercase tracking-wide text-[#765f40]">Conclusion
        <select aria-label={`Conclusion for ${item.title}`} value={decision} onChange={(event) => setDecision(event.target.value as AudibleEventReviewDecision)} className="mt-1 block min-h-11 rounded-lg border border-fuchsia-200 bg-white px-3 text-xs font-black text-[#3d3122]">
          <option value="confirmed">Audible event confirmed</option>
          <option value="false-positive">Detector false positive</option>
          <option value="needs-comparison">Needs source comparison</option>
        </select>
      </label>
      <span className={`inline-flex min-h-11 items-center rounded-lg border px-3 text-[10px] font-black ${listened ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-950"}`}>
        {listened ? <><CheckCircle2 size={14} className="mr-1.5" aria-hidden="true" />Complete context observed</> : `${observedBins.length}/${requiredBins.length} source-clock seconds observed`}
      </span>
    </div>
    <label className="mt-2 block text-[10px] font-black uppercase tracking-wide text-[#765f40]">Listening note {noteRequired ? "(required)" : "(optional)"}
      <textarea aria-label={`Listening note for ${item.title}`} value={note} onChange={(event) => setNote(event.target.value)} placeholder="What did you hear, or what comparison is still needed?" className="mt-1 min-h-16 w-full rounded-lg border border-fuchsia-200 bg-white px-3 py-2 text-xs font-semibold text-[#3d3122] placeholder:text-[#9c896e]" />
    </label>
    <button type="button" onClick={() => void save()} disabled={!listened || busy || (noteRequired && note.trim().length < 2)} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-full bg-fuchsia-700 px-4 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40">
      {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <CheckCircle2 size={14} aria-hidden="true" />}
      {busy ? "Saving exact-source receipt…" : "Save listening conclusion"}
    </button>
    {message ? <p role="status" className="mt-2 rounded-lg border border-fuchsia-100 bg-fuchsia-50 p-2 text-[10px] font-bold leading-4 text-fuchsia-950">{message}</p> : null}
    <p className="mt-2 text-[9px] font-bold uppercase tracking-wide text-[#9c896e]">Playback tracking supports the explicit decision; it is not independent proof of audibility. This receipt changes no source, repair, timeline, or promotion.</p>
  </div>;
}
