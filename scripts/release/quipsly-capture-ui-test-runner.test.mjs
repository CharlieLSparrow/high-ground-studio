import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  createXcodeArguments,
  createExecutionGroups,
  createExecutionBatches,
  selectPlatformPlan,
  executedTestCount,
  parseRunnerArguments,
  resultBundlePath,
  skippedTestCount,
  verifyExecution,
  verifyResultTests,
  verifyPlatformExecution,
  resolvedSimulatorDestination,
  ensureXcodeDestination,
  simulatorDiscoveryLag,
  refreshAvailableSimulator,
} from "./quipsly-capture-ui-test-runner.mjs";
import { createPlan, discoverDeterministicTests } from "./quipsly-capture-ui-test-plan.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const fastfile = readFileSync(path.join(root, "apps/mobile-capture/HighGroundCapture/fastlane/Fastfile"), "utf8");
function rubyMethod(name) {
  const start = fastfile.indexOf(`\ndef ${name}(`);
  assert.ok(start >= 0, `Missing Fastlane method ${name}`);
  const end = fastfile.indexOf("\ndef ", start + 1);
  return fastfile.slice(start, end < 0 ? undefined : end);
}

const captureWorkflow = readFileSync(
  new URL("../../.github/workflows/capture-pr-tests.yml", import.meta.url),
  "utf8",
);

test("bounded result batches retain every planned identity once on its original device", () => {
  const source = readFileSync(path.join(root,
    "apps/mobile-capture/HighGroundCapture/HighGroundCaptureUITests/CaptureExperienceUITests.swift"), "utf8");
  const tests = discoverDeterministicTests(source);
  const plans = [createPlan(tests), ...[1, 2, 3, 4].map(shard => createPlan(tests, { suite: "full", shard }))];
  for (const plan of plans) {
    const groups = createExecutionGroups(plan, { destination: "phone", ipadDestination: "tablet" });
    const batches = createExecutionBatches(groups);
    assert.equal(new Set(batches.map(batch => resultBundlePath("/tmp/evidence", batch.name))).size, batches.length);
    assert.deepEqual(batches.flatMap(batch => batch.selectors), groups.flatMap(group => group.selectors));
    for (const batch of batches) {
      assert.ok(batch.selectors.length > 0 && batch.selectors.length <= 8);
      for (const selector of batch.selectors) {
        assert.equal(batch.destination, selector.includes("RegularWidthIPad") ? "tablet" : "phone");
      }
    }
  }
});

test("result batching does not mutate its input or create empty or duplicate attempts", () => {
  const selectors = Object.freeze(["a", "b", "c", "d", "e"]);
  const group = Object.freeze({ name: "iPhone", destination: "phone", selectors });
  assert.deepEqual(createExecutionBatches([group], 2), [
    { name: "iPhone-1-of-3", destination: "phone", selectors: ["a", "b"] },
    { name: "iPhone-2-of-3", destination: "phone", selectors: ["c", "d"] },
    { name: "iPhone-3-of-3", destination: "phone", selectors: ["e"] },
  ]);
  assert.deepEqual(createExecutionBatches([group], 8), [group]);
  assert.deepEqual(createExecutionBatches([]), []);
  for (const size of [0, -1, 1.5, NaN, Infinity]) {
    assert.throws(() => createExecutionBatches([group], size), /positive integer/);
  }
});

const phoneID = "11111111-1111-1111-1111-111111111111";
const exactPhone = `platform=iOS Simulator,id=${phoneID}`;
const resolvedSettings = {
  TARGET_DEVICE_IDENTIFIER: phoneID, PLATFORM_NAME: "iphonesimulator",
  TARGET_DEVICE_PLATFORM_NAME: "iphonesimulator", TARGET_DEVICE_OS_VERSION: "26.2", ARCHS: "arm64",
};
const settingsOutput = (settings = resolvedSettings) => JSON.stringify([{ target: "HighGroundCapture", buildSettings: settings }]);
const discoveryError = () => Object.assign(new Error("Destination unavailable"), { code: 64, stderr: `
xcodebuild: error: Could not configure request to show build settings: Unable to find a device matching the provided destination specifier:
  { platform:iOS Simulator, arch:arm64, id:${phoneID} }
  The requested device could not be found because no available devices matched the request.
  Available destinations for the "HighGroundCapture" scheme:
    { platform:iOS, id:dvtdevice-DVTiPhonePlaceholder-iphoneos:placeholder, name:Any iOS Device }
    { platform:iOS Simulator, id:dvtdevice-DVTiOSDeviceSimulatorPlaceholder-iphonesimulator:placeholder, name:Any iOS Simulator Device }
` });

