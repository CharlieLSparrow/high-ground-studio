"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, LoaderCircle, SlidersHorizontal, Sparkles, TriangleAlert } from "lucide-react";

import { EpisodeMixWaveformComparison, type EpisodeMixWaveformProfile } from "@/components/audio/EpisodeMixWaveformComparison";

type MixPreview = { assetId: string; playbackUrl: string | null; sha256: string; durationSeconds: number; integratedLufs: number; truePeakDbtp: number; baselineAssetId: string | null; baselinePlaybackUrl: string | null; baselineSha256: string | null; baselineDurationSeconds: number | null; baselineIntegratedLufs: number | null; baselineTruePeakDbtp: number | null; levelMatchedDeltaLufs: number | null; outputByteRelationship: "bit-identical" | "different" | null };
type AuditionReadyMixPreview = MixPreview & { playbackUrl: string; baselinePlaybackUrl: string; baselineDurationSeconds: number; baselineIntegratedLufs: number; baselineTruePeakDbtp: number };
type MixTranscriptReview = {
  status: "available" | "partial" | "unavailable";
  detail: string;
  transcribedTrackCount: number;
  missingTrackCount: number;
  checkpoints: Array<{ second: number; snippets: Array<{ id: string; trackTitle: string; participantLabel: string | null; transcriptJobId: string; segmentId: string; programStartSeconds: number; programEndSeconds: number; sourceStartSeconds: number; sourceEndSeconds: number; text: string; speakerLabel: string | null; provider: string | null; providerModel: string | null; reviewStatus: "provider" | "human-corrected" | "human-confirmed"; reviewReceiptId: string | null; providerConfidence: number | null }> }>;
  tracks: Array<{ assetId: string; title: string; participantLabel: string | null; transcriptJobId: string | null; available: boolean; detail: string }>;
};
type MixWaveformProfile = EpisodeMixWaveformProfile & { jobId: string; status: "not-queued" | "queued" | "processing" | "output-ready" | "completed" | "blocked" | "failed"; error: string | null };
type MixWaveformReview = {
  status: "not-queued" | "queued" | "processing" | "completed" | "partial" | "failed";
  detail: string;
  sharedByBitExactIdentity: boolean;
  baseline: MixWaveformProfile | null;
  proposal: MixWaveformProfile | null;
};

type MixStatus = {
  jobId: string | null;
  status: "not-queued" | "queued" | "processing" | "output-ready" | "completed" | "failed";
  proposalId: string | null;
  programFingerprintSha256: string | null;
  actionCount: number;
  unresolvedCount: number;
  actions: Array<{ id: string; targetAssetId: string; targetTitle: string; participantLabel: string | null; startSeconds: number; endSeconds: number; gainDb: number; reason: string; evidenceReviewReceiptIds: string[] }>;
  unresolved: Array<{ eventId: string; reason: string; involvedAssetIds: string[] }>;
  requiredReviewSecondBins: number[];
  transcriptReview: MixTranscriptReview;
  waveformReview: MixWaveformReview;
  preview: MixPreview | null;
  error: string | null;
  updatedAt: string | null;
};

