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
    providerSpeakerClusterCount: number;
    attributedSpeakerClusterCount: number;
    transcriptStartSeconds: number | null;
    transcriptEndSeconds: number | null;
    recordingDurationSeconds: number | null;
    startsAfterRecordingBySeconds: number | null;
    endsBeforeRecordingBySeconds: number | null;
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
  recordingDurationSeconds?: unknown;
  sourceProfile?: unknown;
  segments?: AudioTranscriptEvidenceSegment[];
  speakerGroups?: Array<{ attribution?: unknown }>;
};

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

function sourceAudio(sourceProfileValue: unknown) {
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
  };
}

export function buildAudioTranscriptEvidence(input: EvidenceInput): AudioTranscriptEvidence {
  const segments = Array.isArray(input.segments) ? input.segments : [];
  const words = segments.flatMap((segment) => segment.words.map((word) => ({ ...word, segment })));
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
  const lowConfidenceThreshold = provider?.toLowerCase() === "deepgram" && confidences.length ? 0.65 : null;
  const lowConfidenceWordCount = lowConfidenceThreshold === null
    ? null
    : confidences.filter((value) => value < lowConfidenceThreshold).length;
  const reviewedSegments = segments.filter((segment) => segment.acceptedCorrection || segment.acceptedVerification);
  let measuredWordErrorCount = 0;
  let measuredReferenceWordCount = 0;
  for (const segment of reviewedSegments) {
    const measurement = transcriptWordEditDistance(segment.providerText, segment.text);
    measuredWordErrorCount += measurement.errors;
    measuredReferenceWordCount += measurement.referenceWords;
  }
  const measuredScope = reviewedSegments.length === 0
    ? "NONE" as const
    : reviewedSegments.length === segments.length
      ? "COMPLETE_TRANSCRIPT" as const
      : "REVIEWED_SAMPLE" as const;
  const recordingDurationSeconds = finite(input.recordingDurationSeconds);
  const transcriptStartSeconds = segments.length ? Math.min(...segments.map((segment) => segment.startSeconds)) : null;
  const transcriptEndSeconds = segments.length ? Math.max(...segments.map((segment) => segment.endSeconds)) : null;
  const audio = sourceAudio(input.sourceProfile);

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
      attentionSegments,
    },
  };
}
