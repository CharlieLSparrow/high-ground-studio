"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AudioLines, Check, CircleAlert, FilePenLine, Gauge, History, ListTodo, LoaderCircle, NotebookPen, Play, RefreshCw, ShieldCheck, Sparkles, Target, TriangleAlert, X } from "lucide-react";

import type { AudioTranscriptEvidence } from "@/lib/transcript-evidence";

import { timestampForSeconds } from "./session-review-model";
import {
  EDITABLE_SESSION_NOTE_KINDS,
  SESSION_NOTE_VISIBILITIES,
  sessionNoteKindLabel,
  sessionNoteVisibilityLabel,
  type EditableSessionNoteKind,
  type SessionNoteVisibility,
} from "./session-notes-model";

type Correction = {
  id: string;
  segmentId: string;
  origin: "human" | "ai";
  status: "proposed" | "accepted" | "rejected" | "superseded";
  correctedText: string | null;
  correctedSpeakerLabel: string | null;
  reason: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  revisions: Array<{ revision: number; operation: string; createdAt: string }>;
};

type Verification = {
  id: string;
  segmentId: string;
  reviewKind: "confirmed-as-is";
  reviewedAt: string;
};

type SpeakerAttribution = {
  id: string;
  providerSpeakerLabel: string;
  participantId: string | null;
  participantUserId: string | null;
  attributedLabel: string;
  providerSnapshotSha256: string;
  sampleSegmentIds: string[];
  reviewedAt: string;
};

type SpeakerGroup = {
  providerSpeakerLabel: string;
  turnCount: number;
  providerSnapshotSha256: string;
  attribution: SpeakerAttribution | null;
  staleAttribution: boolean;
  samples: Array<{
    segmentId: string;
    startSeconds: number;
    endSeconds: number;
    text: string;
  }>;
};

type SessionParticipant = {
  id: string;
  userId: string | null;
  displayLabel: string;
  role: string;
  isCurrentActor: boolean;
};

type Segment = {
  id: string;
  speakerLabel: string | null;
  providerSpeakerLabel: string | null;
  startSeconds: number;
  endSeconds: number;
  text: string;
  providerText: string;
  providerTextSha256: string;
  confidence: number | null;
  words: Array<{
    id: string;
    providerWordIndex: number;
    startSeconds: number;
    endSeconds: number;
    word: string;
    punctuatedWord: string;
    confidence: number | null;
    speakerLabel: string | null;
    channel: number | null;
  }>;
  acceptedCorrection: Correction | null;
  acceptedVerification: Verification | null;
  speakerAttribution: SpeakerAttribution | null;
  proposals: Correction[];
  correctionHistory: Correction[];
};

type Desk = {
  ok: boolean;
  error?: string;
  roomId: string;
  transcriptJobId: string | null;
  transcriptStatus: string | null;
  processing: null | {
    status: string;
    message: string | null;
    wordCount: number;
    sourceBound: boolean;
    executionRequestedAt: string | null;
    resultReceived: boolean;
    providerReceiptReceived: boolean;
    workerBuildId: string | null;
  };
  gate: { allowed: boolean; error?: string };
  recording: null | {
    id: string;
    status: string;
    kind: string;
    fileName: string;
    durationSeconds: number | null;
    eligibleForProtectedPlaybackPreparation: boolean;
  };
  playback: null | {
    sourceId: string;
    url: string;
    kind: "audio" | "video";
    recordingAssetId: string;
    durationSeconds: number | null;
    label: string;
  };
  participants: SessionParticipant[];
  speakerGroups: SpeakerGroup[];
  segments: Segment[];
  evidence?: AudioTranscriptEvidence;
  evaluation?: null | {
    schema: string;
    eligible: boolean;
    canApprove: boolean;
    suggestedWorkload?: "podcast" | "coaching";
    sourceDurationSeconds?: number | null;
    sourceSha256?: string | null;
    consentVersionSha256?: string | null;
    reviewedSegmentCount?: number;
    totalSegmentCount?: number;
    referenceWordCount?: number;
    speakerReviewedWordCount?: number;
    timingEvidenceWordCount?: number;
    availableSegments?: Array<{ id: string; startSeconds: number; endSeconds: number; reviewed: boolean }>;
    suggestedRange?: null | {
      startSegmentId: string;
      endSegmentId: string;
      startSeconds: number;
      endSeconds: number;
      durationSeconds: number;
      segmentIds: string[];
    };
    blockers: Array<{ code: string; detail: string }>;
    conditions?: Record<"podcast" | "coaching", string[]>;
    approvedWindows: Array<{
      id: string;
      workload: "podcast" | "coaching";
      conditions: string[];
      sourceDurationSeconds: number;
      referenceWordCount: number;
      referenceRevisionId: string;
      approvedAt: string;
      completeSourcePlayback?: boolean;
      staleAgainstCurrentReview: boolean;
    }>;
    candidates?: EvaluationCandidate[];
    providerEvidenceError?: string | null;
  };
  boundaries: Record<string, boolean>;
};

type EvaluationCandidate = {
  id: string;
  windowId: string;
  runKey: string;
  providerKey: string;
  providerName: string;
  model: string;
  adapterVersion: string;
  inputMediaSha256: string | null;
  speakerAttribution: "word" | "segment" | "unavailable";
  timingGranularity: "word" | "segment" | "unavailable";
  outcome: "succeeded" | "failed";
  elapsedMilliseconds: number;
  estimatedCostUsd: number | null;
  metrics: null | {
    words?: { wordErrorRate?: number; wordErrorCount?: number; referenceWordCount?: number };
    speakers?: { speakerErrorRate?: number | null; speakerConfusions?: number; speakerMisses?: number };
    timing?: { p95AbsoluteStartDriftMilliseconds?: number | null; timedWordMatches?: number };
  };
  errorCode: string | null;
  retryable: boolean | null;
  policyReceiptSha256: string;
  correctionObservationCount: number;
  completedAt: string;
};

