/** @jest-environment node */

import fs from "node:fs";
import path from "node:path";

import { GET as retiredCronGet, POST as retiredCronPost } from "../../cron/process-schedule/route";
import { POST as retiredHandoffPost } from "./route";
import {
  PublishingDispatcher,
  type QuipslyPublicPackage,
} from "@/lib/publishing/DestinationAdapters";
import {
  enqueuePublishJobs,
  enqueueRollbackJobs,
  processRollbackJobsBackground,
  processSyncJobsBackground,
} from "@/lib/publishing/JobRunner";
import { AnalyticsIngester } from "@/lib/publishing/AnalyticsIngester";
import { InboxManager } from "@/lib/publishing/InboxManager";

const samplePackage: QuipslyPublicPackage = {
  id: "package-1",
  projectId: "project-1",
  kind: "episode",
  title: "A real episode",
  summary: "Summary",
  body: "Body",
  media: { audioUrl: "https://media.invalid/episode.mp3" },
  beats: [],
  verifiedQuotes: [],
  metadata: { author: "Host" },
};

const retirementPayload = {
  ok: false,
  errorCode: "LEGACY_PUBLISHING_EXECUTION_RETIRED",
  error: "Legacy publishing execution is retired. No provider, filesystem, queue, or publication state was changed.",
  canonicalReadOnlySurface: "/publishing",
  replacementRequiresAuthenticatedActor: true,
  replacementRequiresScopedAccountOwnership: true,
  replacementRequiresPersistedAttemptReceipt: true,
  requestBodyRead: false,
  providerCalled: false,
  filesystemChanged: false,
  queueChanged: false,
  publicationStateChanged: false,
};

describe("retired publishing execution boundary", () => {
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("external access is forbidden"));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it.each([
    ["POST /api/handoff/publish", retiredHandoffPost],
    ["POST /api/cron/process-schedule", retiredCronPost],
    ["GET /api/cron/process-schedule", retiredCronGet],
  ] as const)("retires %s before auth, request parsing, queues, or provider work", async (_label, handler) => {
    const response = await handler();

    expect(response.status).toBe(410);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("location")).toBeNull();
    await expect(response.json()).resolves.toEqual(retirementPayload);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fails every legacy job-runner entry point before persistence or execution", async () => {
    const calls = [
      enqueuePublishJobs("candidate-1", ["youtube_v3"], "actor@example.com"),
      processSyncJobsBackground("candidate-1", ["job-1"]),
      enqueueRollbackJobs("candidate-1", ["youtube"], "actor@example.com"),
      processRollbackJobsBackground("candidate-1", ["job-1"]),
    ];

    for (const call of calls) {
      await expect(call).rejects.toMatchObject({
        name: "LegacyPublishingExecutionRetiredError",
        code: "LEGACY_PUBLISHING_EXECUTION_RETIRED",
      });
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns failure receipts from direct dispatcher publish and retract calls", async () => {
    const dispatcher = new PublishingDispatcher();
    const published = await dispatcher.dispatch(samplePackage, ["podcast_rss", "youtube_v3", "patreon_v2", "quiplore"]);
    const retracted = await dispatcher.retract(samplePackage, {
      podcast_rss: "rss-1",
      youtube_v3: "video-1",
      patreon_v2: "post-1",
      quiplore: "work-1",
    });

    for (const result of [...Object.values(published), ...Object.values(retracted)]) {
      expect(result).toMatchObject({
        success: false,
        error: "Legacy publishing adapters are retired. No provider, filesystem, or publication state was changed.",
      });
      expect(result).not.toHaveProperty("externalRefId");
      expect(result).not.toHaveProperty("url");
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects dormant analytics and inbox calls without inventing metrics or reply state", async () => {
    await expect(new AnalyticsIngester().ingestMetricsForCandidate("candidate-1")).rejects.toMatchObject({
      code: "LEGACY_PUBLISHING_EXECUTION_RETIRED",
    });
    await expect(new InboxManager().replyToInteraction("interaction-1", "A reply")).rejects.toMatchObject({
      code: "LEGACY_PUBLISHING_EXECUTION_RETIRED",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps routes, runners, and adapters free of provider and mutation implementations", () => {
    const packageRoot = process.cwd().endsWith(path.join("apps", "quipsly"))
      ? process.cwd()
      : path.join(process.cwd(), "apps", "quipsly");
    const routeFiles = [
      "src/app/api/handoff/publish/route.ts",
      "src/app/api/cron/process-schedule/route.ts",
      "src/lib/publishing/JobRunner.ts",
      "src/lib/publishing/AnalyticsIngester.ts",
      "src/lib/publishing/InboxManager.ts",
    ];
    const executionForbidden = [
      /\bfetch\s*\(/,
      /getPrismaClient/,
      /PublishingDispatcher/,
      /req(?:uest)?\.json\s*\(/,
      /node:fs/,
      /worldHubProviderSyncJob/,
      /worldHubAnalyticsSnapshot|worldHubSocialInteraction/,
      /writeFile|unlink/,
      /Math\.random|setTimeout/,
      /success:\s*true/,
    ];

    for (const relativePath of routeFiles) {
      const source = fs.readFileSync(path.join(packageRoot, relativePath), "utf8");
      for (const pattern of executionForbidden) expect(source).not.toMatch(pattern);
    }

    const adapterSource = fs.readFileSync(
      path.join(packageRoot, "src/lib/publishing/DestinationAdapters.ts"),
      "utf8",
    );
    for (const pattern of [
      /\bfetch\s*\(/,
      /getPrismaClient/,
      /(?:from|import\s*\()[^\n]*["']googleapis["']/,
      /PatreonApiClient/,
      /node:fs/,
      /\.youtube_token/,
      /YOUTUBE_REFRESH_TOKEN/,
      /\/api\/auth\/youtube/,
      /Math\.random|setTimeout/,
      /createPost|deletePost|videos\.(?:insert|update|list)/,
      /simulated|mock/i,
    ]) {
      expect(adapterSource).not.toMatch(pattern);
    }
  });
});
