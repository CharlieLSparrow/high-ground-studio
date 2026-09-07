import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const workflow = readFileSync(new URL("../../.github/workflows/pr-tests.yml", import.meta.url), "utf8");
const step = (name) => workflow.split(`      - name: ${name}\n`)[1]?.split("\n      - name:")[0];

// Run the checked-in workflow shell, replacing only pnpm. A passing tee must
// never turn a failed test process into a successful required check.
for (const exitCode of [0, 1, 17]) {
  test(`contract runner exit ${exitCode} is preserved with stdout and stderr`, (t) => {
    const root = mkdtempSync(path.join(os.tmpdir(), "quipsly-contract-ci-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const source = step("Run committed Quipsly contract suite");
    assert.ok(source);
    const script = source.split("        run: |\n")[1]?.split("\n")
      .filter((line) => line.startsWith("          ")).map((line) => line.slice(10)).join("\n");
    assert.ok(script);
    const result = spawnSync("bash", ["-c", `
      pnpm() {
        [[ "$*" == "quipsly:contracts:test" ]] || return 99
        echo "contract stdout"
        echo "contract stderr" >&2
        return "$TEST_EXIT"
      }
      ${script}
    `], { encoding: "utf8", env: { ...process.env, RUNNER_TEMP: root, TEST_EXIT: String(exitCode) } });
    assert.equal(result.status, exitCode, result.stderr);
    assert.equal(readFileSync(path.join(root, "quipsly-contracts.log"), "utf8"),
      "contract stdout\ncontract stderr\n");
  });
}

test("failed contract runs retain bounded downloadable evidence", () => {
  const archive = step("Preserve contract test results");
  assert.ok(archive);
  assert.match(archive, /if: always\(\) && \(steps.changes.outputs.quipsly == 'true' \|\| steps.changes.outputs.web == 'true'\)/);
  assert.match(archive, /uses: actions\/upload-artifact@/);
  assert.match(archive, /path: \$\{\{ runner.temp \}\}\/quipsly-contracts.log/);
  assert.match(archive, /retention-days: 7/);
  assert.match(step("Run committed Quipsly contract suite"), /timeout-minutes: 5/);
});

// Exercise the actual app/database workflow commands with GitHub's bash flags.
// This tests failure propagation, not just whether the YAML mentions a test.
for (const scenario of [
  { lane: "app", failedCommand: "none", exitCode: 0, reachesTests: true },
  { lane: "app", failedCommand: "tests", exitCode: 17, reachesTests: true },
  { lane: "app", failedCommand: "config", exitCode: 23, reachesTests: false },
  { lane: "database", failedCommand: "none", exitCode: 0, reachesTests: true },
  { lane: "database", failedCommand: "tests", exitCode: 17, reachesTests: true },
  { lane: "database", failedCommand: "migration", exitCode: 29, reachesTests: false },
]) {
  test(`${scenario.lane} lane preserves ${scenario.failedCommand} exit ${scenario.exitCode}`, (t) => {
    const root = mkdtempSync(path.join(os.tmpdir(), "quipsly-app-ci-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const source = step(scenario.lane === "app"
      ? "Test Quipsly application behavior" : "Test membership and persistence on a fresh database");
    const script = source?.split("        run: |\n")[1]?.split("\n")
      .filter((line) => line.startsWith("          ")).map((line) => line.slice(10)).join("\n");
    assert.ok(script);
    const result = spawnSync("bash", ["--noprofile", "--norc", "-e", "-o", "pipefail", "-c", `
      node() {
        [[ "$*" == "--test apps/quipsly/scripts/typescript-config.test.mjs" ]] || return 98
        [[ "$FAILED_COMMAND" != config ]] || return "$TEST_EXIT"
      }
      pnpm() {
        if [[ "$*" == "exec prisma migrate deploy" ]]; then
          echo "migration output"
          [[ "$FAILED_COMMAND" != migration ]] || return "$TEST_EXIT"
        elif [[ "$1 $2 $3" == "--filter quipsly test" ]]; then
          echo "application tests ran"
          echo "test stderr" >&2
          [[ "$FAILED_COMMAND" != tests ]] || return "$TEST_EXIT"
        else
          return 99
        fi
      }
      ${script}
    `], { encoding: "utf8", env: { ...process.env, RUNNER_TEMP: root, FAILED_COMMAND: scenario.failedCommand, TEST_EXIT: String(scenario.exitCode) } });
    assert.equal(result.status, scenario.exitCode, result.stdout + result.stderr);
    assert.equal(result.stdout.includes("application tests ran"), scenario.reachesTests);
    if (scenario.reachesTests) {
      const log = scenario.lane === "app" ? "quipsly-jest.log" : "quipsly-db-tests.log";
      assert.equal(readFileSync(path.join(root, log), "utf8"), "application tests ran\ntest stderr\n");
    }
    if (scenario.failedCommand === "migration") {
      assert.equal(readFileSync(path.join(root, "quipsly-db-migrations.log"), "utf8"), "migration output\n");
    }
  });
}
