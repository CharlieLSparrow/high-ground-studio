import { parseAudioMasteryMeasurement, type AudioMasteryMeasurement, type AudioMasterySourceBinding } from "./audio-mastery.js";
import { parseAudioSignalDiagnosis, type AudioSignalDiagnosis } from "./audio-signal-diagnosis.js";

export const DIALOGUE_REPAIR_CONTRACT_VERSION = 1 as const;
export const DIALOGUE_REPAIR_CANDIDATE_KIND = "quipsly-dialogue-repair-candidate-v1" as const;
export const DIALOGUE_REPAIR_REVIEW_KIND = "quipsly-dialogue-repair-review-v1" as const;
export const DIALOGUE_REPAIR_PROPOSAL_KIND = "quipsly-dialogue-repair-proposal-v1" as const;
export const DIALOGUE_REPAIR_JOB_KIND = "quipsly-dialogue-repair-job-v1" as const;
export const DIALOGUE_REPAIR_RESULT_KIND = "quipsly-dialogue-repair-result-v1" as const;
export const DIALOGUE_REPAIR_PROFILE_ID = "dialogue-declick-conservative-v1" as const;

export type DialogueRepairLabel = "mouth-click" | "plosive" | "sibilance" | "breath" | "clipping" | "noise-event";

export type DialogueRepairRange = {
  startSeconds: number;
  endSeconds: number;
  auditionPreRollSeconds: number;
  auditionPostRollSeconds: number;
  sourceDurationSeconds: number;
};

export type DialogueRepairCandidate = {
  kind: typeof DIALOGUE_REPAIR_CANDIDATE_KIND;
  version: typeof DIALOGUE_REPAIR_CONTRACT_VERSION;
  candidateId: string;
  createdAt: string;
  createdByEmail: string;
  label: DialogueRepairLabel;
  source: AudioMasterySourceBinding;
  range: DialogueRepairRange;
  origin:
    | { kind: "human-marked" }
    | {
        kind: "detector-suggestion";
        detectorId: string;
        detectorVersion: string;
        score: number;
        qualificationStatus: "unqualified";
        evidence: { impactRms: number; impactPeak: number; windowMilliseconds: 10 };
      }
    | {
        kind: "qualified-detector";
        detectorId: string;
        detectorVersion: string;
        corpusId: string;
        qualificationRunId: string;
        score: number;
      };
  context: {
    speakerId: string | null;
    speakerLabel: string | null;
    transcriptWordAnchors: Array<{
      wordId: string;
      startSeconds: number;
      endSeconds: number;
      text: string;
      speakerId: string | null;
      speakerLabel: string | null;
    }>;
  };
  boundaries: {
    candidateIsListeningTriageOnly: true;
    candidateDoesNotAuthorizeTreatment: true;
    originalRemainsSourceTruth: true;
  };
};

export type DialogueRepairReviewReceipt = {
  kind: typeof DIALOGUE_REPAIR_REVIEW_KIND;
  version: typeof DIALOGUE_REPAIR_CONTRACT_VERSION;
  receiptId: string;
  candidateId: string;
  occurredAt: string;
  actorEmail: string;
  decision: "confirmed" | "false-positive" | "needs-comparison";
  source: AudioMasterySourceBinding;
  candidateRange: DialogueRepairRange;
  evidence: {
    protectedPlaybackSourceId: string;
    contextStartSeconds: number;
    contextEndSeconds: number;
    listenedSecondBins: number[];
    clientTrackedPlaybackIsNotProofOfAudibility: true;
  };
  note: string | null;
  boundaries: {
    appendOnlyDecision: true;
    noMediaChanged: true;
    confirmedDecisionAuthorizesExperimentOnly: true;
    promotionRequiresSeparateReview: true;
  };
};

export type DialogueRepairProposal = {
  kind: typeof DIALOGUE_REPAIR_PROPOSAL_KIND;
  version: typeof DIALOGUE_REPAIR_CONTRACT_VERSION;
  proposalId: string;
  createdAt: string;
  profileId: typeof DIALOGUE_REPAIR_PROFILE_ID;
  source: AudioMasterySourceBinding;
  candidate: {
    candidateId: string;
    label: DialogueRepairLabel;
    range: DialogueRepairRange;
  };
  authorizingReviewReceiptId: string;
  treatmentRange: { startSeconds: number; endSeconds: number };
  filter: {
    name: "adeclick";
    window: 55;
    overlap: 75;
    autoregressionOrder: 2;
    threshold: 2;
    burst: 2;
    method: "add";
    treatmentPaddingSeconds: 0.02;
  };
  graph: Array<{
    id: "decode-source" | "range-declick" | "measure-output" | "diagnose-output" | "verify-output" | "audition-output";
    operation: "decode" | "adeclick" | "measure" | "diagnose" | "verify" | "audition";
    automatic: boolean;
    changesSource: false;
    parameters: Record<string, string | number | boolean>;
  }>;
  boundaries: {
    originalRemainsSourceTruth: true;
    createsVersionedExperimentOnly: true;
    treatmentIsRangeScoped: true;
    outputMustPreserveClockAndChannels: true;
    outputRequiresMatchedAudition: true;
    promotionRequiresSeparateApproval: true;
  };
};

