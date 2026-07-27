import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  RELEASE_MANIFEST_IDS,
  auditReleaseManifests,
  planChangedSurfaces,
  validateReleaseManifest,
} from "./release-manifest.ts";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const audit = auditReleaseManifests(repositoryRoot);

test("loads one validated manifest for every supported release surface", () => {
  assert.deepEqual(audit.errors, []);
  assert.deepEqual(audit.manifests.map((manifest) => manifest.id), [
    "capture",
    "hgo-web",
    "nest",
    "quipsly-media-processor",
    "quipsly-media-verifier",
    "quipsly-studio",
  ]);
  assert.deepEqual(
    [...audit.manifests.map((manifest) => manifest.id)].sort(),
    [...RELEASE_MANIFEST_IDS].sort(),
  );
});

test("every release declares all five proof levels and immutable provenance", () => {
  for (const manifest of audit.manifests) {
    assert.equal(manifest.artifact.sourceRevision, "git-commit-sha");
    assert.ok(manifest.artifact.provenanceReceipt.length > 0);
    assert.ok(manifest.proofs.source.length > 0);
    assert.ok(manifest.proofs.deterministic.length > 0);
    assert.ok(manifest.proofs.localRuntime.length > 0);
    assert.ok(manifest.proofs.credentialedRuntime.length > 0);
    assert.ok(manifest.proofs.deliveryReadback.length > 0);
  }
});

test("rejects traversal and a manifest that does not trigger its own boundary", () => {
  const manifestPath = "release/manifests/capture.json";
  const original = JSON.parse(readFileSync(path.join(repositoryRoot, manifestPath), "utf8"));
  const invalid = structuredClone(original);
  invalid.applicationRoot = "../outside";
  invalid.changeDetection.deploy.files = [];
  const errors = validateReleaseManifest(invalid, {
    root: repositoryRoot,
    manifestPath,
  });
  assert.ok(errors.some((error) => error.includes("without traversal")));
  assert.ok(errors.some((error) => error.includes(`must include ${manifestPath}`)));
});

test("manifest-backed planner keeps Capture independent from web deploys", () => {
  const plan = planChangedSurfaces([
    "apps/mobile-capture/HighGroundCapture/HighGroundCapture/App.swift",
  ], audit.manifests);
  assert.equal(plan.capture, true);
  assert.equal(plan.web, false);
  assert.equal(plan.studio, false);
  assert.deepEqual(plan.matchedManifestIds, ["capture"]);
});

test("media verifier changes require their own manual release proof", () => {
  const plan = planChangedSurfaces([
    "apps/quipsly-media-verifier/src/worker.ts",
  ], audit.manifests);
  assert.equal(plan.mediaVerifier, true);
  assert.equal(plan.web, false);
  assert.equal(plan.studio, false);
  assert.deepEqual(plan.deployTargets, []);
  assert.deepEqual(plan.changedSurfaces, ["media-verifier"]);
  assert.deepEqual(plan.matchedManifestIds, ["quipsly-media-verifier"]);
  assert.match(plan.summary, /Manual Quipsly media-verifier/);
});

test("media processor changes require their own manual release proof", () => {
  const plan = planChangedSurfaces([
    "apps/quipsly-media-processor/src/worker.ts",
  ], audit.manifests);
  assert.equal(plan.mediaProcessor, true);
  assert.equal(plan.web, false);
  assert.equal(plan.studio, false);
  assert.deepEqual(plan.deployTargets, []);
  assert.deepEqual(plan.changedSurfaces, ["media-processor"]);
  assert.deepEqual(plan.matchedManifestIds, ["quipsly-media-processor"]);
  assert.match(plan.summary, /Manual Quipsly media-processor/);
});

test("validation-only ownership overrides unrelated broad deploy prefixes", () => {
  const plan = planChangedSurfaces([
    "scripts/quipsly-ios-capture-app-store-static-smoke.mjs",
    "scripts/release/quipsly-capture-app-store-metadata.mjs",
  ], audit.manifests);
  assert.equal(plan.capture, true);
  assert.equal(plan.web, false);
  assert.equal(plan.studio, false);
  assert.equal(plan.quipsly, false);
  assert.deepEqual(plan.deployTargets, []);
  assert.deepEqual(plan.matchedManifestIds, ["capture"]);
});

test("validation-only Nest tooling is owned without planning a deployment", () => {
  const plan = planChangedSurfaces([
    "scripts/ci/plan-changed-surfaces.test.mjs",
  ], audit.manifests);
  assert.equal(plan.quipsly, true);
  assert.equal(plan.studio, false);
  assert.deepEqual(plan.deployTargets, []);
  assert.deepEqual(plan.matchedManifestIds, ["nest"]);
});

test("manifest-backed planner follows runtime package consumers", () => {
  const shared = planChangedSurfaces(
    ["packages/quipsly-domain/src/index.ts"],
    audit.manifests,
  );
  const nestOnly = planChangedSurfaces(
    ["packages/quipsly-document-kernel/src/index.ts"],
    audit.manifests,
  );
  const webOnly = planChangedSurfaces(
    ["packages/worldhub-domain/src/index.ts"],
    audit.manifests,
  );
  assert.deepEqual(shared.deployTargets, ["web", "studio"]);
  assert.deepEqual(nestOnly.deployTargets, ["studio"]);
  assert.deepEqual(webOnly.deployTargets, ["web"]);
});

test("HGO build-only package manifests trigger its declared release boundary", () => {
  const plan = planChangedSurfaces(
    ["packages/motion-engine/package.json"],
    audit.manifests,
  );
  assert.equal(plan.web, true);
  assert.equal(plan.studio, false);
});

test("Prisma and root dependency changes preserve existing deploy semantics", () => {
  const prisma = planChangedSurfaces(["prisma/schema.prisma"], audit.manifests);
  assert.equal(prisma.web, true);
  assert.equal(prisma.studio, true);
  assert.equal(prisma.schema, true);

  const lockfile = planChangedSurfaces(["pnpm-lock.yaml"], audit.manifests);
  assert.equal(lockfile.web, true);
  assert.equal(lockfile.studio, true);
  assert.equal(lockfile.schema, false);
});
