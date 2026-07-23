import { failRetiredPublishingExecution } from "@/lib/server/retired-publishing-execution";

/**
 * Retired until metrics come from a verified provider receipt. The previous
 * implementation generated realistic-looking random values and persisted them
 * as analytics snapshots.
 */
export class AnalyticsIngester {
  async ingestMetricsForCandidate(candidateId: string) {
    void candidateId;
    return failRetiredPublishingExecution();
  }
}
