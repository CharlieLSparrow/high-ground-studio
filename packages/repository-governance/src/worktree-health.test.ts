import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeWorktreeHealth,
  classifyWorktreePathKind,
  classifyWorktreeSurface,
  formatWorktreeHealth,
  mergeWorktreeChanges,
  parseNameStatusZ,
} from "./worktree-health.ts";

test("classifies product ownership without turning the monorepo into one surface", () => {
  assert.equal(
    classifyWorktreeSurface("apps/mobile-capture/HighGroundCapture/HighGroundCapture/App.swift"),
    "capture",
  );
  assert.equal(classifyWorktreeSurface("apps/quipsly/src/app/page.tsx"), "nest");
  assert.equal(classifyWorktreeSurface("apps/QuipslyStudio/Sources/App.swift"), "quipsly-studio");
  assert.equal(classifyWorktreeSurface("apps/web/src/app/page.tsx"), "hgo-web");
  assert.equal(classifyWorktreeSurface("packages/quipsly-domain/src/core.ts"), "shared-contracts");
  assert.equal(classifyWorktreeSurface(".github/workflows/pr-tests.yml"), "repository");
});

test("distinguishes source from generated evidence, caches, media, and binary assets", () => {
  assert.equal(classifyWorktreePathKind("apps/quipsly/src/app/page.tsx"), "source");
  assert.equal(classifyWorktreePathKind("apps/quipsly/src/app/page.test.ts"), "test");
  assert.equal(classifyWorktreePathKind("docs/architecture/system.md"), "documentation");
  assert.equal(classifyWorktreePathKind("apps/QuipslyStudio/reports/listen.json"), "generated-evidence");
  assert.equal(classifyWorktreePathKind("apps/quipsly/.next/server/app.js"), "cache-or-build");
  assert.equal(classifyWorktreePathKind("apps/QuipslyStudio/media/episode.wav"), "binary-media");
  assert.equal(classifyWorktreePathKind("apps/quipsly/public/hero.png"), "binary-asset");
});

test("parses NUL-delimited rename and space-containing Git records", () => {
  const parsed = parseNameStatusZ(
    "M\0docs/with a space.md\0R100\0old name.ts\0new name.ts\0",
    "staged",
  );
  assert.deepEqual(parsed, [
    { path: "docs/with a space.md", states: ["staged"] },
    { path: "new name.ts", originalPath: "old name.ts", states: ["staged"] },
  ]);
});

test("merges staged and unstaged state without losing rename provenance", () => {
  const merged = mergeWorktreeChanges([
    [{ path: "apps/quipsly/src/app/page.tsx", states: ["staged"] }],
    [{ path: "apps/quipsly/src/app/page.tsx", states: ["unstaged"] }],
    [{ path: "new.swift", originalPath: "old.swift", states: ["staged"] }],
  ]);
  assert.deepEqual(merged, [
    {
      path: "apps/quipsly/src/app/page.tsx",
      states: ["staged", "unstaged"],
    },
    {
      path: "new.swift",
      states: ["staged"],
      originalPath: "old.swift",
    },
  ]);
});

test("reports cross-surface and generated-state risk without deleting or guessing", () => {
  const report = analyzeWorktreeHealth([
    {
      path: "apps/mobile-capture/HighGroundCapture/HighGroundCapture/App.swift",
      states: ["unstaged"],
      sizeBytes: 1_000,
    },
    {
      path: "apps/QuipslyStudio/reports/episode proof.json",
      states: ["untracked"],
      sizeBytes: 2_000_000,
    },
    {
      path: "apps/quipsly/.next/server/app.js",
      states: ["untracked"],
      sizeBytes: 2_000,
    },
  ], {
    activeSurface: "capture",
    maxDirtyPaths: 2,
  });

  assert.equal(report.health, "attention");
  assert.equal(report.totalPaths, 3);
  assert.deepEqual(report.issueCounts, [
    { code: "cache-or-build-in-worktree", count: 1 },
    { code: "dirty-path-budget-exceeded", count: 1 },
    { code: "generated-evidence-in-source", count: 1 },
    { code: "large-untracked-file", count: 1 },
    { code: "unexpected-active-surface", count: 2 },
  ]);
  assert.equal(report.strictFailure, true);
  const output = formatWorktreeHealth(report);
  assert.match(output, /Preserve evidence first/);
  assert.doesNotMatch(output, /git clean|reset --hard|rm -rf/);
});

test("a clean worktree is represented as clean evidence", () => {
  const report = analyzeWorktreeHealth([]);
  assert.equal(report.health, "clean");
  assert.equal(report.strictFailure, false);
  assert.equal(report.totalPaths, 0);
});
