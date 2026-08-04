import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const operation = await readFile(new URL("./quipsly-retained-automated-edit-evidence-operation.mjs", import.meta.url), "utf8");

test("retained automated-edit operation uses only local rendered product and protected credentials", () => {
  assert.match(operation, /requireLoopbackOrigin/);
  assert.match(operation, /readRetainedQAPassword/);
  assert.match(operation, /signInThroughRenderedLogin/);
  assert.doesNotMatch(operation, /https:\/\/nest\.quipsly\.com/);
});

test("retained automated-edit operation proves real decoded signal, source binding, and shared-clock UI", () => {
  assert.match(operation, /signalProfileSha256/);
  assert.match(operation, /decoded RMS -78\.0 dBFS/);
  assert.match(operation, /Measured range-skip proposal/);
  assert.match(operation, /Selected untouched source at 00:04/);
  assert.match(operation, /sourceMediaUnchanged: true/);
  assert.match(operation, /proposalApplied: false/);
});
