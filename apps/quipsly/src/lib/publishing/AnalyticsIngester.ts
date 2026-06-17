import { getPrismaClient } from "@/lib/prisma";

export class AnalyticsIngester {
  /**
   * Fetches the latest engagement metrics from connected social platforms
   * and records them as snapshots in our database.
   */
  async ingestMetricsForCandidate(candidateId: string) {
    const prisma = getPrismaClient();

    // 1. Find all successful publish jobs for this candidate to get external references
    const jobs = await prisma.worldHubProviderSyncJob.findMany({
      where: {
        subjectType: "episode-candidate",
        subjectId: candidateId,
        status: "success",
        jobType: "publish",
      },
    });

    if (jobs.length === 0) {
      console.log(`[AnalyticsIngester] No successful publish jobs found for candidate ${candidateId}`);
      return;
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    for (const job of jobs) {
      const payload = job.resultJson as any;
      if (!payload || !payload.externalRefId) continue;

      const externalId = payload.externalRefId;
      const providerKey = job.providerKey;

      try {
        console.log(`[AnalyticsIngester] Fetching metrics for ${providerKey} (${externalId})`);
        
        // Mocking the external API fetch for now
        // In reality, this would call e.g. YouTube Data API `videos?part=statistics&id=${externalId}`
        const mockedMetrics = this.fetchMockMetrics(providerKey);

        // Store the snapshot
        await prisma.worldHubAnalyticsSnapshot.create({
          data: {
            source: providerKey,
            channel: "social_media",
            contentPath: externalId,
            periodStart: todayStart,
            periodEnd: todayEnd,
            metricsJson: mockedMetrics,
          },
        });
        
        console.log(`[AnalyticsIngester] Snapshot recorded for ${providerKey} (${externalId})`);

      } catch (error) {
        console.error(`[AnalyticsIngester] Failed to ingest metrics for ${providerKey} (${externalId}):`, error);
      }
    }
  }

  private fetchMockMetrics(providerKey: string) {
    // Generate realistic-looking mock data based on the platform
    const baseViews = Math.floor(Math.random() * 5000) + 100;
    
    if (providerKey === "youtube_v3") {
      return {
        views: baseViews,
        likes: Math.floor(baseViews * 0.05),
        comments: Math.floor(baseViews * 0.01),
        shares: Math.floor(baseViews * 0.005),
        averageWatchTimeSeconds: Math.floor(Math.random() * 300) + 60,
      };
    }

    if (providerKey === "x_twitter") {
      return {
        impressions: baseViews * 3,
        likes: Math.floor(baseViews * 0.1),
        retweets: Math.floor(baseViews * 0.02),
        replies: Math.floor(baseViews * 0.01),
        profileClicks: Math.floor(baseViews * 0.05),
      };
    }

    // Generic fallback
    return {
      views: baseViews,
      engagements: Math.floor(baseViews * 0.08),
    };
  }
}
