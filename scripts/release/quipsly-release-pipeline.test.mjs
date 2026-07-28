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
const authenticatedSmoke = fs.readFileSync(
  new URL("../quipsly-firebase-auth-smoke.mjs", import.meta.url),
  "utf8",
);
const previewSmoke = fs.readFileSync(
  new URL("./quipsly-smoke-preview.sh", import.meta.url),
  "utf8",
);
const gcloudIgnore = fs.readFileSync(
  new URL("../../.gcloudignore", import.meta.url),
  "utf8",
);
const nestMediaAccess = fs.readFileSync(
  new URL("./quipsly-nest-media-access.sh", import.meta.url),
  "utf8",
);

test("standalone preflight materializes the committed Nest release context", () => {
  assert.match(preflight, /quipsly-build-context\.sh/);
  assert.match(preflight, /RELEASE_CONTEXT_DIR="\$\{preflight_context\}"/);
  assert.match(preflight, /SOURCE_REF="\$\{resolved_source_sha\}"/);
  assert.match(gcloudIgnore, /\*\*\/\.next-\*\//);
});

test("preflight compiles the exact committed production bundle before Cloud Build", () => {
  assert.match(preflight, /QUIPSLY_PREFLIGHT_BUILD="\$\{QUIPSLY_PREFLIGHT_BUILD:-1\}"/);
  assert.match(preflight, /quipsly-verify-release-build\.sh/);
  assert.match(preflight, /Strict Nest production build succeeded from the materialized commit/);
  assert.doesNotMatch(deploy, /QUIPSLY_PREFLIGHT_BUILD=0/);
});

test("preflight proves scoped Nest access to the uniform-IAM media vault", () => {
  assert.match(preflight, /quipsly-nest-media-access\.sh/);
  assert.match(preflight, /Mobile capture media access/);
  assert.match(nestMediaAccess, /iamConfiguration\.uniformBucketLevelAccess\.enabled/);
  assert.match(nestMediaAccess, /media-vault\/recordings\//);
  assert.match(nestMediaAccess, /roles\/storage\.objectCreator/);
  assert.match(nestMediaAccess, /roles\/storage\.objectViewer/);
  assert.match(nestMediaAccess, /media-vault\/control\/mobile-capture-resumable\//);
  assert.match(nestMediaAccess, /roles\/storage\.objectUser/);
  assert.doesNotMatch(nestMediaAccess, /roles\/storage\.objectAdmin/);
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

test("authenticated smoke persists and verifies recorder access before claiming the surface", () => {
  assert.match(authenticatedSmoke, /authenticated-recorder-access-proof/);
  assert.match(authenticatedSmoke, /recorderAccessBody\.mode === "database"/);
  assert.match(authenticatedSmoke, /Checking Nest access/);
});

test("promotion requires a database-backed Session workspace instead of route-only success", () => {
  assert.match(previewSmoke, /QUIPSLY_AUTH_SMOKE_REQUIRE_SESSION_WORKSPACE=1/);
  assert.match(previewSmoke, /"sessions\.workspace"/);
  assert.match(authenticatedSmoke, /\/api\/mobile\/capture\/sessions:200:database/);
  assert.match(authenticatedSmoke, /Session review is unavailable/);
  assert.match(authenticatedSmoke, /rendered the fail-closed unavailable state/);
});
