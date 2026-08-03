/** @jest-environment node */

import { loadLatestGoalReceiptProjection, TRANSCRIPT_GOAL_EVIDENCE_RECEIPT_KIND } from "./goal-receipt-projection";

describe("goal receipt projection", () => {
  it("keeps latest numeric progress and transcript evidence in separate bounded lanes", async () => {
    const occurredAt = new Date("2026-08-03T15:00:00.000Z");
    const progress = { id: "progress-1", goalId: "goal-1", kind: "MANUAL_CHECK_IN", progressPercent: 35, note: "Steady", evidenceJson: {}, occurredAt };
    const transcriptEvidence = { id: "evidence-1", goalId: "goal-1", kind: TRANSCRIPT_GOAL_EVIDENCE_RECEIPT_KIND, progressPercent: null, note: "Reviewed source", evidenceJson: {}, occurredAt };
    const queryRaw = jest.fn().mockResolvedValue([transcriptEvidence, progress]);

    const result = await loadLatestGoalReceiptProjection({ $queryRaw: queryRaw }, ["goal-1", "goal-1", ""]);

    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(result.get("goal-1")).toEqual({ progress, transcriptEvidence });
  });

  it("does not query when there are no canonical goal identities", async () => {
    const queryRaw = jest.fn();
    await expect(loadLatestGoalReceiptProjection({ $queryRaw: queryRaw }, [])).resolves.toEqual(new Map());
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