test("only missing Xcode discovery of an exact simulator qualifies for setup recovery", () => {
  assert.equal(simulatorDiscoveryLag(discoveryError(), `${exactPhone},arch=arm64`), phoneID);
  assert.equal(simulatorDiscoveryLag({ ...discoveryError(), code: 70 }, exactPhone), phoneID);
  for (const destination of ["platform=iOS Simulator,name=iPhone test", "platform=iOS,id=" + phoneID]) {
    assert.equal(simulatorDiscoveryLag(discoveryError(), destination), null);
  }
  for (const error of [new Error("package failed"), { ...discoveryError(), code: 65 },
    { code: 64, stderr: "xcodebuild: error: invalid command line option" },
    { ...discoveryError(), killed: true },
    { ...discoveryError(), stderr: discoveryError().stderr + `\n{ platform:iOS Simulator, id:${phoneID} }` },
    { ...discoveryError(), stderr: discoveryError().stderr + "\nIneligible destinations: iOS is not installed" }]) {
    assert.equal(simulatorDiscoveryLag(error, exactPhone), null);
  }
});

test("setup recovery refreshes the same simulator once, without retrying tests or substituting devices", async () => {
  const events = [];
  assert.equal(await ensureXcodeDestination({ destination: exactPhone }, {
    resolve: async () => { events.push("resolve"); if (events.length === 1) throw discoveryError(); return settingsOutput(); },
    refresh: async id => { events.push(id); },
  }), exactPhone);
  assert.deepEqual(events, ["resolve", phoneID, "resolve"]);
});

test("persistent discovery failure stops after one recovery and unavailable simulators do not retry", async () => {
  for (const refreshFails of [false, true]) {
    let calls = 0, refreshes = 0;
    await assert.rejects(ensureXcodeDestination({ destination: exactPhone }, {
      resolve: async () => { calls++; throw discoveryError(); },
      refresh: async () => { refreshes++; if (refreshFails) throw new Error("Device unavailable"); },
    }), /discovery failed before tests started/);
    assert.equal(calls, refreshFails ? 1 : 2);
    assert.equal(refreshes, 1);
  }
});

test("recovered build settings still must identify the originally requested simulator", async () => {
  let calls = 0;
  await assert.rejects(ensureXcodeDestination({ destination: exactPhone }, {
    resolve: async () => { if (++calls === 1) throw discoveryError(); return settingsOutput({ ...resolvedSettings, TARGET_DEVICE_IDENTIFIER: "22222222-2222-2222-2222-222222222222" }); },
    refresh: async () => {},
  }), /no tests started/);
  assert.equal(calls, 2);
});

test("simulator refresh reads availability and waits only for the specified device with bounded commands", async () => {
  for (const scenario of ["available", "missing", "unavailable", "duplicate", "wrong-runtime", "boot-fails"]) {
    const commands = [];
    const device = { udid: phoneID, isAvailable: scenario !== "unavailable", state: "Shutdown" };
    const run = async (command, args, options) => {
      commands.push([command, args, options.timeout]);
      if (args.includes("list")) return { stdout: JSON.stringify({ devices: {
        [scenario === "wrong-runtime" ? "com.apple.CoreSimulator.SimRuntime.tvOS-26-2" : "com.apple.CoreSimulator.SimRuntime.iOS-26-2"]:
          scenario === "missing" ? [] : scenario === "duplicate" ? [device, device] : [device],
      } }) };
      if (scenario === "boot-fails") throw new Error("bootstatus failed");
      return { stdout: "Finished" };
    };
    if (scenario === "available") await refreshAvailableSimulator(phoneID, run);
    else await assert.rejects(refreshAvailableSimulator(phoneID, run), /no longer available|bootstatus failed/);
    assert.deepEqual(commands[0], ["xcrun", ["simctl", "list", "devices", "available", "--json"], 30_000]);
    assert.equal(commands.length, ["available", "boot-fails"].includes(scenario) ? 2 : 1);
    if (commands.length === 2) assert.deepEqual(commands[1], ["xcrun", ["simctl", "bootstatus", phoneID, "-b"], 120_000]);
  }
});

