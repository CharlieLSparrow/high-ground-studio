"use client";

import { useMemo, useState, type MouseEvent } from "react";

import type { AudibleEventDetectorReceipt } from "@/lib/audio/audible-event-analysis";
import type { AudibleEventReviewStatus } from "@/lib/audio/audible-event-review";
import type { AudioTranscriptEvidence } from "@/lib/transcript-evidence";

type SignalEvidence = NonNullable<AudioTranscriptEvidence["audio"]["signal"]>;

export type AudibleEventReviewState =
  | "measured-needs-listening"
  | "unreviewed"
  | "confirmed"
  | "false-positive"
  | "needs-comparison";

export type AudibleEventMoment = {
  id: string;
  family: "signal" | "dialogue" | "content" | "environment" | "capture";
  label: string;
  startSeconds: number;
  endSeconds: number;
  detail: string;
  severity: "attention" | "warning";
  originLabel: string;
  confidence: number | null;
  reviewState: AudibleEventReviewState;
  dialogueCandidateId: string | null;
  detectorAnalysisId: string | null;
  detectorEventId: string | null;
};

export type AudibleEventDialogueEntry = {
  candidate: {
    candidateId: string;
    label: "mouth-click" | "plosive" | "sibilance" | "breath" | "clipping" | "noise-event";
    range: { startSeconds: number; endSeconds: number };
    origin:
      | { kind: "human-marked" }
      | { kind: "detector-suggestion"; detectorId?: string; detectorVersion?: string; score?: number; qualificationStatus?: "unqualified" }
      | { kind: "qualified-detector"; detectorId?: string; detectorVersion?: string; score?: number; corpusId?: string; qualificationRunId?: string }
      | { kind: string; score?: number; detectorId?: string };
    context?: { speakerLabel?: string | null };
  };
  latestReview: null | { decision: "confirmed" | "false-positive" | "needs-comparison"; note?: string | null };
};

type ViewMode = "whole" | "minute" | "detail";
type FamilyFilter = "all" | AudibleEventMoment["family"];
type ReviewFilter = "all" | "needs-review" | "confirmed" | "dismissed";

