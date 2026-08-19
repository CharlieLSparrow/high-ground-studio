export const SESSION_RECORDING_SHARE_JOB_KIND = "quipsly-session-recording-share-job-v1" as const;
export const SESSION_RECORDING_SHARE_RESULT_KIND = "quipsly-session-recording-share-result-v1" as const;

export type SessionRecordingShareSource = {
  recordingAssetId: string;
  participantId: string;
  participantLabel: string;
  provider: "local" | "gcs";
  bucketName: string;
  objectName: string;
  locator: string;
  generation: string;
  sha256: string;
  sizeBytes: number;
  contentType: string;
  programOffsetSeconds: number;
};

export type SessionRecordingShareJob = {
  kind: typeof SESSION_RECORDING_SHARE_JOB_KIND;
  version: 1;
  jobId: string;
  roomId: string;
  outputId: string;
  outputRevision: number;
  requestedAt: string;
  sourceSetSha256: string;
  edit: {
    startSeconds: number;
    endSeconds: number;
  };
  sources: SessionRecordingShareSource[];
  target: {
    provider: "local" | "gcs";
    bucketName: string;
    objectName: string;
    locator: string;
    contentType: "audio/mp4";
    codec: "aac-lc";
    sampleRateHz: 48_000;
    channels: 2;
  };
};

export type SessionRecordingShareResult = {
  kind: typeof SESSION_RECORDING_SHARE_RESULT_KIND;
  version: 1;
  jobId: string;
  roomId: string;
  outputId: string;
  outputRevision: number;
  sourceSetSha256: string;
  edit: SessionRecordingShareJob["edit"];
  sourceRecordingAssetIds: string[];
  output: SessionRecordingShareJob["target"] & {
    generation: string;
    sha256: string;
    sizeBytes: number;
    durationSeconds: number;
    completeDecode: true;
  };
  worker: {
    executionId: string;
    buildId: string;
    imageDigest: string | null;
    ffmpegVersion: string;
  };
  boundaries: {
    originalSourcesRemainImmutable: true;
    editIsNonDestructive: true;
    outputRemainsPrivateUntilRelease: true;
    releaseAndRevocationRemainSeparate: true;
  };
  completedAt: string;
};

const SHA256 = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9_-]{8,180}$/;

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function finite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : Number.NaN;
}

function integer(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : Number.NaN;
}

function requiredId(value: unknown, label: string) {
  const result = text(value);
  if (!ID.test(result)) throw new Error(`${label} is invalid.`);
  return result;
}

function requiredSha(value: unknown, label: string) {
  const result = text(value).toLowerCase();
  if (!SHA256.test(result)) throw new Error(`${label} must be a SHA-256 digest.`);
  return result;
}

function requiredIso(value: unknown, label: string) {
  const result = text(value);
  if (!result || !Number.isFinite(Date.parse(result))) throw new Error(`${label} must be an ISO timestamp.`);
  return new Date(result).toISOString();
}

export function parseSessionRecordingShareJob(value: unknown): SessionRecordingShareJob {
  const row = object(value);
  if (row.kind !== SESSION_RECORDING_SHARE_JOB_KIND || row.version !== 1) {
    throw new Error("Session recording share job kind or version is unsupported.");
  }
  const edit = object(row.edit);
  const startSeconds = finite(edit.startSeconds);
  const endSeconds = finite(edit.endSeconds);
  if (startSeconds < 0 || endSeconds <= startSeconds || endSeconds - startSeconds > 8 * 60 * 60) {
    throw new Error("Session recording share edit range is invalid.");
  }
  if (!Array.isArray(row.sources) || row.sources.length < 1 || row.sources.length > 16) {
    throw new Error("Session recording share requires one to sixteen sources.");
  }
  const sources = row.sources.map((value, index) => {
    const source = object(value);
    const provider = source.provider === "gcs" ? "gcs" : source.provider === "local" ? "local" : null;
    const sizeBytes = integer(source.sizeBytes);
    const programOffsetSeconds = finite(source.programOffsetSeconds);
    if (!provider || sizeBytes <= 0 || programOffsetSeconds < 0 || programOffsetSeconds > 8 * 60 * 60) {
      throw new Error(`Session recording share source ${index + 1} is invalid.`);
    }
    const locator = text(source.locator);
    const objectName = text(source.objectName);
    const bucketName = text(source.bucketName);
    const contentType = text(source.contentType);
    if (!locator || !objectName || !bucketName || !/^(audio|video)\//.test(contentType)) {
      throw new Error(`Session recording share source ${index + 1} storage binding is incomplete.`);
    }
    return {
      recordingAssetId: requiredId(source.recordingAssetId, `Source ${index + 1} recording asset`),
      participantId: requiredId(source.participantId, `Source ${index + 1} participant`),
      participantLabel: text(source.participantLabel).slice(0, 160) || `Participant ${index + 1}`,
      provider,
      bucketName,
      objectName,
      locator,
      generation: text(source.generation),
      sha256: requiredSha(source.sha256, `Source ${index + 1} digest`),
      sizeBytes,
      contentType,
      programOffsetSeconds,
    } satisfies SessionRecordingShareSource;
  });
  if (new Set(sources.map((source) => source.recordingAssetId)).size !== sources.length) {
    throw new Error("Session recording share sources must be unique.");
  }
  const target = object(row.target);
  const targetProvider = target.provider === "gcs" ? "gcs" : target.provider === "local" ? "local" : null;
  if (
    !targetProvider ||
    target.contentType !== "audio/mp4" ||
    target.codec !== "aac-lc" ||
    target.sampleRateHz !== 48_000 ||
    target.channels !== 2 ||
    !text(target.bucketName) ||
    !text(target.objectName) ||
    !text(target.locator)
  ) {
    throw new Error("Session recording share target is invalid.");
  }
  const outputRevision = integer(row.outputRevision);
  if (outputRevision < 1) throw new Error("Session recording share output revision is invalid.");
  return {
    kind: SESSION_RECORDING_SHARE_JOB_KIND,
    version: 1,
    jobId: requiredId(row.jobId, "Session recording share job"),
    roomId: requiredId(row.roomId, "Session"),
    outputId: requiredId(row.outputId, "Session output"),
    outputRevision,
    requestedAt: requiredIso(row.requestedAt, "Session recording share request time"),
    sourceSetSha256: requiredSha(row.sourceSetSha256, "Session recording source set"),
    edit: { startSeconds, endSeconds },
    sources,
    target: {
      provider: targetProvider,
      bucketName: text(target.bucketName),
      objectName: text(target.objectName),
      locator: text(target.locator),
      contentType: "audio/mp4",
      codec: "aac-lc",
      sampleRateHz: 48_000,
      channels: 2,
    },
  };
}

