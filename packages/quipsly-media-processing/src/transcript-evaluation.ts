export const TRANSCRIPT_EVALUATION_CORPUS_KIND =
  "quipsly-private-transcript-evaluation-corpus-v1" as const;
export const TRANSCRIPT_EVALUATION_REPORT_KIND =
  "quipsly-private-transcript-evaluation-report-v1" as const;
export const TRANSCRIPT_EVALUATION_VERSION = 1 as const;

const SHA256 = /^[0-9a-f]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/;
const MAX_WORDS_PER_WINDOW = 3_000;

export type TranscriptEvaluationWord = {
  text: string;
  startSeconds: number | null;
  endSeconds: number | null;
  speakerId: string | null;
};

export type TranscriptEvaluationPolicyReceipt = {
  receiptSha256: string;
  capturedAt: string;
  sourceUrl: string;
  trainingUsage: "opted-out" | "provider-default" | "not-applicable" | "unknown";
  retentionMode: "zero-data-retention" | "time-limited" | "provider-default" | "on-device" | "unknown";
  retentionDays: number | null;
  processingRegion: string | null;
};

export type TranscriptEvaluationProviderIdentity = {
  providerKey: string;
  providerName: string;
  model: string;
  adapterVersion: string;
  requestConfigSha256: string;
};

export type TranscriptEvaluationCorrectionObservation = {
  observedAt: string;
  reviewerId: string;
  elapsedMilliseconds: number;
  operationCount: number;
};

export type TranscriptEvaluationCandidate =
  & TranscriptEvaluationProviderIdentity
  & {
    completedAt: string;
    elapsedMilliseconds: number;
    estimatedCostUsd: number | null;
    policy: TranscriptEvaluationPolicyReceipt;
  }
  & (
    | {
      outcome: "succeeded";
      providerReceiptSha256: string;
      words: TranscriptEvaluationWord[];
      correction: TranscriptEvaluationCorrectionObservation | null;
    }
    | {
      outcome: "failed";
      errorCode: string;
      retryable: boolean;
    }
  );

export type TranscriptEvaluationReference = {
  approvalStatus: "human-approved";
  revisionId: string;
  contentSha256: string;
  approvedAt: string;
  approvedBy: string;
  words: TranscriptEvaluationWord[];
};

export type TranscriptEvaluationWindow = {
  windowId: string;
  sourceSha256: string;
  durationSeconds: number;
  reference: TranscriptEvaluationReference;
  candidates: TranscriptEvaluationCandidate[];
};

export type TranscriptEvaluationCorpus = {
  kind: typeof TRANSCRIPT_EVALUATION_CORPUS_KIND;
  version: typeof TRANSCRIPT_EVALUATION_VERSION;
  corpusId: string;
  revisionId: string;
  purpose: "podcast" | "coaching" | "mixed";
  createdAt: string;
  createdBy: string;
  consentReceiptSha256: string;
  windows: TranscriptEvaluationWindow[];
};

export type TranscriptWordErrorMetrics = {
  referenceWordCount: number;
  candidateWordCount: number;
  substitutions: number;
  deletions: number;
  insertions: number;
  wordErrorCount: number;
  wordErrorRate: number;
};

export type TranscriptSpeakerMetrics = {
  referenceSpeakerWordMatches: number;
  candidateSpeakerAttributedMatches: number;
  speakerConfusions: number;
  speakerMisses: number;
  speakerErrorRate: number | null;
};

export type TranscriptTimingMetrics = {
  timedWordMatches: number;
  meanAbsoluteStartDriftMilliseconds: number | null;
  p50AbsoluteStartDriftMilliseconds: number | null;
  p95AbsoluteStartDriftMilliseconds: number | null;
};

export type TranscriptEvaluationCandidateMetrics = {
  words: TranscriptWordErrorMetrics;
  speakers: TranscriptSpeakerMetrics;
  timing: TranscriptTimingMetrics;
};

