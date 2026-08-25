import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("./quipsly-session-recording-share-gcs-fixture.mjs", import.meta.url),
  "utf8",
);

test("recording-share fixture is explicit, synthetic, generation-bound, and self-cleaning", () => {
  assert.match(source, /ALLOW_GCS_FIXTURE/);
  assert.match(source, /media-vault\/recordings\/processor-fixtures/);
  assert.match(source, /media-vault\/derived\/session-recording-share/);
  assert.match(source, /\?generation=\$\{generation\}/);
  assert.match(source, /ifGenerationMatch: 0/);
  assert.match(source, /syntheticMediaOnly: true/);
  assert.match(source, /replayWasCreateOnceNoOp: true/);
  assert.match(source, /objectName\.includes\(jobId\)/);
  assert.doesNotMatch(source, /RecordingAsset|CallRoom|prisma|DATABASE_URL/);
});
