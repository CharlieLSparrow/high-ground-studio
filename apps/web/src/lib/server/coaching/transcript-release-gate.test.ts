// @ts-nocheck

import { createHash } from "node:crypto";

import { transcriptReleaseGate } from "@high-ground/quipsly-domain/coaching-packet";
import {
  transcriptReleaseGateInputFromEvidence,
  webProviderCompositeConsentReadiness,
} from "./transcript-release-gate";

function roomEvidence(canTranscribe = true) {
  return {
    id: "room-1",
    participants: [{ id: "participant-1", userId: "user-1", role: "HOST" }],
    recordingConsents: [{
      id: "consent-1",
      participantId: "participant-1",
      userId: "user-1",
      status: "GRANTED",
      policyVersion: "2026-07-18.capture-consent-v2",
      canRecordAudio: true,
      canRecordVideo: true,
      canTranscribe,
      consentedAt: "2026-07-18T12:00:00.000Z",
      revokedAt: null,
      updatedAt: "2026-07-18T12:00:00.000Z",
      metadataJson: {
        consentTextHash: "379380cecf3bc1b3a1614334e247e6795f09f3eb1c85bf3918daf612b9929ff9",
        consentEvidenceVersion: 2,
        recordingChoiceExplicit: true,
        transcriptionChoiceExplicit: true,
        allAudibleParticipantsNotifiedAndAgreed: true,
        presentationEvidence: {
          surface: "quipsly-capture-consent-v2",
          version: 1,
        },
      },
    }],
  };
}

describe("web transcript release evidence adapter", () => {
  it("accepts only the unchanged provider consent snapshot with explicit transcript release", () => {
    const room = roomEvidence();
    const readiness = webProviderCompositeConsentReadiness(room);
    expect(readiness.consentVersion).toBe(
      createHash("sha256").update(JSON.stringify(readiness.consentVersions)).digest("hex"),
    );
    const asset = {
      id: "asset-1",
      roomId: "room-1",
      kind: "SERVER_MIX",
      storageObjectPath: "recordings/asset-1.mp4",
      localManifestJson: {
        provider: "livekit",
        providerProcessingDisposition: "RELEASED",
        providerTranscriptDisposition: "RELEASED",
        providerConsentBinding: {
          version: 1,
          consentVersion: readiness.consentVersion,
          consentVersions: readiness.consentVersions,
        },
        livekit: { egressId: "egress-1" },
        verification: { status: "verified" },
      },
    };

    expect(transcriptReleaseGate(transcriptReleaseGateInputFromEvidence({
      recordingAsset: asset,
      receipts: [],
      room,
    }))).toEqual({ allowed: true, evidenceKind: "TRUSTED_PROVIDER_CAPTURE" });

    const revoked = transcriptReleaseGate(transcriptReleaseGateInputFromEvidence({
      recordingAsset: asset,
      receipts: [],
      room: roomEvidence(false),
    }));
    expect(revoked.allowed).toBe(false);
    expect(revoked.errorCode).toBe("PROVIDER_ALL_PARTY_SOURCE_BINDING_REQUIRED");
  });

  it("prefers normalized held finalization evidence over provider metadata", () => {
    const input = transcriptReleaseGateInputFromEvidence({
      recordingAsset: { id: "asset-1", roomId: "room-1", localManifestJson: {} },
      receipts: [{
        recordingAssetId: "asset-1",
        processingDisposition: "RELEASED",
        transcriptDisposition: "HELD",
        transcriptHoldReasonCode: "REVIEW_REQUIRED",
        transcriptHoldReason: "Review transcription first.",
      }],
      room: roomEvidence(),
    });
    const decision = transcriptReleaseGate(input);
    expect(decision).toEqual(expect.objectContaining({
      allowed: false,
      errorCode: "REVIEW_REQUIRED",
      error: "Review transcription first.",
    }));
  });
});
