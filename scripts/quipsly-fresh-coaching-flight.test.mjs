import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const subject = fileURLToPath(
  new URL("./quipsly-fresh-coaching-flight.mjs", import.meta.url),
);

test("fresh coaching flight retains a private receipt without claiming human acceptance", () => {
  const source = readFileSync(subject, "utf8");

  assert.match(source, /schema: "quipsly-fresh-coaching-flight-receipt-v3"/);
  assert.match(source, /"fresh-coaching-flight-receipt\.json"/);
  assert.match(source, /testLane: "fresh-product-automation"/);
  assert.match(source, /sourceContextLane: start\.testLane/);
  assert.match(source, /--experimental-transform-types/);
  assert.match(source, /quipsly-fresh-coaching-isolation-operation\.mjs/);
  assert.match(source, /coachAndClientTenantIsolationOperated:/);
  assert.match(source, /authorizedListsAndUnauthorizedDirectProbes:/);
  assert.match(source, /neighboringTenantDataPresentDuringIsolationProof:/);
  assert.match(source, /unrelatedPodcastLeakageObserved:/);
  assert.match(source, /interactionSurfaceEvidence:/);
  assert.match(source, /oneTimeInvitationAcceptance:/);
  assert.match(source, /localInvitationDeliveryBoundaryUsed:/);
  assert.match(source, /combinedReceiptIsNotPureUIAutomation: true/);
  assert.match(source, /quipsly-fresh-session-audio-polish-operation\.mjs/);
  assert.match(source, /automaticPostCallAudioReadinessOperated:/);
  assert.match(source, /automaticPostCallAudioResult:/);
  assert.match(source, /mentorTranscriptReportOperated:/);
  assert.match(source, /quipsly-coaching-transcript-report-v2/);
  assert.match(source, /automaticAudioResultWasNotPublished:/);
  assert.match(source, /conventionalCallEntryOperated:/);
  assert.match(source, /advancedDeviceSettingsCollapsedBeforeJoin/);
  assert.match(source, /technicalDeviceDetailsCollapsedBeforeJoin/);
  assert.match(source, /unchangedSessionConsentRemembered:/);
  assert.match(source, /savedConsentRestoredAfterReentry/);
  assert.match(source, /audioPolish\?\.actionOperated,/);
  assert.match(source, /audioPolish\?\.initialState,/);
  assert.match(source, /originalSourceAndCaptureManifestUnchanged/);
  assert.match(source, /humanAcceptanceSatisfied: false/);
  assert.match(source, /minimallyInstructedHumanAcceptanceProven: false/);
  assert.match(source, /sourceSha/);
  assert.match(source, /trackedWorktreeCleanAtStart/);
  assert.match(source, /releaseIdentity,/);
  assert.match(source, /writeFile\(receiptPath/);
  assert.match(source, /mode: 0o600/);
  assert.match(source, /chmod\(receiptPath, 0o600\)/);
});
