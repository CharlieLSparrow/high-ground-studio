"use client";

import { AudioWaveform, CheckCircle2, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { SessionSourceEvidence } from "./session-source-evidence-model";

type Alignment = {
  jobId: string;
  status: "queued" | "processing" | "output-ready" | "completed" | "blocked" | "failed";
  spineRecordingAssetId: string;
  targetRecordingAssetId: string;
  clockAuthority: "capture-clock-proposal" | "reported-wall-clock-fallback" | null;
  evidence: null | {
    opening: { measuredOffsetSeconds: number; normalizedCorrelation: number; peakMargin: number };
    later: { measuredOffsetSeconds: number; normalizedCorrelation: number; peakMargin: number };
    drift: { residualDriftMilliseconds: number; observedPartsPerMillion: number };
    qualification: { qualifiedForAuthorizedAgentReview: boolean; reason: string };
  };
  error: string | null;
};

function sourceLabel(source: SessionSourceEvidence["sources"][number]) {
  return source.fileName || source.recordingAssetId;
}

function milliseconds(value: number) {
  return `${value >= 0 ? "+" : ""}${(value * 1_000).toFixed(1)} ms`;
}

export function SessionSourceAlignmentCard({
  roomId,
  evidence,
  canManage,
}: {
  roomId: string;
  evidence: SessionSourceEvidence | null;
  canManage: boolean;
}) {
  const sources = useMemo(() => (evidence?.sources ?? []).filter((source) => (
    source.status === "VERIFIED_MATCH"
    && source.protectedPlayback
    && source.captureGroupId
  )), [evidence]);
  const [spineId, setSpineId] = useState(sources[0]?.recordingAssetId ?? "");
  const [targetId, setTargetId] = useState(sources.find((source) => source.recordingAssetId !== spineId)?.recordingAssetId ?? "");
  const [alignments, setAlignments] = useState<Alignment[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    const response = await fetch(`/api/sessions/${encodeURIComponent(roomId)}/source-alignment`, { cache: "no-store" });
    const payload = await response.json() as { ok?: boolean; alignments?: Alignment[]; error?: string };
    if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not read Session sync evidence.");
    setAlignments(payload.alignments ?? []);
  }

  useEffect(() => {
    void load().catch((error) => setMessage(error instanceof Error ? error.message : "Could not read Session sync evidence."));
    // roomId is the private projection boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const current = alignments.find((alignment) => (
    alignment.spineRecordingAssetId === spineId && alignment.targetRecordingAssetId === targetId
  )) ?? null;

  useEffect(() => {
    if (!current || !["queued", "processing", "output-ready"].includes(current.status)) return;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/sessions/${encodeURIComponent(roomId)}/source-alignment`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "RECONCILE", jobId: current.jobId }),
        });
        const payload = await response.json() as { ok?: boolean; alignment?: Alignment; error?: string };
        if (!response.ok || !payload.ok || !payload.alignment) throw new Error(payload.error || "Could not refresh Session sync evidence.");
        setAlignments((existing) => [payload.alignment!, ...existing.filter((item) => item.jobId !== payload.alignment!.jobId)]);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not refresh Session sync evidence.");
      }
    }, 1_500);
    return () => window.clearTimeout(timer);
  }, [current, roomId]);

  async function analyze() {
    if (!spineId || !targetId || spineId === targetId) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(roomId)}/source-alignment`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "QUEUE", spineRecordingAssetId: spineId, targetRecordingAssetId: targetId }),
      });
      const payload = await response.json() as { ok?: boolean; alignment?: Alignment; error?: string };
      if (!response.ok || !payload.ok || !payload.alignment) throw new Error(payload.error || "Could not start exact-source sync analysis.");
      setAlignments((existing) => [payload.alignment!, ...existing.filter((item) => item.jobId !== payload.alignment!.jobId)]);
      setMessage(payload.alignment.status === "blocked"
        ? ""
        : "Two exact retained sources are being compared at opening and later waveform windows.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not start exact-source sync analysis.");
    } finally { setBusy(false); }
  }

  if (sources.length < 2) return <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="session-alignment-heading">
    <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-600"><AudioWaveform size={16} aria-hidden="true" />Participant sync evidence</p>
    <h2 id="session-alignment-heading" className="mt-1 font-serif text-2xl font-black text-[#3d3122]">Two verified sources unlock waveform sync</h2>
    <p className="mt-2 text-sm font-semibold leading-6 text-[#765f40]">Quipsly needs two released, exact-byte-verified recordings from this take. It will keep the current clock estimate visible until both originals are ready.</p>
  </section>;

  return <section className="rounded-3xl border border-cyan-200 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-5 text-white shadow-sm sm:p-6" aria-labelledby="session-alignment-heading">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-3xl"><p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200"><AudioWaveform size={16} aria-hidden="true" />Participant sync evidence</p><h2 id="session-alignment-heading" className="mt-1 font-serif text-3xl font-black">Measure the shared moment</h2><p className="mt-2 text-sm font-semibold leading-6 text-slate-300">Quipsly compares two separated decoded-audio windows from the exact retained files. The result measures offset and drift; it never moves either source or calls the placement sample-accurate.</p></div>
      <span className="inline-flex items-center gap-2 rounded-full border border-emerald-700 bg-emerald-950/60 px-3 py-2 text-[9px] font-black uppercase tracking-wide text-emerald-200"><ShieldCheck size={14} aria-hidden="true" />Originals remain truth</span>
    </div>
    <div className="mt-5 grid gap-3 md:grid-cols-2">
      <label className="text-[10px] font-black uppercase tracking-wide text-cyan-100">Timeline spine<select value={spineId} onChange={(event) => { const value = event.currentTarget.value; setSpineId(value); if (value === targetId) setTargetId(sources.find((source) => source.recordingAssetId !== value)?.recordingAssetId ?? ""); }} className="mt-1 min-h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm font-bold normal-case tracking-normal text-white">{sources.map((source) => <option key={source.recordingAssetId} value={source.recordingAssetId}>{sourceLabel(source)}</option>)}</select></label>
      <label className="text-[10px] font-black uppercase tracking-wide text-cyan-100">Source to place<select value={targetId} onChange={(event) => setTargetId(event.currentTarget.value)} className="mt-1 min-h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm font-bold normal-case tracking-normal text-white">{sources.filter((source) => source.recordingAssetId !== spineId).map((source) => <option key={source.recordingAssetId} value={source.recordingAssetId}>{sourceLabel(source)}</option>)}</select></label>
    </div>
    {current?.evidence ? <div className="mt-5 rounded-2xl border border-cyan-700 bg-slate-950/80 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="flex items-center gap-2 text-sm font-black text-cyan-100"><CheckCircle2 size={18} className={current.evidence.qualification.qualifiedForAuthorizedAgentReview ? "text-emerald-300" : "text-amber-300"} aria-hidden="true" />{current.evidence.qualification.qualifiedForAuthorizedAgentReview ? "Distinct peaks ready for protected review" : "Waveform match needs more evidence"}</p><span className="rounded-full border border-slate-600 px-2.5 py-1 text-[9px] font-black uppercase text-slate-300">{current.clockAuthority?.replaceAll("-", " ") || "clock authority retained"}</span></div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-4"><Metric label="Opening offset" value={milliseconds(current.evidence.opening.measuredOffsetSeconds)} /><Metric label="Later offset" value={milliseconds(current.evidence.later.measuredOffsetSeconds)} /><Metric label="Residual drift" value={`${current.evidence.drift.residualDriftMilliseconds.toFixed(1)} ms`} /><Metric label="Observed drift" value={`${current.evidence.drift.observedPartsPerMillion.toFixed(1)} ppm`} /></dl>
      <p className="mt-3 text-xs font-semibold leading-5 text-slate-300">{current.evidence.qualification.reason}</p>
      <p className="mt-2 text-[9px] font-black uppercase tracking-wide text-slate-500">Opening corr {current.evidence.opening.normalizedCorrelation.toFixed(3)} · peak margin {current.evidence.opening.peakMargin.toFixed(3)} · later corr {current.evidence.later.normalizedCorrelation.toFixed(3)} · peak margin {current.evidence.later.peakMargin.toFixed(3)}</p>
    </div> : current ? <div className="mt-5 flex items-center gap-3 rounded-2xl border border-amber-700 bg-amber-950/40 p-4 text-sm font-bold text-amber-100">{["queued", "processing", "output-ready"].includes(current.status) ? <LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={18} aria-hidden="true" />}<span>{current.error || `Exact-source analysis is ${current.status}.`}</span></div> : null}
    <div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" onClick={() => void analyze()} disabled={!canManage || busy || !targetId || spineId === targetId || ["queued", "processing", "output-ready"].includes(current?.status ?? "")} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-cyan-200 px-5 text-xs font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50">{busy || ["queued", "processing", "output-ready"].includes(current?.status ?? "") ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <AudioWaveform size={16} aria-hidden="true" />}{current?.evidence ? "Analyze these exact sources again" : "Analyze exact source sync"}</button><p className="text-[10px] font-semibold leading-4 text-slate-400">This is a bounded derived-media job. It creates evidence only—no edit, render, share, or timeline placement.</p></div>
    {!canManage ? <p className="mt-3 text-xs font-bold text-amber-200">A Session coach, host, participant, or owner can request processing. You can still read completed evidence.</p> : null}
    {message ? <p className="mt-3 rounded-xl border border-cyan-800 bg-cyan-950/50 p-3 text-xs font-bold text-cyan-100" role="status" aria-live="polite">{message}</p> : null}
  </section>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-900 p-3"><dt className="text-[9px] font-black uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 font-mono text-sm font-black text-white">{value}</dd></div>;
}
