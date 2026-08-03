#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";

const requireFromQuipsly = createRequire(
  new URL("../apps/quipsly/package.json", import.meta.url),
);
const { PrismaClient } = requireFromQuipsly("@prisma/client");
const { PrismaPg } = requireFromQuipsly("@prisma/adapter-pg");

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const runtimeRunner = path.join(
  repoRoot,
  "apps/mobile-capture/HighGroundCapture/scripts/run-capture-runtime-ui-smoke.sh",
);
const KEYCHAIN_SERVICE = "com.quipsly.qa.retained-coaching";
const CLIENT_EMAIL = "quipsly-client-retained-20260731@example.test";
const DEFAULT_LOCAL_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio";
const VALUES = {
  commitmentOne: "QA Retained · Plan one physical Capture rehearsal",
  commitmentTwo: "QA Retained · Review one exact Nest readback",
  supportNeeded: "QA Retained · One second listener for the assembled playback",
  progressNotes: "QA Retained · The plan changed on iPhone; no Task, Goal, calendar, message, or provider state changed.",
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function loopbackHost(hostname) {
  return ["127.0.0.1", "localhost", "[::1]"].includes(hostname);
}

function requireLoopbackOrigin(value) {
  const url = new URL(value);
  assert(
    url.protocol === "http:"
      && loopbackHost(url.hostname)
      && !url.username
      && !url.password
      && ["", "/"].includes(url.pathname)
      && !url.search
      && !url.hash,
    "Retained native weekly-plan operation requires a credential-free loopback Nest origin.",
  );
  return url.origin;
}

function requireLocalDatabaseUrl(value) {
  const url = new URL(value);
  assert(
    ["postgres:", "postgresql:"].includes(url.protocol)
      && loopbackHost(url.hostname)
      && Boolean(url.pathname)
      && url.pathname !== "/",
    "Retained native weekly-plan operation requires an explicit loopback PostgreSQL database.",
  );
  return url.toString();
}

function currentWeekStartsAt(now = new Date()) {
  const day = now.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - daysSinceMonday,
    12,
  ));
}

async function externalBoundarySnapshot(prisma) {
  const [appointments, calendarLinks, deliveries, nestMessages, providerEvents] = await Promise.all([
    prisma.appointment.count(),
    prisma.calendarEventLink.count(),
    prisma.deliveryEvent.count(),
    prisma.studioNestChatMessage.count(),
    prisma.worldHubProviderEvent.count(),
  ]);
  return { appointments, calendarLinks, deliveries, nestMessages, providerEvents };
}

async function workBoundarySnapshot(prisma, userId) {
  const [tasks, goals, focusBlocks] = await Promise.all([
    prisma.actionItem.count({ where: { assignedUserId: userId } }),
    prisma.goal.count({ where: { ownerUserId: userId } }),
    prisma.workPlanBlock.count({ where: { ownerUserId: userId } }),
  ]);
  return { tasks, goals, focusBlocks };
}

function runCompiledOperation({ baseURL, password, resultBundle }) {
  const result = spawnSync("bash", [runtimeRunner], {
    cwd: repoRoot,
    env: {
      ...process.env,
      QUIPSLY_CAPTURE_UI_TEST_MODE: "weekly-plan-operation",
      QUIPSLY_CAPTURE_UI_TEST_BASE_URL: baseURL,
      QUIPSLY_CAPTURE_UI_TEST_EMAIL: CLIENT_EMAIL,
      QUIPSLY_CAPTURE_UI_TEST_PASSWORD: password,
      QUIPSLY_CAPTURE_UI_TEST_WEEKLY_PLAN_COMMITMENT_ONE: VALUES.commitmentOne,
      QUIPSLY_CAPTURE_UI_TEST_WEEKLY_PLAN_COMMITMENT_TWO: VALUES.commitmentTwo,
      QUIPSLY_CAPTURE_UI_TEST_WEEKLY_PLAN_SUPPORT: VALUES.supportNeeded,
      QUIPSLY_CAPTURE_UI_TEST_WEEKLY_PLAN_REFLECTION: VALUES.progressNotes,
      QUIPSLY_CAPTURE_UI_TEST_RESULT_BUNDLE_PATH: resultBundle,
    },
    stdio: "inherit",
  });
  assert(
    result.status === 0,
    `Compiled iPhone weekly-plan operation failed (exit ${String(result.status)}).`,
  );
}

