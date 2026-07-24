#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const repoRoot = process.cwd();

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
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
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

function requiredEnv(env, name, fallback) {
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

function isGeneratedSignupEmail(email) {
  return /^codex-signup-[a-f0-9]{8}@dev\.test$/i.test(
    String(email || "").trim(),
  );
}

function redactGeneratedEmail(email) {
  return String(email || "").replace(
    /^codex-signup-([a-f0-9]{4})[a-f0-9]{4}/i,
    "codex-signup-$1****",
  );
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
  return (
    Number.parseInt(env.PRISMA_PG_CONNECTION_TIMEOUT_MS || "20000", 10) ||
    20_000
  );
}

function parseSessionCookie(setCookie) {
  return (setCookie || "")
    .split(",")
    .map((chunk) => chunk.trim())
    .find((chunk) => chunk.startsWith("session="))
    ?.split(";")[0];
}

async function requestText(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  return { response, text };
}

async function requestJson(url, options = {}) {
  const result = await requestText(url, options);
  let body = {};
  try {
    body = JSON.parse(result.text);
  } catch {
    body = { unparsedBodyPrefix: result.text.slice(0, 160) };
  }
  return { ...result, body };
}

async function canReachQuipsly(candidate) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const health = await fetch(`${candidate}/api/health`, {
      signal: controller.signal,
    });
    if (!health.ok) return false;

    const login = await fetch(`${candidate}/login?callbackUrl=%2Fprojects`, {
      signal: controller.signal,
    });
    if (!login.ok) return false;
    const loginText = await login.text();
    if (!/Create account/i.test(loginText)) return false;

    const projects = await fetch(`${candidate}/projects`, {
      redirect: "manual",
      signal: controller.signal,
    });
    if (projects.status === 404) return false;

    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function discoverBaseUrl() {
  if (process.env.QUIPSLY_SELF_SERVE_SMOKE_BASE_URL) {
    return process.env.QUIPSLY_SELF_SERVE_SMOKE_BASE_URL.replace(/\/$/, "");
  }

  const candidates = [
    "http://localhost:3025",
    "http://127.0.0.1:3025",
    "http://localhost:3012",
    "http://127.0.0.1:3012",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ];

  for (const candidate of candidates) {
    if (await canReachQuipsly(candidate)) return candidate;
  }

  return "http://localhost:3025";
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

async function deleteFirebaseUserWithRest(env, idToken) {
  if (!idToken) return false;

  const firebaseApiKey = requiredEnv(
    env,
    "QUIPSLY_SELF_SERVE_SMOKE_FIREBASE_API_KEY",
    env.NEXT_PUBLIC_FIREBASE_API_KEY,
  );

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
  if (code === "USER_NOT_FOUND" || code === "USER_NOT_FOUND : User not found") {
    return false;
  }

  throw new Error(
    `Firebase REST cleanup failed with HTTP ${response.status}: ${code || "unknown error"}`,
  );
}

async function cleanupGeneratedSignupArtifacts(
  env,
  email,
  firebaseDeleteIdToken,
) {
  if (env.QUIPSLY_SELF_SERVE_SMOKE_KEEP_ARTIFACTS === "1") {
    return { skipped: "QUIPSLY_SELF_SERVE_SMOKE_KEEP_ARTIFACTS=1" };
  }

  if (!isGeneratedSignupEmail(email)) {
    throw new Error(
      `Refusing to clean up non-generated signup smoke email: ${email}`,
    );
  }

  const cleanup = {
    deletedInvites: 0,
    deletedGrants: 0,
    deletedDeletionRequests: 0,
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
        OR: [{ primaryEmail: email }, { aliases: { some: { email } } }],
      },
      select: { id: true },
    });

    cleanup.deletedInvites = (
      await prisma.studioNestInvite.deleteMany({ where: { email } })
    ).count;
    cleanup.deletedGrants = (
      await prisma.studioProjectAccessGrant.deleteMany({ where: { email } })
    ).count;
    cleanup.deletedDeletionRequests = (
      await prisma.userAccountDeletionRequest.deleteMany({
        where: { emailSnapshot: email },
      })
    ).count;

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
      cleanup.deletedMemberships = (
        await prisma.membership.deleteMany({ where: { userId: user.id } })
      ).count;
    }

    cleanup.deletedUsers = (
      await prisma.user.deleteMany({ where: { primaryEmail: email } })
    ).count;
  } finally {
    await prisma.$disconnect();
  }

  const firebaseProjectId =
    env.FIREBASE_PROJECT_ID ||
    env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    "quipsly-reef";

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
      cleanup.deletedFirebaseUserViaRest = await deleteFirebaseUserWithRest(
        env,
        firebaseDeleteIdToken,
      );
      if (!cleanup.deletedFirebaseUserViaRest) {
        throw error;
      }
    }
  }

  return cleanup;
}

