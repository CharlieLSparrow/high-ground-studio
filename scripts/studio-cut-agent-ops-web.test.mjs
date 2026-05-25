import assert from "node:assert/strict";
import { test } from "node:test";

import { buildAgentDecisionOpsPreview } from "../apps/studio-cut-web/src/agentDecisionOps.ts";

const currentEvents = [
  {
    id: "decision-001",
    projectId: "episode-004",
    branchId: "main",
    sourceTimeMs: 0,
    state: "both",
    createdBy: "charlie@highgroundodyssey.com",
    createdAt: "2026-05-24T00:00:00.000Z",
  },
  {
    id: "decision-002",
    projectId: "episode-004",
    branchId: "main",
    sourceTimeMs: 5000,
    state: "cut",
    createdBy: "charlie@highgroundodyssey.com",
    createdAt: "2026-05-24T00:00:01.000Z",
  },
];

test("agent operation preview adds decisions and tombstones removals", () => {
  const preview = buildAgentDecisionOpsPreview({
    fileName: "episode-004-agent-ops.json",
    currentEvents,
    projectId: "episode-004",
    branchId: "main",
    createdBy: "codex@highgroundodyssey.com",
    sourceDurationMs: 12000,
    clientId: "test-session",
    now: "2026-05-24T00:01:00.000Z",
    payload: {
      schemaVersion: 1,
      projectId: "episode-004",
      branchId: "main",
      operations: [
        {
          op: "removeDecision",
          id: "decision-002",
          reason: "Synthetic restore.",
        },
        {
          op: "addDecision",
          id: "decision-003",
          sourceTimeMs: 9000,
          state: "charlie_clip",
          note: "Synthetic agent cutaway.",
        },
      ],
    },
  });

  assert.deepEqual(preview.errors, []);
  assert.equal(preview.operationCount, 2);
  assert.equal(preview.addCount, 1);
  assert.equal(preview.removeCount, 1);
  assert.equal(preview.activeDecisionCountAfterApply, 2);
  assert.equal(preview.tombstonedDecisionCountAfterApply, 1);
  assert.equal(preview.summaries.length, 2);

  const removed = preview.decisionEvents.find((event) => event.id === "decision-002");
  const added = preview.decisionEvents.find((event) => event.id === "decision-003");

  assert.equal(removed.operation, "remove");
  assert.equal(removed.removedBy, "codex@highgroundodyssey.com");
  assert.match(removed.note, /Agent remove/);
  assert.equal(added.state, "charlie_clip");
  assert.equal(added.createdBy, "codex@highgroundodyssey.com");
});

test("agent operation preview applies bounded range state changes with restore metadata", () => {
  const preview = buildAgentDecisionOpsPreview({
    fileName: "episode-004-agent-range-ops.json",
    currentEvents,
    projectId: "episode-004",
    branchId: "main",
    createdBy: "codex@highgroundodyssey.com",
    sourceDurationMs: 12000,
    clientId: "test-session",
    now: "2026-05-24T00:01:00.000Z",
    payload: {
      schemaVersion: 1,
      projectId: "episode-004",
      branchId: "main",
      operations: [
        {
          op: "setRangeState",
          id: "agent-range-start",
          restoreId: "agent-range-restore",
          startSourceTimeMs: 7000,
          endSourceTimeMs: 9000,
          state: "cut",
          restoreState: "both",
          note: "Synthetic filler trim.",
          confidence: 0.42,
          approvalRequired: true,
          reason: "Repeated filler markers.",
        },
      ],
    },
  });

  assert.deepEqual(preview.errors, []);
  assert.equal(preview.operationCount, 1);
  assert.equal(preview.addCount, 0);
  assert.equal(preview.rangeCount, 1);
  assert.equal(preview.approvalRequiredCount, 1);
  assert.match(preview.summaries[0], /42% confidence/);

  const rangeStart = preview.decisionEvents.find(
    (event) => event.id === "agent-range-start",
  );
  const rangeRestore = preview.decisionEvents.find(
    (event) => event.id === "agent-range-restore",
  );

  assert.equal(rangeStart.state, "cut");
  assert.equal(rangeStart.sourceTimeMs, 7000);
  assert.match(rangeStart.note, /Agent range reason/);
  assert.equal(rangeRestore.state, "both");
  assert.equal(rangeRestore.sourceTimeMs, 9000);
});

test("agent operation preview blocks wrong room and missing targets", () => {
  const preview = buildAgentDecisionOpsPreview({
    fileName: "wrong-room-agent-ops.json",
    currentEvents,
    projectId: "episode-004",
    branchId: "main",
    createdBy: "codex@highgroundodyssey.com",
    sourceDurationMs: 12000,
    clientId: "test-session",
    now: "2026-05-24T00:01:00.000Z",
    payload: {
      schemaVersion: 1,
      projectId: "episode-005",
      branchId: "main",
      operations: [
        {
          op: "removeDecision",
          id: "missing-decision",
        },
      ],
    },
  });

  assert.equal(preview.errors.length, 2);
  assert.match(preview.errors[0], /does not match active room/);
  assert.match(preview.errors[1], /does not match an active decision/);
});
