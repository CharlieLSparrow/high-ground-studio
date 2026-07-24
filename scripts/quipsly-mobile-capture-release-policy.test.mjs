#!/usr/bin/env node

import assert from "node:assert/strict";

import { mobileCaptureReleasePolicy } from "../apps/quipsly/src/lib/server/mobile-capture-release-policy.ts";

const ready = {
  actorIsStaff: true,
  reason: "Reviewed with all participants after capture.",
  hasClientBindingOverrides: false,
  manifestVerified: true,
  normalizedReceiptExists: true,
  normalizedReceiptBindingMatches: true,
  receiptProcessingDisposition: "HELD",
  receiptTranscriptDisposition: "HELD",
  manifestProcessingDisposition: "HELD",
  manifestTranscriptDisposition: "HELD",
  allPartiesCurrentlyReady: true,
  actorConsentBindingMatches: true,
  allPartiesCurrentlyAllowTranscription: true,
};

assert.deepEqual(mobileCaptureReleasePolicy({ ...ready, actorIsStaff: false }), {
  allowed: false,
  status: 403,
  errorCode: "STAFF_RELEASE_REQUIRED",
  error: "Only Quipsly staff may release held capture media.",
}, "nonstaff release is denied before any mutation");

assert.equal(mobileCaptureReleasePolicy({
  ...ready,
  allPartiesCurrentlyReady: false,
}).errorCode, "CURRENT_ALL_PARTY_SOURCE_CONSENT_REQUIRED",
"a stale or revoked participant consent denies release");

assert.equal(mobileCaptureReleasePolicy({
  ...ready,
  hasClientBindingOverrides: true,
}).errorCode, "CLIENT_BINDING_OVERRIDE_FORBIDDEN",
"client owner/project/media overrides are denied");

assert.deepEqual(mobileCaptureReleasePolicy({
  ...ready,
  receiptProcessingDisposition: "RELEASED",
  receiptTranscriptDisposition: "RELEASED",
  manifestProcessingDisposition: "RELEASED",
  manifestTranscriptDisposition: "RELEASED",
}), {
  allowed: true,
  idempotent: true,
  reconcileControlManifest: false,
  mediaNeedsRelease: false,
  transcriptCanRelease: true,
}, "a fully released replay is idempotent and preserves the first audit");

assert.deepEqual(mobileCaptureReleasePolicy({
  ...ready,
  receiptProcessingDisposition: "RELEASED",
  receiptTranscriptDisposition: "HELD",
  manifestProcessingDisposition: "HELD",
  manifestTranscriptDisposition: "HELD",
  allPartiesCurrentlyAllowTranscription: false,
}), {
  allowed: true,
  idempotent: false,
  reconcileControlManifest: true,
  mediaNeedsRelease: false,
  transcriptCanRelease: false,
}, "a failed GCS receipt save can reconcile durable media release while transcript remains held");

assert.deepEqual(mobileCaptureReleasePolicy({
  ...ready,
  receiptProcessingDisposition: "RELEASED",
  receiptTranscriptDisposition: "RELEASED",
  manifestProcessingDisposition: "HELD",
  manifestTranscriptDisposition: "HELD",
  allPartiesCurrentlyReady: false,
  actorConsentBindingMatches: false,
  allPartiesCurrentlyAllowTranscription: false,
}), {
  allowed: true,
  idempotent: false,
  reconcileControlManifest: true,
  mediaNeedsRelease: false,
  transcriptCanRelease: true,
}, "a receipt-save retry only reconciles an already-durable release when consent later changes");

assert.deepEqual(mobileCaptureReleasePolicy({
  ...ready,
  receiptProcessingDisposition: "RELEASED",
  receiptTranscriptDisposition: "HELD",
  manifestProcessingDisposition: "HELD",
  manifestTranscriptDisposition: "HELD",
  allPartiesCurrentlyReady: false,
  actorConsentBindingMatches: false,
  allPartiesCurrentlyAllowTranscription: false,
}), {
  allowed: true,
  idempotent: false,
  reconcileControlManifest: true,
  mediaNeedsRelease: false,
  transcriptCanRelease: false,
}, "control reconciliation cannot accidentally upgrade a held transcript after consent changes");

assert.equal(mobileCaptureReleasePolicy({
  ...ready,
  receiptProcessingDisposition: "RELEASED",
  receiptTranscriptDisposition: "HELD",
  manifestProcessingDisposition: "RELEASED",
  manifestTranscriptDisposition: "HELD",
  allPartiesCurrentlyAllowTranscription: false,
}).errorCode, "ALL_PARTY_TRANSCRIPTION_CONSENT_REQUIRED",
"transcript upgrade is denied until every participant grants transcription");

console.log("PASS: staff capture release is strict, consent-current, replay-safe, and control-receipt recoverable.");
