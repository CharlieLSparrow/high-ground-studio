import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyTestFlightPublicPage,
  normalizeTestFlightPublicLink,
  parsePublicLinkArguments,
  readTestFlightPublicLink,
} from "./quipsly-testflight-public-link-readback.mjs";

const appName = "Quipsly Capture";
const linkId = "XwRRcYUm";
const openHtml = `
  <html>
    <head><title>Join the Quipsly Capture beta - TestFlight - Apple</title></head>
    <body>
      <h1>Quipsly Capture Beta</h1>
      <a href="itms-beta://testflight.apple.com/join/XwRRcYUm">Start Testing</a>
    </body>
  </html>
`;

test("accepts only a canonical credential-free Apple public link", () => {
  assert.deepEqual(
    normalizeTestFlightPublicLink(
      "https://testflight.apple.com/join/XwRRcYUm",
    ),
    {
      url: "https://testflight.apple.com/join/XwRRcYUm",
      linkId,
    },
  );
  for (const invalid of [
    "http://testflight.apple.com/join/XwRRcYUm",
    "https://example.com/join/XwRRcYUm",
    "https://testflight.apple.com/join/short",
    "https://testflight.apple.com/join/XwRRcYUm?secret=value",
    "https://user:password@testflight.apple.com/join/XwRRcYUm",
  ]) {
    assert.throws(() => normalizeTestFlightPublicLink(invalid));
  }
});

test("parses explicit app, link, and receipt options", () => {
  assert.deepEqual(
    parsePublicLinkArguments([
      "--app-name",
      "Capture QA",
      "--public-link",
      "https://testflight.apple.com/join/Ab12Cd34",
      "--output",
      "/private/tmp/readback.json",
    ]),
    {
      appName: "Capture QA",
      publicLink: "https://testflight.apple.com/join/Ab12Cd34",
      outputPath: "/private/tmp/readback.json",
      help: false,
    },
  );
});

test("requires the exact app title, heading, and itms-beta handoff", () => {
  assert.deepEqual(
    classifyTestFlightPublicPage({ html: openHtml, appName, linkId }),
    {
      open: true,
      closed: false,
      titleMatches: true,
      headingMatches: true,
      handoffMatches: true,
      genericFallback: false,
      expectedTitle: "Join the Quipsly Capture beta - TestFlight - Apple",
    },
  );
  assert.equal(
    classifyTestFlightPublicPage({
      html: openHtml.replace("itms-beta://", "https://"),
      appName,
      linkId,
    }).open,
    false,
  );
});

test("classifies Apple's encoded closed page instead of trusting HTTP 200", () => {
  const page = classifyTestFlightPublicPage({
    html: `
      <title>TestFlight - Apple</title>
      <span>This beta isn&#39;t accepting any new testers right now.</span>
    `,
    appName,
    linkId,
  });
  assert.equal(page.open, false);
  assert.equal(page.closed, true);
  assert.equal(page.genericFallback, true);
});

test("returns a redacted delivery-boundary receipt for an open page", async () => {
  const receipt = await readTestFlightPublicLink(
    {
      appName,
      publicLink: "https://testflight.apple.com/join/XwRRcYUm",
      outputPath: "",
    },
    async (url, init) => {
      assert.equal(url.hostname, "testflight.apple.com");
      assert.match(url.searchParams.get("quipsly_readback"), /^\d+$/);
      assert.equal(init.redirect, "follow");
      assert.match(init.headers["User-Agent"], /iPhone/);
      return {
        status: 200,
        url: "https://testflight.apple.com/join/XwRRcYUm",
        text: async () => openHtml,
      };
    },
  );
  assert.deepEqual(receipt, {
    schema: "quipsly-testflight-public-link-readback-v1",
    checkedAt: receipt.checkedAt,
    ok: true,
    appName,
    linkId,
    canonicalUrl: "https://testflight.apple.com/join/XwRRcYUm",
    httpStatus: 200,
    finalHost: "testflight.apple.com",
    open: true,
    closed: false,
    titleMatches: true,
    headingMatches: true,
    handoffMatches: true,
    genericFallback: false,
    boundary:
      "Apple public TestFlight invitation page and exact itms-beta handoff",
  });
});

test("fails closed when Apple serves the closed page with HTTP 200", async () => {
  await assert.rejects(
    readTestFlightPublicLink(
      {
        appName,
        publicLink: "https://testflight.apple.com/join/XwRRcYUm",
        outputPath: "",
      },
      async () => ({
        status: 200,
        url: "https://testflight.apple.com/join/XwRRcYUm",
        text: async () =>
          "<span>This beta isn&#39;t accepting any new testers right now.</span>",
      }),
    ),
    /not accepting new testers/,
  );
});
