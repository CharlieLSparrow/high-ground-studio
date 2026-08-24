export const AUDIO_TRANSCRIPT_EVIDENCE_SCHEMA = "quipsly-audio-transcript-evidence-v1" as const;

export type AudioTranscriptEvidenceSegment = {
  id: string;
  startSeconds: number;
  endSeconds: number;
  providerText: string;
  text: string;
  confidence: number | null;
  words: Array<{
    word: string;
    punctuatedWord: string;
    startSeconds: number;
    endSeconds: number;
    confidence: number | null;
  }>;
  acceptedCorrection: { id: string } | null;
  acceptedVerification: { id: string } | null;
};

export type AudioTranscriptEvidence = {
  schema: typeof AUDIO_TRANSCRIPT_EVIDENCE_SCHEMA;
  audio: {
    includesAudio: boolean | null;
    container: string | null;
    codec: string | null;
    encodedSampleRateHz: number | null;
    encodedChannelCount: number | null;
    hardwareSampleRateHz: number | null;
    hardwareInputChannelCount: number | null;
    decodedAudioTrackCount: number | null;
    decodedSampleRateHz: number | null;
    decodedChannelCount: number | null;
    inputRoute: string | null;
    inputPortType: string | null;
    inputDataSource: string | null;
    capturePipeline: string | null;
    pauseTimelinePolicy: string | null;
    durationSeconds: number | null;
    formatComparison: "MATCH" | "DRIFT" | "NOT_MEASURED";
    issues: string[];
    signal: {
      schemaVersion: 1;
      algorithm: string;
      status: "signal-present" | "attention" | "near-digital-silence";
      sampleRateHz: number;
      channelCount: number;
      analyzedFrameCount: number;
      durationSeconds: number;
      windowDurationSeconds: number;
      rmsDbfs: number;
      samplePeakDbfs: number;
      clippedFrameCount: number;
      clippedFrameFraction: number;
      nearSilentFrameFraction: number;
      leftRmsDbfs: number | null;
      rightRmsDbfs: number | null;
      stereoBalanceDb: number | null;
      rmsIsNotLufs: true;
      thresholds: {
        clippingAmplitude: number;
        nearSilenceDbfs: number;
        possibleDropoutMinimumSeconds: number;
        surroundingSignalDbfs: number;
        stereoImbalanceDb: number;
      };
      waveform: Array<{
        startSeconds: number;
        durationSeconds: number;
        rmsDbfs: number;
        samplePeakDbfs: number;
        clippedFrameCount: number;
      }>;
      frequencyProfile: null | {
        algorithm: "quipsly-audio-broad-band-rms-v1";
        completeDecode: true;
        downmixPolicy: "ffmpeg-default-mono-v1";
        windowDurationSeconds: number;
        bands: Array<{
          id: "rumble" | "warmth" | "body" | "speech" | "presence" | "air";
          label: string;
          minimumHz: number;
          maximumHz: number;
        }>;
        overallBandRmsDbfs: number[];
        windows: Array<{
          startSeconds: number;
          durationSeconds: number;
          bandRmsDbfs: number[];
        }>;
        broadBandsAreNotARepairSpectrogram: true;
        measurementsAreNotEqDecisions: true;
        stereoIsDownmixedForFrequencyOverview: true;
      };
      observations: Array<{
        kind: "sample-clipping" | "possible-dropout" | "near-digital-silence" | "stereo-imbalance" | "unknown";
        severity: "attention" | "warning";
        startSeconds: number;
        endSeconds: number;
        detail: string;
        requiresListening: true;
      }>;
    } | null;
    timelineEvents: Array<{
      kind: "pause" | "interruption" | "user-mark" | "app-backgrounded" | "call-transport-gap";
      startSeconds: number;
      endSeconds: number;
      detail: string | null;
      routeName: string | null;
      routePortType: string | null;
    }>;
  };
  transcript: {
    provider: string | null;
    providerModel: string | null;
    language: string | null;
    status: string | null;
    segmentCount: number;
    wordCount: number;
    timedWordCount: number;
    confidenceWordCount: number;
    meanWordConfidence: number | null;
    medianWordConfidence: number | null;
    lowConfidenceThreshold: number | null;
    lowConfidenceThresholdAuthority: string | null;
    lowConfidenceWordCount: number | null;
    confidenceIsNotMeasuredAccuracy: true;
    reviewedSegmentCount: number;
    correctedSegmentCount: number;
    confirmedAsIsSegmentCount: number;
    reviewCoverage: number;
    measuredWordErrorRate: number | null;
    measuredWordErrorCount: number;
    measuredReferenceWordCount: number;
    measuredScope: "NONE" | "REVIEWED_SAMPLE" | "COMPLETE_TRANSCRIPT";
    measuredReviewSegments: Array<{
      segmentId: string;
      startSeconds: number;
      endSeconds: number;
      reviewKind: "corrected" | "confirmed-as-is";
      wordErrorCount: number;
      referenceWordCount: number;
      wordErrorRate: number;
    }>;
    providerSpeakerClusterCount: number;
    attributedSpeakerClusterCount: number;
    transcriptStartSeconds: number | null;
    transcriptEndSeconds: number | null;
    recordingDurationSeconds: number | null;
    startsAfterRecordingBySeconds: number | null;
    endsBeforeRecordingBySeconds: number | null;
    timingIntegrity: {
      disposition: "structurally-consistent" | "review-required" | "unavailable";
      structurallyValidWordCount: number;
      invalidWordTimingCount: number;
      outsideSegmentWordCount: number;
      nonMonotonicWordCount: number;
      overlappingWordCount: number;
      editableSegmentCount: number;
      timingIntegrityIsNotMeasuredAccuracy: true;
      attentionSegments: Array<{
        segmentId: string;
        startSeconds: number;
        endSeconds: number;
        reasons: Array<"no-word-timing" | "invalid-word-range" | "outside-segment" | "non-monotonic" | "overlapping-words">;
      }>;
    };
    attentionSegments: Array<{
      segmentId: string;
      startSeconds: number;
      endSeconds: number;
      text: string;
      reviewed: boolean;
      minimumWordConfidence: number | null;
      lowConfidenceWords: Array<{
        word: string;
        confidence: number;
        startSeconds: number;
        endSeconds: number;
      }>;
    }>;
  };
};

