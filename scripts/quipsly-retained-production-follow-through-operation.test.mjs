import test from "node:test";
import assert from "node:assert/strict";

import {
  parseArguments,
  requirePriorWebReadback,
} from "./quipsly-retained-production-follow-through-operation.mjs";

const nativePath = "/Volumes/QA/native.json";
const webPath = "/Volumes/QA/web/readback.json";
const outputPath = "/Volumes/QA/follow-through";
const records = {
  project: { id: "project-1" },
  task: { id: "task-1" },
  note: { id: "note-1" },
  goal: { id: "goal-1" },
  tag: { id: "tag-1" },
};

test("parses an explicit external, future, ordered production operation", () => {
  const base = Date.now() + 4 * 3_600_000;
  const parsed = parseArguments([
    "--native-receipt", nativePath,
    "--prior-web-receipt", webPath,
    "--output-dir", outputPath,
    "--operation-key", "production-follow-through-a",
    "--remind-at", new Date(base).toISOString(),
    "--focus-start", new Date(base + 15 * 60_000).toISOString(),
    "--due-at", new Date(base + 2 * 3_600_000).toISOString(),
  ]);
  assert.equal(parsed.nativeReceipt, nativePath);
  assert.equal(parsed.priorWebReceipt, webPath);
  assert.equal(parsed.outputDir, outputPath);
  assert.equal(parsed.operationKey, "production-follow-through-a");
});

test("rejects a reminder after the planned focus start", () => {
  const base = Date.now() + 4 * 3_600_000;
  assert.throws(() => parseArguments([
    "--native-receipt", nativePath,
    "--prior-web-receipt", webPath,
    "--output-dir", outputPath,
    "--operation-key", "production-follow-through-a",
    "--remind-at", new Date(base + 30 * 60_000).toISOString(),
    "--focus-start", new Date(base).toISOString(),
    "--due-at", new Date(base + 2 * 3_600_000).toISOString(),
  ]), /Reminder must not follow/);
});

test("requires the prior readback to prove the same IDs and read-only boundary", () => {
  const native = { records };
  const prior = {
    schema: "quipsly-retained-production-project-web-readback-v1",
    ok: true,
    origin: "https://nest.quipsly.com",
    nativeReceipt: nativePath,
    records: {
      project: { id: "project-1" },
      task: { id: "task-1" },
      note: { id: "note-1" },
      goal: { id: "goal-1" },
      tag: { id: "tag-1" },
    },
    boundaries: {
      productRecordsChanged: false,
      externalSideEffects: false,
      browserExceptions: 0,
      serverFailures: 0,
    },
  };
  assert.equal(requirePriorWebReadback(prior, nativePath, native), prior);
  assert.throws(() => requirePriorWebReadback({ ...prior, records: { ...prior.records, task: { id: "task-2" } } }, nativePath, native), /same stable production records/);
  assert.throws(() => requirePriorWebReadback({ ...prior, boundaries: { ...prior.boundaries, productRecordsChanged: true } }, nativePath, native), /read-only/);
});
