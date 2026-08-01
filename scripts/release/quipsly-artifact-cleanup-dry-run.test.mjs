import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

const scriptPath = "scripts/release/quipsly-artifact-cleanup-dry-run.sh";
const script = readFileSync(scriptPath, "utf8");
const policy = JSON.parse(readFileSync(
  "ops/artifact-registry/high-ground-studio-cleanup-policy.json",
  "utf8",
));

test("cleanup policy is conservative and cannot target tagged release images", () => {
  assert.deepEqual(policy, [
    {
      name: "delete-untagged-after-45-days",
      action: { type: "Delete" },
      condition: { tagState: "untagged", olderThan: "45d" },
    },
    {
      name: "keep-recent-10-per-package",
      action: { type: "Keep" },
      mostRecentVersions: { keepCount: 10 },
    },
  ]);
});

test("cleanup operator exposes only plan and dry-run modes", () => {
  assert.equal(spawnSync("bash", ["-n", scriptPath]).status, 0);
  assert.match(script, /--apply-dry-run/);
  assert.match(script, /--\) ;;/);
  assert.match(script, /set-cleanup-policies/);
  assert.match(script, /--dry-run/);
  assert.doesNotMatch(script, /--no-dry-run|artifacts docker images delete|delete-cleanup-policies/);
  assert.match(script, /Wait at least one day/);
});
