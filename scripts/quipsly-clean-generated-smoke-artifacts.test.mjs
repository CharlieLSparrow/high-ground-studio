import assert from "node:assert/strict";
import test from "node:test";

import {
  isGeneratedSmokeEmail,
  redactEmailList,
} from "./quipsly-clean-generated-smoke-artifacts.mjs";

test("accepts every exact disposable smoke identity family", () => {
  for (const family of [
    "invite",
    "signup",
    "admin",
    "native",
    "mobile-capture",
  ]) {
    assert.equal(
      isGeneratedSmokeEmail(`codex-${family}-0123abcd@dev.test`),
      true,
      family,
    );
  }
});

test("refuses real users and near-match cleanup targets", () => {
  for (const email of [
    "shomers@gmail.com",
    "codex-mobile-capture-0123abcd@example.com",
    "codex-mobile-capture-0123abc@dev.test",
    "codex-mobile-capture-0123abcde@dev.test",
    "prefix-codex-mobile-capture-0123abcd@dev.test",
  ]) {
    assert.equal(isGeneratedSmokeEmail(email), false, email);
  }
});

test("redacts the random suffix without changing the identity family", () => {
  assert.deepEqual(
    redactEmailList([
      "codex-mobile-capture-0123abcd@dev.test",
      "codex-native-fedcba98@dev.test",
    ]),
    [
      "codex-mobile-capture-0123****@dev.test",
      "codex-native-fedc****@dev.test",
    ],
  );
});
