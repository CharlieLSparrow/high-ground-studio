import {
  parseAudioAlignmentJob,
  parseAudioAlignmentResult,
  parseAudioMasteryJob,
  parseAudioMasteryResult,
  parseAudioSignalProfileJob,
  parseAudioSignalProfileResult,
  parseStudioSourceTranscriptJob,
  parseStudioSourceTranscriptResult,
  STUDIO_SOURCE_TRANSCRIPT_PROCESSING_TYPES,
} from "@high-ground/quipsly-media-processing";

export type EpisodeAudioProcessingStatus =
  | "not-queued"
  | "queued"
  | "processing"
  | "output-ready"
  | "completed"
  | "blocked"
  | "failed";

type EvidenceBase = {
  jobId: string | null;
  status: EpisodeAudioProcessingStatus;
  integrityVerified: boolean;
  error: string | null;
  updatedAt: string | null;
};

export type EpisodeAudioProcessingEvidence = {
  signal: EvidenceBase & {
    durationSeconds: number | null;
    signalStatus: "signal-present" | "attention" | "near-digital-silence" | null;
    observationCount: number;
  };
  transcript: EvidenceBase & {
    transcriptJobId: string | null;
    segmentCount: number;
    wordCount: number;
    timedWordCount: number;
  };
  alignment: EvidenceBase & {
    spineAssetId: string | null;
    qualifiedForReview: boolean | null;
    openingOffsetSeconds: number | null;
    residualDriftMilliseconds: number | null;
  };
  mastery: EvidenceBase & {
    action: "no-change" | "render-loudness-master" | null;
    sourcePassesProfile: boolean | null;
    previewVerified: boolean;
  };
};

export type EpisodeAudioSignalActivityEvidence = {
  schema: "quipsly-episode-audio-signal-activity-evidence-v1";
  jobId: string;
  source: { sha256: string; generation: string; sizeBytes: number };
  algorithm: "quipsly-audio-signal-window-v1";
  completeDecode: true;
  durationSeconds: number;
  windowDurationSeconds: number;
  rmsDbfs: number;
  thresholds: { nearSilenceDbfs: number };
  waveform: Array<{ startSeconds: number; durationSeconds: number; rmsDbfs: number; samplePeakDbfs: number; clippedFrameCount: number }>;
  observations: Array<{ kind: string; severity: "warning" | "attention"; startSeconds: number; endSeconds: number; detail: string }>;
  boundaries: { energyIsNotVoiceActivity: true; measurementDoesNotChangeMedia: true; sourceIdentityBound: true };
};

export type EpisodeAudioTranscriptActivityEvidence = {
  schema: "quipsly-episode-audio-transcript-activity-evidence-v1";
  jobId: string;
  transcriptJobId: string;
  source: { sha256: string; generation: string; sizeBytes: number };
  provider: { name: string; model: string };
  completeSourceRead: true;
  wordCount: number;
  timedWordCount: number;
  transcriptStartSeconds: number;
  transcriptEndSeconds: number;
  words: Array<{ startSeconds: number; endSeconds: number; confidenceAvailable: boolean }>;
  boundaries: { providerTimingIsNotMeasuredAccuracy: true; wordsAreNotVoiceActivity: true; sourceIdentityBound: true; textExcludedFromActivityProjection: true };
};

