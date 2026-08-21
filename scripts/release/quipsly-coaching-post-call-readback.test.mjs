import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseArguments, summarizePostCallEvidence } from "./quipsly-coaching-post-call-readback.mjs";

const now = new Date("2026-08-20T18:00:00.000Z");
const stopped = new Date("2026-08-20T18:00:12.000Z");
const participant = (id, userId, role) => ({ id, userId, role, accessStatus: "ACTIVE", joinedAt: now, leftAt: now, deviceLabel: role === "COACH" ? "Quipsly Web" : "Quipsly Capture", user: { primaryEmail: `${userId}@example.test` } });

function completeRoom() {
  const participants = [participant("p1", "u1", "COACH"), participant("p2", "u2", "CLIENT")];
  return {
    id: "room-1", captureGroupId: "capture-group-1", purpose: "COACHING", status: "ENDED", scheduledStart: now, openedAt: now, recordingStartedAt: now, endedAt: now, coachingEngagementId: "engagement-1",
    participants,
    invitations: [{ id: "invite-1", email: "u2@example.test", role: "CLIENT", status: "ACCEPTED", acceptedAt: now, acceptedByUserId: "u2", deliveries: [{ status: "SENT", channel: "EMAIL", completedAt: now }] }],
    recordingConsents: participants.map((row) => ({ participantId: row.id, userId: row.userId, status: "GRANTED", policyVersion: "v1", canRecordAudio: true, canRecordVideo: true, canTranscribe: true, consentedAt: now, revokedAt: null })),
    participantPreflightReceipts: participants.map((row) => ({ participantId: row.id, clientKind: row.id === "p1" ? "web" : "ios", status: "READY", audioSignalState: "HEARD", cameraWanted: true, cameraWidth: 1920, cameraHeight: 1080, cameraFrameRate: 30, testedAt: now, expiresAt: new Date(now.getTime() + 60_000) })),
    participantProviderGrants: participants.map((row) => ({ participantId: row.id, clientKind: row.id === "p1" ? "web" : "ios", deviceLabel: row.deviceLabel, issuedAt: now })),
    endpointQueueReceipts: participants.map((row, index) => ({ participantId: row.id, clientInstanceId: `client-${index}`, clientKind: index ? "ios" : "web", queueState: "DRAINED", localSourceCount: 1, pendingSourceCount: 0, failedSourceCount: 0, reconciledAt: now })),
    expectedSources: participants.map((row) => ({ id: `expected-${row.id}`, participantId: row.id, sourceKind: "AUDIO", retentionRole: "REQUIRED_MASTER", status: "ACTIVE", recordingAssetId: `asset-${row.id}`, createdAt: now })),
    stateReceipts: participants.flatMap((row, index) => ["START_RECORDING", "STOP_RECORDING"].map((action, actionIndex) => ({ receiptId: `receipt-${index}-${actionIndex}`, actorUserId: row.userId, action, outcome: "APPLIED", stateApplied: true, occurredAt: now }))),
    recordingAssets: participants.map((row) => ({ id: `asset-${row.id}`, participantId: row.id, kind: "LOCAL_AUDIO", status: "VERIFIED", checksum: "a".repeat(64), byteSize: 1000n, durationSeconds: 12, storageBucket: "private", storageObjectPath: `room/${row.id}`, verifiedAt: now, uploadedAt: now, recordedStartedAt: now, recordedStoppedAt: stopped })),
    transcriptJobs: participants.map((row) => ({ id: `transcript-${row.id}`, assetId: `asset-${row.id}`, status: "COMPLETED", provider: "local-whisper", language: "en", sourceSha256: "a".repeat(64), completedAt: now, updatedAt: now, _count: { segments: 3, words: 24 }, segments: [{ startSeconds: 0.1, endSeconds: 3.5, confidence: 0.9 }, { startSeconds: 3.6, endSeconds: 7.5, confidence: 0.88 }, { startSeconds: 7.6, endSeconds: 11.8, confidence: 0.91 }] })),
    providerRecordingCommands: [], providerRecordingEvents: [], notes: [{ id: "note", visibility: "SESSION_SHARED" }], actionItems: [{ id: "task", status: "OPEN" }], goals: [],
  };
}

function finalizations() {
  return ["p1", "p2"].map((id, index) => ({ captureId: `capture-${id}`, actorUserId: `u${index + 1}`, recordingAssetId: `asset-${id}`, processingDisposition: "RELEASED", transcriptDisposition: "QUEUED", updatedAt: now }));
}

