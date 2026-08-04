import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const operation = await readFile(new URL("./quipsly-retained-protected-edit-proof-operation.mjs", import.meta.url), "utf8");

test("protected edit proof operates retained local product and exact Episode 4 media", () => {
  assert.match(operation, /requireLoopbackOrigin/);
  assert.match(operation, /local-transcript-asset-episode-4/);
  assert.match(operation, /local-transcript-source-episode-4/);
  assert.match(operation, /Protected automated edit source/);
  assert.match(operation, /PROOF_LISTENED/);
});

test("protected edit proof requires binding continuity and leaves the proposal unapplied", () => {
  assert.match(operation, /protectedPlaybackSourceId === SOURCE_ID/);
  assert.match(operation, /receiptBody\.receipt\.sourceSha256 === visualization\.sourceSha256/);
  assert.match(operation, /receiptBody\.receipt\.signalProfileSha256 === visualization\.signalProfileSha256/);
  assert.match(operation, /proposalApplied: false/);
  assert.match(operation, /sourceMediaUnchanged: true/);
});
