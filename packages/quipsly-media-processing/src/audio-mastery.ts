import { parseAudioSignalDiagnosis, type AudioSignalDiagnosis } from "./audio-signal-diagnosis.js";

export const AUDIO_MASTERY_CONTRACT_VERSION = 1 as const;
export const AUDIO_MASTERY_MEASUREMENT_KIND = "quipsly-audio-measurement-v1" as const;
export const AUDIO_MASTERY_PROPOSAL_KIND = "quipsly-audio-mastery-proposal-v1" as const;
export const AUDIO_MASTERY_JOB_KIND = "quipsly-audio-mastery-job-v1" as const;
export const AUDIO_MASTERY_RESULT_KIND = "quipsly-audio-mastery-result-v1" as const;

export type AudioMasteryProfileId =
  | "apple-podcasts-dialogue-v1"
  | "ebu-r128-broadcast-v1";

export type AudioMasteryProfile = {
  id: AudioMasteryProfileId;
  label: string;
  standard: string;
  integratedLufs: number;
  toleranceLu: number;
  maximumTruePeakDbtp: number;
  renderTruePeakDbtp: number;
  targetLoudnessRangeLu: number;
};

export const AUDIO_MASTERY_PROFILES: Readonly<Record<AudioMasteryProfileId, AudioMasteryProfile>> = {
  "apple-podcasts-dialogue-v1": Object.freeze({
    id: "apple-podcasts-dialogue-v1",
    label: "Apple Podcasts dialogue",
    standard: "ITU-R BS.1770-5 / Apple Podcasts",
    integratedLufs: -16,
    toleranceLu: 1,
    maximumTruePeakDbtp: -1,
    // Quipsly keeps an additional 0.5 dB of lossy-encode headroom.
    renderTruePeakDbtp: -1.5,
    targetLoudnessRangeLu: 11,
  }),
  "ebu-r128-broadcast-v1": Object.freeze({
    id: "ebu-r128-broadcast-v1",
    label: "EBU R 128 broadcast",
    standard: "EBU R 128 (2023)",
    integratedLufs: -23,
    toleranceLu: 0.5,
    maximumTruePeakDbtp: -1,
    renderTruePeakDbtp: -1.5,
    targetLoudnessRangeLu: 11,
  }),
};

export type AudioMasterySourceBinding = {
  assetId: string;
  provider: "local" | "gcs";
  locator: string;
  generation: string;
  sha256: string;
  sizeBytes: number;
  contentType: string;
};

export type AudioLoudnessPoint = {
  timeMs: number;
  momentaryLufs: number | null;
  shortTermLufs: number | null;
  integratedLufs: number | null;
  truePeakDbtp: number | null;
};

export type AudioMasteryMeasurement = {
  kind: typeof AUDIO_MASTERY_MEASUREMENT_KIND;
  version: typeof AUDIO_MASTERY_CONTRACT_VERSION;
  measurementId: string;
  measuredAt: string;
  source: AudioMasterySourceBinding;
  profileId: AudioMasteryProfileId;
  durationSeconds: number;
  channels: number;
  sampleRateHz: number;
  integratedLufs: number;
  truePeakDbtp: number;
  loudnessRangeLu: number;
  thresholdLufs: number;
  targetOffsetLu: number;
  seriesResolutionMs: 1_000;
  series: AudioLoudnessPoint[];
  analyzer: {
    name: "ffmpeg-loudnorm-ebur128";
    version: string;
    standard: "ITU-R BS.1770 / EBU R128";
    completeDecode: true;
  };
};

export type AudioMasteryAssessment = {
  profileId: AudioMasteryProfileId;
  integratedStatus: "within-target" | "too-quiet" | "too-loud";
  truePeakStatus: "within-ceiling" | "over-ceiling";
  integratedDeltaLu: number;
  passes: boolean;
};

export type AudioMasteryProposal = {
  kind: typeof AUDIO_MASTERY_PROPOSAL_KIND;
  version: typeof AUDIO_MASTERY_CONTRACT_VERSION;
  proposalId: string;
  createdAt: string;
  sourceMeasurementId: string;
  source: AudioMasterySourceBinding;
  profile: AudioMasteryProfile;
  assessment: AudioMasteryAssessment;
  action: "no-change" | "render-loudness-master";
  graph: Array<{
    id: string;
    operation: "measure-source" | "loudness-normalize" | "verify-output";
    automatic: boolean;
    changesSource: false;
    parameters: Record<string, string | number | boolean>;
  }>;
  boundaries: {
    originalRemainsSourceTruth: true;
    createsVersionedDerivativeOnly: true;
    excludesDenoiseEqDeessingAndEditorialCuts: true;
    promotionRequiresVerifiedOutput: true;
  };
};

