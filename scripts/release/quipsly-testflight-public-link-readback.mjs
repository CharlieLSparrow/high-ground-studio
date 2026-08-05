#!/usr/bin/env node

import { chmod, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { QUIPSLY_CAPTURE_RELEASE_TARGET } from "./quipsly-capture-release-target.mjs";

const DEFAULTS = Object.freeze({
  appName: QUIPSLY_CAPTURE_RELEASE_TARGET.appName,
  publicLink: QUIPSLY_CAPTURE_RELEASE_TARGET.publicLink,
});

function fail(message) {
  throw new Error(message);
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function takeValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) fail(`${flag} requires a value.`);
  return value;
}

export function parsePublicLinkArguments(argv) {
  const options = {
    appName: DEFAULTS.appName,
    publicLink: DEFAULTS.publicLink,
    outputPath: "",
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    // `pnpm <script> -- <args>` keeps the conventional separator in argv for
    // some pnpm versions. Treat it as syntax, not as an option that needs a
    // value, so the documented package-script invocation remains reliable.
    if (flag === "--") continue;
    if (flag === "--help" || flag === "-h") {
      options.help = true;
      continue;
    }
    const value = takeValue(argv, index, flag);
    if (flag === "--app-name") options.appName = value;
    else if (flag === "--public-link") options.publicLink = value;
    else if (flag === "--output") options.outputPath = value;
    else fail(`Unknown argument: ${flag}`);
    index += 1;
  }
  return options;
}

function usage() {
  return `Usage:
  node scripts/release/quipsly-testflight-public-link-readback.mjs [options]

Options:
  --app-name <name>       Expected TestFlight app name.
  --public-link <url>     Exact Apple public TestFlight invitation URL.
  --output <path>         Optional mode-0600 JSON receipt.

This is a read-only delivery-boundary check. It verifies Apple's uncached
public page says "Join the <app> beta" and exposes the exact TestFlight handoff.
`;
}

export function normalizeTestFlightPublicLink(value) {
  let parsed;
  try {
    parsed = new URL(clean(value));
  } catch {
    fail("The TestFlight public link must be a valid URL.");
  }
  if (
    parsed.protocol !== "https:"
    || parsed.hostname !== "testflight.apple.com"
    || parsed.username
    || parsed.password
    || parsed.port
    || parsed.search
    || parsed.hash
  ) {
    fail("The TestFlight public link must be a credential-free canonical Apple HTTPS URL.");
  }
  const match = parsed.pathname.match(/^\/join\/([A-Za-z0-9]{8})$/);
  if (!match) {
    fail("The TestFlight public link must use /join/<8-character-link-id>.");
  }
  return {
    url: parsed.toString(),
    linkId: match[1],
  };
}

function decodeHtmlText(value) {
  return String(value || "")
    .replaceAll("&#39;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

export function classifyTestFlightPublicPage({
  html,
  appName,
  linkId,
}) {
  const decoded = decodeHtmlText(html);
  const expectedTitle = `Join the ${clean(appName)} beta - TestFlight - Apple`;
  const expectedHeading = `${clean(appName)} Beta`;
  const handoff = `itms-beta://testflight.apple.com/join/${linkId}`;
  const closed =
    decoded.includes("This beta isn't accepting any new testers right now.")
    || decoded.includes("This beta is full.");
  const titleMatches = decoded.includes(`<title>${expectedTitle}</title>`);
  const headingMatches = decoded.includes(expectedHeading);
  const handoffMatches = decoded.includes(handoff);
  const genericFallback = decoded.includes("<title>TestFlight - Apple</title>");
  const open = !closed && titleMatches && headingMatches && handoffMatches;

  return {
    open,
    closed,
    titleMatches,
    headingMatches,
    handoffMatches,
    genericFallback,
    expectedTitle,
  };
}

async function writeReceipt(outputPath, receipt) {
  if (!clean(outputPath)) return;
  await writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await chmod(outputPath, 0o600);
}

export async function readTestFlightPublicLink(options, fetchImpl = fetch) {
  const appName = clean(options.appName);
  if (!appName || appName.length > 120) {
    fail("Expected app name must be between 1 and 120 characters.");
  }
  const link = normalizeTestFlightPublicLink(options.publicLink);
  const requestUrl = new URL(link.url);
  requestUrl.searchParams.set("quipsly_readback", `${Date.now()}`);
  const response = await fetchImpl(requestUrl, {
    redirect: "follow",
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 26_2 like Mac OS X) "
        + "AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1",
    },
  });
  const html = await response.text();
  const page = classifyTestFlightPublicPage({
    html,
    appName,
    linkId: link.linkId,
  });
  const receipt = {
    schema: "quipsly-testflight-public-link-readback-v1",
    checkedAt: new Date().toISOString(),
    ok: response.status === 200 && page.open,
    appName,
    linkId: link.linkId,
    canonicalUrl: link.url,
    httpStatus: response.status,
    finalHost: new URL(response.url || link.url).hostname,
    open: page.open,
    closed: page.closed,
    titleMatches: page.titleMatches,
    headingMatches: page.headingMatches,
    handoffMatches: page.handoffMatches,
    genericFallback: page.genericFallback,
    boundary:
      "Apple public TestFlight invitation page and exact itms-beta handoff",
  };
  await writeReceipt(options.outputPath, receipt);
  if (!receipt.ok) {
    fail(
      page.closed
        ? "Apple's public TestFlight page is not accepting new testers."
        : `TestFlight public-link delivery readback failed with HTTP ${response.status}.`,
    );
  }
  return receipt;
}

async function main() {
  const options = parsePublicLinkArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  const receipt = await readTestFlightPublicLink(options);
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  main().catch((error) => {
    process.stderr.write(
      `QUIPSLY_TESTFLIGHT_PUBLIC_LINK_READBACK_FAIL ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
    process.exit(1);
  });
}
