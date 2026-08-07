import {
  assessAudioMastery,
  parseAudioMasteryMeasurement,
  type AudioMasteryAssessment,
  type AudioMasteryMeasurement,
  type AudioMasteryProfileId,
  type AudioMasterySourceBinding,
} from "./audio-mastery.js";
import {
  audioDeliveryProfile,
  type AudioDeliveryProfile,
  type AudioDeliveryProfileId,
} from "./audio-delivery.js";

export const EPISODE_PROGRAM_DELIVERY_CONTRACT_VERSION = 1 as const;
export const EPISODE_PROGRAM_DELIVERY_JOB_KIND = "quipsly-episode-program-delivery-job-v1" as const;
export const EPISODE_PROGRAM_DELIVERY_RESULT_KIND = "quipsly-episode-program-delivery-result-v1" as const;

export type EpisodeProgramDeliveryCandidateBinding = AudioMasterySourceBinding & {
  durationSeconds: number;
  episodeProductionId: string;
  mixJobId: string;
  mixReviewReceiptId: string;
  promotionReceiptId: string;
  programFingerprintSha256: string;
  proposalSha256: string;
  baselineSha256: string;
};

export type EpisodeProgramDeliveryJob = {
  kind: typeof EPISODE_PROGRAM_DELIVERY_JOB_KIND;
  version: typeof EPISODE_PROGRAM_DELIVERY_CONTRACT_VERSION;
  jobId: string;
  projectId: string;
  requestedByEmail: string;
  queuedAt: string;
  source: EpisodeProgramDeliveryCandidateBinding;
  masteryProfileId: AudioMasteryProfileId;
  profileId: AudioDeliveryProfileId;
  target: {
    provider: "local" | "gcs";
    locator: string;
    contentType: "audio/mp4";
    codec: "aac";
    codecProfile: "LC";
    sampleRateHz: 48_000;
    channels: 2;
    bitrateBps: 128_000;
    fastStartRequired: true;
    variantKind: "episode-program-delivery-artifact";
  };
};

export type EpisodeProgramDeliveryResult = {
  kind: typeof EPISODE_PROGRAM_DELIVERY_RESULT_KIND;
  version: typeof EPISODE_PROGRAM_DELIVERY_CONTRACT_VERSION;
  jobId: string;
  completedAt: string;
  source: EpisodeProgramDeliveryCandidateBinding;
  masteryProfileId: AudioMasteryProfileId;
  profile: AudioDeliveryProfile;
  output: {
    provider: "local" | "gcs";
    locator: string;
    generation: string;
    sha256: string;
    sizeBytes: number;
    contentType: "audio/mp4";
    codec: "aac";
    codecProfile: "LC";
    container: "mov,mp4,m4a,3gp,3g2,mj2";
    sampleRateHz: 48_000;
    channels: 2;
    bitrateBps: number;
    durationSeconds: number;
    fastStart: true;
    completeDecode: true;
    variantKind: "episode-program-delivery-artifact";
    verificationMeasurement: AudioMasteryMeasurement;
    verification: AudioMasteryAssessment;
  };
  worker: {
    executionId: string;
    buildId: string;
    imageDigest: string | null;
    attempt: number;
    ffmpegVersion: string;
  };
  boundaries: {
    sourceTracksRemainImmutable: true;
    promotedProgramRemainsCandidateTruth: true;
    outputIsUnapprovedDeliveryArtifact: true;
    proofListenRequiredBeforeOutputPacket: true;
    uploadNotStarted: true;
    publicationNotStarted: true;
  };
};

const SHA256 = /^[0-9a-f]{64}$/;
const SAFE_ID = /^[A-Za-z0-9_-]{8,160}$/;

export function buildEpisodeProgramDeliveryTargetLocator(input: {
  episodeProductionId: string;
  candidateSha256: string;
  profileId: AudioDeliveryProfileId;
}) {
  const episodeProductionId = requiredId(input.episodeProductionId, "episodeProductionId");
  if (!SHA256.test(input.candidateSha256)) throw new Error("candidateSha256 is invalid.");
  audioDeliveryProfile(input.profileId);
  return `media-vault/episode-delivery/${episodeProductionId}/${input.candidateSha256}/${input.profileId}/delivery-v1.m4a`;
}

