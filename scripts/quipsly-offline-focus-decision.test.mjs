#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const outbox = read("apps/mobile-capture/HighGroundCapture/HighGroundCapture/FocusBlockDecisionOutbox.swift");
const client = read("apps/mobile-capture/HighGroundCapture/HighGroundCapture/BridgeModels.swift");
const shell = read("apps/mobile-capture/HighGroundCapture/HighGroundCapture/CapturePhoneShell.swift");
const auth = read("apps/mobile-capture/HighGroundCapture/HighGroundCapture/AuthManager.swift");
const route = read("apps/quipsly/src/app/api/mobile/capture/today/route.ts");
const routeTests = read("apps/quipsly/src/app/api/mobile/capture/today/route.test.ts");
const uiTests = read("apps/mobile-capture/HighGroundCapture/HighGroundCaptureUITests/CaptureExperienceUITests.swift");

test("Capture protects explicit focus decisions before attempting Nest synchronization", () => {
  for (const required of [
    "completeFileProtectionUntilFirstUserAuthentication",
    "focus-block-decisions-v1.last-known-good.json",
    "ownerAccountID",
    "AuthManager.currentStoredOwnerID()",
    "var clientRequestID: String { id.uuidString.lowercased() }",
    "actualMinutes.map({ (1...1_440).contains($0) }) == true",
    "decisionAlreadyPending",
    "case held",
  ]) {
    assert.ok(outbox.includes(required), required);
  }
  assert.ok(
    outbox.indexOf("try commit(updated)") < outbox.indexOf("return entry"),
    "The durable commit must finish before Capture returns a saved decision.",
  );
});

test("Capture retries one stable operation and accepts only an exact boundary-bearing receipt", () => {
  for (const required of [
    '"clientRequestId": decision.clientRequestID',
    "payload.clientRequestId == decision.clientRequestID",
    "payload.status == decision.nextStatus",
    "payload.actualMinutes == decision.actualMinutes",
    "payload.receiptId == \"mobile-focus-status-\\(decision.clientRequestID)\"",
    "payload.boundaries?.completingFocusBlockMutatesTarget == false",
    "payload.boundaries?.externalCalendarMutated == false",
    "focusDecisionOutbox.markRetryable",
    "focusDecisionOutbox.markHeld",
    "focusDecisionOutbox.markAcknowledged",
  ]) {
    assert.ok(client.includes(required), required);
  }
  assert.ok(
    client.indexOf("let synchronizedFocus = await flushFocusDecisions()")
      < client.indexOf("let synchronizedReminders = await flushReminderDecisions()"),
    "Today must reconcile protected focus decisions before lower-priority outboxes.",
  );
});

test("Nest makes mobile focus replay idempotent beyond bounded receipt history", () => {
  for (const required of [
    "clientRequestIdWasProvided",
    "UUID_PATTERN.test(clientRequestId)",
    "`mobile-focus-status-${clientRequestId}`",
    "lastMobileFocusOperation",
    "priorReceipt.clientRequestId === clientRequestId",
    "priorReceipt.blockId === id",
    "priorReceipt.expectedUpdatedAt === expected.toISOString()",
    'return { kind: "saved" as const, idempotentReplay: true, record: current }',
    "externalCalendarMutated: false",
    "targetStatusMutated: false",
  ]) {
    assert.ok(route.includes(required), required);
  }
  const focusOperation = route.slice(route.indexOf("const latestMobileFocusOperation"));
  assert.ok(
    focusOperation.indexOf("latestMobileFocusOperation")
      < focusOperation.indexOf("if (current.updatedAt.getTime() !== expected.getTime())"),
    "A lost-response replay must be recognized before optimistic revision conflict handling.",
  );
  assert.ok(routeTests.includes("acknowledges an already-applied focus decision after a lost response even beyond bounded receipt history"));
  assert.ok(routeTests.includes("rejects reuse of one focus request identity for different actual time"));
});

test("the iPhone exposes protected state, retry, held discard, and relaunch recovery", () => {
  for (const required of [
    "Protected focus outbox",
    "Saved on this iPhone · waiting for Nest",
    "actual minute\\(minutes == 1 ? \"\" : \"s\") · linked work unchanged",
    "CaptureTodayFocusDecisionRetry_",
    "CaptureTodayFocusDecisionDiscard_",
  ]) {
    assert.ok(shell.includes(required), required);
  }
  for (const required of [
    "testTodayShowsProtectedOfflineFocusDecisionAcrossRelaunch",
    "--capture-focus-outbox-ui-test",
    "CaptureTodayFocusDecision_preview-block",
    "35 actual minutes · linked work unchanged",
    "app.terminate()",
    "relaunch",
  ]) {
    assert.ok(uiTests.includes(required), required);
  }
  assert.ok(auth.includes("#if DEBUG && targetEnvironment(simulator)"));
  assert.ok(auth.includes("CaptureLaunchConfiguration.shareExtensionUITestOwner"));
  assert.ok(auth.includes("Release and physical-device builds"));
});
