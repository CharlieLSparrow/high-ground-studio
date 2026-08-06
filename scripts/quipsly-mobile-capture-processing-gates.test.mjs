#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  mobileCaptureMediaProcessingGate,
  mobileCaptureTranscriptProcessingGate,
} from "../apps/quipsly/src/lib/server/mobile-capture-processing-gates.ts";
import {
  buildMobileCaptureConsentVersions,
  MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
  MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
  mobileCaptureConsentVersion,
} from "../apps/quipsly/src/lib/server/mobile-capture-consent-readiness.js";

const asset = {
  id: "recording-a",
  roomId: "room-a",
  storageBucket: "capture-bucket",
  storageObjectPath: "media-vault/mobile-recordings/room-a/capture.m4a",
  byteSize: 4096n,
  checksum: "a".repeat(64),
  localManifestJson: {},
};
const releasedReceipt = (transcriptDisposition = "RELEASED", consentVersions = null) => ({
  uploadSessionId: "9d8c0c81-847f-4e16-96d0-26b494c890aa",
  recordingAssetId: asset.id,
  processingDisposition: "RELEASED",
  transcriptDisposition,
  metadataJson: {
    immutableUploadBinding: {
      uploadSessionId: "9d8c0c81-847f-4e16-96d0-26b494c890aa",
      roomId: asset.roomId,
      sha256: asset.checksum,
      bucketName: asset.storageBucket,
      objectName: asset.storageObjectPath,
      sizeBytes: 4096,
    },
    ...(consentVersions ? {
      originalDecision: {
        initialRoomReadiness: { consentVersions },
      },
    } : {}),
  },
});
const prismaWith = (...receipts) => ({
  mobileCaptureFinalizationReceipt: {
    async findMany() {
      return receipts.filter(Boolean);
    },
  },
  callRoom: {
    async findUnique() {
      return null;
    },
  },
});
const prismaWithRoom = (room, ...receipts) => ({
  ...prismaWith(...receipts),
  callRoom: {
    async findUnique() {
      return room;
    },
  },
});
const currentConsent = ({
  id,
  participantId,
  userId,
  canRecordVideo = false,
  canTranscribe = true,
  status = "GRANTED",
  revokedAt = null,
}) => ({
  id,
  participantId,
  userId,
  status,
  canRecordAudio: status === "GRANTED",
  canRecordVideo: status === "GRANTED" && canRecordVideo,
  canTranscribe: status === "GRANTED" && canTranscribe,
  policyVersion: MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
  consentedAt: "2026-07-18T01:00:00.000Z",
  revokedAt,
  updatedAt: revokedAt || "2026-07-18T01:00:00.000Z",
  metadataJson: {
    consentEvidenceVersion: 2,
    consentTextHash: MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
    recordingChoiceExplicit: true,
    transcriptionChoiceExplicit: true,
    allAudibleParticipantsNotifiedAndAgreed: true,
    presentationEvidence: {
      version: 1,
      surface: "quipsly-capture-consent-v2",
    },
  },
});
const releasedMobileRoom = {
  participants: [
    { id: "mobile-participant-a", userId: "mobile-user-a", role: "HOST" },
  ],
  recordingConsents: [
    currentConsent({
      id: "mobile-consent-a",
      participantId: "mobile-participant-a",
      userId: "mobile-user-a",
    }),
  ],
};
const releasedMobileVersions = buildMobileCaptureConsentVersions({
  participants: releasedMobileRoom.participants,
  consents: releasedMobileRoom.recordingConsents,
});

const mediaHeld = await mobileCaptureMediaProcessingGate({
  prisma: prismaWith({
    processingDisposition: "HELD",
    holdReasonCode: "ALL_PARTY_SOURCE_CONSENT_REQUIRED",
    holdReason: "Participant B has not granted source recording.",
  }),
  recordingAsset: { ...asset, status: "VERIFIED" },
});
assert.equal(mediaHeld.allowed, false,
  "normalized disposition must prevent promotion even if a stale asset status says VERIFIED");
