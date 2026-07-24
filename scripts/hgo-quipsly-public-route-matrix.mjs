#!/usr/bin/env node

import {
  classifyPublicRouteFailure,
  summarizePublicRouteFailure,
} from "./lib/public-route-failure-classification.mjs";

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_RETRY_COUNT = 1;

const args = new Map(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, ...rawValue] = arg.slice(2).split("=");
      return [key, rawValue.length ? rawValue.join("=") : "1"];
    }),
);

const warnOnly = args.get("warn-only") === "1" || process.env.HGO_QUIPSLY_ROUTE_MATRIX_WARN_ONLY === "1";
const jsonOutput = args.get("json") === "1" || process.env.HGO_QUIPSLY_ROUTE_MATRIX_JSON === "1";
const timeoutMs =
  Number.parseInt(args.get("timeout-ms") || process.env.HGO_QUIPSLY_ROUTE_MATRIX_TIMEOUT_MS || String(DEFAULT_TIMEOUT_MS), 10) ||
  DEFAULT_TIMEOUT_MS;
const retryCount =
  Number.parseInt(args.get("retries") || process.env.HGO_QUIPSLY_ROUTE_MATRIX_RETRIES || String(DEFAULT_RETRY_COUNT), 10) ||
  DEFAULT_RETRY_COUNT;

