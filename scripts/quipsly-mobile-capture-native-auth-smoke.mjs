#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_BASE_URL = "https://nest.quipsly.com";
const DEFAULT_TIMEOUT_MS = 15_000;

const args = new Map(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, ...rawValue] = arg.slice(2).split("=");
      return [key, rawValue.length ? rawValue.join("=") : "1"];
    }),
);

const jsonOutput = args.get("json") === "1";
const baseUrl = normalizeBaseUrl(
  args.get("base-url") ||
    process.env.QUIPSLY_MOBILE_CAPTURE_AUTH_BASE_URL ||
    process.env.QUIPSLY_MOBILE_CAPTURE_BASE_URL ||
    process.env.QUIPSLY_AUTH_SMOKE_BASE_URL ||
    process.env.NEXT_PUBLIC_NEST_BASE_URL ||
    DEFAULT_BASE_URL,
);
const email = clean(
  args.get("email") ||
    process.env.QUIPSLY_MOBILE_CAPTURE_AUTH_EMAIL ||
    process.env.QUIPSLY_AUTH_SMOKE_EMAIL,
).toLowerCase();
const password = resolveSecret({
  direct:
    args.get("password") ||
    process.env.QUIPSLY_MOBILE_CAPTURE_AUTH_PASSWORD ||
    process.env.QUIPSLY_AUTH_SMOKE_PASSWORD ||
    "",
  file:
    args.get("password-file") ||
    process.env.QUIPSLY_MOBILE_CAPTURE_AUTH_PASSWORD_FILE ||
    process.env.QUIPSLY_AUTH_SMOKE_PASSWORD_FILE ||
    "",
  keychainService:
    args.get("password-keychain-service") ||
    process.env.QUIPSLY_MOBILE_CAPTURE_AUTH_PASSWORD_KEYCHAIN_SERVICE ||
    process.env.QUIPSLY_AUTH_SMOKE_PASSWORD_KEYCHAIN_SERVICE ||
    "",
  keychainAccount:
    args.get("password-keychain-account") ||
    process.env.QUIPSLY_MOBILE_CAPTURE_AUTH_PASSWORD_KEYCHAIN_ACCOUNT ||
    process.env.QUIPSLY_AUTH_SMOKE_PASSWORD_KEYCHAIN_ACCOUNT ||
    email,
});
const timeoutMs = Number.parseInt(args.get("timeout-ms") || process.env.QUIPSLY_MOBILE_CAPTURE_AUTH_TIMEOUT_MS || String(DEFAULT_TIMEOUT_MS), 10) || DEFAULT_TIMEOUT_MS;
const checks = [];

function clean(value) {
  return String(value || "").trim();
}

function normalizeBaseUrl(value) {
  return clean(value).replace(/\/+$/, "");
}

function readSecretFile(filePath) {
  const normalized = clean(filePath);
  if (!normalized) return "";
  if (!existsSync(normalized)) {
    throw new Error(`Password file does not exist: ${normalized}`);
  }
  return clean(readFileSync(normalized, "utf8"));
}

function readKeychainSecret(service, account) {
  const normalizedService = clean(service);
  const normalizedAccount = clean(account);
  if (!normalizedService || !normalizedAccount) return "";
  const result = spawnSync("security", [
    "find-generic-password",
    "-s",
    normalizedService,
    "-a",
    normalizedAccount,
    "-w",
  ], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`Could not read password from macOS Keychain service ${normalizedService} for ${normalizedAccount}.`);
  }
  return clean(result.stdout);
}

function resolveSecret({ direct, file, keychainService, keychainAccount }) {
  const fromFile = readSecretFile(file);
  if (fromFile) return fromFile;
  const fromKeychain = readKeychainSecret(keychainService, keychainAccount);
  if (fromKeychain) return fromKeychain;
  return clean(direct);
}

function addCheck(name, status, summary, details = undefined) {
  checks.push({ name, status, summary, details });
}

function expect(condition, name, summary, details) {
  addCheck(name, condition ? "pass" : "fail", summary, details);
  return condition;
}

function parseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function requestJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });
    const raw = await response.text();
    return {
      ok: true,
      status: response.status,
      contentType: response.headers.get("content-type") || "",
      raw,
      json: parseJson(raw),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      contentType: "",
      raw: "",
      json: null,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchFirebaseConfig() {
  const result = await requestJson(`${baseUrl}/api/mac/firebase-client-config`);
  const firebase = result.json?.firebase;
  expect(
    result.ok && result.status === 200 && result.json?.ok === true && typeof firebase?.apiKey === "string" && firebase.apiKey,
    "firebaseClientConfigAvailable",
    "Nest exposes public Firebase client config for native email/password sign-in.",
    { status: result.status, ok: result.json?.ok === true, missing: result.json?.missing || null },
  );
  if (!(result.ok && result.status === 200 && result.json?.ok === true && firebase?.apiKey)) {
    throw new Error("Firebase client config is unavailable from Nest.");
  }
  return firebase;
}

async function signInWithFirebase(apiKey) {
  const result = await requestJson(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  expect(
    result.ok && result.status === 200 && typeof result.json?.idToken === "string" && typeof result.json?.refreshToken === "string",
    "firebasePasswordSignIn",
    "Firebase accepted reviewer/native email-password credentials and returned refreshable tokens.",
    { status: result.status, email, error: result.json?.error?.message || null },
  );
  if (!(result.ok && result.status === 200 && result.json?.idToken)) {
    throw new Error(`Firebase sign-in failed for ${email}.`);
  }
  return result.json;
}

async function verifyNativeSession(idToken) {
  const result = await requestJson(`${baseUrl}/api/mac/session-check`, {
    method: "GET",
    headers: { Authorization: `Bearer ${idToken}` },
  });
  expect(
    result.ok && result.status === 200 && (result.json?.ok === true || result.json?.authenticated === true),
    "nativeSessionCheck",
    "Quipsly verifies the Firebase bearer token through the native session-check route.",
    { status: result.status, authenticated: result.json?.authenticated, error: result.json?.error || null },
  );
  expect(
    clean(result.json?.user?.primaryEmail || result.json?.user?.email).toLowerCase() === email,
    "nativeSessionEmailMatches",
    "Native session-check returns the same reviewer/user email.",
    { expectedEmail: email, actualEmail: result.json?.user?.primaryEmail || result.json?.user?.email || null },
  );
  expect(
    Boolean(result.json?.homeNest?.slug || result.json?.onboarding?.homeNestSlug),
    "nativeSessionHomeNest",
    "Native session-check exposes Home Nest/free-account onboarding evidence.",
    { homeNestSlug: result.json?.homeNest?.slug || result.json?.onboarding?.homeNestSlug || null },
  );
  if (!(result.ok && result.status === 200 && (result.json?.ok === true || result.json?.authenticated === true))) {
    throw new Error("Quipsly native session-check rejected the Firebase bearer token.");
  }
  return result.json;
}

function runContractSmoke(idToken) {
  const result = spawnSync(process.execPath, ["scripts/quipsly-mobile-capture-contract-smoke.mjs", `--base-url=${baseUrl}`, "--json"], {
    cwd: ROOT_DIR,
    encoding: "utf8",
    env: {
      ...process.env,
      QUIPSLY_MOBILE_CAPTURE_BEARER_TOKEN: idToken,
      QUIPSLY_NATIVE_ACCESS_TOKEN: idToken,
    },
  });
  const report = parseJson(result.stdout || "");
  expect(
    result.status === 0 && report?.ok === true && report?.authenticated === true,
    "authenticatedMobileCaptureContract",
    "Mobile capture contract smoke passes with the same Firebase bearer token used by the native app.",
    {
      exitCode: result.status,
      authenticated: report?.authenticated,
      statusCounts: report?.statusCounts || null,
      stderr: result.stderr?.slice(0, 600) || "",
    },
  );

  if (report?.checks) {
    const byName = new Map(report.checks.map((check) => [check.name, check]));
    for (const required of [
      "authenticatedSessionsReachable",
      "authenticatedSessionsVisible",
      "authenticatedSessionLifecyclePresent",
      "authenticatedSessionLifecycleKind",
      "authenticatedSessionLifecycleNextAction",
    ]) {
      const check = byName.get(required);
      expect(
        check?.status === "pass",
        required,
        `Authenticated mobile capture contract includes ${required}.`,
        check?.details || null,
      );
    }
  }

  return report || { ok: false, stdout: result.stdout, stderr: result.stderr };
}

async function main() {
  expect(Boolean(email), "reviewerEmailConfigured", "Reviewer/native auth email is configured.", { env: "QUIPSLY_MOBILE_CAPTURE_AUTH_EMAIL or QUIPSLY_AUTH_SMOKE_EMAIL" });
  expect(Boolean(password), "reviewerPasswordConfigured", "Reviewer/native auth password is configured without printing it.", { configured: Boolean(password) });

  let contractReport = null;
  if (email && password) {
    const firebase = await fetchFirebaseConfig();
    const signIn = await signInWithFirebase(firebase.apiKey);
    await verifyNativeSession(signIn.idToken);
    contractReport = runContractSmoke(signIn.idToken);
  }

  const failed = checks.filter((check) => check.status === "fail");
  const report = {
    ok: failed.length === 0,
    baseUrl,
    email,
    passwordConfigured: Boolean(password),
    authenticatedContractReport: contractReport
      ? {
          ok: contractReport.ok === true,
          authenticated: contractReport.authenticated === true,
          statusCounts: contractReport.statusCounts || null,
        }
      : null,
    checks,
  };

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Quipsly mobile capture native-auth smoke: ${report.ok ? "PASS" : "FAIL"}`);
    console.log(`Base URL: ${baseUrl}`);
    console.log(`Email: ${email || "not configured"}`);
    for (const check of checks) {
      console.log(`${check.status === "pass" ? "PASS" : "FAIL"} ${check.name}: ${check.summary}`);
      if (check.status !== "pass" && check.details) console.log(`  ${JSON.stringify(check.details)}`);
    }
  }

  if (!report.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