const EMPTY_TRANSCRIPT_REVIEW: MixTranscriptReview = { status: "unavailable", detail: "Build a completed matched A/B preview before loading checkpoint transcript context.", transcribedTrackCount: 0, missingTrackCount: 0, checkpoints: [], tracks: [] };
const EMPTY_WAVEFORM_REVIEW: MixWaveformReview = { status: "not-queued", detail: "Build a completed matched A/B preview before measuring its real waveforms.", sharedByBitExactIdentity: false, baseline: null, proposal: null };
const EMPTY: MixStatus = { jobId: null, status: "not-queued", proposalId: null, programFingerprintSha256: null, actionCount: 0, unresolvedCount: 0, actions: [], unresolved: [], requiredReviewSecondBins: [], transcriptReview: EMPTY_TRANSCRIPT_REVIEW, waveformReview: EMPTY_WAVEFORM_REVIEW, preview: null, error: null, updatedAt: null };

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
    let timer = 0;
    const poll = () => {
      const operation = status.status === "output-ready" ? "reconcile" as const : undefined;
      void request(operation, controller.signal)
        .catch((error) => { if (!controller.signal.aborted) setNotice(error instanceof Error ? error.message : "Could not refresh the Episode mix."); })
        .finally(() => { if (!controller.signal.aborted) timer = window.setTimeout(poll, 1_400); });
    };
    timer = window.setTimeout(poll, 1_400);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [request, status.status, status.updatedAt]);

  const queue = async () => {
    setBusy(true);
    setNotice("Analyzing the current program and polishing each voice from its exact source audio.");
    try {
      const next = await request("queue");
      setNotice(next.actionCount ? `Polishing ${next.actionCount} section${next.actionCount === 1 ? "" : "s"}. Quipsly is rendering the enhanced audio now.` : "The recording already looks balanced. Quipsly is rendering a transparent enhanced version for comparison.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not queue the Episode mix."); }
    finally { setBusy(false); }
  };

  const working = busy || status.status === "queued" || status.status === "processing" || status.status === "output-ready";
  const stale = Boolean(status.programFingerprintSha256 && programFingerprintSha256 && status.programFingerprintSha256 !== programFingerprintSha256);

  return (
    <section className="rounded-2xl border border-violet-300 bg-gradient-to-br from-violet-950 via-slate-950 to-slate-900 p-4 text-white shadow-xl sm:p-5" aria-labelledby="episode-mix-heading">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.15em] text-violet-200"><Sparkles className="h-4 w-4" aria-hidden="true" /> Audio polish</div>
          <h2 id="episode-mix-heading" className="mt-1 text-xl font-black">Clear, balanced voices—automatically</h2>
          <p className="mt-2 max-w-3xl text-xs font-semibold leading-5 text-slate-300">Quipsly analyzes the complete program, balances the voices, and keeps every source untouched. Listen, compare, undo, or open the measurements whenever you want.</p>
        </div>
        <span className={`self-start rounded-full border px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.12em] ${status.status === "completed" && !stale ? "border-emerald-500 bg-emerald-950 text-emerald-100" : status.status === "failed" || stale ? "border-rose-500 bg-rose-950 text-rose-100" : working ? "border-amber-400 bg-amber-950 text-amber-100" : "border-slate-600 bg-slate-900 text-slate-200"}`}>{stale ? "program changed" : status.status.replaceAll("-", " ")}</span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <Metric label="Enhanced sections" value={status.actionCount} detail="Each change stays linked to its exact time range." />
        <Metric label="Kept unchanged" value={status.unresolvedCount} detail="Uncertain sections stay natural instead of being guessed." />
        <Metric label="Delivery target" value="−16" detail="LUFS dialogue · true peak independently checked." />
      </div>
      {!eligible ? <div className="mt-4 flex gap-2 rounded-xl border border-amber-500/50 bg-amber-950/60 px-3 py-3 text-xs font-bold leading-5 text-amber-100"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{eligibilityDetail}</div> : null}
      {status.actions.length > 0 || status.unresolved.length > 0 ? <details className="mt-4 rounded-xl border border-violet-700/60 bg-violet-950/40 p-3"><summary className="cursor-pointer text-[10px] font-black uppercase tracking-[0.1em] text-violet-200">What Quipsly changed</summary>{status.actions.length > 0 ? <MixActionMap actions={status.actions} durationSeconds={status.preview?.durationSeconds ?? Math.max(...status.actions.map((action) => action.endSeconds), 1)} /> : null}{status.unresolved.length > 0 ? <div className="mt-3 rounded-xl border border-amber-700/50 bg-amber-950/30 p-3"><div className="text-[10px] font-black uppercase tracking-[0.1em] text-amber-200">Left natural</div>{status.unresolved.map((event) => <div key={`${event.eventId}:${event.reason}`} className="mt-2 text-[10px] font-bold text-amber-100">{event.reason.replaceAll("-", " ")} · {event.involvedAssetIds.length} track{event.involvedAssetIds.length === 1 ? "" : "s"}</div>)}</div> : null}</details> : status.status === "completed" ? <div className="mt-4 rounded-xl border border-sky-700/60 bg-sky-950/40 px-3 py-3 text-xs font-bold leading-5 text-sky-100">This recording was already balanced, so Quipsly preserved its natural levels. {status.preview?.outputByteRelationship === "bit-identical" ? "The enhanced result is bit-for-bit identical to the original." : "You can still compare both versions below."}</div> : null}
      {status.preview?.playbackUrl && !stale ? auditionReady(status.preview)
        ? <EpisodeMixAudition key={status.jobId} preview={status.preview} jobId={status.jobId!} requiredSecondBins={status.requiredReviewSecondBins} transcriptReview={status.transcriptReview} initialWaveformReview={status.waveformReview} actions={status.actions} coordinates={coordinates()} canWrite={canWrite} />
        : <div className="mt-4 rounded-xl border border-amber-700 bg-amber-950/50 p-3"><div className="flex items-center gap-2 text-xs font-black text-amber-100"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Earlier enhanced audio</div><audio className="mt-3 w-full" controls preload="metadata" src={status.preview.playbackUrl} aria-label="Enhanced Episode audio" /><p className="mt-2 text-[10px] font-bold leading-4 text-amber-200">Create a fresh result to unlock instant original/enhanced comparison and current measurements.</p></div>
        : null}
      {notice ? <div className="mt-3 rounded-xl border border-sky-600/60 bg-sky-950/60 px-3 py-2 text-xs font-bold leading-5 text-sky-100" role="status" aria-live="polite">{notice}</div> : null}
      {status.error ? <div className="mt-3 rounded-xl border border-rose-600 bg-rose-950/70 px-3 py-2 text-xs font-bold text-rose-100" role="alert">{status.error}</div> : null}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void queue()} disabled={!canWrite || !eligible || working} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet-400 px-4 text-xs font-black text-violet-950 transition hover:bg-violet-300 disabled:cursor-not-allowed disabled:opacity-50">{working ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />}{working ? "Polishing audio…" : status.status === "completed" ? "Polish again" : "Polish audio"}</button>
        <span className="text-[10px] font-bold leading-4 text-slate-400">Sources stay untouched. Enhanced audio can be turned off or regenerated at any time.</span>
      </div>
    </section>
  );
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail: string }) { return <div className="rounded-xl border border-white/10 bg-white/5 p-3"><div className="text-[9px] font-black uppercase tracking-[0.12em] text-violet-200">{label}</div><div className="mt-1 text-2xl font-black">{value}</div><div className="mt-1 text-[10px] font-semibold leading-4 text-slate-400">{detail}</div></div>; }

