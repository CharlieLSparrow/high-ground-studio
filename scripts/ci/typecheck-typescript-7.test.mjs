import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../../", import.meta.url));
const runner = path.join(root, "scripts/ci/typecheck-typescript-7.sh");
const source = readFileSync(runner, "utf8");
const configs = [...source.matchAll(/^  "((?:apps|packages)\/[^"]+\/tsconfig[^"/]*\.json)"$/gm)].map((match) => match[1]);
const pins = { "@typescript/native": "npm:typescript@7.0.2", typescript: "npm:@typescript/typescript6@6.0.2" };

test("every tracked TypeScript project is registered and declares both pinned compilers", () => {
  const result = spawnSync("bash", [runner, "--list"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const registered = result.stdout.trim().split("\n");
  assert.ok(registered.includes("apps/quipsly-mcp/tsconfig.json"));
  assert.equal(new Set(registered).size, registered.length, "duplicate project registration");
  for (const config of registered) {
    const manifestPath = path.join(root, path.dirname(config), "package.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    for (const [name, version] of Object.entries(pins)) {
      assert.equal(manifest.devDependencies?.[name] ?? manifest.dependencies?.[name], version, `${manifestPath}: ${name}`);
    }
  }
});

for (const scenario of [
  { name: "all registered projects", status: 0 },
  { name: "unregistered project", status: 1, error: /not registered/ },
  { name: "missing compiler pin", status: 1, error: /must pin @typescript\/native/ },
  { name: "wrong installed compiler", version: "Version 6.0.2", status: 1, error: /instead of Version 7.0.2/ },
  { name: "route generation failure", nextStatus: "23", status: 23 },
  { name: "typecheck failure", tscStatus: "17", status: 17 },
]) {
  test(`actual compatibility runner handles ${scenario.name}`, (t) => {
    const fixture = mkdtempSync(path.join(os.tmpdir(), "quipsly-ts7-gate-"));
    t.after(() => rmSync(fixture, { recursive: true, force: true }));
    assert.ok(configs.length > 0);
    for (const config of configs) {
      const directory = path.join(fixture, path.dirname(config));
      mkdirSync(directory, { recursive: true });
      writeFileSync(path.join(fixture, config), "{}\n");
      writeFileSync(path.join(directory, "package.json"), JSON.stringify({
        devDependencies: scenario.name === "missing compiler pin" ? {} : pins,
        scripts: { dev: "next dev" },
      }));
    }
    if (scenario.name === "unregistered project") {
      mkdirSync(path.join(fixture, "apps/new-tool"));
      writeFileSync(path.join(fixture, "apps/new-tool/tsconfig.json"), "{}\n");
    }
    for (const args of [["init", "-q"], ["add", "."]]) {
      const result = spawnSync("git", args, { cwd: fixture, encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
    }
    // Replace only external commands, not the checked-in runner. A failed
    // compiler or Next typegen must remain a failed job, not a skipped check.
    const result = spawnSync("bash", ["-c", `
      pnpm() {
        if [[ "$*" == *"tsc --version" ]]; then
          echo "$TEST_VERSION"
        elif [[ "$*" == *"next typegen" ]]; then
          return "$TEST_NEXT_STATUS"
        elif [[ "$*" == *"exec tsc -p "* ]]; then
          echo "TYPECHECK $2"
          return "$TEST_TSC_STATUS"
        else
          return 99
        fi
      }
      source "$TEST_RUNNER"
    `], {
      cwd: fixture, encoding: "utf8", timeout: 30_000,
      env: { ...process.env, TEST_RUNNER: runner, TEST_VERSION: scenario.version || "Version 7.0.2",
        TEST_NEXT_STATUS: scenario.nextStatus || "0", TEST_TSC_STATUS: scenario.tscStatus || "0" },
    });
    assert.equal(result.status, scenario.status, result.stdout + result.stderr);
    if (scenario.error) assert.match(result.stderr, scenario.error);
    if (scenario.status === 0) {
      assert.equal(result.stdout.split("\n").filter((line) => line.startsWith("TYPECHECK ")).length, configs.length);
      assert.match(result.stdout, new RegExp(`PASS ${configs.length} TypeScript projects`));
    }
    if (scenario.nextStatus) assert.doesNotMatch(result.stdout, /TYPECHECK /);
  });
}
