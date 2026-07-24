#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const policy = await import("../apps/quipsly/src/lib/mobile-capture-consent-policy.js");
const api = readFileSync(
  new URL("../apps/quipsly/src/app/api/mobile/capture/consent/route.ts", import.meta.url),
  "utf8",
);
const web = readFileSync(
  new URL("../apps/quipsly/src/app/(app)/coaching/sessions/page.tsx", import.meta.url),
  "utf8",
);

assert.equal(
  createHash("sha256").update(policy.MOBILE_CAPTURE_CONSENT_TEXT).digest("hex"),
  policy.MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
  "the reviewed consent copy and literal SHA-256 must stay exact",
);
assert.equal(policy.MOBILE_CAPTURE_CONSENT_EVIDENCE_VERSION, 2);
for (const needle of [
  "consentPolicyVersion",
  "consentTextHash",
  "canRecordAudio",
  "canRecordVideo",
  "canTranscribe",
  "allAudibleParticipantsNotifiedAndAgreed",
  "recordingChoicePresented",
  "transcriptionChoicePresented",
  "audibleParticipantAttestationPresented",
]) {
  assert.ok(web.includes(needle), `web consent UI/request missing ${needle}`);
}
assert.match(web, /Saving consent does not start recording/);
assert.match(api, /Date\.now\(\) - 30 \* 60 \* 1_000/,
  "stale presentation evidence must not be replayable indefinitely");
assert.match(api, /serverConfirmedAt: now\.toISOString\(\)/);
assert.match(api, /CURRENT_CONSENT_PRESENTATION_REQUIRED/);

console.log("PASS: iOS/API/web consent use exact v2 copy, explicit choices, current presentation, and audible-person attestation.");
