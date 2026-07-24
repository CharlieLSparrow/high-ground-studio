#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");
const sessions = read("apps/quipsly/src/lib/server/mobile-capture-sessions.ts");
const sessionsRoute = read("apps/quipsly/src/app/api/mobile/capture/sessions/route.ts");
const digest = read("apps/quipsly/src/app/api/mobile/capture/review-digest/route.ts");
const runway = read("apps/quipsly/src/app/api/coaching/runway/route.ts");

for (const source of [sessions, runway]) {
  assert.match(source, /mobileCaptureProcessingGateFromEvidence/);
  assert.match(source, /transcript-held|TRANSCRIPT_HELD/);
  assert.match(source, /transcriptProcessingAllowed/);
  assert.match(source, /transcriptJobId/);
}
for (const source of [sessionsRoute, digest, runway]) {
  assert.match(source, /mobileCaptureFinalizationReceipt\.findMany/,
    "projection routes must load normalized disposition receipts rather than infer from status");
}
assert.doesNotMatch(
  runway.slice(runway.indexOf("function recordingServerVerified"), runway.indexOf("function isProviderRecordingReceiptSlot")),
  /UPLOADED/,
  "an uploaded-but-unverified recording cannot be advertised as server verified",
);
assert.match(runway, /buildMobileCaptureConsentVersions/);
assert.match(runway, /mobileCaptureAllPartiesReady/);
assert.match(runway, /Await reviewed transcript release/i);
assert.match(sessions, /canRunTranscript =\s*\n\s*input\.transcriptProcessingAllowed/);
assert.match(sessions, /canBuildPacket =\s*\n\s*input\.transcriptProcessingAllowed/);
assert.match(sessions, /canReviewPacket = input\.transcriptProcessingAllowed/);

console.log("PASS: sessions, digest, and coaching runway quarantine held capture/transcript projections.");
