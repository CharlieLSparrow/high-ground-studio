import type { AudioMasteryMeasurement, AudioMasterySourceBinding } from "./audio-mastery.js";
import { parseAudioMasteryMeasurement } from "./audio-mastery.js";
import type { AudioSignalDiagnosis } from "./audio-signal-diagnosis.js";
import { parseAudioSignalDiagnosis } from "./audio-signal-diagnosis.js";

export const AUDIO_TREATMENT_VERSION = 1 as const;
export const AUDIO_TREATMENT_JOB_KIND = "quipsly-audio-treatment-job-v1" as const;
export const AUDIO_TREATMENT_PROPOSAL_KIND = "quipsly-audio-treatment-proposal-v1" as const;
export const AUDIO_TREATMENT_RESULT_KIND = "quipsly-audio-treatment-result-v1" as const;

export type AudioTreatmentProfileId = "dc-rumble-correction-v1";

export type AudioTreatmentJob = {
  kind: typeof AUDIO_TREATMENT_JOB_KIND;
  version: typeof AUDIO_TREATMENT_VERSION;
  jobId: string;
  projectId: string;
  requestedByEmail: string;
  queuedAt: string;
  source: AudioMasterySourceBinding;
  triggerDiagnosisId: string;
  profileId: AudioTreatmentProfileId;
  target: {
    provider: "local" | "gcs";
    locator: string;
    contentType: "audio/wav";
    codec: "pcm_s24le";
    sampleRateHz: 48_000;
    variantKind: "audio-treatment-preview";
  };
};

export type AudioTreatmentProposal = {
  kind: typeof AUDIO_TREATMENT_PROPOSAL_KIND;
  version: typeof AUDIO_TREATMENT_VERSION;
  proposalId: string;
  createdAt: string;
  profileId: AudioTreatmentProfileId;
  source: AudioMasterySourceBinding;
  sourceDiagnosisId: string;
  trigger: {
    kind: "dc-offset";
    maximumAbsoluteDcOffset: number;
    thresholdAmplitude: 0.01;
    affectedChannels: number[];
  };
  graph: Array<{
    id: "diagnose-source" | "dc-rumble-filter" | "measure-output" | "diagnose-output" | "audition-output";
    operation: "diagnose" | "highpass" | "measure" | "audition";
    automatic: boolean;
    changesSource: false;
    parameters: Record<string, string | number | boolean>;
  }>;
  boundaries: {
    originalRemainsSourceTruth: true;
    createsVersionedExperimentOnly: true;
    excludesNoiseSuppressionCompressionDeessingAndEditorialCuts: true;
    experimentRequiresIndependentVerification: true;
    promotionRequiresExplicitApproval: true;
  };
};

export type AudioTreatmentResult = {
  kind: typeof AUDIO_TREATMENT_RESULT_KIND;
  version: typeof AUDIO_TREATMENT_VERSION;
  jobId: string;
  completedAt: string;
  source: AudioMasterySourceBinding;
  sourceMeasurement: AudioMasteryMeasurement;
  sourceDiagnosis: AudioSignalDiagnosis;
  proposal: AudioTreatmentProposal;
  derivative: {
    provider: "local" | "gcs";
    locator: string;
    generation: string;
    sha256: string;
    sizeBytes: number;
    contentType: "audio/wav";
    codec: "pcm_s24le";
    sampleRateHz: 48_000;
    variantKind: "audio-treatment-preview";
    measurement: AudioMasteryMeasurement;
    diagnosis: AudioSignalDiagnosis;
  };
  verification: {
    maximumAbsoluteDcBefore: number;
    maximumAbsoluteDcAfter: number;
    requiredMaximumAbsoluteDcAfter: 0.005;
    requiredRelativeReduction: 0.75;
    durationDeltaSeconds: number;
    sourceBytesPreserved: true;
    completeOutputDecode: true;
    passes: true;
  };
  worker: {
    executionId: string;
    buildId: string;
    imageDigest: string | null;
    attempt: number;
  };
  boundaries: {
    originalRemainsSourceTruth: true;
    outputIsUnpromotedExperiment: true;
    outputIsNotAMasteredDeliveryFile: true;
    promotionRequiresExplicitApproval: true;
  };
};

const SAFE_ID = /^[A-Za-z0-9_-]{8,160}$/;
const SHA256 = /^[0-9a-f]{64}$/;

