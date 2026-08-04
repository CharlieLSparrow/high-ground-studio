import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const operation = await readFile(new URL("./quipsly-retained-studio-frequency-evidence-browser-smoke.mjs", import.meta.url), "utf8");

test("Studio frequency evidence operation is rendered, local, read-only, and source-clock operated", () => {
  assert.match(operation, /requireLoopbackOrigin/);
  assert.match(operation, /com\.quipsly\.qa\.retained-product/);
  assert.match(operation, /Broad-band frequency evidence/);
  assert.match(operation, /Complete-decode broad-band frequency energy/);
  assert.match(operation, /sourceClock\.click/);
  assert.match(operation, /externalSideEffects: false/);
  assert.doesNotMatch(operation, /method:\s*["'](?:POST|PUT|PATCH|DELETE)/);
  assert.doesNotMatch(operation, /screenshot\s*\(/);
  assert.doesNotMatch(operation, /writeFile|appendFile/);
});
