import type { AudioMasterySourceBinding } from "./audio-mastery.js";
import {
  parseAudioAlignmentEvidence,
  type AudioAlignmentEvidence,
} from "./audio-alignment-evidence.js";

export const AUDIO_ALIGNMENT_JOB_KIND = "quipsly-audio-alignment-job-v1" as const;
export const SESSION_AUDIO_ALIGNMENT_JOB_KIND = "quipsly-session-audio-alignment-job-v1" as const;
export const AUDIO_ALIGNMENT_RESULT_KIND = "quipsly-audio-alignment-result-v1" as const;
export const AUDIO_ALIGNMENT_JOB_VERSION = 1 as const;
export const AUDIO_ALIGNMENT_CLOUD_MANIFEST_KIND = "quipsly-audio-alignment-cloud-manifest-v1" as const;
export const AUDIO_ALIGNMENT_CLOUD_QUEUE_KIND = "quipsly-audio-alignment-cloud-queue-v1" as const;
export const AUDIO_ALIGNMENT_CLOUD_CONTROL_PREFIX = "media-vault/control/audio-alignment" as const;
export const AUDIO_ALIGNMENT_CLOUD_MANIFEST_PREFIX = `${AUDIO_ALIGNMENT_CLOUD_CONTROL_PREFIX}/manifests` as const;
export const AUDIO_ALIGNMENT_CLOUD_QUEUE_PREFIX = `${AUDIO_ALIGNMENT_CLOUD_CONTROL_PREFIX}/queue` as const;
export const AUDIO_ALIGNMENT_CLOUD_RESULT_PREFIX = `${AUDIO_ALIGNMENT_CLOUD_CONTROL_PREFIX}/results` as const;
export const AUDIO_ALIGNMENT_CLOUD_DEAD_LETTER_PREFIX = `${AUDIO_ALIGNMENT_CLOUD_CONTROL_PREFIX}/dead-letter` as const;

export type AudioAlignmentJob = {
  kind: typeof AUDIO_ALIGNMENT_JOB_KIND;
  version: typeof AUDIO_ALIGNMENT_JOB_VERSION;
  jobId: string;
  projectId: string;
  projectSlug: string;
  episodeProductionId: string;
  episodeSlug: string;
  requestedByUserId: string | null;
  requestedByEmail: string;
  queuedAt: string;
  spine: AudioMasterySourceBinding;
  target: AudioMasterySourceBinding;
  proposal: {
    initialOffsetSeconds: number;
    openingTargetSeconds: number;
    laterTargetSeconds: number;
    windowSeconds: number;
    searchRadiusSeconds: number;
    sampleRate: number;
    minimumCorrelation: number;
    minimumPeakMargin: number;
  };
  boundaries: {
    sourceBytesImmutable: true;
    outputIsEvidenceOnly: true;
    placementRequiresSeparateReview: true;
  };
};

/**
 * Session-owned alignment work deliberately has its own scope envelope. The
 * analyzer only needs immutable sources and a bounded proposal, but persistence
 * and authorization must never invent an Episode or StudioMediaAsset identity
 * for a coaching/call recording.
 */
export type SessionAudioAlignmentJob = {
  kind: typeof SESSION_AUDIO_ALIGNMENT_JOB_KIND;
  version: typeof AUDIO_ALIGNMENT_JOB_VERSION;
  jobId: string;
  roomId: string;
  captureGroupId: string;
  requestedByUserId: string;
  requestedByEmail: string;
  queuedAt: string;
  spine: AudioMasterySourceBinding;
  target: AudioMasterySourceBinding;
  proposal: AudioAlignmentJob["proposal"];
  boundaries: AudioAlignmentJob["boundaries"] & {
    sessionScopePreserved: true;
  };
};

export type AudioAlignmentWorkItem = AudioAlignmentJob | SessionAudioAlignmentJob;

