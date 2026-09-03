import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const scriptURL = new URL("./hgo-quipsly-coaching-handoff-static-smoke.mjs", import.meta.url);

test("coaching handoff smoke does not depend on process.cwd", async () => {
  const source = await readFile(scriptURL, "utf8");
  assert.doesNotMatch(source, /const root = process\.cwd\(\)/);
  assert.match(source, /fileURLToPath\(import\.meta\.url\)/);
});
