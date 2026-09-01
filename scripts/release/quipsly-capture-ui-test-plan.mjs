#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../..");
const DEFAULT_SOURCE = path.join(
  REPO_ROOT,
  "apps/mobile-capture/HighGroundCapture/HighGroundCaptureUITests/CaptureExperienceUITests.swift",
);

export const TEST_TARGET = "HighGroundCaptureUITests";
export const DETERMINISTIC_CLASSES = Object.freeze([
  "CaptureExperienceUITests",
  "CaptureLoginExperienceUITests",
  "ShareCaptureExtensionUITests",
]);

export const CRITICAL_TESTS = Object.freeze([
  "CaptureExperienceUITests/testRecoverableProblemStaysInlineAndDoesNotBlockNavigation",
  "CaptureExperienceUITests/testUploadAttentionOpensTheProtectedRecordingLibrary",
  "CaptureExperienceUITests/testAccountAttentionOpensAccount",
  "CaptureExperienceUITests/testCaptureFirstNavigationKeepsFiveFocusedDestinations",
  "CaptureExperienceUITests/testRegularWidthIPadUsesANativeWorkspaceSidebar",
  "CaptureExperienceUITests/testPrivateVoiceNoteOpensCaptureWithoutMeetingPaperworkOnRegularWidthIPad",
  "CaptureExperienceUITests/testVoiceWritingRecordsAndStopsThroughTheSourceFirstPath",
  "CaptureExperienceUITests/testVoiceWritingRecordsAndStopsThroughTheSourceFirstPathOnRegularWidthIPad",
  "CaptureExperienceUITests/testAudioInterruptionPausesAndRequiresExplicitResume",
  "CaptureExperienceUITests/testConsentNeededNextEpisodeOpensRecorderWithoutCrashing",
  "CaptureExperienceUITests/testConsentNeededNextEpisodeOpensRecorderWithoutCrashingOnRegularWidthIPad",
  "CaptureExperienceUITests/testClientCoachingFormDraftSurvivesRelaunchOnRegularWidthIPad",
  "CaptureExperienceUITests/testRecorderLeadsWithAStandardCallGreenRoom",
  "CaptureExperienceUITests/testRecorderLeadsWithAStandardCallGreenRoomOnRegularWidthIPad",
  "CaptureExperienceUITests/testDisconnectedCallOffersOneTapRejoinWhileKeepingRecordingSafe",
  "CaptureExperienceUITests/testRecorderUsesAFamiliarMicrophoneLevelInsteadOfAnOpaquePercentage",
  "CaptureExperienceUITests/testEpisodeWatchStagesLeadClipWithoutInventingRecordingOrSharedMutation",
  "CaptureExperienceUITests/testRehearsalReadinessMakesEveryPhysicalBoundaryVisibleBeforeRecord",
  "CaptureExperienceUITests/testConsentIsExplicitAndGatesStartRecording",
  "CaptureExperienceUITests/testSchedulingRoutesUnsubscribedCoachToNativePlan",
  "CaptureExperienceUITests/testVideoModesExplainAndExposeTheExactLocalSourceBeforeCameraPermission",
  "CaptureExperienceUITests/testVideoQualityChoiceRemainsReachableAtLargestAccessibilityTextSize",
  "CaptureExperienceUITests/testVideoOnlyConsentDoesNotAccidentallyAuthorizeAudioCapture",
  "CaptureExperienceUITests/testAccountOffersPrivacyBoundedSupportSnapshot",
  "CaptureExperienceUITests/testPrimaryRecordSurfacePassesAccessibilityAudit",
  "CaptureLoginExperienceUITests/testLoginLeadsWithStandardFederatedContinuityAndKeepsPasswordRecoveryReachableAtAccessibilityTextSize",
  "ShareCaptureExtensionUITests/testSafariShareSheetSurfacesQuipslyButKeepsPostingLockedWithoutVerifiedAccount",
]);

const HEAVY_NAME_PARTS = Object.freeze([
  "Accessibility",
  "LargestTextSize",
  "Outbox",
  "Relaunch",
  "StudioHandoff",
  "TranscriptReview",
  "Share",
]);