export type AudioAlignmentResult = {
  kind: typeof AUDIO_ALIGNMENT_RESULT_KIND;
  version: typeof AUDIO_ALIGNMENT_JOB_VERSION;
  jobId: string;
  completedAt: string;
  evidence: AudioAlignmentEvidence;
  worker: {
    executionId: string;
    buildId: string;
    imageDigest: string | null;
    attempt: number;
  };
  boundaries: {
    sourceBytesImmutable: true;
    outputIsEvidenceOnly: true;
    placementApplied: false;
  };
};

export type AudioAlignmentCloudManifest = {
  kind: typeof AUDIO_ALIGNMENT_CLOUD_MANIFEST_KIND;
  version: 1;
  job: AudioAlignmentWorkItem;
  status: "queued" | "processing" | "completed" | "failed-terminal";
  queuedAt: string;
  updatedAt: string;
  lease: null | {
    id: string;
    executionId: string;
    claimedAt: string;
    expiresAt: string;
    attempt: number;
  };
  resultObjectName: string | null;
  failure: null | { code: string; message: string; failedAt: string };
};

export type AudioAlignmentCloudQueueReceipt = {
  kind: typeof AUDIO_ALIGNMENT_CLOUD_QUEUE_KIND;
  version: 1;
  jobId: string;
  manifestObjectName: string;
  manifestGeneration: string;
  enqueuedAt: string;
};

const SAFE_ID = /^[A-Za-z0-9_-]{8,180}$/;
const SHA256 = /^[0-9a-f]{64}$/;

export function newAudioAlignmentJob(
  input: Omit<AudioAlignmentJob, "kind" | "version" | "boundaries">,
): AudioAlignmentJob {
  return parseAudioAlignmentJob({
    ...input,
    kind: AUDIO_ALIGNMENT_JOB_KIND,
    version: AUDIO_ALIGNMENT_JOB_VERSION,
    boundaries: {
      sourceBytesImmutable: true,
      outputIsEvidenceOnly: true,
      placementRequiresSeparateReview: true,
    },
  });
}

export function newSessionAudioAlignmentJob(
  input: Omit<SessionAudioAlignmentJob, "kind" | "version" | "boundaries">,
): SessionAudioAlignmentJob {
  return parseSessionAudioAlignmentJob({
    ...input,
    kind: SESSION_AUDIO_ALIGNMENT_JOB_KIND,
    version: AUDIO_ALIGNMENT_JOB_VERSION,
    boundaries: {
      sourceBytesImmutable: true,
      outputIsEvidenceOnly: true,
      placementRequiresSeparateReview: true,
      sessionScopePreserved: true,
    },
  });
}

