import "server-only";

import { createHash } from "node:crypto";

import {
  buildTranscriptEvaluationReport,
  COACHING_TRANSCRIPT_EVALUATION_CONDITIONS,
  parseTranscriptEvaluationCorpus,
  PODCAST_TRANSCRIPT_EVALUATION_CONDITIONS,
  type TranscriptEvaluationCandidate,
  type TranscriptEvaluationCondition,
  type TranscriptEvaluationThresholdStatus,
  type TranscriptEvaluationWorkload,
  type TranscriptEvaluationWord,
} from "@high-ground/quipsly-media-processing";

import { sessionActorAccessWhere, type SessionAccessActor } from "./session-access";
import {
  TRANSCRIPT_TERMINOLOGY_EXPERIMENT_SCHEMA,
  transcriptProviderBaseConfigSha256,
} from "./transcript-evaluation-candidates";

export const TRANSCRIPT_EVALUATION_BOARD_SCHEMA =
  "quipsly-transcript-evaluation-board-v1";

const REQUIRED_CONDITIONS: Record<
  TranscriptEvaluationWorkload,
  readonly TranscriptEvaluationCondition[]
> = {
  podcast: PODCAST_TRANSCRIPT_EVALUATION_CONDITIONS,
  coaching: COACHING_TRANSCRIPT_EVALUATION_CONDITIONS,
};

type CandidateRow = {
  id: string;
  providerKey: string;
  providerName: string;
  model: string;
  adapterVersion: string;
  requestConfigSha256: string;
  requestConfigJson: unknown;
  metricsJson: unknown;
  speakerAttribution: string;
  timingGranularity: string;
  outcome: string;
  providerReceiptSha256: string | null;
  normalizedWordsJson: unknown;
  elapsedMilliseconds: number;
  estimatedCostUsd: number | null;
  errorCode: string | null;
  retryable: boolean | null;
  completedAt: Date | string;
  policy: {
    receiptSha256: string;
    policyJson: unknown;
    capturedAt: Date | string;
  };
  corrections: Array<{
    reviewerUserId: string;
    elapsedMilliseconds: number;
    operationCount: number;
    observedAt: Date | string;
  }>;
};

export type TranscriptEvaluationBoardRow = {
  id: string;
  roomId: string;
  workload: string;
  conditionsJson: unknown;
  sourceDurationSeconds: number;
  sourceSha256: string;
  consentVersionSha256: string;
  referenceRevisionId: string;
  referenceContentSha256: string;
  referenceWordsJson: unknown;
  approvedByUserId: string;
  approvedAt: Date | string;
  room: {
    title: string;
    purpose: string | null;
    project: { name: string; slug: string } | null;
  };
  candidates: CandidateRow[];
};

export type TranscriptEvidenceCondition = {
  id: TranscriptEvaluationCondition;
  windowCount: number;
  sessionCount: number;
  latestApprovedAt: string | null;
  covered: boolean;
};

export type TranscriptEvidenceProvider = {
  identity: string;
  providerKey: string;
  providerName: string;
  model: string;
  adapterVersion: string;
  requestConfigSha256: string;
  status: TranscriptEvaluationThresholdStatus;
  attemptedWindowCount: number;
  expectedWindowCount: number;
  succeededWindowCount: number;
  failedWindowCount: number;
  missingCandidateWindowCount: number;
  cleanWordErrorRate: number | null;
  difficultWordErrorRate: number | null;
  speakerErrorRate: number | null;
  timingP95Milliseconds: number | null;
  criticalTermRecall: number | null;
  criticalTermPrecision: number | null;
  preferredSpellingRate: number | null;
  criticalTermOccurrenceCount: number;
  criticalTermFalsePositiveCount: number;
  realTimeFactor: number | null;
  estimatedCostUsd: number | null;
  correctionPassCount: number;
  correctionElapsedMilliseconds: number;
  correctionOperationCount: number;
  missingConditions: TranscriptEvaluationCondition[];
  failedConditions: TranscriptEvaluationCondition[];
  reasons: string[];
};

