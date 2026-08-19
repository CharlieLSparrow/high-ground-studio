#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const repoRoot = process.cwd();
const requireFromQuipsly = createRequire(new URL("../apps/quipsly/package.json", import.meta.url));
const { PrismaClient } = requireFromQuipsly("@prisma/client");
const { PrismaPg } = requireFromQuipsly("@prisma/adapter-pg");

const args = new Map(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, ...rawValue] = arg.slice(2).split("=");
      return [key, rawValue.length ? rawValue.join("=") : "1"];
    }),
);

function readDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const values = {};
  const text = fs.readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

function applyCloudSqlProxyRewrite(env) {
  const proxyPort = env.QUIPSLY_SMOKE_CLOUD_SQL_PROXY_PORT?.trim();
  if (!proxyPort || !env.DATABASE_URL) return env;

  const url = new URL(env.DATABASE_URL);
  const socketHost = url.searchParams.get("host") || "";
  if (!socketHost.startsWith("/cloudsql/")) return env;

  url.hostname = "127.0.0.1";
  url.port = proxyPort;
  url.searchParams.delete("host");

  return {
    ...env,
    DATABASE_URL: url.toString(),
  };
}

function mergedEnv() {
  const extraEnvFiles = String(
    args.get("env-files") || process.env.QUIPSLY_SMOKE_ENV_FILES || "",
  )
    .split(path.delimiter)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => path.resolve(repoRoot, value));
  const env = {
    ...readDotEnv(path.join(repoRoot, ".env")),
    ...readDotEnv(path.join(repoRoot, ".env.local")),
    ...readDotEnv(path.join(repoRoot, "apps/quipsly/.env")),
    ...readDotEnv(path.join(repoRoot, "apps/quipsly/.env.local")),
    ...Object.assign({}, ...extraEnvFiles.map(readDotEnv)),
    ...process.env,
  };

  if (!env.FIREBASE_PROJECT_ID && env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
    env.FIREBASE_PROJECT_ID = env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  }

  return applyCloudSqlProxyRewrite(env);
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function baseUrlFromEnv(env) {
  return normalizeBaseUrl(
    args.get("base-url")
      || env.QUIPSLY_COACHING_SMOKE_BASE_URL
      || env.QUIPSLY_AUTH_SMOKE_BASE_URL
      || "http://127.0.0.1:3000",
  );
}

function assert(condition, message, details = {}) {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
  }
}

function requiredEnv(env, name) {
  const value = env[name];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function prismaConnectionTimeoutMillis(env) {
  return Number.parseInt(env.PRISMA_PG_CONNECTION_TIMEOUT_MS || "20000", 10) || 20_000;
}

function createPrisma(env) {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: env.DATABASE_URL,
      max: Number.parseInt(env.PRISMA_PG_POOL_MAX || "2", 10) || 2,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: prismaConnectionTimeoutMillis(env),
    }),
    log: ["error"],
  });
}

function firebaseProjectId(env) {
  return env.FIREBASE_PROJECT_ID || env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "quipsly-reef";
}

function ensureFirebaseAdmin(env) {
  if (!getApps().length) initializeApp({ projectId: firebaseProjectId(env) });
  return getAuth();
}

function slugifyEmailForHomeNest(email) {
  return email
    .toLowerCase()
    .trim()
    .replace(/@/g, "-at-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

function isGeneratedCoachingEmail(email) {
  return /^codex-coaching-(coach|client)-[a-f0-9]{8}@dev\.test$/i.test(String(email || "").trim());
}

function redactGeneratedEmail(email) {
  return String(email || "").replace(/^codex-coaching-(coach|client)-([a-f0-9]{4})[a-f0-9]{4}/i, "codex-coaching-$1-$2****");
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = {};
  try {
    body = JSON.parse(text);
  } catch {
    body = { unparsedBodyPrefix: text.slice(0, 160) };
  }
  return { response, body, text };
}

function unfoldIcs(value) {
  return String(value || "").replace(/\r\n[ \t]/g, "");
}

function calendarProperty(value, name) {
  const match = unfoldIcs(value).match(new RegExp(`^${name}:(.+)$`, "m"));
  return match?.[1]?.trim() || "";
}

function assertPrivateCalendarExport(result, {
  expectedStatus = "CONFIRMED",
  forbiddenValues = [],
} = {}) {
  const contentType = result.response.headers.get("content-type") || "";
  const cacheControl = result.response.headers.get("cache-control") || "";
  const contentDisposition = result.response.headers.get("content-disposition") || "";
  const unfolded = unfoldIcs(result.text);
  assert(
    result.response.status === 200 && contentType.includes("text/calendar"),
    `Private coaching calendar export failed. HTTP ${result.response.status}`,
    { contentType, bodyPrefix: result.text.slice(0, 160) },
  );
  assert(cacheControl === "private, no-store", "Coaching calendar export must never be cached.", {
    cacheControl,
  });
  assert(
    /attachment;\s*filename="quipsly-coaching-[^"]+\.ics"/i.test(contentDisposition),
    "Coaching calendar export did not provide a safe .ics attachment filename.",
    { contentDisposition },
  );
  assert(result.text.includes("\r\n"), "Coaching calendar export must use CRLF line endings.");
  assert(unfolded.includes("BEGIN:VCALENDAR") && unfolded.includes("END:VCALENDAR"), "Calendar envelope is incomplete.");
  assert(calendarProperty(result.text, "UID"), "Calendar export has no stable UID.");
  assert(calendarProperty(result.text, "DTSTART"), "Calendar export has no start time.");
  assert(calendarProperty(result.text, "DTEND"), "Calendar export has no end time.");
  assert(
    calendarProperty(result.text, "STATUS") === expectedStatus,
    `Calendar export status was not ${expectedStatus}.`,
    { actual: calendarProperty(result.text, "STATUS") },
  );
  assert(
    unfolded.includes("Private notes\\, transcript text\\, goals\\, and recordings are not included"),
    "Calendar export lost its private-content boundary notice.",
  );
  for (const forbiddenValue of forbiddenValues.filter(Boolean)) {
    assert(
      !result.text.toLowerCase().includes(String(forbiddenValue).toLowerCase()),
      "Calendar export leaked a forbidden private value.",
      { forbiddenValueKind: "generated-test-identity" },
    );
  }
  return {
    uid: calendarProperty(result.text, "UID"),
    startsAt: calendarProperty(result.text, "DTSTART"),
    status: calendarProperty(result.text, "STATUS"),
  };
}

async function discoverCurrentConsentPresentation(baseUrl, idToken, callRoomId, participantId) {
  const result = await requestJson(`${baseUrl}/api/mobile/capture/consent`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ callRoomId, participantId, consentAction: "GRANT" }),
  });
  const policy = result.body?.currentPolicy || {};
  assert(
    result.response.status === 409 &&
      result.body?.errorCode === "CURRENT_CONSENT_PRESENTATION_REQUIRED" &&
      policy.version &&
      policy.text &&
      /^[a-f0-9]{64}$/i.test(String(policy.sha256 || "")) &&
      policy.surface === "quipsly-capture-consent-v2" &&
      policy.presentationVersion === 1,
    "Generated client could not discover the current consent presentation contract.",
    {
      status: result.response.status,
      errorCode: result.body?.errorCode || null,
      policyVersionPresent: Boolean(policy.version),
      policyTextHashPresent: /^[a-f0-9]{64}$/i.test(String(policy.sha256 || "")),
    },
  );
  return policy;
}

async function assertServerFirebaseAdminPreflight(baseUrl) {
  const preflight = await requestJson(`${baseUrl}/api/auth/firebase-admin-preflight`);
  if (preflight.response.status === 200 && preflight.body?.ok === true) return;

  if (preflight.response.status === 503 && preflight.body?.error === "Firebase Admin credential unavailable") {
    throw new Error(
      [
        "Server Firebase Admin preflight failed before generated coaching smoke.",
        preflight.body?.action || "Refresh ADC or provide server Firebase Admin credentials.",
        preflight.body?.firebaseAdminRuntime
          ? `Runtime: ${JSON.stringify(preflight.body.firebaseAdminRuntime)}`
          : "",
      ].filter(Boolean).join(" "),
    );
  }

  throw new Error(
    `Server Firebase Admin preflight returned HTTP ${preflight.response.status}: ${preflight.text.slice(0, 160)}`,
  );
}

