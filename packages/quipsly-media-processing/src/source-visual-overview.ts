export const SOURCE_VISUAL_OVERVIEW_JOB_KIND =
  "quipsly-source-visual-overview-job-v1" as const;
export const SOURCE_VISUAL_OVERVIEW_RESULT_KIND =
  "quipsly-source-visual-overview-result-v1" as const;
export const SOURCE_VISUAL_OVERVIEW_PROFILE =
  "contact-sheet-4x2-jpeg-v1" as const;
export const SOURCE_VISUAL_OVERVIEW_DERIVATIVE_KIND =
  "source-contact-sheet" as const;
export const SOURCE_VISUAL_OVERVIEW_COLUMNS = 4 as const;
export const SOURCE_VISUAL_OVERVIEW_ROWS = 2 as const;
export const SOURCE_VISUAL_OVERVIEW_SAMPLE_COUNT = 8 as const;
export const SOURCE_VISUAL_OVERVIEW_MAX_WIDTH = 1_600 as const;
export const SOURCE_VISUAL_OVERVIEW_MAX_HEIGHT = 1_000 as const;

const SAFE_ID = /^[A-Za-z0-9:_-]{8,200}$/;
const SHA256 = /^[0-9a-f]{64}$/;

export type SourceVisualOverviewJob = {
  kind: typeof SOURCE_VISUAL_OVERVIEW_JOB_KIND;
  version: 1;
  jobId: string;
  derivativeId: string;
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
  target: {
    provider: "local";
    locator: string;
    contentType: "image/jpeg";
    derivativeKind: typeof SOURCE_VISUAL_OVERVIEW_DERIVATIVE_KIND;
    profile: typeof SOURCE_VISUAL_OVERVIEW_PROFILE;
    columns: typeof SOURCE_VISUAL_OVERVIEW_COLUMNS;
    rows: typeof SOURCE_VISUAL_OVERVIEW_ROWS;
    sampleCount: typeof SOURCE_VISUAL_OVERVIEW_SAMPLE_COUNT;
  };
};

