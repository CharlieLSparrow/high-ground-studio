export const GOOGLE_DRIVE_SOURCE_MATERIALIZATION_JOB_KIND =
  "quipsly-google-drive-source-materialization-job-v2" as const;
export const GOOGLE_DRIVE_SOURCE_MATERIALIZATION_RESULT_KIND =
  "quipsly-google-drive-source-materialization-result-v2" as const;
export const GOOGLE_DRIVE_SOURCE_MATERIALIZATION_PROFILE =
  "exact-provider-replica-v1" as const;
export const GOOGLE_DRIVE_SOURCE_ORIGINAL_MATERIALIZATION_PROFILE =
  "exact-provider-original-replica-v1" as const;

export type GoogleDriveSourceMaterializationProfile =
  | typeof GOOGLE_DRIVE_SOURCE_MATERIALIZATION_PROFILE
  | typeof GOOGLE_DRIVE_SOURCE_ORIGINAL_MATERIALIZATION_PROFILE;
export type GoogleDriveSourceMaterializationMemberRole =
  | "browse-proxy"
  | "primary-original"
  | "secondary-original";

const SAFE_ID = /^[A-Za-z0-9:_-]{8,200}$/;
const SAFE_FILE_ID = /^[A-Za-z0-9._-]{1,512}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const MD5 = /^[0-9a-f]{32}$/;

export type GoogleDriveSourceMaterializationJob = {
  kind: typeof GOOGLE_DRIVE_SOURCE_MATERIALIZATION_JOB_KIND;
  version: 2;
  jobId: string;
  replicaId: string;
  projectId: string;
  projectSlug: string;
  actorUserId: string;
  actorEmail: string;
  queuedAt: string;
  source: {
    provider: "google-drive";
    connectionId: string;
    externalReferenceId: string;
    sourceRevisionId: string;
    externalFileId: string;
    resourceKey: string | null;
    headRevisionKey: string;
    identitySha256: string;
    expectedMd5: string;
    expectedSizeBytes: number;
    contentType: string;
    memberRole: GoogleDriveSourceMaterializationMemberRole;
  };
  target: {
    provider: "local-cache";
    locator: string;
    profile: GoogleDriveSourceMaterializationProfile;
    custodianNodeId: string;
    storageScopeId: string;
  };
};

export type GoogleDriveSourceMaterializationResult = {
  kind: typeof GOOGLE_DRIVE_SOURCE_MATERIALIZATION_RESULT_KIND;
  version: 2;
  jobId: string;
  replicaId: string;
  completedAt: string;
  source: GoogleDriveSourceMaterializationJob["source"] & {
    observedHeadRevisionKey: string;
    observedMd5: string;
    observedSizeBytes: number;
    observedSha256: string;
  };
  output: {
    provider: "local-cache";
    locator: string;
    generation: string;
    profile: GoogleDriveSourceMaterializationProfile;
    contentType: string;
    sha256: string;
    md5: string;
    sizeBytes: number;
  };
  transfer: {
    resumedFromBytes: number;
    downloadedBytes: number;
    providerRequestCount: number;
  };
  worker: {
    executionId: string;
    buildId: string;
    attempt: number;
    custodianNodeId: string;
    storageScopeId: string;
  };
  boundaries: {
    originalRemainsInDrive: true;
    replicaMatchesProviderRevision: true;
    collaborationProxyQueuedFromVerifiedBytes: boolean;
  };
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
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : 0;
}

function nonNegativeSafeInteger(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : -1;
}

function isIsoDate(value: string) {
  return Boolean(value && Number.isFinite(Date.parse(value)));
}

function safeRelativeLocator(value: string) {
  return (
    value.length > 0 &&
    value.length <= 2_000 &&
    !value.startsWith("/") &&
    !value.includes("\0") &&
    !value.split("/").some((part) => !part || part === "." || part === "..") &&
    /\.(?:insv|lrv|mp4)$/i.test(value)
  );
}

function safeAbsoluteLocator(value: string) {
  return (
    value.startsWith("/") && value.length <= 4_096 && !value.includes("\0")
  );
}

