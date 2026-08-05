import type { AudioMasterySourceBinding } from "./audio-mastery.js";
import {
  parseAudioAlignmentEvidence,
  type AudioAlignmentEvidence,
} from "./audio-alignment-evidence.js";

export const AUDIO_ALIGNMENT_JOB_KIND = "quipsly-audio-alignment-job-v1" as const;
export const AUDIO_ALIGNMENT_RESULT_KIND = "quipsly-audio-alignment-result-v1" as const;
export const AUDIO_ALIGNMENT_JOB_VERSION = 1 as const;

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
      initialOffsetSeconds: bounded(proposal.initialOffsetSeconds, 0, 86_400, "initialOffsetSeconds"),
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

export function parseAudioAlignmentResult(value: unknown, expectedJob?: AudioAlignmentJob | unknown): AudioAlignmentResult {
  const row = record(value);
  const worker = record(row.worker);
  const boundaries = record(row.boundaries);
  const job = expectedJob ? parseAudioAlignmentJob(expectedJob) : null;
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
  if (
    parsed.kind !== AUDIO_ALIGNMENT_RESULT_KIND
    || parsed.version !== AUDIO_ALIGNMENT_JOB_VERSION
    || (job && parsed.jobId !== job.jobId)
    || (job && !sameSource(job.spine, evidence.spine))
    || (job && !sameSource(job.target, evidence.target))
    || (job && Math.abs(job.proposal.openingTargetSeconds - evidence.opening.targetStartSeconds) > 0.000001)
    || (job && Math.abs(job.proposal.laterTargetSeconds - evidence.later.targetStartSeconds) > 0.000001)
    || boundaries.sourceBytesImmutable !== true
    || boundaries.outputIsEvidenceOnly !== true
    || boundaries.placementApplied !== false
  ) throw new Error("Audio alignment result integrity is invalid.");
  return parsed;
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
