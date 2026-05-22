import assert from "node:assert/strict";
import { test } from "node:test";

import {
  deriveSegments,
  getActiveDecisionEvents,
  isDecisionEvent,
  mergeDecisionEvents,
  parseDecisionEventsPayload,
} from "../packages/studio-cut-schema/src/index.ts";

const baseEvent = {
  id: "decision-1",
  projectId: "episode-004",
  branchId: "main",
  sourceTimeMs: 0,
  state: "both",
  createdBy: "charlie@highgroundodyssey.com",
  createdAt: "2026-05-22T12:00:00.000Z",
  clientId: "session-charlie",
  operation: "upsert",
};

test("tombstoned decisions parse but are ignored by derived segments", () => {
  const tombstonedEvent = {
    ...baseEvent,
    removedAt: "2026-05-22T12:01:00.000Z",
    removedBy: "charlie@highgroundodyssey.com",
    operation: "remove",
  };

  assert.equal(isDecisionEvent(tombstonedEvent), true);
  assert.deepEqual(getActiveDecisionEvents([tombstonedEvent]), []);
  assert.deepEqual(deriveSegments([tombstonedEvent]), []);
});

test("remote decision merge dedupes by id and keeps the latest event version", () => {
  const tombstonedEvent = {
    ...baseEvent,
    removedAt: "2026-05-22T12:01:00.000Z",
    removedBy: "mako@highgroundodyssey.com",
    operation: "remove",
  };

  const mergedEvents = mergeDecisionEvents([baseEvent, tombstonedEvent]);

  assert.equal(mergedEvents.length, 1);
  assert.equal(mergedEvents[0].removedBy, "mako@highgroundodyssey.com");
  assert.deepEqual(getActiveDecisionEvents(mergedEvents), []);
});

test("decision JSON import accepts collaboration attribution fields", () => {
  const result = parseDecisionEventsPayload({
    decisionEvents: [
      {
        ...baseEvent,
        clientId: "session-mako",
        operation: "import",
      },
    ],
  });

  assert.equal(result.rejectedCount, 0);
  assert.equal(result.events[0].clientId, "session-mako");
  assert.equal(result.events[0].operation, "import");
});
