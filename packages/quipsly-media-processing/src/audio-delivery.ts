import {
  assessAudioMastery,
  parseAudioMasteryMeasurement,
  type AudioMasteryAssessment,
  type AudioMasteryMeasurement,
  type AudioMasteryProfileId,
  type AudioMasterySourceBinding,
} from "./audio-mastery.js";

export const AUDIO_DELIVERY_CONTRACT_VERSION = 1 as const;
export const AUDIO_DELIVERY_JOB_KIND = "quipsly-audio-delivery-job-v1" as const;
export const AUDIO_DELIVERY_RESULT_KIND = "quipsly-audio-delivery-result-v1" as const;
export const AUDIO_DELIVERY_REVIEW_EVIDENCE_SCHEMA = "quipsly-audio-delivery-playback-review-v1" as const;

export type AudioDeliveryProfileId = "apple-podcasts-aac-stereo-v1";

export type AudioDeliveryProfile = {
  id: AudioDeliveryProfileId;
  label: string;
  container: "mov,mp4,m4a,3gp,3g2,mj2";
  codec: "aac";
  codecProfile: "LC";
  contentType: "audio/mp4";
  sampleRateHz: 48_000;
  channels: 2;
  bitrateBps: 128_000;
  fastStartRequired: true;
};

export const AUDIO_DELIVERY_PROFILES: Readonly<Record<AudioDeliveryProfileId, AudioDeliveryProfile>> = {
  "apple-podcasts-aac-stereo-v1": Object.freeze({
    id: "apple-podcasts-aac-stereo-v1",
    label: "Apple Podcasts AAC-LC stereo",
    container: "mov,mp4,m4a,3gp,3g2,mj2",
    codec: "aac",
    codecProfile: "LC",
    contentType: "audio/mp4",
    sampleRateHz: 48_000,
    channels: 2,
    bitrateBps: 128_000,
    fastStartRequired: true,
  }),
};

export type AudioDeliveryCandidateBinding = AudioMasterySourceBinding & {
  durationSeconds: number;
  masteryJobId: string;
  masterReviewReceiptId: string;
  promotionReceiptId: string;
};

export type AudioDeliveryJob = {
  kind: typeof AUDIO_DELIVERY_JOB_KIND;
  version: typeof AUDIO_DELIVERY_CONTRACT_VERSION;
  jobId: string;
  projectId: string;
  requestedByEmail: string;
  queuedAt: string;
  source: AudioDeliveryCandidateBinding;
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
    variantKind: "audio-delivery-artifact";
  };
};

export type AudioDeliveryResult = {
  kind: typeof AUDIO_DELIVERY_RESULT_KIND;
  version: typeof AUDIO_DELIVERY_CONTRACT_VERSION;
  jobId: string;
  completedAt: string;
  source: AudioDeliveryCandidateBinding;
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
    variantKind: "audio-delivery-artifact";
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
    originalRemainsSourceTruth: true;
    promotedMasterRemainsCandidateTruth: true;
    outputIsUnapprovedDeliveryArtifact: true;
    proofListenRequiredBeforeOutputPacket: true;
    uploadNotStarted: true;
    publicationNotStarted: true;
  };
};

export type AudioDeliveryPlaybackReviewEvidence = {
  schema: typeof AUDIO_DELIVERY_REVIEW_EVIDENCE_SCHEMA;
  listenedSecondBins: number[];
  completedAt: string;
};

const SHA256 = /^[0-9a-f]{64}$/;
const SAFE_ID = /^[A-Za-z0-9_-]{8,160}$/;

export function audioDeliveryProfile(id: AudioDeliveryProfileId) {
  return AUDIO_DELIVERY_PROFILES[id];
}

export function buildAudioDeliveryTargetLocator(input: {
  assetId: string;
  candidateSha256: string;
  profileId: AudioDeliveryProfileId;
}) {
  const assetId = requiredId(input.assetId, "assetId");
  if (!SHA256.test(input.candidateSha256)) throw new Error("candidateSha256 is invalid.");
  audioDeliveryProfile(input.profileId);
  return `media-vault/delivery/${assetId}/${input.candidateSha256}/${input.profileId}/delivery-v1.m4a`;
}

export function newAudioDeliveryJob(input: Omit<AudioDeliveryJob, "kind" | "version">): AudioDeliveryJob {
  return parseAudioDeliveryJob({ ...input, kind: AUDIO_DELIVERY_JOB_KIND, version: AUDIO_DELIVERY_CONTRACT_VERSION });
}

