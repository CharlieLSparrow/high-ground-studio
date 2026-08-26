#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

import { requireLoopbackOrigin } from "./lib/retained-qa-browser.mjs";

assert.equal(
  process.env.QUIPSLY_COACHING_CAPACITY_REHEARSAL,
  "1",
  "Set QUIPSLY_COACHING_CAPACITY_REHEARSAL=1 to create disposable local capacity accounts.",
);

const baseURL = requireLoopbackOrigin(
  process.env.QUIPSLY_LOCAL_BASE_URL || "http://127.0.0.1:3012",
  "Coaching capacity rehearsal base URL",
);
const databaseURL = new URL(process.env.DATABASE_URL || "");
assert(
  ["postgres:", "postgresql:"].includes(databaseURL.protocol) &&
    ["127.0.0.1", "localhost", "[::1]"].includes(databaseURL.hostname),
  "Coaching capacity rehearsal requires loopback PostgreSQL.",
);
const firebaseHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const firebaseURL = new URL(`http://${firebaseHost}`);
assert(
  ["127.0.0.1", "localhost", "[::1]"].includes(firebaseURL.hostname) && Boolean(firebaseURL.port),
  "Coaching capacity rehearsal requires the loopback Firebase Auth emulator.",
);
const firebaseProject =
  process.env.QUIPSLY_LOCAL_FIREBASE_PROJECT ||
  process.env.FIREBASE_PROJECT_ID ||
  "quipsly-reef";
assert.match(firebaseProject, /^[a-z][a-z0-9-]{4,60}$/);
const requestedCount = Number(process.env.QUIPSLY_COACHING_CAPACITY_COUNT || 50);
assert(Number.isSafeInteger(requestedCount) && requestedCount >= 2 && requestedCount <= 100);

process.env.DATABASE_URL = databaseURL.toString();
process.env.FIREBASE_AUTH_EMULATOR_HOST = firebaseURL.host;

