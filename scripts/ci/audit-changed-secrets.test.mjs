#!/usr/bin/env node

import assert from "node:assert/strict";
import test from "node:test";

import { scanAddedSecretPatterns } from "./audit-changed-secrets.mjs";

function diffWithAddedLine(value) {
  return [
    "diff --git a/example.txt b/example.txt",
    "--- a/example.txt",
    "+++ b/example.txt",
    "@@ -0,0 +7 @@",
    `+${value}`,
  ].join("\n");
}

test("detects a GitHub token without returning the secret value", () => {
  const token = "ghp_" + "a".repeat(36);
  const findings = scanAddedSecretPatterns(diffWithAddedLine(`TOKEN=${token}`));

  assert.deepEqual(findings, [{
    filePath: "example.txt",
    line: 7,
    kind: "GitHub token",
  }]);
  assert.equal(JSON.stringify(findings).includes(token), false);
});

test("detects private-key material", () => {
  const marker = ["-----BEGIN", "PRIVATE KEY-----"].join(" ");
  const findings = scanAddedSecretPatterns(diffWithAddedLine(marker));

  assert.equal(findings[0]?.kind, "private key");
});

test("ignores environment variable names without values", () => {
  const findings = scanAddedSecretPatterns(
    diffWithAddedLine("APP_STORE_CONNECT_API_KEY_PATH=/safe/local/path"),
  );

  assert.deepEqual(findings, []);
});

test("ignores removed secret-like lines", () => {
  const token = "sk-" + "b".repeat(30);
  const diff = [
    "diff --git a/example.txt b/example.txt",
    "--- a/example.txt",
    "+++ b/example.txt",
    "@@ -4 +4,0 @@",
    `-${token}`,
  ].join("\n");

  assert.deepEqual(scanAddedSecretPatterns(diff), []);
});
