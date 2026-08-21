import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  boundedDistinctCoachCount,
  loopbackOrigin,
} from "./quipsly-local-distinct-coach-capacity.mjs";

test("distinct coach capacity has an explicit staged ceiling", () => {
  assert.equal(boundedDistinctCoachCount(undefined), 2);
  assert.equal(boundedDistinctCoachCount("10"), 10);
  assert.equal(boundedDistinctCoachCount("50"), 50);
  assert.throws(() => boundedDistinctCoachCount("0"));
  assert.throws(() => boundedDistinctCoachCount("51"));
});

test("distinct coach capacity cannot target production", () => {
  assert.equal(loopbackOrigin("127.0.0.1:3012", "test"), "http://127.0.0.1:3012");
  assert.throws(() => loopbackOrigin("https://nest.quipsly.com", "test"));
  assert.throws(() => loopbackOrigin("http://example.com", "test"));
});

test("a generated Firebase identity is cleanup-owned before session setup can fail", async () => {
  const source = await readFile(new URL("./quipsly-local-distinct-coach-capacity.mjs", import.meta.url), "utf8");
  const createIndex = source.indexOf("const firebaseUser = await auth.createUser");
  const registerIndex = source.indexOf("registerForCleanup(coach)");
  const signInIndex = source.indexOf("const token = await signIn");
  assert(createIndex >= 0 && registerIndex > createIndex && signInIndex > registerIndex);
  assert.match(source, /finally \{\s+cleanup = await cleanupGeneratedBatch\(prisma, auth, coaches\)/);
});
