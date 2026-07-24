#!/usr/bin/env node
import fs from "node:fs";
import { createHmac, randomBytes } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function safeSmokeEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized.endsWith("@dev.test")) {
    throw new Error("Invite smoke setup only mutates @dev.test users.");
  }
  return normalized;
}

function authSecret() {
  if (process.env.AUTH_SECRET_FILE) {
    return fs.readFileSync(process.env.AUTH_SECRET_FILE, "utf8");
  }
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET, NEXTAUTH_SECRET, or AUTH_SECRET_FILE is required to create app-compatible invite tokens.");
  }
  return secret;
}

function createInviteLoginToken() {
  const token = `qinv_${randomBytes(32).toString("base64url")}`;
  const tokenHash = createHmac("sha256", authSecret())
    .update("quipsly-invite-login:")
    .update(token)
    .digest("hex");

  return { token, tokenHash };
}

const connectionString = requiredEnv("DATABASE_URL");
const email = safeSmokeEmail(requiredEnv("QUIPSLY_INVITE_SMOKE_EMAIL"));
const password = requiredEnv("QUIPSLY_INVITE_SMOKE_PASSWORD");
const inviteTokenFile = String(process.env.QUIPSLY_INVITE_SMOKE_TOKEN_FILE || "").trim();
const projectSlug = String(
  process.env.QUIPSLY_INVITE_SMOKE_PROJECT_SLUG || "marine-biology-research",
).trim();
const role = String(process.env.QUIPSLY_INVITE_SMOKE_ROLE || "VIEWER").trim().toUpperCase();
const firebaseProjectId =
  process.env.FIREBASE_PROJECT_ID
  || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  || "quipsly-reef";

if (!["OWNER", "EDITOR", "VIEWER"].includes(role)) {
  throw new Error(`Unsupported invite smoke role: ${role}`);
}

if (!getApps().length) {
  initializeApp({ projectId: firebaseProjectId });
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString,
    max: Number.parseInt(process.env.PRISMA_PG_POOL_MAX || "2", 10) || 2,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: Number.parseInt(process.env.PRISMA_PG_CONNECTION_TIMEOUT_MS || "20000", 10) || 20_000,
  }),
  log: ["error"],
});

async function upsertFirebasePasswordUser() {
  const auth = getAuth();
  try {
    const existing = await auth.getUserByEmail(email);
    await auth.updateUser(existing.uid, {
      password,
      emailVerified: true,
      disabled: false,
      displayName: "Codex Invite Smoke",
    });
    return { created: false };
  } catch (error) {
    if (error?.code !== "auth/user-not-found") throw error;
    await auth.createUser({
      email,
      password,
      emailVerified: true,
      disabled: false,
      displayName: "Codex Invite Smoke",
    });
    return { created: true };
  }
}

async function main() {
  const firebase = await upsertFirebasePasswordUser();
  const project = await prisma.studioProject.findFirst({
    where: { slug: projectSlug },
    select: { id: true, slug: true, name: true },
  });

  if (!project) {
    throw new Error(`Target Nest not found: ${projectSlug}`);
  }

  const user = await prisma.user.upsert({
    where: { primaryEmail: email },
    create: {
      primaryEmail: email,
      name: "Codex Invite Smoke",
      isActive: true,
      emailVerified: new Date(),
    },
    update: {
      name: "Codex Invite Smoke",
      isActive: true,
      emailVerified: new Date(),
      // Keep this smoke honest: the app should link Firebase UID on sign-in.
      firebaseUid: null,
    },
    select: { id: true, primaryEmail: true, firebaseUid: true },
  });

  const grant = await prisma.studioProjectAccessGrant.upsert({
    where: {
      projectId_email: {
        projectId: project.id,
        email,
      },
    },
    create: {
      projectId: project.id,
      email,
      role,
      status: "ACTIVE",
      createdByEmail: "codex@dev.test",
      note: "Automated invited-user auth smoke.",
    },
    update: {
      role,
      status: "ACTIVE",
      createdByEmail: "codex@dev.test",
      note: "Automated invited-user auth smoke.",
    },
    select: { role: true, status: true },
  });

  const inviteLogin = createInviteLoginToken();

  await prisma.studioNestInvite.upsert({
    where: {
      projectId_email: {
        projectId: project.id,
        email,
      },
    },
    create: {
      projectId: project.id,
      email,
      role,
      status: "pending",
      tokenHash: inviteLogin.tokenHash,
      invitedByEmail: "codex@dev.test",
      note: "Automated invited-user auth smoke.",
    },
    update: {
      role,
      status: "pending",
      tokenHash: inviteLogin.tokenHash,
      revokedAt: null,
      acceptedAt: null,
      invitedByEmail: "codex@dev.test",
      note: "Automated invited-user auth smoke.",
    },
  });

  if (inviteTokenFile) {
    fs.writeFileSync(inviteTokenFile, `${inviteLogin.token}\n`, { mode: 0o600 });
  }

  console.log(JSON.stringify({
    ok: true,
    email,
    firebaseUser: firebase.created ? "created" : "updated",
    quipslyUser: user.primaryEmail,
    firebaseUidLinkedBeforeSignIn: Boolean(user.firebaseUid),
    projectSlug: project.slug,
    projectName: project.name,
    grant,
    inviteToken: inviteTokenFile ? `written:${inviteTokenFile}` : "redacted",
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(`QUIPSLY_INVITE_SMOKE_SETUP_FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