function email(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function googleDriveSourceMaterializationIdentity(input: {
  projectId: string;
  sourceRevisionId: string;
  identitySha256: string;
  custodianNodeId: string;
  storageScopeId: string;
  profile?: GoogleDriveSourceMaterializationProfile;
}) {
  return [
    "google-drive-source-materialization-v2",
    text(input.projectId),
    text(input.sourceRevisionId),
    text(input.identitySha256).toLowerCase(),
    text(input.custodianNodeId),
    text(input.storageScopeId),
    input.profile ?? GOOGLE_DRIVE_SOURCE_MATERIALIZATION_PROFILE,
  ].join(":");
}

export function newGoogleDriveSourceMaterializationJob(
  input: Omit<GoogleDriveSourceMaterializationJob, "kind" | "version">,
) {
  return parseGoogleDriveSourceMaterializationJob({
    kind: GOOGLE_DRIVE_SOURCE_MATERIALIZATION_JOB_KIND,
    version: 2,
    ...input,
  });
}

export function parseGoogleDriveSourceMaterializationJob(
  value: unknown,
  expectedJobId?: string,
): GoogleDriveSourceMaterializationJob {
  const row = record(value);
  const sourceRow = record(row.source);
  const targetRow = record(row.target);
  const source: GoogleDriveSourceMaterializationJob["source"] = {
    provider: text(sourceRow.provider) as "google-drive",
    connectionId: text(sourceRow.connectionId),
    externalReferenceId: text(sourceRow.externalReferenceId),
    sourceRevisionId: text(sourceRow.sourceRevisionId),
    externalFileId: text(sourceRow.externalFileId),
    resourceKey:
      sourceRow.resourceKey == null ? null : text(sourceRow.resourceKey),
    headRevisionKey: text(sourceRow.headRevisionKey),
    identitySha256: text(sourceRow.identitySha256).toLowerCase(),
    expectedMd5: text(sourceRow.expectedMd5).toLowerCase(),
    expectedSizeBytes: positiveSafeInteger(sourceRow.expectedSizeBytes),
    contentType: text(sourceRow.contentType).toLowerCase(),
    memberRole: text(
      sourceRow.memberRole,
    ) as GoogleDriveSourceMaterializationMemberRole,
  };
  const target: GoogleDriveSourceMaterializationJob["target"] = {
    provider: text(targetRow.provider) as "local-cache",
    locator: text(targetRow.locator),
    profile: text(targetRow.profile) as GoogleDriveSourceMaterializationProfile,
    custodianNodeId: text(targetRow.custodianNodeId),
    storageScopeId: text(targetRow.storageScopeId),
  };
  const job: GoogleDriveSourceMaterializationJob = {
    kind: row.kind as typeof GOOGLE_DRIVE_SOURCE_MATERIALIZATION_JOB_KIND,
    version: Number(row.version) as 2,
    jobId: text(row.jobId),
    replicaId: text(row.replicaId),
    projectId: text(row.projectId),
    projectSlug: text(row.projectSlug),
    actorUserId: text(row.actorUserId),
    actorEmail: text(row.actorEmail).toLowerCase(),
    queuedAt: text(row.queuedAt),
    source,
    target,
  };
  if (
    job.kind !== GOOGLE_DRIVE_SOURCE_MATERIALIZATION_JOB_KIND ||
    job.version !== 2 ||
    !SAFE_ID.test(job.jobId) ||
    (expectedJobId && job.jobId !== expectedJobId) ||
    !SAFE_ID.test(job.replicaId) ||
    !SAFE_ID.test(job.projectId) ||
    !/^[a-z0-9][a-z0-9-]{0,127}$/.test(job.projectSlug) ||
    !SAFE_ID.test(job.actorUserId) ||
    !email(job.actorEmail) ||
    !isIsoDate(job.queuedAt) ||
    source.provider !== "google-drive" ||
    !SAFE_ID.test(source.connectionId) ||
    !SAFE_ID.test(source.externalReferenceId) ||
    !SAFE_ID.test(source.sourceRevisionId) ||
    !SAFE_FILE_ID.test(source.externalFileId) ||
    (source.resourceKey !== null && !SAFE_FILE_ID.test(source.resourceKey)) ||
    !source.headRevisionKey ||
    source.headRevisionKey.length > 500 ||
    !SHA256.test(source.identitySha256) ||
    !MD5.test(source.expectedMd5) ||
    source.expectedSizeBytes <= 0 ||
    !source.contentType.startsWith("video/") ||
    !["browse-proxy", "primary-original", "secondary-original"].includes(
      source.memberRole,
    ) ||
    target.provider !== "local-cache" ||
    !safeRelativeLocator(target.locator) ||
    !SAFE_ID.test(target.custodianNodeId) ||
    !SAFE_ID.test(target.storageScopeId) ||
    ![
      GOOGLE_DRIVE_SOURCE_MATERIALIZATION_PROFILE,
      GOOGLE_DRIVE_SOURCE_ORIGINAL_MATERIALIZATION_PROFILE,
    ].includes(target.profile) ||
    (source.memberRole === "browse-proxy" &&
      (target.profile !== GOOGLE_DRIVE_SOURCE_MATERIALIZATION_PROFILE ||
        !/\.(?:lrv|mp4)$/i.test(target.locator))) ||
    (source.memberRole !== "browse-proxy" &&
      (target.profile !==
        GOOGLE_DRIVE_SOURCE_ORIGINAL_MATERIALIZATION_PROFILE ||
        !/\.insv$/i.test(target.locator)))
  ) {
    throw new Error("Google Drive source materialization job is invalid.");
  }
  return job;
}

export function newGoogleDriveSourceMaterializationResult(
  input: Omit<
    GoogleDriveSourceMaterializationResult,
    "kind" | "version" | "boundaries"
  >,
) {
  return parseGoogleDriveSourceMaterializationResult({
    kind: GOOGLE_DRIVE_SOURCE_MATERIALIZATION_RESULT_KIND,
    version: 2,
    ...input,
    boundaries: {
      originalRemainsInDrive: true,
      replicaMatchesProviderRevision: true,
      collaborationProxyQueuedFromVerifiedBytes:
        input.source.memberRole === "browse-proxy",
    },
  });
}

export function parseGoogleDriveSourceMaterializationResult(
  value: unknown,
  expectedJob?: GoogleDriveSourceMaterializationJob,
): GoogleDriveSourceMaterializationResult {
  const row = record(value);
  const sourceRow = record(row.source);
  const outputRow = record(row.output);
  const transferRow = record(row.transfer);
  const workerRow = record(row.worker);
  const boundariesRow = record(row.boundaries);
  const baseJob = parseGoogleDriveSourceMaterializationJob(
    {
      kind: GOOGLE_DRIVE_SOURCE_MATERIALIZATION_JOB_KIND,
      version: 2,
      jobId: row.jobId,
      replicaId: row.replicaId,
      projectId: expectedJob?.projectId ?? "project_result_placeholder",
      projectSlug: expectedJob?.projectSlug ?? "result-placeholder",
      actorUserId: expectedJob?.actorUserId ?? "actor_result_placeholder",
      actorEmail: expectedJob?.actorEmail ?? "result@example.test",
      queuedAt: expectedJob?.queuedAt ?? row.completedAt,
      source: sourceRow,
      target: {
        provider: "local-cache",
        locator:
          expectedJob?.target.locator ??
          (outputRow.profile ===
          GOOGLE_DRIVE_SOURCE_ORIGINAL_MATERIALIZATION_PROFILE
            ? "source-cache/result-placeholder.insv"
            : "source-cache/result-placeholder.lrv"),
        profile: outputRow.profile,
        custodianNodeId:
          expectedJob?.target.custodianNodeId ?? "executor_result_placeholder",
        storageScopeId:
          expectedJob?.target.storageScopeId ?? "storage_result_placeholder",
      },
    },
    expectedJob?.jobId,
  );
  const result: GoogleDriveSourceMaterializationResult = {
    kind: row.kind as typeof GOOGLE_DRIVE_SOURCE_MATERIALIZATION_RESULT_KIND,
    version: Number(row.version) as 2,
    jobId: text(row.jobId),
    replicaId: text(row.replicaId),
    completedAt: text(row.completedAt),
    source: {
      ...baseJob.source,
      observedHeadRevisionKey: text(sourceRow.observedHeadRevisionKey),
      observedMd5: text(sourceRow.observedMd5).toLowerCase(),
      observedSizeBytes: positiveSafeInteger(sourceRow.observedSizeBytes),
      observedSha256: text(sourceRow.observedSha256).toLowerCase(),
    },
    output: {
      provider: text(outputRow.provider) as "local-cache",
      locator: text(outputRow.locator),
      generation: text(outputRow.generation),
      profile: text(
        outputRow.profile,
      ) as GoogleDriveSourceMaterializationProfile,
      contentType: text(outputRow.contentType).toLowerCase(),
      sha256: text(outputRow.sha256).toLowerCase(),
      md5: text(outputRow.md5).toLowerCase(),
      sizeBytes: positiveSafeInteger(outputRow.sizeBytes),
    },
    transfer: {
      resumedFromBytes: nonNegativeSafeInteger(transferRow.resumedFromBytes),
      downloadedBytes: nonNegativeSafeInteger(transferRow.downloadedBytes),
      providerRequestCount: positiveSafeInteger(
        transferRow.providerRequestCount,
      ),
    },
    worker: {
      executionId: text(workerRow.executionId),
      buildId: text(workerRow.buildId),
      attempt: positiveSafeInteger(workerRow.attempt),
      custodianNodeId: text(workerRow.custodianNodeId),
      storageScopeId: text(workerRow.storageScopeId),
    },
    boundaries: {
      originalRemainsInDrive: boundariesRow.originalRemainsInDrive as true,
      replicaMatchesProviderRevision:
        boundariesRow.replicaMatchesProviderRevision as true,
      collaborationProxyQueuedFromVerifiedBytes:
        boundariesRow.collaborationProxyQueuedFromVerifiedBytes === true,
    },
  };
  const source = result.source;
  if (
    result.kind !== GOOGLE_DRIVE_SOURCE_MATERIALIZATION_RESULT_KIND ||
    result.version !== 2 ||
    !isIsoDate(result.completedAt) ||
    source.observedHeadRevisionKey !== source.headRevisionKey ||
    source.observedMd5 !== source.expectedMd5 ||
    source.observedSizeBytes !== source.expectedSizeBytes ||
    !SHA256.test(source.observedSha256) ||
    result.output.provider !== "local-cache" ||
    !safeAbsoluteLocator(result.output.locator) ||
    result.output.generation !== `sha256:${result.output.sha256}` ||
    !SHA256.test(result.output.sha256) ||
    result.output.sha256 !== source.observedSha256 ||
    result.output.md5 !== source.observedMd5 ||
    result.output.sizeBytes !== source.observedSizeBytes ||
    result.output.profile !== baseJob.target.profile ||
    result.output.contentType !== source.contentType ||
    result.transfer.resumedFromBytes < 0 ||
    result.transfer.downloadedBytes < 0 ||
    result.transfer.resumedFromBytes + result.transfer.downloadedBytes !==
      result.output.sizeBytes ||
    result.transfer.providerRequestCount <= 0 ||
    !result.worker.executionId ||
    !result.worker.buildId ||
    result.worker.attempt <= 0 ||
    !SAFE_ID.test(result.worker.custodianNodeId) ||
    !SAFE_ID.test(result.worker.storageScopeId) ||
    result.boundaries.originalRemainsInDrive !== true ||
    result.boundaries.replicaMatchesProviderRevision !== true ||
    result.boundaries.collaborationProxyQueuedFromVerifiedBytes !==
      (source.memberRole === "browse-proxy") ||
    (expectedJob &&
      (result.jobId !== expectedJob.jobId ||
        result.replicaId !== expectedJob.replicaId ||
        source.connectionId !== expectedJob.source.connectionId ||
        source.externalReferenceId !== expectedJob.source.externalReferenceId ||
        source.sourceRevisionId !== expectedJob.source.sourceRevisionId ||
        source.externalFileId !== expectedJob.source.externalFileId ||
        source.resourceKey !== expectedJob.source.resourceKey ||
        source.headRevisionKey !== expectedJob.source.headRevisionKey ||
        source.identitySha256 !== expectedJob.source.identitySha256 ||
        source.expectedMd5 !== expectedJob.source.expectedMd5 ||
        source.expectedSizeBytes !== expectedJob.source.expectedSizeBytes ||
        source.contentType !== expectedJob.source.contentType ||
        source.memberRole !== expectedJob.source.memberRole ||
        result.output.profile !== expectedJob.target.profile ||
        result.worker.custodianNodeId !== expectedJob.target.custodianNodeId ||
        result.worker.storageScopeId !== expectedJob.target.storageScopeId ||
        !result.output.locator.endsWith(`/${expectedJob.target.locator}`)))
  ) {
    throw new Error("Google Drive source materialization result is invalid.");
  }
  return result;
}