export type TranscriptTerminologyComparison = {
  identity: string;
  workload: TranscriptEvaluationWorkload;
  comparisonKey: string;
  providerKey: string;
  providerName: string;
  model: string;
  adapterVersion: string;
  baseConfigSha256: string;
  termsSha256: string;
  pairCount: number;
  baselineOnlyWindowCount: number;
  terminologyOnlyWindowCount: number;
  baselineWordErrorRate: number | null;
  terminologyWordErrorRate: number | null;
  wordErrorRateDelta: number | null;
  baselineCriticalTermRecall: number | null;
  terminologyCriticalTermRecall: number | null;
  criticalTermRecallDelta: number | null;
  baselineFalsePositiveCount: number;
  terminologyFalsePositiveCount: number;
  verdict: "improved" | "regressed" | "mixed" | "insufficient-evidence";
};

export type TranscriptEvidenceWorkload = {
  id: TranscriptEvaluationWorkload;
  windowCount: number;
  coveredConditionCount: number;
  requiredConditionCount: number;
  complete: boolean;
  conditions: TranscriptEvidenceCondition[];
  providers: TranscriptEvidenceProvider[];
};

export type TranscriptEvidenceSession = {
  roomId: string;
  title: string;
  purpose: string | null;
  project: { name: string; slug: string } | null;
  workloads: TranscriptEvaluationWorkload[];
  conditions: TranscriptEvaluationCondition[];
  windowCount: number;
  candidateAttemptCount: number;
  correctionPassCount: number;
  latestApprovedAt: string;
};