export type TranscriptEvaluationProviderReport = {
  providerKey: string;
  providerName: string;
  model: string;
  adapterVersion: string;
  requestConfigSha256: string;
  attemptedWindowCount: number;
  succeededWindowCount: number;
  failedWindowCount: number;
  sourceDurationSeconds: number;
  wordMetrics: TranscriptWordErrorMetrics | null;
  speakerMetrics: TranscriptSpeakerMetrics | null;
  timingMetrics: TranscriptTimingMetrics | null;
  elapsedMilliseconds: number;
  realTimeFactor: number;
  costObservationCount: number;
  estimatedCostUsd: number | null;
  correctionObservationCount: number;
  correctionElapsedMilliseconds: number | null;
  correctionOperationCount: number;
  policyReceiptSha256s: string[];
  failureCodes: Array<{ code: string; count: number; retryableCount: number }>;
};

export type TranscriptEvaluationReport = {
  kind: typeof TRANSCRIPT_EVALUATION_REPORT_KIND;
  version: typeof TRANSCRIPT_EVALUATION_VERSION;
  corpusId: string;
  corpusRevisionId: string;
  corpusPurpose: TranscriptEvaluationCorpus["purpose"];
  generatedAt: string;
  consentReceiptSha256: string;
  windowCount: number;
  sourceReceipts: Array<{
    windowId: string;
    sourceSha256: string;
    referenceRevisionId: string;
    referenceContentSha256: string;
  }>;
  providers: TranscriptEvaluationProviderReport[];
  interpretation: {
    universalProviderScore: false;
    providerConfidenceComparable: false;
    rule: string;
    privacy: string;
  };
};

type NormalizedWord = TranscriptEvaluationWord & { token: string };
type Alignment = {
  substitutions: number;
  deletions: number;
  insertions: number;
  exactMatches: Array<{ referenceIndex: number; candidateIndex: number }>;
};

export function parseTranscriptEvaluationCorpus(
  value: unknown,
): TranscriptEvaluationCorpus {
  const row = record(value);
  if (
    row.kind !== TRANSCRIPT_EVALUATION_CORPUS_KIND
    || row.version !== TRANSCRIPT_EVALUATION_VERSION
  ) {
    throw new Error("Transcript evaluation corpus kind or version is invalid.");
  }
  const corpusId = safeId(row.corpusId, "corpusId");
  const revisionId = safeId(row.revisionId, "revisionId");
  const purpose = requiredText(row.purpose);
  if (!(["podcast", "coaching", "mixed"] as string[]).includes(purpose)) {
    throw new Error("Transcript evaluation corpus purpose is invalid.");
  }
  const windows = array(row.windows).map(parseWindow);
  if (windows.length === 0) {
    throw new Error("Transcript evaluation corpus requires at least one window.");
  }
  const windowIds = new Set(windows.map((window) => window.windowId));
  if (windowIds.size !== windows.length) {
    throw new Error("Transcript evaluation window IDs must be unique.");
  }
  return {
    kind: TRANSCRIPT_EVALUATION_CORPUS_KIND,
    version: TRANSCRIPT_EVALUATION_VERSION,
    corpusId,
    revisionId,
    purpose: purpose as TranscriptEvaluationCorpus["purpose"],
    createdAt: isoDate(row.createdAt, "createdAt"),
    createdBy: requiredText(row.createdBy, "createdBy"),
    consentReceiptSha256: sha256(row.consentReceiptSha256, "consentReceiptSha256"),
    windows,
  };
}

export function evaluateTranscriptCandidate(
  referenceInput: TranscriptEvaluationWord[],
  candidateInput: TranscriptEvaluationWord[],
): TranscriptEvaluationCandidateMetrics {
  return evaluateTranscriptCandidateWithEvidence(referenceInput, candidateInput).metrics;
}

function evaluateTranscriptCandidateWithEvidence(
  referenceInput: TranscriptEvaluationWord[],
  candidateInput: TranscriptEvaluationWord[],
): { metrics: TranscriptEvaluationCandidateMetrics; timingDrifts: number[] } {
  const reference = normalizeWords(referenceInput);
  const candidate = normalizeWords(candidateInput);
  if (reference.length === 0) {
    throw new Error("A human-approved transcript reference must contain words.");
  }
  if (reference.length > MAX_WORDS_PER_WINDOW || candidate.length > MAX_WORDS_PER_WINDOW) {
    throw new Error(
      `Evaluation windows are limited to ${MAX_WORDS_PER_WINDOW} normalized words; split long recordings into reviewed windows.`,
    );
  }
  const alignment = alignWords(reference, candidate);
  const wordErrorCount = alignment.substitutions
    + alignment.deletions
    + alignment.insertions;
  const words: TranscriptWordErrorMetrics = {
    referenceWordCount: reference.length,
    candidateWordCount: candidate.length,
    substitutions: alignment.substitutions,
    deletions: alignment.deletions,
    insertions: alignment.insertions,
    wordErrorCount,
    wordErrorRate: wordErrorCount / reference.length,
  };
  const timingDrifts = absoluteTimingDrifts(
    reference,
    candidate,
    alignment.exactMatches,
  );
  return {
    metrics: {
      words,
      speakers: speakerMetrics(reference, candidate, alignment.exactMatches),
      timing: timingReport(timingDrifts),
    },
    timingDrifts,
  };
}

