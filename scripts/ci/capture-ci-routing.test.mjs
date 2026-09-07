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

test("both Capture jobs select the repository Node toolchain before running Node commands", () => {
  for (const job of ["changes", "deterministic-ui"]) {
    const source = workflow.split(`\n  ${job}:\n`)[1]?.split(/\n  [a-z][a-z-]+:\n/)[0];
    assert.ok(source, `Missing ${job} job`);
    const setup = source.indexOf("uses: actions/setup-node@");
    assert.ok(setup >= 0, `${job} must not depend on the runner image's default Node`);
    assert.match(source.slice(setup).split("\n      - name:")[0], /node-version-file: \.node-version/);
    assert.ok(setup < source.search(/\bnode (?:--|scripts\/)/), `${job} runs Node before selecting its version`);
  }
});

test("cheap Capture source checks run in Linux planning and preserve failures before Mac startup", () => {
  const name = "Check Capture source wiring before Mac startup";
  const changes = workflow.split("\n  changes:\n")[1]?.split("\n  deterministic-ui:\n")[0];
  assert.ok(changes?.includes(`- name: ${name}`));
  assert.match(changes, /if: steps.plan.outputs.capture == 'true'/);
  const result = runStep(name, {});
  assert.equal(result.status, 0, result.stdout + result.stderr);
  for (const exitCode of [17, 143]) {
    const failed = spawnSync("bash", ["-c", `
      node() { return ${exitCode}; }
      ${stepScript(name)}
    `], { encoding: "utf8" });
    assert.equal(failed.status, exitCode, "Planning must fail instead of starting the costly native job");
  }
});

test("native preflight executes every command and stops at each injected failure", () => {
  // No Xcode, network, or cloud spend: substitute only command execution while
  // running the actual workflow shell, including its checked-in error policy.
  const script = `
    calls=0
    invoke() {
      calls=$((calls + 1))
      printf '%s\\n' "$*"
      if [[ "$calls" == "$TEST_FAIL_AT" ]]; then return 37; fi
    }
    bash() { invoke bash "$@"; }
    node() { invoke node "$@"; }
    ${stepScript("Validate Capture release source")}
  `;
  const run = (failure) => spawnSync("bash", ["--noprofile", "--norc", "-c", script], {
    encoding: "utf8", env: { ...process.env, TEST_FAIL_AT: String(failure) },
  });
  const successful = run(0);
  assert.equal(successful.status, 0, successful.stdout + successful.stderr);
  const commands = successful.stdout.trim().split("\n");
  assert.ok(commands.length > 10, "Native preflight unexpectedly lost its checks");
  assert.equal(commands[0], "bash apps/mobile-capture/HighGroundCapture/scripts/verify-release-source.sh");
  assert.equal(commands.at(-1), "node scripts/release/quipsly-capture-privacy-questionnaire.mjs --strict");
  for (let failure = 1; failure <= commands.length; failure += 1) {
    const result = run(failure);
    assert.equal(result.status, 37, `Failure was swallowed: ${commands[failure - 1]}`);
    assert.deepEqual(result.stdout.trim().split("\n"), commands.slice(0, failure),
      `Commands continued after failure: ${commands[failure - 1]}`);
  }
});

for (const failureDevice of ["none", "iPhone 17 Pro", "iPad Air 13-inch (M3)"]) {
  test(`simulator prewarm preserves diagnostics and ${failureDevice} failure`, (t) => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "quipsly-native-prewarm-"));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const step = workflow.split("      - name: Prewarm deterministic simulator services\n")[1]?.split("\n      - name:")[0];
    assert.match(step, /timeout-minutes: 15/);
    assert.match(workflow, /\$\{\{ runner.temp \}\}\/capture-prewarm-\*\.log/);
    const result = spawnSync("bash", ["-c", `
      bash() {
        [[ "$1" == apps/mobile-capture/HighGroundCapture/scripts/prepare-ci-simulator.sh ]] || return 98
        if [[ "$2" == "iPhone 17 Pro" ]]; then
          [[ "$CAPTURE_SIMULATOR_DESTINATION_VARIABLE" == CAPTURE_DESTINATION ]] || return 99
        else
          [[ "$CAPTURE_SIMULATOR_DESTINATION_VARIABLE" == CAPTURE_IPAD_DESTINATION ]] || return 99
        fi
        echo "Preparing $2"
        echo "Simulator diagnostics" >&2
        [[ "$2" != "$FAILURE_DEVICE" ]] || return 37
      }
      ${stepScript("Prewarm deterministic simulator services")}
    `], { encoding: "utf8", env: { ...process.env, RUNNER_TEMP: directory, FAILURE_DEVICE: failureDevice } });
    assert.equal(result.status, failureDevice === "none" ? 0 : 37, result.stdout + result.stderr);
    assert.equal(readFileSync(path.join(directory, "capture-prewarm-iphone.log"), "utf8"),
      "Preparing iPhone 17 Pro\nSimulator diagnostics\n");
    if (failureDevice === "iPhone 17 Pro") assert.doesNotMatch(result.stdout, /Preparing iPad/);
    else assert.equal(readFileSync(path.join(directory, "capture-prewarm-ipad.log"), "utf8"),
      "Preparing iPad Air 13-inch (M3)\nSimulator diagnostics\n");
  });
}

