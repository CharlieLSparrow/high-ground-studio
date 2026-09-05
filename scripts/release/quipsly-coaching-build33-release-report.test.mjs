import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const reportURL = new URL(
  "../../docs/quipsly/coaching-build33-release-report.md",
  import.meta.url,
);
const handoffURL = new URL(
  "../../docs/quipsly/coaching-cohort-release-handoff.md",
  import.meta.url,
);

const BUILD_33_RELEASE = Object.freeze({
  buildNumber: "33",
  buildId: "9a7944d0-55d7-46da-9755-694384fbe9fd",
  sourceRevision: "b84e75f8608455247c7083b933c15be645d67e8d",
  publicLink: "https://testflight.apple.com/join/XwRRcYUm",
});

test("historical coaching release report remains bound to Build 33 without claiming human acceptance", async () => {
  const report = await readFile(reportURL, "utf8");

  assert.match(report, new RegExp(`Quipsly Capture 1\\.0 \\(${BUILD_33_RELEASE.buildNumber}\\)`));
  assert.match(report, new RegExp(BUILD_33_RELEASE.buildId));
  assert.match(report, new RegExp(BUILD_33_RELEASE.sourceRevision));
  assert.match(report, new RegExp(BUILD_33_RELEASE.publicLink.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(report, /hands-off acceptance is\s+not yet proved/i);
  assert.match(report, /Only those combined authorities satisfy the active goal\./);
  assert.doesNotMatch(report, /hands-off acceptance (?:is|has been) proved/i);

  const requirementRows = report
    .split("\n")
    .filter((line) => /^\| (?:10|[1-9]) \|/.test(line));
  assert.equal(requirementRows.length, 10);
  assert.ok(requirementRows.every((line) => line.includes("| PARTIAL |")));
});

test("coaching handoff links the current report and exact post-call verifier", async () => {
  const [report, handoff] = await Promise.all([
    readFile(reportURL, "utf8"),
    readFile(handoffURL, "utf8"),
  ]);

  assert.match(handoff, /coaching-build33-release-report\.md/);
  assert.match(handoff, /Status: Build 33 .* physical human\s+acceptance remains open\./);
  assert.match(report, /quipsly:coaching:post-call-readback/);
  assert.match(report, /automatedEvidencePassed: true/);
  assert.match(report, /ROLLBACK_REVISION=<verified-previous-ready-revision>/);
  assert.doesNotMatch(report, /postgresql:\/\/[^…\s'`]+:[^…\s'`]+@/);
});
