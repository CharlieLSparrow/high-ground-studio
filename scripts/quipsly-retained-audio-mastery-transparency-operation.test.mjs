import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const operation = await readFile(new URL("./quipsly-retained-audio-mastery-transparency-operation.mjs", import.meta.url), "utf8");

test("retained audio-processing operation proves mastery and treatment evidence without mutating source truth", () => {
  assert.match(operation, /Processing change map from/);
  assert.match(operation, /selectedSeconds > 7 && selectedSeconds < 9\.5/);
  assert.match(operation, /masteredAfterPlay\.currentTime > selectedSeconds/);
  assert.match(operation, /sourceAfterSwitch\.currentTime >= masteredAfterPlay\.currentTime - 0\.2/);
  assert.match(operation, /AUDIO_MASTER_REVIEW_INCOMPLETE/);
  assert.match(operation, /Approval became available without complete playback evidence/);
  assert.match(operation, /reviewCountAfter === reviewCountBefore/);
  assert.match(operation, /proveSignedOutReviewDenial/);
  assert.match(operation, /proveOutsiderReviewDenial/);
  assert.match(operation, /Treatment loudness-change map from/);
  assert.match(operation, /treatmentSelectedSeconds > 4 && treatmentSelectedSeconds < 6/);
  assert.match(operation, /treatmentAfterPlay\.currentTime > treatmentSelectedSeconds/);
  assert.match(operation, /treatmentSourceAfterSwitch\.currentTime >= treatmentAfterPlay\.currentTime - 0\.2/);
  assert.match(operation, /after\[0\] === before\[0\] && after\[1\] === before\[1\]/);
  assert.match(operation, /credentialsPrinted: false/);
  assert.match(operation, /externalSideEffects: false/);
});
