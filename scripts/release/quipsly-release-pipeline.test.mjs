import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const preflight = fs.readFileSync(
  new URL("./quipsly-release-preflight.sh", import.meta.url),
  "utf8",
);
const deploy = fs.readFileSync(
  new URL("./quipsly-deploy-preview.sh", import.meta.url),
  "utf8",
);
const promote = fs.readFileSync(
  new URL("./quipsly-promote-preview.sh", import.meta.url),
  "utf8",
);
const gcloudIgnore = fs.readFileSync(
  new URL("../../.gcloudignore", import.meta.url),
  "utf8",
);

test("standalone preflight materializes the committed Nest release context", () => {
  assert.match(preflight, /quipsly-build-context\.sh/);
  assert.match(preflight, /RELEASE_CONTEXT_DIR="\$\{preflight_context\}"/);
  assert.match(preflight, /SOURCE_REF="\$\{resolved_source_sha\}"/);
  assert.match(gcloudIgnore, /\*\*\/\.next-\*\//);
});

test("no-traffic preview can repair drift without weakening candidate checks", () => {
  assert.match(deploy, /QUIPSLY_PREFLIGHT_PURPOSE=preview/);
  assert.match(
    preflight,
    /Current production has blockers; continuing only because a no-traffic preview may repair them/,
  );
  assert.match(preflight, /QUIPSLY_PREFLIGHT_PURPOSE.*audit\|preview/s);
});

test("promotion smokes and promotes one immutable source-bound revision", () => {
  assert.match(promote, /preview_source_sha.*expected_source_sha/s);
  assert.match(promote, /quipsly-smoke-preview\.sh/);
  assert.match(promote, /Preview tag moved during smoke/);
  assert.match(promote, /--to-revisions="\$\{preview_revision\}=100"/);
  assert.doesNotMatch(promote, /--to-tags=/);
});

test("failed production readback rolls back to the previous revision", () => {
  assert.match(promote, /quipsly-production-status\.sh/);
  assert.match(promote, /rolling traffic back to \$\{previous_revision\}/);
  assert.match(promote, /--to-revisions="\$\{previous_revision\}=100"/);
});
