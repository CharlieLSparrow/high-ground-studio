import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../../", import.meta.url));
const workflow = readFileSync(path.join(root, ".github/workflows/capture-pr-tests.yml"), "utf8");

// Execute the actual checked-in shell steps, not a second implementation of CI.
function stepScript(name) {
  const step = workflow.split(`      - name: ${name}\n`)[1]?.split("\n      - name:")[0];
  const lines = step?.split("        run: |\n")[1]?.split("\n") ?? [];
  const script = [];
  for (const line of lines) {
    if (line && !line.startsWith("          ")) break;
    script.push(line.slice(10));
  }
  assert.ok(script.length > 0, `Missing executable step: ${name}`);
  return script.join("\n");
}

function runStep(name, env, cwd = root) {
  return spawnSync("bash", ["-c", stepScript(name)], {
    cwd, encoding: "utf8", env: { ...process.env, ...env },
  });
}

test("Capture evaluates every PR and only starts Mac jobs for affected inputs", () => {
  const events = workflow.split("\nconcurrency:")[0];
  assert.match(events, /\n  pull_request:\n  workflow_dispatch:/);
  assert.doesNotMatch(events, /\n    (branches|paths)(-ignore)?:/);
  assert.doesNotMatch(events, /\n  (push|pull_request_target):/);
  assert.match(workflow, /deterministic-ui:\n    needs: changes\n    if: needs.changes.outputs.capture == 'true'/);
  assert.match(workflow, /name: Capture validation\n    needs: \[changes, deterministic-ui\]\n    if: always\(\)/);
});

test("Capture routes committed changes using the manifest and rejects an invalid comparison", (t) => {
  const fixture = mkdtempSync(path.join(os.tmpdir(), "quipsly-capture-ci-"));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  for (const directory of ["release/manifests", "packages/repository-governance/src", "scripts/ci"]) {
    cpSync(path.join(root, directory), path.join(fixture, directory), { recursive: true });
  }
  // The planner validates that declared inputs exist. Copy only those metadata
  // files; never copy app builds, source recordings, dependencies, or credentials.
  for (const file of readdirSync(path.join(root, "release/manifests"))) {
    if (!file.endsWith(".json") || file === "schema.json") continue;
    const manifest = JSON.parse(readFileSync(path.join(root, "release/manifests", file), "utf8"));
    const inputs = [manifest.applicationRoot, manifest.artifact.materializer,
      ...Object.values(manifest.changeDetection).flatMap((set) => set.files),
      ...(manifest.releaseContext?.requiredPaths ?? [])].filter(Boolean);
    for (const input of inputs) {
      const target = path.join(fixture, input);
      if (statSync(path.join(root, input)).isDirectory()) mkdirSync(target, { recursive: true });
      else {
        mkdirSync(path.dirname(target), { recursive: true });
        cpSync(path.join(root, input), target);
      }
    }
  }
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: fixture, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const commit = () => {
    git("add", ".");
    git("-c", "user.name=CI fixture", "-c", "user.email=ci@example.test", "-c", "commit.gpgsign=false", "commit", "--no-verify", "-qm", "fixture");
    return git("rev-parse", "HEAD");
  };
  git("init", "-q");
  const base = commit();
  const output = path.join(fixture, ".git", "test-output");
  const runPlan = (extra = {}) => {
    writeFileSync(output, "");
    const result = runStep("Plan Capture validation", {
      EVENT_NAME: "pull_request", PR_BASE_SHA: base, GITHUB_OUTPUT: output, ...extra,
    }, fixture);
    return { ...result, output: readFileSync(output, "utf8") };
  };

  mkdirSync(path.join(fixture, "apps/quipsly/src"), { recursive: true });
  writeFileSync(path.join(fixture, "apps/quipsly/src/web.ts"), "export {};");
  commit();
  let result = runPlan();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.output, /^capture=false$/m);

  // This release tool was omitted from the former hand-maintained YAML list.
  mkdirSync(path.join(fixture, "scripts/release"), { recursive: true });
  writeFileSync(path.join(fixture, "scripts/release/quipsly-capture-preflight-from-commit.sh"), "#!/bin/bash\n");
  const captureSha = commit();
  result = runPlan();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.output, /^capture=true$/m);

  // A later web-only commit must not hide earlier Capture changes on the PR.
  writeFileSync(path.join(fixture, "apps/quipsly/src/web.ts"), "export const later = true;");
  commit();
  assert.match(runPlan().output, /^capture=true$/m);
  assert.match(runPlan({ PR_BASE_SHA: captureSha }).output, /^capture=false$/m);

  result = runPlan({ PR_BASE_SHA: "missing-revision" });
  assert.notEqual(result.status, 0);
  assert.equal(result.output, "");
  result = runPlan({ EVENT_NAME: "workflow_dispatch", PR_BASE_SHA: "" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.output, /^capture=true$/m);
});

test("the stable Capture check cannot hide failed, cancelled, missing, or skipped required tests", () => {
  const cases = [
    ["success", "false", "skipped", true],
    ["success", "true", "success", true],
    ["success", "true", "failure", false],
    ["success", "true", "cancelled", false],
    ["success", "true", "skipped", false],
    ["success", "", "skipped", false],
    ["failure", "false", "skipped", false],
    ["cancelled", "true", "success", false],
  ];
  for (const [PLAN_RESULT, CAPTURE_CHANGED, UI_RESULT, passes] of cases) {
    const result = runStep("Report Capture validation", { PLAN_RESULT, CAPTURE_CHANGED, UI_RESULT });
    assert.equal(result.status === 0, passes, JSON.stringify({ PLAN_RESULT, CAPTURE_CHANGED, UI_RESULT, output: result.stdout }));
  }
});
