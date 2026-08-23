"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  AUDIO_DELIVERY_REVIEW_EVIDENCE_SCHEMA,
  AUDIO_MASTERY_REVIEW_EVIDENCE_SCHEMA,
  audioDeliveryReviewCoverage,
  audioMasteryReviewCoverage,
  audioMasteryReviewMoments as sharedAudioMasteryReviewMoments,
  type AudioMasteryPlaybackReviewEvidence,
  type AudioMasteryReviewMoment,
} from "@high-ground/quipsly-media-processing";

export type AudioDeliveryStatus = {
  jobId: string | null;
  status: "not-queued" | "queued" | "processing" | "output-ready" | "completed" | "failed";
  masteryJobId: string | null;
  promotionReceiptId: string | null;
  profileId: "apple-podcasts-aac-stereo-v1" | null;
  output: null | { playbackUrl: string | null; sha256: string; sizeBytes: number; durationSeconds: number; codec: "aac"; codecProfile: "LC"; sampleRateHz: 48_000; channels: 2; bitrateBps: number; integratedLufs: number; truePeakDbtp: number; fastStart: true; completeDecode: true };
  review: AudioMasteryReviewSummary;
  promotionStillActive: boolean;
  error: string | null;
  updatedAt: string | null;
  boundaries: { originalRemainsSourceTruth: true; outputIsUnapprovedDeliveryArtifact: true; proofListenRequiredBeforeOutputPacket: true; uploadNotStarted: true; publicationNotStarted: true };
};

const EMPTY_AUDIO_DELIVERY: AudioDeliveryStatus = {
  jobId: null, status: "not-queued", masteryJobId: null, promotionReceiptId: null, profileId: null,
  output: null, review: { latest: null, approvalCount: 0, rejectionCount: 0 }, promotionStillActive: false,
  error: null, updatedAt: null,
  boundaries: { originalRemainsSourceTruth: true, outputIsUnapprovedDeliveryArtifact: true, proofListenRequiredBeforeOutputPacket: true, uploadNotStarted: true, publicationNotStarted: true },
};

import { AudioProcessingChangeMap } from "./AudioProcessingChangeMap";

export type AudioMasterySeriesPoint = {
  timeMs: number;
  momentaryLufs: number | null;
  shortTermLufs: number | null;
  integratedLufs: number | null;
  truePeakDbtp: number | null;
};

export type AudioMasteryMeasurement = {
  measuredAt: string;
  durationSeconds: number;
  integratedLufs: number;
  truePeakDbtp: number;
  loudnessRangeLu: number;
  thresholdLufs: number;
  seriesResolutionMs: number;
  series: AudioMasterySeriesPoint[];
};

export type { AudioMasteryReviewMoment };

export type AudioMasteryMonitorMode = "matched" | "delivery";

export type AudioMasteryReviewSummary = {
  latest: null | { id: string; jobId: string; decision: "approved" | "rejected"; note: string | null; reviewedAt: string; actorEmail: string };
  approvalCount: number;
  rejectionCount: number;
};

export type AudioMasterPromotionReceipt = {
  id: string;
  jobId: string;
  reviewReceiptId: string | null;
  operation: "promote" | "withdraw";
  reason: string | null;
  occurredAt: string;
  actorEmail: string;
  candidatePlaybackUrl: string | null;
};

export type AudioMasterPromotionSummary = {
  active: boolean;
  latest: AudioMasterPromotionReceipt | null;
  activePromotion: AudioMasterPromotionReceipt | null;
  promoteCount: number;
  withdrawalCount: number;
  candidatePlaybackUrl: string | null;
  boundaries: {
    originalRemainsSourceTruth: true;
    episodeSpineUnchanged: true;
    deliveryEncodingNotCreated: true;
    publicationNotStarted: true;
    withdrawalPreservesHistory: true;
  };
};

const EMPTY_AUDIO_MASTER_PROMOTION: AudioMasterPromotionSummary = {
  active: false,
  latest: null,
  activePromotion: null,
  promoteCount: 0,
  withdrawalCount: 0,
  candidatePlaybackUrl: null,
  boundaries: {
    originalRemainsSourceTruth: true,
    episodeSpineUnchanged: true,
    deliveryEncodingNotCreated: true,
    publicationNotStarted: true,
    withdrawalPreservesHistory: true,
  },
};

export function audioMasteryAuditionGains(
  sourceIntegratedLufs: number,
  masteredIntegratedLufs: number,
  mode: AudioMasteryMonitorMode,
) {
  if (mode === "delivery") {
    return {
      sourceGain: 1,
      masteredGain: 1,
      sourceAdjustmentDb: 0,
      masteredAdjustmentDb: 0,
      referenceLufs: null,
    };
  }
  const referenceLufs = Math.min(sourceIntegratedLufs, masteredIntegratedLufs);
  const sourceAdjustmentDb = Math.min(0, referenceLufs - sourceIntegratedLufs);
  const masteredAdjustmentDb = Math.min(0, referenceLufs - masteredIntegratedLufs);
  return {
    sourceGain: Math.max(0, Math.min(1, 10 ** (sourceAdjustmentDb / 20))),
    masteredGain: Math.max(0, Math.min(1, 10 ** (masteredAdjustmentDb / 20))),
    sourceAdjustmentDb,
    masteredAdjustmentDb,
    referenceLufs,
  };
}

type AudioSignalStatisticsSummary = {
  channel: number | null;
  dcOffset: number;
  peakDbfs: number;
  rmsDbfs: number;
  rmsPeakDbfs: number | null;
  rmsTroughDbfs: number | null;
  crestFactor: number | null;
  flatFactor: number | null;
  peakCount: number | null;
  noiseFloorDbfs: number | null;
  dynamicRangeDb: number | null;
  zeroCrossingRate: number | null;
  nanCount: number;
  infCount: number;
  denormalCount: number;
};

