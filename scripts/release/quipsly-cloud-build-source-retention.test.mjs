import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const script = readFileSync("scripts/release/quipsly-cloud-build-source-retention.sh", "utf8");
const policy = JSON.parse(readFileSync(
  "scripts/release/high-ground-odyssey-cloud-build-source-lifecycle.json",
  "utf8",
));

test("Cloud Build source retention is prefix-bounded and explicitly activated", () => {
  assert.deepEqual(policy, {
    rule: [{
      action: { type: "Delete" },
      condition: { age: 7, matchesPrefix: ["source/"] },
    }],
  });
  assert.match(script, /--activate-after-audit/);
  assert.match(script, /CONFIRM_CLOUD_BUILD_SOURCE_EXPIRY/);
  assert.match(script, /high-ground-odyssey-cloudbuild-source-7d/);
  assert.match(script, /--disable-soft-delete-after-audit/);
  assert.match(script, /CONFIRM_CLOUD_BUILD_SOURCE_SOFT_DELETE/);
  assert.match(script, /disable-high-ground-odyssey-cloudbuild-soft-delete/);
  assert.match(
    script,
    /gcloud storage buckets update "\$\{bucket\}" --clear-soft-delete/,
  );
  assert.match(script, /already-soft-deleted objects remain untouched/);
  assert.match(script, /startsWith\(`\$\{bucket\}\/source\/`\)/);
  assert.doesNotMatch(script, /gcloud storage (rm|objects delete)/);
});
