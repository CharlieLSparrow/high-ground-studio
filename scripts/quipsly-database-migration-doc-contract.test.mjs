import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [runbook, packageJson] = await Promise.all([
  readFile(
    new URL("../docs/deploy/database-migrations.md", import.meta.url),
    "utf8",
  ),
  readFile(new URL("../package.json", import.meta.url), "utf8").then(JSON.parse),
]);

test("migration runbook has one current migration-first release contract", () => {
  for (const required of [
    "scripts/release/quipsly-schema-release.sh",
    "scripts/quipsly-local-schema-fixture.mjs",
    "prisma migrate deploy",
    "production-to-schema diff to be zero",
    "Shared, retained-QA, preview, staging, and production databases never use",
  ]) {
    assert.match(
      runbook,
      new RegExp(required.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  }

  for (const retired of [
    "repo still has no checked-in Prisma migration history",
    "current repo-documented apply command remains",
    "prefer running `pnpm db:push`",
    "db push as a substitute for a real migration history forever",
  ]) {
    assert.doesNotMatch(
      runbook.toLowerCase(),
      new RegExp(
        retired
          .toLowerCase()
          .replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      ),
    );
  }
});

test("package exposes the fail-closed local schema fixture", () => {
  assert.equal(
    packageJson.scripts?.["quipsly:schema:fixture:local"],
    "node scripts/quipsly-local-schema-fixture.mjs",
  );
});
