import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
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
const cloudRunWorkflow = fs.readFileSync(
  new URL("../../.github/workflows/deploy-cloud-run.yml", import.meta.url),
  "utf8",
);
const generatedReviewerUrl = new URL(
  "./quipsly-generated-reviewer.sh",
  import.meta.url,
);
const generatedReviewerPath = fileURLToPath(generatedReviewerUrl);
const generatedReviewer = fs.readFileSync(generatedReviewerUrl, "utf8");

test("standalone preflight materializes the committed Nest release context", () => {
  assert.match(preflight, /quipsly-build-context\.sh/);
  assert.match(preflight, /RELEASE_CONTEXT_DIR="\$\{preflight_context\}"/);
  assert.match(preflight, /SOURCE_REF="\$\{resolved_source_sha\}"/);
  assert.match(gcloudIgnore, /\*\*\/\.next-\*\//);
});

test("preflight compiles the exact committed production bundle before Cloud Build", () => {
  assert.match(
    preflight,
    /QUIPSLY_PREFLIGHT_BUILD="\$\{QUIPSLY_PREFLIGHT_BUILD:-1\}"/,
  );
  assert.match(preflight, /quipsly-verify-release-build\.sh/);
  assert.match(
    preflight,
    /Strict Nest production build succeeded from the materialized commit/,
  );
  assert.doesNotMatch(deploy, /QUIPSLY_PREFLIGHT_BUILD=0/);
});

test("preflight proves scoped Nest access to the uniform-IAM media vault", () => {
  assert.match(preflight, /quipsly-nest-media-access\.sh/);
  assert.match(preflight, /Mobile capture media access/);
  assert.match(
    preflight,
    /preview deployer's read-only authority.*ineligible for promotion until the audit preflight proves this boundary/s,
  );
  assert.match(
    preflight,
    /else\s+fail "Nest mobile-capture media IAM is incomplete/s,
  );
  assert.match(
    nestMediaAccess,
    /iamConfiguration\.uniformBucketLevelAccess\.enabled/,
  );
  assert.match(nestMediaAccess, /media-vault\/recordings\//);
  assert.match(nestMediaAccess, /roles\/storage\.objectCreator/);
  assert.match(nestMediaAccess, /roles\/storage\.objectViewer/);
  assert.match(
    nestMediaAccess,
    /media-vault\/control\/mobile-capture-resumable\//,
  );
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

test("preview deploy mounts internal proxy credentials from Secret Manager", () => {
  assert.match(
    deploy,
    /IMAGE_PROXY_TOKEN_SECRET_NAME="\$\{IMAGE_PROXY_TOKEN_SECRET_NAME:-reefball-image-proxy-token\}"/,
  );
  assert.match(
    deploy,
    /gcloud secrets versions describe "\$\{IMAGE_PROXY_TOKEN_SECRET_VERSION\}".*--secret="\$\{IMAGE_PROXY_TOKEN_SECRET_NAME\}"/s,
  );
  assert.match(
    deploy,
    /REEFBALL_IMAGE_PROXY_TOKEN_SECRET=\$\{IMAGE_PROXY_TOKEN_SECRET_NAME\}:\$\{IMAGE_PROXY_TOKEN_SECRET_VERSION\}/,
  );
  assert.doesNotMatch(
    deploy,
    /--update-env-vars="[^"]*REEFBALL_IMAGE_PROXY_TOKEN_SECRET=/,
  );
});

test("manual Studio workflow installs pinned tooling and preserves the exact-source preview boundary", () => {
  assert.match(
    cloudRunWorkflow,
    /deploy-studio:.*Setup pnpm.*cache: 'pnpm'.*REQUESTED_SOURCE_REF: \$\{\{ inputs\.source_ref \}\}.*RELEASE_SOURCE_SHA=\$\{source_sha\}.*QUIPSLY_PREFLIGHT_PURPOSE: preview/s,
  );
  assert.match(
    cloudRunWorkflow,
    /Read Back Preview Source and Safety Boundary.*body\?\.release\?\.sourceSha !== expectedSource.*Number\(previewTraffic\?\.percent \|\| 0\) !== 0/s,
  );
  assert.match(
    cloudRunWorkflow,
    /Smoke Test Preview\s+if: inputs\.run_authenticated_smoke == true/s,
  );
  assert.match(
    cloudRunWorkflow,
    /Promote Preview to Production\s+if: inputs\.promote == true/s,
  );
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
  assert.match(
    authenticatedSmoke,
    /\/api\/mobile\/capture\/sessions:200:database/,
  );
  assert.match(authenticatedSmoke, /Session review is unavailable/);
  assert.match(
    authenticatedSmoke,
    /rendered the fail-closed unavailable state/,
  );
});

test("generated reviewer keeps smoke-only and immutable promotion modes explicit", () => {
  assert.match(generatedReviewer, /MODE="\$\{1:-smoke\}"/);
  assert.match(generatedReviewer, /smoke\|promote-preview/);
  assert.match(
    generatedReviewer,
    /if \[\[ "\$\{MODE\}" == "promote-preview" \]\]; then\s+BASE_URL="\$\(resolve_preview_url\)"/,
  );
  assert.match(
    generatedReviewer,
    /node scripts\/quipsly-generated-admin-user-smoke\.mjs --promote-preview/,
  );
  assert.match(
    generatedReviewer,
    /else\s+node scripts\/quipsly-generated-admin-user-smoke\.mjs\s+fi/,
  );
  assert.doesNotMatch(generatedReviewer, /reviewer_args\[@\]/);
  assert.match(
    generatedReviewer,
    /Mode: generated production reviewer smoke; traffic mutation is disabled/,
  );
  assert.doesNotMatch(
    generatedReviewer,
    /gcloud run services update-traffic|--to-revisions|--to-tags/,
  );
});

test("generated reviewer rejects ambiguous modes before external access", () => {
  const help = spawnSync("bash", [generatedReviewerPath, "--help"], {
    encoding: "utf8",
  });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /smoke\s+Exercise production/);
  assert.match(help.stdout, /promote-preview\s+Exercise and promote/);

  const invalid = spawnSync("bash", [generatedReviewerPath, "anything-else"], {
    encoding: "utf8",
  });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Mode must be smoke or promote-preview/);
  assert.doesNotMatch(
    invalid.stdout + invalid.stderr,
    /gcloud run|secrets versions/,
  );

  const untrustedTarget = spawnSync("bash", [generatedReviewerPath, "smoke"], {
    encoding: "utf8",
    env: {
      ...process.env,
      QUIPSLY_GENERATED_REVIEWER_BASE_URL: "http://untrusted.example",
    },
  });
  assert.equal(untrustedTarget.status, 1);
  assert.match(
    untrustedTarget.stderr,
    /target is outside the trusted runtime boundary/,
  );
  assert.doesNotMatch(
    untrustedTarget.stdout + untrustedTarget.stderr,
    /Running the generated reviewer|Could not read database secret/,
  );
});

test("generated reviewer owns secret-safe proxy startup and bounded cleanup", () => {
  assert.match(generatedReviewer, /umask 077/);
  assert.match(generatedReviewer, /gcloud secrets versions access/);
  assert.match(generatedReviewer, /\/api\/mac\/firebase-client-config/);
  assert.match(generatedReviewer, /validate_base_url/);
  assert.match(generatedReviewer, /hostname\.endsWith\("\.quipsly\.com"\)/);
  assert.match(generatedReviewer, /isConfiguredCloudRunService/);
  assert.match(generatedReviewer, /resolve_cloud_sql_proxy/);
  assert.match(generatedReviewer, /cloud-sql-proxy\.log/);
  assert.match(generatedReviewer, /trap cleanup EXIT/);
  assert.match(
    generatedReviewer,
    /case "\$\{WORK_DIR\}" in\s+"\$\{TMPDIR:-\/private\/tmp\}"\/quipsly-generated-reviewer\.\*\)/,
  );
  assert.match(generatedReviewer, /kill "\$\{PROXY_PID\}"/);
  assert.match(generatedReviewer, /rm -rf -- "\$\{WORK_DIR\}"/);
  assert.match(
    generatedReviewer,
    /QUIPSLY_AUTH_SMOKE_REQUIRE_SESSION_WORKSPACE=1/,
  );
  assert.match(
    generatedReviewer,
    /node scripts\/quipsly-generated-admin-user-smoke\.mjs/,
  );
  assert.doesNotMatch(generatedReviewer, /set -x/);
  assert.doesNotMatch(
    generatedReviewer,
    /echo "\$\{database_url\}"|echo "\$\{firebase_api_key\}"/,
  );
});