export type DialogueRepairJob = {
  kind: typeof DIALOGUE_REPAIR_JOB_KIND;
  version: typeof DIALOGUE_REPAIR_CONTRACT_VERSION;
  jobId: string;
  projectId: string;
  requestedByEmail: string;
  queuedAt: string;
  source: AudioMasterySourceBinding;
  proposal: DialogueRepairProposal;
  target: {
    provider: "local" | "gcs";
    locator: string;
    contentType: "audio/wav";
    codec: "pcm_s24le";
    sampleRateHz: 48_000;
    variantKind: "dialogue-repair-preview";
  };
};

export type DialogueRepairResult = {
  kind: typeof DIALOGUE_REPAIR_RESULT_KIND;
  version: typeof DIALOGUE_REPAIR_CONTRACT_VERSION;
  jobId: string;
  completedAt: string;
  source: AudioMasterySourceBinding;
  proposal: DialogueRepairProposal;
  sourceMeasurement: AudioMasteryMeasurement;
  sourceDiagnosis: AudioSignalDiagnosis;
  derivative: {
    provider: "local" | "gcs";
    locator: string;
    generation: string;
    sha256: string;
    sizeBytes: number;
    contentType: "audio/wav";
    codec: "pcm_s24le";
    sampleRateHz: 48_000;
    variantKind: "dialogue-repair-preview";
    measurement: AudioMasteryMeasurement;
    diagnosis: AudioSignalDiagnosis;
  };
  verification: {
    sourceDurationSeconds: number;
    outputDurationSeconds: number;
    durationDeltaSeconds: number;
    maximumDurationDeltaSeconds: 0.05;
    sourceChannelCount: number;
    outputChannelCount: number;
    sourceBytesPreserved: true;
    completeOutputDecode: true;
    passes: true;
  };
  worker: { executionId: string; buildId: string; imageDigest: string | null; attempt: number };
  boundaries: {
    originalRemainsSourceTruth: true;
    outputIsUnpromotedExperiment: true;
    outputIsNotAMasteredDeliveryFile: true;
    matchedAuditionRequired: true;
    promotionRequiresSeparateApproval: true;
  };
};

const SAFE_ID = /^[A-Za-z0-9_-]{8,160}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const LABELS = new Set<DialogueRepairLabel>(["mouth-click", "plosive", "sibilance", "breath", "clipping", "noise-event"]);

export function newDialogueRepairCandidate(input: Omit<DialogueRepairCandidate, "kind" | "version" | "boundaries">) {
  return parseDialogueRepairCandidate({
    ...input,
    kind: DIALOGUE_REPAIR_CANDIDATE_KIND,
    version: DIALOGUE_REPAIR_CONTRACT_VERSION,
    boundaries: {
      candidateIsListeningTriageOnly: true,
      candidateDoesNotAuthorizeTreatment: true,
      originalRemainsSourceTruth: true,
    },
  });
}

