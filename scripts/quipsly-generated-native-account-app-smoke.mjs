#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

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

function requiredEnv(env, name) {
  const value = env[name];
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

function baseUrlFromEnv(env) {
  return (
    env.QUIPSLY_NATIVE_SMOKE_BASE_URL
    || env.QUIPSLY_AUTH_SMOKE_BASE_URL
    || "https://nest.quipsly.com"
  ).replace(/\/$/, "");
}

function agentUrlFromEnv(env) {
  return (env.QUIPSLY_AGENT_URL || "http://127.0.0.1:8080").replace(/\/$/, "");
}

function isGeneratedNativeEmail(email) {
  return /^codex-native-[a-f0-9]{8}@dev\.test$/i.test(String(email || "").trim());
}

function redactGeneratedEmail(email) {
  return String(email || "").replace(/^codex-native-([a-f0-9]{4})[a-f0-9]{4}/i, "codex-native-$1****");
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

async function assertAgentReachable(agentUrl) {
  const health = await requestJson(`${agentUrl}/health`);
  assert(
    health.response.status === 200 && health.body?.status === "ok",
    `QuipslyStudio AgentServer is not reachable at ${agentUrl}. Launch apps/QuipslyStudio first.`,
    { httpStatus: health.response.status, body: health.body },
  );
}

async function assertServerFirebaseAdminPreflight(baseUrl) {
  const preflight = await requestJson(`${baseUrl}/api/auth/firebase-admin-preflight`);
  if (preflight.response.status === 200 && preflight.body?.ok === true) return;

  if (preflight.response.status === 503 && preflight.body?.error === "Firebase Admin credential unavailable") {
    throw new Error(
      [
        "Server Firebase Admin preflight failed before native smoke.",
        preflight.body?.action || "Refresh ADC or provide server Firebase Admin credentials before creating generated users.",
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
  if (env.QUIPSLY_NATIVE_SMOKE_FIREBASE_API_KEY) return env.QUIPSLY_NATIVE_SMOKE_FIREBASE_API_KEY;
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
    `Firebase native generated signup failed with HTTP ${response.status}`,
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

async function cleanupGeneratedNativeArtifacts(env, baseUrl, email, firebaseDeleteIdToken) {
  if (env.QUIPSLY_NATIVE_SMOKE_KEEP_ARTIFACTS === "1") {
    return { skipped: "QUIPSLY_NATIVE_SMOKE_KEEP_ARTIFACTS=1" };
  }

  if (!isGeneratedNativeEmail(email)) {
    throw new Error(`Refusing to clean up non-generated native smoke email: ${email}`);
  }

  const cleanup = {
    deletedInvites: 0,
    deletedGrants: 0,
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

  const firebaseProjectId =
    env.FIREBASE_PROJECT_ID
    || env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    || "quipsly-reef";

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

function parseNativeSmokeOutput(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    const start = stdout.lastIndexOf("\n{");
    if (start >= 0) {
      return JSON.parse(stdout.slice(start + 1));
    }
    throw new Error(`Native account smoke did not return parseable JSON. Output prefix: ${stdout.slice(0, 180)}`);
  }
}

function runNativeAppSmoke(env, baseUrl, agentUrl, email, password) {
  const scriptPath = path.join(repoRoot, "apps/QuipslyStudio/script/smoke_native_account_control_plane.sh");
  const result = spawnSync(scriptPath, {
    cwd: path.join(repoRoot, "apps/QuipslyStudio"),
    env: {
      ...env,
      QUIPSLY_AGENT_URL: agentUrl,
      QUIPSLY_NATIVE_SMOKE_BASE_URL: baseUrl,
      QUIPSLY_NATIVE_SMOKE_EMAIL: email,
      QUIPSLY_NATIVE_SMOKE_PASSWORD: password,
      QUIPSLY_NATIVE_SMOKE_CLEAR_AFTER: "1",
      QUIPSLY_NATIVE_SMOKE_CLEAR_EMAIL_AFTER: "1",
    },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    throw new Error(
      `Native account control-plane smoke failed with exit ${result.status}. Stdout tail: ${result.stdout.slice(-1200)} Stderr tail: ${result.stderr.slice(-1200)}`,
    );
  }

  const payload = parseNativeSmokeOutput(result.stdout);
  const credentialed = payload?.credentialedSmoke || {};
  assert(credentialed.credentialed === true, "Native smoke did not run credentialed mode.", payload);
  assert(credentialed.hasSavedSession === true, "Native smoke did not save a refresh session.", payload);
  assert(credentialed.isVerified === true, "Native smoke did not verify with Nest.", payload);
  assert(credentialed.freeTierStatus === "ACTIVE", "Native smoke did not receive active free-tier truth.", payload);
  assert(Boolean(credentialed.homeNestSlug), "Native smoke did not receive Home Nest truth.", payload);
  assert(credentialed.clearedAfter === true, "Native smoke did not clear the generated saved session after proof.", payload);

  return payload;
}

async function clearNativeAppSession(agentUrl, baseUrl) {
  try {
    await requestJson(
      `${agentUrl}/native_account?action=clear&clear_email=1&base_url=${encodeURIComponent(baseUrl)}`,
    );
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline) {
      const state = await requestJson(`${agentUrl}/state`);
      const nativeAccount = state.body?.nativeAccount || {};
      if (
        state.body?.agentPendingCommandCount === 0
        && nativeAccount.isBusy !== true
        && nativeAccount.hasSavedSession !== true
      ) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  } catch {
    // Best-effort local app cleanup only. Backend/Firebase cleanup still runs below.
  }
  return false;
}

async function main() {
  const env = mergedEnv();
  requiredEnv(env, "DATABASE_URL");

  const baseUrl = baseUrlFromEnv(env);
  const agentUrl = agentUrlFromEnv(env);
  const suffix = crypto.randomBytes(4).toString("hex");
  const email = `codex-native-${suffix}@dev.test`;
  const password = `Qp-${crypto.randomBytes(18).toString("base64url")}!26`;

  let firebaseDeleteIdToken = null;
  let generatedFirebaseUserCreated = false;
  let smokeSucceeded = false;
  let nativePayload = null;
  let nativeLocalSessionClearedAfterFailure = false;

  try {
    await assertAgentReachable(agentUrl);
    await assertServerFirebaseAdminPreflight(baseUrl);
    const firebaseBody = await firebaseSelfServeSignup(env, baseUrl, email, password);
    generatedFirebaseUserCreated = true;
    firebaseDeleteIdToken = firebaseBody.idToken;

    nativePayload = runNativeAppSmoke(env, baseUrl, agentUrl, email, password);
    smokeSucceeded = true;
  } finally {
    if (!smokeSucceeded) {
      nativeLocalSessionClearedAfterFailure = await clearNativeAppSession(agentUrl, baseUrl);
    }
    if (generatedFirebaseUserCreated) {
      const cleanup = await cleanupGeneratedNativeArtifacts(env, baseUrl, email, firebaseDeleteIdToken);
      console.log(JSON.stringify({
        ok: smokeSucceeded,
        baseUrl,
        agentUrl,
        generatedEmail: redactGeneratedEmail(email),
        nativeAppCredentialedSmoke: nativePayload
          ? {
            credentialed: nativePayload.credentialedSmoke?.credentialed === true,
            hasSavedSession: nativePayload.credentialedSmoke?.hasSavedSession === true,
            isVerified: nativePayload.credentialedSmoke?.isVerified === true,
            freeTierStatus: nativePayload.credentialedSmoke?.freeTierStatus || "",
            homeNestSlugPresent: Boolean(nativePayload.credentialedSmoke?.homeNestSlug),
            visibleProjectCount: Number.isFinite(Number(nativePayload.credentialedSmoke?.visibleProjectCount))
              ? Number(nativePayload.credentialedSmoke?.visibleProjectCount)
              : null,
            clearedAfter: nativePayload.credentialedSmoke?.clearedAfter === true,
          }
          : null,
        cleanup: {
          generatedNativeAppArtifacts: cleanup,
          nativeLocalSessionClearedAfterFailure,
          afterSuccessfulSmoke: smokeSucceeded,
        },
        note: "Generated password, Firebase tokens, refresh tokens, session cookies, and database URLs were not printed.",
      }, null, 2));
    }
  }

  if (!smokeSucceeded) {
    throw new Error("Native app generated smoke did not complete.");
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
