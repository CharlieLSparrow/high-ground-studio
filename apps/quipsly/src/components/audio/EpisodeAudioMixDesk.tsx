"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, LoaderCircle, SlidersHorizontal, Sparkles, TriangleAlert } from "lucide-react";

type MixPreview = { assetId: string; playbackUrl: string | null; sha256: string; durationSeconds: number; integratedLufs: number; truePeakDbtp: number; baselineAssetId: string | null; baselinePlaybackUrl: string | null; baselineSha256: string | null; baselineDurationSeconds: number | null; baselineIntegratedLufs: number | null; baselineTruePeakDbtp: number | null; levelMatchedDeltaLufs: number | null };
type AuditionReadyMixPreview = MixPreview & { playbackUrl: string; baselinePlaybackUrl: string; baselineDurationSeconds: number; baselineIntegratedLufs: number; baselineTruePeakDbtp: number };

type MixStatus = {
  jobId: string | null;
  status: "not-queued" | "queued" | "processing" | "output-ready" | "completed" | "failed";
  proposalId: string | null;
  programFingerprintSha256: string | null;
  actionCount: number;
  unresolvedCount: number;
  requiredReviewSecondBins: number[];
  preview: MixPreview | null;
  error: string | null;
  updatedAt: string | null;
};

const EMPTY: MixStatus = { jobId: null, status: "not-queued", proposalId: null, programFingerprintSha256: null, actionCount: 0, unresolvedCount: 0, requiredReviewSecondBins: [], preview: null, error: null, updatedAt: null };

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
      {status.preview?.playbackUrl && !stale ? auditionReady(status.preview)
        ? <EpisodeMixAudition key={status.jobId} preview={status.preview} jobId={status.jobId!} requiredSecondBins={status.requiredReviewSecondBins} coordinates={coordinates()} canWrite={canWrite} />
        : <div className="mt-4 rounded-xl border border-amber-700 bg-amber-950/50 p-3"><div className="flex items-center gap-2 text-xs font-black text-amber-100"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Verified legacy preview retained</div><audio className="mt-3 w-full" controls preload="metadata" src={status.preview.playbackUrl} aria-label="Verified Episode mix preview" /><p className="mt-2 text-[10px] font-bold leading-4 text-amber-200">This earlier result predates matched baseline rendering. Build a new proposal for trustworthy A/B review.</p></div>
        : null}
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

type MixDecisionSummary = {
  review: { latest: null | { id: string; decision: "approved" | "rejected"; note: string | null; reviewedAt: string; actorEmail: string }; approvalCount: number; rejectionCount: number };
  promotion: { active: boolean; activePromotion: null | { id: string; jobId: string; reviewReceiptId: string | null }; candidatePlaybackUrl: string | null; promoteCount: number; withdrawalCount: number };
};

const EMPTY_DECISIONS: MixDecisionSummary = { review: { latest: null, approvalCount: 0, rejectionCount: 0 }, promotion: { active: false, activePromotion: null, candidatePlaybackUrl: null, promoteCount: 0, withdrawalCount: 0 } };

