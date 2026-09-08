#!/usr/bin/env node

import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

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
    ipadDestination:
      process.env.QUIPSLY_CAPTURE_UI_IPAD_DESTINATION
      ?? "platform=iOS Simulator,name=iPad Air 13-inch (M3)",
    derivedDataPath:
      process.env.QUIPSLY_CAPTURE_UI_DERIVED_DATA
      ?? "/tmp/quipsly-capture-ui-runner-derived",
    evidenceRoot:
      process.env.QUIPSLY_CAPTURE_UI_EVIDENCE_ROOT
      ? path.resolve(process.env.QUIPSLY_CAPTURE_UI_EVIDENCE_ROOT)
      : null,
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
    else if (name === "--ipad-destination") options.ipadDestination = value;
    else if (name === "--derived-data") options.derivedDataPath = path.resolve(value);
    else if (name === "--evidence-root") options.evidenceRoot = path.resolve(value);
    else throw new Error(`unknown argument: ${argument}`);
  }

  return options;
}

export function createExecutionGroups(plan, options) {
  const ipadSelectors = plan.selectors.filter((selector) =>
    selector.includes("RegularWidthIPad"));
  const iphoneSelectors = plan.selectors.filter((selector) =>
    !selector.includes("RegularWidthIPad"));
  return [
    iphoneSelectors.length > 0
      ? {
          name: "iPhone",
          destination: options.destination,
          selectors: iphoneSelectors,
        }
      : null,
    ipadSelectors.length > 0
      ? {
          name: "iPad",
          destination: options.ipadDestination,
          selectors: ipadSelectors,
        }
      : null,
  ].filter(Boolean);
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
    ...(options.resultBundlePath
      ? ["-resultBundlePath", options.resultBundlePath]
      : []),
    ...plan.selectors.map((selector) => `-only-testing:${selector}`),
    "test",
  ];
}

export function resolvedSimulatorDestination(output, destination) {
  const requested = Object.fromEntries(destination.split(",").map((part) => {
    const separator = part.indexOf("=");
    return [part.slice(0, separator).trim(), part.slice(separator + 1).trim()];
  }));
  if (requested.platform !== "iOS Simulator" || (!requested.id && !requested.name)
    || Object.keys(requested).some((key) => !["platform", "id", "name", "OS", "arch"].includes(key))) {
    throw new Error(`Unsupported simulator destination: ${destination}`);
  }
  const targets = JSON.parse(output);
  const appTargets = Array.isArray(targets)
    ? targets.filter((entry) => entry.target === "HighGroundCapture") : [];
  const settings = appTargets.length === 1 ? appTargets[0].buildSettings : null;
  const id = settings?.TARGET_DEVICE_IDENTIFIER;
  if (!/^[0-9a-f-]{36}$/i.test(id ?? "")
    || settings.PLATFORM_NAME !== "iphonesimulator"
    || settings.TARGET_DEVICE_PLATFORM_NAME !== "iphonesimulator"
    || (requested.id && requested.id.toLowerCase() !== id.toLowerCase())
    || (requested.OS && requested.OS !== "latest" && requested.OS !== settings.TARGET_DEVICE_OS_VERSION)
    || (requested.arch && !String(settings.ARCHS ?? "").split(/\s+/).includes(requested.arch))) {
    throw new Error(`Xcode did not resolve the requested simulator; no tests started on ${destination}`);
  }
  // A name/OS request has now been resolved by Xcode. Use that same identity
  // for testing instead of doing a second potentially different lookup.
  return `platform=iOS Simulator,id=${id}${requested.arch ? `,arch=${requested.arch}` : ""}`;
}

