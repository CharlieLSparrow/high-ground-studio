import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(new URL("./quipsly-retained-browser-source-operation.mjs", import.meta.url));

for (const [name, env, expected] of [
  ["explicit regression opt-in", { QUIPSLY_RETAINED_BROWSER_SOURCE_OPERATION: "0" }, /authorize this retained local-media regression/],
  ["a synthetic account", { QUIPSLY_BROWSER_SOURCE_QA_EMAIL: "person@example.com" }, /synthetic \.test account/],
  ["a local auth emulator", { FIREBASE_AUTH_EMULATOR_HOST: "auth.example.test:9099" }, /loopback HTTP origin/],
  ["a local database", { QUIPSLY_LOCAL_DATABASE_URL: "postgresql://test:test@db.example.test:5432/test" }, /loopback database/],
]) {
  test(`browser speech rehearsal requires ${name} before fixture or account mutations`, () => {
    const result = spawnSync(process.execPath, [script], {
      encoding: "utf8", timeout: 10_000,
      env: {
        ...process.env,
        QUIPSLY_RETAINED_BROWSER_SOURCE_OPERATION: "1",
        QUIPSLY_BROWSER_SOURCE_QA_EMAIL: "synthetic@example.test",
        QUIPSLY_LOCAL_BASE_URL: "http://127.0.0.1:1",
        FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:1",
        QUIPSLY_LOCAL_DATABASE_URL: "postgresql://test:test@127.0.0.1:1/test",
        ...env,
      },
    });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, expected);
    assert.doesNotMatch(result.stderr, /ECONNREFUSED|auth\/user-not-found|spawnSync say/);
  });
}
