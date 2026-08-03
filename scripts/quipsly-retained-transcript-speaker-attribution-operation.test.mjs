import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const operation = await readFile(
  new URL("./quipsly-retained-transcript-speaker-attribution-operation.mjs", import.meta.url),
  "utf8",
);

test("retained speaker attribution accepts only local product boundaries and protected credentials", () => {
  assert.match(operation, /requireLoopbackOrigin/);
  assert.match(operation, /requireLocalDatabase/);
  assert.match(operation, /loopbackHost/);
  assert.match(operation, /readRetainedQAPassword/);
  assert.match(operation, /com\.quipsly\.qa\.retained-product/);
  assert.match(operation, /com\.quipsly\.qa\.retained-coaching/);
  assert.match(operation, /credentialsPrinted: false/);
});

test("retained speaker attribution operates rendered playback and proves the separate word-review boundary", () => {
  assert.match(operation, /signInThroughRenderedLogin/);
  assert.match(operation, /Protected session recording/);
  assert.match(operation, /Apply voice identity\|Update voice identity/);
  assert.match(operation, /playbackPosition > 0/);
  assert.match(operation, /providerSegmentSnapshot\(segmentsAfter\) === providerHashBefore/);
  assert.match(operation, /correctionsAfter === before\[0\]/);
  assert.match(operation, /verificationsAfter === before\[1\]/);
  assert.match(operation, /packetNotesUnchanged: true/);
  assert.match(operation, /exactReplay\.body\.idempotentReplay === true/);
  assert.match(operation, /exactReplay\.body\.attribution\?\.id === mutation\.attribution\?\.id/);
  assert.doesNotMatch(operation, /transcriptCorrection\.(?:create|update|delete)/);
  assert.doesNotMatch(operation, /transcriptSegmentVerification\.(?:create|update|delete)/);
});

test("retained speaker attribution proves one active mapping, stale packet hold, and outsider concealment", () => {
  assert.match(operation, /active\.length === 1/);
  assert.match(operation, /TRANSCRIPT_REVIEW_CHANGED/);
  assert.match(operation, /denied\.status === 404/);
  assert.match(operation, /protectedMarkersDisclosed: false/);
  assert.match(operation, /clearRenderedSession/);
  assert.match(operation, /externalSideEffects: false/);
});
