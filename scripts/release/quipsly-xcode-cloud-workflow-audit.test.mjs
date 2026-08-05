import assert from "node:assert/strict";
import test from "node:test";

import { analyzeWorkflow } from "./quipsly-xcode-cloud-workflow-audit.mjs";

test("flags automatic multi-platform archives as expensive", () => {
  const result = analyzeWorkflow({
    name: "Default",
    isEnabled: true,
    clean: true,
    branchStartCondition: { source: { isAllMatch: true } },
    tagStartCondition: null,
    pullRequestStartCondition: null,
    scheduledStartCondition: null,
    manualBranchStartCondition: null,
    actions: [
      { platform: "IOS" },
      { platform: "MACOS" },
      { platform: "VISIONOS" },
    ],
  });

  assert.equal(result.passed, false);
  assert.deepEqual(result.findings, [
    "automatic-starts:branch",
    "non-ios-archives:MACOS,VISIONOS",
    "action-count:3",
  ]);
});

test("accepts one manual clean-room iOS action on hold", () => {
  const result = analyzeWorkflow({
    name: "Manual iOS Clean-Room Release",
    isEnabled: false,
    clean: true,
    branchStartCondition: null,
    tagStartCondition: null,
    pullRequestStartCondition: null,
    scheduledStartCondition: null,
    manualBranchStartCondition: { source: { isAllMatch: true } },
    actions: [{ platform: "IOS" }],
  }, { expectDisabled: true });

  assert.equal(result.passed, true);
  assert.equal(result.manualBranchEnabled, true);
});
