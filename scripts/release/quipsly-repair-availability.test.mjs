import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const scriptPath = fileURLToPath(new URL("./quipsly-repair-availability.sh", import.meta.url));
const source = readFileSync(scriptPath, "utf8");

test("availability repair is plan-only by default and reuses the immutable live image", () => {
  execFileSync("bash", ["-n", scriptPath], { cwd: repoRoot, stdio: "pipe" });
  assert.match(source, /QUIPSLY_APPLY_AVAILABILITY_REPAIR:-0/);
  assert.match(source, /PLAN ONLY/);
  assert.match(source, /@sha256:\[0-9a-f\]\{64\}/);
  assert.match(source, /--image="\$\{immutable_image\}"/);
  assert.match(source, /--no-traffic/);
});

test("availability repair smokes before promotion and automatically restores traffic on failure", () => {
  const smokeIndex = source.indexOf("/api/health");
  const promoteIndex = source.indexOf("Promoting healthy recovery revision");
  assert.ok(smokeIndex >= 0 && promoteIndex > smokeIndex);
  assert.match(source, /--to-revisions="\$\{new_revision\}=100"/);
  assert.match(source, /--update-tags="quipsly-preview=\$\{new_revision\},\$\{RECOVERY_TAG\}=\$\{new_revision\}"/);
  assert.doesNotMatch(source, /--set-tags=/);
  assert.match(source, /quipsly-production-status\.sh/);
  assert.match(source, /Production verification failed; restoring/);
  assert.match(source, /--to-revisions="\$\{old_revision\}=100"/);
});

test("availability repair retains zero idle cost and refuses a one-instance maximum", () => {
  assert.match(source, /MIN_INSTANCES:-0/);
  assert.match(source, /MAX_INSTANCES:-2/);
  assert.match(source, /MAX_INSTANCES < 2/);
  assert.match(source, /--min-instances="\$\{MIN_INSTANCES\}"/);
  assert.match(source, /--max-instances="\$\{MAX_INSTANCES\}"/);
});