export function newEpisodeProgramDeliveryJob(input: Omit<EpisodeProgramDeliveryJob, "kind" | "version">): EpisodeProgramDeliveryJob {
  return parseEpisodeProgramDeliveryJob({ ...input, kind: EPISODE_PROGRAM_DELIVERY_JOB_KIND, version: EPISODE_PROGRAM_DELIVERY_CONTRACT_VERSION });
}

export function parseEpisodeProgramDeliveryJob(value: unknown, expectedJobId?: string): EpisodeProgramDeliveryJob {
  const row = record(value);
  const source = parseCandidate(row.source);
  const profileId = parseProfileId(row.profileId);
  const profile = audioDeliveryProfile(profileId);
  const target = record(row.target);
  const jobId = requiredId(row.jobId, "jobId");
  const provider = target.provider === "local" || target.provider === "gcs" ? target.provider : invalid("target.provider");
  const expectedLocator = buildEpisodeProgramDeliveryTargetLocator({ episodeProductionId: source.episodeProductionId, candidateSha256: source.sha256, profileId });
  if (
    row.kind !== EPISODE_PROGRAM_DELIVERY_JOB_KIND || row.version !== EPISODE_PROGRAM_DELIVERY_CONTRACT_VERSION
    || (expectedJobId && expectedJobId !== jobId) || provider !== source.provider
    || target.locator !== expectedLocator || target.contentType !== profile.contentType
    || target.codec !== profile.codec || target.codecProfile !== profile.codecProfile
    || target.sampleRateHz !== profile.sampleRateHz || target.channels !== profile.channels
    || target.bitrateBps !== profile.bitrateBps || target.fastStartRequired !== true
    || target.variantKind !== "episode-program-delivery-artifact" || source.contentType !== "audio/wav"
  ) throw new Error("Episode program delivery job contract or target authority is invalid.");
  return {
    kind: EPISODE_PROGRAM_DELIVERY_JOB_KIND,
    version: EPISODE_PROGRAM_DELIVERY_CONTRACT_VERSION,
    jobId,
    projectId: requiredId(row.projectId, "projectId"),
    requestedByEmail: requiredText(row.requestedByEmail, "requestedByEmail").toLowerCase(),
    queuedAt: requiredIso(row.queuedAt, "queuedAt"),
    source,
    masteryProfileId: parseMasteryProfileId(row.masteryProfileId),
    profileId,
    target: {
      provider,
      locator: expectedLocator,
      contentType: "audio/mp4",
      codec: "aac",
      codecProfile: "LC",
      sampleRateHz: 48_000,
      channels: 2,
      bitrateBps: 128_000,
      fastStartRequired: true,
      variantKind: "episode-program-delivery-artifact",
    },
  };
}