export type AudioSignalDiagnosisSummary = {
  diagnosisId: string;
  analyzedAt: string;
  durationSeconds: number;
  sampleRateHz: number;
  channelCount: number;
  overall: AudioSignalStatisticsSummary & { channel: null };
  channels: Array<AudioSignalStatisticsSummary & { channel: number }>;
  nearSilenceSpans: Array<{ startSeconds: number; endSeconds: number; durationSeconds: number }>;
  observations: Array<{
    kind: "near-full-scale" | "near-silence" | "dc-offset" | "channel-imbalance" | "invalid-samples";
    severity: "attention" | "warning";
    startSeconds: number;
    endSeconds: number;
    detail: string;
    requiresListening: true;
    evidence: Record<string, number>;
  }>;
  thresholds: {
    nearFullScaleDbfs: -0.05;
    nearSilenceDbfs: -55;
    nearSilenceMinimumSeconds: 0.25;
    dcOffsetAmplitude: 0.01;
    channelImbalanceDb: 6;
  };
  analyzer: {
    name: "ffmpeg-astats-silencedetect";
    version: string;
    completeDecode: true;
    statisticsAreNotListeningJudgments: true;
    nearSilenceIsNotAutomaticallyADropout: true;
    noiseFloorIsAnEstimate: true;
  };
};

