"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  CircleOff,
  CloudOff,
  HardDrive,
  LoaderCircle,
  MonitorPlay,
  ShieldCheck,
  X,
} from "lucide-react";
import type { EpisodeRenderProfileId } from "@high-ground/quipsly-media-processing";

import type {
  EpisodeEditDeskPayload,
  EpisodeRenderPlan,
} from "@/lib/editor/program-edit-contract";
import type { VerifiedAdvancedStudioHandoff } from "./AdvancedStudioHandoffBanner";

export type ExportQueueProps = {
  isOpen: boolean;
  onClose: () => void;
  timelineDurationSeconds: number;
  totalClips: number;
  projectSlug: string;
  episodeSlug: string;
  sequenceAtSeconds: number;
  verifiedHandoff: VerifiedAdvancedStudioHandoff | null;
};

type QueueReceipt = {
  job?: {
    id: string;
    status: string;
    branchRevision: number;
    manifestSha256: string;
  };
};

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  return `${(bytes / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}

function executorTone(status: EpisodeRenderPlan["executors"][number]["status"]) {
  if (status === "ready") return "border-emerald-200 bg-emerald-50 text-emerald-950";
  if (status === "held") return "border-amber-200 bg-amber-50 text-amber-950";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export function ExportQueueModule({
  isOpen,
  onClose,
  timelineDurationSeconds,
  totalClips,
  projectSlug,
  episodeSlug,
  sequenceAtSeconds,
  verifiedHandoff,
}: ExportQueueProps) {
  const [profile, setProfile] =
    useState<EpisodeRenderProfileId>("proof-10s");
  const [plan, setPlan] = useState<EpisodeRenderPlan | null>(null);
  const [desk, setDesk] = useState<EpisodeEditDeskPayload | null>(
    verifiedHandoff?.payload ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [queueJobId, setQueueJobId] = useState<string | null>(null);
  const registeringRef = useRef(new Set<string>());

  const endpoint = `/api/nests/${encodeURIComponent(projectSlug)}/episode-editor`;
  const handoffRevision = verifiedHandoff?.request.branchRevision ?? null;

  const post = useCallback(async (
    action: "plan-render-proof" | "queue-render-proof" | "register-render-proof",
    body: Record<string, unknown>,
  ) => {
    if (!verifiedHandoff) return null;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          episodeSlug: verifiedHandoff.request.episodeSlug,
          selectedMediaAssetId: verifiedHandoff.payload.selectedMediaAssetId,
          clientRequestId: crypto.randomUUID(),
          ...body,
        }),
      });
      const result = await response.json().catch(() => null) as
        | (EpisodeEditDeskPayload & { operationResult?: EpisodeRenderPlan | QueueReceipt })
        | { error?: string; payload?: EpisodeEditDeskPayload }
        | null;
      if (!response.ok) {
        if (result && "payload" in result && result.payload) setDesk(result.payload);
        throw new Error(
          result && "error" in result && result.error
            ? result.error
            : "Render readiness could not be checked.",
        );
      }
      const payload = result as EpisodeEditDeskPayload & {
        operationResult?: EpisodeRenderPlan | QueueReceipt;
      };
      setDesk(payload);
      if (action === "plan-render-proof") {
        setPlan(payload.operationResult as EpisodeRenderPlan);
        setMessage("Readiness checked. No job, upload, cloud compute, or publication was started.");
      } else if (action === "queue-render-proof") {
        const receipt = payload.operationResult as QueueReceipt;
        const jobId = receipt.job?.id ?? null;
        setQueueJobId(jobId);
        setMessage(jobId
          ? "The exact branch revision and executor-local sources are frozen. The selected Mac is rendering this review."
          : "The render request was accepted, but its durable job receipt was not returned.");
      } else {
        setMessage("The worker output passed server verification and is ready to review.");
      }
      return payload;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Render readiness could not be checked.");
      return null;
    } finally {
      setBusy(false);
    }
  }, [endpoint, verifiedHandoff]);

  useEffect(() => {
    if (!isOpen) return;
    setDesk(verifiedHandoff?.payload ?? null);
    setPlan(null);
    setQueueJobId(null);
    setMessage("");
    setError("");
    if (!verifiedHandoff || handoffRevision === null) return;
    void post("plan-render-proof", {
      sequenceTime: sequenceAtSeconds,
      expectedRevision: handoffRevision,
      renderProfile: profile,
    });
  }, [handoffRevision, isOpen, post, profile, sequenceAtSeconds, verifiedHandoff]);

  const queueJob = useMemo(
    () => desk?.executionInspection.jobs.find((job) => job.id === queueJobId) ?? null,
    [desk?.executionInspection.jobs, queueJobId],
  );

  useEffect(() => {
    if (!isOpen || !verifiedHandoff || !queueJobId || !queueJob) return;
    if (queueJob.status === "output-ready") {
      if (registeringRef.current.has(queueJobId)) return;
      registeringRef.current.add(queueJobId);
      void post("register-render-proof", { jobId: queueJobId })
        .finally(() => registeringRef.current.delete(queueJobId));
      return;
    }
    if (!["queued", "processing"].includes(queueJob.status)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ episode: verifiedHandoff.request.episodeSlug });
      void fetch(`${endpoint}?${params.toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => {
          const payload = await response.json().catch(() => null) as EpisodeEditDeskPayload | { error?: string } | null;
          if (!response.ok) throw new Error(payload && "error" in payload ? payload.error : "Render status could not be refreshed.");
          setDesk(payload as EpisodeEditDeskPayload);
        })
        .catch((caught) => {
          if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Render status could not be refreshed.");
        });
    }, 2_000);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [endpoint, isOpen, post, queueJob, queueJobId, verifiedHandoff]);

  if (!isOpen) return null;

  const minutes = Math.floor(timelineDurationSeconds / 60);
  const seconds = Math.floor(timelineDurationSeconds % 60);
  const returnHref = `/nests/${encodeURIComponent(projectSlug)}/episodes/${encodeURIComponent(episodeSlug)}?mode=edit`;
  const completedProof = queueJob?.status === "completed" && queueJob.playbackUrl
    ? queueJob
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <section role="dialog" aria-modal="true" aria-labelledby="render-boundary-title" className="relative max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-[#e8dcc4] bg-white p-6 text-[#3d3122] shadow-2xl sm:p-8">
        <button onClick={onClose} aria-label="Close render readiness" className="absolute right-4 top-4 rounded-lg p-2 text-[#8c6b4a] hover:bg-[#f8f3e6]">
          <X size={18} />
        </button>

        {!verifiedHandoff ? (
          <>
            <CircleOff className="h-12 w-12 text-amber-600" />
            <p className="mt-5 text-[10px] font-black uppercase tracking-[0.2em] text-amber-700">No revision guessed</p>
            <h2 id="render-boundary-title" className="mt-2 text-3xl font-black">Open this Studio from the Episode workspace</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#7a674c]">
              A render must freeze an authenticated shared-edit revision, its canonical timeline, its source projection, and the exact executor that owns any local bytes. This browser tab has no verified Episode handoff, so Quipsly will not substitute a similarly named project or media file.
            </p>
            <Link href={returnHref} className="mt-7 inline-flex min-h-11 items-center rounded-xl bg-[#3d3122] px-5 text-sm font-black text-white hover:bg-[#2c2419]">
              Return to Episode editor
            </Link>
          </>
        ) : (
          <>
            <div className="flex items-start gap-4 pr-10">
              <ShieldCheck className="h-12 w-12 shrink-0 text-emerald-700" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700">Verified Episode authority</p>
                <h2 id="render-boundary-title" className="mt-2 text-3xl font-black">Review render readiness</h2>
                <p className="mt-2 text-sm leading-6 text-[#7a674c]">
                  This creates a watchable proof of shared edit revision {verifiedHandoff.request.branchRevision}. It does not export a final master, publish media, or silently include unsaved Advanced Studio experiments.
                </p>
              </div>
            </div>

            <dl className="mt-6 grid gap-3 rounded-2xl border border-[#e8dcc4] bg-[#fdfaf6] p-4 text-sm sm:grid-cols-3">
              <div><dt className="text-[10px] font-black uppercase tracking-wider text-[#8c6b4a]">Advanced timeline</dt><dd className="mt-1 font-black">{minutes}:{seconds.toString().padStart(2, "0")} · {totalClips} clips</dd></div>
              <div><dt className="text-[10px] font-black uppercase tracking-wider text-[#8c6b4a]">Frozen branch</dt><dd className="mt-1 font-black">Revision {verifiedHandoff.request.branchRevision}</dd></div>
              <div><dt className="text-[10px] font-black uppercase tracking-wider text-[#8c6b4a]">Review starts</dt><dd className="mt-1 font-black">{sequenceAtSeconds.toFixed(2)} seconds</dd></div>
            </dl>

            <div className="mt-5 grid grid-cols-2 gap-3">
              {(["proof-10s", "section-review-30s"] as const).map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  disabled={busy}
                  onClick={() => setProfile(candidate)}
                  className={`rounded-2xl border p-4 text-left transition-colors disabled:opacity-60 ${profile === candidate ? "border-amber-400 bg-amber-50" : "border-[#e8dcc4] bg-white hover:bg-[#fdfaf6]"}`}
                >
                  <strong className="block text-sm">{candidate === "proof-10s" ? "Fast proof" : "Section review"}</strong>
                  <span className="mt-1 block text-xs text-[#7a674c]">{candidate === "proof-10s" ? "Up to 10 seconds" : "Up to 30 seconds"}</span>
                </button>
              ))}
            </div>

            {busy && !plan ? (
              <div className="mt-5 flex items-center gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm font-bold text-sky-950" role="status">
                <LoaderCircle className="h-5 w-5 animate-spin" /> Checking exact sources and executors…
              </div>
            ) : null}
            {error ? <p className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-950" role="alert">{error}</p> : null}
            {message ? <p className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-950" role="status">{message}</p> : null}

            {plan ? (
              <>
                <div className="mt-5 rounded-2xl border border-[#e8dcc4] bg-[#fdfaf6] p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong>{plan.profileLabel} · {plan.durationSeconds.toFixed(1)}s · 1280×720/24</strong>
                    <span className="font-bold text-[#7a674c]">{plan.sources.exactLocalCount}/{plan.sources.requiredCount} exact here · {formatBytes(plan.sources.totalBytes)}</span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-[#7a674c]">{plan.profileDescription}</p>
                </div>

                <div className="mt-3 space-y-3">
                  {plan.executors.map((executor) => (
                    <article key={executor.id} className={`rounded-2xl border p-4 ${executorTone(executor.status)}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          {executor.id === "local-mac" ? <HardDrive className="h-5 w-5" /> : executor.id === "cloud" ? <CloudOff className="h-5 w-5" /> : <MonitorPlay className="h-5 w-5" />}
                          <strong className="text-sm">{executor.label}</strong>
                        </div>
                        <span className="rounded-full bg-white/70 px-2 py-1 text-[9px] font-black uppercase">{executor.status.replaceAll("-", " ")}</span>
                      </div>
                      <p className="mt-2 text-xs leading-5">{executor.detail}</p>
                      <p className="mt-1 text-[11px] opacity-75">{executor.qualityDetail} · {executor.costDetail}</p>
                      {executor.artifactPortability === "executor-local" ? <p className="mt-2 text-[11px] font-black">Proof bytes stay on this named executor; edit intent remains portable.</p> : null}
                      {executor.id === "local-mac" ? (
                        <button
                          type="button"
                          disabled={!executor.canQueue || busy || plan.branchRevision !== verifiedHandoff.request.branchRevision}
                          onClick={() => void post("queue-render-proof", {
                            sequenceTime: plan.sequenceStartSeconds,
                            expectedRevision: plan.branchRevision,
                            renderProfile: plan.renderProfile,
                            executorNodeId: executor.executorNodeId ?? null,
                          })}
                          className="mt-3 inline-flex min-h-10 items-center rounded-xl bg-[#3d3122] px-4 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Render {plan.profileLabel.toLowerCase()} on {executor.label}
                        </button>
                      ) : null}
                    </article>
                  ))}
                </div>
              </>
            ) : null}

            {queueJob ? (
              <div className="mt-5 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-950">
                <div className="flex items-center justify-between gap-3">
                  <strong className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5" /> Durable render job</strong>
                  <span className="rounded-full bg-white px-2 py-1 text-[9px] font-black uppercase">{queueJob.status}</span>
                </div>
                <p className="mt-2 font-mono text-[11px]">{queueJob.id}</p>
                {queueJob.error ? <p className="mt-2 text-xs font-bold text-rose-800">{queueJob.error}</p> : null}
              </div>
            ) : null}
            {completedProof ? (
              <div className="mt-5 overflow-hidden rounded-2xl border border-emerald-300 bg-black">
                <video controls playsInline preload="metadata" src={completedProof.playbackUrl ?? undefined} className="aspect-video w-full bg-black" />
                <p className="bg-emerald-950 px-4 py-3 text-xs font-bold text-emerald-100">Verified local proof · shared revision {completedProof.branchRevision}</p>
              </div>
            ) : null}

            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <p className="text-sm leading-6 text-[#6f5a3d]">
                Final conform remains a separate release boundary: it will require a generation-locked full source manifest, a selected output destination, complete decode and sync verification, an approval receipt, and explicit publication. None of those actions happen in this review flow.
              </p>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
