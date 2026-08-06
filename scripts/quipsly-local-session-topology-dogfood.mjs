#!/usr/bin/env node

const enabled = process.env.QUIPSLY_LOCAL_SESSION_TOPOLOGY_DOGFOOD === "1";
if (!enabled) {
  throw new Error("Set QUIPSLY_LOCAL_SESSION_TOPOLOGY_DOGFOOD=1 to authorize retained local Session topology artifacts.");
}

const databaseURL = new URL(
  process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio",
);
if (![
  "127.0.0.1",
  "localhost",
  "[::1]",
].includes(databaseURL.hostname)) {
  throw new Error("Session topology dogfood requires loopback PostgreSQL and refuses remote databases.");
}
process.env.DATABASE_URL = databaseURL.toString();

const {
  MOBILE_CAPTURE_CONSENT_EVIDENCE_VERSION,
  MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
  MOBILE_CAPTURE_CONSENT_TEXT,
  MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
} = await import("../apps/quipsly/src/lib/mobile-capture-consent-policy.js");
const { getPrismaClient } = await import("../apps/quipsly/src/lib/prisma.ts");
const prisma = getPrismaClient();

const ROOM_ID = "retained-session-topology-20260805";
const ACTOR_EMAIL = "quipsly.dialogue.repair.qa@local.test";
const CAPTURE_ID = "7dbb398e-d362-4e0e-9b39-1256298a59d4";
const START_RECEIPT_ID = "63df3d50-7c28-49a0-99df-989298318223";
const STOP_RECEIPT_ID = "339231c3-e35d-4cb9-a452-3fe18914e30b";

const actor = await prisma.user.findUnique({
  where: { primaryEmail: ACTOR_EMAIL },
  select: { id: true, primaryEmail: true, name: true },
});
if (!actor) throw new Error(`Local QA user ${ACTOR_EMAIL} does not exist.`);

const project = await prisma.studioProject.findFirst({
  where: { slug: "high-ground-odyssey" },
  select: { id: true, slug: true },
});
if (!project) throw new Error("The retained high-ground-odyssey Nest fixture does not exist.");

const room = await prisma.callRoom.upsert({
  where: { id: ROOM_ID },
  create: {
    id: ROOM_ID,
    createdByUserId: actor.id,
    projectId: project.id,
    projectSlug: project.slug,
    nestSlug: project.slug,
    purpose: "PODCAST",
    status: "OPEN",
    provider: "planned",
    title: "Retained person, endpoint, and source topology rehearsal",
    openedAt: new Date("2026-08-05T18:00:00.000Z"),
    metadataJson: {
      source: "quipsly-local-session-topology-dogfood",
      localOnly: true,
      retainedTestArtifact: true,
    },
  },
  update: {
    createdByUserId: actor.id,
    projectId: project.id,
    projectSlug: project.slug,
    nestSlug: project.slug,
    purpose: "PODCAST",
    status: "OPEN",
    provider: "planned",
    title: "Retained person, endpoint, and source topology rehearsal",
    endedAt: null,
  },
  select: { id: true, captureGroupId: true },
});

let participant = await prisma.callParticipant.findFirst({
  where: { roomId: room.id, userId: actor.id },
});
participant = participant
  ? await prisma.callParticipant.update({
      where: { id: participant.id },
      data: {
        displayName: actor.name || "Quipsly topology QA",
        email: actor.primaryEmail,
        role: "PRODUCER",
        accessStatus: "ACTIVE",
        deviceLabel: "Quipsly topology QA",
      },
    })
  : await prisma.callParticipant.create({
      data: {
        roomId: room.id,
        userId: actor.id,
        displayName: actor.name || "Quipsly topology QA",
        email: actor.primaryEmail,
        role: "PRODUCER",
        accessStatus: "ACTIVE",
        deviceLabel: "Quipsly topology QA",
      },
    });

