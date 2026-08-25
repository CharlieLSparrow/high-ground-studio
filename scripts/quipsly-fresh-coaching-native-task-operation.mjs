#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { chmod, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadFreshCoachingAcceptanceContext } from "./lib/coaching-acceptance-context.mjs";
import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";

assert.equal(
  process.env.QUIPSLY_FRESH_COACHING_NATIVE_TASK,
  "1",
  "Set QUIPSLY_FRESH_COACHING_NATIVE_TASK=1 to operate fresh native task readback.",
);
assert.equal(process.platform, "darwin", "Fresh native task proof requires macOS and Xcode.");

const repoRoot = process.cwd();
const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: repoRoot,
  encoding: "utf8",
}).trim();
assert.match(sourceSha, /^[a-f0-9]{40}$/);
const trackedWorktreeCleanAtStart =
  execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim().length === 0;
const baseURL = process.env.QUIPSLY_LOCAL_BASE_URL || "http://127.0.0.1:3012";
const parsedBaseURL = new URL(baseURL);
assert(
  parsedBaseURL.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(parsedBaseURL.hostname),
  "Fresh native task proof refuses a non-loopback Nest origin.",
);
const freshContext = await loadFreshCoachingAcceptanceContext({ baseURL });
assert(freshContext, "Fresh native task proof requires an exact private context.");
const candidateReceiptPath = path.join(
  path.dirname(freshContext.contextPath),
  "candidate-follow-through-receipt.json",
);
const candidateReceipt = JSON.parse(await readFile(candidateReceiptPath, "utf8"));
assert.equal(candidateReceipt.ok, true);
assert.equal(candidateReceipt.roomId, freshContext.roomId);
assert.match(candidateReceipt.canonicalActionItemId || "", /^[A-Za-z0-9_-]{8,240}$/);

const databaseURL = new URL(
  process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio",
);
assert(
  ["postgres:", "postgresql:"].includes(databaseURL.protocol) &&
    ["127.0.0.1", "localhost", "[::1]"].includes(databaseURL.hostname),
  "Fresh native task proof refuses non-loopback PostgreSQL.",
);
process.env.DATABASE_URL = databaseURL.toString();
const { getPrismaClient } = await import("../apps/quipsly/src/lib/prisma.ts");
const prisma = getPrismaClient();

const taskBefore = await prisma.actionItem.findUnique({
  where: { id: candidateReceipt.canonicalActionItemId },
  select: { id: true, roomId: true, assignedUserId: true, title: true, dueAt: true, status: true, sourceJson: true, updatedAt: true },
});
assert(taskBefore, "The exact reviewed transcript task is unavailable.");
assert.equal(taskBefore.roomId, freshContext.roomId);
assert.equal(taskBefore.assignedUserId, freshContext.identities.coach.userId);
assert.equal(taskBefore.title, "Send the coaching recording to the instructor");
assert.equal(taskBefore.dueAt, null);
assert.equal(taskBefore.status, "OPEN");
const sourceBefore = JSON.stringify(taskBefore.sourceJson);
assert.match(sourceBefore, /transcript/i);
assert.match(sourceBefore, /segment/i);
const roomTaskCountBefore = await prisma.actionItem.count({ where: { roomId: freshContext.roomId } });
const derivedDataPath =
  process.env.QUIPSLY_CAPTURE_UI_TEST_DERIVED_DATA_PATH ||
  `/private/tmp/quipsly-fresh-coaching-native-task-${process.pid}-derived`;

function passwordFor(identity) {
  const password = readRetainedQAPassword({
    service: freshContext.keychainService,
    account: identity.email,
  });
  assert(password, `Fresh ${identity.role} Keychain password is unavailable.`);
  return password;
}

function stamp() {
  return new Date().toISOString().replace(/[-:.]/g, "");
}

