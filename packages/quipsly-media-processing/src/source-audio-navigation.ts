import {
  AUDIO_FREQUENCY_PROFILE_ALGORITHM,
  AUDIO_SIGNAL_PROFILE_ALGORITHM,
  parseAudioSignalProfile,
  type AudioSignalProfile,
} from "./audio-signal-profile.js";

export const SOURCE_AUDIO_NAVIGATION_JOB_KIND =
  "quipsly-source-audio-navigation-job-v1" as const;
export const SOURCE_AUDIO_NAVIGATION_RESULT_KIND =
  "quipsly-source-audio-navigation-result-v1" as const;
export const SOURCE_AUDIO_NAVIGATION_PROFILE =
  "complete-decode-waveform-frequency-1200-v1" as const;
export const SOURCE_AUDIO_NAVIGATION_MAXIMUM_WINDOWS = 1_200 as const;

const SAFE_ID = /^[A-Za-z0-9:_-]{8,200}$/;
const SHA256 = /^[0-9a-f]{64}$/;

export type SourceAudioNavigationJob = {
  kind: typeof SOURCE_AUDIO_NAVIGATION_JOB_KIND;
  version: 1;
  jobId: string;
  projectId: string;
  projectSlug: string;
  actorUserId: string;
  actorEmail: string;
  queuedAt: string;
  source: {
    sourceRevisionId: string;
    identitySha256: string;
    expectedContentSha256: string;
  };
  input: {
    derivativeId: string;
    provider: "local";
    locator: string;
    generation: string;
    contentSha256: string;
    sizeBytes: number;
    contentType: string;
    durationSeconds: number;
  };
  analyzer: {
    profile: typeof SOURCE_AUDIO_NAVIGATION_PROFILE;
    algorithm: typeof AUDIO_SIGNAL_PROFILE_ALGORITHM;
    maximumWindows: typeof SOURCE_AUDIO_NAVIGATION_MAXIMUM_WINDOWS;
    completeDecodeRequired: true;
    frequencyAnalysis: {
      algorithm: typeof AUDIO_FREQUENCY_PROFILE_ALGORITHM;
      maximumBands: 6;
      maximumWindows: typeof SOURCE_AUDIO_NAVIGATION_MAXIMUM_WINDOWS;
      completeDecodeRequired: true;
    };
  };
};

export type SourceAudioNavigationResult = {
  kind: typeof SOURCE_AUDIO_NAVIGATION_RESULT_KIND;
  version: 1;
  jobId: string;
  completedAt: string;
  source: SourceAudioNavigationJob["source"];
  input: SourceAudioNavigationJob["input"] & {
    observedContentSha256: string;
    observedSizeBytes: number;
  };
  media: {
    container: string;
    codec: string;
    sampleRate: number;
    channelCount: number;
    durationSeconds: number;
  };
  audioSignal: AudioSignalProfile;
  analyzer: {
    profile: typeof SOURCE_AUDIO_NAVIGATION_PROFILE;
    algorithm: typeof AUDIO_SIGNAL_PROFILE_ALGORITHM;
    ffmpegVersion: string;
    completeDecode: true;
    maximumWindows: typeof SOURCE_AUDIO_NAVIGATION_MAXIMUM_WINDOWS;
    frequencyAnalysis: {
      algorithm: typeof AUDIO_FREQUENCY_PROFILE_ALGORITHM;
      maximumBands: 6;
      maximumWindows: typeof SOURCE_AUDIO_NAVIGATION_MAXIMUM_WINDOWS;
      completeDecode: true;
    };
  };
  worker: {
    executionId: string;
    buildId: string;
    attempt: number;
  };
  boundaries: {
    originalRemainsSourceTruth: true;
    inputDerivativeRemainsUnchanged: true;
    analysisDoesNotChangeMedia: true;
    observationsRequireHumanInterpretation: true;
  };
};

export function sourceAudioNavigationIdentity(input: {
  projectId: string;
  sourceRevisionId: string;
  sourceIdentitySha256: string;
  inputGeneration: string;
  inputDerivativeId?: string;
  executionScopeId?: string;
  profile?: string;
}) {
  const inputDerivativeId = cleanText(input.inputDerivativeId);
  const executionScopeId = cleanText(input.executionScopeId);
  if (
    (inputDerivativeId && !SAFE_ID.test(inputDerivativeId)) ||
    (executionScopeId && !SAFE_ID.test(executionScopeId))
  ) {
    throw new Error("Source audio-navigation derivative identity is invalid.");
  }
  return [
    inputDerivativeId || executionScopeId
      ? "source-audio-navigation-v2"
      : "source-audio-navigation-v1",
    cleanText(input.projectId),
    cleanText(input.sourceRevisionId),
    cleanText(input.sourceIdentitySha256).toLowerCase(),
    cleanText(input.inputGeneration),
    ...(inputDerivativeId ? [inputDerivativeId] : []),
    ...(executionScopeId ? [executionScopeId] : []),
    cleanText(input.profile) || SOURCE_AUDIO_NAVIGATION_PROFILE,
  ].join(":");
}

