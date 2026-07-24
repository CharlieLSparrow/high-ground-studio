/** @jest-environment node */

import fs from "node:fs";
import path from "node:path";

import { POST as distributionPost } from "./distribution/trigger/route";
import { POST as renderPost } from "./render/route";
import { POST as comfyPost } from "./comfy/route";
import { GET as ingestGet, POST as ingestPost } from "./ingest/route";
import { GET as sampleFeedGet } from "./public/podcast/rss/route";
import { POST as starterEpisodePost } from "./hgo/publish-starter-episodes/route";
import { POST as leadCapturePost } from "./marketing/leads/capture/route";
import { GET as agentsGet, POST as agentsPost } from "./agents/route";
import { POST as assetUploadPost } from "./assets/upload/route";
import { POST as callSignalingPost } from "./call-signaling/route";
import { POST as avatarGeneratePost } from "./marketing/avatars/generate/route";
import { POST as campaignPost } from "./marketing/campaigns/route";
import { POST as emailGeneratePost } from "./marketing/emails/generate/route";
import { POST as pageGeneratePost } from "./marketing/pages/generate/route";
import { POST as assistantLedgerPost } from "./quipsly-assistant/ledger/route";
import { POST as snippetPost } from "./snippets/route";
import { POST as storyboardPost } from "./storyboard/generate/route";

const cases = [
  ["distribution", distributionPost, 410, "LEGACY_DISTRIBUTION_TRIGGER_RETIRED"],
  ["render", renderPost, 501, "RECEIPT_BACKED_RENDER_WORKER_NOT_CONNECTED"],
  ["image workflow", comfyPost, 501, "VERIFIED_IMAGE_WORKFLOW_NOT_CONNECTED"],
  ["shell ingest post", ingestPost, 410, "LEGACY_SHELL_INGEST_RETIRED"],
  ["shell ingest get", ingestGet, 410, "LEGACY_SHELL_INGEST_RETIRED"],
  ["sample podcast feed", sampleFeedGet, 410, "STATIC_PROTOTYPE_PODCAST_FEED_RETIRED"],
  ["starter episode publisher", starterEpisodePost, 410, "STARTER_EPISODE_PUBLISHER_RETIRED"],
  ["prototype lead capture", leadCapturePost, 501, "VERIFIED_LEAD_CAPTURE_NOT_IMPLEMENTED"],
  ["agent registry read", agentsGet, 410, "UNSCOPED_AGENT_REGISTRY_RETIRED"],
  ["agent registry write", agentsPost, 410, "UNSCOPED_AGENT_REGISTRY_RETIRED"],
  ["asset upload", assetUploadPost, 410, "UNSCOPED_ASSET_UPLOAD_RETIRED"],
  ["call signaling", callSignalingPost, 410, "LEGACY_CALL_SIGNALING_RETIRED"],
  ["avatar generator", avatarGeneratePost, 410, "UNSCOPED_MARKETING_AI_RETIRED"],
  ["campaign creation", campaignPost, 410, "UNSCOPED_MARKETING_AI_RETIRED"],
  ["email generator", emailGeneratePost, 410, "UNSCOPED_MARKETING_AI_RETIRED"],
  ["page generator", pageGeneratePost, 410, "UNSCOPED_MARKETING_AI_RETIRED"],
  ["assistant ledger", assistantLedgerPost, 410, "UNSCOPED_ASSISTANT_LEDGER_RETIRED"],
  ["snippet ingest", snippetPost, 410, "HARDCODED_SNIPPET_INGEST_RETIRED"],
  ["storyboard generator", storyboardPost, 410, "UNSCOPED_STORYBOARD_GENERATOR_RETIRED"],
] as const;

describe("retired prototype capability boundaries", () => {
  it.each(cases)("keeps %s inert and returns explicit negative evidence", async (_name, handler, status, errorCode) => {
    const response = await handler();
    const payload = await response.json();

    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(payload).toEqual(expect.objectContaining({
      ok: false,
      errorCode,
      requestBodyRead: false,
      externalProcessStarted: false,
      providerCalled: false,
      jobQueued: false,
      artifactCreated: false,
      persistenceChanged: false,
    }));
  });

  it("contains no shell, filesystem, timer, fake output, or fake feed implementation", () => {
    const packageRoot = process.cwd().endsWith(path.join("apps", "quipsly"))
      ? process.cwd()
      : path.join(process.cwd(), "apps", "quipsly");
    const routeFiles = [
      "src/app/api/distribution/trigger/route.ts",
      "src/app/api/render/route.ts",
      "src/app/api/comfy/route.ts",
      "src/app/api/ingest/route.ts",
      "src/app/api/public/podcast/rss/route.ts",
      "src/app/api/hgo/publish-starter-episodes/route.ts",
      "src/app/api/marketing/leads/capture/route.ts",
      "src/app/api/agents/route.ts",
      "src/app/api/assets/upload/route.ts",
      "src/app/api/call-signaling/route.ts",
      "src/app/api/marketing/avatars/generate/route.ts",
      "src/app/api/marketing/campaigns/route.ts",
      "src/app/api/marketing/emails/generate/route.ts",
      "src/app/api/marketing/pages/generate/route.ts",
      "src/app/api/quipsly-assistant/ledger/route.ts",
      "src/app/api/snippets/route.ts",
      "src/app/api/storyboard/generate/route.ts",
    ];
    const forbidden = [
      /child_process|\bexec\s*\(/,
      /node:fs|writeFile|mkdirSync/,
      /setTimeout\s*\(/,
      /Math\.random/,
      /submitRenderJob/,
      /hgo-public-media\/mock/,
      /status:\s*["']published["']/,
      /success:\s*true|ok:\s*true/,
    ];

    for (const relativePath of routeFiles) {
      const source = fs.readFileSync(path.join(packageRoot, relativePath), "utf8");
      expect(source).toContain("retiredPrototypeCapabilityResponse");
      for (const pattern of forbidden) expect(source).not.toMatch(pattern);
    }
  });
});
