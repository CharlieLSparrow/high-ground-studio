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

test("agent edit review and decision ops are deterministic and transparent", async () => {
  const workdir = await mkdtemp(path.join(tmpdir(), "studio-cut-agent-edit-"));

  try {
    const manifestPath = path.join(workdir, "manifest.json");
    const decisionsPath = path.join(workdir, "decisions.json");
    const reviewPath = path.join(workdir, "agent-review.json");
    const opsPath = path.join(workdir, "agent-ops.json");
    const editedPath = path.join(workdir, "decisions.edited.json");
    const dryRunPath = path.join(workdir, "decisions.dry-run.json");

    await writeJson(manifestPath, buildManifest());
    await writeJson(decisionsPath, buildDecisions());
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
      ],
    });

    runCli([
      "agent-review-edit",
      "--manifest",
      manifestPath,
      "--decisions",
      decisionsPath,
      "--out",
      reviewPath,
      "--json",
    ]);
    const review = JSON.parse(await readFile(reviewPath, "utf8"));

    assert.equal(review.kind, "studio-cut-agent-edit-review");
    assert.equal(review.summary.activeDecisionEventCount, 3);
    assert.equal(review.summary.cutSegmentCount, 1);
    assert.equal(review.agentEditingContract.supportedOps.includes("addDecision"), true);

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

    assert.equal(edited.agentEdit.operationCount, 2);
    assert.equal(edited.agentEdit.appliedOperationCount, 2);
    assert.equal(edited.decisionEvents.length, 4);

    const removed = edited.decisionEvents.find((event) => event.id === "decision-002");
    const added = edited.decisionEvents.find((event) => event.id === "decision-004");

    assert.equal(removed.operation, "remove");
    assert.equal(removed.removedBy, "codex@test");
    assert.match(removed.note, /Agent remove/);
    assert.equal(added.state, "charlie_clip");
    assert.equal(added.clientId, "studio-cut-local-agent");
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
});
