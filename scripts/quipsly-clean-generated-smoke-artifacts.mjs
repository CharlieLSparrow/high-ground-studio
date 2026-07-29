#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const repoRoot = process.cwd();
const apply = process.argv.includes("--apply");

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

  return applyCloudSqlProxyRewrite(env);
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

function requiredEnv(env, name) {
  const value = env[name];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

export function isGeneratedSmokeEmail(email) {
  return /^codex-(invite|signup|admin|native|mobile-capture)-[a-f0-9]{8}@dev\.test$/i.test(
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

export function redactEmailList(emails) {
  return emails.map((email) =>
    email.replace(
      /^codex-(invite|signup|admin|native|mobile-capture)-([a-f0-9]{4})[a-f0-9]{4}/i,
      "codex-$1-$2****",
    ),
  );
}

async function main() {
  const env = mergedEnv();
  requiredEnv(env, "DATABASE_URL");

  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: env.DATABASE_URL,
      max: Number.parseInt(env.PRISMA_PG_POOL_MAX || "2", 10) || 2,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: Number.parseInt(env.PRISMA_PG_CONNECTION_TIMEOUT_MS || "30000", 10) || 30_000,
    }),
    log: ["error"],
  });

  const firebaseProjectId =
    env.FIREBASE_PROJECT_ID
    || env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    || "quipsly-reef";

  if (!getApps().length) {
    initializeApp({ projectId: firebaseProjectId });
  }

  try {
    const users = await prisma.user.findMany({
      where: {
        primaryEmail: {
          endsWith: "@dev.test",
        },
      },
      select: { id: true, primaryEmail: true },
    });

    const generatedUsers = users
      .filter((user) => isGeneratedSmokeEmail(user.primaryEmail));
    const emails = generatedUsers
      .map((user) => user.primaryEmail)
      .sort();
    const userIds = generatedUsers.map((user) => user.id);

    const homeSlugs = emails.map((email) => `home-${slugifyEmailForHomeNest(email)}`);
    const homeProjects = homeSlugs.length
      ? await prisma.studioProject.findMany({
        where: {
          slug: { in: homeSlugs },
          sourceLabel: "nest-kind:home",
        },
        select: { id: true, slug: true },
      })
      : [];
    const createdProjects = emails.length
      ? await prisma.studioProject.findMany({
        where: {
          sourceLabel: { not: "nest-kind:home" },
          accessGrants: {
            some: {
              email: { in: emails },
              role: "OWNER",
              status: "ACTIVE",
            },
          },
          documentOperations: {
            some: {
              actorEmail: { in: emails },
              operationType: "create-nest",
            },
          },
        },
        select: { id: true },
      })
      : [];
    const generatedCallRooms = userIds.length
      ? await prisma.callRoom.findMany({
        where: {
          OR: [
            { createdByUserId: { in: userIds } },
            { participants: { some: { userId: { in: userIds } } } },
          ],
        },
        select: { id: true },
      })
      : [];

    const summary = {
      mode: apply ? "apply" : "dry-run",
      candidateGeneratedSmokeUsers: emails.length,
      candidateGeneratedSmokeHomeProjects: homeProjects.length,
      candidateGeneratedSmokeCreatedProjects: createdProjects.length,
      candidateGeneratedSmokeCallRooms: generatedCallRooms.length,
      redactedCandidates: redactEmailList(emails).slice(0, 20),
      deletedInvites: 0,
      deletedGrants: 0,
      deletedCallRooms: 0,
      deletedCreatedProjects: 0,
      deletedHomeProjects: 0,
      deletedMemberships: 0,
      deletedUsers: 0,
      deletedFirebaseUsers: 0,
      firebaseUsersMissing: 0,
    };

    if (!apply) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    for (const room of generatedCallRooms) {
      await prisma.callRoom.delete({ where: { id: room.id } });
      summary.deletedCallRooms += 1;
    }

    for (const email of emails) {
      summary.deletedInvites += (await prisma.studioNestInvite.deleteMany({ where: { email } })).count;
    }

    for (const project of createdProjects) {
      await prisma.studioProject.delete({ where: { id: project.id } });
      summary.deletedCreatedProjects += 1;
    }

    for (const email of emails) {
      summary.deletedGrants += (
        await prisma.studioProjectAccessGrant.deleteMany({ where: { email } })
      ).count;
    }

    for (const project of homeProjects) {
      await prisma.studioProject.delete({ where: { id: project.id } });
      summary.deletedHomeProjects += 1;
    }

    if (userIds.length) {
      summary.deletedMemberships = (
        await prisma.membership.deleteMany({ where: { userId: { in: userIds } } })
      ).count;
    }

    for (const email of emails) {
      summary.deletedUsers += (await prisma.user.deleteMany({ where: { primaryEmail: email } })).count;
      try {
        const firebaseUser = await getAuth().getUserByEmail(email);
        await getAuth().deleteUser(firebaseUser.uid);
        summary.deletedFirebaseUsers += 1;
      } catch (error) {
        if (error?.code === "auth/user-not-found") {
          summary.firebaseUsersMissing += 1;
        } else {
          throw error;
        }
      }
    }

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error(
      `QUIPSLY_GENERATED_SMOKE_CLEANUP_FAIL ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  });
}
