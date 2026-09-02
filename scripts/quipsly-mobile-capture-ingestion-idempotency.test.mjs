#!/usr/bin/env node
import assert from "node:assert/strict";

const { recordMobileCaptureIngestion } = await import("../apps/quipsly/src/lib/server/mobile-capture-records.ts");

function iso(value) {
  return new Date(value).toISOString();
}

function sameDate(left, right) {
  const leftTime = left instanceof Date ? left.getTime() : new Date(left).getTime();
  const rightTime = right instanceof Date ? right.getTime() : new Date(right).getTime();
  return leftTime === rightTime;
}

function createInMemoryPrisma() {
  const db = {
    rooms: [
      {
        id: "room_existing",
        providerRoomId: "quipsly:existing-booking",
        createdByUserId: "user_owner",
        metadataJson: { source: "coaching-runway", keepMe: true },
        projectSlug: "hgo",
        nestSlug: "hgo",
        status: "PLANNED",
      },
    ],
    participants: [
      {
        id: "participant_existing",
        roomId: "room_existing",
        userId: "user_owner",
        deviceLabel: "Quipsly iOS Capture",
        connectionJson: { source: "session-picker" },
      },
    ],
    consents: [
      {
        id: "consent_existing",
        roomId: "room_existing",
        participantId: "participant_existing",
        userId: "user_owner",
        status: "REQUESTED",
        canRecordAudio: false,
        canRecordVideo: false,
        canTranscribe: false,
        metadataJson: { source: "room-spine" },
      },
    ],
    assets: [
      {
        id: "asset_existing",
        roomId: "room_existing",
        participantId: "participant_existing",
        kind: "LOCAL_AUDIO",
        status: "LOCAL_READY",
        fileName: "coaching-test.m4a",
        recordedStartedAt: new Date("2026-07-05T10:00:00.000Z"),
        localManifestJson: {},
        segmentsJson: [],
      },
    ],
    chunks: [],
    transcriptJobs: [],
    finalizationReceipts: [],
    counters: {
      participant: 0,
      consent: 0,
      asset: 0,
      chunk: 0,
      transcript: 0,
    },
  };

  function nextId(prefix) {
    db.counters[prefix] += 1;
    return `${prefix}_${db.counters[prefix]}`;
  }

  function assignId(prefix, data) {
    return { id: data.id || nextId(prefix), ...data };
  }

  function patch(target, data) {
    Object.assign(target, data);
    return target;
  }

  const prisma = {
    mobileCaptureFinalizationReceipt: {
      async findFirst({ where }) {
        return db.finalizationReceipts.find((receipt) => receipt.recordingAssetId === where.recordingAssetId) || null;
      },
    },
    callRoom: {
      async findFirst({ where }) {
        const room = db.rooms.find((item) => item.id === where.id) || null;
        if (!room || !Array.isArray(where.OR)) return room;
        const allowed = where.OR.some((clause) => {
          if (clause.createdByUserId) return room.createdByUserId === clause.createdByUserId;
          const participantUserId = clause.participants?.some?.userId;
          if (participantUserId) {
            return db.participants.some(
              (participant) => participant.roomId === room.id && participant.userId === participantUserId,
            );
          }
          if (clause.booking?.clientUserId) return room.booking?.clientUserId === clause.booking.clientUserId;
          if (clause.booking?.coachUserId) return room.booking?.coachUserId === clause.booking.coachUserId;
          return false;
        });
        return allowed ? room : null;
      },
      async findUnique({ where }) {
        return db.rooms.find((room) => room.id === where.id || room.providerRoomId === where.providerRoomId) || null;
      },
      async update({ where, data }) {
        const room = db.rooms.find((item) => item.id === where.id);
        assert.ok(room, `room not found: ${where.id}`);
        return patch(room, data);
      },
      async upsert({ where, update, create }) {
        const room = db.rooms.find((item) => item.providerRoomId === where.providerRoomId);
        if (room) return patch(room, update);
        const created = assignId("room", create);
        db.rooms.push(created);
        return created;
      },
    },
    callParticipant: {
      async findFirst({ where }) {
        return (
          db.participants.find(
            (participant) =>
              (!where.id || participant.id === where.id) &&
              (!where.roomId || participant.roomId === where.roomId) &&
              (!where.userId || participant.userId === where.userId),
          ) || null
        );
      },
      async update({ where, data }) {
        const participant = db.participants.find((item) => item.id === where.id);
        assert.ok(participant, `participant not found: ${where.id}`);
        return patch(participant, data);
      },
      async create({ data }) {
        const created = assignId("participant", data);
        db.participants.push(created);
        return created;
      },
    },
    recordingConsent: {
      async findUnique({ where }) {
        return db.consents.find((consent) => consent.id === where.id) || null;
      },
      async findFirst({ where }) {
        return (
          db.consents.find((consent) => {
            if (where.id && consent.id !== where.id) return false;
            if (where.roomId && consent.roomId !== where.roomId) return false;
            if (where.participantId && consent.participantId !== where.participantId) return false;
            if (!Array.isArray(where.OR)) return true;
            return where.OR.some((clause) => {
              if (clause.participantId && consent.participantId !== clause.participantId) return false;
              if (clause.status && consent.status !== clause.status) return false;
              return true;
            });
          }) || null
        );
      },
      async update({ where, data }) {
        const consent = db.consents.find((item) => item.id === where.id);
        assert.ok(consent, `consent not found: ${where.id}`);
        return patch(consent, data);
      },
      async create({ data }) {
        const created = assignId("consent", data);
        db.consents.push(created);
        return created;
      },
    },
    recordingAsset: {
      async findUnique({ where, include }) {
        const asset = db.assets.find((item) => item.id === where.id) || null;
        if (!asset || !include?.participant) return asset;
        return {
          ...asset,
          participant: db.participants.find((participant) => participant.id === asset.participantId) || null,
        };
      },
      async findFirst({ where }) {
        return (
          db.assets.find((asset) => {
            if (where.id && asset.id !== where.id) return false;
            if (where.roomId && asset.roomId !== where.roomId) return false;
            if (where.participantId && asset.participantId !== where.participantId) return false;
            if (where.fileName && asset.fileName !== where.fileName) return false;
            if (where.kind && asset.kind !== where.kind) return false;
            if (where.recordedStartedAt && !sameDate(asset.recordedStartedAt, where.recordedStartedAt)) return false;
            return true;
          }) || null
        );
      },
      async update({ where, data }) {
        const asset = db.assets.find((item) => item.id === where.id);
        assert.ok(asset, `asset not found: ${where.id}`);
        return patch(asset, data);
      },
      async upsert({ where, update, create }) {
        const asset = db.assets.find((item) => item.id === where.id);
        if (asset) return patch(asset, update);
        const created = assignId("asset", create);
        db.assets.push(created);
        return created;
      },
      async create({ data }) {
        const created = assignId("asset", data);
        db.assets.push(created);
        return created;
      },
    },
    uploadChunk: {
      async upsert({ where, update, create }) {
        const key = where.assetId_chunkIndex;
        const chunk = db.chunks.find((item) => item.assetId === key.assetId && item.chunkIndex === key.chunkIndex);
        if (chunk) return patch(chunk, update);
        const created = assignId("chunk", create);
        db.chunks.push(created);
        return created;
      },
    },
    transcriptJob: {
      async findFirst({ where }) {
        return db.transcriptJobs.find((job) => job.assetId === where.assetId) || null;
      },
      async update({ where, data }) {
        const job = db.transcriptJobs.find((item) => item.id === where.id);
        assert.ok(job, `transcript job not found: ${where.id}`);
        return patch(job, data);
      },
      async create({ data }) {
        const created = assignId("transcript", data);
        db.transcriptJobs.push(created);
        return created;
      },
    },
  };

  return { db, prisma };
}