test("Xcode readiness verifies the resolved app target and locks the same simulator identity for testing", () => {
  assert.equal(resolvedSimulatorDestination(settingsOutput(), exactPhone), exactPhone);
  assert.equal(resolvedSimulatorDestination(settingsOutput(), "platform=iOS Simulator,name=iPhone test,OS=26.2,arch=arm64"), `${exactPhone},arch=arm64`);
  assert.equal(resolvedSimulatorDestination(settingsOutput({ ...resolvedSettings, ARCHS: "x86_64" }), `${exactPhone},arch=x86_64`), `${exactPhone},arch=x86_64`);
  for (const changed of [
    { TARGET_DEVICE_IDENTIFIER: "placeholder" },
    { TARGET_DEVICE_IDENTIFIER: "22222222-2222-2222-2222-222222222222" },
    { TARGET_DEVICE_IDENTIFIER: null },
    { PLATFORM_NAME: "iphoneos" },
    { TARGET_DEVICE_PLATFORM_NAME: "iphoneos" },
  ]) {
    assert.throws(() => resolvedSimulatorDestination(settingsOutput({ ...resolvedSettings, ...changed }), exactPhone), /no tests started/);
  }
  for (const output of ["[]", "{}", settingsOutput().replace("HighGroundCapture", "ShareCaptureExtension"),
    JSON.stringify(Array(2).fill({ target: "HighGroundCapture", buildSettings: resolvedSettings }))]) {
    assert.throws(() => resolvedSimulatorDestination(output, exactPhone), /no tests started/);
  }
  assert.throws(() => resolvedSimulatorDestination(settingsOutput(), `${exactPhone},OS=26.1`), /no tests started/);
  assert.throws(() => resolvedSimulatorDestination(settingsOutput(), `${exactPhone},arch=x86_64`), /no tests started/);
  assert.throws(() => resolvedSimulatorDestination(settingsOutput(), "platform=macOS,name=My Mac"), /Unsupported/);
  assert.throws(() => resolvedSimulatorDestination("malformed JSON", exactPhone));
});

test("readiness resolves once and does not retry failed commands or empty results", async () => {
  let calls = 0;
  assert.equal(await ensureXcodeDestination({ destination: exactPhone }, {
    resolve: async () => { calls += 1; return settingsOutput(); },
  }), exactPhone);
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(ensureXcodeDestination({ destination: exactPhone }, {
    resolve: async () => { calls += 1; return "[]"; },
  }), /no tests started/);
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(ensureXcodeDestination({ destination: exactPhone }, {
    resolve: async () => { calls += 1; throw new Error("package resolution failed"); },
  }), /package resolution failed/);
  assert.equal(calls, 1);
});

test("builds one xcode selector argument for every planned test", () => {
  const plan = {
    selectors: [
      "HighGroundCaptureUITests/CaptureExperienceUITests/testOne",
      "HighGroundCaptureUITests/CaptureLoginExperienceUITests/testLogin",
    ],
  };
  const arguments_ = createXcodeArguments(plan, {
    destination: "platform=iOS Simulator,id=sim-1",
    derivedDataPath: "/tmp/capture-tests",
  });

  assert.deepEqual(
    arguments_.filter((argument) => argument.startsWith("-only-testing:")),
    plan.selectors.map((selector) => `-only-testing:${selector}`),
  );
  assert.equal(arguments_.at(-1), "test");
});

test("build and test phases are explicit and retain the same product path and selectors", () => {
  const options = { destination: exactPhone, derivedDataPath: "/tmp/exact test products" };
  const plan = { selectors: ["HighGroundCaptureUITests/CaptureExperienceUITests/testOne"] };
  assert.equal(parseRunnerArguments([]).phase, "all");
  for (const phase of ["all", "build", "test"]) assert.equal(parseRunnerArguments([`--phase=${phase}`]).phase, phase);
  for (const phase of ["", "skip", "build-only"]) assert.throws(() => parseRunnerArguments([`--phase=${phase}`]), /phase must/);
  for (const action of ["build-for-testing", "test-without-building"]) {
    const args = createXcodeArguments(plan, { ...options, action });
    assert.equal(args.at(-1), action);
    assert.equal(args[args.indexOf("-derivedDataPath") + 1], options.derivedDataPath);
    assert.deepEqual(args.filter(a => a.startsWith("-only-testing:")), plan.selectors.map(s => `-only-testing:${s}`));
  }
  assert.throws(() => createXcodeArguments(plan, { ...options, action: "clean" }), /Unsupported/);
});

test("reads the authoritative aggregate executed count", () => {
  const output = `
    Executed 1 test, with 0 failures
    Executed 15 tests, with 0 failures
    Executed 15 tests, with 0 failures
  `;
  assert.equal(executedTestCount(output), 15);
});

test("partitions regular-width contracts onto an iPad destination", () => {
  const groups = createExecutionGroups({
    selectors: [
      "HighGroundCaptureUITests/CaptureExperienceUITests/testPhoneJourney",
      "HighGroundCaptureUITests/CaptureExperienceUITests/testRegularWidthIPadUsesANativeWorkspaceSidebar",
      "HighGroundCaptureUITests/CaptureExperienceUITests/testVoiceWritingRecordsAndStopsThroughTheSourceFirstPathOnRegularWidthIPad",
    ],
  }, {
    destination: "platform=iOS Simulator,name=iPhone 17 Pro",
    ipadDestination: "platform=iOS Simulator,name=iPad Air 13-inch (M3)",
  });

  assert.deepEqual(groups, [
    {
      name: "iPhone",
      destination: "platform=iOS Simulator,name=iPhone 17 Pro",
      selectors: ["HighGroundCaptureUITests/CaptureExperienceUITests/testPhoneJourney"],
    },
    {
      name: "iPad",
      destination: "platform=iOS Simulator,name=iPad Air 13-inch (M3)",
      selectors: [
        "HighGroundCaptureUITests/CaptureExperienceUITests/testRegularWidthIPadUsesANativeWorkspaceSidebar",
        "HighGroundCaptureUITests/CaptureExperienceUITests/testVoiceWritingRecordsAndStopsThroughTheSourceFirstPathOnRegularWidthIPad",
      ],
    },
  ]);
});

