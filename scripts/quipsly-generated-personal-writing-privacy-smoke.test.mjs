import assert from "node:assert/strict";
import test from "node:test";

import {
  assertExcludes,
  assertIncludes,
  homeNestSlug,
  parseArgs,
  parseSessionCookie,
  redactEmail,
} from "./quipsly-generated-personal-writing-privacy-smoke.mjs";

test("parses both separated and equals-form smoke arguments", () => {
  const args = parseArgs([
    "--base-url",
    "https://preview.example",
    "--expected-source-sha=abc123",
    "--output",
    "/private/tmp/receipt.json",
  ]);
  assert.equal(args.get("base-url"), "https://preview.example");
  assert.equal(args.get("expected-source-sha"), "abc123");
  assert.equal(args.get("output"), "/private/tmp/receipt.json");
});

test("extracts only the signed Quipsly session cookie", () => {
  assert.equal(
    parseSessionCookie(
      "session=sealed-value; Path=/; HttpOnly; Secure, other=value; Path=/",
    ),
    "session=sealed-value",
  );
  assert.equal(parseSessionCookie("other=value; Path=/"), "");
});

test("derives a bounded deterministic Home Nest slug and redacts email", () => {
  const email = "codex-writing-privacy-owner-0123456789@dev.test";
  assert.equal(
    homeNestSlug(email),
    "home-codex-writing-privacy-owner-0123456789-at-dev-test",
  );
  assert.deepEqual(redactEmail(email), {
    sha256: "d142e4ea1ad52fb730b7348fb68a6aab4af0f689866f9ddbb4f8326b260532e5",
    domain: "dev.test",
  });
});

test("marker assertions fail closed on missing owner content and collaborator leaks", () => {
  assert.doesNotThrow(() =>
    assertIncludes("private-document private-response", [
      "private-document",
      "private-response",
    ]),
  );
  assert.throws(() =>
    assertIncludes("private-document", [
      "private-document",
      "private-response",
    ]),
  );
  assert.doesNotThrow(() =>
    assertExcludes("shared project only", [
      "private-document",
      "private-response",
    ]),
  );
  assert.throws(() =>
    assertExcludes("shared project private-response", ["private-response"]),
  );
});