type EvidenceInput = {
  provider?: unknown;
  providerModel?: unknown;
  language?: unknown;
  status?: unknown;
  confidenceTriageThreshold?: unknown;
  confidenceTriageThresholdAuthority?: unknown;
  recordingDurationSeconds?: unknown;
  sourceProfile?: unknown;
  recordingSegments?: unknown;
  recordingStartedAt?: unknown;
  segments?: AudioTranscriptEvidenceSegment[];
  speakerGroups?: Array<{ attribution?: unknown }>;
};

export function transcriptConfidenceTriagePolicy(input: {
  provider?: unknown;
  explicitThreshold?: unknown;
  explicitThresholdAuthority?: unknown;
  hasConfidenceEvidence: boolean;
}) {
  if (!input.hasConfidenceEvidence) {
    return { threshold: null, authority: null } as const;
  }
  const explicitThreshold = confidence(input.explicitThreshold);
  const explicitThresholdAuthority = text(input.explicitThresholdAuthority);
  if (explicitThreshold !== null && explicitThresholdAuthority) {
    return { threshold: explicitThreshold, authority: explicitThresholdAuthority };
  }
  if (text(input.provider)?.toLowerCase() === "deepgram") {
    return { threshold: 0.65, authority: "quipsly-deepgram-default-v1" } as const;
  }
  return { threshold: null, authority: null } as const;
}

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function signedFinite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function integer(value: unknown): number | null {
  const number = finite(value);
  return number === null ? null : Math.trunc(number);
}

function confidence(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : null;
}

function rounded(value: number, places = 4) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function tokens(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? [];
}

export function transcriptWordEditDistance(hypothesis: string, reference: string) {
  const left = tokens(hypothesis);
  const right = tokens(reference);
  let prior = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitution = prior[rightIndex - 1]! + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1);
      current[rightIndex] = Math.min(
        prior[rightIndex]! + 1,
        current[rightIndex - 1]! + 1,
        substitution,
      );
    }
    prior = current;
  }
  return { errors: prior[right.length] ?? 0, referenceWords: right.length };
}

