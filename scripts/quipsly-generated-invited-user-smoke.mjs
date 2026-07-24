#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
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

  return env;
}

function assertConfigured(env) {
  const missing = [];
  if (!env.DATABASE_URL) missing.push("DATABASE_URL");
  if (!env.NEXT_PUBLIC_FIREBASE_API_KEY && !env.QUIPSLY_AUTH_SMOKE_FIREBASE_API_KEY) {
    missing.push("NEXT_PUBLIC_FIREBASE_API_KEY or QUIPSLY_AUTH_SMOKE_FIREBASE_API_KEY");
  }
  if (!env.AUTH_SECRET && !env.NEXTAUTH_SECRET && !env.AUTH_SECRET_FILE) {
    missing.push("AUTH_SECRET, NEXTAUTH_SECRET, or AUTH_SECRET_FILE");
  }
  if (missing.length > 0) {
    throw new Error(`Generated invite smoke is missing ${missing.join(", ")}.`);
  }
}

function isGeneratedSmokeEmail(email) {
  return /^codex-invite-[a-f0-9]{8}@dev\.test$/i.test(String(email || "").trim());
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

function prismaConnectionTimeoutMillis(env) {
  return Number.parseInt(env.PRISMA_PG_CONNECTION_TIMEOUT_MS || "20000", 10) || 20_000;
}

function retryDelayMillis(env) {
  return Number.parseInt(env.QUIPSLY_GENERATED_SMOKE_RETRY_DELAY_MS || "2500", 10) || 2_500;
}

function retryAttempts(env) {
  return Number.parseInt(env.QUIPSLY_GENERATED_SMOKE_RETRIES || "3", 10) || 3;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetries(label, env, fn) {
  const attempts = retryAttempts(env);
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) break;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`QUIPSLY_GENERATED_INVITE_SMOKE_RETRY ${label} attempt ${attempt}/${attempts} failed: ${message}`);
      await sleep(retryDelayMillis(env));
    }
  }
  throw lastError;
}

async function chooseProjectSlug(env) {
  if (env.QUIPSLY_INVITE_SMOKE_PROJECT_SLUG?.trim()) {
    return env.QUIPSLY_INVITE_SMOKE_PROJECT_SLUG.trim();
  }

  const preferred = [
    "marine-biology-research",
    "high-ground-odyssey",
    "welcome-to-quipsly-beta",
  ];

  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: env.DATABASE_URL,
      max: Number.parseInt(env.PRISMA_PG_POOL_MAX || "2", 10) || 2,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: prismaConnectionTimeoutMillis(env),
    }),
    log: ["error"],
  });

  try {
    const projects = await prisma.studioProject.findMany({
      where: { slug: { in: preferred } },
      select: { slug: true },
    });

    const existingPreferred = new Set(projects.map((project) => project.slug));
    const preferredMatch = preferred.find((slug) => existingPreferred.has(slug));
    if (preferredMatch) return preferredMatch;

    const fallback = await prisma.studioProject.findFirst({
      orderBy: { updatedAt: "desc" },
      select: { slug: true },
    });

    if (fallback?.slug) return fallback.slug;
    throw new Error("No StudioProject/Nest exists for generated invite smoke.");
  } finally {
    await prisma.$disconnect();
  }
}

function run(label, args, env, tokenFile) {
  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.status !== 0) {
    try {
      fs.rmSync(tokenFile, { force: true });
    } catch {
      // Best-effort cleanup only.
    }
    throw new Error(`${label} failed with exit ${result.status}`);
  }
}

async function runWithRetries(label, args, env, tokenFile) {
  return withRetries(label, env, async () => run(label, args, env, tokenFile));
}

