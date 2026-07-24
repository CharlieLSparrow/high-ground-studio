#!/usr/bin/env node
import assert from "node:assert/strict";

const { createLiveKitJoinToken, decodeLiveKitJoinTokenPayloadForTest } = await import(
  "../apps/quipsly/src/lib/server/livekit-join-token.ts"
);

const issued = createLiveKitJoinToken({
  apiKey: "dev-livekit-key",
  apiSecret: "dev-livekit-secret",
  identity: "participant_123",
  name: "Reviewer Participant",
  roomName: "room_hgo_capture_test",
  nowSeconds: 1_800_000_000,
  jti: "test-jti",
  metadata: {
    callRoomId: "room_123",
    participantId: "participant_123",
    userId: "user_123",
    purpose: "COACHING",
    recordingConsentStatus: "GRANTED",
  },
});

const payload = decodeLiveKitJoinTokenPayloadForTest(issued.token);
const metadata = JSON.parse(String(payload.metadata || "{}"));

assert.equal(issued.expiresInSeconds, 600);
assert.equal(issued.issuedAt, "2027-01-15T08:00:00.000Z");
assert.equal(issued.expiresAt, "2027-01-15T08:10:00.000Z");
assert.equal(payload.iss, "dev-livekit-key");
assert.equal(payload.sub, "participant_123");
assert.equal(payload.name, "Reviewer Participant");
assert.equal(payload.jti, "test-jti");
assert.equal(payload.iat, 1_800_000_000);
assert.equal(payload.exp, 1_800_000_600);
assert.equal(payload.nbf, 1_799_999_995);
assert.equal(payload.video.room, "room_hgo_capture_test");
assert.equal(payload.video.roomJoin, true);
assert.equal(payload.video.canPublish, true);
assert.equal(payload.video.canPublishData, true);
assert.equal(payload.video.canSubscribe, true);
assert.equal(JSON.stringify(payload).includes("dev-livekit-secret"), false);
assert.equal(payload.exp - payload.iat, 600);
assert.equal(metadata.callRoomId, "room_123");
assert.equal(metadata.recordingConsentStatus, "GRANTED");
assert.deepEqual(issued.safeClaims.metadataKeys, [
  "callRoomId",
  "participantId",
  "purpose",
  "recordingConsentStatus",
  "userId",
]);
assert.equal(JSON.stringify(issued.safeClaims).includes("dev-livekit-secret"), false);

console.log("PASS: LiveKit join tokens are short-lived, room-scoped, metadata-backed, and do not expose provider secrets in safe claims.");