export type SourceVisualOverviewResult = {
  kind: typeof SOURCE_VISUAL_OVERVIEW_RESULT_KIND;
  version: 1;
  jobId: string;
  derivativeId: string;
  completedAt: string;
  source: SourceVisualOverviewJob["source"];
  input: SourceVisualOverviewJob["input"] & {
    observedContentSha256: string;
    observedSizeBytes: number;
  };
  output: {
    provider: "local";
    locator: string;
    generation: string;
    contentType: "image/jpeg";
    derivativeKind: typeof SOURCE_VISUAL_OVERVIEW_DERIVATIVE_KIND;
    profile: typeof SOURCE_VISUAL_OVERVIEW_PROFILE;
    sha256: string;
    sizeBytes: number;
    widthPixels: number;
    heightPixels: number;
    columns: typeof SOURCE_VISUAL_OVERVIEW_COLUMNS;
    rows: typeof SOURCE_VISUAL_OVERVIEW_ROWS;
    sampleTimesSeconds: number[];
  };
  worker: {
    executionId: string;
    buildId: string;
    attempt: number;
  };
  originalRemainsSourceTruth: true;
  inputDerivativeRemainsUnchanged: true;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function positiveSafeInteger(value: unknown) {
  const result = Number(value);
  return Number.isSafeInteger(result) && result > 0 ? result : 0;
}

function positiveFinite(value: unknown) {
  const result = Number(value);
  return Number.isFinite(result) && result > 0 ? result : 0;
}

function safeRelativeJpegLocator(value: string) {
  return (
    value.length > 0 &&
    value.length <= 2_000 &&
    !value.startsWith("/") &&
    value.endsWith(".jpg") &&
    !value.includes("\0") &&
    !value.split("/").some((part) => !part || part === "." || part === "..")
  );
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validIsoDate(value: string) {
  return Boolean(value && Number.isFinite(Date.parse(value)));
}

function validAbsoluteLocalPath(value: string, extension?: string) {
  return (
    value.startsWith("/") &&
    value.length <= 4_000 &&
    !value.includes("\0") &&
    (!extension || value.endsWith(extension))
  );
}

export function sourceVisualOverviewIdentity(input: {
  projectId: string;
  sourceRevisionId: string;
  sourceIdentitySha256: string;
  inputGeneration: string;
  profile?: string;
}) {
  return [
    "source-visual-overview-v1",
    text(input.projectId),
    text(input.sourceRevisionId),
    text(input.sourceIdentitySha256).toLowerCase(),
    text(input.inputGeneration),
    text(input.profile) || SOURCE_VISUAL_OVERVIEW_PROFILE,
  ].join(":");
}

export function sourceVisualOverviewSampleTimes(
  durationSeconds: number,
  sampleCount = SOURCE_VISUAL_OVERVIEW_SAMPLE_COUNT,
) {
  const duration = positiveFinite(durationSeconds);
  const count = Math.min(
    SOURCE_VISUAL_OVERVIEW_SAMPLE_COUNT,
    Math.max(1, Math.floor(Number(sampleCount))),
  );
  if (!duration || !count) return [];
  return Array.from({ length: count }, (_, index) => {
    const value = duration * ((index + 0.5) / count);
    return (
      Math.round(Math.min(duration, Math.max(0, value)) * 1_000_000) / 1_000_000
    );
  });
}

export function newSourceVisualOverviewJob(
  input: Omit<SourceVisualOverviewJob, "kind" | "version">,
) {
  return parseSourceVisualOverviewJob({
    kind: SOURCE_VISUAL_OVERVIEW_JOB_KIND,
    version: 1,
    ...input,
  });
}

export function parseSourceVisualOverviewJob(
  value: unknown,
  expectedJobId?: string,
): SourceVisualOverviewJob {
  const row = record(value);
  const sourceRow = record(row.source);
  const inputRow = record(row.input);
  const targetRow = record(row.target);
  const job: SourceVisualOverviewJob = {
    kind: row.kind as typeof SOURCE_VISUAL_OVERVIEW_JOB_KIND,
    version: Number(row.version) as 1,
    jobId: text(row.jobId),
    derivativeId: text(row.derivativeId),
    projectId: text(row.projectId),
    projectSlug: text(row.projectSlug),
    actorUserId: text(row.actorUserId),
    actorEmail: text(row.actorEmail).toLowerCase(),
    queuedAt: text(row.queuedAt),
    source: {
      sourceRevisionId: text(sourceRow.sourceRevisionId),
      identitySha256: text(sourceRow.identitySha256).toLowerCase(),
      expectedContentSha256: text(
        sourceRow.expectedContentSha256,
      ).toLowerCase(),
    },
    input: {
      derivativeId: text(inputRow.derivativeId),
      provider: text(inputRow.provider) as "local",
      locator: text(inputRow.locator),
      generation: text(inputRow.generation),
      contentSha256: text(inputRow.contentSha256).toLowerCase(),
      sizeBytes: positiveSafeInteger(inputRow.sizeBytes),
      contentType: text(inputRow.contentType),
      durationSeconds: positiveFinite(inputRow.durationSeconds),
    },
    target: {
      provider: text(targetRow.provider) as "local",
      locator: text(targetRow.locator),
      contentType: text(targetRow.contentType) as "image/jpeg",
      derivativeKind: text(
        targetRow.derivativeKind,
      ) as typeof SOURCE_VISUAL_OVERVIEW_DERIVATIVE_KIND,
      profile: text(targetRow.profile) as typeof SOURCE_VISUAL_OVERVIEW_PROFILE,
      columns: Number(
        targetRow.columns,
      ) as typeof SOURCE_VISUAL_OVERVIEW_COLUMNS,
      rows: Number(targetRow.rows) as typeof SOURCE_VISUAL_OVERVIEW_ROWS,
      sampleCount: Number(
        targetRow.sampleCount,
      ) as typeof SOURCE_VISUAL_OVERVIEW_SAMPLE_COUNT,
    },
  };
  if (
    job.kind !== SOURCE_VISUAL_OVERVIEW_JOB_KIND ||
    job.version !== 1 ||
    !SAFE_ID.test(job.jobId) ||
    (expectedJobId && job.jobId !== expectedJobId) ||
    !SAFE_ID.test(job.derivativeId) ||
    !SAFE_ID.test(job.projectId) ||
    !/^[a-z0-9][a-z0-9-]{0,127}$/.test(job.projectSlug) ||
    !SAFE_ID.test(job.actorUserId) ||
    !validEmail(job.actorEmail) ||
    !validIsoDate(job.queuedAt) ||
    !SAFE_ID.test(job.source.sourceRevisionId) ||
    !SHA256.test(job.source.identitySha256) ||
    !SHA256.test(job.source.expectedContentSha256) ||
    !SAFE_ID.test(job.input.derivativeId) ||
    job.input.provider !== "local" ||
    !validAbsoluteLocalPath(job.input.locator, ".mp4") ||
    job.input.generation !== `sha256:${job.input.contentSha256}` ||
    !SHA256.test(job.input.contentSha256) ||
    job.input.sizeBytes <= 0 ||
    job.input.contentType !== "video/mp4" ||
    job.input.durationSeconds <= 0 ||
    job.target.provider !== "local" ||
    !safeRelativeJpegLocator(job.target.locator) ||
    job.target.contentType !== "image/jpeg" ||
    job.target.derivativeKind !== SOURCE_VISUAL_OVERVIEW_DERIVATIVE_KIND ||
    job.target.profile !== SOURCE_VISUAL_OVERVIEW_PROFILE ||
    job.target.columns !== SOURCE_VISUAL_OVERVIEW_COLUMNS ||
    job.target.rows !== SOURCE_VISUAL_OVERVIEW_ROWS ||
    job.target.sampleCount !== SOURCE_VISUAL_OVERVIEW_SAMPLE_COUNT
  )
    throw new Error("Source visual overview job is invalid.");
  return job;
}

export function newSourceVisualOverviewResult(
  input: Omit<
    SourceVisualOverviewResult,
    | "kind"
    | "version"
    | "originalRemainsSourceTruth"
    | "inputDerivativeRemainsUnchanged"
  >,
) {
  return parseSourceVisualOverviewResult({
    kind: SOURCE_VISUAL_OVERVIEW_RESULT_KIND,
    version: 1,
    ...input,
    originalRemainsSourceTruth: true,
    inputDerivativeRemainsUnchanged: true,
  });
}

export function parseSourceVisualOverviewResult(
  value: unknown,
  expectedJob?: SourceVisualOverviewJob,
): SourceVisualOverviewResult {
  const row = record(value);
  const sourceRow = record(row.source);
  const inputRow = record(row.input);
  const outputRow = record(row.output);
  const workerRow = record(row.worker);
  const result: SourceVisualOverviewResult = {
    kind: row.kind as typeof SOURCE_VISUAL_OVERVIEW_RESULT_KIND,
    version: Number(row.version) as 1,
    jobId: text(row.jobId),
    derivativeId: text(row.derivativeId),
    completedAt: text(row.completedAt),
    source: {
      sourceRevisionId: text(sourceRow.sourceRevisionId),
      identitySha256: text(sourceRow.identitySha256).toLowerCase(),
      expectedContentSha256: text(
        sourceRow.expectedContentSha256,
      ).toLowerCase(),
    },
    input: {
      derivativeId: text(inputRow.derivativeId),
      provider: text(inputRow.provider) as "local",
      locator: text(inputRow.locator),
      generation: text(inputRow.generation),
      contentSha256: text(inputRow.contentSha256).toLowerCase(),
      sizeBytes: positiveSafeInteger(inputRow.sizeBytes),
      contentType: text(inputRow.contentType),
      durationSeconds: positiveFinite(inputRow.durationSeconds),
      observedContentSha256: text(inputRow.observedContentSha256).toLowerCase(),
      observedSizeBytes: positiveSafeInteger(inputRow.observedSizeBytes),
    },
    output: {
      provider: text(outputRow.provider) as "local",
      locator: text(outputRow.locator),
      generation: text(outputRow.generation),
      contentType: text(outputRow.contentType) as "image/jpeg",
      derivativeKind: text(
        outputRow.derivativeKind,
      ) as typeof SOURCE_VISUAL_OVERVIEW_DERIVATIVE_KIND,
      profile: text(outputRow.profile) as typeof SOURCE_VISUAL_OVERVIEW_PROFILE,
      sha256: text(outputRow.sha256).toLowerCase(),
      sizeBytes: positiveSafeInteger(outputRow.sizeBytes),
      widthPixels: positiveSafeInteger(outputRow.widthPixels),
      heightPixels: positiveSafeInteger(outputRow.heightPixels),
      columns: Number(
        outputRow.columns,
      ) as typeof SOURCE_VISUAL_OVERVIEW_COLUMNS,
      rows: Number(outputRow.rows) as typeof SOURCE_VISUAL_OVERVIEW_ROWS,
      sampleTimesSeconds: Array.isArray(outputRow.sampleTimesSeconds)
        ? outputRow.sampleTimesSeconds.map((item) => Number(item))
        : [],
    },
    worker: {
      executionId: text(workerRow.executionId),
      buildId: text(workerRow.buildId),
      attempt: positiveSafeInteger(workerRow.attempt),
    },
    originalRemainsSourceTruth: row.originalRemainsSourceTruth as true,
    inputDerivativeRemainsUnchanged:
      row.inputDerivativeRemainsUnchanged as true,
  };
  const expectedMismatch = expectedJob
    ? result.jobId !== expectedJob.jobId ||
      result.derivativeId !== expectedJob.derivativeId ||
      result.source.sourceRevisionId !== expectedJob.source.sourceRevisionId ||
      result.source.identitySha256 !== expectedJob.source.identitySha256 ||
      result.source.expectedContentSha256 !==
        expectedJob.source.expectedContentSha256 ||
      result.input.derivativeId !== expectedJob.input.derivativeId ||
      result.input.generation !== expectedJob.input.generation ||
      result.input.contentSha256 !== expectedJob.input.contentSha256 ||
      result.input.sizeBytes !== expectedJob.input.sizeBytes ||
      result.input.contentType !== expectedJob.input.contentType ||
      result.input.durationSeconds !== expectedJob.input.durationSeconds ||
      !result.output.locator.endsWith(`/${expectedJob.target.locator}`)
    : false;
  const sampleTimes = result.output.sampleTimesSeconds;
  if (
    result.kind !== SOURCE_VISUAL_OVERVIEW_RESULT_KIND ||
    result.version !== 1 ||
    !SAFE_ID.test(result.jobId) ||
    !SAFE_ID.test(result.derivativeId) ||
    !validIsoDate(result.completedAt) ||
    !SHA256.test(result.input.observedContentSha256) ||
    result.input.observedContentSha256 !== result.input.contentSha256 ||
    result.input.observedSizeBytes !== result.input.sizeBytes ||
    result.output.provider !== "local" ||
    !validAbsoluteLocalPath(result.output.locator, ".jpg") ||
    result.output.generation !== `sha256:${result.output.sha256}` ||
    !SHA256.test(result.output.sha256) ||
    result.output.sizeBytes <= 0 ||
    result.output.widthPixels <= 0 ||
    result.output.widthPixels > SOURCE_VISUAL_OVERVIEW_MAX_WIDTH ||
    result.output.heightPixels <= 0 ||
    result.output.heightPixels > SOURCE_VISUAL_OVERVIEW_MAX_HEIGHT ||
    result.output.columns !== SOURCE_VISUAL_OVERVIEW_COLUMNS ||
    result.output.rows !== SOURCE_VISUAL_OVERVIEW_ROWS ||
    sampleTimes.length !== SOURCE_VISUAL_OVERVIEW_SAMPLE_COUNT ||
    sampleTimes.some(
      (time, index) =>
        !Number.isFinite(time) ||
        time < 0 ||
        time > result.input.durationSeconds ||
        (index > 0 && time <= sampleTimes[index - 1]),
    ) ||
    result.output.contentType !== "image/jpeg" ||
    result.output.derivativeKind !== SOURCE_VISUAL_OVERVIEW_DERIVATIVE_KIND ||
    result.output.profile !== SOURCE_VISUAL_OVERVIEW_PROFILE ||
    !result.worker.executionId ||
    !result.worker.buildId ||
    result.worker.attempt <= 0 ||
    result.originalRemainsSourceTruth !== true ||
    result.inputDerivativeRemainsUnchanged !== true ||
    expectedMismatch
  )
    throw new Error("Source visual overview result is invalid.");
  return result;
}
