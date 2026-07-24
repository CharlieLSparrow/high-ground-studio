#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function assertIncludes(text, needle, label) {
  if (!text.includes(needle)) {
    throw new Error(`${label} is missing required marker: ${needle}`);
  }
}

function assertNotIncludes(text, needle, label) {
  if (text.includes(needle)) {
    throw new Error(`${label} contains retired marker: ${needle}`);
  }
}

const pagePath = "apps/quipsly/src/app/(app)/admin/users/page.tsx";
const actionsPath = "apps/quipsly/src/app/(app)/admin/users/actions.ts";
const browserSmokePath = "scripts/quipsly-admin-user-management-browser-smoke.mjs";

const page = read(pagePath);
const actions = read(actionsPath);
const browserSmoke = read(browserSmokePath);

[
  "Capture reviewer setup",
  "reviewer-capture@dev.test",
  "Create capture reviewer login",
  'name="firebasePassword"',
  "Firebase email/password",
  "free starter/Home Nest",
  'defaultValue="CLIENT"',
].forEach((marker) => assertIncludes(page, marker, pagePath));

[
  "upsertFirebasePasswordUser",
  "adminAuth.getUserByEmail",
  "adminAuth.updateUser",
  "adminAuth.createUser",
  "emailVerified: true",
  "ensureQuipslyStarterStateForUser",
  'params.set("firebaseLogin"',
  'params.set("starter", "ready")',
].forEach((marker) => assertIncludes(actions, marker, actionsPath));

[
  'input[name="firebasePassword"]',
  "verifyManagedTarget",
  "Generated target user is missing Firebase UID",
  "Generated target user is missing active free-tier membership",
].forEach((marker) => assertIncludes(browserSmoke, marker, browserSmokePath));

[
  "session-handoff",
  "session-exchange",
  "ASWebAuthenticationSession",
].forEach((marker) => assertNotIncludes(page, marker, pagePath));

process.stdout.write(JSON.stringify({
  ok: true,
  checked: [pagePath, actionsPath, browserSmokePath],
  invariant: "Admin user management can deliberately prepare Firebase email/password reviewer/operator users while Quipsly owns roles, free tier, and Home Nest state.",
}, null, 2));
process.stdout.write("\n");