const { db, prisma } = createInMemoryPrisma();
const startedAt = iso("2026-07-05T10:00:00.000Z");
const stoppedAt = iso("2026-07-05T10:05:00.000Z");

const first = await recordMobileCaptureIngestion({
  prisma,
  actorUserId: "user_owner",
  sessionId: "upload-session-1",
  fileName: "coaching-test.m4a",
  contentType: "audio/m4a",
  sizeBytes: 123456,
  provider: "gcs",
  storageBucket: "quipsly-media",
  storageObjectPath: "capture/room_existing/coaching-test.m4a",
  projectSlug: "hgo",
  episodeSlug: "coaching-proof",
  sourceType: "audio",
  callRoomId: "room_existing",
  participantId: "participant_existing",
  recordingConsentId: "consent_existing",
  recordingConsentGranted: true,
  recordingAssetId: "asset_existing",
  capturePurpose: "coaching",
  startedAt,
  stoppedAt,
  totalChunks: 2,
  mediaAssetId: "media-1",
  sourceId: "source-1",
});

assert.equal(first.roomId, "room_existing");
assert.equal(first.participantId, "participant_existing");
assert.equal(first.consentId, "consent_existing");
assert.equal(first.recordingAssetId, "asset_existing");
assert.equal(db.rooms.length, 1, "existing callRoomId should not create a duplicate room");
assert.equal(db.participants.length, 1, "existing participant should be reused");
assert.equal(db.consents.length, 1, "upload must not create or duplicate consent");
assert.equal(db.assets.length, 1, "existing scoped recording asset should be reused");
assert.equal(db.chunks.length, 2, "first ingest should upsert two chunks");
assert.equal(db.transcriptJobs.length, 1, "first ingest should create one held transcript job");
assert.equal(db.rooms[0].metadataJson.keepMe, true, "room metadata should preserve prior context");
assert.equal(db.rooms[0].status, "PLANNED", "upload must not silently end or reopen an existing room");
assert.equal(db.consents[0].status, "REQUESTED", "a client consent header must not grant server consent");
assert.equal(db.consents[0].canTranscribe, false, "a client consent header must not add processing permission");
assert.equal(db.assets[0].status, "HELD");
assert.equal(db.assets[0].durationSeconds, 300, "capture boundaries should materialize a provisional duration");
assert.deepEqual(
  db.assets[0].localManifestJson.durationEvidence,
  {
    source: "recorded-boundary-clock",
    durationSeconds: 300,
    provisionalUntilMediaDecode: true,
  },
  "duration provenance should remain explicit until decoded media replaces it",
);
assert.equal(db.transcriptJobs[0].status, "HELD");

