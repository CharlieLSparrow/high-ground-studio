export const EXTERNAL_SOURCE_PROXY_JOB_KIND = "quipsly-external-source-proxy-job-v1" as const;
export const EXTERNAL_SOURCE_PROXY_RESULT_KIND = "quipsly-external-source-proxy-result-v1" as const;
export const EXTERNAL_SOURCE_PROXY_PROFILE = "collaboration-efficient-960w-h264-aac-v1" as const;
export const EXTERNAL_SOURCE_PROXY_MAX_DIMENSION = 960 as const;

const SAFE_ID = /^[A-Za-z0-9:_-]{8,200}$/;
const SAFE_PROVIDER = /^[a-z][a-z0-9-]{1,40}$/;
const SHA256 = /^[0-9a-f]{64}$/;

export type ExternalSourceProxyJob = {
  kind: typeof EXTERNAL_SOURCE_PROXY_JOB_KIND;
  version: 1;
  jobId: string;
  derivativeId: string;
  projectId: string;
  projectSlug: string;
  actorUserId: string;
  actorEmail: string;
  queuedAt: string;
  source: {
    provider: string;
    externalReferenceId: string;
    sourceRevisionId: string;
    revisionKey: string;
    identitySha256: string;
    expectedContentSha256: string;
    expectedSizeBytes: number;
    contentType: string;
  };
  target: {
    provider: "local";
    locator: string;
    contentType: "video/mp4";
    profile: typeof EXTERNAL_SOURCE_PROXY_PROFILE;
  };
};

