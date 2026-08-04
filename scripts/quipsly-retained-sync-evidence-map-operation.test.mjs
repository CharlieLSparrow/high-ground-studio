import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const operation = await readFile(new URL("./quipsly-retained-sync-evidence-map-operation.mjs", import.meta.url), "utf8");

test("sync evidence map operates retained decoded evidence through rendered product", () => {
  assert.match(operation, /local-transcript-asset-episode-4/);
  assert.match(operation, /Unmeasured sync target\.wav/);
  assert.match(operation, /Source sync evidence map/);
  assert.match(operation, /Target decoded waveform not attached/);
});

test("sync evidence operation measures visibility without inventing approval", () => {
  assert.match(operation, /500\.000 ppm/);
  assert.match(operation, /targetWaveformTruth: "missing-visible"/);
  assert.match(operation, /reviewReceiptSaved: false/);
  assert.match(operation, /sourceMediaUnchanged: true/);
  assert.match(operation, /Approve this reversible placement/);
});