test("parses exact room and output options", () => {
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgresql://localhost/db";
  try {
    assert.deepEqual(parseArguments(["--room-id", "room-1", "--output", "/tmp/receipt.json"]), { roomId: "room-1", outputPath: "/tmp/receipt.json", databaseUrl: "postgresql://localhost/db" });
  } finally {
    if (previous == null) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
});

test("complete canonical records pass automation but never claim human acceptance", () => {
  const receipt = summarizePostCallEvidence(completeRoom(), finalizations(), now.toISOString());
  assert.equal(receipt.schema, "quipsly-coaching-post-call-readback-v4");
  assert.equal(receipt.automatedEvidencePassed, true);
  assert.equal(receipt.humanAcceptance.satisfied, false);
  assert.equal(receipt.invitationEvidence.emailDeliveryProven, true);
  assert.equal(receipt.invitationEvidence.acceptedShareOrCopyHandoffProven, false);
  assert.equal(receipt.redaction.emailAddressesIncluded, false);
  assert.equal(JSON.stringify(receipt).includes("u2@example.test"), false);
  assert.equal(Object.values(receipt.automatedGates).every(Boolean), true);
});

test("an accepted private share link passes without inventing email delivery", () => {
  const room = completeRoom();
  room.invitations[0].deliveries = [];
  const receipt = summarizePostCallEvidence(room, finalizations(), now.toISOString());
  assert.equal(receipt.automatedGates.invitationHandoffCompleted, true);
  assert.equal(receipt.invitationEvidence.emailDeliveryProven, false);
  assert.equal(receipt.invitationEvidence.acceptedShareOrCopyHandoffProven, true);
  assert.equal(receipt.automatedEvidencePassed, true);
});

test("one coach can coordinate recording while every endpoint retains its own source", () => {
  const room = completeRoom();
  room.stateReceipts = room.stateReceipts.filter((row) => row.actorUserId === "u1");
  const receipt = summarizePostCallEvidence(room, finalizations(), now.toISOString());
  assert.equal(receipt.automatedGates.coachCoordinatedRecordingStartAndStop, true);
  assert.equal(receipt.automatedGates.verifiedLocalSourceForEveryParticipant, true);
  assert.equal(receipt.automatedEvidencePassed, true);
});

test("a client-only recording transition cannot impersonate coach coordination", () => {
  const room = completeRoom();
  room.stateReceipts = room.stateReceipts.filter((row) => row.actorUserId === "u2");
  const receipt = summarizePostCallEvidence(room, finalizations(), now.toISOString());
  assert.equal(receipt.automatedGates.coachCoordinatedRecordingStartAndStop, false);
  assert.equal(receipt.automatedEvidencePassed, false);
});

test("missing second retained source fails exact automated gates", () => {
  const room = completeRoom();
  room.recordingAssets.pop();
  const receipt = summarizePostCallEvidence(room, finalizations(), now.toISOString());
  assert.equal(receipt.automatedGates.verifiedLocalSourceForEveryParticipant, false);
  assert.equal(receipt.automatedGates.requiredSourcePlanSatisfied, false);
  assert.equal(receipt.automatedEvidencePassed, false);
});

test("a missing or empty participant transcript fails post-call evidence", () => {
  const missing = completeRoom();
  missing.transcriptJobs.pop();
  const missingReceipt = summarizePostCallEvidence(missing, finalizations(), now.toISOString());
  assert.equal(missingReceipt.automatedGates.completedTranscriptForEveryParticipant, false);
  assert.equal(missingReceipt.automatedEvidencePassed, false);

  const empty = completeRoom();
  empty.transcriptJobs[1]._count.segments = 0;
  const emptyReceipt = summarizePostCallEvidence(empty, finalizations(), now.toISOString());
  assert.equal(emptyReceipt.automatedGates.completedTranscriptForEveryParticipant, false);
  assert.equal(emptyReceipt.automatedEvidencePassed, false);
});

test("non-overlapping required masters cannot claim an assemblable call", () => {
  const room = completeRoom();
  room.recordingAssets[1].recordedStartedAt = new Date("2026-08-20T18:00:15.000Z");
  room.recordingAssets[1].recordedStoppedAt = new Date("2026-08-20T18:00:27.000Z");
  const receipt = summarizePostCallEvidence(room, finalizations(), now.toISOString());
  assert.equal(receipt.recordingEvidence.requiredSourceOverlapSeconds, 0);
  assert.equal(receipt.automatedGates.coherentRequiredSourceOverlap, false);
  assert.equal(receipt.automatedEvidencePassed, false);
});

test("transcript timing must remain source-bound and inside the retained asset", () => {
  const wrongHash = completeRoom();
  wrongHash.transcriptJobs[1].sourceSha256 = "b".repeat(64);
  const wrongHashReceipt = summarizePostCallEvidence(wrongHash, finalizations(), now.toISOString());
  assert.equal(wrongHashReceipt.automatedGates.sourceBoundTimedTranscriptForEveryParticipant, false);

  const outsideSource = completeRoom();
  outsideSource.transcriptJobs[1].segments[2].endSeconds = 30;
  const outsideSourceReceipt = summarizePostCallEvidence(outsideSource, finalizations(), now.toISOString());
  assert.equal(outsideSourceReceipt.automatedGates.sourceBoundTimedTranscriptForEveryParticipant, false);
  assert.equal(outsideSourceReceipt.automatedEvidencePassed, false);
});

test("timed transcript can use a coherent recording window when container duration is absent", () => {
  const room = completeRoom();
  room.recordingAssets.forEach((asset) => { asset.durationSeconds = null; });
  const receipt = summarizePostCallEvidence(room, finalizations(), now.toISOString());
  assert.equal(receipt.automatedGates.sourceBoundTimedTranscriptForEveryParticipant, true);
  assert.equal(receipt.transcriptEvidence.jobs[0].timing.sourceDurationAuthority, "recording-window");
  assert.equal(receipt.automatedEvidencePassed, true);
});

test("revoked consent cannot satisfy current consent", () => {
  const room = completeRoom();
  room.recordingConsents[1].status = "REVOKED";
  room.recordingConsents[1].revokedAt = now;
  const receipt = summarizePostCallEvidence(room, finalizations(), now.toISOString());
  assert.equal(receipt.automatedGates.currentConsentForEveryAccount, false);
});

test("operator path is explicitly read-only and writes only its private receipt", async () => {
  const source = await readFile(new URL("./quipsly-coaching-post-call-readback.mjs", import.meta.url), "utf8");
  assert.match(source, /SET TRANSACTION READ ONLY/);
  assert.match(source, /isolationLevel: "RepeatableRead"/);
  assert.match(source, /mode: 0o600/);
  for (const mutation of ["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"]) {
    assert.doesNotMatch(source, new RegExp(`(?:tx|prisma)\\.[A-Za-z0-9_]+\\.${mutation}\\(`), `Readback source contains forbidden Prisma mutation ${mutation}`);
  }
});
