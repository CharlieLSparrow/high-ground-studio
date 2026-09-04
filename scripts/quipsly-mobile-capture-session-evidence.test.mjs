#!/usr/bin/env node
import assert from "node:assert/strict";

const { mapMobileCaptureSessionsForUser, providerReadinessForMobileCaptureSession } = await import(
  "../apps/quipsly/src/lib/server/mobile-capture-sessions.ts"
);
const {
  MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
  MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
} = await import("../apps/quipsly/src/lib/server/mobile-capture-consent-readiness.js");

const userId = "user_capture_reviewer";
const now = new Date("2026-07-05T14:00:00.000Z");

const room = {
  id: "room_capture_proof",
  title: "Reviewer coaching capture proof",
  purpose: "COACHING",
  status: "OPEN",
  provider: "livekit",
  providerRoomId: "lk-reviewer-room",
  projectSlug: "high-ground-odyssey-coaching",
  nestSlug: "high-ground-odyssey-coaching",
  scheduledStart: new Date("2026-07-05T14:30:00.000Z"),
  scheduledEnd: new Date("2026-07-05T15:00:00.000Z"),
  booking: {
    status: "CONFIRMED",
    paymentPolicy: "PAID_ONE_TO_ONE",
    offering: {
      title: "One-to-one coaching proof session",
      slug: "one-to-one-coaching-proof",
    },
    clientUser: {
      name: "Quipsly Capture Reviewer",
      primaryEmail: "reviewer-capture@dev.test",
    },
    coachUser: {
      name: "Charlie Sparrow",
      primaryEmail: "charlie@highgroundodyssey.com",
    },
    paymentRecord: {
      status: "PAID",
    },
    calendarLinks: [
      {
        status: "PLANNED",
      },
    ],
  },
  participants: [
    {
      id: "participant_reviewer",
      userId,
      role: "CLIENT",
    },
  ],
  recordingConsents: [
    {
      id: "consent_reviewer",
      participantId: "participant_reviewer",
      userId,
      status: "GRANTED",
      canRecordAudio: true,
      canRecordVideo: false,
      canTranscribe: true,
      policyVersion: MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
      consentedAt: new Date("2026-07-05T13:55:00.000Z"),
      revokedAt: null,
      updatedAt: new Date("2026-07-05T13:55:00.000Z"),
      metadataJson: {
        consentEvidenceVersion: 2,
        consentTextHash: MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
        recordingChoiceExplicit: true,
        transcriptionChoiceExplicit: true,
        allAudibleParticipantsNotifiedAndAgreed: true,
        presentationEvidence: { version: 1, surface: "quipsly-capture-consent-v2" },
      },
    },
  ],
  recordingAssets: [
    {
      id: "asset_capture_audio",
      roomId: "room_capture_proof",
      fileName: "reviewer-coaching-proof.m4a",
      status: "VERIFIED",
      kind: "LOCAL_AUDIO",
      storageBucket: "capture-bucket",
      storageObjectPath: "media-vault/mobile-recordings/room_capture_proof/reviewer-coaching-proof.m4a",
      byteSize: 4096n,
      checksum: "a".repeat(64),
      localManifestJson: { processingDisposition: "RELEASED", transcriptionDisposition: "RELEASED" },
    },
  ],
  transcriptJobs: [
    {
      id: "transcript_capture_audio",
      assetId: "asset_capture_audio",
      status: "COMPLETED",
      provider: "deepgram",
      asset: {
        id: "asset_capture_audio",
        fileName: "reviewer-coaching-proof.m4a",
        status: "VERIFIED",
        kind: "LOCAL_AUDIO",
      },
      _count: {
        segments: 42,
      },
      createdAt: now,
    },
  ],
  notes: [
    {
      id: "note_summary",
      kind: "SUMMARY",
      title: "Coaching packet summary",
      body: "The reviewer practiced a clear coaching goal, named two action items, and confirmed follow-up ownership.",
      sourceJson: { source: "transcript-packet-builder", transcriptJobId: "transcript_capture_audio" },
      createdAt: new Date("2026-07-05T15:05:00.000Z"),
      _count: { actionItems: 4 },
    },
    {
      id: "note_highlight",
      kind: "HIGHLIGHT",
      title: "Useful coaching moment",
      body: "The client clarified the next visible step.",
      sourceJson: { source: "transcript-packet-builder", transcriptJobId: "transcript_capture_audio" },
      createdAt: new Date("2026-07-05T15:06:00.000Z"),
      _count: { actionItems: 0 },
    },
  ],
  actionItems: [
    {
      id: "action_item_1",
      status: "OPEN",
      sourceJson: { source: "transcript-packet-builder", transcriptJobId: "transcript_capture_audio" },
    },
    {
      id: "action_item_2",
      status: "OPEN",
      sourceJson: { source: "transcript-packet-builder", transcriptJobId: "transcript_capture_audio", candidate: false },
    },
    {
      id: "legacy_candidate_1",
      status: "OPEN",
      sourceJson: { source: "transcript-packet-builder", transcriptJobId: "transcript_capture_audio", candidate: true },
    },
    {
      id: "legacy_web_candidate_1",
      status: "OPEN",
      sourceJson: { source: "web-transcript-packet-builder", transcriptJobId: "transcript_capture_audio", candidate: true },
    },
  ],
};