export function buildTranscriptEvaluationReport(
  corpusInput: TranscriptEvaluationCorpus,
  generatedAt: string,
): TranscriptEvaluationReport {
  const corpus = parseTranscriptEvaluationCorpus(corpusInput);
  const groups = new Map<string, ProviderAccumulator>();
  for (const window of corpus.windows) {
    for (const candidate of window.candidates) {
      const key = providerIdentityKey(candidate);
      const aggregate = groups.get(key) ?? newProviderAccumulator(candidate);
      aggregate.attemptedWindowCount += 1;
      aggregate.sourceDurationSeconds += window.durationSeconds;
      aggregate.elapsedMilliseconds += candidate.elapsedMilliseconds;
      aggregate.policyReceiptSha256s.add(candidate.policy.receiptSha256);
      if (candidate.estimatedCostUsd != null) {
        aggregate.costObserved = true;
        aggregate.costObservationCount += 1;
        aggregate.estimatedCostUsd += candidate.estimatedCostUsd;
      }
      if (candidate.outcome === "failed") {
        aggregate.failedWindowCount += 1;
        const failure = aggregate.failures.get(candidate.errorCode) ?? {
          count: 0,
          retryableCount: 0,
        };
        failure.count += 1;
        if (candidate.retryable) failure.retryableCount += 1;
        aggregate.failures.set(candidate.errorCode, failure);
      } else {
        aggregate.succeededWindowCount += 1;
        const evaluated = evaluateTranscriptCandidateWithEvidence(
          window.reference.words,
          candidate.words,
        );
        addCandidateMetrics(aggregate, evaluated.metrics, evaluated.timingDrifts);
        if (candidate.correction) {
          aggregate.correctionObservationCount += 1;
          aggregate.correctionElapsedMilliseconds +=
            candidate.correction.elapsedMilliseconds;
          aggregate.correctionOperationCount += candidate.correction.operationCount;
        }
      }
      groups.set(key, aggregate);
    }
  }

  return {
    kind: TRANSCRIPT_EVALUATION_REPORT_KIND,
    version: TRANSCRIPT_EVALUATION_VERSION,
    corpusId: corpus.corpusId,
    corpusRevisionId: corpus.revisionId,
    corpusPurpose: corpus.purpose,
    generatedAt: isoDate(generatedAt, "generatedAt"),
    consentReceiptSha256: corpus.consentReceiptSha256,
    windowCount: corpus.windows.length,
    sourceReceipts: corpus.windows.map((window) => ({
      windowId: window.windowId,
      sourceSha256: window.sourceSha256,
      referenceRevisionId: window.reference.revisionId,
      referenceContentSha256: window.reference.contentSha256,
    })),
    providers: [...groups.values()]
      .map(providerReport)
      .sort((left, right) => providerIdentityKey(left).localeCompare(providerIdentityKey(right))),
    interpretation: {
      universalProviderScore: false,
      providerConfidenceComparable: false,
      rule: "Compare word error, speaker error, timing drift, human correction time, latency, cost, policy, and failures separately on the same approved windows.",
      privacy: "This aggregate report contains hashes and metrics only; transcript text, speaker identities, reviewer identities, and source paths remain in the private corpus input.",
    },
  };
}

type ProviderAccumulator = TranscriptEvaluationProviderIdentity & {
  providerName: string;
  attemptedWindowCount: number;
  succeededWindowCount: number;
  failedWindowCount: number;
  sourceDurationSeconds: number;
  elapsedMilliseconds: number;
  costObserved: boolean;
  costObservationCount: number;
  estimatedCostUsd: number;
  correctionObservationCount: number;
  correctionElapsedMilliseconds: number;
  correctionOperationCount: number;
  policyReceiptSha256s: Set<string>;
  failures: Map<string, { count: number; retryableCount: number }>;
  referenceWordCount: number;
  candidateWordCount: number;
  substitutions: number;
  deletions: number;
  insertions: number;
  referenceSpeakerWordMatches: number;
  candidateSpeakerAttributedMatches: number;
  speakerConfusions: number;
  speakerMisses: number;
  timingDrifts: number[];
};

