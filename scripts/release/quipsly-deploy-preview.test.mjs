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
    /--update-secrets="QUIPSLY_RELEASE_SMOKE_SECRET=\$\{RELEASE_SMOKE_SECRET_NAME\}:\$\{RELEASE_SMOKE_SECRET_VERSION\},REEFBALL_IMAGE_PROXY_TOKEN_SECRET=\$\{IMAGE_PROXY_TOKEN_SECRET_NAME\}:\$\{IMAGE_PROXY_TOKEN_SECRET_VERSION\}\$\{google_calendar_oauth_secrets\}"/,
  );
  assert.match(source, /The value was not printed/);
  assert.doesNotMatch(source, /echo "\$\{?QUIPSLY_RELEASE_SMOKE_SECRET/);
  assert.doesNotMatch(source, /set -x/);
});

test("preview deploy reuses one verified image for one committed source", () => {
  const source = readFileSync(deployScript, "utf8");

  assert.match(source, /IMAGE_TAG="source-\$\{SOURCE_SHA\}"/);
  assert.match(source, /gcloud artifacts docker images describe "\$\{IMAGE_URI\}"/);
  assert.match(source, /Reusing exact-source Quipsly image/);
  assert.match(source, /Cloud Build skipped: this committed source already has a verified image/);
  assert.match(source, /REUSE_EXISTING_IMAGE must be 0 or 1/);
  assert.match(source, /CLOUD_BUILD_MACHINE_TYPE="\$\{CLOUD_BUILD_MACHINE_TYPE:-e2-highcpu-32\}"/);
  assert.match(source, /--machine-type "\$\{CLOUD_BUILD_MACHINE_TYPE\}"/);
  assert.match(source, /requested existing image is unavailable/);
  assert.match(source, /Could not verify the release image after the build\/reuse decision/);
  assert.doesNotMatch(source, /IMAGE_TAG="\$\{IMAGE_TAG:-preview-\$\(date/);
});
