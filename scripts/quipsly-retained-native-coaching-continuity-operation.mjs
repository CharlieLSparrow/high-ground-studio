#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";

const REPO_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const RUNNER = path.join(
  REPO_ROOT,
  "apps/mobile-capture/HighGroundCapture/scripts/run-capture-runtime-ui-smoke.sh",
);
const KEYCHAIN_SERVICE = "com.quipsly.qa.retained-coaching";
const COACH_EMAIL = "quipsly-coach-retained-20260731@example.test";
const NEXT_ROOM_ID = "qa-retained-coaching-next-session-20260807";
const NEXT_ROOM_TITLE = "QA Retained · Coaching continuity Session 2";
const PRIOR_ROOM_ID = "retained-coaching-follow-up-20260731";

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
    "Retained coach could not authenticate with the local Firebase emulator.",
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
  return sessionsBody.sessions.length;
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
  const authoritativeSessionCount = await verifyAndWarmCanonicalSession({
    baseURL,
    email: COACH_EMAIL,
    password,
  });
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
      QUIPSLY_CAPTURE_UI_TEST_RESULT_BUNDLE_PATH: resultBundle,
    },
    stdio: "inherit",
  });
  assert(
    result.status === 0,
    `Compiled Capture coaching-continuity operation failed (exit ${String(result.status)}).`,
  );
  console.log(JSON.stringify({
    ok: true,
    localOnly: true,
    retained: true,
    compiledCaptureOperation: true,
    actor: "coach",
    nextRoomID: NEXT_ROOM_ID,
    priorRoomID: PRIOR_ROOM_ID,
    authoritativeSessionCount,
    authenticatedSessionPrewarm: true,
    resultBundle,
    artifactPreserved: true,
    credentialsPrinted: false,
    externalSideEffects: false,
  }, null, 2));
}

await main();
