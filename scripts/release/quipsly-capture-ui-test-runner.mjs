#!/usr/bin/env node

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createPlan,
  discoverDeterministicTests,
} from "./quipsly-capture-ui-test-plan.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../..");
const PROJECT = path.join(
  REPO_ROOT,
  "apps/mobile-capture/HighGroundCapture/HighGroundCapture.xcodeproj",
);
const SOURCE = path.join(
  REPO_ROOT,
  "apps/mobile-capture/HighGroundCapture/HighGroundCaptureUITests/CaptureExperienceUITests.swift",
);

export function parseRunnerArguments(argv) {
  const options = {
    suite: "critical",
    shard: 1,
    shards: 4,
    destination:
      process.env.QUIPSLY_CAPTURE_UI_DESTINATION
      ?? "platform=iOS Simulator,name=iPhone 17 Pro",
    derivedDataPath:
      process.env.QUIPSLY_CAPTURE_UI_DERIVED_DATA
      ?? "/tmp/quipsly-capture-ui-runner-derived",
  };

  for (const argument of argv) {
    if (argument === "--") continue;
    const separator = argument.indexOf("=");
    if (separator < 0) throw new Error(`argument requires a value: ${argument}`);
    const name = argument.slice(0, separator);
    const value = argument.slice(separator + 1);
    if (name === "--suite") options.suite = value;
    else if (name === "--shard") options.shard = Number(value);
    else if (name === "--shards") options.shards = Number(value);
    else if (name === "--destination") options.destination = value;
    else if (name === "--derived-data") options.derivedDataPath = path.resolve(value);
    else throw new Error(`unknown argument: ${argument}`);
  }

  return options;
}

export function createXcodeArguments(plan, options) {
  return [
    "-project",
    PROJECT,
    "-scheme",
    "HighGroundCapture",
    "-destination",
    options.destination,
    "-derivedDataPath",
    options.derivedDataPath,
    "-parallel-testing-enabled",
    "NO",
    ...plan.selectors.map((selector) => `-only-testing:${selector}`),
    "test",
  ];
}

export function executedTestCount(output) {
  const counts = [...output.matchAll(/Executed\s+(\d+)\s+tests?/g)]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
  return counts.length > 0 ? Math.max(...counts) : 0;
}

export function verifyExecution({ output, expectedCount, exitCode }) {
  const executedCount = executedTestCount(output);
  if (exitCode !== 0) {
    throw new Error(
      `xcodebuild failed with exit code ${exitCode}; ${executedCount} of ${expectedCount} planned tests executed`,
    );
  }
  if (executedCount !== expectedCount) {
    throw new Error(
      `xcodebuild reported success but executed ${executedCount} of ${expectedCount} planned tests`,
    );
  }
  return executedCount;
}

async function runXcodebuild(arguments_) {
  return new Promise((resolve, reject) => {
    const child = spawn("xcodebuild", arguments_, {
      cwd: REPO_ROOT,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks = [];
    const forward = (stream, target) => {
      stream.on("data", (chunk) => {
        chunks.push(Buffer.from(chunk));
        target.write(chunk);
      });
    };
    forward(child.stdout, process.stdout);
    forward(child.stderr, process.stderr);
    child.once("error", reject);
    child.once("close", (exitCode) => {
      resolve({
        exitCode: exitCode ?? 1,
        output: Buffer.concat(chunks).toString("utf8"),
      });
    });
  });
}

async function main() {
  const options = parseRunnerArguments(process.argv.slice(2));
  const tests = discoverDeterministicTests(await readFile(SOURCE, "utf8"));
  const plan = createPlan(tests, options);
  const xcodeArguments = createXcodeArguments(plan, options);

  process.stdout.write(
    `Quipsly Capture ${plan.suite} UI suite: ${plan.selectedTestCount} tests`
      + `${plan.shards > 1 ? ` · shard ${plan.shard}/${plan.shards}` : ""}\n`,
  );
  const result = await runXcodebuild(xcodeArguments);
  const count = verifyExecution({
    ...result,
    expectedCount: plan.selectedTestCount,
  });
  process.stdout.write(`PASS: executed all ${count} planned Capture UI tests.\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`FAIL: ${error.message}\n`);
    process.exitCode = 1;
  });
}
