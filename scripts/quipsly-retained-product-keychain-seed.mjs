#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import { createRequire } from "node:module";

import { resolveRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";

const requireFromQuipsly = createRequire(
  new URL("../apps/quipsly/package.json", import.meta.url),
);
const { PrismaClient } = requireFromQuipsly("@prisma/client");
const { PrismaPg } = requireFromQuipsly("@prisma/adapter-pg");
const { initializeApp, getApps } = requireFromQuipsly("firebase-admin/app");
const { getAuth } = requireFromQuipsly("firebase-admin/auth");

const PROJECT_ID = "quipsly-reef";
const KEYCHAIN_SERVICE = "com.quipsly.qa.retained-product";
const MEDIA_OPERATOR_EMAIL = "quipsly-media-ms8ct81g@example.test";
const EXPECTED_PROJECT_SLUG = "qa-retained-capture-to-follow-through-lab";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loopbackHost(hostname) {
  return ["localhost", "127.0.0.1", "::1"].includes(hostname);
}

function requireLoopbackOrigin(value, label) {
  const url = new URL(value);
  assert(
    url.protocol === "http:"
      && loopbackHost(url.hostname)
      && !url.username
      && !url.password
      && url.pathname === "/"
      && !url.search
      && !url.hash,
    `${label} must be a credential-free loopback HTTP origin.`,
  );
  return url.origin;
}

function requireLocalDatabase(value) {
  const url = new URL(value);
  assert(loopbackHost(url.hostname), "Retained product credentials refuse non-local databases.");
  return value;
}

function generatedPassword() {
  return `Qp-${randomBytes(24).toString("base64url")}!26`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function main() {
  requireLoopbackOrigin(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || ""}`,
    "FIREBASE_AUTH_EMULATOR_HOST",
  );
  const databaseURL = requireLocalDatabase(process.env.DATABASE_URL || "");
  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: databaseURL,
      max: 2,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    }),
    log: ["error"],
  });

  try {
    const user = await prisma.user.findUnique({
      where: { primaryEmail: MEDIA_OPERATOR_EMAIL },
      select: {
        id: true,
        firebaseUid: true,
        isActive: true,
        emailVerified: true,
      },
    });
    assert(user?.id, "The retained media operator is missing from local PostgreSQL.");
    assert(user.firebaseUid, "The retained media operator has no canonical Firebase UID.");
    assert(user.isActive, "The retained media operator is inactive.");
    assert(user.emailVerified, "The retained media operator is not canonically verified.");

    const project = await prisma.studioProject.findFirst({
      where: { slug: EXPECTED_PROJECT_SLUG },
      select: {
        id: true,
        slug: true,
        accessGrants: {
          where: { email: MEDIA_OPERATOR_EMAIL, status: "ACTIVE" },
          select: { id: true, role: true },
        },
      },
    });
    assert(project?.id, "The retained Capture-to-follow-through Nest is missing.");
    assert(project.accessGrants.length > 0, "The retained media operator lost its active Nest grant.");

    const resolved = resolveRetainedQAPassword({
      service: KEYCHAIN_SERVICE,
      account: MEDIA_OPERATOR_EMAIL,
      generate: generatedPassword,
    });

    if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
    const auth = getAuth();
    const existing = await auth.getUser(user.firebaseUid).catch((error) => {
      if (error?.code === "auth/user-not-found") return null;
      throw error;
    });
    if (existing) {
      assert(
        String(existing.email || "").toLowerCase() === MEDIA_OPERATOR_EMAIL,
        "The canonical Firebase UID belongs to another email.",
      );
      await auth.updateUser(user.firebaseUid, {
        email: MEDIA_OPERATOR_EMAIL,
        password: resolved.password,
        displayName: "Quipsly Retained Media Operator",
        emailVerified: true,
        disabled: false,
      });
    } else {
      await auth.createUser({
        uid: user.firebaseUid,
        email: MEDIA_OPERATOR_EMAIL,
        password: resolved.password,
        displayName: "Quipsly Retained Media Operator",
        emailVerified: true,
      });
    }

    console.log(JSON.stringify({
      ok: true,
      localOnly: true,
      retained: true,
      identity: {
        emailSha256: sha256(MEDIA_OPERATOR_EMAIL),
        userIdSha256: sha256(user.id),
        firebaseUidSha256: sha256(user.firebaseUid),
      },
      keychainService: KEYCHAIN_SERVICE,
      keychainItemCreated: resolved.created,
      firebaseUserCreated: !existing,
      canonicalNest: {
        slug: project.slug,
        activeGrantCount: project.accessGrants.length,
      },
      secretsPrinted: false,
      databaseMutated: false,
      externalSideEffects: false,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

await main();