function parseWindow(value: unknown): TranscriptEvaluationWindow {
  const row = record(value);
  const referenceRow = record(row.reference);
  if (referenceRow.approvalStatus !== "human-approved") {
    throw new Error("Evaluation references must be explicitly human-approved.");
  }
  const reference: TranscriptEvaluationReference = {
    approvalStatus: "human-approved",
    revisionId: safeId(referenceRow.revisionId, "reference.revisionId"),
    contentSha256: sha256(referenceRow.contentSha256, "reference.contentSha256"),
    approvedAt: isoDate(referenceRow.approvedAt, "reference.approvedAt"),
    approvedBy: requiredText(referenceRow.approvedBy, "reference.approvedBy"),
    words: parseWords(referenceRow.words, "reference.words"),
  };
  if (normalizeWords(reference.words).length === 0) {
    throw new Error("A human-approved transcript reference must contain words.");
  }
  const candidates = array(row.candidates).map(parseCandidate);
  if (candidates.length === 0) {
    throw new Error("Each transcript evaluation window requires a candidate.");
  }
  const candidateKeys = candidates.map(providerIdentityKey);
  if (new Set(candidateKeys).size !== candidateKeys.length) {
    throw new Error("A window cannot contain duplicate provider candidate identities.");
  }
  return {
    windowId: safeId(row.windowId, "windowId"),
    sourceSha256: sha256(row.sourceSha256, "sourceSha256"),
    durationSeconds: positiveFinite(row.durationSeconds, "durationSeconds"),
    reference,
    candidates,
  };
}

function parseCandidate(value: unknown): TranscriptEvaluationCandidate {
  const row = record(value);
  const outcome = requiredText(row.outcome);
  const identity: TranscriptEvaluationProviderIdentity = {
    providerKey: safeId(row.providerKey, "candidate.providerKey"),
    providerName: requiredText(row.providerName, "candidate.providerName"),
    model: requiredText(row.model, "candidate.model"),
    adapterVersion: safeId(row.adapterVersion, "candidate.adapterVersion"),
    requestConfigSha256: sha256(row.requestConfigSha256, "candidate.requestConfigSha256"),
  };
  const shared = {
    ...identity,
    completedAt: isoDate(row.completedAt, "candidate.completedAt"),
    elapsedMilliseconds: nonNegativeFinite(row.elapsedMilliseconds, "candidate.elapsedMilliseconds"),
    estimatedCostUsd: nullableNonNegativeFinite(row.estimatedCostUsd, "candidate.estimatedCostUsd"),
    policy: parsePolicy(row.policy),
  };
  if (outcome === "failed") {
    return {
      ...shared,
      outcome: "failed",
      errorCode: safeId(row.errorCode, "candidate.errorCode"),
      retryable: boolean(row.retryable, "candidate.retryable"),
    };
  }
  if (outcome !== "succeeded") {
    throw new Error("Transcript evaluation candidate outcome is invalid.");
  }
  return {
    ...shared,
    outcome: "succeeded",
    providerReceiptSha256: sha256(row.providerReceiptSha256, "candidate.providerReceiptSha256"),
    words: parseWords(row.words, "candidate.words"),
    correction: row.correction == null ? null : parseCorrection(row.correction),
  };
}