export function buildAudioTreatmentTargetLocator(input: {
  assetId: string;
  sourceSha256: string;
  profileId: AudioTreatmentProfileId;
}) {
  const assetId = id(input.assetId, "assetId");
  if (!SHA256.test(input.sourceSha256)) throw new Error("Audio treatment source SHA-256 is invalid.");
  profile(input.profileId);
  return `media-vault/treatments/${assetId}/${input.sourceSha256}/${input.profileId}/preview-v1.wav`;
}

export function newAudioTreatmentJob(input: Omit<AudioTreatmentJob, "kind" | "version">) {
  return parseAudioTreatmentJob({ ...input, kind: AUDIO_TREATMENT_JOB_KIND, version: AUDIO_TREATMENT_VERSION });
}

export function parseAudioTreatmentJob(value: unknown, expectedJobId?: string): AudioTreatmentJob {
  const row = record(value);
  const source = sourceBinding(row.source);
  const target = record(row.target);
  const jobId = id(row.jobId, "jobId");
  const profileId = profile(row.profileId);
  const expectedLocator = buildAudioTreatmentTargetLocator({ assetId: source.assetId, sourceSha256: source.sha256, profileId });
  const provider = target.provider === "local" || target.provider === "gcs" ? target.provider : invalid("target.provider");
  if (
    row.kind !== AUDIO_TREATMENT_JOB_KIND || row.version !== AUDIO_TREATMENT_VERSION
    || (expectedJobId && expectedJobId !== jobId) || provider !== source.provider
    || target.locator !== expectedLocator || target.contentType !== "audio/wav"
    || target.codec !== "pcm_s24le" || target.sampleRateHz !== 48_000
    || target.variantKind !== "audio-treatment-preview"
  ) throw new Error("Audio treatment job contract or target authority is invalid.");
  return {
    kind: AUDIO_TREATMENT_JOB_KIND,
    version: AUDIO_TREATMENT_VERSION,
    jobId,
    projectId: id(row.projectId, "projectId"),
    requestedByEmail: text(row.requestedByEmail, "requestedByEmail").toLowerCase(),
    queuedAt: date(row.queuedAt, "queuedAt"),
    source,
    triggerDiagnosisId: id(row.triggerDiagnosisId, "triggerDiagnosisId"),
    profileId,
    target: { provider, locator: expectedLocator, contentType: "audio/wav", codec: "pcm_s24le", sampleRateHz: 48_000, variantKind: "audio-treatment-preview" },
  };
}

export function newAudioTreatmentProposal(input: {
  proposalId: string;
  createdAt: string;
  diagnosis: AudioSignalDiagnosis;
}): AudioTreatmentProposal {
  const diagnosis = parseAudioSignalDiagnosis(input.diagnosis);
  const affected = diagnosis.channels.filter((channel) => Math.abs(channel.dcOffset) >= 0.01);
  if (affected.length === 0) throw new Error("DC and rumble correction requires measured DC-offset evidence.");
  const maximumAbsoluteDcOffset = Math.max(...affected.map((channel) => Math.abs(channel.dcOffset)));
  return {
    kind: AUDIO_TREATMENT_PROPOSAL_KIND,
    version: AUDIO_TREATMENT_VERSION,
    proposalId: id(input.proposalId, "proposalId"),
    createdAt: date(input.createdAt, "createdAt"),
    profileId: "dc-rumble-correction-v1",
    source: diagnosis.source,
    sourceDiagnosisId: diagnosis.diagnosisId,
    trigger: { kind: "dc-offset", maximumAbsoluteDcOffset, thresholdAmplitude: 0.01, affectedChannels: affected.map((channel) => channel.channel as number) },
    graph: [
      { id: "diagnose-source", operation: "diagnose", automatic: true, changesSource: false, parameters: { completeDecode: true, diagnosisId: diagnosis.diagnosisId } },
      { id: "dc-rumble-filter", operation: "highpass", automatic: true, changesSource: false, parameters: { frequencyHz: 20, poles: 2, widthType: "q", width: 0.7071 } },
      { id: "measure-output", operation: "measure", automatic: true, changesSource: false, parameters: { completeDecode: true, preservesDeliveryClaim: false } },
      { id: "diagnose-output", operation: "diagnose", automatic: true, changesSource: false, parameters: { completeDecode: true, requiredMaximumAbsoluteDc: 0.005 } },
      { id: "audition-output", operation: "audition", automatic: false, changesSource: false, parameters: { loudnessMatchedDefault: true, explicitApprovalRequired: true } },
    ],
    boundaries: {
      originalRemainsSourceTruth: true,
      createsVersionedExperimentOnly: true,
      excludesNoiseSuppressionCompressionDeessingAndEditorialCuts: true,
      experimentRequiresIndependentVerification: true,
      promotionRequiresExplicitApproval: true,
    },
  };
}

