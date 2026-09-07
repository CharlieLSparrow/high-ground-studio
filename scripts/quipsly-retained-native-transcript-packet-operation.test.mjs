import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  EXPECTED_SOURCE_TEXT,
  packetEvidence,
  requireLoopbackOrigin,
} from "./quipsly-retained-native-transcript-packet-operation.mjs";

function packetFixture() {
  const segmentIds = ["passage-1", "passage-2", "passage-3"];
  return {
    ok: true,
    boundaries: { sideEffectFreeRead: true },
    packet: {
      status: "RESULTS_READY",
      build: { packetBuildId: "build-1" },
      summary: { id: "summary-1", body: "A useful recap", source: { packetTemplateVersion: "quipsly-session-packet-v4" } },
      highlights: [{ id: "highlight-1", body: "My own edited highlight" }],
      results: { tasks: [{ id: "saved-task-1", title: "Write one page" }] },
      noteCandidates: [{ id: "idea-note", committedNoteId: "saved-note", sourceText: "A thought" }],
      actionCandidates: [{ id: "idea-task", committedActionItemId: "saved-task-1", sourceText: "Write one page" }],
      goalCandidates: [{
        id: "idea-goal", committedGoalId: null, sourceText: EXPECTED_SOURCE_TEXT,
        segmentIds,
        sourceSpan: { segments: segmentIds.map((segmentId) => ({ segmentId, providerTextSha256: `hash-${segmentId}` })) },
      }],
    },
  };
}

test("local packet inspection accepts ordinary saved work without requiring an empty review queue", () => {
  const body = packetFixture();
  const original = structuredClone(body);
  const evidence = packetEvidence(body);
  assert.equal(evidence.completeGoalSegmentCount, 3);
  assert.equal(evidence.notes[0].committedNoteId, "saved-note");
  assert.equal(evidence.actions[0].committedActionItemId, "saved-task-1");
  assert.equal(packetEvidence(structuredClone(body)).digest, evidence.digest);
  assert.deepEqual(body, original, "Evidence extraction must not mutate the response.");
});

test("a previously added goal is legitimate existing work, not an inspection failure", () => {
  const body = packetFixture();
  body.packet.goalCandidates[0].committedGoalId = "saved-goal";
  assert.equal(packetEvidence(body).goals[0].committedGoalId, "saved-goal");
});

for (const [label, change] of [
  ["note materialization", (p) => { p.noteCandidates[0].committedNoteId = "different-note"; }],
  ["task materialization", (p) => { p.actionCandidates[0].committedActionItemId = "different-task"; }],
  ["goal materialization", (p) => { p.goalCandidates[0].committedGoalId = "saved-goal"; }],
  ["source receipt", (p) => { p.goalCandidates[0].sourceSpan.segments[0].providerTextSha256 = "changed"; }],
  ["candidate source text", (p) => { p.noteCandidates[0].sourceText = "Changed words"; }],
  ["summary text", (p) => { p.summary.body = "Changed recap"; }],
  ["edited highlight", (p) => { p.highlights[0].body = "Lost the user's edit"; }],
  ["saved task title", (p) => { p.results.tasks[0].title = "Changed task"; }],
]) {
  test(`readback detects changed ${label}`, () => {
    const body = packetFixture();
    const before = packetEvidence(body);
    change(body.packet);
    assert.notEqual(packetEvidence(body).digest, before.digest);
  });
}

for (const status of ["PRIVATE_REVIEWER_ONLY", "NOT_READY", "TRANSCRIPT_HELD", "READY_FOR_REVIEW"]) {
  test(`unusable fixture ${status} fails before claiming native operation evidence`, () => {
    const body = packetFixture();
    body.packet.status = status;
    assert.throws(() => packetEvidence(body), /Restore or replace the local fixture; this is not native UI evidence/);
  });
}

test("missing source text, truncated spans, obsolete versions, and mutating reads fail", () => {
  for (const change of [
    (b) => { b.packet.goalCandidates[0].sourceText = "Only part of the thought"; },
    (b) => { b.packet.goalCandidates[0].segmentIds.pop(); },
    (b) => { b.packet.goalCandidates[0].sourceSpan.segments.pop(); },
    (b) => { b.packet.summary.source.packetTemplateVersion = "old-version"; },
    (b) => { b.boundaries.sideEffectFreeRead = false; },
  ]) {
    const body = packetFixture();
    change(body);
    assert.throws(() => packetEvidence(body));
  }
});

test("the operator cannot authenticate or inspect a non-local service", () => {
  for (const value of ["https://nest.quipsly.com", "http://example.com", "https://localhost", "http://127.0.0.1.example.com"]) {
    assert.throws(() => requireLoopbackOrigin(value, "Test"));
  }
  for (const value of ["127.0.0.1:9099", "http://localhost:3012", "http://[::1]:3012"]) {
    assert.match(requireLoopbackOrigin(value, "Test"), /^http:/);
  }
});

test("operator still routes to the compiled native journey and checks unchanged readback", async () => {
  // Wiring only. Product behavior is exercised by the XCTest, not source wording.
  const operator = await readFile(new URL("./quipsly-retained-native-transcript-packet-operation.mjs", import.meta.url), "utf8");
  const runner = await readFile(new URL("../apps/mobile-capture/HighGroundCapture/scripts/run-capture-runtime-ui-smoke.sh", import.meta.url), "utf8");
  assert.match(operator, /QUIPSLY_CAPTURE_UI_TEST_MODE: "transcript-packet-span"/);
  assert.match(runner, /testRetainedSessionShowsCompleteMultiSegmentPacketOnIPhone/);
  assert.match(operator, /after\.digest === before\.digest/);
  assert.doesNotMatch(operator, /transcripts\/packet\/(?:actions|goals|notes)/);
});
