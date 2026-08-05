import {
  MOBILE_CAPTURE_CONSENT_EVIDENCE_VERSION,
  MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
  MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
} from "@/lib/server/mobile-capture-consent-readiness.js";

import { buildSessionPreparationState } from "./session-preparation-model";

function currentEvidence() {
  return {
    consentTextHash: MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
    consentEvidenceVersion: MOBILE_CAPTURE_CONSENT_EVIDENCE_VERSION,
    recordingChoiceExplicit: true,
    transcriptionChoiceExplicit: true,
    allAudibleParticipantsNotifiedAndAgreed: true,
    presentationEvidence: {
      surface: "quipsly-capture-consent-v2",
      version: 1,
    },
  };
}

describe("Session preparation projection", () => {
  it("uses current policy evidence for per-person and all-party readiness", () => {
    const state = buildSessionPreparationState({
      captureGroupId: "55555555-5555-4555-8555-555555555551",
      purpose: "COACHING",
      status: "PLANNED",
      provider: "livekit",
      providerRoomId: "provider-room-1",
      scheduledStart: "2026-07-26T15:00:00.000Z",
      project: { id: "project-1", name: "Private coaching", slug: "private-coaching" },
      participants: [{
        id: "participant-1",
        userId: "user-1",
        displayName: "Homer",
        role: "CLIENT",
      }],
      recordingConsents: [{
        id: "consent-1",
        participantId: "participant-1",
        userId: "user-1",
        status: "GRANTED",
        policyVersion: MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
        canRecordAudio: true,
        canRecordVideo: false,
        canTranscribe: true,
        consentedAt: "2026-07-25T18:00:00.000Z",
        updatedAt: "2026-07-25T18:00:00.000Z",
        metadataJson: currentEvidence(),
      }],
    }, "user-1", {
      LIVEKIT_URL: "wss://example.livekit.cloud",
      LIVEKIT_API_KEY: "test-key",
      LIVEKIT_API_SECRET: "test-secret",
    });

    expect(state.consentSnapshot).toEqual({ total: 1, granted: 1, transcriptionPermitted: 1 });
    expect(state.preparation).toMatchObject({
      captureGroupId: "55555555-5555-4555-8555-555555555551",
      purpose: "COACHING",
      status: "PLANNED",
      provider: "livekit",
      providerCanJoin: true,
      providerReadiness: "livekit-ready",
      scheduledStart: "2026-07-26T15:00:00.000Z",
      allAudioReady: true,
      allTranscriptionReady: true,
      participants: [{
        id: "participant-1",
        label: "Homer",
        isCurrentActor: true,
        consent: {
          id: "consent-1",
          status: "GRANTED",
          recordingReady: true,
          transcriptionReady: true,
        },
      }],
    });
  });

  it("does not call a selected LiveKit room ready when server credentials are absent", () => {
    const state = buildSessionPreparationState({
      captureGroupId: "55555555-5555-4555-8555-555555555552",
      provider: "livekit",
      providerRoomId: "provider-room-1",
    }, null, {});

    expect(state.preparation).toMatchObject({
      providerCanJoin: false,
      providerReadiness: "livekit-needs-config",
      providerNextAction: expect.stringMatching(/missing server credentials/i),
    });
  });

  it("projects only the latest consent version and ignores anonymous observers", () => {
    const state = buildSessionPreparationState({
      captureGroupId: "55555555-5555-4555-8555-555555555553",
      participants: [
        { id: "participant-1", userId: "user-1", displayName: "Charlie", role: "HOST" },
        { id: "observer-1", userId: "observer-user", displayName: "Observer", role: "OBSERVER" },
        { id: "anonymous-1", userId: null, displayName: "Provider ghost", role: "GUEST" },
      ],
      recordingConsents: [
        {
          id: "consent-old",
          participantId: "participant-1",
          userId: "user-1",
          status: "GRANTED",
          policyVersion: MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
          canRecordAudio: true,
          canTranscribe: true,
          consentedAt: "2026-07-24T18:00:00.000Z",
          updatedAt: "2026-07-24T18:00:00.000Z",
          metadataJson: currentEvidence(),
        },
        {
          id: "consent-new",
          participantId: "participant-1",
          userId: "user-1",
          status: "REVOKED",
          policyVersion: MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
          canRecordAudio: false,
          canTranscribe: false,
          consentedAt: "2026-07-24T18:00:00.000Z",
          revokedAt: "2026-07-25T18:00:00.000Z",
          updatedAt: "2026-07-25T18:00:00.000Z",
          metadataJson: currentEvidence(),
        },
      ],
    });

    expect(state.consentSnapshot).toEqual({ total: 1, granted: 0, transcriptionPermitted: 0 });
    expect(state.preparation.participants).toHaveLength(1);
    expect(state.preparation.participants[0]).toMatchObject({
      label: "Charlie",
      consent: {
        status: "REVOKED",
        recordingReady: false,
        transcriptionReady: false,
      },
    });
    expect(state.preparation.allAudioReady).toBe(false);
    expect(state.preparation.allTranscriptionReady).toBe(false);
  });
});