for (const shard of [0, 3]) {
  for (const exitCode of [0, 17, 143]) {
    test(`native CI shard ${shard} preserves runner exit ${exitCode} and diagnostic output`, (t) => {
      const directory = mkdtempSync(path.join(os.tmpdir(), "quipsly-native-ci-"));
      t.after(() => rmSync(directory, { recursive: true, force: true }));
      const script = stepScript("Run bounded deterministic Capture UI lane serially")
        .replaceAll("${{ matrix.shard }}", String(shard));
      const suite = shard === 0 ? "critical" : "full";
      const selected = shard || 1;
      const result = spawnSync("bash", ["--noprofile", "--norc", "-e", "-o", "pipefail", "-c", `
        node() {
          [[ "$1" == scripts/release/quipsly-capture-ui-test-runner.mjs ]] || return 98
          [[ " $* " == *" --suite=${suite} "* && " $* " == *" --shard=${selected} "* ]] || return 99
          echo "native test stdout"
          echo "native test stderr" >&2
          return "$TEST_EXIT"
        }
        ${script}
      `], { encoding: "utf8", env: { ...process.env, RUNNER_TEMP: directory,
        TEST_EXIT: String(exitCode), CAPTURE_DESTINATION: "synthetic iPhone", CAPTURE_IPAD_DESTINATION: "synthetic iPad" } });
      assert.equal(result.status, exitCode, result.stdout + result.stderr);
      assert.equal(readFileSync(path.join(directory, `capture-ui-${suite}-${selected}/capture-ui-tests.log`), "utf8"),
        "native test stdout\nnative test stderr\n");
    });
  }
}

test("the native execution budget leaves time to upload evidence after timeout", () => {
  const job = workflow.split("  deterministic-ui:\n")[1]?.split("  validation:\n")[0];
  const testStep = job.split("      - name: Run bounded deterministic Capture UI lane serially\n")[1]?.split("\n      - name:")[0];
  const prewarm = job.split("      - name: Prewarm deterministic simulator services\n")[1]?.split("\n      - name:")[0];
  const minutes = (source) => Number(source?.match(/timeout-minutes: (\d+)/)?.[1]);
  assert.ok(minutes(testStep) > 0 && minutes(prewarm) > 0);
  assert.ok(minutes(job) >= minutes(testStep) + minutes(prewarm) + 3,
    "Startup and test timeouts must leave at least three minutes for setup and retained evidence");
  assert.match(job, /name: Preserve native test evidence\n\s+if: always\(\)/);
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

  // Editing a standalone Swift/API-shape harness must run the native lane too,
  // even when no app source or release script changed in that commit.
  const beforeHarness = git("rev-parse", "HEAD");
  writeFileSync(path.join(fixture, "scripts/test-capture-session-deep-links.sh"), "#!/bin/bash\nexit 0\n");
  commit();
  assert.match(runPlan({ PR_BASE_SHA: beforeHarness }).output, /^capture=true$/m);

  for (const file of ["scripts/lib/source-check-report.mjs", "scripts/lib/source-check-report.test.mjs"]) {
    const beforeReporter = git("rev-parse", "HEAD");
    writeFileSync(path.join(fixture, file), "// changed source-check reporter\n");
    commit();
    assert.match(runPlan({ PR_BASE_SHA: beforeReporter }).output, /^capture=true$/m);
  }

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
