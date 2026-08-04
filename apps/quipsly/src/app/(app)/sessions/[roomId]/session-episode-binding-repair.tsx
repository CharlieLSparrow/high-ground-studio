"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Link2, LoaderCircle, ShieldAlert } from "lucide-react";

import type { SessionEpisodeBindingRepairState } from "./session-collaboration-model";

export function SessionEpisodeBindingRepair({
  roomId,
  state,
}: {
  roomId: string;
  state: SessionEpisodeBindingRepairState;
}) {
  const router = useRouter();
  const requestId = useRef<string | null>(null);
  const [episodeSlug, setEpisodeSlug] = useState(state.candidates[0]?.slug || "");
  const [confirmRebind, setConfirmRebind] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!state.canRepair) {
    return (
      <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-950">
        A Session host, producer, or Nest owner/editor can repair this relationship. Recording and evidence remain available here in the meantime.
      </p>
    );
  }
  if (!state.candidates.length) {
    return (
      <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-950">
        This Nest has no Episode Room to choose yet. Create the Episode Room first, then return here; Quipsly will not invent one from the Session title.
      </p>
    );
  }

  async function repair() {
    if (!episodeSlug || busy) return;
    if (state.currentRelationshipInvalid && (!confirmRebind || reason.trim().length < 8)) {
      setMessage("Confirm the rebind and explain the correction in at least eight characters.");
      return;
    }
    requestId.current ||= crypto.randomUUID();
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(roomId)}/episode-binding`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          episodeSlug,
          requestId: requestId.current,
          expectedRoomUpdatedAt: state.roomUpdatedAt,
          confirmRebind: state.currentRelationshipInvalid ? confirmRebind : false,
          reason: state.currentRelationshipInvalid ? reason.trim() : null,
        }),
      });
      const body = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !body.ok) {
        throw new Error(body.error || "Quipsly could not repair this Episode relationship.");
      }
      setMessage("Episode relationship repaired. Refreshing the exact Session and Episode Room links…");
      requestId.current = null;
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Quipsly could not repair this Episode relationship.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
      <div className="flex items-start gap-2">
        <ShieldAlert size={17} className="mt-0.5 shrink-0 text-amber-800" aria-hidden="true" />
        <div>
          <p className="text-xs font-black text-amber-950">Choose the exact Episode Room</p>
          <p className="mt-1 text-[11px] font-semibold leading-5 text-amber-900">This changes only canonical production continuity. It does not move or edit recordings, transcripts, participants, threads, calendar events, invitations, or publications.</p>
        </div>
      </div>
      <label className="mt-3 block text-[10px] font-black uppercase tracking-wide text-amber-950" htmlFor={`episode-binding-${roomId}`}>Episode Room</label>
      <select
        id={`episode-binding-${roomId}`}
        value={episodeSlug}
        onChange={(event) => setEpisodeSlug(event.target.value)}
        disabled={busy}
        className="mt-1 min-h-11 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-bold text-[#3d3122] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 disabled:opacity-60"
      >
        {state.candidates.map((candidate) => (
          <option key={candidate.id} value={candidate.slug}>{candidate.title} · {candidate.status}</option>
        ))}
      </select>
      {state.currentRelationshipInvalid ? (
        <div className="mt-3 space-y-2">
          <label className="flex min-h-11 items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-950">
            <input type="checkbox" checked={confirmRebind} onChange={(event) => setConfirmRebind(event.target.checked)} disabled={busy} />
            Replace the invalid existing relationship
          </label>
          <label className="block text-[10px] font-black uppercase tracking-wide text-rose-950" htmlFor={`episode-binding-reason-${roomId}`}>Audit reason</label>
          <textarea
            id={`episode-binding-reason-${roomId}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={busy}
            rows={2}
            maxLength={500}
            placeholder="Why is this Session being rebound?"
            className="w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-[#3d3122] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700 disabled:opacity-60"
          />
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => void repair()}
        disabled={busy || !episodeSlug}
        className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-amber-900 px-4 py-2 text-xs font-black uppercase tracking-wide text-white disabled:opacity-50"
      >
        {busy ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> : <Link2 size={15} aria-hidden="true" />}
        {busy ? "Repairing relationship" : "Bind exact Episode Room"}
      </button>
      {message ? <p role="status" className="mt-2 text-xs font-bold leading-5 text-amber-950">{message}</p> : null}
    </div>
  );
}