const JOB_TYPES = ["audio-signal-profile", ...STUDIO_SOURCE_TRANSCRIPT_PROCESSING_TYPES, "audio-alignment", "audio-mastery"] as const;

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function iso(value: unknown) {
  if (value && typeof (value as { toISOString?: unknown }).toISOString === "function") {
    return (value as Date).toISOString();
  }
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function status(value: unknown): EpisodeAudioProcessingStatus {
  return ["queued", "processing", "output-ready", "completed", "blocked", "failed"].includes(String(value))
    ? value as EpisodeAudioProcessingStatus
    : "failed";
}

function latestByType(jobs: any[]) {
  const rows = new Map<string, any>();
  for (const job of Array.isArray(jobs) ? jobs : []) {
    if (JOB_TYPES.includes(job?.type)) {
      const canonicalType = STUDIO_SOURCE_TRANSCRIPT_PROCESSING_TYPES.includes(job.type) ? "source-transcript" : job.type;
      if (!rows.has(canonicalType)) rows.set(canonicalType, job);
    }
  }
  return rows;
}

function base(job: any | null): EvidenceBase {
  return job
    ? {
        jobId: String(job.id),
        status: status(job.status),
        integrityVerified: false,
        error: typeof job.error === "string" && job.error.trim() ? job.error.trim() : null,
        updatedAt: iso(job.updatedAt),
      }
    : { jobId: null, status: "not-queued", integrityVerified: false, error: null, updatedAt: null };
}

function failed<T extends EvidenceBase>(value: T, label: string): T {
  return {
    ...value,
    status: "failed",
    integrityVerified: false,
    error: `${label} evidence failed integrity validation.`,
  };
}

/**
 * Projects the latest exact-source processing receipts for one episode asset.
 * A completed state is never exposed unless both its job contract and result
 * receipt validate. The projection is read-only and does not queue work.
 */
export function episodeAudioProcessingEvidence(
  jobs: any[],
  transcriptJobs: any[] = [],
): EpisodeAudioProcessingEvidence {
  const latest = latestByType(jobs);

  const signalJob = latest.get("audio-signal-profile") ?? null;
  let signal: EpisodeAudioProcessingEvidence["signal"] = {
    ...base(signalJob),
    durationSeconds: null,
    signalStatus: null,
    observationCount: 0,
  };
  if (signalJob) {
    try {
      const contract = parseAudioSignalProfileJob(signalJob.inputJson, signalJob.id);
      const declared = status(signalJob.status);
      const result = ["output-ready", "completed"].includes(declared)
        ? parseAudioSignalProfileResult(record(signalJob.resultJson).receipt, contract)
        : null;
      signal = {
        ...signal,
        integrityVerified: true,
        durationSeconds: result?.audioSignal.durationSeconds ?? null,
        signalStatus: result?.audioSignal.signalStatus ?? null,
        observationCount: result?.audioSignal.observations.length ?? 0,
      };
    } catch {
      signal = failed(signal, "Audio signal");
    }
  }

  const transcriptJob = latest.get("source-transcript") ?? null;
  let transcript: EpisodeAudioProcessingEvidence["transcript"] = {
    ...base(transcriptJob),
    transcriptJobId: null,
    segmentCount: 0,
    wordCount: 0,
    timedWordCount: 0,
  };
  if (transcriptJob) {
    try {
      const contract = parseStudioSourceTranscriptJob(transcriptJob.inputJson, transcriptJob.id);
      const declared = status(transcriptJob.status);
      const result = ["output-ready", "completed"].includes(declared)
        ? parseStudioSourceTranscriptResult(record(transcriptJob.resultJson).receipt, contract)
        : null;
      const canonical = transcriptJobs.find((candidate) => candidate?.id === contract.transcriptJobId) ?? null;
      const canonicalCompleted = canonical?.status === "COMPLETED";
      const canonicalSegmentCount = Number(canonical?._count?.segments ?? 0);
      const canonicalWordCount = Number(canonical?._count?.words ?? 0);
      if (declared === "completed" && (
        !result
        || !canonicalCompleted
        || canonicalSegmentCount !== result.coverage.segmentCount
        || canonicalWordCount !== result.coverage.wordCount
      )) throw new Error("Canonical transcript registration does not match its receipt.");
      transcript = {
        ...transcript,
        integrityVerified: true,
        transcriptJobId: contract.transcriptJobId,
        segmentCount: result?.coverage.segmentCount ?? canonicalSegmentCount,
        wordCount: result?.coverage.wordCount ?? canonicalWordCount,
        timedWordCount: result?.coverage.timedWordCount ?? 0,
      };
    } catch {
      transcript = failed(transcript, "Transcript");
    }
  }

  const alignmentJob = latest.get("audio-alignment") ?? null;
  let alignment: EpisodeAudioProcessingEvidence["alignment"] = {
    ...base(alignmentJob),
    spineAssetId: null,
    qualifiedForReview: null,
    openingOffsetSeconds: null,
    residualDriftMilliseconds: null,
  };
  if (alignmentJob) {
    try {
      const contract = parseAudioAlignmentJob(alignmentJob.inputJson, alignmentJob.id);
      const declared = status(alignmentJob.status);
      const result = ["output-ready", "completed"].includes(declared)
        ? parseAudioAlignmentResult(record(alignmentJob.resultJson).receipt, contract)
        : null;
      alignment = {
        ...alignment,
        integrityVerified: true,
        spineAssetId: contract.spine.assetId,
        qualifiedForReview: result?.evidence.qualification.qualifiedForAuthorizedAgentReview ?? null,
        openingOffsetSeconds: result?.evidence.opening.measuredOffsetSeconds ?? null,
        residualDriftMilliseconds: result?.evidence.drift.residualDriftMilliseconds ?? null,
      };
    } catch {
      alignment = failed(alignment, "Alignment");
    }
  }

  const masteryJob = latest.get("audio-mastery") ?? null;
  let mastery: EpisodeAudioProcessingEvidence["mastery"] = {
    ...base(masteryJob),
    action: null,
    sourcePassesProfile: null,
    previewVerified: false,
  };
  if (masteryJob) {
    try {
      const contract = parseAudioMasteryJob(masteryJob.inputJson, masteryJob.id);
      const declared = status(masteryJob.status);
      const result = ["output-ready", "completed"].includes(declared)
        ? parseAudioMasteryResult(record(masteryJob.resultJson).receipt, contract)
        : null;
      mastery = {
        ...mastery,
        integrityVerified: true,
        action: result?.proposal.action ?? null,
        sourcePassesProfile: result?.proposal.assessment.passes ?? null,
        previewVerified: Boolean(result && (result.proposal.action === "no-change" || result.derivative?.verification.passes)),
      };
    } catch {
      mastery = failed(mastery, "Audio mastery");
    }
  }

  return { signal, transcript, alignment, mastery };
}

/**
 * Returns bounded complete-decode windows for cross-track visual comparison.
 * RMS energy is deliberately not promoted to speech, speaker, bleed, or echo
 * evidence. A completed, contract-valid exact-source receipt is required.
 */
export function episodeAudioSignalActivityEvidence(jobs: any[]): EpisodeAudioSignalActivityEvidence | null {
  const signalJob = latestByType(jobs).get("audio-signal-profile") ?? null;
  if (!signalJob || signalJob.status !== "completed") return null;
  try {
    const contract = parseAudioSignalProfileJob(signalJob.inputJson, signalJob.id);
    const result = parseAudioSignalProfileResult(record(signalJob.resultJson).receipt, contract);
    return {
      schema: "quipsly-episode-audio-signal-activity-evidence-v1",
      jobId: contract.jobId,
      source: { sha256: result.source.sha256, generation: result.source.generation, sizeBytes: result.source.sizeBytes },
      algorithm: result.audioSignal.algorithm,
      completeDecode: true,
      durationSeconds: result.audioSignal.durationSeconds,
      windowDurationSeconds: result.audioSignal.windowDurationSeconds,
      rmsDbfs: result.audioSignal.rmsDbfs,
      thresholds: { nearSilenceDbfs: result.audioSignal.thresholds.nearSilenceDbfs },
      waveform: result.audioSignal.waveform.slice(0, 1_200).map((window) => ({
        startSeconds: window.startSeconds,
        durationSeconds: window.durationSeconds,
        rmsDbfs: window.rmsDbfs,
        samplePeakDbfs: window.samplePeakDbfs,
        clippedFrameCount: window.clippedFrameCount,
      })),
      observations: result.audioSignal.observations.slice(0, 2_000).map((observation) => ({ ...observation })),
      boundaries: { energyIsNotVoiceActivity: true, measurementDoesNotChangeMedia: true, sourceIdentityBound: true },
    };
  } catch {
    return null;
  }
}

/**
 * Projects only provider word timing from a completed, exact-source canonical
 * transcript. Text stays out of the cross-track activity surface, and word
 * timing is never relabeled as VAD or measured transcription accuracy.
 */
export function episodeAudioTranscriptActivityEvidence(jobs: any[], transcriptJobs: any[]): EpisodeAudioTranscriptActivityEvidence | null {
  const transcriptJob = latestByType(jobs).get("source-transcript") ?? null;
  if (!transcriptJob || transcriptJob.status !== "completed") return null;
  try {
    const contract = parseStudioSourceTranscriptJob(transcriptJob.inputJson, transcriptJob.id);
    const result = parseStudioSourceTranscriptResult(record(transcriptJob.resultJson).receipt, contract);
    const canonical = transcriptJobs.find((candidate) => candidate?.id === contract.transcriptJobId) ?? null;
    if (
      canonical?.status !== "COMPLETED"
      || Number(canonical?._count?.segments ?? -1) !== result.coverage.segmentCount
      || Number(canonical?._count?.words ?? -1) !== result.coverage.wordCount
      || result.words.length !== result.coverage.wordCount
      || result.coverage.timedWordCount !== result.words.length
    ) return null;
    return {
      schema: "quipsly-episode-audio-transcript-activity-evidence-v1",
      jobId: String(transcriptJob.id),
      transcriptJobId: contract.transcriptJobId,
      source: { sha256: result.source.sha256, generation: result.source.generation, sizeBytes: result.source.sizeBytes },
      provider: { name: result.provider.name, model: contract.provider.model },
      completeSourceRead: true,
      wordCount: result.coverage.wordCount,
      timedWordCount: result.coverage.timedWordCount,
      transcriptStartSeconds: result.coverage.transcriptStartSeconds,
      transcriptEndSeconds: result.coverage.transcriptEndSeconds,
      words: result.words.map((word) => ({ startSeconds: word.startSeconds, endSeconds: word.endSeconds, confidenceAvailable: word.confidence !== null })),
      boundaries: { providerTimingIsNotMeasuredAccuracy: true, wordsAreNotVoiceActivity: true, sourceIdentityBound: true, textExcludedFromActivityProjection: true },
    };
  } catch {
    return null;
  }
}
