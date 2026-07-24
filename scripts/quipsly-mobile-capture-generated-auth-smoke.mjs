#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const repoRoot = process.cwd();
const requireFromQuipsly = createRequire(new URL("../apps/quipsly/package.json", import.meta.url));
const { PrismaClient } = requireFromQuipsly("@prisma/client");
const { PrismaPg } = requireFromQuipsly("@prisma/adapter-pg");
const { initializeApp, getApps } = requireFromQuipsly("firebase-admin/app");
const { getAuth } = requireFromQuipsly("firebase-admin/auth");

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
  const env = {
    ...readDotEnv(path.join(repoRoot, ".env")),
    ...readDotEnv(path.join(repoRoot, ".env.local")),
    ...readDotEnv(path.join(repoRoot, "apps/quipsly/.env")),
    ...readDotEnv(path.join(repoRoot, "apps/quipsly/.env.local")),
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
      || env.QUIPSLY_MOBILE_CAPTURE_BASE_URL
      || env.QUIPSLY_NATIVE_SMOKE_BASE_URL
      || env.QUIPSLY_AUTH_SMOKE_BASE_URL
      || "http://127.0.0.1:3000",
  );
}

function requiredEnv(env, name, fallback = undefined) {
  const value = env[name] || fallback;
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function assert(condition, message, details = {}) {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
  }
}

function isGeneratedMobileEmail(email) {
  return /^codex-mobile-capture-[a-f0-9]{8}@dev\.test$/i.test(String(email || "").trim());
}

