"use client";

import { useId, useMemo, useState, type MouseEvent } from "react";

import type { AudioTranscriptEvidence } from "@/lib/transcript-evidence";

import { timestampForSeconds } from "./session-review-model";

type SignalEvidence = NonNullable<AudioTranscriptEvidence["audio"]["signal"]>;
type TimelineEvent = AudioTranscriptEvidence["audio"]["timelineEvents"][number];
type ViewMode = "whole" | "minute" | "detail";

export type AudioEvidenceTranscriptWord = {
  id: string;
  segmentId: string;
  text: string;
  startSeconds: number;
  endSeconds: number;
  confidence: number | null;
  reviewState: "unchecked" | "confirmed" | "corrected";
};

export type AudioEvidenceViewSpan = {
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
};

const VIEW_SECONDS: Record<Exclude<ViewMode, "whole">, number> = {
  minute: 60,
  detail: 15,
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function audioEvidenceViewSpan(
  durationSeconds: number,
  selectedSeconds: number,
  mode: ViewMode,
): AudioEvidenceViewSpan {
  const duration = Math.max(0.001, Number.isFinite(durationSeconds) ? durationSeconds : 0.001);
  if (mode === "whole") return { startSeconds: 0, endSeconds: duration, durationSeconds: duration };
  const requestedDuration = Math.min(duration, VIEW_SECONDS[mode]);
  const half = requestedDuration / 2;
  const startSeconds = clamp(selectedSeconds - half, 0, Math.max(0, duration - requestedDuration));
  return {
    startSeconds,
    endSeconds: startSeconds + requestedDuration,
    durationSeconds: requestedDuration,
  };
}

export function audioEvidencePointAt(signal: SignalEvidence, seconds: number) {
  const exact = signal.waveform.find((point) => seconds >= point.startSeconds && seconds < point.startSeconds + point.durationSeconds);
  if (exact) return exact;
  return signal.waveform.reduce<(typeof signal.waveform)[number] | null>((nearest, point) => {
    if (!nearest) return point;
    const pointCenter = point.startSeconds + point.durationSeconds / 2;
    const nearestCenter = nearest.startSeconds + nearest.durationSeconds / 2;
    return Math.abs(pointCenter - seconds) < Math.abs(nearestCenter - seconds) ? point : nearest;
  }, null);
}

export function audioEvidenceMapSummary(signal: SignalEvidence) {
  return {
    nearSilentWindowCount: signal.waveform.filter((point) => point.rmsDbfs <= signal.thresholds.nearSilenceDbfs).length,
    clippingWindowCount: signal.waveform.filter((point) => point.clippedFrameCount > 0).length,
    observationCount: signal.observations.length,
  };
}

export function audioEvidenceWordAt(words: AudioEvidenceTranscriptWord[], seconds: number) {
  return words.find((word) => seconds >= word.startSeconds && seconds < word.endSeconds) ?? null;
}

export function audioEvidenceTranscriptSummary(words: AudioEvidenceTranscriptWord[], lowConfidenceThreshold: number | null) {
  return {
    timedWordCount: words.length,
    reviewedWordCount: words.filter((word) => word.reviewState !== "unchecked").length,
    correctedWordCount: words.filter((word) => word.reviewState === "corrected").length,
    attentionWordCount: lowConfidenceThreshold === null
      ? null
      : words.filter((word) => word.confidence !== null && word.confidence < lowConfidenceThreshold).length,
  };
}

function levelHeight(dbfs: number, maximumHeight: number) {
  const normalized = (clamp(dbfs, -96, 0) + 96) / 96;
  return Math.max(1, normalized * maximumHeight);
}

export function AudioEvidenceMap({
  signal,
  timelineEvents,
  transcriptEndSeconds,
  playbackReady,
  selectedSeconds,
  onSelect,
  transcriptWords = [],
  lowConfidenceThreshold = null,
  providerLabel = null,
}: {
  signal: SignalEvidence;
  timelineEvents: TimelineEvent[];
  transcriptEndSeconds: number | null;
  playbackReady: boolean;
  selectedSeconds: number;
  onSelect: (seconds: number, play: boolean) => void;
  transcriptWords?: AudioEvidenceTranscriptWord[];
  lowConfidenceThreshold?: number | null;
  providerLabel?: string | null;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("whole");
  const titleId = useId();
  const descriptionId = useId();
  const width = 1_000;
  const height = 210;
  const plotTop = 22;
  const plotBottom = 146;
  const center = (plotTop + plotBottom) / 2;
  const maximumLevelHeight = (plotBottom - plotTop) / 2 - 3;
  const transcriptTop = 154;
  const transcriptBottom = 176;
  const span = audioEvidenceViewSpan(signal.durationSeconds, selectedSeconds, viewMode);
  const x = (seconds: number) => clamp(((seconds - span.startSeconds) / span.durationSeconds) * width, 0, width);
  const visiblePoints = signal.waveform.filter((point) => point.startSeconds < span.endSeconds && point.startSeconds + point.durationSeconds > span.startSeconds);
  const selectedPoint = useMemo(() => audioEvidencePointAt(signal, selectedSeconds), [selectedSeconds, signal]);
  const selectedWord = useMemo(() => audioEvidenceWordAt(transcriptWords, selectedSeconds), [selectedSeconds, transcriptWords]);
  const summary = useMemo(() => audioEvidenceMapSummary(signal), [signal]);
  const transcriptSummary = useMemo(() => audioEvidenceTranscriptSummary(transcriptWords, lowConfidenceThreshold), [lowConfidenceThreshold, transcriptWords]);
  const visibleObservations = signal.observations.filter((observation) => observation.startSeconds <= span.endSeconds && observation.endSeconds >= span.startSeconds);
  const visibleEvents = timelineEvents.filter((event) => event.startSeconds >= span.startSeconds && event.startSeconds <= span.endSeconds);
  const visibleWords = transcriptWords.filter((word) => word.startSeconds < span.endSeconds && word.endSeconds > span.startSeconds);

  function selectFromMap(event: MouseEvent<HTMLButtonElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const fraction = bounds.width > 0 ? clamp((event.clientX - bounds.left) / bounds.width, 0, 1) : 0;
    onSelect(span.startSeconds + fraction * span.durationSeconds, playbackReady);
  }

  return <section className="mt-4 rounded-xl border border-sky-200 bg-slate-950 p-3 text-white sm:p-4" aria-label="Audio evidence map">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.14em] text-sky-200">Audio evidence map</p>
        <p className="mt-1 max-w-3xl text-[10px] font-bold leading-4 text-slate-300">Windowed RMS energy and sample peaks from the complete decode—not a sample-level waveform. Color marks measured conditions; listening decides what they mean.</p>
      </div>
      <div className="grid grid-cols-3 gap-1 rounded-lg border border-slate-700 bg-slate-900 p-1" role="group" aria-label="Audio evidence map zoom">
        {(["whole", "minute", "detail"] as const).map((mode) => <button key={mode} type="button" aria-pressed={viewMode === mode} onClick={() => setViewMode(mode)} className={`min-h-9 rounded-md px-2 text-[9px] font-black uppercase tracking-wide ${viewMode === mode ? "bg-sky-200 text-sky-950" : "text-slate-300 hover:bg-slate-800"}`}>{mode === "whole" ? "Whole" : mode === "minute" ? "60 sec" : "15 sec"}</button>)}
      </div>
    </div>

    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[9px] font-black uppercase tracking-wide text-slate-300" aria-label="Audio evidence legend">
      <span><span className="mr-1 inline-block h-2 w-3 rounded-sm bg-sky-500 align-middle" />RMS energy</span>
      <span><span className="mr-1 inline-block h-0.5 w-3 bg-violet-300 align-middle" />Sample peak</span>
      <span><span className="mr-1 inline-block h-2 w-3 rounded-sm bg-slate-500 align-middle" />Near-silent window</span>
      <span><span className="mr-1 inline-block h-2 w-3 rounded-sm bg-rose-500 align-middle" />Clipping observed</span>
      <span><span className="mr-1 inline-block h-3 w-0.5 bg-amber-300 align-middle" />Capture boundary</span>
      <span><span className="mr-1 inline-block h-3 w-0.5 bg-emerald-300 align-middle" />Transcript end</span>
      {transcriptWords.length > 0 && <><span><span className="mr-1 inline-block h-2 w-3 rounded-sm bg-slate-500 align-middle" />Timed transcript word</span><span><span className="mr-1 inline-block h-2 w-3 rounded-sm bg-blue-400 align-middle" />Playback reviewed</span><span><span className="mr-1 inline-block h-2 w-3 rounded-sm bg-violet-400 align-middle" />Provider attention</span></>}
    </div>

    <button type="button" onClick={selectFromMap} className="mt-3 block w-full overflow-hidden rounded-lg border border-slate-700 bg-[#111827] text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300" aria-label={`Audio evidence map from ${timestampForSeconds(span.startSeconds)} to ${timestampForSeconds(span.endSeconds)}. Select a position${playbackReady ? " to play from that time" : " for inspection"}.`}>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-52 w-full" role="img" aria-labelledby={`${titleId} ${descriptionId}`} preserveAspectRatio="none">
        <title id={titleId}>Windowed decoded audio energy, timed transcript words, and review markers</title>
        <desc id={descriptionId}>Symmetrical bars show RMS energy. Thin violet lines show sample peaks. Gray windows crossed the near-silence threshold, red windows contained clipped frames, amber lines are capture boundaries, green marks the timed transcript end, and cyan marks the selected playback position. The lower lane shows provider-timed words and their human review state; provider confidence is triage evidence, not measured word accuracy.</desc>
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
          const gridX = fraction * width;
          const gridSeconds = span.startSeconds + fraction * span.durationSeconds;
          return <g key={fraction}><line x1={gridX} x2={gridX} y1={plotTop} y2={plotBottom} stroke="#334155" strokeDasharray="2 7" /><text x={clamp(gridX + 5, 5, width - 55)} y="13" fill="#94a3b8" fontSize="10" fontWeight="700">{timestampForSeconds(gridSeconds)}</text></g>;
        })}
        <line x1="0" x2={width} y1={center} y2={center} stroke="#475569" />
        {visiblePoints.map((point, index) => {
          const start = Math.max(point.startSeconds, span.startSeconds);
          const end = Math.min(point.startSeconds + point.durationSeconds, span.endSeconds);
          const pointX = x(start);
          const pointWidth = Math.max(1, x(end) - pointX - 0.35);
          const rmsHeight = levelHeight(point.rmsDbfs, maximumLevelHeight);
          const peakHeight = levelHeight(point.samplePeakDbfs, maximumLevelHeight);
          const nearSilent = point.rmsDbfs <= signal.thresholds.nearSilenceDbfs;
          const clipped = point.clippedFrameCount > 0;
          const fill = clipped ? "#f43f5e" : nearSilent ? "#64748b" : "#0ea5e9";
          return <g key={`${point.startSeconds}-${index}`}>
            {nearSilent || clipped ? <rect x={pointX} y={plotTop} width={pointWidth} height={plotBottom - plotTop} fill={fill} opacity="0.1" /> : null}
            <rect x={pointX} y={center - rmsHeight} width={pointWidth} height={rmsHeight * 2} rx="0.8" fill={fill} opacity="0.78" />
            <line x1={pointX + pointWidth / 2} x2={pointX + pointWidth / 2} y1={center - peakHeight} y2={center + peakHeight} stroke={clipped ? "#fb7185" : "#c4b5fd"} strokeWidth={Math.max(0.8, Math.min(2, pointWidth / 3))} />
          </g>;
        })}
        {visibleEvents.map((event, index) => <g key={`${event.kind}-${event.startSeconds}-${index}`}><line x1={x(event.startSeconds)} x2={x(event.startSeconds)} y1={plotTop - 3} y2={plotBottom + 3} stroke="#fcd34d" strokeWidth="2" /><circle cx={x(event.startSeconds)} cy={plotTop - 4} r="4" fill="#fcd34d"><title>{timestampForSeconds(event.startSeconds)} {event.kind}</title></circle></g>)}
        {visibleObservations.map((observation, index) => <line key={`${observation.kind}-${observation.startSeconds}-${index}`} x1={x(observation.startSeconds)} x2={x(observation.startSeconds)} y1={plotTop} y2={plotBottom} stroke={observation.severity === "warning" ? "#fb7185" : "#fbbf24"} strokeWidth="2" strokeDasharray="5 3"><title>{timestampForSeconds(observation.startSeconds)} {observation.detail}</title></line>)}
        {transcriptEndSeconds !== null && transcriptEndSeconds >= span.startSeconds && transcriptEndSeconds <= span.endSeconds ? <g><line x1={x(transcriptEndSeconds)} x2={x(transcriptEndSeconds)} y1={plotTop - 4} y2={plotBottom + 4} stroke="#6ee7b7" strokeWidth="2" strokeDasharray="4 3" /><text x={clamp(x(transcriptEndSeconds) + 5, 5, width - 95)} y={plotBottom + 16} fill="#a7f3d0" fontSize="9" fontWeight="800">Transcript end</text></g> : null}
        {visibleWords.map((word) => {
          const start = Math.max(word.startSeconds, span.startSeconds);
          const end = Math.min(word.endSeconds, span.endSeconds);
          const wordX = x(start);
          const wordWidth = Math.max(1, x(end) - wordX - 0.35);
          const needsAttention = lowConfidenceThreshold !== null && word.confidence !== null && word.confidence < lowConfidenceThreshold;
          const fill = word.reviewState === "corrected" ? "#34d399" : word.reviewState === "confirmed" ? "#60a5fa" : needsAttention ? "#a78bfa" : "#475569";
          return <rect key={word.id} x={wordX} y={transcriptTop} width={wordWidth} height={transcriptBottom - transcriptTop} rx="1" fill={fill} opacity="0.9"><title>{timestampForSeconds(word.startSeconds)} {word.text} · {word.reviewState}{word.confidence === null ? " · provider confidence unavailable" : ` · provider confidence ${Math.round(word.confidence * 100)}%`}</title></rect>;
        })}
        {transcriptWords.length > 0 && <text x="6" y="198" fill="#94a3b8" fontSize="9" fontWeight="800">Timed transcript · {transcriptSummary.reviewedWordCount}/{transcriptSummary.timedWordCount} words in reviewed segments{transcriptSummary.attentionWordCount === null ? " · no cross-provider confidence threshold" : ` · ${transcriptSummary.attentionWordCount} provider-attention words`}</text>}
        <line x1={x(selectedSeconds)} x2={x(selectedSeconds)} y1={plotTop - 7} y2={transcriptWords.length > 0 ? transcriptBottom + 7 : plotBottom + 7} stroke="#67e8f9" strokeWidth="2.5" />
      </svg>
    </button>

    <div className="mt-3 grid grid-cols-2 gap-2 text-[9px] font-bold sm:grid-cols-5">
      <div className="rounded-lg bg-slate-900 p-2"><div className="font-mono text-sm font-black text-cyan-200">{timestampForSeconds(selectedSeconds)}</div><div className="text-slate-400">Selected time</div></div>
      <div className="rounded-lg bg-slate-900 p-2"><div className="font-mono text-sm font-black text-sky-200">{selectedPoint ? selectedPoint.rmsDbfs.toFixed(1) : "—"}</div><div className="text-slate-400">Window RMS dBFS</div></div>
      <div className="rounded-lg bg-slate-900 p-2"><div className="font-mono text-sm font-black text-violet-200">{selectedPoint ? selectedPoint.samplePeakDbfs.toFixed(1) : "—"}</div><div className="text-slate-400">Sample peak dBFS</div></div>
      <div className="rounded-lg bg-slate-900 p-2"><div className="font-mono text-sm font-black text-slate-200">{summary.nearSilentWindowCount}</div><div className="text-slate-400">Near-silent windows</div></div>
      <div className="col-span-2 rounded-lg bg-slate-900 p-2 sm:col-span-1"><div className={`font-mono text-sm font-black ${summary.clippingWindowCount ? "text-rose-300" : "text-emerald-300"}`}>{summary.clippingWindowCount}</div><div className="text-slate-400">Clipping windows · {summary.observationCount} flags</div></div>
    </div>
    {selectedWord && <section className="mt-2 rounded-lg border border-slate-700 bg-slate-900 p-3" aria-label="Selected transcript word evidence"><div className="flex flex-wrap items-baseline justify-between gap-2"><div className="font-serif text-lg font-black text-white">{selectedWord.text}</div><div className="font-mono text-[10px] font-black text-cyan-200">{timestampForSeconds(selectedWord.startSeconds)}–{timestampForSeconds(selectedWord.endSeconds)}</div></div><p className="mt-1 text-[9px] font-bold leading-4 text-slate-300">{selectedWord.confidence === null ? "Provider confidence unavailable" : `${providerLabel || "Provider"} confidence ${Math.round(selectedWord.confidence * 100)}%`} · {selectedWord.reviewState === "corrected" ? "provider word inside a playback-corrected segment; timing remains provider evidence" : selectedWord.reviewState === "confirmed" ? "provider segment confirmed against playback" : "unchecked provider word"}. Confidence prioritizes listening; only reviewed reference text measures error.</p></section>}
    <p className="mt-3 text-[9px] font-bold leading-4 text-slate-400">The display never stretches a window into sample accuracy. Zoom centers on the selected time; the exact immutable source remains the listening authority.</p>
  </section>;
}
