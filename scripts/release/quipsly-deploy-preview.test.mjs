import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const deployScript = fileURLToPath(new URL("./quipsly-deploy-preview.sh", import.meta.url));

test("preview deploy mounts and privately validates the release-smoke signing key", () => {
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
    /--update-secrets="QUIPSLY_RELEASE_SMOKE_SECRET=\$\{RELEASE_SMOKE_SECRET_NAME\}:\$\{RELEASE_SMOKE_SECRET_VERSION\}"/,
  );
  assert.match(source, /The value was not printed/);
  assert.doesNotMatch(source, /echo "\$\{?QUIPSLY_RELEASE_SMOKE_SECRET/);
  assert.doesNotMatch(source, /set -x/);
});
