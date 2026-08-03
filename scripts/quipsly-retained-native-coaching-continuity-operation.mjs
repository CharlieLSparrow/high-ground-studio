#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";
import {
  materializeRetainedCoachingContinuitySource,
  RETAINED_COACHING_CONTINUITY_SOURCE,
} from "./lib/retained-coaching-continuity-source.mjs";

const REPO_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const RUNNER = path.join(
  REPO_ROOT,
  "apps/mobile-capture/HighGroundCapture/scripts/run-capture-runtime-ui-smoke.sh",
);
const KEYCHAIN_SERVICE = "com.quipsly.qa.retained-coaching";
const COACH_EMAIL = "quipsly-coach-retained-20260731@example.test";
const CLIENT_EMAIL = "quipsly-client-retained-20260731@example.test";
const NEXT_ROOM_ID = "qa-retained-coaching-next-session-20260807";
const NEXT_ROOM_TITLE = "QA Retained · Coaching continuity Session 2";
const PRIOR_ROOM_ID = "retained-coaching-follow-up-20260731";
const PRIOR_ROOM_TITLE = "Retained coaching follow-up rehearsal";
const TRANSCRIPT_ASSET_ID = "retained-coaching-continuity-asset-20260803";
const TRANSCRIPT_PARTICIPANT_ID = `${PRIOR_ROOM_ID}-coach`;
const TRANSCRIPT_CONSENT_ID = "retained-coaching-consent-coach-20260803";
const TASK_ID = "retained-follow-up-client-task-20260731";
const GOAL_ID = "retained-follow-up-client-goal-20260731";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requireLoopbackOrigin(value) {
  const url = new URL(String(value || ""));
  assert(url.protocol === "http:", "Native retained coaching operation requires loopback HTTP.");
  assert(
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
    "Native retained coaching operation refuses non-loopback Nest origins.",
  );
  return url.origin;
}

function requireLoopbackAuthOrigin(value) {
  const normalized = String(value || "").trim();
  const url = new URL(normalized.includes("://") ? normalized : `http://${normalized}`);
  assert(url.protocol === "http:", "Native retained coaching auth requires loopback HTTP.");
  assert(
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
    "Native retained coaching auth refuses non-loopback Firebase emulators.",
  );
  return url.origin;
}