export function transcriptTimingIntegrity(segments: AudioTranscriptEvidenceSegment[]): AudioTranscriptEvidence["transcript"]["timingIntegrity"] {
  let structurallyValidWordCount = 0;
  let invalidWordTimingCount = 0;
  let outsideSegmentWordCount = 0;
  let nonMonotonicWordCount = 0;
  let overlappingWordCount = 0;
  let editableSegmentCount = 0;
  const attentionSegments: AudioTranscriptEvidence["transcript"]["timingIntegrity"]["attentionSegments"] = [];

  for (const segment of segments) {
    const reasons = new Set<(typeof attentionSegments)[number]["reasons"][number]>();
    let previousStart = Number.NEGATIVE_INFINITY;
    let previousEnd = Number.NEGATIVE_INFINITY;
    if (!segment.words.length) reasons.add("no-word-timing");
    for (const word of segment.words) {
      const start = word.startSeconds;
      const end = word.endSeconds;
      const valid = Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start;
      if (!valid) {
        invalidWordTimingCount += 1;
        reasons.add("invalid-word-range");
        continue;
      }
      let structurallyValid = true;
      if (start < segment.startSeconds - 0.1 || end > segment.endSeconds + 0.1) {
        outsideSegmentWordCount += 1;
        reasons.add("outside-segment");
        structurallyValid = false;
      }
      if (start < previousStart - 0.001) {
        nonMonotonicWordCount += 1;
        reasons.add("non-monotonic");
        structurallyValid = false;
      }
      if (start < previousEnd - 0.02) {
        overlappingWordCount += 1;
        reasons.add("overlapping-words");
        structurallyValid = false;
      }
      if (structurallyValid) structurallyValidWordCount += 1;
      previousStart = start;
      previousEnd = Math.max(previousEnd, end);
    }
    if (reasons.size === 0 && segment.words.length > 0) editableSegmentCount += 1;
    else attentionSegments.push({
      segmentId: segment.id,
      startSeconds: segment.startSeconds,
      endSeconds: segment.endSeconds,
      reasons: [...reasons],
    });
  }

  const wordCount = segments.reduce((total, segment) => total + segment.words.length, 0);
  return {
    disposition: wordCount === 0
      ? "unavailable"
      : attentionSegments.length
        ? "review-required"
        : "structurally-consistent",
    structurallyValidWordCount,
    invalidWordTimingCount,
    outsideSegmentWordCount,
    nonMonotonicWordCount,
    overlappingWordCount,
    editableSegmentCount,
    timingIntegrityIsNotMeasuredAccuracy: true,
    attentionSegments,
  };
}

function sourceAudio(
  sourceProfileValue: unknown,
  recordingSegmentsValue: unknown,
  recordingStartedAtValue: unknown,
) {
  const profile = object(sourceProfileValue);
  const recorded = object(profile.recordedMedia);
  const includesAudio = typeof profile.includesAudio === "boolean" ? profile.includesAudio : null;
  const encodedSampleRateHz = finite(profile.audioSampleRate);
  const encodedChannelCount = integer(profile.audioChannelCount);
  const decodedAudioTrackCount = integer(recorded.audioTrackCount);
  const decodedSampleRateHz = finite(recorded.audioSampleRate);
  const decodedChannelCount = integer(recorded.audioChannelCount);
  const issues: string[] = [];

  if (includesAudio === false || decodedAudioTrackCount === 0) {
    issues.push("This source profile contains no encoded audio track.");
  }
  if (encodedSampleRateHz !== null && decodedSampleRateHz !== null && Math.abs(encodedSampleRateHz - decodedSampleRateHz) > 1) {
    issues.push("The capture-time and decoded audio sample rates do not match.");
  }
  if (encodedChannelCount !== null && decodedChannelCount !== null && encodedChannelCount !== decodedChannelCount) {
    issues.push("The capture-time and decoded audio channel counts do not match.");
  }
  const compared = (encodedSampleRateHz !== null && decodedSampleRateHz !== null)
    || (encodedChannelCount !== null && decodedChannelCount !== null);
  const signal = parseAudioSignalEvidence(profile.audioSignal);
  if (signal && audioDurationDrift(signal.durationSeconds, finite(recorded.durationSeconds))) {
    issues.push("The signal scan duration does not match the decoded recording duration.");
  }

  return {
    includesAudio,
    container: text(profile.container),
    codec: text(profile.codec),
    encodedSampleRateHz,
    encodedChannelCount,
    hardwareSampleRateHz: finite(profile.audioHardwareSampleRate),
    hardwareInputChannelCount: integer(profile.audioHardwareInputChannelCount),
    decodedAudioTrackCount,
    decodedSampleRateHz,
    decodedChannelCount,
    inputRoute: text(profile.audioRouteName),
    inputPortType: text(profile.audioRoutePortType),
    inputDataSource: text(profile.audioInputDataSourceName),
    capturePipeline: text(profile.audioCapturePipeline),
    pauseTimelinePolicy: text(profile.pauseTimelinePolicy),
    durationSeconds: finite(recorded.durationSeconds),
    formatComparison: issues.length ? "DRIFT" as const : compared ? "MATCH" as const : "NOT_MEASURED" as const,
    issues,
    signal,
    timelineEvents: captureTimelineEvents({
      value: recordingSegmentsValue,
      recordingStartedAt: recordingStartedAtValue,
      pauseTimelinePolicy: text(profile.pauseTimelinePolicy),
    }),
  };
}