export type AudioMasteryJob = {
  kind: typeof AUDIO_MASTERY_JOB_KIND;
  version: typeof AUDIO_MASTERY_CONTRACT_VERSION;
  jobId: string;
  projectId: string;
  requestedByEmail: string;
  queuedAt: string;
  source: AudioMasterySourceBinding;
  profileId: AudioMasteryProfileId;
  target: {
    provider: "local" | "gcs";
    locator: string;
    contentType: "audio/wav";
    codec: "pcm_s24le";
    sampleRateHz: 48_000;
    variantKind: "audio-master-preview";
  };
};

export type AudioMasteryResult = {
  kind: typeof AUDIO_MASTERY_RESULT_KIND;
  version: typeof AUDIO_MASTERY_CONTRACT_VERSION;
  jobId: string;
  completedAt: string;
  source: AudioMasterySourceBinding;
  sourceMeasurement: AudioMasteryMeasurement;
  signalDiagnosis: AudioSignalDiagnosis | null;
  proposal: AudioMasteryProposal;
  derivative: null | {
    provider: "local" | "gcs";
    locator: string;
    generation: string;
    sha256: string;
    sizeBytes: number;
    contentType: "audio/wav";
    codec: "pcm_s24le";
    sampleRateHz: 48_000;
    variantKind: "audio-master-preview";
    verificationMeasurement: AudioMasteryMeasurement;
    verification: AudioMasteryAssessment;
  };
  worker: {
    executionId: string;
    buildId: string;
    imageDigest: string | null;
    attempt: number;
  };
  boundaries: {
    originalRemainsSourceTruth: true;
    outputIsUnpromotedPreview: true;
    promotionRequiresExplicitApproval: true;
  };
};

const SHA256 = /^[0-9a-f]{64}$/;
const SAFE_ID = /^[A-Za-z0-9_-]{8,160}$/;

export function audioMasteryProfile(id: AudioMasteryProfileId) {
  return AUDIO_MASTERY_PROFILES[id];
}

export function assessAudioMastery(
  measurement: AudioMasteryMeasurement,
  profileId: AudioMasteryProfileId,
): AudioMasteryAssessment {
  const source = parseAudioMasteryMeasurement(measurement);
  if (source.profileId !== profileId) {
    throw new Error("Audio measurement was produced for a different mastering profile.");
  }
  const profile = audioMasteryProfile(profileId);
  const integratedDeltaLu = round(source.integratedLufs - profile.integratedLufs, 2);
  const integratedStatus = integratedDeltaLu < -profile.toleranceLu
    ? "too-quiet"
    : integratedDeltaLu > profile.toleranceLu
      ? "too-loud"
      : "within-target";
  const truePeakStatus = source.truePeakDbtp <= profile.maximumTruePeakDbtp
    ? "within-ceiling"
    : "over-ceiling";
  return {
    profileId,
    integratedStatus,
    truePeakStatus,
    integratedDeltaLu,
    passes: integratedStatus === "within-target" && truePeakStatus === "within-ceiling",
  };
}

export function newAudioMasteryProposal(input: {
  proposalId: string;
  createdAt: string;
  measurement: AudioMasteryMeasurement;
  profileId: AudioMasteryProfileId;
}): AudioMasteryProposal {
  requiredId(input.proposalId, "proposalId");
  requiredIsoDate(input.createdAt, "createdAt");
  const measurement = parseAudioMasteryMeasurement(input.measurement);
  const profile = audioMasteryProfile(input.profileId);
  const assessment = assessAudioMastery(measurement, input.profileId);
  const action = assessment.passes ? "no-change" : "render-loudness-master";
  return {
    kind: AUDIO_MASTERY_PROPOSAL_KIND,
    version: AUDIO_MASTERY_CONTRACT_VERSION,
    proposalId: input.proposalId,
    createdAt: input.createdAt,
    sourceMeasurementId: measurement.measurementId,
    source: measurement.source,
    profile,
    assessment,
    action,
    graph: [
      {
        id: "source-measurement",
        operation: "measure-source",
        automatic: true,
        changesSource: false,
        parameters: { measurementId: measurement.measurementId, completeDecode: true },
      },
      ...(action === "render-loudness-master" ? [{
        id: "loudness-master",
        operation: "loudness-normalize" as const,
        automatic: true,
        changesSource: false as const,
        parameters: {
          integratedLufs: profile.integratedLufs,
          truePeakDbtp: profile.renderTruePeakDbtp,
          loudnessRangeLu: profile.targetLoudnessRangeLu,
          mode: "double-pass-linear-preferred",
        },
      }] : []),
      {
        id: "output-verification",
        operation: "verify-output",
        automatic: true,
        changesSource: false,
        parameters: {
          profileId: profile.id,
          independentCompleteDecode: true,
        },
      },
    ],
    boundaries: {
      originalRemainsSourceTruth: true,
      createsVersionedDerivativeOnly: true,
      excludesDenoiseEqDeessingAndEditorialCuts: true,
      promotionRequiresVerifiedOutput: true,
    },
  };
}