assert.equal(mediaHeld.errorCode, "ALL_PARTY_SOURCE_CONSENT_REQUIRED");

const mediaReleased = await mobileCaptureMediaProcessingGate({
  prisma: prismaWithRoom(releasedMobileRoom, releasedReceipt()),
  recordingAsset: asset,
});
assert.equal(mediaReleased.allowed, true);

const conflictingMediaReceipts = await mobileCaptureMediaProcessingGate({
  prisma: prismaWith(
    releasedReceipt(),
    { processingDisposition: "HELD", holdReasonCode: "CONFLICTING_CAPTURE_BINDING" },
  ),
  recordingAsset: asset,
});
assert.equal(conflictingMediaReceipts.allowed, false,
  "multiple normalized bindings must fail closed if any receipt is held");

const mediaRecoveryHeld = await mobileCaptureMediaProcessingGate({
  prisma: prismaWith(),
  recordingAsset: {
    ...asset,
    localManifestJson: {
      processingDisposition: "preservation-only",
      processingHoldReasonCode: "LEGACY_START_BINDING_MISSING",
    },
  },
});
assert.equal(mediaRecoveryHeld.allowed, false,
  "protected asset metadata must block media promotion if the normalized receipt is temporarily unavailable");

const held = await mobileCaptureTranscriptProcessingGate({
  prisma: prismaWith({
    transcriptDisposition: "HELD",
    transcriptHoldReasonCode: "ALL_PARTY_TRANSCRIPTION_CONSENT_REQUIRED",
    transcriptHoldReason: "Participant B has not granted transcription.",
  }),
  recordingAsset: asset,
});
assert.equal(held.allowed, false);
assert.equal(held.errorCode, "ALL_PARTY_TRANSCRIPTION_CONSENT_REQUIRED");

const released = await mobileCaptureTranscriptProcessingGate({
  prisma: prismaWithRoom(releasedMobileRoom, releasedReceipt()),
  recordingAsset: asset,
});
assert.equal(released.allowed, true);

const roomWithLaterProducer = structuredClone(releasedMobileRoom);
roomWithLaterProducer.participants.push({
  id: "post-capture-producer",
  userId: "post-capture-producer-user",
  role: "PRODUCER",
});
const captureScopedMedia = await mobileCaptureMediaProcessingGate({
  prisma: prismaWithRoom(
    roomWithLaterProducer,
    releasedReceipt("RELEASED", releasedMobileVersions),
  ),
  recordingAsset: asset,
});
assert.equal(captureScopedMedia.allowed, true,
  "a collaborator added after capture must not need retroactive recording consent to process captured bytes");
const captureScopedTranscript = await mobileCaptureTranscriptProcessingGate({
  prisma: prismaWithRoom(
    roomWithLaterProducer,
    releasedReceipt("RELEASED", releasedMobileVersions),
  ),
  recordingAsset: asset,
});
assert.equal(captureScopedTranscript.allowed, true,
  "a collaborator added after capture must not need retroactive transcription consent");

const missingCapturedParticipantRoom = structuredClone(releasedMobileRoom);
missingCapturedParticipantRoom.participants = [];
const missingCapturedParticipant = await mobileCaptureMediaProcessingGate({
  prisma: prismaWithRoom(
    missingCapturedParticipantRoom,
    releasedReceipt("RELEASED", releasedMobileVersions),
  ),
  recordingAsset: asset,
});
assert.equal(missingCapturedParticipant.allowed, false,
  "processing must fail closed when an immutable captured-party identity disappears from the room ledger");
assert.equal(
  missingCapturedParticipant.errorCode,
  "CAPTURE_CONSENT_PARTICIPANT_SCOPE_UNAVAILABLE",
);

