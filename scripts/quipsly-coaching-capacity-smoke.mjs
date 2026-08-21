#!/usr/bin/env node

import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

export function boundedVirtualCoachCount(value, fallback = 50) {
  const parsed =
    value === undefined || value === ""
      ? fallback
      : Number.parseInt(String(value), 10);
  assert(
    Number.isInteger(parsed) && parsed >= 1 && parsed <= 100,
    "QUIPSLY_COACHING_CAPACITY_VIRTUAL_COACHES must be an integer from 1 through 100.",
  );
  return parsed;
}

export function boundedArrivalWindowMilliseconds(value, fallback = 0) {
  const parsed =
    value === undefined || value === ""
      ? fallback
      : Number.parseInt(String(value), 10);
  assert(
    Number.isInteger(parsed) && parsed >= 0 && parsed <= 60_000,
    "QUIPSLY_COACHING_CAPACITY_ARRIVAL_WINDOW_MS must be an integer from 0 through 60000.",
  );
  return parsed;
}

export function coachStartDelayMilliseconds(
  coachIndex,
  virtualCoaches,
  arrivalWindowMilliseconds,
) {
  if (virtualCoaches <= 1 || arrivalWindowMilliseconds === 0) return 0;
  return Math.round(
    (coachIndex * arrivalWindowMilliseconds) / (virtualCoaches - 1),
  );
}

export function percentile(values, fraction) {
  assert(
    values.length > 0,
    "A latency percentile requires at least one sample.",
  );
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[
    Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)
  ];
}

export function allowedCapacityOrigin(rawValue, allowCloudRunPreview = false) {
  const origin = new URL(rawValue || "https://nest.quipsly.com").origin;
  const url = new URL(origin);
  const loopback =
    url.protocol === "http:" &&
    ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  const cloudRunPreview =
    allowCloudRunPreview &&
    url.protocol === "https:" &&
    /^([a-z0-9-]+---)?studio-[a-z0-9-]+-uc\.a\.run\.app$/.test(url.hostname);
  assert(
    origin === "https://nest.quipsly.com" || loopback || cloudRunPreview,
    "Capacity smoke accepts only production nest.quipsly.com, a loopback origin, or an explicitly authorized Studio Cloud Run preview.",
  );
  return origin;
}

async function jsonFetch(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => null);
  return { response, body };
}