function audioDurationDrift(left: number, right: number | null) {
  return right !== null && Math.abs(left - right) > Math.max(0.25, right * 0.005);
}

export function parseAudioSignalEvidence(
  value: unknown,
  options: { maximumWaveformPoints?: number } = {},
): AudioTranscriptEvidence["audio"]["signal"] {
  const row = object(value);
  if (integer(row.schemaVersion) !== 1) return null;
  const algorithm = text(row.algorithm);
  const sampleRateHz = finite(row.sampleRate);
  const channelCount = integer(row.channelCount);
  const analyzedFrameCount = integer(row.analyzedFrameCount);
  const durationSeconds = finite(row.durationSeconds);
  const windowDurationSeconds = finite(row.windowDurationSeconds);
  const rmsDbfs = signedFinite(row.rmsDbfs);
  const samplePeakDbfs = signedFinite(row.samplePeakDbfs);
  const clippedFrameCount = integer(row.clippedFrameCount);
  const clippedFrameFraction = confidence(row.clippedFrameFraction);
  const nearSilentFrameFraction = confidence(row.nearSilentFrameFraction);
  const status = text(row.signalStatus);
  const thresholds = object(row.thresholds);
  const clippingAmplitude = finite(thresholds.clippingAmplitude);
  const nearSilenceDbfs = signedFinite(thresholds.nearSilenceDbfs);
  const possibleDropoutMinimumSeconds = finite(thresholds.possibleDropoutMinimumSeconds);
  const surroundingSignalDbfs = signedFinite(thresholds.surroundingSignalDbfs);
  const stereoImbalanceDb = finite(thresholds.stereoImbalanceDb);
  if (
    !algorithm
    || sampleRateHz === null
    || channelCount === null
    || channelCount < 1
    || analyzedFrameCount === null
    || analyzedFrameCount < 1
    || durationSeconds === null
    || durationSeconds <= 0
    || windowDurationSeconds === null
    || windowDurationSeconds <= 0
    || rmsDbfs === null
    || samplePeakDbfs === null
    || clippedFrameCount === null
    || clippedFrameFraction === null
    || nearSilentFrameFraction === null
    || clippingAmplitude === null
    || nearSilenceDbfs === null
    || possibleDropoutMinimumSeconds === null
    || surroundingSignalDbfs === null
    || stereoImbalanceDb === null
    || !["signal-present", "attention", "near-digital-silence"].includes(status ?? "")
  ) return null;

  const rawWaveform = Array.isArray(row.waveform) ? row.waveform.slice(0, 1_200).flatMap((entry) => {
    const point = object(entry);
    const startSeconds = finite(point.startSeconds);
    const pointDurationSeconds = finite(point.durationSeconds);
    const pointRms = signedFinite(point.rmsDbfs);
    const pointPeak = signedFinite(point.samplePeakDbfs);
    const pointClipped = integer(point.clippedFrameCount);
    return startSeconds !== null
      && pointDurationSeconds !== null
      && pointDurationSeconds > 0
      && pointRms !== null
      && pointPeak !== null
      && pointClipped !== null
      ? [{
        startSeconds,
        durationSeconds: pointDurationSeconds,
        rmsDbfs: pointRms,
        samplePeakDbfs: pointPeak,
        clippedFrameCount: pointClipped,
      }]
      : [];
  }) : [];

  const observations = Array.isArray(row.observations) ? row.observations.slice(0, 80).flatMap((entry) => {
    const observation = object(entry);
    const startSeconds = finite(observation.startSeconds);
    const endSeconds = finite(observation.endSeconds);
    const rawKind = text(observation.kind);
    const kind = ["sample-clipping", "possible-dropout", "near-digital-silence", "stereo-imbalance"].includes(rawKind ?? "")
      ? rawKind as "sample-clipping" | "possible-dropout" | "near-digital-silence" | "stereo-imbalance"
      : "unknown" as const;
    const severity = text(observation.severity) === "warning" ? "warning" as const : "attention" as const;
    const detail = text(observation.detail);
    return startSeconds !== null && endSeconds !== null && endSeconds >= startSeconds && detail
      ? [{ kind, severity, startSeconds, endSeconds, detail, requiresListening: true as const }]
      : [];
  }) : [];
  const frequencyProfile = parseAudioFrequencyEvidence(row.frequencyProfile, {
    durationSeconds,
    sampleRateHz,
    maximumWindows: Math.max(1, Math.min(1_200, Math.trunc(options.maximumWaveformPoints ?? 180))),
  });

  return {
    schemaVersion: 1,
    algorithm,
    status: status as "signal-present" | "attention" | "near-digital-silence",
    sampleRateHz,
    channelCount,
    analyzedFrameCount,
    durationSeconds,
    windowDurationSeconds,
    rmsDbfs,
    samplePeakDbfs,
    clippedFrameCount,
    clippedFrameFraction,
    nearSilentFrameFraction,
    leftRmsDbfs: signedFinite(row.leftRmsDbfs),
    rightRmsDbfs: signedFinite(row.rightRmsDbfs),
    stereoBalanceDb: signedFinite(row.stereoBalanceDb),
    rmsIsNotLufs: true,
    thresholds: {
      clippingAmplitude,
      nearSilenceDbfs,
      possibleDropoutMinimumSeconds,
      surroundingSignalDbfs,
      stereoImbalanceDb,
    },
    waveform: compactSignalWaveform(
      rawWaveform,
      Math.max(1, Math.min(1_200, Math.trunc(options.maximumWaveformPoints ?? 180))),
    ),
    frequencyProfile,
    observations,
  };
}