export function parseDialogueRepairCandidate(value: unknown): DialogueRepairCandidate {
  const row = record(value);
  if (row.kind !== DIALOGUE_REPAIR_CANDIDATE_KIND || row.version !== DIALOGUE_REPAIR_CONTRACT_VERSION) {
    throw new Error("Dialogue repair candidate contract is invalid.");
  }
  const source = sourceBinding(row.source);
  const range = repairRange(row.range);
  const label = dialogueLabel(row.label);
  const origin = candidateOrigin(row.origin);
  const contextRow = record(row.context);
  const auditionStart = Math.max(0, range.startSeconds - range.auditionPreRollSeconds);
  const auditionEnd = Math.min(range.sourceDurationSeconds, range.endSeconds + range.auditionPostRollSeconds);
  const words = array(contextRow.transcriptWordAnchors, "context.transcriptWordAnchors").map((value, index) => {
    const word = record(value);
    const startSeconds = finiteSeconds(word.startSeconds, `word[${index}].startSeconds`);
    const endSeconds = finiteSeconds(word.endSeconds, `word[${index}].endSeconds`);
    if (endSeconds <= startSeconds || startSeconds >= auditionEnd || endSeconds <= auditionStart) {
      throw new Error("Dialogue repair transcript anchors must overlap the audition context.");
    }
    return {
      wordId: identifier(word.wordId, `word[${index}].wordId`),
      startSeconds,
      endSeconds,
      text: boundedText(word.text, `word[${index}].text`, 240),
      speakerId: nullableId(word.speakerId, `word[${index}].speakerId`),
      speakerLabel: nullableText(word.speakerLabel, `word[${index}].speakerLabel`, 160),
    };
  });
  if (words.length > 64 || words.some((word, index) => index > 0 && word.startSeconds < words[index - 1]!.startSeconds)) {
    throw new Error("Dialogue repair transcript anchors must be bounded and source-clock ordered.");
  }
  const boundaries = record(row.boundaries);
  if (boundaries.candidateIsListeningTriageOnly !== true || boundaries.candidateDoesNotAuthorizeTreatment !== true || boundaries.originalRemainsSourceTruth !== true) {
    throw new Error("Dialogue repair candidate safety boundary is invalid.");
  }
  return {
    kind: DIALOGUE_REPAIR_CANDIDATE_KIND,
    version: DIALOGUE_REPAIR_CONTRACT_VERSION,
    candidateId: identifier(row.candidateId, "candidateId"),
    createdAt: date(row.createdAt, "createdAt"),
    createdByEmail: email(row.createdByEmail, "createdByEmail"),
    label,
    source,
    range,
    origin,
    context: { speakerId: nullableId(contextRow.speakerId, "context.speakerId"), speakerLabel: nullableText(contextRow.speakerLabel, "context.speakerLabel", 160), transcriptWordAnchors: words },
    boundaries: { candidateIsListeningTriageOnly: true, candidateDoesNotAuthorizeTreatment: true, originalRemainsSourceTruth: true },
  };
}

export function newDialogueRepairReviewReceipt(input: {
  receiptId: string;
  occurredAt: string;
  actorEmail: string;
  decision: DialogueRepairReviewReceipt["decision"];
  candidate: DialogueRepairCandidate;
  evidence: DialogueRepairReviewReceipt["evidence"];
  note?: string | null;
}) {
  const candidate = parseDialogueRepairCandidate(input.candidate);
  return parseDialogueRepairReviewReceipt({
    kind: DIALOGUE_REPAIR_REVIEW_KIND,
    version: DIALOGUE_REPAIR_CONTRACT_VERSION,
    receiptId: input.receiptId,
    candidateId: candidate.candidateId,
    occurredAt: input.occurredAt,
    actorEmail: input.actorEmail,
    decision: input.decision,
    source: candidate.source,
    candidateRange: candidate.range,
    evidence: input.evidence,
    note: input.note ?? null,
    boundaries: {
      appendOnlyDecision: true,
      noMediaChanged: true,
      confirmedDecisionAuthorizesExperimentOnly: true,
      promotionRequiresSeparateReview: true,
    },
  }, candidate);
}

export function parseDialogueRepairReviewReceipt(value: unknown, expectedCandidate?: DialogueRepairCandidate | unknown): DialogueRepairReviewReceipt {
  const row = record(value);
  const candidate = expectedCandidate ? parseDialogueRepairCandidate(expectedCandidate) : null;
  const source = sourceBinding(row.source);
  const range = repairRange(row.candidateRange);
  const evidenceRow = record(row.evidence);
  const contextStartSeconds = finiteSeconds(evidenceRow.contextStartSeconds, "evidence.contextStartSeconds");
  const contextEndSeconds = finiteSeconds(evidenceRow.contextEndSeconds, "evidence.contextEndSeconds");
  const expectedStart = Math.max(0, range.startSeconds - range.auditionPreRollSeconds);
  const expectedEnd = Math.min(range.sourceDurationSeconds, range.endSeconds + range.auditionPostRollSeconds);
  const bins = array(evidenceRow.listenedSecondBins, "evidence.listenedSecondBins").map((value) => nonNegativeInteger(value, "evidence.listenedSecondBins"));
  const uniqueBins = [...new Set(bins)].sort((left, right) => left - right);
  const requiredBins = secondBins(expectedStart, expectedEnd);
  const decision = reviewDecision(row.decision);
  const boundaries = record(row.boundaries);
  if (
    row.kind !== DIALOGUE_REPAIR_REVIEW_KIND || row.version !== DIALOGUE_REPAIR_CONTRACT_VERSION
    || contextStartSeconds > expectedStart || contextEndSeconds < expectedEnd || contextEndSeconds > range.sourceDurationSeconds
    || bins.length !== uniqueBins.length || requiredBins.some((bin) => !uniqueBins.includes(bin))
    || evidenceRow.clientTrackedPlaybackIsNotProofOfAudibility !== true
    || boundaries.appendOnlyDecision !== true || boundaries.noMediaChanged !== true
    || boundaries.confirmedDecisionAuthorizesExperimentOnly !== true || boundaries.promotionRequiresSeparateReview !== true
  ) throw new Error("Dialogue repair review evidence or safety boundary is invalid.");
  if (candidate && (
    row.candidateId !== candidate.candidateId
    || !sameSource(source, candidate.source)
    || JSON.stringify(range) !== JSON.stringify(candidate.range)
  )) throw new Error("Dialogue repair review does not match the immutable candidate snapshot.");
  return {
    kind: DIALOGUE_REPAIR_REVIEW_KIND,
    version: DIALOGUE_REPAIR_CONTRACT_VERSION,
    receiptId: identifier(row.receiptId, "receiptId"),
    candidateId: identifier(row.candidateId, "candidateId"),
    occurredAt: date(row.occurredAt, "occurredAt"),
    actorEmail: email(row.actorEmail, "actorEmail"),
    decision,
    source,
    candidateRange: range,
    evidence: {
      protectedPlaybackSourceId: identifier(evidenceRow.protectedPlaybackSourceId, "evidence.protectedPlaybackSourceId"),
      contextStartSeconds,
      contextEndSeconds,
      listenedSecondBins: uniqueBins,
      clientTrackedPlaybackIsNotProofOfAudibility: true,
    },
    note: nullableText(row.note, "note", 1_000),
    boundaries: { appendOnlyDecision: true, noMediaChanged: true, confirmedDecisionAuthorizesExperimentOnly: true, promotionRequiresSeparateReview: true },
  };
}