function MixActionMap({ actions, durationSeconds }: { actions: MixStatus["actions"]; durationSeconds: number }) { return <div className="mt-3"><p className="text-[10px] font-bold leading-4 text-slate-300">Each bar marks an exact section where Quipsly balanced a voice.</p><div className="relative mt-3 h-7 overflow-hidden rounded-md border border-violet-800 bg-slate-950" aria-label="Episode mix automation timeline">{actions.map((action) => <span key={action.id} className="absolute inset-y-0 min-w-1 border-x border-fuchsia-200 bg-fuchsia-500/70" style={{ left: `${Math.max(0, Math.min(100, action.startSeconds / durationSeconds * 100))}%`, width: `${Math.max(0.5, Math.min(100, (action.endSeconds - action.startSeconds) / durationSeconds * 100))}%` }} title={`${action.targetTitle}: ${action.gainDb} dB at ${clock(action.startSeconds)}–${clock(action.endSeconds)}`} />)}</div><div className="mt-3 space-y-2">{actions.map((action) => <div key={action.id} className="rounded-lg border border-white/10 bg-slate-950/70 p-2 text-[10px] font-bold leading-4 text-slate-200"><div className="flex flex-wrap justify-between gap-2"><span>{action.targetTitle}{action.participantLabel ? ` · ${action.participantLabel}` : ""}</span><span className="font-mono text-fuchsia-200">{clock(action.startSeconds)}–{clock(action.endSeconds)} · {action.gainDb.toFixed(1)} dB</span></div><div className="mt-1 text-slate-400">{action.reason.replaceAll("-", " ")}</div></div>)}</div></div>; }

