import assert from "node:assert/strict";
import test from "node:test";

import {
  currentConsentAllowsLocalTranscription,
  normalizeWhisperTranscript,
  requireLocalDatabase,
  safeLocalSourcePath,
  validateLocalSourceReceipt,
} from "./quipsly-local-transcript-worker.mjs";
import {
  MOBILE_CAPTURE_CONSENT_EVIDENCE_VERSION,
  MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
  MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
} from "../../apps/quipsly/src/lib/server/mobile-capture-consent-readiness.js";

test("local transcript worker refuses remote databases and source traversal", () => {
  assert.equal(
    requireLocalDatabase("postgresql://postgres:postgres@127.0.0.1:5432/quipsly"),
    "postgresql://postgres:postgres@127.0.0.1:5432/quipsly",
  );
  assert.throws(
    () => requireLocalDatabase("postgresql://quipsly@production.example.com/quipsly"),
    /non-loopback/,
  );
  assert.equal(
    safeLocalSourcePath(
      "/private/tmp/quipsly-vault",
      "media-vault/recordings/mobile/room/source.wav",
    ),
    "/private/tmp/quipsly-vault/objects/media-vault/recordings/mobile/room/source.wav",
  );
  assert.throws(
    () => safeLocalSourcePath("/private/tmp/quipsly-vault", "../source.wav"),
    /outside the recording namespace/,
  );
});

test("local source receipt binds generation, exact bytes, hash, and type", () => {
  const expected = {
    sourceGeneration: "42",
    sizeBytes: 1200,
    sha256: "a".repeat(64),
    contentType: "audio/wav",
  };
  assert.deepEqual(validateLocalSourceReceipt({
    generation: "42",
    sizeBytes: 1200,
    contentType: "audio/wav",
    customMetadata: { quipslyExpectedSha256: "a".repeat(64) },
  }, expected), {
    generation: "42",
    sizeBytes: 1200,
    sha256: "a".repeat(64),
    contentType: "audio/wav",
  });
  assert.throws(() => validateLocalSourceReceipt({
    generation: "41",
    sizeBytes: 1200,
    contentType: "audio/wav",
    customMetadata: { quipslyExpectedSha256: "a".repeat(64) },
  }, expected), /generation/);
});

test("Whisper normalization preserves timed provider evidence without inventing speakers", () => {
  const transcript = normalizeWhisperTranscript({
    language: "en",
    text: "A real test.",
    segments: [{
      id: 0,
      start: 0.25,
      end: 1.75,
      text: " A real test.",
      words: [
        { start: 0.25, end: 0.55, word: " A", probability: 0.91 },
        { start: 0.55, end: 1.05, word: " real", probability: 0.88 },
        { start: 1.05, end: 1.75, word: " test.", probability: 0.93 },
      ],
    }],
  });
  assert.equal(transcript.language, "en");
  assert.deepEqual(transcript.segments[0], {
    providerSegmentIndex: 0,
    startSeconds: 0.25,
    endSeconds: 1.75,
    text: "A real test.",
    confidence: null,
    words: [
      { startSeconds: 0.25, endSeconds: 0.55, word: "A", punctuatedWord: "A", confidence: 0.91 },
      { startSeconds: 0.55, endSeconds: 1.05, word: "real", punctuatedWord: "real", confidence: 0.88 },
      { startSeconds: 1.05, endSeconds: 1.75, word: "test", punctuatedWord: "test.", confidence: 0.93 },
    ],
  });
  assert.throws(() => normalizeWhisperTranscript({ segments: [] }), /no usable/);
});

test("local transcription requires current explicit consent from every audible participant", () => {
  const policyMetadata = {
    consentTextHash: MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
    consentEvidenceVersion: MOBILE_CAPTURE_CONSENT_EVIDENCE_VERSION,
    recordingChoiceExplicit: true,
    transcriptionChoiceExplicit: true,
    allAudibleParticipantsNotifiedAndAgreed: true,
    presentationEvidence: { surface: "quipsly-capture-consent-v2", version: 1 },
  };
  const room = {
    participants: [
      { id: "participant-1", userId: "user-1", role: "COACH" },
      { id: "participant-2", userId: "user-2", role: "CLIENT" },
      { id: "observer", userId: "observer-user", role: "OBSERVER" },
    ],
    recordingConsents: ["participant-1", "participant-2"].map((participantId, index) => ({
      id: `consent-${index + 1}`,
      participantId,
      userId: `user-${index + 1}`,
      status: "GRANTED",
      policyVersion: MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
      canRecordAudio: true,
      canRecordVideo: true,
      canTranscribe: true,
      consentedAt: new Date("2026-08-02T20:00:00Z"),
      revokedAt: null,
      updatedAt: new Date("2026-08-02T20:00:00Z"),
      metadataJson: policyMetadata,
    })),
  };
  const ready = currentConsentAllowsLocalTranscription(room, "audio");
  assert.equal(ready.allowed, true);
  assert.equal(ready.participantCount, 2);
  room.recordingConsents[1].canTranscribe = false;
  assert.equal(currentConsentAllowsLocalTranscription(room, "audio").allowed, false);
});
