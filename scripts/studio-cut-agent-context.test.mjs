import assert from "node:assert/strict";
import { test } from "node:test";

import { buildAgentWorkspaceBrief } from "../apps/studio-cut-web/src/agentWorkspaceBrief.ts";

const manifest = {
  id: "episode-004",
  title: "Episode 004",
  durationMs: 12000,
  sources: {
    homer: { role: "homer", label: "Homer", fileName: "homer.proxy.mp4" },
    charlie: {
      role: "charlie",
      label: "Charlie",
      fileName: "charlie.proxy.mp4",
    },
    program: {
      role: "program",
      label: "Program",
      fileName: "source-monitor-proxy.mp4",
    },
  },
  sourceMonitorProxy: {
    localPlaceholderPath: "source-monitor-proxy.mp4",
    panes: {
      homer: { x: 0, y: 0, width: 0.5, height: 0.5 },
      charlie: { x: 0.5, y: 0, width: 0.5, height: 0.5 },
    },
  },
  syncBootstrap: {
    source: "premiere",
    notes: "Synthetic test manifest.",
  },
};

const events = [
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
    removedAt: "2026-05-24T00:01:00.000Z",
    removedBy: "codex@highgroundodyssey.com",
    operation: "remove",
  },
];

test("agent workspace brief summarizes room context without local object URLs", () => {
  const brief = buildAgentWorkspaceBrief({
    exportedAt: "2026-05-24T00:02:00.000Z",
    projectId: "episode-004",
    branchId: "main",
    roomUrl: "https://high-ground-odyssey.web.app/?projectId=episode-004&branchId=main",
    manifest,
    sourceDurationMs: 12000,
    currentSourceTimeMs: 3000,
    currentState: "both",
    localProxyVideo: {
      name: "source-monitor-proxy.mp4",
      sizeBytes: 1024,
      source: "local",
      storagePath: "blob:http://localhost/not-for-export",
    },
    persistenceStatus: {
      mode: "local_only",
      label: "Local only",
      detail: "Synthetic local-only test.",
      path: "studioCutProjects/episode-004/branches/main/decisionEvents",
    },
    sharedRoomMetadata: null,
    syncReview: {
      status: "not_attached",
      message: "No Sync Map attached.",
    },
    allDecisionEvents: events,
    derivedSegments: [
      {
        startSourceTimeMs: 0,
        endSourceTimeMs: 12000,
        state: "both",
        sourceEventId: "decision-001",
      },
    ],
    warnings: ["Synthetic warning."],
  });

  assert.equal(brief.schemaVersion, 1);
  assert.equal(brief.episode.id, "episode-004");
  assert.equal(brief.decisions.allCount, 2);
  assert.equal(brief.decisions.activeCount, 1);
  assert.equal(brief.decisions.tombstonedCount, 1);
  assert.equal(brief.media.sourceMonitorProxy.objectUrlPersisted, false);
  assert.equal(brief.media.sourceMonitorProxy.source, "local");
  assert.deepEqual(brief.agentOperationContract.supportedOperations, [
    "addDecision",
    "setRangeState",
    "removeDecision",
  ]);
  assert.equal(brief.agentOperationContract.setRangeStateExample.state, "cut");
  assert.equal(
    brief.agentOperationContract.setRangeStateExample.approvalRequired,
    true,
  );
  assert(brief.agentOperationContract.validStates.includes("both"));

  const serialized = JSON.stringify(brief);
  assert(!serialized.includes("blob:http://localhost"));
  assert(!serialized.includes("/private/tmp"));
});