export function newDialogueRepairProposal(input: {
  proposalId: string;
  createdAt: string;
  candidate: DialogueRepairCandidate;
  reviewReceipt: DialogueRepairReviewReceipt;
}) {
  const candidate = parseDialogueRepairCandidate(input.candidate);
  const review = parseDialogueRepairReviewReceipt(input.reviewReceipt, candidate);
  if (review.decision !== "confirmed") throw new Error("Only a confirmed dialogue event authorizes a repair experiment.");
  if (candidate.label !== "mouth-click") throw new Error("The conservative de-click profile is qualified only for confirmed mouth-click events.");
  const treatmentRange = {
    startSeconds: round(Math.max(0, candidate.range.startSeconds - 0.02), 6),
    endSeconds: round(Math.min(candidate.range.sourceDurationSeconds, candidate.range.endSeconds + 0.02), 6),
  };
  return parseDialogueRepairProposal({
    kind: DIALOGUE_REPAIR_PROPOSAL_KIND,
    version: DIALOGUE_REPAIR_CONTRACT_VERSION,
    proposalId: input.proposalId,
    createdAt: input.createdAt,
    profileId: DIALOGUE_REPAIR_PROFILE_ID,
    source: candidate.source,
    candidate: { candidateId: candidate.candidateId, label: candidate.label, range: candidate.range },
    authorizingReviewReceiptId: review.receiptId,
    treatmentRange,
    filter: { name: "adeclick", window: 55, overlap: 75, autoregressionOrder: 2, threshold: 2, burst: 2, method: "add", treatmentPaddingSeconds: 0.02 },
    graph: [
      { id: "decode-source", operation: "decode", automatic: true, changesSource: false, parameters: { completeDecode: true } },
      { id: "range-declick", operation: "adeclick", automatic: true, changesSource: false, parameters: { ...treatmentRange, window: 55, overlap: 75, autoregressionOrder: 2, threshold: 2, burst: 2, method: "add" } },
      { id: "measure-output", operation: "measure", automatic: true, changesSource: false, parameters: { completeDecode: true } },
      { id: "diagnose-output", operation: "diagnose", automatic: true, changesSource: false, parameters: { completeDecode: true } },
      { id: "verify-output", operation: "verify", automatic: true, changesSource: false, parameters: { maximumDurationDeltaSeconds: 0.05, preserveChannelCount: true } },
      { id: "audition-output", operation: "audition", automatic: false, changesSource: false, parameters: { loudnessMatchedDefault: true, separatePromotionApprovalRequired: true } },
    ],
    boundaries: {
      originalRemainsSourceTruth: true,
      createsVersionedExperimentOnly: true,
      treatmentIsRangeScoped: true,
      outputMustPreserveClockAndChannels: true,
      outputRequiresMatchedAudition: true,
      promotionRequiresSeparateApproval: true,
    },
  });
}