export async function ensureXcodeDestination(options, {
  resolve = async () => {
    try {
      const result = await promisify(execFile)("xcodebuild", [
        "-project", PROJECT, "-scheme", "HighGroundCapture",
        "-derivedDataPath", options.derivedDataPath,
        "-destination", options.destination, "-destination-timeout", "30",
        "-showBuildSettings", "-json",
      ], { encoding: "utf8", timeout: 180_000, maxBuffer: 4 * 1024 * 1024 });
      process.stderr.write(result.stderr);
      if (/multiple matching destinations/i.test(result.stderr)) {
        throw new Error(`Ambiguous simulator destination: ${options.destination}`);
      }
      // Build settings can contain inherited environment values. Do not dump
      // them into shared CI logs; report only the verified device below.
      return result.stdout;
    } catch (error) {
      process.stderr.write(error.stderr ?? "");
      throw error;
    }
  },
} = {}) {
  process.stdout.write(`Resolving Xcode simulator: ${options.destination}\n`);
  const resolved = resolvedSimulatorDestination(await resolve(), options.destination);
  process.stdout.write(`Xcode resolved ${resolved}\n`);
  return resolved;
}

export function resultBundlePath(evidenceRoot, platformName) {
  if (!evidenceRoot) return null;
  const suffix = platformName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return path.join(evidenceRoot, `capture-ui-tests-${suffix}.xcresult`);
}

export function executedTestCount(output) {
  const counts = [...output.matchAll(/Executed\s+(\d+)\s+tests?/g)]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
  return counts.length > 0 ? Math.max(...counts) : 0;
}