export function parseAudioTreatmentResult(value: unknown, expectedJob?: AudioTreatmentJob | unknown): AudioTreatmentResult {
  const row = record(value);
  const job = expectedJob ? parseAudioTreatmentJob(expectedJob) : null;
  const source = sourceBinding(row.source);
  const sourceMeasurement = parseAudioMasteryMeasurement(row.sourceMeasurement);
  const sourceDiagnosis = parseAudioSignalDiagnosis(row.sourceDiagnosis);
  const proposal = proposalValue(row.proposal, sourceDiagnosis);
  const derivative = record(row.derivative);
  const derivativeSource = sourceBinding({
    assetId: source.assetId,
    provider: derivative.provider,
    locator: derivative.locator,
    generation: derivative.generation,
    sha256: derivative.sha256,
    sizeBytes: derivative.sizeBytes,
    contentType: derivative.contentType,
  });
  const measurement = parseAudioMasteryMeasurement(derivative.measurement);
  const diagnosis = parseAudioSignalDiagnosis(derivative.diagnosis);
  const verification = record(row.verification);
  const before = maximumAbsoluteDc(sourceDiagnosis);
  const after = maximumAbsoluteDc(diagnosis);
  const durationDeltaSeconds = round(Math.abs(sourceDiagnosis.durationSeconds - diagnosis.durationSeconds), 6);
  const relativeReduction = before > 0 ? 1 - after / before : 0;
  const passes = after <= 0.005 && relativeReduction >= 0.75 && durationDeltaSeconds <= 0.05
    && diagnosis.analyzer.completeDecode && diagnosis.channelCount === sourceDiagnosis.channelCount;
  if (
    row.kind !== AUDIO_TREATMENT_RESULT_KIND || row.version !== AUDIO_TREATMENT_VERSION
    || (job && row.jobId !== job.jobId) || !sameSource(source, sourceMeasurement.source)
    || !sameSource(source, sourceDiagnosis.source) || !sameSource(proposal.source, source)
    || (job && (
      !sameSource(job.source, source)
      || job.triggerDiagnosisId !== sourceDiagnosis.diagnosisId
      || !audioTreatmentDerivativeMatchesTarget(derivativeSource.provider, derivativeSource.locator, job.target.locator)
    ))
    || derivativeSource.provider !== source.provider || derivative.contentType !== "audio/wav"
    || derivative.codec !== "pcm_s24le" || derivative.sampleRateHz !== 48_000 || derivative.variantKind !== "audio-treatment-preview"
    || !sameSource(measurement.source, derivativeSource) || !sameSource(diagnosis.source, derivativeSource)
    || measurement.sampleRateHz !== 48_000 || diagnosis.sampleRateHz !== 48_000
    || measurement.channels !== diagnosis.channelCount || !passes
    || number(verification.maximumAbsoluteDcBefore, "verification.maximumAbsoluteDcBefore") !== before
    || number(verification.maximumAbsoluteDcAfter, "verification.maximumAbsoluteDcAfter") !== after
    || verification.requiredMaximumAbsoluteDcAfter !== 0.005 || verification.requiredRelativeReduction !== 0.75
    || number(verification.durationDeltaSeconds, "verification.durationDeltaSeconds") !== durationDeltaSeconds
    || verification.sourceBytesPreserved !== true || verification.completeOutputDecode !== true || verification.passes !== true
  ) throw new Error("Audio treatment result or independent verification is invalid.");
  const boundaries = record(row.boundaries);
  if (boundaries.originalRemainsSourceTruth !== true || boundaries.outputIsUnpromotedExperiment !== true || boundaries.outputIsNotAMasteredDeliveryFile !== true || boundaries.promotionRequiresExplicitApproval !== true) {
    throw new Error("Audio treatment result safety boundary is invalid.");
  }
  const worker = record(row.worker);
  return {
    kind: AUDIO_TREATMENT_RESULT_KIND,
    version: AUDIO_TREATMENT_VERSION,
    jobId: id(row.jobId, "jobId"),
    completedAt: date(row.completedAt, "completedAt"),
    source,
    sourceMeasurement,
    sourceDiagnosis,
    proposal,
    derivative: {
      provider: derivativeSource.provider,
      locator: derivativeSource.locator,
      generation: derivativeSource.generation,
      sha256: derivativeSource.sha256,
      sizeBytes: derivativeSource.sizeBytes,
      contentType: "audio/wav",
      codec: "pcm_s24le",
      sampleRateHz: 48_000,
      variantKind: "audio-treatment-preview",
      measurement,
      diagnosis,
    },
    verification: { maximumAbsoluteDcBefore: before, maximumAbsoluteDcAfter: after, requiredMaximumAbsoluteDcAfter: 0.005, requiredRelativeReduction: 0.75, durationDeltaSeconds, sourceBytesPreserved: true, completeOutputDecode: true, passes: true },
    worker: { executionId: id(worker.executionId, "worker.executionId"), buildId: text(worker.buildId, "worker.buildId"), imageDigest: worker.imageDigest === null ? null : text(worker.imageDigest, "worker.imageDigest"), attempt: integer(worker.attempt, "worker.attempt") },
    boundaries: { originalRemainsSourceTruth: true, outputIsUnpromotedExperiment: true, outputIsNotAMasteredDeliveryFile: true, promotionRequiresExplicitApproval: true },
  };
}

