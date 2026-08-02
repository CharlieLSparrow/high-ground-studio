import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const helper = fileURLToPath(new URL("./quipsly-latest-successful-build.mjs", import.meta.url));

function select(builds, imageName = "studio") {
  return execFileSync(process.execPath, [helper, imageName], {
    cwd: repoRoot,
    encoding: "utf8",
    input: JSON.stringify(builds),
  });
}

test("selects the newest exact successful build for the requested image", () => {
  const result = select([
    { status: "SUCCESS", createTime: "2026-08-02T13:00:00Z", substitutions: { _IMAGE_NAME: "other" } },
    { status: "FAILURE", createTime: "2026-08-02T12:00:00Z", substitutions: { _IMAGE_NAME: "studio" } },
    { status: "SUCCESS", createTime: "2026-08-01T12:00:00Z", substitutions: { _IMAGE_NAME: "studio" } },
    { status: "SUCCESS", createTime: "2026-08-02T10:00:00Z", substitutions: { _IMAGE_NAME: "studio" } },
  ]);

  assert.equal(result, "2026-08-02T10:00:00Z");
});

test("returns no timestamp when no exact successful build exists", () => {
  assert.equal(select([
    { status: "SUCCESS", createTime: "2026-08-02T13:00:00Z", substitutions: { _IMAGE_NAME: "studio-worker" } },
    { status: "CANCELLED", createTime: "2026-08-02T12:00:00Z", substitutions: { _IMAGE_NAME: "studio" } },
  ]), "");
});

test("rejects malformed provider history instead of bypassing cadence", () => {
  const result = spawnSync(process.execPath, [helper, "studio"], {
    cwd: repoRoot,
    encoding: "utf8",
    input: "not-json",
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /not valid JSON/);
});
