#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { lstat, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";

const requireFromQuipsly = createRequire(
  new URL("../apps/quipsly/package.json", import.meta.url),
);
const { deleteApp, initializeApp, getApps } =
  requireFromQuipsly("firebase-admin/app");
const { getAuth } = requireFromQuipsly("firebase-admin/auth");

const PROJECT_ID = "quipsly-reef";
const KEYCHAIN_SERVICE = "com.quipsly.qa.retained-coaching";
const IDENTITIES = [
  {
    role: "coach",
    uid: "quipsly-coach-retained-20260731",
    email: "quipsly-coach-retained-20260731@example.test",
    name: "Quipsly Retained Coach",
  },
  {
    role: "client",
    uid: "quipsly-client-retained-20260731",
    email: "quipsly-client-retained-20260731@example.test",
    name: "Quipsly Retained Client",
  },
  {
    role: "outsider",
    uid: "quipsly-followup-outsider-retained-20260731",
    email: "quipsly-followup-outsider-retained-20260731@example.test",
    name: "Quipsly Retained Room Producer",
  },
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function requireLoopbackAuthEmulator(value) {
  const url = new URL(`http://${String(value || "")}`);
  assert(
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      Boolean(url.port) &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash,
    "Retained coaching auth seed requires an explicit loopback Firebase Auth emulator.",
  );
  return url.host;
}

async function upsertUser(auth, identity, password) {
  const current = await auth.getUser(identity.uid).catch((error) => {
    if (error?.code === "auth/user-not-found") return null;
    throw error;
  });
  const fields = {
    email: identity.email,
    password,
    displayName: identity.name,
    emailVerified: true,
    disabled: false,
  };
  if (current) await auth.updateUser(identity.uid, fields);
  else await auth.createUser({ uid: identity.uid, ...fields });
}

function credentialStore() {
  const store = String(
    process.env.QUIPSLY_RETAINED_COACHING_CREDENTIAL_STORE || "temporary",
  )
    .trim()
    .toLowerCase();
  assert(
    store === "temporary" || store === "keychain",
    "Credential store must be temporary or keychain.",
  );
  return store;
}

function temporaryCredentialDirectory() {
  const configured = String(
    process.env.QUIPSLY_RETAINED_COACHING_CREDENTIAL_DIRECTORY || "",
  ).trim();
  assert(
    configured,
    "Temporary retained credential directory must be explicitly configured.",
  );
  const directory = path.resolve(configured);
  assert(
    path.isAbsolute(directory),
    "Temporary retained credential directory must be absolute.",
  );
  return directory;
}

async function assertPrivateCredentialDirectory(directory) {
  await mkdir(directory, { recursive: false, mode: 0o700 }).catch((error) => {
    if (error?.code !== "EEXIST") throw error;
  });
  const info = await lstat(directory);
  assert(
    info.isDirectory() &&
      !info.isSymbolicLink() &&
      info.uid === process.getuid?.() &&
      (info.mode & 0o077) === 0,
    "Temporary retained credential directory must be an owner-only, non-symlink directory.",
  );
}

function generatedPassword() {
  return `Qp-${randomBytes(24).toString("base64url")}!26`;
}

export async function main() {
  requireLoopbackAuthEmulator(process.env.FIREBASE_AUTH_EMULATOR_HOST);
  const app = getApps()[0] || initializeApp({ projectId: PROJECT_ID });
  const auth = getAuth(app);
  const store = credentialStore();
  const credentialDirectory =
    store === "temporary" ? temporaryCredentialDirectory() : null;
  if (credentialDirectory)
    await assertPrivateCredentialDirectory(credentialDirectory);
  try {
    for (const identity of IDENTITIES) {
      const password =
        store === "keychain"
          ? readRetainedQAPassword({
              service: KEYCHAIN_SERVICE,
              account: identity.email,
            })
          : generatedPassword();
      assert(
        password,
        `The retained ${identity.email} Keychain password is unavailable.`,
      );
      await upsertUser(auth, identity, password);
      if (credentialDirectory) {
        await writeFile(
          path.join(credentialDirectory, `${identity.role}.json`),
          `${JSON.stringify({ email: identity.email, password })}\n`,
          { mode: 0o600, flag: "wx" },
        );
      }
    }
  } finally {
    await deleteApp(app);
  }
  const result = {
    ok: true,
    localOnly: true,
    projectId: PROJECT_ID,
    identitiesRestored: IDENTITIES.length,
    credentialStore: store,
    credentialDirectory,
    databaseMutated: false,
    secretsPrinted: false,
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  await main();
}