db.consents[0].status = "GRANTED";
db.consents[0].canRecordAudio = true;
db.consents[0].canTranscribe = true;
db.consents[0].consentedAt = new Date();

const second = await recordMobileCaptureIngestion({
  prisma,
  actorUserId: "user_owner",
  sessionId: "upload-session-1-retry",
  fileName: "coaching-test.m4a",
  contentType: null,
  sizeBytes: 123456,
  provider: "gcs",
  projectSlug: "hgo",
  episodeSlug: "coaching-proof",
  sourceType: "audio",
  callRoomId: "room_existing",
  participantId: "participant_existing",
  recordingConsentId: "consent_existing",
  recordingConsentGranted: true,
  recordingAssetId: "asset_existing",
  capturePurpose: "coaching",
  startedAt,
  stoppedAt,
  totalChunks: 2,
  mediaAssetId: "media-1",
  sourceId: "source-1",
});

assert.equal(second.roomId, "room_existing");
assert.equal(second.participantId, "participant_existing");
assert.equal(second.consentId, "consent_existing");
assert.equal(second.recordingAssetId, "asset_existing");
assert.equal(second.transcriptJobId, first.transcriptJobId);
assert.equal(db.rooms.length, 1, "retry should still have one room");
assert.equal(db.participants.length, 1, "retry should still have one participant");
assert.equal(db.consents.length, 1, "retry should still have one immutable consent row");
assert.equal(db.assets.length, 1, "retry should still have one asset");
assert.equal(db.chunks.length, 2, "retry should upsert existing chunks");
assert.equal(db.transcriptJobs.length, 1, "retry should reuse existing transcript job");
assert.equal(db.assets[0].status, "HELD", "missing server disposition must stay held even after consent changes");
assert.equal(db.assets[0].storageBucket, "quipsly-media", "retry without bucket must preserve storage bucket");
assert.equal(
  db.assets[0].storageObjectPath,
  "capture/room_existing/coaching-test.m4a",
  "retry without object path must preserve storage object path",
);
assert.equal(db.transcriptJobs[0].status, "HELD", "missing transcript disposition must fail closed");