export function parseEpisodeProgramDeliveryResult(value: unknown, expectedJob?: EpisodeProgramDeliveryJob | unknown): EpisodeProgramDeliveryResult {
  const row = record(value);
  const job = expectedJob ? parseEpisodeProgramDeliveryJob(expectedJob) : null;
  const source = parseCandidate(row.source);
  const output = record(row.output);
  const worker = record(row.worker);
  const boundaries = record(row.boundaries);
  const profileId = parseProfileId(record(row.profile).id);
  const masteryProfileId = parseMasteryProfileId(row.masteryProfileId);
  const profile = audioDeliveryProfile(profileId);
  const provider = output.provider === "local" || output.provider === "gcs" ? output.provider : invalid("output.provider");
  const sha256 = requiredText(output.sha256, "output.sha256");
  const generation = requiredText(output.generation, "output.generation");
  const sizeBytes = positiveInteger(output.sizeBytes, "output.sizeBytes");
  const locator = requiredText(output.locator, "output.locator");
  const measurement = parseAudioMasteryMeasurement(output.verificationMeasurement);
  const verification = parseAssessment(output.verification);
  const expectedVerification = assessAudioMastery(measurement, masteryProfileId);
  const jobId = requiredId(row.jobId, "jobId");
  if (
    row.kind !== EPISODE_PROGRAM_DELIVERY_RESULT_KIND || row.version !== EPISODE_PROGRAM_DELIVERY_CONTRACT_VERSION
    || (job && job.jobId !== jobId) || (job && canonical(job.source) !== canonical(source))
    || (job && job.profileId !== profileId) || (job && job.masteryProfileId !== masteryProfileId) || provider !== source.provider
    || !SHA256.test(sha256) || generation !== `sha256:${sha256}`
    || (job && locator !== job.target.locator) || output.contentType !== profile.contentType
    || output.codec !== profile.codec || output.codecProfile !== profile.codecProfile
    || output.container !== profile.container || output.sampleRateHz !== profile.sampleRateHz
    || output.channels !== profile.channels || finite(output.bitrateBps, "output.bitrateBps") < 96_000 || finite(output.bitrateBps, "output.bitrateBps") > 160_000
    || Math.abs(positive(output.durationSeconds, "output.durationSeconds") - source.durationSeconds) > 0.1 || output.fastStart !== true
    || output.completeDecode !== true || output.variantKind !== "episode-program-delivery-artifact"
    || measurement.source.sha256 !== sha256 || measurement.source.generation !== generation
    || measurement.source.locator !== locator || measurement.source.sizeBytes !== sizeBytes
    || measurement.source.contentType !== profile.contentType
    || verification.passes !== true || canonical(verification) !== canonical(expectedVerification)
    || boundaries.sourceTracksRemainImmutable !== true
    || boundaries.promotedProgramRemainsCandidateTruth !== true
    || boundaries.outputIsUnapprovedDeliveryArtifact !== true
    || boundaries.proofListenRequiredBeforeOutputPacket !== true
    || boundaries.uploadNotStarted !== true || boundaries.publicationNotStarted !== true
  ) throw new Error("Episode program delivery result binding, verification, or safety boundary is invalid.");
  return {
    kind: EPISODE_PROGRAM_DELIVERY_RESULT_KIND,
    version: EPISODE_PROGRAM_DELIVERY_CONTRACT_VERSION,
    jobId,
    completedAt: requiredIso(row.completedAt, "completedAt"),
    source,
    masteryProfileId,
    profile,
    output: {
      provider, locator, generation, sha256, sizeBytes,
      contentType: "audio/mp4", codec: "aac", codecProfile: "LC",
      container: "mov,mp4,m4a,3gp,3g2,mj2", sampleRateHz: 48_000, channels: 2,
      bitrateBps: Number(output.bitrateBps), durationSeconds: Number(output.durationSeconds),
      fastStart: true, completeDecode: true, variantKind: "episode-program-delivery-artifact",
      verificationMeasurement: measurement, verification,
    },
    worker: {
      executionId: requiredId(worker.executionId, "worker.executionId"),
      buildId: requiredText(worker.buildId, "worker.buildId"),
      imageDigest: worker.imageDigest === null ? null : requiredText(worker.imageDigest, "worker.imageDigest"),
      attempt: positiveInteger(worker.attempt, "worker.attempt"),
      ffmpegVersion: requiredText(worker.ffmpegVersion, "worker.ffmpegVersion"),
    },
    boundaries: {
      sourceTracksRemainImmutable: true,
      promotedProgramRemainsCandidateTruth: true,
      outputIsUnapprovedDeliveryArtifact: true,
      proofListenRequiredBeforeOutputPacket: true,
      uploadNotStarted: true,
      publicationNotStarted: true,
    },
  };
}