const finalizationReceipts = [{
  uploadSessionId: "9d8c0c81-847f-4e16-96d0-26b494c890aa",
  recordingAssetId: "asset_capture_audio",
  processingDisposition: "RELEASED",
  transcriptDisposition: "RELEASED",
  metadataJson: {
    immutableUploadBinding: {
      uploadSessionId: "9d8c0c81-847f-4e16-96d0-26b494c890aa",
      roomId: "room_capture_proof",
      sha256: "a".repeat(64),
      bucketName: "capture-bucket",
      objectName: "media-vault/mobile-recordings/room_capture_proof/reviewer-coaching-proof.m4a",
      sizeBytes: 4096,
    },
  },
}];

function mapOne(roomInput, env = {}) {
  return mapMobileCaptureSessionsForUser({
    rooms: [roomInput],
    userId,
    env,
    finalizationReceipts,
  })[0];
}

const noNativeProvider = mapOne(room);

assert.equal(noNativeProvider.callRoomId, room.id);
assert.equal(noNativeProvider.providerReadiness, "livekit-needs-config");
assert.equal(noNativeProvider.providerCanJoin, false);
assert.equal(noNativeProvider.recordingConsentGranted, true);
assert.equal(noNativeProvider.captureReadiness.status, "ready-local-fallback");
assert.equal(noNativeProvider.captureReadiness.safeToRecordLocally, true);
assert.equal(noNativeProvider.captureReadiness.providerCanJoin, false);
assert.equal(noNativeProvider.captureReadiness.label, "Ready locally");
assert.match(noNativeProvider.captureReadiness.detail, /local capture can proceed/i);
assert.equal(noNativeProvider.recordingCount, 1);
assert.equal(noNativeProvider.latestRecordingAssetStatus, "VERIFIED");
assert.equal(noNativeProvider.latestTranscriptStatus, "COMPLETED");
assert.equal(noNativeProvider.latestTranscriptSegmentCount, 42);
assert.equal(noNativeProvider.coachingPacketStatus, "RESULTS_READY");
assert.equal(noNativeProvider.coachingPacketHighlightCount, 1);
assert.equal(noNativeProvider.coachingPacketActionItemCount, 2);
assert.equal(noNativeProvider.coachingPacketFirstOpenActionItemId, "action_item_1");
assert.match(noNativeProvider.coachingPacketPreview, /reviewer practiced/i);
assert.equal(noNativeProvider.afterCaptureNextAction, "Session results are ready. Open the editable recap, notes, tasks, and goals whenever they are useful.");
assert.match(noNativeProvider.nextAction, /Session results are ready/i);

const endedWithResults = mapOne({
  ...room,
  status: "ENDED",
});
assert.equal(endedWithResults.captureReadiness.status, "review-ready");
assert.equal(endedWithResults.captureReadiness.safeToRecordLocally, false);
assert.equal(endedWithResults.captureReadiness.providerCanJoin, false);
assert.equal(endedWithResults.captureReadiness.label, "Results ready");
assert.match(
  endedWithResults.captureReadiness.detail,
  /editable notes, tasks, and goals/i,
);
assert.match(endedWithResults.nextAction, /Session results are ready/i);

const liveKitServerReady = providerReadinessForMobileCaptureSession(room, {
  LIVEKIT_URL: "wss://example.livekit.cloud",
  LIVEKIT_API_KEY: "dev-key",
  LIVEKIT_API_SECRET: "dev-secret",
});

assert.equal(liveKitServerReady.providerReadiness, "livekit-ready");
assert.equal(liveKitServerReady.providerCanJoin, true);
assert.match(liveKitServerReady.providerNextAction, /Joining alone does not start recording/i);

const readyForFirstCapture = mapOne({
  ...room,
  recordingAssets: [],
  transcriptJobs: [],
  notes: [],
  actionItems: [],
}, {
  LIVEKIT_URL: "wss://example.livekit.cloud",
  LIVEKIT_API_KEY: "dev-key",
  LIVEKIT_API_SECRET: "dev-secret",
});

assert.equal(readyForFirstCapture.recordingConsentStatus, "GRANTED");
assert.equal(readyForFirstCapture.canRecordNow, true);
assert.equal(readyForFirstCapture.captureReadiness.status, "ready-provider");
assert.match(readyForFirstCapture.nextAction, /Joining alone does not start recording/i);
assert.doesNotMatch(readyForFirstCapture.nextAction, /still requires consent/i,
  "a consented ready Session must not tell the native app that consent is still missing");

const transcriptCompleteNoPacket = mapOne({
      ...room,
      notes: [],
      actionItems: [],
});

