import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptPath = fileURLToPath(
  new URL("./quipsly-local-doctor.sh", import.meta.url),
);

test("--help is safe outside the repository and does not probe services", () => {
  const result = spawnSync("bash", [scriptPath, "--help"], {
    cwd: "/",
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^Usage: scripts\/dev\/quipsly-local-doctor\.sh/m);
  assert.match(result.stdout, /Show this help without probing services/);
  assert.doesNotMatch(result.stdout, /Quipsly local services/);
  assert.equal(result.stderr, "");
});

test("unknown options fail before probing services", () => {
  const result = spawnSync("bash", [scriptPath, "--unknown"], {
    cwd: "/",
    encoding: "utf8",
  });

  assert.equal(result.status, 64);
  assert.match(result.stderr, /^Unknown option: --unknown/m);
  assert.match(result.stderr, /^Usage: scripts\/dev\/quipsly-local-doctor\.sh/m);
  assert.doesNotMatch(result.stdout, /Quipsly local services/);
});
