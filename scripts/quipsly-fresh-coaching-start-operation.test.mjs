import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sources = await Promise.all(
  [
    "quipsly-fresh-coaching-start-operation.mjs",
    "quipsly-fresh-coaching-form-automation-operation.mjs",
    "quipsly-fresh-coaching-phone-start-operation.mjs",
  ].map(async (filename) => ({
    filename,
    source: await readFile(new URL(`./${filename}`, import.meta.url), "utf8"),
  })),
);

test("fresh coaching operations resolve Firebase Admin from the Nest package", () => {
  for (const { filename, source } of sources) {
    assert.match(source, /createRequire/, filename);
    assert.match(source, /\.\.\/apps\/quipsly\/package\.json/, filename);
    assert.match(source, /requireFromNest\("firebase-admin\/app"\)/, filename);
    assert.match(source, /requireFromNest\("firebase-admin\/auth"\)/, filename);
    assert.doesNotMatch(
      source,
      /from "firebase-admin\/(?:app|auth)"/,
      filename,
    );
  }
});
