/** @jest-environment node */

import {
  MOBILE_CAPTURE_CONSENT_EVIDENCE_VERSION,
  MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
  MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
} from "./mobile-capture-consent-readiness.js";
import { buildCaptureRoomSessionEntryProjection } from "./mobile-capture-room-join-diagnostics.js";

const participants = [
  { id: "coach", userId: "coach-user", role: "HOST" },
  { id: "client", userId: "client-user", role: "CLIENT" },
];

function consent(
  participantId: string,
  userId: string,
  options: { audio?: boolean; video?: boolean; transcribe?: boolean } = {},
) {
  const now = new Date("2026-08-30T16:00:00.000Z");
  return {
    id: `consent-${participantId}`,
    participantId,
    userId,
    status: "GRANTED",
    policyVersion: MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
    canRecordAudio: options.audio ?? true,
    canRecordVideo: options.video ?? false,
    canTranscribe: options.transcribe ?? true,
    consentedAt: now,
    revokedAt: null,
    updatedAt: now,
    metadataJson: {
      consentTextHash: MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
      consentEvidenceVersion: MOBILE_CAPTURE_CONSENT_EVIDENCE_VERSION,
      recordingChoiceExplicit: true,
      transcriptionChoiceExplicit: true,
      allAudibleParticipantsNotifiedAndAgreed: true,
      presentationEvidence: {
        surface: "quipsly-capture-consent-v2",
        version: 1,
      },
    },
  };
}

function projection(recordingConsents: unknown[], paymentBlocked = false) {
  return buildCaptureRoomSessionEntryProjection({
    room: {
      id: "room-1",
      status: "OPEN",
      purpose: "COACHING",
      participants,
      recordingConsents,
    },
    actorUserId: "coach-user",
    currentParticipant: participants[0],
    providerCanJoin: true,
    providerReadiness: "livekit-ready",
    paymentBlocked,
  });
}

describe("canonical Capture room entry projection", () => {
  it("unlocks audio and transcription immediately after both participants consent", () => {
    const result = projection([
      consent("coach", "coach-user"),
      consent("client", "client-user"),
    ]);

    expect(result.entryReadiness).toMatchObject({
      stage: "join-call",
      permissions: {
        canJoinCall: true,
        canStartAudioRecording: true,
        canStartVideoRecording: false,
        canTranscribe: true,
      },
      participantProgress: { attached: 2, required: 2, complete: true },
      consentProgress: { audioGranted: 2, required: 2, allAudioReady: true },
    });
  });

  it("keeps recording unavailable until the other participant consents", () => {
    const result = projection([consent("coach", "coach-user")]);

    expect(result.entryReadiness.permissions.canJoinCall).toBe(true);
    expect(result.entryReadiness.permissions.canStartAudioRecording).toBe(false);
    expect(result.entryReadiness.blockers).toContain(
      "participant-audio-consent-needed",
    );
  });

  it("keeps video separate from audio consent", () => {
    const result = projection([
      consent("coach", "coach-user", { video: true }),
      consent("client", "client-user", { video: false }),
    ]);

    expect(result.entryReadiness.permissions.canStartAudioRecording).toBe(true);
    expect(result.entryReadiness.permissions.canStartVideoRecording).toBe(false);
  });

  it("blocks joining and recording when the booking is on a payment hold", () => {
    const result = projection(
      [
        consent("coach", "coach-user"),
        consent("client", "client-user"),
      ],
      true,
    );

    expect(result.entryReadiness).toMatchObject({
      stage: "payment-hold",
      permissions: {
        canJoinCall: false,
        canStartAudioRecording: false,
      },
    });
  });
});
