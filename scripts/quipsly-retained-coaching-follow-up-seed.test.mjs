import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  materializeRetainedCoachingContinuitySource,
  RETAINED_COACHING_CONTINUITY_SOURCE,
} from "./lib/retained-coaching-continuity-source.mjs";

const seed = readFileSync(
  "scripts/quipsly-retained-coaching-follow-up-seed.mjs",
  "utf8",
);

test("retained coaching fixture grants scoped staff authority only to the coach", () => {
  const roleGrants = [...seed.matchAll(/prisma\.userRole\.upsert\(\{[\s\S]*?\n    \}\);/g)]
    .map((match) => match[0]);
  assert.equal(roleGrants.length, 1);
  assert.match(roleGrants[0], /userId: userByRole\.coach\.id/);
  assert.match(roleGrants[0], /role: "COACH"/);
  assert.doesNotMatch(roleGrants[0], /userByRole\.(client|outsider)\.id/);
  assert.doesNotMatch(roleGrants[0], /role: "OWNER"/);
});

test("retained coaching fixture remains local-only and uses reserved identities", () => {
  assert.match(seed, /requireLocalDatabase/);
  assert.match(seed, /requireLoopbackOrigin/);
  assert.match(seed, /@example\.test/);
  assert.doesNotMatch(seed, /deleteMany|\$executeRawUnsafe\(\s*["'`]DELETE/i);
});

test("retained coaching fixture does not grant or enroll the privacy outsider", () => {
  assert.doesNotMatch(
    seed,
    /quipsly-privacy-outsider-retained-20260802@example\.test/,
  );
});

test("retained coaching fixture preserves a reviewed task receipt and exact transcript source", () => {
  assert.match(seed, /COACH_CONTINUITY_TASK_ID/);
  assert.match(seed, /prisma\.actionItemEvidenceReceipt\.upsert/);
  assert.match(seed, /kind: "TRANSCRIPT_CANDIDATE_MERGED"/);
  assert.match(seed, /schema: "quipsly-transcript-task-evidence-merge-v1"/);
  assert.match(seed, /prisma\.transcriptSegment\.upsert/);
  assert.match(seed, /prisma\.studioVideoSource\.upsert/);
  assert.match(seed, /prisma\.studioMediaAsset\.upsert/);
  assert.match(seed, /prisma\.studioAssetAttachment\.upsert/);
  assert.match(seed, /playbackUrl: `\/api\/ingest\/media\/\$\{TRANSCRIPT_SOURCE_ID\}`/);
  assert.match(seed, /promotion: \{/);
  assert.match(seed, /providerTextSha256: crypto\.createHash\("sha256"\)/);
  assert.match(seed, /assignedUserId: userByRole\.coach\.id/);
});

test("retained transcript disclosure uses current all-party consent and immutable release evidence", () => {
  assert.match(seed, /MOBILE_CAPTURE_CONSENT_POLICY_VERSION/);
  assert.match(seed, /MOBILE_CAPTURE_CONSENT_TEXT_SHA256/);
  assert.match(seed, /for \(const participant of participants\) \{[\s\S]*?prisma\.recordingConsent\.upsert/);
  assert.match(seed, /allAudibleParticipantsNotifiedAndAgreed: true/);
  assert.match(seed, /transcriptionChoiceExplicit: true/);
  assert.match(seed, /prisma\.mobileCaptureFinalizationReceipt\.upsert/);
  assert.match(seed, /immutableUploadBinding/);
  assert.match(seed, /processingDisposition: "RELEASED"/);
  assert.match(seed, /transcriptDisposition: "RELEASED"/);
  assert.match(seed, /sourceSha256: RETAINED_COACHING_CONTINUITY_SOURCE\.sha256/);
});

test("retained coaching playback fixture is a deterministic source longer than its cited segment", async () => {
  const identity = await materializeRetainedCoachingContinuitySource();
  const bytes = readFileSync(identity.path);
  assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(bytes.subarray(8, 12).toString("ascii"), "WAVE");
  assert.equal(bytes.byteLength, RETAINED_COACHING_CONTINUITY_SOURCE.byteSize);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), identity.sha256);
  assert(identity.durationSeconds > 71.8);
});
