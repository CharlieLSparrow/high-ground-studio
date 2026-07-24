#!/usr/bin/env node

import assert from "node:assert/strict";

const {
  buildMobileCaptureConsentVersions,
  evaluateMobileCaptureRoomReadiness,
  legacyMobileCaptureConsentVersion,
  mobileCaptureConsentVersion,
} = await import("../apps/quipsly/src/lib/server/mobile-capture-room-readiness.ts");
const {
  MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
  MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
} = await import("../apps/quipsly/src/lib/server/mobile-capture-consent-readiness.js");

const consentMetadata = {
  consentEvidenceVersion: 2,
  consentTextHash: MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
  recordingChoiceExplicit: true,
  transcriptionChoiceExplicit: true,
  allAudibleParticipantsNotifiedAndAgreed: true,
  presentationEvidence: {
    version: 1,
    surface: "quipsly-capture-consent-v2",
  },
};

const participants = [
  { id: "participant-a", userId: "actor-a", role: "HOST" },
  { id: "participant-b", userId: "actor-b", role: "CLIENT" },
  { id: "observer", userId: "observer-user", role: "OBSERVER" },
];
const consents = [
  {
    id: "consent-a",
    participantId: "participant-a",
    userId: "actor-a",
    status: "GRANTED",
    policyVersion: MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
    canRecordAudio: true,
    canRecordVideo: false,
    canTranscribe: true,
    consentedAt: new Date("2026-07-18T10:00:00.000Z"),
    updatedAt: new Date("2026-07-18T10:00:00.000Z"),
    metadataJson: consentMetadata,
  },
  {
    id: "consent-b",
    participantId: "participant-b",
    userId: "actor-b",
    status: "GRANTED",
    policyVersion: MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
    canRecordAudio: true,
    canRecordVideo: false,
    canTranscribe: false,
    consentedAt: new Date("2026-07-18T10:00:00.000Z"),
    updatedAt: new Date("2026-07-18T10:00:00.000Z"),
    metadataJson: consentMetadata,
  },
];
const consentVersions = buildMobileCaptureConsentVersions({ participants, consents });
const consentVersion = mobileCaptureConsentVersion(consentVersions);
const startReceipt = {
  receiptId: "11111111-1111-4111-8111-111111111111",
  sequence: 1n,
  roomId: "room-a",
  captureId: "22222222-2222-4222-8222-222222222222",
  actorUserId: "actor-a",
  action: "START_RECORDING",
  outcome: "APPLIED",
  stateApplied: true,
  consentVersion,
  metadataJson: {
    allPartyConsentVersion: consentVersion,
    allPartyConsentVersions: consentVersions,
  },
};

function prismaFor({ roomConsents = consents, receipts = [startReceipt] } = {}) {
  return {
    callRoom: {
      async findUnique() {
        return { id: "room-a", participants, recordingConsents: roomConsents };
      },
    },
    captureRoomStateReceipt: {
      async findMany() {
        return receipts;
      },
    },
  };
}

const ready = await evaluateMobileCaptureRoomReadiness({
  prisma: prismaFor(),
  roomId: "room-a",
  captureId: startReceipt.captureId,
  actorUserId: "actor-a",
  recordingConsentId: "consent-a",
  sourceType: "audio",
});
assert.equal(ready.eligibleForProcessing, true);
assert.equal(ready.reasonCode, "READY");
assert.equal(ready.startReceiptId, startReceipt.receiptId);
assert.equal(ready.consentVersion, consentVersion);
assert.equal(ready.allPartiesCurrentlyAllowTranscription, false,
  "media readiness must not imply all-party transcript consent");

const reorderedConsentVersions = consentVersions.map((version) =>
  Object.fromEntries(Object.entries(version).reverse()));
assert.equal(
  mobileCaptureConsentVersion(reorderedConsentVersions),
  consentVersion,
  "consent versions must survive JSONB object-key reordering",
);
const legacyStart = {
  ...startReceipt,
  consentVersion: legacyMobileCaptureConsentVersion(consentVersions),
  metadataJson: {
    allPartyConsentVersion: legacyMobileCaptureConsentVersion(consentVersions),
    allPartyConsentVersions: reorderedConsentVersions,
  },
};
const legacyReady = await evaluateMobileCaptureRoomReadiness({
  prisma: prismaFor({ receipts: [legacyStart] }),
  roomId: "room-a",
  captureId: legacyStart.captureId,
  actorUserId: "actor-a",
  recordingConsentId: "consent-a",
  sourceType: "audio",
});
assert.equal(legacyReady.eligibleForProcessing, true,
  "a pre-canonical receipt may pass only when its stored snapshot still matches current consent");
assert.equal(legacyReady.startConsentVersion, consentVersion,
  "legacy validation must upgrade the runtime binding to the canonical version");

