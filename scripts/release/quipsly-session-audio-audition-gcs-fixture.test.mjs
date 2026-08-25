import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("./quipsly-session-audio-audition-gcs-fixture.mjs", import.meta.url),
  "utf8",
);
test("audition fixture is opt-in, synthetic, generation-bound, and self-cleaning", () => {
  assert.match(source, /ALLOW_GCS_FIXTURE/);
  assert.match(source, /testsrc2=size=1280x720:rate=24:duration=8/);
  assert.match(source, /media-vault\/recordings\/processor-fixtures/);
  assert.match(source, /buildSessionAudioAuditionTargetObjectName/);
  assert.match(source, /\{ generation: sourceGeneration \}/);
  assert.match(source, /ifGenerationMatch: 0/);
  assert.match(source, /syntheticMediaOnly: true/);
  assert.match(source, /replayWasCreateOnceNoOp: true/);
  assert.match(source, /objectName\.includes\(jobId\)/);
  assert.doesNotMatch(source, /prisma|DATABASE_URL|CallRoom/);
});
