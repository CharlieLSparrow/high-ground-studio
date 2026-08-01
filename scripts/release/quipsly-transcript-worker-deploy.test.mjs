import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const deploy = readFileSync(
  "scripts/release/quipsly-transcript-worker-deploy.sh",
  "utf8",
);

test("transcript worker releases use one full committed-source image identity", () => {
  assert.match(deploy, /source-\$\{source_sha\}/);
  assert.doesNotMatch(deploy, /source-\$\{source_sha:0:16\}/);
  assert.match(deploy, /IMAGE_TAG must equal \$\{canonical_image_tag\}/);
  assert.match(deploy, /Create a new commit for a distinct worker release identity/);
  assert.match(deploy, /REUSE_EXISTING_IMAGE must be 0 or 1/);
  assert.match(deploy, /Reusing exact-source transcript-worker image/);
  assert.match(
    deploy,
    /Cloud Build skipped: this committed worker source already has a verified image/,
  );
});

test("transcript worker registry decisions fail closed and finish on a digest", () => {
  assert.match(deploy, /read_image_digest\(\)/);
  assert.match(deploy, /Artifact Registry readback failed before the transcript-worker build decision/);
  assert.match(deploy, /Refusing to replace an existing immutable transcript-worker image tag/);
  assert.match(deploy, /Could not verify the transcript-worker image after the build\/reuse decision/);
  assert.match(deploy, /immutable_image=.*@\$\{image_digest\}/);
  assert.match(deploy, /--image="\$\{immutable_image\}"/);
});

test("provider readiness remains a pre-build release gate", () => {
  const secretGate = deploy.indexOf("Secret ${deepgram_secret} needs an enabled version");
  const buildDecision = deploy.indexOf("existing_image_digest=");
  assert.ok(secretGate >= 0);
  assert.ok(buildDecision > secretGate);
  assert.match(deploy, /--set-secrets="DEEPGRAM_API_KEY=\$\{deepgram_secret\}:latest"/);
});
