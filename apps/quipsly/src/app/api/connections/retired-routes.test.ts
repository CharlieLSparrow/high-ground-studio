/** @jest-environment node */

import fs from "node:fs";
import path from "node:path";

import { GET as legacyYouTubeAuthorize } from "../auth/youtube/route";
import { GET as legacyYouTubeCallback } from "../auth/youtube/callback/route";
import { GET as patreonAuthorize } from "./patreon/authorize/route";
import { GET as patreonCallback } from "./patreon/callback/route";
import { GET as twitterAuthorize } from "./twitter/authorize/route";
import { GET as twitterCallback } from "./twitter/callback/route";
import { GET as youtubeAuthorize } from "./youtube/authorize/route";
import { GET as youtubeCallback } from "./youtube/callback/route";

const routeCases = [
  ["/api/auth/youtube", legacyYouTubeAuthorize],
  ["/api/auth/youtube/callback", legacyYouTubeCallback],
  ["/api/connections/patreon/authorize", patreonAuthorize],
  ["/api/connections/patreon/callback", patreonCallback],
  ["/api/connections/twitter/authorize", twitterAuthorize],
  ["/api/connections/twitter/callback", twitterCallback],
  ["/api/connections/youtube/authorize", youtubeAuthorize],
  ["/api/connections/youtube/callback", youtubeCallback],
] as const;

describe("retired publishing connection routes", () => {
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("provider access is forbidden in this test"));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it.each(routeCases)("keeps %s inert and returns the same read-only retirement receipt", async (_route, handler) => {
    const response = await handler();
    const payload = await response.json();

    expect(response.status).toBe(410);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(payload).toEqual({
      ok: false,
      errorCode: "LEGACY_PUBLISHING_CONNECTION_ROUTE_RETIRED",
      error: "Legacy publishing account connections are retired. No provider authorization was started and no callback code was processed.",
      archivedSurface: "/publishing-suite/connections",
      canonicalReadOnlySurface: "/publishing",
      providerAuthorizationStarted: false,
      providerCalled: false,
      credentialsRead: false,
      callbackProcessed: false,
      dataWritten: false,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("contains no direct provider, credential, cookie, persistence, or redirect implementation", () => {
    const packageRoot = process.cwd().endsWith(path.join("apps", "quipsly"))
      ? process.cwd()
      : path.join(process.cwd(), "apps", "quipsly");
    const routeFiles = [
      "src/app/api/auth/youtube/route.ts",
      "src/app/api/auth/youtube/callback/route.ts",
      "src/app/api/connections/patreon/authorize/route.ts",
      "src/app/api/connections/patreon/callback/route.ts",
      "src/app/api/connections/twitter/authorize/route.ts",
      "src/app/api/connections/twitter/callback/route.ts",
      "src/app/api/connections/youtube/authorize/route.ts",
      "src/app/api/connections/youtube/callback/route.ts",
    ];
    const forbidden = [
      /\bfetch\s*\(/,
      /getPrismaClient/,
      /from\s+["']@\/auth["']/,
      /googleapis/,
      /node:fs/,
      /socialAccount/,
      /accessToken|refreshToken/,
      /\.cookies\b|from\s+["']next\/headers["']/,
      /NextResponse\.redirect/,
      /accounts\.google\.com|oauth2\.googleapis\.com|api\.twitter\.com|patreon\.com/,
      /process\.env\.(?:YOUTUBE|TWITTER|PATREON|GOOGLE)_/,
    ];

    for (const relativePath of routeFiles) {
      const source = fs.readFileSync(path.join(packageRoot, relativePath), "utf8");
      for (const pattern of forbidden) {
        expect(source).not.toMatch(pattern);
      }
      expect(source).toContain("retiredPublishingConnectionResponse");
    }
  });
});
