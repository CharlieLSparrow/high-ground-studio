import assert from "node:assert/strict";
import test from "node:test";

import { loadPlaywright, requireLoopbackOrigin } from "./retained-qa-browser.mjs";

test("rendered QA loads the workspace-declared Playwright package", async () => {
  const playwright = await loadPlaywright();
  assert.equal(typeof playwright.chromium?.launch, "function");
});

test("rendered QA accepts only credential-free loopback origins", () => {
  assert.equal(requireLoopbackOrigin("http://127.0.0.1:3022", "test"), "http://127.0.0.1:3022");
  assert.throws(() => requireLoopbackOrigin("https://example.com", "test"));
  assert.throws(() => requireLoopbackOrigin("http://user:secret@127.0.0.1:3022", "test"));
});
