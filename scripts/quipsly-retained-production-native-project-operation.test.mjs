import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  assertCanonicalProductionReadback,
  parseArguments,
  requireArtifactPath,
  requireProductionOrigin,
  requireRetainedLabel,
} from "./quipsly-retained-production-native-project-operation.mjs";

const options = {
  projectName: "QA Retained · Production project",
  taskTitle: "QA Retained · Production task",
  tagLabel: "QA Retained · Production system",
};
const repoRoot = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");

function canonicalFixture() {
  const project = {
    id: "project-1",
    slug: "qa-retained-production-project",
    name: options.projectName,
    role: "OWNER",
    canWrite: true,
    isHomeNest: false,
  };
  const tag = {
    id: "tag-1",
    projectId: project.id,
    label: options.tagLabel,
    isActive: true,
    archivedAt: null,
    usageCount: 3,
  };
  const tagged = { tagIds: [tag.id], tagLabels: [tag.label] };
  return {
    rootWork: {
      ok: true,
      workspaceKind: "quipsly-mobile-work-v1",
      projects: [project],
    },
    projectWork: {
      ok: true,
      selectedProjectId: project.id,
      workspace: {
        project,
        tasks: [{ id: "task-1", title: options.taskTitle, status: "OPEN", roomId: null, ...tagged }],
        notes: [{
          id: "note-1",
          stableId: "mobile-note-1",
          title: `${options.taskTitle} · note`,
          contentRevision: "a".repeat(64),
          blocks: [{ id: "block-1", body: "Retained." }],
          canEditContent: true,
          webPath: "/create?project=qa-retained-production-project&document=note-1",
          ...tagged,
        }],
        goals: [{ id: "goal-1", title: `${options.taskTitle} · goal`, status: "ACTIVE", roomId: null, ...tagged }],
        tags: [tag],
      },
      boundaries: {
        actorScoped: true,
        ownedGoalsOnly: true,
        explicitProjectGrantRequired: true,
        protectedOfflineSnapshotSupported: true,
        canonicalProjectRecords: true,
        canonicalProjectTags: true,
        onlineVocabularyManagement: true,
        unreviewedTranscriptCandidatesExcluded: true,
        mutationsUseExistingProtectedOutboxes: true,
        sourceMutated: false,
        externalSideEffects: false,
      },
    },
  };
}

test("production operation accepts only the exact credential-free Nest origin", () => {
  assert.equal(requireProductionOrigin("https://nest.quipsly.com/"), "https://nest.quipsly.com");
  for (const value of [
    "http://nest.quipsly.com",
    "https://preview.example.com",
    "https://user:pass@nest.quipsly.com",
    "https://nest.quipsly.com/work",
    "https://nest.quipsly.com?test=1",
  ]) {
    assert.throws(() => requireProductionOrigin(value));
  }
});

test("production operation requires visible labels and private external evidence paths", () => {
  assert.equal(
    requireRetainedLabel(" QA Retained · useful   system ", { label: "Project", max: 120 }),
    "QA Retained · useful system",
  );
  assert.throws(() => requireRetainedLabel("Hidden fixture", { label: "Project", max: 120 }));
  assert.equal(
    requireArtifactPath("/private/tmp/qa-operation.xcresult", { label: "Result", extension: ".xcresult" }),
    "/private/tmp/qa-operation.xcresult",
  );
  assert.throws(() => requireArtifactPath("relative.json", { label: "Receipt", extension: ".json" }));
  assert.throws(() => requireArtifactPath(
    `${repoRoot}/artifacts/receipt.json`,
    { label: "Receipt", extension: ".json" },
  ));
  assert.deepEqual(parseArguments([
    "--",
    "--project", options.projectName,
    "--task", options.taskTitle,
    "--tag", options.tagLabel,
    "--result-bundle", "/private/tmp/operation.xcresult",
    "--receipt", "/private/tmp/operation.json",
  ]), {
    help: false,
    ...options,
    resultBundle: "/private/tmp/operation.xcresult",
    receipt: "/private/tmp/operation.json",
  });
});

test("production readback proves one private cross-device record system", () => {
  const fixture = canonicalFixture();
  const records = assertCanonicalProductionReadback({ ...fixture, options });
  assert.equal(records.project.id, "project-1");
  assert.equal(records.task.id, "task-1");
  assert.equal(records.note.stableId, "mobile-note-1");
  assert.equal(records.goal.id, "goal-1");
  assert.equal(records.tag.usageCount, 3);

  const broken = canonicalFixture();
  broken.projectWork.workspace.notes[0].tagIds = ["tag-other"];
  assert.throws(() => assertCanonicalProductionReadback({ ...broken, options }), /Note did not reuse/);
});

test("production operation uses the compiled app, preserves product artifacts, and emits no secrets", async () => {
  const [source, runner, nativeTest] = await Promise.all([
    readFile(new URL("./quipsly-retained-production-native-project-operation.mjs", import.meta.url), "utf8"),
    readFile(new URL("../apps/mobile-capture/HighGroundCapture/scripts/run-capture-runtime-ui-smoke.sh", import.meta.url), "utf8"),
    readFile(new URL("../apps/mobile-capture/HighGroundCapture/HighGroundCaptureUITests/CaptureRoomRuntimeSmokeTests.swift", import.meta.url), "utf8"),
  ]);
  assert.match(source, /QUIPSLY_CAPTURE_UI_TEST_MODE: "project-create"/);
  assert.match(source, /RELEASED_CAPTURE_BUILD = 25/);
  assert.match(source, /readRetainedQAPassword/);
  assert.match(source, /credentialsPrinted: false/);
  assert.match(source, /tokensPrinted: false/);
  assert.match(source, /cleanupPerformed: false/);
  assert.match(source, /artifactPreserved: true/);
  assert.match(source, /writePrivateAtomicReceipt/);
  assert.doesNotMatch(source, /deleteMany|cleanupArtifact|removeArtifact/);
  assert.match(runner, /project-create\)/);
  assert.match(nativeTest, /testIPhoneCreatesRetainedProjectAndOrganizesCanonicalWork/);
  assert.match(nativeTest, /kind: "TASK"/);
  assert.match(nativeTest, /kind: "NOTE"/);
  assert.match(nativeTest, /kind: "GOAL"/);
});
