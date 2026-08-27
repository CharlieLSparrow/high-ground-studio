import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = readFileSync(
  fileURLToPath(new URL("./quipsly-production-status.sh", import.meta.url)),
  "utf8",
);

test("production readback proves support and policy routes at canonical HTTPS URLs", () => {
  assert.match(script, /expect_canonical_public_route/);
  assert.match(script, /https:\/\/quipsly\.com\/support/);
  assert.match(script, /charlie@highgroundodyssey\.com/);
  assert.match(script, /https:\/\/quipsly\.com\/privacy/);
  assert.match(script, /Quipsly Privacy/);
  assert.match(script, /https:\/\/quipsly\.com\/privacy\/account-deletion/);
  assert.match(script, /Delete your account without a scavenger hunt\./);
  assert.doesNotMatch(script, /Your work stays inspectable, consented, and yours\./);
  assert.doesNotMatch(script, /Request deletion without losing the paper trail\./);
  assert.match(script, /--proto '=https'/);
  assert.match(script, /--proto-redir '=https'/);
  assert.match(script, /url_effective/);
});

test("production readback fails closed on the complete mobile contract", () => {
  assert.match(script, /quipsly-mobile-capture-contract-smoke\.mjs/);
  assert.match(script, /"--base-url=\$\{PRODUCTION_BASE_URL%\/\}"/);
  assert.match(script, /JSON\.parse\(fs\.readFileSync\(process\.argv\[1\], "utf8"\)\)/);
  assert.doesNotMatch(script, /require\(process\.argv\[1\]\)/);
  assert.match(script, /statusCounts\?\.fail/);
  assert.match(script, /fail "Production mobile Capture contract failed/);
});

test("production readback remains non-mutating", () => {
  assert.doesNotMatch(script, /update-traffic/);
  assert.doesNotMatch(script, /gcloud run deploy/);
  assert.doesNotMatch(script, /curl .*(?:-X|--request) ['"]?(?:POST|PUT|PATCH|DELETE)/);
});

test("production readback detects a one-instance global availability trap", () => {
  assert.match(script, /autoscaling\.knative\.dev\/minScale/);
  assert.match(script, /autoscaling\.knative\.dev\/maxScale/);
  assert.match(script, /max_instances >= 2/);
  assert.match(script, /one unavailable instance cannot cause global HTTP 429 responses/);
});
