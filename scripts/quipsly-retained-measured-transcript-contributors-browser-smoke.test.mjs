import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const operation = await readFile(new URL("./quipsly-retained-measured-transcript-contributors-browser-smoke.mjs", import.meta.url), "utf8");

test("measured transcript contributor operation is local, rendered, and authority preserving", () => {
  assert.match(operation, /requireLoopbackOrigin/);
  assert.match(operation, /requireLocalDatabase/);
  assert.match(operation, /com\.quipsly\.qa\.retained-coaching/);
  assert.match(operation, /Measured transcript error contributors/);
  assert.match(operation, /Missing protected source bytes left measured-review navigation enabled/);
  assert.match(operation, /externalSideEffects: false/);
  assert.doesNotMatch(operation, /method:\s*["'](?:POST|PUT|PATCH|DELETE)/);
  assert.doesNotMatch(operation, /screenshot\s*\(/);
  assert.doesNotMatch(operation, /writeFile|appendFile/);
});