function redactGeneratedEmail(email) {
  return String(email || "").replace(/^codex-mobile-capture-([a-f0-9]{4})[a-f0-9]{4}/i, "codex-mobile-capture-$1****");
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

async function assertServerFirebaseAdminPreflight(baseUrl) {
  const preflight = await requestJson(`${baseUrl}/api/auth/firebase-admin-preflight`);
  if (preflight.response.status === 200 && preflight.body?.ok === true) return;

  if (preflight.response.status === 503 && preflight.body?.error === "Firebase Admin credential unavailable") {
    throw new Error(
      [
        "Server Firebase Admin preflight failed before generated mobile capture smoke.",
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
  if (env.QUIPSLY_MOBILE_CAPTURE_SMOKE_FIREBASE_API_KEY) return env.QUIPSLY_MOBILE_CAPTURE_SMOKE_FIREBASE_API_KEY;
  if (env.NEXT_PUBLIC_FIREBASE_API_KEY) return env.NEXT_PUBLIC_FIREBASE_API_KEY;

  const config = await requestJson(`${baseUrl}/api/mac/firebase-client-config`);
  assert(
    config.response.status === 200 && config.body?.ok === true && config.body?.firebase?.apiKey,
    `Firebase client config endpoint did not return an API key. HTTP ${config.response.status}`,
    { body: config.body },
  );
  return config.body.firebase.apiKey;
}

async function firebaseSelfServeSignup(env, baseUrl, email, password) {
  const firebaseApiKey = await fetchFirebaseApiKey(env, baseUrl);
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(firebaseApiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const body = await response.json();
  assert(
    response.ok && body.idToken && body.localId,
    `Firebase generated mobile capture signup failed with HTTP ${response.status}`,
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

async function cleanupGeneratedMobileArtifacts(env, baseUrl, email, firebaseDeleteIdToken) {
  if (env.QUIPSLY_MOBILE_CAPTURE_SMOKE_KEEP_ARTIFACTS === "1" || args.get("keep-artifacts") === "1") {
    return { skipped: "QUIPSLY_MOBILE_CAPTURE_SMOKE_KEEP_ARTIFACTS=1 or --keep-artifacts" };
  }

  if (!isGeneratedMobileEmail(email)) {
    throw new Error(`Refusing to clean up non-generated mobile capture smoke email: ${email}`);
  }

  const cleanup = {
    deletedInvites: 0,
    deletedGrants: 0,
    deletedCallRooms: 0,
    deletedHomeProjects: 0,
    deletedMemberships: 0,
    deletedUsers: 0,
    deletedFirebaseUser: false,
    deletedFirebaseUserViaRest: false,
    firebaseUserMissing: false,
  };

  const prisma = createPrisma(env);
  const homeSlug = `home-${slugifyEmailForHomeNest(email)}`;

  try {
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { primaryEmail: email },
          { aliases: { some: { email } } },
        ],
      },
      select: { id: true },
    });

    if (user?.id) {
      const callRooms = await prisma.callRoom.findMany({
        where: {
          OR: [
            { createdByUserId: user.id },
            { participants: { some: { userId: user.id } } },
          ],
        },
        select: { id: true },
      });

      for (const room of callRooms) {
        await prisma.callRoom.delete({ where: { id: room.id } });
        cleanup.deletedCallRooms += 1;
      }
    }

    cleanup.deletedInvites = (await prisma.studioNestInvite.deleteMany({ where: { email } })).count;
    cleanup.deletedGrants = (await prisma.studioProjectAccessGrant.deleteMany({ where: { email } })).count;

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

    if (user?.id) {
      cleanup.deletedMemberships = (await prisma.membership.deleteMany({ where: { userId: user.id } })).count;
    }

    cleanup.deletedUsers = (await prisma.user.deleteMany({ where: { primaryEmail: email } })).count;
  } finally {
    await prisma.$disconnect();
  }

  const firebaseProjectId = env.FIREBASE_PROJECT_ID || env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "quipsly-reef";
  if (!getApps().length) {
    initializeApp({ projectId: firebaseProjectId });
  }

  try {
    const firebaseUser = await getAuth().getUserByEmail(email);
    await getAuth().deleteUser(firebaseUser.uid);
    cleanup.deletedFirebaseUser = true;
  } catch (error) {
    if (error?.code === "auth/user-not-found") {
      cleanup.firebaseUserMissing = true;
    } else {
      cleanup.deletedFirebaseUserViaRest = await deleteFirebaseUserWithRest(env, baseUrl, firebaseDeleteIdToken);
      if (!cleanup.deletedFirebaseUserViaRest) throw error;
    }
  }

  return cleanup;
}

async function createGeneratedCaptureSession(env, email, sessionBody) {
  const prisma = createPrisma(env);
  const now = new Date();
  const scheduledEnd = new Date(now.getTime() + 30 * 60 * 1000);
  const roomSeed = crypto.randomBytes(6).toString("hex");
  const homeNestSlug = sessionBody?.homeNest?.slug || `home-${slugifyEmailForHomeNest(email)}`;

  try {
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { primaryEmail: email },
          { aliases: { some: { email } } },
        ],
      },
      select: { id: true, name: true, primaryEmail: true },
    });

    assert(user?.id, "Session exchange succeeded, but no app-owned user was available for capture room seeding.");

    const room = await prisma.callRoom.create({
      data: {
        createdByUserId: user.id,
        purpose: "PODCAST",
        status: "OPEN",
        provider: "livekit",
        providerRoomId: `codex-mobile-capture-smoke-${roomSeed}`,
        title: "Codex generated mobile capture smoke room",
        scheduledStart: now,
        scheduledEnd,
        nestSlug: homeNestSlug,
        projectSlug: homeNestSlug,
        recordingPolicyJson: {
          source: "quipsly-mobile-capture-generated-auth-smoke",
          explicitConsentRequired: true,
          visibleRecordingIndicatorRequired: true,
        },
        transcriptPolicyJson: {
          source: "quipsly-mobile-capture-generated-auth-smoke",
          transcriptRequiresVerifiedRecording: true,
        },
        metadataJson: {
          source: "quipsly-mobile-capture-generated-auth-smoke",
          generatedEmail: email,
          disposable: true,
        },
        participants: {
          create: {
            userId: user.id,
            displayName: user.name || "Codex Mobile Capture Smoke",
            email: user.primaryEmail || email,
            role: "HOST",
            deviceLabel: "Generated auth smoke",
            connectionJson: {
              source: "quipsly-mobile-capture-generated-auth-smoke",
            },
          },
        },
        recordingConsents: {
          create: {
            userId: user.id,
            status: "GRANTED",
            consentText: "Generated smoke-test consent for local contract verification only.",
            canRecordAudio: true,
            canRecordVideo: true,
            canTranscribe: true,
            consentedAt: now,
            metadataJson: {
              source: "quipsly-mobile-capture-generated-auth-smoke",
              disposable: true,
            },
          },
        },
      },
      select: { id: true, providerRoomId: true },
    });

    return room;
  } finally {
    await prisma.$disconnect();
  }
}