export function parseAudioAlignmentJob(value: unknown, expectedJobId?: string): AudioAlignmentJob {
  const row = record(value);
  const proposal = record(row.proposal);
  const boundaries = record(row.boundaries);
  const jobId = identifier(row.jobId, "jobId");
  const spine = source(row.spine, "spine");
  const target = source(row.target, "target");
  const parsed: AudioAlignmentJob = {
    kind: row.kind as AudioAlignmentJob["kind"],
    version: Number(row.version) as 1,
    jobId,
    projectId: identifier(row.projectId, "projectId"),
    projectSlug: requiredText(row.projectSlug, "projectSlug"),
    episodeProductionId: identifier(row.episodeProductionId, "episodeProductionId"),
    episodeSlug: requiredText(row.episodeSlug, "episodeSlug"),
    requestedByUserId: row.requestedByUserId == null ? null : identifier(row.requestedByUserId, "requestedByUserId"),
    requestedByEmail: email(row.requestedByEmail),
    queuedAt: isoDate(row.queuedAt, "queuedAt"),
    spine,
    target,
    proposal: {
      initialOffsetSeconds: bounded(proposal.initialOffsetSeconds, -86_400, 86_400, "initialOffsetSeconds"),
      openingTargetSeconds: bounded(proposal.openingTargetSeconds, 0, 86_400, "openingTargetSeconds"),
      laterTargetSeconds: bounded(proposal.laterTargetSeconds, 0, 86_400, "laterTargetSeconds"),
      windowSeconds: bounded(proposal.windowSeconds, 1, 30, "windowSeconds"),
      searchRadiusSeconds: bounded(proposal.searchRadiusSeconds, 0.05, 30, "searchRadiusSeconds"),
      sampleRate: integer(proposal.sampleRate, 4_000, 48_000, "sampleRate"),
      minimumCorrelation: bounded(proposal.minimumCorrelation, 0, 1, "minimumCorrelation"),
      minimumPeakMargin: bounded(proposal.minimumPeakMargin, 0, 1, "minimumPeakMargin"),
    },
    boundaries: {
      sourceBytesImmutable: true,
      outputIsEvidenceOnly: true,
      placementRequiresSeparateReview: true,
    },
  };
  if (
    parsed.kind !== AUDIO_ALIGNMENT_JOB_KIND
    || parsed.version !== AUDIO_ALIGNMENT_JOB_VERSION
    || (expectedJobId && expectedJobId !== jobId)
    || parsed.spine.assetId === parsed.target.assetId
    || parsed.proposal.laterTargetSeconds <= parsed.proposal.openingTargetSeconds
    || boundaries.sourceBytesImmutable !== true
    || boundaries.outputIsEvidenceOnly !== true
    || boundaries.placementRequiresSeparateReview !== true
  ) throw new Error("Audio alignment job contract is invalid.");
  return parsed;
}

export function parseSessionAudioAlignmentJob(
  value: unknown,
  expectedJobId?: string,
): SessionAudioAlignmentJob {
  const row = record(value);
  const proposal = parseProposal(row.proposal);
  const boundaries = record(row.boundaries);
  const jobId = identifier(row.jobId, "jobId");
  const spine = source(row.spine, "spine");
  const target = source(row.target, "target");
  const parsed: SessionAudioAlignmentJob = {
    kind: row.kind as SessionAudioAlignmentJob["kind"],
    version: Number(row.version) as 1,
    jobId,
    roomId: identifier(row.roomId, "roomId"),
    captureGroupId: uuid(row.captureGroupId, "captureGroupId"),
    requestedByUserId: identifier(row.requestedByUserId, "requestedByUserId"),
    requestedByEmail: email(row.requestedByEmail),
    queuedAt: isoDate(row.queuedAt, "queuedAt"),
    spine,
    target,
    proposal,
    boundaries: {
      sourceBytesImmutable: true,
      outputIsEvidenceOnly: true,
      placementRequiresSeparateReview: true,
      sessionScopePreserved: true,
    },
  };
  if (
    parsed.kind !== SESSION_AUDIO_ALIGNMENT_JOB_KIND
    || parsed.version !== AUDIO_ALIGNMENT_JOB_VERSION
    || (expectedJobId && expectedJobId !== jobId)
    || parsed.spine.assetId === parsed.target.assetId
    || parsed.proposal.laterTargetSeconds <= parsed.proposal.openingTargetSeconds
    || boundaries.sourceBytesImmutable !== true
    || boundaries.outputIsEvidenceOnly !== true
    || boundaries.placementRequiresSeparateReview !== true
    || boundaries.sessionScopePreserved !== true
  ) throw new Error("Session audio alignment job contract is invalid.");
  return parsed;
}

export function parseAudioAlignmentWorkItem(
  value: unknown,
  expectedJobId?: string,
): AudioAlignmentWorkItem {
  return record(value).kind === SESSION_AUDIO_ALIGNMENT_JOB_KIND
    ? parseSessionAudioAlignmentJob(value, expectedJobId)
    : parseAudioAlignmentJob(value, expectedJobId);
}

