#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const authManagerPath = path.join(root, "apps/mobile-capture/HighGroundCapture/HighGroundCapture/AuthManager.swift");
const loginViewPath = path.join(root, "apps/mobile-capture/HighGroundCapture/HighGroundCapture/LoginView.swift");

function fail(message, details = {}) {
  console.error(JSON.stringify({ ok: false, error: message, ...details }, null, 2));
  process.exit(1);
}

for (const file of [authManagerPath, loginViewPath]) {
  if (!fs.existsSync(file)) fail("Required iOS auth file is missing.", { file });
}

const authManager = fs.readFileSync(authManagerPath, "utf8");
const loginView = fs.readFileSync(loginViewPath, "utf8");
const combined = `${authManager}\n${loginView}`;

const required = [
  "accounts:signInWithPassword",
  "https://securetoken.googleapis.com",
  "/v1/token?key=",
  "/securetoken.googleapis.com",
  "/api/mac/firebase-client-config",
  "/api/mac/session-check",
  "Authorization",
  "Bearer",
  "QuipslyCaptureEmailField",
  "QuipslyCapturePasswordField",
  "QuipslyCaptureSignInButton",
];

for (const needle of required) {
  if (!combined.includes(needle)) fail("Native Firebase auth invariant missing.", { missing: needle });
}

const forbidden = [
  "/api/mac/session-handoff",
  "/api/mac/session-exchange",
  "ASWebAuthenticationSession(",
  "callbackScheme",
];

for (const needle of forbidden) {
  if (combined.includes(needle)) fail("Retired native handoff invariant reintroduced.", { forbidden: needle });
}

const authenticatedDataStart = authManager.indexOf("func authenticatedData(");
const stableOwnerSnapshotStart = authManager.indexOf("func stableOwnerSnapshot()", authenticatedDataStart);
if (authenticatedDataStart < 0 || stableOwnerSnapshotStart < 0) {
  fail("Native authenticated request boundary is missing.");
}
const authenticatedData = authManager.slice(authenticatedDataStart, stableOwnerSnapshotStart);
if (!authenticatedData.includes("guard firstResult.1.statusCode == 401 else")) {
  fail("Native authenticated requests must reserve token refresh for HTTP 401.");
}
if (!authenticatedData.includes("isNetworkAvailabilityError(error)")) {
  fail("Native authenticated requests must distinguish transport failure from feature HTTP failure.");
}
if (/statusCode\s*>=\s*500[\s\S]{0,500}enterProtectedOfflineAccess/.test(authenticatedData)) {
  fail("A reachable feature HTTP 5xx must not eject the entire native app into protected offline access.");
}

console.log(JSON.stringify({
  ok: true,
  checked: [
    path.relative(root, authManagerPath),
    path.relative(root, loginViewPath),
  ],
  invariant: "iOS capture uses Firebase email/password REST sign-in plus Quipsly bearer session-check; only transport failure, not feature HTTP 5xx, enters protected offline access.",
}, null, 2));