async function assertGeneratedRoomJoin(baseUrl, idToken, room) {
  const result = await requestJson(`${baseUrl}/api/mobile/capture/rooms/join`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ callRoomId: room.id }),
  });

  assert(
    result.response.status === 200 && result.body?.ok === true,
    `Generated LiveKit room join failed with HTTP ${result.response.status}: ${result.text.slice(0, 240)}`,
    { body: result.body },
  );
  assert(result.body?.canJoin === true, "Generated LiveKit room join did not return canJoin=true.", { body: result.body });
  assert(result.body?.providerReadiness === "livekit-ready", "Generated LiveKit room join did not report livekit-ready.", { body: result.body });
  assert(typeof result.body?.participantToken === "string" && result.body.participantToken.length > 40, "Generated LiveKit room join did not return a short-lived participant token.");
  assert(result.body?.effects?.recordingStarted === false, "Generated LiveKit room join must not start recording.");
  assert(result.body?.providerRecording?.startsWithJoin === false, "Generated LiveKit room join must not imply provider recording starts with join.");

  return {
    canJoin: result.body.canJoin === true,
    provider: result.body.provider || "",
    providerReadiness: result.body.providerReadiness || "",
    roomNamePresent: Boolean(result.body.roomName),
    tokenReturned: Boolean(result.body.participantToken),
    tokenExpiresAtPresent: Boolean(result.body.tokenExpiresAt),
    recordingStarted: result.body.effects?.recordingStarted === true,
    providerRecordingStartsWithJoin: result.body.providerRecording?.startsWithJoin === true,
    recordingConsentGranted: result.body.recordingConsentGranted === true,
  };
}

async function assertGeneratedSessionContext(baseUrl, idToken, room) {
  const draft = {
    note: "Generated smoke context: episode prep, coaching notes, and follow-up truth stay in Quipsly.",
    goals: [
      "Prove shared session context can be saved before capture.",
      "Keep local drafts recoverable while Nest owns shared truth.",
    ],
    tasks: [
      "Review transcript packet after recording.",
      "Turn useful moments into podcast notes and coaching follow-up.",
    ],
  };

  const saved = await requestJson(`${baseUrl}/api/mobile/capture/sessions/context`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      callRoomId: room.id,
      ...draft,
    }),
  });

  assert(
    saved.response.status === 200 && saved.body?.ok === true && saved.body?.saved === true,
    `Generated session context save failed with HTTP ${saved.response.status}: ${saved.text.slice(0, 240)}`,
    { body: saved.body },
  );
  assert(
    saved.body?.sourceOfTruth === "Quipsly CallRoom.metadataJson.captureSessionContext",
    "Generated session context save did not report CallRoom metadata as source of truth.",
    { body: saved.body },
  );
  assert(saved.body?.externalSideEffects === false, "Generated session context save must not mutate external providers.", { body: saved.body });
  assert(
    saved.body?.context?.schemaVersion === 2 && typeof saved.body?.context?.revisionId === "string",
    "Generated session context save did not return a structured v2 revision.",
    { body: saved.body },
  );
  assert(
    typeof saved.body?.context?.entries?.note?.projectionId === "string"
      && typeof saved.body?.context?.entries?.goals?.[0]?.projectionId === "string"
      && typeof saved.body?.context?.entries?.tasks?.[0]?.projectionId === "string",
    "Generated session context did not expose durable note, goal, and task projection IDs.",
    { body: saved.body },
  );

  const loaded = await requestJson(
    `${baseUrl}/api/mobile/capture/sessions/context?callRoomId=${encodeURIComponent(room.id)}`,
    {
      method: "GET",
      headers: { authorization: `Bearer ${idToken}` },
    },
  );

  assert(
    loaded.response.status === 200 && loaded.body?.ok === true,
    `Generated session context load failed with HTTP ${loaded.response.status}: ${loaded.text.slice(0, 240)}`,
    { body: loaded.body },
  );
  assert(loaded.body?.context?.note === draft.note, "Generated session context note did not round-trip.", { body: loaded.body });
  assert(
    Array.isArray(loaded.body?.context?.goals) &&
      loaded.body.context.goals.length === draft.goals.length &&
      loaded.body.context.goals[0] === draft.goals[0],
    "Generated session context goals did not round-trip.",
    { body: loaded.body },
  );
  assert(
    Array.isArray(loaded.body?.context?.tasks) &&
      loaded.body.context.tasks.length === draft.tasks.length &&
      loaded.body.context.tasks[0] === draft.tasks[0],
    "Generated session context tasks did not round-trip.",
    { body: loaded.body },
  );
  assert(loaded.body?.externalSideEffects === false, "Generated session context load must not mutate external providers.", { body: loaded.body });
  assert(
    loaded.body?.context?.revisionId === saved.body?.context?.revisionId,
    "Generated session context revision did not round-trip unchanged.",
    { saved: saved.body, loaded: loaded.body },
  );

  return {
    saved: saved.body.saved === true,
    loaded: loaded.body.ok === true,
    sourceOfTruth: loaded.body.sourceOfTruth || "",
    externalSideEffects: loaded.body.externalSideEffects === true,
    noteLength: loaded.body.context?.note?.length || 0,
    goalCount: Array.isArray(loaded.body.context?.goals) ? loaded.body.context.goals.length : 0,
    taskCount: Array.isArray(loaded.body.context?.tasks) ? loaded.body.context.tasks.length : 0,
    updatedAtPresent: Boolean(loaded.body.context?.updatedAt),
  };
}