const canonical = await recordMobileCaptureIngestion({
  prisma,
  actorUserId: "user_owner",
  sessionId: "upload-session-1-canonical",
  fileName: "coaching-test.m4a",
  contentType: "audio/m4a",
  sizeBytes: 123456,
  checksumSha256: "a".repeat(64),
  exactBytesVerified: true,
  provider: "gcs",
  storageBucket: "quipsly-media",
  storageObjectPath: "capture/room_existing/coaching-test.m4a",
  projectSlug: "hgo",
  episodeSlug: "coaching-proof",
  sourceType: "audio",
  callRoomId: "room_existing",
  participantId: "participant_existing",
  recordingConsentId: "consent_existing",
  recordingAssetId: "asset_existing",
  capturePurpose: "coaching",
  startedAt,
  stoppedAt,
  totalChunks: 2,
  mediaAssetId: "media-1",
  sourceId: "source-1",
  processingDisposition: "RELEASED",
  transcriptionDisposition: "RELEASED",
});
assert.equal(canonical.recordingAssetId, "asset_existing");
assert.equal(db.assets[0].status, "VERIFIED", "only explicit exact-byte canonical release verifies recording evidence");
assert.equal(db.transcriptJobs[0].status, "QUEUED", "explicit canonical transcript release queues processing");
assert.equal(db.transcriptJobs[0].errorMessage, null);

db.finalizationReceipts.push({
  uploadSessionId: "9d8c0c81-847f-4e16-96d0-26b494c890aa",
  recordingAssetId: "asset_existing",
  metadataJson: {},
  createdAt: new Date(),
});
const compatibilityRebind = await recordMobileCaptureIngestion({
  prisma,
  actorUserId: "user_owner",
  sessionId: "legacy-rebind-attempt",
  fileName: "coaching-test.m4a",
  contentType: "audio/m4a",
  sizeBytes: 222,
  exactBytesVerified: false,
  provider: "pending",
  storageBucket: "quipsly-media",
  storageObjectPath: "legacy/new-unverified-bytes.m4a",
  projectSlug: "hgo",
  episodeSlug: "coaching-proof",
  sourceType: "audio",
  callRoomId: "room_existing",
  participantId: "participant_existing",
  recordingConsentId: "consent_existing",
  recordingAssetId: "asset_existing",
  capturePurpose: "coaching",
  startedAt,
  stoppedAt,
  totalChunks: 1,
  processingDisposition: "HELD",
  transcriptionDisposition: "HELD",
});
assert.notEqual(compatibilityRebind.recordingAssetId, "asset_existing",
  "compatibility bytes must create fresh HELD evidence instead of rebinding a finalized asset");
assert.equal(db.assets[0].storageObjectPath, "capture/room_existing/coaching-test.m4a",
  "the normalized asset immutable storage binding must remain unchanged");
assert.equal(db.assets.find((item) => item.id === compatibilityRebind.recordingAssetId)?.status, "HELD");

const held = await recordMobileCaptureIngestion({
  prisma,
  actorUserId: "user_owner",
  sessionId: "upload-session-no-consent",
  fileName: "no-consent-test.m4a",
  contentType: "audio/m4a",
  sizeBytes: 4321,
  provider: "gcs",
  storageBucket: "quipsly-media",
  storageObjectPath: "capture/no-consent/no-consent-test.m4a",
  projectSlug: "hgo",
  episodeSlug: "coaching-proof",
  sourceType: "audio",
  recordingConsentGranted: true,
  capturePurpose: "coaching",
  startedAt: iso("2026-07-05T11:00:00.000Z"),
  stoppedAt: iso("2026-07-05T11:03:00.000Z"),
  totalChunks: 1,
  mediaAssetId: "media-no-consent",
  sourceId: "source-no-consent",
});

const heldAsset = db.assets.find((asset) => asset.id === held.recordingAssetId);
const heldJob = db.transcriptJobs.find((job) => job.id === held.transcriptJobId);
const heldRoom = db.rooms.find((room) => room.id === held.roomId);