const targets = [
  {
    id: "hgoRootCoaching",
    owner: "HighGroundOdyssey.com public doorway",
    url: base("HGO_ROOT_URL", "https://highgroundodyssey.com") + "/coaching",
    expectedFinalHost: "highgroundodyssey.com",
    accept: "text/html",
    requiredMarkers: ["Open Quipsly Booking", "Quipsly live packet", "Inspect packet", "Public handoff actions", "Quipsly Nest"],
    staleMarkers: ["Book a Session", "Donation-supported"],
    fixLane: "Deploy HighGroundOdyssey/apps/web, then smoke HGO /coaching.",
    note: "Customer-facing HGO coaching route. This should explain coaching and hand users to Quipsly-owned operational state.",
  },
  {
    id: "hgoAppCoaching",
    owner: "High Ground app service",
    url: base("HGO_APP_URL", "https://app.highgroundodyssey.com") + "/coaching",
    expectedFinalHost: "app.highgroundodyssey.com",
    accept: "text/html",
    requiredMarkers: ["Open Quipsly Booking", "Quipsly live packet", "Inspect packet", "Public handoff actions", "Quipsly Nest"],
    staleMarkers: ["Book a Session", "Donation-supported"],
    fixLane: "Deploy HighGroundOdyssey/apps/web service, then smoke app.highgroundodyssey.com /coaching.",
    note: "Operational HGO app route. If this is stale too, deploy apps/web before debugging root DNS or CDN routing.",
  },
  {
    id: "quipslyMarketingHome",
    owner: "Quipsly.com product education",
    url: base("QUIPSLY_MARKETING_URL", "https://quipsly.com") + "/",
    expectedFinalHost: "quipsly.com",
    accept: "text/html",
    requiredMarkers: ["Quipsly Research", "Quipsly Studio", "Quipsly Tower", "Storytellers", "Coaches", "Trainers", "Researchers"],
    staleMarkers: [],
    fixLane: "Deploy Quipsly/apps/quipsly marketing source only if product education markers drift.",
    note: "Marketing/product funnel. This should teach the Research, Studio, Tower model without owning app state.",
  },
  {
    id: "quipslyMarketingCoaching",
    owner: "Quipsly.com coaching product education",
    url: base("QUIPSLY_MARKETING_URL", "https://quipsly.com") + "/coaching",
    expectedFinalHost: "quipsly.com",
    accept: "text/html",
    requiredMarkers: [
      "Coaching conversations should become useful without becoming slippery.",
      "High Ground Odyssey",
      "Quipsly Nest",
      "Quipsly Research",
      "Quipsly Studio",
      "Quipsly Tower",
      "Public handoff actions",
      "explicit consent",
      "source of truth",
    ],
    staleMarkers: ["Your private creative workspace lives here.", "Sign in to Nest"],
    fixLane: "Deploy Quipsly/apps/quipsly proxy and marketing source; /coaching must stay on quipsly.com and rewrite to /public/coaching.",
    note: "Public Quipsly coaching route. This should teach the coaching/capture product lane and must not fall through to the private Nest app fallback.",
  },
  {
    id: "nestPublicCoachingPacket",
    owner: "Nest operational truth packet",
    url: base("NEST_URL", "https://nest.quipsly.com") + "/api/coaching/public?source=route-matrix",
    expectedFinalHost: "nest.quipsly.com",
    accept: "application/json",
    requiredJson: {
      ok: true,
      packetKind: "quipsly-public-coaching-handoff-v1",
    },
    requiredMarkers: [
      "primaryCallPath",
      "Quipsly-owned in-app session rooms",
      "nativeCallPresentation",
      "Start CallKit integration from the first native-room workflow",
      "fallbackCallImport",
      "Phone",
    ],
    staleMarkers: ["This page could not be found"],
    fixLane: "Deploy Nest/apps/quipsly so /api/coaching/public exists on the live service.",
    note: "Side-effect-free public JSON packet. HGO and Quipsly can consume this without duplicating business logic.",
  },
  {
    id: "nestMobileCaptureReadiness",
    owner: "Nest mobile capture readiness",
    url: base("NEST_URL", "https://nest.quipsly.com") + "/api/mobile/capture/readiness",
    expectedFinalHost: "nest.quipsly.com",
    accept: "application/json",
    requiredJson: {
      ok: true,
    },
    requiredMarkers: [
      "callArchitecture",
      "primaryPath",
      "Quipsly-owned in-app session rooms",
      "nativePresentation",
      "Start CallKit integration from the first native-room workflow",
      "fallbackImport",
      "phoneCallBoundary",
    ],
    staleMarkers: ["This page could not be found"],
    fixLane: "Deploy Nest/apps/quipsly so /api/mobile/capture/readiness exists on the live service.",
    note: "Side-effect-free capture readiness JSON. App Store review, native capture, and agents need this route before treating capture as live-ready.",
  },
  {
    id: "nestMobileCaptureReviewDigestAuth",
    owner: "Nest mobile capture review digest",
    url: base("NEST_URL", "https://nest.quipsly.com") + "/api/mobile/capture/review-digest",
    expectedFinalHost: "nest.quipsly.com",
    accept: "application/json",
    expectedStatus: 401,
    requiredJson: {
      ok: false,
      error: "Sign in before loading the mobile capture review digest.",
    },
    staleMarkers: ["This page could not be found"],
    fixLane: "Deploy Nest/apps/quipsly so /api/mobile/capture/review-digest returns calm auth JSON instead of stale 404 HTML.",
    note: "Authenticated side-effect-free review digest. Unauthenticated live smoke should prove the route exists by returning calm JSON auth, not stale 404 HTML.",
  },
];

function base(envName, fallback) {
  return String(process.env[envName] || args.get(envName.toLowerCase().replaceAll("_", "-")) || fallback).replace(/\/+$/, "");
}

function snippet(raw) {
  return String(raw || "").replace(/\s+/g, " ").slice(0, 360);
}

function parseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function hasExpectedJson(json, expected) {
  if (!json || typeof json !== "object" || Array.isArray(json)) return false;
  return Object.entries(expected).every(([key, value]) => json[key] === value);
}