async function verifyAndWarmCanonicalSession({ baseURL, email, password }) {
  const authOrigin = requireLoopbackAuthOrigin(
    process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099",
  );
  const signInResponse = await fetch(
    `${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const signInBody = await signInResponse.json().catch(() => null);
  assert(
    signInResponse.status === 200 && typeof signInBody?.idToken === "string",
    "Retained coaching actor could not authenticate with the local Firebase emulator.",
  );

  const sessionsResponse = await fetch(`${baseURL}/api/mobile/capture/sessions`, {
    headers: { authorization: `Bearer ${signInBody.idToken}` },
  });
  const sessionsBody = await sessionsResponse.json().catch(() => null);
  assert(
    sessionsResponse.status === 200 && sessionsBody?.ok === true,
    "Nest did not return the authoritative retained Session list.",
  );
  assert(
    Array.isArray(sessionsBody.sessions)
      && sessionsBody.sessions.some((session) => session?.id === NEXT_ROOM_ID),
    "The exact retained next Session is missing from Nest's authoritative list.",
  );
  const sessionCheckResponse = await fetch(`${baseURL}/api/mac/session-check`, {
    headers: { authorization: `Bearer ${signInBody.idToken}` },
  });
  const sessionCheckBody = await sessionCheckResponse.json().catch(() => null);
  assert(
    sessionCheckResponse.status === 200
      && (sessionCheckBody?.ok === true || sessionCheckBody?.authenticated === true)
      && typeof sessionCheckBody?.user?.id === "string",
    "Nest did not return the exact account owner needed to partition the retained local source.",
  );
  return {
    sessionCount: sessionsBody.sessions.length,
    ownerAccountID: sessionCheckBody.user.id,
  };
}

function parseArguments(args) {
  const result = { help: false, resultBundle: "" };
  for (let index = 0; index < args.length; index += 1) {
    const item = args[index];
    if (item === "--help" || item === "-h") result.help = true;
    else if (item === "--result-bundle") result.resultBundle = args[++index] || "";
    else throw new Error(`Unknown argument: ${item}`);
  }
  return result;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(`Usage:
  pnpm quipsly:retained:native-coaching-continuity

Runs the compiled Capture app against retained local coaching Sessions and
preserves the xcresult below /private/tmp. Credentials remain in macOS Keychain.`);
    return;
  }
  const baseURL = requireLoopbackOrigin(
    process.env.QUIPSLY_RETAINED_COACHING_BASE_URL || "http://127.0.0.1:3012",
  );
  const password = readRetainedQAPassword({
    service: KEYCHAIN_SERVICE,
    account: COACH_EMAIL,
  });
  assert(password, "The retained coaching actor has no Keychain password.");
  const clientPassword = readRetainedQAPassword({
    service: KEYCHAIN_SERVICE,
    account: CLIENT_EMAIL,
  });
  assert(clientPassword, "The retained coaching client has no Keychain password.");
  const coachSession = await verifyAndWarmCanonicalSession({
    baseURL,
    email: COACH_EMAIL,
    password,
  });
  await verifyAndWarmCanonicalSession({
    baseURL,
    email: CLIENT_EMAIL,
    password: clientPassword,
  });
  const retainedSource = await materializeRetainedCoachingContinuitySource();
  assert(
    retainedSource.sha256 === RETAINED_COACHING_CONTINUITY_SOURCE.sha256,
    "The retained local source changed while preparing the native operation.",
  );
  const resultBundle = path.resolve(
    options.resultBundle
      || `/private/tmp/quipsly-retained-native-coaching-continuity-${Date.now()}-${process.pid}.xcresult`,
  );
  assert(
    resultBundle.startsWith("/private/tmp/"),
    "Result bundle must remain below /private/tmp.",
  );

  const result = spawnSync("bash", [RUNNER], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      QUIPSLY_CAPTURE_UI_TEST_MODE: "coaching-continuity",
      QUIPSLY_CAPTURE_UI_TEST_BASE_URL: baseURL,
      QUIPSLY_CAPTURE_UI_TEST_EMAIL: COACH_EMAIL,
      QUIPSLY_CAPTURE_UI_TEST_PASSWORD: password,
      QUIPSLY_CAPTURE_UI_TEST_SESSION_ID: NEXT_ROOM_ID,
      QUIPSLY_CAPTURE_UI_TEST_SESSION_TITLE: NEXT_ROOM_TITLE,
      QUIPSLY_CAPTURE_UI_TEST_RECORDING_FIXTURE_PATH: retainedSource.path,
      QUIPSLY_CAPTURE_UI_TEST_RECORDING_FIXTURE_LOCAL_ID: randomUUID(),
      QUIPSLY_CAPTURE_UI_TEST_RECORDING_FIXTURE_ASSET_ID: TRANSCRIPT_ASSET_ID,
      QUIPSLY_CAPTURE_UI_TEST_RECORDING_FIXTURE_ROOM_ID: PRIOR_ROOM_ID,
      QUIPSLY_CAPTURE_UI_TEST_RECORDING_FIXTURE_PARTICIPANT_ID: TRANSCRIPT_PARTICIPANT_ID,
      QUIPSLY_CAPTURE_UI_TEST_RECORDING_FIXTURE_CONSENT_ID: TRANSCRIPT_CONSENT_ID,
      QUIPSLY_CAPTURE_UI_TEST_RECORDING_FIXTURE_OWNER_ACCOUNT_ID: coachSession.ownerAccountID,
      QUIPSLY_CAPTURE_UI_TEST_RECORDING_FIXTURE_SHA256: retainedSource.sha256,
      QUIPSLY_CAPTURE_UI_TEST_RECORDING_FIXTURE_TITLE: PRIOR_ROOM_TITLE,
      QUIPSLY_CAPTURE_UI_TEST_RESULT_BUNDLE_PATH: resultBundle,
    },
    stdio: "inherit",
  });
  assert(
    result.status === 0,
    `Compiled Capture coaching-continuity operation failed (exit ${String(result.status)}).`,
  );
  const clientResultBundle = resultBundle.replace(/\.xcresult$/, "-client-work.xcresult");
  const clientResult = spawnSync("bash", [RUNNER], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      QUIPSLY_CAPTURE_UI_TEST_MODE: "coaching-follow-through-work",
      QUIPSLY_CAPTURE_UI_TEST_BASE_URL: baseURL,
      QUIPSLY_CAPTURE_UI_TEST_EMAIL: CLIENT_EMAIL,
      QUIPSLY_CAPTURE_UI_TEST_PASSWORD: clientPassword,
      QUIPSLY_CAPTURE_UI_TEST_SESSION_ID: NEXT_ROOM_ID,
      QUIPSLY_CAPTURE_UI_TEST_SESSION_TITLE: NEXT_ROOM_TITLE,
      QUIPSLY_CAPTURE_UI_TEST_TASK_ID: TASK_ID,
      QUIPSLY_CAPTURE_UI_TEST_GOAL_ID: GOAL_ID,
      QUIPSLY_CAPTURE_UI_TEST_RESULT_BUNDLE_PATH: clientResultBundle,
    },
    stdio: "inherit",
  });
  assert(
    clientResult.status === 0,
    `Compiled Capture follow-through Work operation failed (exit ${String(clientResult.status)}).`,
  );
  console.log(JSON.stringify({
    ok: true,
    localOnly: true,
    retained: true,
    compiledCaptureOperation: true,
    actors: ["coach", "client"],
    nextRoomID: NEXT_ROOM_ID,
    priorRoomID: PRIOR_ROOM_ID,
    authoritativeSessionCount: coachSession.sessionCount,
    authenticatedSessionPrewarm: true,
    exactRetainedSourceInstalled: true,
    resultBundle,
    clientResultBundle,
    passedOperations: 2,
    artifactPreserved: true,
    credentialsPrinted: false,
    externalSideEffects: false,
  }, null, 2));
}

await main();