function parsePolicy(value: unknown): TranscriptEvaluationPolicyReceipt {
  const row = record(value);
  const trainingUsage = requiredText(row.trainingUsage);
  const retentionMode = requiredText(row.retentionMode);
  if (!(["opted-out", "provider-default", "not-applicable", "unknown"] as string[]).includes(trainingUsage)) {
    throw new Error("Transcript provider training-usage policy is invalid.");
  }
  if (!(["zero-data-retention", "time-limited", "provider-default", "on-device", "unknown"] as string[]).includes(retentionMode)) {
    throw new Error("Transcript provider retention policy is invalid.");
  }
  const sourceUrl = requiredText(row.sourceUrl, "policy.sourceUrl");
  try {
    new URL(sourceUrl);
  } catch {
    throw new Error("Transcript provider policy source URL is invalid.");
  }
  const retentionDays = row.retentionDays == null
    ? null
    : nonNegativeSafeInteger(row.retentionDays, "policy.retentionDays");
  if (retentionMode === "time-limited" && retentionDays == null) {
    throw new Error("A time-limited transcript retention policy requires retentionDays.");
  }
  return {
    receiptSha256: sha256(row.receiptSha256, "policy.receiptSha256"),
    capturedAt: isoDate(row.capturedAt, "policy.capturedAt"),
    sourceUrl,
    trainingUsage: trainingUsage as TranscriptEvaluationPolicyReceipt["trainingUsage"],
    retentionMode: retentionMode as TranscriptEvaluationPolicyReceipt["retentionMode"],
    retentionDays,
    processingRegion: row.processingRegion == null
      ? null
      : requiredText(row.processingRegion, "policy.processingRegion"),
  };
}

function parseCorrection(value: unknown): TranscriptEvaluationCorrectionObservation {
  const row = record(value);
  return {
    observedAt: isoDate(row.observedAt, "correction.observedAt"),
    reviewerId: requiredText(row.reviewerId, "correction.reviewerId"),
    elapsedMilliseconds: nonNegativeFinite(row.elapsedMilliseconds, "correction.elapsedMilliseconds"),
    operationCount: nonNegativeSafeInteger(row.operationCount, "correction.operationCount"),
  };
}

function parseWords(value: unknown, field: string): TranscriptEvaluationWord[] {
  return array(value).map((entry, index) => {
    const row = record(entry);
    const startSeconds = nullableNonNegativeFinite(row.startSeconds, `${field}[${index}].startSeconds`);
    const endSeconds = nullableNonNegativeFinite(row.endSeconds, `${field}[${index}].endSeconds`);
    if ((startSeconds == null) !== (endSeconds == null) || (startSeconds != null && endSeconds! < startSeconds)) {
      throw new Error(`${field}[${index}] has an invalid time range.`);
    }
    return {
      text: requiredText(row.text, `${field}[${index}].text`),
      startSeconds,
      endSeconds,
      speakerId: row.speakerId == null ? null : requiredText(row.speakerId, `${field}[${index}].speakerId`),
    };
  });
}

function normalizeWords(words: TranscriptEvaluationWord[]): NormalizedWord[] {
  return words.flatMap((word) => {
    const tokens = word.text
      .normalize("NFKC")
      .toLocaleLowerCase("en-US")
      .match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? [];
    return tokens.map((token) => ({ ...word, token: token.replaceAll("’", "'") }));
  });
}

function alignWords(reference: NormalizedWord[], candidate: NormalizedWord[]): Alignment {
  const width = candidate.length + 1;
  const directions = new Uint8Array((reference.length + 1) * width);
  let previous = new Uint32Array(width);
  let current = new Uint32Array(width);
  let previousMatches = new Uint32Array(width);
  let currentMatches = new Uint32Array(width);
  for (let column = 1; column < width; column += 1) {
    previous[column] = column;
    directions[column] = 3;
  }
  for (let row = 1; row <= reference.length; row += 1) {
    current[0] = row;
    directions[row * width] = 2;
    for (let column = 1; column < width; column += 1) {
      const exact = reference[row - 1]!.token === candidate[column - 1]!.token;
      const diagonal = previous[column - 1]! + (exact ? 0 : 1);
      const deletion = previous[column]! + 1;
      const insertion = current[column - 1]! + 1;
      const diagonalMatches = previousMatches[column - 1]! + (exact ? 1 : 0);
      const deletionMatches = previousMatches[column]!;
      const insertionMatches = currentMatches[column - 1]!;
      if (betterAlignment(
        diagonal,
        diagonalMatches,
        deletion,
        deletionMatches,
      ) && betterAlignment(
        diagonal,
        diagonalMatches,
        insertion,
        insertionMatches,
      )) {
        current[column] = diagonal;
        currentMatches[column] = diagonalMatches;
        directions[row * width + column] = 1;
      } else if (betterAlignment(
        deletion,
        deletionMatches,
        insertion,
        insertionMatches,
      )) {
        current[column] = deletion;
        currentMatches[column] = deletionMatches;
        directions[row * width + column] = 2;
      } else {
        current[column] = insertion;
        currentMatches[column] = insertionMatches;
        directions[row * width + column] = 3;
      }
    }
    [previous, current] = [current, previous];
    [previousMatches, currentMatches] = [currentMatches, previousMatches];
    current.fill(0);
    currentMatches.fill(0);
  }
  let row = reference.length;
  let column = candidate.length;
  let substitutions = 0;
  let deletions = 0;
  let insertions = 0;
  const exactMatches: Alignment["exactMatches"] = [];
  while (row > 0 || column > 0) {
    const direction = directions[row * width + column];
    if (direction === 1) {
      if (reference[row - 1]!.token === candidate[column - 1]!.token) {
        exactMatches.push({ referenceIndex: row - 1, candidateIndex: column - 1 });
      } else {
        substitutions += 1;
      }
      row -= 1;
      column -= 1;
    } else if (direction === 2) {
      deletions += 1;
      row -= 1;
    } else {
      insertions += 1;
      column -= 1;
    }
  }
  exactMatches.reverse();
  return { substitutions, deletions, insertions, exactMatches };
}