const revokedMobileRoom = structuredClone(releasedMobileRoom);
revokedMobileRoom.participants.push({
  id: "post-capture-producer",
  userId: "post-capture-producer-user",
  role: "PRODUCER",
});
revokedMobileRoom.recordingConsents[0] = currentConsent({
  id: "mobile-consent-a",
  participantId: "mobile-participant-a",
  userId: "mobile-user-a",
  status: "REVOKED",
  revokedAt: "2026-07-18T02:00:00.000Z",
});
const revokedMedia = await mobileCaptureMediaProcessingGate({
  prisma: prismaWithRoom(
    revokedMobileRoom,
    releasedReceipt("RELEASED", releasedMobileVersions),
  ),
  recordingAsset: asset,
});
assert.equal(revokedMedia.allowed, false,
  "a finalization release cannot outlive current recording consent");
assert.equal(
  revokedMedia.errorCode,
  "CURRENT_ALL_PARTY_SOURCE_CONSENT_REQUIRED",
);
const revokedTranscript = await mobileCaptureTranscriptProcessingGate({
  prisma: prismaWithRoom(
    revokedMobileRoom,
    releasedReceipt("RELEASED", releasedMobileVersions),
  ),
  recordingAsset: asset,
});
assert.equal(revokedTranscript.allowed, false,
  "a finalization release cannot outlive current transcription consent");

const staleReleaseCannotRebindHeldBytes = await mobileCaptureMediaProcessingGate({
  prisma: prismaWith(releasedReceipt()),
  recordingAsset: {
    ...asset,
    localManifestJson: {
      processingDisposition: "HELD",
      processingHoldReasonCode: "LEGACY_COMPATIBILITY_PRESERVATION_ONLY",
    },
  },
});
assert.equal(staleReleaseCannotRebindHeldBytes.allowed, false,
  "a current compatibility hold must win over an older RELEASED receipt by asset id");

const immutableBindingMismatch = await mobileCaptureMediaProcessingGate({
  prisma: prismaWith(releasedReceipt()),
  recordingAsset: { ...asset, checksum: "b".repeat(64) },
});
assert.equal(immutableBindingMismatch.allowed, false);
assert.equal(immutableBindingMismatch.errorCode, "CAPTURE_IMMUTABLE_UPLOAD_BINDING_MISMATCH");

const recoveryHeld = await mobileCaptureTranscriptProcessingGate({
  prisma: prismaWith(),
  recordingAsset: {
    ...asset,
    localManifestJson: {
      transcriptionDisposition: "HELD",
      transcriptionHoldReasonCode: "PRESERVATION_ONLY",
    },
  },
});
assert.equal(recoveryHeld.allowed, false,
  "protected asset metadata must fail closed if the normalized receipt is temporarily unavailable");

const missingReceiptLocalMedia = await mobileCaptureMediaProcessingGate({
  prisma: prismaWith(),
  recordingAsset: {
    ...asset,
    kind: "LOCAL_AUDIO",
    localManifestJson: { source: "legacy-mobile-ingest" },
  },
});
assert.equal(missingReceiptLocalMedia.allowed, false,
  "pre-hardening local capture media must not promote without a normalized RELEASED receipt");
assert.equal(missingReceiptLocalMedia.errorCode, "NORMALIZED_CAPTURE_RELEASE_REQUIRED");

const missingReceiptLocalTranscript = await mobileCaptureTranscriptProcessingGate({
  prisma: prismaWith(),
  recordingAsset: {
    ...asset,
    kind: "LOCAL_VIDEO",
    localManifestJson: { processingDisposition: "RELEASED", transcriptionDisposition: "RELEASED" },
  },
});
assert.equal(missingReceiptLocalTranscript.allowed, false,
  "untrusted metadata cannot replace the normalized transcript release receipt");