export async function main() {
  const baseURL = requireLoopbackOrigin(
    process.env.QUIPSLY_RETAINED_PRODUCT_BASE_URL || "http://127.0.0.1:3012",
  );
  const databaseURL = requireLocalDatabaseUrl(
    process.env.DATABASE_URL
      || process.env.QUIPSLY_LOCAL_DATABASE_URL
      || DEFAULT_LOCAL_DATABASE_URL,
  );
  const password = readRetainedQAPassword({
    service: KEYCHAIN_SERVICE,
    account: CLIENT_EMAIL,
  });
  assert(password, "The retained coaching client has no Keychain password.");
  const resultBundle = path.resolve(
    process.env.QUIPSLY_CAPTURE_UI_TEST_RESULT_BUNDLE_PATH
      || `/private/tmp/quipsly-retained-native-weekly-plan-${Date.now()}-${process.pid}.xcresult`,
  );
  assert(
    resultBundle.startsWith("/private/tmp/") || resultBundle.startsWith("/Volumes/"),
    "The result bundle must stay below /private/tmp or an explicit QA volume.",
  );

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
      where: { primaryEmail: CLIENT_EMAIL },
      select: { id: true, isActive: true, emailVerified: true },
    });
    assert(
      user?.id && user.isActive && user.emailVerified,
      "The retained coaching client is not an active verified Quipsly user.",
    );
    const weekStartsAt = currentWeekStartsAt();
    const [workBefore, externalBefore] = await Promise.all([
      workBoundarySnapshot(prisma, user.id),
      externalBoundarySnapshot(prisma),
    ]);

    runCompiledOperation({ baseURL, password, resultBundle });

    const [weeklyPlan, workAfter, externalAfter] = await Promise.all([
      prisma.weeklyCommitment.findUnique({
        where: { clientUserId_weekStartsAt: { clientUserId: user.id, weekStartsAt } },
      }),
      workBoundarySnapshot(prisma, user.id),
      externalBoundarySnapshot(prisma),
    ]);
    assert(weeklyPlan?.status === "ACTIVE", "The canonical current-week plan is missing or inactive.");
    assert(weeklyPlan.commitmentOne === VALUES.commitmentOne, "Commitment one readback drifted.");
    assert(weeklyPlan.commitmentTwo === VALUES.commitmentTwo, "Commitment two readback drifted.");
    assert(weeklyPlan.commitmentThree === null, "The iPhone operation invented a third commitment.");
    assert(weeklyPlan.supportNeeded === VALUES.supportNeeded, "Support readback drifted.");
    assert(weeklyPlan.progressNotes === VALUES.progressNotes, "Reflection readback drifted.");
    assert(weeklyPlan.clientReviewedAt, "The explicit client review was not recorded.");
    assert(
      JSON.stringify(workAfter) === JSON.stringify(workBefore),
      "Weekly-plan save changed the client's Task, Goal, or focus-block counts.",
    );
    assert(
      JSON.stringify(externalAfter) === JSON.stringify(externalBefore),
      "Weekly-plan save changed appointment, calendar, delivery, chat, or provider counts.",
    );
    const receipts = Array.isArray(weeklyPlan.sourceJson?.clientPlanReceipts)
      ? weeklyPlan.sourceJson.clientPlanReceipts
      : [];
    const receipt = receipts.at(-1);
    assert(receipt?.kind === "quipsly-weekly-commitment-save-v2", "The canonical plan receipt is missing.");
    assert(receipt?.surface === "ios-capture-today", "The canonical receipt lost its exact iPhone Today source surface.");
    assert(receipt?.clientReviewed === true, "The receipt lost the explicit review decision.");
    assert(receipt?.externalSideEffects === false, "The receipt claims an external side effect.");

    console.log(JSON.stringify({
      ok: true,
      localOnly: true,
      retained: true,
      compiledIPhoneOperation: true,
      survivedProcessRelaunch: true,
      canonicalReadback: true,
      weeklyPlanIdSha256: sha256(weeklyPlan.id),
      receiptIdSha256: sha256(receipt.receiptId),
      workBoundaryUnchanged: true,
      externalBoundaryUnchanged: true,
      resultBundle,
      artifactPreserved: true,
      credentialsPrinted: false,
      externalSideEffects: false,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
