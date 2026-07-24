#!/usr/bin/env node

import assert from "node:assert/strict";
import test from "node:test";

import {
  auditTrackedArtifacts,
  trackedArtifactReason,
} from "./audit-tracked-artifacts.mjs";

test("rejects generated caches, local databases, runtime state, and backups", () => {
  const paths = [
    "apps/api/__pycache__/server.cpython-313.pyc",
    "apps/web/.next/server/app.js",
    "apps/editor/DerivedData/build.log",
    "apps/quipsly/.next-release/server/app.js",
    "apps/studio/reports/render.pid",
    "apps/web/src/app/page.backup.tsx",
    "apps/web/next-env.d.ts",
    "dev.db",
    "pnpm-workspace.yaml.save",
  ];

  assert.deepEqual(
    auditTrackedArtifacts(paths).map(({ filePath }) => filePath),
    [...paths].sort(),
  );
});

test("accepts source, migrations, fixtures, and human-authored backup-domain code", () => {
  const paths = [
    "apps/quipsly/src/app/page.tsx",
    "apps/studio/script/build_backup_receipt.py",
    "packages/domain/src/index.ts",
    "prisma/migrations/20260724000000_receipts/migration.sql",
    "tests/fixtures/database.json",
  ];

  assert.deepEqual(auditTrackedArtifacts(paths), []);
});

test("normalizes Windows separators and deduplicates violations", () => {
  const audit = auditTrackedArtifacts([
    ".\\apps\\api\\__pycache__\\server.pyc",
    "apps/api/__pycache__/server.pyc",
  ]);

  assert.deepEqual(audit, [{
    filePath: "apps/api/__pycache__/server.pyc",
    reason: "generated dependency, build, or interpreter directory",
  }]);
});

test("does not reject filenames merely containing backup as a domain term", () => {
  assert.equal(trackedArtifactReason("scripts/build_backup_receipt.py"), null);
  assert.equal(
    trackedArtifactReason("apps/web/src/app/page.backup.tsx"),
    "editor backup file",
  );
});