test("separate platform plans cover every critical and full-shard test exactly once", () => {
  const source = readFileSync(path.join(root, "apps/mobile-capture/HighGroundCapture/HighGroundCaptureUITests/CaptureExperienceUITests.swift"), "utf8");
  const tests = discoverDeterministicTests(source);
  const plans = [createPlan(tests), ...[1, 2, 3, 4].map(shard => createPlan(tests, { suite: "full", shard, shards: 4 }))];
  for (const plan of plans) {
    assert.deepEqual(selectPlatformPlan(plan).selectors, plan.selectors, "Local and release defaults retain all platforms");
    const lanes = ["iphone", "ipad"].map(platform => selectPlatformPlan(plan, platform));
    const combined = lanes.flatMap(lane => lane.selectors);
    assert.equal(new Set(combined).size, combined.length, "No duplicate test execution between platforms");
    assert.deepEqual([...combined].sort(), [...plan.selectors].sort(), "No missing test execution between platforms");
    for (const lane of lanes) {
      assert.equal(lane.selectedTestCount, lane.selectors.length);
      const groups = createExecutionGroups(lane, { destination: "iPhone", ipadDestination: "iPad" });
      assert.equal(groups.length, 1);
      assert.equal(groups[0].name.toLowerCase(), lane.platform);
      assert.deepEqual(createExecutionBatches(groups).flatMap(batch => batch.selectors), lane.selectors);
    }
  }
});

test("platform selection rejects typos and empty coverage instead of passing", () => {
  for (const platform of ["", "mac", "iPhone", "none"]) {
    assert.throws(() => parseRunnerArguments([`--platform=${platform}`]), /platform must/);
    assert.throws(() => selectPlatformPlan({ selectors: planned }, platform), /platform must/);
  }
  assert.equal(parseRunnerArguments([]).platform, "all");
  assert.equal(parseRunnerArguments(["--platform=ipad"]).platform, "ipad");
  assert.throws(() => selectPlatformPlan({ selectors: planned }, "ipad"), /empty platform lane cannot pass/);
});

test("detects skipped tests and refuses a false green", () => {
  const output = `
    Test Case '-[CaptureTests testIPad]' skipped (1.0 seconds).
    Executed 2 tests, with 1 test skipped and 0 failures
  `;
  assert.equal(skippedTestCount(output), 1);
  assert.throws(
    () => verifyExecution({ output, expectedCount: 2, exitCode: 0 }),
    /skipped 1 of 2 planned tests/,
  );
});

test("rejects a zero-test false green", () => {
  assert.throws(
    () => verifyExecution({
      output: "Executed 0 tests, with 0 failures\n** TEST SUCCEEDED **",
      expectedCount: 15,
      exitCode: 0,
    }),
    /executed 0 of 15 planned tests/,
  );
});

test("rejects a partial or unexpectedly broad execution", () => {
  assert.throws(
    () => verifyExecution({
      output: "Executed 14 tests, with 0 failures",
      expectedCount: 15,
      exitCode: 0,
    }),
    /executed 14 of 15 planned tests/,
  );
  assert.throws(
    () => verifyExecution({
      output: "Executed 16 tests, with 0 failures",
      expectedCount: 15,
      exitCode: 0,
    }),
    /executed 16 of 15 planned tests/,
  );
});

// Shape emitted by Xcode 26's `xcresulttool get test-results tests`.
const resultReport = (cases, bundle = "HighGroundCaptureUITests") => ({
  testNodes: [{
    nodeType: "Test Plan", name: "HighGroundCapture", children: [{
      nodeType: "UI test bundle", name: bundle, children: [{
        nodeType: "Test Suite", name: "CaptureExperienceUITests",
        children: cases.map(([name, result = "Passed"]) => ({
          nodeType: "Test Case", name: `${name}()`,
          nodeIdentifier: `CaptureExperienceUITests/${name}()`, result,
        })),
      }],
    }],
  }],
});
const planned = [
  "HighGroundCaptureUITests/CaptureExperienceUITests/testFirst",
  "HighGroundCaptureUITests/CaptureExperienceUITests/testSecond",
];

