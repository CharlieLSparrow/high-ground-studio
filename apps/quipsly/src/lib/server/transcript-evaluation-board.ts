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
  realTimeFactor: number | null;
  estimatedCostUsd: number | null;
  correctionPassCount: number;
  correctionElapsedMilliseconds: number;
  correctionOperationCount: number;
  missingConditions: TranscriptEvaluationCondition[];
  failedConditions: TranscriptEvaluationCondition[];
  reasons: string[];
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
    corpusCoverageComplete: boolean;
  };
  workloads: TranscriptEvidenceWorkload[];
  sessions: TranscriptEvidenceSession[];
  nextEvidence: Array<{
    kind: "condition" | "provider" | "correction" | "failure";
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
      corpusCoverageComplete: parsedReport?.coverage.complete ?? false,
    },
    workloads,
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
