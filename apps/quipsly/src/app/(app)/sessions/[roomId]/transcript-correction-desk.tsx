"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AudioLines, Check, CircleAlert, Download, FilePenLine, Gauge, History, ListTodo, LoaderCircle, NotebookPen, Play, RefreshCw, Scissors, ShieldCheck, Share2, Sparkles, Target, TriangleAlert, X } from "lucide-react";

import { AudioEvidenceMap, type AudioEvidenceTranscriptWord } from "@/components/audio/AudioEvidenceMap";
import { AudibleEventQualificationLab } from "@/components/audio/AudibleEventQualificationLab";
import { SpectralEvidenceViewer } from "@/components/audio/SpectralEvidenceViewer";
import type { SpectralEvidenceMarker } from "@/components/audio/spectral-evidence-overlay";
import { TranscriptSpeakerEvidenceBadge } from "@/components/transcript-speaker-evidence-badge";
import type { AudioTranscriptEvidence } from "@/lib/transcript-evidence";
import type { TranscriptSourceSpeakerAuthority } from "@high-ground/quipsly-domain/transcript-derived-task";
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
  speakerAuthority?: TranscriptSourceSpeakerAuthority | null;
  sourceBoundParticipantId?: string | null;
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
  downstreamImpacts?: Array<{
    artifactId: string;
    artifactKind: "note" | "task" | "goal" | "follow-up";
    label: string;
    status: string | null;
    href: string;
    artifactUpdatedAt: string;
    canAcknowledge: boolean;
    state: "current" | "needs-review" | "snapshot-unavailable";
    evidenceSnapshotCount: number;
    priorTextSnapshot: string | null;
    currentTextSnapshot: string;
    priorSpeakerLabelSnapshot: string | null;
    currentSpeakerLabel: string | null;
    evidenceCorrectionId: string | null;
    currentCorrectionId: string | null;
    changes: {
      text: "changed" | "unchanged" | "unknown";
      speaker: "changed" | "unchanged" | "unknown";
      correctionReceipt: "changed" | "unchanged" | "unknown";
    };
  }>;
};

type TranscriptExportSegment = Pick<
  Segment,
  | "speakerLabel"
  | "startSeconds"
  | "endSeconds"
  | "text"
  | "acceptedCorrection"
  | "acceptedVerification"
>;

export type RecordingEditorFocus = {
  transcriptJobId: string;
  segmentId: string;
};

export function reviewedTranscriptFileName(title: string, transcriptJobId: string) {
  const slug = title
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 80) || "quipsly-session";
  return `${slug}-transcript-${transcriptJobId.slice(0, 10)}.txt`;
}

export function reviewedTranscriptText(input: {
  title: string;
  transcriptJobId: string;
  segments: TranscriptExportSegment[];
}) {
  const reviewed = input.segments.filter(
    (segment) => segment.acceptedCorrection || segment.acceptedVerification,
  ).length;
  const lines = [
    input.title.trim() || "Quipsly Session transcript",
    `Transcript job: ${input.transcriptJobId}`,
    `Playback-reviewed turns: ${reviewed}/${input.segments.length}`,
    "",
  ];
  for (const segment of input.segments) {
    const status = segment.acceptedCorrection || segment.acceptedVerification
      ? "playback-reviewed"
      : "provider-only";
    lines.push(
      `[${timestampForSeconds(segment.startSeconds)}-${timestampForSeconds(segment.endSeconds)}] ${segment.speakerLabel || "Speaker not attributed"} (${status})`,
      segment.text.trim(),
      "",
    );
  }
  lines.push(
    "---",
    "This file uses Quipsly's effective transcript overlay. Provider evidence remains immutable; corrections and speaker attribution remain separately reviewable.",
    "",
  );
  return lines.join("\n");
}

type Desk = {
  ok: boolean;
  error?: string;
  roomId: string;
  roomPurpose?: string | null;
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
    routing: null | {
      sourceTopology: string;
      participantLabel: string | null;
      speakerAuthority: string;
      provider: string | null;
      model: string | null;
      modelRevisionPolicy: string | null;
      language: string | null;
      diarizationRequested: boolean;
      timingGranularity: string | null;
      terminologySnapshotSha256: string | null;
      terminologyKeytermCount: number;
      manifestBacked: boolean;
      providerOutputRemainsImmutable: boolean;
    };
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
  spectralContext?: null | {
    projectSlug: string;
    assetId: string;
    sourceId: string;
  };
  participants: SessionParticipant[];
  speakerGroups: SpeakerGroup[];
  segments: Segment[];
  evidence?: AudioTranscriptEvidence;
  impactCoverage?: {
    schema: string;
    kinds: Array<"note" | "task" | "goal" | "follow-up">;
    source: "canonical-provenance-projection";
    automaticRegeneration: false;
  };
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
    criticalTermCount?: number;
    criticalTermOccurrenceCount?: number;
    terminologyPromptTermCount?: number;
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
      criticalTermCount?: number;
      criticalTermOccurrenceCount?: number;
      terminologyPromptTermCount?: number;
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
    terminology?: {
      conceptRecall?: number | null;
      conceptPrecision?: number | null;
      preferredSpellingRate?: number | null;
      referenceOccurrenceCount?: number;
      falsePositiveMentionCount?: number;
    } | null;
  };
  terminologyExperiment?: null | {
    comparisonKey: string;
    arm: "baseline" | "project-terminology";
    termsSha256: string;
    baseConfigSha256: string | null;
    appliedTermCount: number | null;
  };
  errorCode: string | null;
  retryable: boolean | null;
  policyReceiptSha256: string;
  correctionObservationCount: number;
  completedAt: string;
};