export function buildAudioMasteryTargetLocator(input: {
  assetId: string;
  sourceSha256: string;
  profileId: AudioMasteryProfileId;
}) {
  const assetId = requiredId(input.assetId, "assetId");
  if (!SHA256.test(input.sourceSha256)) throw new Error("sourceSha256 is invalid.");
  audioMasteryProfile(input.profileId);
  return `media-vault/mastering/${assetId}/${input.sourceSha256}/${input.profileId}/preview-v1.wav`;
}

export function newAudioMasteryJob(input: Omit<AudioMasteryJob, "kind" | "version">): AudioMasteryJob {
  return parseAudioMasteryJob({
    ...input,
    kind: AUDIO_MASTERY_JOB_KIND,
    version: AUDIO_MASTERY_CONTRACT_VERSION,
  });
}

export function parseAudioMasteryJob(value: unknown, expectedJobId?: string): AudioMasteryJob {
  const row = record(value);
  const source = parseSource(row.source);
  const target = record(row.target);
  const targetProvider = target.provider === "local" || target.provider === "gcs"
    ? target.provider
    : invalid("target.provider");
  const jobId = requiredId(row.jobId, "jobId");
  const profileId = parseProfileId(row.profileId);
  const expectedLocator = buildAudioMasteryTargetLocator({
    assetId: source.assetId,
    sourceSha256: source.sha256,
    profileId,
  });
  if (
    row.kind !== AUDIO_MASTERY_JOB_KIND
    || row.version !== AUDIO_MASTERY_CONTRACT_VERSION
    || (expectedJobId && jobId !== expectedJobId)
    || targetProvider !== source.provider
    || target.locator !== expectedLocator
    || target.contentType !== "audio/wav"
    || target.codec !== "pcm_s24le"
    || target.sampleRateHz !== 48_000
    || target.variantKind !== "audio-master-preview"
  ) {
    throw new Error("Audio mastery job contract or target authority is invalid.");
  }
  return {
    kind: AUDIO_MASTERY_JOB_KIND,
    version: AUDIO_MASTERY_CONTRACT_VERSION,
    jobId,
    projectId: requiredId(row.projectId, "projectId"),
    requestedByEmail: requiredText(row.requestedByEmail, "requestedByEmail").toLowerCase(),
    queuedAt: requiredIsoDate(row.queuedAt, "queuedAt"),
    source,
    profileId,
    target: {
      provider: targetProvider,
      locator: requiredText(target.locator, "target.locator"),
      contentType: "audio/wav",
      codec: "pcm_s24le",
      sampleRateHz: 48_000,
      variantKind: "audio-master-preview",
    },
  };
}

