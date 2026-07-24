import assert from "node:assert/strict";
import test from "node:test";

import {
  LEGACY_WEB_TRANSCRIPT_PACKET_SOURCE,
  TRANSCRIPT_PACKET_SOURCE,
  isTranscriptActionCandidate,
  isUnreviewedTranscriptActionItemSource,
  transcriptReleaseGate,
} from "../packages/quipsly-domain/src/coaching-packet.ts";

test("both historical transcript packet sources stay quarantined", () => {
  for (const source of [TRANSCRIPT_PACKET_SOURCE, LEGACY_WEB_TRANSCRIPT_PACKET_SOURCE]) {
    assert.equal(isUnreviewedTranscriptActionItemSource({ source, candidate: true }), true);
    assert.equal(isUnreviewedTranscriptActionItemSource({ source, candidate: false }), false);
  }
});

test("candidate provenance requires the correlated transcript, asset, room, build, and segment", () => {
  const candidate = {
    id: "quipsly-transcript-action-candidate-v1:transcript-1:segment-1",
    kind: "quipsly-transcript-action-candidate-v1",
    reviewStatus: "READY_FOR_HUMAN_REVIEW",
    title: "Send the outline",
    detail: "00:12 Charlie: I will send the outline.",
    transcriptJobId: "transcript-1",
    recordingAssetId: "asset-1",
    roomId: "room-1",
    packetBuildId: "build-1",
    segmentId: "segment-1",
    speakerLabel: "Charlie",
    startSeconds: 12,
    endSeconds: 18,
    humanApprovalRequired: true,
    committedActionItemId: null,
  };
  assert.equal(isTranscriptActionCandidate(candidate), true);
  assert.equal(isTranscriptActionCandidate({ ...candidate, packetBuildId: "" }), false);
});

test("held or unreleased finalization evidence fails before transcription", () => {
  const decision = transcriptReleaseGate({
    manifestProcessingDisposition: null,
    manifestTranscriptDisposition: null,
    normalizedFinalizationReceipts: [{
      processingDisposition: "RELEASED",
      transcriptDisposition: "HELD",
      immutableBindingMatches: true,
      transcriptHoldReasonCode: "COACHING_TRANSCRIPT_REVIEW_REQUIRED",
      transcriptHoldReason: "A coach must release transcription.",
    }],
    trustedProvider: null,
  });
  assert.deepEqual(decision, {
    allowed: false,
    evidenceKind: "HELD",
    errorCode: "COACHING_TRANSCRIPT_REVIEW_REQUIRED",
    error: "A coach must release transcription.",
  });
});

test("released receipts still fail closed when immutable upload evidence drifts", () => {
  const decision = transcriptReleaseGate({
    normalizedFinalizationReceipts: [{
      processingDisposition: "RELEASED",
      transcriptDisposition: "RELEASED",
      immutableBindingMatches: false,
    }],
    trustedProvider: null,
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.errorCode, "CAPTURE_IMMUTABLE_UPLOAD_BINDING_MISMATCH");
});

test("trusted provider capture needs current source and transcript consent plus dispositions", () => {
  const base = {
    immutableProviderEvidenceVerified: true,
    roomEvidenceAvailable: true,
    currentAllPartySourceConsent: true,
    currentAllPartyTranscriptionConsent: true,
    immutableConsentBindingMatches: true,
    processingDisposition: "RELEASED",
    transcriptDisposition: "RELEASED",
  };
  assert.deepEqual(transcriptReleaseGate({
    normalizedFinalizationReceipts: [],
    trustedProvider: base,
  }), { allowed: true, evidenceKind: "TRUSTED_PROVIDER_CAPTURE" });
  const revoked = transcriptReleaseGate({
    normalizedFinalizationReceipts: [],
    trustedProvider: { ...base, currentAllPartyTranscriptionConsent: false },
  });
  assert.equal(revoked.allowed, false);
  assert.equal(revoked.errorCode, "PROVIDER_ALL_PARTY_TRANSCRIPTION_RELEASE_REQUIRED");
});
