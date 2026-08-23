#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

import { writeRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";

assert.equal(
  process.env.QUIPSLY_FRESH_COACHING_PHONE_START,
  "1",
  "Set QUIPSLY_FRESH_COACHING_PHONE_START=1 to authorize a fresh disposable local phone-first flight.",
);
assert.equal(process.platform, "darwin", "Phone-first Capture proof requires macOS and Xcode.");

const repoRoot = process.cwd();
const baseURL = new URL(
  process.env.QUIPSLY_LOCAL_BASE_URL || "http://127.0.0.1:3012",
);
assert(
  ["127.0.0.1", "localhost", "[::1]"].includes(baseURL.hostname),
  "Phone-first acceptance refuses a non-loopback Nest origin.",
);
const databaseURL = new URL(
  process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio",
);
assert(
  ["postgres:", "postgresql:"].includes(databaseURL.protocol) &&
    ["127.0.0.1", "localhost", "[::1]"].includes(databaseURL.hostname),
  "Phone-first acceptance refuses a non-loopback database.",
);

process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";
if (!getApps().length) initializeApp({ projectId: "quipsly-reef" });
const auth = getAuth();
const suffix = randomBytes(4).toString("hex");
const coach = {
  email: `phone-coach-${suffix}@dev.test`,
  displayName: `Phone Coach ${suffix.slice(0, 4).toUpperCase()}`,
  password: `Qp-${randomBytes(18).toString("base64url")}!26`,
};
const client = {
  email: `phone-client-${suffix}@dev.test`,
  displayName: `Phone Client ${suffix.slice(0, 4).toUpperCase()}`,
};
const sessionTitle = "Coaching session";
const workSuffix = suffix;
const expectedWork = {
  sharedNote: `Shared phone note ${workSuffix}`,
  task: `Phone task ${workSuffix}`,
  goal: `Phone goal ${workSuffix}`,
  privateNote: `Private phone note ${workSuffix}`,
};
const keychainService = "com.quipsly.qa.fresh-coaching-phone-start";

async function run(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    env: options.env || process.env,
    stdio: options.capture ? ["ignore", "pipe", "inherit"] : "inherit",
  });
  let stdout = "";
  if (options.capture) {
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
  }
  const status = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  assert.equal(status, 0, `${command} exited ${String(status)}.`);
  return stdout.trim();
}