function requestId(segmentId: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `transcript-${segmentId}-${crypto.randomUUID()}`;
  return `transcript-${segmentId}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function humanize(value: string) {
  return value.replaceAll("-", " ").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function percent(value: number | null, digits = 0) {
  return value === null ? "Not measured" : `${(value * 100).toFixed(digits)}%`;
}

function audioFormat(evidence: AudioTranscriptEvidence["audio"]) {
  const sampleRate = evidence.decodedSampleRateHz ?? evidence.encodedSampleRateHz;
  const channels = evidence.decodedChannelCount ?? evidence.encodedChannelCount;
  return [
    evidence.codec?.toUpperCase(),
    evidence.container?.toUpperCase(),
    sampleRate ? `${Math.round(sampleRate / 100) / 10} kHz` : null,
    channels ? `${channels} ch` : null,
  ].filter(Boolean).join(" · ") || "Audio format not preserved";
}

function signalLevelHeight(dbfs: number) {
  return Math.max(4, Math.min(100, ((dbfs + 72) / 72) * 100));
}

function TranscriptAccuracyCorpusPanel({
  roomId,
  evaluation,
  busy,
  listenedSecondBins,
  playbackSourceId,
  onSaved,
}: {
  roomId: string;
  evaluation: NonNullable<Desk["evaluation"]>;
  busy: boolean;
  listenedSecondBins: number[];
  playbackSourceId: string | null;
  onSaved: (message: string) => Promise<void>;
}) {
  const [workload, setWorkload] = useState<"podcast" | "coaching">(evaluation.suggestedWorkload ?? "podcast");
  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);
  const [startSegmentId, setStartSegmentId] = useState(evaluation.suggestedRange?.startSegmentId ?? "");
  const [endSegmentId, setEndSegmentId] = useState(evaluation.suggestedRange?.endSegmentId ?? "");
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const conditions = evaluation.conditions?.[workload] ?? [];
  const segments = evaluation.availableSegments ?? [];
  const startIndex = segments.findIndex((segment) => segment.id === startSegmentId);
  const endIndex = segments.findIndex((segment) => segment.id === endSegmentId);
  const chosenSegments = startIndex >= 0 && endIndex >= startIndex ? segments.slice(startIndex, endIndex + 1) : [];
  let sourceStartSeconds = chosenSegments[0]?.startSeconds ?? 0;
  let sourceEndSeconds = chosenSegments.at(-1)?.endSeconds ?? 0;
  if (chosenSegments.length) {
    const missingSeconds = Math.max(0, 60 - (sourceEndSeconds - sourceStartSeconds));
    const growRight = Math.min(missingSeconds, Math.max(0, (evaluation.sourceDurationSeconds ?? 0) - sourceEndSeconds));
    sourceEndSeconds += growRight;
    sourceStartSeconds = Math.max(0, sourceStartSeconds - (missingSeconds - growRight));
    for (;;) {
      const overlap = segments.filter((segment) => segment.endSeconds > sourceStartSeconds + 0.001 && segment.startSeconds < sourceEndSeconds - 0.001);
      const nextStart = Math.min(sourceStartSeconds, ...overlap.map((segment) => segment.startSeconds));
      const nextEnd = Math.max(sourceEndSeconds, ...overlap.map((segment) => segment.endSeconds));
      if (Math.abs(nextStart - sourceStartSeconds) < 0.001 && Math.abs(nextEnd - sourceEndSeconds) < 0.001) break;
      sourceStartSeconds = nextStart;
      sourceEndSeconds = nextEnd;
    }
  }
  const selectedSegments = chosenSegments.length
    ? segments.filter((segment) => segment.endSeconds > sourceStartSeconds + 0.001 && segment.startSeconds < sourceEndSeconds - 0.001)
    : [];
  const sourceDurationSeconds = Math.max(0, sourceEndSeconds - sourceStartSeconds);
  const firstPlaybackBin = Math.floor(sourceStartSeconds);
  const finalPlaybackBinExclusive = Math.ceil(sourceEndSeconds);
  const expectedPlaybackBins = Math.max(0, finalPlaybackBinExclusive - firstPlaybackBin);
  const heardWindowBins = listenedSecondBins.filter((bin) => Number.isInteger(bin) && bin >= firstPlaybackBin && bin < finalPlaybackBinExclusive);
  const completeSourcePlayback = expectedPlaybackBins >= 1 && heardWindowBins.length === expectedPlaybackBins;
  const playbackCoverage = expectedPlaybackBins > 0
    ? Math.min(1, heardWindowBins.length / expectedPlaybackBins)
    : 0;
  const selectedRangeValid = sourceDurationSeconds >= 60
    && sourceDurationSeconds <= 180
    && selectedSegments.length > 0
    && selectedSegments.every((segment) => segment.reviewed);

  useEffect(() => {
    setWorkload(evaluation.suggestedWorkload ?? "podcast");
    setSelectedConditions([]);
    setStartSegmentId(evaluation.suggestedRange?.startSegmentId ?? "");
    setEndSegmentId(evaluation.suggestedRange?.endSegmentId ?? "");
  }, [evaluation.sourceSha256, evaluation.suggestedWorkload, evaluation.suggestedRange?.startSegmentId, evaluation.suggestedRange?.endSegmentId]);

  async function approve() {
    setApproving(true);
    setError(null);
    try {
      const response = await fetch("/api/mobile/capture/transcripts/corrections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation: "approve-evaluation-window",
          roomId,
          clientRequestId: requestId("evaluation-window"),
          workload,
          conditions: selectedConditions,
          startSegmentId,
          endSegmentId,
          sourcePlaybackEvidence: {
            schema: "quipsly-window-playback-v1",
            playbackSourceId,
            startSeconds: sourceStartSeconds,
            endSeconds: sourceEndSeconds,
            durationSeconds: sourceDurationSeconds,
            listenedSecondBins,
            completedAt: new Date().toISOString(),
          },
        }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; idempotentReplay?: boolean };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "The accuracy window could not be approved.");
      await onSaved(payload.idempotentReplay
        ? "This exact reviewed source was already in the private accuracy corpus. Nothing was duplicated."
        : "Added this exact playback-reviewed source to Quipsly’s private accuracy corpus.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The accuracy window could not be approved.");
    } finally {
      setApproving(false);
    }
  }

  const reviewed = evaluation.reviewedSegmentCount ?? 0;
  const total = evaluation.totalSegmentCount ?? 0;
  return <section className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-sky-50 p-6 shadow-sm" aria-labelledby="accuracy-corpus-heading">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-3xl">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-indigo-700">Private transcription lab</p>
        <h3 id="accuracy-corpus-heading" className="mt-2 font-serif text-2xl font-black text-[#3d3122]">Build accuracy truth from real listening</h3>
        <p className="mt-2 text-sm font-semibold leading-relaxed text-[#765f40]">Choose a transcript-aligned 60–180 second window after every included turn has been checked against playback. Quipsly freezes the original media hash, exact in/out points, consent state, provider evidence, reviewed words, and listening receipts—without changing the transcript or calling another provider.</p>
      </div>
      <span className={`rounded-full border px-3 py-1.5 text-xs font-black uppercase tracking-wide ${evaluation.eligible ? "border-emerald-200 bg-emerald-100 text-emerald-950" : "border-amber-200 bg-amber-100 text-amber-950"}`}>{evaluation.eligible ? "Ready to classify" : `${reviewed}/${total} reviewed`}</span>
    </div>

    <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <div className="rounded-xl border border-indigo-100 bg-white p-3"><dt className="text-[10px] font-black uppercase tracking-wide text-indigo-700">Reviewed segments</dt><dd className="mt-1 text-xl font-black text-[#3d3122]">{reviewed}/{total}</dd></div>
      <div className="rounded-xl border border-indigo-100 bg-white p-3"><dt className="text-[10px] font-black uppercase tracking-wide text-indigo-700">Reference words</dt><dd className="mt-1 text-xl font-black text-[#3d3122]">{(evaluation.referenceWordCount ?? 0).toLocaleString()}</dd></div>
      <div className="rounded-xl border border-indigo-100 bg-white p-3"><dt className="text-[10px] font-black uppercase tracking-wide text-indigo-700">Reviewed timed words</dt><dd className="mt-1 text-xl font-black text-[#3d3122]">{(evaluation.timingEvidenceWordCount ?? 0).toLocaleString()}</dd></div>
      <div className="rounded-xl border border-indigo-100 bg-white p-3"><dt className="text-[10px] font-black uppercase tracking-wide text-indigo-700">Speaker-reviewed</dt><dd className="mt-1 text-xl font-black text-[#3d3122]">{(evaluation.speakerReviewedWordCount ?? 0).toLocaleString()}</dd></div>
      <div className="rounded-xl border border-indigo-100 bg-white p-3"><dt className="text-[10px] font-black uppercase tracking-wide text-indigo-700">Source listened</dt><dd className="mt-1 text-xl font-black text-[#3d3122]">{percent(playbackCoverage, 0)}</dd></div>
    </dl>

    {evaluation.blockers.length > 0 ? <ul className="mt-4 space-y-2">{evaluation.blockers.map((blocker) => <li key={blocker.code} className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-950"><TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" /><span>{blocker.detail}</span></li>)}</ul> : <div className="mt-5 space-y-4 rounded-xl border border-indigo-200 bg-white p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-black uppercase tracking-wide text-indigo-950">Window starts at transcript turn
          <select aria-label="Window starts at transcript turn" value={startSegmentId} onChange={(event) => { const next = event.target.value; setStartSegmentId(next); const nextIndex = segments.findIndex((segment) => segment.id === next); if (endIndex < nextIndex) setEndSegmentId(next); }} className="mt-1 block min-h-11 w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-[#3d3122]">
            {segments.map((segment) => <option key={segment.id} value={segment.id}>{timestampForSeconds(segment.startSeconds)} · {segment.reviewed ? "reviewed" : "needs review"}</option>)}
          </select>
        </label>
        <label className="text-xs font-black uppercase tracking-wide text-indigo-950">Window ends after transcript turn
          <select aria-label="Window ends after transcript turn" value={endSegmentId} onChange={(event) => setEndSegmentId(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-[#3d3122]">
            {segments.map((segment, index) => <option key={segment.id} value={segment.id} disabled={index < startIndex}>{timestampForSeconds(segment.endSeconds)} · {segment.reviewed ? "reviewed" : "needs review"}</option>)}
          </select>
        </label>
      </div>
      <p className={`rounded-lg p-3 text-xs font-bold leading-5 ${selectedRangeValid ? "bg-emerald-50 text-emerald-950" : "bg-amber-50 text-amber-950"}`}>{selectedSegments.length ? `${timestampForSeconds(sourceStartSeconds)}–${timestampForSeconds(sourceEndSeconds)} · ${Math.round(sourceDurationSeconds)} seconds · ${selectedSegments.length} transcript turns` : "Choose a start and end turn."}{selectedSegments.some((segment) => !segment.reviewed) ? " Every included turn must be reviewed first." : sourceDurationSeconds < 60 || sourceDurationSeconds > 180 ? " The selected range must be 60–180 seconds." : " The provider derivative will use these exact boundaries."}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-black uppercase tracking-wide text-indigo-950">Recording workflow
          <select value={workload} onChange={(event) => { setWorkload(event.target.value as "podcast" | "coaching"); setSelectedConditions([]); }} className="mt-1 block min-h-11 w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-[#3d3122]">
            <option value="podcast">Podcast production</option>
            <option value="coaching">Coaching session</option>
          </select>
        </label>
        <div className="rounded-lg bg-indigo-50 p-3 text-xs font-bold leading-5 text-indigo-950">Choose every condition this clip actually tests. These labels drive clean-vs-difficult WER, speaker, timing, and correction-effort scorecards later.</div>
      </div>
      <fieldset><legend className="text-xs font-black uppercase tracking-wide text-indigo-950">Conditions heard in this source</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{conditions.map((condition) => <label key={condition} className="flex min-h-11 items-center gap-3 rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-xs font-bold text-indigo-950"><input type="checkbox" checked={selectedConditions.includes(condition)} onChange={(event) => setSelectedConditions((current) => event.target.checked ? [...current, condition] : current.filter((value) => value !== condition))} className="h-4 w-4" />{humanize(condition)}</label>)}</div></fieldset>
      {!completeSourcePlayback ? <p className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-950"><AudioLines size={16} className="mt-0.5 shrink-0" aria-hidden="true" />Play the complete selected window in the recording controls above. Scrubbing does not count as listening; {Math.max(0, expectedPlaybackBins - heardWindowBins.length)} second{expectedPlaybackBins - heardWindowBins.length === 1 ? "" : "s"} remain.</p> : <p className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold leading-5 text-emerald-950"><Check size={16} className="mt-0.5 shrink-0" aria-hidden="true" />Complete selected-window playback observed in this review session.</p>}
      <button type="button" onClick={() => void approve()} disabled={busy || approving || selectedConditions.length === 0 || !selectedRangeValid || !completeSourcePlayback} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-indigo-800 px-5 py-2 text-xs font-black uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-50">{approving ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> : <ShieldCheck size={15} aria-hidden="true" />}{approving ? "Freezing reviewed evidence…" : "Add to private accuracy corpus"}</button>
      <p className="text-xs font-bold leading-5 text-indigo-800">This is an explicit approval of the exact playback-reviewed reference. It does not upload new media, rerun transcription, alter provider output, train a public model, message anyone, or publish.</p>
    </div>}
    {error ? <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-900">{error}</p> : null}
    {evaluation.approvedWindows.length > 0 ? <div className="mt-5"><p className="text-xs font-black uppercase tracking-wide text-indigo-900">Frozen evaluation windows</p><ul className="mt-2 space-y-2">{evaluation.approvedWindows.map((window) => <li key={window.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-100 bg-white p-3 text-xs font-bold text-[#5f4d37]"><span>{humanize(window.workload)} · {window.referenceWordCount} words · {window.conditions.map(humanize).join(", ")}</span><span className={window.staleAgainstCurrentReview ? "text-amber-800" : "text-emerald-800"}>{window.staleAgainstCurrentReview ? "Prior reviewed revision" : "Matches current review"}</span></li>)}</ul></div> : null}
    {evaluation.approvedWindows.length > 0 ? <div className="mt-5 rounded-xl border border-indigo-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-black uppercase tracking-wide text-indigo-900">Provider evidence scorecards</p><p className="mt-1 max-w-3xl text-xs font-semibold leading-5 text-[#765f40]">Every result is measured against the same frozen human reference. Missing speaker or word-timing evidence stays visibly unavailable; Quipsly never interpolates it.</p></div>
        <a href={`/api/transcript-evaluation?roomId=${encodeURIComponent(roomId)}&view=runner-input`} className="inline-flex min-h-11 items-center rounded-full border border-indigo-300 bg-indigo-50 px-4 py-2 text-xs font-black uppercase tracking-wide text-indigo-950">Export protected runner input</a>
      </div>
      {evaluation.providerEvidenceError ? <p role="status" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-950">{evaluation.providerEvidenceError}</p> : null}
      {(evaluation.candidates ?? []).length ? <div className="mt-4 grid gap-3 xl:grid-cols-2">{(evaluation.candidates ?? []).map((candidate) => {
        const wordRate = candidate.metrics?.words?.wordErrorRate;
        const speakerRate = candidate.metrics?.speakers?.speakerErrorRate;
        const timingP95 = candidate.metrics?.timing?.p95AbsoluteStartDriftMilliseconds;
        return <article key={candidate.id} className={`rounded-xl border p-4 ${candidate.outcome === "succeeded" ? "border-emerald-200 bg-emerald-50/40" : "border-rose-200 bg-rose-50/50"}`}>
          <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-black text-[#3d3122]">{candidate.providerName}</p><p className="mt-1 text-[10px] font-black uppercase tracking-wide text-[#765f40]">{candidate.model} · {candidate.adapterVersion}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${candidate.outcome === "succeeded" ? "bg-emerald-100 text-emerald-900" : "bg-rose-100 text-rose-900"}`}>{candidate.outcome}</span></div>
          {candidate.outcome === "succeeded" ? <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div className="rounded-lg bg-white p-2"><dt className="font-black uppercase tracking-wide text-indigo-700">WER</dt><dd className="mt-1 font-black text-[#3d3122]">{typeof wordRate === "number" ? percent(wordRate, 1) : "Unavailable"}</dd></div>
            <div className="rounded-lg bg-white p-2"><dt className="font-black uppercase tracking-wide text-indigo-700">Speaker error</dt><dd className="mt-1 font-black text-[#3d3122]">{candidate.speakerAttribution === "unavailable" || speakerRate == null ? "Unavailable" : percent(speakerRate, 1)}</dd></div>
            <div className="rounded-lg bg-white p-2"><dt className="font-black uppercase tracking-wide text-indigo-700">Timing p95</dt><dd className="mt-1 font-black text-[#3d3122]">{candidate.timingGranularity !== "word" || timingP95 == null ? "Unavailable" : `${Math.round(timingP95)} ms`}</dd></div>
            <div className="rounded-lg bg-white p-2"><dt className="font-black uppercase tracking-wide text-indigo-700">Latency</dt><dd className="mt-1 font-black text-[#3d3122]">{(candidate.elapsedMilliseconds / 1000).toFixed(1)} s</dd></div>
          </dl> : <p className="mt-3 rounded-lg bg-white p-3 text-xs font-bold text-rose-900">{candidate.errorCode ? humanize(candidate.errorCode) : "Provider attempt failed"}{candidate.retryable === true ? " · retryable in a new run" : ""}</p>}
          <p className="mt-3 text-[10px] font-bold leading-4 text-[#765f40]">{candidate.estimatedCostUsd === null ? "Cost not observed" : `$${candidate.estimatedCostUsd.toFixed(4)} observed`} · {candidate.correctionObservationCount} measured correction pass{candidate.correctionObservationCount === 1 ? "" : "es"} · input {candidate.inputMediaSha256 ? `${candidate.inputMediaSha256.slice(0, 10)}…` : "legacy/unavailable"} · policy {candidate.policyReceiptSha256.slice(0, 10)}…</p>
        </article>;
      })}</div> : !evaluation.providerEvidenceError ? <p className="mt-4 rounded-lg border border-dashed border-indigo-200 bg-indigo-50/50 p-4 text-xs font-bold leading-5 text-indigo-950">No alternative provider attempt has been recorded yet. The protected export gives an authorized runner exact source and reference hashes without exposing them in ordinary Session views.</p> : null}
    </div> : null}
  </section>;
}

