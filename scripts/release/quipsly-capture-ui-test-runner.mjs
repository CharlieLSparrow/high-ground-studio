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
    platform: "all",
    phase: "all",
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
    else if (name === "--platform") options.platform = value;
    else if (name === "--phase") options.phase = value;
    else if (name === "--shard") options.shard = Number(value);
    else if (name === "--shards") options.shards = Number(value);
    else if (name === "--destination") options.destination = value;
    else if (name === "--ipad-destination") options.ipadDestination = value;
    else if (name === "--derived-data") options.derivedDataPath = path.resolve(value);
    else if (name === "--evidence-root") options.evidenceRoot = path.resolve(value);
    else throw new Error(`unknown argument: ${argument}`);
  }

  if (!["all", "iphone", "ipad"].includes(options.platform)) {
    throw new Error("platform must be all, iphone, or ipad");
  }
  if (!["all", "build", "test"].includes(options.phase)) {
    throw new Error("phase must be all, build, or test");
  }
  return options;
}

/** The CI platform lanes partition the same plan; they never substitute a
 * shorter suite. Local/release invocations still default to both devices. */
export function selectPlatformPlan(plan, platform = "all") {
  if (!["all", "iphone", "ipad"].includes(platform)) throw new Error("platform must be all, iphone, or ipad");
  const selectors = platform === "all" ? plan.selectors : plan.selectors.filter(selector =>
    selector.includes("RegularWidthIPad") === (platform === "ipad"));
  if (!selectors.length) throw new Error(`No tests selected for ${platform}; an empty platform lane cannot pass`);
  return { ...plan, platform, selectedTestCount: selectors.length, selectors };
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

// Finish small result bundles as we go. If the CI job reaches its overall
// deadline, Xcode may leave the active bundle unreadable; earlier batches
// must still retain their screenshots, failures, and exact test identities.
// This changes neither selected coverage nor the number of test attempts.
export function createExecutionBatches(groups, batchSize = 8) {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error("test batch size must be a positive integer");
  }
  return groups.flatMap((group) => {
    const count = Math.ceil(group.selectors.length / batchSize);
    return Array.from({ length: count }, (_, index) => ({
      ...group,
      name: count === 1 ? group.name : `${group.name}-${index + 1}-of-${count}`,
      selectors: group.selectors.slice(index * batchSize, (index + 1) * batchSize),
    }));
  });
}