export function newAudioAlignmentResult(input: Omit<AudioAlignmentResult, "kind" | "version" | "boundaries">) {
  return parseAudioAlignmentResult({
    ...input,
    kind: AUDIO_ALIGNMENT_RESULT_KIND,
    version: AUDIO_ALIGNMENT_JOB_VERSION,
    boundaries: {
      sourceBytesImmutable: true,
      outputIsEvidenceOnly: true,
      placementApplied: false,
    },
  });
}

export function parseAudioAlignmentResult(value: unknown, expectedJob?: AudioAlignmentWorkItem | unknown): AudioAlignmentResult {
  const row = record(value);
  const worker = record(row.worker);
  const boundaries = record(row.boundaries);
  const job = expectedJob ? parseAudioAlignmentWorkItem(expectedJob) : null;
  const evidence = parseAudioAlignmentEvidence(row.evidence);
  const parsed: AudioAlignmentResult = {
    kind: row.kind as AudioAlignmentResult["kind"],
    version: Number(row.version) as 1,
    jobId: identifier(row.jobId, "jobId"),
    completedAt: isoDate(row.completedAt, "completedAt"),
    evidence,
    worker: {
      executionId: identifier(worker.executionId, "worker.executionId"),
      buildId: requiredText(worker.buildId, "worker.buildId"),
      imageDigest: worker.imageDigest == null ? null : requiredText(worker.imageDigest, "worker.imageDigest"),
      attempt: integer(worker.attempt, 1, 1_000, "worker.attempt"),
    },
    boundaries: {
      sourceBytesImmutable: true,
      outputIsEvidenceOnly: true,
      placementApplied: false,
    },
  };
  const windowFit = evidence.analyzer.windowFit;
  const openingMatchesProposal = !job
    || Math.abs(job.proposal.openingTargetSeconds - evidence.opening.targetStartSeconds) <= 0.000001;
  const laterMatchesProposal = !job
    || Math.abs(job.proposal.laterTargetSeconds - evidence.later.targetStartSeconds) <= 0.000001;
  const fittedWindowMatchesJob = !job || !windowFit || (
    Math.abs(windowFit.initialOffsetSeconds - job.proposal.initialOffsetSeconds) <= 0.000001
    && Math.abs(windowFit.requestedOpeningTargetSeconds - job.proposal.openingTargetSeconds) <= 0.000001
    && Math.abs(windowFit.requestedLaterTargetSeconds - job.proposal.laterTargetSeconds) <= 0.000001
    && Math.abs(windowFit.windowSeconds - job.proposal.windowSeconds) <= 0.000001
  );
  if (
    parsed.kind !== AUDIO_ALIGNMENT_RESULT_KIND
    || parsed.version !== AUDIO_ALIGNMENT_JOB_VERSION
    || (job && parsed.jobId !== job.jobId)
    || (job && !sameSource(job.spine, evidence.spine))
    || (job && !sameSource(job.target, evidence.target))
    || (!openingMatchesProposal && !windowFit)
    || (!laterMatchesProposal && !windowFit)
    || !fittedWindowMatchesJob
    || boundaries.sourceBytesImmutable !== true
    || boundaries.outputIsEvidenceOnly !== true
    || boundaries.placementApplied !== false
  ) throw new Error("Audio alignment result integrity is invalid.");
  return parsed;
}

export function buildAudioAlignmentCloudManifestObjectName(jobId: string) {
  return `${AUDIO_ALIGNMENT_CLOUD_MANIFEST_PREFIX}/${identifier(jobId, "jobId")}.json`;
}
export function buildAudioAlignmentCloudQueueObjectName(jobId: string) {
  return `${AUDIO_ALIGNMENT_CLOUD_QUEUE_PREFIX}/${identifier(jobId, "jobId")}.json`;
}
export function buildAudioAlignmentCloudResultObjectName(jobId: string) {
  return `${AUDIO_ALIGNMENT_CLOUD_RESULT_PREFIX}/${identifier(jobId, "jobId")}.json`;
}
export function buildAudioAlignmentCloudDeadLetterObjectName(jobId: string) {
  return `${AUDIO_ALIGNMENT_CLOUD_DEAD_LETTER_PREFIX}/${identifier(jobId, "jobId")}.json`;
}