function betterAlignment(
  leftCost: number,
  leftMatches: number,
  rightCost: number,
  rightMatches: number,
) {
  return leftCost < rightCost
    || (leftCost === rightCost && leftMatches >= rightMatches);
}

function speakerMetrics(
  reference: NormalizedWord[],
  candidate: NormalizedWord[],
  matches: Alignment["exactMatches"],
): TranscriptSpeakerMetrics {
  const pairs = matches.map((match) => ({
    reference: reference[match.referenceIndex]!.speakerId,
    candidate: candidate[match.candidateIndex]!.speakerId,
  }));
  const referenceSpeakerWordMatches = pairs.filter((pair) => pair.reference != null).length;
  const attributed = pairs.filter((pair): pair is { reference: string; candidate: string } => (
    pair.reference != null && pair.candidate != null
  ));
  const referenceLabels = [...new Set(attributed.map((pair) => pair.reference))].sort();
  const candidateLabels = [...new Set(attributed.map((pair) => pair.candidate))].sort();
  const weights = candidateLabels.map((candidateLabel) => referenceLabels.map(
    (referenceLabel) => attributed.filter((pair) => (
      pair.candidate === candidateLabel && pair.reference === referenceLabel
    )).length,
  ));
  const assignment = maximumWeightAssignment(weights);
  const mapping = new Map<string, string>();
  assignment.forEach((referenceIndex, candidateIndex) => {
    if (referenceIndex < referenceLabels.length) {
      mapping.set(candidateLabels[candidateIndex]!, referenceLabels[referenceIndex]!);
    }
  });
  const speakerConfusions = attributed.filter((pair) => (
    mapping.get(pair.candidate) !== pair.reference
  )).length;
  const speakerMisses = pairs.filter((pair) => pair.reference != null && pair.candidate == null).length;
  return {
    referenceSpeakerWordMatches,
    candidateSpeakerAttributedMatches: attributed.length,
    speakerConfusions,
    speakerMisses,
    speakerErrorRate: referenceSpeakerWordMatches === 0
      ? null
      : (speakerConfusions + speakerMisses) / referenceSpeakerWordMatches,
  };
}

function absoluteTimingDrifts(
  reference: NormalizedWord[],
  candidate: NormalizedWord[],
  matches: Alignment["exactMatches"],
): number[] {
  return matches.flatMap((match) => {
    const referenceStart = reference[match.referenceIndex]!.startSeconds;
    const candidateStart = candidate[match.candidateIndex]!.startSeconds;
    return referenceStart == null || candidateStart == null
      ? []
      : [Math.abs(referenceStart - candidateStart) * 1_000];
  }).sort((left, right) => left - right);
}