function parseAudioFrequencyEvidence(
  value: unknown,
  options: { durationSeconds: number; sampleRateHz: number; maximumWindows: number },
): NonNullable<AudioTranscriptEvidence["audio"]["signal"]>["frequencyProfile"] {
  const row = object(value);
  if (text(row.algorithm) !== "quipsly-audio-broad-band-rms-v1" || row.completeDecode !== true || text(row.downmixPolicy) !== "ffmpeg-default-mono-v1") return null;
  const boundaries = object(row.boundaries);
  if (
    boundaries.broadBandsAreNotARepairSpectrogram !== true
    || boundaries.measurementsAreNotEqDecisions !== true
    || boundaries.stereoIsDownmixedForFrequencyOverview !== true
  ) return null;
  const bands = Array.isArray(row.bands) ? row.bands.slice(0, 7).flatMap((entry) => {
    const band = object(entry);
    const id = text(band.id);
    const label = text(band.label);
    const minimumHz = finite(band.minimumHz);
    const maximumHz = finite(band.maximumHz);
    return id && ["rumble", "warmth", "body", "speech", "presence", "air"].includes(id)
      && label && minimumHz !== null && minimumHz > 0 && maximumHz !== null && maximumHz > minimumHz
      ? [{ id: id as "rumble" | "warmth" | "body" | "speech" | "presence" | "air", label, minimumHz, maximumHz }]
      : [];
  }) : [];
  if (
    bands.length < 1
    || bands.length > 6
    || new Set(bands.map((band) => band.id)).size !== bands.length
    || bands.some((band, index) => (
      band.maximumHz >= options.sampleRateHz / 2
      || (index > 0 && band.minimumHz < bands[index - 1]!.maximumHz)
    ))
  ) return null;
  const overallBandRmsDbfs = Array.isArray(row.overallBandRmsDbfs)
    ? row.overallBandRmsDbfs.map(signedFinite).filter((entry): entry is number => entry !== null)
    : [];
  if (overallBandRmsDbfs.length !== bands.length) return null;
  const rawWindows = Array.isArray(row.windows) ? row.windows.slice(0, 1_201).flatMap((entry) => {
    const window = object(entry);
    const startSeconds = finite(window.startSeconds);
    const windowDuration = finite(window.durationSeconds);
    const bandRmsDbfs = Array.isArray(window.bandRmsDbfs)
      ? window.bandRmsDbfs.map(signedFinite).filter((band): band is number => band !== null)
      : [];
    return startSeconds !== null && windowDuration !== null && windowDuration > 0 && bandRmsDbfs.length === bands.length
      ? [{ startSeconds, durationSeconds: windowDuration, bandRmsDbfs }]
      : [];
  }) : [];
  if (
    rawWindows.length < 1
    || rawWindows.length > 1_200
    || rawWindows[0]!.startSeconds > 0.02
    || rawWindows.some((window, index) => index > 0 && Math.abs(
      window.startSeconds - (rawWindows[index - 1]!.startSeconds + rawWindows[index - 1]!.durationSeconds),
    ) > 0.02)
  ) return null;
  const endSeconds = rawWindows.at(-1)!.startSeconds + rawWindows.at(-1)!.durationSeconds;
  if (Math.abs(endSeconds - options.durationSeconds) > 0.02) return null;
  return {
    algorithm: "quipsly-audio-broad-band-rms-v1",
    completeDecode: true,
    downmixPolicy: "ffmpeg-default-mono-v1",
    windowDurationSeconds: finite(row.windowDurationSeconds) ?? rawWindows[0].durationSeconds,
    bands,
    overallBandRmsDbfs,
    windows: compactAudioFrequencyWindows(rawWindows, options.maximumWindows),
    broadBandsAreNotARepairSpectrogram: true,
    measurementsAreNotEqDecisions: true,
    stereoIsDownmixedForFrequencyOverview: true,
  };
}

