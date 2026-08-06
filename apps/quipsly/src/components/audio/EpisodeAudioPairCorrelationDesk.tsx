"use client";

import { Activity, RefreshCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { EpisodeAudioComparisonPlan } from "@/lib/episode-audio-comparison";

type PairStatus = {
  jobId: string | null;
  status: "not-queued" | "queued" | "processing" | "output-ready" | "completed" | "failed";
  measurement: null | {
    peakPowerCorrelation: number;
    peakAbsolutePowerCorrelation: number;
    bestLagMilliseconds: number;
    peakProminence: number;
    waveformCorrelationAtBestLag: number;
    observationToReferenceLevelDb: number;
    reliability: number;
    activeFrameCount: number;
    comparedFrameCount: number;
  };
  error: string | null;
};

const EMPTY: PairStatus = { jobId: null, status: "not-queued", measurement: null, error: null };

export function EpisodeAudioPairCorrelationDesk({
  plan,
  projectId,
  projectSlug,
  episodeProductionId,
  analysisReceiptId,
  canWrite,
}: {
  plan: EpisodeAudioComparisonPlan;
  projectId: string;
  projectSlug: string;
  episodeProductionId: string;
  analysisReceiptId: string;
  canWrite: boolean;
}) {
  const defaultReference = plan.sources.find((source) => source.alignment === "program-clock")?.assetId ?? plan.sources[0]?.assetId ?? "";
  const [referenceAssetId, setReferenceAssetId] = useState(defaultReference);
  const [observationAssetId, setObservationAssetId] = useState(plan.sources.find((source) => source.assetId !== defaultReference)?.assetId ?? "");
  const [status, setStatus] = useState<PairStatus>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const coordinates = useMemo(() => ({ projectId, projectSlug, episodeProductionId, analysisReceiptId, activityMomentId: plan.momentId, referenceAssetId, observationAssetId }), [analysisReceiptId, episodeProductionId, observationAssetId, plan.momentId, projectId, projectSlug, referenceAssetId]);

  useEffect(() => {
    setReferenceAssetId(defaultReference);
    setObservationAssetId(plan.sources.find((source) => source.assetId !== defaultReference)?.assetId ?? "");
  }, [defaultReference, plan.momentId, plan.sources]);

  const read = useCallback(async (signal?: AbortSignal) => {
    if (!referenceAssetId || !observationAssetId || referenceAssetId === observationAssetId) return;
    const response = await fetch(`/api/media-vault/episode-audio-program/correlation?${new URLSearchParams(coordinates)}`, { cache: "no-store", signal });
    const payload = await response.json().catch(() => null) as ({ ok?: boolean } & Partial<PairStatus>) | null;
    if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Pair measurement status could not be read.");
    setStatus({ ...EMPTY, ...payload });
  }, [coordinates, observationAssetId, referenceAssetId]);

  useEffect(() => {
    const controller = new AbortController();
    setStatus(EMPTY);
    setNotice(null);
    void read(controller.signal).catch((error) => { if (!controller.signal.aborted) setNotice(error instanceof Error ? error.message : "Pair measurement status could not be read."); });
    return () => controller.abort();
  }, [read]);

  const operate = useCallback(async () => {
    if (busy || !canWrite || referenceAssetId === observationAssetId) return;
    setBusy(true);
    setNotice(null);
    try {
      let operation: "queue" | "reconcile" = status.jobId ? "reconcile" : "queue";
      let finalStatus: PairStatus["status"] = status.status;
      for (let attempt = 0; attempt < 21; attempt += 1) {
        const response = await fetch("/api/media-vault/episode-audio-program/correlation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...coordinates, operation }) });
        const payload = await response.json().catch(() => null) as ({ ok?: boolean } & Partial<PairStatus>) | null;
        if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Pair measurement could not continue.");
        const next = { ...EMPTY, ...payload };
        setStatus(next);
        finalStatus = next.status;
        if (["completed", "failed"].includes(next.status)) break;
        operation = "reconcile";
        await new Promise((resolve) => setTimeout(resolve, 750));
      }
      setNotice(finalStatus === "completed" ? "Exact-range relationship evidence is registered." : "Pair analysis is retained and can be refreshed while the media worker finishes.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Pair measurement could not continue.");
    } finally { setBusy(false); }
  }, [busy, canWrite, coordinates, observationAssetId, referenceAssetId, status.jobId, status.status]);

  if (plan.sources.length < 2) return null;
  const reference = plan.sources.find((source) => source.assetId === referenceAssetId) ?? null;
  const observation = plan.sources.find((source) => source.assetId === observationAssetId) ?? null;
  return (
    <section className="mt-3 rounded-xl border border-sky-300 bg-sky-50 p-3 text-sky-950" aria-labelledby={`pair-correlation-heading-${plan.momentId}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wide"><Activity className="h-4 w-4" aria-hidden="true" /> Signal relationship lab</div>
          <h3 id={`pair-correlation-heading-${plan.momentId}`} className="mt-1 text-sm font-black">Measure one exact retained pair</h3>
          <p className="mt-1 max-w-3xl text-[10px] font-semibold leading-4">Power-envelope correlation, lag, level difference, and waveform similarity can reveal a relationship worth hearing. They cannot decide whether that relationship is bleed, echo, duplicate capture, or intentional overlap.</p>
        </div>
        <span className="self-start rounded-full border border-sky-300 bg-white px-2 py-1 font-mono text-[9px] font-black uppercase">{busy ? "working" : status.status.replaceAll("-", " ")}</span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="text-[10px] font-black">Reference source<select value={referenceAssetId} onChange={(event) => { const value = event.currentTarget.value; setReferenceAssetId(value); if (value === observationAssetId) setObservationAssetId(plan.sources.find((source) => source.assetId !== value)?.assetId ?? ""); }} className="mt-1 min-h-11 w-full rounded-lg border border-sky-300 bg-white px-3 text-xs font-bold">{plan.sources.map((source) => <option key={source.assetId} value={source.assetId}>{source.participantLabel || source.title}{source.alignment === "program-clock" ? " · program clock" : ""}</option>)}</select></label>
        <label className="text-[10px] font-black">Observation source<select value={observationAssetId} onChange={(event) => setObservationAssetId(event.currentTarget.value)} className="mt-1 min-h-11 w-full rounded-lg border border-sky-300 bg-white px-3 text-xs font-bold">{plan.sources.filter((source) => source.assetId !== referenceAssetId).map((source) => <option key={source.assetId} value={source.assetId}>{source.participantLabel || source.title}</option>)}</select></label>
      </div>
      <p className="mt-2 font-mono text-[9px] font-bold text-sky-900">Positive lag means {observation?.participantLabel || observation?.title || "the observation"} follows {reference?.participantLabel || reference?.title || "the reference"}.</p>
      {status.measurement ? <div className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
        <Metric value={status.measurement.peakPowerCorrelation.toFixed(3)} label="Peak power corr" />
        <Metric value={`${status.measurement.bestLagMilliseconds > 0 ? "+" : ""}${status.measurement.bestLagMilliseconds} ms`} label="Best lag" />
        <Metric value={status.measurement.waveformCorrelationAtBestLag.toFixed(3)} label="Waveform corr" />
        <Metric value={`${status.measurement.observationToReferenceLevelDb > 0 ? "+" : ""}${status.measurement.observationToReferenceLevelDb.toFixed(1)} dB`} label="Observed level" />
        <Metric value={`${Math.round(status.measurement.peakProminence * 100)}%`} label="Peak prominence" />
        <Metric value={`${Math.round(status.measurement.reliability * 100)}%`} label="Evidence reliability" />
        <Metric value={`${status.measurement.activeFrameCount}/${status.measurement.comparedFrameCount}`} label="Active frames" />
        <Metric value="Review" label="Cause remains human" />
      </div> : null}
      {status.error ? <p className="mt-2 rounded-lg border border-rose-300 bg-rose-50 p-2 text-[10px] font-bold text-rose-950" role="alert">{status.error}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={!canWrite || busy || !referenceAssetId || !observationAssetId || referenceAssetId === observationAssetId || status.status === "completed"} onClick={() => void operate()} className="min-h-11 rounded-lg bg-sky-800 px-4 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Analyzing exact ranges…" : status.jobId ? "Continue pair analysis" : "Measure pair relationship"}</button>
        <button type="button" disabled={busy} onClick={() => void read().catch((error) => setNotice(error instanceof Error ? error.message : "Refresh failed."))} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-sky-300 bg-white px-4 text-xs font-black"><RefreshCcw className="h-4 w-4" aria-hidden="true" /> Refresh</button>
      </div>
      {notice ? <p className="mt-2 text-[10px] font-bold" role="status">{notice}</p> : null}
      <p className="mt-2 text-[9px] font-semibold leading-4 opacity-70">The job is bound to this analysis receipt, event, program fingerprint, active decision receipts, exact source hashes, qualified alignments, and shared-clock range. No timeline placement, gain, gate, or classification is written.</p>
    </section>
  );
}

function Metric({ value, label }: { value: string; label: string }) { return <div className="rounded-lg border border-sky-200 bg-white p-2"><div className="font-mono text-sm font-black">{value}</div><div className="mt-1 text-[8px] font-black uppercase tracking-wide text-sky-800">{label}</div></div>; }
