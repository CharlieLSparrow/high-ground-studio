import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("./quipsly-fresh-coaching-start-operation.mjs", import.meta.url),
  "utf8",
);

test("fresh coaching resolves Firebase Admin from the Nest package", () => {
  assert.match(source, /createRequire/);
  assert.match(source, /\.\.\/apps\/quipsly\/package\.json/);
  assert.match(source, /requireFromNest\("firebase-admin\/app"\)/);
  assert.match(source, /requireFromNest\("firebase-admin\/auth"\)/);
  assert.doesNotMatch(source, /from "firebase-admin\/(?:app|auth)"/);
});