export function newAudioAlignmentCloudManifest(jobValue: AudioAlignmentWorkItem | unknown): AudioAlignmentCloudManifest {
  const job = parseAudioAlignmentWorkItem(jobValue);
  if (job.spine.provider !== "gcs" || job.target.provider !== "gcs") throw new Error("Cloud alignment requires two GCS sources.");
  return parseAudioAlignmentCloudManifest({
    kind: AUDIO_ALIGNMENT_CLOUD_MANIFEST_KIND,
    version: 1,
    job,
    status: "queued",
    queuedAt: job.queuedAt,
    updatedAt: job.queuedAt,
    lease: null,
    resultObjectName: null,
    failure: null,
  }, job.jobId);
}

export function parseAudioAlignmentCloudQueueReceipt(value: unknown): AudioAlignmentCloudQueueReceipt {
  const row = record(value);
  const jobId = identifier(row.jobId, "jobId");
  const parsed: AudioAlignmentCloudQueueReceipt = {
    kind: row.kind as AudioAlignmentCloudQueueReceipt["kind"],
    version: Number(row.version) as 1,
    jobId,
    manifestObjectName: requiredText(row.manifestObjectName, "manifestObjectName"),
    manifestGeneration: requiredText(row.manifestGeneration, "manifestGeneration"),
    enqueuedAt: isoDate(row.enqueuedAt, "enqueuedAt"),
  };
  if (
    parsed.kind !== AUDIO_ALIGNMENT_CLOUD_QUEUE_KIND
    || parsed.version !== 1
    || parsed.manifestObjectName !== buildAudioAlignmentCloudManifestObjectName(jobId)
    || !/^[1-9][0-9]*$/.test(parsed.manifestGeneration)
  ) throw new Error("Audio alignment cloud queue receipt is invalid.");
  return parsed;
}

export function parseAudioAlignmentCloudManifest(value: unknown, expectedJobId?: string): AudioAlignmentCloudManifest {
  const row = record(value);
  const job = parseAudioAlignmentWorkItem(row.job, expectedJobId);
  const status = requiredText(row.status, "status") as AudioAlignmentCloudManifest["status"];
  const lease = row.lease == null ? null : parseCloudLease(row.lease);
  const failure = row.failure == null ? null : parseCloudFailure(row.failure);
  const resultObjectName = row.resultObjectName == null ? null : requiredText(row.resultObjectName, "resultObjectName");
  const parsed: AudioAlignmentCloudManifest = {
    kind: row.kind as AudioAlignmentCloudManifest["kind"],
    version: Number(row.version) as 1,
    job,
    status,
    queuedAt: isoDate(row.queuedAt, "queuedAt"),
    updatedAt: isoDate(row.updatedAt, "updatedAt"),
    lease,
    resultObjectName,
    failure,
  };
  if (
    parsed.kind !== AUDIO_ALIGNMENT_CLOUD_MANIFEST_KIND
    || parsed.version !== 1
    || job.spine.provider !== "gcs"
    || job.target.provider !== "gcs"
    || !validGcsSource(job.spine)
    || !validGcsSource(job.target)
    || parsed.queuedAt !== job.queuedAt
    || !["queued", "processing", "completed", "failed-terminal"].includes(status)
    || (status === "processing") !== Boolean(lease)
    || (status === "completed" ? resultObjectName !== buildAudioAlignmentCloudResultObjectName(job.jobId) : resultObjectName !== null)
    || (status === "failed-terminal") !== Boolean(failure)
  ) throw new Error("Audio alignment cloud manifest is invalid.");
  return parsed;
}