export function createXcodeArguments(plan, options) {
  const action = options.action ?? "test";
  if (!["test", "build-for-testing", "test-without-building"].includes(action)) {
    throw new Error("Unsupported Xcode test action");
  }
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
    action,
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

export function simulatorDiscoveryLag(error, destination) {
  const match = /^platform=iOS Simulator,id=([0-9a-f-]{36})(?:,arch=(?:arm64|x86_64))?$/i.exec(destination);
  const stderr = String(error?.stderr ?? "");
  const available = stderr.split(/Available destinations for[^\n]*:/i)[1];
  // Only the observed cold-runner failure qualifies. A concrete destination,
  // missing runtime, bad package, timeout, or name-based request is not lag.
  // Xcode 26.2's -showBuildSettings reports this destination failure as 64;
  // other destination operations use 70. The diagnostic and exact-device
  // recheck, not an exit code alone, establish eligibility for setup recovery.
  return match && [64, 70].includes(error?.code) && !error?.killed
    && /Unable to find a device matching the provided destination specifier/i.test(stderr)
    && available?.includes("DVTiOSDeviceSimulatorPlaceholder")
    && !/\bid:[ ]*[0-9a-f]{8}-[0-9a-f-]{27}/i.test(available)
    && !/Ineligible destinations|error:|not installed/i.test(available)
    ? match[1] : null;
}

export async function refreshAvailableSimulator(id, run = promisify(execFile)) {
  const { stdout } = await run("xcrun", ["simctl", "list", "devices", "available", "--json"],
    { encoding: "utf8", timeout: 30_000, maxBuffer: 4 * 1024 * 1024 });
  const matches = Object.entries(JSON.parse(stdout).devices ?? {})
    .filter(([runtime]) => runtime.startsWith("com.apple.CoreSimulator.SimRuntime.iOS-"))
    .flatMap(([, devices]) => Array.isArray(devices) ? devices : [])
    .filter(device => device.udid?.toLowerCase() === id.toLowerCase());
  if (matches.length !== 1 || matches[0].isAvailable !== true) {
    throw new Error(`Requested simulator ${id} is no longer available; no tests started`);
  }
  // Recheck the same identity immediately before Xcode resolution, rather than
  // trusting a Safari launch several minutes earlier on the hosted runner.
  await run("xcrun", ["simctl", "bootstatus", id, "-b"],
    { encoding: "utf8", timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });
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
  refresh = refreshAvailableSimulator,
} = {}) {
  process.stdout.write(`Resolving Xcode simulator: ${options.destination}\n`);
  let output;
  try {
    output = await resolve();
  } catch (error) {
    const id = simulatorDiscoveryLag(error, options.destination);
    if (!id) throw error;
    process.stdout.write(`Xcode has not discovered simulator ${id}; checking that exact device before one setup-only retry.\n`);
    try {
      await refresh(id);
      output = await resolve();
    } catch (recoveryError) {
      throw new Error(`Xcode simulator discovery failed before tests started; recovery: ${recoveryError.message}`, { cause: error });
    }
  }
  const resolved = resolvedSimulatorDestination(output, options.destination);
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

// An exit-code failure must not hide the named test failures in the result
// bundle. Keep both signals, including a missing/unreadable bundle, in the
// final platform summary so diagnosing CI does not require scanning build logs.
export async function verifyPlatformExecution({ result, bundlePath, selectors }, verifyBundle = verifyResultBundle) {
  const problems = [];
  let verifiedCount = 0;
  try {
    verifyExecution({ ...result, expectedCount: selectors.length });
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }
  try {
    verifiedCount = await verifyBundle(bundlePath, selectors);
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }
  if (problems.length) throw new Error(problems.join("; "));
  return verifiedCount;
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
  const plan = selectPlatformPlan(createPlan(tests, options), options.platform);
  const executionGroups = createExecutionGroups(plan, options);
  options.evidenceRoot ??= await mkdtemp(path.join(os.tmpdir(), "quipsly-capture-ui-"));
  await mkdir(options.evidenceRoot, { recursive: true });
  process.stdout.write(`Xcode results: ${options.evidenceRoot}\n`);

  process.stdout.write(
    `Quipsly Capture ${plan.suite} UI suite (${plan.platform}): ${plan.selectedTestCount} tests`
      + `${plan.shards > 1 ? ` · shard ${plan.shard}/${plan.shards}` : ""}\n`,
  );
  let executedCount = 0;
  const failures = [];
  for (const group of executionGroups) {
    let resolvedDestination;
    try {
      resolvedDestination = await ensureXcodeDestination({ ...options, destination: group.destination });
    } catch (error) {
      const failure = `${group.name}: ${error instanceof Error ? error.message : String(error)}`;
      failures.push(failure);
      process.stderr.write(`${failure}\n`);
      continue;
    }
    if (options.phase !== "test") {
      const bundlePath = resultBundlePath(options.evidenceRoot, `${group.name}-build`);
      process.stdout.write(`Building ${group.name} test products once on ${resolvedDestination}\n`);
      try {
        const result = await runXcodebuild(createXcodeArguments(group, {
          ...options, destination: resolvedDestination, resultBundlePath: bundlePath,
          action: "build-for-testing",
        }));
        if (result.exitCode !== 0) throw new Error(`build-for-testing failed with exit code ${result.exitCode}`);
      } catch (error) {
        failures.push(`${group.name} build: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
    }
    if (options.phase === "build") continue;
    for (const execution of createExecutionBatches([group])) {
      const bundlePath = resultBundlePath(options.evidenceRoot, execution.name);
      process.stdout.write(
        `Running ${execution.selectors.length} ${execution.name} contracts on ${execution.destination}\n`,
      );
      try {
        const result = await runXcodebuild(createXcodeArguments(
          { selectors: execution.selectors },
          {
            ...options,
            destination: resolvedDestination,
            resultBundlePath: bundlePath,
            action: "test-without-building",
          },
        ));
        executedCount += await verifyPlatformExecution({
          result,
          bundlePath,
          selectors: execution.selectors,
        });
      } catch (error) {
        // Batches are independent. Retain each finished bundle and exercise
        // the remaining selectors once; do not retry failures into a green result.
        const failure = `${execution.name}: ${error instanceof Error ? error.message : String(error)}`;
        failures.push(failure);
        process.stderr.write(`${failure}\nResults (if produced): ${bundlePath}\n`);
      }
    }
  }
  if (failures.length) {
    throw new Error(`Capture UI validation failed in ${failures.length} destination setup(s) or test batch(es):\n${failures.join("\n")}`);
  }
  if (options.phase === "build") {
    process.stdout.write("BUILD ONLY: test products compiled; no UI tests executed or qualified.\n");
    return;
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