export function parseAudioDeliveryJob(value: unknown, expectedJobId?: string): AudioDeliveryJob {
  const row = record(value);
  const source = parseCandidate(row.source);
  const profileId = parseProfileId(row.profileId);
  const profile = audioDeliveryProfile(profileId);
  const target = record(row.target);
  const jobId = requiredId(row.jobId, "jobId");
  const provider = target.provider === "local" || target.provider === "gcs" ? target.provider : invalid("target.provider");
  const expectedLocator = buildAudioDeliveryTargetLocator({ assetId: source.assetId, candidateSha256: source.sha256, profileId });
  if (
    row.kind !== AUDIO_DELIVERY_JOB_KIND || row.version !== AUDIO_DELIVERY_CONTRACT_VERSION
    || (expectedJobId && expectedJobId !== jobId) || provider !== source.provider
    || target.locator !== expectedLocator || target.contentType !== profile.contentType
    || target.codec !== profile.codec || target.codecProfile !== profile.codecProfile
    || target.sampleRateHz !== profile.sampleRateHz || target.channels !== profile.channels
    || target.bitrateBps !== profile.bitrateBps || target.fastStartRequired !== true
    || target.variantKind !== "audio-delivery-artifact" || source.contentType !== "audio/wav"
  ) throw new Error("Audio delivery job contract or target authority is invalid.");
  return {
    kind: AUDIO_DELIVERY_JOB_KIND,
    version: AUDIO_DELIVERY_CONTRACT_VERSION,
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
      variantKind: "audio-delivery-artifact",
    },
  };
}

export function parseAudioDeliveryResult(value: unknown, expectedJob?: AudioDeliveryJob | unknown): AudioDeliveryResult {
  const row = record(value);
  const job = expectedJob ? parseAudioDeliveryJob(expectedJob) : null;
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
    row.kind !== AUDIO_DELIVERY_RESULT_KIND || row.version !== AUDIO_DELIVERY_CONTRACT_VERSION
    || (job && job.jobId !== jobId) || (job && canonical(job.source) !== canonical(source))
    || (job && job.profileId !== profileId) || (job && job.masteryProfileId !== masteryProfileId) || provider !== source.provider
    || !SHA256.test(sha256) || generation !== `sha256:${sha256}`
    || (job && locator !== job.target.locator) || output.contentType !== profile.contentType
    || output.codec !== profile.codec || output.codecProfile !== profile.codecProfile
    || output.container !== profile.container || output.sampleRateHz !== profile.sampleRateHz
    || output.channels !== profile.channels || finite(output.bitrateBps, "output.bitrateBps") < 96_000 || finite(output.bitrateBps, "output.bitrateBps") > 160_000
    || Math.abs(positive(output.durationSeconds, "output.durationSeconds") - source.durationSeconds) > 0.1 || output.fastStart !== true
    || output.completeDecode !== true || output.variantKind !== "audio-delivery-artifact"
    || measurement.source.sha256 !== sha256 || measurement.source.generation !== generation
    || measurement.source.locator !== locator || measurement.source.sizeBytes !== sizeBytes
    || measurement.source.contentType !== profile.contentType
    || verification.passes !== true || canonical(verification) !== canonical(expectedVerification)
    || boundaries.originalRemainsSourceTruth !== true
    || boundaries.promotedMasterRemainsCandidateTruth !== true
    || boundaries.outputIsUnapprovedDeliveryArtifact !== true
    || boundaries.proofListenRequiredBeforeOutputPacket !== true
    || boundaries.uploadNotStarted !== true || boundaries.publicationNotStarted !== true
  ) throw new Error("Audio delivery result binding, verification, or safety boundary is invalid.");
  return {
    kind: AUDIO_DELIVERY_RESULT_KIND,
    version: AUDIO_DELIVERY_CONTRACT_VERSION,
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
      fastStart: true, completeDecode: true, variantKind: "audio-delivery-artifact",
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
      originalRemainsSourceTruth: true, promotedMasterRemainsCandidateTruth: true,
      outputIsUnapprovedDeliveryArtifact: true, proofListenRequiredBeforeOutputPacket: true,
      uploadNotStarted: true, publicationNotStarted: true,
    },
  };
}

export function parseAudioDeliveryPlaybackReviewEvidence(value: unknown, durationSeconds?: number): AudioDeliveryPlaybackReviewEvidence {
  const row = record(value);
  if (row.schema !== AUDIO_DELIVERY_REVIEW_EVIDENCE_SCHEMA) throw new Error("Audio delivery review evidence schema is invalid.");
  const listenedSecondBins = uniqueBins(row.listenedSecondBins, "listenedSecondBins");
  if (durationSeconds !== undefined) {
    const maximumBin = Math.max(0, Math.ceil(positive(durationSeconds, "durationSeconds")) - 1);
    if (listenedSecondBins.length > 100_000 || listenedSecondBins.some((bin) => bin > maximumBin)) throw new Error("Audio delivery listenedSecondBins is invalid or unbounded.");
  }
  const completedAt = requiredIso(row.completedAt, "completedAt");
  const completedAtMs = Date.parse(completedAt);
  const now = Date.now();
  if (completedAtMs > now + 5 * 60_000 || completedAtMs < now - 24 * 60 * 60_000) throw new Error("Audio delivery playback evidence requires a recent completion time.");
  return { schema: AUDIO_DELIVERY_REVIEW_EVIDENCE_SCHEMA, listenedSecondBins, completedAt: new Date(completedAtMs).toISOString() };
}