async function fetchFirebaseApiKey(env, baseUrl) {
  if (env.QUIPSLY_COACHING_SMOKE_FIREBASE_API_KEY) return env.QUIPSLY_COACHING_SMOKE_FIREBASE_API_KEY;
  if (env.NEXT_PUBLIC_FIREBASE_API_KEY) return env.NEXT_PUBLIC_FIREBASE_API_KEY;

  const config = await requestJson(`${baseUrl}/api/mac/firebase-client-config`);
  assert(
    config.response.status === 200 && config.body?.ok === true && config.body?.firebase?.apiKey,
    `Firebase client config endpoint did not return an API key. HTTP ${config.response.status}`,
    { body: config.body },
  );
  return config.body.firebase.apiKey;
}

async function firebaseVerifiedTestSignup(env, baseUrl, email, password) {
  await ensureFirebaseAdmin(env).createUser({
    email,
    password,
    displayName: "Codex Generated Coaching Smoke",
    emailVerified: true,
    disabled: false,
  });
  const firebaseApiKey = await fetchFirebaseApiKey(env, baseUrl);
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(firebaseApiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const body = await response.json();
  assert(
    response.ok && body.idToken && body.localId,
    `Firebase generated verified coaching login failed with HTTP ${response.status}`,
    { firebaseErrorCode: body?.error?.message || undefined },
  );
  return body;
}

async function deleteFirebaseUserWithRest(env, baseUrl, idToken) {
  if (!idToken) return false;
  const firebaseApiKey = await fetchFirebaseApiKey(env, baseUrl);
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${encodeURIComponent(firebaseApiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken }),
    },
  );

  if (response.ok) return true;
  const body = await response.json().catch(() => ({}));
  const code = body?.error?.message || "";
  if (code === "USER_NOT_FOUND" || code === "USER_NOT_FOUND : User not found") return false;
  throw new Error(`Firebase REST cleanup failed with HTTP ${response.status}: ${code || "unknown error"}`);
}

async function cleanupGeneratedCoachingArtifacts(env, baseUrl, coachEmail, clientEmail, firebaseDeleteIdTokens) {
  if (env.QUIPSLY_COACHING_SMOKE_KEEP_ARTIFACTS === "1" || args.get("keep-artifacts") === "1") {
    return { skipped: "QUIPSLY_COACHING_SMOKE_KEEP_ARTIFACTS=1 or --keep-artifacts" };
  }

  for (const email of [coachEmail, clientEmail]) {
    if (!isGeneratedCoachingEmail(email)) {
      throw new Error(`Refusing to clean up non-generated coaching smoke email: ${email}`);
    }
  }

  const cleanup = {
    deletedHolds: 0,
    deletedCalendarLinks: 0,
    deletedCheckoutLedgers: 0,
    deletedCallRooms: 0,
    deletedBookings: 0,
    deletedAppointments: 0,
    deletedPaymentRecords: 0,
    deletedEngagements: 0,
    deletedInvites: 0,
    deletedGrants: 0,
    deletedHomeProjects: 0,
    deletedMemberships: 0,
    deletedUsers: 0,
    deletedFirebaseUserViaRest: false,
    deletedFirebaseUsersViaRest: 0,
    deletedFirebaseUsersViaAdmin: 0,
  };

  const prisma = createPrisma(env);
  try {
    const generatedEmails = [coachEmail, clientEmail];
    const users = await prisma.user.findMany({
      where: { OR: generatedEmails.map((email) => ({ primaryEmail: email })) },
      select: { id: true, primaryEmail: true },
    });
    const userIds = users.map((user) => user.id);
    const engagements = userIds.length
      ? await prisma.coachingEngagement.findMany({
          where: {
            OR: [
              { createdByUserId: { in: userIds } },
              { primaryClientUserId: { in: userIds } },
              { primaryCoachUserId: { in: userIds } },
            ],
          },
          select: { id: true },
        })
      : [];
    const engagementIds = engagements.map((engagement) => engagement.id);
    const bookings = userIds.length
      ? await prisma.coachingBooking.findMany({
          where: {
            OR: [
              { clientUserId: { in: userIds } },
              { coachUserId: { in: userIds } },
            ],
          },
          select: { id: true, appointmentId: true, paymentRecordId: true },
        })
      : [];
    const bookingIds = bookings.map((booking) => booking.id);
    const appointmentIds = bookings.map((booking) => booking.appointmentId).filter(Boolean);
    const paymentRecordIds = bookings.map((booking) => booking.paymentRecordId).filter(Boolean);
    const rooms = bookingIds.length || userIds.length
      ? await prisma.callRoom.findMany({
          where: {
            OR: [
              { bookingId: { in: bookingIds } },
              { createdByUserId: { in: userIds } },
            ],
          },
          select: { id: true },
        })
      : [];
    const roomIds = rooms.map((room) => room.id);

    cleanup.deletedHolds = (await prisma.bookingHold.deleteMany({
      where: {
        OR: [
          { contactEmail: { in: generatedEmails } },
          { clientUserId: { in: userIds } },
          { convertedBookingId: { in: bookingIds } },
        ],
      },
    })).count;

    cleanup.deletedCalendarLinks = (await prisma.calendarEventLink.deleteMany({
      where: {
        OR: [
          { bookingId: { in: bookingIds } },
          { roomId: { in: roomIds } },
        ],
      },
    })).count;
    cleanup.deletedCheckoutLedgers = (await prisma.stripeCheckoutSessionLedger.deleteMany({
      where: {
        OR: [
          { bookingId: { in: bookingIds } },
          { paymentRecordId: { in: paymentRecordIds } },
        ],
      },
    })).count;
    cleanup.deletedCallRooms = (await prisma.callRoom.deleteMany({ where: { id: { in: roomIds } } })).count;
    cleanup.deletedBookings = (await prisma.coachingBooking.deleteMany({ where: { id: { in: bookingIds } } })).count;
    cleanup.deletedAppointments = (await prisma.appointment.deleteMany({
      where: {
        OR: [
          { id: { in: appointmentIds } },
          { clientUserId: { in: userIds } },
          { coachUserId: { in: userIds } },
        ],
      },
    })).count;
    cleanup.deletedPaymentRecords = (await prisma.paymentRecord.deleteMany({
      where: {
        OR: [
          { id: { in: paymentRecordIds } },
          { userId: { in: userIds } },
        ],
      },
    })).count;

    cleanup.deletedEngagements = (await prisma.coachingEngagement.deleteMany({
      where: { id: { in: engagementIds } },
    })).count;

    cleanup.deletedInvites = (await prisma.studioNestInvite.deleteMany({ where: { email: { in: generatedEmails } } })).count;
    cleanup.deletedGrants = (await prisma.studioProjectAccessGrant.deleteMany({ where: { email: { in: generatedEmails } } })).count;

    for (const email of [coachEmail, clientEmail]) {
      const homeSlug = `home-${slugifyEmailForHomeNest(email)}`;
      const homeProjects = await prisma.studioProject.findMany({
        where: {
          slug: homeSlug,
          sourceLabel: "nest-kind:home",
        },
        select: { id: true },
      });
      for (const project of homeProjects) {
        await prisma.studioProject.delete({ where: { id: project.id } });
        cleanup.deletedHomeProjects += 1;
      }
    }

    if (userIds.length) {
      cleanup.deletedMemberships = (await prisma.membership.deleteMany({ where: { userId: { in: userIds } } })).count;
    }

    cleanup.deletedUsers = (await prisma.user.deleteMany({ where: { OR: generatedEmails.map((email) => ({ primaryEmail: email })) } })).count;
  } finally {
    await prisma.$disconnect();
  }

  const tokens = Array.isArray(firebaseDeleteIdTokens)
    ? firebaseDeleteIdTokens.filter(Boolean)
    : [firebaseDeleteIdTokens].filter(Boolean);
  for (const token of tokens) {
    if (await deleteFirebaseUserWithRest(env, baseUrl, token)) {
      cleanup.deletedFirebaseUsersViaRest += 1;
    }
  }
  cleanup.deletedFirebaseUserViaRest = cleanup.deletedFirebaseUsersViaRest > 0;

  const firebaseAdmin = ensureFirebaseAdmin(env);
  for (const email of [coachEmail, clientEmail]) {
    try {
      const firebaseUser = await firebaseAdmin.getUserByEmail(email);
      await firebaseAdmin.deleteUser(firebaseUser.uid);
      cleanup.deletedFirebaseUsersViaAdmin += 1;
    } catch (error) {
      if (error?.code !== "auth/user-not-found") throw error;
    }
  }
  return cleanup;
}

