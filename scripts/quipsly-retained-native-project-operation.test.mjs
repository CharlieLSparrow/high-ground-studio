import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  parseArguments,
  requireLocalDatabaseUrl,
  requireLoopbackOrigin,
  requireRetainedLabel,
} from "./quipsly-retained-native-project-operation.mjs";

test("retained native project operation accepts only local product boundaries", () => {
  assert.equal(
    requireLoopbackOrigin("http://127.0.0.1:3012"),
    "http://127.0.0.1:3012",
  );
  assert.equal(
    requireLoopbackOrigin("http://localhost:3012/"),
    "http://localhost:3012",
  );
  assert.throws(() => requireLoopbackOrigin("https://nest.quipsly.com"));
  assert.throws(() => requireLoopbackOrigin("http://user:pass@127.0.0.1:3012"));
  assert.match(
    requireLocalDatabaseUrl(
      "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio",
    ),
    /high_ground_studio/,
  );
  assert.throws(() =>
    requireLocalDatabaseUrl("postgresql://cloud.example.com/quipsly"),
  );
});

test("retained native project artifacts require visible bounded labels", () => {
  assert.equal(
    requireRetainedLabel(" QA Retained · useful   project ", {
      label: "Project",
      max: 120,
    }),
    "QA Retained · useful project",
  );
  assert.throws(() =>
    requireRetainedLabel("Hidden fixture", { label: "Project", max: 120 }),
  );
  assert.throws(() =>
    requireRetainedLabel(`QA Retained · ${"x".repeat(120)}`, {
      label: "Project",
      max: 120,
    }),
  );
  assert.deepEqual(
    parseArguments([
      "--",
      "--project",
      "QA Retained · Project",
      "--task",
      "QA Retained · Task",
      "--tag",
      "QA Retained · Tag",
    ]),
    {
      help: false,
      projectName: "QA Retained · Project",
      taskTitle: "QA Retained · Task",
      tagLabel: "QA Retained · Tag",
      resultBundle: null,
    },
  );
});

test("retained native project operation preserves artifacts and uses the compiled app", async () => {
  const [source, runner, nativeTest, shell] = await Promise.all([
    readFile(
      new URL(
        "./quipsly-retained-native-project-operation.mjs",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../apps/mobile-capture/HighGroundCapture/scripts/run-capture-runtime-ui-smoke.sh",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../apps/mobile-capture/HighGroundCapture/HighGroundCaptureUITests/CaptureRoomRuntimeSmokeTests.swift",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../apps/mobile-capture/HighGroundCapture/HighGroundCapture/CapturePhoneShell.swift",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  assert.doesNotMatch(source, /deleteMany|removeArtifact|cleanupArtifact/);
  assert.match(source, /artifactPreserved: true/);
  assert.match(source, /QUIPSLY_CAPTURE_UI_TEST_MODE: "project-create"/);
  assert.match(source, /credentialsPrinted: false/);
  assert.match(runner, /project-create\)/);
  assert.match(
    nativeTest,
    /testIPhoneCreatesRetainedProjectAndOrganizesCanonicalWork/,
  );
  assert.match(nativeTest, /CaptureWorkProjectCreate/);
  assert.match(nativeTest, /kind: "TASK"/);
  assert.match(nativeTest, /kind: "NOTE"/);
  assert.match(nativeTest, /kind: "GOAL"/);
  assert.match(shell, /availableTags: \(workspace\?\.tags \?\? \[\]\)/);
});
