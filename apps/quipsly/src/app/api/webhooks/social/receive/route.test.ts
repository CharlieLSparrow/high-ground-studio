/** @jest-environment node */

import fs from "node:fs";
import path from "node:path";

import { POST } from "./route";

describe("social provider webhook truth boundary", () => {
  it("fails before body parsing or persistence when no verified provider contract exists", async () => {
    const response = await POST();

    expect(response.status).toBe(501);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      ok: false,
      errorCode: "VERIFIED_SOCIAL_WEBHOOK_NOT_IMPLEMENTED",
      error: "Social provider ingestion is unavailable until a signed, replay-safe webhook contract is implemented. Nothing was recorded.",
      verifiedProviderSignatureRequired: true,
      stableProviderEventIdRequired: true,
      requestBodyRead: false,
      providerStateClaimed: false,
      persistenceChanged: false,
    });
  });

  it("has no request parsing, invented provider state, or Prisma mutation implementation", () => {
    const packageRoot = process.cwd().endsWith(path.join("apps", "quipsly"))
      ? process.cwd()
      : path.join(process.cwd(), "apps", "quipsly");
    const source = fs.readFileSync(
      path.join(packageRoot, "src/app/api/webhooks/social/receive/route.ts"),
      "utf8",
    );

    for (const pattern of [
      /getPrismaClient/,
      /req(?:uest)?\.(?:json|text)\s*\(/,
      /worldHubSocialInteraction/,
      /upsert|create|update/,
      /Date\.now/,
      /x-social-platform/,
      /YouTube User|TwitterUser|New comment|New mention/,
    ]) {
      expect(source).not.toMatch(pattern);
    }
  });
});
