#!/usr/bin/env node

import crypto from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

const requireFromQuipsly = createRequire(new URL("../apps/quipsly/package.json", import.meta.url));
const { initializeApp, getApps } = requireFromQuipsly("firebase-admin/app");
const { getAuth } = requireFromQuipsly("firebase-admin/auth");

const PROJECT_ID = "quipsly-reef";
const EMAIL = "quipsly.qa@local.test";
const UID = "native-capture-vault-dogfood-20260719";
const DEFAULT_CREDENTIALS_PATH = path.join(os.tmpdir(), "quipsly-capture-runtime-ui-smoke-credentials.json");

function loopbackHost(value) {
  return value === "localhost" || value === "127.0.0.1" || value === "::1";
}

function requireLoopbackOrigin(value, label) {
  const url = new URL(value);
  if (
    url.protocol !== "http:"
    || !loopbackHost(url.hostname)
    || url.username
    || url.password
    || url.pathname !== "/"
    || url.search
    || url.hash
  ) {
    throw new Error(`${label} must be a credential-free loopback HTTP origin.`);
  }
  return url.origin;
}

function confinedCredentialsPath(value) {
  const temporaryRoot = path.resolve(os.tmpdir());
  const target = path.resolve(value || DEFAULT_CREDENTIALS_PATH);
  const xcodeHostBridgePath = path.resolve("/tmp/quipsly-capture-runtime-ui-smoke-credentials.json");
  if (target === xcodeHostBridgePath) return target;
  const relative = path.relative(temporaryRoot, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Native Capture credential packet must live below the operating-system temporary directory.");
  }
  return target;
}

async function prepare() {
  const emulatorHost = requireLoopbackOrigin(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || ""}`,
    "FIREBASE_AUTH_EMULATOR_HOST",
  );
  const baseURL = requireLoopbackOrigin(
    process.env.QUIPSLY_CAPTURE_UI_TEST_BASE_URL || "http://127.0.0.1:3012",
    "QUIPSLY_CAPTURE_UI_TEST_BASE_URL",
  );
  const sessionID = String(process.env.QUIPSLY_CAPTURE_UI_TEST_SESSION_ID || "").trim();
  const sessionTitle = String(process.env.QUIPSLY_CAPTURE_UI_TEST_SESSION_TITLE || "").trim();
  const taskID = String(process.env.QUIPSLY_CAPTURE_UI_TEST_TASK_ID || "").trim();
  const recurrenceSeriesID = String(process.env.QUIPSLY_CAPTURE_UI_TEST_RECURRENCE_SERIES_ID || "").trim();
  const recurrenceScheduledLocalDate = String(process.env.QUIPSLY_CAPTURE_UI_TEST_RECURRENCE_LOCAL_DATE || "").trim();
  const recurrenceAuthoringTitle = String(process.env.QUIPSLY_CAPTURE_UI_TEST_RECURRENCE_AUTHORING_TITLE || "").trim();
  const recurrenceEditSourceTitle = String(process.env.QUIPSLY_CAPTURE_UI_TEST_RECURRENCE_EDIT_SOURCE_TITLE || "").trim();
  const recurrenceEditFutureTitle = String(process.env.QUIPSLY_CAPTURE_UI_TEST_RECURRENCE_EDIT_FUTURE_TITLE || "").trim();
  const recurrenceEditTimezone = String(process.env.QUIPSLY_CAPTURE_UI_TEST_RECURRENCE_EDIT_TIMEZONE || "").trim();
  const taggedTaskTitle = String(process.env.QUIPSLY_CAPTURE_UI_TEST_TAGGED_TASK_TITLE || "").trim();
  const tagLabel = String(process.env.QUIPSLY_CAPTURE_UI_TEST_TAG_LABEL || "").trim();
  const goalID = String(process.env.QUIPSLY_CAPTURE_UI_TEST_GOAL_ID || "").trim();
  const planBlockID = String(process.env.QUIPSLY_CAPTURE_UI_TEST_PLAN_BLOCK_ID || "").trim();
  if (!sessionID || !sessionTitle) throw new Error("Exact Session ID and title are required for native capture dogfood.");

  if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
  const auth = getAuth();
  const prior = await auth.getUserByEmail(EMAIL).catch((error) => {
    if (error?.code === "auth/user-not-found") return null;
    throw error;
  });
  if (prior) await auth.deleteUser(prior.uid);

  const password = `Qp-${crypto.randomBytes(24).toString("base64url")}!26`;
  await auth.createUser({ uid: UID, email: EMAIL, password, emailVerified: true });

  const credentialsPath = confinedCredentialsPath(process.env.QUIPSLY_CAPTURE_UI_TEST_CREDENTIALS_FILE);
  await writeFile(credentialsPath, JSON.stringify({
    baseURL,
    email: EMAIL,
    password,
    sessionID,
    sessionTitle,
    ...(taskID ? { taskID } : {}),
    ...(recurrenceSeriesID ? { recurrenceSeriesID } : {}),
    ...(recurrenceScheduledLocalDate ? { recurrenceScheduledLocalDate } : {}),
    ...(recurrenceAuthoringTitle ? { recurrenceAuthoringTitle } : {}),
    ...(recurrenceEditSourceTitle ? { recurrenceEditSourceTitle } : {}),
    ...(recurrenceEditFutureTitle ? { recurrenceEditFutureTitle } : {}),
    ...(recurrenceEditTimezone ? { recurrenceEditTimezone } : {}),
    ...(taggedTaskTitle ? { taggedTaskTitle } : {}),
    ...(tagLabel ? { tagLabel } : {}),
    ...(goalID ? { goalID } : {}),
    ...(planBlockID ? { planBlockID } : {}),
  }), { mode: 0o600 });

  return {
    ok: true,
    emulatorOrigin: emulatorHost,
    credentialsPath,
    email: EMAIL,
    uid: UID,
    sessionID,
    sessionTitle,
    secretsPrinted: false,
  };
}

async function cleanup() {
  const credentialsPath = confinedCredentialsPath(process.env.QUIPSLY_CAPTURE_UI_TEST_CREDENTIALS_FILE);
  await unlink(credentialsPath).catch((error) => {
    if (error?.code !== "ENOENT") throw error;
  });
  return { ok: true, credentialsPath, removed: true };
}

const result = process.argv.includes("--cleanup") ? await cleanup() : await prepare();
console.log(JSON.stringify(result, null, 2));