async function runJourney(mode, identity) {
  const resultBundle = `/private/tmp/quipsly-fresh-${mode}-${stamp()}-${process.pid}.xcresult`;
  const runner = path.join(
    repoRoot,
    "apps/mobile-capture/HighGroundCapture/scripts/run-capture-runtime-ui-smoke.sh",
  );
  const child = spawn("bash", [runner], {
    cwd: repoRoot,
    env: {
      ...process.env,
      QUIPSLY_CAPTURE_UI_TEST_BASE_URL: baseURL,
      QUIPSLY_CAPTURE_UI_TEST_MODE: mode,
      QUIPSLY_CAPTURE_UI_TEST_EMAIL: identity.email,
      QUIPSLY_CAPTURE_UI_TEST_PASSWORD: passwordFor(identity),
      QUIPSLY_CAPTURE_UI_TEST_SESSION_ID: freshContext.roomId,
      QUIPSLY_CAPTURE_UI_TEST_SESSION_TITLE: freshContext.sessionTitle,
      QUIPSLY_CAPTURE_UI_TEST_TASK_ID: taskBefore.id,
      QUIPSLY_CAPTURE_UI_TEST_EXPECTED_PACKET_TASK_TITLE: taskBefore.title,
      QUIPSLY_CAPTURE_UI_TEST_SIMULATOR_APP_STATE_MODE: "fresh",
      QUIPSLY_CAPTURE_UI_TEST_DERIVED_DATA_PATH: derivedDataPath,
      QUIPSLY_CAPTURE_UI_TEST_RESULT_BUNDLE_PATH: resultBundle,
    },
    stdio: "inherit",
  });
  const status = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  assert.equal(status, 0, `${mode} failed with exit ${String(status)}.`);
  return resultBundle;
}

try {
  const ownerResultBundle = await runJourney("transcript-task-readback", freshContext.identities.coach);
  const participantIsolationResultBundle = await runJourney("transcript-task-isolation", freshContext.identities.client);
  const [taskAfter, roomTaskCountAfter] = await Promise.all([
    prisma.actionItem.findUnique({
      where: { id: taskBefore.id },
      select: { id: true, roomId: true, assignedUserId: true, title: true, dueAt: true, status: true, sourceJson: true, updatedAt: true },
    }),
    prisma.actionItem.count({ where: { roomId: freshContext.roomId } }),
  ]);
  assert.deepEqual(taskAfter, taskBefore, "Phone readback mutated the canonical task or its source evidence.");
  assert.equal(roomTaskCountAfter, roomTaskCountBefore, "Phone readback created duplicate Session work.");

  const receiptPath = path.join(
    path.dirname(freshContext.contextPath),
    "native-task-readback-receipt.json",
  );
  const receipt = {
    schema: "quipsly-fresh-coaching-native-task-operation-v1",
    recordedAt: new Date().toISOString(),
    ok: true,
    localOnly: true,
    testLane: freshContext.testLane,
    fixtureIdentifiersUsed: false,
    humanAcceptanceSatisfied: false,
    sourceSha,
    trackedWorktreeCleanAtStart,
    roomId: freshContext.roomId,
    canonicalActionItemId: taskBefore.id,
    ownerUserId: freshContext.identities.coach.userId,
    otherParticipantUserId: freshContext.identities.client.userId,
    ownerTodayReadbackProven: true,
    exactTranscriptSourceReturnProven: true,
    otherParticipantTaskIsolationProven: true,
    otherParticipantTranscriptAccessRetained: true,
    otherParticipantPrivatePacketIsolationProven: true,
    participantSharedFollowUpBoundaryRendered: true,
    explicitLocalSourceAvailabilityBoundaryProven: true,
    taskMutated: false,
    duplicateTaskCreated: false,
    ownerResultBundle,
    participantIsolationResultBundle,
    derivedDataPath,
    secretsPrinted: false,
    receiptPath,
  };
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await chmod(receiptPath, 0o600);
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  await prisma.$disconnect();
}