export function discoverDeterministicTests(source) {
  const classPattern = /^final class (\w+): XCTestCase \{/gm;
  const matches = [...source.matchAll(classPattern)];
  const discovered = [];

  for (let index = 0; index < matches.length; index += 1) {
    const className = matches[index][1];
    if (!DETERMINISTIC_CLASSES.includes(className)) continue;

    const bodyStart = matches[index].index + matches[index][0].length;
    const bodyEnd = matches[index + 1]?.index ?? source.length;
    const classBody = source.slice(bodyStart, bodyEnd);
    const testPattern = /^\s+func (test\w+)\s*\(/gm;

    for (const testMatch of classBody.matchAll(testPattern)) {
      discovered.push(`${className}/${testMatch[1]}`);
    }
  }

  return discovered.sort();
}

export function estimatedWeight(testName) {
  let weight = testName.startsWith("CaptureExperienceUITests/") ? 2 : 1;
  for (const part of HEAVY_NAME_PARTS) {
    if (testName.includes(part)) weight += 2;
  }
  if (testName.includes("AccountDeletion") || testName.includes("Packet")) weight += 1;
  return weight;
}

export function buildFullShards(tests, shardCount = 4) {
  if (!Number.isInteger(shardCount) || shardCount < 1 || shardCount > 16) {
    throw new Error("shards must be an integer from 1 through 16");
  }

  const shards = Array.from({ length: shardCount }, (_, index) => ({
    index: index + 1,
    estimatedWeight: 0,
    tests: [],
  }));
  const ordered = [...tests].sort((left, right) => {
    const weightDifference = estimatedWeight(right) - estimatedWeight(left);
    return weightDifference || left.localeCompare(right);
  });

  for (const test of ordered) {
    const shard = [...shards].sort((left, right) => {
      return left.estimatedWeight - right.estimatedWeight || left.index - right.index;
    })[0];
    shard.tests.push(test);
    shard.estimatedWeight += estimatedWeight(test);
  }

  // Greedy placement is fast and usually exact, but a single heavy journey can
  // leave two shards needlessly farther apart. A deterministic pair swap keeps
  // the complete lane balanced as regression coverage grows.
  while (true) {
    const currentSpread = Math.max(...shards.map((entry) => entry.estimatedWeight))
      - Math.min(...shards.map((entry) => entry.estimatedWeight));
    if (currentSpread <= 1) break;

    let bestSwap;
    for (let leftIndex = 0; leftIndex < shards.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < shards.length; rightIndex += 1) {
        const left = shards[leftIndex];
        const right = shards[rightIndex];
        for (const leftTest of left.tests) {
          for (const rightTest of right.tests) {
            const leftWeight = estimatedWeight(leftTest);
            const rightWeight = estimatedWeight(rightTest);
            if (leftWeight === rightWeight) continue;
            const weights = shards.map((entry, index) => {
              if (index === leftIndex) {
                return entry.estimatedWeight - leftWeight + rightWeight;
              }
              if (index === rightIndex) {
                return entry.estimatedWeight - rightWeight + leftWeight;
              }
              return entry.estimatedWeight;
            });
            const spread = Math.max(...weights) - Math.min(...weights);
            const key = `${leftTest}\n${rightTest}`;
            if (
              spread < currentSpread
              && (
                !bestSwap
                || spread < bestSwap.spread
                || (spread === bestSwap.spread && key < bestSwap.key)
              )
            ) {
              bestSwap = {
                key,
                spread,
                left,
                right,
                leftTest,
                rightTest,
                leftWeight,
                rightWeight,
              };
            }
          }
        }
      }
    }
    if (!bestSwap) break;

    bestSwap.left.tests.splice(
      bestSwap.left.tests.indexOf(bestSwap.leftTest),
      1,
      bestSwap.rightTest,
    );
    bestSwap.right.tests.splice(
      bestSwap.right.tests.indexOf(bestSwap.rightTest),
      1,
      bestSwap.leftTest,
    );
    bestSwap.left.estimatedWeight += bestSwap.rightWeight - bestSwap.leftWeight;
    bestSwap.right.estimatedWeight += bestSwap.leftWeight - bestSwap.rightWeight;
  }

  for (const shard of shards) shard.tests.sort();
  return shards;
}

export function createPlan(tests, { suite = "critical", shard = 1, shards = 4 } = {}) {
  const unknownCritical = CRITICAL_TESTS.filter((test) => !tests.includes(test));
  if (unknownCritical.length > 0) {
    throw new Error(`critical tests missing from source: ${unknownCritical.join(", ")}`);
  }

  if (suite === "critical") {
    return {
      schema: "quipsly-capture-ui-test-plan-v1",
      suite,
      shard: 1,
      shards: 1,
      discoveredTestCount: tests.length,
      selectedTestCount: CRITICAL_TESTS.length,
      estimatedWeight: CRITICAL_TESTS.reduce((sum, test) => sum + estimatedWeight(test), 0),
      selectors: CRITICAL_TESTS.map((test) => `${TEST_TARGET}/${test}`),
    };
  }

  if (suite !== "full") throw new Error("suite must be critical or full");
  const fullShards = buildFullShards(tests, shards);
  if (!Number.isInteger(shard) || shard < 1 || shard > fullShards.length) {
    throw new Error(`shard must be an integer from 1 through ${fullShards.length}`);
  }
  const selected = fullShards[shard - 1];
  return {
    schema: "quipsly-capture-ui-test-plan-v1",
    suite,
    shard,
    shards,
    discoveredTestCount: tests.length,
    selectedTestCount: selected.tests.length,
    estimatedWeight: selected.estimatedWeight,
    allShardWeights: fullShards.map((entry) => entry.estimatedWeight),
    selectors: selected.tests.map((test) => `${TEST_TARGET}/${test}`),
  };
}

export function parseArguments(argv) {
  const options = { suite: "critical", shard: 1, shards: 4, format: "json", source: DEFAULT_SOURCE };
  for (const argument of argv) {
    if (argument === "--") continue;
    const [name, value] = argument.split("=", 2);
    if (name === "--suite") options.suite = value;
    else if (name === "--shard") options.shard = Number(value);
    else if (name === "--shards") options.shards = Number(value);
    else if (name === "--format") options.format = value;
    else if (name === "--source") options.source = path.resolve(value);
    else throw new Error(`unknown argument: ${argument}`);
  }
  if (!["json", "lines"].includes(options.format)) throw new Error("format must be json or lines");
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const source = await readFile(options.source, "utf8");
  const tests = discoverDeterministicTests(source);
  if (tests.length === 0) throw new Error(`no deterministic UI tests found in ${options.source}`);
  const plan = createPlan(tests, options);
  if (options.format === "lines") process.stdout.write(`${plan.selectors.join("\n")}\n`);
  else process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`FAIL: ${error.message}\n`);
    process.exitCode = 1;
  });
}
