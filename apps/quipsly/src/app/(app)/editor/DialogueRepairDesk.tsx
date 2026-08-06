"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AudioMasteryMeasurement, AudioSignalDiagnosisSummary } from "./AudioMasteryAudition";

type DialogueRepairLabel = "mouth-click" | "plosive" | "sibilance" | "breath" | "clipping" | "noise-event";
type DialogueRepairDecision = "confirmed" | "false-positive" | "needs-comparison";

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
  projectSlug: string;
  assetId: string;
  sourceId: string;
  sourceUrl: string;
  sourceMeasurement: AudioMasteryMeasurement;
};

const LABELS: Array<{ value: DialogueRepairLabel; label: string }> = [
  { value: "mouth-click", label: "Mouth click" },
  { value: "plosive", label: "Plosive" },
  { value: "sibilance", label: "Sibilance" },
  { value: "breath", label: "Breath" },
  { value: "clipping", label: "Clipping" },
  { value: "noise-event", label: "Noise event" },
];

export function DialogueRepairDesk({ projectSlug, assetId, sourceId, sourceUrl, sourceMeasurement }: Props) {
  const sourceRef = useRef<HTMLAudioElement | null>(null);
  const repairedRef = useRef<HTMLAudioElement | null>(null);
  const stopAtRef = useRef<number | null>(null);
  const [status, setStatus] = useState<DialogueRepairStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [label, setLabel] = useState<DialogueRepairLabel>("mouth-click");
  const [startSeconds, setStartSeconds] = useState(0);
  const [endSeconds, setEndSeconds] = useState(0.03);
  const [activeCandidateId, setActiveCandidateId] = useState<string | null>(null);
  const [listenedBins, setListenedBins] = useState<Set<number>>(() => new Set());
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [comparisonMode, setComparisonMode] = useState<"source" | "repaired">("source");

  const coordinates = useMemo(() => ({ projectSlug, assetId, sourceId }), [assetId, projectSlug, sourceId]);
  const refresh = useCallback(async () => {
    const query = new URLSearchParams(coordinates);
    const response = await fetch(`/api/media-vault/dialogue-repair?${query}`, { cache: "no-store" });
    const payload = await response.json().catch(() => null) as ({ ok?: boolean; error?: string } & Partial<DialogueRepairStatus>) | null;
    if (!response.ok || !payload?.ok || !payload.candidates) throw new Error(payload?.error || `Dialogue Repair returned HTTP ${response.status}.`);
    setStatus(payload as { ok: true } & DialogueRepairStatus);
    setActiveCandidateId((current) => current && payload.candidates?.some((entry) => entry.candidate.candidateId === current) ? current : payload.candidates?.[0]?.candidate.candidateId ?? null);
    return payload as { ok: true } & DialogueRepairStatus;
  }, [coordinates]);

  useEffect(() => {
    let canceled = false;
    void refresh().catch((reason) => { if (!canceled) setError(reason instanceof Error ? reason.message : "Dialogue Repair could not load."); });
    return () => { canceled = true; };
  }, [refresh]);

  const activeEntry = status?.candidates.find((entry) => entry.candidate.candidateId === activeCandidateId) ?? status?.candidates[0] ?? null;
  const activeCandidate = activeEntry?.candidate ?? null;
  const activeExperiment = activeEntry?.experiment ?? null;
  const activeWindow = activeCandidate ? contextWindow(activeCandidate) : null;
  const requiredBins = activeWindow ? secondBins(activeWindow.startSeconds, activeWindow.endSeconds) : [];
  const contextListened = requiredBins.length > 0 && requiredBins.every((bin) => listenedBins.has(bin));

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
    setComparisonMode(kind);
    await element.play();
  };

  const handleTimeUpdate = (kind: "source" | "repaired") => {
    const element = kind === "source" ? sourceRef.current : repairedRef.current;
    if (!element) return;
    if (kind === "source") {
      setPlayhead(element.currentTime);
      if (!element.paused) setListenedBins((previous) => new Set(previous).add(Math.floor(element.currentTime)));
    }
    if (stopAtRef.current !== null && element.currentTime >= stopAtRef.current) {
      element.pause();
      stopAtRef.current = null;
    }
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
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The range experiment could not be completed."); }
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
          <div className="max-h-72 space-y-1 overflow-y-auto pr-1" role="list" aria-label="Dialogue repair candidates">
            {status.candidates.map((entry) => {
              const selected = entry.candidate.candidateId === activeCandidate?.candidateId;
              return <button key={entry.candidate.candidateId} type="button" role="listitem" onClick={() => { setActiveCandidateId(entry.candidate.candidateId); setListenedBins(new Set()); }} className={`w-full rounded-lg border px-3 py-2 text-left ${selected ? "border-amber-300 bg-amber-300/15" : "border-slate-700 bg-slate-900 hover:bg-slate-800"}`}>
                <div className="flex items-center justify-between gap-2"><span className="font-black">{labelName(entry.candidate.label)}</span><span className="font-mono text-[10px] text-slate-300">{formatClock(entry.candidate.range.startSeconds)}</span></div>
                <div className="mt-1 text-[10px] font-bold text-slate-400">{entry.latestReview ? entry.latestReview.decision.replace("-", " ") : "awaiting source review"}{entry.experiment ? ` · ${entry.experiment.status}` : ""}</div>
              </button>;
            })}
          </div>

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
