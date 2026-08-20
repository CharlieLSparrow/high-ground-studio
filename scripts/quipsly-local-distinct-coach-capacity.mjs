#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const requireFromQuipsly = createRequire(
  new URL("../apps/quipsly/package.json", import.meta.url),
);
const { deleteApp, initializeApp } = requireFromQuipsly("firebase-admin/app");
const { getAuth } = requireFromQuipsly("firebase-admin/auth");
const { PrismaClient } = requireFromQuipsly("@prisma/client");
const { PrismaPg } = requireFromQuipsly("@prisma/adapter-pg");

export function boundedDistinctCoachCount(value, fallback = 2) {
  const parsed = value === undefined || value === ""
    ? fallback
    : Number.parseInt(String(value), 10);
  assert(
    Number.isInteger(parsed) && parsed >= 1 && parsed <= 50,
    "QUIPSLY_DISTINCT_COACH_COUNT must be an integer from 1 through 50.",
  );
  return parsed;
}

export function loopbackOrigin(value, label) {
  const url = new URL(String(value || "").includes("://") ? value : `http://${value}`);
  assert.equal(url.protocol, "http:", `${label} must use loopback HTTP.`);
  assert(
    ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname),
    `${label} refuses non-loopback hosts.`,
  );
  assert(!url.username && !url.password, `${label} must not contain credentials.`);
  return url.origin;
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

function generatedCoachEmail(batch, index) {
  return `codex-capacity-coach-${batch}-${String(index + 1).padStart(2, "0")}@dev.test`;
}

function homeSlug(email) {
  return `home-${email
    .toLowerCase()
    .replace(/@/g, "-at-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72)}`;
}

async function api(origin, token, pathname, init = {}) {
  const startedAt = performance.now();
  const response = await fetch(`${origin}${pathname}`, {
    ...init,
    signal: AbortSignal.timeout(30_000),
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });
  const body = await response.json().catch(() => null);
  return {
    status: response.status,
    body,
    latencyMilliseconds: Math.round(performance.now() - startedAt),
  };
}

async function signIn(authOrigin, email, password) {
  const response = await fetch(
    `${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local-capacity`,
    {
      method: "POST",
      signal: AbortSignal.timeout(20_000),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const body = await response.json().catch(() => null);
  assert(response.ok && body?.idToken, `Firebase emulator sign-in failed for generated coach ${email}.`);
  return body.idToken;
}

async function prepareCoach({ auth, authOrigin, origin, batch, index }) {
  const email = generatedCoachEmail(batch, index);
  const password = `Qp-${randomBytes(24).toString("base64url")}!26`;
  const firebaseUser = await auth.createUser({
    email,
    password,
    displayName: `Capacity Coach ${index + 1}`,
    emailVerified: true,
    disabled: false,
  });
  const token = await signIn(authOrigin, email, password);
  const session = await api(origin, token, "/api/auth/session", {
    method: "POST",
    body: JSON.stringify({ idToken: token }),
  });
  assert.equal(session.status, 200, `Server session failed for generated coach ${index + 1}.`);
  const setup = await api(origin, token, "/api/coaching/runway", {
    method: "POST",
    body: JSON.stringify({
      action: "setup-coach-profile",
      coachEmail: email,
      coachName: `Capacity Coach ${index + 1}`,
      timezone: "America/Denver",
      defaultDurationMinutes: 60,
      currency: "USD",
      offeringTitle: "Capacity-flight coaching session",
      offeringDescription: "Generated local capacity evidence. Safe to delete.",
    }),
  });
  assert(
    setup.status === 200 && setup.body?.result?.role === "COACH",
    `Self-service coach setup failed for generated coach ${index + 1}.`,
  );
  return { email, firebaseUid: firebaseUser.uid, token };
}

async function cleanupGeneratedBatch(prisma, auth, coaches) {
  const emails = coaches.map((coach) => coach.email);
  assert(
    emails.every((email) => /^codex-capacity-coach-[a-f0-9]{8}-\d{2}@dev\.test$/.test(email)),
    "Refusing cleanup outside the generated capacity namespace.",
  );
  const users = await prisma.user.findMany({
    where: { primaryEmail: { in: emails } },
    select: { id: true, primaryEmail: true },
  });
  const userIds = users.map((user) => user.id);
  const profiles = await prisma.coachProfile.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  });
  const profileIds = profiles.map((profile) => profile.id);
  const deletedOfferings = (await prisma.serviceOffering.deleteMany({
    where: { coachProfileId: { in: profileIds } },
  })).count;
  let deletedHomeProjects = 0;
  for (const email of emails) {
    const project = await prisma.studioProject.findFirst({
      where: { slug: homeSlug(email), sourceLabel: "nest-kind:home" },
      select: { id: true },
    });
    if (project) {
      await prisma.studioProject.delete({ where: { id: project.id } });
      deletedHomeProjects += 1;
    }
  }
  const deletedUsers = (await prisma.user.deleteMany({
    where: { id: { in: userIds } },
  })).count;
  let deletedFirebaseUsers = 0;
  for (const coach of coaches) {
    await auth.deleteUser(coach.firebaseUid).catch((error) => {
      if (error?.code !== "auth/user-not-found") throw error;
    });
    deletedFirebaseUsers += 1;
  }
  return { deletedOfferings, deletedHomeProjects, deletedUsers, deletedFirebaseUsers };
}