async function main() {
  const env = mergedEnv();
  requiredEnv(env, "DATABASE_URL");

  const baseUrl = baseUrlFromEnv(env);
  const cleanupSuffix = String(args.get("cleanup-generated-suffix") || "").trim().toLowerCase();
  if (cleanupSuffix) {
    assert(
      /^[a-f0-9]{8}$/.test(cleanupSuffix),
      "--cleanup-generated-suffix must be the exact eight-character generated hex suffix.",
    );
    const coachEmail = `codex-coaching-coach-${cleanupSuffix}@dev.test`;
    const clientEmail = `codex-coaching-client-${cleanupSuffix}@dev.test`;
    const cleanup = await cleanupGeneratedCoachingArtifacts(env, baseUrl, coachEmail, clientEmail, []);
    console.log(JSON.stringify({
      ok: true,
      baseUrl,
      testLane: "generated-regression-recovery",
      humanAcceptanceSatisfied: false,
      generatedCoachEmail: redactGeneratedEmail(coachEmail),
      generatedClientEmail: redactGeneratedEmail(clientEmail),
      cleanup,
      note: "Recovered only exact generated coaching smoke identities and their canonical artifacts. No human account was eligible.",
    }, null, 2));
    return;
  }
  const includeStripeCheckoutSmoke =
    args.get("include-stripe-checkout") === "1" ||
    env.QUIPSLY_COACHING_SMOKE_CREATE_STRIPE_CHECKOUT === "1";
  const suffix = crypto.randomBytes(4).toString("hex");
  const coachEmail = `codex-coaching-coach-${suffix}@dev.test`;
  const clientEmail = `codex-coaching-client-${suffix}@dev.test`;
  const password = `Qp-${crypto.randomBytes(18).toString("base64url")}!26`;
  const scheduledStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const convertScheduledStart = new Date(scheduledStart.getTime() + 90 * 60 * 1000);
  const rescheduledStart = new Date(convertScheduledStart.getTime() + 45 * 60 * 1000);
  const paidScheduledStart = new Date(rescheduledStart.getTime() + 45 * 60 * 1000);

  let smokeSucceeded = false;
  let firebaseDeleteIdToken = null;
  let clientFirebaseDeleteIdToken = null;
  let holdId = null;
  let convertHoldId = null;
  let convertBookingId = null;
  let convertCallRoomId = null;
  let sessionBody = null;
  let clientSessionBody = null;
  let clientMobileSessionsBody = null;
  let clientMobileSessionsAfterDeclineBody = null;
  let clientMobileSessionsAfterConsentBody = null;
  let clientCoacheeSessionsRouteReachable = false;
  let runwayBeforeCoachSetup = null;
  let coachSetupResult = null;
  let runwayBefore = null;
  let runwayAfter = null;
  let runwayAfterRelease = null;
  let runwayAfterConvert = null;
  let runwayAfterPaidBooking = null;
  let runwayAfterPaidCheckout = null;
  let runwayAfterReschedule = null;
  let runwayAfterCancel = null;
  let paidBookingId = null;
  let paidCallRoomId = null;
  let paidCheckoutSessionId = null;
  let paidCheckoutUrl = null;
  let paidCheckoutLivemode = null;
  let clientMobileSessionsAfterCancelBody = null;
  let calendarBeforeReschedule = null;
  let calendarForClient = null;
  let calendarAfterReschedule = null;
  let calendarAfterCancel = null;
  let currentStaffConsentPolicy = null;
  let currentConsentPolicy = null;

  try {
    await assertServerFirebaseAdminPreflight(baseUrl);
    const firebaseBody = await firebaseVerifiedTestSignup(env, baseUrl, coachEmail, password);
    firebaseDeleteIdToken = firebaseBody.idToken;

    const sessionStart = await requestJson(`${baseUrl}/api/auth/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: firebaseBody.idToken }),
    });
    assert(
      sessionStart.response.status === 200 && sessionStart.body?.user?.email === coachEmail,
      `Session exchange failed with HTTP ${sessionStart.response.status}: ${sessionStart.text.slice(0, 240)}`,
      { body: sessionStart.body },
    );
    assert(sessionStart.body?.homeNest?.slug, "Session exchange did not create or return Home Nest truth.");
    sessionBody = sessionStart.body;

    const runwayBeforeSetup = await requestJson(`${baseUrl}/api/coaching/runway`, {
      headers: { authorization: `Bearer ${firebaseBody.idToken}` },
    });
    assert(
      runwayBeforeSetup.response.status === 200 &&
        runwayBeforeSetup.body?.ok === true &&
        runwayBeforeSetup.body?.user?.isStaff === false &&
        runwayBeforeSetup.body?.user?.isCoach === false,
      `Fresh generated user did not reach the ordinary pre-setup coaching runway. HTTP ${runwayBeforeSetup.response.status}`,
      { body: runwayBeforeSetup.body },
    );
    runwayBeforeCoachSetup = runwayBeforeSetup.body;

    const setup = await requestJson(`${baseUrl}/api/coaching/runway`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${firebaseBody.idToken}`,
      },
      body: JSON.stringify({
        action: "setup-coach-profile",
        coachEmail,
        coachName: "Codex Generated Coaching Coach",
        timezone: "America/Denver",
        defaultDurationMinutes: 45,
        defaultAmountCents: null,
        currency: "USD",
        offeringTitle: "Generated one-to-one coaching",
        offeringDescription: "Generated ordinary-coach regression evidence. Safe to delete.",
      }),
    });
    assert(
      setup.response.status === 200 &&
        setup.body?.ok === true &&
        setup.body?.result?.role === "COACH" &&
        setup.body?.result?.coachEmail === coachEmail,
      `Fresh generated user could not complete ordinary self-service coach setup. HTTP ${setup.response.status}`,
      { body: setup.body },
    );
    coachSetupResult = setup.body.result;

    const firstRunway = await requestJson(`${baseUrl}/api/coaching/runway`, {
      headers: { authorization: `Bearer ${firebaseBody.idToken}` },
    });
    assert(
      firstRunway.response.status === 200 &&
        firstRunway.body?.ok === true &&
        firstRunway.body?.user?.isStaff === false &&
        firstRunway.body?.user?.isCoach === true,
      `Ordinary generated coach could not load the post-setup coaching runway. HTTP ${firstRunway.response.status}`,
      { body: firstRunway.body },
    );
    runwayBefore = firstRunway.body;

    const hold = await requestJson(`${baseUrl}/api/coaching/runway`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${firebaseBody.idToken}`,
      },
      body: JSON.stringify({
        action: "create-booking-hold",
        clientEmail,
        clientName: "Codex Generated Coaching Client",
        title: "Generated coaching hold smoke",
        scheduledStart: scheduledStart.toISOString(),
        durationMinutes: 45,
        purpose: "COACHING",
        paymentPolicy: "MANUAL",
        notes: "Generated coaching hold smoke. Safe to delete.",
      }),
    });
    assert(
      hold.response.status === 200 && hold.body?.ok === true && hold.body?.result?.holdId,
      `Generated staff hold creation failed. HTTP ${hold.response.status}`,
      { body: hold.body },
    );
    holdId = hold.body.result.holdId;

    const secondRunway = await requestJson(`${baseUrl}/api/coaching/runway`, {
      headers: { authorization: `Bearer ${firebaseBody.idToken}` },
    });
    assert(secondRunway.response.status === 200 && secondRunway.body?.ok === true, `Runway reload failed. HTTP ${secondRunway.response.status}`);
    const matchingHold = (secondRunway.body.bookingHolds || []).find((candidate) => candidate.id === holdId);
    assert(matchingHold?.status === "ACTIVE", "Created coaching hold was not visible as an active hold after reload.", {
      holdId,
      holdCount: Array.isArray(secondRunway.body.bookingHolds) ? secondRunway.body.bookingHolds.length : null,
    });
    runwayAfter = secondRunway.body;

    const release = await requestJson(`${baseUrl}/api/coaching/runway`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${firebaseBody.idToken}`,
      },
      body: JSON.stringify({
        action: "release-booking-hold",
        holdId,
        reason: "Generated coaching smoke release proof.",
      }),
    });
    assert(
      release.response.status === 200 && release.body?.ok === true && release.body?.result?.status === "CANCELED",
      `Generated staff hold release failed. HTTP ${release.response.status}`,
      { body: release.body },
    );

    const thirdRunway = await requestJson(`${baseUrl}/api/coaching/runway`, {
      headers: { authorization: `Bearer ${firebaseBody.idToken}` },
    });
    assert(thirdRunway.response.status === 200 && thirdRunway.body?.ok === true, `Runway reload after release failed. HTTP ${thirdRunway.response.status}`);
    const releasedHold = (thirdRunway.body.bookingHolds || []).find((candidate) => candidate.id === holdId);
    assert(releasedHold?.status === "CANCELED", "Released coaching hold was not visible as canceled/released after reload.", {
      holdId,
      holdCount: Array.isArray(thirdRunway.body.bookingHolds) ? thirdRunway.body.bookingHolds.length : null,
    });
    runwayAfterRelease = thirdRunway.body;

    const convertHold = await requestJson(`${baseUrl}/api/coaching/runway`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${firebaseBody.idToken}`,
      },
      body: JSON.stringify({
        action: "create-booking-hold",
        clientEmail,
        clientName: "Codex Generated Coaching Client",
        title: "Generated coaching conversion hold smoke",
        scheduledStart: convertScheduledStart.toISOString(),
        durationMinutes: 45,
        purpose: "COACHING",
        paymentPolicy: "MANUAL",
        notes: "Generated coaching conversion hold smoke. Safe to delete.",
      }),
    });
    assert(
      convertHold.response.status === 200 && convertHold.body?.ok === true && convertHold.body?.result?.holdId,
      `Generated staff conversion hold creation failed. HTTP ${convertHold.response.status}`,
      { body: convertHold.body },
    );
    convertHoldId = convertHold.body.result.holdId;

    const convert = await requestJson(`${baseUrl}/api/coaching/runway`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${firebaseBody.idToken}`,
      },
      body: JSON.stringify({
        action: "convert-booking-hold",
        holdId: convertHoldId,
        notes: "Generated coaching smoke conversion proof.",
      }),
    });
    assert(
      convert.response.status === 200 && convert.body?.ok === true && convert.body?.result?.bookingId && convert.body?.result?.callRoomId,
      `Generated staff hold conversion failed. HTTP ${convert.response.status}`,
      { body: convert.body },
    );
    convertBookingId = convert.body.result.bookingId;
    convertCallRoomId = convert.body.result.callRoomId;

    const calendarBeforeRescheduleResponse = await requestJson(
      `${baseUrl}/api/coaching/bookings/${encodeURIComponent(convertBookingId)}/calendar`,
      { headers: { authorization: `Bearer ${firebaseBody.idToken}` } },
    );
    calendarBeforeReschedule = assertPrivateCalendarExport(calendarBeforeRescheduleResponse, {
      forbiddenValues: [coachEmail, clientEmail],
    });

    const fourthRunway = await requestJson(`${baseUrl}/api/coaching/runway`, {
      headers: { authorization: `Bearer ${firebaseBody.idToken}` },
    });
    assert(fourthRunway.response.status === 200 && fourthRunway.body?.ok === true, `Runway reload after conversion failed. HTTP ${fourthRunway.response.status}`);
    const convertedHold = (fourthRunway.body.bookingHolds || []).find((candidate) => candidate.id === convertHoldId);
    const convertedBooking = (fourthRunway.body.upcomingBookings || []).find((candidate) => candidate.id === convertBookingId);
    assert(convertedHold?.status === "CONVERTED", "Converted coaching hold was not visible as converted after reload.", {
      convertHoldId,
      holdCount: Array.isArray(fourthRunway.body.bookingHolds) ? fourthRunway.body.bookingHolds.length : null,
    });
    assert(convertedBooking?.callRoomId === convertCallRoomId, "Converted booking did not expose its planned capture room after reload.", {
      convertBookingId,
      convertCallRoomId,
    });
    runwayAfterConvert = fourthRunway.body;

    const paidBooking = await requestJson(`${baseUrl}/api/coaching/runway`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${firebaseBody.idToken}`,
      },
      body: JSON.stringify({
        action: "create-booking-room",
        clientEmail,
        clientName: "Codex Generated Coaching Client",
        title: "Generated paid one-to-one coaching smoke",
        scheduledStart: paidScheduledStart.toISOString(),
        durationMinutes: 45,
        purpose: "COACHING",
        paymentPolicy: "PAID_ONE_TO_ONE",
        amountCents: 2600,
        currency: "USD",
        notes: "Generated paid coaching booking smoke. Safe to delete.",
      }),
    });
    assert(
      paidBooking.response.status === 200 &&
        paidBooking.body?.ok === true &&
        paidBooking.body?.result?.bookingId &&
        paidBooking.body?.result?.callRoomId &&
        paidBooking.body?.result?.paymentRecordId &&
        paidBooking.body?.result?.status === "HOLDING_PAYMENT",
      `Generated paid booking creation failed. HTTP ${paidBooking.response.status}`,
      { body: paidBooking.body },
    );
    paidBookingId = paidBooking.body.result.bookingId;
    paidCallRoomId = paidBooking.body.result.callRoomId;

    const paidRunway = await requestJson(`${baseUrl}/api/coaching/runway`, {
      headers: { authorization: `Bearer ${firebaseBody.idToken}` },
    });
    assert(paidRunway.response.status === 200 && paidRunway.body?.ok === true, `Runway reload after paid booking failed. HTTP ${paidRunway.response.status}`);
    const paidRunwayBooking = (paidRunway.body.upcomingBookings || []).find((candidate) => candidate.id === paidBookingId);
    assert(
      paidRunwayBooking?.status === "HOLDING_PAYMENT" &&
        paidRunwayBooking?.paymentPolicy === "PAID_ONE_TO_ONE" &&
        paidRunwayBooking?.amountCents === 2600 &&
        paidRunwayBooking?.callRoomId === paidCallRoomId,
      "Paid coaching booking was not visible as held for payment after reload.",
      { paidBookingId, paidCallRoomId, paidRunwayBooking },
    );
    runwayAfterPaidBooking = paidRunway.body;

    if (includeStripeCheckoutSmoke) {
      const checkout = await requestJson(`${baseUrl}/api/coaching/checkout`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${firebaseBody.idToken}`,
        },
        body: JSON.stringify({
          bookingId: paidBookingId,
          successUrl: `${baseUrl}/coaching/sessions?checkout=success&bookingId=${encodeURIComponent(paidBookingId)}`,
          cancelUrl: `${baseUrl}/coaching/sessions?checkout=cancel&bookingId=${encodeURIComponent(paidBookingId)}`,
        }),
      });
      assert(
        checkout.response.status === 200 &&
          checkout.body?.ok === true &&
          checkout.body?.result?.checkoutSessionId &&
          /^https:\/\/checkout\.stripe\.com\//.test(String(checkout.body?.result?.url || "")),
        `Generated paid booking Stripe checkout creation failed. HTTP ${checkout.response.status}`,
        { body: checkout.body },
      );
      paidCheckoutSessionId = checkout.body.result.checkoutSessionId;
      paidCheckoutUrl = checkout.body.result.url;
      paidCheckoutLivemode = checkout.body.result.livemode === true;

      const paidCheckoutRunway = await requestJson(`${baseUrl}/api/coaching/runway`, {
        headers: { authorization: `Bearer ${firebaseBody.idToken}` },
      });
      assert(
        paidCheckoutRunway.response.status === 200 && paidCheckoutRunway.body?.ok === true,
        `Runway reload after paid checkout failed. HTTP ${paidCheckoutRunway.response.status}`,
      );
      const paidCheckoutRunwayBooking = (paidCheckoutRunway.body.upcomingBookings || []).find((candidate) => candidate.id === paidBookingId);
      assert(
        paidCheckoutRunwayBooking?.latestCheckoutSessionId === paidCheckoutSessionId &&
          paidCheckoutRunwayBooking?.latestCheckoutUrl === paidCheckoutUrl &&
          paidCheckoutRunwayBooking?.checkoutSessionCount >= 1,
        "Paid coaching booking did not expose Stripe checkout evidence after checkout creation.",
        { paidBookingId, paidCheckoutSessionId, paidCheckoutRunwayBooking },
      );
      runwayAfterPaidCheckout = paidCheckoutRunway.body;
    }

    const clientFirebaseBody = await firebaseVerifiedTestSignup(env, baseUrl, clientEmail, password);
    clientFirebaseDeleteIdToken = clientFirebaseBody.idToken;
    const clientSessionStart = await requestJson(`${baseUrl}/api/auth/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: clientFirebaseBody.idToken }),
    });
    assert(
      clientSessionStart.response.status === 200 && clientSessionStart.body?.user?.email === clientEmail,
      `Invited coaching client session exchange failed with HTTP ${clientSessionStart.response.status}: ${clientSessionStart.text.slice(0, 240)}`,
      { body: clientSessionStart.body },
    );
    assert(clientSessionStart.body?.homeNest?.slug, "Invited coaching client session exchange did not return Home Nest truth.");
    assert(
      !convertedBooking?.client?.id || clientSessionStart.body.user.id === convertedBooking.client.id,
      "Invited coaching client Firebase login did not attach to the existing booking client user.",
      {
        expectedClientUserId: convertedBooking?.client?.id || null,
        actualClientUserId: clientSessionStart.body.user.id,
      },
    );
    clientSessionBody = clientSessionStart.body;

    const clientCalendarResponse = await requestJson(
      `${baseUrl}/api/coaching/bookings/${encodeURIComponent(convertBookingId)}/calendar`,
      { headers: { authorization: `Bearer ${clientFirebaseBody.idToken}` } },
    );
    calendarForClient = assertPrivateCalendarExport(clientCalendarResponse, {
      forbiddenValues: [coachEmail, clientEmail],
    });
    assert(
      calendarForClient.uid === calendarBeforeReschedule.uid &&
        calendarForClient.startsAt === calendarBeforeReschedule.startsAt,
      "Coach and client calendar exports did not describe the same stable event.",
      { coach: calendarBeforeReschedule, client: calendarForClient },
    );

    const clientMobileSessions = await requestJson(`${baseUrl}/api/mobile/capture/sessions`, {
      headers: { authorization: `Bearer ${clientFirebaseBody.idToken}` },
    });
    assert(
      clientMobileSessions.response.status === 200 && clientMobileSessions.body?.ok === true,
      `Invited coaching client could not load mobile capture sessions. HTTP ${clientMobileSessions.response.status}`,
      { body: clientMobileSessions.body },
    );
    const convertedMobileSession = (clientMobileSessions.body.sessions || []).find(
      (candidate) => candidate.callRoomId === convertCallRoomId,
    );
    const paidMobileSession = (clientMobileSessions.body.sessions || []).find(
      (candidate) => candidate.callRoomId === paidCallRoomId,
    );
    assert(convertedMobileSession, "Invited coaching client mobile sessions did not include the converted capture room.", {
      convertCallRoomId,
      sessionCount: Array.isArray(clientMobileSessions.body.sessions) ? clientMobileSessions.body.sessions.length : null,
    });
    assert(
      paidMobileSession?.bookingStatus === "HOLDING_PAYMENT" &&
        paidMobileSession?.paymentPolicy === "PAID_ONE_TO_ONE" &&
        paidMobileSession?.paymentRequired === true &&
        paidMobileSession?.canRecordNow === false,
      "Invited coaching client mobile sessions did not include the paid session held until payment evidence.",
      { paidCallRoomId, paidMobileSession },
    );
    if (includeStripeCheckoutSmoke) {
      assert(
        paidMobileSession?.latestCheckoutUrl === paidCheckoutUrl &&
          paidMobileSession?.amountCents === 2600 &&
          paidMobileSession?.currency === "USD",
        "Invited coaching client mobile sessions did not expose the latest Stripe checkout action.",
        { paidCallRoomId, paidCheckoutSessionId, paidMobileSession },
      );
    }
    assert(convertedMobileSession.participantId, "Converted mobile session did not expose the client's participant row.", {
      convertCallRoomId,
      convertedMobileSession,
    });
    assert(
      convertedMobileSession.recordingConsentStatus === "REQUESTED" && convertedMobileSession.recordingConsentGranted === false,
      "Converted mobile session did not expose requested, not-yet-granted consent state.",
      {
        consentStatus: convertedMobileSession.recordingConsentStatus,
        consentGranted: convertedMobileSession.recordingConsentGranted,
      },
    );
    assert(convertedMobileSession.canRecordNow === false, "Planned converted mobile session must not be recordable before consent is granted.", {
      canRecordNow: convertedMobileSession.canRecordNow,
      consentStatus: convertedMobileSession.recordingConsentStatus,
      consentGranted: convertedMobileSession.recordingConsentGranted,
    });
    assert(
      ["local-fallback", "livekit-ready"].includes(convertedMobileSession.providerReadiness),
      "Converted mobile session did not expose a usable local or LiveKit capture route.",
      {
      providerReadiness: convertedMobileSession.providerReadiness,
      providerCanJoin: convertedMobileSession.providerCanJoin,
      },
    );
    assert(convertedMobileSession.bookingStatus === "CONFIRMED", "Converted mobile session should carry confirmed booking truth.", {
      bookingStatus: convertedMobileSession.bookingStatus,
    });
    assert(convertedMobileSession.calendarStatus === "planned", "Converted mobile session should carry planned calendar receipt truth.", {
      calendarStatus: convertedMobileSession.calendarStatus,
    });
    assert(
      /consent/i.test(convertedMobileSession.nextAction || ""),
      "Converted mobile session next action should ask for consent before recording.",
      { nextAction: convertedMobileSession.nextAction },
    );
    clientMobileSessionsBody = clientMobileSessions.body;

    const clientCoacheeSessionsPage = await requestJson(`${baseUrl}/coaching/sessions`, {
      headers: { authorization: `Bearer ${clientFirebaseBody.idToken}` },
    });
    assert(
      clientCoacheeSessionsPage.response.status === 200 &&
        /<!DOCTYPE html>|<html/i.test(clientCoacheeSessionsPage.text) &&
        !/Application error|Internal Server Error|NEXT_REDIRECT/i.test(clientCoacheeSessionsPage.text),
      `Invited coaching client could not reach the coachee session page shell. HTTP ${clientCoacheeSessionsPage.response.status}`,
      { body: clientCoacheeSessionsPage.body, htmlPrefix: clientCoacheeSessionsPage.text.slice(0, 240) },
    );
    clientCoacheeSessionsRouteReachable = true;

    const declineConsent = await requestJson(`${baseUrl}/api/mobile/capture/consent`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${clientFirebaseBody.idToken}`,
      },
      body: JSON.stringify({
        callRoomId: convertCallRoomId,
        participantId: convertedMobileSession.participantId,
        consentAction: "DECLINE",
      }),
    });
    assert(
      declineConsent.response.status === 200 &&
        declineConsent.body?.ok === true &&
        declineConsent.body?.session?.recordingConsentStatus === "DECLINED" &&
        declineConsent.body?.session?.recordingConsentGranted === false,
      `Generated client consent decline failed. HTTP ${declineConsent.response.status}`,
      { body: declineConsent.body },
    );

    const clientMobileSessionsAfterDecline = await requestJson(`${baseUrl}/api/mobile/capture/sessions`, {
      headers: { authorization: `Bearer ${clientFirebaseBody.idToken}` },
    });
    assert(
      clientMobileSessionsAfterDecline.response.status === 200 && clientMobileSessionsAfterDecline.body?.ok === true,
      `Invited coaching client could not reload mobile capture sessions after consent decline. HTTP ${clientMobileSessionsAfterDecline.response.status}`,
      { body: clientMobileSessionsAfterDecline.body },
    );
    const declinedMobileSession = (clientMobileSessionsAfterDecline.body.sessions || []).find(
      (candidate) => candidate.callRoomId === convertCallRoomId,
    );
    assert(
      declinedMobileSession?.recordingConsentStatus === "DECLINED" &&
        declinedMobileSession?.recordingConsentGranted === false &&
        declinedMobileSession?.canRecordNow === false,
      "Declined consent should keep local capture locked.",
      { declinedMobileSession },
    );
    clientMobileSessionsAfterDeclineBody = clientMobileSessionsAfterDecline.body;

    const staffMobileSessionsForConsent = await requestJson(`${baseUrl}/api/mobile/capture/sessions`, {
      headers: { authorization: `Bearer ${firebaseBody.idToken}` },
    });
    const staffConvertedSession = (staffMobileSessionsForConsent.body?.sessions || []).find(
      (candidate) => candidate.callRoomId === convertCallRoomId,
    );
    assert(
      staffMobileSessionsForConsent.response.status === 200 && staffConvertedSession?.participantId,
      "Generated coach could not resolve their participant row for all-party consent.",
      { status: staffMobileSessionsForConsent.response.status, callRoomId: convertCallRoomId },
    );
    currentStaffConsentPolicy = await discoverCurrentConsentPresentation(
      baseUrl,
      firebaseBody.idToken,
      convertCallRoomId,
      staffConvertedSession.participantId,
    );
    const grantStaffConsent = await requestJson(`${baseUrl}/api/mobile/capture/consent`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${firebaseBody.idToken}`,
      },
      body: JSON.stringify({
        callRoomId: convertCallRoomId,
        participantId: staffConvertedSession.participantId,
        consentAction: "GRANT",
        canRecordAudio: true,
        canRecordVideo: true,
        canTranscribe: true,
        allAudibleParticipantsNotifiedAndAgreed: true,
        consentPolicyVersion: currentStaffConsentPolicy.version,
        consentText: currentStaffConsentPolicy.text,
        consentTextHash: currentStaffConsentPolicy.sha256,
        presentationEvidence: {
          version: currentStaffConsentPolicy.presentationVersion,
          surface: currentStaffConsentPolicy.surface,
          presentedAt: new Date().toISOString(),
          recordingChoicePresented: true,
          transcriptionChoicePresented: true,
          audibleParticipantAttestationPresented: true,
        },
      }),
    });
    assert(
      grantStaffConsent.response.status === 200 &&
        grantStaffConsent.body?.ok === true &&
        grantStaffConsent.body?.session?.recordingConsentStatus === "GRANTED",
      `Generated coach consent grant failed. HTTP ${grantStaffConsent.response.status}`,
      { body: grantStaffConsent.body },
    );

    currentConsentPolicy = await discoverCurrentConsentPresentation(
      baseUrl,
      clientFirebaseBody.idToken,
      convertCallRoomId,
      convertedMobileSession.participantId,
    );
    const grantConsent = await requestJson(`${baseUrl}/api/mobile/capture/consent`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${clientFirebaseBody.idToken}`,
      },
      body: JSON.stringify({
        callRoomId: convertCallRoomId,
        participantId: convertedMobileSession.participantId,
        consentAction: "GRANT",
        canRecordAudio: true,
        canRecordVideo: true,
        canTranscribe: true,
        allAudibleParticipantsNotifiedAndAgreed: true,
        consentPolicyVersion: currentConsentPolicy.version,
        consentText: currentConsentPolicy.text,
        consentTextHash: currentConsentPolicy.sha256,
        presentationEvidence: {
          version: currentConsentPolicy.presentationVersion,
          surface: currentConsentPolicy.surface,
          presentedAt: new Date().toISOString(),
          recordingChoicePresented: true,
          transcriptionChoicePresented: true,
          audibleParticipantAttestationPresented: true,
        },
      }),
    });
    assert(
      grantConsent.response.status === 200 &&
        grantConsent.body?.ok === true &&
        grantConsent.body?.session?.recordingConsentStatus === "GRANTED" &&
        grantConsent.body?.session?.recordingConsentGranted === true,
      `Generated client consent grant failed. HTTP ${grantConsent.response.status}`,
      { body: grantConsent.body },
    );

    const clientMobileSessionsAfterConsent = await requestJson(`${baseUrl}/api/mobile/capture/sessions`, {
      headers: { authorization: `Bearer ${clientFirebaseBody.idToken}` },
    });
    assert(
      clientMobileSessionsAfterConsent.response.status === 200 && clientMobileSessionsAfterConsent.body?.ok === true,
      `Invited coaching client could not reload mobile capture sessions after consent grant. HTTP ${clientMobileSessionsAfterConsent.response.status}`,
      { body: clientMobileSessionsAfterConsent.body },
    );
    const consentedMobileSession = (clientMobileSessionsAfterConsent.body.sessions || []).find(
      (candidate) => candidate.callRoomId === convertCallRoomId,
    );
    assert(
      consentedMobileSession?.recordingConsentStatus === "GRANTED" &&
        consentedMobileSession?.recordingConsentGranted === true &&
        consentedMobileSession?.canRecordNow === true,
      "Granted consent should unlock local capture for the generated confirmed coaching room.",
      { consentedMobileSession },
    );
    clientMobileSessionsAfterConsentBody = clientMobileSessionsAfterConsent.body;

    const reschedule = await requestJson(`${baseUrl}/api/coaching/runway`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${firebaseBody.idToken}`,
      },
      body: JSON.stringify({
        action: "reschedule-booking",
        bookingId: convertBookingId,
        scheduledStart: rescheduledStart.toISOString(),
        durationMinutes: 45,
        reason: "Generated coaching smoke reschedule proof.",
      }),
    });
    assert(
      reschedule.response.status === 200 && reschedule.body?.ok === true && reschedule.body?.result?.calendarStatus === "reschedule-planned",
      `Generated staff booking reschedule failed. HTTP ${reschedule.response.status}`,
      { body: reschedule.body },
    );

    const fifthRunway = await requestJson(`${baseUrl}/api/coaching/runway`, {
      headers: { authorization: `Bearer ${firebaseBody.idToken}` },
    });
    assert(fifthRunway.response.status === 200 && fifthRunway.body?.ok === true, `Runway reload after reschedule failed. HTTP ${fifthRunway.response.status}`);
    const rescheduledBooking = (fifthRunway.body.upcomingBookings || []).find((candidate) => candidate.id === convertBookingId);
    assert(
      rescheduledBooking?.callRoomStatus === "PLANNED" &&
        rescheduledBooking?.calendarStatus === "reschedule-planned" &&
        rescheduledBooking?.calendarReadyPacket?.kind === "quipsly-calendar-ready-packet-v1" &&
        rescheduledBooking?.calendarReadyPacket?.status === "reschedule-planned" &&
        rescheduledBooking?.calendarReadyPacket?.externalCalendarUpdated === false &&
        /external calendar/i.test(rescheduledBooking?.calendarReadyPacket?.nextAction || "") &&
        new Date(rescheduledBooking?.scheduledStart || 0).getTime() === rescheduledStart.getTime(),
      "Rescheduled coaching booking was not visible with planned room, calendar receipt slot, and calendar-ready packet after reload.",
      {
        convertBookingId,
        expectedScheduledStart: rescheduledStart.toISOString(),
        rescheduledBooking,
      },
    );
    runwayAfterReschedule = fifthRunway.body;

    const calendarAfterRescheduleResponse = await requestJson(
      `${baseUrl}/api/coaching/bookings/${encodeURIComponent(convertBookingId)}/calendar`,
      { headers: { authorization: `Bearer ${firebaseBody.idToken}` } },
    );
    calendarAfterReschedule = assertPrivateCalendarExport(calendarAfterRescheduleResponse, {
      forbiddenValues: [coachEmail, clientEmail],
    });
    assert(
      calendarAfterReschedule.uid === calendarBeforeReschedule.uid,
      "Rescheduling changed the calendar event UID instead of updating the same event.",
      { before: calendarBeforeReschedule, after: calendarAfterReschedule },
    );
    assert(
      calendarAfterReschedule.startsAt !== calendarBeforeReschedule.startsAt,
      "Rescheduling did not change the exported calendar start time.",
      { before: calendarBeforeReschedule, after: calendarAfterReschedule },
    );

    const cancel = await requestJson(`${baseUrl}/api/coaching/runway`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${firebaseBody.idToken}`,
      },
      body: JSON.stringify({
        action: "cancel-booking",
        bookingId: convertBookingId,
        reason: "Generated coaching smoke cancel proof.",
      }),
    });
    assert(
      cancel.response.status === 200 &&
        cancel.body?.ok === true &&
        cancel.body?.result?.status === "CANCELED" &&
        cancel.body?.result?.callRoomStatus === "CANCELED" &&
        cancel.body?.result?.calendarStatus === "cancel-planned",
      `Generated staff booking cancel failed. HTTP ${cancel.response.status}`,
      { body: cancel.body },
    );

    const sixthRunway = await requestJson(`${baseUrl}/api/coaching/runway`, {
      headers: { authorization: `Bearer ${firebaseBody.idToken}` },
    });
    assert(sixthRunway.response.status === 200 && sixthRunway.body?.ok === true, `Runway reload after cancel failed. HTTP ${sixthRunway.response.status}`);
    const canceledBooking = (sixthRunway.body.upcomingBookings || []).find((candidate) => candidate.id === convertBookingId);
    assert(
      canceledBooking?.status === "CANCELED" &&
        canceledBooking?.callRoomStatus === "CANCELED" &&
        canceledBooking?.calendarStatus === "cancel-planned" &&
        canceledBooking?.calendarReadyPacket?.kind === "quipsly-calendar-ready-packet-v1" &&
        canceledBooking?.calendarReadyPacket?.status === "cancel-planned" &&
        canceledBooking?.calendarReadyPacket?.externalCalendarUpdated === false &&
        /Canceled/i.test(canceledBooking?.nextAction || ""),
      "Canceled coaching booking was not visible with canceled room, cancel calendar receipt slot, and calendar-ready packet after reload.",
      { convertBookingId, canceledBooking },
    );
    runwayAfterCancel = sixthRunway.body;

    const clientMobileSessionsAfterCancel = await requestJson(`${baseUrl}/api/mobile/capture/sessions`, {
      headers: { authorization: `Bearer ${clientFirebaseBody.idToken}` },
    });
    assert(
      clientMobileSessionsAfterCancel.response.status === 200 && clientMobileSessionsAfterCancel.body?.ok === true,
      `Invited coaching client could not reload mobile capture sessions after cancel. HTTP ${clientMobileSessionsAfterCancel.response.status}`,
      { body: clientMobileSessionsAfterCancel.body },
    );
    const canceledMobileSession = (clientMobileSessionsAfterCancel.body.sessions || []).find(
      (candidate) => candidate.callRoomId === convertCallRoomId,
    );
    assert(
      canceledMobileSession?.status === "CANCELED" &&
        canceledMobileSession?.bookingStatus === "CANCELED" &&
        canceledMobileSession?.calendarStatus === "cancel-planned" &&
        canceledMobileSession?.canRecordNow === false,
      "Canceled mobile session should stay visible as not recordable with cancel receipt truth.",
      { convertCallRoomId, canceledMobileSession },
    );
    clientMobileSessionsAfterCancelBody = clientMobileSessionsAfterCancel.body;

    const calendarAfterCancelResponse = await requestJson(
      `${baseUrl}/api/coaching/bookings/${encodeURIComponent(convertBookingId)}/calendar`,
      { headers: { authorization: `Bearer ${clientFirebaseBody.idToken}` } },
    );
    calendarAfterCancel = assertPrivateCalendarExport(calendarAfterCancelResponse, {
      expectedStatus: "CANCELLED",
      forbiddenValues: [coachEmail, clientEmail],
    });
    assert(
      calendarAfterCancel.uid === calendarBeforeReschedule.uid,
      "Cancellation changed the calendar event UID instead of canceling the same event.",
      { before: calendarBeforeReschedule, after: calendarAfterCancel },
    );
    smokeSucceeded = true;
  } finally {
    let cleanup = null;
    let cleanupWarning = null;
    if (firebaseDeleteIdToken) {
      try {
        cleanup = await cleanupGeneratedCoachingArtifacts(env, baseUrl, coachEmail, clientEmail, [
          firebaseDeleteIdToken,
          clientFirebaseDeleteIdToken,
        ]);
      } catch (error) {
        cleanupWarning = error instanceof Error ? error.message : String(error);
      }
    }

    console.log(JSON.stringify({
      ok: smokeSucceeded,
      baseUrl,
      testLane: "api-regression",
      humanAcceptanceSatisfied: false,
      generatedCoachEmail: redactGeneratedEmail(coachEmail),
      generatedClientEmail: redactGeneratedEmail(clientEmail),
      session: sessionBody
        ? {
          homeNestSlugPresent: Boolean(sessionBody.homeNest?.slug),
          freeTierStatus: sessionBody.onboarding?.freeMembershipStatus || "",
        }
        : null,
      invitedClientSession: clientSessionBody
        ? {
          existingBookingUserLinked: runwayAfterConvert?.upcomingBookings?.some(
            (candidate) => candidate.id === convertBookingId && candidate.client?.id === clientSessionBody.user?.id,
          ) ?? false,
          homeNestSlugPresent: Boolean(clientSessionBody.homeNest?.slug),
          freeTierStatus: clientSessionBody.onboarding?.freeMembershipStatus || "",
        }
        : null,
      coachingRunway: {
        freshUserStartedWithoutStaffAccess: runwayBeforeCoachSetup?.user?.isStaff === false,
        freshUserStartedWithoutCoachProfile: runwayBeforeCoachSetup?.user?.isCoach === false,
        selfServiceCoachSetupCompleted: Boolean(coachSetupResult?.coachProfileId && coachSetupResult?.offeringId),
        ordinaryCoachRunwayLoaded: runwayBefore?.user?.isCoach === true && runwayBefore?.user?.isStaff === false,
        holdIdPresent: Boolean(holdId),
        beforeHoldCount: Array.isArray(runwayBefore?.bookingHolds) ? runwayBefore.bookingHolds.length : null,
        afterHoldCount: Array.isArray(runwayAfter?.bookingHolds) ? runwayAfter.bookingHolds.length : null,
        releasedHoldVisible: Array.isArray(runwayAfterRelease?.bookingHolds)
          ? runwayAfterRelease.bookingHolds.some((candidate) => candidate.id === holdId && candidate.status === "CANCELED")
          : false,
        convertedHoldVisible: Array.isArray(runwayAfterConvert?.bookingHolds)
          ? runwayAfterConvert.bookingHolds.some((candidate) => candidate.id === convertHoldId && candidate.status === "CONVERTED")
          : false,
        convertedBookingVisible: Array.isArray(runwayAfterConvert?.upcomingBookings)
          ? runwayAfterConvert.upcomingBookings.some((candidate) => candidate.id === convertBookingId && candidate.callRoomId === convertCallRoomId)
          : false,
        paidBookingHeldForPayment: Array.isArray(runwayAfterPaidBooking?.upcomingBookings)
          ? runwayAfterPaidBooking.upcomingBookings.some(
            (candidate) =>
              candidate.id === paidBookingId &&
              candidate.status === "HOLDING_PAYMENT" &&
              candidate.paymentPolicy === "PAID_ONE_TO_ONE" &&
              candidate.amountCents === 2600,
          )
          : false,
        stripeCheckoutSmokeRequested: includeStripeCheckoutSmoke,
        stripeCheckoutCreated: includeStripeCheckoutSmoke
          ? Boolean(paidCheckoutSessionId && paidCheckoutUrl)
          : null,
        stripeCheckoutLivemode: includeStripeCheckoutSmoke
          ? paidCheckoutLivemode === true
          : null,
        paidBookingCheckoutVisible: includeStripeCheckoutSmoke && Array.isArray(runwayAfterPaidCheckout?.upcomingBookings)
          ? runwayAfterPaidCheckout.upcomingBookings.some(
            (candidate) =>
              candidate.id === paidBookingId &&
              candidate.latestCheckoutSessionId === paidCheckoutSessionId &&
              candidate.latestCheckoutUrl === paidCheckoutUrl,
          )
          : null,
        rescheduledBookingVisible: Array.isArray(runwayAfterReschedule?.upcomingBookings)
          ? runwayAfterReschedule.upcomingBookings.some(
            (candidate) =>
              candidate.id === convertBookingId &&
              candidate.calendarStatus === "reschedule-planned" &&
              new Date(candidate.scheduledStart || 0).getTime() === rescheduledStart.getTime(),
          )
          : false,
        canceledBookingVisible: Array.isArray(runwayAfterCancel?.upcomingBookings)
          ? runwayAfterCancel.upcomingBookings.some(
            (candidate) =>
              candidate.id === convertBookingId &&
              candidate.status === "CANCELED" &&
              candidate.callRoomStatus === "CANCELED" &&
              candidate.calendarStatus === "cancel-planned",
          )
          : false,
      },
      privateCalendarExport: {
        coachExportedConfirmedEvent: calendarBeforeReschedule?.status === "CONFIRMED",
        clientExportMatchesCoach: Boolean(
          calendarForClient?.uid &&
            calendarForClient.uid === calendarBeforeReschedule?.uid &&
            calendarForClient.startsAt === calendarBeforeReschedule?.startsAt,
        ),
        reschedulePreservedUid: Boolean(
          calendarAfterReschedule?.uid &&
            calendarAfterReschedule.uid === calendarBeforeReschedule?.uid,
        ),
        rescheduleChangedStart: Boolean(
          calendarAfterReschedule?.startsAt &&
            calendarAfterReschedule.startsAt !== calendarBeforeReschedule?.startsAt,
        ),
        cancellationPreservedUid: Boolean(
          calendarAfterCancel?.uid &&
            calendarAfterCancel.uid === calendarBeforeReschedule?.uid,
        ),
        cancellationExportedCancelledStatus: calendarAfterCancel?.status === "CANCELLED",
        privateContentBoundaryChecked: Boolean(calendarAfterCancel),
      },
      mobileCapture: {
        invitedClientSessionLoaded: clientMobileSessionsBody?.ok === true,
        coacheeSessionsRouteReachable: clientCoacheeSessionsRouteReachable,
        convertedRoomVisibleToClient: Array.isArray(clientMobileSessionsBody?.sessions)
          ? clientMobileSessionsBody.sessions.some((candidate) => candidate.callRoomId === convertCallRoomId)
          : false,
        paidSessionVisibleToClient: Array.isArray(clientMobileSessionsBody?.sessions)
          ? clientMobileSessionsBody.sessions.some((candidate) => candidate.callRoomId === paidCallRoomId)
          : false,
        paidSessionHeldUntilPayment: Array.isArray(clientMobileSessionsBody?.sessions)
          ? clientMobileSessionsBody.sessions.some(
            (candidate) =>
              candidate.callRoomId === paidCallRoomId &&
              candidate.paymentPolicy === "PAID_ONE_TO_ONE" &&
              candidate.paymentRequired === true &&
              candidate.bookingStatus === "HOLDING_PAYMENT" &&
              candidate.canRecordNow === false,
          )
          : false,
        coacheeStripePaymentActionVisible: includeStripeCheckoutSmoke && Array.isArray(clientMobileSessionsBody?.sessions)
          ? clientMobileSessionsBody.sessions.some(
            (candidate) =>
              candidate.callRoomId === paidCallRoomId &&
              candidate.latestCheckoutUrl === paidCheckoutUrl &&
              candidate.amountCents === 2600 &&
              candidate.currency === "USD",
          )
          : null,
        requestedConsentVisible: Array.isArray(clientMobileSessionsBody?.sessions)
          ? clientMobileSessionsBody.sessions.some(
            (candidate) => candidate.callRoomId === convertCallRoomId && candidate.recordingConsentStatus === "REQUESTED",
          )
          : false,
        usableCaptureRouteVisible: Array.isArray(clientMobileSessionsBody?.sessions)
          ? clientMobileSessionsBody.sessions.some(
            (candidate) => candidate.callRoomId === convertCallRoomId && ["local-fallback", "livekit-ready"].includes(candidate.providerReadiness),
          )
          : false,
        plannedCalendarVisible: Array.isArray(clientMobileSessionsBody?.sessions)
          ? clientMobileSessionsBody.sessions.some(
            (candidate) => candidate.callRoomId === convertCallRoomId && candidate.calendarStatus === "planned",
          )
          : false,
        recordingHeldUntilConsent: Array.isArray(clientMobileSessionsBody?.sessions)
          ? clientMobileSessionsBody.sessions.some(
            (candidate) =>
              candidate.callRoomId === convertCallRoomId &&
              candidate.recordingConsentStatus === "REQUESTED" &&
              candidate.recordingConsentGranted === false &&
              candidate.canRecordNow === false,
          )
          : false,
        consentDeclineRecorded: Array.isArray(clientMobileSessionsAfterDeclineBody?.sessions)
          ? clientMobileSessionsAfterDeclineBody.sessions.some(
            (candidate) =>
              candidate.callRoomId === convertCallRoomId &&
              candidate.recordingConsentStatus === "DECLINED" &&
              candidate.recordingConsentGranted === false &&
              candidate.canRecordNow === false,
          )
          : false,
        consentGrantRecorded: Array.isArray(clientMobileSessionsAfterConsentBody?.sessions)
          ? clientMobileSessionsAfterConsentBody.sessions.some(
            (candidate) =>
              candidate.callRoomId === convertCallRoomId &&
              candidate.recordingConsentStatus === "GRANTED" &&
              candidate.recordingConsentGranted === true,
          )
          : false,
        currentConsentPolicyDiscovered: Boolean(
          currentStaffConsentPolicy?.version && currentConsentPolicy?.version,
        ),
        allPartyConsentGateSatisfied: Array.isArray(clientMobileSessionsAfterConsentBody?.sessions)
          ? clientMobileSessionsAfterConsentBody.sessions.some(
            (candidate) =>
              candidate.callRoomId === convertCallRoomId &&
              candidate.consentGrantedParticipantCount === candidate.consentRequiredParticipantCount &&
              candidate.allRegisteredParticipantConsentGranted === true,
          )
          : false,
        localRecordingUnlockedAfterConsent: Array.isArray(clientMobileSessionsAfterConsentBody?.sessions)
          ? clientMobileSessionsAfterConsentBody.sessions.some(
            (candidate) =>
              candidate.callRoomId === convertCallRoomId &&
              candidate.recordingConsentStatus === "GRANTED" &&
              candidate.recordingConsentGranted === true &&
              candidate.canRecordNow === true,
          )
          : false,
        canceledSessionVisible: Array.isArray(clientMobileSessionsAfterCancelBody?.sessions)
          ? clientMobileSessionsAfterCancelBody.sessions.some(
            (candidate) =>
              candidate.callRoomId === convertCallRoomId &&
              candidate.status === "CANCELED" &&
              candidate.bookingStatus === "CANCELED" &&
              candidate.canRecordNow === false,
          )
          : false,
      },
      cleanup,
      cleanupWarning,
      note: "This operates canonical APIs as a generated ordinary coach and client. It is regression evidence, not fresh-human UX acceptance. Generated password, Firebase token, session cookie, database URL, and bearer token were not printed.",
    }, null, 2));
  }

  if (!smokeSucceeded) {
    throw new Error("Generated coaching runway smoke did not complete.");
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    details: error?.details || undefined,
  }, null, 2));
  process.exit(1);
});
