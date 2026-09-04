#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const subject = await readFile(
  new URL("./quipsly-fresh-transcript-follow-through-operation.mjs", import.meta.url),
  "utf8",
);

assert.match(subject, /loadFreshCoachingAcceptanceContext/);
assert.match(subject, /requireCurrentLocalNestSource/);
assert.match(subject, /refuses a non-loopback Nest origin/);
assert.match(subject, /refuses non-loopback PostgreSQL/);
assert.match(subject, /Promise\.all\(\[/);
assert.match(subject, /duplicated the shared recap/);
assert.match(subject, /duplicated shared highlights/);
assert.match(subject, /Automatic follow-through created or changed canonical tasks/);
assert.match(subject, /scheduler rebuilding/);
assert.match(subject, /candidateOnly: false/);
assert.match(subject, /automaticAssignment: true/);
assert.match(subject, /automaticSharing: true/);
assert.match(subject, /externalSideEffects: false/);
assert.match(subject, /mode: 0o600/);
assert.match(subject, /secretsPrinted: false/);

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
assert.match(packageJson.scripts["quipsly:fresh:transcript-follow-through"], /register-ts-extension-loader/);
assert.match(packageJson.scripts["quipsly:fresh:transcript-follow-through"], /--experimental-transform-types/);
assert.doesNotMatch(packageJson.scripts["quipsly:fresh:transcript-follow-through"], /--import tsx/);

console.log(JSON.stringify({ ok: true, assertions: 18 }));
