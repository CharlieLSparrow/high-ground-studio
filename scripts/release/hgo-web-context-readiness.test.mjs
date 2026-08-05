import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createWebHealthResponseBody,
  WEB_HEALTH_RESPONSE,
} from "../../apps/web/src/lib/web-health.mjs";

test("HGO health reports the immutable image source", () => {
  const sourceSha = "0123456789abcdef0123456789abcdef01234567";
  assert.deepEqual(createWebHealthResponseBody({ HGO_BUILD_ID: sourceSha }), {
    ...WEB_HEALTH_RESPONSE,
    sourceSha,
  });
});

test("HGO image embeds source provenance and standalone runtime", () => {
  const dockerfile = readFileSync("apps/web/Dockerfile", "utf8");
  assert.match(dockerfile, /pnpm --filter web exec next build --webpack/);
  assert.match(dockerfile, /org\.opencontainers\.image\.revision/);
  assert.match(dockerfile, /HGO_BUILD_ID/);
  assert.match(dockerfile, /CMD \["node", "apps\/web\/server\.js"\]/);
});

test("HGO Cloud Build is normalized, immutable, cached, and digest-verified", () => {
  const cloudbuild = readFileSync("cloudbuild.web.yaml", "utf8");
  assert.match(cloudbuild, /normalize-hgo-web-context-metadata/);
  assert.match(cloudbuild, /gcr\.io\/cloud-builders\/docker@sha256:[0-9a-f]{64}/);
  assert.match(cloudbuild, /moby\/buildkit:v0\.30\.0/);
  assert.match(cloudbuild, /--build-arg HGO_BUILD_ID=\$\{_SOURCE_SHA\}/);
  assert.match(cloudbuild, /hgo-web-image-digest\.txt/);
  assert.doesNotMatch(cloudbuild, /\$\{_IMAGE_NAME\}:latest/);
});

test("HGO context contains every manifest input and excludes other products", () => {
  const testRoot = mkdtempSync(path.join(tmpdir(), "hgo-web-context-readiness-"));
  const context = path.join(testRoot, "context");
  try {
    execFileSync("bash", ["scripts/release/materialize-release-context.sh", "hgo-web", "HEAD", context], { stdio: "pipe" });
    const manifest = JSON.parse(readFileSync(path.join(context, "release/manifests/hgo-web.json"), "utf8"));
    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.id, "hgo-web");
    assert.equal(manifest.artifact.provenanceReceipt, "hgo-web-release-source.json");
    for (const requiredPath of manifest.releaseContext.requiredPaths) {
      assert.equal(existsSync(path.join(context, requiredPath)), true, `missing ${requiredPath}`);
    }
    assert.equal(existsSync(path.join(context, ".git")), false);
    assert.equal(existsSync(path.join(context, "apps/quipsly/src")), false);
    assert.equal(existsSync(path.join(context, "apps/QuipslyStudio")), false);
    assert.equal(existsSync(path.join(context, "apps/mobile-capture")), false);
  } finally {
    if (existsSync(path.join(context, ".quipsly-release-context"))) rmSync(testRoot, { recursive: true, force: true });
  }
});