type EvaluationRun = {
  id: string;
  runKey: string;
  providerName: string;
  model: string;
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";
  attemptCount: number;
  maxAttempts: number;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  windows: Array<{
    id: string;
    windowId: string;
    status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
    baselineCandidateId: string | null;
    terminologyCandidateId: string | null;
    derivativeSha256: string | null;
  }>;
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

export function transcriptWordsForAudioEvidence(segments: Segment[]): AudioEvidenceTranscriptWord[] {
  return segments.flatMap((segment) => segment.words.flatMap((word) => {
    if (!Number.isFinite(word.startSeconds) || !Number.isFinite(word.endSeconds) || word.startSeconds < 0 || word.endSeconds < word.startSeconds) return [];
    return [{
      id: word.id,
      segmentId: segment.id,
      text: word.punctuatedWord || word.word,
      startSeconds: word.startSeconds,
      endSeconds: word.endSeconds,
      confidence: word.confidence,
      reviewState: segment.acceptedCorrection ? "corrected" as const : segment.acceptedVerification ? "confirmed" as const : "unchecked" as const,
    }];
  })).sort((left, right) => left.startSeconds - right.startSeconds || left.endSeconds - right.endSeconds || left.id.localeCompare(right.id));
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
  const [runs, setRuns] = useState<EvaluationRun[]>([]);
  const [runBusy, setRunBusy] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
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

  const loadRuns = useCallback(async () => {
    if (!evaluation.approvedWindows.length) {
      setRuns([]);
      return;
    }
    setRunError(null);
    try {
      const response = await fetch(`/api/transcript-evaluation?roomId=${encodeURIComponent(roomId)}&view=runs`, { cache: "no-store" });
      const payload = await response.json() as { ok?: boolean; error?: string; runs?: EvaluationRun[] };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Evaluation runs could not be loaded.");
      setRuns(payload.runs ?? []);
    } catch (caught) {
      setRunError(caught instanceof Error ? caught.message : "Evaluation runs could not be loaded.");
    }
  }, [evaluation.approvedWindows.length, roomId]);

  useEffect(() => { void loadRuns(); }, [loadRuns]);

  const hasActiveRun = runs.some((run) => run.status === "QUEUED" || run.status === "PROCESSING");
  useEffect(() => {
    if (!hasActiveRun) return;
    const timer = window.setInterval(() => { void loadRuns(); }, 5_000);
    return () => window.clearInterval(timer);
  }, [hasActiveRun, loadRuns]);

  async function queueRun() {
    const windowIds = evaluation.approvedWindows
      .filter((window) => !window.staleAgainstCurrentReview && (window.criticalTermOccurrenceCount ?? 0) > 0)
      .map((window) => window.id);
    setRunBusy(true);
    setRunError(null);
    try {
      const response = await fetch("/api/transcript-evaluation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation: "queue-terminology-run",
          roomId,
          requestId: crypto.randomUUID(),
          windowIds,
          model: "large-v3-turbo",
          language: "en",
        }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "The matched experiment could not be queued.");
      await loadRuns();
    } catch (caught) {
      setRunError(caught instanceof Error ? caught.message : "The matched experiment could not be queued.");
    } finally {
      setRunBusy(false);
    }
  }

  async function retryRun(runId: string) {
    setRunBusy(true);
    setRunError(null);
    try {
      const response = await fetch("/api/transcript-evaluation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation: "retry-run", runId }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "The failed run could not be requeued.");
      await loadRuns();
    } catch (caught) {
      setRunError(caught instanceof Error ? caught.message : "The failed run could not be requeued.");
    } finally {
      setRunBusy(false);
    }
  }

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

    <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <div className="rounded-xl border border-indigo-100 bg-white p-3"><dt className="text-[10px] font-black uppercase tracking-wide text-indigo-700">Reviewed segments</dt><dd className="mt-1 text-xl font-black text-[#3d3122]">{reviewed}/{total}</dd></div>
      <div className="rounded-xl border border-indigo-100 bg-white p-3"><dt className="text-[10px] font-black uppercase tracking-wide text-indigo-700">Reference words</dt><dd className="mt-1 text-xl font-black text-[#3d3122]">{(evaluation.referenceWordCount ?? 0).toLocaleString()}</dd></div>
      <div className="rounded-xl border border-indigo-100 bg-white p-3"><dt className="text-[10px] font-black uppercase tracking-wide text-indigo-700">Reviewed timed words</dt><dd className="mt-1 text-xl font-black text-[#3d3122]">{(evaluation.timingEvidenceWordCount ?? 0).toLocaleString()}</dd></div>
      <div className="rounded-xl border border-indigo-100 bg-white p-3"><dt className="text-[10px] font-black uppercase tracking-wide text-indigo-700">Speaker-reviewed</dt><dd className="mt-1 text-xl font-black text-[#3d3122]">{(evaluation.speakerReviewedWordCount ?? 0).toLocaleString()}</dd></div>
      <div className="rounded-xl border border-violet-100 bg-violet-50 p-3"><dt className="text-[10px] font-black uppercase tracking-wide text-violet-700">Suggested-window terms</dt><dd className="mt-1 text-xl font-black text-[#3d3122]">{(evaluation.criticalTermOccurrenceCount ?? 0).toLocaleString()}</dd><p className="mt-1 text-[10px] font-bold text-violet-700">{evaluation.criticalTermCount ?? 0} distinct · {evaluation.terminologyPromptTermCount ?? 0} project terms available</p></div>
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
    {evaluation.approvedWindows.length > 0 ? <div className="mt-5"><p className="text-xs font-black uppercase tracking-wide text-indigo-900">Frozen evaluation windows</p><ul className="mt-2 space-y-2">{evaluation.approvedWindows.map((window) => <li key={window.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-100 bg-white p-3 text-xs font-bold text-[#5f4d37]"><span>{humanize(window.workload)} · {window.referenceWordCount} words · {window.criticalTermOccurrenceCount ?? 0} critical-term mentions · {window.conditions.map(humanize).join(", ")}</span><span className={window.staleAgainstCurrentReview ? "text-amber-800" : "text-emerald-800"}>{window.staleAgainstCurrentReview ? "Prior reviewed revision" : "Matches current review"}</span></li>)}</ul></div> : null}
    {evaluation.approvedWindows.length > 0 ? <div className="mt-5 rounded-xl border border-violet-200 bg-violet-50/60 p-4" aria-label="Matched terminology experiment queue">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl"><p className="text-xs font-black uppercase tracking-wide text-violet-900">Matched experiment queue</p><p className="mt-1 text-xs font-semibold leading-5 text-violet-950">Queue baseline and project-terminology attempts against the same exact derivative. Nest retains intent, progress, attempts, and results; the local worker retains the Whisper runtime and private raw receipts.</p></div>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void loadRuns()} disabled={runBusy} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-violet-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-violet-950 disabled:opacity-50"><RefreshCw size={14} aria-hidden="true" />Refresh</button><button type="button" onClick={() => void queueRun()} disabled={runBusy || !evaluation.approvedWindows.some((window) => !window.staleAgainstCurrentReview && (window.criticalTermOccurrenceCount ?? 0) > 0)} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-violet-800 px-4 py-2 text-xs font-black uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-50">{runBusy ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> : <Gauge size={14} aria-hidden="true" />}Queue matched local run</button></div>
      </div>
      <p className="mt-3 rounded-lg border border-violet-100 bg-white p-3 text-xs font-bold leading-5 text-violet-900"><strong>Queued is not running.</strong> Start the authenticated evaluation worker on an approved machine. Provider credentials never enter Nest, this action does not change production routing, and completion never rewrites the transcript.</p>
      {runError ? <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-900">{runError}</p> : null}
      {runs.length ? <ul className="mt-3 space-y-2" aria-live="polite">{runs.map((run) => <li key={run.id} className="rounded-xl border border-violet-100 bg-white p-3">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-black text-[#3d3122]">{run.providerName} · {run.model}</p><p className="mt-1 text-[10px] font-bold text-[#765f40]">{run.windows.length} window{run.windows.length === 1 ? "" : "s"} · attempt {run.attemptCount}/{run.maxAttempts} · {run.runKey}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${run.status === "COMPLETED" ? "bg-emerald-100 text-emerald-900" : run.status === "FAILED" ? "bg-rose-100 text-rose-900" : run.status === "PROCESSING" ? "bg-sky-100 text-sky-900" : "bg-amber-100 text-amber-900"}`}>{humanize(run.status)}</span></div>
        <p className="mt-2 text-[10px] font-bold text-[#765f40]">{run.windows.filter((window) => window.status === "COMPLETED").length}/{run.windows.length} windows reconciled{run.status === "PROCESSING" && run.leaseOwner ? ` · ${run.leaseOwner}` : ""}{run.completedAt ? ` · completed ${new Date(run.completedAt).toLocaleString()}` : ""}</p>
        {run.errorMessage ? <p className="mt-2 rounded-lg bg-rose-50 p-2 text-xs font-bold text-rose-900">{run.errorMessage}</p> : null}
        {run.status === "FAILED" && run.attemptCount < run.maxAttempts ? <button type="button" onClick={() => void retryRun(run.id)} disabled={runBusy} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-rose-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-rose-900 disabled:opacity-50"><RefreshCw size={14} aria-hidden="true" />Requeue retained intent</button> : null}
      </li>)}</ul> : <p className="mt-3 rounded-lg border border-dashed border-violet-200 bg-white p-3 text-xs font-bold text-violet-900">No matched run has been queued for this Session.</p>}
    </div> : null}
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
        const terminology = candidate.metrics?.terminology;
        return <article key={candidate.id} className={`rounded-xl border p-4 ${candidate.outcome === "succeeded" ? "border-emerald-200 bg-emerald-50/40" : "border-rose-200 bg-rose-50/50"}`}>
          <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-black text-[#3d3122]">{candidate.providerName}</p><p className="mt-1 text-[10px] font-black uppercase tracking-wide text-[#765f40]">{candidate.model} · {candidate.adapterVersion}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${candidate.outcome === "succeeded" ? "bg-emerald-100 text-emerald-900" : "bg-rose-100 text-rose-900"}`}>{candidate.outcome}</span></div>
          {candidate.outcome === "succeeded" ? <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div className="rounded-lg bg-white p-2"><dt className="font-black uppercase tracking-wide text-indigo-700">WER</dt><dd className="mt-1 font-black text-[#3d3122]">{typeof wordRate === "number" ? percent(wordRate, 1) : "Unavailable"}</dd></div>
            <div className="rounded-lg bg-white p-2"><dt className="font-black uppercase tracking-wide text-indigo-700">Speaker error</dt><dd className="mt-1 font-black text-[#3d3122]">{candidate.speakerAttribution === "unavailable" || speakerRate == null ? "Unavailable" : percent(speakerRate, 1)}</dd></div>
            <div className="rounded-lg bg-white p-2"><dt className="font-black uppercase tracking-wide text-indigo-700">Timing p95</dt><dd className="mt-1 font-black text-[#3d3122]">{candidate.timingGranularity !== "word" || timingP95 == null ? "Unavailable" : `${Math.round(timingP95)} ms`}</dd></div>
            <div className="rounded-lg bg-white p-2"><dt className="font-black uppercase tracking-wide text-indigo-700">Latency</dt><dd className="mt-1 font-black text-[#3d3122]">{(candidate.elapsedMilliseconds / 1000).toFixed(1)} s</dd></div>
          </dl> : <p className="mt-3 rounded-lg bg-white p-3 text-xs font-bold text-rose-900">{candidate.errorCode ? humanize(candidate.errorCode) : "Provider attempt failed"}{candidate.retryable === true ? " · retryable in a new run" : ""}</p>}
          {candidate.outcome === "succeeded" && terminology ? <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-lg bg-violet-50 p-2"><dt className="font-black uppercase tracking-wide text-violet-700">Term recall</dt><dd className="mt-1 font-black text-[#3d3122]">{terminology.conceptRecall == null ? "Unavailable" : percent(terminology.conceptRecall, 1)}</dd></div>
            <div className="rounded-lg bg-violet-50 p-2"><dt className="font-black uppercase tracking-wide text-violet-700">Term precision</dt><dd className="mt-1 font-black text-[#3d3122]">{terminology.conceptPrecision == null ? "Unavailable" : percent(terminology.conceptPrecision, 1)}</dd></div>
            <div className="rounded-lg bg-violet-50 p-2"><dt className="font-black uppercase tracking-wide text-violet-700">False mentions</dt><dd className="mt-1 font-black text-[#3d3122]">{terminology.falsePositiveMentionCount ?? 0}</dd></div>
          </dl> : null}
          {candidate.terminologyExperiment ? <p className="mt-2 rounded-lg border border-violet-100 bg-violet-50 p-2 text-[10px] font-black uppercase tracking-wide text-violet-800">Matched terminology arm · {humanize(candidate.terminologyExperiment.arm)} · {candidate.terminologyExperiment.comparisonKey}</p> : null}
          <p className="mt-3 text-[10px] font-bold leading-4 text-[#765f40]">{candidate.estimatedCostUsd === null ? "Cost not observed" : `$${candidate.estimatedCostUsd.toFixed(4)} observed`} · {candidate.correctionObservationCount} measured correction pass{candidate.correctionObservationCount === 1 ? "" : "es"} · input {candidate.inputMediaSha256 ? `${candidate.inputMediaSha256.slice(0, 10)}…` : "legacy/unavailable"} · policy {candidate.policyReceiptSha256.slice(0, 10)}…</p>
        </article>;
      })}</div> : !evaluation.providerEvidenceError ? <p className="mt-4 rounded-lg border border-dashed border-indigo-200 bg-indigo-50/50 p-4 text-xs font-bold leading-5 text-indigo-950">No alternative provider attempt has been recorded yet. The protected export gives an authorized runner exact source and reference hashes without exposing them in ordinary Session views.</p> : null}
    </div> : null}
  </section>;
}

function AudioSignalEvidencePanel({
  audio,
  transcriptEndSeconds,
  transcriptWords,
  lowConfidenceThreshold,
  providerLabel,
  playbackReady,
  selectedSeconds,
  onSelectTime,
  onPlayAt,
}: {
  audio: AudioTranscriptEvidence["audio"];
  transcriptEndSeconds: number | null;
  transcriptWords: AudioEvidenceTranscriptWord[];
  lowConfidenceThreshold: number | null;
  providerLabel: string | null;
  playbackReady: boolean;
  selectedSeconds: number;
  onSelectTime: (seconds: number) => void;
  onPlayAt: (seconds: number) => Promise<void>;
}) {
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

    {signal.waveform.length > 0 ? <AudioEvidenceMap
      signal={signal}
      timelineEvents={audio.timelineEvents}
      transcriptEndSeconds={transcriptEndSeconds}
      playbackReady={playbackReady}
      selectedSeconds={selectedSeconds}
      transcriptWords={transcriptWords}
      lowConfidenceThreshold={lowConfidenceThreshold}
      providerLabel={providerLabel}
      onSelect={(seconds, play) => {
        onSelectTime(seconds);
        if (play) void onPlayAt(seconds);
      }}
    /> : null}
    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-sky-200 bg-sky-50 p-3">
      <label htmlFor="audio-signal-time" className="text-xs font-black text-sky-950">Selected time {timestampForSeconds(selectedSeconds)}</label>
      <input
        id="audio-signal-time"
        type="range"
        min={0}
        max={Math.max(signal.durationSeconds, 0.01)}
        step={0.1}
        value={Math.min(selectedSeconds, signal.durationSeconds)}
        onChange={(event) => onSelectTime(Number(event.currentTarget.value))}
        className="min-w-48 flex-1 accent-sky-700"
      />
      <button type="button" disabled={!playbackReady} onClick={() => void onPlayAt(selectedSeconds)} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-sky-800 px-4 py-2 text-xs font-black text-white disabled:opacity-50"><Play className="size-4" aria-hidden="true" />Play selected time</button>
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
  segments,
  playbackReady,
  selectedSeconds,
  onSelectTime,
  onPlayAt,
}: {
  evidence: AudioTranscriptEvidence;
  segments: Segment[];
  playbackReady: boolean;
  selectedSeconds: number;
  onSelectTime: (seconds: number) => void;
  onPlayAt: (seconds: number) => Promise<void>;
}) {
  const { audio, transcript } = evidence;
  const transcriptWords = useMemo(() => transcriptWordsForAudioEvidence(segments), [segments]);
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
  const timingLabel = transcript.timingIntegrity.disposition === "structurally-consistent"
    ? "Structurally consistent"
    : transcript.timingIntegrity.disposition === "review-required"
      ? "Needs timing review"
      : "Word timing unavailable";

  return <section aria-labelledby="audio-transcript-evidence-heading" className="rounded-2xl border border-sky-200 bg-sky-50/45 p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-800">Audio and transcript observability</p>
        <h3 id="audio-transcript-evidence-heading" className="mt-2 font-serif text-2xl font-black text-[#3d3122]">What Quipsly heard, what the model inferred, what was actually checked</h3>
        <p className="mt-2 max-w-4xl text-sm font-semibold leading-relaxed text-sky-950">Provider confidence helps prioritize listening; it is not measured accuracy. Measured word error appears only where a reviewer created playback-backed reference text or confirmed the provider words as-is.</p>
      </div>
      <span className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-wide ${audio.formatComparison === "DRIFT" ? "border-rose-300 bg-rose-50 text-rose-900" : audio.formatComparison === "MATCH" ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}>{humanize(audio.formatComparison)} audio profile</span>
    </div>

    <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      <div className="rounded-xl border border-sky-200 bg-white p-4"><AudioLines className="text-sky-700" size={20} aria-hidden="true" /><p className="mt-3 text-[10px] font-black uppercase tracking-wide text-sky-800">Recorded audio</p><p className="mt-1 text-lg font-black text-[#3d3122]">{audioFormat(audio)}</p><p className="mt-2 text-xs font-semibold leading-5 text-[#765f40]">{[audio.inputRoute, audio.inputDataSource, audio.inputPortType].filter(Boolean).join(" · ") || "Input route was not preserved"}</p></div>
      <div className="rounded-xl border border-violet-200 bg-white p-4"><Gauge className="text-violet-700" size={20} aria-hidden="true" /><p className="mt-3 text-[10px] font-black uppercase tracking-wide text-violet-800">Provider confidence</p><p className="mt-1 text-lg font-black text-[#3d3122]">{confidenceLabel}</p><p className="mt-2 text-xs font-semibold leading-5 text-[#765f40]">{transcript.confidenceWordCount}/{transcript.wordCount} words scored{transcript.lowConfidenceWordCount === null ? "" : ` · ${transcript.lowConfidenceWordCount} below ${percent(transcript.lowConfidenceThreshold, 0)}`} · not WER</p>{transcript.lowConfidenceThresholdAuthority ? <p className="mt-1 break-words text-[9px] font-bold text-violet-700">Triage policy: {transcript.lowConfidenceThresholdAuthority}</p> : null}</div>
      <div className="rounded-xl border border-emerald-200 bg-white p-4"><ShieldCheck className="text-emerald-700" size={20} aria-hidden="true" /><p className="mt-3 text-[10px] font-black uppercase tracking-wide text-emerald-800">Measured against review</p><p className="mt-1 text-lg font-black text-[#3d3122]">{measuredLabel}</p><p className="mt-2 text-xs font-semibold leading-5 text-[#765f40]">{measuredContext}{transcript.measuredReferenceWordCount ? ` · ${transcript.measuredWordErrorCount}/${transcript.measuredReferenceWordCount} word edits` : ""}</p></div>
      <div className="rounded-xl border border-amber-200 bg-white p-4"><TriangleAlert className="text-amber-700" size={20} aria-hidden="true" /><p className="mt-3 text-[10px] font-black uppercase tracking-wide text-amber-800">Review coverage</p><p className="mt-1 text-lg font-black text-[#3d3122]">{percent(transcript.reviewCoverage, 0)}</p><p className="mt-2 text-xs font-semibold leading-5 text-[#765f40]">{transcript.correctedSegmentCount} corrected · {transcript.confirmedAsIsSegmentCount} confirmed · {transcript.segmentCount - transcript.reviewedSegmentCount} unchecked</p></div>
      <div className={`rounded-xl border bg-white p-4 ${transcript.timingIntegrity.disposition === "structurally-consistent" ? "border-emerald-200" : "border-amber-200"}`}><Gauge className={transcript.timingIntegrity.disposition === "structurally-consistent" ? "text-emerald-700" : "text-amber-700"} size={20} aria-hidden="true" /><p className="mt-3 text-[10px] font-black uppercase tracking-wide text-[#765f40]">Edit timing integrity</p><p className="mt-1 text-lg font-black text-[#3d3122]">{timingLabel}</p><p className="mt-2 text-xs font-semibold leading-5 text-[#765f40]">{transcript.timingIntegrity.editableSegmentCount}/{transcript.segmentCount} passages structurally safe · not measured timing accuracy</p></div>
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
        <div><dt className="font-black uppercase tracking-wide text-[#8a7354]">Word timing structure</dt><dd className="mt-1">{transcript.timingIntegrity.structurallyValidWordCount}/{transcript.wordCount} words valid · {transcript.timingIntegrity.attentionSegments.length} passage{transcript.timingIntegrity.attentionSegments.length === 1 ? "" : "s"} held</dd></div>
      </dl>
      {(audio.issues.length > 0 || transcript.endsBeforeRecordingBySeconds !== null || transcript.timingIntegrity.attentionSegments.length > 0) && <div className="mt-4 space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-950">{audio.issues.map((issue) => <p key={issue}>{issue}</p>)}{transcript.endsBeforeRecordingBySeconds !== null && <p>Timed speech ends {transcript.endsBeforeRecordingBySeconds.toFixed(1)} seconds before the recording ends. That may be silence; Quipsly does not label it missing audio without signal analysis.</p>}{transcript.timingIntegrity.attentionSegments.map((segment) => <button key={segment.segmentId} type="button" disabled={!playbackReady} onClick={() => void onPlayAt(segment.startSeconds)} className="block min-h-11 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-left disabled:opacity-50"><span className="font-black uppercase tracking-wide">{timestampForSeconds(segment.startSeconds)} · Timing held</span><span className="mt-1 block">{segment.reasons.map(humanize).join(" · ")}. Quipsly will not use this passage for automatic ripple editing.</span></button>)}</div>}
    </details>

    <AudioSignalEvidencePanel
      audio={audio}
      transcriptEndSeconds={transcript.transcriptEndSeconds}
      transcriptWords={transcriptWords}
      lowConfidenceThreshold={transcript.lowConfidenceThreshold}
      providerLabel={transcript.provider}
      playbackReady={playbackReady}
      selectedSeconds={selectedSeconds}
      onSelectTime={onSelectTime}
      onPlayAt={onPlayAt}
    />

    {transcript.measuredReviewSegments.length > 0 && <section className="mt-4 rounded-xl border border-emerald-200 bg-white p-4" aria-label="Measured transcript error contributors">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wide text-emerald-900">Measured error contributors</p><p className="mt-1 max-w-3xl text-xs font-semibold leading-5 text-emerald-950">Largest playback-reviewed segment error rates first. The aggregate WER above includes every reviewed segment; this bounded list is for diagnosis, not provider confidence.</p></div><span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-emerald-900">Top {transcript.measuredReviewSegments.length} reviewed</span></div>
      <div className="mt-3 grid gap-2 lg:grid-cols-2">{transcript.measuredReviewSegments.map((segment) => <button key={segment.segmentId} type="button" disabled={!playbackReady} onClick={() => void onPlayAt(segment.startSeconds)} className="min-h-11 rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2 text-left text-xs font-bold leading-5 text-emerald-950 disabled:opacity-50" aria-label={`Play measured transcript segment from ${timestampForSeconds(segment.startSeconds)}`}><span className="flex flex-wrap items-center justify-between gap-2"><span className="inline-flex items-center gap-1 font-black uppercase tracking-wide"><Play size={12} fill="currentColor" aria-hidden="true" />{timestampForSeconds(segment.startSeconds)} · {humanize(segment.reviewKind)}</span><span className="font-mono font-black">{percent(segment.wordErrorRate, 1)} WER</span></span><span className="mt-1 block text-[10px] font-black uppercase tracking-wide text-emerald-700">{segment.wordErrorCount}/{segment.referenceWordCount} word edits in this reviewed reference</span></button>)}</div>
    </section>}

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
  reviewedSecondBins,
  currentPlaybackPosition,
  busy,
  onPlayAt,
  onSaved,
}: {
  roomId: string;
  groups: SpeakerGroup[];
  participants: SessionParticipant[];
  playbackReady: boolean;
  reviewedSecondBins: ReadonlySet<number>;
  currentPlaybackPosition: () => number | null;
  busy: boolean;
  onPlayAt: (seconds: number) => Promise<void>;
  onSaved: (message: string) => Promise<void>;
}) {
  const [selectedParticipants, setSelectedParticipants] = useState<Record<string, string>>({});
  const [playedSamples, setPlayedSamples] = useState<Record<string, string>>({});
  const [requestIds, setRequestIds] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function playSample(group: SpeakerGroup, segmentId: string, startSeconds: number) {
    setPlayedSamples((current) => ({ ...current, [group.providerSpeakerLabel]: segmentId }));
    await onPlayAt(startSeconds);
  }

  async function save(group: SpeakerGroup) {
    const label = group.providerSpeakerLabel;
    const participantId = selectedParticipants[label] || group.attribution?.participantId || "";
    const segmentId = playedSamples[label] || "";
    const sample = group.samples.find((candidate) => candidate.segmentId === segmentId);
    const playbackPositionSeconds = sample?.startSeconds ?? currentPlaybackPosition();
    const samplePlaybackReviewed = sample
      ? reviewedSecondBins.has(Math.max(0, Math.floor(sample.startSeconds)))
      : false;
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
          confirmedAgainstPlayback: samplePlaybackReviewed,
        }),
      });
      const body = await response.json() as { ok?: boolean; error?: string; attribution?: SpeakerAttribution };
      if (!response.ok || !body.ok || !body.attribution) throw new Error(body.error || "The speaker assignment was not saved.");
      setRequestIds((current) => ({ ...current, [label]: requestId(`speaker-${label}`) }));
      await onSaved(`${body.attribution.attributedLabel} is now used for this voice throughout the Session.`);
    } catch (error) {
      setErrors((current) => ({
        ...current,
        [label]: error instanceof Error ? error.message : "The speaker assignment was not saved.",
      }));
    }
  }

  if (!groups.length) return null;
  return (
    <section id="speaker-attribution-review" tabIndex={-1} aria-labelledby="speaker-attribution-heading" className="rounded-xl border border-indigo-200 bg-white p-4">
      <h3 id="speaker-attribution-heading" className="font-serif text-xl font-black text-[#3d3122]">Who is speaking?</h3>
      <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-indigo-950">Listen to one sample, then choose the person. Quipsly will use that name for the matching voice throughout this Session.</p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {groups.map((group) => {
          const label = group.providerSpeakerLabel;
          const selectedParticipant = selectedParticipants[label] || group.attribution?.participantId || "";
          const playedSample = playedSamples[label] || "";
          const selectedSample = group.samples.find((sample) => sample.segmentId === playedSample);
          const samplePlaybackReviewed = selectedSample
            ? reviewedSecondBins.has(Math.max(0, Math.floor(selectedSample.startSeconds)))
            : false;
          return (
            <article key={label} className="rounded-xl border border-indigo-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-indigo-800">{label} · {group.turnCount} passage{group.turnCount === 1 ? "" : "s"}</p>
                  <p className="mt-1 text-sm font-black text-indigo-950">{group.attribution ? `Named ${group.attribution.attributedLabel}` : "Needs a name"}</p>
                </div>
                {group.attribution && <span className="rounded-full bg-emerald-100 px-3 py-1 text-[0.68rem] font-black uppercase tracking-wide text-emerald-900">Named</span>}
              </div>
              {group.staleAttribution && <p role="status" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-950">This voice changed after it was named. Listen again before saving the name.</p>}
              <label className="mt-4 block text-xs font-black uppercase tracking-wide text-indigo-950">Person
                <select value={selectedParticipant} onChange={(event) => setSelectedParticipants((current) => ({ ...current, [label]: event.target.value }))} className="mt-1 block min-h-11 w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-[#3d3122]">
                  <option value="">Choose a person</option>
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
              {playedSample ? <p className={`mt-3 rounded-lg border p-3 text-sm font-bold leading-relaxed ${samplePlaybackReviewed ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-indigo-200 bg-indigo-50/60 text-indigo-950"}`}>{samplePlaybackReviewed ? "Sample played. Choose the person and save the name." : "Starting sample…"}</p> : null}
              {errors[label] && <p role="alert" className="mt-3 flex items-start gap-2 text-sm font-bold text-rose-800"><CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />{errors[label]}</p>}
              <button type="button" onClick={() => void save(group)} disabled={busy || !playbackReady || !selectedParticipant || !playedSample || !samplePlaybackReviewed} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-indigo-800 px-4 py-2 text-xs font-black uppercase tracking-wide text-white disabled:opacity-50"><ShieldCheck size={15} aria-hidden="true" />{group.attribution ? "Change name" : "Save name"}</button>
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
  playbackReviewed,
  reviewedPlaybackPositionSeconds,
  currentPlaybackPosition,
  busy,
  onPlay,
  onSaved,
}: {
  roomId: string;
  segment: Segment;
  proposal: Correction;
  playbackReady: boolean;
  playbackReviewed: boolean;
  reviewedPlaybackPositionSeconds: number | null;
  currentPlaybackPosition: () => number | null;
  busy: boolean;
  onPlay: () => Promise<void>;
  onSaved: (message: string) => Promise<void>;
}) {
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
          confirmedAgainstPlayback: decision === "accept" && playbackReviewed,
          playbackPositionSeconds: reviewedPlaybackPositionSeconds ?? currentPlaybackPosition(),
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
      {playbackReviewed ? <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold leading-relaxed text-emerald-950">Recording checked from {timestampForSeconds(reviewedPlaybackPositionSeconds ?? segment.startSeconds)}. Accepting keeps this proposal linked to that moment.</p> : null}
      {error && <p role="alert" className="mt-3 flex items-start gap-2 text-sm font-bold text-rose-800"><CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => void onPlay()} disabled={!playbackReady || busy} className="inline-flex items-center gap-2 rounded-full border border-violet-300 bg-white px-3 py-2 text-xs font-black uppercase tracking-wide text-violet-900 disabled:opacity-50"><Play size={14} fill="currentColor" aria-hidden="true" />Play timestamp</button>
        <button type="button" onClick={() => void decide("accept")} disabled={!playbackReady || !playbackReviewed || busy} className="inline-flex items-center gap-2 rounded-full bg-violet-800 px-3 py-2 text-xs font-black uppercase tracking-wide text-white disabled:opacity-50"><Check size={14} aria-hidden="true" />Accept correction</button>
        <button type="button" onClick={() => void decide("reject")} disabled={busy} className="inline-flex items-center gap-2 rounded-full border border-rose-300 bg-white px-3 py-2 text-xs font-black uppercase tracking-wide text-rose-800 disabled:opacity-50"><X size={14} aria-hidden="true" />Reject proposal</button>
      </div>
      <p className="mt-2 text-xs font-bold text-violet-800">Until accepted here, this proposal does not change the effective transcript.</p>
    </div>
  );
}

function ImpactReviewResolution({
  roomId,
  transcriptJobId,
  segment,
  impact,
  disabled,
  onSaved,
}: {
  roomId: string;
  transcriptJobId: string;
  segment: Segment;
  impact: NonNullable<Segment["downstreamImpacts"]>[number];
  disabled: boolean;
  onSaved: (message: string) => Promise<void>;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientRequestId] = useState(() => requestId(`impact-${segment.id}-${impact.artifactKind}-${impact.artifactId}`));

  async function keepAsWritten() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/mobile/capture/transcripts/corrections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation: "acknowledge-transcript-impact",
          roomId,
          transcriptJobId,
          segmentId: segment.id,
          artifactKind: impact.artifactKind,
          artifactId: impact.artifactId,
          clientRequestId,
          expectedArtifactUpdatedAt: impact.artifactUpdatedAt,
          expectedAcceptedCorrectionId: impact.currentCorrectionId,
          expectedEffectiveText: impact.currentTextSnapshot,
          expectedEffectiveSpeakerLabel: impact.currentSpeakerLabel,
          confirmedContentStillValid: confirmed,
        }),
      });
      const body = await response.json() as { ok?: boolean; error?: string; idempotentReplay?: boolean };
      if (!response.ok || !body.ok) throw new Error(body.error || "The linked-item review was not saved.");
      await onSaved(body.idempotentReplay
        ? "This linked item was already reviewed against the current transcript; no duplicate receipt was created."
        : `Kept ${impact.artifactKind} as written and attached a current transcript review receipt. Its content was not changed.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The linked-item review was not saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-white p-3">
      <label className="flex items-start gap-3 text-xs font-bold leading-relaxed text-amber-950">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          disabled={disabled || saving}
          className="mt-0.5 size-4 accent-amber-800"
        />
        <span>I read the corrected source and this item still says what I intend.</span>
      </label>
      {error && <p role="alert" className="mt-2 flex items-start gap-2 text-xs font-bold text-rose-800"><CircleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />{error}</p>}
      <button
        type="button"
        onClick={() => void keepAsWritten()}
        disabled={disabled || saving || !confirmed}
        className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full bg-amber-900 px-4 py-2 text-xs font-black uppercase tracking-wide text-white disabled:opacity-50"
      >
        {saving ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> : <ShieldCheck size={14} aria-hidden="true" />}
        Keep item as written
      </button>
      <p className="mt-2 text-[0.68rem] font-semibold text-amber-800">This appends a review receipt. It does not rewrite the item, transcript, recording, or delivery state.</p>
    </div>
  );
}

function CorrectionEditor({
  roomId,
  transcriptJobId,
  segment,
  canUseProjectTeamNotes,
  playbackReady,
  playbackReviewed,
  reviewedPlaybackPositionSeconds,
  currentPlaybackPosition,
  busy,
  onPlay,
  onPlayAt,
  onEditRecording,
  onSaved,
}: {
  roomId: string;
  transcriptJobId: string;
  segment: Segment;
  canUseProjectTeamNotes: boolean;
  playbackReady: boolean;
  playbackReviewed: boolean;
  reviewedPlaybackPositionSeconds: number | null;
  currentPlaybackPosition: () => number | null;
  busy: boolean;
  onPlay: () => Promise<void>;
  onPlayAt: (seconds: number) => Promise<void>;
  onEditRecording?: (segment: Segment) => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [correctedText, setCorrectedText] = useState(segment.text);
  const [correctedSpeaker, setCorrectedSpeaker] = useState(segment.speakerLabel || "");
  const [reason, setReason] = useState("");
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
          confirmedAgainstPlayback: playbackReviewed,
          playbackPositionSeconds: reviewedPlaybackPositionSeconds ?? position,
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
          playbackPositionSeconds: reviewedPlaybackPositionSeconds ?? currentPlaybackPosition(),
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
          <TranscriptSpeakerEvidenceBadge authority={segment.speakerAuthority} />
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

      {(segment.downstreamImpacts?.length ?? 0) > 0 && (
        <details id={`transcript-impact-${segment.id}`} open={segment.downstreamImpacts?.some((impact) => impact.state === "needs-review")} className="mt-4 scroll-mt-28 rounded-xl border border-fuchsia-200 bg-fuchsia-50/60 p-4">
          <summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-fuchsia-900">
            Downstream evidence · {segment.downstreamImpacts?.length} linked item{segment.downstreamImpacts?.length === 1 ? "" : "s"}
          </summary>
          <p className="mt-2 text-xs font-semibold leading-relaxed text-fuchsia-950">
            Quipsly found these items through their canonical transcript provenance. Corrections never silently rewrite notes, tasks, goals, or follow-ups.
          </p>
          <ul className="mt-3 space-y-2">
            {segment.downstreamImpacts?.map((impact) => (
              <li key={`${impact.artifactKind}-${impact.artifactId}`} className={`rounded-lg border p-3 text-xs font-bold leading-relaxed ${impact.state === "needs-review" ? "border-amber-300 bg-amber-50 text-amber-950" : impact.state === "current" ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-slate-200 bg-white text-slate-800"}`}>
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={impact.href} className="font-black underline decoration-current/30 underline-offset-2 hover:decoration-current">{humanize(impact.artifactKind)} · {impact.label}</Link>
                  <span className="rounded-full bg-white/80 px-2 py-1 text-[0.65rem] font-black uppercase tracking-wide">
                    {impact.state === "needs-review" ? "review after correction" : impact.state === "current" ? "current evidence" : "legacy snapshot"}
                  </span>
                </span>
                {impact.status && <span className="mt-1 block text-[0.68rem] uppercase tracking-wide opacity-75">{humanize(impact.status)}</span>}
                {impact.state === "needs-review" && (impact.changes.text === "changed" || impact.changes.speaker === "changed") && (
                  <div className="mt-3 grid gap-2 lg:grid-cols-2">
                    <div className="rounded-lg border border-amber-200 bg-white p-3">
                      <p className="text-[0.65rem] font-black uppercase tracking-wide text-amber-800">Evidence captured by this item</p>
                      <p className="mt-1 font-semibold text-amber-950">{impact.priorTextSnapshot || "Exact text snapshot unavailable."}</p>
                      {impact.priorSpeakerLabelSnapshot && <p className="mt-1 text-[0.68rem] text-amber-800">Speaker: {impact.priorSpeakerLabelSnapshot}</p>}
                    </div>
                    <div className="rounded-lg border border-emerald-200 bg-white p-3">
                      <p className="text-[0.65rem] font-black uppercase tracking-wide text-emerald-800">Current reviewed transcript</p>
                      <p className="mt-1 font-semibold text-emerald-950">{impact.currentTextSnapshot}</p>
                      {impact.currentSpeakerLabel && <p className="mt-1 text-[0.68rem] text-emerald-800">Speaker: {impact.currentSpeakerLabel}</p>}
                    </div>
                  </div>
                )}
                {impact.state === "needs-review" && impact.changes.text !== "changed" && impact.changes.speaker !== "changed" && (
                  <p className="mt-2 rounded-lg bg-white p-2 text-[0.7rem] font-semibold">The accepted correction receipt changed, but the preserved words and speaker are either unchanged or unavailable. Review the linked item before carrying the new evidence forward.</p>
                )}
                {impact.state === "needs-review" && impact.canAcknowledge && (
                  <ImpactReviewResolution
                    roomId={roomId}
                    transcriptJobId={transcriptJobId}
                    segment={segment}
                    impact={impact}
                    disabled={busy}
                    onSaved={onSaved}
                  />
                )}
                {impact.state === "needs-review" && !impact.canAcknowledge && (
                  <p className="mt-2 rounded-lg bg-white p-2 text-[0.7rem] font-semibold">Open the linked item to review it. Only its current owner can attach a keep-as-written receipt.</p>
                )}
              </li>
            ))}
          </ul>
          {segment.downstreamImpacts?.some((impact) => impact.state === "needs-review") && (
            <p role="status" className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-white p-3 text-xs font-black leading-relaxed text-amber-950">
              <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
              A source correction changed after linked work captured its wording. The work remains preserved and needs a deliberate review; automatic regeneration is off.
            </p>
          )}
        </details>
      )}

      {segment.proposals.map((proposal) => (
        <ProposalReview
          key={proposal.id}
          roomId={roomId}
          segment={segment}
          proposal={proposal}
          playbackReady={playbackReady}
          playbackReviewed={playbackReviewed}
          reviewedPlaybackPositionSeconds={reviewedPlaybackPositionSeconds}
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
          <label className="block text-xs font-black uppercase tracking-wide text-amber-950">Correct transcript words
            <textarea value={correctedText} onChange={(event) => setCorrectedText(event.target.value)} maxLength={10000} rows={4} className="mt-1 block w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-semibold leading-relaxed text-[#3d3122]" />
          </label>
          <label className="block text-xs font-black uppercase tracking-wide text-amber-950">Why this changed <span className="normal-case tracking-normal text-amber-800">(optional)</span>
            <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} placeholder="Name, wording, crosstalk, diarization…" className="mt-1 block w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-[#3d3122]" />
          </label>
          <p className={`rounded-lg border p-3 text-sm font-bold leading-relaxed ${playbackReviewed ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-amber-200 bg-white text-amber-950"}`}>
            {playbackReviewed
              ? `Recording checked from ${timestampForSeconds(reviewedPlaybackPositionSeconds ?? segment.startSeconds)}. Your correction will stay linked to this moment.`
              : "Quipsly is playing this passage. Listen once and Save will unlock automatically."}
          </p>
          {error && <p role="alert" className="flex items-start gap-2 text-sm font-bold text-rose-800"><CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void save()} disabled={busy || !playbackReviewed || !playbackReady || (!correctedText.trim() && !correctedSpeaker.trim())} className="inline-flex items-center gap-2 rounded-full bg-[#3e2f21] px-4 py-2 text-xs font-black uppercase tracking-wide text-white disabled:opacity-50"><Check size={14} aria-hidden="true" />Save transcript correction</button>
            <button type="button" onClick={() => { setEditing(false); setError(null); }} disabled={busy} className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-amber-950 disabled:opacity-50"><X size={14} aria-hidden="true" />Cancel</button>
          </div>
          <p className="text-xs font-bold leading-relaxed text-amber-800">Saving adds a reviewed overlay and audit revision. It does not overwrite provider output, move timestamps, create tasks, send notes, or publish anything.</p>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {!segment.acceptedCorrection && !segment.acceptedVerification && playbackReviewed && (
            <button type="button" onClick={() => void confirmAsIs()} disabled={!playbackReady || busy} className="inline-flex items-center gap-2 rounded-full bg-emerald-800 px-4 py-2 text-xs font-black uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-50"><ShieldCheck size={15} aria-hidden="true" />Mark correct</button>
          )}
          <button type="button" onClick={() => { setEditing(true); if (!playbackReviewed) void onPlay(); }} disabled={!playbackReady || busy} className="inline-flex items-center gap-2 rounded-full border border-[#d9c7a5] bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-[#5b472f] disabled:cursor-not-allowed disabled:opacity-50"><FilePenLine size={15} aria-hidden="true" />{segment.acceptedCorrection ? "Revise transcript" : "Correct transcript"}</button>
          {onEditRecording ? <button type="button" onClick={() => onEditRecording(segment)} disabled={busy} className="inline-flex items-center gap-2 rounded-full border border-sky-300 bg-sky-50 px-4 py-2 text-xs font-black uppercase tracking-wide text-sky-950 disabled:opacity-50"><Scissors size={15} aria-hidden="true" />Edit recording here</button> : null}
          {segment.correctionHistory.length > 0 && <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#8a7354]"><History size={14} aria-hidden="true" />{segment.correctionHistory.length} correction record(s) preserved</span>}
        </div>
      )}

      {error && !editing && <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800"><CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />{error}</p>}
      <details className="mt-4 rounded-xl border border-[#e5d5b7] bg-[#fffaf1] p-4">
        <summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-[#5f4d37]">Create from this moment</summary>
        <p className="mt-2 text-xs font-semibold leading-5 text-[#765f40]">Turn this exact recording moment into a note, task, goal, or private writing page. Nothing is sent or published automatically.</p>
      <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50/60 p-4">
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
      </details>
    </li>
  );
}

export function TranscriptCorrectionDesk({
  roomId,
  sessionTitle = "Quipsly Session",
  recordingAssetId = null,
  canUseProjectTeamNotes = false,
  canEditRecording = false,
  recordingEditor = null,
  audioMastery = null,
}: {
  roomId: string;
  sessionTitle?: string;
  recordingAssetId?: string | null;
  canUseProjectTeamNotes?: boolean;
  canEditRecording?: boolean;
  recordingEditor?: ReactNode | ((focus: RecordingEditorFocus | null) => ReactNode);
  audioMastery?: ReactNode;
}) {
  const [desk, setDesk] = useState<Desk | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [mentorReportBusy, setMentorReportBusy] = useState(false);
  const [preparingPlayback, setPreparingPlayback] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [preparedTranscript, setPreparedTranscript] = useState<{
    url: string;
    filename: string;
  } | null>(null);
  const [listenedSecondBins, setListenedSecondBins] = useState<Set<number>>(() => new Set());
  const [playbackSeconds, setPlaybackSeconds] = useState(0);
  const [playbackState, setPlaybackState] = useState<"absent" | "loading" | "ready" | "error">("absent");
  const [showQualityDetails, setShowQualityDetails] = useState(false);
  const [showSpeakerIdentity, setShowSpeakerIdentity] = useState(false);
  const [showRecordingEditor, setShowRecordingEditor] = useState(false);
  const [recordingEditorFocus, setRecordingEditorFocus] = useState<RecordingEditorFocus | null>(null);
  const [transcriptView, setTranscriptView] = useState<"transcript" | "recording-transcript">("transcript");
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const lastPlaybackTimeRef = useRef<number | null>(null);
  const automaticPlaybackPreparationRef = useRef<string | null>(null);
  const speakerNamingPromptedRef = useRef(false);
  const playbackReady = Boolean(desk?.playback) && playbackState === "ready";
  const detectorDurationSeconds = desk?.playback?.durationSeconds ?? desk?.evaluation?.sourceDurationSeconds ?? desk?.evidence?.audio.signal?.durationSeconds ?? 0;

  const openRecordingEditorAt = useCallback((segment: Segment) => {
    if (!desk?.transcriptJobId) return;
    setRecordingEditorFocus({ transcriptJobId: desk.transcriptJobId, segmentId: segment.id });
    setShowRecordingEditor(true);
    window.requestAnimationFrame(() => {
      document.getElementById("inline-recording-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [desk?.transcriptJobId]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const query = new URLSearchParams({ callRoomId: roomId });
      if (recordingAssetId) query.set("recordingAssetId", recordingAssetId);
      const response = await fetch(`/api/mobile/capture/transcripts/corrections?${query.toString()}`, { cache: "no-store" });
      const payload = await response.json() as Desk;
      if (!response.ok || !payload.ok) throw new Error(payload.error || "The correction desk could not load.");
      setDesk(payload);
    } catch (error) {
      if (!silent) setDesk(null);
      setMessage(error instanceof Error ? error.message : "The correction desk could not load.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [recordingAssetId, roomId]);

  useEffect(() => { void load(false); }, [load]);

  useEffect(() => () => {
    if (preparedTranscript?.url) URL.revokeObjectURL(preparedTranscript.url);
  }, [preparedTranscript?.url]);

  useEffect(() => {
    setListenedSecondBins(new Set());
    setPlaybackSeconds(0);
    lastPlaybackTimeRef.current = null;
    setPlaybackState(desk?.playback ? ((mediaRef.current?.readyState ?? 0) >= 1 ? "ready" : "loading") : "absent");
  }, [desk?.playback?.sourceId]);

  useEffect(() => {
    if (!["QUEUED", "RUNNING"].includes(desk?.transcriptStatus || "")) return;
    const interval = window.setInterval(() => void load(true), 5_000);
    return () => window.clearInterval(interval);
  }, [desk?.transcriptStatus, load]);

  useEffect(() => {
    const revealLinkedAudioReview = () => {
      if (window.location.hash === "#transcript-audio-review") {
        setShowQualityDetails(true);
      }
    };
    revealLinkedAudioReview();
    window.addEventListener("hashchange", revealLinkedAudioReview);
    return () => window.removeEventListener("hashchange", revealLinkedAudioReview);
  }, []);

  useEffect(() => {
    if (!desk || typeof window === "undefined") return;
    const targetId = window.location.hash.slice(1);
    if (targetId !== "speaker-attribution-review" && targetId !== "transcript-correction-review" && targetId !== "transcript-audio-review" && !targetId.startsWith("transcript-segment-")) return;
    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(targetId);
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [desk, showQualityDetails]);

  useEffect(() => {
    if (speakerNamingPromptedRef.current || !desk?.gate.allowed) return;
    const groups = desk.speakerGroups ?? [];
    if (!groups.some((group) => !group.attribution || group.staleAttribution)) return;
    speakerNamingPromptedRef.current = true;
    setShowSpeakerIdentity(true);
  }, [desk]);

  useEffect(() => {
    const recordingId = desk?.recording?.id;
    if (
      !desk?.gate.allowed
      || desk.playback
      || !desk.recording?.eligibleForProtectedPlaybackPreparation
      || !recordingId
      || automaticPlaybackPreparationRef.current === recordingId
    ) return;
    automaticPlaybackPreparationRef.current = recordingId;
    void prepareProtectedPlayback(true);
  }, [desk]);

  const spectralTranscriptWords = useMemo(
    () => transcriptWordsForAudioEvidence(desk?.segments ?? []),
    [desk?.segments],
  );
  const spectralEvidenceMarkers = useMemo<SpectralEvidenceMarker[]>(() => [
    ...(desk?.evidence?.audio.signal?.observations ?? []).map((observation, index) => ({
      id: `signal-${observation.kind}-${observation.startSeconds}-${index}`,
      category: "signal" as const,
      startSeconds: observation.startSeconds,
      endSeconds: observation.endSeconds,
      label: humanize(observation.kind),
      detail: observation.detail,
      severity: observation.severity,
    })),
    ...(desk?.evidence?.audio.timelineEvents ?? []).map((event, index) => ({
      id: `capture-${event.kind}-${event.startSeconds}-${index}`,
      category: "capture" as const,
      startSeconds: event.startSeconds,
      endSeconds: event.startSeconds,
      label: humanize(event.kind),
      detail: event.detail || [event.routeName, event.routePortType].filter(Boolean).join(" · ") || "Capture boundary preserved without route detail.",
      severity: event.kind === "interruption" ? "warning" as const : "attention" as const,
    })),
  ], [desk?.evidence?.audio.signal?.observations, desk?.evidence?.audio.timelineEvents]);

  async function playFromTime(seconds: number) {
    const media = mediaRef.current;
    if (!media || !playbackReady) {
      setMessage(playbackState === "error"
        ? "Protected source bytes are unavailable. Restore or re-import the original before claiming playback review."
        : "Protected playback is still loading. Wait for the source to become ready before reviewing this timestamp.");
      return;
    }
    const next = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
    media.currentTime = next;
    setPlaybackSeconds(next);
    try {
      await media.play();
      setListenedSecondBins((current) => {
        const second = Math.max(0, Math.floor(next));
        if (current.has(second)) return current;
        const updated = new Set(current);
        updated.add(second);
        return updated;
      });
    } catch {
      setMessage("Playback needs your direct interaction. Press play in the recording controls, then try this timestamp again.");
    }
  }

  async function playFrom(segment: Segment) {
    return playFromTime(segment.startSeconds);
  }

  function observePlayback(media: HTMLMediaElement, ended = false) {
    const duration = Number.isFinite(media.duration) ? media.duration : desk?.playback?.durationSeconds;
    const currentTime = ended && duration && duration > 0 ? duration - 0.001 : media.currentTime;
    setPlaybackSeconds(Math.max(0, currentTime));
    if (!ended && (media.paused || media.seeking)) return;
    if (!duration || duration <= 0) return;
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

  function playbackLoaded() {
    setPlaybackState("ready");
  }

  function playbackFailed() {
    lastPlaybackTimeRef.current = null;
    setPlaybackState("error");
    setListenedSecondBins(new Set());
    setMessage("Protected source bytes could not be loaded. Review, correction, notes, tasks, goals, and drafts are held until the original is restored or re-imported.");
  }

  async function saved(nextMessage: string) {
    setBusy(true);
    setMessage(nextMessage);
    await load();
    setBusy(false);
  }

  async function prepareProtectedPlayback(automatic = false) {
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
      setMessage(automatic
        ? "Recording ready."
        : payload.message || "Recording ready.");
      await load(true);
    } catch (error) {
      setMessage(error instanceof Error
        ? error.message
        : automatic
          ? "Quipsly could not make the recording playable automatically. Try again."
          : "The recording could not be made playable.");
    } finally {
      setPreparingPlayback(false);
    }
  }

  async function prepareTranscriptFile() {
    if (!desk?.transcriptJobId || !desk.segments.length || !desk.gate.allowed) return;
    if (preparedTranscript?.url) URL.revokeObjectURL(preparedTranscript.url);
    const filename = reviewedTranscriptFileName(
      sessionTitle,
      desk.transcriptJobId,
    );
    const file = new File([
      reviewedTranscriptText({
        title: sessionTitle,
        transcriptJobId: desk.transcriptJobId,
        segments: desk.segments,
      }),
    ], filename, { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(file);
    setPreparedTranscript({ url, filename });
    const shareData = {
      title: "Reviewed Quipsly transcript",
      text: `${reviewedSegmentCount} of ${desk.segments.length} turns playback-reviewed`,
      files: [file],
    };
    if (
      typeof navigator.share === "function" &&
      (typeof navigator.canShare !== "function" || navigator.canShare(shareData))
    ) {
      try {
        await navigator.share(shareData);
        setMessage("The system share sheet accepted the effective transcript file. Quipsly does not claim who received it.");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          setMessage("Sharing was canceled. The prepared transcript remains available below.");
          return;
        }
      }
    }
    setMessage("The transcript file is prepared below. This embedded browser did not open a system share sheet.");
  }

  async function shareMentorTranscript() {
    if (mentorReportBusy || !desk?.gate.allowed || !desk.segments.length) return;
    setMentorReportBusy(true);
    setMessage(null);
    try {
      const query = new URLSearchParams();
      if (recordingAssetId) query.set("recordingAssetId", recordingAssetId);
      const response = await fetch(
        `/api/sessions/${encodeURIComponent(roomId)}/transcript-report${query.size ? `?${query.toString()}` : ""}`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || "The mentor transcript could not be prepared.");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
      const fallbackName = `${sessionTitle.trim() || "Coaching Session"} Transcript.docx`;
      const filename = encodedName ? decodeURIComponent(encodedName) : fallbackName;
      const file = new File([blob], filename, { type: blob.type });
      const shareData = { title: "Coaching Session transcript", files: [file] };
      if (
        typeof navigator.share === "function"
        && (typeof navigator.canShare !== "function" || navigator.canShare(shareData))
      ) {
        try {
          await navigator.share(shareData);
          setMessage("The mentor transcript is in the system share sheet. Quipsly does not claim who received it.");
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            setMessage("Sharing was canceled. Nothing was sent.");
            return;
          }
        }
      }
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setMessage("Mentor transcript downloaded. It keeps coach/client columns, timestamps, and source identity.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The mentor transcript could not be prepared.");
    } finally {
      setMentorReportBusy(false);
    }
  }

  if (loading) return <section className="rounded-2xl border border-[#e5d5b7] bg-white p-8 text-sm font-bold text-[#765f40]"><LoaderCircle className="mr-2 inline animate-spin" size={18} aria-hidden="true" />Loading transcript and recording…</section>;
  if (!desk) return <section className="rounded-2xl border border-rose-200 bg-rose-50 p-6" role="status"><CircleAlert className="text-rose-700" aria-hidden="true" /><h2 className="mt-3 font-serif text-2xl font-black text-[#3d3122]">Transcript correction is unavailable.</h2><p className="mt-2 text-sm font-semibold text-[#765f40]">{message || "No transcript text is substituted and no evidence was changed."}</p><button type="button" onClick={() => void load()} className="mt-4 inline-flex items-center gap-2 rounded-full border border-rose-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-rose-900"><RefreshCw size={14} aria-hidden="true" />Retry</button></section>;

  const reviewedSegmentCount = desk.segments.filter((segment) => segment.acceptedCorrection || segment.acceptedVerification).length;
  const identifiedSpeakerCount = (desk.speakerGroups ?? []).filter((group) => group.attribution && !group.staleAttribution).length;
  const unidentifiedSpeakerCount = (desk.speakerGroups?.length ?? 0) - identifiedSpeakerCount;
  const timingIntegrity = desk.evidence?.transcript.timingIntegrity ?? null;
  const protectedPlaybackSurface = !desk.gate.allowed ? (
    <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-900">{desk.gate.error || "Transcript evidence remains held by consent and release policy."}</p>
  ) : desk.playback ? (
    <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4">
      <p className="mb-3 text-xs font-black text-sky-900">Recording · {desk.playback.label}</p>
      {desk.playback.kind === "video"
        ? <video ref={(node) => { mediaRef.current = node; }} src={desk.playback.url} controls preload="metadata" onLoadedMetadata={playbackLoaded} onCanPlay={playbackLoaded} onError={playbackFailed} onPlay={(event) => { lastPlaybackTimeRef.current = event.currentTarget.currentTime; setPlaybackSeconds(event.currentTarget.currentTime); }} onPause={(event) => { lastPlaybackTimeRef.current = null; setPlaybackSeconds(event.currentTarget.currentTime); }} onSeeking={(event) => { lastPlaybackTimeRef.current = null; setPlaybackSeconds(event.currentTarget.currentTime); }} onTimeUpdate={(event) => observePlayback(event.currentTarget)} onEnded={(event) => observePlayback(event.currentTarget, true)} className="max-h-[420px] w-full rounded-lg bg-black" aria-label="Protected session recording" />
        : <audio ref={(node) => { mediaRef.current = node; }} src={desk.playback.url} controls preload="metadata" onLoadedMetadata={playbackLoaded} onCanPlay={playbackLoaded} onError={playbackFailed} onPlay={(event) => { lastPlaybackTimeRef.current = event.currentTarget.currentTime; setPlaybackSeconds(event.currentTarget.currentTime); }} onPause={(event) => { lastPlaybackTimeRef.current = null; setPlaybackSeconds(event.currentTarget.currentTime); }} onSeeking={(event) => { lastPlaybackTimeRef.current = null; setPlaybackSeconds(event.currentTarget.currentTime); }} onTimeUpdate={(event) => observePlayback(event.currentTarget)} onEnded={(event) => observePlayback(event.currentTarget, true)} className="w-full" aria-label="Protected session recording" />}
      {playbackState === "loading" ? <p role="status" className="mt-3 rounded-lg border border-sky-200 bg-white p-3 text-xs font-bold text-sky-900">Loading recording…</p> : null}
      {playbackState === "error" ? <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-bold leading-5 text-rose-950">The original recording is unavailable. Historical review receipts remain visible, but new edits stay locked until it is restored.</p> : null}
    </div>
  ) : (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-relaxed text-amber-950">
      <p>{preparingPlayback ? "Quipsly is getting the recording ready…" : "The transcript is ready, but the recording still needs attention before it can be checked or corrected."}</p>
      {desk.recording?.eligibleForProtectedPlaybackPreparation ? (
        <div className="mt-4">
          <button type="button" onClick={() => void prepareProtectedPlayback(false)} disabled={preparingPlayback || busy} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-amber-900 px-4 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50">
            {preparingPlayback ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> : <ShieldCheck size={15} aria-hidden="true" />}
            {preparingPlayback ? "Getting recording ready…" : "Try again"}
          </button>
          <p className="mt-2 text-xs font-semibold leading-relaxed text-amber-900">This does not change the original recording.</p>
        </div>
      ) : null}
    </div>
  );

  return (
    <section id="transcript-correction-review" tabIndex={-1} aria-labelledby="transcript-correction-heading" className="space-y-5">
      <div className="rounded-2xl border border-[#e5d5b7] bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#987443]">Transcript</p>
            <h2 id="transcript-correction-heading" className="mt-2 font-serif text-3xl font-black text-[#3d3122]">Review and edit the transcript</h2>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-[#765f40]">Play any passage to check it, then correct the words or speaker name. Transcript corrections never cut the recording.</p>
            {desk.segments.length > 0 && <p className="mt-3 text-sm font-black text-emerald-800">{reviewedSegmentCount} of {desk.segments.length} passages checked</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {canEditRecording ? recordingEditor ? <button type="button" aria-expanded={showRecordingEditor} aria-controls="inline-recording-editor" onClick={() => { setRecordingEditorFocus(null); setShowRecordingEditor((current) => !current); }} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-sky-300 bg-sky-50 px-4 py-2 text-xs font-black uppercase tracking-wide text-sky-950"><Scissors size={15} aria-hidden="true" />{showRecordingEditor ? "Close recording editor" : "Trim or cut recording"}</button> : <Link href={`/sessions/${encodeURIComponent(roomId)}?mode=outputs#recording-share`} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-sky-300 bg-sky-50 px-4 py-2 text-xs font-black uppercase tracking-wide text-sky-950"><Scissors size={15} aria-hidden="true" />Trim or cut recording</Link> : null}
            {desk.roomPurpose === "COACHING" ? <button type="button" onClick={() => void shareMentorTranscript()} disabled={busy || mentorReportBusy || !desk.gate.allowed || !desk.segments.length} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-orange-300 bg-orange-50 px-4 py-2 text-xs font-black text-orange-950 disabled:opacity-50">{mentorReportBusy ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> : <Download size={15} aria-hidden="true" />}Mentor report</button> : null}
            <button type="button" onClick={() => void prepareTranscriptFile()} disabled={busy || !desk.gate.allowed || !desk.segments.length} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-emerald-800 px-4 py-2 text-xs font-black text-white disabled:opacity-50"><Share2 size={15} aria-hidden="true" />Share transcript</button>
            <button type="button" onClick={() => void load(false)} disabled={loading || busy} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#d9c7a5] bg-white px-4 py-2 text-xs font-black text-[#5b472f] disabled:opacity-50"><RefreshCw size={15} aria-hidden="true" />Refresh</button>
          </div>
        </div>
        {message && <p role="status" className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-bold text-sky-900">{message}</p>}
        {preparedTranscript ? <a href={preparedTranscript.url} download={preparedTranscript.filename} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-emerald-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-emerald-950"><Download size={15} aria-hidden="true" />Download prepared transcript</a> : null}
        {desk.processing && (
          <div className="mt-5 grid gap-3 rounded-xl border border-[#e5d5b7] bg-[#fffaf1] p-4">
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
                    ? "You can leave this page and come back when it is ready."
                    : "Ready to review, correct, and share.")}
              </p>
            </div>
            <details className="rounded-xl border border-indigo-200 bg-white p-4">
              <summary className="cursor-pointer text-xs font-black text-indigo-900">
                Transcription details
              </summary>
              <div className="mt-3 flex flex-wrap gap-2 text-[0.68rem] font-black uppercase tracking-wide">
                <span className={`rounded-full px-3 py-1.5 ${desk.processing.sourceBound ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>recording matched</span>
                <span className={`rounded-full px-3 py-1.5 ${desk.processing.providerReceiptReceived ? "bg-emerald-100 text-emerald-900" : "bg-stone-200 text-stone-700"}`}>provider receipt</span>
              </div>
              {desk.processing.routing ? (
                <div>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-indigo-950">
                  {desk.processing.routing.sourceTopology === "participant-isolated"
                    ? `${desk.processing.routing.participantLabel || "This participant"} owns this isolated source, so source identity outranks inferred diarization.`
                    : desk.processing.routing.sourceTopology === "mixed-room"
                      ? "This source contains a room mix, so provider speaker labels remain candidates until reviewed."
                      : "The source has no verified participant ownership, so speaker identity remains unresolved until reviewed."}
                </p>
                <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg bg-indigo-50 p-3"><dt className="font-black uppercase tracking-wide text-indigo-700">Provider</dt><dd className="mt-1 font-bold text-indigo-950">{humanize(desk.processing.routing.provider || "unknown")}</dd></div>
                  <div className="rounded-lg bg-indigo-50 p-3"><dt className="font-black uppercase tracking-wide text-indigo-700">Model receipt</dt><dd className="mt-1 font-bold text-indigo-950">{desk.processing.routing.model || "Not recorded"} · {humanize(desk.processing.routing.modelRevisionPolicy || "unknown")}</dd></div>
                  <div className="rounded-lg bg-indigo-50 p-3"><dt className="font-black uppercase tracking-wide text-indigo-700">Speaker policy</dt><dd className="mt-1 font-bold text-indigo-950">{humanize(desk.processing.routing.speakerAuthority)} · diarization {desk.processing.routing.diarizationRequested ? "on" : "off"}</dd></div>
                  <div className="rounded-lg bg-indigo-50 p-3"><dt className="font-black uppercase tracking-wide text-indigo-700">Vocabulary</dt><dd className="mt-1 font-bold text-indigo-950">{desk.processing.routing.terminologyKeytermCount > 0 ? `${desk.processing.routing.terminologyKeytermCount} frozen keyterms` : "No provider keyterms"}</dd></div>
                </dl>
                <p className="mt-3 text-[0.7rem] font-bold leading-relaxed text-indigo-800">Timing: {humanize(desk.processing.routing.timingGranularity || "unknown")} · Language: {desk.processing.routing.language || "provider default"} · Provider output remains immutable evidence; corrections and verified speaker identity are separate.</p>
                </div>
              ) : null}
            </details>
          </div>
        )}
      </div>

      {showRecordingEditor && recordingEditor ? <div id="inline-recording-editor" className="scroll-mt-24">{typeof recordingEditor === "function" ? recordingEditor(recordingEditorFocus) : recordingEditor}</div> : null}

      {audioMastery ? <section aria-label="Session audio improvement" className="scroll-mt-24">{audioMastery}</section> : null}

      {desk.gate.allowed && (desk.speakerGroups ?? []).length > 0 ? (
        <section className={`rounded-2xl border p-4 shadow-sm ${unidentifiedSpeakerCount > 0 ? "border-indigo-300 bg-indigo-50" : "border-emerald-200 bg-emerald-50/45"}`} aria-labelledby="voice-labels-heading">
          <button
            type="button"
            aria-expanded={showSpeakerIdentity}
            aria-controls="voice-labels-details"
            onClick={() => setShowSpeakerIdentity((current) => !current)}
            className="flex min-h-11 w-full items-center justify-between gap-4 rounded-xl text-left"
          >
            <span>
              <span id="voice-labels-heading" className="block text-sm font-black text-indigo-950">{unidentifiedSpeakerCount > 0 ? "Name the voices" : "Voices named"}</span>
              <span className="mt-1 block text-xs font-semibold leading-5 text-indigo-950/75">
                {unidentifiedSpeakerCount > 0
                  ? `${unidentifiedSpeakerCount} voice${unidentifiedSpeakerCount === 1 ? " needs" : "s need"} a name. Listen to a short sample and choose the person once for this Session.`
                  : `All ${identifiedSpeakerCount} voice${identifiedSpeakerCount === 1 ? " is" : "s are"} named. You can change a name here without changing the recording.`}
              </span>
            </span>
            <span className="shrink-0 rounded-full border border-indigo-300 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-indigo-900">{showSpeakerIdentity ? "Hide" : unidentifiedSpeakerCount > 0 ? "Name voices" : "Review"}</span>
          </button>
          {showSpeakerIdentity ? <div id="voice-labels-details" className="mt-4">
            <SpeakerAttributionPanel
              roomId={roomId}
              groups={desk.speakerGroups ?? []}
              participants={desk.participants ?? []}
              playbackReady={playbackReady}
              reviewedSecondBins={listenedSecondBins}
              currentPlaybackPosition={() => mediaRef.current?.currentTime ?? null}
              busy={busy}
              onPlayAt={playFromTime}
              onSaved={saved}
            />
          </div> : null}
        </section>
      ) : null}

      {desk.gate.allowed && desk.segments.length ? (
        <section aria-labelledby="linear-transcript-heading" className="rounded-2xl border border-[#e5d5b7] bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#987443]">Review and correct</p>
              <h3 id="linear-transcript-heading" className="mt-1 font-serif text-2xl font-black text-[#3d3122]">Transcript</h3>
              <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-[#765f40]">Play any passage, correct the words or speaker, or confirm it as heard. Notes, tasks, and goals stay attached to the exact source moment.</p>
            </div>
            <div role="group" aria-label="Transcript view" className="inline-flex rounded-full border border-[#d9c7a5] bg-[#fffaf1] p-1">
              <button type="button" aria-pressed={transcriptView === "transcript"} onClick={() => setTranscriptView("transcript")} className={`min-h-10 rounded-full px-4 text-xs font-black ${transcriptView === "transcript" ? "bg-[#3d3122] text-white shadow-sm" : "text-[#5b472f]"}`}>Transcript</button>
              <button type="button" aria-pressed={transcriptView === "recording-transcript"} onClick={() => setTranscriptView("recording-transcript")} className={`min-h-10 rounded-full px-4 text-xs font-black ${transcriptView === "recording-transcript" ? "bg-[#3d3122] text-white shadow-sm" : "text-[#5b472f]"}`}>Recording + transcript</button>
            </div>
          </div>
          <div className={transcriptView === "recording-transcript" ? "grid min-w-0 gap-5 xl:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.45fr)] xl:items-start" : "space-y-5"}>
            <div className={transcriptView === "recording-transcript" ? "xl:sticky xl:top-24" : ""}>
              {protectedPlaybackSurface}
            </div>
            <ol className="min-w-0 space-y-4">
              {desk.segments.map((segment) => (
                <CorrectionEditor
                  key={segment.id}
                  roomId={roomId}
                  transcriptJobId={desk.transcriptJobId!}
                  segment={segment}
                  canUseProjectTeamNotes={canUseProjectTeamNotes}
                  playbackReady={playbackReady}
                  playbackReviewed={listenedSecondBins.has(Math.max(0, Math.floor(segment.startSeconds)))}
                  reviewedPlaybackPositionSeconds={listenedSecondBins.has(Math.max(0, Math.floor(segment.startSeconds))) ? segment.startSeconds : null}
                  currentPlaybackPosition={() => mediaRef.current?.currentTime ?? null}
                  busy={busy}
                  onPlay={() => playFrom(segment)}
                  onPlayAt={playFromTime}
                  onEditRecording={canEditRecording && recordingEditor ? openRecordingEditorAt : undefined}
                  onSaved={saved}
                />
              ))}
            </ol>
          </div>
        </section>
      ) : desk.gate.allowed ? <div className="rounded-2xl border border-dashed border-[#d8c7a7] bg-white/55 p-5 text-sm font-semibold text-[#7a6548]">No persisted transcript segments are available for this session.</div> : protectedPlaybackSurface}

      <section id="transcript-audio-review" tabIndex={-1} className="rounded-2xl border border-sky-200 bg-sky-50/45 p-4 shadow-sm" aria-labelledby="transcript-quality-heading">
        <button
          type="button"
          aria-expanded={showQualityDetails}
          aria-controls="transcript-quality-details"
          onClick={() => setShowQualityDetails((current) => !current)}
          className="flex min-h-11 w-full items-center justify-between gap-4 rounded-xl text-left"
        >
          <span>
            <span id="transcript-quality-heading" className="block text-sm font-black text-sky-950">Audio, timing, and accuracy</span>
            <span className="mt-1 block text-xs font-semibold leading-5 text-sky-950/75">The transcript stays first. Open this when you want waveform, timing, source-health, or accuracy evidence.</span>
          </span>
          <span className="shrink-0 rounded-full border border-sky-300 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-sky-900">{showQualityDetails ? "Hide details" : "Show details"}</span>
        </button>
        <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-wide">
          <span className={`rounded-full px-3 py-1.5 ${playbackReady ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>{playbackReady ? "Recording ready" : "Recording needs attention"}</span>
          <span className={`rounded-full px-3 py-1.5 ${timingIntegrity?.disposition === "structurally-consistent" ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>{timingIntegrity ? `${timingIntegrity.editableSegmentCount}/${desk.segments.length} timed passages` : "Timing not measured"}</span>
          {(desk.speakerGroups ?? []).length > 0 ? <span className={`rounded-full px-3 py-1.5 ${identifiedSpeakerCount === desk.speakerGroups.length ? "bg-emerald-100 text-emerald-900" : "bg-indigo-100 text-indigo-900"}`}>{identifiedSpeakerCount}/{desk.speakerGroups.length} voices identified</span> : null}
          <span className="rounded-full bg-violet-100 px-3 py-1.5 text-violet-900">{reviewedSegmentCount}/{desk.segments.length} passages reviewed</span>
        </div>

        {showQualityDetails ? <div id="transcript-quality-details" className="mt-5 space-y-5">
          {desk.evidence ? <AudioTranscriptEvidencePanel
              evidence={desk.evidence}
              segments={desk.segments}
              playbackReady={playbackReady}
              selectedSeconds={playbackSeconds}
              onSelectTime={setPlaybackSeconds}
              onPlayAt={playFromTime}
            /> : null}

          {desk.playback && desk.spectralContext ? <SpectralEvidenceViewer
            projectSlug={desk.spectralContext.projectSlug}
            assetId={desk.spectralContext.assetId}
            sourceId={desk.spectralContext.sourceId}
            selectedSeconds={playbackSeconds}
            playbackReady={playbackReady}
            onSelect={(seconds, play) => {
              setPlaybackSeconds(seconds);
              if (play) void playFromTime(seconds);
            }}
            transcriptWords={spectralTranscriptWords}
            lowConfidenceThreshold={desk.evidence?.transcript.lowConfidenceThreshold ?? null}
            transcriptEndSeconds={desk.evidence?.transcript.transcriptEndSeconds ?? null}
            transcriptScopeLabel="Session timed transcript"
            evidenceMarkers={spectralEvidenceMarkers}
          /> : null}

          {desk.playback && desk.spectralContext && detectorDurationSeconds > 0 ? <AudibleEventQualificationLab
            projectSlug={desk.spectralContext.projectSlug}
            assetId={desk.spectralContext.assetId}
            sourceId={desk.spectralContext.sourceId}
            sourceUrl={desk.playback.url}
            durationSeconds={detectorDurationSeconds}
            defaultWorkload={desk.evaluation?.suggestedWorkload ?? "coaching"}
          /> : null}

          {desk.evaluation ? <TranscriptAccuracyCorpusPanel
            roomId={roomId}
            evaluation={desk.evaluation}
            busy={busy}
            listenedSecondBins={[...listenedSecondBins].sort((left, right) => left - right)}
            playbackSourceId={playbackReady ? desk.playback?.sourceId ?? null : null}
            onSaved={saved}
          /> : null}
        </div> : null}
      </section>

    </section>
  );
}
