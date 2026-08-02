import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

const scriptPath = "scripts/release/quipsly-artifact-cleanup-activate.sh";
const script = readFileSync(scriptPath, "utf8");

test("active cleanup requires both an explicit mode and exact confirmation", () => {
  assert.equal(spawnSync("bash", ["-n", scriptPath]).status, 0);
  assert.match(script, /--activate-after-audit/);
  assert.match(script, /CONFIRM_ARTIFACT_DELETION/);
  assert.match(script, /high-ground-studio-45d-keep10/);
  assert.match(script, /--no-dry-run/);
});

test("active cleanup proves every traffic digest is protected before mutation", () => {
  assert.match(script, /quipsly-cloud-cost-audit\.mjs/);
  assert.match(script, /trafficServingProtectedVersionCount/);
  assert.match(script, /trafficServingRetentionProtectedVersionCount/);
  assert.match(script, /trafficServingDigestCount/);
  assert.match(script, /artifactDeletionPerformed !== false/);
  assert.match(script, /cleanupPolicyDryRun/);
  assert.match(script, /omits this proto3 boolean when it is false/);
});

test("active cleanup never directly deletes a named image or repository", () => {
  assert.doesNotMatch(script, /artifacts docker images delete/);
  assert.doesNotMatch(script, /artifacts repositories delete/);
  assert.doesNotMatch(script, /delete-cleanup-policies/);
  assert.match(script, /set-cleanup-policies/);
});
