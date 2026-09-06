#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const subject = await readFile(
  new URL("./quipsly-local-recording-share-operation.mjs", import.meta.url),
  "utf8",
);

assert.match(subject, /captureGroupId: true/);
assert.match(subject, /manifest\.captureGroupId \|\| recordingSync\.captureGroupId/);
assert.match(subject, /=== room\.captureGroupId/);
assert.match(subject, /Rendered editor crossed recording-session boundaries/);
assert.match(subject, /captureGroupId: room\.captureGroupId/);
assert.doesNotMatch(subject, /Available: \$\{JSON\.stringify\(preparationSnapshot\?\.available\)\}/);

console.log(JSON.stringify({
  ok: true,
  assertions: 6,
  editJourneyIsCaptureGroupBound: true,
  failureOutputIsCompact: true,
}));