export function audioDeliveryReviewCoverage(evidence: AudioDeliveryPlaybackReviewEvidence, durationSeconds: number) {
  const parsed = parseAudioDeliveryPlaybackReviewEvidence(evidence, durationSeconds);
  const duration = positive(durationSeconds, "durationSeconds");
  const finalBin = Math.max(0, Math.floor(duration - 0.001));
  const anchors = [...new Set([0, Math.floor(duration / 2), finalBin])];
  const requiredSecondBins = [...new Set(anchors.flatMap((anchor) => [anchor - 1, anchor, anchor + 1]
    .filter((bin) => bin >= 0 && bin <= finalBin)))].sort((a, b) => a - b);
  const missingSecondBins = requiredSecondBins.filter((bin) => !parsed.listenedSecondBins.includes(bin));
  return { requiredSecondBins, missingSecondBins, approvalReady: missingSecondBins.length === 0 };
}

function parseCandidate(value: unknown): AudioDeliveryCandidateBinding {
  const row = record(value);
  const provider = row.provider === "local" || row.provider === "gcs" ? row.provider : invalid("source.provider");
  const sha256 = requiredText(row.sha256, "source.sha256");
  if (!SHA256.test(sha256)) throw new Error("source.sha256 is invalid.");
  const generation = requiredText(row.generation, "source.generation");
  if (provider === "local" && generation !== `sha256:${sha256}`) throw new Error("Local source generation is invalid.");
  return {
    assetId: requiredId(row.assetId, "source.assetId"), provider,
    locator: requiredText(row.locator, "source.locator"), generation, sha256,
    sizeBytes: positiveInteger(row.sizeBytes, "source.sizeBytes"),
    durationSeconds: positive(row.durationSeconds, "source.durationSeconds"),
    contentType: requiredText(row.contentType, "source.contentType"),
    masteryJobId: requiredId(row.masteryJobId, "source.masteryJobId"),
    masterReviewReceiptId: requiredId(row.masterReviewReceiptId, "source.masterReviewReceiptId"),
    promotionReceiptId: requiredId(row.promotionReceiptId, "source.promotionReceiptId"),
  };
}

function parseAssessment(value: unknown): AudioMasteryAssessment {
  const row = record(value);
  const integratedStatus = row.integratedStatus === "within-target" || row.integratedStatus === "too-quiet" || row.integratedStatus === "too-loud" ? row.integratedStatus : invalid("verification.integratedStatus");
  const truePeakStatus = row.truePeakStatus === "within-ceiling" || row.truePeakStatus === "over-ceiling" ? row.truePeakStatus : invalid("verification.truePeakStatus");
  const passes = integratedStatus === "within-target" && truePeakStatus === "within-ceiling";
  if (row.passes !== passes) throw new Error("Audio delivery assessment is inconsistent.");
  return { profileId: parseMasteryProfileId(row.profileId), integratedStatus, truePeakStatus, integratedDeltaLu: finite(row.integratedDeltaLu, "verification.integratedDeltaLu"), passes };
}

function parseProfileId(value: unknown): AudioDeliveryProfileId {
  if (value === "apple-podcasts-aac-stereo-v1") return value;
  throw new Error("Audio delivery profile is invalid.");
}

function parseMasteryProfileId(value: unknown): AudioMasteryProfileId {
  if (value === "apple-podcasts-dialogue-v1" || value === "ebu-r128-broadcast-v1") return value;
  throw new Error("Audio delivery mastering profile is invalid.");
}

function uniqueBins(value: unknown, field: string) {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array.`);
  const bins = value.map((entry) => nonNegativeInteger(entry, field));
  if (new Set(bins).size !== bins.length) throw new Error(`${field} must not contain duplicates.`);
  return bins.sort((a, b) => a - b);
}

function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function canonical(value: unknown): string { return JSON.stringify(canonicalValue(value)); }
function canonicalValue(value: unknown): unknown { if (Array.isArray(value)) return value.map(canonicalValue); if (!value || typeof value !== "object") return value; return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonicalValue(entry)])); }
function requiredId(value: unknown, field: string) { const result = requiredText(value, field); if (!SAFE_ID.test(result)) throw new Error(`${field} is invalid.`); return result; }
function requiredText(value: unknown, field: string) { const result = typeof value === "string" ? value.trim() : ""; if (!result) throw new Error(`${field} is required.`); return result; }
function requiredIso(value: unknown, field: string) { const result = requiredText(value, field); if (Number.isNaN(Date.parse(result))) throw new Error(`${field} must be an ISO date.`); return result; }
function positive(value: unknown, field: string) { const result = finite(value, field); if (result <= 0) throw new Error(`${field} must be positive.`); return result; }
function positiveInteger(value: unknown, field: string) { const result = positive(value, field); if (!Number.isSafeInteger(result)) throw new Error(`${field} must be an integer.`); return result; }
function nonNegativeInteger(value: unknown, field: string) { const result = finite(value, field); if (!Number.isSafeInteger(result) || result < 0) throw new Error(`${field} must be a non-negative integer.`); return result; }
function finite(value: unknown, field: string) { const result = Number(value); if (!Number.isFinite(result)) throw new Error(`${field} must be finite.`); return result; }
function invalid(field: string): never { throw new Error(`${field} is invalid.`); }
