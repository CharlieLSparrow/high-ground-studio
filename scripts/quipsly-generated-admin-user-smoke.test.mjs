#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "scripts/quipsly-generated-admin-user-smoke.mjs"),
  "utf8",
);

assert.match(
  source,
  /QUIPSLY_AUTH_SMOKE_FIREBASE_API_KEY:\s*env\.QUIPSLY_AUTH_SMOKE_FIREBASE_API_KEY\s*\|\|\s*env\.NEXT_PUBLIC_FIREBASE_API_KEY/,
  "the generated identity wrapper must forward the deployed Firebase key to its child auth smoke",
);
assert.match(
  source,
  /Generated password, Firebase token, session cookie, release receipt, and database URL were not printed or persisted/,
  "the generated identity smoke must preserve its no-secret receipt contract",
);
assert.match(
  source,
  /verifiedDatabaseClean/,
  "the generated identity smoke must read back database cleanup",
);
assert.match(
  source,
  /verifiedFirebaseClean/,
  "the generated identity smoke must read back Firebase cleanup",
);
assert.match(
  source,
  /throw new Error\(`Generated admin cleanup failed:/,
  "cleanup failure must fail the generated identity command",
);

console.log(
  "PASS: Generated admin smoke protects credentials and fails closed on unverified cleanup.",
);