export function compactAudioFrequencyWindows(
  points: NonNullable<NonNullable<AudioTranscriptEvidence["audio"]["signal"]>["frequencyProfile"]>["windows"],
  maximumPoints: number,
) {
  if (points.length <= maximumPoints) return points;
  const groupSize = Math.ceil(points.length / maximumPoints);
  const compacted = [];
  for (let index = 0; index < points.length; index += groupSize) {
    const group = points.slice(index, index + groupSize);
    const first = group[0]!;
    const last = group.at(-1)!;
    const durationSeconds = group.reduce((sum, point) => sum + point.durationSeconds, 0);
    compacted.push({
      startSeconds: first.startSeconds,
      durationSeconds: (last.startSeconds + last.durationSeconds) - first.startSeconds,
      bandRmsDbfs: first.bandRmsDbfs.map((_, bandIndex) => rounded(10 * Math.log10(Math.max(1e-16, group.reduce(
        (energy, point) => energy + (10 ** (point.bandRmsDbfs[bandIndex] / 10)) * point.durationSeconds,
        0,
      ) / durationSeconds)))),
    });
  }
  return compacted;
}

export function compactSignalWaveform(
  points: NonNullable<AudioTranscriptEvidence["audio"]["signal"]>["waveform"],
  maximumPoints: number,
) {
  if (points.length <= maximumPoints) return points;
  const groupSize = Math.ceil(points.length / maximumPoints);
  const compacted = [];
  for (let index = 0; index < points.length; index += groupSize) {
    const group = points.slice(index, index + groupSize);
    const first = group[0]!;
    const last = group[group.length - 1]!;
    compacted.push({
      startSeconds: first.startSeconds,
      durationSeconds: (last.startSeconds + last.durationSeconds) - first.startSeconds,
      rmsDbfs: Math.max(...group.map((point) => point.rmsDbfs)),
      samplePeakDbfs: Math.max(...group.map((point) => point.samplePeakDbfs)),
      clippedFrameCount: group.reduce((sum, point) => sum + point.clippedFrameCount, 0),
    });
  }
  return compacted;
}

