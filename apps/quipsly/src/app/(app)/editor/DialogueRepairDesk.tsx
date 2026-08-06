"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AudibleEventMap, audibleEventMapMoments } from "@/components/audio/AudibleEventMap";
import { AudibleEventQualificationLab } from "@/components/audio/AudibleEventQualificationLab";
import type { AudibleEventDetectorReceipt } from "@/lib/audio/audible-event-analysis";
import type { AudibleEventReviewDecision, AudibleEventReviewStatus } from "@/lib/audio/audible-event-review";
import type { AudioTranscriptEvidence } from "@/lib/transcript-evidence";

import type { AudioMasteryMeasurement, AudioSignalDiagnosisSummary } from "./AudioMasteryAudition";

type DialogueRepairLabel = "mouth-click" | "plosive" | "sibilance" | "breath" | "clipping" | "noise-event";
type DialogueRepairDecision = "confirmed" | "false-positive" | "needs-comparison";
type DialogueAuditionDecision = "repair-preferred" | "source-preferred" | "indistinguishable" | "needs-work";

type DialogueCandidate = {
  kind: "quipsly-dialogue-repair-candidate-v1";
  candidateId: string;
  label: DialogueRepairLabel;
  createdAt: string;
  createdByEmail: string;
  range: { startSeconds: number; endSeconds: number; auditionPreRollSeconds: number; auditionPostRollSeconds: number; sourceDurationSeconds: number };
  origin: { kind: string };
  context: {
    speakerLabel: string | null;
    transcriptWordAnchors: Array<{ wordId: string; startSeconds: number; endSeconds: number; text: string; speakerLabel: string | null }>;
  };
};

type DialogueExperiment = {
  jobId: string;
  status: "queued" | "processing" | "output-ready" | "completed" | "failed";
  authorizingReviewReceiptId: string;
  playbackUrl: string | null;
  error: string | null;
  verification: null | { durationDeltaSeconds: number; sourceChannelCount: number; outputChannelCount: number; completeOutputDecode: true; passes: true };
  derivative: null | { durationSeconds: number; measured: AudioMasteryMeasurement; diagnosis: AudioSignalDiagnosisSummary };
  latestAudition: null | { id: string; decision: DialogueAuditionDecision; actorEmail: string; note: string | null; occurredAt: string };
  auditionCounts: { repairPreferred: number; sourcePreferred: number; indistinguishable: number; needsWork: number };
};

export type DialogueRepairStatus = {
  available: boolean;
  sourceDurationSeconds: number | null;
  candidates: Array<{
    candidate: DialogueCandidate;
    latestReview: null | { id: string; decision: DialogueRepairDecision; actorEmail: string; note: string | null; occurredAt: string };
    reviewCounts: { confirmed: number; falsePositive: number; needsComparison: number };
    experiment: DialogueExperiment | null;
  }>;
  boundaries: {
    originalRemainsSourceTruth: true;
    candidateStateComesFromAppendOnlyReceipts: true;
    detectorSuggestionsRequireHumanListening: true;
    confirmedCandidateAuthorizesExperimentOnly: true;
  };
};

type Props = {
  projectId?: string;
  projectSlug: string;
  assetId: string;
  sourceId: string;
  sourceUrl: string;
  sourceMeasurement: AudioMasteryMeasurement;
  audioSignal?: AudioTranscriptEvidence["audio"]["signal"];
  audibleEventAnalysis?: AudibleEventDetectorReceipt | null;
};

const LABELS: Array<{ value: DialogueRepairLabel; label: string }> = [
  { value: "mouth-click", label: "Mouth click" },
  { value: "plosive", label: "Plosive" },
  { value: "sibilance", label: "Sibilance" },
  { value: "breath", label: "Breath" },
  { value: "clipping", label: "Clipping" },
  { value: "noise-event", label: "Noise event" },
];

