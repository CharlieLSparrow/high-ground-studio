#!/usr/bin/env node
import crypto from "node:crypto";
import { createRequire } from "node:module";

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

const baseUrl = String(
  args.get("base-url") ||
    process.env.QUIPSLY_COACHING_CALENDAR_BASE_URL ||
    process.env.QUIPSLY_MOBILE_CAPTURE_BASE_URL ||
    "http://127.0.0.1:3012",
).replace(/\/+$/, "");

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function createPrisma() {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: requiredEnv("DATABASE_URL"),
      max: Number.parseInt(process.env.PRISMA_PG_POOL_MAX || "2", 10) || 2,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: Number.parseInt(process.env.PRISMA_PG_CONNECTION_TIMEOUT_MS || "20000", 10) || 20_000,
    }),
  });
}

function redactEmail(email) {
  return String(email || "").replace(/^codex-calendar-([a-f0-9]{4})[a-f0-9]{4}/i, "codex-calendar-$1****");
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

function firebaseAdmin() {
  if (!getApps().length) {
    initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "quipsly-reef",
    });
  }
  return getAuth();
}

async function firebaseVerifiedTestSignup(email, password) {
  await firebaseAdmin().createUser({
    email,
    password,
    displayName: "Codex Generated Calendar Smoke",
    emailVerified: true,
    disabled: false,
  });
  const config = await requestJson(`${baseUrl}/api/mac/firebase-client-config`);
  if (!config.response.ok || !config.body?.firebase?.apiKey) {
    throw new Error(`Firebase config unavailable: HTTP ${config.response.status}`);
  }

  const signup = await requestJson(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(config.body.firebase.apiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );

  if (!signup.response.ok || !signup.body?.idToken) {
    throw new Error(`Firebase verified test login failed: HTTP ${signup.response.status}`);
  }

  return signup.body.idToken;
}

async function cleanupGeneratedCalendarUser(email) {
  const prisma = createPrisma();
  const cleanup = {
    deletedRoles: 0,
    deletedGrants: 0,
    deletedHomeProjects: 0,
    deletedMemberships: 0,
    deletedUsers: 0,
    deletedFirebaseUser: false,
    firebaseUserMissing: false,
  };

  try {
    const user = await prisma.user.findFirst({
      where: { primaryEmail: email },
      select: { id: true },
    });

    if (user?.id) {
      cleanup.deletedRoles = (await prisma.userRole.deleteMany({ where: { userId: user.id } })).count;
      cleanup.deletedGrants = (await prisma.studioProjectAccessGrant.deleteMany({ where: { email } })).count;
      const homeSlug = `home-${slugifyEmailForHomeNest(email)}`;
      const homeProjects = await prisma.studioProject.findMany({
        where: { slug: homeSlug, sourceLabel: "nest-kind:home" },
        select: { id: true },
      });

      for (const project of homeProjects) {
        await prisma.studioProject.delete({ where: { id: project.id } });
        cleanup.deletedHomeProjects += 1;
      }

      cleanup.deletedMemberships = (await prisma.membership.deleteMany({ where: { userId: user.id } })).count;
      cleanup.deletedUsers = (await prisma.user.deleteMany({ where: { id: user.id } })).count;
    }
  } finally {
    await prisma.$disconnect();
  }

  if (!getApps().length) {
    initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "quipsly-reef",
    });
  }

  try {
    const firebaseUser = await getAuth().getUserByEmail(email);
    await getAuth().deleteUser(firebaseUser.uid);
    cleanup.deletedFirebaseUser = true;
  } catch (error) {
    if (error?.code === "auth/user-not-found") {
      cleanup.firebaseUserMissing = true;
    } else {
      throw error;
    }
  }

  return cleanup;
}

async function main() {
  requiredEnv("DATABASE_URL");
  const email = `codex-calendar-${crypto.randomBytes(4).toString("hex")}@dev.test`;
  const password = `Qp-${crypto.randomBytes(18).toString("base64url")}!26`;
  let ok = false;
  let idToken = null;

  try {
    idToken = await firebaseVerifiedTestSignup(email, password);
    const session = await requestJson(`${baseUrl}/api/auth/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken }),
    });

    if (!session.response.ok || !session.body?.user?.id) {
      throw new Error(`Session exchange failed: HTTP ${session.response.status}`);
    }

    const prisma = createPrisma();
    try {
      await prisma.userRole.upsert({
        where: { userId_role: { userId: session.body.user.id, role: "OWNER" } },
        update: {},
        create: { userId: session.body.user.id, role: "OWNER" },
      });
    } finally {
      await prisma.$disconnect();
    }

    const verify = await requestJson(`${baseUrl}/api/coaching/calendar/readiness?verify=1`, {
      headers: { authorization: `Bearer ${idToken}` },
    });
    ok = verify.response.ok && verify.body?.ok === true && verify.body?.readiness?.accessOk === true;

    console.log(JSON.stringify({
      ok,
      baseUrl,
      generatedEmail: redactEmail(email),
      verifyStatus: verify.response.status,
      readiness: {
        configurationStatus: verify.body?.readiness?.configurationStatus || null,
        credentialPath: verify.body?.readiness?.credentialPath || null,
        accessOk: verify.body?.readiness?.accessOk === true,
        accessStatus: verify.body?.readiness?.accessStatus || null,
        calendar: verify.body?.readiness?.calendar || null,
        externalMutated: verify.body?.externalMutated ?? verify.body?.readiness?.externalMutated ?? null,
        message: verify.body?.readiness?.message || verify.body?.error || null,
      },
      note: "Generated password, Firebase token, session cookie, and database URL were not printed.",
    }, null, 2));
  } finally {
    const cleanup = await cleanupGeneratedCalendarUser(email).catch((error) => ({ cleanupError: error.message }));
    console.log(JSON.stringify({ cleanup }, null, 2));
  }

  if (!ok) process.exit(1);
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exit(1);
});