const providerRoom = {
  participants: [
    { id: "participant-a", userId: "user-a", role: "HOST" },
    { id: "participant-b", userId: "user-b", role: "GUEST" },
  ],
  recordingConsents: [
    currentConsent({
      id: "consent-a",
      participantId: "participant-a",
      userId: "user-a",
      canRecordVideo: true,
    }),
    currentConsent({
      id: "consent-b",
      participantId: "participant-b",
      userId: "user-b",
      canRecordVideo: true,
    }),
  ],
};
const providerVersions = buildMobileCaptureConsentVersions({
  participants: providerRoom.participants,
  consents: providerRoom.recordingConsents,
});
const providerAsset = {
  id: "provider-recording-a",
  roomId: "provider-room",
  kind: "SERVER_MIX",
  storageObjectPath: "media-vault/livekit/provider-room/composite.mp4",
  localManifestJson: {
    provider: "livekit",
    livekit: { egressId: "egress-a" },
    verification: { status: "verified" },
    providerProcessingDisposition: "RELEASED",
    providerTranscriptDisposition: "RELEASED",
    providerConsentBinding: {
      version: 1,
      consentVersion: mobileCaptureConsentVersion(providerVersions),
      consentVersions: providerVersions,
    },
  },
};
assert.equal((await mobileCaptureMediaProcessingGate({
  prisma: prismaWithRoom(providerRoom),
  recordingAsset: providerAsset,
})).allowed, true,
"trusted provider media requires its own unchanged all-party audio-and-video binding");
assert.equal((await mobileCaptureTranscriptProcessingGate({
  prisma: prismaWithRoom(providerRoom),
  recordingAsset: providerAsset,
})).allowed, true,
"trusted provider transcript requires its separate released transcription disposition");

const providerRoomWithLaterProducer = structuredClone(providerRoom);
providerRoomWithLaterProducer.participants.push({
  id: "provider-post-capture-producer",
  userId: "provider-post-capture-producer-user",
  role: "PRODUCER",
});
assert.equal((await mobileCaptureMediaProcessingGate({
  prisma: prismaWithRoom(providerRoomWithLaterProducer),
  recordingAsset: providerAsset,
})).allowed, true,
"a later provider-room collaborator must not alter the immutable egress consent scope");

const providerRoomMissingCapturedParty = structuredClone(providerRoom);
providerRoomMissingCapturedParty.participants = providerRoomMissingCapturedParty.participants
  .filter((participant) => participant.id !== "participant-b");
const providerMissingCapturedParty = await mobileCaptureMediaProcessingGate({
  prisma: prismaWithRoom(providerRoomMissingCapturedParty),
  recordingAsset: providerAsset,
});
assert.equal(providerMissingCapturedParty.allowed, false,
"provider processing must fail closed when a participant from the immutable egress snapshot disappears");
assert.equal(
  providerMissingCapturedParty.errorCode,
  "PROVIDER_CAPTURE_PARTICIPANT_SCOPE_UNAVAILABLE",
);

const noTranscriptRoom = structuredClone(providerRoom);
noTranscriptRoom.recordingConsents[1].canTranscribe = false;
noTranscriptRoom.recordingConsents[1].updatedAt = "2026-07-18T02:00:00.000Z";
assert.equal((await mobileCaptureTranscriptProcessingGate({
  prisma: prismaWithRoom(noTranscriptRoom),
  recordingAsset: providerAsset,
})).allowed, false,
"provider transcript execution fails closed when current all-party transcription consent is absent");

const promotionSource = readFileSync(
  new URL("../apps/quipsly/src/lib/server/recording-media-promotion.ts", import.meta.url),
  "utf8",
);
assert.match(promotionSource, /mobileCaptureMediaProcessingGate/,
  "the older RecordingAsset promotion path must call the normalized media gate");
assert.ok(
  promotionSource.indexOf("await mobileCaptureMediaProcessingGate")
    < promotionSource.indexOf("const existingPromotion = manifestPromotion"),
  "the media gate must run before an existing promotion can attach to another episode",
);

console.log("PASS: media promotion and transcript processing obey normalized all-party release gates.");