export function newSourceAudioNavigationJob(
  input: Omit<SourceAudioNavigationJob, "kind" | "version" | "analyzer">,
) {
  return parseSourceAudioNavigationJob({
    kind: SOURCE_AUDIO_NAVIGATION_JOB_KIND,
    version: 1,
    ...input,
    analyzer: {
      profile: SOURCE_AUDIO_NAVIGATION_PROFILE,
      algorithm: AUDIO_SIGNAL_PROFILE_ALGORITHM,
      maximumWindows: SOURCE_AUDIO_NAVIGATION_MAXIMUM_WINDOWS,
      completeDecodeRequired: true,
      frequencyAnalysis: {
        algorithm: AUDIO_FREQUENCY_PROFILE_ALGORITHM,
        maximumBands: 6,
        maximumWindows: SOURCE_AUDIO_NAVIGATION_MAXIMUM_WINDOWS,
        completeDecodeRequired: true,
      },
    },
  });
}

export function parseSourceAudioNavigationJob(
  value: unknown,
  expectedJobId?: string,
): SourceAudioNavigationJob {
  const row = record(value);
  const source = record(row.source);
  const input = record(row.input);
  const analyzer = record(row.analyzer);
  const frequency = record(analyzer.frequencyAnalysis);
  const parsed: SourceAudioNavigationJob = {
    kind: row.kind as SourceAudioNavigationJob["kind"],
    version: Number(row.version) as 1,
    jobId: cleanText(row.jobId),
    projectId: cleanText(row.projectId),
    projectSlug: cleanText(row.projectSlug),
    actorUserId: cleanText(row.actorUserId),
    actorEmail: cleanText(row.actorEmail).toLowerCase(),
    queuedAt: cleanText(row.queuedAt),
    source: {
      sourceRevisionId: cleanText(source.sourceRevisionId),
      identitySha256: cleanText(source.identitySha256).toLowerCase(),
      expectedContentSha256: cleanText(
        source.expectedContentSha256,
      ).toLowerCase(),
    },
    input: {
      derivativeId: cleanText(input.derivativeId),
      provider: cleanText(input.provider) as "local",
      locator: cleanText(input.locator),
      generation: cleanText(input.generation),
      contentSha256: cleanText(input.contentSha256).toLowerCase(),
      sizeBytes: positiveInteger(input.sizeBytes),
      contentType: cleanText(input.contentType),
      durationSeconds: positiveNumber(input.durationSeconds),
    },
    analyzer: {
      profile: cleanText(
        analyzer.profile,
      ) as typeof SOURCE_AUDIO_NAVIGATION_PROFILE,
      algorithm: cleanText(
        analyzer.algorithm,
      ) as typeof AUDIO_SIGNAL_PROFILE_ALGORITHM,
      maximumWindows: Number(
        analyzer.maximumWindows,
      ) as typeof SOURCE_AUDIO_NAVIGATION_MAXIMUM_WINDOWS,
      completeDecodeRequired: analyzer.completeDecodeRequired as true,
      frequencyAnalysis: {
        algorithm: cleanText(
          frequency.algorithm,
        ) as typeof AUDIO_FREQUENCY_PROFILE_ALGORITHM,
        maximumBands: Number(frequency.maximumBands) as 6,
        maximumWindows: Number(
          frequency.maximumWindows,
        ) as typeof SOURCE_AUDIO_NAVIGATION_MAXIMUM_WINDOWS,
        completeDecodeRequired: frequency.completeDecodeRequired as true,
      },
    },
  };
  if (
    parsed.kind !== SOURCE_AUDIO_NAVIGATION_JOB_KIND ||
    parsed.version !== 1 ||
    !SAFE_ID.test(parsed.jobId) ||
    (expectedJobId && parsed.jobId !== expectedJobId) ||
    !SAFE_ID.test(parsed.projectId) ||
    !/^[a-z0-9][a-z0-9-]{0,127}$/.test(parsed.projectSlug) ||
    !SAFE_ID.test(parsed.actorUserId) ||
    !validEmail(parsed.actorEmail) ||
    !validIsoDate(parsed.queuedAt) ||
    !SAFE_ID.test(parsed.source.sourceRevisionId) ||
    !SHA256.test(parsed.source.identitySha256) ||
    !SHA256.test(parsed.source.expectedContentSha256) ||
    !SAFE_ID.test(parsed.input.derivativeId) ||
    parsed.input.provider !== "local" ||
    !validAbsolutePath(parsed.input.locator) ||
    parsed.input.generation !== `sha256:${parsed.input.contentSha256}` ||
    !SHA256.test(parsed.input.contentSha256) ||
    parsed.input.sizeBytes <= 0 ||
    !/^(audio|video)\//.test(parsed.input.contentType) ||
    parsed.input.durationSeconds <= 0 ||
    parsed.analyzer.profile !== SOURCE_AUDIO_NAVIGATION_PROFILE ||
    parsed.analyzer.algorithm !== AUDIO_SIGNAL_PROFILE_ALGORITHM ||
    parsed.analyzer.maximumWindows !==
      SOURCE_AUDIO_NAVIGATION_MAXIMUM_WINDOWS ||
    parsed.analyzer.completeDecodeRequired !== true ||
    parsed.analyzer.frequencyAnalysis.algorithm !==
      AUDIO_FREQUENCY_PROFILE_ALGORITHM ||
    parsed.analyzer.frequencyAnalysis.maximumBands !== 6 ||
    parsed.analyzer.frequencyAnalysis.maximumWindows !==
      SOURCE_AUDIO_NAVIGATION_MAXIMUM_WINDOWS ||
    parsed.analyzer.frequencyAnalysis.completeDecodeRequired !== true
  ) {
    throw new Error("Source audio navigation job is invalid.");
  }
  return parsed;
}

