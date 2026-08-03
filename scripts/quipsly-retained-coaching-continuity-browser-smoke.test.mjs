import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const operation = readFileSync(
  "scripts/quipsly-retained-coaching-continuity-browser-smoke.mjs",
  "utf8",
);

test("continuity operation proves exact protected playback for an authorized coach", () => {
  assert.match(operation, /Range: "bytes=0-43"/);
  assert.match(operation, /playback\.status === 206/);
  assert.match(operation, /contentRange === "bytes 0-43\/1280044"/);
  assert.match(operation, /String\.fromCharCode\(\.\.\.playback\.bytes\.slice\(0, 4\)\) === "RIFF"/);
  assert.match(operation, /String\.fromCharCode\(\.\.\.playback\.bytes\.slice\(8, 12\)\) === "WAVE"/);
});

test("continuity operation distinguishes a collaborating producer from a separate-account outsider", () => {
  assert.match(operation, /role: "outsider"[\s\S]*Quipsly Retained Room Producer|quipsly-followup-outsider-retained/);
  assert.match(operation, /role: "privacy-outsider"/);
  assert.match(operation, /playback\.status !== 200 && playback\.status !== 206 && playback\.bytes\.length === 0/);
  assert.match(operation, /credentialStore === "temporary"[\s\S]*IDENTITIES/);
  assert.match(operation, /separateAccountPrivacyBoundary/);
});

test("temporary four-account operation reads only owner-private credential artifacts", () => {
  assert.match(operation, /!directoryInfo\.isSymbolicLink\(\)/);
  assert.match(operation, /\(directoryInfo\.mode & 0o077\) === 0/);
  assert.match(operation, /!credentialInfo\.isSymbolicLink\(\)/);
  assert.match(operation, /\(credentialInfo\.mode & 0o077\) === 0/);
  assert.doesNotMatch(operation, /console\.log\([^\n]*password/);
});
