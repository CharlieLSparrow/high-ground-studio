#!/usr/bin/env node

import assert from "node:assert/strict";
import test from "node:test";

import { planChangedSurfaces } from "./plan-changed-surfaces.mjs";

test("Capture changes do not build or deploy web apps", () => {
  const plan = planChangedSurfaces([
    "apps/mobile-capture/HighGroundCapture/HighGroundCapture/App.swift",
  ]);

  assert.equal(plan.capture, true);
  assert.equal(plan.web, false);
  assert.equal(plan.studio, false);
  assert.equal(plan.schema, false);
  assert.equal(plan.quipsly, false);
  assert.deepEqual(plan.changedSurfaces, ["capture"]);
});

test("Capture workflow changes remain inside the Capture surface", () => {
  const plan = planChangedSurfaces([
    ".github/workflows/capture-pr-tests.yml",
  ]);

  assert.equal(plan.capture, true);
  assert.equal(plan.web, false);
  assert.equal(plan.studio, false);
  assert.equal(plan.quipsly, false);
});

test("media verifier changes stay manual and do not deploy web services", () => {
  const plan = planChangedSurfaces([
    "apps/quipsly-media-verifier/src/worker.ts",
  ]);
  assert.equal(plan.mediaVerifier, true);
  assert.equal(plan.web, false);
  assert.equal(plan.studio, false);
  assert.deepEqual(plan.deployTargets, []);
  assert.deepEqual(plan.changedSurfaces, ["media-verifier"]);
});

test("media processor changes stay manual and shared contracts also validate Nest", () => {
  const worker = planChangedSurfaces([
    "apps/quipsly-media-processor/src/worker.ts",
  ]);
  assert.equal(worker.mediaProcessor, true);
  assert.equal(worker.web, false);
  assert.equal(worker.studio, false);
  assert.deepEqual(worker.deployTargets, []);
  assert.deepEqual(worker.changedSurfaces, ["media-processor"]);

  const contract = planChangedSurfaces([
    "packages/quipsly-media-processing/src/index.ts",
  ]);
  assert.equal(contract.mediaProcessor, true);
  assert.equal(contract.studio, true);
  assert.deepEqual(contract.deployTargets, ["studio"]);
});

test("transcript worker changes stay manual and shared contracts validate every owner", () => {
  const worker = planChangedSurfaces([
    "apps/quipsly-transcript-worker/src/worker.ts",
  ]);
  assert.equal(worker.transcriptWorker, true);
  assert.equal(worker.web, false);
  assert.equal(worker.studio, false);
  assert.deepEqual(worker.deployTargets, []);
  assert.deepEqual(worker.changedSurfaces, ["transcript-worker"]);

  const contract = planChangedSurfaces([
    "packages/quipsly-media-processing/src/transcription.ts",
  ]);
  assert.equal(contract.transcriptWorker, true);
  assert.equal(contract.mediaProcessor, true);
  assert.equal(contract.studio, true);
  assert.deepEqual(contract.deployTargets, ["studio"]);
});

test("Capture listing changes validate Capture without deploying web apps", () => {
  const plan = planChangedSurfaces([
    "release/app-store/quipsly-capture/en-US.json",
    "docs/quipsly/ios-capture-app-store-listing.md",
  ]);

  assert.equal(plan.capture, true);
  assert.equal(plan.web, false);
  assert.equal(plan.studio, false);
  assert.equal(plan.schema, false);
  assert.equal(plan.quipsly, false);
  assert.deepEqual(plan.changedSurfaces, ["capture"]);
});

test("Capture validators beat legacy broad scripts deploy prefixes", () => {
  const plan = planChangedSurfaces([
    "scripts/quipsly-ios-capture-app-store-static-smoke.mjs",
    "scripts/release/quipsly-capture-app-store-metadata.mjs",
  ]);

  assert.equal(plan.capture, true);
  assert.equal(plan.web, false);
  assert.equal(plan.studio, false);
  assert.equal(plan.quipsly, false);
  assert.deepEqual(plan.deployTargets, []);
  assert.deepEqual(plan.changedSurfaces, ["capture"]);
});

test("Nest app changes validate and deploy only Nest", () => {
  const plan = planChangedSurfaces([
    "apps/quipsly/src/app/api/mobile/capture/sessions/route.ts",
  ]);

  assert.equal(plan.web, false);
  assert.equal(plan.studio, true);
  assert.equal(plan.schema, false);
  assert.equal(plan.quipsly, true);
  assert.deepEqual(plan.deployTargets, ["studio"]);
});

test("public HGO changes deploy only web", () => {
  const plan = planChangedSurfaces([
    "apps/web/src/app/episodes/page.tsx",
  ]);

  assert.equal(plan.web, true);
  assert.equal(plan.studio, false);
  assert.equal(plan.schema, false);
  assert.equal(plan.quipsly, false);
  assert.deepEqual(plan.deployTargets, ["web"]);
});

test("shared package ownership follows declared workspace dependencies", () => {
  const shared = planChangedSurfaces(["packages/quipsly-domain/src/index.ts"]);
  const nestOnly = planChangedSurfaces(["packages/quipsly-document-kernel/src/index.ts"]);
  const webOnly = planChangedSurfaces(["packages/worldhub-domain/src/index.ts"]);
  const unrelated = planChangedSurfaces(["packages/motion-engine/src/index.ts"]);

  assert.deepEqual(shared.deployTargets, ["web", "studio"]);
  assert.deepEqual(nestOnly.deployTargets, ["studio"]);
  assert.deepEqual(webOnly.deployTargets, ["web"]);
  assert.deepEqual(unrelated.deployTargets, []);
});

test("Prisma schema changes deploy both apps and run schema sync", () => {
  const plan = planChangedSurfaces(["prisma/schema.prisma"]);

  assert.equal(plan.web, true);
  assert.equal(plan.studio, true);
  assert.equal(plan.schema, true);
});

test("root dependency changes deploy apps but do not invent a schema migration", () => {
  const plan = planChangedSurfaces(["pnpm-lock.yaml"]);

  assert.equal(plan.web, true);
  assert.equal(plan.studio, true);
  assert.equal(plan.schema, false);
});

test("workflow and Firebase emulator changes validate without deploying", () => {
  const plan = planChangedSurfaces([
    ".github/workflows/pr-tests.yml",
    "firebase.json",
  ]);

  assert.equal(plan.quipsly, true);
  assert.equal(plan.web, false);
  assert.equal(plan.studio, false);
  assert.equal(plan.schema, false);
});

test("path normalization is stable and deduplicated", () => {
  const plan = planChangedSurfaces([
    " apps/quipsly/src/app/page.tsx ",
    "apps/quipsly/src/app/page.tsx",
    "",
  ]);

  assert.equal(plan.changedPathCount, 1);
  assert.deepEqual(plan.paths, ["apps/quipsly/src/app/page.tsx"]);
});