export function newSourceAudioNavigationResult(
  input: Omit<SourceAudioNavigationResult, "kind" | "version" | "boundaries">,
) {
  return parseSourceAudioNavigationResult({
    kind: SOURCE_AUDIO_NAVIGATION_RESULT_KIND,
    version: 1,
    ...input,
    boundaries: {
      originalRemainsSourceTruth: true,
      inputDerivativeRemainsUnchanged: true,
      analysisDoesNotChangeMedia: true,
      observationsRequireHumanInterpretation: true,
    },
  });
}

export function parseSourceAudioNavigationResult(
  value: unknown,
  expectedJob?: SourceAudioNavigationJob | unknown,
): SourceAudioNavigationResult {
  const row = record(value);
  const job = expectedJob ? parseSourceAudioNavigationJob(expectedJob) : null;
  const source = record(row.source);
  const input = record(row.input);
  const media = record(row.media);
  const analyzer = record(row.analyzer);
  const frequency = record(analyzer.frequencyAnalysis);
  const worker = record(row.worker);
  const boundaries = record(row.boundaries);
  const audioSignal = parseAudioSignalProfile(row.audioSignal);
  const parsed: SourceAudioNavigationResult = {
    kind: row.kind as SourceAudioNavigationResult["kind"],
    version: Number(row.version) as 1,
    jobId: cleanText(row.jobId),
    completedAt: cleanText(row.completedAt),
    source: {
      sourceRevisionId: cleanText(source.sourceRevisionId),
      identitySha256: cleanText(source.identitySha256).toLowerCase(),
      expectedContentSha256: cleanText(
        source.expectedContentSha256,
      ).toLowerCase(),
    },
    input: {
      derivativeId: cleanText(input.derivativeId),
      provider: cleanText(input.provider) as "local",
      locator: cleanText(input.locator),
      generation: cleanText(input.generation),
      contentSha256: cleanText(input.contentSha256).toLowerCase(),
      sizeBytes: positiveInteger(input.sizeBytes),
      contentType: cleanText(input.contentType),
      durationSeconds: positiveNumber(input.durationSeconds),
      observedContentSha256: cleanText(
        input.observedContentSha256,
      ).toLowerCase(),
      observedSizeBytes: positiveInteger(input.observedSizeBytes),
    },
    media: {
      container: cleanText(media.container),
      codec: cleanText(media.codec),
      sampleRate: positiveInteger(media.sampleRate),
      channelCount: positiveInteger(media.channelCount),
      durationSeconds: positiveNumber(media.durationSeconds),
    },
    audioSignal,
    analyzer: {
      profile: cleanText(
        analyzer.profile,
      ) as typeof SOURCE_AUDIO_NAVIGATION_PROFILE,
      algorithm: cleanText(
        analyzer.algorithm,
      ) as typeof AUDIO_SIGNAL_PROFILE_ALGORITHM,
      ffmpegVersion: cleanText(analyzer.ffmpegVersion),
      completeDecode: analyzer.completeDecode as true,
      maximumWindows: Number(
        analyzer.maximumWindows,
      ) as typeof SOURCE_AUDIO_NAVIGATION_MAXIMUM_WINDOWS,
      frequencyAnalysis: {
        algorithm: cleanText(
          frequency.algorithm,
        ) as typeof AUDIO_FREQUENCY_PROFILE_ALGORITHM,
        maximumBands: Number(frequency.maximumBands) as 6,
        maximumWindows: Number(
          frequency.maximumWindows,
        ) as typeof SOURCE_AUDIO_NAVIGATION_MAXIMUM_WINDOWS,
        completeDecode: frequency.completeDecode as true,
      },
    },
    worker: {
      executionId: cleanText(worker.executionId),
      buildId: cleanText(worker.buildId),
      attempt: positiveInteger(worker.attempt),
    },
    boundaries: {
      originalRemainsSourceTruth: boundaries.originalRemainsSourceTruth as true,
      inputDerivativeRemainsUnchanged:
        boundaries.inputDerivativeRemainsUnchanged as true,
      analysisDoesNotChangeMedia: boundaries.analysisDoesNotChangeMedia as true,
      observationsRequireHumanInterpretation:
        boundaries.observationsRequireHumanInterpretation as true,
    },
  };
  if (
    parsed.kind !== SOURCE_AUDIO_NAVIGATION_RESULT_KIND ||
    parsed.version !== 1 ||
    !SAFE_ID.test(parsed.jobId) ||
    !validIsoDate(parsed.completedAt) ||
    !SAFE_ID.test(parsed.source.sourceRevisionId) ||
    !SHA256.test(parsed.source.identitySha256) ||
    !SHA256.test(parsed.source.expectedContentSha256) ||
    !SAFE_ID.test(parsed.input.derivativeId) ||
    parsed.input.provider !== "local" ||
    !validAbsolutePath(parsed.input.locator) ||
    !SHA256.test(parsed.input.contentSha256) ||
    parsed.input.generation !== `sha256:${parsed.input.contentSha256}` ||
    parsed.input.observedContentSha256 !== parsed.input.contentSha256 ||
    parsed.input.observedSizeBytes !== parsed.input.sizeBytes ||
    !parsed.media.container ||
    !parsed.media.codec ||
    Math.abs(parsed.media.durationSeconds - audioSignal.durationSeconds) >
      0.02 ||
    parsed.media.sampleRate !== audioSignal.sampleRate ||
    parsed.media.channelCount !== audioSignal.channelCount ||
    parsed.analyzer.profile !== SOURCE_AUDIO_NAVIGATION_PROFILE ||
    parsed.analyzer.algorithm !== AUDIO_SIGNAL_PROFILE_ALGORITHM ||
    !parsed.analyzer.ffmpegVersion ||
    parsed.analyzer.completeDecode !== true ||
    parsed.analyzer.maximumWindows !==
      SOURCE_AUDIO_NAVIGATION_MAXIMUM_WINDOWS ||
    parsed.analyzer.frequencyAnalysis.algorithm !==
      AUDIO_FREQUENCY_PROFILE_ALGORITHM ||
    parsed.analyzer.frequencyAnalysis.maximumBands !== 6 ||
    parsed.analyzer.frequencyAnalysis.maximumWindows !==
      SOURCE_AUDIO_NAVIGATION_MAXIMUM_WINDOWS ||
    parsed.analyzer.frequencyAnalysis.completeDecode !== true ||
    parsed.boundaries.originalRemainsSourceTruth !== true ||
    parsed.boundaries.inputDerivativeRemainsUnchanged !== true ||
    parsed.boundaries.analysisDoesNotChangeMedia !== true ||
    parsed.boundaries.observationsRequireHumanInterpretation !== true ||
    (job && !sameJobEvidence(job, parsed))
  ) {
    throw new Error("Source audio navigation result is invalid.");
  }
  return parsed;
}

function sameJobEvidence(
  job: SourceAudioNavigationJob,
  result: SourceAudioNavigationResult,
) {
  return (
    job.jobId === result.jobId &&
    JSON.stringify(job.source) === JSON.stringify(result.source) &&
    Object.entries(job.input).every(
      ([key, value]) =>
        result.input[key as keyof typeof result.input] === value,
    )
  );
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function positiveInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

function positiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validIsoDate(value: string) {
  return Boolean(value && Number.isFinite(Date.parse(value)));
}

function validAbsolutePath(value: string) {
  return (
    value.startsWith("/") && value.length <= 4_000 && !value.includes("\0")
  );
}
