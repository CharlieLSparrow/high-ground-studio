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
  password: `Qc-${randomBytes(18).toString("base64url")}!26`,
};
const outsider = {
  email: `phone-outsider-${suffix}@dev.test`,
  displayName: `Phone Outsider ${suffix.slice(0, 4).toUpperCase()}`,
  password: `Qo-${randomBytes(18).toString("base64url")}!26`,
};
const sessionTitle = "Coaching session";
const workSuffix = suffix;
const expectedWork = {
  sharedNote: `Shared phone note ${workSuffix}`,
  task: `Phone task ${workSuffix}`,
  goal: `Phone goal ${workSuffix}`,
  privateNote: `Private phone note ${workSuffix}`,
};
const expectedConversationBody = `Phone coaching conversation ${workSuffix}`;
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

async function bearerToken(identity) {
  const endpoint = new URL(
    "/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key",
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`,
  );
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: identity.email,
      password: identity.password,
      returnSecureToken: true,
    }),
  });
  const packet = await response.json().catch(() => null);
  assert(response.ok && packet?.idToken, "Local Firebase adapter did not mint a coach bearer token.");
  return packet.idToken;
}

async function ensureFirebaseIdentity(identity) {
  const existing = await auth.getUserByEmail(identity.email).catch((error) => {
    if (error?.code === "auth/user-not-found") return null;
    throw error;
  });
  if (existing) {
    return auth.updateUser(existing.uid, {
      password: identity.password,
      emailVerified: true,
      displayName: identity.displayName,
    });
  }
  return auth.createUser({
    email: identity.email,
    password: identity.password,
    emailVerified: true,
    displayName: identity.displayName,
  });
}

async function rejectedJSON(pathname, token, expectedStatus) {
  const response = await fetch(new URL(pathname, baseURL), {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      "cache-control": "no-store",
    },
  });
  const packet = await response.json().catch(() => null);
  assert.equal(response.status, expectedStatus, `${pathname} returned an unexpected isolation status.`);
  assert.equal(packet?.ok, false, `${pathname} did not preserve its private not-found envelope.`);
  return packet;
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

const token = await bearerToken(coach);
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
assert.equal(
  Math.round((new Date(booking.scheduledEnd).getTime() - new Date(booking.scheduledStart).getTime()) / 60_000),
  45,
  "The iPhone reschedule did not persist the operated 45-minute duration to canonical booking truth.",
);

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

const conversationQuery = new URLSearchParams({
  projectSlug: sessions.coachingEngagements?.find(
    (candidate) => candidate.id === booking.coachingEngagementId,
  )?.projectSlug || "",
  threadKey: `engagement:${booking.coachingEngagementId}`,
});
assert(
  conversationQuery.get("projectSlug"),
  "The mobile relationship projection omitted the exact private project boundary.",
);
const conversation = await authenticatedJSON(
  `/api/nest-chat?${conversationQuery.toString()}`,
  token,
);
assert.equal(
  conversation.engagement?.id,
  booking.coachingEngagementId,
  "The relationship conversation resolved a different coaching engagement.",
);
assert.equal(
  conversation.thread?.key,
  `engagement:${booking.coachingEngagementId}`,
  "The relationship conversation escaped its canonical thread key.",
);
const conversationMessage = conversation.messages?.find(
  (candidate) => candidate.body === expectedConversationBody,
);
assert(
  conversationMessage,
  "Independent readback omitted the exact message posted by the compiled iPhone UI.",
);

await ensureFirebaseIdentity(client);
await ensureFirebaseIdentity(outsider);
const clientToken = await bearerToken(client);
const outsiderToken = await bearerToken(outsider);
const clientConversation = await authenticatedJSON(
  `/api/nest-chat?${conversationQuery.toString()}`,
  clientToken,
);
assert.equal(
  clientConversation.actor?.role,
  "CLIENT",
  "The invited client did not retain relationship-scoped conversation access.",
);
assert(
  clientConversation.messages?.some(
    (candidate) => candidate.id === conversationMessage.id,
  ),
  "The invited client could not read the exact iPhone-authored relationship message.",
);
const clientWorkspace = await authenticatedJSON(
  `/api/coaching/engagements/${encodeURIComponent(booking.coachingEngagementId)}/work`,
  clientToken,
);
for (const expected of [expectedWork.sharedNote, expectedWork.task, expectedWork.goal]) {
  assert(
    clientWorkspace.engagement?.entries?.some((candidate) => candidate.title === expected),
    `The invited client could not read shared relationship work: ${expected}.`,
  );
}
assert(
  !clientWorkspace.engagement?.entries?.some(
    (candidate) => candidate.title === expectedWork.privateNote,
  ),
  "The coach's author-private note leaked into the invited client's response.",
);
await rejectedJSON(
  `/api/nest-chat?${conversationQuery.toString()}`,
  outsiderToken,
  404,
);
await rejectedJSON(
  `/api/coaching/engagements/${encodeURIComponent(booking.coachingEngagementId)}/work`,
  outsiderToken,
  404,
);

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
  schema: "quipsly-fresh-coaching-phone-start-v3",
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
    outsiderEmail: outsider.email,
  },
  operatedByCompiledIPhoneUI: {
    coachSetup: true,
    clientIdentityAndRelationshipCreation: true,
    appointmentCreation: true,
    appointmentReschedule: true,
    invitationAttemptWithVisibleOutcome: true,
    systemShareFallbackPresent: true,
    relationshipWorkspaceEntry: true,
    relationshipConversationPostAndReadback: true,
    relationshipSessionContinuityVisible: true,
    invitedClientConversationReadback: true,
    invitedClientSharedWorkReadback: true,
    authorPrivateNoteHiddenFromClient: true,
    unrelatedAccountDeniedConversationAndWork: true,
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
    scheduledStart: booking.scheduledStart,
    scheduledEnd: booking.scheduledEnd,
    durationMinutes: 45,
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
    relationshipConversation: {
      threadKey: conversation.thread.key,
      messageId: conversationMessage.id,
      body: conversationMessage.body,
      actorRole: conversation.actor?.role || null,
    },
    isolation: {
      invitedClientRole: clientConversation.actor?.role || null,
      invitedClientSawMessage: true,
      invitedClientSawSharedWork: true,
      invitedClientSawCoachPrivateNote: false,
      unrelatedConversationStatus: 404,
      unrelatedWorkspaceStatus: 404,
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
