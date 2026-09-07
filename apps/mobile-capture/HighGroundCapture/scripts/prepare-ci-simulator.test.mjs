import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(new URL("./prepare-ci-simulator.sh", import.meta.url));
const id = "C100EB07-2BC6-4796-BB7F-40CDFD61AD2D";
const otherId = "8675C4EF-B2E6-403F-BAF6-F0342E2F2A3E";

for (const scenario of ["success", "already-booted", "missing", "duplicate", "boot-failure", "safari-failure", "invalid-variable", "local"]) {
  test(`simulator startup hands its exact identity to the test step: ${scenario}`, t => {
    const fixture = mkdtempSync(path.join(os.tmpdir(), "capture-simulator-handoff-"));
    t.after(() => rmSync(fixture, { recursive: true, force: true }));
    const envFile = path.join(fixture, "github-env");
    const log = path.join(fixture, "commands");
    writeFileSync(envFile, "");
    writeFileSync(log, "");
    writeFileSync(path.join(fixture, "xcrun"), `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2), scenario = process.env.SCENARIO;
fs.appendFileSync(process.env.COMMAND_LOG, JSON.stringify(args) + "\\n");
if (args.join(" ") === "simctl list devices available --json") {
  const device = {udid: "${id}", name: "iPhone 17 Pro", isAvailable: true};
  console.log(JSON.stringify({devices: {
    "com.apple.CoreSimulator.SimRuntime.iOS-26-2": scenario === "missing" ? [] : scenario === "duplicate" ? [device, {...device,udid:"${otherId}"}] : [device],
    "com.apple.CoreSimulator.SimRuntime.iOS-26-5": [{...device,udid:"${otherId}"}],
  }}));
} else {
  if (args[2] !== "${id}") process.exit(98);
  if (scenario === "already-booted" && args[1] === "boot") process.exit(149);
  if (scenario === "boot-failure" && args[1] === "bootstatus") process.exit(37);
  if (scenario === "safari-failure" && args[1] === "launch") process.exit(37);
}
`, { mode: 0o700 });
    const result = spawnSync("bash", [script, "iPhone 17 Pro", "26.2"], { encoding: "utf8", env: {
      ...process.env, PATH: `${fixture}${path.delimiter}${process.env.PATH}`, SCENARIO: scenario, COMMAND_LOG: log,
      GITHUB_ENV: envFile, CAPTURE_SIMULATOR_DESTINATION_VARIABLE: scenario === "local" ? "" : scenario === "invalid-variable" ? "PATH" : "CAPTURE_DESTINATION",
    } });
    const passes = ["success", "already-booted", "local"].includes(scenario);
    assert.equal(result.status === 0, passes, result.stdout + result.stderr);
    assert.equal(readFileSync(envFile, "utf8"), passes && scenario !== "local" ? `CAPTURE_DESTINATION=platform=iOS Simulator,id=${id}\n` : "");
    if (["missing", "duplicate"].includes(scenario)) assert.match(result.stderr, /Expected one available/);
    if (scenario === "invalid-variable") assert.equal(readFileSync(log, "utf8"), "");
    if (passes) {
      const commands = readFileSync(log, "utf8").trim().split("\n").map(JSON.parse);
      assert.deepEqual(commands.slice(1), [["simctl", "boot", id], ["simctl", "bootstatus", id, "-b"], ["simctl", "launch", id, "com.apple.mobilesafari"]]);
    }
  });
}
