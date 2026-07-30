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

function assertConfigured(env) {
  const missing = [];
  if (!env.DATABASE_URL) missing.push("DATABASE_URL");
  if (
    !env.NEXT_PUBLIC_FIREBASE_API_KEY &&
    !env.QUIPSLY_AUTH_SMOKE_FIREBASE_API_KEY
  ) {
    missing.push(
      "NEXT_PUBLIC_FIREBASE_API_KEY or QUIPSLY_AUTH_SMOKE_FIREBASE_API_KEY",
    );
  }
  if (missing.length > 0) {
    throw new Error(`Generated admin smoke is missing ${missing.join(", ")}.`);
  }
}

function createPrisma(env) {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: env.DATABASE_URL,
      max: Number.parseInt(env.PRISMA_PG_POOL_MAX || "2", 10) || 2,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis:
        Number.parseInt(env.PRISMA_PG_CONNECTION_TIMEOUT_MS || "30000", 10) ||
        30_000,
    }),
    log: ["error"],
  });
}

function isGeneratedAdminEmail(email) {
  return /^codex-admin-[a-f0-9]{8}@dev\.test$/i.test(
    String(email || "").trim(),
  );
}

function isGeneratedAliasEmail(email) {
  return /^codex-alias-[a-f0-9]{8}@dev\.test$/i.test(
    String(email || "").trim(),
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

function firebaseProjectId(env) {
  return (
    env.FIREBASE_PROJECT_ID ||
    env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    "quipsly-reef"
  );
}

function ensureFirebaseAdmin(env) {
  if (!getApps().length) {
    initializeApp({ projectId: firebaseProjectId(env) });
  }
  return getAuth();
}

function runAuthSmoke(env) {
  const result = spawnSync(
    process.execPath,
    ["scripts/quipsly-firebase-auth-smoke.mjs"],
    {
      cwd: repoRoot,
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`admin auth smoke failed with exit ${result.status}`);
  }
}

function runPreviewPromotion(env) {
  const result = spawnSync(
    "bash",
    ["scripts/release/quipsly-promote-preview.sh"],
    {
      cwd: repoRoot,
      env: {
        ...env,
        QUIPSLY_RELEASE_SMOKE_EXPECT_ADMIN: "1",
      },
      stdio: "inherit",
    },
  );

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`preview promotion failed with exit ${result.status}`);
  }
}

function parseMode(argv) {
  const args = argv.slice(2);
  if (args.length === 0) return "auth-smoke";
  if (args.length === 1 && args[0] === "--promote-preview")
    return "promote-preview";
  if (args.length === 1 && args[0] === "--alias-access-smoke")
    return "alias-access-smoke";
  throw new Error(
    "Usage: node scripts/quipsly-generated-admin-user-smoke.mjs " +
      "[--promote-preview|--alias-access-smoke]",
  );
}