export function parseAudioMasteryResult(value: unknown, expectedJob?: AudioMasteryJob | unknown): AudioMasteryResult {
  const row = record(value);
  const job = expectedJob ? parseAudioMasteryJob(expectedJob) : null;
  const jobId = requiredId(row.jobId, "jobId");
  const source = parseSource(row.source);
  const sourceMeasurement = parseAudioMasteryMeasurement(row.sourceMeasurement);
  const signalDiagnosis = row.signalDiagnosis == null ? null : parseAudioSignalDiagnosis(row.signalDiagnosis);
  const proposal = parseProposal(row.proposal);
  const expectedProposal = newAudioMasteryProposal({
    proposalId: proposal.proposalId,
    createdAt: proposal.createdAt,
    measurement: sourceMeasurement,
    profileId: proposal.profile.id,
  });
  const worker = record(row.worker);
  const boundaries = record(row.boundaries);
  if (
    row.kind !== AUDIO_MASTERY_RESULT_KIND
    || row.version !== AUDIO_MASTERY_CONTRACT_VERSION
    || (job && job.jobId !== jobId)
    || source.sha256 !== sourceMeasurement.source.sha256
    || source.generation !== sourceMeasurement.source.generation
    || proposal.sourceMeasurementId !== sourceMeasurement.measurementId
    || proposal.source.sha256 !== source.sha256
    || canonicalJson(proposal) !== canonicalJson(expectedProposal)
    || (job && (job.source.sha256 !== source.sha256 || job.source.generation !== source.generation))
    || (signalDiagnosis && (
      signalDiagnosis.source.sha256 !== source.sha256
      || signalDiagnosis.source.generation !== source.generation
      || signalDiagnosis.source.sizeBytes !== source.sizeBytes
      || Math.abs(signalDiagnosis.durationSeconds - sourceMeasurement.durationSeconds) > 0.05
      || signalDiagnosis.sampleRateHz !== sourceMeasurement.sampleRateHz
      || signalDiagnosis.channelCount !== sourceMeasurement.channels
    ))
    || boundaries.originalRemainsSourceTruth !== true
    || boundaries.outputIsUnpromotedPreview !== true
    || boundaries.promotionRequiresExplicitApproval !== true
  ) {
    throw new Error("Audio mastery result binding or safety boundary is invalid.");
  }
  let derivative: AudioMasteryResult["derivative"] = null;
  if (row.derivative !== null) {
    const output = record(row.derivative);
    const outputProvider = output.provider === "local" || output.provider === "gcs"
      ? output.provider
      : invalid("derivative.provider");
    const verificationMeasurement = parseAudioMasteryMeasurement(output.verificationMeasurement);
    const verification = parseAssessment(output.verification);
    const expectedVerification = assessAudioMastery(verificationMeasurement, proposal.profile.id);
    const sha256 = requiredText(output.sha256, "derivative.sha256");
    const generation = requiredText(output.generation, "derivative.generation");
    const locator = requiredText(output.locator, "derivative.locator");
    const sizeBytes = positiveInteger(output.sizeBytes, "derivative.sizeBytes");
    if (
      !SHA256.test(sha256)
      || proposal.action !== "render-loudness-master"
      || outputProvider !== source.provider
      || output.contentType !== "audio/wav"
      || output.codec !== "pcm_s24le"
      || output.sampleRateHz !== 48_000
      || output.variantKind !== "audio-master-preview"
      || verificationMeasurement.source.sha256 !== sha256
      || verificationMeasurement.source.provider !== outputProvider
      || verificationMeasurement.source.locator !== locator
      || verificationMeasurement.source.generation !== generation
      || verificationMeasurement.source.sizeBytes !== sizeBytes
      || verificationMeasurement.source.contentType !== "audio/wav"
      || verification.profileId !== proposal.profile.id
      || verification.passes !== true
      || canonicalJson(verification) !== canonicalJson(expectedVerification)
      || (job && locator !== job.target.locator)
    ) {
      throw new Error("Audio mastery derivative or independent verification is invalid.");
    }
    derivative = {
      provider: outputProvider,
      locator,
      generation,
      sha256,
      sizeBytes,
      contentType: "audio/wav",
      codec: "pcm_s24le",
      sampleRateHz: 48_000,
      variantKind: "audio-master-preview",
      verificationMeasurement,
      verification,
    };
  } else if (proposal.action !== "no-change") {
    throw new Error("Audio mastery render proposal lacks a verified derivative.");
  }
  return {
    kind: AUDIO_MASTERY_RESULT_KIND,
    version: AUDIO_MASTERY_CONTRACT_VERSION,
    jobId,
    completedAt: requiredIsoDate(row.completedAt, "completedAt"),
    source,
    sourceMeasurement,
    signalDiagnosis,
    proposal,
    derivative,
    worker: {
      executionId: requiredId(worker.executionId, "worker.executionId"),
      buildId: requiredText(worker.buildId, "worker.buildId"),
      imageDigest: worker.imageDigest === null ? null : requiredText(worker.imageDigest, "worker.imageDigest"),
      attempt: positiveInteger(worker.attempt, "worker.attempt"),
    },
    boundaries: {
      originalRemainsSourceTruth: true,
      outputIsUnpromotedPreview: true,
      promotionRequiresExplicitApproval: true,
    },
  };
}