assert.equal(held.consentStatus, "MISSING", "upload must not fabricate missing consent");
assert.equal(held.consentId, null, "upload must not create a consent identifier");
assert.equal(held.recordingAssetStatus, "HELD", "recording should be held without consent even if storage is durable");
assert.equal(held.transcriptJobStatus, "HELD", "transcript should not queue without consent");
assert.equal(heldAsset?.status, "HELD", "stored recording asset should be held without consent");
assert.equal(heldJob?.status, "HELD", "stored transcript job should be held without consent");
assert.equal(heldJob?.provider, "processing-hold");
assert.match(heldJob?.errorMessage || "", /recording authorization is incomplete/i);
assert.equal(db.consents.length, 1, "no-consent upload must not create another consent row");
assert.equal(heldRoom?.status, "OPEN", "a legacy room created during upload stays open rather than silently ending");

function securityInput(overrides = {}) {
  return {
    prisma,
    actorUserId: "user_owner",
    sessionId: "security-check",
    fileName: "security-check.m4a",
    contentType: "audio/m4a",
    sizeBytes: 100,
    provider: "gcs",
    projectSlug: "hgo",
    episodeSlug: "security-check",
    sourceType: "audio",
    capturePurpose: "coaching",
    startedAt,
    stoppedAt,
    totalChunks: 1,
    ...overrides,
  };
}

await assert.rejects(
  recordMobileCaptureIngestion(securityInput({ actorUserId: undefined })),
  /verified upload actor is required/i,
  "capture record mutation must fail closed without an authenticated actor",
);

db.rooms.push({
  id: "room_cross_actor",
  providerRoomId: "cross-actor",
  createdByUserId: "user_other",
  projectSlug: "hgo",
  nestSlug: "hgo",
  status: "PLANNED",
  metadataJson: {},
});
db.participants.push({
  id: "participant_other",
  roomId: "room_cross_actor",
  userId: "user_other",
  connectionJson: {},
});
db.consents.push({
  id: "consent_other",
  roomId: "room_cross_actor",
  participantId: "participant_other",
  userId: "user_other",
  status: "GRANTED",
  canRecordAudio: true,
  canTranscribe: true,
});
db.assets.push({
  id: "asset_other",
  roomId: "room_cross_actor",
  participantId: "participant_other",
  kind: "LOCAL_AUDIO",
  status: "LOCAL_READY",
  fileName: "security-check.m4a",
  recordedStartedAt: new Date(startedAt),
});

await assert.rejects(
  recordMobileCaptureIngestion(securityInput({ callRoomId: "room_cross_actor" })),
  /not found or is not accessible/i,
  "another actor's room must be rejected",
);
await assert.rejects(
  recordMobileCaptureIngestion(
    securityInput({ callRoomId: "room_existing", participantId: "participant_other" }),
  ),
  /participant does not belong/i,
  "another actor's participant must be rejected",
);
await assert.rejects(
  recordMobileCaptureIngestion(
    securityInput({
      callRoomId: "room_existing",
      participantId: "participant_existing",
      recordingConsentId: "consent_other",
    }),
  ),
  /consent does not belong/i,
  "consent from another room must be rejected rather than reassigned",
);
await assert.rejects(
  recordMobileCaptureIngestion(
    securityInput({
      callRoomId: "room_existing",
      participantId: "participant_existing",
      recordingAssetId: "asset_other",
    }),
  ),
  /asset does not belong/i,
  "recording asset from another room must be rejected rather than reassigned",
);

db.rooms.push({
  id: "room_cross_project",
  providerRoomId: "cross-project",
  createdByUserId: "user_owner",
  projectSlug: "other-project",
  nestSlug: "other-project",
  status: "PLANNED",
  metadataJson: {},
});
await assert.rejects(
  recordMobileCaptureIngestion(securityInput({ callRoomId: "room_cross_project" })),
  /different Nest project/i,
  "an accessible room cannot be rebound to a different project by an upload header",
);

console.log("PASS: mobile capture ingestion preserves consent and room state and rejects cross-scope references.");
