import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pythonCommand = process.env.PYTHON ?? "python";
const cliPath = path.join("tools", "studio-cut-local", "studio_cut_local.py");

function runCli(args) {
  const result = spawnSync(pythonCommand, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(
      `${pythonCommand} ${[cliPath, ...args].join(" ")} failed\n${result.stdout}\n${result.stderr}`,
    );
  }

  return result;
}

test("agent workspace index omits private absolute paths", async () => {
  const workdir = await mkdtemp(path.join(tmpdir(), "studio-cut-agent-index-"));
  const episodeDir = path.join(workdir, "episode-004");
  const indexPath = path.join(episodeDir, "generated", "agent-workspace-index.json");

  try {
    runCli([
      "rescue-sync-session",
      "--episode-id",
      "episode-004",
      "--title",
      "Episode 004",
      "--episode-dir",
      episodeDir,
      "--skip-worker",
    ]);

    const result = runCli([
      "agent-workspace-index",
      "--episode-dir",
      episodeDir,
      "--out",
      indexPath,
      "--json",
    ]);
    const stdoutIndex = JSON.parse(result.stdout);
    const fileIndex = JSON.parse(await readFile(indexPath, "utf8"));
    const serialized = JSON.stringify(fileIndex);

    assert.equal(stdoutIndex.kind, "studio-cut-agent-workspace-index");
    assert.equal(fileIndex.schemaVersion, 1);
    assert.equal(fileIndex.episode.id, "episode-004");
    assert.equal(fileIndex.folders.workspace, "<episode-workspace>");
    assert.equal(fileIndex.files.syncJob.path, "generated/sync-job.json");
    assert.equal(fileIndex.files.localMediaMap.path, "generated/local-media-map.json");
    assert.equal(fileIndex.files.readme.path, "README.md");
    assert.equal(fileIndex.decisionCandidates[0].path, "edit/episode-004-decisions.json");
    assert.equal(fileIndex.commands.refreshIndex.includes("<episode-workspace>"), true);
    assert.equal(fileIndex.commands.expectedDecisionExportPath, "<episode-workspace>/edit/episode-004-decisions.json");
    assert.equal(fileIndex.missingRequiredRoles.includes("homerVideo"), true);
    assert.equal(serialized.includes(workdir), false);
    assert.equal(serialized.includes("/private/"), false);
    assert.equal(serialized.includes("/Users/"), false);
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
});
