"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
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
  EpisodeMasterConformPlan,
  EpisodeProgramRenderPlan,
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

export type ProgramReviewSummary = {
  latest: null | {
    id: string;
    jobId: string;
    decision: "approved" | "rejected";
    note: string | null;
    actorEmail: string;
    reviewedAt: string;
    watchedFraction: number;
  };
  approvalCount: number;
  rejectionCount: number;
  boundaries: {
    outputRemainsReviewCandidate: true;
    sourceMediaRemainsImmutable: true;
    masterNotCreated: true;
    portableUploadNotStarted: true;
    publicationNotStarted: true;
  };
};

type MasterReviewSummary = Omit<ProgramReviewSummary, "boundaries"> & {
  boundaries: {
    outputRemainsMasterCandidate: true;
    sourceMediaRemainsImmutable: true;
    portableUploadNotStarted: true;
    publicationNotStarted: true;
  };
};

type ProgramPlaybackEvidence = {
  durationSeconds: number;
  watchedSecondBins: number[];
  playbackStartedAt: string | null;
  playbackEndedAt: string | null;
  playthroughEnded: boolean;
  maximumPlaybackRate: number;
  mutedAtDecision: boolean;
  volumeAtDecision: number;
  seekCount: number;
};

function emptyProgramPlaybackEvidence(): ProgramPlaybackEvidence {
  return {
    durationSeconds: 0,
    watchedSecondBins: [],
    playbackStartedAt: null,
    playbackEndedAt: null,
    playthroughEnded: false,
    maximumPlaybackRate: 1,
    mutedAtDecision: false,
    volumeAtDecision: 1,
    seekCount: 0,
  };
}

