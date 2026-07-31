import assert from "node:assert/strict";
import test from "node:test";

import { summarizeBackupReadback } from "./quipsly-cloud-sql-backup-readback.mjs";

const expected = {
  project: "high-ground-odyssey",
  instance: "studio-postgres",
  description: "quipsly-before-abcdef123456-20260731T120000Z",
};

function backup(overrides = {}) {
  return {
    id: "1753984800000",
    instance: "studio-postgres",
    selfLink: "https://sqladmin.googleapis.com/sql/v1beta4/projects/high-ground-odyssey/instances/studio-postgres/backupRuns/1753984800000",
    description: expected.description,
    status: "SUCCESSFUL",
    type: "ON_DEMAND",
    startTime: "2026-07-31T12:00:00.000Z",
    endTime: "2026-07-31T12:03:00.000Z",
    ...overrides,
  };
}

test("returns a redacted receipt for one exact successful on-demand backup", () => {
  const receipt = summarizeBackupReadback([backup(), backup({ id: "other", description: "scheduled" })], expected);
  assert.equal(receipt.passed, true);
  assert.equal(receipt.id, "1753984800000");
  assert.equal(receipt.status, "SUCCESSFUL");
  assert.equal(receipt.type, "ON_DEMAND");
  assert.equal(receipt.project, "high-ground-odyssey");
  assert.equal(receipt.instance, "studio-postgres");
  assert.equal("selfLink" in receipt, false);
});

test("accepts project and instance identity from resource links", () => {
  const value = backup({ instance: undefined });
  const receipt = summarizeBackupReadback(value, { ...expected, id: "1753984800000" });
  assert.equal(receipt.id, "1753984800000");
});

test("fails closed on ambiguous exact matches", () => {
  assert.throws(
    () => summarizeBackupReadback([backup(), backup()], expected),
    /exactly one backup/,
  );
});

test("fails closed on incomplete, failed, scheduled, or wrong-target backups", () => {
  assert.throws(() => summarizeBackupReadback(backup({ status: "RUNNING" }), expected), /not successful/);
  assert.throws(() => summarizeBackupReadback(backup({ type: "AUTOMATED" }), expected), /not on-demand/);
  assert.throws(() => summarizeBackupReadback(backup({ instance: "other" }), expected), /found 0/);
  assert.throws(
    () => summarizeBackupReadback(backup({ selfLink: backup().selfLink.replace("high-ground-odyssey", "other-project") }), expected),
    /project other-project/,
  );
});
