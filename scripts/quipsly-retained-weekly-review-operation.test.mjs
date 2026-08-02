import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { currentWeekStartsAt, requireLocalDatabaseUrl } from "./quipsly-retained-weekly-review-operation.mjs";

test("retained weekly review accepts only explicit loopback PostgreSQL", () => {
  for (const host of ["127.0.0.1", "localhost", "[::1]"]) {
    assert.match(requireLocalDatabaseUrl(`postgresql://postgres:secret@${host}:5432/high_ground_studio`), /high_ground_studio/);
  }
  for (const value of ["", "https://127.0.0.1/high_ground_studio", "postgresql://cloud.example.com/high_ground_studio", "postgresql://127.0.0.1"]) {
    assert.throws(() => requireLocalDatabaseUrl(value));
  }
});

test("week identity is deterministic Monday noon UTC", () => {
  assert.equal(currentWeekStartsAt(new Date("2026-08-02T14:00:00.000Z")).toISOString(), "2026-07-27T12:00:00.000Z");
  assert.equal(currentWeekStartsAt(new Date("2026-08-03T01:00:00.000Z")).toISOString(), "2026-08-03T12:00:00.000Z");
});

test("retained operation preserves artifacts and forbids external effects", async () => {
  const source = await readFile(new URL("./quipsly-retained-weekly-review-operation.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /deleteMany|delete\(|removeArtifact|cleanupArtifact/);
  assert.match(source, /artifactPreserved: true/);
  assert.match(source, /externalSideEffects: false/);
  assert.match(source, /outsiderDenied: true/);
  assert.match(source, /targetStatusMutated === false/);
});