export function parseAudioMasteryMeasurement(value: unknown): AudioMasteryMeasurement {
  const row = record(value);
  if (row.kind !== AUDIO_MASTERY_MEASUREMENT_KIND || row.version !== AUDIO_MASTERY_CONTRACT_VERSION) {
    throw new Error("Audio measurement contract kind or version is invalid.");
  }
  const source = parseSource(row.source);
  const series = Array.isArray(row.series) ? row.series.map(parsePoint) : [];
  const analyzer = record(row.analyzer);
  const measurement: AudioMasteryMeasurement = {
    kind: AUDIO_MASTERY_MEASUREMENT_KIND,
    version: AUDIO_MASTERY_CONTRACT_VERSION,
    measurementId: requiredId(row.measurementId, "measurementId"),
    measuredAt: requiredIsoDate(row.measuredAt, "measuredAt"),
    source,
    profileId: parseProfileId(row.profileId),
    durationSeconds: positive(row.durationSeconds, "durationSeconds"),
    channels: positiveInteger(row.channels, "channels"),
    sampleRateHz: positiveInteger(row.sampleRateHz, "sampleRateHz"),
    integratedLufs: finite(row.integratedLufs, "integratedLufs"),
    truePeakDbtp: finite(row.truePeakDbtp, "truePeakDbtp"),
    loudnessRangeLu: nonNegative(row.loudnessRangeLu, "loudnessRangeLu"),
    thresholdLufs: finite(row.thresholdLufs, "thresholdLufs"),
    targetOffsetLu: finite(row.targetOffsetLu, "targetOffsetLu"),
    seriesResolutionMs: row.seriesResolutionMs === 1_000 ? 1_000 : invalid("seriesResolutionMs"),
    series,
    analyzer: {
      name: analyzer.name === "ffmpeg-loudnorm-ebur128" ? analyzer.name : invalid("analyzer.name"),
      version: requiredText(analyzer.version, "analyzer.version"),
      standard: analyzer.standard === "ITU-R BS.1770 / EBU R128" ? analyzer.standard : invalid("analyzer.standard"),
      completeDecode: analyzer.completeDecode === true ? true : invalid("analyzer.completeDecode"),
    },
  };
  let previousTime = -1;
  for (const point of measurement.series) {
    if (point.timeMs <= previousTime || point.timeMs > Math.ceil(measurement.durationSeconds * 1_000) + 1_000) {
      throw new Error("Audio measurement series is not monotonic or exceeds the source duration.");
    }
    previousTime = point.timeMs;
  }
  return measurement;
}

function parseSource(value: unknown): AudioMasterySourceBinding {
  const row = record(value);
  const provider = row.provider === "local" || row.provider === "gcs" ? row.provider : invalid("source.provider");
  const sha256 = requiredText(row.sha256, "source.sha256");
  if (!SHA256.test(sha256)) throw new Error("source.sha256 is invalid.");
  return {
    assetId: requiredId(row.assetId, "source.assetId"),
    provider,
    locator: requiredText(row.locator, "source.locator"),
    generation: requiredText(row.generation, "source.generation"),
    sha256,
    sizeBytes: positiveInteger(row.sizeBytes, "source.sizeBytes"),
    contentType: requiredText(row.contentType, "source.contentType"),
  };
}

function parsePoint(value: unknown): AudioLoudnessPoint {
  const row = record(value);
  return {
    timeMs: nonNegativeInteger(row.timeMs, "series.timeMs"),
    momentaryLufs: finiteOrNull(row.momentaryLufs, "series.momentaryLufs"),
    shortTermLufs: finiteOrNull(row.shortTermLufs, "series.shortTermLufs"),
    integratedLufs: finiteOrNull(row.integratedLufs, "series.integratedLufs"),
    truePeakDbtp: finiteOrNull(row.truePeakDbtp, "series.truePeakDbtp"),
  };
}

