"use client";

import { useId, useMemo, useState, type MouseEvent } from "react";

import type { AudioTranscriptEvidence } from "@/lib/transcript-evidence";

function timestampForSeconds(seconds: number) {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safe / 60);
  const remainder = Math.floor(safe % 60).toString().padStart(2, "0");
  return `${minutes.toString().padStart(2, "0")}:${remainder}`;
}

type SignalEvidence = NonNullable<AudioTranscriptEvidence["audio"]["signal"]>;
type TimelineEvent = AudioTranscriptEvidence["audio"]["timelineEvents"][number];
type ViewMode = "whole" | "minute" | "detail";
type DisplayMode = "levels" | "frequency";
type FrequencyProfile = NonNullable<SignalEvidence["frequencyProfile"]>;

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

export type AudioEvidenceAttentionMoment = {
  id: string;
  category: "signal" | "capture" | "transcript";
  startSeconds: number;
  endSeconds: number;
  label: string;
  detail: string;
  severity: "attention" | "warning";
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

export function audioFrequencyWindowAt(profile: FrequencyProfile, seconds: number) {
  const exact = profile.windows.find((point) => seconds >= point.startSeconds && seconds < point.startSeconds + point.durationSeconds);
  if (exact) return exact;
  return profile.windows.reduce<(typeof profile.windows)[number] | null>((nearest, point) => {
    if (!nearest) return point;
    const pointCenter = point.startSeconds + point.durationSeconds / 2;
    const nearestCenter = nearest.startSeconds + nearest.durationSeconds / 2;
    return Math.abs(pointCenter - seconds) < Math.abs(nearestCenter - seconds) ? point : nearest;
  }, null);
}

export function audioEvidenceMapSummary(signal: SignalEvidence) {
  const nearSilentPoints = signal.waveform.filter((point) => point.rmsDbfs <= signal.thresholds.nearSilenceDbfs);
  const clippingPoints = signal.waveform.filter((point) => point.clippedFrameCount > 0);
  return {
    nearSilentWindowCount: nearSilentPoints.length,
    nearSilentDurationSeconds: nearSilentPoints.reduce((total, point) => total + point.durationSeconds, 0),
    clippingWindowCount: clippingPoints.length,
    clippingDurationSeconds: clippingPoints.reduce((total, point) => total + point.durationSeconds, 0),
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

function humanizeEvidenceKind(value: string) {
  return value.replaceAll("-", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function audioEvidenceAttentionMoments(
  signal: SignalEvidence,
  timelineEvents: TimelineEvent[],
  transcriptWords: AudioEvidenceTranscriptWord[],
  lowConfidenceThreshold: number | null,
): AudioEvidenceAttentionMoment[] {
  const signalMoments = signal.observations.map((observation, index): AudioEvidenceAttentionMoment => ({
    id: `signal-${observation.kind}-${observation.startSeconds}-${index}`,
    category: "signal",
    startSeconds: observation.startSeconds,
    endSeconds: observation.endSeconds,
    label: humanizeEvidenceKind(observation.kind),
    detail: observation.detail,
    severity: observation.severity,
  }));
  const captureMoments = timelineEvents.map((event, index): AudioEvidenceAttentionMoment => ({
    id: `capture-${event.kind}-${event.startSeconds}-${index}`,
    category: "capture",
    startSeconds: event.startSeconds,
    endSeconds: event.startSeconds,
    label: humanizeEvidenceKind(event.kind),
    detail: event.detail || [event.routeName, event.routePortType].filter(Boolean).join(" · ") || "Capture boundary preserved without route detail.",
    severity: event.kind === "interruption" ? "warning" : "attention",
  }));
  const transcriptMoments = lowConfidenceThreshold === null ? [] : transcriptWords
    .filter((word) => word.reviewState === "unchecked" && word.confidence !== null && word.confidence < lowConfidenceThreshold)
    .map((word): AudioEvidenceAttentionMoment => ({
      id: `transcript-${word.id}`,
      category: "transcript",
      startSeconds: word.startSeconds,
      endSeconds: word.endSeconds,
      label: `Check “${word.text}”`,
      detail: `Provider confidence ${Math.round((word.confidence as number) * 100)}%. Listen before correcting the word or its timing.`,
      severity: "attention",
    }));
  return [...signalMoments, ...captureMoments, ...transcriptMoments]
    .sort((left, right) => left.startSeconds - right.startSeconds || left.id.localeCompare(right.id))
    .slice(0, 5_000);
}

export function audioEvidenceAdjacentMoment(
  moments: AudioEvidenceAttentionMoment[],
  selectedSeconds: number,
  direction: "previous" | "next",
) {
  if (moments.length === 0) return null;
  if (direction === "next") {
    return moments.find((moment) => moment.startSeconds > selectedSeconds + 0.001) ?? moments[0];
  }
  return [...moments].reverse().find((moment) => moment.startSeconds < selectedSeconds - 0.001) ?? moments.at(-1) ?? null;
}

function levelHeight(dbfs: number, maximumHeight: number) {
  const normalized = (clamp(dbfs, -96, 0) + 96) / 96;
  return Math.max(1, normalized * maximumHeight);
}

function frequencyOpacity(dbfs: number) {
  return 0.08 + ((clamp(dbfs, -96, 0) + 96) / 96) * 0.92;
}

function frequencyRangeLabel(minimumHz: number, maximumHz: number) {
  const hz = (value: number) => value >= 1_000 ? `${Number((value / 1_000).toFixed(value % 1_000 === 0 ? 0 : 1))}k` : String(Math.round(value));
  return `${hz(minimumHz)}–${hz(maximumHz)} Hz`;
}

const FREQUENCY_COLORS: Record<FrequencyProfile["bands"][number]["id"], string> = {
  rumble: "#c084fc",
  warmth: "#f472b6",
  body: "#fb7185",
  speech: "#fbbf24",
  presence: "#34d399",
  air: "#38bdf8",
};

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
  transcriptScopeLabel = "Timed transcript",
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
  transcriptScopeLabel?: string;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("whole");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("levels");
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
  const frequencyProfile = signal.frequencyProfile;
  const visibleFrequencyWindows = frequencyProfile?.windows.filter((point) => point.startSeconds < span.endSeconds && point.startSeconds + point.durationSeconds > span.startSeconds) ?? [];
  const selectedPoint = useMemo(() => audioEvidencePointAt(signal, selectedSeconds), [selectedSeconds, signal]);
  const selectedFrequencyWindow = useMemo(() => frequencyProfile ? audioFrequencyWindowAt(frequencyProfile, selectedSeconds) : null, [frequencyProfile, selectedSeconds]);
  const selectedWord = useMemo(() => audioEvidenceWordAt(transcriptWords, selectedSeconds), [selectedSeconds, transcriptWords]);
  const summary = useMemo(() => audioEvidenceMapSummary(signal), [signal]);
  const transcriptSummary = useMemo(() => audioEvidenceTranscriptSummary(transcriptWords, lowConfidenceThreshold), [lowConfidenceThreshold, transcriptWords]);
  const attentionMoments = useMemo(
    () => audioEvidenceAttentionMoments(signal, timelineEvents, transcriptWords, lowConfidenceThreshold),
    [lowConfidenceThreshold, signal, timelineEvents, transcriptWords],
  );
  const nearbyAttentionMoments = useMemo(() => {
    if (attentionMoments.length <= 12) return attentionMoments;
    const nextIndex = attentionMoments.findIndex((moment) => moment.startSeconds >= selectedSeconds);
    const centerIndex = nextIndex < 0 ? attentionMoments.length - 1 : nextIndex;
    const startIndex = clamp(centerIndex - 3, 0, attentionMoments.length - 12);
    return attentionMoments.slice(startIndex, startIndex + 12);
  }, [attentionMoments, selectedSeconds]);
  const visibleObservations = signal.observations.filter((observation) => observation.startSeconds <= span.endSeconds && observation.endSeconds >= span.startSeconds);
  const visibleEvents = timelineEvents.filter((event) => event.startSeconds >= span.startSeconds && event.startSeconds <= span.endSeconds);
  const visibleWords = transcriptWords.filter((word) => word.startSeconds < span.endSeconds && word.endSeconds > span.startSeconds);

  function selectFromMap(event: MouseEvent<HTMLButtonElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const fraction = bounds.width > 0 ? clamp((event.clientX - bounds.left) / bounds.width, 0, 1) : 0;
    onSelect(span.startSeconds + fraction * span.durationSeconds, playbackReady);
  }

  function inspectMoment(moment: AudioEvidenceAttentionMoment) {
    setViewMode("detail");
    onSelect(moment.startSeconds, playbackReady);
  }

  function inspectAdjacent(direction: "previous" | "next") {
    const moment = audioEvidenceAdjacentMoment(attentionMoments, selectedSeconds, direction);
    if (moment) inspectMoment(moment);
  }

  return <section className="mt-4 rounded-xl border border-sky-200 bg-slate-950 p-3 text-white sm:p-4" aria-label="Audio evidence map">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.14em] text-sky-200">Audio evidence map</p>
        <p className="mt-1 max-w-3xl text-[10px] font-bold leading-4 text-slate-300">Windowed RMS energy and sample peaks from the complete decode—not a sample-level waveform. Color marks measured conditions; listening decides what they mean.</p>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        {frequencyProfile ? <div className="grid grid-cols-2 gap-1 rounded-lg border border-slate-700 bg-slate-900 p-1" role="group" aria-label="Audio evidence map display">
          {(["levels", "frequency"] as const).map((mode) => <button key={mode} type="button" aria-pressed={displayMode === mode} onClick={() => setDisplayMode(mode)} className={`min-h-9 rounded-md px-2 text-[9px] font-black uppercase tracking-wide ${displayMode === mode ? "bg-fuchsia-200 text-fuchsia-950" : "text-slate-300 hover:bg-slate-800"}`}>{mode === "levels" ? "Level" : "Frequency"}</button>)}
        </div> : null}
        <div className="grid grid-cols-3 gap-1 rounded-lg border border-slate-700 bg-slate-900 p-1" role="group" aria-label="Audio evidence map zoom">
          {(["whole", "minute", "detail"] as const).map((mode) => <button key={mode} type="button" aria-pressed={viewMode === mode} onClick={() => setViewMode(mode)} className={`min-h-9 rounded-md px-2 text-[9px] font-black uppercase tracking-wide ${viewMode === mode ? "bg-sky-200 text-sky-950" : "text-slate-300 hover:bg-slate-800"}`}>{mode === "whole" ? "Whole" : mode === "minute" ? "60 sec" : "15 sec"}</button>)}
        </div>
      </div>
    </div>

    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[9px] font-black uppercase tracking-wide text-slate-300" aria-label="Audio evidence legend">
      {displayMode === "levels" || !frequencyProfile ? <><span><span className="mr-1 inline-block h-2 w-3 rounded-sm bg-sky-500 align-middle" />RMS energy</span><span><span className="mr-1 inline-block h-0.5 w-3 bg-violet-300 align-middle" />Sample peak</span></> : <span><span className="mr-1 inline-block h-2 w-3 rounded-sm bg-fuchsia-400 align-middle" />Absolute broad-band RMS energy</span>}
      <span><span className="mr-1 inline-block h-2 w-3 rounded-sm bg-slate-500 align-middle" />Near-silent window</span>
      <span><span className="mr-1 inline-block h-2 w-3 rounded-sm bg-rose-500 align-middle" />Clipping observed</span>
      <span><span className="mr-1 inline-block h-3 w-0.5 bg-amber-300 align-middle" />Capture boundary</span>
      <span><span className="mr-1 inline-block h-3 w-0.5 bg-emerald-300 align-middle" />Transcript end</span>
      {transcriptWords.length > 0 && <><span><span className="mr-1 inline-block h-2 w-3 rounded-sm bg-slate-500 align-middle" />Timed transcript word</span><span><span className="mr-1 inline-block h-2 w-3 rounded-sm bg-blue-400 align-middle" />Playback reviewed</span><span><span className="mr-1 inline-block h-2 w-3 rounded-sm bg-violet-400 align-middle" />Provider attention</span></>}
    </div>

    <section className="mt-3 rounded-lg border border-slate-700 bg-slate-900 p-2.5" aria-label="Audio evidence review navigator">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.14em] text-cyan-200">Evidence navigator</p>
          <p className="mt-0.5 text-[9px] font-bold leading-4 text-slate-400">{attentionMoments.length} source-clock review point{attentionMoments.length === 1 ? "" : "s"}: measured flags, capture boundaries, and unchecked provider-attention words.</p>
        </div>
        <div className="flex gap-1">
          <button type="button" disabled={attentionMoments.length === 0} onClick={() => inspectAdjacent("previous")} className="min-h-9 rounded-md border border-slate-600 px-2.5 text-[9px] font-black text-slate-200 hover:bg-slate-800 disabled:opacity-40">← Previous</button>
          <button type="button" disabled={attentionMoments.length === 0} onClick={() => inspectAdjacent("next")} className="min-h-9 rounded-md bg-cyan-200 px-2.5 text-[9px] font-black text-cyan-950 hover:bg-cyan-100 disabled:opacity-40">Next evidence →</button>
        </div>
      </div>
      {attentionMoments.length > 0 ? <><div className="mt-2 flex gap-1.5 overflow-x-auto pb-1" aria-label="Audio evidence review points">
        {nearbyAttentionMoments.map((moment) => <button key={moment.id} type="button" onClick={() => inspectMoment(moment)} title={moment.detail} className={`min-h-9 shrink-0 rounded-md border px-2.5 text-left text-[9px] font-black ${moment.severity === "warning" ? "border-rose-500/70 bg-rose-950/40 text-rose-200" : moment.category === "transcript" ? "border-violet-500/70 bg-violet-950/40 text-violet-200" : moment.category === "capture" ? "border-amber-500/70 bg-amber-950/40 text-amber-200" : "border-sky-500/70 bg-sky-950/40 text-sky-200"}`}><span className="font-mono">{timestampForSeconds(moment.startSeconds)}</span> · {moment.label}</button>)}
      </div>{attentionMoments.length > nearbyAttentionMoments.length ? <p className="mt-1 text-[8px] font-bold text-slate-500">Showing {nearbyAttentionMoments.length} review points nearest the playhead. Previous and Next traverse the full {attentionMoments.length}-point source-clock queue.</p> : null}</> : <p className="mt-2 rounded-md border border-emerald-800 bg-emerald-950/30 p-2 text-[9px] font-bold text-emerald-200">No configured signal flag, capture boundary, or unchecked provider-attention word needs navigation.</p>}
    </section>

    <button type="button" onClick={selectFromMap} className="mt-3 block w-full overflow-hidden rounded-lg border border-slate-700 bg-[#111827] text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300" aria-label={`${displayMode === "frequency" && frequencyProfile ? "Broad-band frequency" : "Audio level"} evidence map from ${timestampForSeconds(span.startSeconds)} to ${timestampForSeconds(span.endSeconds)}. Select a position${playbackReady ? " to play from that time" : " for inspection"}.`}>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-52 w-full" role="img" aria-labelledby={`${titleId} ${descriptionId}`} preserveAspectRatio="none">
        <title id={titleId}>{`${displayMode === "frequency" && frequencyProfile ? "Complete-decode broad-band frequency energy" : "Windowed decoded audio energy"}, timed transcript words, and review markers`}</title>
        <desc id={descriptionId}>{`${displayMode === "frequency" && frequencyProfile ? "Rows show absolute RMS energy in six or fewer broad frequency bands from a complete mono overview decode. This is not a high-resolution repair spectrogram or an EQ decision." : "Symmetrical bars show RMS energy. Thin violet lines show sample peaks. Gray windows crossed the near-silence threshold and red windows contained clipped frames."} Amber lines are capture boundaries, green marks the timed transcript end, and cyan marks the selected playback position. The lower lane shows provider-timed words and their human review state; provider confidence is triage evidence, not measured word accuracy.`}</desc>
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
          const gridX = fraction * width;
          const gridSeconds = span.startSeconds + fraction * span.durationSeconds;
          return <g key={fraction}><line x1={gridX} x2={gridX} y1={plotTop} y2={plotBottom} stroke="#334155" strokeDasharray="2 7" /><text x={clamp(gridX + 5, 5, width - 55)} y="13" fill="#94a3b8" fontSize="10" fontWeight="700">{timestampForSeconds(gridSeconds)}</text></g>;
        })}
        {displayMode === "levels" || !frequencyProfile ? <line x1="0" x2={width} y1={center} y2={center} stroke="#475569" /> : null}
        {(displayMode === "levels" || !frequencyProfile) && [-24, -48, -72].map((dbfs) => {
          const guideHeight = levelHeight(dbfs, maximumLevelHeight);
          return <g key={dbfs} opacity="0.7"><line x1="0" x2={width} y1={center - guideHeight} y2={center - guideHeight} stroke="#475569" strokeDasharray="2 5" /><line x1="0" x2={width} y1={center + guideHeight} y2={center + guideHeight} stroke="#475569" strokeDasharray="2 5" /><text x="5" y={center - guideHeight - 2} fill="#94a3b8" fontSize="8" fontWeight="700">{dbfs} dBFS</text></g>;
        })}
        {(displayMode === "levels" || !frequencyProfile) && visiblePoints.map((point, index) => {
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
        {displayMode === "frequency" && frequencyProfile ? [...frequencyProfile.bands].reverse().flatMap((band, visualIndex) => {
          const bandIndex = frequencyProfile.bands.findIndex((candidate) => candidate.id === band.id);
          const rowHeight = (plotBottom - plotTop) / frequencyProfile.bands.length;
          const rowTop = plotTop + visualIndex * rowHeight;
          return [
            <rect key={`${band.id}-background`} x="0" y={rowTop} width={width} height={rowHeight} fill={visualIndex % 2 ? "#0f172a" : "#111827"} />,
            ...visibleFrequencyWindows.map((point, pointIndex) => {
              const start = Math.max(point.startSeconds, span.startSeconds);
              const end = Math.min(point.startSeconds + point.durationSeconds, span.endSeconds);
              const pointX = x(start);
              const pointWidth = Math.max(1, x(end) - pointX + 0.2);
              const dbfs = point.bandRmsDbfs[bandIndex];
              return <rect key={`${band.id}-${point.startSeconds}-${pointIndex}`} x={pointX} y={rowTop + 0.5} width={pointWidth} height={Math.max(1, rowHeight - 1)} fill={FREQUENCY_COLORS[band.id]} opacity={frequencyOpacity(dbfs)}><title>{`${timestampForSeconds(point.startSeconds)} · ${band.label} ${frequencyRangeLabel(band.minimumHz, band.maximumHz)} · ${dbfs.toFixed(1)} dBFS broad-band RMS`}</title></rect>;
            }),
            <text key={`${band.id}-label`} x="6" y={rowTop + Math.min(rowHeight - 2, 11)} fill="#f8fafc" fontSize="8" fontWeight="800" paintOrder="stroke" stroke="#020617" strokeWidth="2">{band.label} · {frequencyRangeLabel(band.minimumHz, band.maximumHz)}</text>,
          ];
        }) : null}
        {visibleEvents.map((event, index) => <g key={`${event.kind}-${event.startSeconds}-${index}`}><line x1={x(event.startSeconds)} x2={x(event.startSeconds)} y1={plotTop - 3} y2={plotBottom + 3} stroke="#fcd34d" strokeWidth="2" /><circle cx={x(event.startSeconds)} cy={plotTop - 4} r="4" fill="#fcd34d"><title>{`${timestampForSeconds(event.startSeconds)} ${event.kind}`}</title></circle></g>)}
        {visibleObservations.map((observation, index) => {
          const observationStart = Math.max(observation.startSeconds, span.startSeconds);
          const observationEnd = Math.min(Math.max(observation.endSeconds, observation.startSeconds + signal.windowDurationSeconds), span.endSeconds);
          const observationX = x(observationStart);
          const observationWidth = Math.max(2, x(observationEnd) - observationX);
          const tone = observation.severity === "warning" ? "#fb7185" : "#fbbf24";
          return <g key={`${observation.kind}-${observation.startSeconds}-${index}`}><rect x={observationX} y={plotTop} width={observationWidth} height={plotBottom - plotTop} fill={tone} opacity="0.12"><title>{`${timestampForSeconds(observation.startSeconds)}–${timestampForSeconds(observation.endSeconds)} ${observation.detail}`}</title></rect><line x1={observationX} x2={observationX} y1={plotTop} y2={plotBottom} stroke={tone} strokeWidth="2" strokeDasharray="5 3" /></g>;
        })}
        {transcriptEndSeconds !== null && transcriptEndSeconds >= span.startSeconds && transcriptEndSeconds <= span.endSeconds ? <g><line x1={x(transcriptEndSeconds)} x2={x(transcriptEndSeconds)} y1={plotTop - 4} y2={plotBottom + 4} stroke="#6ee7b7" strokeWidth="2" strokeDasharray="4 3" /><text x={clamp(x(transcriptEndSeconds) + 5, 5, width - 95)} y={plotBottom + 16} fill="#a7f3d0" fontSize="9" fontWeight="800">Transcript end</text></g> : null}
        {visibleWords.map((word) => {
          const start = Math.max(word.startSeconds, span.startSeconds);
          const end = Math.min(word.endSeconds, span.endSeconds);
          const wordX = x(start);
          const wordWidth = Math.max(1, x(end) - wordX - 0.35);
          const needsAttention = lowConfidenceThreshold !== null && word.confidence !== null && word.confidence < lowConfidenceThreshold;
          const fill = word.reviewState === "corrected" ? "#34d399" : word.reviewState === "confirmed" ? "#60a5fa" : needsAttention ? "#a78bfa" : "#475569";
          return <rect key={word.id} x={wordX} y={transcriptTop} width={wordWidth} height={transcriptBottom - transcriptTop} rx="1" fill={fill} opacity="0.9"><title>{`${timestampForSeconds(word.startSeconds)} ${word.text} · ${word.reviewState}${word.confidence === null ? " · provider confidence unavailable" : ` · provider confidence ${Math.round(word.confidence * 100)}%`}`}</title></rect>;
        })}
        {transcriptWords.length > 0 && <text x="6" y="198" fill="#94a3b8" fontSize="9" fontWeight="800">{transcriptScopeLabel} · {transcriptSummary.reviewedWordCount}/{transcriptSummary.timedWordCount} words in reviewed segments{transcriptSummary.attentionWordCount === null ? " · no cross-provider confidence threshold" : ` · ${transcriptSummary.attentionWordCount} provider-attention words`}</text>}
        <line x1={x(selectedSeconds)} x2={x(selectedSeconds)} y1={plotTop - 7} y2={transcriptWords.length > 0 ? transcriptBottom + 7 : plotBottom + 7} stroke="#67e8f9" strokeWidth="2.5" />
      </svg>
    </button>

    <div className="mt-3 grid grid-cols-2 gap-2 text-[9px] font-bold sm:grid-cols-5">
      <div className="rounded-lg bg-slate-900 p-2"><div className="font-mono text-sm font-black text-cyan-200">{timestampForSeconds(selectedSeconds)}</div><div className="text-slate-400">Selected time</div></div>
      <div className="rounded-lg bg-slate-900 p-2"><div className="font-mono text-sm font-black text-sky-200">{selectedPoint ? selectedPoint.rmsDbfs.toFixed(1) : "—"}</div><div className="text-slate-400">Window RMS dBFS</div></div>
      <div className="rounded-lg bg-slate-900 p-2"><div className="font-mono text-sm font-black text-violet-200">{selectedPoint ? selectedPoint.samplePeakDbfs.toFixed(1) : "—"}</div><div className="text-slate-400">Sample peak dBFS</div></div>
      <div className="rounded-lg bg-slate-900 p-2"><div className="font-mono text-sm font-black text-slate-200">{timestampForSeconds(summary.nearSilentDurationSeconds)}</div><div className="text-slate-400">Near-silent · {summary.nearSilentWindowCount} windows</div></div>
      <div className="col-span-2 rounded-lg bg-slate-900 p-2 sm:col-span-1"><div className={`font-mono text-sm font-black ${summary.clippingWindowCount ? "text-rose-300" : "text-emerald-300"}`}>{timestampForSeconds(summary.clippingDurationSeconds)}</div><div className="text-slate-400">Clipping span · {summary.clippingWindowCount} windows · {summary.observationCount} flags</div></div>
    </div>
    {frequencyProfile ? <section className="mt-2 rounded-lg border border-slate-700 bg-slate-900 p-3" aria-label="Broad-band frequency evidence">
      <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-[9px] font-black uppercase tracking-[0.14em] text-fuchsia-200">Broad-band frequency evidence</p><p className="mt-1 max-w-3xl text-[9px] font-bold leading-4 text-slate-400">Complete-decode filtered RMS after a mono overview downmix. It makes frequency balance visible across the source clock; it is not an RX-style repair spectrogram, phase measurement, speech-quality score, or automatic EQ instruction.</p></div><span className="rounded-full border border-fuchsia-700 bg-fuchsia-950/40 px-2 py-1 text-[8px] font-black uppercase tracking-wide text-fuchsia-200">{frequencyProfile.bands.length} bands · source bound</span></div>
      <div className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-1.5 text-[8px] font-bold">
        {frequencyProfile.bands.map((band, index) => <div key={band.id} className="rounded-md bg-slate-950 p-2"><div className="font-mono text-xs font-black" style={{ color: FREQUENCY_COLORS[band.id] }}>{selectedFrequencyWindow ? selectedFrequencyWindow.bandRmsDbfs[index].toFixed(1) : "—"}</div><div className="mt-0.5 text-slate-300">{band.label}</div><div className="text-slate-500">{frequencyRangeLabel(band.minimumHz, band.maximumHz)} · overall {frequencyProfile.overallBandRmsDbfs[index].toFixed(1)}</div></div>)}
      </div>
    </section> : null}
    {selectedWord && <section className="mt-2 rounded-lg border border-slate-700 bg-slate-900 p-3" aria-label="Selected transcript word evidence"><div className="flex flex-wrap items-baseline justify-between gap-2"><div className="font-serif text-lg font-black text-white">{selectedWord.text}</div><div className="font-mono text-[10px] font-black text-cyan-200">{timestampForSeconds(selectedWord.startSeconds)}–{timestampForSeconds(selectedWord.endSeconds)}</div></div><p className="mt-1 text-[9px] font-bold leading-4 text-slate-300">{selectedWord.confidence === null ? "Provider confidence unavailable" : `${providerLabel || "Provider"} confidence ${Math.round(selectedWord.confidence * 100)}%`} · {selectedWord.reviewState === "corrected" ? "provider word inside a playback-corrected segment; timing remains provider evidence" : selectedWord.reviewState === "confirmed" ? "provider segment confirmed against playback" : "unchecked provider word"}. Confidence prioritizes listening; only reviewed reference text measures error.</p></section>}
    <p className="mt-3 text-[9px] font-bold leading-4 text-slate-400">The display never stretches a window into sample accuracy. Zoom centers on the selected time; the exact immutable source remains the listening authority.</p>
  </section>;
}