export function parseDialogueRepairProposal(value: unknown): DialogueRepairProposal {
  const row = record(value);
  if (row.kind !== DIALOGUE_REPAIR_PROPOSAL_KIND || row.version !== DIALOGUE_REPAIR_CONTRACT_VERSION || row.profileId !== DIALOGUE_REPAIR_PROFILE_ID) {
    throw new Error("Dialogue repair proposal contract is invalid.");
  }
  const source = sourceBinding(row.source);
  const candidateRow = record(row.candidate);
  const candidate = { candidateId: identifier(candidateRow.candidateId, "candidate.candidateId"), label: dialogueLabel(candidateRow.label), range: repairRange(candidateRow.range) };
  const treatmentRow = record(row.treatmentRange);
  const treatmentRange = { startSeconds: finiteSeconds(treatmentRow.startSeconds, "treatmentRange.startSeconds"), endSeconds: finiteSeconds(treatmentRow.endSeconds, "treatmentRange.endSeconds") };
  const expectedStart = round(Math.max(0, candidate.range.startSeconds - 0.02), 6);
  const expectedEnd = round(Math.min(candidate.range.sourceDurationSeconds, candidate.range.endSeconds + 0.02), 6);
  const filter = record(row.filter);
  const expectedFilter = { name: "adeclick", window: 55, overlap: 75, autoregressionOrder: 2, threshold: 2, burst: 2, method: "add", treatmentPaddingSeconds: 0.02 } as const;
  const graph = array(row.graph, "graph");
  const boundaries = record(row.boundaries);
  if (
    treatmentRange.startSeconds !== expectedStart || treatmentRange.endSeconds !== expectedEnd
    || !sameJson(filter, expectedFilter)
    || graph.length !== 6
    || boundaries.originalRemainsSourceTruth !== true || boundaries.createsVersionedExperimentOnly !== true
    || boundaries.treatmentIsRangeScoped !== true || boundaries.outputMustPreserveClockAndChannels !== true
    || boundaries.outputRequiresMatchedAudition !== true || boundaries.promotionRequiresSeparateApproval !== true
  ) throw new Error("Dialogue repair proposal graph or safety boundary is invalid.");
  const canonical = newDialogueRepairGraph(treatmentRange);
  if (!sameJson(graph, canonical)) throw new Error("Dialogue repair proposal graph is not the qualified conservative graph.");
  return {
    kind: DIALOGUE_REPAIR_PROPOSAL_KIND,
    version: DIALOGUE_REPAIR_CONTRACT_VERSION,
    proposalId: identifier(row.proposalId, "proposalId"),
    createdAt: date(row.createdAt, "createdAt"),
    profileId: DIALOGUE_REPAIR_PROFILE_ID,
    source,
    candidate,
    authorizingReviewReceiptId: identifier(row.authorizingReviewReceiptId, "authorizingReviewReceiptId"),
    treatmentRange,
    filter: expectedFilter,
    graph: canonical,
    boundaries: { originalRemainsSourceTruth: true, createsVersionedExperimentOnly: true, treatmentIsRangeScoped: true, outputMustPreserveClockAndChannels: true, outputRequiresMatchedAudition: true, promotionRequiresSeparateApproval: true },
  };
}

export function buildDialogueRepairTargetLocator(input: { assetId: string; sourceSha256: string; candidateId: string; range: DialogueRepairRange }) {
  const assetId = identifier(input.assetId, "assetId");
  const candidateId = identifier(input.candidateId, "candidateId");
  if (!SHA256.test(input.sourceSha256)) throw new Error("Dialogue repair source SHA-256 is invalid.");
  const range = repairRange(input.range);
  const startMicros = Math.round(range.startSeconds * 1_000_000);
  const endMicros = Math.round(range.endSeconds * 1_000_000);
  return `media-vault/treatments/${assetId}/${input.sourceSha256}/${DIALOGUE_REPAIR_PROFILE_ID}/${candidateId}-${startMicros}-${endMicros}/preview-v1.wav`;
}

export function buildDialogueRepairFilterGraph(proposal: DialogueRepairProposal | unknown) {
  const parsed = parseDialogueRepairProposal(proposal);
  return `adeclick=window=55:overlap=75:arorder=2:threshold=2:burst=2:method=add:enable='between(t,${decimal(parsed.treatmentRange.startSeconds)},${decimal(parsed.treatmentRange.endSeconds)})'`;
}

export function newDialogueRepairJob(input: Omit<DialogueRepairJob, "kind" | "version">) {
  return parseDialogueRepairJob({ ...input, kind: DIALOGUE_REPAIR_JOB_KIND, version: DIALOGUE_REPAIR_CONTRACT_VERSION });
}