export function DialogueRepairDesk({ projectId, projectSlug, assetId, sourceId, sourceUrl, sourceMeasurement, audioSignal = null, audibleEventAnalysis = null }: Props) {
  const sourceRef = useRef<HTMLAudioElement | null>(null);
  const repairedRef = useRef<HTMLAudioElement | null>(null);
  const stopAtRef = useRef<number | null>(null);
  const playbackPurposeRef = useRef<"candidate-source" | "comparison-source" | "comparison-repaired" | null>(null);
  const [status, setStatus] = useState<DialogueRepairStatus | null>(null);
  const [audibleReviewStatus, setAudibleReviewStatus] = useState<AudibleEventReviewStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [label, setLabel] = useState<DialogueRepairLabel>("mouth-click");
  const [startSeconds, setStartSeconds] = useState(0);
  const [endSeconds, setEndSeconds] = useState(0.03);
  const [activeCandidateId, setActiveCandidateId] = useState<string | null>(null);
  const [activeDetectorEventId, setActiveDetectorEventId] = useState<string | null>(null);
  const [listenedBins, setListenedBins] = useState<Set<number>>(() => new Set());
  const [detectorListenedBins, setDetectorListenedBins] = useState<Set<number>>(() => new Set());
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [auditionNotes, setAuditionNotes] = useState<Record<string, string>>({});
  const [detectorNotes, setDetectorNotes] = useState<Record<string, string>>({});
  const [comparisonMode, setComparisonMode] = useState<"source" | "repaired">("source");
  const [sourceComparisonBins, setSourceComparisonBins] = useState<Set<number>>(() => new Set());
  const [repairedComparisonBins, setRepairedComparisonBins] = useState<Set<number>>(() => new Set());

  const coordinates = useMemo(
    () => ({ ...(projectId ? { projectId } : {}), projectSlug, assetId, sourceId }),
    [assetId, projectId, projectSlug, sourceId],
  );
  const refresh = useCallback(async () => {
    const query = new URLSearchParams(coordinates);
    const response = await fetch(`/api/media-vault/dialogue-repair?${query}`, { cache: "no-store" });
    const payload = await response.json().catch(() => null) as ({ ok?: boolean; error?: string } & Partial<DialogueRepairStatus>) | null;
    if (!response.ok || !payload?.ok || !payload.candidates) throw new Error(payload?.error || `Dialogue Repair returned HTTP ${response.status}.`);
    setStatus(payload as { ok: true } & DialogueRepairStatus);
    setActiveCandidateId((current) => current && payload.candidates?.some((entry) => entry.candidate.candidateId === current) ? current : payload.candidates?.[0]?.candidate.candidateId ?? null);
    return payload as { ok: true } & DialogueRepairStatus;
  }, [coordinates]);

  const refreshAudibleReviews = useCallback(async () => {
    if (!audibleEventAnalysis) { setAudibleReviewStatus(null); return null; }
    const query = new URLSearchParams(coordinates);
    const response = await fetch(`/api/media-vault/audible-event-reviews?${query}`, { cache: "no-store" });
    const payload = await response.json().catch(() => null) as ({ ok?: boolean; error?: string } & Partial<AudibleEventReviewStatus>) | null;
    if (!response.ok || !payload?.ok || !payload.summary || !payload.entries) throw new Error(payload?.error || `Audible-event reviews returned HTTP ${response.status}.`);
    setAudibleReviewStatus(payload as { ok: true } & AudibleEventReviewStatus);
    return payload as { ok: true } & AudibleEventReviewStatus;
  }, [audibleEventAnalysis, coordinates]);

  useEffect(() => {
    let canceled = false;
    void Promise.all([refresh(), refreshAudibleReviews()]).catch((reason) => { if (!canceled) setError(reason instanceof Error ? reason.message : "Dialogue Repair could not load."); });
    return () => { canceled = true; };
  }, [refresh, refreshAudibleReviews]);

  const activeEntry = status?.candidates.find((entry) => entry.candidate.candidateId === activeCandidateId) ?? status?.candidates[0] ?? null;
  const activeCandidate = activeEntry?.candidate ?? null;
  const activeExperiment = activeEntry?.experiment ?? null;
  const activeWindow = activeCandidate ? contextWindow(activeCandidate) : null;
  const requiredBins = activeWindow ? secondBins(activeWindow.startSeconds, activeWindow.endSeconds) : [];
  const contextListened = requiredBins.length > 0 && requiredBins.every((bin) => listenedBins.has(bin));
  const sourceCompared = requiredBins.length > 0 && requiredBins.every((bin) => sourceComparisonBins.has(bin));
  const repairedCompared = requiredBins.length > 0 && requiredBins.every((bin) => repairedComparisonBins.has(bin));
  const auditionReady = sourceCompared && repairedCompared;
  const activeDetectorEntry = audibleReviewStatus?.entries.find((entry) => entry.suggestion.eventId === activeDetectorEventId) ?? null;
  const activeDetectorWindow = activeDetectorEntry ? {
    startSeconds: Math.max(0, activeDetectorEntry.suggestion.startSeconds - 1),
    endSeconds: Math.min(sourceMeasurement.durationSeconds, activeDetectorEntry.suggestion.endSeconds + 1),
  } : null;
  const detectorRequiredBins = activeDetectorWindow ? secondBins(activeDetectorWindow.startSeconds, activeDetectorWindow.endSeconds) : [];
  const detectorContextListened = detectorRequiredBins.length > 0 && detectorRequiredBins.every((bin) => detectorListenedBins.has(bin));
  const audibleMoments = useMemo(
    () => audibleEventMapMoments(audioSignal, status?.candidates ?? [], audibleEventAnalysis, audibleReviewStatus),
    [audioSignal, audibleEventAnalysis, audibleReviewStatus, status?.candidates],
  );

  const request = useCallback(async (body: Record<string, unknown>) => {
    const response = await fetch("/api/media-vault/dialogue-repair", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...coordinates, ...body }),
    });
    const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
    if (!response.ok || !payload?.ok) throw new Error(payload?.error || `Dialogue Repair returned HTTP ${response.status}.`);
    return payload as Record<string, unknown>;
  }, [coordinates]);

  const markAtPlayhead = () => {
    const duration = sourceMeasurement.durationSeconds;
    const center = clamp(sourceRef.current?.currentTime ?? playhead, 0, duration);
    setStartSeconds(round(Math.max(0, center - 0.015), 3));
    setEndSeconds(round(Math.min(duration, center + 0.015), 3));
  };

  const createCandidate = async () => {
    setBusyKey("create");
    setError(null);
    try {
      await request({ action: "create-candidate", clientRequestId: crypto.randomUUID(), label, startSeconds, endSeconds, auditionPreRollSeconds: 1.5, auditionPostRollSeconds: 1.5 });
      const next = await refresh();
      const created = [...next.candidates].reverse().find((entry) => entry.candidate.range.startSeconds === startSeconds && entry.candidate.range.endSeconds === endSeconds);
      if (created) setActiveCandidateId(created.candidate.candidateId);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The dialogue event could not be marked."); }
    finally { setBusyKey(null); }
  };

  const playContext = async (kind: "source" | "repaired") => {
    if (!activeWindow) return;
    const element = kind === "source" ? sourceRef.current : repairedRef.current;
    if (!element || (kind === "repaired" && !activeExperiment?.playbackUrl)) return;
    sourceRef.current?.pause();
    repairedRef.current?.pause();
    const sourceGain = matchedGain(sourceMeasurement.integratedLufs, activeExperiment?.derivative?.measured.integratedLufs ?? sourceMeasurement.integratedLufs, kind);
    element.volume = sourceGain;
    element.currentTime = activeWindow.startSeconds;
    stopAtRef.current = activeWindow.endSeconds;
    playbackPurposeRef.current = kind === "source"
      ? activeExperiment?.status === "completed" ? "comparison-source" : "candidate-source"
      : "comparison-repaired";
    setComparisonMode(kind);
    await element.play();
  };

  const handleTimeUpdate = (kind: "source" | "repaired") => {
    const element = kind === "source" ? sourceRef.current : repairedRef.current;
    if (!element) return;
    if (kind === "source") {
      setPlayhead(element.currentTime);
      if (!element.paused) {
        setListenedBins((previous) => new Set(previous).add(Math.floor(element.currentTime)));
        setDetectorListenedBins((previous) => new Set(previous).add(Math.floor(element.currentTime)));
        if (playbackPurposeRef.current === "comparison-source") setSourceComparisonBins((previous) => new Set(previous).add(Math.floor(element.currentTime)));
      }
    }
    if (kind === "repaired" && !element.paused && playbackPurposeRef.current === "comparison-repaired") {
      setRepairedComparisonBins((previous) => new Set(previous).add(Math.floor(element.currentTime)));
    }
    if (stopAtRef.current !== null && element.currentTime >= stopAtRef.current) {
      element.pause();
      stopAtRef.current = null;
      playbackPurposeRef.current = null;
    }
  };

  const inspectAudibleMoment = (moment: (typeof audibleMoments)[number] | null, seconds: number, play: boolean) => {
    const entry = moment?.dialogueCandidateId
      ? status?.candidates.find((candidate) => candidate.candidate.candidateId === moment.dialogueCandidateId) ?? null
      : null;
    if (moment?.dialogueCandidateId) {
      setActiveCandidateId(moment.dialogueCandidateId);
      setListenedBins(new Set());
    }
    if (moment?.detectorAnalysisId && moment.detectorEventId) {
      setActiveDetectorEventId(moment.detectorEventId);
      setDetectorListenedBins(new Set());
      const detector = audibleReviewStatus?.entries.find((candidate) => candidate.suggestion.eventId === moment.detectorEventId)?.suggestion;
      if (detector) setActiveDetectorEventId(detector.eventId);
    }
    const source = sourceRef.current;
    if (!source) return;
    const candidateWindow = entry ? contextWindow(entry.candidate) : null;
    const contextStart = candidateWindow?.startSeconds
      ?? Math.max(0, (moment?.startSeconds ?? seconds) - 1);
    const contextEnd = candidateWindow?.endSeconds
      ?? Math.min(sourceMeasurement.durationSeconds, Math.max(moment?.endSeconds ?? seconds, seconds) + 1);
    source.currentTime = clamp(play ? contextStart : seconds, 0, sourceMeasurement.durationSeconds);
    stopAtRef.current = play ? contextEnd : null;
    playbackPurposeRef.current = "candidate-source";
    setPlayhead(clamp(seconds, 0, sourceMeasurement.durationSeconds));
    if (play) void source.play().catch(() => setError("Playback did not start. Use the protected source controls and try again."));
  };

  const reviewDetectorSuggestion = async (decision: AudibleEventReviewDecision) => {
    if (!activeDetectorEntry || !activeDetectorWindow || !audibleReviewStatus?.analysis || !detectorContextListened) return;
    const note = detectorNotes[activeDetectorEntry.suggestion.eventId]?.trim() || null;
    if (decision !== "confirmed" && !note) { setError("Add a short note explaining the false positive or why comparison is still needed."); return; }
    const key = `detector-review:${activeDetectorEntry.suggestion.eventId}`;
    setBusyKey(key);
    setError(null);
    try {
      const response = await fetch("/api/media-vault/audible-event-reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...coordinates,
          action: "review-suggestion",
          analysisId: audibleReviewStatus.analysis.analysisId,
          eventId: activeDetectorEntry.suggestion.eventId,
          clientRequestId: crypto.randomUUID(),
          decision,
          playbackEvidence: {
            protectedPlaybackSourceId: sourceId,
            contextStartSeconds: activeDetectorWindow.startSeconds,
            contextEndSeconds: activeDetectorWindow.endSeconds,
            listenedSecondBins: detectorRequiredBins,
            clientTrackedPlaybackIsNotProofOfAudibility: true,
          },
          note,
        }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || `Audible-event review returned HTTP ${response.status}.`);
      await refreshAudibleReviews();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The listening review could not be saved."); }
    finally { setBusyKey(null); }
  };

  const review = async (decision: DialogueRepairDecision) => {
    if (!activeCandidate || !activeWindow || !contextListened) return;
    const note = notes[activeCandidate.candidateId]?.trim() || null;
    if (decision !== "confirmed" && !note) { setError("Add a short note explaining a false positive or why comparison is still needed."); return; }
    setBusyKey(`review:${activeCandidate.candidateId}`);
    setError(null);
    try {
      await request({
        action: "review-candidate",
        candidateId: activeCandidate.candidateId,
        clientRequestId: crypto.randomUUID(),
        decision,
        playbackEvidence: {
          protectedPlaybackSourceId: sourceId,
          contextStartSeconds: activeWindow.startSeconds,
          contextEndSeconds: activeWindow.endSeconds,
          listenedSecondBins: requiredBins,
          clientTrackedPlaybackIsNotProofOfAudibility: true,
        },
        note,
      });
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The review receipt could not be saved."); }
    finally { setBusyKey(null); }
  };

  const renderExperiment = async () => {
    if (!activeCandidate) return;
    const key = `render:${activeCandidate.candidateId}`;
    setBusyKey(key);
    setError(null);
    try {
      const queued = await request({ action: "queue-experiment", candidateId: activeCandidate.candidateId }) as { experiment?: DialogueExperiment };
      let experiment = queued.experiment;
      for (let attempt = 0; experiment && attempt < 300 && experiment.status !== "completed"; attempt += 1) {
        if (experiment.status === "failed") throw new Error(experiment.error || "Dialogue Repair rendering failed.");
        await new Promise((resolve) => window.setTimeout(resolve, 2_000));
        const reconciled = await request({ action: "reconcile-experiment", candidateId: activeCandidate.candidateId, jobId: experiment.jobId }) as { experiment?: DialogueExperiment };
        experiment = reconciled.experiment;
        await refresh();
      }
      if (!experiment || experiment.status !== "completed") throw new Error("Dialogue Repair is still processing. Resume it safely from this candidate.");
      setSourceComparisonBins(new Set());
      setRepairedComparisonBins(new Set());
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The range experiment could not be completed."); }
    finally { setBusyKey(null); }
  };

  const reviewExperiment = async (decision: DialogueAuditionDecision) => {
    if (!activeCandidate || !activeExperiment || !activeWindow || !auditionReady) return;
    const note = auditionNotes[activeExperiment.jobId]?.trim() || null;
    if ((decision === "source-preferred" || decision === "needs-work") && !note) {
      setError("Add a short note explaining why the source is preferable or what the repair still needs.");
      return;
    }
    const key = `audition:${activeExperiment.jobId}`;
    setBusyKey(key);
    setError(null);
    try {
      await request({
        action: "review-experiment",
        candidateId: activeCandidate.candidateId,
        jobId: activeExperiment.jobId,
        clientRequestId: crypto.randomUUID(),
        decision,
        playbackEvidence: {
          protectedPlaybackSourceId: sourceId,
          protectedPlaybackJobId: activeExperiment.jobId,
          contextStartSeconds: activeWindow.startSeconds,
          contextEndSeconds: activeWindow.endSeconds,
          sourceListenedSecondBins: requiredBins,
          repairedListenedSecondBins: requiredBins,
          comparisonMode: "matched-loudness",
          completedAt: new Date().toISOString(),
          clientTrackedPlaybackIsNotProofOfAudibility: true,
        },
        note,
      });
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The matched A/B decision could not be saved."); }
    finally { setBusyKey(null); }
  };

  return (
    <section className="mt-3 rounded-xl border border-amber-300 bg-slate-950 p-3 text-white" aria-label="Dialogue Repair desk">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-black">Dialogue Repair</h4>
          <div className="mt-1 max-w-2xl text-[10px] font-bold leading-4 text-slate-300">Mark a source-clock event, hear its full protected context, and record a decision. Only the latest confirmed receipt can authorize a separate range-scoped experiment.</div>
        </div>
        <span className="rounded-full border border-amber-500/60 bg-amber-300/10 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-amber-200">{status?.candidates.length ?? 0} events</span>
      </div>

      <audio
        ref={sourceRef}
        src={sourceUrl}
        controls
        preload="metadata"
        className="mt-3 w-full"
        onTimeUpdate={() => handleTimeUpdate("source")}
        onSeeked={() => setPlayhead(sourceRef.current?.currentTime ?? 0)}
      />
      <AudibleEventMap
        durationSeconds={sourceMeasurement.durationSeconds}
        signal={audioSignal}
        moments={audibleMoments}
        selectedSeconds={playhead}
        onSelect={inspectAudibleMoment}
      />
      {activeDetectorEntry && activeDetectorWindow && audibleReviewStatus?.analysis && (
        <section className="mt-3 rounded-xl border border-fuchsia-500/60 bg-fuchsia-950/25 p-3" aria-label="Classifier suggestion review">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="flex flex-wrap items-center gap-2"><span className="font-black">{activeDetectorEntry.suggestion.displayLabel}</span><span className="rounded-full border border-fuchsia-500/70 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-fuchsia-200">{activeDetectorEntry.suggestion.family}</span><span className="font-mono text-[10px] text-fuchsia-200">{Math.round(activeDetectorEntry.suggestion.confidence * 100)}% classifier score</span></div>
              <p className="mt-1 text-[10px] font-bold leading-4 text-slate-300">Unqualified Apple classifier suggestion at {activeDetectorEntry.suggestion.startSeconds.toFixed(3)}–{activeDetectorEntry.suggestion.endSeconds.toFixed(3)} s. The score prioritizes listening; it does not establish audibility, meaning, or a production defect.</p>
            </div>
            <span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-wide ${activeDetectorEntry.latestReview?.decision === "confirmed" ? "border-emerald-500 text-emerald-200" : activeDetectorEntry.latestReview?.decision === "false-positive" ? "border-slate-600 text-slate-300" : "border-fuchsia-500 text-fuchsia-200"}`}>{activeDetectorEntry.latestReview?.decision ?? "unreviewed"}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => inspectAudibleMoment(audibleMoments.find((moment) => moment.detectorEventId === activeDetectorEntry.suggestion.eventId) ?? null, activeDetectorEntry.suggestion.startSeconds, true)} className="rounded-md border border-cyan-500 bg-cyan-300 px-3 py-2 text-xs font-black text-slate-950">Play bounded protected context</button>
            <span className="text-[10px] font-bold text-slate-400">{detectorContextListened ? "Complete context observed" : `Listen through ${detectorRequiredBins.length} source-clock bins to review`}</span>
          </div>
          <textarea value={detectorNotes[activeDetectorEntry.suggestion.eventId] ?? ""} onChange={(event) => setDetectorNotes((previous) => ({ ...previous, [activeDetectorEntry.suggestion.eventId]: event.target.value }))} placeholder="Listening note (required for false positive or needs comparison)" className="mt-2 min-h-16 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder:text-slate-500" />
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <button type="button" onClick={() => void reviewDetectorSuggestion("confirmed")} disabled={!detectorContextListened || busyKey !== null} className="rounded-md border border-emerald-500 bg-emerald-300 px-3 py-2 text-xs font-black text-emerald-950 disabled:opacity-40">Confirm classifier suggestion</button>
            <button type="button" onClick={() => void reviewDetectorSuggestion("false-positive")} disabled={!detectorContextListened || busyKey !== null} className="rounded-md border border-slate-500 bg-slate-800 px-3 py-2 text-xs font-black disabled:opacity-40">Mark classifier false positive</button>
            <button type="button" onClick={() => void reviewDetectorSuggestion("needs-comparison")} disabled={!detectorContextListened || busyKey !== null} className="rounded-md border border-violet-500 bg-violet-950 px-3 py-2 text-xs font-black text-violet-100 disabled:opacity-40">Hold for comparison</button>
          </div>
          <p className="mt-2 text-[9px] font-bold uppercase tracking-wide text-slate-500">This receipt improves the detector corpus. It cannot authorize repair, editing, or promotion.</p>
        </section>
      )}
      {audibleEventAnalysis && <div className="mt-3"><AudibleEventQualificationLab
        projectId={projectId}
        projectSlug={projectSlug}
        assetId={assetId}
        sourceId={sourceId}
        sourceUrl={sourceUrl}
        durationSeconds={sourceMeasurement.durationSeconds}
        defaultWorkload="podcast"
        initialEvent={activeDetectorEntry?.suggestion ?? { classificationIdentifier: label.replaceAll("-", "_"), displayLabel: labelName(label), family: "dialogue", startSeconds, endSeconds }}
      /></div>}
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-300">Event
          <select value={label} onChange={(event) => setLabel(event.target.value as DialogueRepairLabel)} className="mt-1 block rounded-md border border-slate-600 bg-slate-900 px-2 py-2 text-xs text-white">
            {LABELS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-300">Start
          <input aria-label="Dialogue event start" type="number" min={0} max={sourceMeasurement.durationSeconds} step="0.001" value={startSeconds} onChange={(event) => setStartSeconds(Number(event.target.value))} className="mt-1 block w-24 rounded-md border border-slate-600 bg-slate-900 px-2 py-2 font-mono text-xs text-white" />
        </label>
        <label className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-300">End
          <input aria-label="Dialogue event end" type="number" min={0} max={sourceMeasurement.durationSeconds} step="0.001" value={endSeconds} onChange={(event) => setEndSeconds(Number(event.target.value))} className="mt-1 block w-24 rounded-md border border-slate-600 bg-slate-900 px-2 py-2 font-mono text-xs text-white" />
        </label>
        <button type="button" onClick={markAtPlayhead} className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-black hover:bg-slate-700">Mark at {formatClock(playhead)}</button>
        <button type="button" onClick={() => void createCandidate()} disabled={busyKey !== null || endSeconds <= startSeconds} className="rounded-md border border-amber-400 bg-amber-300 px-3 py-2 text-xs font-black text-slate-950 hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50">{busyKey === "create" ? "Saving evidence…" : "Add review candidate"}</button>
      </div>

      {status?.candidates.length ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(180px,0.7fr)_minmax(0,1.6fr)]">
          <ul className="max-h-72 space-y-1 overflow-y-auto pr-1" aria-label="Dialogue repair candidates">
            {status.candidates.map((entry) => {
              const selected = entry.candidate.candidateId === activeCandidate?.candidateId;
              return <li key={entry.candidate.candidateId}><button type="button" aria-pressed={selected} onClick={() => { setActiveCandidateId(entry.candidate.candidateId); setListenedBins(new Set()); setSourceComparisonBins(new Set()); setRepairedComparisonBins(new Set()); }} className={`w-full rounded-lg border px-3 py-2 text-left ${selected ? "border-amber-300 bg-amber-300/15" : "border-slate-700 bg-slate-900 hover:bg-slate-800"}`}>
                <span className="flex items-center justify-between gap-2"><span className="font-black">{labelName(entry.candidate.label)}</span><span className="font-mono text-[10px] text-slate-300">{formatClock(entry.candidate.range.startSeconds)}</span></span>
                <span className="mt-1 block text-[10px] font-bold text-slate-400">{entry.latestReview ? entry.latestReview.decision.replace("-", " ") : "awaiting source review"}{entry.candidate.origin.kind === "human-marked" ? " · human mark" : entry.candidate.origin.kind === "qualified-detector" ? " · qualified detector" : " · detector suggestion"}{entry.experiment ? ` · ${entry.experiment.status}` : ""}</span>
              </button></li>;
            })}
          </ul>

          {activeCandidate && activeWindow && activeEntry && (
            <div className="rounded-lg border border-slate-700 bg-slate-900 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><span className="font-black">{labelName(activeCandidate.label)}</span><span className="ml-2 font-mono text-xs text-amber-200">{activeCandidate.range.startSeconds.toFixed(3)}–{activeCandidate.range.endSeconds.toFixed(3)} s</span></div>
                <span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] ${activeEntry.latestReview?.decision === "confirmed" ? "border-emerald-500 bg-emerald-400/10 text-emerald-200" : "border-slate-600 text-slate-300"}`}>{activeEntry.latestReview?.decision ?? "unreviewed"}</span>
              </div>
              <div className="relative mt-3 h-3 overflow-hidden rounded-full bg-slate-800" aria-label="Source-clock treatment range">
                <div className="absolute inset-y-0 bg-slate-600" style={{ left: `${100 * activeWindow.startSeconds / sourceMeasurement.durationSeconds}%`, width: `${100 * (activeWindow.endSeconds - activeWindow.startSeconds) / sourceMeasurement.durationSeconds}%` }} />
                <div className="absolute inset-y-0 bg-amber-300" style={{ left: `${100 * activeCandidate.range.startSeconds / sourceMeasurement.durationSeconds}%`, width: `${Math.max(0.25, 100 * (activeCandidate.range.endSeconds - activeCandidate.range.startSeconds) / sourceMeasurement.durationSeconds)}%` }} />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => void playContext("source")} className="rounded-md border border-cyan-500 bg-cyan-300 px-3 py-2 text-xs font-black text-slate-950 hover:bg-cyan-200">Play protected source context</button>
                {activeExperiment?.playbackUrl && <button type="button" onClick={() => void playContext("repaired")} className="rounded-md border border-violet-400 bg-violet-300 px-3 py-2 text-xs font-black text-slate-950 hover:bg-violet-200">Play repaired context</button>}
                <span className="self-center text-[10px] font-bold text-slate-400">{contextListened ? "Full source context observed" : `Listen through ${requiredBins.length} source-clock bins to review`}</span>
              </div>
              {activeCandidate.context.transcriptWordAnchors.length > 0 && <div className="mt-3 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs leading-5 text-slate-200"><span className="mr-2 font-black text-cyan-200">{activeCandidate.context.speakerLabel ?? "Transcript"}</span>{activeCandidate.context.transcriptWordAnchors.map((word) => word.text).join(" ")}</div>}
              <textarea value={notes[activeCandidate.candidateId] ?? ""} onChange={(event) => setNotes((previous) => ({ ...previous, [activeCandidate.candidateId]: event.target.value }))} placeholder="Listening note (required for false positive or needs comparison)" className="mt-3 min-h-16 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder:text-slate-500" />
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <button type="button" onClick={() => void review("confirmed")} disabled={!contextListened || busyKey !== null} className="rounded-md border border-emerald-500 bg-emerald-300 px-3 py-2 text-xs font-black text-emerald-950 disabled:opacity-40">Confirm audible event</button>
                <button type="button" onClick={() => void review("false-positive")} disabled={!contextListened || busyKey !== null} className="rounded-md border border-slate-500 bg-slate-800 px-3 py-2 text-xs font-black disabled:opacity-40">Mark false positive</button>
                <button type="button" onClick={() => void review("needs-comparison")} disabled={!contextListened || busyKey !== null} className="rounded-md border border-violet-500 bg-violet-950 px-3 py-2 text-xs font-black text-violet-100 disabled:opacity-40">Needs comparison</button>
              </div>

              {activeEntry.latestReview?.decision === "confirmed" && (
                <button type="button" onClick={() => void renderExperiment()} disabled={busyKey !== null || activeExperiment?.status === "completed"} className="mt-3 w-full rounded-md border border-amber-400 bg-amber-300 px-3 py-2 text-left text-xs font-black text-slate-950 disabled:cursor-default disabled:opacity-60">
                  {busyKey === `render:${activeCandidate.candidateId}` ? "Rendering, decoding, and re-verifying…" : activeExperiment?.status === "completed" ? "Verified range experiment ready" : activeExperiment ? `Resume ${activeExperiment.status} experiment` : "Render conservative range experiment"}
                  <span className="mt-1 block text-[10px] font-bold opacity-75">Fixed 20 ms treatment padding; listening pre/post-roll never widens processing. Original bytes remain source truth.</span>
                </button>
              )}
              {activeExperiment?.playbackUrl && (
                <div className="mt-3 rounded-lg border border-violet-500/50 bg-violet-950/50 p-3">
                  <audio ref={repairedRef} src={activeExperiment.playbackUrl} preload="metadata" className="w-full" onTimeUpdate={() => handleTimeUpdate("repaired")} />
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-bold text-violet-100"><span>Matched A/B · currently {comparisonMode}</span><span>{activeExperiment.verification?.durationDeltaSeconds.toFixed(6)} s clock delta · {activeExperiment.verification?.sourceChannelCount}→{activeExperiment.verification?.outputChannelCount} channels</span></div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <button type="button" aria-pressed={comparisonMode === "source"} onClick={() => void playContext("source")} className={`rounded-lg border px-3 py-3 text-left text-xs font-black ${comparisonMode === "source" ? "border-cyan-300 bg-cyan-300 text-slate-950" : "border-cyan-700 bg-slate-950 text-cyan-100"}`}>
                      A · Immutable source
                      <span className="mt-1 block text-[10px] font-bold opacity-75">{sourceCompared ? "Full matched context heard" : "Play the complete bounded context"}</span>
                    </button>
                    <button type="button" aria-pressed={comparisonMode === "repaired"} onClick={() => void playContext("repaired")} className={`rounded-lg border px-3 py-3 text-left text-xs font-black ${comparisonMode === "repaired" ? "border-violet-300 bg-violet-300 text-slate-950" : "border-violet-700 bg-slate-950 text-violet-100"}`}>
                      B · Conservative repair
                      <span className="mt-1 block text-[10px] font-bold opacity-75">{repairedCompared ? "Full matched context heard" : "Play the complete bounded context"}</span>
                    </button>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800" aria-label="Matched audition coverage"><div className="h-full bg-gradient-to-r from-cyan-300 to-violet-300 transition-all" style={{ width: auditionReady ? "100%" : sourceCompared || repairedCompared ? "50%" : "0%" }} /></div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] font-bold text-slate-300">
                    <span>{auditionReady ? "Both exact contexts heard at matched loudness" : "Hear both contexts before recording a judgment"}</span>
                    {activeExperiment.latestAudition && <span className="rounded-full border border-emerald-500/60 px-2 py-1 text-emerald-200">Latest: {activeExperiment.latestAudition.decision.replaceAll("-", " ")}</span>}
                  </div>
                  <textarea value={auditionNotes[activeExperiment.jobId] ?? ""} onChange={(event) => setAuditionNotes((previous) => ({ ...previous, [activeExperiment.jobId]: event.target.value }))} placeholder="What improved, survived, or still sounds wrong? Required when preferring the source or holding the repair." className="mt-3 min-h-16 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder:text-slate-500" />
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    <button type="button" onClick={() => void reviewExperiment("repair-preferred")} disabled={!auditionReady || busyKey !== null} className="rounded-md border border-emerald-500 bg-emerald-300 px-3 py-2 text-xs font-black text-emerald-950 disabled:opacity-40">Prefer repair</button>
                    <button type="button" onClick={() => void reviewExperiment("source-preferred")} disabled={!auditionReady || busyKey !== null} className="rounded-md border border-cyan-600 bg-cyan-950 px-3 py-2 text-xs font-black text-cyan-100 disabled:opacity-40">Prefer source</button>
                    <button type="button" onClick={() => void reviewExperiment("indistinguishable")} disabled={!auditionReady || busyKey !== null} className="rounded-md border border-slate-500 bg-slate-800 px-3 py-2 text-xs font-black disabled:opacity-40">No audible difference</button>
                    <button type="button" onClick={() => void reviewExperiment("needs-work")} disabled={!auditionReady || busyKey !== null} className="rounded-md border border-amber-500 bg-amber-950 px-3 py-2 text-xs font-black text-amber-100 disabled:opacity-40">Needs another treatment</button>
                  </div>
                  <p className="mt-2 text-[9px] font-bold uppercase tracking-wide text-slate-500">This append-only judgment evaluates one exact preview. Preferring it does not promote, replace, master, deliver, or publish media.</p>
                </div>
              )}
              {activeExperiment?.error && <div className="mt-2 rounded-md border border-rose-500 bg-rose-950 px-3 py-2 text-xs font-bold text-rose-100">{activeExperiment.error}</div>}
            </div>
          )}
        </div>
      ) : <div className="mt-3 rounded-lg border border-dashed border-slate-700 px-3 py-4 text-center text-xs font-bold text-slate-400">No dialogue events marked yet. Play the immutable source and mark the exact moment you hear something worth reviewing.</div>}
      {error && <div className="mt-3 rounded-md border border-rose-500 bg-rose-950 px-3 py-2 text-xs font-bold text-rose-100">{error}</div>}
      <div className="mt-3 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">Playback tracking is workflow evidence, not proof of audibility. Decisions remain human and append-only.</div>
    </section>
  );
}

