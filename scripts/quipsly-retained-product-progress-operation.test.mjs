import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  parseArguments,
  requireLocalDatabaseUrl,
  requireRetainedEvidenceNote,
} from "./quipsly-retained-product-progress-operation.mjs";

test("retained progress operation accepts only explicit local PostgreSQL", () => {
  for (const host of ["127.0.0.1", "localhost", "[::1]"]) {
    assert.match(
      requireLocalDatabaseUrl(
        `postgresql://postgres:secret@${host}:5432/high_ground_studio`,
      ),
      /high_ground_studio/,
    );
  }
  for (const value of [
    "",
    "https://127.0.0.1/high_ground_studio",
    "postgresql://cloud.example.com/high_ground_studio",
    "postgresql://127.0.0.1",
  ]) {
    assert.throws(() => requireLocalDatabaseUrl(value));
  }
});

test("retained evidence is visibly labeled and bounded", () => {
  assert.equal(
    requireRetainedEvidenceNote("  QA Retained · schema proof passed  "),
    "QA Retained · schema proof passed",
  );
  assert.throws(() => requireRetainedEvidenceNote("schema proof passed"));
  assert.throws(() =>
    requireRetainedEvidenceNote(`QA Retained · ${"x".repeat(801)}`),
  );
  assert.deepEqual(parseArguments(["--note", "QA Retained · useful work"]), {
    help: false,
    note: "QA Retained · useful work",
  });
  assert.deepEqual(parseArguments(["--help"]), { help: true, note: "" });
});

test("retained operation has no product-artifact cleanup path", async () => {
  const source = await readFile(
    new URL("./quipsly-retained-product-progress-operation.mjs", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /deleteMany|delete\(|removeArtifact|cleanupArtifact/);
  assert.match(source, /artifactPreserved: true/);
  assert.match(source, /externalSideEffects: false/);
  assert.match(source, /already the latest retained progress receipt/);
  assert.match(source, /quipsly-portable-goal-restore-v1/);
});