export function parseDialogueRepairJob(value: unknown, expectedJobId?: string): DialogueRepairJob {
  const row = record(value);
  const jobId = identifier(row.jobId, "jobId");
  const source = sourceBinding(row.source);
  const proposal = parseDialogueRepairProposal(row.proposal);
  const target = record(row.target);
  const expectedLocator = buildDialogueRepairTargetLocator({ assetId: source.assetId, sourceSha256: source.sha256, candidateId: proposal.candidate.candidateId, range: proposal.candidate.range });
  const provider = target.provider === "local" || target.provider === "gcs" ? target.provider : invalid("target.provider");
  if (
    row.kind !== DIALOGUE_REPAIR_JOB_KIND || row.version !== DIALOGUE_REPAIR_CONTRACT_VERSION
    || (expectedJobId && jobId !== expectedJobId) || !sameSource(source, proposal.source)
    || provider !== source.provider || target.locator !== expectedLocator
    || target.contentType !== "audio/wav" || target.codec !== "pcm_s24le" || target.sampleRateHz !== 48_000
    || target.variantKind !== "dialogue-repair-preview"
  ) throw new Error("Dialogue repair job contract or target authority is invalid.");
  return {
    kind: DIALOGUE_REPAIR_JOB_KIND,
    version: DIALOGUE_REPAIR_CONTRACT_VERSION,
    jobId,
    projectId: identifier(row.projectId, "projectId"),
    requestedByEmail: email(row.requestedByEmail, "requestedByEmail"),
    queuedAt: date(row.queuedAt, "queuedAt"),
    source,
    proposal,
    target: { provider, locator: expectedLocator, contentType: "audio/wav", codec: "pcm_s24le", sampleRateHz: 48_000, variantKind: "dialogue-repair-preview" },
  };
}

export function parseDialogueRepairResult(value: unknown, expectedJob?: DialogueRepairJob | unknown): DialogueRepairResult {
  const row = record(value);
  const job = expectedJob ? parseDialogueRepairJob(expectedJob) : null;
  const source = sourceBinding(row.source);
  const proposal = parseDialogueRepairProposal(row.proposal);
  const sourceMeasurement = parseAudioMasteryMeasurement(row.sourceMeasurement);
  const sourceDiagnosis = parseAudioSignalDiagnosis(row.sourceDiagnosis);
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
  const outputMeasurement = parseAudioMasteryMeasurement(derivative.measurement);
  const outputDiagnosis = parseAudioSignalDiagnosis(derivative.diagnosis);
  const verification = record(row.verification);
  const sourceDurationSeconds = round(sourceMeasurement.durationSeconds, 6);
  const outputDurationSeconds = round(outputMeasurement.durationSeconds, 6);
  const durationDeltaSeconds = round(Math.abs(sourceDurationSeconds - outputDurationSeconds), 6);
  const passes = durationDeltaSeconds <= 0.05
    && sourceMeasurement.channels === outputMeasurement.channels
    && sourceDiagnosis.channelCount === outputDiagnosis.channelCount
    && outputMeasurement.analyzer.completeDecode && outputDiagnosis.analyzer.completeDecode;
  const boundaries = record(row.boundaries);
  if (
    row.kind !== DIALOGUE_REPAIR_RESULT_KIND || row.version !== DIALOGUE_REPAIR_CONTRACT_VERSION
    || (job && row.jobId !== job.jobId) || !sameSource(source, proposal.source)
    || !sameSource(source, sourceMeasurement.source) || !sameSource(source, sourceDiagnosis.source)
    || (job && (!sameSource(job.source, source) || !sameJson(job.proposal, proposal) || job.target.locator !== derivativeSource.locator))
    || derivativeSource.provider !== source.provider || derivative.contentType !== "audio/wav"
    || derivative.codec !== "pcm_s24le" || derivative.sampleRateHz !== 48_000 || derivative.variantKind !== "dialogue-repair-preview"
    || !sameSource(derivativeSource, outputMeasurement.source) || !sameSource(derivativeSource, outputDiagnosis.source)
    || outputMeasurement.sampleRateHz !== 48_000 || outputDiagnosis.sampleRateHz !== 48_000 || !passes
    || finiteSeconds(verification.sourceDurationSeconds, "verification.sourceDurationSeconds") !== sourceDurationSeconds
    || finiteSeconds(verification.outputDurationSeconds, "verification.outputDurationSeconds") !== outputDurationSeconds
    || finiteSeconds(verification.durationDeltaSeconds, "verification.durationDeltaSeconds") !== durationDeltaSeconds
    || verification.maximumDurationDeltaSeconds !== 0.05
    || positiveInteger(verification.sourceChannelCount, "verification.sourceChannelCount") !== sourceMeasurement.channels
    || positiveInteger(verification.outputChannelCount, "verification.outputChannelCount") !== outputMeasurement.channels
    || verification.sourceBytesPreserved !== true || verification.completeOutputDecode !== true || verification.passes !== true
    || boundaries.originalRemainsSourceTruth !== true || boundaries.outputIsUnpromotedExperiment !== true
    || boundaries.outputIsNotAMasteredDeliveryFile !== true || boundaries.matchedAuditionRequired !== true
    || boundaries.promotionRequiresSeparateApproval !== true
  ) throw new Error("Dialogue repair result or independent verification is invalid.");
  const worker = record(row.worker);
  return {
    kind: DIALOGUE_REPAIR_RESULT_KIND,
    version: DIALOGUE_REPAIR_CONTRACT_VERSION,
    jobId: identifier(row.jobId, "jobId"),
    completedAt: date(row.completedAt, "completedAt"),
    source,
    proposal,
    sourceMeasurement,
    sourceDiagnosis,
    derivative: { provider: derivativeSource.provider, locator: derivativeSource.locator, generation: derivativeSource.generation, sha256: derivativeSource.sha256, sizeBytes: derivativeSource.sizeBytes, contentType: "audio/wav", codec: "pcm_s24le", sampleRateHz: 48_000, variantKind: "dialogue-repair-preview", measurement: outputMeasurement, diagnosis: outputDiagnosis },
    verification: { sourceDurationSeconds, outputDurationSeconds, durationDeltaSeconds, maximumDurationDeltaSeconds: 0.05, sourceChannelCount: sourceMeasurement.channels, outputChannelCount: outputMeasurement.channels, sourceBytesPreserved: true, completeOutputDecode: true, passes: true },
    worker: { executionId: identifier(worker.executionId, "worker.executionId"), buildId: boundedText(worker.buildId, "worker.buildId", 300), imageDigest: worker.imageDigest === null ? null : boundedText(worker.imageDigest, "worker.imageDigest", 300), attempt: positiveInteger(worker.attempt, "worker.attempt") },
    boundaries: { originalRemainsSourceTruth: true, outputIsUnpromotedExperiment: true, outputIsNotAMasteredDeliveryFile: true, matchedAuditionRequired: true, promotionRequiresSeparateApproval: true },
  };
}

