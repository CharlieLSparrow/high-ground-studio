"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, LoaderCircle, SlidersHorizontal, Sparkles, TriangleAlert } from "lucide-react";

type MixStatus = {
  jobId: string | null;
  status: "not-queued" | "queued" | "processing" | "output-ready" | "completed" | "failed";
  proposalId: string | null;
  programFingerprintSha256: string | null;
  actionCount: number;
  unresolvedCount: number;
  preview: null | { assetId: string; playbackUrl: string | null; sha256: string; durationSeconds: number; integratedLufs: number; truePeakDbtp: number };
  error: string | null;
  updatedAt: string | null;
};

const EMPTY: MixStatus = { jobId: null, status: "not-queued", proposalId: null, programFingerprintSha256: null, actionCount: 0, unresolvedCount: 0, preview: null, error: null, updatedAt: null };

export function EpisodeAudioMixDesk({ projectId, projectSlug, episodeProductionId, programFingerprintSha256, canWrite, eligible, eligibilityDetail }: { projectId: string; projectSlug: string; episodeProductionId: string; programFingerprintSha256: string | null; canWrite: boolean; eligible: boolean; eligibilityDetail: string }) {
  const [status, setStatus] = useState<MixStatus>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const sequence = useRef(0);
  const coordinates = useCallback(() => ({ projectId, projectSlug, episodeProductionId }), [episodeProductionId, projectId, projectSlug]);

  const request = useCallback(async (operation?: "queue" | "reconcile", signal?: AbortSignal) => {
    const id = ++sequence.current;
    const response = operation
      ? await fetch("/api/media-vault/episode-audio-program/mix", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...coordinates(), operation }), signal })
      : await fetch(`/api/media-vault/episode-audio-program/mix?${new URLSearchParams(coordinates())}`, { cache: "no-store", signal });
    const payload = await response.json().catch(() => null) as ({ ok?: boolean; error?: string } & Partial<MixStatus>) | null;
    if (!response.ok || !payload?.ok || !payload.status) throw new Error(payload?.error || `Episode mix returned HTTP ${response.status}.`);
    if (id === sequence.current) setStatus({ ...EMPTY, ...payload } as MixStatus);
    return payload as MixStatus;
  }, [coordinates]);

  useEffect(() => {
    const controller = new AbortController();
    setStatus(EMPTY);
    setNotice(null);
    void request(undefined, controller.signal).catch((error) => { if (!controller.signal.aborted) setNotice(error instanceof Error ? error.message : "Could not read the Episode mix."); });
    return () => controller.abort();
  }, [request, programFingerprintSha256]);

  useEffect(() => {
    if (!["queued", "processing", "output-ready"].includes(status.status)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const operation = status.status === "output-ready" ? "reconcile" as const : undefined;
      void request(operation, controller.signal).catch((error) => { if (!controller.signal.aborted) setNotice(error instanceof Error ? error.message : "Could not refresh the Episode mix."); });
    }, 1_400);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [request, status.status, status.updatedAt]);

  const queue = async () => {
    setBusy(true);
    setNotice("Building an immutable proposal from the current program, reviews, and exact source receipts.");
    try {
      const next = await request("queue");
      setNotice(next.actionCount ? `Proposed ${next.actionCount} evidence-linked gain move${next.actionCount === 1 ? "" : "s"}. Rendering a mastered preview now.` : "No reviewed event safely authorized gain automation. Rendering a transparent baseline mix for comparison.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not queue the Episode mix."); }
    finally { setBusy(false); }
  };

  const working = busy || status.status === "queued" || status.status === "processing" || status.status === "output-ready";
  const stale = Boolean(status.programFingerprintSha256 && programFingerprintSha256 && status.programFingerprintSha256 !== programFingerprintSha256);

  return (
    <section className="rounded-2xl border border-violet-300 bg-gradient-to-br from-violet-950 via-slate-950 to-slate-900 p-4 text-white shadow-xl sm:p-5" aria-labelledby="episode-mix-heading">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.15em] text-violet-200"><Sparkles className="h-4 w-4" aria-hidden="true" /> Mix proposal lab</div>
          <h2 id="episode-mix-heading" className="mt-1 text-xl font-black">Automatic, inspectable, undoable</h2>
          <p className="mt-2 max-w-3xl text-xs font-semibold leading-5 text-slate-300">Quipsly may write gain automation only from a protected human listening conclusion and an unambiguous canonical primary. It never edits retained tracks or promotes the result automatically.</p>
        </div>
        <span className={`self-start rounded-full border px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.12em] ${status.status === "completed" && !stale ? "border-emerald-500 bg-emerald-950 text-emerald-100" : status.status === "failed" || stale ? "border-rose-500 bg-rose-950 text-rose-100" : working ? "border-amber-400 bg-amber-950 text-amber-100" : "border-slate-600 bg-slate-900 text-slate-200"}`}>{stale ? "program changed" : status.status.replaceAll("-", " ")}</span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <Metric label="Proposed moves" value={status.actionCount} detail="Every move names its review receipt." />
        <Metric label="Held for judgment" value={status.unresolvedCount} detail="Ambiguity stays visible, never guessed." />
        <Metric label="Delivery target" value="−16" detail="LUFS dialogue · true peak independently checked." />
      </div>
      {!eligible ? <div className="mt-4 flex gap-2 rounded-xl border border-amber-500/50 bg-amber-950/60 px-3 py-3 text-xs font-bold leading-5 text-amber-100"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{eligibilityDetail}</div> : null}
      {status.preview?.playbackUrl && !stale ? <div className="mt-4 rounded-xl border border-emerald-700 bg-emerald-950/50 p-3"><div className="flex items-center gap-2 text-xs font-black text-emerald-100"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Verified preview ready for a deliberate listen</div><audio className="mt-3 w-full" controls preload="metadata" src={status.preview.playbackUrl} aria-label="Verified Episode mix preview" /><div className="mt-2 flex flex-wrap gap-2 text-[9px] font-black uppercase tracking-[0.1em] text-emerald-200"><span>{status.preview.integratedLufs.toFixed(1)} LUFS</span><span>·</span><span>{status.preview.truePeakDbtp.toFixed(1)} dBTP</span><span>·</span><span>{status.preview.durationSeconds.toFixed(1)} s</span></div></div> : null}
      {notice ? <div className="mt-3 rounded-xl border border-sky-600/60 bg-sky-950/60 px-3 py-2 text-xs font-bold leading-5 text-sky-100" role="status" aria-live="polite">{notice}</div> : null}
      {status.error ? <div className="mt-3 rounded-xl border border-rose-600 bg-rose-950/70 px-3 py-2 text-xs font-bold text-rose-100" role="alert">{status.error}</div> : null}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void queue()} disabled={!canWrite || !eligible || working} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet-400 px-4 text-xs font-black text-violet-950 transition hover:bg-violet-300 disabled:cursor-not-allowed disabled:opacity-50">{working ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />}{working ? "Rendering verified preview…" : status.status === "completed" ? "Build a new proposal" : "Build mix proposal"}</button>
        <span className="text-[10px] font-bold leading-4 text-slate-400">Preview creation is reversible. Approval and promotion are deliberately separate.</span>
      </div>
    </section>
  );
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail: string }) { return <div className="rounded-xl border border-white/10 bg-white/5 p-3"><div className="text-[9px] font-black uppercase tracking-[0.12em] text-violet-200">{label}</div><div className="mt-1 text-2xl font-black">{value}</div><div className="mt-1 text-[10px] font-semibold leading-4 text-slate-400">{detail}</div></div>; }