export type TranscriptEvaluationBoard = {
  schema: typeof TRANSCRIPT_EVALUATION_BOARD_SCHEMA;
  generatedAt: string;
  summary: {
    windowCount: number;
    minimumWindowCount: 12;
    coveredConditionCount: number;
    requiredConditionCount: 12;
    candidateAttemptCount: number;
    successfulCandidateCount: number;
    failedCandidateCount: number;
    correctionPassCount: number;
    matchedTerminologyPairCount: number;
    corpusCoverageComplete: boolean;
  };
  workloads: TranscriptEvidenceWorkload[];
  terminologyComparisons: TranscriptTerminologyComparison[];
  sessions: TranscriptEvidenceSession[];
  nextEvidence: Array<{
    kind: "condition" | "provider" | "correction" | "failure" | "terminology";
    workload: TranscriptEvaluationWorkload | null;
    label: string;
    detail: string;
  }>;
  boundaries: {
    transcriptTextExposed: false;
    reviewerIdentityExposed: false;
    sourcePathExposed: false;
    universalProviderWinner: false;
    productionDefaultChanged: false;
    readOnly: true;
  };
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function iso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function stableJson(value: unknown): string {
  if (value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${stableJson(row[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: unknown) {
  return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}

function asConditions(value: unknown, workload: TranscriptEvaluationWorkload) {
  const allowed = new Set<string>(REQUIRED_CONDITIONS[workload]);
  return Array.isArray(value)
    ? [...new Set(value.filter((entry): entry is TranscriptEvaluationCondition => (
      typeof entry === "string" && allowed.has(entry)
    )))]
    : [];
}

function asWords(value: unknown): TranscriptEvaluationWord[] {
  return Array.isArray(value) ? value as TranscriptEvaluationWord[] : [];
}

function terminologyMetrics(candidate: CandidateRow) {
  const value = record(record(candidate.metricsJson).terminology);
  const integers = [
    "referenceOccurrenceCount",
    "candidateMentionCount",
    "matchedOccurrenceCount",
    "falsePositiveMentionCount",
    "canonicalCandidateMentionCount",
  ] as const;
  if (integers.some((key) => !Number.isSafeInteger(value[key]) || Number(value[key]) < 0)) return null;
  return {
    referenceOccurrenceCount: Number(value.referenceOccurrenceCount),
    candidateMentionCount: Number(value.candidateMentionCount),
    matchedOccurrenceCount: Number(value.matchedOccurrenceCount),
    falsePositiveMentionCount: Number(value.falsePositiveMentionCount),
    canonicalCandidateMentionCount: Number(value.canonicalCandidateMentionCount),
  };
}

function terminologyTotals(candidates: CandidateRow[]) {
  const totals = candidates.reduce((sum, candidate) => {
    const metrics = terminologyMetrics(candidate);
    if (!metrics || candidate.outcome !== "succeeded") return sum;
    sum.reference += metrics.referenceOccurrenceCount;
    sum.candidate += metrics.candidateMentionCount;
    sum.matched += metrics.matchedOccurrenceCount;
    sum.falsePositive += metrics.falsePositiveMentionCount;
    sum.canonical += metrics.canonicalCandidateMentionCount;
    return sum;
  }, { reference: 0, candidate: 0, matched: 0, falsePositive: 0, canonical: 0 });
  return {
    ...totals,
    recall: totals.reference ? totals.matched / totals.reference : null,
    precision: totals.candidate ? totals.matched / totals.candidate : null,
    preferredSpellingRate: totals.candidate ? Math.min(totals.canonical, totals.matched) / totals.candidate : null,
  };
}

function experiment(candidate: CandidateRow) {
  const config = record(candidate.requestConfigJson);
  const value = record(config.terminologyExperiment);
  if (value.schema !== TRANSCRIPT_TERMINOLOGY_EXPERIMENT_SCHEMA) return null;
  const arm = value.arm === "baseline" || value.arm === "project-terminology" ? value.arm : null;
  const comparisonKey = typeof value.comparisonKey === "string" ? value.comparisonKey : "";
  const termsSha256 = typeof value.termsSha256 === "string" ? value.termsSha256 : "";
  if (!arm || !comparisonKey || !/^[0-9a-f]{64}$/.test(termsSha256)) return null;
  try {
    return { arm, comparisonKey, termsSha256, baseConfigSha256: transcriptProviderBaseConfigSha256(config) };
  } catch {
    return null;
  }
}

function wordCounts(candidate: CandidateRow) {
  const words = record(record(candidate.metricsJson).words);
  const reference = Number(words.referenceWordCount);
  const errors = Number(words.wordErrorCount);
  return Number.isSafeInteger(reference) && reference > 0 && Number.isSafeInteger(errors) && errors >= 0
    ? { reference, errors }
    : null;
}

function buildTerminologyComparisons(rows: TranscriptEvaluationBoardRow[]): TranscriptTerminologyComparison[] {
  type Bucket = { workload: TranscriptEvaluationWorkload; comparisonKey: string; providerKey: string; providerName: string; model: string; adapterVersion: string; baseConfigSha256: string; termsSha256: string; windows: Map<string, Partial<Record<"baseline" | "project-terminology", CandidateRow>>> };
  const buckets = new Map<string, Bucket>();
  for (const row of rows) {
    if (row.workload !== "podcast" && row.workload !== "coaching") continue;
    for (const candidate of row.candidates) {
      const receipt = experiment(candidate);
      if (!receipt) continue;
      const key = [row.workload, candidate.providerKey, candidate.model, candidate.adapterVersion, receipt.baseConfigSha256, receipt.comparisonKey, receipt.termsSha256].join("\u0000");
      const bucket = buckets.get(key) ?? {
        workload: row.workload,
        comparisonKey: receipt.comparisonKey,
        providerKey: candidate.providerKey,
        providerName: candidate.providerName,
        model: candidate.model,
        adapterVersion: candidate.adapterVersion,
        baseConfigSha256: receipt.baseConfigSha256,
        termsSha256: receipt.termsSha256,
        windows: new Map(),
      };
      const window = bucket.windows.get(row.id) ?? {};
      window[receipt.arm] = candidate;
      bucket.windows.set(row.id, window);
      buckets.set(key, bucket);
    }
  }
  return [...buckets.values()].map((bucket) => {
    const windows = [...bucket.windows.values()];
    const pairs = windows.flatMap((window) => window.baseline?.outcome === "succeeded" && window["project-terminology"]?.outcome === "succeeded"
      ? [{ baseline: window.baseline, terminology: window["project-terminology"] }]
      : []);
    const summarize = (arm: "baseline" | "terminology") => {
      const candidates = pairs.map((pair) => pair[arm]);
      const word = candidates.reduce((sum, candidate) => {
        const counts = wordCounts(candidate);
        if (counts) { sum.reference += counts.reference; sum.errors += counts.errors; }
        return sum;
      }, { reference: 0, errors: 0 });
      const terms = terminologyTotals(candidates);
      return { wordErrorRate: word.reference ? word.errors / word.reference : null, termRecall: terms.recall, falsePositive: terms.falsePositive };
    };
    const baseline = summarize("baseline");
    const terminology = summarize("terminology");
    const wordDelta = baseline.wordErrorRate == null || terminology.wordErrorRate == null ? null : terminology.wordErrorRate - baseline.wordErrorRate;
    const recallDelta = baseline.termRecall == null || terminology.termRecall == null ? null : terminology.termRecall - baseline.termRecall;
    const verdict = !pairs.length || wordDelta == null || recallDelta == null
      ? "insufficient-evidence" as const
      : wordDelta > 0.005 || recallDelta < 0 || terminology.falsePositive > baseline.falsePositive
        ? "regressed" as const
        : recallDelta > 0 || wordDelta < -0.005
          ? "improved" as const
          : "mixed" as const;
    return {
      identity: sha256({ ...bucket, windows: [...bucket.windows.keys()] }),
      workload: bucket.workload,
      comparisonKey: bucket.comparisonKey,
      providerKey: bucket.providerKey,
      providerName: bucket.providerName,
      model: bucket.model,
      adapterVersion: bucket.adapterVersion,
      baseConfigSha256: bucket.baseConfigSha256,
      termsSha256: bucket.termsSha256,
      pairCount: pairs.length,
      baselineOnlyWindowCount: windows.filter((window) => window.baseline && !window["project-terminology"]).length,
      terminologyOnlyWindowCount: windows.filter((window) => !window.baseline && window["project-terminology"]).length,
      baselineWordErrorRate: baseline.wordErrorRate,
      terminologyWordErrorRate: terminology.wordErrorRate,
      wordErrorRateDelta: wordDelta,
      baselineCriticalTermRecall: baseline.termRecall,
      terminologyCriticalTermRecall: terminology.termRecall,
      criticalTermRecallDelta: recallDelta,
      baselineFalsePositiveCount: baseline.falsePositive,
      terminologyFalsePositiveCount: terminology.falsePositive,
      verdict,
    };
  }).sort((left, right) => left.workload.localeCompare(right.workload) || left.providerName.localeCompare(right.providerName) || left.comparisonKey.localeCompare(right.comparisonKey));
}

function providerIdentity(candidate: Pick<CandidateRow, "providerKey" | "model" | "adapterVersion" | "requestConfigSha256">) {
  return [
    candidate.providerKey,
    candidate.model,
    candidate.adapterVersion,
    candidate.requestConfigSha256,
  ].join("\u0000");
}

function policy(candidate: CandidateRow) {
  const snapshot = record(candidate.policy.policyJson);
  return {
    receiptSha256: candidate.policy.receiptSha256,
    capturedAt: iso(candidate.policy.capturedAt),
    sourceUrl: snapshot.sourceUrl,
    trainingUsage: snapshot.trainingUsage,
    retentionMode: snapshot.retentionMode,
    retentionDays: snapshot.retentionDays ?? null,
    processingRegion: snapshot.processingRegion ?? null,
  };
}

function evaluationCandidate(candidate: CandidateRow): TranscriptEvaluationCandidate {
  const shared = {
    providerKey: candidate.providerKey,
    providerName: candidate.providerName,
    model: candidate.model,
    adapterVersion: candidate.adapterVersion,
    requestConfigSha256: candidate.requestConfigSha256,
    speakerAttribution: candidate.speakerAttribution,
    timingGranularity: candidate.timingGranularity,
    completedAt: iso(candidate.completedAt),
    elapsedMilliseconds: candidate.elapsedMilliseconds,
    estimatedCostUsd: candidate.estimatedCostUsd,
    policy: policy(candidate),
  };
  if (candidate.outcome === "failed") {
    return {
      ...shared,
      outcome: "failed",
      errorCode: candidate.errorCode,
      retryable: candidate.retryable,
    } as TranscriptEvaluationCandidate;
  }
  const correction = candidate.corrections.at(-1);
  return {
    ...shared,
    outcome: "succeeded",
    providerReceiptSha256: candidate.providerReceiptSha256,
    words: asWords(candidate.normalizedWordsJson),
    correction: correction ? {
      observedAt: iso(correction.observedAt),
      reviewerId: correction.reviewerUserId,
      elapsedMilliseconds: correction.elapsedMilliseconds,
      operationCount: correction.operationCount,
    } : null,
  } as TranscriptEvaluationCandidate;
}

function correctionTotals(rows: TranscriptEvaluationBoardRow[]) {
  const totals = new Map<string, { count: number; elapsed: number; operations: number }>();
  for (const row of rows) {
    for (const candidate of row.candidates) {
      const key = `${row.workload}\u0000${providerIdentity(candidate)}`;
      const current = totals.get(key) ?? { count: 0, elapsed: 0, operations: 0 };
      for (const correction of candidate.corrections) {
        current.count += 1;
        current.elapsed += correction.elapsedMilliseconds;
        current.operations += correction.operationCount;
      }
      totals.set(key, current);
    }
  }
  return totals;
}

export function buildTranscriptEvaluationBoardFromRows(
  inputRows: TranscriptEvaluationBoardRow[],
  generatedAt = new Date().toISOString(),
): TranscriptEvaluationBoard {
  const rows = [...inputRows].sort((left, right) => iso(left.approvedAt).localeCompare(iso(right.approvedAt)));
  const correctionByProvider = correctionTotals(rows);
  const candidateAttemptCount = rows.reduce((sum, row) => sum + row.candidates.length, 0);
  const successfulCandidateCount = rows.reduce((sum, row) => sum + row.candidates.filter((candidate) => candidate.outcome === "succeeded").length, 0);
  const failedCandidateCount = candidateAttemptCount - successfulCandidateCount;
  const correctionPassCount = rows.reduce((sum, row) => sum + row.candidates.reduce((candidateSum, candidate) => candidateSum + candidate.corrections.length, 0), 0);
  const terminologyComparisons = buildTerminologyComparisons(rows);

  const parsedReport = rows.length ? buildTranscriptEvaluationReport(parseTranscriptEvaluationCorpus({
    kind: "quipsly-private-transcript-evaluation-corpus-v2",
    version: 2,
    corpusId: "quipsly-retained-evidence",
    revisionId: `board-${sha256(rows.map((row) => ({ id: row.id, reference: row.referenceContentSha256, candidates: row.candidates.map((candidate) => candidate.id) }))).slice(0, 40)}`,
    purpose: "mixed",
    createdAt: iso(rows[0]!.approvedAt),
    createdBy: "quipsly-evidence-board",
    consentReceiptSha256: sha256(rows.map((row) => row.consentVersionSha256)),
    windows: rows.map((row) => ({
      windowId: row.id,
      sourceSha256: row.sourceSha256,
      durationSeconds: row.sourceDurationSeconds,
      workload: row.workload,
      conditions: row.conditionsJson,
      reference: {
        approvalStatus: "human-approved",
        revisionId: row.referenceRevisionId,
        contentSha256: row.referenceContentSha256,
        approvedAt: iso(row.approvedAt),
        approvedBy: row.approvedByUserId,
        words: row.referenceWordsJson,
      },
      candidates: row.candidates.map(evaluationCandidate),
    })),
  }), generatedAt) : null;

  const workloads = (["podcast", "coaching"] as const).map((workload): TranscriptEvidenceWorkload => {
    const workloadRows = rows.filter((row) => row.workload === workload);
    const report = parsedReport?.workloads.find((entry) => entry.workload === workload);
    const conditions = REQUIRED_CONDITIONS[workload].map((condition): TranscriptEvidenceCondition => {
      const matching = workloadRows.filter((row) => asConditions(row.conditionsJson, workload).includes(condition));
      return {
        id: condition,
        windowCount: matching.length,
        sessionCount: new Set(matching.map((row) => row.roomId)).size,
        latestApprovedAt: matching.length ? iso(matching.at(-1)!.approvedAt) : null,
        covered: matching.length > 0,
      };
    });
    return {
      id: workload,
      windowCount: workloadRows.length,
      coveredConditionCount: conditions.filter((condition) => condition.covered).length,
      requiredConditionCount: conditions.length,
      complete: report?.coverage.complete ?? false,
      conditions,
      providers: (report?.providers ?? []).map((provider): TranscriptEvidenceProvider => {
        const identity = [provider.providerKey, provider.model, provider.adapterVersion, provider.requestConfigSha256].join("\u0000");
        const corrections = correctionByProvider.get(`${workload}\u0000${identity}`) ?? { count: 0, elapsed: 0, operations: 0 };
        const matchingCandidates = workloadRows.flatMap((row) => row.candidates.filter((candidate) => providerIdentity(candidate) === identity));
        const criticalTerms = terminologyTotals(matchingCandidates);
        return {
          identity: sha256(identity),
          providerKey: provider.providerKey,
          providerName: provider.providerName,
          model: provider.model,
          adapterVersion: provider.adapterVersion,
          requestConfigSha256: provider.requestConfigSha256,
          status: provider.thresholdAssessment.status,
          attemptedWindowCount: provider.attemptedWindowCount,
          expectedWindowCount: provider.expectedWindowCount,
          succeededWindowCount: provider.succeededWindowCount,
          failedWindowCount: provider.failedWindowCount,
          missingCandidateWindowCount: provider.missingCandidateWindowCount,
          cleanWordErrorRate: provider.cleanWordMetrics?.wordErrorRate ?? null,
          difficultWordErrorRate: provider.difficultWordMetrics?.wordErrorRate ?? null,
          speakerErrorRate: provider.speakerMetrics?.speakerErrorRate ?? null,
          timingP95Milliseconds: provider.timingMetrics?.p95AbsoluteStartDriftMilliseconds ?? null,
          criticalTermRecall: criticalTerms.recall,
          criticalTermPrecision: criticalTerms.precision,
          preferredSpellingRate: criticalTerms.preferredSpellingRate,
          criticalTermOccurrenceCount: criticalTerms.reference,
          criticalTermFalsePositiveCount: criticalTerms.falsePositive,
          realTimeFactor: provider.realTimeFactor,
          estimatedCostUsd: provider.estimatedCostUsd,
          correctionPassCount: corrections.count,
          correctionElapsedMilliseconds: corrections.elapsed,
          correctionOperationCount: corrections.operations,
          missingConditions: provider.missingCandidateConditions,
          failedConditions: provider.failedConditions,
          reasons: provider.thresholdAssessment.reasons,
        };
      }),
    };
  });

  const sessionGroups = new Map<string, TranscriptEvaluationBoardRow[]>();
  for (const row of rows) sessionGroups.set(row.roomId, [...(sessionGroups.get(row.roomId) ?? []), row]);
  const sessions = [...sessionGroups.values()].map((sessionRows): TranscriptEvidenceSession => {
    const latest = sessionRows.at(-1)!;
    return {
      roomId: latest.roomId,
      title: latest.room.title,
      purpose: latest.room.purpose,
      project: latest.room.project,
      workloads: [...new Set(sessionRows.map((row) => row.workload).filter((value): value is TranscriptEvaluationWorkload => value === "podcast" || value === "coaching"))],
      conditions: [...new Set(sessionRows.flatMap((row) => row.workload === "podcast" || row.workload === "coaching" ? asConditions(row.conditionsJson, row.workload) : []))],
      windowCount: sessionRows.length,
      candidateAttemptCount: sessionRows.reduce((sum, row) => sum + row.candidates.length, 0),
      correctionPassCount: sessionRows.reduce((sum, row) => sum + row.candidates.reduce((candidateSum, candidate) => candidateSum + candidate.corrections.length, 0), 0),
      latestApprovedAt: iso(latest.approvedAt),
    };
  }).sort((left, right) => right.latestApprovedAt.localeCompare(left.latestApprovedAt));

  const nextEvidence: TranscriptEvaluationBoard["nextEvidence"] = [];
  for (const workload of workloads) {
    for (const condition of workload.conditions.filter((entry) => !entry.covered)) {
      nextEvidence.push({
        kind: "condition",
        workload: workload.id,
        label: condition.id,
        detail: `Approve one complete playback-reviewed ${workload.id} window that genuinely contains this condition.`,
      });
    }
    if (workload.windowCount > 0 && workload.providers.length === 0) {
      nextEvidence.push({
        kind: "provider",
        workload: workload.id,
        label: `${workload.id} provider evidence`,
        detail: "Run a pinned provider against the approved windows using the protected runner input and dated policy receipt.",
      });
    }
    for (const provider of workload.providers) {
      if (provider.failedWindowCount > 0) nextEvidence.push({
        kind: "failure",
        workload: workload.id,
        label: `${provider.providerName} failure recovery`,
        detail: `${provider.failedWindowCount} attempt${provider.failedWindowCount === 1 ? "" : "s"} failed; preserve the receipt and exercise a new explicit run key.`,
      });
      if (provider.succeededWindowCount > 0 && provider.correctionPassCount === 0) nextEvidence.push({
        kind: "correction",
        workload: workload.id,
        label: `${provider.providerName} correction effort`,
        detail: "Time one real human correction pass and retain the elapsed time and operation count.",
      });
    }
  }
  for (const comparison of terminologyComparisons) {
    if (!comparison.pairCount || comparison.baselineOnlyWindowCount || comparison.terminologyOnlyWindowCount) nextEvidence.push({
      kind: "terminology",
      workload: comparison.workload,
      label: `${comparison.providerName} matched terminology pair`,
      detail: `Complete baseline and project-terminology arms against the same derivative bytes. ${comparison.pairCount} paired; ${comparison.baselineOnlyWindowCount} baseline-only; ${comparison.terminologyOnlyWindowCount} terminology-only.`,
    });
  }

  const coveredConditionCount = workloads.reduce((sum, workload) => sum + workload.coveredConditionCount, 0);
  return {
    schema: TRANSCRIPT_EVALUATION_BOARD_SCHEMA,
    generatedAt,
    summary: {
      windowCount: rows.length,
      minimumWindowCount: 12,
      coveredConditionCount,
      requiredConditionCount: 12,
      candidateAttemptCount,
      successfulCandidateCount,
      failedCandidateCount,
      correctionPassCount,
      matchedTerminologyPairCount: terminologyComparisons.reduce((sum, comparison) => sum + comparison.pairCount, 0),
      corpusCoverageComplete: parsedReport?.coverage.complete ?? false,
    },
    workloads,
    terminologyComparisons,
    sessions,
    nextEvidence,
    boundaries: {
      transcriptTextExposed: false,
      reviewerIdentityExposed: false,
      sourcePathExposed: false,
      universalProviderWinner: false,
      productionDefaultChanged: false,
      readOnly: true,
    },
  };
}

export async function readTranscriptEvaluationBoard(input: {
  prisma: any;
  actor: SessionAccessActor;
  generatedAt?: string;
}): Promise<TranscriptEvaluationBoard> {
  const rows = await input.prisma.transcriptEvaluationWindow.findMany({
    where: { room: sessionActorAccessWhere(input.actor) },
    orderBy: { approvedAt: "asc" },
    take: 500,
    select: {
      id: true,
      roomId: true,
      workload: true,
      conditionsJson: true,
      sourceDurationSeconds: true,
      sourceSha256: true,
      consentVersionSha256: true,
      referenceRevisionId: true,
      referenceContentSha256: true,
      referenceWordsJson: true,
      approvedByUserId: true,
      approvedAt: true,
      room: {
        select: {
          title: true,
          purpose: true,
          project: { select: { name: true, slug: true } },
        },
      },
      candidates: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          providerKey: true,
          providerName: true,
          model: true,
          adapterVersion: true,
          requestConfigSha256: true,
          requestConfigJson: true,
          metricsJson: true,
          speakerAttribution: true,
          timingGranularity: true,
          outcome: true,
          providerReceiptSha256: true,
          normalizedWordsJson: true,
          elapsedMilliseconds: true,
          estimatedCostUsd: true,
          errorCode: true,
          retryable: true,
          completedAt: true,
          policy: {
            select: {
              receiptSha256: true,
              policyJson: true,
              capturedAt: true,
            },
          },
          corrections: {
            orderBy: { observedAt: "asc" },
            select: {
              reviewerUserId: true,
              elapsedMilliseconds: true,
              operationCount: true,
              observedAt: true,
            },
          },
        },
      },
    },
  });
  return buildTranscriptEvaluationBoardFromRows(
    rows as TranscriptEvaluationBoardRow[],
    input.generatedAt ?? new Date().toISOString(),
  );
}
