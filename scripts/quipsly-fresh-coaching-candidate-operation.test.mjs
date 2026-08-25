#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const subject = await readFile(
  new URL("./quipsly-fresh-coaching-candidate-operation.mjs", import.meta.url),
  "utf8",
);

assert.match(subject, /loadFreshCoachingAcceptanceContext/);
assert.match(subject, /refuses non-loopback PostgreSQL/);
assert.match(subject, /Review and save task/);
assert.match(subject, /\^Done\\s\+\\d\+/);
assert.match(subject, /hiddenDueDateInferred: false/);
assert.match(subject, /transcriptAndSegmentProvenanceRetained: true/);
assert.match(subject, /deliveryEventCreated: false/);
assert.match(subject, /calendarEventCreated: false/);
assert.match(subject, /mode: 0o600/);
assert.match(subject, /secretsPrinted: false/);

console.log(JSON.stringify({ ok: true, assertions: 10 }));