const rejectedStart = await evaluateMobileCaptureRoomReadiness({
  prisma: prismaFor({ receipts: [{ ...startReceipt, stateApplied: false, outcome: "REJECTED" }] }),
  roomId: "room-a",
  captureId: startReceipt.captureId,
  actorUserId: "actor-a",
  recordingConsentId: "consent-a",
  sourceType: "audio",
});
assert.equal(rejectedStart.eligibleForProcessing, false);
assert.equal(rejectedStart.disposition, "preservation-only");
assert.equal(rejectedStart.reasonCode, "APPLIED_START_REQUIRED");

const crossActor = await evaluateMobileCaptureRoomReadiness({
  prisma: prismaFor({ receipts: [{ ...startReceipt, actorUserId: "actor-b" }] }),
  roomId: "room-a",
  captureId: startReceipt.captureId,
  actorUserId: "actor-a",
  recordingConsentId: "consent-a",
  sourceType: "audio",
});
assert.equal(crossActor.eligibleForProcessing, false);
assert.equal(crossActor.reasonCode, "START_OWNER_MISMATCH");

const staleConsents = consents.map((consent) => consent.id === "consent-b"
  ? { ...consent, canRecordAudio: false, status: "REVOKED", updatedAt: new Date("2026-07-18T11:00:00.000Z") }
  : consent);
const stale = await evaluateMobileCaptureRoomReadiness({
  prisma: prismaFor({ roomConsents: staleConsents }),
  roomId: "room-a",
  captureId: startReceipt.captureId,
  actorUserId: "actor-a",
  recordingConsentId: "consent-a",
  sourceType: "audio",
});
assert.equal(stale.eligibleForProcessing, false);
assert.equal(stale.allPartiesCurrentlyReady, false);
assert.equal(stale.reasonCode, "ALL_PARTY_CONSENT_REQUIRED");

const grantedWithoutAudio = consents.map((consent) => consent.id === "consent-b"
  ? { ...consent, status: "GRANTED", canRecordAudio: false }
  : consent);
const noAudio = await evaluateMobileCaptureRoomReadiness({
  prisma: prismaFor({ roomConsents: grantedWithoutAudio }),
  roomId: "room-a",
  captureId: startReceipt.captureId,
  actorUserId: "actor-a",
  recordingConsentId: "consent-a",
  sourceType: "audio",
});
assert.equal(noAudio.eligibleForProcessing, false);
assert.equal(noAudio.reasonCode, "ALL_PARTY_CONSENT_REQUIRED",
  "GRANTED without canRecordAudio must fail closed");

const inconsistentRevokedGrant = consents.map((consent) => consent.id === "consent-b"
  ? { ...consent, status: "GRANTED", revokedAt: new Date("2026-07-18T10:30:00.000Z") }
  : consent);
const inconsistent = await evaluateMobileCaptureRoomReadiness({
  prisma: prismaFor({ roomConsents: inconsistentRevokedGrant }),
  roomId: "room-a",
  captureId: startReceipt.captureId,
  actorUserId: "actor-a",
  recordingConsentId: "consent-a",
  sourceType: "audio",
});
assert.equal(inconsistent.eligibleForProcessing, false,
  "a GRANTED row carrying revokedAt must fail closed");

const legacyDuplicateConsents = [
  ...consents,
  {
    ...consents[1],
    id: "consent-b-revoked-latest",
    status: "REVOKED",
    canRecordAudio: false,
    canTranscribe: false,
    revokedAt: new Date("2026-07-18T11:30:00.000Z"),
    updatedAt: new Date("2026-07-18T11:30:00.000Z"),
  },
];
const latestRevocationWins = await evaluateMobileCaptureRoomReadiness({
  prisma: prismaFor({ roomConsents: legacyDuplicateConsents }),
  roomId: "room-a",
  captureId: startReceipt.captureId,
  actorUserId: "actor-a",
  recordingConsentId: "consent-a",
  sourceType: "audio",
});
assert.equal(latestRevocationWins.eligibleForProcessing, false);
assert.equal(
  latestRevocationWins.consentVersions.find((item) => item.participantId === "participant-b")?.consentId,
  "consent-b-revoked-latest",
  "a newer revocation must override an older GRANTED legacy duplicate",
);

const allTranscribe = consents.map((consent) => ({ ...consent, canTranscribe: true }));
const allTranscribeVersions = buildMobileCaptureConsentVersions({ participants, consents: allTranscribe });
const allTranscribeVersion = mobileCaptureConsentVersion(allTranscribeVersions);
const transcriptionReady = await evaluateMobileCaptureRoomReadiness({
  prisma: prismaFor({
    roomConsents: allTranscribe,
    receipts: [{
      ...startReceipt,
      consentVersion: allTranscribeVersion,
      metadataJson: {
        allPartyConsentVersion: allTranscribeVersion,
        allPartyConsentVersions: allTranscribeVersions,
      },
    }],
  }),
  roomId: "room-a",
  captureId: startReceipt.captureId,
  actorUserId: "actor-a",
  recordingConsentId: "consent-a",
  sourceType: "audio",
});
assert.equal(transcriptionReady.eligibleForProcessing, true);
assert.equal(transcriptionReady.allPartiesCurrentlyAllowTranscription, true);

console.log("PASS: capture room readiness binds actor-owned START and versioned all-party consent with a separate transcript gate.");