function TrackedReviewVideo({
  src,
  setEvidence,
  className = "aspect-video w-full bg-black",
}: {
  src: string;
  setEvidence: Dispatch<SetStateAction<ProgramPlaybackEvidence>>;
  className?: string;
}) {
  return (
    <video
      controls
      playsInline
      preload="metadata"
      src={src}
      className={className}
      onLoadedMetadata={(event) => {
        const video = event.currentTarget;
        setEvidence((current) => ({ ...current, durationSeconds: video.duration, maximumPlaybackRate: Math.max(current.maximumPlaybackRate, video.playbackRate), mutedAtDecision: video.muted, volumeAtDecision: video.volume }));
      }}
      onPlay={(event) => {
        const video = event.currentTarget;
        setEvidence((current) => ({ ...current, playbackStartedAt: current.playbackStartedAt ?? new Date().toISOString(), maximumPlaybackRate: Math.max(current.maximumPlaybackRate, video.playbackRate), mutedAtDecision: video.muted, volumeAtDecision: video.volume }));
      }}
      onTimeUpdate={(event) => {
        const video = event.currentTarget;
        if (!Number.isFinite(video.duration) || video.duration <= 0) return;
        const bin = Math.min(Math.max(0, Math.ceil(video.duration) - 1), Math.max(0, Math.floor(video.currentTime)));
        setEvidence((current) => ({ ...current, watchedSecondBins: current.watchedSecondBins.includes(bin) ? current.watchedSecondBins : [...current.watchedSecondBins, bin].sort((a, b) => a - b), maximumPlaybackRate: Math.max(current.maximumPlaybackRate, video.playbackRate), mutedAtDecision: video.muted, volumeAtDecision: video.volume }));
      }}
      onSeeking={() => setEvidence((current) => ({ ...current, seekCount: current.seekCount + 1 }))}
      onRateChange={(event) => setEvidence((current) => ({ ...current, maximumPlaybackRate: Math.max(current.maximumPlaybackRate, event.currentTarget.playbackRate) }))}
      onVolumeChange={(event) => setEvidence((current) => ({ ...current, mutedAtDecision: event.currentTarget.muted, volumeAtDecision: event.currentTarget.volume }))}
      onEnded={(event) => {
        const video = event.currentTarget;
        if (!Number.isFinite(video.duration) || video.duration <= 0) return;
        const lastBin = Math.max(0, Math.ceil(video.duration) - 1);
        setEvidence((current) => ({ ...current, watchedSecondBins: current.watchedSecondBins.includes(lastBin) ? current.watchedSecondBins : [...current.watchedSecondBins, lastBin].sort((a, b) => a - b), playbackEndedAt: new Date().toISOString(), playthroughEnded: true, mutedAtDecision: video.muted, volumeAtDecision: video.volume }));
      }}
    />
  );
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  return `${(bytes / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}

function formatDuration(seconds: number) {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainder = Math.floor(safe % 60);
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
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
  const [programPlan, setProgramPlan] =
    useState<EpisodeProgramRenderPlan | null>(null);
  const [desk, setDesk] = useState<EpisodeEditDeskPayload | null>(
    verifiedHandoff?.payload ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [queueJobId, setQueueJobId] = useState<string | null>(null);
  const [programQueueJobId, setProgramQueueJobId] = useState<string | null>(null);
  const [programReview, setProgramReview] = useState<ProgramReviewSummary | null>(null);
  const [programReviewJobId, setProgramReviewJobId] = useState<string | null>(null);
  const [masterPlan, setMasterPlan] = useState<EpisodeMasterConformPlan | null>(null);
  const [masterQueueJobId, setMasterQueueJobId] = useState<string | null>(null);
  const [masterReview, setMasterReview] = useState<MasterReviewSummary | null>(null);
  const [masterReviewJobId, setMasterReviewJobId] = useState<string | null>(null);
  const [masterReviewNote, setMasterReviewNote] = useState("");
  const [masterPlayback, setMasterPlayback] = useState<ProgramPlaybackEvidence>(emptyProgramPlaybackEvidence);
  const [reviewNote, setReviewNote] = useState("");
  const [programPlayback, setProgramPlayback] = useState<ProgramPlaybackEvidence>(emptyProgramPlaybackEvidence);
  const registeringRef = useRef(new Set<string>());

  const endpoint = `/api/nests/${encodeURIComponent(projectSlug)}/episode-editor`;
  const handoffRevision = verifiedHandoff?.request.branchRevision ?? null;

  const post = useCallback(async (
    action:
      | "plan-render-proof"
      | "queue-render-proof"
      | "register-render-proof"
      | "plan-program-render"
      | "queue-program-render"
      | "register-program-render"
      | "read-program-review"
      | "review-program-render"
      | "plan-master-conform"
      | "queue-master-conform"
      | "register-master-conform"
      | "read-master-review"
      | "review-master-conform"
      | "queue-master-promotion"
      | "read-master-promotion"
      | "create-delivery-package"
      | "read-delivery-package",
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
        | (EpisodeEditDeskPayload & {
            operationResult?: EpisodeRenderPlan | EpisodeProgramRenderPlan | EpisodeMasterConformPlan | QueueReceipt | ProgramReviewSummary | MasterReviewSummary | { review: ProgramReviewSummary | MasterReviewSummary };
          })
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
        operationResult?: EpisodeRenderPlan | EpisodeProgramRenderPlan | EpisodeMasterConformPlan | QueueReceipt | ProgramReviewSummary | MasterReviewSummary | { review: ProgramReviewSummary | MasterReviewSummary };
      };
      setDesk(payload);
      if (action === "plan-render-proof") {
        setPlan(payload.operationResult as EpisodeRenderPlan);
        setMessage("Readiness checked. No job, upload, cloud compute, or publication was started.");
      } else if (action === "plan-program-render") {
        setProgramPlan(payload.operationResult as EpisodeProgramRenderPlan);
        setMessage("Full-program readiness checked. No render job, approval, upload, or publication was started.");
      } else if (action === "queue-render-proof") {
        const receipt = payload.operationResult as QueueReceipt;
        const jobId = receipt.job?.id ?? null;
        setQueueJobId(jobId);
        setMessage(jobId
          ? "The exact branch revision and executor-local sources are frozen. The selected Mac is rendering this review."
          : "The render request was accepted, but its durable job receipt was not returned.");
      } else if (action === "queue-program-render") {
        const receipt = payload.operationResult as QueueReceipt;
        const jobId = receipt.job?.id ?? null;
        setProgramQueueJobId(jobId);
        setMessage(jobId
          ? "The full Play Edit, exact sources, output clock, and selected Mac are frozen. Chunked rendering is underway."
          : "The full-program request was accepted, but its durable job receipt was not returned.");
      } else if (action === "read-program-review") {
        setProgramReview(payload.operationResult as ProgramReviewSummary);
        setProgramReviewJobId(String(body.jobId ?? ""));
      } else if (action === "review-program-render") {
        const result = payload.operationResult as { review: ProgramReviewSummary };
        setProgramReview(result.review);
        setProgramReviewJobId(String(body.jobId ?? ""));
        setMessage(body.decision === "rejected"
          ? "Change request saved against these exact review bytes. The canonical edit and source media remain unchanged."
          : "Full-program approval saved against this exact generation. No master, upload, or publication was created.");
      } else if (action === "plan-master-conform") {
        setMasterPlan(payload.operationResult as EpisodeMasterConformPlan);
        setMessage("4K master readiness checked. No render job, upload, cloud compute, or publication was started.");
      } else if (action === "queue-master-conform") {
        const receipt = payload.operationResult as QueueReceipt;
        const jobId = receipt.job?.id ?? null;
        setMasterQueueJobId(jobId);
        setMessage(jobId
          ? "The exact approval, original source generations, edit manifest, 4K profile, and Mac custody are frozen. Local master conform is underway."
          : "The master request was accepted, but its durable job receipt was not returned.");
      } else if (action === "register-master-conform") {
        setMessage("The 4K candidate passed byte, profile, and complete-decode verification. It remains unapproved and unpublished.");
      } else if (action === "read-master-review") {
        setMasterReview(payload.operationResult as MasterReviewSummary);
        setMasterReviewJobId(String(body.jobId ?? ""));
      } else if (action === "review-master-conform") {
        const result = payload.operationResult as { review: MasterReviewSummary };
        setMasterReview(result.review);
        setMasterReviewJobId(String(body.jobId ?? ""));
        setMessage(body.decision === "approved"
          ? "Master approval saved against these exact 4K bytes. No upload, delivery encode, or publication was started."
          : "Master change request saved against these exact 4K bytes. Sources and edit intent remain unchanged.");
      } else {
        setMessage(action === "register-program-render"
          ? "The complete program output passed server verification and is ready to watch. Approval remains separate."
          : "The worker output passed server verification and is ready to review.");
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
    setProgramPlan(null);
    setQueueJobId(null);
    setProgramQueueJobId(null);
    setProgramReview(null);
    setProgramReviewJobId(null);
    setMasterPlan(null);
    setMasterQueueJobId(null);
    setMasterReview(null);
    setMasterReviewJobId(null);
    setMasterReviewNote("");
    setMasterPlayback(emptyProgramPlaybackEvidence());
    setReviewNote("");
    setProgramPlayback(emptyProgramPlaybackEvidence());
    setMessage("");
    setError("");
  }, [handoffRevision, isOpen, verifiedHandoff]);

  useEffect(() => {
    if (!isOpen) return;
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
  const programQueueJob = useMemo(
    () => desk?.executionInspection.jobs.find((job) => job.id === programQueueJobId)
      ?? desk?.executionInspection.jobs.find((job) => (
        job.type === "episode-program-render"
        && job.branchRevision === handoffRevision
        && ["queued", "processing", "output-ready", "completed"].includes(job.status)
      ))
      ?? null,
    [desk?.executionInspection.jobs, handoffRevision, programQueueJobId],
  );
  const masterQueueJob = useMemo(
    () => desk?.executionInspection.jobs.find((job) => job.id === masterQueueJobId)
      ?? desk?.executionInspection.jobs.find((job) => (
        job.type === "episode-master-conform"
        && job.branchRevision === handoffRevision
        && ["queued", "processing", "output-ready", "completed"].includes(job.status)
      ))
      ?? null,
    [desk?.executionInspection.jobs, handoffRevision, masterQueueJobId],
  );
  const activeJob = masterQueueJob ?? programQueueJob ?? queueJob;
  const activeJobId = masterQueueJob?.id ?? programQueueJob?.id ?? queueJob?.id ?? null;
  const activeRegistrationAction = masterQueueJob
    ? "register-master-conform" as const
    : programQueueJob
      ? "register-program-render" as const
      : "register-render-proof" as const;

  useEffect(() => {
    if (!isOpen || !verifiedHandoff || !activeJobId || !activeJob) return;
    if (activeJob.status === "output-ready") {
      if (registeringRef.current.has(activeJobId)) return;
      registeringRef.current.add(activeJobId);
      void post(activeRegistrationAction, { jobId: activeJobId })
        .finally(() => registeringRef.current.delete(activeJobId));
      return;
    }
    if (!["queued", "processing"].includes(activeJob.status)) return;
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
  }, [activeJob, activeJobId, activeRegistrationAction, endpoint, isOpen, post, verifiedHandoff]);

  const completedProof = queueJob?.status === "completed" && queueJob.playbackUrl
    ? queueJob
    : null;
  const completedProgram = programQueueJob?.status === "completed" && programQueueJob.playbackUrl
    ? programQueueJob
    : null;
  const completedMaster = masterQueueJob?.status === "completed" && masterQueueJob.playbackUrl
    ? masterQueueJob
    : null;

  useEffect(() => {
    if (!isOpen || !completedMaster || masterReviewJobId === completedMaster.id) return;
    setMasterPlayback(emptyProgramPlaybackEvidence());
    setMasterReviewNote("");
    void post("read-master-review", { jobId: completedMaster.id });
  }, [completedMaster, isOpen, masterReviewJobId, post]);

  useEffect(() => {
    if (!isOpen || !completedProgram || programReviewJobId === completedProgram.id) return;
    setProgramPlayback(emptyProgramPlaybackEvidence());
    setReviewNote("");
    setMasterPlan(null);
    void post("read-program-review", { jobId: completedProgram.id });
  }, [completedProgram, isOpen, post, programReviewJobId]);

  useEffect(() => {
    if (
      !isOpen
      || !completedProgram
      || !masterQueueJob
      || masterPlan
      || programReview?.latest?.decision !== "approved"
    ) return;
    void post("plan-master-conform", {
      jobId: completedProgram.id,
      approvalReceiptId: programReview.latest.id,
    });
  }, [completedProgram, isOpen, masterPlan, masterQueueJob, post, programReview?.latest]);

  if (!isOpen) return null;

  const minutes = Math.floor(timelineDurationSeconds / 60);
  const seconds = Math.floor(timelineDurationSeconds % 60);
  const returnHref = `/nests/${encodeURIComponent(projectSlug)}/episodes/${encodeURIComponent(episodeSlug)}?mode=edit`;
  const requiredPlaybackBins = Math.max(0, Math.ceil(programPlayback.durationSeconds));
  const watchedFraction = requiredPlaybackBins > 0
    ? programPlayback.watchedSecondBins.length / requiredPlaybackBins
    : 0;
  const approvalReady = Boolean(
    completedProgram
    && programPlayback.playthroughEnded
    && watchedFraction >= 0.9
    && programPlayback.watchedSecondBins.includes(0)
    && programPlayback.watchedSecondBins.includes(Math.floor((requiredPlaybackBins - 1) / 2))
    && programPlayback.watchedSecondBins.includes(requiredPlaybackBins - 1)
    && !programPlayback.mutedAtDecision
    && programPlayback.volumeAtDecision > 0
    && programPlayback.maximumPlaybackRate <= 2,
  );
  const masterRequiredBins = Math.max(0, Math.ceil(masterPlayback.durationSeconds));
  const masterWatchedFraction = masterRequiredBins > 0
    ? masterPlayback.watchedSecondBins.length / masterRequiredBins
    : 0;
  const masterApprovalReady = Boolean(
    completedMaster
    && masterPlayback.playthroughEnded
    && masterWatchedFraction >= 0.9
    && masterPlayback.watchedSecondBins.includes(0)
    && masterPlayback.watchedSecondBins.includes(Math.floor((masterRequiredBins - 1) / 2))
    && masterPlayback.watchedSecondBins.includes(masterRequiredBins - 1)
    && !masterPlayback.mutedAtDecision
    && masterPlayback.volumeAtDecision > 0
    && masterPlayback.maximumPlaybackRate <= 2,
  );

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

            <section className="mt-6 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-indigo-950">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-xl">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-700">Complete Play Edit</p>
                  <h3 className="mt-1 text-xl font-black">Full program review</h3>
                  <p className="mt-2 text-xs leading-5 text-indigo-900/75">
                    Freeze every visible decision into generation-locked chunks, compress explicit Skip ranges on the output clock, and assemble one complete local review. This is the watch-the-whole-episode gate before master approval.
                  </p>
                </div>
                {!programPlan ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void post("plan-program-render", {
                      expectedRevision: verifiedHandoff.request.branchRevision,
                      executorNodeId: plan?.executors.find((executor) => executor.id === "local-mac")?.executorNodeId ?? null,
                    })}
                    className="inline-flex min-h-10 items-center rounded-xl bg-indigo-950 px-4 text-xs font-black text-white disabled:opacity-40"
                  >
                    Check full program
                  </button>
                ) : null}
              </div>

              {programPlan ? (
                <>
                  <dl className="mt-4 grid gap-3 rounded-xl bg-white/80 p-3 text-xs sm:grid-cols-4">
                    <div><dt className="font-black uppercase text-indigo-700">Play Edit</dt><dd className="mt-1 font-black">{formatDuration(programPlan.program.outputDurationSeconds)}</dd></div>
                    <div><dt className="font-black uppercase text-indigo-700">Skipped</dt><dd className="mt-1 font-black">{formatDuration(programPlan.program.skippedDurationSeconds)}</dd></div>
                    <div><dt className="font-black uppercase text-indigo-700">Chunks</dt><dd className="mt-1 font-black">{programPlan.program.chunkCount}</dd></div>
                    <div><dt className="font-black uppercase text-indigo-700">Exact sources</dt><dd className="mt-1 font-black">{programPlan.sources.exactLocalCount}/{programPlan.sources.requiredCount} · {formatBytes(programPlan.sources.totalBytes)}</dd></div>
                  </dl>
                  <article className={`mt-3 rounded-xl border p-3 ${executorTone(programPlan.executor.status)}`}>
                    <div className="flex items-center justify-between gap-3">
                      <strong className="flex items-center gap-2 text-sm"><HardDrive className="h-5 w-5" />{programPlan.executor.label}</strong>
                      <span className="rounded-full bg-white/70 px-2 py-1 text-[9px] font-black uppercase">{programPlan.executor.status}</span>
                    </div>
                    <p className="mt-2 text-xs leading-5">{programPlan.executor.detail}</p>
                    <p className="mt-1 text-[11px] opacity-75">{programPlan.executor.qualityDetail} · {programPlan.executor.costDetail}</p>
                    <button
                      type="button"
                      disabled={!programPlan.executor.canQueue || busy || programPlan.branchRevision !== verifiedHandoff.request.branchRevision}
                      onClick={() => void post("queue-program-render", {
                        expectedRevision: programPlan.branchRevision,
                        executorNodeId: programPlan.executor.executorNodeId ?? null,
                      })}
                      className="mt-3 inline-flex min-h-10 items-center rounded-xl bg-indigo-950 px-4 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Render full program on {programPlan.executor.label}
                    </button>
                  </article>
                  <p className="mt-3 text-[11px] font-bold text-indigo-900/75">
                    The candidate stays on this executor. Completing it creates no approval receipt, master promotion, upload, or publication.
                  </p>
                </>
              ) : null}
            </section>

            {activeJob ? (
              <div className="mt-5 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-950">
                <div className="flex items-center justify-between gap-3">
                  <strong className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5" /> Durable render job</strong>
                  <span className="rounded-full bg-white px-2 py-1 text-[9px] font-black uppercase">{activeJob.status}</span>
                </div>
                <p className="mt-2 font-mono text-[11px]">{activeJob.id}</p>
                {activeJob.progress ? (
                  <div className="mt-3" aria-label={`Render progress ${activeJob.progress.completedUnits} of ${activeJob.progress.totalUnits} chunks`}>
                    <div className="flex items-center justify-between text-[11px] font-black">
                      <span>{activeJob.progress.completedUnits} of {activeJob.progress.totalUnits} chunks assembled</span>
                      <span>{Math.round(activeJob.progress.fraction * 100)}%</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-indigo-100">
                      <div
                        className="h-full rounded-full bg-indigo-700 transition-[width]"
                        style={{ width: `${Math.round(activeJob.progress.fraction * 100)}%` }}
                      />
                    </div>
                  </div>
                ) : null}
                {activeJob.error ? <p className="mt-2 text-xs font-bold text-rose-800">{activeJob.error}</p> : null}
              </div>
            ) : null}
            {completedProof ? (
              <div className="mt-5 overflow-hidden rounded-2xl border border-emerald-300 bg-black">
                <video controls playsInline preload="metadata" src={completedProof.playbackUrl ?? undefined} className="aspect-video w-full bg-black" />
                <p className="bg-emerald-950 px-4 py-3 text-xs font-bold text-emerald-100">Verified local proof · shared revision {completedProof.branchRevision}</p>
              </div>
            ) : null}
            {completedProgram ? (
              <section className="mt-5 overflow-hidden rounded-2xl border border-indigo-300 bg-indigo-950 text-indigo-100">
                <TrackedReviewVideo src={completedProgram.playbackUrl!} setEvidence={setProgramPlayback} />
                <p className="px-4 py-3 text-xs font-bold">Verified full-program review · shared revision {completedProgram.branchRevision} · not an approved master</p>
                <div className="border-t border-indigo-800 bg-white p-4 text-[#3d3122]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-700">Generation-bound decision</p>
                      <h3 className="mt-1 text-lg font-black">Watch the Play Edit, then decide</h3>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${approvalReady ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>
                      {Math.round(watchedFraction * 100)}% observed {programPlayback.playthroughEnded ? "· ended" : ""}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-[#7a674c]">
                    Approval unlocks planning for a separate exact-source master conform. It does not create, upload, or publish a master. Quipsly records browser playback coverage as review evidence; it cannot prove attention or audibility.
                  </p>
                  {programReview?.latest ? (
                    <p className={`mt-3 rounded-xl p-3 text-xs font-bold ${programReview.latest.decision === "approved" ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"}`}>
                      Latest decision: {programReview.latest.decision} by {programReview.latest.actorEmail} · {Math.round(programReview.latest.watchedFraction * 100)}% observed
                      {programReview.latest.note ? ` · ${programReview.latest.note}` : ""}
                    </p>
                  ) : null}
                  <label className="mt-3 block text-xs font-black" htmlFor="program-review-note">Review note</label>
                  <textarea
                    id="program-review-note"
                    value={reviewNote}
                    onChange={(event) => setReviewNote(event.target.value)}
                    placeholder="Optional for approval; required when requesting changes."
                    className="mt-2 min-h-20 w-full rounded-xl border border-[#d8ccb5] bg-white p-3 text-sm outline-none focus:border-indigo-500"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy || !approvalReady || !programPlayback.playbackStartedAt}
                      onClick={() => void post("review-program-render", {
                        jobId: completedProgram.id,
                        decision: "approved",
                        note: reviewNote,
                        playbackEvidence: {
                          kind: "quipsly-episode-program-review-playback-evidence-v1",
                          ...programPlayback,
                        },
                      })}
                      className="inline-flex min-h-10 items-center rounded-xl bg-emerald-800 px-4 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Approve for master planning
                    </button>
                    <button
                      type="button"
                      disabled={busy || programPlayback.watchedSecondBins.length === 0 || reviewNote.trim().length < 3 || !programPlayback.playbackStartedAt}
                      onClick={() => void post("review-program-render", {
                        jobId: completedProgram.id,
                        decision: "rejected",
                        note: reviewNote,
                        playbackEvidence: {
                          kind: "quipsly-episode-program-review-playback-evidence-v1",
                          ...programPlayback,
                        },
                      })}
                      className="inline-flex min-h-10 items-center rounded-xl border border-rose-300 bg-white px-4 text-xs font-black text-rose-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Request changes
                    </button>
                  </div>
                  {programReview?.latest?.decision === "approved" ? (
                    <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sky-950">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="max-w-lg">
                          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-700">Next exact boundary</p>
                          <h4 className="mt-1 text-base font-black">4K master conform readiness</h4>
                          <p className="mt-2 text-xs leading-5 text-sky-900/75">
                            Check original source resolution, exact Mac custody, durable free space, and the latest approval. The 720p review will never be used as master input.
                          </p>
                        </div>
                        {!masterPlan ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void post("plan-master-conform", {
                              jobId: completedProgram.id,
                              approvalReceiptId: programReview.latest!.id,
                            })}
                            className="inline-flex min-h-10 items-center rounded-xl bg-sky-950 px-4 text-xs font-black text-white disabled:opacity-40"
                          >
                            Check 4K master
                          </button>
                        ) : null}
                      </div>
                      {masterPlan ? (
                        <div className="mt-4">
                          <dl className="grid gap-3 rounded-xl bg-white p-3 text-xs sm:grid-cols-3">
                            <div><dt className="font-black uppercase text-sky-700">Profile</dt><dd className="mt-1 font-black">3840×2160 · 24 fps</dd></div>
                            <div><dt className="font-black uppercase text-sky-700">Estimated master</dt><dd className="mt-1 font-black">{formatBytes(masterPlan.masterProfile.estimatedBytesLow)}–{formatBytes(masterPlan.masterProfile.estimatedBytesHigh)}</dd></div>
                            <div><dt className="font-black uppercase text-sky-700">Safe local space</dt><dd className="mt-1 font-black">{masterPlan.executor.storageSafeAvailableBytes === null ? "Not measured" : formatBytes(masterPlan.executor.storageSafeAvailableBytes)}</dd></div>
                          </dl>
                          <div className="mt-3 space-y-2">
                            {masterPlan.sources.video.map((source) => (
                              <div key={source.laneId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-xs">
                                <strong>{source.label}</strong>
                                <span>{source.width && source.height ? `${source.width}×${source.height}` : "Resolution unknown"}{source.fps ? ` · ${source.fps} fps` : " · fps unknown"} · {source.relationshipToOutput.replaceAll("-", " ")}</span>
                              </div>
                            ))}
                          </div>
                          <p className={`mt-3 rounded-xl p-3 text-xs font-bold ${masterPlan.executor.canQueue ? "bg-emerald-100 text-emerald-950" : "bg-amber-100 text-amber-950"}`}>
                            {masterPlan.executor.detail}
                          </p>
                          <p className="mt-2 text-[11px] font-bold text-sky-900/70">
                            Readiness only: the production master will re-render exact originals and require its own full review before any portable upload or publication.
                          </p>
                          {masterPlan.executor.canQueue && !masterQueueJob ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void post("queue-master-conform", {
                                jobId: completedProgram.id,
                                approvalReceiptId: masterPlan.approvedReview.receiptId,
                              })}
                              className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-sky-950 px-5 text-xs font-black text-white disabled:opacity-40"
                            >
                              Render 4K master candidate on this Mac
                            </button>
                          ) : null}
                          {masterQueueJob ? (
                            <div className="mt-3 rounded-xl border border-sky-200 bg-white p-3 text-xs">
                              <strong>{masterQueueJob.status === "completed" ? "4K candidate verified" : masterQueueJob.status === "processing" ? "Rendering 4K candidate" : "4K candidate queued"}</strong>
                              {masterQueueJob.progress ? (
                                <p className="mt-1 text-sky-900/70">{masterQueueJob.progress.completedUnits} of {masterQueueJob.progress.totalUnits} exact chunks complete.</p>
                              ) : null}
                            </div>
                          ) : null}
                          {completedMaster ? (
                            <div className="mt-3 rounded-xl bg-slate-950 p-3 text-white">
                              <TrackedReviewVideo src={completedMaster.playbackUrl!} setEvidence={setMasterPlayback} className="aspect-video w-full rounded-lg bg-black" />
                              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                <p className="text-[11px] text-white/70">Local protected playback of the exact 4K candidate. Client tracking cannot prove attention or audibility.</p>
                                <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${masterApprovalReady ? "bg-emerald-200 text-emerald-950" : "bg-amber-200 text-amber-950"}`}>
                                  {Math.round(masterWatchedFraction * 100)}% observed {masterPlayback.playthroughEnded ? "· ended" : ""}
                                </span>
                              </div>
                              {masterReview?.latest ? (
                                <p className={`mt-3 rounded-xl p-3 text-xs font-bold ${masterReview.latest.decision === "approved" ? "bg-emerald-100 text-emerald-950" : "bg-rose-100 text-rose-950"}`}>
                                  Latest 4K decision: {masterReview.latest.decision} by {masterReview.latest.actorEmail} · {Math.round(masterReview.latest.watchedFraction * 100)}% observed
                                  {masterReview.latest.note ? ` · ${masterReview.latest.note}` : ""}
                                </p>
                              ) : null}
                              <label className="mt-3 block text-xs font-black" htmlFor="master-review-note">4K master review note</label>
                              <textarea
                                id="master-review-note"
                                value={masterReviewNote}
                                onChange={(event) => setMasterReviewNote(event.target.value)}
                                placeholder="Optional for approval; required when requesting changes."
                                className="mt-2 min-h-20 w-full rounded-xl border border-white/20 bg-white p-3 text-sm text-slate-950 outline-none focus:border-sky-400"
                              />
                              <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  disabled={busy || !masterApprovalReady || !masterPlayback.playbackStartedAt}
                                  onClick={() => void post("review-master-conform", { jobId: completedMaster.id, decision: "approved", note: masterReviewNote, playbackEvidence: { kind: "quipsly-episode-program-review-playback-evidence-v1", ...masterPlayback } })}
                                  className="inline-flex min-h-10 items-center rounded-xl bg-emerald-600 px-4 text-xs font-black text-white disabled:opacity-40"
                                >
                                  Approve exact 4K candidate
                                </button>
                                <button
                                  type="button"
                                  disabled={busy || masterPlayback.watchedSecondBins.length === 0 || masterReviewNote.trim().length < 3 || !masterPlayback.playbackStartedAt}
                                  onClick={() => void post("review-master-conform", { jobId: completedMaster.id, decision: "rejected", note: masterReviewNote, playbackEvidence: { kind: "quipsly-episode-program-review-playback-evidence-v1", ...masterPlayback } })}
                                  className="inline-flex min-h-10 items-center rounded-xl border border-rose-300 bg-white px-4 text-xs font-black text-rose-800 disabled:opacity-40"
                                >
                                  Request master changes
                                </button>
                              </div>
                              {masterReview?.latest?.decision === "approved" ? (
                                <div className="mt-4 border-t border-white/10 pt-4">
                                  <p className="text-xs font-bold text-emerald-300">✓ Master approved. Ready for GCS promotion and canonical delivery packaging.</p>
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() => void post("queue-master-promotion", { masterReviewReceiptId: masterReview?.latest?.id ?? "" })}
                                      className="inline-flex min-h-9 items-center rounded-xl bg-sky-600 px-4 text-xs font-black text-white disabled:opacity-40"
                                    >
                                      Promote Master to GCS
                                    </button>
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() => void post("create-delivery-package", { promotionReceiptId: masterReview?.latest?.id ?? "", title: "Episode Delivery Package", summary: "Canonical 4K GCS master delivery bundle" })}
                                      className="inline-flex min-h-9 items-center rounded-xl border border-sky-300/40 bg-white/10 px-4 text-xs font-black text-white hover:bg-white/20 disabled:opacity-40"
                                    >
                                      Create Delivery Package
                                    </button>
                                  </div>
                                </div>
                              ) : null}
                              <p className="mt-3 text-[11px] font-bold text-white/60">Approval records the exact bytes only. Portable promotion, delivery encoding, and publication remain separate actions.</p>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </section>
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