const VIEW_SECONDS: Record<Exclude<ViewMode, "whole">, number> = { minute: 60, detail: 15 };
const FAMILY_LABELS: Record<AudibleEventMoment["family"], string> = {
  signal: "Signal",
  dialogue: "Dialogue",
  content: "Content",
  environment: "Environment",
  capture: "Capture",
};
const FAMILY_COLORS: Record<AudibleEventMoment["family"], string> = {
  signal: "var(--color-quipsly-lake-400)",
  dialogue: "var(--color-quipsly-brass-400)",
  content: "var(--color-quipsly-fern-400)",
  environment: "var(--color-quipsly-rosewood-400)",
  capture: "var(--color-quipsly-inkberry-400)",
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function humanize(value: string) {
  return value.replaceAll("-", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function clock(seconds: number) {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const hours = Math.floor(safe / 3_600);
  const minutes = Math.floor((safe % 3_600) / 60);
  const remainder = Math.floor(safe % 60).toString().padStart(2, "0");
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, "0")}:${remainder}`
    : `${minutes.toString().padStart(2, "0")}:${remainder}`;
}

export function audibleEventViewSpan(durationSeconds: number, selectedSeconds: number, mode: ViewMode) {
  const duration = Math.max(0.001, Number.isFinite(durationSeconds) ? durationSeconds : 0.001);
  if (mode === "whole") return { startSeconds: 0, endSeconds: duration, durationSeconds: duration };
  const requestedDuration = Math.min(duration, VIEW_SECONDS[mode]);
  const startSeconds = clamp(selectedSeconds - requestedDuration / 2, 0, Math.max(0, duration - requestedDuration));
  return { startSeconds, endSeconds: startSeconds + requestedDuration, durationSeconds: requestedDuration };
}

export function audibleEventMapMoments(
  signal: SignalEvidence | null,
  dialogueEntries: AudibleEventDialogueEntry[],
  detectorReceipt: AudibleEventDetectorReceipt | null = null,
  detectorReviewStatus: AudibleEventReviewStatus | null = null,
): AudibleEventMoment[] {
  const detectorReviews = new Map(
    detectorReviewStatus && detectorReceipt && detectorReviewStatus.analysis?.analysisId === detectorReceipt.analysisId
      ? detectorReviewStatus.entries.map((entry) => [entry.suggestion.eventId, entry.latestReview?.decision ?? "unreviewed"] as const)
      : [],
  );
  const measured = signal?.observations.map((observation, index): AudibleEventMoment => ({
    id: `signal-${observation.kind}-${observation.startSeconds}-${index}`,
    family: "signal",
    label: humanize(observation.kind),
    startSeconds: observation.startSeconds,
    endSeconds: observation.endSeconds,
    detail: observation.detail,
    severity: observation.severity,
    originLabel: "Complete-decode measurement",
    confidence: null,
    reviewState: "measured-needs-listening",
    dialogueCandidateId: null,
    detectorAnalysisId: null,
    detectorEventId: null,
  })) ?? [];

  const dialogue = dialogueEntries.map((entry): AudibleEventMoment => {
    const origin = entry.candidate.origin;
    const detectorScore = "score" in origin ? origin.score : undefined;
    const detectorId = "detectorId" in origin ? origin.detectorId : undefined;
    const confidence = typeof detectorScore === "number" && Number.isFinite(detectorScore)
      ? clamp(detectorScore, 0, 1)
      : null;
    const originLabel = origin.kind === "human-marked"
      ? "Human source-clock mark"
      : origin.kind === "qualified-detector"
        ? `Qualified detector${detectorId ? ` · ${detectorId}` : ""}`
        : `Unqualified detector suggestion${detectorId ? ` · ${detectorId}` : ""}`;
    const reviewState = entry.latestReview?.decision ?? "unreviewed";
    const speaker = entry.candidate.context?.speakerLabel?.trim();
    return {
      id: `dialogue-${entry.candidate.candidateId}`,
      family: "dialogue",
      label: humanize(entry.candidate.label),
      startSeconds: entry.candidate.range.startSeconds,
      endSeconds: entry.candidate.range.endSeconds,
      detail: [speaker ? `Speaker ${speaker}.` : null, entry.latestReview?.note || null, "Listening decides whether this candidate is audible and consequential."].filter(Boolean).join(" "),
      severity: entry.candidate.label === "clipping" ? "warning" : "attention",
      originLabel,
      confidence,
      reviewState,
      dialogueCandidateId: entry.candidate.candidateId,
      detectorAnalysisId: null,
      detectorEventId: null,
    };
  });

  const detector = detectorReceipt?.status === "completed"
    ? detectorReceipt.suggestions.map((suggestion): AudibleEventMoment => ({
      id: `detector-${detectorReceipt.analysisId}-${suggestion.eventId}`,
      family: suggestion.family,
      label: suggestion.displayLabel,
      startSeconds: suggestion.startSeconds,
      endSeconds: suggestion.endSeconds,
      detail: suggestion.detail,
      severity: "attention",
      originLabel: "Unqualified on-device detector suggestion · Apple general sound classifier",
      confidence: suggestion.confidence,
      reviewState: detectorReviews.get(suggestion.eventId) ?? "unreviewed",
      dialogueCandidateId: null,
      detectorAnalysisId: detectorReceipt.analysisId,
      detectorEventId: suggestion.eventId,
    }))
    : [];

  return [...measured, ...dialogue, ...detector]
    .filter((moment) => Number.isFinite(moment.startSeconds) && Number.isFinite(moment.endSeconds) && moment.endSeconds >= moment.startSeconds)
    .sort((left, right) => left.startSeconds - right.startSeconds || left.id.localeCompare(right.id))
    .slice(0, 5_000);
}

export function audibleEventMapSummary(moments: AudibleEventMoment[]) {
  return {
    total: moments.length,
    needsReview: moments.filter((moment) => moment.reviewState === "unreviewed" || moment.reviewState === "needs-comparison" || moment.reviewState === "measured-needs-listening").length,
    confirmed: moments.filter((moment) => moment.reviewState === "confirmed").length,
    dismissed: moments.filter((moment) => moment.reviewState === "false-positive").length,
    detectorSuggestions: moments.filter((moment) => moment.originLabel.includes("detector")).length,
  };
}

export function AudibleEventMap({
  durationSeconds,
  signal,
  moments,
  selectedSeconds,
  onSelect,
}: {
  durationSeconds: number;
  signal: SignalEvidence | null;
  moments: AudibleEventMoment[];
  selectedSeconds: number;
  onSelect: (moment: AudibleEventMoment | null, seconds: number, play: boolean) => void;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("whole");
  const [familyFilter, setFamilyFilter] = useState<FamilyFilter>("all");
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");
  const span = audibleEventViewSpan(durationSeconds, selectedSeconds, viewMode);
  const summary = useMemo(() => audibleEventMapSummary(moments), [moments]);
  const filtered = useMemo(() => moments.filter((moment) => {
    if (familyFilter !== "all" && moment.family !== familyFilter) return false;
    if (reviewFilter === "needs-review" && !["unreviewed", "needs-comparison", "measured-needs-listening"].includes(moment.reviewState)) return false;
    if (reviewFilter === "confirmed" && moment.reviewState !== "confirmed") return false;
    if (reviewFilter === "dismissed" && moment.reviewState !== "false-positive") return false;
    return true;
  }), [familyFilter, moments, reviewFilter]);
  const visibleMoments = filtered.filter((moment) => moment.startSeconds < span.endSeconds && moment.endSeconds >= span.startSeconds);
  const visibleSignal = signal?.waveform.filter((point) => point.startSeconds < span.endSeconds && point.startSeconds + point.durationSeconds > span.startSeconds) ?? [];
  const nearby = [...filtered]
    .sort((left, right) => Math.abs(left.startSeconds - selectedSeconds) - Math.abs(right.startSeconds - selectedSeconds))
    .slice(0, 18)
    .sort((left, right) => left.startSeconds - right.startSeconds);
  const width = 1_000;
  const height = 174;
  const waveformTop = 24;
  const waveformBottom = 118;
  const center = (waveformTop + waveformBottom) / 2;
  const x = (seconds: number) => clamp(((seconds - span.startSeconds) / span.durationSeconds) * width, 0, width);
  const levelHeight = (dbfs: number) => Math.max(1, ((clamp(dbfs, -96, 0) + 96) / 96) * 43);

  function chooseFromMap(event: MouseEvent<HTMLButtonElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const fraction = bounds.width > 0 ? clamp((event.clientX - bounds.left) / bounds.width, 0, 1) : 0;
    const seconds = span.startSeconds + fraction * span.durationSeconds;
    const nearest = visibleMoments.reduce<AudibleEventMoment | null>((current, candidate) => {
      if (!current) return candidate;
      return Math.abs(candidate.startSeconds - seconds) < Math.abs(current.startSeconds - seconds) ? candidate : current;
    }, null);
    onSelect(nearest && Math.abs(nearest.startSeconds - seconds) <= Math.max(0.3, span.durationSeconds / 100) ? nearest : null, seconds, false);
  }

  function inspect(moment: AudibleEventMoment, play = true) {
    setViewMode("detail");
    onSelect(moment, moment.startSeconds, play);
  }

  function adjacent(direction: "previous" | "next") {
    if (filtered.length === 0) return;
    const moment = direction === "next"
      ? filtered.find((candidate) => candidate.startSeconds > selectedSeconds + 0.001) ?? filtered[0]
      : [...filtered].reverse().find((candidate) => candidate.startSeconds < selectedSeconds - 0.001) ?? filtered.at(-1);
    if (moment) inspect(moment);
  }

  return <section className="mt-4 rounded-xl border border-fuchsia-700/70 bg-[#070b17] p-3 text-white" aria-label="Audible event map">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-fuchsia-200">Audible event map</p>
        <h5 className="mt-1 text-base font-black">What happened, where, and who has actually reviewed it</h5>
        <p className="mt-1 max-w-3xl text-[10px] font-bold leading-4 text-slate-300">Measured signal conditions and listening candidates share the immutable source clock. A classifier score is never an audible judgment, and no marker authorizes repair or editing.</p>
      </div>
      <div className="grid grid-cols-3 gap-1 rounded-lg border border-slate-700 bg-slate-900 p-1" role="group" aria-label="Audible event map zoom">
        {(["whole", "minute", "detail"] as const).map((mode) => <button key={mode} type="button" aria-pressed={viewMode === mode} onClick={() => setViewMode(mode)} className={`min-h-9 rounded-md px-2 text-[9px] font-black uppercase tracking-wide ${viewMode === mode ? "bg-fuchsia-200 text-fuchsia-950" : "text-slate-300 hover:bg-slate-800"}`}>{mode === "whole" ? "Whole" : mode === "minute" ? "60 sec" : "15 sec"}</button>)}
      </div>
    </div>

    <div className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-5">
      {[
        [summary.total, "Mapped"],
        [summary.needsReview, "Needs listening"],
        [summary.confirmed, "Confirmed"],
        [summary.dismissed, "False positives"],
        [summary.detectorSuggestions, "Detector suggestions"],
      ].map(([value, label]) => <div key={String(label)} className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-2"><div className="font-mono text-sm font-black text-fuchsia-200">{value}</div><div className="text-[8px] font-black uppercase tracking-wide text-slate-400">{label}</div></div>)}
    </div>

    <div className="mt-3 flex flex-wrap gap-2">
      <label className="text-[9px] font-black uppercase tracking-wide text-slate-400">Family
        <select aria-label="Audible event family" value={familyFilter} onChange={(event) => setFamilyFilter(event.target.value as FamilyFilter)} className="ml-2 min-h-9 rounded-md border border-slate-700 bg-slate-900 px-2 text-[10px] font-bold normal-case text-white">
          <option value="all">All families</option>
          {(Object.keys(FAMILY_LABELS) as AudibleEventMoment["family"][]).map((family) => <option key={family} value={family}>{FAMILY_LABELS[family]}</option>)}
        </select>
      </label>
      <label className="text-[9px] font-black uppercase tracking-wide text-slate-400">Review
        <select aria-label="Audible event review state" value={reviewFilter} onChange={(event) => setReviewFilter(event.target.value as ReviewFilter)} className="ml-2 min-h-9 rounded-md border border-slate-700 bg-slate-900 px-2 text-[10px] font-bold normal-case text-white">
          <option value="all">All states</option><option value="needs-review">Needs listening</option><option value="confirmed">Confirmed</option><option value="dismissed">False positives</option>
        </select>
      </label>
      <div className="ml-auto flex gap-1"><button type="button" disabled={filtered.length === 0} onClick={() => adjacent("previous")} className="min-h-9 rounded-md border border-slate-700 px-3 text-[9px] font-black disabled:opacity-40">← Previous</button><button type="button" disabled={filtered.length === 0} onClick={() => adjacent("next")} className="min-h-9 rounded-md bg-fuchsia-200 px-3 text-[9px] font-black text-fuchsia-950 disabled:opacity-40">Next event →</button></div>
    </div>

    <button type="button" onClick={chooseFromMap} className="mt-3 block w-full overflow-hidden rounded-lg border border-slate-700 bg-slate-950 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300" aria-label={`Audible event source-clock map from ${clock(span.startSeconds)} to ${clock(span.endSeconds)}. Select a position for inspection.`}>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full" role="img" aria-label="Decoded audio energy with measured and reviewable audible events" preserveAspectRatio="none">
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => <g key={fraction}><line x1={fraction * width} x2={fraction * width} y1={waveformTop} y2="148" stroke="#334155" strokeDasharray="2 7" /><text x={clamp(fraction * width + 5, 5, width - 55)} y="13" fill="#94a3b8" fontSize="10" fontWeight="700">{clock(span.startSeconds + span.durationSeconds * fraction)}</text></g>)}
        <line x1="0" x2={width} y1={center} y2={center} stroke="#475569" />
        {visibleSignal.map((point, index) => {
          const start = Math.max(point.startSeconds, span.startSeconds);
          const end = Math.min(point.startSeconds + point.durationSeconds, span.endSeconds);
          const pointX = x(start);
          const pointWidth = Math.max(1, x(end) - pointX - 0.3);
          const height = levelHeight(point.rmsDbfs);
          const fill = point.clippedFrameCount > 0 ? "var(--color-quipsly-rosewood-400)" : point.rmsDbfs <= (signal?.thresholds.nearSilenceDbfs ?? -72) ? "#64748b" : "var(--color-quipsly-lake-500)";
          return <rect key={`${point.startSeconds}-${index}`} x={pointX} y={center - height} width={pointWidth} height={height * 2} rx="0.8" fill={fill} opacity="0.62" />;
        })}
        {signal === null ? <text x="500" y="75" textAnchor="middle" fill="#94a3b8" fontSize="12" fontWeight="800">Decoded waveform evidence is not attached yet; source-clock event marks remain reviewable.</text> : null}
        {visibleMoments.map((moment) => {
          const start = Math.max(moment.startSeconds, span.startSeconds);
          const end = Math.min(Math.max(moment.endSeconds, moment.startSeconds + Math.max(0.03, span.durationSeconds / 800)), span.endSeconds);
          const eventX = x(start);
          const eventWidth = Math.max(3, x(end) - eventX);
          const color = FAMILY_COLORS[moment.family];
          const dismissed = moment.reviewState === "false-positive";
          const confirmed = moment.reviewState === "confirmed";
          return <g key={moment.id} opacity={dismissed ? 0.38 : 1}><rect x={eventX} y="122" width={eventWidth} height="24" rx="3" fill={color} opacity={confirmed ? 0.85 : 0.35} stroke={color} strokeWidth={confirmed ? 2 : 1} strokeDasharray={moment.reviewState === "unreviewed" || moment.reviewState === "measured-needs-listening" ? "4 3" : undefined}><title>{clock(moment.startSeconds)} · {moment.label} · {humanize(moment.reviewState)} · {moment.originLabel}</title></rect><line x1={eventX} x2={eventX} y1={waveformTop} y2="148" stroke={color} strokeWidth={moment.severity === "warning" ? 2.5 : 1.5} strokeDasharray="5 3" /></g>;
        })}
        <line x1={x(selectedSeconds)} x2={x(selectedSeconds)} y1="17" y2="154" stroke="var(--color-quipsly-lake-300)" strokeWidth="2.5" />
        <text x="6" y="166" fill="#94a3b8" fontSize="9" fontWeight="800">Dashed = not yet confirmed · solid = confirmed · faded = false positive · treatment remains a separate reviewed operation</text>
      </svg>
    </button>

    {nearby.length > 0 ? <ul className="mt-3 flex gap-1.5 overflow-x-auto pb-1" aria-label="Audible event review queue">{nearby.map((moment) => <li key={moment.id} className="shrink-0"><button type="button" onClick={() => inspect(moment)} className="min-h-11 min-w-36 rounded-lg border px-2.5 py-2 text-left text-[9px] font-bold" style={{ borderColor: FAMILY_COLORS[moment.family], backgroundColor: `${FAMILY_COLORS[moment.family]}18` }}><span className="flex items-center justify-between gap-2"><span className="font-mono font-black">{clock(moment.startSeconds)}</span><span className="uppercase tracking-wide text-slate-400">{FAMILY_LABELS[moment.family]}</span></span><span className="mt-1 block font-black">{moment.label}</span><span className="mt-0.5 block text-slate-400">{humanize(moment.reviewState)}{moment.confidence === null ? "" : ` · ${Math.round(moment.confidence * 100)}% detector score`}</span></button></li>)}</ul> : <p className="mt-3 rounded-lg border border-emerald-900 bg-emerald-950/30 p-3 text-[10px] font-bold text-emerald-200">No event matches these filters. This means the evidence queue is empty—not that the source has been proof-listened.</p>}

    <p className="mt-3 text-[9px] font-bold leading-4 text-slate-400">Apple Sound Analysis and future custom models enter this surface only as versioned detector suggestions. Human listening receipts, false positives, and qualified-corpus evidence remain visible instead of being collapsed into an “AI fixed it” claim.</p>
  </section>;
}
