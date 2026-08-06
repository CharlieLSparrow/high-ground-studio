"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  AudibleEventCorpusStatus,
  AudibleEventTruthSplit,
  AudibleEventTruthVerdict,
  AudibleEventTruthWorkload,
} from "@/lib/audio/audible-event-corpus";
import type { AudibleEventReviewStatus } from "@/lib/audio/audible-event-review";

type InitialEvent = {
  classificationIdentifier: string;
  displayLabel: string;
  family: string;
  startSeconds: number;
  endSeconds: number;
};

export function AudibleEventQualificationLab({
  projectId,
  projectSlug,
  assetId,
  sourceId,
  sourceUrl,
  durationSeconds,
  defaultWorkload,
  initialEvent = null,
}: {
  projectId?: string;
  projectSlug: string;
  assetId: string;
  sourceId: string;
  sourceUrl: string;
  durationSeconds: number;
  defaultWorkload: AudibleEventTruthWorkload;
  initialEvent?: InitialEvent | null;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previousTimeRef = useRef<number | null>(null);
  const stopAtRef = useRef<number | null>(null);
  const seededSuggestionIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState<AudibleEventCorpusStatus | null>(null);
  const [reviewStatus, setReviewStatus] = useState<AudibleEventReviewStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<AudibleEventTruthVerdict>("positive");
  const [workload, setWorkload] = useState<AudibleEventTruthWorkload>(defaultWorkload);
  const [split, setSplit] = useState<AudibleEventTruthSplit>("retained-challenge");
  const [classificationIdentifier, setClassificationIdentifier] = useState(initialEvent?.classificationIdentifier.toLowerCase() || "mouth_click");
  const [displayLabel, setDisplayLabel] = useState(initialEvent?.displayLabel || "Mouth click");
  const [family, setFamily] = useState(initialEvent?.family || "dialogue");
  const [reviewStartSeconds, setReviewStartSeconds] = useState(Math.max(0, (initialEvent?.startSeconds ?? 1) - 1));
  const [reviewEndSeconds, setReviewEndSeconds] = useState(Math.min(durationSeconds, (initialEvent?.endSeconds ?? Math.min(10, durationSeconds)) + (initialEvent ? 1 : 0)));
  const [eventStartSeconds, setEventStartSeconds] = useState(initialEvent?.startSeconds ?? 1);
  const [eventEndSeconds, setEventEndSeconds] = useState(initialEvent?.endSeconds ?? Math.min(durationSeconds, 1.03));
  const [note, setNote] = useState("");
  const [supersedesReceiptId, setSupersedesReceiptId] = useState<string | null>(null);
  const [listenedBins, setListenedBins] = useState<Set<number>>(() => new Set());
  const initialClassification = initialEvent?.classificationIdentifier ?? null;
  const initialLabel = initialEvent?.displayLabel ?? null;
  const initialFamily = initialEvent?.family ?? null;
  const initialStart = initialEvent?.startSeconds ?? null;
  const initialEnd = initialEvent?.endSeconds ?? null;
  const coordinates = useMemo(
    () => ({ ...(projectId ? { projectId } : {}), projectSlug, assetId, sourceId }),
    [assetId, projectId, projectSlug, sourceId],
  );
  const requiredBins = useMemo(() => secondBins(reviewStartSeconds, reviewEndSeconds), [reviewEndSeconds, reviewStartSeconds]);
  const windowListened = requiredBins.length > 0 && requiredBins.every((bin) => listenedBins.has(bin));

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams(coordinates);
      const [corpusResponse, reviewResponse] = await Promise.all([
        fetch(`/api/media-vault/audible-event-corpus?${query}`, { cache: "no-store" }),
        fetch(`/api/media-vault/audible-event-reviews?${query}`, { cache: "no-store" }),
      ]);
      const corpus = await corpusResponse.json().catch(() => null) as ({ ok?: boolean; error?: string } & Partial<AudibleEventCorpusStatus>) | null;
      const reviews = await reviewResponse.json().catch(() => null) as ({ ok?: boolean; error?: string } & Partial<AudibleEventReviewStatus>) | null;
      if (!corpusResponse.ok || !corpus?.ok || !corpus.projectQualification || !corpus.sourceReceipts) throw new Error(corpus?.error || `Detector qualification returned HTTP ${corpusResponse.status}.`);
      if (!reviewResponse.ok || !reviews?.ok || !reviews.summary || !reviews.entries) throw new Error(reviews?.error || `Detector suggestions returned HTTP ${reviewResponse.status}.`);
      setStatus(corpus as { ok: true } & AudibleEventCorpusStatus);
      setReviewStatus(reviews as { ok: true } & AudibleEventReviewStatus);
      setMessage(null);
    } catch (error) {
      setStatus(null);
      setReviewStatus(null);
      setMessage(error instanceof Error ? error.message : "Detector qualification could not load.");
    } finally { setLoading(false); }
  }, [coordinates]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    setWorkload(defaultWorkload);
  }, [defaultWorkload]);
  useEffect(() => {
    if (initialClassification === null || initialLabel === null || initialFamily === null || initialStart === null || initialEnd === null) return;
    setVerdict("positive");
    setClassificationIdentifier(initialClassification.toLowerCase());
    setDisplayLabel(initialLabel);
    setFamily(initialFamily);
    setEventStartSeconds(initialStart);
    setEventEndSeconds(initialEnd);
    setReviewStartSeconds(Math.max(0, initialStart - 1));
    setReviewEndSeconds(Math.min(durationSeconds, initialEnd + 1));
    resetPlaybackEvidence();
    setSupersedesReceiptId(null);
  }, [durationSeconds, initialClassification, initialEnd, initialFamily, initialLabel, initialStart]);
  useEffect(() => {
    if (initialClassification !== null) return;
    const suggestion = reviewStatus?.analysis?.suggestions[0];
    if (!suggestion || seededSuggestionIdRef.current === suggestion.eventId) return;
    seededSuggestionIdRef.current = suggestion.eventId;
    chooseSuggestion(suggestion);
  }, [initialClassification, reviewStatus]);

  function resetPlaybackEvidence() {
    setListenedBins(new Set());
    previousTimeRef.current = null;
    stopAtRef.current = null;
  }

  function observePlayback(audio: HTMLAudioElement, ended = false) {
    const current = ended ? Math.min(reviewEndSeconds, durationSeconds) - 0.001 : audio.currentTime;
    if (!ended && (audio.paused || audio.seeking)) return;
    const previous = previousTimeRef.current;
    const contiguous = previous !== null && current >= previous && current - previous <= 1.5;
    const first = contiguous ? Math.floor(previous) : Math.floor(current);
    const last = Math.floor(current);
    previousTimeRef.current = current;
    setListenedBins((existing) => {
      const next = new Set(existing);
      for (let bin = first; bin <= last; bin += 1) {
        if (bin >= Math.floor(reviewStartSeconds) && bin <= Math.max(Math.floor(reviewStartSeconds), Math.ceil(reviewEndSeconds) - 1)) next.add(bin);
      }
      return next.size === existing.size ? existing : next;
    });
    if (stopAtRef.current !== null && current >= stopAtRef.current - 0.001) {
      audio.pause();
      stopAtRef.current = null;
      previousTimeRef.current = null;
    }
  }

  async function playWindow() {
    const audio = audioRef.current;
    if (!audio || reviewEndSeconds <= reviewStartSeconds) return;
    resetPlaybackEvidence();
    audio.currentTime = reviewStartSeconds;
    stopAtRef.current = reviewEndSeconds;
    try { await audio.play(); }
    catch { setMessage("Playback needs a direct press in the protected source controls."); }
  }

  function correct(receipt: AudibleEventCorpusStatus["sourceReceipts"][number]) {
    setSupersedesReceiptId(receipt.id);
    setVerdict(receipt.verdict);
    setWorkload(receipt.workload);
    setSplit(receipt.split);
    setClassificationIdentifier(receipt.classificationIdentifier);
    setDisplayLabel(receipt.displayLabel);
    setFamily(receipt.family);
    setReviewStartSeconds(receipt.reviewStartSeconds);
    setReviewEndSeconds(receipt.reviewEndSeconds);
    setEventStartSeconds(receipt.eventStartSeconds ?? receipt.reviewStartSeconds);
    setEventEndSeconds(receipt.eventEndSeconds ?? Math.min(receipt.reviewEndSeconds, receipt.reviewStartSeconds + 0.03));
    setNote("");
    resetPlaybackEvidence();
  }

  function chooseSuggestion(suggestion: NonNullable<AudibleEventReviewStatus["analysis"]>["suggestions"][number]) {
    setVerdict("positive");
    setClassificationIdentifier(suggestion.classificationIdentifier.toLowerCase());
    setDisplayLabel(suggestion.displayLabel);
    setFamily(suggestion.family);
    setReviewStartSeconds(Math.max(0, suggestion.startSeconds - 1));
    setReviewEndSeconds(Math.min(durationSeconds, suggestion.endSeconds + 1));
    setEventStartSeconds(suggestion.startSeconds);
    setEventEndSeconds(suggestion.endSeconds);
    setSupersedesReceiptId(null);
    resetPlaybackEvidence();
  }

  async function save() {
    if (!windowListened) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/media-vault/audible-event-corpus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...coordinates,
          action: "label-corpus-window",
          clientRequestId: crypto.randomUUID(),
          supersedesReceiptId,
          verdict,
          workload,
          split,
          classificationIdentifier,
          displayLabel,
          family,
          reviewStartSeconds,
          reviewEndSeconds,
          eventStartSeconds: verdict === "positive" ? eventStartSeconds : null,
          eventEndSeconds: verdict === "positive" ? eventEndSeconds : null,
          playbackEvidence: { protectedPlaybackSourceId: sourceId, contextStartSeconds: reviewStartSeconds, contextEndSeconds: reviewEndSeconds, listenedSecondBins: requiredBins, clientTrackedPlaybackIsNotProofOfAudibility: true },
          note,
        }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || `Detector qualification returned HTTP ${response.status}.`);
      await refresh();
      setNote("");
      setSupersedesReceiptId(null);
      resetPlaybackEvidence();
      setMessage("Playback-reviewed detector evidence saved. It changes no media or edit decision.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Detector evidence could not be saved."); }
    finally { setBusy(false); }
  }

  const invalidPositive = verdict === "positive" && (eventEndSeconds <= eventStartSeconds || eventStartSeconds < reviewStartSeconds || eventEndSeconds > reviewEndSeconds);

  return (
    <details className="rounded-xl border border-cyan-700 bg-slate-950 p-4 text-white" aria-label="Audible-event qualification lab">
      <summary className="cursor-pointer text-sm font-black text-cyan-100">Private detector qualification lab · {status?.projectQualification.activeReceiptCount ?? 0} active labels</summary>
      <p className="mt-2 max-w-4xl text-xs font-bold leading-5 text-slate-300">Create playback-reviewed truth independently of classifier suggestions. Positive ranges expose misses for recall; absent ranges expose false positives. Unlabeled time is excluded, calibration stays out of acceptance, and even a passing class can only prioritize listening.</p>
      {message ? <p role="status" className="mt-3 rounded-lg border border-cyan-800 bg-cyan-950/50 p-3 text-xs font-bold text-cyan-100">{message}</p> : null}
      {loading ? <p className="mt-3 text-xs font-bold text-slate-400">Loading source-bound detector truth…</p> : null}
      {status && !status.available ? <p className="mt-3 rounded-lg border border-amber-700 bg-amber-950/30 p-3 text-xs font-bold text-amber-100">No completed source-bound detector analysis is registered yet. Existing audio and transcript evidence remain usable; corpus labeling waits for detector output.</p> : null}
      {reviewStatus?.analysis?.suggestions.length ? <div className="mt-3"><p className="text-[10px] font-black uppercase tracking-wide text-fuchsia-200">Classifier suggestions · listening priority only</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{reviewStatus.analysis.suggestions.map((suggestion) => <button key={suggestion.eventId} type="button" onClick={() => chooseSuggestion(suggestion)} className="rounded-lg border border-fuchsia-700 bg-fuchsia-950/30 p-3 text-left text-xs font-bold text-fuchsia-100"><span className="flex items-center justify-between gap-2"><span className="font-black">{suggestion.displayLabel}</span><span className="font-mono text-[10px]">{Math.round(suggestion.confidence * 100)}%</span></span><span className="mt-1 block font-mono text-[10px] text-fuchsia-200">{suggestion.startSeconds.toFixed(3)}–{suggestion.endSeconds.toFixed(3)} s · {suggestion.family}</span><span className="mt-1 block text-[10px] text-slate-300">Use as a proposed label window; listening and a note are still required.</span></button>)}</div></div> : status?.available ? <p className="mt-3 rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs font-bold text-slate-300">This completed analysis surfaced no suggestions at its configured threshold. You can still label a missed event or a class-absent window independently.</p> : null}
      {status?.projectQualification.metrics.length ? <div className="mt-3 grid gap-2 md:grid-cols-2">{status.projectQualification.metrics.map((metric) => <div key={metric.classificationIdentifier} className="rounded-lg border border-cyan-800 bg-slate-900 p-3"><div className="flex items-center justify-between gap-2"><span className="font-black">{metric.displayLabel}</span><span className="rounded-full border border-cyan-700 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-cyan-200">{metric.status.replaceAll("-", " ")}</span></div><div className="mt-2 grid grid-cols-3 gap-2 font-mono text-[10px] text-slate-300"><span>P {percent(metric.precision)}</span><span>R {percent(metric.recall)}</span><span>FP/h {metricValue(metric.falsePositivesPerLabeledHour)}</span><span>TP {metric.truePositiveCount}</span><span>FP {metric.falsePositiveCount}</span><span>FN {metric.falseNegativeCount}</span></div><p className="mt-2 text-[9px] font-bold text-slate-500">{metric.positiveEventCount} positives · {metric.negativeHours.toFixed(3)} negative hours · {metric.workloadCoverage.podcast} podcast / {metric.workloadCoverage.coaching} sources</p></div>)}</div> : null}
      {status?.sourceReceipts.length ? <ul className="mt-3 grid gap-2 sm:grid-cols-2" aria-label="Current source corpus labels">{status.sourceReceipts.map((receipt) => <li key={receipt.id} className="rounded-lg border border-slate-700 bg-slate-900 p-3"><div className="flex items-center justify-between gap-2"><span className="font-black">{receipt.displayLabel}</span><span className="rounded-full border border-slate-600 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-slate-300">{receipt.verdict}</span></div><p className="mt-1 font-mono text-[10px] text-slate-400">{receipt.reviewStartSeconds.toFixed(3)}–{receipt.reviewEndSeconds.toFixed(3)} s · {receipt.workload} · {receipt.split}</p><p className="mt-1 text-[10px] font-bold text-slate-300">{receipt.note}</p><button type="button" onClick={() => correct(receipt)} className="mt-2 rounded-md border border-cyan-700 px-2 py-1 text-[10px] font-black text-cyan-200">Correct with a superseding receipt</button></li>)}</ul> : null}
      <audio ref={audioRef} src={sourceUrl} controls preload="metadata" className="mt-4 w-full" onPlay={(event) => { previousTimeRef.current = event.currentTarget.currentTime; }} onPause={() => { previousTimeRef.current = null; }} onSeeking={() => { previousTimeRef.current = null; }} onTimeUpdate={(event) => observePlayback(event.currentTarget)} onEnded={(event) => observePlayback(event.currentTarget, true)} aria-label="Protected detector qualification source" />
      <div className="mt-3 grid gap-2 lg:grid-cols-3"><label className="text-[10px] font-black uppercase tracking-wide text-slate-300">Truth<select aria-label="Corpus truth verdict" value={verdict} onChange={(event) => { setVerdict(event.target.value as AudibleEventTruthVerdict); resetPlaybackEvidence(); }} className="mt-1 block w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-2 text-xs text-white"><option value="positive">Event is present</option><option value="absent">Class is absent</option></select></label><label className="text-[10px] font-black uppercase tracking-wide text-slate-300">Workload<select aria-label="Corpus workload" value={workload} onChange={(event) => setWorkload(event.target.value as AudibleEventTruthWorkload)} className="mt-1 block w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-2 text-xs text-white"><option value="podcast">Podcast</option><option value="coaching">Coaching</option></select></label><label className="text-[10px] font-black uppercase tracking-wide text-slate-300">Split<select aria-label="Corpus split" value={split} onChange={(event) => setSplit(event.target.value as AudibleEventTruthSplit)} className="mt-1 block w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-2 text-xs text-white"><option value="calibration">Calibration</option><option value="validation">Validation</option><option value="retained-challenge">Retained challenge</option></select></label></div>
      <div className="mt-2 grid gap-2 sm:grid-cols-3"><label className="text-[10px] font-black uppercase tracking-wide text-slate-300">Classifier identifier<input aria-label="Corpus classification identifier" value={classificationIdentifier} onChange={(event) => setClassificationIdentifier(event.target.value)} className="mt-1 block w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-2 font-mono text-xs text-white" /></label><label className="text-[10px] font-black uppercase tracking-wide text-slate-300">Display label<input aria-label="Corpus display label" value={displayLabel} onChange={(event) => setDisplayLabel(event.target.value)} className="mt-1 block w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-2 text-xs text-white" /></label><label className="text-[10px] font-black uppercase tracking-wide text-slate-300">Family<input aria-label="Corpus family" value={family} onChange={(event) => setFamily(event.target.value)} className="mt-1 block w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-2 text-xs text-white" /></label></div>
      <div className="mt-2 flex flex-wrap items-end gap-2"><NumberField label="Review start" ariaLabel="Corpus review start" value={reviewStartSeconds} maximum={durationSeconds} onChange={(value) => { setReviewStartSeconds(value); resetPlaybackEvidence(); }} /><NumberField label="Review end" ariaLabel="Corpus review end" value={reviewEndSeconds} maximum={durationSeconds} onChange={(value) => { setReviewEndSeconds(value); resetPlaybackEvidence(); }} />{verdict === "positive" ? <><NumberField label="Event start" ariaLabel="Corpus event start" value={eventStartSeconds} minimum={reviewStartSeconds} maximum={reviewEndSeconds} onChange={setEventStartSeconds} /><NumberField label="Event end" ariaLabel="Corpus event end" value={eventEndSeconds} minimum={reviewStartSeconds} maximum={reviewEndSeconds} onChange={setEventEndSeconds} /></> : null}<button type="button" onClick={() => void playWindow()} disabled={!status?.available || reviewEndSeconds <= reviewStartSeconds} className="rounded-md border border-cyan-500 bg-cyan-300 px-3 py-2 text-xs font-black text-slate-950 disabled:opacity-40">Play complete label window</button><span className="self-center text-[10px] font-bold text-slate-400">{windowListened ? "Complete window observed" : `Listen through ${requiredBins.length} source-clock bins`}</span></div>
      <textarea aria-label="Corpus listening note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="What you heard, including why this class is present or absent" className="mt-2 min-h-16 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white placeholder:text-slate-500" />
      {supersedesReceiptId ? <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-amber-600 bg-amber-950/30 px-3 py-2 text-[10px] font-bold text-amber-100"><span>This will supersede {supersedesReceiptId}; history remains append-only.</span><button type="button" onClick={() => setSupersedesReceiptId(null)} className="rounded border border-amber-500 px-2 py-1">Cancel correction</button></div> : null}
      <button type="button" onClick={() => void save()} disabled={!status?.available || !windowListened || note.trim().length < 2 || busy || !classificationIdentifier.trim() || reviewEndSeconds <= reviewStartSeconds || invalidPositive} className="mt-2 w-full rounded-md border border-cyan-500 bg-cyan-300 px-3 py-2 text-xs font-black text-slate-950 disabled:opacity-40">{busy ? "Saving source-bound truth…" : "Add playback-reviewed corpus evidence"}</button>
      <p className="mt-2 text-[9px] font-bold uppercase tracking-wide text-slate-500">Reviewer identity stays out of the projection. Ground truth cannot authorize treatment, editing, or promotion.</p>
    </details>
  );
}

function NumberField({ label, ariaLabel, value, minimum = 0, maximum, onChange }: { label: string; ariaLabel: string; value: number; minimum?: number; maximum: number; onChange: (value: number) => void }) {
  return <label className="text-[10px] font-black uppercase tracking-wide text-slate-300">{label}<input aria-label={ariaLabel} type="number" min={minimum} max={maximum} step="0.001" value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-1 block w-24 rounded-md border border-slate-600 bg-slate-900 px-2 py-2 font-mono text-xs text-white" /></label>;
}
function secondBins(startSeconds: number, endSeconds: number) { if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || endSeconds <= startSeconds) return []; const start = Math.floor(startSeconds); const end = Math.max(start, Math.ceil(endSeconds) - 1); return Array.from({ length: end - start + 1 }, (_, index) => start + index); }
function percent(value: number | null) { return value === null ? "—" : `${Math.round(value * 100)}%`; }
function metricValue(value: number | null) { return value === null ? "—" : value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2); }