type MixDecisionSummary = {
  review: { latest: null | { id: string; decision: "approved" | "rejected"; note: string | null; reviewedAt: string; actorEmail: string }; approvalCount: number; rejectionCount: number };
  promotion: { active: boolean; latest: null | { id: string; jobId: string; reviewReceiptId: string | null; operation: "promote" | "withdraw" }; activePromotion: null | { id: string; jobId: string; reviewReceiptId: string | null }; candidatePlaybackUrl: string | null; promoteCount: number; withdrawalCount: number };
};

const EMPTY_DECISIONS: MixDecisionSummary = { review: { latest: null, approvalCount: 0, rejectionCount: 0 }, promotion: { active: false, latest: null, activePromotion: null, candidatePlaybackUrl: null, promoteCount: 0, withdrawalCount: 0 } };

function EpisodeMixAudition({ preview, jobId, requiredSecondBins, transcriptReview, initialWaveformReview, actions, coordinates, canWrite }: { preview: AuditionReadyMixPreview; jobId: string; requiredSecondBins: number[]; transcriptReview: MixTranscriptReview; initialWaveformReview: MixWaveformReview; actions: MixStatus["actions"]; coordinates: { projectId: string; projectSlug: string; episodeProductionId: string }; canWrite: boolean }) {
  const baselineRef = useRef<HTMLAudioElement>(null);
  const proposalRef = useRef<HTMLAudioElement>(null);
  const [version, setVersion] = useState<"baseline" | "proposal">("proposal");
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [baselineBins, setBaselineBins] = useState<number[]>([]);
  const [proposalBins, setProposalBins] = useState<number[]>([]);
  const [switches, setSwitches] = useState<Array<{ from: "baseline" | "proposal"; to: "baseline" | "proposal"; atSecond: number }>>([]);
  const [decisions, setDecisions] = useState<MixDecisionSummary>(EMPTY_DECISIONS);
  const [decisionsLoaded, setDecisionsLoaded] = useState(false);
  const automaticSelectionAttempted = useRef(false);
  const [reviewNote, setReviewNote] = useState("");
  const [withdrawalReason, setWithdrawalReason] = useState("");
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [decisionMessage, setDecisionMessage] = useState("");
  const [waveformReview, setWaveformReview] = useState(initialWaveformReview);
  const [waveformBusy, setWaveformBusy] = useState(false);
  const [waveformMessage, setWaveformMessage] = useState("");
  const duration = Math.max(preview.durationSeconds, preview.baselineDurationSeconds, 0.001);
  const activeRef = version === "baseline" ? baselineRef : proposalRef;
  const approvalReady = requiredSecondBins.every((second) => covered(baselineBins, second) && covered(proposalBins, second)) && switches.length > 0;

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ ...coordinates, jobId });
    void fetch(`/api/media-vault/episode-audio-program/mix/review?${query}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => { const payload = await response.json() as ({ ok?: boolean; error?: string } & Partial<MixDecisionSummary>); if (!response.ok || !payload.ok || !payload.review || !payload.promotion) throw new Error(payload.error || "Could not read the enhanced-audio setting."); setDecisions(payload as MixDecisionSummary); setDecisionsLoaded(true); })
      .catch((error) => { if (!controller.signal.aborted) setDecisionMessage(error instanceof Error ? error.message : "Could not read mix decisions."); });
    return () => controller.abort();
  }, [coordinates, jobId]);

  useEffect(() => {
    if (!["queued", "processing"].includes(waveformReview.status)) return;
    const controller = new AbortController();
    let timer = 0;
    const poll = async () => {
      try {
        const response = await fetch("/api/media-vault/episode-audio-program/mix", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...coordinates, jobId, operation: "reconcile-waveforms" }), signal: controller.signal });
        const payload = await response.json() as ({ ok?: boolean; error?: string; waveformReview?: MixWaveformReview });
        if (!response.ok || !payload.ok || !payload.waveformReview) throw new Error(payload.error || "Could not reconcile A/B waveform evidence.");
        setWaveformReview(payload.waveformReview);
        if (["queued", "processing"].includes(payload.waveformReview.status)) timer = window.setTimeout(poll, 1_400);
        else setWaveformMessage(payload.waveformReview.detail);
      } catch (error) {
        if (!controller.signal.aborted) setWaveformMessage(error instanceof Error ? error.message : "Could not reconcile A/B waveform evidence.");
      }
    };
    timer = window.setTimeout(poll, 1_000);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [coordinates, jobId, waveformReview.status]);

  const analyzeWaveforms = async () => {
    setWaveformBusy(true);
    setWaveformMessage("Registering the verified A/B files and queueing a complete decode…");
    try {
      const response = await fetch("/api/media-vault/episode-audio-program/mix", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...coordinates, jobId, operation: "queue-waveforms" }) });
      const payload = await response.json() as ({ ok?: boolean; error?: string; waveformReview?: MixWaveformReview });
      if (!response.ok || !payload.ok || !payload.waveformReview) throw new Error(payload.error || "Could not queue A/B waveform evidence.");
      setWaveformReview(payload.waveformReview);
      setWaveformMessage(payload.waveformReview.detail);
    } catch (error) { setWaveformMessage(error instanceof Error ? error.message : "Could not queue A/B waveform evidence."); }
    finally { setWaveformBusy(false); }
  };

  const seek = (timeSeconds: number) => {
    const next = Math.max(0, Math.min(duration, timeSeconds));
    if (baselineRef.current) baselineRef.current.currentTime = next;
    if (proposalRef.current) proposalRef.current.currentTime = next;
    setCurrentTime(next);
  };

  const togglePlayback = async () => {
    const active = activeRef.current;
    if (!active) return;
    if (active.paused) {
      try { await active.play(); setPlaying(true); }
      catch { setPlaying(false); }
    } else { active.pause(); setPlaying(false); }
  };

  const switchVersion = async (nextVersion: "baseline" | "proposal") => {
    if (nextVersion === version) return;
    const current = activeRef.current;
    const next = nextVersion === "baseline" ? baselineRef.current : proposalRef.current;
    const shouldContinue = Boolean(current && !current.paused);
    const time = current?.currentTime ?? currentTime;
    current?.pause();
    if (next) next.currentTime = Math.max(0, Math.min(time, duration));
    setSwitches((currentSwitches) => [...currentSwitches, { from: version, to: nextVersion, atSecond: Math.max(0, Math.min(time, duration)) }].slice(-200));
    setVersion(nextVersion);
    setCurrentTime(time);
    if (shouldContinue && next) {
      try { await next.play(); setPlaying(true); }
      catch { setPlaying(false); }
    }
  };

  const observePlayback = (candidate: "baseline" | "proposal", timeSeconds: number) => {
    if (candidate !== version) return;
    setCurrentTime(timeSeconds);
    if (!playing) return;
    const bin = Math.max(0, Math.floor(timeSeconds));
    const update = (current: number[]) => current.includes(bin) ? current : [...current, bin].sort((left, right) => left - right);
    if (candidate === "baseline") setBaselineBins(update);
    else setProposalBins(update);
  };

  const saveReview = async (decision: "approved" | "rejected") => {
    setDecisionBusy(true);
    setDecisionMessage(decision === "approved" ? "Saving playback-bound approval…" : "Saving playback-bound rejection…");
    try {
      const response = await fetch("/api/media-vault/episode-audio-program/mix/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...coordinates, jobId, clientRequestId: crypto.randomUUID(), decision, playbackEvidence: { schema: "quipsly-episode-audio-mix-review-evidence-v1", baselineListenedSecondBins: baselineBins, proposalListenedSecondBins: proposalBins, switches, completedAt: new Date().toISOString() }, note: reviewNote.trim() || null }) });
      const payload = await response.json() as ({ ok?: boolean; error?: string } & Partial<MixDecisionSummary>);
      if (!response.ok || !payload.ok || !payload.review || !payload.promotion) throw new Error(payload.error || "The listening decision was not saved.");
      setDecisions(payload as MixDecisionSummary);
      setDecisionMessage(decision === "approved" ? "Approved as heard. The preview remains unpromoted until you choose the finishing candidate separately." : "Rejected as heard. Both files and the complete history remain intact.");
    } catch (error) { setDecisionMessage(error instanceof Error ? error.message : "The listening decision was not saved."); }
    finally { setDecisionBusy(false); }
  };

  const changePromotion = async (operation: "promote" | "withdraw", automatic = false) => {
    setDecisionBusy(true);
    setDecisionMessage(operation === "promote" ? "Turning on enhanced audio…" : "Returning to the original audio…");
    try {
      const response = await fetch("/api/media-vault/episode-audio-program/mix/promotion", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...coordinates, jobId, clientRequestId: automatic ? `automatic-enhanced-audio:${jobId}` : crypto.randomUUID(), operation, reviewReceiptId: null, reason: null }) });
      const payload = await response.json() as ({ ok?: boolean; error?: string } & Partial<MixDecisionSummary>);
      if (!response.ok || !payload.ok || !payload.review || !payload.promotion) throw new Error(payload.error || "The enhanced-audio setting was not changed.");
      setDecisions(payload as MixDecisionSummary);
      setDecisionMessage(operation === "promote" ? "Enhanced audio is on. Your original sources remain untouched." : "Original audio is active. You can turn the enhancement back on at any time.");
      if (operation === "withdraw") setWithdrawalReason("");
    } catch (error) { setDecisionMessage(error instanceof Error ? error.message : "The enhanced-audio setting was not changed."); }
    finally { setDecisionBusy(false); }
  };

  useEffect(() => {
    if (!canWrite || !decisionsLoaded || decisions.promotion.latest || automaticSelectionAttempted.current) return;
    automaticSelectionAttempted.current = true;
    void changePromotion("promote", true);
  }, [canWrite, decisions.promotion.latest, decisionsLoaded]);

  return <div className="mt-4 rounded-xl border border-emerald-700 bg-emerald-950/50 p-3">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><div className="flex items-center gap-2 text-xs font-black text-emerald-100"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Enhanced audio is ready</div><p className="mt-1 text-[10px] font-bold leading-4 text-emerald-200">Switch instantly between the original and enhanced versions at the same playhead. Both are level-matched for an honest comparison.</p></div>
      <div className="flex flex-wrap gap-2"><span className="rounded-full border border-emerald-600 bg-emerald-950 px-2 py-1 text-[9px] font-black uppercase tracking-[0.1em] text-emerald-100">{(preview.levelMatchedDeltaLufs ?? 0).toFixed(2)} LU apart</span><span className="rounded-full border border-sky-600 bg-sky-950 px-2 py-1 text-[9px] font-black uppercase tracking-[0.1em] text-sky-100">{preview.outputByteRelationship === "bit-identical" ? "Bit-exact no-op" : "Verified changed bytes"}</span></div>
    </div>
    <div className="mt-3 grid grid-cols-2 overflow-hidden rounded-lg border border-emerald-800 bg-slate-950 p-1" role="group" aria-label="Episode mix audition version">
      {(["baseline", "proposal"] as const).map((candidate) => <button key={candidate} type="button" aria-pressed={version === candidate} onClick={() => void switchVersion(candidate)} className={`rounded-md px-3 py-2 text-xs font-black ${version === candidate ? "bg-white text-slate-950" : "text-slate-300 hover:bg-slate-900"}`}>{candidate === "baseline" ? "Original" : "Enhanced"}</button>)}
    </div>
    <audio ref={baselineRef} src={preview.baselinePlaybackUrl} preload="metadata" data-audition-version="baseline" onTimeUpdate={(event) => observePlayback("baseline", event.currentTarget.currentTime)} onEnded={() => setPlaying(false)} />
    <audio ref={proposalRef} src={preview.playbackUrl} preload="metadata" data-audition-version="proposal" onTimeUpdate={(event) => observePlayback("proposal", event.currentTarget.currentTime)} onEnded={() => setPlaying(false)} />
    <div className="mt-3 flex items-center gap-3 rounded-lg bg-slate-950 px-3 py-3">
      <button type="button" onClick={() => void togglePlayback()} className="min-w-20 rounded-md bg-violet-300 px-3 py-2 text-xs font-black text-violet-950 hover:bg-violet-200">{playing ? "Pause" : "Play"}</button>
      <span className="w-24 font-mono text-[10px] font-bold text-slate-300">{clock(currentTime)} / {clock(duration)}</span>
      <input aria-label="Episode mix audition playhead" type="range" min="0" max={duration} step="0.05" value={Math.min(currentTime, duration)} onChange={(event) => seek(Number(event.currentTarget.value))} className="min-w-0 flex-1 accent-violet-300" />
    </div>
    {waveformReview.status === "completed" && waveformReview.proposal && (waveformReview.baseline || waveformReview.sharedByBitExactIdentity)
      ? <EpisodeMixWaveformComparison baseline={waveformReview.baseline ?? waveformReview.proposal} proposal={waveformReview.proposal} durationSeconds={duration} currentTime={currentTime} actions={actions} checkpoints={requiredSecondBins} sharedByBitExactIdentity={waveformReview.sharedByBitExactIdentity} seek={seek} />
      : <div className="mt-3 rounded-lg border border-cyan-800/70 bg-cyan-950/25 p-3">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><div className="text-[10px] font-black uppercase tracking-[0.1em] text-cyan-200">Same-clock signal evidence</div><p className="mt-1 max-w-2xl text-[9px] font-bold leading-4 text-slate-300">{waveformReview.detail}</p></div><span className={`rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-[0.08em] ${waveformReview.status === "failed" || waveformReview.status === "partial" ? "border-rose-600 text-rose-200" : waveformReview.status === "queued" || waveformReview.status === "processing" ? "border-amber-600 text-amber-200" : "border-slate-600 text-slate-300"}`}>{waveformReview.status}</span></div>
        <p className="mt-2 text-[9px] font-bold leading-4 text-slate-400">Quipsly will render only complete-decode windowed RMS and sample-peak measurements. It will not substitute decorative waveform bars.</p>
        {!["queued", "processing"].includes(waveformReview.status) ? <button type="button" disabled={!canWrite || waveformBusy} onClick={() => void analyzeWaveforms()} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-md border border-cyan-600 bg-cyan-950 px-3 text-[10px] font-black text-cyan-100 hover:bg-cyan-900 disabled:cursor-not-allowed disabled:opacity-50">{waveformBusy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />}Analyze real A/B waveforms</button> : <div className="mt-3 inline-flex items-center gap-2 text-[10px] font-black text-amber-200"><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />Complete decode in progress</div>}
        {waveformMessage ? <p className="mt-2 text-[9px] font-bold leading-4 text-cyan-100" role="status" aria-live="polite">{waveformMessage}</p> : null}
      </div>}
    <div className="mt-3 rounded-lg border border-violet-700/70 bg-violet-950/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-xs font-black text-violet-100">Enhanced audio</div><p className="mt-1 text-[9px] font-bold leading-4 text-violet-200">On by default for this result. Your original sources are never changed.</p></div><span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase ${decisions.promotion.active ? "border-emerald-600 text-emerald-200" : "border-slate-600 text-slate-300"}`}>{decisions.promotion.active ? "On" : decisionsLoaded ? "Off" : "Loading"}</span></div>
      <div className="mt-3 grid grid-cols-2 overflow-hidden rounded-lg border border-violet-700 bg-slate-950 p-1" role="group" aria-label="Enhanced audio setting"><button type="button" aria-pressed={!decisions.promotion.active} disabled={!canWrite || decisionBusy || !decisionsLoaded} onClick={() => void changePromotion("withdraw")} className={`rounded-md px-3 py-2 text-xs font-black ${!decisions.promotion.active ? "bg-white text-slate-950" : "text-slate-300"}`}>Use original</button><button type="button" aria-pressed={decisions.promotion.active} disabled={!canWrite || decisionBusy || !decisionsLoaded} onClick={() => void changePromotion("promote")} className={`rounded-md px-3 py-2 text-xs font-black ${decisions.promotion.active ? "bg-violet-300 text-violet-950" : "text-slate-300"}`}>Use enhanced</button></div>
      {decisionMessage ? <p className="mt-2 text-[10px] font-bold leading-4 text-violet-100" role="status" aria-live="polite">{decisionMessage}</p> : null}
    </div>
    <details className="mt-3 rounded-lg border border-sky-800/70 bg-sky-950/25 p-3">
      <summary className="cursor-pointer text-[10px] font-black uppercase tracking-[0.1em] text-sky-200">Audio details and transcript context</summary>
      <TranscriptCheckpointContext review={transcriptReview} requiredSecondBins={requiredSecondBins} seek={seek} />
      <div className="mt-3 grid grid-cols-2 gap-2 text-center text-[10px] font-bold sm:grid-cols-4">
        <AuditionMetric value={preview.baselineIntegratedLufs.toFixed(1)} label="Original LUFS" />
        <AuditionMetric value={preview.integratedLufs.toFixed(1)} label="Enhanced LUFS" />
        <AuditionMetric value={preview.baselineTruePeakDbtp.toFixed(1)} label="Original dBTP" />
        <AuditionMetric value={preview.truePeakDbtp.toFixed(1)} label="Enhanced dBTP" />
      </div>
    </details>
  </div>;
}