function captureTimelineEvents(input: {
  value: unknown;
  recordingStartedAt: unknown;
  pauseTimelinePolicy: string | null;
}): AudioTranscriptEvidence["audio"]["timelineEvents"] {
  if (!Array.isArray(input.value)) return [];
  const recordingStartedAt = typeof input.recordingStartedAt === "string" || input.recordingStartedAt instanceof Date
    ? new Date(input.recordingStartedAt).getTime()
    : Number.NaN;
  let cumulativeActiveSeconds = 0;
  return input.value.slice(0, 2_000).flatMap((entry) => {
    const row = object(entry);
    const durationSeconds = finite(row.durationSeconds) ?? 0;
    cumulativeActiveSeconds += durationSeconds;
    const reason = text(row.stopReason);
    if (!reason || !["pause", "interruption", "user-mark", "app-backgrounded", "call-transport-gap"].includes(reason)) return [];
    const startedAt = text(row.startedAt);
    const startedAtMilliseconds = startedAt ? new Date(startedAt).getTime() : Number.NaN;
    const stoppedAt = text(row.stoppedAt);
    const stoppedAtMilliseconds = stoppedAt ? new Date(stoppedAt).getTime() : Number.NaN;
    const wallClockOffset = Number.isFinite(stoppedAtMilliseconds) && Number.isFinite(recordingStartedAt)
      ? Math.max(0, (stoppedAtMilliseconds - recordingStartedAt) / 1_000)
      : null;
    const gapStartOffset = Number.isFinite(startedAtMilliseconds) && Number.isFinite(recordingStartedAt)
      ? Math.max(0, (startedAtMilliseconds - recordingStartedAt) / 1_000)
      : null;
    const startSeconds = reason === "call-transport-gap" && gapStartOffset !== null
      ? gapStartOffset
      : input.pauseTimelinePolicy === "silence-preserves-wall-clock" && wallClockOffset !== null
        ? wallClockOffset
        : cumulativeActiveSeconds;
    const endSeconds = reason === "call-transport-gap" && wallClockOffset !== null
      ? Math.max(startSeconds, wallClockOffset)
      : startSeconds;
    return [{
      kind: reason as "pause" | "interruption" | "user-mark" | "app-backgrounded" | "call-transport-gap",
      startSeconds: rounded(startSeconds),
      endSeconds: rounded(endSeconds),
      detail: text(row.boundaryDetail),
      routeName: text(row.boundaryAudioRouteName),
      routePortType: text(row.boundaryAudioRoutePortType),
    }];
  });
}