const consent = await prisma.recordingConsent.findFirst({
  where: { roomId: room.id, participantId: participant.id },
  orderBy: { updatedAt: "desc" },
});
const consentData = {
  userId: actor.id,
  status: "GRANTED",
  consentText: MOBILE_CAPTURE_CONSENT_TEXT,
  policyVersion: MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
  canRecordAudio: true,
  canRecordVideo: true,
  canTranscribe: true,
  consentedAt: new Date("2026-08-05T18:00:00.000Z"),
  declinedAt: null,
  revokedAt: null,
  metadataJson: {
    source: "quipsly-local-session-topology-dogfood",
    retainedTestArtifact: true,
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
if (consent) {
  await prisma.recordingConsent.update({ where: { id: consent.id }, data: consentData });
} else {
  await prisma.recordingConsent.create({
    data: { roomId: room.id, participantId: participant.id, ...consentData },
  });
}

await prisma.callParticipantProviderGrantReceipt.upsert({
  where: { tokenJti: "retained-session-topology-web-grant-20260805" },
  create: {
    roomId: room.id,
    participantId: participant.id,
    tokenJti: "retained-session-topology-web-grant-20260805",
    providerIdentity: `${participant.id}:retained-topology-browser`,
    providerRoomId: "retained-session-topology-provider-room",
    clientInstanceId: "retained-topology-browser-installation",
    clientKind: "web",
    deviceLabel: "Quipsly Web · retained Mac browser",
    issuedAt: new Date("2026-08-05T18:00:00.000Z"),
    expiresAt: new Date("2026-08-05T20:00:00.000Z"),
    metadataJson: { retainedTestArtifact: true },
  },
  update: {
    participantId: participant.id,
    roomId: room.id,
    clientInstanceId: "retained-topology-browser-installation",
    clientKind: "web",
    deviceLabel: "Quipsly Web · retained Mac browser",
    metadataJson: { retainedTestArtifact: true },
  },
});

const captureStartedAt = new Date("2026-08-05T18:05:00.000Z");
const captureStoppedAt = new Date("2026-08-05T18:05:10.000Z");
await prisma.captureRoomStateReceipt.upsert({
  where: { receiptId: START_RECEIPT_ID },
  create: {
    receiptId: START_RECEIPT_ID,
    roomId: room.id,
    captureId: CAPTURE_ID,
    actorUserId: actor.id,
    captureOwnerUserId: actor.id,
    action: "START_RECORDING",
    occurredAt: captureStartedAt,
    outcome: "APPLIED",
    stateApplied: true,
    roomStatusBefore: "OPEN",
    roomStatusAfter: "RECORDING",
    metadataJson: { retainedTestArtifact: true, bytesUploaded: false },
  },
  update: {
    roomId: room.id,
    captureOwnerUserId: actor.id,
    outcome: "APPLIED",
    stateApplied: true,
  },
});
await prisma.captureRoomStateReceipt.upsert({
  where: { receiptId: STOP_RECEIPT_ID },
  create: {
    receiptId: STOP_RECEIPT_ID,
    roomId: room.id,
    captureId: CAPTURE_ID,
    actorUserId: actor.id,
    captureOwnerUserId: actor.id,
    action: "STOP_RECORDING",
    occurredAt: captureStoppedAt,
    outcome: "APPLIED",
    stateApplied: true,
    roomStatusBefore: "RECORDING",
    roomStatusAfter: "OPEN",
    metadataJson: { retainedTestArtifact: true, bytesUploaded: false },
  },
  update: {
    roomId: room.id,
    captureOwnerUserId: actor.id,
    outcome: "APPLIED",
    stateApplied: true,
  },
});

console.log(JSON.stringify({
  ok: true,
  roomId: room.id,
  captureGroupId: room.captureGroupId,
  participantId: participant.id,
  boundary: "START and STOP exist; no RecordingAsset was created or implied.",
}, null, 2));

await prisma.$disconnect();
