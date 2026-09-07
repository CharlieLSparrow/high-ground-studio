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