async function request(target) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(target.url, {
      method: "GET",
      headers: { Accept: target.accept },
      redirect: "follow",
      signal: controller.signal,
    });
    const raw = await response.text();
    const json = parseJson(raw);
    return {
      ok: true,
      status: response.status,
      contentType: response.headers.get("content-type") || "",
      server: response.headers.get("server") || "",
      finalUrl: response.url,
      redirected: response.redirected,
      raw,
      json,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      contentType: "",
      server: "",
      finalUrl: target.url,
      redirected: false,
      raw: "",
      json: null,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function shouldRetry(result) {
  if (result.ok && result.status > 0) return false;
  return /abort|timeout|network|fetch|ECONNRESET|ETIMEDOUT|ENOTFOUND/i.test(
    result.error || "",
  );
}

async function requestWithRetry(target) {
  const attempts = [];

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    const result = await request(target);
    attempts.push({
      status: result.status,
      ok: result.ok,
      error: result.error || null,
    });

    if (!shouldRetry(result) || attempt >= retryCount) {
      return {
        ...result,
        attempts,
      };
    }
  }

  return {
    ok: false,
    status: 0,
    contentType: "",
    server: "",
    finalUrl: target.url,
    redirected: false,
    raw: "",
    json: null,
    error: "Request retry loop ended without a result.",
    attempts,
  };
}

async function checkTarget(target) {
  const result = await requestWithRetry(target);
  const raw = result.raw || "";
  const missingMarkers = (target.requiredMarkers || []).filter((marker) => !raw.includes(marker));
  const presentStaleMarkers = (target.staleMarkers || []).filter((marker) => raw.includes(marker));
  const jsonMatches = target.requiredJson ? hasExpectedJson(result.json, target.requiredJson) : true;
  const expectedStatus = target.expectedStatus || 200;
  const finalHost = result.finalUrl ? new URL(result.finalUrl).host : null;
  const finalHostMatches = target.expectedFinalHost ? finalHost === target.expectedFinalHost : true;
  const passed =
    result.ok &&
    result.status === expectedStatus &&
    finalHostMatches &&
    missingMarkers.length === 0 &&
    presentStaleMarkers.length === 0 &&
    jsonMatches;

  const check = {
    id: target.id,
    owner: target.owner,
    url: target.url,
    status: passed ? "pass" : "fail",
    httpStatus: result.status,
    contentType: result.contentType,
    server: result.server,
    finalUrl: result.finalUrl || target.url,
    redirected: Boolean(result.redirected),
    expectedFinalHost: target.expectedFinalHost || null,
    finalHost,
    finalHostMatches,
    note: target.note,
    missingMarkers,
    presentStaleMarkers,
    expectedStatus,
    expectedJson: target.requiredJson || null,
    jsonMatches,
    error: result.error || null,
    attempts: result.attempts || [],
    body: result.json || snippet(raw),
  };

  return {
    ...check,
    failureSummary: passed ? null : summarizePublicRouteFailure(check),
    ...classifyPublicRouteFailure(check, target),
  };
}

async function main() {
  const checks = [];
  for (const target of targets) {
    checks.push(await checkTarget(target));
  }

  const failed = checks.filter((check) => check.status !== "pass");
  const report = {
    ok: failed.length === 0,
    warnOnly,
    checkedAt: new Date().toISOString(),
    invariant:
      "HighGroundOdyssey.com teaches and routes. Quipsly.com educates and funnels. Nest owns operational coaching/capture truth through shared side-effect-free contracts.",
    checks,
  };

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`HGO/Quipsly public route matrix: ${report.ok ? "PASS" : "FAIL"}`);
    for (const check of checks) {
      const marker = check.status === "pass" ? "PASS" : "FAIL";
      console.log(`${marker} ${check.id} (${check.httpStatus}) ${check.url}`);
      if (check.redirected || !check.finalHostMatches) {
        console.log(`  final URL: ${check.finalUrl}`);
      }
      if (check.status !== "pass") {
        console.log(`  ${check.failureSummary || summarizePublicRouteFailure(check)}`);
        console.log(`  likely: ${check.likelyCause}`);
        console.log(`  next: ${check.nextAction}`);
      }
    }
    if (warnOnly && !report.ok) {
      console.log("warn-only mode: route drift reported without nonzero exit.");
    }
  }

  if (!report.ok && !warnOnly) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