test("structured results prove each planned identity regardless of execution order", () => {
  assert.equal(verifyResultTests(resultReport([["testSecond"], ["testFirst"]]), planned), 2);
});

test("a failed process still reports exact failed test identities from the bundle", async () => {
  let reads = 0;
  await assert.rejects(verifyPlatformExecution({
    result: { output: "Executed 2 tests, with 1 failure", exitCode: 65 },
    selectors: planned, bundlePath: "/tmp/failure.xcresult",
  }, async (bundle, selectors) => {
    reads += 1;
    assert.equal(bundle, "/tmp/failure.xcresult");
    return verifyResultTests(resultReport([["testFirst"], ["testSecond", "Failed"]]), selectors);
  }), /exit code 65.*not passed: .*testSecond \(Failed\)/);
  assert.equal(reads, 1);
});

test("unreadable diagnostic evidence cannot swallow the original process failure", async () => {
  await assert.rejects(verifyPlatformExecution({
    result: { output: "", exitCode: 65 }, selectors: planned, bundlePath: "/tmp/missing.xcresult",
  }, async () => { throw new Error("result bundle unavailable"); }), /exit code 65.*result bundle unavailable/);
});

test("equal counts cannot hide a substituted, renamed, or wrong-target test", () => {
  assert.throws(
    () => verifyResultTests(resultReport([["testFirst"], ["testUnrelated"]]), planned),
    /missing: .*testSecond; unexpected: .*testUnrelated/,
  );
  assert.throws(
    () => verifyResultTests(resultReport([["testFirst"], ["testSecond"]], "OtherTests"), planned),
    /missing: .*HighGroundCaptureUITests.*unexpected: OtherTests/,
  );
});

test("structured results reject partial, empty, broad, and repeated executions", () => {
  for (const cases of [[], [["testFirst"]]]) {
    assert.throws(() => verifyResultTests(resultReport(cases), planned), /missing:/);
  }
  assert.throws(
    () => verifyResultTests(resultReport([["testFirst"], ["testSecond"], ["testExtra"]]), planned),
    /unexpected: .*testExtra/,
  );
  assert.throws(
    () => verifyResultTests(resultReport([["testFirst"], ["testFirst"]]), planned),
    /repeated planned test/,
  );
});

test("a console success cannot override skipped, failed, expected-failure, or unknown results", () => {
  for (const result of ["Skipped", "Failed", "Expected Failure", "Not Run", "", null]) {
    assert.throws(
      () => verifyResultTests(resultReport([["testFirst"], ["testSecond", result]]), planned),
      /not passed: .*testSecond/,
    );
  }
});

test("missing structured evidence or malformed test identities cannot pass", () => {
  for (const report of [null, {}, { testNodes: {} }]) {
    assert.throws(() => verifyResultTests(report, planned), /no testNodes/);
  }
  assert.throws(
    () => verifyResultTests({ testNodes: [{ nodeType: "Test Case", result: "Passed" }] }, planned),
    /missing its bundle or test identity/,
  );
  for (const selectors of [[], [planned[0], planned[0]]]) {
    assert.throws(() => verifyResultTests(resultReport([]), selectors), /nonempty, unique test plan/);
  }
});

