#!/usr/bin/env node

import assert from "node:assert/strict";
import test from "node:test";

import {
  auditBinaryChanges,
  isBinaryAssetPath,
} from "./audit-binary-assets.mjs";

test("recognizes shipping and source binary formats case-insensitively", () => {
  assert.equal(isBinaryAssetPath("apps/quipsly/hero.WEBP"), true);
  assert.equal(isBinaryAssetPath("apps/capture/recording.m4a"), true);
  assert.equal(isBinaryAssetPath("apps/quipsly/page.tsx"), false);
});

test("rejects a newly added binary over the per-file budget", () => {
  const audit = auditBinaryChanges([
    {
      status: "A",
      oldPath: null,
      newPath: "hero.png",
      oldSize: 0,
      newSize: 1_048_577,
    },
  ]);

  assert.equal(audit.ok, false);
  assert.equal(audit.oversized.length, 1);
});

test("rejects aggregate binary checkout growth over the total budget", () => {
  const audit = auditBinaryChanges(
    ["one.webp", "two.webp", "three.webp"].map((newPath) => ({
      status: "A",
      oldPath: null,
      newPath,
      oldSize: 0,
      newSize: 2_000_000,
    })),
    {
      maxFileBytes: 3_000_000,
      maxGrowthBytes: 5_000_000,
    },
  );

  assert.equal(audit.ok, false);
  assert.equal(audit.oversized.length, 0);
  assert.equal(audit.growthBytes, 6_000_000);
});

test("allows an oversized legacy binary to shrink", () => {
  const audit = auditBinaryChanges([
    {
      status: "M",
      oldPath: "legacy.png",
      newPath: "legacy.png",
      oldSize: 4_000_000,
      newSize: 2_000_000,
    },
  ]);

  assert.equal(audit.ok, true);
  assert.equal(audit.growthBytes, 0);
});

test("allows a pure rename without treating it as checkout growth", () => {
  const audit = auditBinaryChanges([
    {
      status: "R",
      oldPath: "old/hero.png",
      newPath: "new/hero.png",
      oldSize: 4_000_000,
      newSize: 4_000_000,
    },
  ]);

  assert.equal(audit.ok, true);
  assert.equal(audit.growthBytes, 0);
});

test("ignores deleted and non-binary files", () => {
  const audit = auditBinaryChanges([
    {
      status: "D",
      oldPath: "old.png",
      newPath: null,
      oldSize: 4_000_000,
      newSize: 0,
    },
    {
      status: "A",
      oldPath: null,
      newPath: "large.swift",
      oldSize: 0,
      newSize: 4_000_000,
    },
  ]);

  assert.equal(audit.ok, true);
  assert.equal(audit.assets.length, 0);
});