async function firebaseSelfServeSignup(env, email, password) {
  const firebaseApiKey = requiredEnv(
    env,
    "QUIPSLY_SELF_SERVE_SMOKE_FIREBASE_API_KEY",
    env.NEXT_PUBLIC_FIREBASE_API_KEY,
  );

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
    `Firebase self-serve signup failed with HTTP ${response.status}`,
    { firebaseErrorCode: body?.error?.message || undefined },
  );

  return body;
}

async function firebaseVerifiedSignIn(env, email, password) {
  const firebaseApiKey = requiredEnv(
    env,
    "QUIPSLY_SELF_SERVE_SMOKE_FIREBASE_API_KEY",
    env.NEXT_PUBLIC_FIREBASE_API_KEY,
  );
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
    `Firebase verified sign-in failed with HTTP ${response.status}`,
    { firebaseErrorCode: body?.error?.message || undefined },
  );

  return body;
}

async function markGeneratedFirebaseEmailVerified(env, firebaseUid) {
  const firebaseProjectId =
    env.FIREBASE_PROJECT_ID ||
    env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    "quipsly-reef";

  if (!getApps().length) {
    initializeApp({ projectId: firebaseProjectId });
  }

  await getAuth().updateUser(firebaseUid, { emailVerified: true });
}

async function assertServerFirebaseAdminPreflight(baseUrl) {
  const preflight = await requestText(
    `${baseUrl}/api/auth/firebase-admin-preflight`,
  );
  let body = {};
  try {
    body = JSON.parse(preflight.text);
  } catch {
    // Keep the raw response out of the happy path; include only a short prefix below.
  }

  if (preflight.response.status === 200 && body?.ok === true) {
    return;
  }

  if (
    preflight.response.status === 503 &&
    body?.error === "Firebase Admin credential unavailable"
  ) {
    throw new Error(
      [
        "Server Firebase Admin preflight failed before signup.",
        body?.action ||
          "Refresh ADC or provide server Firebase Admin credentials before creating generated users.",
        body?.firebaseAdminRuntime
          ? `Runtime: ${JSON.stringify(body.firebaseAdminRuntime)}`
          : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  throw new Error(
    `Server Firebase Admin preflight returned HTTP ${preflight.response.status}: ${preflight.text.slice(0, 160)}`,
  );
}

async function assertMobileWorkAndDeletionContracts(baseUrl, idToken, suffix) {
  const capturedAt = new Date();
  const tagLabel = `Release Proof ${suffix}`;
  const authorization = { authorization: `Bearer ${idToken}` };

  const quickEntry = async (input) =>
    requestJson(`${baseUrl}/api/mobile/capture/quick-entry`, {
      method: "POST",
      headers: {
        ...authorization,
        "content-type": "application/json",
      },
      body: JSON.stringify(input),
    });

  const noteInput = {
    clientRequestId: crypto.randomUUID(),
    callRoomId: null,
    kind: "NOTE",
    title: "Preview release note",
    body: `Disposable signed preview note ${suffix}.`,
    sourceUrl: null,
    tagIds: [],
    newTagLabels: [tagLabel],
    capturedAt: capturedAt.toISOString(),
    dueAt: null,
    reminderAt: null,
    recurrence: null,
  };
  const taskInput = {
    clientRequestId: crypto.randomUUID(),
    callRoomId: null,
    kind: "TASK",
    title: "Preview release task",
    body: `Disposable signed preview task ${suffix}.`,
    sourceUrl: null,
    tagIds: [],
    newTagLabels: [tagLabel],
    capturedAt: capturedAt.toISOString(),
    dueAt: new Date(capturedAt.getTime() + 2 * 86_400_000).toISOString(),
    reminderAt: new Date(capturedAt.getTime() + 86_400_000).toISOString(),
    recurrence: null,
  };
  const goalInput = {
    clientRequestId: crypto.randomUUID(),
    callRoomId: null,
    kind: "GOAL",
    title: "Preview release goal",
    body: `Disposable signed preview goal ${suffix}.`,
    sourceUrl: null,
    tagIds: [],
    newTagLabels: [tagLabel],
    capturedAt: capturedAt.toISOString(),
    dueAt: null,
    reminderAt: null,
    recurrence: null,
  };

  const note = await quickEntry(noteInput);
  assert(
    note.response.status === 200 &&
      note.body?.ok === true &&
      note.body?.idempotentReplay === false &&
      note.body?.entry?.kind === "NOTE" &&
      note.body?.entry?.destination === "HOME_NEST" &&
      note.body?.entry?.tags?.some?.((tag) => tag.label === tagLabel) &&
      note.body?.tagVocabulary?.createdCount === 1,
    `Signed Home Nest note capture failed with HTTP ${note.response.status}`,
    { code: note.body?.code || undefined },
  );

  const noteReplay = await quickEntry(noteInput);
  assert(
    noteReplay.response.status === 200 &&
      noteReplay.body?.idempotentReplay === true &&
      noteReplay.body?.entry?.id === note.body?.entry?.id,
    `Signed Home Nest note replay failed with HTTP ${noteReplay.response.status}`,
    { code: noteReplay.body?.code || undefined },
  );

  const task = await quickEntry(taskInput);
  assert(
    task.response.status === 200 &&
      task.body?.ok === true &&
      task.body?.idempotentReplay === false &&
      task.body?.entry?.kind === "TASK" &&
      task.body?.entry?.destination === "HOME_NEST" &&
      task.body?.entry?.dueAt === taskInput.dueAt &&
      task.body?.entry?.reminder?.remindAt === taskInput.reminderAt &&
      task.body?.entry?.tags?.some?.((tag) => tag.label === tagLabel) &&
      task.body?.tagVocabulary?.reusedCount === 1 &&
      task.body?.boundaries?.externalCalendarMutated === false &&
      task.body?.boundaries?.deviceNotificationScheduled === false,
    `Signed Home Nest task capture failed with HTTP ${task.response.status}`,
    { code: task.body?.code || undefined },
  );

  const goal = await quickEntry(goalInput);
  assert(
    goal.response.status === 200 &&
      goal.body?.ok === true &&
      goal.body?.idempotentReplay === false &&
      goal.body?.entry?.kind === "GOAL" &&
      goal.body?.entry?.destination === "HOME_NEST" &&
      goal.body?.entry?.tags?.some?.((tag) => tag.label === tagLabel) &&
      goal.body?.tagVocabulary?.reusedCount === 1,
    `Signed Home Nest goal capture failed with HTTP ${goal.response.status}`,
    { code: goal.body?.code || undefined },
  );

  const deletionBefore = await requestJson(
    `${baseUrl}/api/account/deletion-request`,
    { headers: authorization },
  );
  assert(
    deletionBefore.response.status === 200 &&
      deletionBefore.body?.ok === true &&
      deletionBefore.body?.request === null,
    `Initial account-deletion status failed with HTTP ${deletionBefore.response.status}`,
  );

  const deletionCreate = await requestJson(
    `${baseUrl}/api/account/deletion-request`,
    {
      method: "POST",
      headers: {
        ...authorization,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        reason: "Disposable signed preview deletion proof",
        source: "generated-self-serve-preview-smoke",
        appSurface: "HighGroundCapture",
      }),
    },
  );
  assert(
    deletionCreate.response.status === 200 &&
      deletionCreate.body?.ok === true &&
      deletionCreate.body?.request?.status === "REQUESTED" &&
      deletionCreate.body?.request?.reusedExistingRequest === false &&
      deletionCreate.body?.policy?.targetDays === 30,
    `Account-deletion request creation failed with HTTP ${deletionCreate.response.status}`,
    { error: deletionCreate.body?.error || undefined },
  );

  const deletionReplay = await requestJson(
    `${baseUrl}/api/account/deletion-request`,
    {
      method: "POST",
      headers: {
        ...authorization,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        reason: "This retry must converge",
        source: "generated-self-serve-preview-smoke",
      }),
    },
  );
  assert(
    deletionReplay.response.status === 200 &&
      deletionReplay.body?.request?.id === deletionCreate.body?.request?.id &&
      deletionReplay.body?.request?.reusedExistingRequest === true,
    `Account-deletion request replay failed with HTTP ${deletionReplay.response.status}`,
  );

  const deletionReopen = await requestJson(
    `${baseUrl}/api/account/deletion-request`,
    { headers: authorization },
  );
  assert(
    deletionReopen.response.status === 200 &&
      deletionReopen.body?.request?.id === deletionCreate.body?.request?.id &&
      deletionReopen.body?.request?.status === "REQUESTED" &&
      deletionReopen.body?.request?.active === true,
    `Account-deletion request reopen failed with HTTP ${deletionReopen.response.status}`,
  );

  return {
    homeNestNote: "created-and-replayed",
    homeNestTask: "created-with-due-date-reminder-intent-and-tag",
    homeNestGoal: "created-with-shared-tag",
    canonicalTag: "created-once-and-reused",
    accountDeletion: "created-replayed-and-reopened",
  };
}

async function main() {
  const env = mergedEnv();
  requiredEnv(env, "DATABASE_URL");

  const baseUrl = await discoverBaseUrl();
  const suffix = crypto.randomBytes(4).toString("hex");
  const email = `codex-signup-${suffix}@dev.test`;
  const password = `Qp-${crypto.randomBytes(18).toString("base64url")}!26`;

  let smokeSucceeded = false;
  let firebaseDeleteIdToken = null;
  let generatedFirebaseUserCreated = false;

  try {
    await assertServerFirebaseAdminPreflight(baseUrl);
    const unverifiedFirebaseBody = await firebaseSelfServeSignup(
      env,
      email,
      password,
    );
    generatedFirebaseUserCreated = true;
    firebaseDeleteIdToken = unverifiedFirebaseBody.idToken;

    const unverifiedSessionStart = await requestText(
      `${baseUrl}/api/auth/session`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken: unverifiedFirebaseBody.idToken }),
      },
    );
    const unverifiedSessionBody = JSON.parse(unverifiedSessionStart.text);
    assert(
      unverifiedSessionStart.response.status === 403 &&
        unverifiedSessionBody?.code === "EMAIL_VERIFICATION_REQUIRED",
      `Unverified Firebase email was not denied at session exchange. HTTP ${unverifiedSessionStart.response.status}`,
      { code: unverifiedSessionBody?.code || undefined },
    );

    await markGeneratedFirebaseEmailVerified(
      env,
      unverifiedFirebaseBody.localId,
    );
    const firebaseBody = await firebaseVerifiedSignIn(env, email, password);
    firebaseDeleteIdToken = firebaseBody.idToken;

    const sessionStart = await requestText(`${baseUrl}/api/auth/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: firebaseBody.idToken }),
    });

    assert(
      sessionStart.response.status === 200,
      `Session create failed with HTTP ${sessionStart.response.status}: ${sessionStart.text.slice(0, 240)}`,
    );

    const cookie = parseSessionCookie(
      sessionStart.response.headers.get("set-cookie"),
    );
    assert(cookie, "Session cookie was not set.");

    const sessionBody = JSON.parse(sessionStart.text);
    assert(sessionBody.user?.email === email, "Session user email mismatch.");
    assert(
      sessionBody.homeNest?.slug,
      "Home Nest missing from session response.",
    );
    assert(
      sessionBody.onboarding?.freePlanSlug === "quipsly-free",
      "Free-tier onboarding receipt missing from session response.",
    );
    assert(
      sessionBody.onboarding?.freeMembershipStatus === "ACTIVE",
      "Free-tier onboarding did not report ACTIVE membership.",
    );
    assert(
      sessionBody.onboarding?.homeNestSlug === sessionBody.homeNest.slug,
      "Onboarding Home Nest slug does not match session Home Nest.",
    );

    const routeChecks = [
      [
        "/api/auth/session",
        200,
        new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
      ],
      ["/projects", 200, /Home Nest|My Nests|Create a Nest/i],
      [
        `/nests/${sessionBody.homeNest.slug}`,
        200,
        /Home Nest|Nest|Open|Access/i,
      ],
      [
        `/create?project=${encodeURIComponent(sessionBody.homeNest.slug)}`,
        200,
        /Welcome|Document|Nest|Quipsly/i,
      ],
    ];

    for (const [pathPart, expectedStatus, expectedPattern] of routeChecks) {
      const route = await requestText(`${baseUrl}${pathPart}`, {
        headers: { cookie },
      });
      assert(
        route.response.status === expectedStatus,
        `${pathPart} returned HTTP ${route.response.status}, expected ${expectedStatus}`,
      );
      assert(
        expectedPattern.test(route.text),
        `${pathPart} did not include expected signed-in content`,
      );
    }

    const nativeSessionCheck = await requestText(
      `${baseUrl}/api/mac/session-check`,
      {
        headers: { authorization: `Bearer ${firebaseBody.idToken}` },
      },
    );
    assert(
      nativeSessionCheck.response.status === 200,
      `/api/mac/session-check returned HTTP ${nativeSessionCheck.response.status}: ${nativeSessionCheck.text.slice(0, 240)}`,
    );
    const nativeSessionBody = JSON.parse(nativeSessionCheck.text);
    assert(
      nativeSessionBody.user?.email === email,
      "Native session-check user email mismatch.",
    );
    assert(
      nativeSessionBody.homeNest?.slug,
      "Native session-check Home Nest missing.",
    );
    assert(
      nativeSessionBody.onboarding?.freeMembershipStatus === "ACTIVE",
      "Native session-check free-tier onboarding did not report ACTIVE membership.",
    );
    assert(
      nativeSessionBody.onboarding?.homeNestSlug ===
        nativeSessionBody.homeNest.slug,
      "Native session-check onboarding Home Nest slug does not match Home Nest.",
    );

    const mobileContextCheck = await requestText(
      `${baseUrl}/api/mac/mobile-context`,
      {
        headers: { authorization: `Bearer ${firebaseBody.idToken}` },
      },
    );
    assert(
      mobileContextCheck.response.status === 200,
      `/api/mac/mobile-context returned HTTP ${mobileContextCheck.response.status}: ${mobileContextCheck.text.slice(0, 240)}`,
    );
    const mobileContextBody = JSON.parse(mobileContextCheck.text);
    assert(
      mobileContextBody.user?.email === email,
      "Mobile/native context user email mismatch.",
    );
    assert(
      mobileContextBody.homeNest?.slug === sessionBody.homeNest.slug,
      "Mobile/native context Home Nest mismatch.",
    );
    assert(
      Array.isArray(mobileContextBody.projects),
      "Mobile/native context projects list missing.",
    );

    const mobileWorkAndDeletion = await assertMobileWorkAndDeletionContracts(
      baseUrl,
      firebaseBody.idToken,
      suffix,
    );

    smokeSucceeded = true;
    console.log(
      JSON.stringify(
        {
          ok: true,
          baseUrl,
          generatedEmail: redactGeneratedEmail(email),
          session: {
            homeNestSlug: sessionBody.homeNest.slug,
            freeTierStatus: sessionBody.onboarding.freeMembershipStatus,
          },
          unverifiedEmailBoundary: "pass",
          verifiedEmailSession: "pass",
          nativeSessionCheck: "pass",
          mobileNativeContext: "pass",
          mobileWorkAndDeletion,
          routeChecks: routeChecks.map(([pathPart]) => String(pathPart)),
          note: "Generated password, Firebase token, and session cookie were not printed.",
        },
        null,
        2,
      ),
    );
  } finally {
    try {
      if (generatedFirebaseUserCreated) {
        const cleanup = await cleanupGeneratedSignupArtifacts(
          env,
          email,
          firebaseDeleteIdToken,
        );
        console.log(
          JSON.stringify(
            {
              ok: true,
              cleanup: {
                generatedSelfServeSignupArtifacts: cleanup,
                afterSuccessfulSmoke: smokeSucceeded,
              },
            },
            null,
            2,
          ),
        );
      }
    } catch (cleanupError) {
      console.error(
        `QUIPSLY_SELF_SERVE_SIGNUP_SMOKE_CLEANUP_WARN ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
      );
    }
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        details: error?.details || undefined,
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