function contextWindow(candidate: DialogueCandidate) {
  return { startSeconds: Math.max(0, candidate.range.startSeconds - candidate.range.auditionPreRollSeconds), endSeconds: Math.min(candidate.range.sourceDurationSeconds, candidate.range.endSeconds + candidate.range.auditionPostRollSeconds) };
}
function secondBins(startSeconds: number, endSeconds: number) { const start = Math.floor(startSeconds); const end = Math.max(start, Math.ceil(endSeconds) - 1); return Array.from({ length: end - start + 1 }, (_, index) => start + index); }
function matchedGain(sourceLufs: number, repairedLufs: number, kind: "source" | "repaired") { const quietest = Math.min(sourceLufs, repairedLufs); const selected = kind === "source" ? sourceLufs : repairedLufs; return clamp(10 ** ((quietest - selected) / 20), 0, 1); }
function labelName(value: DialogueRepairLabel) { return LABELS.find((item) => item.value === value)?.label ?? value; }
function formatClock(value: number) { const seconds = Math.max(0, value); const minutes = Math.floor(seconds / 60); return `${minutes}:${(seconds - minutes * 60).toFixed(2).padStart(5, "0")}`; }
function clamp(value: number, minimum: number, maximum: number) { return Math.min(maximum, Math.max(minimum, value)); }
function round(value: number, digits: number) { const multiplier = 10 ** digits; return Math.round(value * multiplier) / multiplier; }
