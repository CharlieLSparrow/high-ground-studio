#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const repoRoot = process.cwd();
const DEFAULT_BASE_URL = "https://nest.quipsly.com";
const DEFAULT_CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DEFAULT_TARGET_NEST_SLUG = "marine-biology-research";

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

function createPrisma(env) {
  if (!env.DATABASE_URL) {
    throw new Error("Admin browser smoke is missing DATABASE_URL.");
  }
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: env.DATABASE_URL,
      max: Number.parseInt(env.PRISMA_PG_POOL_MAX || "2", 10) || 2,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: Number.parseInt(env.PRISMA_PG_CONNECTION_TIMEOUT_MS || "30000", 10) || 30_000,
    }),
    log: ["error"],
  });
}

function firebaseProjectId(env) {
  return env.FIREBASE_PROJECT_ID || env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "quipsly-reef";
}

function firebaseApiKey(env) {
  return env.QUIPSLY_AUTH_SMOKE_FIREBASE_API_KEY || env.NEXT_PUBLIC_FIREBASE_API_KEY;
}

function ensureFirebaseAdmin(env) {
  if (!getApps().length) {
    initializeApp({ projectId: firebaseProjectId(env) });
  }
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function printJson(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function generatedEmail(kind, suffix) {
  return `codex-${kind}-${suffix}@dev.test`;
}

function isSafeGeneratedEmail(email) {
  return /^codex-(admin|managed)-[a-f0-9]{8}@dev\.test$/i.test(String(email || "").trim());
}

function redactEmail(email) {
  return String(email || "").replace(/^([^@]{12})[^@]*(@.*)$/i, "$1****$2");
}

function parseSessionCookie(setCookie) {
  return (setCookie || "")
    .split(",")
    .map((chunk) => chunk.trim())
    .find((chunk) => chunk.startsWith("session="))
    ?.split(";")[0];
}

function cookieValue(cookiePair) {
  return String(cookiePair || "").replace(/^session=/, "");
}

async function firebasePasswordLogin({ env, email, password }) {
  const apiKey = firebaseApiKey(env);
  if (!apiKey) throw new Error("Admin browser smoke is missing NEXT_PUBLIC_FIREBASE_API_KEY or QUIPSLY_AUTH_SMOKE_FIREBASE_API_KEY.");

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const body = await response.json();
  if (!response.ok || !body.idToken) {
    throw new Error(`Firebase generated login failed with HTTP ${response.status}.`);
  }
  return body.idToken;
}

async function createQuipslySession({ baseUrl, idToken }) {
  const response = await fetch(`${baseUrl}/api/auth/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  const text = await response.text();
  if (response.status !== 200) {
    throw new Error(`Quipsly session create failed with HTTP ${response.status}: ${text.slice(0, 180)}`);
  }
  const cookie = parseSessionCookie(response.headers.get("set-cookie"));
  if (!cookie) throw new Error("Quipsly session create did not set a session cookie.");
  return {
    cookie,
    body: JSON.parse(text),
  };
}

async function createGeneratedAdmin({ env, email, password }) {
  const auth = ensureFirebaseAdmin(env);
  const firebaseUser = await auth.createUser({
    email,
    password,
    displayName: "Codex Generated Admin Browser Smoke",
    emailVerified: true,
    disabled: false,
  });

  const prisma = createPrisma(env);
  try {
    await prisma.user.create({
      data: {
        primaryEmail: email,
        name: "Codex Generated Admin Browser Smoke",
        firebaseUid: firebaseUser.uid,
        emailVerified: new Date(),
        roles: {
          create: [{ role: "OWNER" }],
        },
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function verifyManagedTarget({ env, targetEmail, targetNestSlug, expectedGrantStatus }) {
  const prisma = createPrisma(env);
  try {
    const user = await prisma.user.findFirst({
      where: { primaryEmail: targetEmail },
      include: {
        memberships: {
          where: { plan: { slug: "quipsly-free" }, status: "ACTIVE" },
          select: { id: true },
        },
      },
    });
    assert(user, "Generated target user was not created.");
    assert(user.firebaseUid, "Generated target user is missing Firebase UID after admin-created password flow.");
    assert(user.memberships.length > 0, "Generated target user is missing active free-tier membership.");

    const homeSlug = `home-${slugifyEmailForHomeNest(targetEmail)}`;
    const home = await prisma.studioProject.findFirst({
      where: {
        slug: homeSlug,
        sourceLabel: "nest-kind:home",
        accessGrants: {
          some: {
            email: targetEmail,
            role: "OWNER",
            status: "ACTIVE",
          },
        },
      },
      select: { slug: true },
    });
    assert(home, "Generated target user is missing Home Nest owner grant.");

    const grant = await prisma.studioProjectAccessGrant.findFirst({
      where: {
        email: targetEmail,
        project: { slug: targetNestSlug },
      },
      select: { role: true, status: true, project: { select: { slug: true } } },
    });
    assert(grant, `Generated target grant for ${targetNestSlug} was not found.`);
    assert(grant.status === expectedGrantStatus, `Generated target grant status expected ${expectedGrantStatus}, got ${grant.status}.`);

    return {
      userCreated: true,
      firebaseLinked: Boolean(user.firebaseUid),
      freeTier: true,
      homeNest: home.slug,
      grant: {
        projectSlug: grant.project.slug,
        role: grant.role,
        status: grant.status,
      },
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function cleanupGeneratedArtifacts(env, emails) {
  const safeEmails = emails.map((email) => email.toLowerCase().trim());
  for (const email of safeEmails) {
    if (!isSafeGeneratedEmail(email)) {
      throw new Error(`Refusing to clean up non-generated email: ${email}`);
    }
  }

  const cleanup = {
    deletedInvites: 0,
    deletedGrants: 0,
    deletedHomeProjects: 0,
    deletedMemberships: 0,
    deletedUsers: 0,
    deletedFirebaseUsers: 0,
    firebaseUsersMissing: 0,
  };

  const prisma = createPrisma(env);
  try {
    cleanup.deletedInvites = (await prisma.studioNestInvite.deleteMany({ where: { email: { in: safeEmails } } })).count;
    cleanup.deletedGrants = (await prisma.studioProjectAccessGrant.deleteMany({ where: { email: { in: safeEmails } } })).count;

    const homeSlugs = safeEmails.map((email) => `home-${slugifyEmailForHomeNest(email)}`);
    cleanup.deletedHomeProjects = (await prisma.studioProject.deleteMany({
      where: {
        slug: { in: homeSlugs },
        sourceLabel: "nest-kind:home",
      },
    })).count;

    const users = await prisma.user.findMany({
      where: { primaryEmail: { in: safeEmails } },
      select: { id: true },
    });
    const userIds = users.map((user) => user.id);
    if (userIds.length) {
      cleanup.deletedMemberships = (await prisma.membership.deleteMany({ where: { userId: { in: userIds } } })).count;
    }
    cleanup.deletedUsers = (await prisma.user.deleteMany({ where: { primaryEmail: { in: safeEmails } } })).count;
  } finally {
    await prisma.$disconnect();
  }

  const auth = ensureFirebaseAdmin(env);
  for (const email of safeEmails) {
    try {
      const user = await auth.getUserByEmail(email);
      await auth.deleteUser(user.uid);
      cleanup.deletedFirebaseUsers += 1;
    } catch (error) {
      if (error?.code === "auth/user-not-found") {
        cleanup.firebaseUsersMissing += 1;
      } else {
        throw error;
      }
    }
  }

  return cleanup;
}

async function runBrowserAdminFlow({ env, baseUrl, adminEmail, adminPassword, targetEmail, targetPassword, targetNestSlug }) {
  const { chromium } = await import("playwright");
  const chromePath = process.env.GOOGLE_CHROME_BIN || process.env.CHROME_BIN || DEFAULT_CHROME_PATH;
  const launchOptions = { headless: process.env.QUIPSLY_ADMIN_BROWSER_SMOKE_HEADED === "1" ? false : true };
  if (fs.existsSync(chromePath)) launchOptions.executablePath = chromePath;

  const idToken = await firebasePasswordLogin({ env, email: adminEmail, password: adminPassword });
  const session = await createQuipslySession({ baseUrl, idToken });
  assert(session.body?.user?.email === adminEmail, "Generated admin Quipsly session email mismatch.");

  const browser = await chromium.launch(launchOptions);
  try {
    const url = new URL(baseUrl);
    const context = await browser.newContext();
    await context.addCookies([{
      name: "session",
      value: cookieValue(session.cookie),
      domain: url.hostname,
      path: "/",
      httpOnly: true,
      secure: url.protocol === "https:",
      sameSite: "Lax",
    }]);
    const page = await context.newPage();

    await page.goto(`${baseUrl}/admin/users`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.getByText("User + Invite Console", { exact: false }).waitFor({ state: "visible", timeout: 20_000 });

    const createForm = page.locator("xpath=//form[.//input[@name='primaryEmail' and @type='email']]");
    const createFormCount = await createForm.count();
    assert(createFormCount === 1, `Expected exactly one create/update user form, found ${createFormCount}.`);
    await createForm.locator('input[name="primaryEmail"]').fill(targetEmail);
    await createForm.locator('input[name="name"]').fill("Codex Generated Managed User");
    await createForm.locator('input[name="firebasePassword"]').fill(targetPassword);
    await Promise.all([
      page.waitForURL(/created=|updated=|error=/, { timeout: 30_000 }),
      createForm.locator('button').click(),
    ]);
    assert(!new URL(page.url()).searchParams.get("error"), "Create/update user action returned an error.");
    await page.getByText("User record ready", { exact: false }).waitFor({ state: "visible", timeout: 20_000 });

    const inviteForm = page.locator('form:has(input[list="admin-nest-picker"])');
    assert(await inviteForm.count() === 1, "Expected exactly one general invite form.");
    await inviteForm.locator('input[name="targetEmail"]').fill(targetEmail);
    await inviteForm.locator('input[name="projectSlug"]').fill(targetNestSlug);
    await inviteForm.locator('select[name="role"]').selectOption("EDITOR");
    await inviteForm.locator('input[name="note"]').fill("Generated admin user-management browser smoke");
    await Promise.all([
      page.waitForURL(/invited=|error=/, { timeout: 30_000 }),
      inviteForm.locator('button').click(),
    ]);
    assert(!new URL(page.url()).searchParams.get("error"), "Invite/grant action returned an error.");
    await page.getByText("Nest invite ready", { exact: false }).waitFor({ state: "visible", timeout: 20_000 });

    const revokeButton = page.locator(`xpath=//form[.//input[@name='targetEmail' and @value='${targetEmail}'] and .//input[@name='projectSlug' and @value='${targetNestSlug}']]//button[contains(., 'Revoke')]`);
    const revokeCount = await revokeButton.count();
    assert(revokeCount === 1, `Expected exactly one revoke button for generated target grant, found ${revokeCount}.`);
    await Promise.all([
      page.waitForURL(/revoked=|error=/, { timeout: 30_000 }),
      revokeButton.click(),
    ]);
    assert(!new URL(page.url()).searchParams.get("error"), "Revoke action returned an error.");
    await page.getByText("Nest access revoked", { exact: false }).waitFor({ state: "visible", timeout: 20_000 });

    return {
      adminPageLoaded: true,
      createdOrUpdatedTarget: true,
      grantedNestAccess: true,
      revokedNestAccess: true,
    };
  } finally {
    await browser.close();
  }
}

async function main() {
  const env = mergedEnv();
  const baseUrl = (process.env.QUIPSLY_ADMIN_BROWSER_SMOKE_BASE_URL || process.env.QUIPSLY_AUTH_SMOKE_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const targetNestSlug = process.env.QUIPSLY_ADMIN_BROWSER_SMOKE_TARGET_NEST || DEFAULT_TARGET_NEST_SLUG;
  const suffix = crypto.randomBytes(4).toString("hex");
  const adminEmail = generatedEmail("admin", suffix);
  const targetEmail = generatedEmail("managed", suffix);
  const adminPassword = `Qp-${crypto.randomBytes(18).toString("base64url")}!26`;
  const targetPassword = `Qp-${crypto.randomBytes(18).toString("base64url")}!26`;
  const emails = [adminEmail, targetEmail];

  let browserProof = null;
  let activeProof = null;
  let revokedProof = null;
  let succeeded = false;

  try {
    await createGeneratedAdmin({ env, email: adminEmail, password: adminPassword });
    browserProof = await runBrowserAdminFlow({
      env,
      baseUrl,
      adminEmail,
      adminPassword,
      targetEmail,
      targetPassword,
      targetNestSlug,
    });
    revokedProof = await verifyManagedTarget({
      env,
      targetEmail,
      targetNestSlug,
      expectedGrantStatus: "REVOKED",
    });
    activeProof = {
      note: "Active grant was proven through the UI success state before revoke; final DB state is intentionally REVOKED after cleanup-safe revoke proof.",
    };
    succeeded = true;
  } finally {
    const cleanup = await cleanupGeneratedArtifacts(env, emails).catch((error) => ({
      warning: error instanceof Error ? error.message : String(error),
    }));
    printJson({
      ok: succeeded,
      baseUrl,
      adminEmail: redactEmail(adminEmail),
      targetEmail: redactEmail(targetEmail),
      targetNestSlug,
      browserProof,
      activeProof,
      finalDbProof: revokedProof,
      cleanup,
      note: "Generated passwords, Firebase tokens, session cookies, and database URLs were not printed.",
    });
  }

  process.exit(succeeded ? 0 : 1);
}

main().catch((error) => {
  printJson({
    ok: false,
    failureKind: "admin-browser-smoke-error",
    error: String(error?.message || error).slice(0, 800),
    note: "Generated passwords, Firebase tokens, session cookies, and database URLs were not printed.",
  });
  process.exit(1);
});
