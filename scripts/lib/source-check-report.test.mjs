import assert from "node:assert/strict";
import test from "node:test";
import { createSourceCheckReport } from "./source-check-report.mjs";

test("an empty report is not evidence of passing source checks", () => {
  const result = createSourceCheckReport().summary();
  assert.equal(result.ok, false);
  assert.equal(result.checkCount, 0);
});

test("source reports retain every failure and do not turn later passes into a green result", () => {
  const report = createSourceCheckReport();
  report.assert(false, "Missing permission", { missing: "NSMicrophoneUsageDescription" }, "Microphone purpose");
  report.assert(true, "Unrelated passing check");
  report.assert(false, "Signing mismatch", { expected: "app", actual: "other" });
  const result = report.summary();
  assert.equal(result.ok, false);
  assert.equal(result.checkCount, 3);
  assert.deepEqual(result.statusCounts, { pass: 1, fail: 2 });
  assert.deepEqual(result.failures.map((failure) => failure.label), ["Microphone purpose", "Signing mismatch"]);
  assert.equal(result.failures[0].details.missing, "NSMicrophoneUsageDescription");
  assert.equal(result.failures[1].details.actual, "other");
  assert.equal(report.checks.length, 3);
});

test("all passing checks produce a green source-only summary", () => {
  const report = createSourceCheckReport();
  report.assert(true, "One", { label: "Public label" });
  assert.deepEqual(report.summary(), {
    ok: true, checkCount: 1, statusCounts: { pass: 1, fail: 0 }, failures: [],
  });
  assert.equal(report.checks[0].label, "Public label");
});

test("reports are independent across runs", () => {
  const failed = createSourceCheckReport();
  failed.assert(false, "Failure");
  const next = createSourceCheckReport();
  next.assert(true, "Repaired");
  assert.equal(failed.summary().ok, false);
  assert.equal(next.summary().ok, true);
});