test("Fastlane and CI route every current test to the same phone or iPad platform", () => {
  const source = readFileSync(path.join(root, "apps/mobile-capture/HighGroundCapture/HighGroundCaptureUITests/CaptureExperienceUITests.swift"), "utf8");
  const plan = createPlan(discoverDeterministicTests(source), { suite: "full", shard: 1, shards: 1 });
  const result = spawnSync("ruby", ["-rjson", "-e", `
    ${rubyMethod("capture_ui_execution_groups")}
    puts JSON.generate(capture_ui_execution_groups(JSON.parse(ARGV[0]), default_device: "iPhone"))
  `, JSON.stringify(plan.selectors)], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const rubyGroups = JSON.parse(result.stdout);
  const nodeGroups = createExecutionGroups(plan, { destination: "iPhone", ipadDestination: "iPad" });
  assert.deepEqual(rubyGroups.map((group) => group.selectors), nodeGroups.map((group) => group.selectors));
});

test("the real CLI and Fastlane reject wrong-name results even with a passing aggregate", (t) => {
  const fixture = mkdtempSync(path.join(os.tmpdir(), "capture-result-verifier-"));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  // Only the Xcode subprocess is substituted. Both checked-in entry points and
  // the shared verifier execute normally without building or uploading an app.
  writeFileSync(path.join(fixture, "xcrun"), `#!/usr/bin/env node
if (process.env.CAPTURE_RESULT_UNREADABLE === "1") process.exit(1);
process.stdout.write(process.env.CAPTURE_RESULT_FIXTURE);
`, { mode: 0o700 });
  const ruby = `
    module UI
      def self.user_error!(message); raise message; end
      def self.message(message); puts message; end
    end
    REPO_ROOT = ARGV[0]
    def capture_ui_xcresult_summary(path)
      {result: "Passed", totalTestCount: 2, passedTests: 2, failedTests: 0, skippedTests: 0, expectedFailures: 0}
    end
    ${rubyMethod("verify_capture_ui_xcresult")}
    verify_capture_ui_xcresult(ARGV[1], JSON.parse(ARGV[2]))
  `;
  for (const [cases, unreadable, passes] of [
    [[["testFirst"], ["testSecond"]], false, true],
    [[["testFirst"], ["testWrong"]], false, false],
    [[["testFirst"], ["testSecond", "Skipped"]], false, false],
    [[["testFirst"], ["testSecond"]], true, false],
  ]) {
    const env = {
      ...process.env, PATH: `${fixture}${path.delimiter}${process.env.PATH}`,
      CAPTURE_RESULT_FIXTURE: JSON.stringify(resultReport(cases)),
      CAPTURE_RESULT_UNREADABLE: unreadable ? "1" : "0",
    };
    const bundle = path.join(fixture, "bundle with spaces.xcresult");
    const cli = spawnSync(process.execPath, [
      path.join(root, "scripts/release/quipsly-capture-ui-test-runner.mjs"),
      `--verify-result-bundle=${bundle}`, ...planned.map((selector) => `--selector=${selector}`),
    ], { encoding: "utf8", env });
    assert.equal(cli.status === 0, passes, cli.stderr);
    const release = spawnSync("ruby", ["-rjson", "-ropen3", "-e", ruby, root, bundle, JSON.stringify(planned)], { encoding: "utf8", env });
    assert.equal(release.status === 0, passes, release.stderr);
  }
});

test("preserves spaces in a destination as one spawned argument", () => {
  const options = parseRunnerArguments([
    "--suite=full",
    "--shard=2",
    "--shards=4",
    "--destination=platform=iOS Simulator,name=iPhone 17 Pro",
    "--ipad-destination=platform=iOS Simulator,name=iPad Air 13-inch (M3)",
    "--evidence-root=/tmp/capture ui evidence",
  ]);
  assert.equal(options.suite, "full");
  assert.equal(options.shard, 2);
  assert.equal(options.shards, 4);
  assert.equal(options.destination, "platform=iOS Simulator,name=iPhone 17 Pro");
  assert.equal(options.ipadDestination, "platform=iOS Simulator,name=iPad Air 13-inch (M3)");
  assert.equal(options.evidenceRoot, "/tmp/capture ui evidence");
});

test("creates separate stable result bundles for each platform", () => {
  assert.equal(
    resultBundlePath("/tmp/capture-evidence", "iPhone"),
    "/tmp/capture-evidence/capture-ui-tests-iphone.xcresult",
  );
  assert.equal(
    resultBundlePath("/tmp/capture-evidence", "iPad regular width"),
    "/tmp/capture-evidence/capture-ui-tests-ipad-regular-width.xcresult",
  );
  assert.equal(resultBundlePath(null, "iPad"), null);
});

test("adds a result bundle without splitting its path", () => {
  const arguments_ = createXcodeArguments({
    selectors: ["HighGroundCaptureUITests/CaptureExperienceUITests/testOne"],
  }, {
    destination: "platform=iOS Simulator,name=iPad Air 13-inch (M3)",
    derivedDataPath: "/tmp/capture-derived",
    resultBundlePath: "/tmp/capture evidence/capture-ui-tests-ipad.xcresult",
  });
  const index = arguments_.indexOf("-resultBundlePath");
  assert.equal(arguments_[index + 1], "/tmp/capture evidence/capture-ui-tests-ipad.xcresult");
});

test("GitHub CI uses the skip-intolerant platform runner and preserves both result bundles", () => {
  assert.match(captureWorkflow, /node scripts\/release\/quipsly-capture-ui-test-runner\.mjs/);
  assert.match(captureWorkflow, /--ipad-destination="\$\{CAPTURE_IPAD_DESTINATION\}"/);
  assert.match(captureWorkflow, /--evidence-root="\$\{evidence_root\}"/);
  assert.match(captureWorkflow, /capture-ui-\*\/\*\.xcresult/);
  assert.doesNotMatch(captureWorkflow, /only_testing_args=/);
});

for (const { failure, platform, phase = "all" } of [
  ...["none", "iPhone-discovery-recovers", "iPhone-discovery-persists", "iPhone-discovery-unavailable", "iPhone-resolution-missing", "iPhone-resolution-exit", "iPhone-ambiguous", "iPhone-exit", "iPad-exit", "both-exit", "iPhone-substitution", "iPhone-unreadable"].map(failure => ({ failure, platform: "all" })),
  ...["iphone", "ipad"].flatMap(platform => ["none", platform === "iphone" ? "iPhone-exit" : "iPad-exit"].map(failure => ({ failure, platform }))),
  ...["build", "test"].map(phase => ({ failure: "none", platform: "iphone", phase })),
  { failure: "iPhone-build-exit", platform: "all" },
  { failure: "iPhone-build-exit", platform: "iphone", phase: "build" },
]) {
  test(`the real runner ${phase} phase collects ${platform} and reports ${failure} without a second cloud run`, (t) => {
    const fixture = mkdtempSync(path.join(os.tmpdir(), "capture-platform-results-"));
    t.after(() => rmSync(fixture, { recursive: true, force: true }));
    // Only Apple subprocesses are substituted. The real CLI discovers the
    // current plan, runs each destination, and verifies structured identities.
    writeFileSync(path.join(fixture, "xcodebuild"), `#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path");
const args = process.argv.slice(2);
const destination = args[args.indexOf("-destination") + 1];
const platform = destination.includes("iPad") || destination.includes("22222222-") ? "iPad" : "iPhone";
if (args.includes("-showBuildSettings")) {
  if (!args.includes("-json") || args[args.indexOf("-destination-timeout") + 1] !== "30") process.exit(98);
  if (!destination.endsWith(',arch=arm64')) process.exit(96);
  if (platform === 'iPhone' && process.env.CAPTURE_FAILURE.startsWith('iPhone-discovery-')) {
    const counter = process.env.CAPTURE_CALL_LOG + '.resolution';
    const count = fs.existsSync(counter) ? Number(fs.readFileSync(counter, 'utf8')) : 0;
    fs.writeFileSync(counter, String(count + 1));
    if (count === 0 || process.env.CAPTURE_FAILURE === 'iPhone-discovery-persists') {
      console.error(${JSON.stringify(discoveryError().stderr)});
      process.exit(64);
    }
  }
  if (platform === 'iPhone' && process.env.CAPTURE_FAILURE === 'iPhone-resolution-exit') process.exit(64);
  if (platform === 'iPhone' && process.env.CAPTURE_FAILURE === 'iPhone-ambiguous') console.error('Using the first of multiple matching destinations');
  const id = platform === 'iPhone' ? '${phoneID}' : '22222222-2222-2222-2222-222222222222';
  console.log(JSON.stringify(platform === 'iPhone' && process.env.CAPTURE_FAILURE === 'iPhone-resolution-missing' ? [] : [{
    target: 'HighGroundCapture', buildSettings: {
      TARGET_DEVICE_IDENTIFIER: id, PLATFORM_NAME: 'iphonesimulator', TARGET_DEVICE_PLATFORM_NAME: 'iphonesimulator', ARCHS: 'arm64',
      INHERITED_SECRET: 'synthetic-settings-must-not-appear-in-logs',
    },
  }]));
  process.exit(0);
}
if (destination !== 'platform=iOS Simulator,id=' + (platform === 'iPhone' ? '${phoneID}' : '22222222-2222-2222-2222-222222222222') + ',arch=arm64') process.exit(97);
if (args.at(-1) === 'build-for-testing') {
  fs.appendFileSync(process.env.CAPTURE_CALL_LOG + '.builds', platform + "\\n");
  if (process.env.CAPTURE_FAILURE === platform + '-build-exit') process.exit(65);
  console.log('BUILD SUCCEEDED');
  process.exit(0);
}
if (args.at(-1) !== 'test-without-building') process.exit(95);
const result = args[args.indexOf("-resultBundlePath") + 1];
const selectors = args.filter(arg => arg.startsWith("-only-testing:")).map(arg => arg.slice(14));
fs.appendFileSync(process.env.CAPTURE_CALL_LOG, platform + "\\n");
const cases = selectors.map(selector => {
  const [bundle, suite, method] = selector.split("/");
  return {nodeType: "UI test bundle", name: bundle, children: [{nodeType: "Test Case",
    nodeIdentifier: suite + "/" + method + "()", result: "Passed"}]};
});
if (platform === "iPhone" && process.env.CAPTURE_FAILURE === "iPhone-substitution") {
  cases[0].children[0].nodeIdentifier = "CaptureExperienceUITests/testNotInThePlan()";
}
fs.mkdirSync(result, {recursive: true});
fs.writeFileSync(path.join(result, "test-results.json"), JSON.stringify({testNodes: cases}));
console.log("Executed " + selectors.length + " tests");
if (process.env.CAPTURE_FAILURE === platform + "-exit" || process.env.CAPTURE_FAILURE === "both-exit") process.exit(65);
`, { mode: 0o700 });
    writeFileSync(path.join(fixture, "xcrun"), `#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path");
const args = process.argv.slice(2), bundle = args[args.indexOf("--path") + 1];
if (args[0] === 'simctl') {
  if (args.join(' ') === 'simctl list devices available --json') {
    console.log(JSON.stringify({devices: {'com.apple.CoreSimulator.SimRuntime.iOS-26-2':
      process.env.CAPTURE_FAILURE === 'iPhone-discovery-unavailable' ? [] : [{udid: '${phoneID}', isAvailable: true}]
    }}));
  } else if (args.join(' ') !== 'simctl bootstatus ${phoneID} -b') process.exit(99);
  process.exit(0);
}
if (bundle.includes("iphone") && process.env.CAPTURE_FAILURE === "iPhone-unreadable") process.exit(1);
process.stdout.write(fs.readFileSync(path.join(bundle, "test-results.json")));
`, { mode: 0o700 });
    const evidence = path.join(fixture, "evidence with spaces");
    const callLog = path.join(fixture, "platforms.log");
    const result = spawnSync(process.execPath, [
      path.join(root, "scripts/release/quipsly-capture-ui-test-runner.mjs"),
      "--suite=critical", `--platform=${platform}`, `--phase=${phase}`, `--evidence-root=${evidence}`,
      `--destination=${exactPhone},arch=arm64`,
      "--ipad-destination=platform=iOS Simulator,id=22222222-2222-2222-2222-222222222222,arch=arm64",
      `--derived-data=${path.join(fixture, "derived")}`,
    ], { encoding: "utf8", timeout: 30_000, env: {
      ...process.env, PATH: `${fixture}${path.delimiter}${process.env.PATH}`,
      CAPTURE_FAILURE: failure, CAPTURE_CALL_LOG: callLog,
    } });
    const passes = ["none", "iPhone-discovery-recovers"].includes(failure);
    const phoneUnresolved = ["iPhone-discovery-persists", "iPhone-discovery-unavailable", "iPhone-resolution-missing", "iPhone-resolution-exit", "iPhone-ambiguous"].includes(failure);
    const source = readFileSync(path.join(root, "apps/mobile-capture/HighGroundCapture/HighGroundCaptureUITests/CaptureExperienceUITests.swift"), "utf8");
    const groups = createExecutionGroups(selectPlatformPlan(createPlan(discoverDeterministicTests(source)), platform), {
      destination: "phone", ipadDestination: "tablet",
    }).filter(group => !phoneUnresolved || group.destination === "tablet");
    const batches = phase === "build" ? [] : createExecutionBatches(groups)
      .filter(batch => failure !== "iPhone-build-exit" || batch.destination === "tablet");
    assert.equal(result.status, passes ? 0 : 1, result.stdout + result.stderr);
    assert.doesNotMatch(result.stdout + result.stderr, /synthetic-settings-must-not-appear-in-logs/);
    const readCalls = file => existsSync(file) ? readFileSync(file, "utf8") : "";
    assert.equal(readCalls(callLog), batches.map(batch => batch.destination === "phone" ? "iPhone\n" : "iPad\n").join(""), result.stdout + result.stderr);
    assert.equal(readCalls(callLog + '.builds'), phase === "test" ? "" : groups.map(group => group.name + "\n").join(""), "Build each selected device once, not once per test batch");
    if (failure.startsWith("iPhone-discovery-")) {
      assert.equal(readFileSync(callLog + ".resolution", "utf8"), failure === "iPhone-discovery-unavailable" ? "1" : "2");
    }
    for (const batch of batches) {
      const report = JSON.parse(readFileSync(path.join(resultBundlePath(evidence, batch.name), "test-results.json"), "utf8"));
      assert.equal(report.testNodes.length, batch.selectors.length);
      if (failure !== "iPhone-substitution" || batch.destination !== "phone") {
        assert.equal(verifyResultTests(report, batch.selectors), batch.selectors.length);
      }
    }
    if (passes && phase === "build") {
      assert.match(result.stdout, /BUILD ONLY:.*no UI tests executed or qualified/);
      assert.doesNotMatch(result.stdout, /PASS: executed all/);
    } else if (passes) assert.match(result.stdout, new RegExp(`PASS: executed all .* across ${platform === "all" ? 2 : 1} platform destinations`));
    else {
      assert.doesNotMatch(result.stdout, /PASS: executed all/);
      assert.match(result.stderr, /FAIL: Capture UI validation failed/);
      if (failure === "iPhone-resolution-missing") assert.ok(result.stderr.includes(`no tests started on ${exactPhone}`));
      if (failure === "both-exit") {
        assert.match(result.stderr, /iPhone-1-of-\d+: xcodebuild failed with exit code 65/);
        assert.match(result.stderr, /iPad-1-of-\d+: xcodebuild failed with exit code 65/);
      }
    }
  });
}
