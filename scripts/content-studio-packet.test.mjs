import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildContentStudioBrowserPacket,
  CONTENT_STUDIO_PACKET_KIND,
  CONTENT_STUDIO_SCHEMA_VERSION,
  createContentStudioProjectHandoff,
  getContentStudioProjectProgress,
  normalizeContentStudioWorkspace,
  parseContentStudioPacket,
} from "../apps/studio/src/app/content-studio/content-studio-model.ts";

const createdAt = "2026-05-24T01:00:00.000Z";

function createTask(id, label, done = false) {
  return {
    id,
    label,
    done,
  };
}

function createWorkspace() {
  return {
    schemaVersion: CONTENT_STUDIO_SCHEMA_VERSION,
    updatedAt: createdAt,
    projects: [
      {
        id: "project-podcast-1",
        title: "Podcast production packet",
        kind: "podcast",
        priority: "primary",
        status: "active",
        activeStage: "produce",
        updatedAt: createdAt,
        notes: "Synthetic packet for export/import validation.",
        stages: {
          source: [
            createTask("task-source-1", "Collect synthetic transcript", true),
          ],
          shape: [createTask("task-shape-1", "Confirm episode thesis", true)],
          produce: [
            createTask("task-produce-1", "Run rough edit pass", false),
            createTask("task-produce-2", "Prepare publish assets", false),
          ],
          publish: [
            createTask("task-publish-1", "Generate episode page packet", false),
          ],
          "follow-through": [
            createTask("task-loop-1", "Capture analytics notes", false),
          ],
        },
      },
    ],
  };
}

test("normalizes a valid Content Studio workspace", () => {
  const workspace = createWorkspace();

  assert.deepEqual(normalizeContentStudioWorkspace(workspace), workspace);
});

test("rejects a workspace with invalid schema version", () => {
  assert.equal(
    normalizeContentStudioWorkspace({
      ...createWorkspace(),
      schemaVersion: 99,
    }),
    null,
  );
});

test("computes project progress and next handoff action", () => {
  const [project] = createWorkspace().projects;
  const progress = getContentStudioProjectProgress(project);
  const handoff = createContentStudioProjectHandoff(project);

  assert.deepEqual(progress, {
    done: 2,
    total: 6,
    percentage: 33,
  });
  assert.equal(handoff.nextAction, "Run rough edit pass");
  assert.equal(handoff.readyToPublish, false);
  assert.deepEqual(handoff.incompleteByStage.produce, [
    "Run rough edit pass",
    "Prepare publish assets",
  ]);
});

test("builds and parses a safe browser handoff packet", () => {
  const workspace = createWorkspace();
  const packet = buildContentStudioBrowserPacket({
    workspace,
    actorLabel: "Studio Operator",
    exportedAt: "2026-05-24T01:30:00.000Z",
  });
  const result = parseContentStudioPacket(packet);

  assert.equal(packet.kind, CONTENT_STUDIO_PACKET_KIND);
  assert.equal(packet.safety.browserLocalOnly, true);
  assert.equal(packet.safety.persistedToServer, false);
  assert.equal(packet.safety.providerCalls, false);
  assert.equal(packet.safety.publicPublished, false);
  assert.equal(packet.safety.containsRealManuscriptText, false);
  assert.equal(packet.projectHandoffs.length, 1);

  assert.equal(result.ok, true);

  if (result.ok) {
    assert.deepEqual(result.workspace, workspace);
    assert.deepEqual(result.warnings, []);
  }
});

test("parses raw workspace JSON with a warning", () => {
  const result = parseContentStudioPacket(createWorkspace());

  assert.equal(result.ok, true);

  if (result.ok) {
    assert.equal(result.workspace.projects.length, 1);
    assert.deepEqual(result.warnings, [
      "Imported a raw Content Studio workspace without packet metadata.",
    ]);
  }
});

test("blocks unsafe imported packets", () => {
  const packet = buildContentStudioBrowserPacket({
    workspace: createWorkspace(),
    actorLabel: "Studio Operator",
  });
  const result = parseContentStudioPacket({
    ...packet,
    safety: {
      ...packet.safety,
      providerCalls: true,
      publicPublished: true,
      containsRealManuscriptText: true,
    },
  });

  assert.equal(result.ok, false);

  if (!result.ok) {
    assert.deepEqual(result.errors, [
      "Packet cannot be imported after provider calls.",
      "Packet cannot be imported after public publishing.",
      "Packet cannot claim to contain real manuscript text.",
    ]);
  }
});
