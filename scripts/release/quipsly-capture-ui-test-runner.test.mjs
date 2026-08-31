import assert from "node:assert/strict";
import test from "node:test";

import {
  createXcodeArguments,
  executedTestCount,
  parseRunnerArguments,
  verifyExecution,
} from "./quipsly-capture-ui-test-runner.mjs";

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

test("preserves spaces in a destination as one spawned argument", () => {
  const options = parseRunnerArguments([
    "--suite=full",
    "--shard=2",
    "--shards=4",
    "--destination=platform=iOS Simulator,name=iPhone 17 Pro",
  ]);
  assert.equal(options.suite, "full");
  assert.equal(options.shard, 2);
  assert.equal(options.shards, 4);
  assert.equal(options.destination, "platform=iOS Simulator,name=iPhone 17 Pro");
});
