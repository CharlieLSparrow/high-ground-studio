#!/usr/bin/env node
import fs from "node:fs";

const DEFAULT_BASE_URL = "https://nest.quipsly.com";
const DEFAULT_CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DEFAULT_TIMEOUT_MS = 30_000;
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "quipsly-reef";
const REQUIRED_REDIRECT_URI =
  process.env.QUIPSLY_FIREBASE_GOOGLE_REDIRECT_URI
  || `https://${FIREBASE_PROJECT_ID}.firebaseapp.com/__/auth/handler`;

const args = new Map(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, ...rawValue] = arg.slice(2).split("=");
      return [key, rawValue.length ? rawValue.join("=") : "1"];
    }),
);

const baseUrl = normalizeBaseUrl(
  args.get("base-url")
  || process.env.QUIPSLY_GOOGLE_OAUTH_SMOKE_BASE_URL
  || process.env.QUIPSLY_AUTH_READINESS_BASE_URL
  || DEFAULT_BASE_URL,
);
const headless = args.get("headed") === "1" || process.env.QUIPSLY_GOOGLE_OAUTH_SMOKE_HEADED === "1"
  ? false
  : true;
const timeoutMs = Number.parseInt(
  args.get("timeout-ms") || process.env.QUIPSLY_GOOGLE_OAUTH_SMOKE_TIMEOUT_MS || String(DEFAULT_TIMEOUT_MS),
  10,
) || DEFAULT_TIMEOUT_MS;
const chromePath =
  args.get("chrome")
  || process.env.GOOGLE_CHROME_BIN
  || process.env.CHROME_BIN
  || DEFAULT_CHROME_PATH;

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function printJson(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function redactUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const keep = new URL(`${url.origin}${url.pathname}`);
    for (const key of ["client_id", "flowName", "error", "error_description"]) {
      const value = url.searchParams.get(key);
      if (value) keep.searchParams.set(key, value);
    }
    return keep.toString();
  } catch {
    return "[unparseable-url]";
  }
}

function classifyGooglePage({ url, title, body }) {
  const haystack = `${url}\n${title}\n${body}`;
  const hasRedirectMismatch = /redirect_uri_mismatch|app's request is invalid|app sent an invalid request/i.test(haystack);
  const hasUnauthorizedDomain = /auth\/unauthorized-domain|unauthorized domain/i.test(haystack);
  const hasOperationNotAllowed = /auth\/operation-not-allowed|operation.*not.*allowed/i.test(haystack);
  const isGoogle = (() => {
    try {
      return new URL(url).hostname.endsWith("google.com");
    } catch {
      return false;
    }
  })();
  const reachedAccountFlow = isGoogle && !hasRedirectMismatch && !hasUnauthorizedDomain && !hasOperationNotAllowed;

  if (hasRedirectMismatch) return "redirect-uri-mismatch";
  if (hasUnauthorizedDomain) return "firebase-unauthorized-domain";
  if (hasOperationNotAllowed) return "firebase-provider-disabled";
  if (reachedAccountFlow) return "google-provider-accepted";
  return "unknown";
}

function failureAction(classification) {
  if (classification === "redirect-uri-mismatch") {
    return `Add ${REQUIRED_REDIRECT_URI} to the Authorized redirect URIs on the Google Auth Platform OAuth web client used by Firebase Auth.`;
  }
  if (classification === "firebase-unauthorized-domain") {
    return `Add ${new URL(baseUrl).hostname} to Firebase Auth authorized domains.`;
  }
  if (classification === "firebase-provider-disabled") {
    return "Enable the Google provider in Firebase Auth for the active Firebase project.";
  }
  return "Inspect the browser-visible Google/Firebase error and classify the provider layer before changing app code.";
}

async function clickGoogleButton(page) {
  const roleButtons = page.getByRole("button").filter({ hasText: /sign in with google/i });
  const roleButtonCount = await roleButtons.count().catch(() => 0);
  if (roleButtonCount >= 1) {
    await roleButtons.first().click({ timeout: timeoutMs });
    return;
  }

  const nativeButtons = page.locator("button").filter({ hasText: /sign in with google/i });
  const nativeButtonCount = await nativeButtons.count().catch(() => 0);
  if (nativeButtonCount >= 1) {
    await nativeButtons.first().click({ timeout: timeoutMs });
    return;
  }

  const ariaButtons = page.locator('[role="button"]').filter({ hasText: /sign in with google/i });
  const ariaButtonCount = await ariaButtons.count().catch(() => 0);
  if (ariaButtonCount >= 1) {
    await ariaButtons.first().click({ timeout: timeoutMs });
    return;
  }

  throw new Error("Could not find a clickable Sign in with Google control on /login.");
}

async function main() {
  const { chromium } = await import("playwright");

  const launchOptions = { headless };
  if (fs.existsSync(chromePath)) {
    launchOptions.executablePath = chromePath;
  }

  const browser = await chromium.launch(launchOptions);
  try {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/login?callbackUrl=%2Fprojects`, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });

    const [popup] = await Promise.all([
      page.waitForEvent("popup", { timeout: 20_000 }).catch(() => null),
      clickGoogleButton(page),
    ]);
    if (!popup) {
      await page.waitForURL(/accounts\.google\.com|firebaseapp\.com|nest\.quipsly\.com/, {
        timeout: 10_000,
        waitUntil: "domcontentloaded",
      }).catch(() => {});
    }

    await page.waitForTimeout(1500);
    const contextPages = page.context().pages();
    const googlePopup = contextPages.find((candidate) => {
      try {
        return candidate !== page && new URL(candidate.url()).hostname.endsWith("google.com");
      } catch {
        return false;
      }
    });
    const nonBlankPopup = contextPages.find((candidate) => (
      candidate !== page
      && candidate.url()
      && candidate.url() !== "about:blank"
    ));
    const target = googlePopup || popup || nonBlankPopup || page;
    await target.waitForLoadState("domcontentloaded", { timeout: timeoutMs }).catch(() => {});
    await target.waitForTimeout(2500);

    const url = target.url();
    const title = await target.title().catch(() => "");
    const body = await target.locator("body").innerText({ timeout: 5000 }).catch(() => "");
    const classification = classifyGooglePage({ url, title, body });
    const ok = classification === "google-provider-accepted";

    printJson({
      ok,
      baseUrl,
      classification,
      requiredRedirectUri: REQUIRED_REDIRECT_URI,
      currentPage: redactUrl(url),
      title,
      bodyExcerpt: body.replace(/\s+/g, " ").slice(0, 600),
      note: ok
        ? "Google accepted the Firebase redirect. This proves provider redirect configuration, not a full signed-in Quipsly session."
        : "No passwords, cookies, Firebase tokens, or secrets were used or printed.",
      nextAction: ok ? undefined : failureAction(classification),
    });

    process.exit(ok ? 0 : 1);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  printJson({
    ok: false,
    classification: "smoke-script-error",
    baseUrl,
    requiredRedirectUri: REQUIRED_REDIRECT_URI,
    error: String(error?.message || error).slice(0, 800),
    note: "No passwords, cookies, Firebase tokens, or secrets were used or printed.",
  });
  process.exit(1);
});