function runMobileCaptureContractSmoke(env, baseUrl, idToken) {
  const result = spawnSync(process.execPath, [
    path.join(repoRoot, "scripts/quipsly-mobile-capture-contract-smoke.mjs"),
    `--base-url=${baseUrl}`,
    `--token=${idToken}`,
    "--json",
  ], {
    cwd: repoRoot,
    env: {
      ...env,
      QUIPSLY_MOBILE_CAPTURE_BEARER_TOKEN: idToken,
    },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  let payload = null;
  try {
    payload = JSON.parse(result.stdout);
  } catch {
    // Keep stderr/stdout tails for diagnostics without exposing env or tokens.
  }

  const failedChecks = Array.isArray(payload?.checks)
    ? payload.checks
      .filter((check) => check?.status === "fail")
      .map((check) => ({
        name: check.name || "",
        summary: check.summary || "",
        details: check.details || null,
      }))
    : [];

  assert(
    result.status === 0 && payload?.ok === true && payload?.authenticated === true,
    `Mobile capture authenticated contract smoke failed with exit ${result.status}.`,
    {
      statusCounts: payload?.statusCounts || null,
      failedChecks,
      stdoutTail: result.stdout.slice(-1200),
      stderrTail: result.stderr.slice(-1200),
    },
  );

  const authenticatedCheckNames = new Set(
    payload.checks
      ?.filter((check) => String(check.name || "").includes("Authenticated"))
      ?.map((check) => check.name) || [],
  );
  assert(authenticatedCheckNames.has("oneShotIngestAuthenticatedBadRequestContract"), "Missing one-shot ingest authenticated contract proof.");
  assert(authenticatedCheckNames.has("chunkIngestAuthenticatedBadRequestContract"), "Missing chunk ingest authenticated contract proof.");

  return payload;
}

function runCaptureRuntimeUISmoke(env, baseUrl, email, password) {
  const scriptPath = path.join(
    repoRoot,
    "apps/mobile-capture/HighGroundCapture/scripts/run-capture-runtime-ui-smoke.sh",
  );
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Capture runtime UI smoke runner is missing: ${path.relative(repoRoot, scriptPath)}`);
  }

  const result = spawnSync(scriptPath, [], {
    cwd: repoRoot,
    env: {
      ...env,
      QUIPSLY_CAPTURE_UI_TEST_BASE_URL: baseUrl,
      QUIPSLY_CAPTURE_UI_TEST_EMAIL: email,
      QUIPSLY_CAPTURE_UI_TEST_PASSWORD: password,
    },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  assert(
    result.status === 0,
    `Capture runtime UI smoke failed with exit ${result.status}.`,
    {
      stdoutTail: result.stdout.slice(-1600),
      stderrTail: result.stderr.slice(-1600),
    },
  );

  return {
    requested: true,
    passed: true,
    runner: path.relative(repoRoot, scriptPath),
    note: "Runtime UI smoke used generated credentials through native Firebase login; password and tokens were not printed.",
  };
}

async function main() {
  const env = mergedEnv();
  requiredEnv(env, "DATABASE_URL");

  const baseUrl = baseUrlFromEnv(env);
  const shouldRunRuntimeUISmoke =
    args.get("run-runtime-ui-smoke") === "1" ||
    env.QUIPSLY_MOBILE_CAPTURE_RUN_RUNTIME_UI_SMOKE === "1";
  const suffix = crypto.randomBytes(4).toString("hex");
  const email = `codex-mobile-capture-${suffix}@dev.test`;
  const password = `Qp-${crypto.randomBytes(18).toString("base64url")}!26`;

  let smokeSucceeded = false;
  let firebaseDeleteIdToken = null;
  let generatedFirebaseUserCreated = false;
  let contractReport = null;
  let sessionBody = null;
  let roomJoinProof = null;
  let sessionContextProof = null;
  let runtimeUISmoke = { requested: shouldRunRuntimeUISmoke, passed: false };

  try {
    await assertServerFirebaseAdminPreflight(baseUrl);
    const firebaseBody = await firebaseSelfServeSignup(env, baseUrl, email, password);
    generatedFirebaseUserCreated = true;
    firebaseDeleteIdToken = firebaseBody.idToken;

    const sessionStart = await requestJson(`${baseUrl}/api/auth/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: firebaseBody.idToken }),
    });
    assert(
      sessionStart.response.status === 200 && sessionStart.body?.user?.email === email,
      `Session exchange failed with HTTP ${sessionStart.response.status}: ${sessionStart.text.slice(0, 240)}`,
      { body: sessionStart.body },
    );
    assert(sessionStart.body?.homeNest?.slug, "Session exchange did not create or return Home Nest truth.");
    assert(
      sessionStart.body?.onboarding?.freeMembershipStatus === "ACTIVE",
      "Session exchange did not return active free-tier onboarding truth.",
    );
    sessionBody = sessionStart.body;

    const generatedRoom = await createGeneratedCaptureSession(env, email, sessionBody);
    roomJoinProof = await assertGeneratedRoomJoin(baseUrl, firebaseBody.idToken, generatedRoom);
    sessionContextProof = await assertGeneratedSessionContext(baseUrl, firebaseBody.idToken, generatedRoom);
    contractReport = runMobileCaptureContractSmoke(env, baseUrl, firebaseBody.idToken);
    if (shouldRunRuntimeUISmoke) {
      runtimeUISmoke = runCaptureRuntimeUISmoke(env, baseUrl, email, password);
    }
    smokeSucceeded = true;
  } finally {
    let cleanup = null;
    let cleanupWarning = null;
    if (generatedFirebaseUserCreated) {
      try {
        cleanup = await cleanupGeneratedMobileArtifacts(env, baseUrl, email, firebaseDeleteIdToken);
      } catch (error) {
        cleanupWarning = error instanceof Error ? error.message : String(error);
      }
    }

    console.log(JSON.stringify({
      ok: smokeSucceeded,
      baseUrl,
      generatedEmail: redactGeneratedEmail(email),
      session: sessionBody
        ? {
          homeNestSlugPresent: Boolean(sessionBody.homeNest?.slug),
          freeTierStatus: sessionBody.onboarding?.freeMembershipStatus || "",
        }
        : null,
      roomJoin: roomJoinProof,
      sessionContext: sessionContextProof,
      runtimeUISmoke,
      mobileCaptureContract: contractReport
        ? {
          authenticated: contractReport.authenticated === true,
          statusCounts: contractReport.statusCounts,
          checkCount: Array.isArray(contractReport.checks) ? contractReport.checks.length : 0,
          authenticatedCheckCount: Array.isArray(contractReport.checks)
            ? contractReport.checks.filter((check) => String(check.name || "").includes("Authenticated")).length
            : 0,
        }
        : null,
      cleanup,
      cleanupWarning,
      note: "Generated password, Firebase token, session cookie, database URL, and bearer token were not printed.",
    }, null, 2));
  }

  if (!smokeSucceeded) {
    throw new Error("Generated mobile capture authenticated smoke did not complete.");
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
