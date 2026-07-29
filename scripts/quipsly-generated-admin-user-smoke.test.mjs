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

console.log(
  "PASS: Generated admin smoke forwards Firebase configuration without printing credential material.",
);
