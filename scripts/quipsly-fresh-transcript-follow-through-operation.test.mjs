#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const subject = await readFile(
  new URL("./quipsly-fresh-transcript-follow-through-operation.mjs", import.meta.url),
  "utf8",
);

assert.match(subject, /loadFreshCoachingAcceptanceContext/);
assert.match(subject, /requires a clean tracked worktree/);
assert.match(subject, /refuses a non-loopback Nest origin/);
assert.match(subject, /refuses non-loopback PostgreSQL/);
assert.match(subject, /Promise\.all\(\[/);
assert.match(subject, /duplicated the packet summary/);
assert.match(subject, /duplicated packet highlights/);
assert.match(subject, /Automatic follow-through created or changed canonical tasks/);
assert.match(subject, /scheduler rebuilding/);
assert.match(subject, /candidateOnly: true/);
assert.match(subject, /automaticAssignment: false/);
assert.match(subject, /automaticSharing: false/);
assert.match(subject, /externalSideEffects: false/);
assert.match(subject, /mode: 0o600/);
assert.match(subject, /secretsPrinted: false/);

console.log(JSON.stringify({ ok: true, assertions: 15 }));