function parseCandidate(value: unknown): EpisodeProgramDeliveryCandidateBinding {
  const row = record(value);
  const provider = row.provider === "local" || row.provider === "gcs" ? row.provider : invalid("source.provider");
  const sha256 = requiredSha(row.sha256, "source.sha256");
  const generation = requiredText(row.generation, "source.generation");
  if (provider === "local" && generation !== `sha256:${sha256}`) throw new Error("Local source generation is invalid.");
  return {
    assetId: requiredId(row.assetId, "source.assetId"), provider,
    locator: requiredText(row.locator, "source.locator"), generation, sha256,
    sizeBytes: positiveInteger(row.sizeBytes, "source.sizeBytes"),
    durationSeconds: positive(row.durationSeconds, "source.durationSeconds"),
    contentType: requiredText(row.contentType, "source.contentType"),
    episodeProductionId: requiredId(row.episodeProductionId, "source.episodeProductionId"),
    mixJobId: requiredId(row.mixJobId, "source.mixJobId"),
    mixReviewReceiptId: requiredId(row.mixReviewReceiptId, "source.mixReviewReceiptId"),
    promotionReceiptId: requiredId(row.promotionReceiptId, "source.promotionReceiptId"),
    programFingerprintSha256: requiredSha(row.programFingerprintSha256, "source.programFingerprintSha256"),
    proposalSha256: requiredSha(row.proposalSha256, "source.proposalSha256"),
    baselineSha256: requiredSha(row.baselineSha256, "source.baselineSha256"),
  };
}

function parseAssessment(value: unknown): AudioMasteryAssessment {
  const row = record(value);
  const integratedStatus = row.integratedStatus === "within-target" || row.integratedStatus === "too-quiet" || row.integratedStatus === "too-loud" ? row.integratedStatus : invalid("verification.integratedStatus");
  const truePeakStatus = row.truePeakStatus === "within-ceiling" || row.truePeakStatus === "over-ceiling" ? row.truePeakStatus : invalid("verification.truePeakStatus");
  const passes = integratedStatus === "within-target" && truePeakStatus === "within-ceiling";
  if (row.passes !== passes) throw new Error("Episode program delivery assessment is inconsistent.");
  return { profileId: parseMasteryProfileId(row.profileId), integratedStatus, truePeakStatus, integratedDeltaLu: finite(row.integratedDeltaLu, "verification.integratedDeltaLu"), passes };
}

function parseProfileId(value: unknown): AudioDeliveryProfileId { if (value === "apple-podcasts-aac-stereo-v1") return value; throw new Error("Episode program delivery profile is invalid."); }
function parseMasteryProfileId(value: unknown): AudioMasteryProfileId { if (value === "apple-podcasts-dialogue-v1" || value === "ebu-r128-broadcast-v1") return value; throw new Error("Episode program delivery mastering profile is invalid."); }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function canonical(value: unknown): string { return JSON.stringify(canonicalValue(value)); }
function canonicalValue(value: unknown): unknown { if (Array.isArray(value)) return value.map(canonicalValue); if (!value || typeof value !== "object") return value; return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonicalValue(entry)])); }
function requiredSha(value: unknown, field: string) { const result = requiredText(value, field); if (!SHA256.test(result)) throw new Error(`${field} is invalid.`); return result; }
function requiredId(value: unknown, field: string) { const result = requiredText(value, field); if (!SAFE_ID.test(result)) throw new Error(`${field} is invalid.`); return result; }
function requiredText(value: unknown, field: string) { const result = typeof value === "string" ? value.trim() : ""; if (!result) throw new Error(`${field} is required.`); return result; }
function requiredIso(value: unknown, field: string) { const result = requiredText(value, field); if (Number.isNaN(Date.parse(result))) throw new Error(`${field} must be an ISO date.`); return result; }
function positive(value: unknown, field: string) { const result = finite(value, field); if (result <= 0) throw new Error(`${field} must be positive.`); return result; }
function positiveInteger(value: unknown, field: string) { const result = positive(value, field); if (!Number.isSafeInteger(result)) throw new Error(`${field} must be an integer.`); return result; }
function finite(value: unknown, field: string) { const result = Number(value); if (!Number.isFinite(result)) throw new Error(`${field} must be finite.`); return result; }
function invalid(field: string): never { throw new Error(`${field} is invalid.`); }