assert.equal(transcriptCompleteNoPacket.coachingPacketStatus, "PACKET_READY_TO_BUILD");
assert.equal(transcriptCompleteNoPacket.afterCaptureNextAction, "Transcript ready. Quipsly is preparing editable Session results in the background.");

const uploadedNoTranscript = mapOne({
      ...room,
      transcriptJobs: [],
      notes: [],
      actionItems: [],
});

assert.equal(uploadedNoTranscript.coachingPacketStatus, "NOT_READY");
assert.equal(
  uploadedNoTranscript.afterCaptureNextAction,
  "Your recording is safe. Quipsly is preparing transcription and editable Session results.",
);

const consentNeeded = mapOne({
      ...room,
      notes: [],
      actionItems: [],
      recordingConsents: [
        {
          id: "consent_reviewer_requested",
          participantId: "participant_reviewer",
          status: "REQUESTED",
        },
      ],
});

assert.equal(consentNeeded.captureReadiness.status, "needs-consent");
assert.equal(consentNeeded.captureReadiness.safeToRecordLocally, false);
assert.deepEqual(consentNeeded.captureReadiness.blockers, ["recording-consent-needed"]);
assert.match(
  consentNeeded.captureReadiness.nextAction,
  /recorder attestation.*consent from every signed-in participant/i,
);

const newerRevocationWins = mapOne({
      ...room,
      notes: [],
      actionItems: [],
      recordingAssets: [],
      transcriptJobs: [],
      recordingConsents: [
        room.recordingConsents[0],
        {
          ...room.recordingConsents[0],
          id: "consent_reviewer_revoked_latest",
          status: "REVOKED",
          canRecordAudio: false,
          canTranscribe: false,
          revokedAt: new Date("2026-07-05T14:05:00.000Z"),
          updatedAt: new Date("2026-07-05T14:05:00.000Z"),
        },
      ],
});

assert.equal(newerRevocationWins.recordingConsentId, "consent_reviewer_revoked_latest");
assert.equal(newerRevocationWins.recordingConsentGranted, false);
assert.equal(newerRevocationWins.allRegisteredParticipantConsentGranted, false);
assert.equal(newerRevocationWins.captureReadiness.status, "needs-consent",
  "an older GRANTED duplicate must not override the newer revocation");

const paymentHold = mapOne({
      ...room,
      notes: [],
      actionItems: [],
      booking: {
        ...room.booking,
        status: "HOLDING_PAYMENT",
        paymentRecord: {
          status: "PENDING",
        },
      },
});

assert.equal(paymentHold.captureReadiness.status, "payment-hold");
assert.equal(paymentHold.captureReadiness.safeToRecordLocally, false);
assert.deepEqual(paymentHold.captureReadiness.blockers, ["payment-evidence-needed"]);
assert.match(paymentHold.captureReadiness.nextAction, /Stripe as evidence/i);

const endedReadyForPacket = mapOne({
      ...room,
      status: "ENDED",
      notes: [],
      actionItems: [],
});

assert.equal(endedReadyForPacket.captureReadiness.status, "post-capture");
assert.equal(endedReadyForPacket.captureReadiness.safeToRecordLocally, false);
assert.match(endedReadyForPacket.captureReadiness.nextAction, /preparing editable Session results/i);

const heldReceipt = {
  ...finalizationReceipts[0],
  processingDisposition: "HELD",
  transcriptDisposition: "HELD",
  holdReasonCode: "REVIEWED_RELEASE_REQUIRED",
  transcriptHoldReasonCode: "REVIEWED_RELEASE_REQUIRED",
};
const heldSession = mapMobileCaptureSessionsForUser({
  rooms: [room],
  userId,
  env: {},
  finalizationReceipts: [heldReceipt],
})[0];
assert.equal(heldSession.journeySummary.stage, "transcript-held");
assert.equal(heldSession.journeySummary.evidence.transcriptCompleted, false);
assert.ok(
  Object.values(heldSession.journeySummary.evidence).every((value) => typeof value === "boolean"),
  "journey evidence remains a boolean receipt map so native clients can decode every Session",
);
assert.match(
  heldSession.journeySummary.blockers.join(" "),
  /transcript-processing-held:REVIEWED_RELEASE_REQUIRED/,
  "the exact hold reason remains inspectable outside the boolean evidence map",
);
assert.equal(heldSession.coachingPacketStatus, "TRANSCRIPT_HELD");
assert.equal(heldSession.actionPacket.capabilities.canRunTranscript, false);
assert.equal(heldSession.actionPacket.capabilities.canBuildPacket, false);
assert.equal(heldSession.actionPacket.capabilities.canReviewPacket, false);
assert.equal(heldSession.coachingPacketSummaryNoteId, null,
  "historical packet projections must be quarantined while their source transcript is held");
assert.match(heldSession.afterCaptureNextAction, /continue when this Session's transcription permission allows it/i);

console.log("PASS: mobile capture sessions expose recording, transcript, packet, provider, consent, and next-action evidence.");