function parseProposal(value: unknown): AudioMasteryProposal {
  const row = record(value);
  const source = parseSource(row.source);
  const profile = record(row.profile);
  const boundaries = record(row.boundaries);
  const graph = Array.isArray(row.graph) ? row.graph.map((value) => {
    const step = record(value);
    const operation: AudioMasteryProposal["graph"][number]["operation"] = step.operation === "measure-source" || step.operation === "loudness-normalize" || step.operation === "verify-output"
      ? step.operation
      : invalid("proposal.graph.operation");
    return {
      id: requiredText(step.id, "proposal.graph.id"),
      operation,
      automatic: step.automatic === true,
      changesSource: step.changesSource === false ? false as const : invalid("proposal.graph.changesSource"),
      parameters: record(step.parameters) as Record<string, string | number | boolean>,
    };
  }) : [];
  const proposal: AudioMasteryProposal = {
    kind: row.kind === AUDIO_MASTERY_PROPOSAL_KIND ? row.kind : invalid("proposal.kind"),
    version: row.version === AUDIO_MASTERY_CONTRACT_VERSION ? row.version : invalid("proposal.version"),
    proposalId: requiredId(row.proposalId, "proposal.proposalId"),
    createdAt: requiredIsoDate(row.createdAt, "proposal.createdAt"),
    sourceMeasurementId: requiredId(row.sourceMeasurementId, "proposal.sourceMeasurementId"),
    source,
    profile: audioMasteryProfile(parseProfileId(profile.id)),
    assessment: parseAssessment(row.assessment),
    action: row.action === "no-change" || row.action === "render-loudness-master" ? row.action : invalid("proposal.action"),
    graph,
    boundaries: {
      originalRemainsSourceTruth: boundaries.originalRemainsSourceTruth === true ? true : invalid("proposal.boundaries.originalRemainsSourceTruth"),
      createsVersionedDerivativeOnly: boundaries.createsVersionedDerivativeOnly === true ? true : invalid("proposal.boundaries.createsVersionedDerivativeOnly"),
      excludesDenoiseEqDeessingAndEditorialCuts: boundaries.excludesDenoiseEqDeessingAndEditorialCuts === true ? true : invalid("proposal.boundaries.excludesDenoiseEqDeessingAndEditorialCuts"),
      promotionRequiresVerifiedOutput: boundaries.promotionRequiresVerifiedOutput === true ? true : invalid("proposal.boundaries.promotionRequiresVerifiedOutput"),
    },
  };
  if (proposal.assessment.profileId !== proposal.profile.id) throw new Error("Proposal assessment profile is invalid.");
  return proposal;
}

function parseAssessment(value: unknown): AudioMasteryAssessment {
  const row = record(value);
  const integratedStatus = row.integratedStatus === "within-target" || row.integratedStatus === "too-quiet" || row.integratedStatus === "too-loud"
    ? row.integratedStatus
    : invalid("assessment.integratedStatus");
  const truePeakStatus = row.truePeakStatus === "within-ceiling" || row.truePeakStatus === "over-ceiling"
    ? row.truePeakStatus
    : invalid("assessment.truePeakStatus");
  const passes = integratedStatus === "within-target" && truePeakStatus === "within-ceiling";
  if (row.passes !== passes) throw new Error("Assessment pass state is inconsistent.");
  return {
    profileId: parseProfileId(row.profileId),
    integratedStatus,
    truePeakStatus,
    integratedDeltaLu: finite(row.integratedDeltaLu, "assessment.integratedDeltaLu"),
    passes,
  };
}

function parseProfileId(value: unknown): AudioMasteryProfileId {
  if (value === "apple-podcasts-dialogue-v1" || value === "ebu-r128-broadcast-v1") return value;
  throw new Error("Audio mastery profile is invalid.");
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalValue(entry)]),
  );
}

function requiredId(value: unknown, field: string) {
  const result = requiredText(value, field);
  if (!SAFE_ID.test(result)) throw new Error(`${field} is invalid.`);
  return result;
}

function requiredText(value: unknown, field: string) {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result) throw new Error(`${field} is required.`);
  return result;
}

function requiredIsoDate(value: unknown, field: string) {
  const result = requiredText(value, field);
  if (Number.isNaN(Date.parse(result))) throw new Error(`${field} must be an ISO date.`);
  return result;
}

function finite(value: unknown, field: string) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${field} must be finite.`);
  return result;
}

function finiteOrNull(value: unknown, field: string) {
  return value === null ? null : finite(value, field);
}

function positive(value: unknown, field: string) {
  const result = finite(value, field);
  if (result <= 0) throw new Error(`${field} must be positive.`);
  return result;
}

function positiveInteger(value: unknown, field: string) {
  const result = positive(value, field);
  if (!Number.isSafeInteger(result)) throw new Error(`${field} must be an integer.`);
  return result;
}

function nonNegative(value: unknown, field: string) {
  const result = finite(value, field);
  if (result < 0) throw new Error(`${field} must be non-negative.`);
  return result;
}

function nonNegativeInteger(value: unknown, field: string) {
  const result = nonNegative(value, field);
  if (!Number.isSafeInteger(result)) throw new Error(`${field} must be an integer.`);
  return result;
}

function invalid(field: string): never {
  throw new Error(`${field} is invalid.`);
}

function round(value: number, digits: number) {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}