function AudioSignalEvidencePanel({
  audio,
  transcriptEndSeconds,
  playbackReady,
  onPlayAt,
}: {
  audio: AudioTranscriptEvidence["audio"];
  transcriptEndSeconds: number | null;
  playbackReady: boolean;
  onPlayAt: (seconds: number) => Promise<void>;
}) {
  const [selectedSignalSeconds, setSelectedSignalSeconds] = useState(0);
  const signal = audio.signal;
  if (!signal) return <div className="mt-4 rounded-xl border border-dashed border-sky-200 bg-white/70 p-4 text-xs font-bold leading-5 text-sky-950"><p className="font-black uppercase tracking-wide">Decoded signal scan unavailable</p><p className="mt-1">This legacy or externally imported source did not preserve a complete frame scan. Quipsly will not infer loudness, clipping, silence, or dropout from transcript confidence.</p></div>;

  const tailPoints = transcriptEndSeconds === null
    ? []
    : signal.waveform.filter((point) => point.startSeconds + point.durationSeconds > transcriptEndSeconds);
  const tailPeak = tailPoints.length ? Math.max(...tailPoints.map((point) => point.samplePeakDbfs)) : null;
  const tailHasSignal = tailPeak !== null && tailPeak > signal.thresholds.nearSilenceDbfs;
  const statusTone = signal.status === "signal-present"
    ? "border-emerald-200 bg-emerald-50 text-emerald-950"
    : signal.status === "near-digital-silence"
      ? "border-rose-200 bg-rose-50 text-rose-950"
      : "border-amber-200 bg-amber-50 text-amber-950";

  return <div className="mt-4 rounded-xl border border-sky-200 bg-white p-4" aria-label="Decoded audio signal evidence">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-black uppercase tracking-wide text-sky-950">Decoded signal scan</p><p className="mt-1 text-xs font-semibold leading-5 text-[#765f40]">Complete-frame RMS and sample-peak observations. RMS dBFS is not perceptual LUFS, and possible dropout always requires listening.</p></div>
      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${statusTone}`}>{humanize(signal.status)}</span>
    </div>
    <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-lg bg-sky-50 p-3"><dt className="font-black uppercase tracking-wide text-sky-800">RMS</dt><dd className="mt-1 text-lg font-black text-sky-950">{signal.rmsDbfs.toFixed(1)} dBFS</dd><dd className="mt-1 text-[10px] font-bold text-sky-800">not LUFS</dd></div>
      <div className="rounded-lg bg-violet-50 p-3"><dt className="font-black uppercase tracking-wide text-violet-800">Sample peak</dt><dd className="mt-1 text-lg font-black text-violet-950">{signal.samplePeakDbfs.toFixed(1)} dBFS</dd><dd className="mt-1 text-[10px] font-bold text-violet-800">{signal.clippedFrameCount.toLocaleString()} clipped frames observed</dd></div>
      <div className="rounded-lg bg-amber-50 p-3"><dt className="font-black uppercase tracking-wide text-amber-800">Near-silent frames</dt><dd className="mt-1 text-lg font-black text-amber-950">{percent(signal.nearSilentFrameFraction, 1)}</dd><dd className="mt-1 text-[10px] font-bold text-amber-800">threshold {signal.thresholds.nearSilenceDbfs.toFixed(0)} dBFS</dd></div>
      <div className="rounded-lg bg-emerald-50 p-3"><dt className="font-black uppercase tracking-wide text-emerald-800">Decoded coverage</dt><dd className="mt-1 text-lg font-black text-emerald-950">{timestampForSeconds(signal.durationSeconds)}</dd><dd className="mt-1 text-[10px] font-bold text-emerald-800">{signal.analyzedFrameCount.toLocaleString()} frames · {signal.channelCount} ch</dd></div>
    </dl>

    {signal.waveform.length > 0 ? <button
      type="button"
      disabled={!playbackReady}
      onClick={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        const fraction = bounds.width > 0 ? (event.clientX - bounds.left) / bounds.width : 0;
        const nextSeconds = Math.max(0, Math.min(signal.durationSeconds, fraction * signal.durationSeconds));
        setSelectedSignalSeconds(nextSeconds);
        void onPlayAt(nextSeconds);
      }}
      className="mt-4 flex h-28 w-full items-center gap-px overflow-hidden rounded-lg border border-sky-200 bg-sky-50 px-2 py-3 disabled:opacity-50"
      aria-label="Audio waveform overview. Select a position to play from that time."
    >{signal.waveform.map((point, index) => <span
      key={`${point.startSeconds}-${index}`}
      aria-hidden="true"
      className={`min-w-px flex-1 rounded-full ${point.clippedFrameCount > 0 ? "bg-rose-500" : point.rmsDbfs <= signal.thresholds.nearSilenceDbfs ? "bg-slate-300" : "bg-sky-600"}`}
      style={{ height: `${signalLevelHeight(point.rmsDbfs)}%` }}
    />)}</button> : null}
    <div className="mt-2 flex justify-between text-[10px] font-black uppercase tracking-wide text-sky-800"><span>00:00</span><span>Select waveform to listen</span><span>{timestampForSeconds(signal.durationSeconds)}</span></div>
    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-sky-200 bg-sky-50 p-3">
      <label htmlFor="audio-signal-time" className="text-xs font-black text-sky-950">Selected time {timestampForSeconds(selectedSignalSeconds)}</label>
      <input
        id="audio-signal-time"
        type="range"
        min={0}
        max={Math.max(signal.durationSeconds, 0.01)}
        step={0.1}
        value={selectedSignalSeconds}
        onChange={(event) => setSelectedSignalSeconds(Number(event.currentTarget.value))}
        className="min-w-48 flex-1 accent-sky-700"
      />
      <button type="button" disabled={!playbackReady} onClick={() => void onPlayAt(selectedSignalSeconds)} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-sky-800 px-4 py-2 text-xs font-black text-white disabled:opacity-50"><Play className="size-4" aria-hidden="true" />Play selected time</button>
    </div>

    {tailPeak !== null ? <p className={`mt-3 rounded-lg border p-3 text-xs font-bold leading-5 ${tailHasSignal ? "border-violet-200 bg-violet-50 text-violet-950" : "border-slate-200 bg-slate-50 text-slate-800"}`}>{tailHasSignal ? `Measurable signal continues after the last timed transcript word (tail peak ${tailPeak.toFixed(1)} dBFS). Listen before treating the transcript as complete.` : `The overview scan found only near-silence after the last timed transcript word (tail peak ${tailPeak.toFixed(1)} dBFS). This is an observation, not proof that no speech exists.`}</p> : null}

    {(signal.observations.length > 0 || audio.timelineEvents.length > 0) ? <div className="mt-4 grid gap-3 lg:grid-cols-2">
      <div><p className="text-[10px] font-black uppercase tracking-wide text-rose-800">Signal observations</p><div className="mt-2 space-y-2">{signal.observations.length ? signal.observations.map((observation, index) => <button key={`${observation.kind}-${observation.startSeconds}-${index}`} type="button" disabled={!playbackReady} onClick={() => void onPlayAt(observation.startSeconds)} className="block min-h-11 w-full rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-left text-xs font-bold leading-5 text-rose-950 disabled:opacity-50"><span className="font-black uppercase tracking-wide">{timestampForSeconds(observation.startSeconds)} · {humanize(observation.kind)}</span><span className="mt-1 block">{observation.detail}</span></button>) : <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-950">No configured signal threshold produced an observation.</p>}</div></div>
      <div><p className="text-[10px] font-black uppercase tracking-wide text-amber-800">Capture timeline boundaries</p><div className="mt-2 space-y-2">{audio.timelineEvents.length ? audio.timelineEvents.map((timelineEvent, index) => <button key={`${timelineEvent.kind}-${timelineEvent.startSeconds}-${index}`} type="button" disabled={!playbackReady} onClick={() => void onPlayAt(timelineEvent.startSeconds)} className="block min-h-11 w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs font-bold leading-5 text-amber-950 disabled:opacity-50"><span className="font-black uppercase tracking-wide">{timestampForSeconds(timelineEvent.startSeconds)} · {humanize(timelineEvent.kind)}</span><span className="mt-1 block">{[timelineEvent.detail, timelineEvent.routeName, timelineEvent.routePortType].filter(Boolean).join(" · ") || "Boundary preserved without route detail"}</span></button>) : <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs font-bold text-slate-800">No pause, interruption, route-loss, mark, or background boundary was preserved.</p>}</div></div>
    </div> : <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-950">No configured signal observation or capture boundary needs attention.</p>}
  </div>;
}

function AudioTranscriptEvidencePanel({
  evidence,
  playbackReady,
  onPlayAt,
}: {
  evidence: AudioTranscriptEvidence;
  playbackReady: boolean;
  onPlayAt: (seconds: number) => Promise<void>;
}) {
  const { audio, transcript } = evidence;
  const confidenceLabel = transcript.meanWordConfidence === null
    ? "Not supplied"
    : percent(transcript.meanWordConfidence, 1);
  const measuredLabel = transcript.measuredWordErrorRate === null
    ? "Not measured yet"
    : `${percent(transcript.measuredWordErrorRate, 1)} WER`;
  const measuredContext = transcript.measuredScope === "COMPLETE_TRANSCRIPT"
    ? "complete playback-reviewed transcript"
    : transcript.measuredScope === "REVIEWED_SAMPLE"
      ? `${transcript.reviewedSegmentCount} reviewed segment sample`
      : "requires playback-reviewed segments";

  return <section aria-labelledby="audio-transcript-evidence-heading" className="rounded-2xl border border-sky-200 bg-sky-50/45 p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-800">Audio and transcript observability</p>
        <h3 id="audio-transcript-evidence-heading" className="mt-2 font-serif text-2xl font-black text-[#3d3122]">What Quipsly heard, what the model inferred, what was actually checked</h3>
        <p className="mt-2 max-w-4xl text-sm font-semibold leading-relaxed text-sky-950">Provider confidence helps prioritize listening; it is not measured accuracy. Measured word error appears only where a reviewer created playback-backed reference text or confirmed the provider words as-is.</p>
      </div>
      <span className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-wide ${audio.formatComparison === "DRIFT" ? "border-rose-300 bg-rose-50 text-rose-900" : audio.formatComparison === "MATCH" ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}>{humanize(audio.formatComparison)} audio profile</span>
    </div>

    <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-xl border border-sky-200 bg-white p-4"><AudioLines className="text-sky-700" size={20} aria-hidden="true" /><p className="mt-3 text-[10px] font-black uppercase tracking-wide text-sky-800">Recorded audio</p><p className="mt-1 text-lg font-black text-[#3d3122]">{audioFormat(audio)}</p><p className="mt-2 text-xs font-semibold leading-5 text-[#765f40]">{[audio.inputRoute, audio.inputDataSource, audio.inputPortType].filter(Boolean).join(" · ") || "Input route was not preserved"}</p></div>
      <div className="rounded-xl border border-violet-200 bg-white p-4"><Gauge className="text-violet-700" size={20} aria-hidden="true" /><p className="mt-3 text-[10px] font-black uppercase tracking-wide text-violet-800">Provider confidence</p><p className="mt-1 text-lg font-black text-[#3d3122]">{confidenceLabel}</p><p className="mt-2 text-xs font-semibold leading-5 text-[#765f40]">{transcript.confidenceWordCount}/{transcript.wordCount} words scored{transcript.lowConfidenceWordCount === null ? "" : ` · ${transcript.lowConfidenceWordCount} below ${percent(transcript.lowConfidenceThreshold, 0)}`} · not WER</p></div>
      <div className="rounded-xl border border-emerald-200 bg-white p-4"><ShieldCheck className="text-emerald-700" size={20} aria-hidden="true" /><p className="mt-3 text-[10px] font-black uppercase tracking-wide text-emerald-800">Measured against review</p><p className="mt-1 text-lg font-black text-[#3d3122]">{measuredLabel}</p><p className="mt-2 text-xs font-semibold leading-5 text-[#765f40]">{measuredContext}{transcript.measuredReferenceWordCount ? ` · ${transcript.measuredWordErrorCount}/${transcript.measuredReferenceWordCount} word edits` : ""}</p></div>
      <div className="rounded-xl border border-amber-200 bg-white p-4"><TriangleAlert className="text-amber-700" size={20} aria-hidden="true" /><p className="mt-3 text-[10px] font-black uppercase tracking-wide text-amber-800">Review coverage</p><p className="mt-1 text-lg font-black text-[#3d3122]">{percent(transcript.reviewCoverage, 0)}</p><p className="mt-2 text-xs font-semibold leading-5 text-[#765f40]">{transcript.correctedSegmentCount} corrected · {transcript.confirmedAsIsSegmentCount} confirmed · {transcript.segmentCount - transcript.reviewedSegmentCount} unchecked</p></div>
    </div>

    <details className="mt-4 rounded-xl border border-sky-200 bg-white p-4">
      <summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-sky-950">Inspect capture and timing details</summary>
      <dl className="mt-4 grid gap-3 text-xs font-semibold text-[#765f40] sm:grid-cols-2 lg:grid-cols-3">
        <div><dt className="font-black uppercase tracking-wide text-[#8a7354]">Capture pipeline</dt><dd className="mt-1 break-words">{audio.capturePipeline || "Not preserved"}</dd></div>
        <div><dt className="font-black uppercase tracking-wide text-[#8a7354]">Pause timeline</dt><dd className="mt-1 break-words">{audio.pauseTimelinePolicy || "Not preserved"}</dd></div>
        <div><dt className="font-black uppercase tracking-wide text-[#8a7354]">Hardware input</dt><dd className="mt-1">{audio.hardwareSampleRateHz ? `${audio.hardwareSampleRateHz} Hz` : "Not measured"} · {audio.hardwareInputChannelCount ? `${audio.hardwareInputChannelCount} ch` : "channels unknown"}</dd></div>
        <div><dt className="font-black uppercase tracking-wide text-[#8a7354]">Transcript engine</dt><dd className="mt-1">{[transcript.provider, transcript.providerModel, transcript.language].filter(Boolean).join(" · ") || "Not identified"}</dd></div>
        <div><dt className="font-black uppercase tracking-wide text-[#8a7354]">Timed span</dt><dd className="mt-1">{transcript.transcriptStartSeconds === null || transcript.transcriptEndSeconds === null ? "No timed speech" : `${timestampForSeconds(transcript.transcriptStartSeconds)}–${timestampForSeconds(transcript.transcriptEndSeconds)}`}</dd></div>
        <div><dt className="font-black uppercase tracking-wide text-[#8a7354]">Speaker clusters</dt><dd className="mt-1">{transcript.attributedSpeakerClusterCount}/{transcript.providerSpeakerClusterCount} identified</dd></div>
      </dl>
      {(audio.issues.length > 0 || transcript.endsBeforeRecordingBySeconds !== null) && <div className="mt-4 space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-950">{audio.issues.map((issue) => <p key={issue}>{issue}</p>)}{transcript.endsBeforeRecordingBySeconds !== null && <p>Timed speech ends {transcript.endsBeforeRecordingBySeconds.toFixed(1)} seconds before the recording ends. That may be silence; Quipsly does not label it missing audio without signal analysis.</p>}</div>}
    </details>

    <AudioSignalEvidencePanel
      audio={audio}
      transcriptEndSeconds={transcript.transcriptEndSeconds}
      playbackReady={playbackReady}
      onPlayAt={onPlayAt}
    />

    {transcript.attentionSegments.length > 0 && <div className="mt-4 rounded-xl border border-violet-200 bg-white p-4">
      <p className="text-xs font-black uppercase tracking-wide text-violet-900">Listen next · lowest confidence and unchecked evidence</p>
      <div className="mt-3 grid gap-2 lg:grid-cols-2">{transcript.attentionSegments.map((segment) => <button key={segment.segmentId} type="button" disabled={!playbackReady} onClick={() => void onPlayAt(segment.startSeconds)} className="min-h-11 rounded-lg border border-violet-200 bg-violet-50/50 px-3 py-2 text-left text-xs font-bold leading-5 text-violet-950 disabled:opacity-50" aria-label={`Play transcript attention segment from ${timestampForSeconds(segment.startSeconds)}`}><span className="mr-2 inline-flex items-center gap-1 font-black uppercase tracking-wide"><Play size={12} fill="currentColor" aria-hidden="true" />{timestampForSeconds(segment.startSeconds)}</span>{segment.text}<span className="mt-1 block text-[10px] font-black uppercase tracking-wide text-violet-700">{segment.reviewed ? "reviewed" : "unchecked"}{segment.minimumWordConfidence === null ? " · confidence unavailable" : ` · lowest confidence ${percent(segment.minimumWordConfidence, 0)}`}{segment.lowConfidenceWords.length ? ` · low words: ${segment.lowConfidenceWords.map((word) => word.word).join(", ")}` : ""}</span></button>)}</div>
    </div>}
  </section>;
}

function SpeakerAttributionPanel({
  roomId,
  groups,
  participants,
  playbackReady,
  currentPlaybackPosition,
  busy,
  onPlayAt,
  onSaved,
}: {
  roomId: string;
  groups: SpeakerGroup[];
  participants: SessionParticipant[];
  playbackReady: boolean;
  currentPlaybackPosition: () => number | null;
  busy: boolean;
  onPlayAt: (seconds: number) => Promise<void>;
  onSaved: (message: string) => Promise<void>;
}) {
  const [selectedParticipants, setSelectedParticipants] = useState<Record<string, string>>({});
  const [playedSamples, setPlayedSamples] = useState<Record<string, string>>({});
  const [confirmedGroups, setConfirmedGroups] = useState<Record<string, boolean>>({});
  const [requestIds, setRequestIds] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function playSample(group: SpeakerGroup, segmentId: string, startSeconds: number) {
    setPlayedSamples((current) => ({ ...current, [group.providerSpeakerLabel]: segmentId }));
    setConfirmedGroups((current) => ({ ...current, [group.providerSpeakerLabel]: false }));
    await onPlayAt(startSeconds);
  }

  async function save(group: SpeakerGroup) {
    const label = group.providerSpeakerLabel;
    const participantId = selectedParticipants[label] || group.attribution?.participantId || "";
    const segmentId = playedSamples[label] || "";
    const playbackPositionSeconds = currentPlaybackPosition();
    setErrors((current) => ({ ...current, [label]: "" }));
    try {
      const clientRequestId = requestIds[label] || requestId(`speaker-${label}`);
      setRequestIds((current) => ({ ...current, [label]: clientRequestId }));
      const response = await fetch("/api/mobile/capture/transcripts/corrections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation: "attribute-provider-speaker",
          roomId,
          providerSpeakerLabel: label,
          participantId,
          clientRequestId,
          expectedProviderSnapshotSha256: group.providerSnapshotSha256,
          samples: [{ segmentId, playbackPositionSeconds }],
          confirmedAgainstPlayback: confirmedGroups[label] === true,
        }),
      });
      const body = await response.json() as { ok?: boolean; error?: string; attribution?: SpeakerAttribution };
      if (!response.ok || !body.ok || !body.attribution) throw new Error(body.error || "The speaker assignment was not saved.");
      setRequestIds((current) => ({ ...current, [label]: requestId(`speaker-${label}`) }));
      setConfirmedGroups((current) => ({ ...current, [label]: false }));
      await onSaved(`${label} is now identified as ${body.attribution.attributedLabel}. Word review remains unchanged.`);
    } catch (error) {
      setErrors((current) => ({
        ...current,
        [label]: error instanceof Error ? error.message : "The speaker assignment was not saved.",
      }));
    }
  }

  if (!groups.length) return null;
  return (
    <section aria-labelledby="speaker-attribution-heading" className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-5 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-indigo-800">Session-wide diarization</p>
      <h3 id="speaker-attribution-heading" className="mt-2 font-serif text-2xl font-black text-[#3d3122]">Identify a voice once</h3>
      <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-indigo-950">Play a representative turn, choose the real Session participant, and Quipsly will label every turn in that provider cluster. This identifies the voice only—it does not mark those words playback-reviewed.</p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {groups.map((group) => {
          const label = group.providerSpeakerLabel;
          const selectedParticipant = selectedParticipants[label] || group.attribution?.participantId || "";
          const playedSample = playedSamples[label] || "";
          return (
            <article key={label} className="rounded-xl border border-indigo-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-indigo-800">Provider {label} · {group.turnCount} turn{group.turnCount === 1 ? "" : "s"}</p>
                  <p className="mt-1 text-sm font-black text-indigo-950">{group.attribution ? `Identified as ${group.attribution.attributedLabel}` : "Needs a human identity"}</p>
                </div>
                {group.attribution && <span className="rounded-full bg-emerald-100 px-3 py-1 text-[0.68rem] font-black uppercase tracking-wide text-emerald-900">voice reviewed</span>}
              </div>
              {group.staleAttribution && <p role="status" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-950">The provider cluster changed after its prior assignment. Listen again before reapplying an identity.</p>}
              <label className="mt-4 block text-xs font-black uppercase tracking-wide text-indigo-950">Participant
                <select value={selectedParticipant} onChange={(event) => setSelectedParticipants((current) => ({ ...current, [label]: event.target.value }))} className="mt-1 block min-h-11 w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-[#3d3122]">
                  <option value="">Choose a Session participant</option>
                  {participants.map((participant) => <option key={participant.id} value={participant.id}>{participant.displayLabel} · {humanize(participant.role)}{participant.isCurrentActor ? " · you" : ""}</option>)}
                </select>
              </label>
              <div className="mt-4 space-y-2" role="group" aria-label={`Playback samples for ${label}`}>
                {group.samples.map((sample) => (
                  <button key={sample.segmentId} type="button" onClick={() => void playSample(group, sample.segmentId, sample.startSeconds)} disabled={!playbackReady || busy} className={`block w-full rounded-lg border px-3 py-2 text-left text-xs font-bold leading-relaxed transition disabled:opacity-50 ${playedSample === sample.segmentId ? "border-indigo-600 bg-indigo-100 text-indigo-950" : "border-indigo-200 bg-indigo-50/40 text-indigo-900 hover:bg-indigo-50"}`} aria-label={`Play ${label} sample from ${timestampForSeconds(sample.startSeconds)}`}>
                    <span className="mr-2 inline-flex items-center gap-1 font-black uppercase tracking-wide"><Play size={12} fill="currentColor" aria-hidden="true" />{timestampForSeconds(sample.startSeconds)}</span>{sample.text}
                  </button>
                ))}
              </div>
              <label className="mt-3 flex items-start gap-3 rounded-lg border border-indigo-200 bg-indigo-50/60 p-3 text-sm font-bold leading-relaxed text-indigo-950">
                <input type="checkbox" checked={confirmedGroups[label] === true} onChange={(event) => setConfirmedGroups((current) => ({ ...current, [label]: event.target.checked }))} disabled={!playedSample} className="mt-1 size-4 accent-indigo-800" />
                <span>I played the selected sample and recognize this voice as the chosen participant.</span>
              </label>
              {errors[label] && <p role="alert" className="mt-3 flex items-start gap-2 text-sm font-bold text-rose-800"><CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />{errors[label]}</p>}
              <button type="button" onClick={() => void save(group)} disabled={busy || !playbackReady || !selectedParticipant || !playedSample || confirmedGroups[label] !== true} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-indigo-800 px-4 py-2 text-xs font-black uppercase tracking-wide text-white disabled:opacity-50"><ShieldCheck size={15} aria-hidden="true" />{group.attribution ? "Update voice identity" : "Apply voice identity"}</button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ProposalReview({
  roomId,
  segment,
  proposal,
  playbackReady,
  currentPlaybackPosition,
  busy,
  onPlay,
  onSaved,
}: {
  roomId: string;
  segment: Segment;
  proposal: Correction;
  playbackReady: boolean;
  currentPlaybackPosition: () => number | null;
  busy: boolean;
  onPlay: () => Promise<void>;
  onSaved: (message: string) => Promise<void>;
}) {
  const [listened, setListened] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "accept" | "reject") {
    setError(null);
    try {
      const response = await fetch("/api/mobile/capture/transcripts/corrections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation: "review-ai-proposal",
          roomId,
          correctionId: proposal.id,
          decision,
          expectedAcceptedCorrectionId: segment.acceptedCorrection?.id ?? null,
          confirmedAgainstPlayback: decision === "accept" && listened,
          playbackPositionSeconds: currentPlaybackPosition(),
        }),
      });
      const body = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !body.ok) throw new Error(body.error || "The proposal decision was not saved.");
      await onSaved(decision === "accept"
        ? "AI proposal accepted only after playback review. Its reviewed overlay is now effective."
        : "AI proposal rejected and preserved in correction history.");
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : "The proposal decision was not saved.");
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-4">
      <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-violet-800"><Sparkles size={15} aria-hidden="true" />AI proposal · not transcript truth</p>
      {proposal.correctedSpeakerLabel && <p className="mt-2 text-sm font-bold text-violet-950">Proposed speaker: {proposal.correctedSpeakerLabel}</p>}
      <p className="mt-2 text-sm font-semibold leading-relaxed text-violet-950">{proposal.correctedText || segment.text}</p>
      {proposal.reason && <p className="mt-2 text-xs font-bold text-violet-800">Reason: {proposal.reason}</p>}
      <label className="mt-3 flex items-start gap-3 rounded-lg border border-violet-200 bg-white p-3 text-sm font-bold leading-relaxed text-violet-950">
        <input type="checkbox" checked={listened} onChange={(event) => setListened(event.target.checked)} className="mt-1 size-4 accent-violet-800" />
        <span>I played this exact timestamp and verified the proposal against the recording.</span>
      </label>
      {error && <p role="alert" className="mt-3 flex items-start gap-2 text-sm font-bold text-rose-800"><CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => void onPlay()} disabled={!playbackReady || busy} className="inline-flex items-center gap-2 rounded-full border border-violet-300 bg-white px-3 py-2 text-xs font-black uppercase tracking-wide text-violet-900 disabled:opacity-50"><Play size={14} fill="currentColor" aria-hidden="true" />Play timestamp</button>
        <button type="button" onClick={() => void decide("accept")} disabled={!playbackReady || !listened || busy} className="inline-flex items-center gap-2 rounded-full bg-violet-800 px-3 py-2 text-xs font-black uppercase tracking-wide text-white disabled:opacity-50"><Check size={14} aria-hidden="true" />Accept after listening</button>
        <button type="button" onClick={() => void decide("reject")} disabled={busy} className="inline-flex items-center gap-2 rounded-full border border-rose-300 bg-white px-3 py-2 text-xs font-black uppercase tracking-wide text-rose-800 disabled:opacity-50"><X size={14} aria-hidden="true" />Reject proposal</button>
      </div>
      <p className="mt-2 text-xs font-bold text-violet-800">Until accepted here, this proposal does not change the effective transcript.</p>
    </div>
  );
}

function CorrectionEditor({
  roomId,
  segment,
  canUseProjectTeamNotes,
  playbackReady,
  currentPlaybackPosition,
  busy,
  onPlay,
  onPlayAt,
  onSaved,
}: {
  roomId: string;
  segment: Segment;
  canUseProjectTeamNotes: boolean;
  playbackReady: boolean;
  currentPlaybackPosition: () => number | null;
  busy: boolean;
  onPlay: () => Promise<void>;
  onPlayAt: (seconds: number) => Promise<void>;
  onSaved: (message: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [correctedText, setCorrectedText] = useState(segment.text);
  const [correctedSpeaker, setCorrectedSpeaker] = useState(segment.speakerLabel || "");
  const [reason, setReason] = useState("");
  const [listened, setListened] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);
  const [taskTitle, setTaskTitle] = useState(segment.text.slice(0, 180));
  const [taskDetail, setTaskDetail] = useState(`From ${timestampForSeconds(segment.startSeconds)}–${timestampForSeconds(segment.endSeconds)}: ${segment.text}`);
  const [taskRequestId, setTaskRequestId] = useState(() => requestId(`task-${segment.id}`));
  const [creatingGoal, setCreatingGoal] = useState(false);
  const [goalTitle, setGoalTitle] = useState(segment.text.slice(0, 180));
  const [goalDescription, setGoalDescription] = useState(`Source commitment at ${timestampForSeconds(segment.startSeconds)}–${timestampForSeconds(segment.endSeconds)}: ${segment.text}`);
  const [goalRequestId, setGoalRequestId] = useState(() => requestId(`goal-${segment.id}`));
  const [creatingNote, setCreatingNote] = useState(false);
  const [noteTitle, setNoteTitle] = useState(`Note — ${segment.text}`.slice(0, 180));
  const [noteBody, setNoteBody] = useState(segment.text);
  const [noteKind, setNoteKind] = useState<EditableSessionNoteKind>("SESSION_NOTE");
  const [noteVisibility, setNoteVisibility] = useState<SessionNoteVisibility>("AUTHOR_PRIVATE");
  const [noteRequestId, setNoteRequestId] = useState(() => requestId(`note-${segment.id}`));
  const [noteHref, setNoteHref] = useState<string | null>(null);
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [draftTitle, setDraftTitle] = useState(`Draft — ${segment.text}`.slice(0, 180));
  const [draftOpeningNote, setDraftOpeningNote] = useState("");
  const [draftRequestId, setDraftRequestId] = useState(() => requestId(`draft-${segment.id}`));
  const [draftHref, setDraftHref] = useState<string | null>(null);

  useEffect(() => {
    setCorrectedText(segment.text);
    setCorrectedSpeaker(segment.speakerLabel || "");
    setListened(false);
    setDraftTitle(`Draft — ${segment.text}`.slice(0, 180));
    setDraftOpeningNote("");
    setDraftHref(null);
    setNoteTitle(`Note — ${segment.text}`.slice(0, 180));
    setNoteBody(segment.text);
    setNoteHref(null);
  }, [segment.id, segment.text, segment.speakerLabel, segment.acceptedCorrection?.id]);

  async function save() {
    setError(null);
    const position = currentPlaybackPosition();
    try {
      const response = await fetch("/api/mobile/capture/transcripts/corrections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation: "accept-human-correction",
          roomId,
          segmentId: segment.id,
          clientRequestId: requestId(segment.id),
          expectedText: segment.providerText,
          expectedSpeakerLabel: segment.providerSpeakerLabel,
          expectedAcceptedCorrectionId: segment.acceptedCorrection?.id ?? null,
          correctedText,
          correctedSpeakerLabel: correctedSpeaker,
          reason,
          confirmedAgainstPlayback: listened,
          playbackPositionSeconds: position,
        }),
      });
      const body = await response.json() as { ok?: boolean; error?: string; idempotentReplay?: boolean };
      if (!response.ok || !body.ok) throw new Error(body.error || "The correction was not saved.");
      setEditing(false);
      setReason("");
      await onSaved(body.idempotentReplay
        ? "This reviewed correction was already saved; no duplicate was created."
        : "Reviewed correction saved. Provider words and media timing remain unchanged underneath it.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The correction was not saved.");
    }
  }

  async function confirmAsIs() {
    setError(null);
    try {
      const response = await fetch("/api/mobile/capture/transcripts/corrections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation: "confirm-segment-as-is",
          roomId,
          segmentId: segment.id,
          clientRequestId: requestId(`verify-${segment.id}`),
          expectedText: segment.providerText,
          expectedSpeakerLabel: segment.providerSpeakerLabel,
          expectedAcceptedCorrectionId: segment.acceptedCorrection?.id ?? null,
          confirmedAgainstPlayback: true,
          playbackPositionSeconds: currentPlaybackPosition(),
          reviewNote: "Confirmed as-is in the Nest transcript review desk.",
        }),
      });
      const body = await response.json() as { ok?: boolean; error?: string; idempotentReplay?: boolean };
      if (!response.ok || !body.ok) throw new Error(body.error || "The review decision was not saved.");
      await onSaved(body.idempotentReplay
        ? "This provider segment was already confirmed; no duplicate review receipt was created."
        : "Segment confirmed as heard. Quipsly preserved the provider text and added a playback-backed review receipt.");
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "The review decision was not saved.");
    }
  }

  async function createTask() {
    setError(null);
    try {
      const response = await fetch("/api/mobile/capture/transcripts/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roomId,
          segmentId: segment.id,
          clientRequestId: taskRequestId,
          expectedProviderTextSha256: segment.providerTextSha256,
          title: taskTitle,
          detail: taskDetail,
          surface: "nest-session-transcript-review",
        }),
      });
      const body = await response.json() as { ok?: boolean; error?: string; idempotentReplay?: boolean; task?: { title?: string } };
      if (!response.ok || !body.ok) throw new Error(body.error || "The task was not created.");
      setCreatingTask(false);
      setTaskRequestId(requestId(`task-${segment.id}`));
      await onSaved(body.idempotentReplay
        ? "That source-linked task was already created; no duplicate was added."
        : `Task created in Today and Work: ${body.task?.title || taskTitle}`);
    } catch (taskError) {
      setError(taskError instanceof Error ? taskError.message : "The task was not created.");
    }
  }

  async function createGoal() {
    setError(null);
    try {
      const response = await fetch("/api/mobile/capture/transcripts/goals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomId, segmentId: segment.id, clientRequestId: goalRequestId, expectedProviderTextSha256: segment.providerTextSha256, title: goalTitle, description: goalDescription, surface: "nest-session-transcript-review" }),
      });
      const body = await response.json() as { ok?: boolean; error?: string; idempotentReplay?: boolean; goal?: { title?: string } };
      if (!response.ok || !body.ok) throw new Error(body.error || "The goal was not created.");
      setCreatingGoal(false);
      setGoalRequestId(requestId(`goal-${segment.id}`));
      await onSaved(body.idempotentReplay ? "That source-linked goal was already created; no duplicate was added." : `Goal created in Work: ${body.goal?.title || goalTitle}`);
    } catch (goalError) {
      setError(goalError instanceof Error ? goalError.message : "The goal was not created.");
    }
  }

  async function createNote() {
    setError(null);
    try {
      const response = await fetch("/api/mobile/capture/transcripts/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roomId,
          segmentId: segment.id,
          clientRequestId: noteRequestId,
          expectedProviderTextSha256: segment.providerTextSha256,
          title: noteTitle,
          body: noteBody,
          kind: noteKind,
          visibility: noteVisibility,
          surface: "nest-session-transcript-review",
        }),
      });
      const body = await response.json() as {
        ok?: boolean;
        error?: string;
        idempotentReplay?: boolean;
        note?: { title?: string | null; href?: string };
      };
      if (!response.ok || !body.ok || !body.note?.href) throw new Error(body.error || "The source-linked Session note was not saved.");
      setCreatingNote(false);
      setNoteHref(body.note.href);
      setNoteRequestId(requestId(`note-${segment.id}`));
      await onSaved(body.idempotentReplay
        ? "That exact source-linked Session note was already saved; no duplicate was added."
        : `${sessionNoteKindLabel(noteKind)} saved for ${sessionNoteVisibilityLabel(noteVisibility).toLowerCase()} review. Nothing was sent.`);
    } catch (noteError) {
      setError(noteError instanceof Error ? noteError.message : "The source-linked Session note was not saved.");
    }
  }

  async function createDraft() {
    setError(null);
    try {
      const response = await fetch("/api/mobile/capture/transcripts/drafts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roomId,
          segmentId: segment.id,
          clientRequestId: draftRequestId,
          expectedProviderTextSha256: segment.providerTextSha256,
          title: draftTitle,
          openingNote: draftOpeningNote,
          surface: "nest-session-transcript-review",
        }),
      });
      const body = await response.json() as { ok?: boolean; error?: string; idempotentReplay?: boolean; document?: { title?: string; href?: string } };
      if (!response.ok || !body.ok || !body.document?.href) throw new Error(body.error || "The source-linked draft was not created.");
      setCreatingDraft(false);
      setDraftHref(body.document.href);
      setDraftRequestId(requestId(`draft-${segment.id}`));
    } catch (draftError) {
      setError(draftError instanceof Error ? draftError.message : "The source-linked draft was not created.");
    }
  }

  return (
    <li id={`transcript-segment-${encodeURIComponent(segment.id)}`} tabIndex={-1} className="scroll-mt-24 rounded-2xl border border-[#e5d5b7] bg-white p-5 shadow-sm outline-none target:border-sky-500 target:ring-4 target:ring-sky-200">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-sky-800">
            {timestampForSeconds(segment.startSeconds)}–{timestampForSeconds(segment.endSeconds)} · {segment.speakerLabel || "Unlabelled speaker"}
          </p>
          <p className="mt-2 text-sm font-semibold leading-relaxed text-[#5f4d37]">{segment.text}</p>
          {segment.words.length > 0 && (
            <details className="mt-3 rounded-xl border border-sky-100 bg-sky-50/60 p-3">
              <summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-sky-900">
                Precise word timing · {segment.words.length} anchors
              </summary>
              <p className="mt-2 text-xs font-semibold leading-relaxed text-sky-800">
                Choose a provider word to play its exact immutable timestamp. Reviewed corrections above never move these anchors.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label={`Timed words from ${timestampForSeconds(segment.startSeconds)}`}>
                {segment.words.map((word) => (
                  <button
                    key={word.id}
                    type="button"
                    onClick={() => void onPlayAt(word.startSeconds)}
                    disabled={!playbackReady || busy}
                    className="rounded-lg border border-sky-200 bg-white px-2 py-1 text-sm font-semibold text-sky-950 transition hover:border-sky-400 hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 disabled:opacity-50"
                    aria-label={`Play ${word.punctuatedWord} at ${timestampForSeconds(word.startSeconds)}`}
                    title={`${timestampForSeconds(word.startSeconds)}–${timestampForSeconds(word.endSeconds)}`}
                  >
                    {word.punctuatedWord}
                  </button>
                ))}
              </div>
            </details>
          )}
        </div>
        <button type="button" onClick={() => void onPlay()} disabled={!playbackReady || busy} className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-black uppercase tracking-wide text-sky-900 disabled:cursor-not-allowed disabled:opacity-50" aria-label={`Play transcript segment from ${timestampForSeconds(segment.startSeconds)}`}>
          <Play size={14} fill="currentColor" aria-hidden="true" /> Play from here
        </button>
      </div>

      {segment.acceptedCorrection && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-emerald-800"><ShieldCheck size={15} aria-hidden="true" />Reviewed correction · revision {segment.acceptedCorrection.revisions.length}</p>
          {segment.providerSpeakerLabel !== segment.speakerLabel && <p className="mt-2 text-sm font-bold text-emerald-950">Speaker: {segment.providerSpeakerLabel || "Unlabelled"} → {segment.speakerLabel || "Unlabelled"}</p>}
          {segment.providerText !== segment.text && <p className="mt-2 text-sm font-semibold leading-relaxed text-emerald-950">{segment.text}</p>}
          {segment.acceptedCorrection.reason && <p className="mt-2 text-xs font-bold text-emerald-800">Reason: {segment.acceptedCorrection.reason}</p>}
        </div>
      )}

      {!segment.acceptedCorrection && segment.acceptedVerification && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-emerald-800"><ShieldCheck size={15} aria-hidden="true" />Reviewed as heard · provider text confirmed</p>
          <p className="mt-2 text-sm font-semibold leading-relaxed text-emerald-950">A person played this exact timestamp and confirmed the provider words and speaker without inventing a no-op correction.</p>
        </div>
      )}

      {!segment.acceptedCorrection && segment.speakerAttribution && (
        <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-indigo-800"><ShieldCheck size={15} aria-hidden="true" />Voice identified from Session samples</p>
          <p className="mt-2 text-sm font-semibold leading-relaxed text-indigo-950">Provider {segment.providerSpeakerLabel} is displayed as {segment.speakerAttribution.attributedLabel}. This speaker identity does not claim the words in this turn were playback-reviewed.</p>
        </div>
      )}

      {segment.proposals.map((proposal) => (
        <ProposalReview
          key={proposal.id}
          roomId={roomId}
          segment={segment}
          proposal={proposal}
          playbackReady={playbackReady}
          currentPlaybackPosition={currentPlaybackPosition}
          busy={busy}
          onPlay={onPlay}
          onSaved={onSaved}
        />
      ))}

      {editing ? (
        <div className="mt-4 space-y-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
          <label className="block text-xs font-black uppercase tracking-wide text-amber-950">Correct speaker
            <input value={correctedSpeaker} onChange={(event) => setCorrectedSpeaker(event.target.value)} maxLength={160} className="mt-1 block w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-[#3d3122]" />
          </label>
          <label className="block text-xs font-black uppercase tracking-wide text-amber-950">Correct words
            <textarea value={correctedText} onChange={(event) => setCorrectedText(event.target.value)} maxLength={10000} rows={4} className="mt-1 block w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-semibold leading-relaxed text-[#3d3122]" />
          </label>
          <label className="block text-xs font-black uppercase tracking-wide text-amber-950">Why this changed <span className="normal-case tracking-normal text-amber-800">(optional)</span>
            <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} placeholder="Name, wording, crosstalk, diarization…" className="mt-1 block w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-[#3d3122]" />
          </label>
          <label className="flex items-start gap-3 rounded-lg border border-amber-200 bg-white p-3 text-sm font-bold leading-relaxed text-amber-950">
            <input type="checkbox" checked={listened} onChange={(event) => setListened(event.target.checked)} className="mt-1 size-4 accent-amber-800" />
            <span>I listened to this exact timestamp and these words match the protected recording.</span>
          </label>
          {error && <p role="alert" className="flex items-start gap-2 text-sm font-bold text-rose-800"><CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void save()} disabled={busy || !listened || !playbackReady || (!correctedText.trim() && !correctedSpeaker.trim())} className="inline-flex items-center gap-2 rounded-full bg-[#3e2f21] px-4 py-2 text-xs font-black uppercase tracking-wide text-white disabled:opacity-50"><Check size={14} aria-hidden="true" />Accept reviewed correction</button>
            <button type="button" onClick={() => { setEditing(false); setError(null); }} disabled={busy} className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-amber-950 disabled:opacity-50"><X size={14} aria-hidden="true" />Cancel</button>
          </div>
          <p className="text-xs font-bold leading-relaxed text-amber-800">Saving adds a reviewed overlay and audit revision. It does not overwrite provider output, move timestamps, create tasks, send notes, or publish anything.</p>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {!segment.acceptedCorrection && !segment.acceptedVerification && (
            <button type="button" onClick={() => void confirmAsIs()} disabled={!playbackReady || busy} className="inline-flex items-center gap-2 rounded-full bg-emerald-800 px-4 py-2 text-xs font-black uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-50"><ShieldCheck size={15} aria-hidden="true" />Confirm correct as heard</button>
          )}
          <button type="button" onClick={() => setEditing(true)} disabled={!playbackReady || busy} className="inline-flex items-center gap-2 rounded-full border border-[#d9c7a5] bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-[#5b472f] disabled:cursor-not-allowed disabled:opacity-50"><FilePenLine size={15} aria-hidden="true" />{segment.acceptedCorrection ? "Revise reviewed correction" : "Correct against playback"}</button>
          {segment.correctionHistory.length > 0 && <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#8a7354]"><History size={14} aria-hidden="true" />{segment.correctionHistory.length} correction record(s) preserved</span>}
        </div>
      )}

      <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50/60 p-4">
        {error && !editing && <p role="alert" className="mb-3 flex items-start gap-2 text-sm font-bold text-rose-800"><CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />{error}</p>}
        {noteHref ? (
          <div>
            <p className="flex items-center gap-2 text-sm font-black text-orange-950"><NotebookPen size={16} aria-hidden="true" />Canonical source-linked note saved.</p>
            <Link href={noteHref} className="mt-3 inline-flex min-h-11 items-center rounded-full bg-orange-800 px-4 py-2 text-xs font-black uppercase tracking-wide text-white">Open Session notes</Link>
            <p className="mt-2 text-xs font-bold leading-relaxed text-orange-800">The note keeps this exact timestamp, transcript job, provider hash, reviewed text, correction identity, and recording asset. Its audience can be revised later without losing the source or revision history.</p>
          </div>
        ) : creatingNote ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-orange-900"><NotebookPen size={15} aria-hidden="true" />Deliberate Session note · source linked</p>
            <label className="block text-xs font-black uppercase tracking-wide text-orange-950">Note title <span className="normal-case tracking-normal text-orange-700">(optional)</span>
              <input value={noteTitle} onChange={(event) => setNoteTitle(event.target.value)} maxLength={500} className="mt-1 block w-full rounded-lg border border-orange-200 bg-white px-3 py-2 text-sm font-semibold text-[#3d3122]" />
            </label>
            <label className="block text-xs font-black uppercase tracking-wide text-orange-950">Note
              <textarea value={noteBody} onChange={(event) => setNoteBody(event.target.value)} maxLength={20000} rows={4} className="mt-1 block w-full rounded-lg border border-orange-200 bg-white px-3 py-2 text-sm font-semibold leading-relaxed text-[#3d3122]" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-black uppercase tracking-wide text-orange-950">Purpose
                <select value={noteKind} onChange={(event) => setNoteKind(event.target.value as EditableSessionNoteKind)} className="mt-1 block min-h-11 w-full rounded-lg border border-orange-200 bg-white px-3 py-2 text-sm font-semibold text-[#3d3122]">
                  {EDITABLE_SESSION_NOTE_KINDS
                    .filter((kind) => kind !== "PRODUCTION" || canUseProjectTeamNotes)
                    .map((kind) => <option key={kind} value={kind}>{sessionNoteKindLabel(kind)}</option>)}
                </select>
              </label>
              <label className="block text-xs font-black uppercase tracking-wide text-orange-950">Audience
                <select value={noteVisibility} onChange={(event) => setNoteVisibility(event.target.value as SessionNoteVisibility)} className="mt-1 block min-h-11 w-full rounded-lg border border-orange-200 bg-white px-3 py-2 text-sm font-semibold text-[#3d3122]">
                  {SESSION_NOTE_VISIBILITIES
                    .filter((visibility) => visibility !== "PROJECT_TEAM" || canUseProjectTeamNotes)
                    .map((visibility) => <option key={visibility} value={visibility}>{sessionNoteVisibilityLabel(visibility)}</option>)}
                </select>
              </label>
            </div>
            <p className="rounded-lg border border-orange-200 bg-white p-3 text-xs font-bold leading-relaxed text-orange-900">
              {noteVisibility === "AUTHOR_PRIVATE" && "Only your account can read it—even staff do not get an override."}
              {noteVisibility === "SESSION_SHARED" && "People who can access this Session can read it. Nothing is messaged or delivered."}
              {noteVisibility === "CLIENT_SAFE" && "Eligible for a reviewed client follow-up. It is not sent automatically."}
              {noteVisibility === "PROJECT_TEAM" && "Visible to Nest owners and editors; owner/editor authority is required. It is not public."}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void createNote()} disabled={busy || !playbackReady || !noteBody.trim()} className="inline-flex items-center gap-2 rounded-full bg-orange-800 px-4 py-2 text-xs font-black uppercase tracking-wide text-white disabled:opacity-50"><Check size={14} aria-hidden="true" />Save source-linked note</button>
              <button type="button" onClick={() => setCreatingNote(false)} disabled={busy} className="inline-flex items-center gap-2 rounded-full border border-orange-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-orange-950 disabled:opacity-50"><X size={14} aria-hidden="true" />Cancel</button>
            </div>
            <p className="text-xs font-bold leading-relaxed text-orange-800">Creates one revisioned canonical Session note. It does not correct the transcript, create a task or goal, send a message, add a calendar event, deliver a follow-up, or publish.</p>
          </div>
        ) : (
          <button type="button" onClick={() => setCreatingNote(true)} disabled={busy || !playbackReady} className="inline-flex items-center gap-2 rounded-full border border-orange-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-orange-900 disabled:opacity-50"><NotebookPen size={15} aria-hidden="true" />Save as Session note</button>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/60 p-4">
        {creatingTask ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-blue-900"><ListTodo size={15} aria-hidden="true" />Explicit task · source linked</p>
            <label className="block text-xs font-black uppercase tracking-wide text-blue-950">Task title
              <input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} maxLength={240} className="mt-1 block w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-[#3d3122]" />
            </label>
            <label className="block text-xs font-black uppercase tracking-wide text-blue-950">Useful detail <span className="normal-case tracking-normal text-blue-700">(optional)</span>
              <textarea value={taskDetail} onChange={(event) => setTaskDetail(event.target.value)} maxLength={2000} rows={3} className="mt-1 block w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold leading-relaxed text-[#3d3122]" />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void createTask()} disabled={busy || !playbackReady || !taskTitle.trim()} className="inline-flex items-center gap-2 rounded-full bg-blue-800 px-4 py-2 text-xs font-black uppercase tracking-wide text-white disabled:opacity-50"><Check size={14} aria-hidden="true" />Create my task</button>
              <button type="button" onClick={() => setCreatingTask(false)} disabled={busy} className="inline-flex items-center gap-2 rounded-full border border-blue-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-blue-950 disabled:opacity-50"><X size={14} aria-hidden="true" />Cancel</button>
            </div>
            <p className="text-xs font-bold leading-relaxed text-blue-800">Creates one OPEN task assigned to you with this room, timestamp, speaker, provider hash, reviewed overlay, and recording asset. It creates no deadline, reminder, calendar event, message, or publication.</p>
          </div>
        ) : (
          <button type="button" onClick={() => setCreatingTask(true)} disabled={busy || !playbackReady} className="inline-flex items-center gap-2 rounded-full border border-blue-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-blue-900 disabled:opacity-50"><ListTodo size={15} aria-hidden="true" />Make this my task</button>
        )}
      </div>
      <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50/60 p-4">
        {creatingGoal ? <div className="space-y-3"><p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-violet-900"><Target size={15} aria-hidden="true" />Explicit goal · source linked</p><label className="block text-xs font-black uppercase tracking-wide text-violet-950">Goal title<input value={goalTitle} onChange={(event) => setGoalTitle(event.target.value)} maxLength={240} className="mt-1 block w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm font-semibold text-[#3d3122]" /></label><label className="block text-xs font-black uppercase tracking-wide text-violet-950">Definition of progress <span className="normal-case tracking-normal text-violet-700">(optional)</span><textarea value={goalDescription} onChange={(event) => setGoalDescription(event.target.value)} maxLength={5000} rows={3} className="mt-1 block w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm font-semibold leading-relaxed text-[#3d3122]" /></label><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void createGoal()} disabled={busy || !playbackReady || !goalTitle.trim()} className="inline-flex items-center gap-2 rounded-full bg-violet-800 px-4 py-2 text-xs font-black uppercase tracking-wide text-white disabled:opacity-50"><Check size={14} aria-hidden="true" />Create my goal</button><button type="button" onClick={() => setCreatingGoal(false)} disabled={busy} className="inline-flex items-center gap-2 rounded-full border border-violet-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-violet-950 disabled:opacity-50"><X size={14} aria-hidden="true" />Cancel</button></div><p className="text-xs font-bold leading-relaxed text-violet-800">Creates one ACTIVE goal owned by you with this exact transcript and recording source. It creates no task, target date, reminder, calendar event, message, or publication.</p></div> : <button type="button" onClick={() => setCreatingGoal(true)} disabled={busy || !playbackReady} className="inline-flex items-center gap-2 rounded-full border border-violet-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-violet-900 disabled:opacity-50"><Target size={15} aria-hidden="true" />Make this my goal</button>}
      </div>
      <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
        {draftHref ? <div><p className="text-sm font-black text-emerald-950">Private source-linked draft created.</p><Link href={draftHref} className="mt-3 inline-flex min-h-11 items-center rounded-full bg-emerald-800 px-4 py-2 text-xs font-black uppercase tracking-wide text-white">Open source-linked draft</Link><p className="mt-2 text-xs font-bold leading-relaxed text-emerald-800">The page carries this exact timestamp, transcript job, recording asset, provider hash, and reviewed text snapshot. The source recording and transcript remain unchanged.</p></div> : creatingDraft ? <div className="space-y-3"><p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-emerald-900"><FilePenLine size={15} aria-hidden="true" />Private writing page · source linked</p><label className="block text-xs font-black uppercase tracking-wide text-emerald-950">Page title<input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} maxLength={180} className="mt-1 block w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-[#3d3122]" /></label><label className="block text-xs font-black uppercase tracking-wide text-emerald-950">Starting thought <span className="normal-case tracking-normal text-emerald-700">(optional)</span><textarea value={draftOpeningNote} onChange={(event) => setDraftOpeningNote(event.target.value)} maxLength={10000} rows={4} placeholder="Write the first honest response; Quipsly keeps the source moment beside it." className="mt-1 block w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold leading-relaxed text-[#3d3122]" /></label><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void createDraft()} disabled={busy || !playbackReady || !draftTitle.trim()} className="inline-flex items-center gap-2 rounded-full bg-emerald-800 px-4 py-2 text-xs font-black uppercase tracking-wide text-white disabled:opacity-50"><Check size={14} aria-hidden="true" />Create source-linked draft</button><button type="button" onClick={() => setCreatingDraft(false)} disabled={busy} className="inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-emerald-950 disabled:opacity-50"><X size={14} aria-hidden="true" />Cancel</button></div><p className="text-xs font-bold leading-relaxed text-emerald-800">Creates one private Nest writing page with an immutable transcript-evidence block and a separate editable draft block. It does not correct the transcript, create a task or goal, send anything, or publish.</p></div> : <button type="button" onClick={() => setCreatingDraft(true)} disabled={busy || !playbackReady} className="inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-emerald-900 disabled:opacity-50"><FilePenLine size={15} aria-hidden="true" />Start source-linked draft</button>}
      </div>
    </li>
  );
}

export function TranscriptCorrectionDesk({
  roomId,
  canUseProjectTeamNotes = false,
}: {
  roomId: string;
  canUseProjectTeamNotes?: boolean;
}) {
  const [desk, setDesk] = useState<Desk | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [preparingPlayback, setPreparingPlayback] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [listenedSecondBins, setListenedSecondBins] = useState<Set<number>>(() => new Set());
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const lastPlaybackTimeRef = useRef<number | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch(`/api/mobile/capture/transcripts/corrections?callRoomId=${encodeURIComponent(roomId)}`, { cache: "no-store" });
      const payload = await response.json() as Desk;
      if (!response.ok || !payload.ok) throw new Error(payload.error || "The correction desk could not load.");
      setDesk(payload);
    } catch (error) {
      if (!silent) setDesk(null);
      setMessage(error instanceof Error ? error.message : "The correction desk could not load.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [roomId]);

  useEffect(() => { void load(false); }, [load]);

  useEffect(() => {
    setListenedSecondBins(new Set());
    lastPlaybackTimeRef.current = null;
  }, [desk?.playback?.sourceId]);

  useEffect(() => {
    if (!["QUEUED", "RUNNING"].includes(desk?.transcriptStatus || "")) return;
    const interval = window.setInterval(() => void load(true), 5_000);
    return () => window.clearInterval(interval);
  }, [desk?.transcriptStatus, load]);

  useEffect(() => {
    if (!desk || typeof window === "undefined" || !window.location.hash.startsWith("#transcript-segment-")) return;
    const targetId = window.location.hash.slice(1);
    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(targetId);
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [desk]);

  async function playFromTime(seconds: number) {
    const media = mediaRef.current;
    if (!media) return;
    media.currentTime = seconds;
    try {
      await media.play();
      setMessage(`Playing source evidence from ${timestampForSeconds(seconds)}.`);
    } catch {
      setMessage("Playback needs your direct interaction. Press play in the recording controls, then try this timestamp again.");
    }
  }

  async function playFrom(segment: Segment) {
    return playFromTime(segment.startSeconds);
  }

  function observePlayback(media: HTMLMediaElement, ended = false) {
    if (!ended && (media.paused || media.seeking)) return;
    const duration = Number.isFinite(media.duration) ? media.duration : desk?.playback?.durationSeconds;
    if (!duration || duration <= 0) return;
    const currentTime = ended ? duration - 0.001 : media.currentTime;
    const second = Math.max(0, Math.min(Math.ceil(duration) - 1, Math.floor(currentTime)));
    const previousTime = lastPlaybackTimeRef.current;
    const contiguous = previousTime !== null && currentTime >= previousTime && currentTime - previousTime <= 1.5;
    const firstSecond = contiguous ? Math.floor(previousTime) : second;
    lastPlaybackTimeRef.current = currentTime;
    setListenedSecondBins((current) => {
      const next = new Set(current);
      for (let bin = firstSecond; bin <= second; bin += 1) next.add(bin);
      return next.size === current.size ? current : next;
    });
  }

  async function saved(nextMessage: string) {
    setBusy(true);
    setMessage(nextMessage);
    await load();
    setBusy(false);
  }

  async function prepareProtectedPlayback() {
    const recordingAssetId = desk?.recording?.id;
    if (!recordingAssetId) return;
    setPreparingPlayback(true);
    setMessage(null);
    try {
      const response = await fetch("/api/mobile/capture/recordings/promote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recordingAssetId }),
      });
      const payload = await response.json() as {
        ok?: boolean;
        error?: string;
        message?: string;
        playbackUrl?: string;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || payload.message || "Protected playback could not be prepared.");
      }
      setMessage(payload.message || "Protected playback is ready from the verified recording source.");
      await load(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Protected playback could not be prepared.");
    } finally {
      setPreparingPlayback(false);
    }
  }

  if (loading) return <section className="rounded-2xl border border-[#e5d5b7] bg-white p-8 text-sm font-bold text-[#765f40]"><LoaderCircle className="mr-2 inline animate-spin" size={18} aria-hidden="true" />Loading protected playback and correction history…</section>;
  if (!desk) return <section className="rounded-2xl border border-rose-200 bg-rose-50 p-6" role="status"><CircleAlert className="text-rose-700" aria-hidden="true" /><h2 className="mt-3 font-serif text-2xl font-black text-[#3d3122]">Transcript correction is unavailable.</h2><p className="mt-2 text-sm font-semibold text-[#765f40]">{message || "No transcript text is substituted and no evidence was changed."}</p><button type="button" onClick={() => void load()} className="mt-4 inline-flex items-center gap-2 rounded-full border border-rose-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-rose-900"><RefreshCw size={14} aria-hidden="true" />Retry</button></section>;

  const reviewedSegmentCount = desk.segments.filter((segment) => segment.acceptedCorrection || segment.acceptedVerification).length;

  return (
    <section aria-labelledby="transcript-correction-heading" className="space-y-5">
      <div className="rounded-2xl border border-[#e5d5b7] bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#987443]">Playback-verified evidence</p>
            <h2 id="transcript-correction-heading" className="mt-2 font-serif text-3xl font-black text-[#3d3122]">Listen, correct, preserve the source</h2>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-[#765f40]">Corrections sit above provider output as reviewable revisions. Media timing never moves, and AI proposals never become transcript truth without a person listening here.</p>
            {desk.segments.length > 0 && <p className="mt-3 text-sm font-black text-emerald-800">{reviewedSegmentCount} of {desk.segments.length} segments playback-reviewed</p>}
          </div>
          <button type="button" onClick={() => void load(false)} disabled={loading || busy} className="inline-flex items-center gap-2 rounded-full border border-[#d9c7a5] bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-[#5b472f] disabled:opacity-50"><RefreshCw size={15} aria-hidden="true" />Refresh truth</button>
        </div>
        {message && <p role="status" className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-bold text-sky-900">{message}</p>}
        {desk.processing && (
          <div className="mt-5 grid gap-3 rounded-xl border border-[#e5d5b7] bg-[#fffaf1] p-4 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#987443]">
                {desk.transcriptStatus === "COMPLETED"
                  ? `${desk.processing.wordCount} timed words ready`
                  : desk.transcriptStatus === "RUNNING"
                    ? "Transcribing safely in the background"
                    : `Transcript ${humanize(desk.transcriptStatus || "not started")}`}
              </p>
              <p className="mt-1 text-sm font-semibold leading-relaxed text-[#5f4d37]">
                {desk.processing.message
                  || (desk.transcriptStatus === "RUNNING"
                    ? "You can leave this page. Quipsly keeps the exact recording generation, retries transient provider failures, and will refresh this desk when word evidence lands."
                    : "The provider response, source binding, and worker receipt stay attached to this transcript version.")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-[0.68rem] font-black uppercase tracking-wide">
              <span className={`rounded-full px-3 py-1.5 ${desk.processing.sourceBound ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>source bound</span>
              <span className={`rounded-full px-3 py-1.5 ${desk.processing.providerReceiptReceived ? "bg-emerald-100 text-emerald-900" : "bg-stone-200 text-stone-700"}`}>provider receipt</span>
            </div>
          </div>
        )}
        {!desk.gate.allowed ? (
          <p className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-900">{desk.gate.error || "Transcript evidence remains held by consent and release policy."}</p>
        ) : desk.playback ? (
          <div className="mt-5 rounded-xl border border-sky-200 bg-sky-50/60 p-4">
            <p className="mb-3 text-xs font-black uppercase tracking-wide text-sky-900">Protected source · {desk.playback.label}</p>
            {desk.playback.kind === "video"
              ? <video ref={(node) => { mediaRef.current = node; }} src={desk.playback.url} controls preload="metadata" onPlay={(event) => { lastPlaybackTimeRef.current = event.currentTarget.currentTime; }} onPause={() => { lastPlaybackTimeRef.current = null; }} onSeeking={() => { lastPlaybackTimeRef.current = null; }} onTimeUpdate={(event) => observePlayback(event.currentTarget)} onEnded={(event) => observePlayback(event.currentTarget, true)} className="max-h-[420px] w-full rounded-lg bg-black" aria-label="Protected session recording" />
              : <audio ref={(node) => { mediaRef.current = node; }} src={desk.playback.url} controls preload="metadata" onPlay={(event) => { lastPlaybackTimeRef.current = event.currentTarget.currentTime; }} onPause={() => { lastPlaybackTimeRef.current = null; }} onSeeking={() => { lastPlaybackTimeRef.current = null; }} onTimeUpdate={(event) => observePlayback(event.currentTarget)} onEnded={(event) => observePlayback(event.currentTarget, true)} className="w-full" aria-label="Protected session recording" />}
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-relaxed text-amber-950">
            <p>The transcript is readable, but accepted correction is disabled until the verified recording is prepared as protected Quipsly playback. This prevents “I listened” from becoming a paperwork checkbox with no playable source.</p>
            {desk.recording?.eligibleForProtectedPlaybackPreparation ? (
              <div className="mt-4">
                <button type="button" onClick={() => void prepareProtectedPlayback()} disabled={preparingPlayback || busy} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-amber-900 px-4 py-2 text-xs font-black uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-50">
                  {preparingPlayback ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> : <ShieldCheck size={15} aria-hidden="true" />}
                  {preparingPlayback ? "Preparing protected playback…" : "Prepare protected playback"}
                </button>
                <p className="mt-2 text-xs font-semibold leading-relaxed text-amber-900">Registers the existing verified source behind Quipsly’s access and release checks. It does not copy or alter the recording, rerun transcription, create work, send anything, or publish.</p>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {desk.evidence ? <AudioTranscriptEvidencePanel
          evidence={desk.evidence}
          playbackReady={Boolean(desk.playback)}
          onPlayAt={playFromTime}
        /> : null}

      {desk.evaluation ? <TranscriptAccuracyCorpusPanel
        roomId={roomId}
        evaluation={desk.evaluation}
        busy={busy}
        listenedSecondBins={[...listenedSecondBins].sort((left, right) => left - right)}
        playbackSourceId={desk.playback?.sourceId ?? null}
        onSaved={saved}
      /> : null}

      {desk.gate.allowed && (
        <SpeakerAttributionPanel
          roomId={roomId}
          groups={desk.speakerGroups ?? []}
          participants={desk.participants ?? []}
          playbackReady={Boolean(desk.playback)}
          currentPlaybackPosition={() => mediaRef.current?.currentTime ?? null}
          busy={busy}
          onPlayAt={playFromTime}
          onSaved={saved}
        />
      )}

      {desk.gate.allowed && (desk.segments.length ? (
        <ol className="space-y-4">
          {desk.segments.map((segment) => (
            <CorrectionEditor
              key={segment.id}
              roomId={roomId}
              segment={segment}
              canUseProjectTeamNotes={canUseProjectTeamNotes}
              playbackReady={Boolean(desk.playback)}
              currentPlaybackPosition={() => mediaRef.current?.currentTime ?? null}
              busy={busy}
              onPlay={() => playFrom(segment)}
              onPlayAt={playFromTime}
              onSaved={saved}
            />
          ))}
        </ol>
      ) : <div className="rounded-2xl border border-dashed border-[#d8c7a7] bg-white/55 p-5 text-sm font-semibold text-[#7a6548]">No persisted transcript segments are available for this session.</div>)}
    </section>
  );
}