async function main() {
  assert.equal(
    process.env.QUIPSLY_LOCAL_DISTINCT_COACH_CAPACITY,
    "1",
    "Set QUIPSLY_LOCAL_DISTINCT_COACH_CAPACITY=1 to authorize generated local accounts and cleanup.",
  );
  const origin = loopbackOrigin(
    process.env.QUIPSLY_LOCAL_ORIGIN || "http://127.0.0.1:3012",
    "Quipsly origin",
  );
  const authOrigin = loopbackOrigin(
    process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099",
    "Firebase Auth emulator",
  );
  process.env.FIREBASE_AUTH_EMULATOR_HOST = new URL(authOrigin).host;
  const count = boundedDistinctCoachCount(process.env.QUIPSLY_DISTINCT_COACH_COUNT);
  const databaseUrl = process.env.QUIPSLY_LOCAL_DATABASE_URL
    || "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio";
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl, max: 4 }),
  });
  const firebaseApp = initializeApp(
    { projectId: "quipsly-reef" },
    `distinct-coach-capacity-${randomUUID()}`,
  );
  const auth = getAuth(firebaseApp);
  const batch = randomBytes(4).toString("hex");
  const coaches = [];
  let cleanup = null;
  let result = null;

  try {
    for (let index = 0; index < count; index += 1) {
      coaches.push(await prepareCoach({ auth, authOrigin, origin, batch, index }));
    }
    const routes = [
      "/api/coaching/runway",
      "/api/mobile/capture/sessions",
      "/api/mobile/capture/today",
    ];
    const startedAt = Date.now();
    const samples = (await Promise.all(coaches.map(async (coach, coachIndex) =>
      Promise.all(routes.map(async (route) => {
        try {
          const response = await api(origin, coach.token, route);
          const correctIdentity = route !== "/api/coaching/runway"
            || response.body?.user?.email === coach.email;
          return {
            coachIndex,
            route,
            status: response.status,
            ok: response.status === 200 && response.body?.ok === true && correctIdentity,
            correctIdentity,
            latencyMilliseconds: response.latencyMilliseconds,
          };
        } catch (error) {
          return {
            coachIndex,
            route,
            status: 0,
            ok: false,
            correctIdentity: false,
            latencyMilliseconds: 30_000,
            error: error instanceof Error ? error.name : "unknown",
          };
        }
      })),
    ))).flat();
    const failures = samples.filter((sample) => !sample.ok);
    const latencies = samples.map((sample) => sample.latencyMilliseconds);
    result = {
      ok: failures.length === 0,
      schema: "quipsly-local-distinct-coach-capacity-v2",
      testLane: "local-capacity-automation",
      generatedAt: new Date().toISOString(),
      origin,
      distinctCoachAccounts: coaches.length,
      totalAuthenticatedReads: samples.length,
      failedAuthenticatedReads: failures.length,
      wallMilliseconds: Date.now() - startedAt,
      latencyMilliseconds: {
        p50: percentile(latencies, 0.5),
        p95: percentile(latencies, 0.95),
        max: Math.max(...latencies),
      },
      evidence: {
        distinctFirebaseAccountsProven: new Set(coaches.map((coach) => coach.firebaseUid)).size === count,
        distinctQuipslyIdentitiesProven: samples
          .filter((sample) => sample.route === "/api/coaching/runway")
          .every((sample) => sample.correctIdentity),
        authenticatedCoachSetupContractProven: coaches.length === count,
        renderedSelfServiceCoachSetupProven: false,
        concurrentAuthenticatedReadsProven: failures.length === 0,
        minimallyInstructedHumanAcceptanceProven: false,
        realMailboxDeliveryProven: false,
        concurrentCallsProven: false,
        recordingUploadLoadProven: false,
        productionScaleProven: false,
      },
      failures: failures.slice(0, 12),
    };
    assert(result.ok, "Distinct-coach local capacity reads failed.");
  } finally {
    cleanup = await cleanupGeneratedBatch(prisma, auth, coaches).catch((error) => ({
      error: error instanceof Error ? error.message : String(error),
    }));
    await prisma.$disconnect();
    await deleteApp(firebaseApp);
  }

  const receipt = { ...result, cleanup };
  const artifactRoot = path.resolve(
    process.env.QUIPSLY_CAPACITY_ARTIFACT_ROOT || "artifacts/coaching-capacity",
  );
  await mkdir(artifactRoot, { recursive: true, mode: 0o700 });
  const receiptPath = path.join(artifactRoot, `distinct-${batch}-${count}.json`);
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  await chmod(receiptPath, 0o600);
  console.log(JSON.stringify({ ...receipt, receiptPath }, null, 2));
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, null, 2));
    process.exit(1);
  });
}