function TranscriptCheckpointContext({ review, requiredSecondBins, seek }: { review: MixTranscriptReview; requiredSecondBins: number[]; seek: (seconds: number) => void }) {
  return <div className="mt-3 rounded-lg border border-sky-800/80 bg-sky-950/35 p-3" aria-label="Transcript-linked review context">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><div className="text-[10px] font-black uppercase tracking-[0.1em] text-sky-200">What was being said</div><p className="mt-1 text-[9px] font-bold leading-4 text-sky-100">Exact-source transcript snippets share the mix program clock. Provider confidence is triage evidence, never measured accuracy.</p></div>
      <span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase ${review.status === "available" ? "border-emerald-600 text-emerald-200" : review.status === "partial" ? "border-amber-600 text-amber-200" : "border-slate-600 text-slate-300"}`}>{review.status}</span>
    </div>
    <p className="mt-2 text-[9px] font-bold leading-4 text-slate-300">{review.detail}</p>
    <div className="mt-3 grid gap-2 lg:grid-cols-3">
      {requiredSecondBins.map((second) => {
        const checkpoint = review.checkpoints.find((candidate) => Math.abs(candidate.second - second) <= 0.001);
        return <div key={second} className="rounded-lg border border-white/10 bg-slate-950/75 p-2">
          <button type="button" onClick={() => seek(second)} className="font-mono text-[10px] font-black text-sky-200 hover:text-white">At {clock(second)}</button>
          {checkpoint?.snippets.length ? <div className="mt-2 space-y-2">{checkpoint.snippets.map((snippet) => <button key={snippet.id} type="button" onClick={() => seek(Math.max(0, snippet.programStartSeconds - 0.35))} className="block w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-2 text-left hover:border-sky-500">
            <span className="flex flex-wrap items-center justify-between gap-1 text-[8px] font-black uppercase tracking-[0.08em] text-slate-400"><span>{snippet.speakerLabel || snippet.participantLabel || snippet.trackTitle}</span><span className={snippet.reviewStatus === "provider" ? "text-amber-300" : "text-emerald-300"}>{transcriptReviewLabel(snippet.reviewStatus)}</span></span>
            <span className="mt-1 block text-[10px] font-semibold leading-4 text-slate-100">“{snippet.text}”</span>
            <span className="mt-1 block font-mono text-[8px] font-bold text-slate-500">{clock(snippet.programStartSeconds)}–{clock(snippet.programEndSeconds)} program · {snippet.trackTitle}</span>
          </button>)}</div> : <p className="mt-2 text-[9px] font-bold leading-4 text-slate-500">No exact timed transcript segment is available near this checkpoint.</p>}
        </div>;
      })}
    </div>
  </div>;
}

function transcriptReviewLabel(status: "provider" | "human-corrected" | "human-confirmed") {
  return status === "human-corrected" ? "Human corrected" : status === "human-confirmed" ? "Human confirmed" : "Provider text";
}

function AuditionMetric({ value, label }: { value: string; label: string }) { return <div className="rounded-lg bg-slate-950 px-2 py-2"><div className="font-mono text-sm font-black text-emerald-100">{value}</div><div className="text-slate-400">{label}</div></div>; }
function auditionReady(preview: MixPreview): preview is AuditionReadyMixPreview { return Boolean(preview.playbackUrl && preview.baselinePlaybackUrl && preview.baselineDurationSeconds !== null && preview.baselineIntegratedLufs !== null && preview.baselineTruePeakDbtp !== null); }
function covered(listenedSecondBins: number[], requiredSecond: number) { return listenedSecondBins.some((second) => Math.abs(second - requiredSecond) <= 1); }
function clock(seconds: number) { const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0; return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`; }