export type ExternalSourceProxyResult = {
  kind: typeof EXTERNAL_SOURCE_PROXY_RESULT_KIND;
  version: 1;
  jobId: string;
  derivativeId: string;
  completedAt: string;
  source: ExternalSourceProxyJob["source"] & {
    observedContentSha256: string;
    observedSizeBytes: number;
  };
  output: {
    provider: "local";
    locator: string;
    generation: string;
    contentType: "video/mp4";
    profile: typeof EXTERNAL_SOURCE_PROXY_PROFILE;
    sha256: string;
    sizeBytes: number;
    durationSeconds: number;
    widthPixels: number;
    heightPixels: number;
    framesPerSecond: number;
  };
  worker: {
    executionId: string;
    buildId: string;
    attempt: number;
  };
  originalRemainsSourceTruth: true;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function positiveSafeInteger(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : 0;
}

function nonNegativeFinite(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : -1;
}

function isoDate(value: string) {
  return Boolean(value && Number.isFinite(Date.parse(value)));
}

function safeRelativeProxyLocator(value: string) {
  return value.length > 0
    && value.length <= 2_000
    && !value.startsWith("/")
    && value.endsWith(".mp4")
    && !value.includes("\0")
    && !value.split("/").some((part) => !part || part === "." || part === "..");
}

function email(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function externalSourceProxyIdentity(input: {
  projectId: string;
  sourceRevisionId: string;
  identitySha256: string;
  profile?: string;
}) {
  return [
    "external-source-proxy-v1",
    text(input.projectId),
    text(input.sourceRevisionId),
    text(input.identitySha256).toLowerCase(),
    text(input.profile) || EXTERNAL_SOURCE_PROXY_PROFILE,
  ].join(":");
}

export function newExternalSourceProxyJob(input: Omit<ExternalSourceProxyJob, "kind" | "version">) {
  return parseExternalSourceProxyJob({
    kind: EXTERNAL_SOURCE_PROXY_JOB_KIND,
    version: 1,
    ...input,
  });
}

export function parseExternalSourceProxyJob(value: unknown, expectedJobId?: string): ExternalSourceProxyJob {
  const row = record(value);
  const sourceRow = record(row.source);
  const targetRow = record(row.target);
  const source: ExternalSourceProxyJob["source"] = {
    provider: text(sourceRow.provider),
    externalReferenceId: text(sourceRow.externalReferenceId),
    sourceRevisionId: text(sourceRow.sourceRevisionId),
    revisionKey: text(sourceRow.revisionKey),
    identitySha256: text(sourceRow.identitySha256).toLowerCase(),
    expectedContentSha256: text(sourceRow.expectedContentSha256).toLowerCase(),
    expectedSizeBytes: positiveSafeInteger(sourceRow.expectedSizeBytes),
    contentType: text(sourceRow.contentType),
  };
  const target: ExternalSourceProxyJob["target"] = {
    provider: text(targetRow.provider) as "local",
    locator: text(targetRow.locator),
    contentType: text(targetRow.contentType) as "video/mp4",
    profile: text(targetRow.profile) as typeof EXTERNAL_SOURCE_PROXY_PROFILE,
  };
  const job: ExternalSourceProxyJob = {
    kind: row.kind as typeof EXTERNAL_SOURCE_PROXY_JOB_KIND,
    version: Number(row.version) as 1,
    jobId: text(row.jobId),
    derivativeId: text(row.derivativeId),
    projectId: text(row.projectId),
    projectSlug: text(row.projectSlug),
    actorUserId: text(row.actorUserId),
    actorEmail: text(row.actorEmail).toLowerCase(),
    queuedAt: text(row.queuedAt),
    source,
    target,
  };
  if (
    job.kind !== EXTERNAL_SOURCE_PROXY_JOB_KIND
    || job.version !== 1
    || !SAFE_ID.test(job.jobId)
    || (expectedJobId && job.jobId !== expectedJobId)
    || !SAFE_ID.test(job.derivativeId)
    || !SAFE_ID.test(job.projectId)
    || !/^[a-z0-9][a-z0-9-]{0,127}$/.test(job.projectSlug)
    || !SAFE_ID.test(job.actorUserId)
    || !email(job.actorEmail)
    || !isoDate(job.queuedAt)
    || !SAFE_PROVIDER.test(source.provider)
    || !SAFE_ID.test(source.externalReferenceId)
    || !SAFE_ID.test(source.sourceRevisionId)
    || !source.revisionKey
    || source.revisionKey.length > 500
    || !SHA256.test(source.identitySha256)
    || !SHA256.test(source.expectedContentSha256)
    || source.expectedSizeBytes <= 0
    || !source.contentType.startsWith("video/")
    || target.provider !== "local"
    || !safeRelativeProxyLocator(target.locator)
    || target.contentType !== "video/mp4"
    || target.profile !== EXTERNAL_SOURCE_PROXY_PROFILE
  ) {
    throw new Error("External source proxy job is invalid.");
  }
  return job;
}

export function newExternalSourceProxyResult(input: Omit<ExternalSourceProxyResult, "kind" | "version" | "originalRemainsSourceTruth">) {
  return parseExternalSourceProxyResult({
    kind: EXTERNAL_SOURCE_PROXY_RESULT_KIND,
    version: 1,
    ...input,
    originalRemainsSourceTruth: true,
  });
}

export function parseExternalSourceProxyResult(value: unknown, expectedJob?: ExternalSourceProxyJob): ExternalSourceProxyResult {
  const row = record(value);
  const sourceRow = record(row.source);
  const outputRow = record(row.output);
  const workerRow = record(row.worker);
  const source = {
    provider: text(sourceRow.provider),
    externalReferenceId: text(sourceRow.externalReferenceId),
    sourceRevisionId: text(sourceRow.sourceRevisionId),
    revisionKey: text(sourceRow.revisionKey),
    identitySha256: text(sourceRow.identitySha256).toLowerCase(),
    expectedContentSha256: text(sourceRow.expectedContentSha256).toLowerCase(),
    expectedSizeBytes: positiveSafeInteger(sourceRow.expectedSizeBytes),
    contentType: text(sourceRow.contentType),
    observedContentSha256: text(sourceRow.observedContentSha256).toLowerCase(),
    observedSizeBytes: positiveSafeInteger(sourceRow.observedSizeBytes),
  };
  const result: ExternalSourceProxyResult = {
    kind: row.kind as typeof EXTERNAL_SOURCE_PROXY_RESULT_KIND,
    version: Number(row.version) as 1,
    jobId: text(row.jobId),
    derivativeId: text(row.derivativeId),
    completedAt: text(row.completedAt),
    source,
    output: {
      provider: text(outputRow.provider) as "local",
      locator: text(outputRow.locator),
      generation: text(outputRow.generation),
      contentType: text(outputRow.contentType) as "video/mp4",
      profile: text(outputRow.profile) as typeof EXTERNAL_SOURCE_PROXY_PROFILE,
      sha256: text(outputRow.sha256).toLowerCase(),
      sizeBytes: positiveSafeInteger(outputRow.sizeBytes),
      durationSeconds: nonNegativeFinite(outputRow.durationSeconds),
      widthPixels: positiveSafeInteger(outputRow.widthPixels),
      heightPixels: positiveSafeInteger(outputRow.heightPixels),
      framesPerSecond: nonNegativeFinite(outputRow.framesPerSecond),
    },
    worker: {
      executionId: text(workerRow.executionId),
      buildId: text(workerRow.buildId),
      attempt: positiveSafeInteger(workerRow.attempt),
    },
    originalRemainsSourceTruth: row.originalRemainsSourceTruth as true,
  };
  const expectedMismatch = expectedJob ? (
    result.jobId !== expectedJob.jobId
    || result.derivativeId !== expectedJob.derivativeId
    || source.provider !== expectedJob.source.provider
    || source.externalReferenceId !== expectedJob.source.externalReferenceId
    || source.sourceRevisionId !== expectedJob.source.sourceRevisionId
    || source.revisionKey !== expectedJob.source.revisionKey
    || source.identitySha256 !== expectedJob.source.identitySha256
    || source.expectedContentSha256 !== expectedJob.source.expectedContentSha256
    || source.expectedSizeBytes !== expectedJob.source.expectedSizeBytes
    || source.contentType !== expectedJob.source.contentType
    || !result.output.locator.endsWith(`/${expectedJob.target.locator}`)
  ) : false;
  if (
    result.kind !== EXTERNAL_SOURCE_PROXY_RESULT_KIND
    || result.version !== 1
    || !SAFE_ID.test(result.jobId)
    || !SAFE_ID.test(result.derivativeId)
    || !isoDate(result.completedAt)
    || !SHA256.test(source.observedContentSha256)
    || source.observedContentSha256 !== source.expectedContentSha256
    || source.observedSizeBytes !== source.expectedSizeBytes
    || result.output.provider !== "local"
    || !result.output.locator.startsWith("/")
    || !result.output.locator.endsWith(".mp4")
    || result.output.locator.includes("\0")
    || result.output.generation !== `sha256:${result.output.sha256}`
    || !SHA256.test(result.output.sha256)
    || result.output.sizeBytes <= 0
    || result.output.durationSeconds < 0
    || result.output.widthPixels <= 0
    || result.output.heightPixels <= 0
    || Math.max(result.output.widthPixels, result.output.heightPixels) > EXTERNAL_SOURCE_PROXY_MAX_DIMENSION
    || result.output.framesPerSecond < 0
    || result.output.contentType !== "video/mp4"
    || result.output.profile !== EXTERNAL_SOURCE_PROXY_PROFILE
    || !result.worker.executionId
    || !result.worker.buildId
    || result.worker.attempt <= 0
    || result.originalRemainsSourceTruth !== true
    || result.output.sizeBytes >= source.observedSizeBytes
    || expectedMismatch
  ) {
    throw new Error("External source proxy result is invalid.");
  }
  return result;
}