export function claimAudioAlignmentCloudManifest(input: {
  manifest: AudioAlignmentCloudManifest;
  leaseId: string;
  executionId: string;
  now: Date;
  leaseDurationMs: number;
}) {
  const { manifest, now } = input;
  if (manifest.status === "completed" || manifest.status === "failed-terminal") return null;
  if (manifest.status === "processing" && manifest.lease && Date.parse(manifest.lease.expiresAt) > now.getTime()) return null;
  if (!Number.isSafeInteger(input.leaseDurationMs) || input.leaseDurationMs < 60_000) throw new Error("Audio alignment cloud lease duration is invalid.");
  const leaseId = identifier(input.leaseId, "leaseId");
  const executionId = identifier(input.executionId, "executionId");
  return parseAudioAlignmentCloudManifest({
    ...manifest,
    status: "processing",
    updatedAt: now.toISOString(),
    lease: {
      id: leaseId,
      executionId,
      claimedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + input.leaseDurationMs).toISOString(),
      attempt: (manifest.lease?.attempt ?? 0) + 1,
    },
    resultObjectName: null,
    failure: null,
  }, manifest.job.jobId);
}

export function releaseAudioAlignmentCloudLease(input: { manifest: AudioAlignmentCloudManifest; leaseId: string; now: Date }) {
  assertCloudLease(input.manifest, input.leaseId);
  return parseAudioAlignmentCloudManifest({
    ...input.manifest,
    status: "queued",
    updatedAt: input.now.toISOString(),
    lease: null,
  }, input.manifest.job.jobId);
}

export function completeAudioAlignmentCloudManifest(input: {
  manifest: AudioAlignmentCloudManifest;
  leaseId: string;
  result: AudioAlignmentResult;
  now: Date;
}) {
  assertCloudLease(input.manifest, input.leaseId);
  parseAudioAlignmentResult(input.result, input.manifest.job);
  return parseAudioAlignmentCloudManifest({
    ...input.manifest,
    status: "completed",
    updatedAt: input.now.toISOString(),
    lease: null,
    resultObjectName: buildAudioAlignmentCloudResultObjectName(input.manifest.job.jobId),
    failure: null,
  }, input.manifest.job.jobId);
}

export function failAudioAlignmentCloudManifest(input: {
  manifest: AudioAlignmentCloudManifest;
  leaseId: string;
  code: string;
  message: string;
  now: Date;
}) {
  assertCloudLease(input.manifest, input.leaseId);
  return parseAudioAlignmentCloudManifest({
    ...input.manifest,
    status: "failed-terminal",
    updatedAt: input.now.toISOString(),
    lease: null,
    resultObjectName: null,
    failure: {
      code: requiredText(input.code, "failure.code"),
      message: requiredText(input.message, "failure.message"),
      failedAt: input.now.toISOString(),
    },
  }, input.manifest.job.jobId);
}

function assertCloudLease(manifest: AudioAlignmentCloudManifest, leaseId: string) {
  if (manifest.status !== "processing" || !manifest.lease || manifest.lease.id !== leaseId) throw new Error("Audio alignment cloud lease is no longer active.");
}
function parseCloudLease(value: unknown) {
  const row = record(value);
  return {
    id: identifier(row.id, "lease.id"),
    executionId: identifier(row.executionId, "lease.executionId"),
    claimedAt: isoDate(row.claimedAt, "lease.claimedAt"),
    expiresAt: isoDate(row.expiresAt, "lease.expiresAt"),
    attempt: integer(row.attempt, 1, 1_000, "lease.attempt"),
  };
}
function parseCloudFailure(value: unknown) {
  const row = record(value);
  return {
    code: requiredText(row.code, "failure.code"),
    message: requiredText(row.message, "failure.message"),
    failedAt: isoDate(row.failedAt, "failure.failedAt"),
  };
}
function validGcsSource(value: AudioMasterySourceBinding) {
  const match = /^gcs:\/\/([a-z0-9][a-z0-9._-]{1,221}[a-z0-9])\/(media-vault\/.+)\?generation=([1-9][0-9]*)$/.exec(value.locator);
  return Boolean(match && match[3] === value.generation && !match[2].split("/").some((part) => !part || part === "." || part === ".."));
}