function maximumWeightAssignment(weights: number[][]): number[] {
  const size = Math.max(weights.length, weights[0]?.length ?? 0);
  if (size === 0) return [];
  const maximum = Math.max(0, ...weights.flat());
  const u = new Array<number>(size + 1).fill(0);
  const v = new Array<number>(size + 1).fill(0);
  const p = new Array<number>(size + 1).fill(0);
  const way = new Array<number>(size + 1).fill(0);
  for (let row = 1; row <= size; row += 1) {
    p[0] = row;
    let column0 = 0;
    const minValues = new Array<number>(size + 1).fill(Number.POSITIVE_INFINITY);
    const used = new Array<boolean>(size + 1).fill(false);
    do {
      used[column0] = true;
      const row0 = p[column0]!;
      let delta = Number.POSITIVE_INFINITY;
      let column1 = 0;
      for (let column = 1; column <= size; column += 1) {
        if (used[column]) continue;
        const weight = weights[row0 - 1]?.[column - 1] ?? 0;
        const current = maximum - weight - u[row0]! - v[column]!;
        if (current < minValues[column]!) {
          minValues[column] = current;
          way[column] = column0;
        }
        if (minValues[column]! < delta) {
          delta = minValues[column]!;
          column1 = column;
        }
      }
      for (let column = 0; column <= size; column += 1) {
        if (used[column]) {
          u[p[column]!] += delta;
          v[column]! -= delta;
        } else {
          minValues[column]! -= delta;
        }
      }
      column0 = column1;
    } while (p[column0] !== 0);
    do {
      const column1 = way[column0]!;
      p[column0] = p[column1]!;
      column0 = column1;
    } while (column0 !== 0);
  }
  const assignment = new Array<number>(size).fill(size);
  for (let column = 1; column <= size; column += 1) {
    if (p[column]! > 0) assignment[p[column]! - 1] = column - 1;
  }
  return assignment.slice(0, weights.length);
}

function newProviderAccumulator(candidate: TranscriptEvaluationCandidate): ProviderAccumulator {
  return {
    providerKey: candidate.providerKey,
    providerName: candidate.providerName,
    model: candidate.model,
    adapterVersion: candidate.adapterVersion,
    requestConfigSha256: candidate.requestConfigSha256,
    attemptedWindowCount: 0,
    succeededWindowCount: 0,
    failedWindowCount: 0,
    sourceDurationSeconds: 0,
    elapsedMilliseconds: 0,
    costObserved: false,
    costObservationCount: 0,
    estimatedCostUsd: 0,
    correctionObservationCount: 0,
    correctionElapsedMilliseconds: 0,
    correctionOperationCount: 0,
    policyReceiptSha256s: new Set(),
    failures: new Map(),
    referenceWordCount: 0,
    candidateWordCount: 0,
    substitutions: 0,
    deletions: 0,
    insertions: 0,
    referenceSpeakerWordMatches: 0,
    candidateSpeakerAttributedMatches: 0,
    speakerConfusions: 0,
    speakerMisses: 0,
    timingDrifts: [],
  };
}

function addCandidateMetrics(
  aggregate: ProviderAccumulator,
  metrics: TranscriptEvaluationCandidateMetrics,
  timingDrifts: number[],
) {
  aggregate.referenceWordCount += metrics.words.referenceWordCount;
  aggregate.candidateWordCount += metrics.words.candidateWordCount;
  aggregate.substitutions += metrics.words.substitutions;
  aggregate.deletions += metrics.words.deletions;
  aggregate.insertions += metrics.words.insertions;
  aggregate.referenceSpeakerWordMatches += metrics.speakers.referenceSpeakerWordMatches;
  aggregate.candidateSpeakerAttributedMatches += metrics.speakers.candidateSpeakerAttributedMatches;
  aggregate.speakerConfusions += metrics.speakers.speakerConfusions;
  aggregate.speakerMisses += metrics.speakers.speakerMisses;
  aggregate.timingDrifts.push(...timingDrifts);
}

