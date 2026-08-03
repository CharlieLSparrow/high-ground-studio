#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [operation, runner, contentView, reviewView, runtimeTests] = await Promise.all([
  readFile(new URL("./quipsly-retained-native-offline-transcript-review-operation.mjs", import.meta.url), "utf8"),
  readFile(new URL("../apps/mobile-capture/HighGroundCapture/scripts/run-capture-runtime-ui-smoke.sh", import.meta.url), "utf8"),
  readFile(new URL("../apps/mobile-capture/HighGroundCapture/HighGroundCapture/ContentView.swift", import.meta.url), "utf8"),
  readFile(new URL("../apps/mobile-capture/HighGroundCapture/HighGroundCapture/TranscriptCorrectionReview.swift", import.meta.url), "utf8"),
  readFile(new URL("../apps/mobile-capture/HighGroundCapture/HighGroundCaptureUITests/CaptureRoomRuntimeSmokeTests.swift", import.meta.url), "utf8"),
]);

assert.match(operation, /QUIPSLY_RETAINED_OFFLINE_TRANSCRIPT_REVIEW_OPERATION === "1"/);
assert.match(operation, /requires an explicit loopback PostgreSQL database/);
assert.match(operation, /transcriptSegmentVerification\.findMany/);
assert.match(operation, /corrections\[0\]\.correctedText === conflictCorrectionText/);
assert.match(operation, /corrections\[0\]\.correctedText !== phoneCorrectionText/);
assert.match(operation, /providerSegmentsImmutable: true/);
assert.match(operation, /canonicalMaterialization: \{ notes: 0, tasks: 0, goals: 0, calendarLinks: 0 \}/);
assert.match(runner, /transcript-review-offline-reconcile\)/);
assert.match(runner, /distinct phone\/concurrent correction text/);
assert.match(contentView, /CaptureOfflineTranscriptReviewLink_/);
assert.match(contentView, /Exact local-source transcript review/);
assert.match(reviewView, /CaptureTranscriptAcceptCorrectionButton_/);
assert.match(runtimeTests, /testOfflineTranscriptReviewQueuesSurvivesRelaunchReconcilesAndHoldsConflict/);
assert.match(runtimeTests, /CaptureTranscriptProtectedCacheBoundary/);
assert.match(runtimeTests, /injectConcurrentTranscriptCorrection/);
assert.match(runtimeTests, /CaptureTranscriptReviewOutboxBoundary/);
assert.match(runtimeTests, /CaptureTranscriptVerifiedAsIs_/);
assert.match(runtimeTests, /CaptureTranscriptDecisionPending_/);

console.log("PASS retained native offline transcript-review operation contract");