const batchId = `capacity-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
const artifactDirectory = path.resolve(
  process.env.QUIPSLY_COACHING_CAPACITY_ARTIFACT_DIR ||
    path.join(process.cwd(), "artifacts", "coaching-capacity", batchId),
);
const app = initializeApp({ projectId: firebaseProject }, `quipsly-${batchId}`);
const auth = getAuth(app);
const timings = [];

function percentile(values, value) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * value) - 1)];
}

function cookieFrom(response) {
  const values = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie")].filter(Boolean);
  for (const value of values) {
    const pair = String(value).split(";", 1)[0];
    if (/^(?:__Secure-)?session=/.test(pair)) return pair;
  }
  throw new Error("Quipsly did not return its server-session cookie.");
}

async function request(label, url, options = {}, expectedStatuses = [200]) {
  const startedAt = performance.now();
  let response;
  try {
    response = await fetch(new URL(url, baseURL), {
      ...options,
      signal: AbortSignal.timeout(45_000),
    });
  } catch (cause) {
    const reason = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
    timings.push({
      label,
      durationMs: Math.round(performance.now() - startedAt),
      status: 0,
      ok: false,
      error: reason.slice(0, 240),
    });
    throw new Error(`${label} did not return a response: ${reason}`, { cause });
  }
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {}
  const accepted = expectedStatuses.includes(response.status);
  timings.push({
    label,
    durationMs: Math.round(performance.now() - startedAt),
    status: response.status,
    ok: accepted,
    error: accepted ? null : text.slice(0, 240),
  });
  if (!accepted) {
    throw new Error(`${label} returned HTTP ${response.status}: ${text.slice(0, 600)}`);
  }
  return { response, payload, text };
}

async function firebaseIdToken(uid) {
  const token = await auth.createCustomToken(uid);
  const exchange = await request(
    "firebase-token-exchange",
    `${firebaseURL.origin}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=recovery-lab-api-key`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, returnSecureToken: true }),
    },
  );
  assert.equal(typeof exchange.payload?.idToken, "string");
  return exchange.payload.idToken;
}

async function createPersona(index) {
  const number = String(index + 1).padStart(3, "0");
  const coachEmail = `${batchId}-coach-${number}@dev.test`;
  const clientEmail = `${batchId}-client-${number}@dev.test`;
  const coachName = `Capacity Coach ${number}`;
  const clientName = `Capacity Client ${number}`;
  const user = await auth.createUser({
    email: coachEmail,
    emailVerified: true,
    displayName: coachName,
  });
  const idToken = await firebaseIdToken(user.uid);
  const session = await request("server-session", "/api/auth/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  assert.equal(session.payload?.success, true);
  return {
    index,
    coachEmail,
    clientEmail,
    coachName,
    clientName,
    cookie: cookieFrom(session.response),
  };
}

async function createPractice(persona) {
  const scheduledStart = new Date(Date.now() + 86_400_000 + persona.index * 120_000).toISOString();
  const created = await request("create-booking-room", "/api/coaching/runway", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: persona.cookie,
    },
    body: JSON.stringify({
      action: "create-booking-room",
      clientEmail: persona.clientEmail,
      clientName: persona.clientName,
      title: `Capacity coaching Session ${String(persona.index + 1).padStart(3, "0")}`,
      scheduledStart,
      durationMinutes: 45,
      timezone: "UTC",
      purpose: "COACHING",
      paymentPolicy: "MANUAL",
      currency: "USD",
    }),
  });
  assert.equal(created.payload?.ok, true);
  const result = created.payload?.result;
  assert(result?.bookingId && result?.callRoomId && result?.engagementId);

  const invitation = await request(
    "create-session-invitation",
    `/api/sessions/${encodeURIComponent(result.callRoomId)}/invitations`,
    {
      method: "POST",
      headers: { "content-type": "application/json", cookie: persona.cookie },
      body: JSON.stringify({
        email: persona.clientEmail,
        displayName: persona.clientName,
        role: "CLIENT",
        expiresInHours: 24 * 30,
        delivery: "EMAIL",
        requestId: randomUUID(),
      }),
    },
    [201],
  );
  assert.equal(invitation.payload?.ok, true);
  assert.equal(invitation.payload?.delivery?.status, "FAILED");
  assert.equal(invitation.payload?.delivery?.errorCode, "LOCAL_TEST_RECIPIENT");
  return { ...persona, ...result };
}

async function createSeriesProbe(practice) {
  const requestId = randomUUID();
  const body = JSON.stringify({
    action: "create-booking-series",
    requestId,
    clientEmail: practice.clientEmail,
    clientName: practice.clientName,
    title: "Capacity recurring coaching series",
    scheduledStart: new Date(Date.now() + 14 * 86_400_000).toISOString(),
    durationMinutes: 45,
    timezone: "UTC",
    purpose: "COACHING",
    paymentPolicy: "MANUAL",
    currency: "USD",
    frequency: "WEEKLY",
    intervalCount: 1,
    occurrenceCount: 4,
  });
  const create = () => request("create-booking-series", "/api/coaching/runway", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: practice.cookie },
    body,
  });
  const created = await create();
  assert.equal(created.payload?.ok, true);
  assert.equal(created.payload?.result?.occurrenceCount, 4);
  assert.equal(created.payload?.result?.occurrences?.length, 4);
  assert.equal(created.payload?.result?.idempotentReplay, false);
  const replay = await create();
  assert.equal(replay.payload?.result?.seriesId, created.payload?.result?.seriesId);
  assert.equal(replay.payload?.result?.idempotentReplay, true);
  assert.deepEqual(
    replay.payload?.result?.occurrences?.map((occurrence) => occurrence.callRoomId),
    created.payload?.result?.occurrences?.map((occurrence) => occurrence.callRoomId),
  );
  return {
    seriesId: created.payload.result.seriesId,
    occurrenceCount: created.payload.result.occurrenceCount,
    callRoomIds: created.payload.result.occurrences.map((occurrence) => occurrence.callRoomId),
  };
}

async function verifyPractice(practice, neighbor) {
  const headers = { cookie: practice.cookie };
  const [runway, sessions, ownWork, foreignWork, invitationRead] = await Promise.all([
    request("runway-read", "/api/coaching/runway", { headers }),
    request("session-list-read", "/api/mobile/capture/sessions", { headers }),
    request("own-engagement-read", `/api/coaching/engagements/${encodeURIComponent(practice.engagementId)}/work`, { headers }),
    request("foreign-engagement-refusal", `/api/coaching/engagements/${encodeURIComponent(neighbor.engagementId)}/work`, { headers }, [404]),
    request("invitation-read", `/api/sessions/${encodeURIComponent(practice.callRoomId)}/invitations`, { headers }),
  ]);
  assert.equal(runway.payload?.ok, true);
  assert.equal(sessions.payload?.ok, true);
  assert.equal(ownWork.payload?.ok, true);
  assert.equal(invitationRead.payload?.ok, true);
  assert(
    runway.payload.upcomingBookings?.some((booking) => booking.id === practice.bookingId),
    "A coach could not read back the booking created through their own product session.",
  );
  assert.equal(
    runway.payload?.practiceCommand?.schema,
    "quipsly-coaching-practice-command-v1",
    "A coach did not receive the canonical practice command projection.",
  );
  assert.equal(
    runway.payload?.practiceCommand?.deterministic,
    true,
    "A coach practice command was not deterministic.",
  );
  assert.equal(
    runway.payload?.practiceCommand?.externalSideEffects,
    false,
    "Reading a coach practice command claimed an external side effect.",
  );
  assert(
    runway.payload.practiceCommand.items?.some(
      (item) => item.bookingId === practice.bookingId || item.roomId === practice.callRoomId,
    ),
    "A coach practice command omitted its own exact Session.",
  );
  assert.equal(
    runway.payload.practiceCommand.items?.some(
      (item) => item.bookingId === neighbor.bookingId || item.roomId === neighbor.callRoomId,
    ),
    false,
    "A coach practice command leaked a neighboring practice.",
  );
  assert(
    sessions.payload.sessions?.some((session) => session.callRoomId === practice.callRoomId),
    "A coach could not read back the Session created through their own product session.",
  );
  assert.equal(
    JSON.stringify(sessions.payload).includes(neighbor.callRoomId),
    false,
    "A coach Session list leaked a neighboring practice room.",
  );
  assert.equal(
    foreignWork.text.includes(neighbor.engagementId),
    false,
    "A foreign-work refusal echoed the private neighboring engagement identifier.",
  );
}

async function main() {
  await request("warm-health", "/api/health");
  const startedAt = Date.now();
  let stage = "create-identities";
  let practices = [];
  let seriesProbe = null;
  let error = null;
  try {
    const personas = await Promise.all(
      Array.from({ length: requestedCount }, (_, index) => createPersona(index)),
    );
    stage = "create-practices";
    practices = await Promise.all(personas.map(createPractice));
    stage = "create-series-probe";
    seriesProbe = await createSeriesProbe(practices[0]);
    stage = "verify-isolation";
    await Promise.all(
      practices.map((practice, index) =>
        verifyPractice(practice, practices[(index + 1) % practices.length]),
      ),
    );
    stage = "complete";
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  }

  const durations = timings.map((timing) => timing.durationMs);
  const receipt = {
    schema: "quipsly-coaching-capacity-rehearsal-v1",
    ok: error === null && practices.length === requestedCount,
    localOnly: true,
    createdAt: new Date().toISOString(),
    batchId,
    requestedCoachCount: requestedCount,
    completedPracticeCount: practices.length,
    recurringSeriesProbe: seriesProbe
      ? {
          created: true,
          idempotentReplay: true,
          occurrenceCount: seriesProbe.occurrenceCount,
          callRoomCount: seriesProbe.callRoomIds.length,
        }
      : { created: false, idempotentReplay: false, occurrenceCount: 0, callRoomCount: 0 },
    stage,
    error,
    elapsedMs: Date.now() - startedAt,
    requestCount: timings.length,
    failedRequestCount: timings.filter((timing) => !timing.ok).length,
    statusCounts: Object.fromEntries(
      [...new Set(timings.map(({ status }) => String(status)))].sort().map((status) => [
        status,
        timings.filter((timing) => String(timing.status) === status).length,
      ]),
    ),
    latencyMs: {
      p50: percentile(durations, 0.5),
      p95: percentile(durations, 0.95),
      p99: percentile(durations, 0.99),
      maximum: Math.max(0, ...durations),
    },
    requestKinds: Object.fromEntries(
      [...new Set(timings.map(({ label }) => label))].sort().map((label) => {
        const values = timings.filter((timing) => timing.label === label).map((timing) => timing.durationMs);
        const samples = timings.filter((timing) => timing.label === label);
        return [label, {
          count: values.length,
          failed: samples.filter((timing) => !timing.ok).length,
          statuses: Object.fromEntries(
            [...new Set(samples.map(({ status }) => String(status)))].sort().map((status) => [
              status,
              samples.filter((timing) => String(timing.status) === status).length,
            ]),
          ),
          p95Ms: percentile(values, 0.95),
          maximumMs: Math.max(...values),
        }];
      }),
    ),
    failures: timings
      .filter((timing) => !timing.ok)
      .slice(0, 20)
      .map(({ label, status, durationMs, error: requestError }) => ({
        label,
        status,
        durationMs,
        error: requestError,
      })),
    boundaries: {
      productApiWritesOnly: true,
      directDatabaseWrites: false,
      disposableFirebaseAccounts: true,
      reservedLocalEmailDomain: true,
      externalInvitationMessagesSent: false,
      ringNeighborIsolationProbes: practices.length,
      rawSessionCookiesWrittenToArtifact: false,
      customTokensWrittenToArtifact: false,
      renderedNoviceExperienceProven: false,
      productionScaleProven: false,
      finiteSeriesCreatedAtomically: seriesProbe?.occurrenceCount === 4,
      finiteSeriesRetryWasIdempotent: Boolean(seriesProbe),
      canonicalPracticeCommandProjectedForEveryCoach:
        error === null && practices.length === requestedCount,
      practiceCommandRingNeighborIsolationProven:
        error === null && practices.length === requestedCount,
    },
  };
  await mkdir(artifactDirectory, { recursive: true, mode: 0o700 });
  const receiptPath = path.join(artifactDirectory, "capacity-rehearsal-receipt.json");
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  await chmod(receiptPath, 0o600);
  console.log(JSON.stringify({ ...receipt, receiptPath }, null, 2));
  if (!receipt.ok) throw new Error(error || "Capacity rehearsal was incomplete.");
}

try {
  await main();
} finally {
  await deleteApp(app);
}