function finite(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

export function audioMasteryReviewMoments(
  source: AudioMasteryMeasurement,
  mastered: AudioMasteryMeasurement,
): AudioMasteryReviewMoment[] {
  return sharedAudioMasteryReviewMoments(source, mastered);
}

function clock(seconds: number) {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${Math.floor(safe % 60).toString().padStart(2, "0")}`;
}

function AudioMasteryComparisonGraph({ source, mastered, targetLufs }: {
  source: AudioMasteryMeasurement;
  mastered: AudioMasteryMeasurement;
  targetLufs: number;
}) {
  const width = 720;
  const height = 130;
  const durationMs = Math.max(source.durationSeconds, mastered.durationSeconds) * 1_000 || 1;
  const x = (timeMs: number) => Math.max(0, Math.min(width, (timeMs / durationMs) * width));
  const y = (lufs: number) => Math.max(3, Math.min(height - 3, ((0 - Math.max(-60, Math.min(0, lufs))) / 60) * height));
  const pathFor = (measurement: AudioMasteryMeasurement) => measurement.series
    .filter((point) => finite(point.shortTermLufs))
    .map((point, index) => `${index === 0 ? "M" : "L"}${x(point.timeMs).toFixed(1)},${y(point.shortTermLufs as number).toFixed(1)}`)
    .join(" ");
  const sourcePath = pathFor(source);
  const masteredPath = pathFor(mastered);
  const targetTop = y(targetLufs + 1);
  const targetBottom = y(targetLufs - 1);
  return (
    <figure className="rounded-lg border border-slate-700 bg-[#171724] p-3" aria-label="Source and mastered loudness comparison">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-28 w-full" role="img" aria-labelledby="mastery-comparison-title mastery-comparison-description">
        <title id="mastery-comparison-title">Source and mastered short-term loudness over time</title>
        <desc id="mastery-comparison-description">The source and verified mastered preview are measured from complete decodes. The shaded band is the selected delivery target plus or minus one loudness unit.</desc>
        <rect x="0" width={width} y={targetTop} height={Math.max(1, targetBottom - targetTop)} fill="#14532d" opacity="0.38" />
        {[-48, -32, targetLufs, 0].map((level) => (
          <g key={level}>
            <line x1="0" x2={width} y1={y(level)} y2={y(level)} stroke={level === targetLufs ? "#86efac" : "#3f3f55"} strokeDasharray={level === targetLufs ? "8 5" : "2 7"} />
            <text x="6" y={Math.max(10, y(level) - 4)} fill={level === targetLufs ? "#bbf7d0" : "#a1a1b5"} fontSize="10" fontWeight="700">{level} LUFS</text>
          </g>
        ))}
        {sourcePath && <path d={sourcePath} fill="none" stroke="#f0abfc" strokeWidth="2.1" opacity="0.78" />}
        {masteredPath && <path d={masteredPath} fill="none" stroke="#4ade80" strokeWidth="2.3" />}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[9px] font-black uppercase tracking-[0.1em] text-slate-200">
        <span><span className="mr-1 inline-block h-0.5 w-3 bg-fuchsia-300 align-middle" />Immutable source</span>
        <span><span className="mr-1 inline-block h-0.5 w-3 bg-green-400 align-middle" />Verified preview</span>
        <span><span className="mr-1 inline-block h-2 w-3 bg-green-900 align-middle" />Delivery tolerance</span>
      </figcaption>
    </figure>
  );
}

export function AudioMasteryAudition({
  masteryJobId,
  sourceUrl,
  masteredUrl,
  source,
  mastered,
  targetLufs,
  maximumTruePeakDbtp,
  diagnosis,
  review = { latest: null, approvalCount: 0, rejectionCount: 0 },
  promotion = EMPTY_AUDIO_MASTER_PROMOTION,
  delivery = EMPTY_AUDIO_DELIVERY,
  isReviewing = false,
  isPromoting = false,
  isDelivering = false,
  onReview,
  onPromotion,
  onDelivery,
  onDeliveryReview,
  presentation = "studio",
}: {
  masteryJobId?: string | null;
  sourceUrl: string;
  masteredUrl: string;
  source: AudioMasteryMeasurement;
  mastered: AudioMasteryMeasurement;
  targetLufs: number;
  maximumTruePeakDbtp: number;
  diagnosis: AudioSignalDiagnosisSummary | null;
  review?: AudioMasteryReviewSummary;
  promotion?: AudioMasterPromotionSummary;
  delivery?: AudioDeliveryStatus;
  isReviewing?: boolean;
  isPromoting?: boolean;
  isDelivering?: boolean;
  onReview?: (decision: "approved" | "rejected", evidence: AudioMasteryPlaybackReviewEvidence, note: string | null) => Promise<void>;
  onPromotion?: (operation: "promote" | "withdraw", reviewReceiptId: string | null, reason: string | null) => Promise<void>;
  onDelivery?: () => Promise<void>;
  onDeliveryReview?: (decision: "approved" | "rejected", evidence: { schema: typeof AUDIO_DELIVERY_REVIEW_EVIDENCE_SCHEMA; listenedSecondBins: number[]; completedAt: string }, note: string | null) => Promise<void>;
  presentation?: "studio" | "session";
}) {
  const sourceRef = useRef<HTMLAudioElement>(null);
  const masteredRef = useRef<HTMLAudioElement>(null);
  const [version, setVersion] = useState<"source" | "mastered">("mastered");
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [monitorMode, setMonitorMode] = useState<AudioMasteryMonitorMode>("matched");
  const [sourceListenedSecondBins, setSourceListenedSecondBins] = useState<number[]>([]);
  const [masteredListenedSecondBins, setMasteredListenedSecondBins] = useState<number[]>([]);
  const [observedMonitorModes, setObservedMonitorModes] = useState<AudioMasteryMonitorMode[]>([]);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewMessage, setReviewMessage] = useState("");
  const [withdrawalReason, setWithdrawalReason] = useState("");
  const [promotionMessage, setPromotionMessage] = useState("");
  const [deliveryListenedSecondBins, setDeliveryListenedSecondBins] = useState<number[]>([]);
  const [deliveryReviewNote, setDeliveryReviewNote] = useState("");
  const [deliveryMessage, setDeliveryMessage] = useState("");
  const duration = Math.max(source.durationSeconds, mastered.durationSeconds, 0.001);
  const thisPreviewPromoted = Boolean(
    promotion.active
    && masteryJobId
    && promotion.activePromotion?.jobId === masteryJobId,
  );
  const anotherPreviewPromoted = promotion.active && !thisPreviewPromoted;
  const sessionPresentation = presentation === "session";
  const moments = useMemo(() => audioMasteryReviewMoments(source, mastered), [mastered, source]);
  const auditionGains = useMemo(
    () => audioMasteryAuditionGains(source.integratedLufs, mastered.integratedLufs, monitorMode),
    [mastered.integratedLufs, monitorMode, source.integratedLufs],
  );
  const activeRef = version === "source" ? sourceRef : masteredRef;
  const reviewCoverage = useMemo(() => audioMasteryReviewCoverage(source, mastered, {
    sourceListenedSecondBins,
    masteredListenedSecondBins,
    monitorModes: observedMonitorModes,
  }), [mastered, masteredListenedSecondBins, observedMonitorModes, source, sourceListenedSecondBins]);
  const deliveryCoverage = useMemo(() => audioDeliveryReviewCoverage({
    schema: AUDIO_DELIVERY_REVIEW_EVIDENCE_SCHEMA,
    listenedSecondBins: deliveryListenedSecondBins,
    completedAt: new Date().toISOString(),
  }, delivery.output?.durationSeconds || 0.001), [delivery.output?.durationSeconds, deliveryListenedSecondBins]);

  useEffect(() => {
    if (sourceRef.current) sourceRef.current.volume = auditionGains.sourceGain;
    if (masteredRef.current) masteredRef.current.volume = auditionGains.masteredGain;
  }, [auditionGains, expanded]);

  const seek = (timeSeconds: number) => {
    const next = Math.max(0, Math.min(duration, timeSeconds));
    if (sourceRef.current) sourceRef.current.currentTime = next;
    if (masteredRef.current) masteredRef.current.currentTime = next;
    setCurrentTime(next);
  };

  const togglePlayback = async () => {
    const active = activeRef.current;
    if (!active) return;
    if (active.paused) {
      try {
        await active.play();
        setPlaying(true);
      } catch {
        setPlaying(false);
      }
    } else {
      active.pause();
      setPlaying(false);
    }
  };

  const switchVersion = async (nextVersion: "source" | "mastered") => {
    if (nextVersion === version) return;
    const current = activeRef.current;
    const next = nextVersion === "source" ? sourceRef.current : masteredRef.current;
    const shouldContinue = Boolean(current && !current.paused);
    const time = current?.currentTime ?? currentTime;
    current?.pause();
    if (next) next.currentTime = Math.max(0, Math.min(time, duration));
    setVersion(nextVersion);
    setCurrentTime(time);
    if (shouldContinue && next) {
      try {
        await next.play();
        setPlaying(true);
      } catch {
        setPlaying(false);
      }
    }
  };

  const observePlayback = (candidate: "source" | "mastered", timeSeconds: number) => {
    if (version !== candidate) return;
    setCurrentTime(timeSeconds);
    if (!playing) return;
    const bin = Math.max(0, Math.floor(timeSeconds));
    const update = (current: number[]) => current.includes(bin) ? current : [...current, bin].sort((left, right) => left - right);
    if (candidate === "source") setSourceListenedSecondBins(update);
    else setMasteredListenedSecondBins(update);
    setObservedMonitorModes((current) => current.includes(monitorMode) ? current : [...current, monitorMode]);
  };

  const saveReview = async (decision: "approved" | "rejected") => {
    if (!onReview) return;
    setReviewMessage(decision === "approved" ? "Saving the playback-bound approval receipt…" : "Saving the playback-bound rejection receipt…");
    const evidence: AudioMasteryPlaybackReviewEvidence = {
      schema: AUDIO_MASTERY_REVIEW_EVIDENCE_SCHEMA,
      sourceListenedSecondBins,
      masteredListenedSecondBins,
      monitorModes: observedMonitorModes,
      completedAt: new Date().toISOString(),
    };
    try {
      await onReview(decision, evidence, reviewNote.trim() || null);
      setReviewMessage(decision === "approved"
        ? "Approved as heard. The preview is still separate and unpromoted."
        : "Rejected as heard. The preview and original remain unchanged.");
    } catch (error) {
      setReviewMessage(error instanceof Error ? error.message : "The mastering decision was not saved.");
    }
  };

  const changePromotion = async (operation: "promote" | "withdraw") => {
    if (!onPromotion) return;
    const reviewReceiptId = operation === "promote" && review.latest?.decision === "approved"
      ? review.latest.id
      : promotion.activePromotion?.reviewReceiptId ?? null;
    setPromotionMessage(operation === "promote"
      ? "Promoting the approved preview as a delivery candidate…"
      : "Withdrawing the delivery candidate while preserving its history…");
    try {
      await onPromotion(
        operation,
        reviewReceiptId,
        operation === "withdraw" ? withdrawalReason.trim() || null : null,
      );
      setPromotionMessage(operation === "promote"
        ? "Delivery candidate promoted. The source, episode spine, delivery encoding, and publication remain unchanged."
        : "Promotion withdrawn. The source, candidate bytes, review, and promotion history remain available.");
      if (operation === "withdraw") setWithdrawalReason("");
    } catch (error) {
      setPromotionMessage(error instanceof Error ? error.message : "The mastering promotion could not be changed.");
    }
  };

  const createDeliveryArtifact = async () => {
    if (!onDelivery) return;
    setDeliveryMessage("Encoding a source-bound AAC-LC artifact and verifying the lossy bytes…");
    try {
      await onDelivery();
      setDeliveryMessage("Encoded artifact ready. Proof-listen the actual AAC bytes before an output packet can exist.");
    } catch (error) {
      setDeliveryMessage(error instanceof Error ? error.message : "The delivery artifact could not be prepared.");
    }
  };

  const saveDeliveryReview = async (decision: "approved" | "rejected") => {
    if (!onDeliveryReview) return;
    setDeliveryMessage(decision === "approved" ? "Saving the encoded-byte proof-listen receipt…" : "Saving the encoded-byte rejection receipt…");
    try {
      await onDeliveryReview(decision, { schema: AUDIO_DELIVERY_REVIEW_EVIDENCE_SCHEMA, listenedSecondBins: deliveryListenedSecondBins, completedAt: new Date().toISOString() }, deliveryReviewNote.trim() || null);
      setDeliveryMessage(decision === "approved" ? "Encoded bytes approved as heard. Upload, output packet, and publication remain separate." : "Encoded bytes rejected as heard. Candidate and artifact history remain intact.");
    } catch (error) {
      setDeliveryMessage(error instanceof Error ? error.message : "The delivery review could not be saved.");
    }
  };

  const passes = mastered.integratedLufs >= targetLufs - 1
    && mastered.integratedLufs <= targetLufs + 1
    && mastered.truePeakDbtp <= maximumTruePeakDbtp;

  const closeDesk = () => {
    sourceRef.current?.pause();
    masteredRef.current?.pause();
    setPlaying(false);
    setExpanded(false);
  };

  return (
    <>
      <section className="mt-3 rounded-lg border border-slate-700 bg-slate-950 p-3 text-white" aria-label="Audio mastery audition summary">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-xs font-black">{sessionPresentation ? "Compare audio" : "Mastering audition"}</div>
            <p className="mt-1 text-[9px] font-bold leading-4 text-slate-400">
              {sessionPresentation
                ? "Your improved copy is ready. Hear the same moment in both versions before choosing what sounds best."
                : <>Verified preview ready. {diagnosis ? `${diagnosis.observations.length} signal candidate${diagnosis.observations.length === 1 ? "" : "s"} to review.` : "Add decoded signal evidence to this legacy preview."}</>}
            </p>
            {review.latest ? <p className="mt-1 text-[9px] font-black text-sky-200">Latest decision: {review.latest.decision} · {new Date(review.latest.reviewedAt).toLocaleString()}</p> : null}
            {thisPreviewPromoted ? <p className="mt-1 text-[9px] font-black text-emerald-200">This preview is the active delivery candidate · source and episode spine unchanged</p> : null}
            {anotherPreviewPromoted ? <p className="mt-1 text-[9px] font-black text-amber-200">Another mastering pass remains the active delivery candidate</p> : null}
          </div>
          <span className={`shrink-0 rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-[0.1em] ${passes ? "border-emerald-700 bg-emerald-950 text-emerald-200" : "border-amber-700 bg-amber-950 text-amber-200"}`}>
            {passes ? "Target verified" : "Needs attention"}
          </span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-center text-[9px] font-bold">
          <div className="rounded-md bg-slate-900 px-2 py-2"><span className="font-mono font-black text-fuchsia-200">{source.integratedLufs.toFixed(1)}</span><br /><span className="text-slate-400">Source LUFS</span></div>
          <div className="rounded-md bg-slate-900 px-2 py-2"><span className="font-mono font-black text-emerald-200">{mastered.integratedLufs.toFixed(1)}</span><br /><span className="text-slate-400">Preview LUFS</span></div>
        </div>
        <button type="button" onClick={() => setExpanded(true)} className="mt-2 w-full rounded-md bg-fuchsia-300 px-3 py-2 text-[10px] font-black text-fuchsia-950 hover:bg-fuchsia-200">
          {sessionPresentation ? "Compare original and improved" : "Open full audition desk"}
        </button>
      </section>
      {expanded && createPortal(
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-labelledby="audio-mastery-dialog-title">
          <div className="max-h-[94vh] w-full max-w-6xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 p-3 shadow-2xl sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3 text-white">
              <div>
                <div className="text-[9px] font-black uppercase tracking-[0.16em] text-fuchsia-200">{sessionPresentation ? "Audio comparison" : "Audio mastery"}</div>
                <h2 id="audio-mastery-dialog-title" className="mt-1 text-xl font-black">{sessionPresentation ? "Original and improved" : "Source-to-master audition desk"}</h2>
              </div>
              <button type="button" onClick={closeDesk} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-xs font-black hover:bg-slate-800">Close</button>
            </div>
    <section className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-white sm:p-5" aria-label="Audio mastering audition desk">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-black">{sessionPresentation ? "Listen and compare" : "Audition the evidence"}</div>
          <p className="mt-1 max-w-2xl text-[10px] font-bold leading-4 text-slate-300">
            {sessionPresentation
              ? "Switch versions without losing your place. Quipsly starts at equal listening volume so louder does not automatically sound better."
              : "Switch versions without losing the playhead. Measurements can verify delivery readiness; only listening can decide whether this is the sound you want."}
          </p>
        </div>
        <span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] ${passes ? "border-emerald-700 bg-emerald-950 text-emerald-200" : "border-amber-700 bg-amber-950 text-amber-200"}`}>
          {passes ? "Delivery target verified" : "Outside delivery target"}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 overflow-hidden rounded-lg border border-slate-700 bg-slate-900 p-1" role="group" aria-label="Audition version">
        {(["source", "mastered"] as const).map((candidate) => (
          <button
            key={candidate}
            type="button"
            aria-pressed={version === candidate}
            onClick={() => void switchVersion(candidate)}
            className={`rounded-md px-3 py-2 text-xs font-black ${version === candidate ? "bg-white text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}
          >
            {candidate === "source" ? (sessionPresentation ? "Original" : "Immutable source") : (sessionPresentation ? "Improved" : "Mastered preview")}
          </button>
        ))}
      </div>

      <div className="mt-2 rounded-lg border border-slate-700 bg-slate-900 p-2">
        <div className="grid grid-cols-2 gap-1" role="group" aria-label="Monitor level">
          {(["matched", "delivery"] as const).map((candidate) => (
            <button
              key={candidate}
              type="button"
              aria-pressed={monitorMode === candidate}
              onClick={() => setMonitorMode(candidate)}
              className={`rounded-md px-3 py-2 text-[10px] font-black ${monitorMode === candidate ? "bg-sky-200 text-sky-950" : "text-slate-300 hover:bg-slate-800"}`}
            >
              {candidate === "matched" ? (sessionPresentation ? "Fair comparison" : "Matched loudness") : (sessionPresentation ? "Final volume" : "Delivery level")}
            </button>
          ))}
        </div>
        <p className="mt-2 px-1 text-[9px] font-bold leading-4 text-slate-400">
          {monitorMode === "matched"
            ? sessionPresentation
              ? "A fair comparison temporarily turns down the louder version. This changes only what you hear here; neither recording is changed."
              : `Compare processing without the louder-is-better bias. Quipsly only attenuates the louder monitor feed; source ${auditionGains.sourceAdjustmentDb.toFixed(1)} dB, preview ${auditionGains.masteredAdjustmentDb.toFixed(1)} dB. Files and measurements are unchanged.`
            : sessionPresentation
              ? "Final volume plays each version at its actual level. Neither recording is changed."
              : "Hear both files at unity monitor gain to judge the verified delivery level and peak headroom. Files and measurements are unchanged."}
        </p>
      </div>

      <audio
        ref={sourceRef}
        src={sourceUrl}
        preload="metadata"
        data-audition-version="source"
        data-monitor-gain={auditionGains.sourceGain}
        data-monitor-adjustment-db={auditionGains.sourceAdjustmentDb}
        onTimeUpdate={(event) => observePlayback("source", event.currentTarget.currentTime)}
        onEnded={() => setPlaying(false)}
      />
      <audio
        ref={masteredRef}
        src={masteredUrl}
        preload="metadata"
        data-audition-version="mastered"
        data-monitor-gain={auditionGains.masteredGain}
        data-monitor-adjustment-db={auditionGains.masteredAdjustmentDb}
        onTimeUpdate={(event) => observePlayback("mastered", event.currentTarget.currentTime)}
        onEnded={() => setPlaying(false)}
      />
      <div className="mt-3 flex items-center gap-3 rounded-lg bg-slate-900 px-3 py-3">
        <button type="button" onClick={() => void togglePlayback()} className="min-w-20 rounded-md bg-fuchsia-300 px-3 py-2 text-xs font-black text-fuchsia-950 hover:bg-fuchsia-200">
          {playing ? "Pause" : "Play"}
        </button>
        <span className="w-20 font-mono text-[10px] font-bold text-slate-300">{clock(currentTime)} / {clock(duration)}</span>
        <input
          aria-label="Audition playhead"
          type="range"
          min="0"
          max={duration}
          step="0.05"
          value={Math.min(currentTime, duration)}
          onChange={(event) => seek(Number(event.currentTarget.value))}
          className="min-w-0 flex-1 accent-fuchsia-300"
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-center text-[10px] font-bold sm:grid-cols-4">
        <div className="rounded-lg bg-slate-900 px-2 py-2"><div className="font-mono text-sm font-black text-fuchsia-200">{source.integratedLufs.toFixed(1)}</div><div className="text-slate-400">Source LUFS</div></div>
        <div className="rounded-lg bg-slate-900 px-2 py-2"><div className="font-mono text-sm font-black text-emerald-200">{mastered.integratedLufs.toFixed(1)}</div><div className="text-slate-400">Preview LUFS</div></div>
        <div className="rounded-lg bg-slate-900 px-2 py-2"><div className="font-mono text-sm font-black text-fuchsia-200">{source.truePeakDbtp.toFixed(1)}</div><div className="text-slate-400">Source dBTP</div></div>
        <div className="rounded-lg bg-slate-900 px-2 py-2"><div className="font-mono text-sm font-black text-emerald-200">{mastered.truePeakDbtp.toFixed(1)}</div><div className="text-slate-400">Preview dBTP</div></div>
      </div>

      <section className="mt-3 rounded-lg border border-slate-700 bg-slate-900 p-3" aria-label="Decoded signal diagnosis">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-black">Decoded signal diagnosis</div>
            <p className="mt-1 text-[9px] font-bold leading-4 text-slate-400">Independent amplitude, channel, invalid-sample, and near-silence evidence. Every candidate still requires listening.</p>
          </div>
          <span className={`rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-[0.1em] ${diagnosis ? "border-sky-700 bg-sky-950 text-sky-200" : "border-amber-700 bg-amber-950 text-amber-200"}`}>
            {diagnosis ? "Complete decode" : "Evidence upgrade needed"}
          </span>
        </div>
        {diagnosis ? (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2 text-center text-[9px] font-bold sm:grid-cols-5">
              <div className="rounded-md bg-slate-950 px-2 py-2"><div className="font-mono text-sm font-black">{diagnosis.overall.rmsDbfs.toFixed(1)}</div><div className="text-slate-400">RMS dBFS</div></div>
              <div className="rounded-md bg-slate-950 px-2 py-2"><div className="font-mono text-sm font-black">{diagnosis.overall.peakDbfs.toFixed(1)}</div><div className="text-slate-400">Sample peak dBFS</div></div>
              <div className="rounded-md bg-slate-950 px-2 py-2"><div className="font-mono text-sm font-black">{diagnosis.overall.noiseFloorDbfs === null ? "—" : diagnosis.overall.noiseFloorDbfs.toFixed(1)}</div><div className="text-slate-400">Estimated floor dBFS</div></div>
              <div className="rounded-md bg-slate-950 px-2 py-2"><div className="font-mono text-sm font-black">{diagnosis.overall.dcOffset.toFixed(4)}</div><div className="text-slate-400">DC offset</div></div>
              <div className="col-span-2 rounded-md bg-slate-950 px-2 py-2 sm:col-span-1"><div className="font-mono text-sm font-black">{diagnosis.channelCount} / {(diagnosis.sampleRateHz / 1_000).toFixed(0)}k</div><div className="text-slate-400">Channels / Hz</div></div>
            </div>
            {diagnosis.observations.length === 0 ? (
              <div className="mt-3 rounded-md border border-emerald-800 bg-emerald-950/60 px-3 py-2 text-[9px] font-bold leading-4 text-emerald-200">
                No deterministic signal-attention candidates were found. This does not certify noise, tone, intelligibility, or subjective quality.
              </div>
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {diagnosis.observations.map((observation, index) => (
                  <button key={`${observation.kind}-${observation.startSeconds}-${index}`} type="button" onClick={() => seek(observation.startSeconds)} className={`rounded-lg border px-3 py-2 text-left ${observation.severity === "warning" ? "border-rose-800 bg-rose-950/50 hover:border-rose-400" : "border-amber-800 bg-amber-950/40 hover:border-amber-400"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[9px] font-black uppercase tracking-[0.1em]">{observation.kind.replaceAll("-", " ")}</span>
                      <span className="font-mono text-[9px] font-black">{clock(observation.startSeconds)}{observation.endSeconds > observation.startSeconds ? `–${clock(observation.endSeconds)}` : ""}</span>
                    </div>
                    <div className="mt-1 text-[9px] font-bold leading-4 text-slate-300">{observation.detail}</div>
                  </button>
                ))}
              </div>
            )}
            <p className="mt-3 text-[8px] font-bold leading-4 text-slate-500">FFmpeg {diagnosis.analyzer.version} · complete source decode · noise floor is an estimate · near-silence is never automatically treated as a dropout.</p>
          </>
        ) : (
          <p className="mt-3 rounded-md border border-amber-800 bg-amber-950/40 px-3 py-2 text-[9px] font-bold leading-4 text-amber-200">This preview predates server-grade signal diagnosis. Upgrade it from the media card to add evidence without replacing the mastered bytes.</p>
        )}
      </section>

      <div className="mt-3"><AudioMasteryComparisonGraph source={source} mastered={mastered} targetLufs={targetLufs} /></div>
      <AudioProcessingChangeMap source={source} candidate={mastered} observations={diagnosis?.observations ?? []} selectedSeconds={currentTime} onSelect={seek} />
      {moments.length > 0 && (
        <div className="mt-3">
          <div className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">Listen at the moments that explain the pass</div>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {moments.map((moment) => (
              <button key={moment.id} type="button" onClick={() => seek(moment.timeSeconds)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-left hover:border-fuchsia-300 hover:bg-slate-800">
                <div className="font-mono text-[10px] font-black text-fuchsia-200">{clock(moment.timeSeconds)}</div>
                <div className="mt-1 text-[10px] font-black">{moment.label}</div>
                <div className="mt-1 text-[9px] font-bold leading-4 text-slate-400">{moment.detail}</div>
              </button>
            ))}
          </div>
        </div>
      )}
      {onReview ? <section className="mt-3 rounded-xl border border-fuchsia-700 bg-slate-900 p-3" aria-label="Mastering decision review">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><div className="text-xs font-black">{sessionPresentation ? "Choose when you are ready" : "Playback-tracked decision"}</div><p className="mt-1 max-w-3xl text-[9px] font-bold leading-4 text-slate-400">{sessionPresentation ? "Listen to Quipsly’s suggested moments in both versions, once at a fair comparison volume and once at final volume. Your original always stays available." : "Approval needs about three seconds around every evidence-selected moment in both versions, plus matched-loudness and delivery-level monitoring. Rejection can happen as soon as the preview is heard, with a note explaining why. This desk records player progress; it cannot prove audibility or attention."}</p></div>
          <span className={`rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-wide ${reviewCoverage.approvalReady ? "border-emerald-700 bg-emerald-950 text-emerald-200" : "border-amber-700 bg-amber-950 text-amber-200"}`}>{reviewCoverage.approvalReady ? (sessionPresentation ? "Ready to choose" : "Approval evidence complete") : (sessionPresentation ? "Listen to compare" : "Listening in progress")}</span>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {reviewCoverage.requiredMoments.map((moment) => {
            const sourceDone = reviewCoverage.sourceCompletedMomentIds.includes(moment.id);
            const masterDone = reviewCoverage.masteredCompletedMomentIds.includes(moment.id);
            return <button key={`review-${moment.id}`} type="button" onClick={() => seek(moment.timeSeconds)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-left hover:border-fuchsia-300"><div className="flex items-center justify-between gap-2"><span className="font-mono text-[9px] font-black text-fuchsia-200">{clock(moment.timeSeconds)}</span><span className={`text-[8px] font-black ${sourceDone && masterDone ? "text-emerald-300" : "text-amber-300"}`}>{sourceDone ? "source ✓" : "source ○"} · {masterDone ? "preview ✓" : "preview ○"}</span></div><div className="mt-1 text-[9px] font-black">{moment.label}</div></button>;
          })}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-[9px] font-black"><div className={`rounded-lg border px-3 py-2 ${reviewCoverage.matchedMonitorObserved ? "border-emerald-700 bg-emerald-950 text-emerald-200" : "border-slate-700 bg-slate-950 text-slate-400"}`}>{sessionPresentation ? "Fair comparison" : "Matched loudness"} {reviewCoverage.matchedMonitorObserved ? "heard ✓" : "not heard"}</div><div className={`rounded-lg border px-3 py-2 ${reviewCoverage.deliveryMonitorObserved ? "border-emerald-700 bg-emerald-950 text-emerald-200" : "border-slate-700 bg-slate-950 text-slate-400"}`}>{sessionPresentation ? "Final volume" : "Delivery level"} {reviewCoverage.deliveryMonitorObserved ? "heard ✓" : "not heard"}</div></div>
        <label className="mt-3 block text-[9px] font-black text-slate-300">Review note
          <textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} rows={3} placeholder="Optional for approval; required to reject." className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-[10px] text-white focus:border-fuchsia-300 focus:outline-none" />
        </label>
        <div className="mt-3 grid gap-2 sm:grid-cols-2"><button type="button" disabled={isReviewing || !reviewCoverage.approvalReady} onClick={() => void saveReview("approved")} className="rounded-lg border border-emerald-600 bg-emerald-950 px-3 py-2 text-left text-[10px] font-black text-emerald-100 hover:bg-emerald-900 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-950 disabled:text-slate-500">{sessionPresentation ? "Approve improved copy" : "Approve as heard"}<span className="mt-1 block text-[9px] opacity-75">{sessionPresentation ? "Saves your choice. Your original stays unchanged." : "Creates a receipt only; promotion stays separate."}</span></button><button type="button" disabled={isReviewing || masteredListenedSecondBins.length === 0 || reviewNote.trim().length < 3} onClick={() => void saveReview("rejected")} className="rounded-lg border border-rose-700 bg-rose-950 px-3 py-2 text-left text-[10px] font-black text-rose-100 hover:bg-rose-900 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-950 disabled:text-slate-500">{sessionPresentation ? "Reject improved copy" : "Reject preview"}<span className="mt-1 block text-[9px] opacity-75">{sessionPresentation ? "Keeps both versions and saves what you noticed." : "Keeps both files and records what failed."}</span></button></div>
        {reviewMessage ? <p role="status" className="mt-3 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-[9px] font-bold leading-4 text-slate-300">{reviewMessage}</p> : null}
        {review.latest ? <p className="mt-2 text-[8px] font-bold leading-4 text-slate-500">Latest retained decision {review.latest.id.slice(0, 12)} · {review.approvalCount} approval{review.approvalCount === 1 ? "" : "s"} · {review.rejectionCount} rejection{review.rejectionCount === 1 ? "" : "s"}. A later receipt does not erase this history.</p> : null}
      </section> : null}
      {onPromotion ? <section className={`mt-3 rounded-xl border p-3 ${thisPreviewPromoted ? "border-emerald-700 bg-emerald-950/40" : promotion.active ? "border-amber-700 bg-amber-950/30" : "border-sky-700 bg-sky-950/30"}`} aria-label="Mastering delivery candidate">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-black">Delivery candidate</div>
            <p className="mt-1 max-w-3xl text-[9px] font-bold leading-4 text-slate-300">Promotion is a reversible editorial decision after playback approval. It does not replace the immutable source, change the episode spine, encode RSS audio, upload, or publish.</p>
          </div>
          <span className={`rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-wide ${thisPreviewPromoted ? "border-emerald-600 bg-emerald-950 text-emerald-200" : promotion.active ? "border-amber-700 bg-slate-950 text-amber-200" : "border-sky-700 bg-slate-950 text-sky-200"}`}>{thisPreviewPromoted ? "This preview active" : promotion.active ? "Another preview active" : "Not promoted"}</span>
        </div>
        {promotion.active ? <>
          <p className={`mt-3 rounded-lg border bg-slate-950 px-3 py-2 text-[9px] font-bold leading-4 ${thisPreviewPromoted ? "border-emerald-800 text-emerald-200" : "border-amber-800 text-amber-200"}`}>{thisPreviewPromoted ? "This preview is" : `Mastering job ${promotion.activePromotion?.jobId.slice(0, 12) || "unknown"} is`} promoted from listening receipt {promotion.activePromotion?.reviewReceiptId?.slice(0, 12) || "unknown"}. {delivery.output ? "A separately verified encoded artifact exists below; promotion itself did not create it." : "It is ready for a later source-bound delivery recipe; no encoded artifact exists yet."}</p>
          <label className="mt-3 block text-[9px] font-black text-slate-300">Why withdraw this candidate?
            <textarea value={withdrawalReason} onChange={(event) => setWithdrawalReason(event.target.value)} rows={2} placeholder="Required. For example: heard pumping in the final section." className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-[10px] text-white focus:border-rose-400 focus:outline-none" />
          </label>
          <button type="button" disabled={isPromoting || withdrawalReason.trim().length < 3} onClick={() => void changePromotion("withdraw")} className="mt-2 w-full rounded-lg border border-rose-700 bg-rose-950 px-3 py-2 text-left text-[10px] font-black text-rose-100 hover:bg-rose-900 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-950 disabled:text-slate-500">Withdraw delivery candidate<span className="mt-1 block text-[9px] opacity-75">Preserves the preview and every review/promotion receipt.</span></button>
        </> : review.latest?.decision === "approved" ? <button type="button" disabled={isPromoting} onClick={() => void changePromotion("promote")} className="mt-3 w-full rounded-lg border border-emerald-600 bg-emerald-950 px-3 py-2 text-left text-[10px] font-black text-emerald-100 hover:bg-emerald-900 disabled:opacity-50">Promote approved preview<span className="mt-1 block text-[9px] opacity-75">Creates the active delivery-candidate receipt. Source, timeline, encoding, upload, and publication remain untouched.</span></button> : <p className="mt-3 rounded-lg border border-amber-800 bg-slate-950 px-3 py-2 text-[9px] font-bold leading-4 text-amber-200">Complete the playback comparison and make the latest decision an approval before promotion is available.</p>}
        {promotion.latest ? <p className="mt-2 text-[8px] font-bold leading-4 text-slate-500">Latest promotion event {promotion.latest.id.slice(0, 12)} · {promotion.promoteCount} promotion{promotion.promoteCount === 1 ? "" : "s"} · {promotion.withdrawalCount} withdrawal{promotion.withdrawalCount === 1 ? "" : "s"}. History is append-only.</p> : null}
        {promotionMessage ? <p role="status" className="mt-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-[9px] font-bold leading-4 text-slate-300">{promotionMessage}</p> : null}
      </section> : null}
      {onDelivery ? <section className={`mt-3 rounded-xl border p-3 ${delivery.review.latest?.decision === "approved" ? "border-emerald-700 bg-emerald-950/40" : delivery.output ? "border-violet-700 bg-violet-950/30" : "border-slate-700 bg-slate-900"}`} aria-label="Podcast delivery artifact">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-black">Podcast delivery artifact</div>
            <p className="mt-1 max-w-3xl text-[9px] font-bold leading-4 text-slate-300">AAC-LC · MP4/M4A · 48 kHz stereo · 128 kb/s · fast-start. Encoding remeasures the actual lossy bytes. It never replaces the WAV candidate and cannot create an output packet, upload, or publish.</p>
          </div>
          <span className={`rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-wide ${delivery.review.latest?.decision === "approved" ? "border-emerald-600 bg-emerald-950 text-emerald-200" : delivery.output ? "border-violet-600 bg-slate-950 text-violet-200" : "border-slate-600 bg-slate-950 text-slate-300"}`}>{delivery.review.latest?.decision === "approved" ? "Proof-listen approved" : delivery.status === "not-queued" ? "Not encoded" : delivery.status}</span>
        </div>
        {!thisPreviewPromoted ? <p className="mt-3 rounded-lg border border-amber-800 bg-slate-950 px-3 py-2 text-[9px] font-bold leading-4 text-amber-200">Promote this exact mastered preview before encoding a delivery artifact. Withdrawing or replacing the promotion holds proof-listen approval.</p> : null}
        {thisPreviewPromoted && !delivery.output ? <button type="button" disabled={isDelivering} onClick={() => void createDeliveryArtifact()} className="mt-3 w-full rounded-lg border border-violet-500 bg-violet-950 px-3 py-2 text-left text-[10px] font-black text-violet-100 hover:bg-violet-900 disabled:cursor-wait disabled:border-slate-700 disabled:bg-slate-950 disabled:text-slate-500">{isDelivering || ["queued", "processing", "output-ready"].includes(delivery.status) ? "Encoding and verifying AAC artifact…" : delivery.status === "failed" ? "Retry AAC delivery artifact" : "Prepare AAC delivery artifact"}<span className="mt-1 block text-[9px] opacity-75">Uses only the active promoted bytes; the immutable source and WAV candidate stay untouched.</span></button> : null}
        {delivery.output?.playbackUrl ? <div className="mt-3 rounded-lg border border-violet-800 bg-slate-950 p-3">
          <div className="grid grid-cols-2 gap-2 text-center text-[9px] font-bold sm:grid-cols-5">
            <div className="rounded-md bg-slate-900 px-2 py-2"><div className="font-mono text-sm font-black text-violet-200">AAC-LC</div><div className="text-slate-400">Codec</div></div>
            <div className="rounded-md bg-slate-900 px-2 py-2"><div className="font-mono text-sm font-black text-violet-200">{Math.round(delivery.output.bitrateBps / 1_000)}k</div><div className="text-slate-400">bit/s</div></div>
            <div className="rounded-md bg-slate-900 px-2 py-2"><div className="font-mono text-sm font-black text-emerald-200">{delivery.output.integratedLufs.toFixed(1)}</div><div className="text-slate-400">Post-encode LUFS</div></div>
            <div className="rounded-md bg-slate-900 px-2 py-2"><div className="font-mono text-sm font-black text-emerald-200">{delivery.output.truePeakDbtp.toFixed(1)}</div><div className="text-slate-400">Post-encode dBTP</div></div>
            <div className="col-span-2 rounded-md bg-slate-900 px-2 py-2 sm:col-span-1"><div className="font-mono text-sm font-black text-sky-200">fast-start ✓</div><div className="text-slate-400">Complete decode</div></div>
          </div>
          <audio controls preload="metadata" src={delivery.output.playbackUrl} className="mt-3 w-full" aria-label="Encoded podcast delivery artifact" onTimeUpdate={(event) => {
            if (event.currentTarget.paused) return;
            const bin = Math.max(0, Math.floor(event.currentTarget.currentTime));
            setDeliveryListenedSecondBins((current) => current.includes(bin) ? current : [...current, bin].sort((left, right) => left - right));
          }} />
          <div className="mt-2 grid grid-cols-3 gap-2 text-[9px] font-black">
            {[{ label: "Beginning", anchor: 0 }, { label: "Midpoint", anchor: Math.floor(delivery.output.durationSeconds / 2) }, { label: "Ending", anchor: Math.max(0, Math.floor(delivery.output.durationSeconds - 0.001)) }].map((moment) => {
              const covered = [moment.anchor - 1, moment.anchor, moment.anchor + 1].filter((bin) => bin >= 0 && bin < delivery.output!.durationSeconds).every((bin) => deliveryListenedSecondBins.includes(bin));
              return <div key={moment.label} className={`rounded-lg border px-2 py-2 text-center ${covered ? "border-emerald-700 bg-emerald-950 text-emerald-200" : "border-slate-700 bg-slate-900 text-slate-400"}`}>{moment.label} {covered ? "✓" : "○"}<span className="mt-1 block font-mono text-[8px]">{clock(moment.anchor)}</span></div>;
            })}
          </div>
          <label className="mt-3 block text-[9px] font-black text-slate-300">Encoded-byte review note
            <textarea value={deliveryReviewNote} onChange={(event) => setDeliveryReviewNote(event.target.value)} rows={2} placeholder="Optional for approval; required to reject." className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-[10px] text-white focus:border-violet-300 focus:outline-none" />
          </label>
          <div className="mt-2 grid gap-2 sm:grid-cols-2"><button type="button" disabled={isDelivering || !deliveryCoverage.approvalReady || !delivery.promotionStillActive} onClick={() => void saveDeliveryReview("approved")} className="rounded-lg border border-emerald-600 bg-emerald-950 px-3 py-2 text-left text-[10px] font-black text-emerald-100 hover:bg-emerald-900 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-900 disabled:text-slate-500">Approve encoded bytes as heard<span className="mt-1 block text-[9px] opacity-75">Receipt only; output packet, enclosure upload, and publication stay separate.</span></button><button type="button" disabled={isDelivering || deliveryListenedSecondBins.length === 0 || deliveryReviewNote.trim().length < 3} onClick={() => void saveDeliveryReview("rejected")} className="rounded-lg border border-rose-700 bg-rose-950 px-3 py-2 text-left text-[10px] font-black text-rose-100 hover:bg-rose-900 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-900 disabled:text-slate-500">Reject encoded bytes<span className="mt-1 block text-[9px] opacity-75">Preserves the candidate, artifact, and append-only review history.</span></button></div>
          {delivery.review.latest ? <p className="mt-2 text-[8px] font-bold leading-4 text-slate-500">Latest encoded-byte decision {delivery.review.latest.id.slice(0, 12)} · {delivery.review.approvalCount} approval{delivery.review.approvalCount === 1 ? "" : "s"} · {delivery.review.rejectionCount} rejection{delivery.review.rejectionCount === 1 ? "" : "s"}.</p> : null}
        </div> : null}
        {delivery.error ? <p className="mt-2 rounded-lg border border-rose-800 bg-rose-950 px-3 py-2 text-[9px] font-bold text-rose-200">{delivery.error}</p> : null}
        {deliveryMessage ? <p role="status" className="mt-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-[9px] font-bold leading-4 text-slate-300">{deliveryMessage}</p> : null}
      </section> : null}
      <p className="mt-3 text-[9px] font-bold leading-4 text-slate-400">
        Both curves come from complete BS.1770 decodes at one-second display resolution. The preview is a separate 24-bit WAV and has not replaced or modified the source.
      </p>
    </section>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
