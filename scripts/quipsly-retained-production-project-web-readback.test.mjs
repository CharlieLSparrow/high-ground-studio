import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  parseArguments,
  requireProductionNativeReceipt,
} from "./quipsly-retained-production-project-web-readback.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");

function nativeReceipt() {
  return {
    schema: "quipsly-retained-production-native-project-operation-v1",
    ok: true,
    origin: "https://nest.quipsly.com",
    compiledIPhoneOperation: true,
    identity: {
      email: "codex@dev.test",
      firebaseVerified: true,
      nativeSessionVerified: true,
    },
    records: {
      project: { id: "project-1", slug: "qa-retained-project", name: "QA Retained · Project" },
      task: { id: "task-1", title: "QA Retained · Task" },
      note: { id: "note-1", stableId: "stable-note-1", title: "QA Retained · Task · note" },
      goal: { id: "goal-1", title: "QA Retained · Task · goal" },
      tag: { id: "tag-1", label: "QA Retained · System", usageCount: 3 },
    },
    boundaries: {
      credentialsPrinted: false,
      tokensPrinted: false,
      externalSideEffects: false,
      cleanupPerformed: false,
    },
  };
}

test("web readback accepts only explicit evidence outside Git", () => {
  assert.deepEqual(parseArguments([
    "--",
    "--native-receipt", "/private/tmp/native.json",
    "--output-dir", "/private/tmp/rendered-evidence",
  ]), {
    help: false,
    nativeReceipt: "/private/tmp/native.json",
    outputDir: "/private/tmp/rendered-evidence",
  });
  assert.throws(() => parseArguments([
    "--native-receipt", `${repoRoot}/artifact.json`,
    "--output-dir", "/private/tmp/rendered-evidence",
  ]));
  assert.throws(() => parseArguments([
    "--native-receipt", "/private/tmp/native.txt",
    "--output-dir", "/private/tmp/rendered-evidence",
  ]));
});

test("web readback pins the exact successful native production receipt", () => {
  const valid = nativeReceipt();
  assert.equal(requireProductionNativeReceipt(valid), valid);
  for (const mutate of [
    (receipt) => { receipt.origin = "https://preview.example.com"; },
    (receipt) => { receipt.identity.email = "someone@example.test"; },
    (receipt) => { receipt.records.note.stableId = ""; },
    (receipt) => { receipt.records.tag.usageCount = 2; },
    (receipt) => { receipt.boundaries.externalSideEffects = true; },
  ]) {
    const broken = structuredClone(valid);
    mutate(broken);
    assert.throws(() => requireProductionNativeReceipt(broken));
  }
});

test("web readback is rendered, read-only, credential-safe, and cross-device", async () => {
  const source = await readFile(
    new URL("./quipsly-retained-production-project-web-readback.mjs", import.meta.url),
    "utf8",
  );
  assert.match(source, /signInThroughRenderedLogin/);
  assert.match(source, /readRetainedQAPassword/);
  assert.match(source, /project-overview-desktop\.png/);
  assert.match(source, /project-overview-phone-width\.png/);
  assert.match(source, /focusedInGlobalWork: true/);
  assert.match(source, /productRecordsChanged: false/);
  assert.match(source, /credentialsPrinted: false/);
  assert.match(source, /tokensPrinted: false/);
  assert.match(source, /clearRenderedSession/);
  assert.doesNotMatch(source, /deleteMany|cleanupArtifact|removeArtifact/);
});