function sameSource(left: AudioMasterySourceBinding, right: AudioMasterySourceBinding) {
  return left.assetId === right.assetId
    && left.provider === right.provider
    && left.locator === right.locator
    && left.generation === right.generation
    && left.sha256 === right.sha256
    && left.sizeBytes === right.sizeBytes
    && left.contentType === right.contentType;
}

function source(value: unknown, label: string): AudioMasterySourceBinding {
  const row = record(value);
  const sha256 = requiredText(row.sha256, `${label}.sha256`).toLowerCase();
  const provider = requiredText(row.provider, `${label}.provider`);
  if (!SHA256.test(sha256) || (provider !== "local" && provider !== "gcs")) {
    throw new Error(`Audio alignment ${label} source binding is invalid.`);
  }
  return {
    assetId: identifier(row.assetId, `${label}.assetId`),
    provider,
    locator: requiredText(row.locator, `${label}.locator`),
    generation: requiredText(row.generation, `${label}.generation`),
    sha256,
    sizeBytes: integer(row.sizeBytes, 1, Number.MAX_SAFE_INTEGER, `${label}.sizeBytes`),
    contentType: requiredText(row.contentType, `${label}.contentType`),
  };
}

function parseProposal(value: unknown): AudioAlignmentJob["proposal"] {
  const proposal = record(value);
  return {
    initialOffsetSeconds: bounded(proposal.initialOffsetSeconds, -86_400, 86_400, "initialOffsetSeconds"),
    openingTargetSeconds: bounded(proposal.openingTargetSeconds, 0, 86_400, "openingTargetSeconds"),
    laterTargetSeconds: bounded(proposal.laterTargetSeconds, 0, 86_400, "laterTargetSeconds"),
    windowSeconds: bounded(proposal.windowSeconds, 1, 30, "windowSeconds"),
    searchRadiusSeconds: bounded(proposal.searchRadiusSeconds, 0.05, 30, "searchRadiusSeconds"),
    sampleRate: integer(proposal.sampleRate, 4_000, 48_000, "sampleRate"),
    minimumCorrelation: bounded(proposal.minimumCorrelation, 0, 1, "minimumCorrelation"),
    minimumPeakMargin: bounded(proposal.minimumPeakMargin, 0, 1, "minimumPeakMargin"),
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function requiredText(value: unknown, label: string) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`Audio alignment ${label} is required.`);
  return text;
}
function identifier(value: unknown, label: string) {
  const text = requiredText(value, label);
  if (!SAFE_ID.test(text)) throw new Error(`Audio alignment ${label} is invalid.`);
  return text;
}
function uuid(value: unknown, label: string) {
  const text = requiredText(value, label).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(text)) {
    throw new Error(`Audio alignment ${label} is invalid.`);
  }
  return text;
}
function email(value: unknown) {
  const text = requiredText(value, "requestedByEmail").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) throw new Error("Audio alignment requester email is invalid.");
  return text;
}
function number(value: unknown, label: string) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Audio alignment ${label} must be finite.`);
  return parsed;
}
function bounded(value: unknown, minimum: number, maximum: number, label: string) {
  const parsed = number(value, label);
  if (parsed < minimum || parsed > maximum) throw new Error(`Audio alignment ${label} is outside its bounds.`);
  return parsed;
}
function integer(value: unknown, minimum: number, maximum: number, label: string) {
  const parsed = bounded(value, minimum, maximum, label);
  if (!Number.isSafeInteger(parsed)) throw new Error(`Audio alignment ${label} must be an integer.`);
  return parsed;
}
function isoDate(value: unknown, label: string) {
  const text = requiredText(value, label);
  if (!Number.isFinite(Date.parse(text))) throw new Error(`Audio alignment ${label} is invalid.`);
  return text;
}