async function bearerToken() {
  const endpoint = new URL(
    "/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key",
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`,
  );
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: coach.email,
      password: coach.password,
      returnSecureToken: true,
    }),
  });
  const packet = await response.json().catch(() => null);
  assert(response.ok && packet?.idToken, "Local Firebase adapter did not mint a coach bearer token.");
  return packet.idToken;
}

async function authenticatedJSON(pathname, token) {
  const response = await fetch(new URL(pathname, baseURL), {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      "cache-control": "no-store",
    },
  });
  const packet = await response.json().catch(() => null);
  assert(response.ok && packet?.ok === true, `${pathname} rejected the operated coach readback.`);
  return packet;
}

const sourceSha = await run("git", ["rev-parse", "HEAD"], { capture: true });
const initialStatus = await run("git", ["status", "--porcelain"], { capture: true });
assert.equal(
  initialStatus,
  "",
  "Commit or intentionally isolate source changes before claiming an exact-source phone-first flight.",
);

const firebaseUser = await auth.createUser({
  email: coach.email,
  password: coach.password,
  emailVerified: true,
  displayName: coach.displayName,
});
writeRetainedQAPassword({
  service: keychainService,
  account: coach.email,
  password: coach.password,
});

const artifactDirectory = path.join(
  repoRoot,
  "artifacts",
  "coaching-acceptance",
  `phone-start-${suffix}`,
);
await mkdir(artifactDirectory, { recursive: true, mode: 0o700 });
const resultBundlePath = path.join(artifactDirectory, "capture-phone-start.xcresult");

process.stderr.write(
  "[phone-first coaching] local adapter created only a verified ordinary account; the iPhone now owns coach setup, scheduling, invitation, and Session entry\n",
);
await run(
  "bash",
  ["apps/mobile-capture/HighGroundCapture/scripts/run-capture-runtime-ui-smoke.sh"],
  {
    env: {
      ...process.env,
      QUIPSLY_CAPTURE_UI_TEST_MODE: "coaching-phone-start",
      QUIPSLY_CAPTURE_UI_TEST_BASE_URL: baseURL.toString().replace(/\/$/, ""),
      QUIPSLY_CAPTURE_UI_TEST_EMAIL: coach.email,
      QUIPSLY_CAPTURE_UI_TEST_PASSWORD: coach.password,
      QUIPSLY_CAPTURE_UI_TEST_COACHING_CLIENT_EMAIL: client.email,
      QUIPSLY_CAPTURE_UI_TEST_RESULT_BUNDLE_PATH: resultBundlePath,
      QUIPSLY_CAPTURE_UI_TEST_TIMEOUT_SECONDS: "900",
    },
  },
);

const token = await bearerToken();
const runway = await authenticatedJSON("/api/coaching/runway", token);
assert.equal(runway.user?.isCoach, true, "The iPhone coach setup did not persist.");
const booking = runway.upcomingBookings?.find(
  (candidate) =>
    candidate.title === sessionTitle &&
    candidate.client?.email?.toLowerCase() === client.email,
);
assert(booking, "Independent readback did not find the exact iPhone-created booking.");
assert(booking.coachingEngagementId, "The phone-created booking lacks its canonical client relationship.");
assert(booking.callRoomId, "The phone-created booking lacks its canonical Session room.");
assert(booking.clientEntryPath, "The phone-created booking lacks its verified-email client entry.");

const sessions = await authenticatedJSON("/api/mobile/capture/sessions", token);
const session = sessions.sessions?.find(
  (candidate) => candidate.id === booking.callRoomId || candidate.callRoomId === booking.callRoomId,
);
assert(session, "Independent Capture readback omitted the exact phone-created Session.");
assert.equal(session.title, sessionTitle, "The canonical Session lost its custom phone-entered title.");

const workspace = await authenticatedJSON(
  `/api/coaching/engagements/${encodeURIComponent(booking.coachingEngagementId)}/work`,
  token,
);
assert.equal(
  workspace.engagement?.id,
  booking.coachingEngagementId,
  "The canonical relationship workspace did not match the phone-created engagement.",
);
assert.equal(workspace.engagement?.canWrite, true, "The fresh coach cannot write relationship work.");

function requireWork(title, kind, visibility) {
  const entry = workspace.engagement?.entries?.find(
    (candidate) => candidate.title === title,
  );
  assert(entry, `Independent readback omitted ${title}.`);
  assert.equal(entry.kind, kind, `${title} used the wrong canonical work kind.`);
  assert.equal(entry.visibility, visibility, `${title} crossed its intended privacy boundary.`);
  return entry;
}

const sharedNote = requireWork(expectedWork.sharedNote, "NOTE", "SHARED");
const task = requireWork(expectedWork.task, "TASK", "SHARED");
const goal = requireWork(expectedWork.goal, "GOAL", "SHARED");
const privateNote = requireWork(expectedWork.privateNote, "NOTE", "PRIVATE");

const receipt = {
  ok: true,
  schema: "quipsly-fresh-coaching-phone-start-v2",
  createdAt: new Date().toISOString(),
  source: {
    sha: sourceSha,
    trackedWorktreeCleanAtStart: true,
  },
  lane: {
    name: "fresh-phone-product-automation",
    fixtureIdentifiersUsed: false,
    localMailboxVerificationAdapterUsed: true,
    simulatorAutomationUsed: true,
    realMailboxDeliveryProved: false,
    physicalIPhoneProved: false,
    minimallyInstructedHumanAcceptanceSatisfied: false,
    fiftyCoachScaleSatisfied: false,
  },
  identity: {
    firebaseUid: firebaseUser.uid,
    coachEmail: coach.email,
    clientEmail: client.email,
  },
  operatedByCompiledIPhoneUI: {
    coachSetup: true,
    clientIdentityAndRelationshipCreation: true,
    appointmentCreation: true,
    invitationAttemptWithVisibleOutcome: true,
    systemShareFallbackPresent: true,
    relationshipWorkspaceEntry: true,
    sharedNoteCreation: true,
    taskCreation: true,
    goalCreation: true,
    authorPrivateNoteCreationWithVisibleBoundary: true,
    exactSessionEntry: true,
  },
  canonicalReadback: {
    coachingEngagementId: booking.coachingEngagementId,
    bookingId: booking.id,
    roomId: booking.callRoomId,
    sessionTitle,
    clientEntryPath: booking.clientEntryPath,
    invitationDelivery: booking.clientInvitationDelivery || null,
    relationshipWork: {
      sharedNote: { id: sharedNote.id, title: sharedNote.title, visibility: sharedNote.visibility },
      task: { id: task.id, title: task.title, visibility: task.visibility },
      goal: { id: goal.id, title: goal.title, visibility: goal.visibility },
      privateNote: {
        id: privateNote.id,
        title: privateNote.title,
        visibility: privateNote.visibility,
        canEdit: privateNote.canEdit,
      },
    },
  },
  artifacts: {
    xcresult: resultBundlePath,
  },
};
const receiptPath = path.join(artifactDirectory, "phone-start-receipt.json");
await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, {
  mode: 0o600,
});
await chmod(receiptPath, 0o600);
process.stdout.write(`${JSON.stringify({ ok: true, receiptPath, ...receipt.canonicalReadback }, null, 2)}\n`);