function newDialogueRepairGraph(treatmentRange: { startSeconds: number; endSeconds: number }): DialogueRepairProposal["graph"] {
  return [
    { id: "decode-source", operation: "decode", automatic: true, changesSource: false, parameters: { completeDecode: true } },
    { id: "range-declick", operation: "adeclick", automatic: true, changesSource: false, parameters: { ...treatmentRange, window: 55, overlap: 75, autoregressionOrder: 2, threshold: 2, burst: 2, method: "add" } },
    { id: "measure-output", operation: "measure", automatic: true, changesSource: false, parameters: { completeDecode: true } },
    { id: "diagnose-output", operation: "diagnose", automatic: true, changesSource: false, parameters: { completeDecode: true } },
    { id: "verify-output", operation: "verify", automatic: true, changesSource: false, parameters: { maximumDurationDeltaSeconds: 0.05, preserveChannelCount: true } },
    { id: "audition-output", operation: "audition", automatic: false, changesSource: false, parameters: { loudnessMatchedDefault: true, separatePromotionApprovalRequired: true } },
  ];
}

function repairRange(value: unknown): DialogueRepairRange {
  const row = record(value);
  const range = {
    startSeconds: finiteSeconds(row.startSeconds, "range.startSeconds"),
    endSeconds: finiteSeconds(row.endSeconds, "range.endSeconds"),
    auditionPreRollSeconds: finiteSeconds(row.auditionPreRollSeconds, "range.auditionPreRollSeconds"),
    auditionPostRollSeconds: finiteSeconds(row.auditionPostRollSeconds, "range.auditionPostRollSeconds"),
    sourceDurationSeconds: finiteSeconds(row.sourceDurationSeconds, "range.sourceDurationSeconds"),
  };
  if (range.sourceDurationSeconds <= 0 || range.endSeconds <= range.startSeconds || range.endSeconds > range.sourceDurationSeconds || range.auditionPreRollSeconds > 10 || range.auditionPostRollSeconds > 10) {
    throw new Error("Dialogue repair source range is invalid.");
  }
  return range;
}

function candidateOrigin(value: unknown): DialogueRepairCandidate["origin"] {
  const row = record(value);
  if (row.kind === "human-marked") return { kind: "human-marked" };
  if (row.kind === "detector-suggestion") {
    const score = finiteNumber(row.score, "origin.score");
    if (score < 0 || score > 1 || row.qualificationStatus !== "unqualified") throw new Error("Dialogue repair detector suggestion is invalid.");
    const evidence = record(row.evidence);
    const impactRms = finiteNumber(evidence.impactRms, "origin.evidence.impactRms");
    const impactPeak = finiteNumber(evidence.impactPeak, "origin.evidence.impactPeak");
    if (impactRms < 0 || impactPeak < 0 || evidence.windowMilliseconds !== 10) throw new Error("Dialogue repair detector suggestion evidence is invalid.");
    return { kind: "detector-suggestion", detectorId: identifier(row.detectorId, "origin.detectorId"), detectorVersion: boundedText(row.detectorVersion, "origin.detectorVersion", 120), score, qualificationStatus: "unqualified", evidence: { impactRms, impactPeak, windowMilliseconds: 10 } };
  }
  if (row.kind !== "qualified-detector") throw new Error("Dialogue repair candidate origin is invalid.");
  const score = finiteNumber(row.score, "origin.score");
  if (score < 0 || score > 1) throw new Error("Dialogue repair detector score is invalid.");
  return { kind: "qualified-detector", detectorId: identifier(row.detectorId, "origin.detectorId"), detectorVersion: boundedText(row.detectorVersion, "origin.detectorVersion", 120), corpusId: identifier(row.corpusId, "origin.corpusId"), qualificationRunId: identifier(row.qualificationRunId, "origin.qualificationRunId"), score };
}

