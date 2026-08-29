import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptPath = fileURLToPath(
  new URL("./quipsly-mobile-capture-native-auth-smoke.mjs", import.meta.url),
);
const source = readFileSync(scriptPath, "utf8");

test("JSON evidence reports credential presence without password fragments", () => {
  assert.match(source, /passwordConfigured: Boolean\(password\)/);
  assert.doesNotMatch(source, /password: password \?/);
  assert.doesNotMatch(source, /function redact\(/);
});

test("production native smoke proves private writing continuity with the same account token", () => {
  assert.match(
    source,
    /requestJson\(`\$\{baseUrl\}\/api\/mobile\/capture\/voice-writing`/,
  );
  assert.match(source, /Authorization: `Bearer \$\{idToken\}`/);
  assert.match(source, /payload\?\.schema === "quipsly-mobile-voice-writing-list-v1"/);
  assert.match(source, /Array\.isArray\(payload\?\.drafts\)/);
  assert.match(source, /Array\.isArray\(payload\?\.destinations\)/);
  assert.match(source, /Boolean\(payload\?\.homeProject\?\.slug\)/);
  assert.match(source, /await verifyVoiceWritingContinuity\(signIn\.idToken\)/);
});

test("failed authentication setup never prints the supplied password", () => {
  const secret = "native-smoke-secret-prefix-7wyK9T-secret-suffix";
  const result = spawnSync(
    process.execPath,
    [
      scriptPath,
      "--json",
      "--base-url=http://127.0.0.1:9",
      "--email=smoke@example.invalid",
      `--password=${secret}`,
      "--timeout-ms=250",
    ],
    { encoding: "utf8", timeout: 5_000 },
  );
  const output = `${result.stdout}\n${result.stderr}`;

  assert.notEqual(result.status, 0);
  assert.doesNotMatch(output, new RegExp(secret));
  assert.doesNotMatch(output, /native-smoke-secret-prefix/);
  assert.doesNotMatch(output, /secret-suffix/);
});
