import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  createXcodeArguments,
  createExecutionGroups,
  executedTestCount,
  parseRunnerArguments,
  resultBundlePath,
  skippedTestCount,
  verifyExecution,
  verifyResultTests,
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