function sourceBinding(value: unknown): AudioMasterySourceBinding {
  const row = record(value);
  const sha256 = boundedText(row.sha256, "source.sha256", 64);
  if (!SHA256.test(sha256)) throw new Error("Dialogue repair source SHA-256 is invalid.");
  return { assetId: identifier(row.assetId, "source.assetId"), provider: row.provider === "local" || row.provider === "gcs" ? row.provider : invalid("source.provider"), locator: boundedText(row.locator, "source.locator", 2_000), generation: boundedText(row.generation, "source.generation", 200), sha256, sizeBytes: positiveInteger(row.sizeBytes, "source.sizeBytes"), contentType: boundedText(row.contentType, "source.contentType", 200) };
}

function sameSource(left: AudioMasterySourceBinding, right: AudioMasterySourceBinding) {
  return left.assetId === right.assetId && left.provider === right.provider && left.locator === right.locator && left.generation === right.generation && left.sha256 === right.sha256 && left.sizeBytes === right.sizeBytes && left.contentType === right.contentType;
}

function sameJson(left: unknown, right: unknown) { return JSON.stringify(sortObject(left)) === JSON.stringify(sortObject(right)); }
function sortObject(value: unknown): unknown { if (Array.isArray(value)) return value.map(sortObject); if (!value || typeof value !== "object") return value; return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, sortObject(entry)])); }

function secondBins(startSeconds: number, endSeconds: number) {
  const start = Math.floor(startSeconds);
  const end = Math.max(start, Math.ceil(endSeconds) - 1);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function dialogueLabel(value: unknown): DialogueRepairLabel { if (typeof value !== "string" || !LABELS.has(value as DialogueRepairLabel)) throw new Error("Dialogue repair label is invalid."); return value as DialogueRepairLabel; }
function reviewDecision(value: unknown): DialogueRepairReviewReceipt["decision"] { if (value !== "confirmed" && value !== "false-positive" && value !== "needs-comparison") throw new Error("Dialogue repair decision is invalid."); return value; }
function record(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function array(value: unknown, field: string): unknown[] { if (!Array.isArray(value)) throw new Error(`Dialogue repair ${field} must be an array.`); return value; }
function boundedText(value: unknown, field: string, maximum: number) { const result = typeof value === "string" ? value.trim() : ""; if (!result || result.length > maximum) throw new Error(`Dialogue repair ${field} is invalid.`); return result; }
function identifier(value: unknown, field: string) { const result = boundedText(value, field, 160); if (!SAFE_ID.test(result)) throw new Error(`Dialogue repair ${field} is invalid.`); return result; }
function nullableId(value: unknown, field: string) { return value === null || value === undefined || value === "" ? null : identifier(value, field); }
function nullableText(value: unknown, field: string, maximum: number) { return value === null || value === undefined || value === "" ? null : boundedText(value, field, maximum); }
function email(value: unknown, field: string) { const result = boundedText(value, field, 320).toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new Error(`Dialogue repair ${field} is invalid.`); return result; }
function date(value: unknown, field: string) { const result = boundedText(value, field, 80); if (!Number.isFinite(Date.parse(result))) throw new Error(`Dialogue repair ${field} is invalid.`); return result; }
function finiteNumber(value: unknown, field: string) { const result = Number(value); if (!Number.isFinite(result)) throw new Error(`Dialogue repair ${field} must be finite.`); return result; }
function finiteSeconds(value: unknown, field: string) { const result = round(finiteNumber(value, field), 6); if (result < 0) throw new Error(`Dialogue repair ${field} cannot be negative.`); return result; }
function positiveInteger(value: unknown, field: string) { const result = finiteNumber(value, field); if (!Number.isInteger(result) || result <= 0) throw new Error(`Dialogue repair ${field} must be a positive integer.`); return result; }
function nonNegativeInteger(value: unknown, field: string) { const result = finiteNumber(value, field); if (!Number.isInteger(result) || result < 0) throw new Error(`Dialogue repair ${field} must be a non-negative integer.`); return result; }
function invalid(field: string): never { throw new Error(`Dialogue repair ${field} is invalid.`); }
function decimal(value: number) { return Number.isInteger(value) ? value.toFixed(1) : String(value); }
function round(value: number, digits: number) { const multiplier = 10 ** digits; return Math.round(value * multiplier) / multiplier; }