async function cleanupGeneratedSmokeArtifacts(env, email) {
  if (env.QUIPSLY_GENERATED_SMOKE_KEEP_ARTIFACTS === "1") {
    return { skipped: "QUIPSLY_GENERATED_SMOKE_KEEP_ARTIFACTS=1" };
  }

  if (!isGeneratedSmokeEmail(email)) {
    throw new Error(`Refusing to clean up non-generated smoke email: ${email}`);
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: env.DATABASE_URL,
      max: Number.parseInt(env.PRISMA_PG_POOL_MAX || "2", 10) || 2,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: prismaConnectionTimeoutMillis(env),
    }),
    log: ["error"],
  });

  const homeSlug = `home-${slugifyEmailForHomeNest(email)}`;
  const cleanup = {
    deletedInvites: 0,
    deletedGrants: 0,
    deletedHomeProjects: 0,
    deletedMemberships: 0,
    deletedUsers: 0,
    deletedFirebaseUser: false,
  };

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

    const homeProjects = await prisma.studioProject.findMany({
      where: {
        slug: homeSlug,
        sourceLabel: "nest-kind:home",
      },
      select: { id: true },
    });

    cleanup.deletedInvites = (await prisma.studioNestInvite.deleteMany({ where: { email } })).count;
    cleanup.deletedGrants = (await prisma.studioProjectAccessGrant.deleteMany({ where: { email } })).count;

    for (const project of homeProjects) {
      await prisma.studioProject.delete({ where: { id: project.id } });
      cleanup.deletedHomeProjects += 1;
    }

    if (user?.id) {
      cleanup.deletedMemberships = (await prisma.membership.deleteMany({ where: { userId: user.id } })).count;
    }

    cleanup.deletedUsers = (await prisma.user.deleteMany({
      where: {
        primaryEmail: email,
      },
    })).count;
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
    if (error?.code !== "auth/user-not-found") throw error;
  }

  return cleanup;
}

async function main() {
  const baseEnv = applyCloudSqlProxyRewrite(mergedEnv());
  assertConfigured(baseEnv);

  const suffix = crypto.randomBytes(4).toString("hex");
  const email = `codex-invite-${suffix}@dev.test`;
  const password = `Qp-${crypto.randomBytes(18).toString("base64url")}!26`;
  const tokenFile = path.join(os.tmpdir(), `quipsly-invite-${suffix}.token`);
  const projectSlug = await withRetries("project lookup", baseEnv, () => chooseProjectSlug(baseEnv));

  const smokeEnv = {
    ...baseEnv,
    QUIPSLY_INVITE_SMOKE_EMAIL: email,
    QUIPSLY_INVITE_SMOKE_PASSWORD: password,
    QUIPSLY_INVITE_SMOKE_PROJECT_SLUG: projectSlug,
    QUIPSLY_INVITE_SMOKE_ROLE: baseEnv.QUIPSLY_INVITE_SMOKE_ROLE || "VIEWER",
    QUIPSLY_INVITE_SMOKE_TOKEN_FILE: tokenFile,
    QUIPSLY_AUTH_SMOKE_EMAIL: email,
    QUIPSLY_AUTH_SMOKE_PASSWORD: password,
    QUIPSLY_AUTH_SMOKE_EXPECT_ADMIN: "0",
    QUIPSLY_AUTH_SMOKE_EXPECT_PROJECT_SLUG: projectSlug,
    QUIPSLY_AUTH_SMOKE_EXPECT_INVITE_ROLE: baseEnv.QUIPSLY_INVITE_SMOKE_ROLE || "VIEWER",
    QUIPSLY_AUTH_SMOKE_INVITE_TOKEN_FILE: tokenFile,
  };

  let smokeSucceeded = false;
  try {
    await runWithRetries("invite setup", ["scripts/quipsly-invited-user-smoke-setup.mjs"], smokeEnv, tokenFile);
    run("auth smoke", ["scripts/quipsly-firebase-auth-smoke.mjs"], smokeEnv, tokenFile);
    smokeSucceeded = true;
  } finally {
    try {
      fs.rmSync(tokenFile, { force: true });
    } catch {
      // Best-effort cleanup only.
    }
    try {
      const cleanup = await withRetries("generated artifact cleanup", baseEnv, () => cleanupGeneratedSmokeArtifacts(baseEnv, email));
      console.log(JSON.stringify({
        ok: true,
        cleanup: {
          generatedSmokeArtifacts: cleanup,
          afterSuccessfulSmoke: smokeSucceeded,
        },
      }, null, 2));
    } catch (cleanupError) {
      console.error(`QUIPSLY_GENERATED_INVITE_SMOKE_CLEANUP_WARN ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
    }
  }
}

main().catch((error) => {
  console.error(`QUIPSLY_GENERATED_INVITE_SMOKE_FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