function providerReport(aggregate: ProviderAccumulator): TranscriptEvaluationProviderReport {
  const wordErrorCount = aggregate.substitutions + aggregate.deletions + aggregate.insertions;
  const wordMetrics = aggregate.succeededWindowCount === 0 ? null : {
    referenceWordCount: aggregate.referenceWordCount,
    candidateWordCount: aggregate.candidateWordCount,
    substitutions: aggregate.substitutions,
    deletions: aggregate.deletions,
    insertions: aggregate.insertions,
    wordErrorCount,
    wordErrorRate: wordErrorCount / aggregate.referenceWordCount,
  };
  const speakerMetricsValue = aggregate.succeededWindowCount === 0 ? null : {
    referenceSpeakerWordMatches: aggregate.referenceSpeakerWordMatches,
    candidateSpeakerAttributedMatches: aggregate.candidateSpeakerAttributedMatches,
    speakerConfusions: aggregate.speakerConfusions,
    speakerMisses: aggregate.speakerMisses,
    speakerErrorRate: aggregate.referenceSpeakerWordMatches === 0
      ? null
      : (aggregate.speakerConfusions + aggregate.speakerMisses)
        / aggregate.referenceSpeakerWordMatches,
  };
  return {
    providerKey: aggregate.providerKey,
    providerName: aggregate.providerName,
    model: aggregate.model,
    adapterVersion: aggregate.adapterVersion,
    requestConfigSha256: aggregate.requestConfigSha256,
    attemptedWindowCount: aggregate.attemptedWindowCount,
    succeededWindowCount: aggregate.succeededWindowCount,
    failedWindowCount: aggregate.failedWindowCount,
    sourceDurationSeconds: aggregate.sourceDurationSeconds,
    wordMetrics,
    speakerMetrics: speakerMetricsValue,
    timingMetrics: aggregate.succeededWindowCount === 0
      ? null
      : timingReport(aggregate.timingDrifts),
    elapsedMilliseconds: aggregate.elapsedMilliseconds,
    realTimeFactor: aggregate.elapsedMilliseconds / (aggregate.sourceDurationSeconds * 1_000),
    costObservationCount: aggregate.costObservationCount,
    estimatedCostUsd: aggregate.costObserved ? aggregate.estimatedCostUsd : null,
    correctionObservationCount: aggregate.correctionObservationCount,
    correctionElapsedMilliseconds: aggregate.correctionObservationCount > 0
      ? aggregate.correctionElapsedMilliseconds
      : null,
    correctionOperationCount: aggregate.correctionOperationCount,
    policyReceiptSha256s: [...aggregate.policyReceiptSha256s].sort(),
    failureCodes: [...aggregate.failures.entries()]
      .map(([code, failure]) => ({ code, ...failure }))
      .sort((left, right) => left.code.localeCompare(right.code)),
  };
}

function timingReport(drifts: number[]): TranscriptTimingMetrics {
  if (drifts.length === 0) {
    return {
      timedWordMatches: 0,
      meanAbsoluteStartDriftMilliseconds: null,
      p50AbsoluteStartDriftMilliseconds: null,
      p95AbsoluteStartDriftMilliseconds: null,
    };
  }
  const sorted = [...drifts].sort((left, right) => left - right);
  return {
    timedWordMatches: sorted.length,
    meanAbsoluteStartDriftMilliseconds: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    p50AbsoluteStartDriftMilliseconds: percentile(sorted, 0.5),
    p95AbsoluteStartDriftMilliseconds: percentile(sorted, 0.95),
  };
}

function percentile(sorted: number[], percentileValue: number) {
  return sorted[Math.min(sorted.length - 1, Math.ceil(percentileValue * sorted.length) - 1)]!;
}

function providerIdentityKey(identity: TranscriptEvaluationProviderIdentity) {
  return [
    identity.providerKey,
    identity.model,
    identity.adapterVersion,
    identity.requestConfigSha256,
  ].join("::");
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function requiredText(value: unknown, field = "value") {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new Error(`${field} must be non-empty text.`);
  return normalized;
}

function safeId(value: unknown, field: string) {
  const normalized = requiredText(value, field);
  if (!SAFE_ID.test(normalized)) throw new Error(`${field} is invalid.`);
  return normalized;
}

function sha256(value: unknown, field: string) {
  const normalized = requiredText(value, field);
  if (!SHA256.test(normalized)) throw new Error(`${field} must be a lowercase SHA-256 digest.`);
  return normalized;
}

function isoDate(value: unknown, field: string) {
  const normalized = requiredText(value, field);
  if (!Number.isFinite(Date.parse(normalized))) throw new Error(`${field} must be an ISO date.`);
  return normalized;
}

function positiveFinite(value: unknown, field: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${field} must be positive.`);
  return number;
}

function nonNegativeFinite(value: unknown, field: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${field} must be non-negative.`);
  return number;
}

function nullableNonNegativeFinite(value: unknown, field: string) {
  return value == null ? null : nonNegativeFinite(value, field);
}

function nonNegativeSafeInteger(value: unknown, field: string) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error(`${field} must be a non-negative integer.`);
  return number;
}

function boolean(value: unknown, field: string) {
  if (typeof value !== "boolean") throw new Error(`${field} must be boolean.`);
  return value;
}