async function cleanupGeneratedAdminArtifacts(
  env,
  email,
  additionalEmails = [],
) {
  if (env.QUIPSLY_ADMIN_SMOKE_KEEP_ARTIFACTS === "1") {
    return { skipped: "QUIPSLY_ADMIN_SMOKE_KEEP_ARTIFACTS=1" };
  }

  if (!isGeneratedAdminEmail(email)) {
    throw new Error(
      `Refusing to clean up non-generated admin smoke email: ${email}`,
    );
  }
  if (additionalEmails.some((candidate) => !isGeneratedAliasEmail(candidate))) {
    throw new Error("Refusing to clean up a non-generated alias smoke email.");
  }
  const generatedEmails = [email, ...additionalEmails];

  const cleanup = {
    deletedInvites: 0,
    deletedGrants: 0,
    deletedHomeProjects: 0,
    deletedMemberships: 0,
    deletedUsers: 0,
    deletedFirebaseUser: false,
    firebaseUserMissing: false,
    verifiedDatabaseClean: false,
    verifiedFirebaseClean: false,
  };

  const prisma = createPrisma(env);
  const homeSlug = `home-${slugifyEmailForHomeNest(email)}`;
  let userId = null;

  try {
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ primaryEmail: email }, { aliases: { some: { email } } }],
      },
      select: { id: true },
    });
    userId = user?.id || null;

    cleanup.deletedInvites = (
      await prisma.studioNestInvite.deleteMany({
        where: { email: { in: generatedEmails } },
      })
    ).count;
    cleanup.deletedGrants = (
      await prisma.studioProjectAccessGrant.deleteMany({
        where: { email: { in: generatedEmails } },
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

    const [
      remainingInvites,
      remainingGrants,
      remainingHomeProjects,
      remainingUsers,
      remainingMemberships,
    ] = await Promise.all([
      prisma.studioNestInvite.count({
        where: { email: { in: generatedEmails } },
      }),
      prisma.studioProjectAccessGrant.count({
        where: { email: { in: generatedEmails } },
      }),
      prisma.studioProject.count({
        where: {
          slug: homeSlug,
          sourceLabel: "nest-kind:home",
        },
      }),
      prisma.user.count({
        where: {
          OR: [
            { primaryEmail: email },
            { aliases: { some: { email: { in: generatedEmails } } } },
          ],
        },
      }),
      userId
        ? prisma.membership.count({ where: { userId } })
        : Promise.resolve(0),
    ]);
    cleanup.verifiedDatabaseClean = [
      remainingInvites,
      remainingGrants,
      remainingHomeProjects,
      remainingUsers,
      remainingMemberships,
    ].every((count) => count === 0);
    if (!cleanup.verifiedDatabaseClean) {
      throw new Error(
        "Generated admin database artifacts remain after cleanup.",
      );
    }
  } finally {
    await prisma.$disconnect();
  }

  const auth = ensureFirebaseAdmin(env);
  try {
    const firebaseUser = await auth.getUserByEmail(email);
    await auth.deleteUser(firebaseUser.uid);
    cleanup.deletedFirebaseUser = true;
  } catch (error) {
    if (error?.code === "auth/user-not-found") {
      cleanup.firebaseUserMissing = true;
    } else {
      throw error;
    }
  }
  try {
    await auth.getUserByEmail(email);
    throw new Error("Generated admin Firebase user remains after cleanup.");
  } catch (error) {
    if (error?.code === "auth/user-not-found") {
      cleanup.verifiedFirebaseClean = true;
    } else {
      throw error;
    }
  }

  return cleanup;
}

async function createGeneratedAdminUser(
  env,
  email,
  password,
  roles = ["OWNER"],
) {
  const auth = ensureFirebaseAdmin(env);
  const firebaseUser = await auth.createUser({
    email,
    password,
    displayName: "Codex Generated Admin Smoke",
    emailVerified: true,
    disabled: false,
  });

  const prisma = createPrisma(env);
  try {
    await prisma.user.create({
      data: {
        primaryEmail: email,
        name: "Codex Generated Admin Smoke",
        firebaseUid: firebaseUser.uid,
        emailVerified: new Date(),
        roles:
          roles.length > 0
            ? { create: roles.map((role) => ({ role })) }
            : undefined,
      },
      select: { id: true },
    });
  } finally {
    await prisma.$disconnect();
  }

  return firebaseUser;
}

async function createGeneratedAliasAccessFixture(
  env,
  email,
  aliasEmail,
  projectSlug,
) {
  const prisma = createPrisma(env);
  try {
    const [user, project] = await Promise.all([
      prisma.user.findUnique({
        where: { primaryEmail: email },
        select: { id: true },
      }),
      prisma.studioProject.findFirst({
        where: { slug: projectSlug },
        select: { id: true, slug: true },
      }),
    ]);
    if (!user) throw new Error("Generated alias smoke user was not persisted.");
    if (!project)
      throw new Error(`Alias smoke project does not exist: ${projectSlug}`);

    await prisma.$transaction([
      prisma.userEmail.create({
        data: {
          userId: user.id,
          email: aliasEmail,
          label: "generated alias access smoke",
        },
      }),
      prisma.studioProjectAccessGrant.upsert({
        where: {
          projectId_email: {
            projectId: project.id,
            email: aliasEmail,
          },
        },
        update: {
          role: "EDITOR",
          status: "ACTIVE",
          note: "Generated alias access smoke",
        },
        create: {
          projectId: project.id,
          email: aliasEmail,
          role: "EDITOR",
          status: "ACTIVE",
          note: "Generated alias access smoke",
        },
      }),
    ]);

    return project.slug;
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const env = mergedEnv();
  assertConfigured(env);
  const mode = parseMode(process.argv);

  const suffix = crypto.randomBytes(4).toString("hex");
  const email = `codex-admin-${suffix}@dev.test`;
  const aliasEmail = `codex-alias-${suffix}@dev.test`;
  const password = `Qp-${crypto.randomBytes(18).toString("base64url")}!26`;
  const additionalEmails = mode === "alias-access-smoke" ? [aliasEmail] : [];

  let smokeSucceeded = false;
  let operationError = null;
  try {
    await createGeneratedAdminUser(
      env,
      email,
      password,
      mode === "alias-access-smoke" ? [] : ["OWNER"],
    );
    const generatedAdminEnv = {
      ...env,
      QUIPSLY_AUTH_SMOKE_EMAIL: email,
      QUIPSLY_AUTH_SMOKE_PASSWORD: password,
      QUIPSLY_AUTH_SMOKE_FIREBASE_API_KEY:
        env.QUIPSLY_AUTH_SMOKE_FIREBASE_API_KEY ||
        env.NEXT_PUBLIC_FIREBASE_API_KEY,
      QUIPSLY_AUTH_SMOKE_EXPECT_ADMIN: "1",
      QUIPSLY_AUTH_SMOKE_BASE_URL:
        env.QUIPSLY_ADMIN_SMOKE_BASE_URL ||
        env.QUIPSLY_AUTH_SMOKE_BASE_URL ||
        "http://127.0.0.1:3025",
    };

    if (mode === "alias-access-smoke") {
      const projectSlug = await createGeneratedAliasAccessFixture(
        env,
        email,
        aliasEmail,
        env.QUIPSLY_ALIAS_ACCESS_SMOKE_PROJECT_SLUG || "quipsly-dev-lab",
      );
      runAuthSmoke({
        ...generatedAdminEnv,
        QUIPSLY_AUTH_SMOKE_EXPECT_ADMIN: "0",
        QUIPSLY_AUTH_SMOKE_EXPECT_PROJECT_SLUG: projectSlug,
      });
    } else if (mode === "promote-preview") {
      runPreviewPromotion(generatedAdminEnv);
    } else {
      runAuthSmoke(generatedAdminEnv);
    }
    smokeSucceeded = true;
  } catch (error) {
    operationError = error;
  }

  let cleanupError = null;
  const cleanup = await cleanupGeneratedAdminArtifacts(
    env,
    email,
    additionalEmails,
  ).catch((error) => {
    cleanupError = error;
    return {
      warning: error instanceof Error ? error.message : String(error),
      verifiedDatabaseClean: false,
      verifiedFirebaseClean: false,
    };
  });
  console.log(
    JSON.stringify(
      {
        ok: smokeSucceeded && !cleanupError,
        mode,
        cleanup: {
          generatedAdminSmokeArtifacts: cleanup,
          afterSuccessfulSmoke: smokeSucceeded,
        },
        note: "Generated password, Firebase token, session cookie, release receipt, and database URL were not printed or persisted.",
      },
      null,
      2,
    ),
  );

  if (cleanupError) {
    const message =
      cleanupError instanceof Error
        ? cleanupError.message
        : String(cleanupError);
    throw new Error(`Generated admin cleanup failed: ${message}`, {
      cause: operationError || cleanupError,
    });
  }
  if (operationError) {
    throw operationError;
  }
}

main().catch((error) => {
  console.error(
    `QUIPSLY_GENERATED_ADMIN_SMOKE_FAIL ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