async function main() {
  assert.equal(
    process.env.QUIPSLY_COACHING_CAPACITY_SMOKE,
    "1",
    "Set QUIPSLY_COACHING_CAPACITY_SMOKE=1 to authorize the bounded authenticated read probe.",
  );
  const baseURL = allowedCapacityOrigin(
    process.env.QUIPSLY_COACHING_CAPACITY_BASE_URL,
    process.env.QUIPSLY_COACHING_CAPACITY_ALLOW_CLOUD_RUN_PREVIEW === "1",
  );
  const email = String(process.env.QUIPSLY_AUTH_SMOKE_EMAIL || "")
    .trim()
    .toLowerCase();
  const password = String(process.env.QUIPSLY_AUTH_SMOKE_PASSWORD || "");
  assert(
    email && password,
    "Dedicated smoke email and password are required through environment variables.",
  );
  const virtualCoaches = boundedVirtualCoachCount(
    process.env.QUIPSLY_COACHING_CAPACITY_VIRTUAL_COACHES,
  );
  const arrivalWindowMilliseconds = boundedArrivalWindowMilliseconds(
    process.env.QUIPSLY_COACHING_CAPACITY_ARRIVAL_WINDOW_MS,
  );

  const config = await jsonFetch(`${baseURL}/api/mac/firebase-client-config`);
  assert(
    config.response.ok && config.body?.firebase?.apiKey,
    "Firebase client configuration was unavailable.",
  );
  const firebaseOrigin =
    process.env.QUIPSLY_FIREBASE_IDENTITY_TOOLKIT_ORIGIN ||
    "https://identitytoolkit.googleapis.com";
  const login = await jsonFetch(
    `${firebaseOrigin}/v1/accounts:signInWithPassword?key=${encodeURIComponent(config.body.firebase.apiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  assert(
    login.response.ok && login.body?.idToken,
    `Firebase smoke login failed with HTTP ${login.response.status}.`,
  );
  const session = await jsonFetch(`${baseURL}/api/auth/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken: login.body.idToken }),
  });
  const cookie = String(session.response.headers.get("set-cookie") || "").split(
    ";",
  )[0];
  assert(
    session.response.ok && cookie,
    `Quipsly session creation failed with HTTP ${session.response.status}.`,
  );

  const routes = [
    "/api/coaching/runway",
    "/api/mobile/capture/sessions",
    "/api/mobile/capture/today",
  ];
  const startedAt = Date.now();
  const results = await Promise.all(
    Array.from({ length: virtualCoaches }, async (_, coachIndex) => {
      const startDelay = coachStartDelayMilliseconds(
        coachIndex,
        virtualCoaches,
        arrivalWindowMilliseconds,
      );
      if (startDelay > 0) {
        await new Promise((resolve) => setTimeout(resolve, startDelay));
      }
      return Promise.all(
        routes.map(async (route) => {
          const requestStartedAt = performance.now();
          try {
            const result = await jsonFetch(`${baseURL}${route}`, {
              headers: { cookie },
            });
            return {
              coachIndex,
              route,
              status: result.response.status,
              ok: result.response.ok && result.body?.ok === true,
              responseBytes: Buffer.byteLength(JSON.stringify(result.body)),
              latencyMilliseconds: Math.round(
                performance.now() - requestStartedAt,
              ),
              error: null,
            };
          } catch (cause) {
            return {
              coachIndex,
              route,
              status: 0,
              ok: false,
              responseBytes: 0,
              latencyMilliseconds: Math.round(
                performance.now() - requestStartedAt,
              ),
              error: cause instanceof Error ? cause.name : "unknown",
            };
          }
        }),
      );
    }),
  );
  const samples = results.flat();
  const failures = samples.filter((sample) => !sample.ok);
  const latencies = samples.map((sample) => sample.latencyMilliseconds);
  const statusCounts = Object.fromEntries(
    [...new Set(samples.map((sample) => String(sample.status)))]
      .sort()
      .map((status) => [
        status,
        samples.filter((sample) => String(sample.status) === status).length,
      ]),
  );
  const routeBreakdown = Object.fromEntries(
    routes.map((route) => {
      const routeSamples = samples.filter((sample) => sample.route === route);
      const routeLatencies = routeSamples.map(
        (sample) => sample.latencyMilliseconds,
      );
      const routeResponseBytes = routeSamples.map(
        (sample) => sample.responseBytes,
      );
      return [
        route,
        {
          passed: routeSamples.filter((sample) => sample.ok).length,
          failed: routeSamples.filter((sample) => !sample.ok).length,
          latencyMilliseconds: {
            p50: percentile(routeLatencies, 0.5),
            p95: percentile(routeLatencies, 0.95),
            max: Math.max(...routeLatencies),
          },
          responseBytes: {
            p50: percentile(routeResponseBytes, 0.5),
            max: Math.max(...routeResponseBytes),
          },
        },
      ];
    }),
  );
  const packet = {
    ok: failures.length === 0,
    baseURL,
    virtualCoaches,
    arrivalWindowMilliseconds,
    routesPerCoach: routes.length,
    totalAuthenticatedReads: samples.length,
    failedAuthenticatedReads: failures.length,
    wallMilliseconds: Date.now() - startedAt,
    statusCounts,
    routeBreakdown,
    latencyMilliseconds: {
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
      p99: percentile(latencies, 0.99),
      max: Math.max(...latencies),
    },
    evidence: {
      authenticatedReadFloorProven: true,
      readOnlyRoutes: routes,
      dedicatedTestAccountUsed: true,
      distinctAccountsProven: false,
      concurrentCallsProven: false,
      recordingUploadLoadProven: false,
      minimallyInstructedHumanAcceptanceProven: false,
      productionScaleProven: false,
    },
    failures: failures.slice(0, 12),
  };
  console.log(JSON.stringify(packet, null, 2));
  if (!packet.ok) process.exitCode = 1;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : null;
if (invokedPath === import.meta.url) {
  await main();
}