export function buildAudioTranscriptEvidence(input: EvidenceInput): AudioTranscriptEvidence {
  const segments = Array.isArray(input.segments) ? input.segments : [];
  const words = segments.flatMap((segment) => segment.words.map((word) => ({ ...word, segment })));
  const timingIntegrity = transcriptTimingIntegrity(segments);
  const confidences = words.map((entry) => confidence(entry.confidence)).filter((value): value is number => value !== null);
  const sortedConfidences = [...confidences].sort((left, right) => left - right);
  const meanWordConfidence = confidences.length
    ? rounded(confidences.reduce((sum, value) => sum + value, 0) / confidences.length)
    : null;
  const medianWordConfidence = sortedConfidences.length
    ? rounded(sortedConfidences.length % 2
      ? sortedConfidences[Math.floor(sortedConfidences.length / 2)]!
      : (sortedConfidences[sortedConfidences.length / 2 - 1]! + sortedConfidences[sortedConfidences.length / 2]!) / 2)
    : null;
  const provider = text(input.provider);
  const triagePolicy = transcriptConfidenceTriagePolicy({
    provider,
    explicitThreshold: input.confidenceTriageThreshold,
    explicitThresholdAuthority: input.confidenceTriageThresholdAuthority,
    hasConfidenceEvidence: confidences.length > 0,
  });
  const lowConfidenceThreshold = triagePolicy.threshold;
  const lowConfidenceThresholdAuthority = triagePolicy.authority;
  const lowConfidenceWordCount = lowConfidenceThreshold === null
    ? null
    : confidences.filter((value) => value < lowConfidenceThreshold).length;
  const reviewedSegments = segments.filter((segment) => segment.acceptedCorrection || segment.acceptedVerification);
  const allMeasuredReviewSegments = reviewedSegments.map((segment) => {
    const measurement = transcriptWordEditDistance(segment.providerText, segment.text);
    return {
      segmentId: segment.id,
      startSeconds: segment.startSeconds,
      endSeconds: segment.endSeconds,
      reviewKind: segment.acceptedCorrection ? "corrected" as const : "confirmed-as-is" as const,
      wordErrorCount: measurement.errors,
      referenceWordCount: measurement.referenceWords,
      wordErrorRate: measurement.referenceWords ? rounded(measurement.errors / measurement.referenceWords) : 0,
    };
  });
  const measuredWordErrorCount = allMeasuredReviewSegments.reduce((total, segment) => total + segment.wordErrorCount, 0);
  const measuredReferenceWordCount = allMeasuredReviewSegments.reduce((total, segment) => total + segment.referenceWordCount, 0);
  const measuredReviewSegments = [...allMeasuredReviewSegments]
    .sort((left, right) => right.wordErrorRate - left.wordErrorRate || right.wordErrorCount - left.wordErrorCount || left.startSeconds - right.startSeconds)
    .slice(0, 8);
  const measuredScope = reviewedSegments.length === 0
    ? "NONE" as const
    : reviewedSegments.length === segments.length
      ? "COMPLETE_TRANSCRIPT" as const
      : "REVIEWED_SAMPLE" as const;
  const recordingDurationSeconds = finite(input.recordingDurationSeconds);
  const transcriptStartSeconds = segments.length ? Math.min(...segments.map((segment) => segment.startSeconds)) : null;
  const transcriptEndSeconds = segments.length ? Math.max(...segments.map((segment) => segment.endSeconds)) : null;
  const audio = sourceAudio(
    input.sourceProfile,
    input.recordingSegments,
    input.recordingStartedAt,
  );

  const attentionSegments = segments.map((segment) => {
    const lowWords = lowConfidenceThreshold === null ? [] : segment.words
      .flatMap((word) => {
        const value = confidence(word.confidence);
        return value !== null && value < lowConfidenceThreshold
          ? [{ word: word.punctuatedWord || word.word, confidence: value, startSeconds: word.startSeconds, endSeconds: word.endSeconds }]
          : [];
      })
      .sort((left, right) => left.confidence - right.confidence || left.startSeconds - right.startSeconds);
    const segmentConfidenceValues = segment.words
      .map((word) => confidence(word.confidence))
      .filter((value): value is number => value !== null);
    return {
      segmentId: segment.id,
      startSeconds: segment.startSeconds,
      endSeconds: segment.endSeconds,
      text: segment.text,
      reviewed: Boolean(segment.acceptedCorrection || segment.acceptedVerification),
      minimumWordConfidence: segmentConfidenceValues.length ? Math.min(...segmentConfidenceValues) : confidence(segment.confidence),
      lowConfidenceWords: lowWords.slice(0, 6),
    };
  })
    .filter((segment) => !segment.reviewed || segment.lowConfidenceWords.length > 0)
    .sort((left, right) => {
      if (left.reviewed !== right.reviewed) return left.reviewed ? 1 : -1;
      if (left.minimumWordConfidence === null) return right.minimumWordConfidence === null ? left.startSeconds - right.startSeconds : 1;
      if (right.minimumWordConfidence === null) return -1;
      return left.minimumWordConfidence - right.minimumWordConfidence || left.startSeconds - right.startSeconds;
    })
    .slice(0, 8);

  return {
    schema: AUDIO_TRANSCRIPT_EVIDENCE_SCHEMA,
    audio: {
      ...audio,
      durationSeconds: audio.durationSeconds ?? recordingDurationSeconds,
    },
    transcript: {
      provider,
      providerModel: text(input.providerModel),
      language: text(input.language),
      status: text(input.status),
      segmentCount: segments.length,
      wordCount: words.length,
      timedWordCount: words.filter((entry) => Number.isFinite(entry.startSeconds) && Number.isFinite(entry.endSeconds) && entry.endSeconds >= entry.startSeconds).length,
      confidenceWordCount: confidences.length,
      meanWordConfidence,
      medianWordConfidence,
      lowConfidenceThreshold,
      lowConfidenceThresholdAuthority,
      lowConfidenceWordCount,
      confidenceIsNotMeasuredAccuracy: true,
      reviewedSegmentCount: reviewedSegments.length,
      correctedSegmentCount: reviewedSegments.filter((segment) => segment.acceptedCorrection).length,
      confirmedAsIsSegmentCount: reviewedSegments.filter((segment) => !segment.acceptedCorrection && segment.acceptedVerification).length,
      reviewCoverage: segments.length ? rounded(reviewedSegments.length / segments.length) : 0,
      measuredWordErrorRate: measuredReferenceWordCount
        ? rounded(measuredWordErrorCount / measuredReferenceWordCount)
        : null,
      measuredWordErrorCount,
      measuredReferenceWordCount,
      measuredScope,
      measuredReviewSegments,
      providerSpeakerClusterCount: Array.isArray(input.speakerGroups) ? input.speakerGroups.length : 0,
      attributedSpeakerClusterCount: Array.isArray(input.speakerGroups)
        ? input.speakerGroups.filter((group) => object(group).attribution != null).length
        : 0,
      transcriptStartSeconds,
      transcriptEndSeconds,
      recordingDurationSeconds,
      startsAfterRecordingBySeconds: transcriptStartSeconds === null ? null : rounded(transcriptStartSeconds),
      endsBeforeRecordingBySeconds: transcriptEndSeconds === null || recordingDurationSeconds === null
        ? null
        : rounded(Math.max(0, recordingDurationSeconds - transcriptEndSeconds)),
      timingIntegrity,
      attentionSegments,
    },
  };
}