export function skippedTestCount(output) {
  const explicitCases = output.match(/Test Case .* skipped \(/g) ?? [];
  if (explicitCases.length > 0) return explicitCases.length;
  const aggregateCounts = [...output.matchAll(/with\s+(\d+)\s+tests?\s+skipped/g)]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
  return aggregateCounts.length > 0 ? Math.max(...aggregateCounts) : 0;
}

export function verifyExecution({ output, expectedCount, exitCode }) {
  const executedCount = executedTestCount(output);
  const skippedCount = skippedTestCount(output);
  if (exitCode !== 0) {
    throw new Error(
      `xcodebuild failed with exit code ${exitCode}; ${executedCount} of ${expectedCount} planned tests executed`,
    );
  }
  if (skippedCount !== 0) {
    throw new Error(
      `xcodebuild skipped ${skippedCount} of ${expectedCount} planned tests`,
    );
  }
  if (executedCount !== expectedCount) {
    throw new Error(
      `xcodebuild reported success but executed ${executedCount} of ${expectedCount} planned tests`,
    );
  }
  return executedCount;
}

// An aggregate count can be green even when selectors drift and the wrong
// journeys run. Match every planned identity against Xcode's result bundle.
export function verifyResultTests(report, selectors) {
  if (!Array.isArray(selectors) || selectors.length === 0
    || new Set(selectors).size !== selectors.length) {
    throw new Error("result verification requires a nonempty, unique test plan");
  }
  if (!Array.isArray(report?.testNodes)) {
    throw new Error("Xcode result report has no testNodes");
  }
  const actual = new Map();
  const visit = (nodes, bundle) => {
    for (const node of nodes) {
      const target = ["UI test bundle", "Unit test bundle"].includes(node.nodeType)
        ? node.name : bundle;
      if (node.nodeType === "Test Case") {
        const identifier = node.nodeIdentifier?.replace(/\(\)$/, "");
        if (!target || !identifier || !/^[^/]+\/[^/]+$/.test(identifier)) {
          throw new Error("Xcode test case is missing its bundle or test identity");
        }
        const selector = `${target}/${identifier}`;
        if (actual.has(selector)) throw new Error(`Xcode repeated planned test ${selector}`);
        actual.set(selector, node.result);
      }
      if (node.children) visit(node.children, target);
    }
  };
  visit(report.testNodes);
  const planned = new Set(selectors);
  const missing = selectors.filter((selector) => !actual.has(selector));
  const unexpected = [...actual.keys()].filter((selector) => !planned.has(selector));
  const unsuccessful = [...actual].filter(([, result]) => result !== "Passed");
  const problems = [
    missing.length ? `missing: ${missing.join(", ")}` : null,
    unexpected.length ? `unexpected: ${unexpected.join(", ")}` : null,
    unsuccessful.length
      ? `not passed: ${unsuccessful.map(([selector, result]) => `${selector} (${result ?? "unknown"})`).join(", ")}`
      : null,
  ].filter(Boolean);
  if (problems.length) throw new Error(`Xcode result identities do not satisfy the plan; ${problems.join("; ")}`);
  return actual.size;
}

export async function verifyResultBundle(bundlePath, selectors) {
  const { stdout } = await promisify(execFile)("xcrun", [
    "xcresulttool", "get", "test-results", "tests", "--path", bundlePath, "--compact",
  ], { maxBuffer: 16 * 1024 * 1024, timeout: 60_000 });
  return verifyResultTests(JSON.parse(stdout), selectors);
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
  const argv = process.argv.slice(2);
  if (argv[0]?.startsWith("--verify-result-bundle=")) {
    const bundlePath = argv[0].slice("--verify-result-bundle=".length);
    if (!bundlePath || argv.slice(1).some((arg) => !arg.startsWith("--selector="))) {
      throw new Error("result verification requires a bundle and --selector arguments");
    }
    const selectors = argv.slice(1).map((arg) => arg.slice("--selector=".length));
    const count = await verifyResultBundle(bundlePath, selectors);
    process.stdout.write(`PASS: verified all ${count} planned test identities in ${bundlePath}\n`);
    return;
  }
  const options = parseRunnerArguments(argv);
  const tests = discoverDeterministicTests(await readFile(SOURCE, "utf8"));
  const plan = createPlan(tests, options);
  const executionGroups = createExecutionGroups(plan, options);
  options.evidenceRoot ??= await mkdtemp(path.join(os.tmpdir(), "quipsly-capture-ui-"));
  await mkdir(options.evidenceRoot, { recursive: true });
  process.stdout.write(`Xcode results: ${options.evidenceRoot}\n`);

  process.stdout.write(
    `Quipsly Capture ${plan.suite} UI suite: ${plan.selectedTestCount} tests`
      + `${plan.shards > 1 ? ` · shard ${plan.shard}/${plan.shards}` : ""}\n`,
  );
  let executedCount = 0;
  const failures = [];
  for (const execution of executionGroups) {
    const bundlePath = resultBundlePath(options.evidenceRoot, execution.name);
    process.stdout.write(
      `Running ${execution.selectors.length} ${execution.name} contracts on ${execution.destination}\n`,
    );
    try {
      const resolvedDestination = await ensureXcodeDestination({ ...options, destination: execution.destination });
      const result = await runXcodebuild(createXcodeArguments(
        { selectors: execution.selectors },
        {
          ...options,
          destination: resolvedDestination,
          resultBundlePath: bundlePath,
        },
      ));
      verifyExecution({
        ...result,
        expectedCount: execution.selectors.length,
      });
      executedCount += await verifyResultBundle(bundlePath, execution.selectors);
    } catch (error) {
      // Platform failures are independent. Retain their evidence and exercise
      // the other destination once; do not retry failures into a green result.
      const failure = `${execution.name}: ${error instanceof Error ? error.message : String(error)}`;
      failures.push(failure);
      process.stderr.write(`${failure}\nResults (if produced): ${bundlePath}\n`);
    }
  }
  if (failures.length) {
    throw new Error(`Capture UI validation failed on ${failures.length} platform destination(s):\n${failures.join("\n")}`);
  }
  if (executedCount !== plan.selectedTestCount) {
    throw new Error(
      `platform executions covered ${executedCount} of ${plan.selectedTestCount} planned tests`,
    );
  }
  process.stdout.write(
    `PASS: executed all ${executedCount} planned Capture UI tests across ${executionGroups.length} platform destinations.\n`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`FAIL: ${error.message}\n`);
    process.exitCode = 1;
  });
}