function proposalValue(value: unknown, diagnosis: AudioSignalDiagnosis) {
  const row = record(value);
  const expected = newAudioTreatmentProposal({ proposalId: id(row.proposalId, "proposal.proposalId"), createdAt: date(row.createdAt, "proposal.createdAt"), diagnosis });
  if (JSON.stringify(sortObject(row)) !== JSON.stringify(sortObject(expected))) throw new Error("Audio treatment proposal does not match its measured diagnosis.");
  return expected;
}

function maximumAbsoluteDc(diagnosis: AudioSignalDiagnosis) {
  return Math.max(...diagnosis.channels.map((channel) => Math.abs(channel.dcOffset)));
}

function sourceBinding(value: unknown): AudioMasterySourceBinding {
  const row = record(value);
  const sha256 = text(row.sha256, "source.sha256");
  if (!SHA256.test(sha256)) throw new Error("Audio treatment source SHA-256 is invalid.");
  return { assetId: id(row.assetId, "source.assetId"), provider: row.provider === "local" || row.provider === "gcs" ? row.provider : invalid("source.provider"), locator: text(row.locator, "source.locator"), generation: text(row.generation, "source.generation"), sha256, sizeBytes: integer(row.sizeBytes, "source.sizeBytes"), contentType: text(row.contentType, "source.contentType") };
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

function audioTreatmentDerivativeMatchesTarget(
  provider: "local" | "gcs",
  locator: string,
  targetLocator: string,
) {
  if (provider === "gcs") {
    const match = /^gcs:\/\/([a-z0-9][a-z0-9._-]{1,221}[a-z0-9])\/(media-vault\/.+)\?generation=([1-9][0-9]*)$/.exec(locator);
    return Boolean(
      match
      && match[2] === targetLocator
      && !match[2].split("/").some((part) => !part || part === "." || part === ".."),
    );
  }
  return locator === targetLocator;
}

function profile(value: unknown): AudioTreatmentProfileId {
  if (value !== "dc-rumble-correction-v1") throw new Error("Audio treatment profile is unsupported.");
  return value;
}

function record(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function text(value: unknown, field: string) { const result = typeof value === "string" ? value.trim() : ""; if (!result) throw new Error(`Audio treatment ${field} is required.`); return result; }
function id(value: unknown, field: string) { const result = text(value, field); if (!SAFE_ID.test(result)) throw new Error(`Audio treatment ${field} is invalid.`); return result; }
function date(value: unknown, field: string) { const result = text(value, field); if (!Number.isFinite(Date.parse(result))) throw new Error(`Audio treatment ${field} is invalid.`); return result; }
function number(value: unknown, field: string) { const result = Number(value); if (!Number.isFinite(result)) throw new Error(`Audio treatment ${field} must be finite.`); return result; }
function integer(value: unknown, field: string) { const result = number(value, field); if (!Number.isInteger(result) || result <= 0) throw new Error(`Audio treatment ${field} must be a positive integer.`); return result; }
function invalid(field: string): never { throw new Error(`Audio treatment ${field} is invalid.`); }
function round(value: number, digits: number) { const multiplier = 10 ** digits; return Math.round(value * multiplier) / multiplier; }
function sortObject(value: unknown): unknown { if (Array.isArray(value)) return value.map(sortObject); if (!value || typeof value !== "object") return value; return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, sortObject(entry)])); }
