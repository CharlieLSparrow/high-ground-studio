import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const deployScript = fileURLToPath(new URL("./quipsly-deploy-preview.sh", import.meta.url));

test("preview deploy mounts the required secrets and privately validates the release-smoke signing key", () => {
  execFileSync("bash", ["-n", deployScript], { cwd: repoRoot, stdio: "pipe" });
  const source = readFileSync(deployScript, "utf8");

  assert.match(source, /gcloud secrets versions describe/);
  assert.match(source, /gcloud secrets versions access/);
  assert.match(source, /bytes >= 32/);
  assert.match(source, /bytes <= 4096/);
  assert.match(source, /value\.trim\(\) === value/);
  assert.match(source, /!\/\[\\u0000-\\u001f\\u007f\]\//);
  assert.match(
    source,
    /--update-secrets="QUIPSLY_RELEASE_SMOKE_SECRET=\$\{RELEASE_SMOKE_SECRET_NAME\}:\$\{RELEASE_SMOKE_SECRET_VERSION\},REEFBALL_IMAGE_PROXY_TOKEN_SECRET=\$\{IMAGE_PROXY_TOKEN_SECRET_NAME\}:\$\{IMAGE_PROXY_TOKEN_SECRET_VERSION\}\$\{google_calendar_oauth_secrets\}\$\{account_deletion_worker_secret\}"/,
  );
  assert.match(source, /The value was not printed/);
  assert.doesNotMatch(source, /echo "\$\{?QUIPSLY_RELEASE_SMOKE_SECRET/);
  assert.doesNotMatch(source, /set -x/);
});

test("account deletion activation requires a private dedicated worker and keeps Nest non-destructive", () => {
  const source = readFileSync(deployScript, "utf8");

  assert.match(source, /ENABLE_ACCOUNT_DELETION_WORKER must be 0 or 1/);
  assert.match(source, /Account deletion worker shared secret .* is missing or disabled/);
  assert.match(source, /dedicated worker identity/);
  assert.match(source, /concurrency 1/);
  assert.match(source, /maximum 1 instance/);
  assert.match(source, /900-second timeout/);
  assert.match(source, /private IAM boundary/);
  assert.match(source, /Nest invoker grant/);
  assert.match(source, /Nest shared-secret access/);
  assert.match(source, /exact storage allowlist/);
  assert.match(source, /exact source identity/);
  assert.match(source, /QUIPSLY_ACCOUNT_DELETION_WORKER_ENABLED=true/);
  assert.match(source, /QUIPSLY_ACCOUNT_DELETION_EXECUTOR_ENABLED=false/);
  assert.match(source, /account_deletion_worker_secret/);
  assert.match(source, /account_deletion_worker_env_vars/);
});

test("preview deploy reuses one verified image for one committed source", () => {
  const source = readFileSync(deployScript, "utf8");

  assert.match(source, /canonical_image_tag="source-\$\{SOURCE_SHA\}"/);
  assert.match(source, /IMAGE_TAG="\$\{canonical_image_tag\}"/);
  assert.match(source, /IMAGE_TAG must equal \$\{canonical_image_tag\}/);
  assert.match(source, /Create a new commit for a distinct Nest release identity/);
  assert.match(source, /gcloud artifacts docker images describe "\$\{IMAGE_URI\}"/);
  assert.match(source, /Reusing exact-source Quipsly image/);
  assert.match(source, /Cloud Build skipped: this committed source already has a verified image/);
  assert.match(source, /REUSE_EXISTING_IMAGE must be 0 or 1/);
  assert.match(source, /CLOUD_BUILD_MACHINE_TYPE="\$\{CLOUD_BUILD_MACHINE_TYPE:-e2-highcpu-32\}"/);
  assert.match(source, /--machine-type "\$\{CLOUD_BUILD_MACHINE_TYPE\}"/);
  assert.match(source, /MIN_CLOUD_BUILD_INTERVAL_HOURS="\$\{MIN_CLOUD_BUILD_INTERVAL_HOURS:-72\}"/);
  assert.match(source, /ALLOW_EARLY_CLOUD_BUILD="\$\{ALLOW_EARLY_CLOUD_BUILD:-0\}"/);
  assert.match(source, /--format='json\(createTime,status,substitutions\)'/);
  assert.match(source, /quipsly-latest-successful-build\.mjs/);
  assert.doesNotMatch(source, /--filter="status=SUCCESS AND substitutions\._IMAGE_NAME=/);
  assert.match(source, /Cloud Build cadence gate/);
  assert.match(source, /For an urgent production repair only/);
  assert.match(source, /requested existing image is unavailable/);
  assert.match(source, /Could not verify the release image after the build\/reuse decision/);
  assert.doesNotMatch(source, /IMAGE_TAG="\$\{IMAGE_TAG:-preview-\$\(date/);
});

test("transcript activation requires an immutable worker and exact Nest execution authority", () => {
  const source = readFileSync(deployScript, "utf8");

  assert.match(source, /ENABLE_TRANSCRIPT_WORKER must be 0 or 1/);
  assert.match(source, /Transcript worker project, region, job, identity, bucket, or secret name is unsafe/);
  assert.match(source, /gcloud run jobs describe "\$\{TRANSCRIPT_WORKER_JOB\}"/);
  assert.match(source, /@sha256:\[0-9a-f\]\{64\}\$/);
  assert.match(source, /roles\/run\.jobsExecutor/);
  assert.match(source, /roles\/run\.jobsExecutorWithOverrides/);
  assert.match(source, /Nest lacks the exact transcript jobsExecutor boundary or has unsafe override authority/);
  assert.match(source, /Transcript provider secret .* is missing or disabled/);
  assert.match(source, /QUIPSLY_TRANSCRIPT_WORKER_ENABLED=1/);
  assert.match(source, /Transcript worker passed immutable job, provider-secret, and Nest executor readback/);
});