function EpisodeMixAudition({ preview, jobId, requiredSecondBins, coordinates, canWrite }: { preview: AuditionReadyMixPreview; jobId: string; requiredSecondBins: number[]; coordinates: { projectId: string; projectSlug: string; episodeProductionId: string }; canWrite: boolean }) {
  const baselineRef = useRef<HTMLAudioElement>(null);
  const proposalRef = useRef<HTMLAudioElement>(null);
  const [version, setVersion] = useState<"baseline" | "proposal">("proposal");
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [baselineBins, setBaselineBins] = useState<number[]>([]);
  const [proposalBins, setProposalBins] = useState<number[]>([]);
  const [switches, setSwitches] = useState<Array<{ from: "baseline" | "proposal"; to: "baseline" | "proposal"; atSecond: number }>>([]);
  const [decisions, setDecisions] = useState<MixDecisionSummary>(EMPTY_DECISIONS);
  const [reviewNote, setReviewNote] = useState("");
  const [withdrawalReason, setWithdrawalReason] = useState("");
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [decisionMessage, setDecisionMessage] = useState("");
  const duration = Math.max(preview.durationSeconds, preview.baselineDurationSeconds, 0.001);
  const activeRef = version === "baseline" ? baselineRef : proposalRef;
  const approvalReady = requiredSecondBins.every((second) => covered(baselineBins, second) && covered(proposalBins, second)) && switches.length > 0;

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ ...coordinates, jobId });
    void fetch(`/api/media-vault/episode-audio-program/mix/review?${query}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => { const payload = await response.json() as ({ ok?: boolean; error?: string } & Partial<MixDecisionSummary>); if (!response.ok || !payload.ok || !payload.review || !payload.promotion) throw new Error(payload.error || "Could not read mix decisions."); setDecisions(payload as MixDecisionSummary); })
      .catch((error) => { if (!controller.signal.aborted) setDecisionMessage(error instanceof Error ? error.message : "Could not read mix decisions."); });
    return () => controller.abort();
  }, [coordinates, jobId]);

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

  const changePromotion = async (operation: "promote" | "withdraw") => {
    setDecisionBusy(true);
    setDecisionMessage(operation === "promote" ? "Marking the approved proposal as a finishing candidate…" : "Withdrawing the candidate while preserving every receipt…");
    try {
      const response = await fetch("/api/media-vault/episode-audio-program/mix/promotion", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...coordinates, jobId, clientRequestId: crypto.randomUUID(), operation, reviewReceiptId: decisions.review.latest?.decision === "approved" ? decisions.review.latest.id : null, reason: operation === "withdraw" ? withdrawalReason.trim() || null : null }) });
      const payload = await response.json() as ({ ok?: boolean; error?: string } & Partial<MixDecisionSummary>);
      if (!response.ok || !payload.ok || !payload.review || !payload.promotion) throw new Error(payload.error || "The finishing candidate was not changed.");
      setDecisions(payload as MixDecisionSummary);
      setDecisionMessage(operation === "promote" ? "Finishing candidate selected. Sources, Episode program, delivery encoding, and publication are still unchanged." : "Candidate withdrawn. Its bytes, approval, and history remain available.");
      if (operation === "withdraw") setWithdrawalReason("");
    } catch (error) { setDecisionMessage(error instanceof Error ? error.message : "The finishing candidate was not changed."); }
    finally { setDecisionBusy(false); }
  };

  return <div className="mt-4 rounded-xl border border-emerald-700 bg-emerald-950/50 p-3">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><div className="flex items-center gap-2 text-xs font-black text-emerald-100"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Matched A/B ready for a deliberate listen</div><p className="mt-1 text-[10px] font-bold leading-4 text-emerald-200">Switch instantly at the same playhead. Both files were independently mastered and measured, so louder-is-better bias stays below 0.2 LU.</p></div>
      <span className="rounded-full border border-emerald-600 bg-emerald-950 px-2 py-1 text-[9px] font-black uppercase tracking-[0.1em] text-emerald-100">{(preview.levelMatchedDeltaLufs ?? 0).toFixed(2)} LU apart</span>
    </div>
    <div className="mt-3 grid grid-cols-2 overflow-hidden rounded-lg border border-emerald-800 bg-slate-950 p-1" role="group" aria-label="Episode mix audition version">
      {(["baseline", "proposal"] as const).map((candidate) => <button key={candidate} type="button" aria-pressed={version === candidate} onClick={() => void switchVersion(candidate)} className={`rounded-md px-3 py-2 text-xs font-black ${version === candidate ? "bg-white text-slate-950" : "text-slate-300 hover:bg-slate-900"}`}>{candidate === "baseline" ? "Baseline · no gain moves" : "Proposal · reviewed moves"}</button>)}
    </div>
    <audio ref={baselineRef} src={preview.baselinePlaybackUrl} preload="metadata" data-audition-version="baseline" onTimeUpdate={(event) => observePlayback("baseline", event.currentTarget.currentTime)} onEnded={() => setPlaying(false)} />
    <audio ref={proposalRef} src={preview.playbackUrl} preload="metadata" data-audition-version="proposal" onTimeUpdate={(event) => observePlayback("proposal", event.currentTarget.currentTime)} onEnded={() => setPlaying(false)} />
    <div className="mt-3 flex items-center gap-3 rounded-lg bg-slate-950 px-3 py-3">
      <button type="button" onClick={() => void togglePlayback()} className="min-w-20 rounded-md bg-violet-300 px-3 py-2 text-xs font-black text-violet-950 hover:bg-violet-200">{playing ? "Pause" : "Play"}</button>
      <span className="w-24 font-mono text-[10px] font-bold text-slate-300">{clock(currentTime)} / {clock(duration)}</span>
      <input aria-label="Episode mix audition playhead" type="range" min="0" max={duration} step="0.05" value={Math.min(currentTime, duration)} onChange={(event) => seek(Number(event.currentTarget.value))} className="min-w-0 flex-1 accent-violet-300" />
    </div>
    <div className="mt-3 rounded-lg border border-emerald-800/80 bg-slate-950/80 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><div className="text-[10px] font-black uppercase tracking-[0.1em] text-emerald-200">Required review checkpoints</div><span className={`rounded-full px-2 py-1 text-[9px] font-black ${approvalReady ? "bg-emerald-200 text-emerald-950" : "bg-slate-800 text-slate-300"}`}>{approvalReady ? "Coverage ready" : "Listen to both at each point"}</span></div>
      <div className="mt-2 flex flex-wrap gap-2">{requiredSecondBins.map((second) => <button key={second} type="button" onClick={() => seek(second)} className={`rounded-md border px-2 py-1 font-mono text-[9px] font-black ${covered(baselineBins, second) && covered(proposalBins, second) ? "border-emerald-500 bg-emerald-950 text-emerald-100" : "border-slate-700 bg-slate-900 text-slate-300"}`}>{clock(second)} {covered(baselineBins, second) ? "B✓" : "B○"} {covered(proposalBins, second) ? "P✓" : "P○"}</button>)}</div>
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2 text-center text-[10px] font-bold sm:grid-cols-4">
      <AuditionMetric value={preview.baselineIntegratedLufs.toFixed(1)} label="Baseline LUFS" />
      <AuditionMetric value={preview.integratedLufs.toFixed(1)} label="Proposal LUFS" />
      <AuditionMetric value={preview.baselineTruePeakDbtp.toFixed(1)} label="Baseline dBTP" />
      <AuditionMetric value={preview.truePeakDbtp.toFixed(1)} label="Proposal dBTP" />
    </div>
    <p className="mt-2 text-[9px] font-bold text-emerald-300" aria-live="polite">Listening evidence: baseline {baselineBins.length}s · proposal {proposalBins.length}s · {switches.length} same-clock switch{switches.length === 1 ? "" : "es"}. Client-observed playback is useful review evidence, not proof of audibility.</p>
    <div className="mt-3 rounded-lg border border-violet-700/70 bg-violet-950/50 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2"><div><div className="text-xs font-black text-violet-100">Listening decision</div><p className="mt-1 text-[9px] font-bold leading-4 text-violet-200">Approval creates a receipt only. Selecting a finishing candidate is a separate reversible action.</p></div>{decisions.review.latest ? <span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase ${decisions.review.latest.decision === "approved" ? "border-emerald-600 text-emerald-200" : "border-rose-600 text-rose-200"}`}>{decisions.review.latest.decision}</span> : null}</div>
      <textarea value={reviewNote} onChange={(event) => setReviewNote(event.currentTarget.value)} placeholder="What did you hear? Required for rejection; useful for approval." className="mt-2 min-h-20 w-full rounded-md border border-violet-800 bg-slate-950 p-2 text-xs text-white placeholder:text-slate-500" />
      <div className="mt-2 grid gap-2 sm:grid-cols-2"><button type="button" disabled={!canWrite || decisionBusy || !approvalReady} onClick={() => void saveReview("approved")} className="rounded-md border border-emerald-600 bg-emerald-950 px-3 py-2 text-left text-[10px] font-black text-emerald-100 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-950 disabled:text-slate-500">Approve as heard<span className="mt-1 block text-[9px] opacity-75">Receipt only · no promotion or timeline change</span></button><button type="button" disabled={!canWrite || decisionBusy || proposalBins.length === 0 || reviewNote.trim().length < 3} onClick={() => void saveReview("rejected")} className="rounded-md border border-rose-700 bg-rose-950 px-3 py-2 text-left text-[10px] font-black text-rose-100 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-950 disabled:text-slate-500">Reject proposal<span className="mt-1 block text-[9px] opacity-75">Preserves files and records what failed</span></button></div>
      {decisions.review.latest?.decision === "approved" && !decisions.promotion.active ? <button type="button" disabled={!canWrite || decisionBusy} onClick={() => void changePromotion("promote")} className="mt-2 w-full rounded-md bg-violet-300 px-3 py-2 text-left text-[10px] font-black text-violet-950">Use as finishing candidate<span className="mt-1 block text-[9px] opacity-75">Still does not encode delivery or publish</span></button> : null}
      {decisions.promotion.active ? <div className="mt-2 rounded-md border border-amber-700 bg-amber-950/70 p-2"><div className="text-[10px] font-black text-amber-100">Active finishing candidate</div><input value={withdrawalReason} onChange={(event) => setWithdrawalReason(event.currentTarget.value)} placeholder="Reason for withdrawal" className="mt-2 w-full rounded border border-amber-800 bg-slate-950 px-2 py-2 text-xs text-white" /><button type="button" disabled={!canWrite || decisionBusy || withdrawalReason.trim().length < 3} onClick={() => void changePromotion("withdraw")} className="mt-2 rounded-md border border-amber-600 px-3 py-2 text-[10px] font-black text-amber-100 disabled:opacity-50">Withdraw candidate</button></div> : null}
      {decisionMessage ? <p className="mt-2 text-[10px] font-bold leading-4 text-violet-100" role="status" aria-live="polite">{decisionMessage}</p> : null}
    </div>
  </div>;
}

function AuditionMetric({ value, label }: { value: string; label: string }) { return <div className="rounded-lg bg-slate-950 px-2 py-2"><div className="font-mono text-sm font-black text-emerald-100">{value}</div><div className="text-slate-400">{label}</div></div>; }
function auditionReady(preview: MixPreview): preview is AuditionReadyMixPreview { return Boolean(preview.playbackUrl && preview.baselinePlaybackUrl && preview.baselineDurationSeconds !== null && preview.baselineIntegratedLufs !== null && preview.baselineTruePeakDbtp !== null); }
function covered(listenedSecondBins: number[], requiredSecond: number) { return listenedSecondBins.some((second) => Math.abs(second - requiredSecond) <= 1); }
function clock(seconds: number) { const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0; return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`; }
