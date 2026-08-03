import { Prisma } from "@prisma/client";

export const TRANSCRIPT_GOAL_EVIDENCE_RECEIPT_KIND = "TRANSCRIPT_CANDIDATE_MERGED";

export type GoalProjectionReceipt = {
  id: string;
  goalId: string;
  kind: string;
  progressPercent: number | null;
  note: string | null;
  evidenceJson: unknown;
  occurredAt: Date;
};

export type GoalReceiptProjection = {
  progress: GoalProjectionReceipt | null;
  transcriptEvidence: GoalProjectionReceipt | null;
};

/**
 * Reads one latest numeric-progress receipt and one latest reviewed transcript
 * evidence receipt per goal. Keeping the two lanes separate prevents a stream
 * of evidence receipts from hiding canonical numeric progress (or vice versa)
 * while retaining a bounded two-row projection per goal.
 */
export async function loadLatestGoalReceiptProjection(
  prisma: { $queryRaw: <T = unknown>(query: Prisma.Sql) => Promise<T> },
  goalIds: string[],
) {
  const ids = [...new Set(goalIds.map((id) => id.trim()).filter(Boolean))].slice(0, 500);
  const projection = new Map<string, GoalReceiptProjection>();
  if (!ids.length) return projection;

  const rows = await prisma.$queryRaw<GoalProjectionReceipt[]>(Prisma.sql`
    WITH classified AS (
      SELECT receipt."id",
             receipt."goalId",
             receipt."kind",
             receipt."progressPercent",
             receipt."note",
             receipt."evidenceJson",
             receipt."occurredAt",
             CASE
               WHEN receipt."progressPercent" IS NOT NULL THEN 'progress'
               ELSE 'transcript-evidence'
             END AS "receiptClass"
      FROM "GoalProgressReceipt" receipt
      WHERE receipt."goalId" IN (${Prisma.join(ids)})
        AND (
          receipt."progressPercent" IS NOT NULL
          OR receipt."kind" = ${TRANSCRIPT_GOAL_EVIDENCE_RECEIPT_KIND}
        )
    )
    SELECT DISTINCT ON (classified."goalId", classified."receiptClass")
           classified."id",
           classified."goalId",
           classified."kind",
           classified."progressPercent",
           classified."note",
           classified."evidenceJson",
           classified."occurredAt"
    FROM classified
    ORDER BY classified."goalId", classified."receiptClass", classified."occurredAt" DESC, classified."id" DESC
  `);

  for (const row of rows) {
    const current = projection.get(row.goalId) ?? { progress: null, transcriptEvidence: null };
    if (typeof row.progressPercent === "number") current.progress = row;
    else if (row.kind === TRANSCRIPT_GOAL_EVIDENCE_RECEIPT_KIND) current.transcriptEvidence = row;
    projection.set(row.goalId, current);
  }
  return projection;
}
