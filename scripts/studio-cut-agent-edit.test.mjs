import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pythonCommand = process.env.PYTHON ?? "python";
const cliPath = path.join("tools", "studio-cut-local", "studio_cut_local.py");

function runCli(args, options = {}) {
  const result = spawnSync(pythonCommand, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(
      `${pythonCommand} ${[cliPath, ...args].join(" ")} failed\n${result.stdout}\n${result.stderr}`,
    );
  }

  return result;
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function buildManifest() {
  return {
    id: "agent-edit-smoke",
    title: "Agent Edit Smoke",
    durationMs: 10000,
    sources: {
      homer: { role: "homer", label: "Synthetic Homer" },
      charlie: { role: "charlie", label: "Synthetic Charlie" },
      clip: { role: "clip", label: "Synthetic Clip" },
      program: { role: "program", label: "Synthetic Program" },
    },
    sourceMonitorProxy: {
      localPlaceholderPath: "./source-monitor-proxy.mp4",
      panes: {
        homer: { x: 0, y: 0, width: 0.5, height: 0.5 },
        charlie: { x: 0.5, y: 0, width: 0.5, height: 0.5 },
        clip: { x: 0, y: 0.5, width: 0.5, height: 0.5 },
      },
    },
    syncBootstrap: {
      source: "premiere",
      notes: "Synthetic test manifest.",
    },
  };
}

function buildDecisions() {
  return {
    schemaVersion: 1,
    exportedAt: "2026-05-24T00:00:00.000Z",
    projectId: "agent-edit-smoke",
    branchId: "main",
    decisionEvents: [
      {
        id: "decision-001",
        projectId: "agent-edit-smoke",
        branchId: "main",
        sourceTimeMs: 0,
        state: "both",
        createdBy: "test",
        createdAt: "2026-05-24T00:00:00.000Z",
      },
      {
        id: "decision-002",
        projectId: "agent-edit-smoke",
        branchId: "main",
        sourceTimeMs: 2000,
        state: "cut",
        createdBy: "test",
        createdAt: "2026-05-24T00:00:01.000Z",
      },
      {
        id: "decision-003",
        projectId: "agent-edit-smoke",
        branchId: "main",
        sourceTimeMs: 4000,
        state: "homer",
        createdBy: "test",
        createdAt: "2026-05-24T00:00:02.000Z",
      },
    ],
  };
}

function buildTranscript() {
  return {
    schemaVersion: 1,
    episodeId: "agent-edit-smoke",
    generatedAt: "2026-05-24T00:00:00.000Z",
    language: "en",
    segments: [
      {
        id: "transcript-001",
        startSourceTimeMs: 4000,
        endSourceTimeMs: 8000,
        speaker: "Charlie",
        speakerRole: "charlie",
        text: "I want to explain this example before we look at the clip.",
        confidence: 0.97,
      },
      {
        id: "transcript-002",
        startSourceTimeMs: 8000,
        endSourceTimeMs: 9500,
        speaker: "Homer",
        speakerRole: "homer",
        text: "Um uh you know this is a synthetic filler cluster.",
        confidence: 0.95,
      },
    ],
  };
}

test("agent edit review and decision ops are deterministic and transparent", async () => {
  const workdir = await mkdtemp(path.join(tmpdir(), "studio-cut-agent-edit-"));

  try {
    const manifestPath = path.join(workdir, "manifest.json");
    const decisionsPath = path.join(workdir, "decisions.json");
    const transcriptPath = path.join(workdir, "transcript.json");
    const reviewPath = path.join(workdir, "agent-review.json");
    const suggestedOpsPath = path.join(workdir, "agent-review.suggested-ops.json");
    const opsPath = path.join(workdir, "agent-ops.json");
    const editedPath = path.join(workdir, "decisions.edited.json");
    const dryRunPath = path.join(workdir, "decisions.dry-run.json");

    await writeJson(manifestPath, buildManifest());
    await writeJson(decisionsPath, buildDecisions());
    await writeJson(transcriptPath, buildTranscript());
    await writeJson(opsPath, {
      schemaVersion: 1,
      operations: [
        {
          op: "removeDecision",
          id: "decision-002",
          reason: "Inactive span should be restored for this synthetic pass.",
        },
        {
          op: "addDecision",
          id: "decision-004",
          sourceTimeMs: 6000,
          state: "charlie_clip",
          note: "Agent adds Charlie plus Clip for final synthetic segment.",
        },
        {
          op: "setRangeState",
          id: "decision-range-start",
          restoreId: "decision-range-restore",
          startSourceTimeMs: 8000,
          endSourceTimeMs: 9500,
          state: "cut",
          restoreState: "homer",
          note: "Agent proposes tightening synthetic filler cluster.",
          confidence: 0.35,
          approvalRequired: true,
          reason: "Synthetic filler cluster.",
        },
      ],
    });

    runCli([
      "agent-review-edit",
      "--manifest",
      manifestPath,
      "--decisions",
      decisionsPath,
      "--transcript",
      transcriptPath,
      "--out",
      reviewPath,
      "--out-ops",
      suggestedOpsPath,
      "--json",
    ]);
    const review = JSON.parse(await readFile(reviewPath, "utf8"));
    const suggestedOps = JSON.parse(await readFile(suggestedOpsPath, "utf8"));

    assert.equal(review.kind, "studio-cut-agent-edit-review");
    assert.equal(review.summary.activeDecisionEventCount, 3);
    assert.equal(review.summary.cutSegmentCount, 1);
    assert.equal(review.transcriptReview.segmentCount, 2);
    assert.equal(review.transcriptReview.clipReferenceCount, 1);
    assert.equal(review.agentEditingContract.supportedOps.includes("addDecision"), true);
    assert.equal(review.agentEditingContract.supportedOps.includes("setRangeState"), true);
    assert(
      review.tasks.some((task) => task.kind === "transcript_speaker_state_mismatch"),
    );
    assert(review.tasks.some((task) => task.kind === "transcript_clip_reference"));
    assert(
      suggestedOps.operations.some(
        (operation) =>
          operation.op === "setRangeState" &&
          operation.state === "cut" &&
          operation.approvalRequired === true,
      ),
    );

    runCli([
      "apply-decision-ops",
      "--manifest",
      manifestPath,
      "--decisions",
      decisionsPath,
      "--ops",
      opsPath,
      "--out",
      dryRunPath,
      "--created-by",
      "codex@test",
      "--dry-run",
    ]);

    runCli([
      "apply-decision-ops",
      "--manifest",
      manifestPath,
      "--decisions",
      decisionsPath,
      "--ops",
      opsPath,
      "--out",
      editedPath,
      "--created-by",
      "codex@test",
    ]);
    const edited = JSON.parse(await readFile(editedPath, "utf8"));

    assert.equal(edited.agentEdit.operationCount, 3);
    assert.equal(edited.agentEdit.appliedOperationCount, 3);
    assert.equal(edited.decisionEvents.length, 6);

    const removed = edited.decisionEvents.find((event) => event.id === "decision-002");
    const added = edited.decisionEvents.find((event) => event.id === "decision-004");
    const rangeStart = edited.decisionEvents.find(
      (event) => event.id === "decision-range-start",
    );
    const rangeRestore = edited.decisionEvents.find(
      (event) => event.id === "decision-range-restore",
    );

    assert.equal(removed.operation, "remove");
    assert.equal(removed.removedBy, "codex@test");
    assert.match(removed.note, /Agent remove/);
    assert.equal(added.state, "charlie_clip");
    assert.equal(added.clientId, "studio-cut-local-agent");
    assert.equal(rangeStart.state, "cut");
    assert.match(rangeStart.note, /Agent range reason/);
    assert.equal(rangeRestore.state, "homer");
    assert.equal(rangeRestore.sourceTimeMs, 9500);
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
});
