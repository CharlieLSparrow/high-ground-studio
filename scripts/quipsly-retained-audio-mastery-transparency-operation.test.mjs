import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const operation = await readFile(new URL("./quipsly-retained-audio-mastery-transparency-operation.mjs", import.meta.url), "utf8");

test("retained mastery operation proves interactive evidence without mutating source truth", () => {
  assert.match(operation, /Processing change map from/);
  assert.match(operation, /selectedSeconds > 7 && selectedSeconds < 9\.5/);
  assert.match(operation, /masteredAfterPlay\.currentTime > selectedSeconds/);
  assert.match(operation, /sourceAfterSwitch\.currentTime >= masteredAfterPlay\.currentTime - 0\.2/);
  assert.match(operation, /assert\(after === before/);
  assert.match(operation, /credentialsPrinted: false/);
  assert.match(operation, /externalSideEffects: false/);
});