export function newSessionRecordingShareJob(input: Omit<SessionRecordingShareJob, "kind" | "version">) {
  return parseSessionRecordingShareJob({ kind: SESSION_RECORDING_SHARE_JOB_KIND, version: 1, ...input });
}

export function newSessionRecordingShareResult(input: Omit<SessionRecordingShareResult, "kind" | "version" | "boundaries">): SessionRecordingShareResult {
  return {
    kind: SESSION_RECORDING_SHARE_RESULT_KIND,
    version: 1,
    ...input,
    boundaries: {
      originalSourcesRemainImmutable: true,
      editIsNonDestructive: true,
      outputRemainsPrivateUntilRelease: true,
      releaseAndRevocationRemainSeparate: true,
    },
  };
}

export function parseSessionRecordingShareResult(value: unknown): SessionRecordingShareResult {
  const row = object(value);
  const output = object(row.output);
  const worker = object(row.worker);
  const edit = object(row.edit);
  const boundaries = object(row.boundaries);
  const durationSeconds = finite(output.durationSeconds);
  const sizeBytes = integer(output.sizeBytes);
  const outputRevision = integer(row.outputRevision);
  if (
    row.kind !== SESSION_RECORDING_SHARE_RESULT_KIND
    || row.version !== 1
    || outputRevision < 1
    || !Array.isArray(row.sourceRecordingAssetIds)
    || row.sourceRecordingAssetIds.length < 1
    || output.completeDecode !== true
    || durationSeconds <= 0
    || sizeBytes <= 0
    || boundaries.originalSourcesRemainImmutable !== true
    || boundaries.editIsNonDestructive !== true
    || boundaries.outputRemainsPrivateUntilRelease !== true
    || boundaries.releaseAndRevocationRemainSeparate !== true
  ) {
    throw new Error("Session recording share result is invalid.");
  }
  const provider = output.provider === "local" ? "local" : output.provider === "gcs" ? "gcs" : null;
  if (
    !provider
    || output.contentType !== "audio/mp4"
    || output.codec !== "aac-lc"
    || output.sampleRateHz !== 48_000
    || output.channels !== 2
    || !text(output.bucketName)
    || !text(output.objectName)
    || !text(output.locator)
    || !text(output.generation)
  ) {
    throw new Error("Session recording share result target is invalid.");
  }
  const startSeconds = finite(edit.startSeconds);
  const endSeconds = finite(edit.endSeconds);
  if (startSeconds < 0 || endSeconds <= startSeconds) throw new Error("Session recording share result edit is invalid.");
  return {
    kind: SESSION_RECORDING_SHARE_RESULT_KIND,
    version: 1,
    jobId: requiredId(row.jobId, "Session recording share result job"),
    roomId: requiredId(row.roomId, "Session recording share result room"),
    outputId: requiredId(row.outputId, "Session recording share result output"),
    outputRevision,
    sourceSetSha256: requiredSha(row.sourceSetSha256, "Session recording share result source set"),
    edit: { startSeconds, endSeconds },
    sourceRecordingAssetIds: row.sourceRecordingAssetIds.map((id, index) => requiredId(id, `Result source ${index + 1}`)),
    output: {
      provider,
      bucketName: text(output.bucketName),
      objectName: text(output.objectName),
      locator: text(output.locator),
      contentType: "audio/mp4",
      codec: "aac-lc",
      sampleRateHz: 48_000,
      channels: 2,
      generation: text(output.generation),
      sha256: requiredSha(output.sha256, "Session recording share result output"),
      sizeBytes,
      durationSeconds,
      completeDecode: true,
    },
    worker: {
      executionId: requiredId(worker.executionId, "Session recording share execution"),
      buildId: text(worker.buildId).slice(0, 240) || "unknown",
      imageDigest: text(worker.imageDigest) || null,
      ffmpegVersion: text(worker.ffmpegVersion).slice(0, 500) || "unknown",
    },
    boundaries: {
      originalSourcesRemainImmutable: true,
      editIsNonDestructive: true,
      outputRemainsPrivateUntilRelease: true,
      releaseAndRevocationRemainSeparate: true,
    },
    completedAt: requiredIso(row.completedAt, "Session recording share result completion time"),
  };
}
