#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const reconciler = fs.readFileSync(
  path.join(repoRoot, "scripts/quipsly-reconcile-firebase-email-alias.mjs"),
  "utf8",
);
const liveWrapper = fs.readFileSync(
  path.join(repoRoot, "scripts/quipsly-live-firebase-email-alias-reconcile.sh"),
  "utf8",
);

assert.match(
  reconciler,
  /apply:\s*false/,
  "reconciliation must default to dry-run",
);
assert.match(
  reconciler,
  /aliasProviders\.length !== 1/,
  "reconciliation must reject a multi-provider alias credential",
);
assert.match(
  reconciler,
  /aliasProviders\[0\] !== "password"/,
  "reconciliation must accept only a password-only stale alias credential",
);
assert.match(
  reconciler,
  /aliasIdentityBindings > 0 \|\| aliasLegacyBindings > 0/,
  "reconciliation must fail closed when the alias UID already owns app identity",
);
assert.match(
  reconciler,
  /auth\.updateUser\(state\.aliasFirebase\.uid, \{ emailVerified: true \}\)/,
  "apply must preserve the credential and change only its verification flag",
);
assert.match(
  reconciler,
  /identity\.firebase_email_alias_verified_v1/,
  "apply must create an app-owned audit event",
);
assert.match(
  reconciler,
  /destructiveCredentialChange:\s*false/,
  "the operator receipt must state that credential deletion did not occur",
);
assert.doesNotMatch(
  reconciler,
  /\.deleteUser\(/,
  "the alias reconciliation tool must never delete a Firebase credential",
);
assert.match(
  liveWrapper,
  /dry-run-only unless --apply is explicitly included/,
  "the production wrapper must tell the operator that apply is explicit",
);
assert.match(
  liveWrapper,
  /Database URLs, access tokens, Firebase UIDs, passwords, and credential material are not printed/,
  "the wrapper must publish its secret-suppression boundary",
);

console.log(
  "PASS: Firebase alias reconciliation is dry-run-first, identity-ledger-gated, non-destructive, audited, and secret-suppressing.",
);
