#!/usr/bin/env node

import { createHash, randomBytes, randomUUID } from "node:crypto";

import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

import {
  MOBILE_CAPTURE_CONSENT_EVIDENCE_VERSION,
  MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
  MOBILE_CAPTURE_CONSENT_TEXT,
  MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
} from "../apps/quipsly/src/lib/mobile-capture-consent-policy.js";

const enabled = process.env.QUIPSLY_LOCAL_COLLABORATION_DOGFOOD === "1";
const baseUrl = new URL(
  process.env.QUIPSLY_LOCAL_BASE_URL || "http://127.0.0.1:3012",
);
const databaseUrl = new URL(
  process.env.QUIPSLY_LOCAL_DATABASE_URL ||
    "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio",
);
const authEmulatorHost = String(
  process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099",
).trim();
const firebaseProjectId = "quipsly-reef";

assert(
  enabled,
  "Set QUIPSLY_LOCAL_COLLABORATION_DOGFOOD=1 to authorize disposable local writes.",
);
assertLoopbackUrl(baseUrl, "Quipsly base URL");
assertLoopbackUrl(databaseUrl, "database URL");
assertLoopbackHost(authEmulatorHost, "Firebase Auth emulator");

process.env.DATABASE_URL = databaseUrl.toString();
process.env.PRISMA_PG_POOL_MAX ||= "1";
process.env.FIREBASE_AUTH_EMULATOR_HOST = authEmulatorHost;
process.env.GCLOUD_PROJECT = firebaseProjectId;
process.env.GOOGLE_CLOUD_PROJECT = firebaseProjectId;

const { getPrismaClient } = await import("../apps/quipsly/src/lib/prisma.ts");
const prisma = getPrismaClient();
const nonce = randomBytes(5).toString("hex");
const ownerEmail = `session-owner-${nonce}@example.test`;
const collaboratorEmail = `session-collab-${nonce}@example.test`;
const outsiderEmail = `session-outsider-${nonce}@example.test`;
const viewerEmail = `session-viewer-${nonce}@example.test`;
const collaboratorUid = `session-collab-${nonce}`;
const outsiderUid = `session-outsider-${nonce}`;
const viewerUid = `session-viewer-${nonce}`;
const password = `Qp-${randomBytes(18).toString("base64url")}!26`;
const firebaseApp = initializeApp(
  { projectId: firebaseProjectId },
  `session-collaboration-dogfood-${nonce}`,
);
const auth = getAuth(firebaseApp);

const fixture = {
  ownerUserId: "",
  collaboratorUserId: "",
  outsiderUserId: "",
  viewerUserId: "",
  workspaceId: "",
  projectId: "",
  roomId: "",
  recordingAssetId: "",
  uploadSessionId: randomUUID(),
  transcriptJobId: "",
  transcriptSegmentId: "",
  summaryNoteId: "",
};
let operation = null;
let cleanup = null;

try {
  await Promise.all([
    auth.createUser({
      uid: collaboratorUid,
      email: collaboratorEmail,
      emailVerified: true,
      password,
      displayName: "Session collaboration dogfood",
    }),
    auth.createUser({
      uid: outsiderUid,
      email: outsiderEmail,
      emailVerified: true,
      password,
      displayName: "Session outsider dogfood",
    }),
    auth.createUser({
      uid: viewerUid,
      email: viewerEmail,
      emailVerified: true,
      password,
      displayName: "Session viewer dogfood",
    }),
  ]);
  const [collaboratorToken, outsiderToken, viewerToken] = await Promise.all([
    signInToEmulator(collaboratorEmail, password),
    signInToEmulator(outsiderEmail, password),
    signInToEmulator(viewerEmail, password),
  ]);

  const owner = await prisma.user.create({
    data: {
      primaryEmail: ownerEmail,
      name: "Session collaboration dogfood owner",
      emailVerified: new Date(),
    },
  });
  fixture.ownerUserId = owner.id;

  const workspace = await prisma.studioWorkspace.create({
    data: {
      slug: `session-collaboration-dogfood-${nonce}`,
      name: "Session collaboration dogfood",
    },
  });
  fixture.workspaceId = workspace.id;
  const project = await prisma.studioProject.create({
    data: {
      workspaceId: workspace.id,
      slug: `session-collaboration-project-${nonce}`,
      name: "Session collaboration project",
    },
  });
  fixture.projectId = project.id;
  await prisma.studioProjectAccessGrant.createMany({
    data: [
      {
        projectId: project.id,
        email: collaboratorEmail,
        role: "EDITOR",
        status: "ACTIVE",
        createdByUserId: owner.id,
        createdByEmail: ownerEmail,
        note: "Disposable local Session collaboration editor grant",
      },
      {
        projectId: project.id,
        email: viewerEmail,
        role: "VIEWER",
        status: "ACTIVE",
        createdByUserId: owner.id,
        createdByEmail: ownerEmail,
        note: "Disposable local Session collaboration viewer grant",
      },
    ],
  });

  const room = await prisma.callRoom.create({
    data: {
      projectId: project.id,
      createdByUserId: owner.id,
      purpose: "COACHING",
      status: "ENDED",
      title: "Disposable collaboration review Session",
      provider: "local-dogfood",
      endedAt: new Date(),
    },
  });
  fixture.roomId = room.id;
  const participant = await prisma.callParticipant.create({
    data: {
      roomId: room.id,
      userId: owner.id,
      displayName: "Fixture owner",
      email: ownerEmail,
      role: "HOST",
      joinedAt: new Date(Date.now() - 60_000),
      leftAt: new Date(),
    },
  });
  await prisma.recordingConsent.create({
    data: {
      roomId: room.id,
      participantId: participant.id,
      userId: owner.id,
      status: "GRANTED",
      consentText: MOBILE_CAPTURE_CONSENT_TEXT,
      policyVersion: MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
      canRecordAudio: true,
      canRecordVideo: false,
      canTranscribe: true,
      consentedAt: new Date(Date.now() - 60_000),
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
    },
  });

  const checksum = sha256(`session-collaboration-dogfood-${nonce}`);
  const storageBucket = "local-dogfood";
  const storageObjectPath = `session-collaboration/${nonce}/audio.wav`;
  const byteSize = 1_024n;
  const recordingAsset = await prisma.recordingAsset.create({
    data: {
      roomId: room.id,
      kind: "LOCAL_AUDIO",
      status: "VERIFIED",
      fileName: "session-collaboration-dogfood.wav",
      contentType: "audio/wav",
      byteSize,
      durationSeconds: 18,
      storageBucket,
      storageObjectPath,
      checksum,
      recordedStartedAt: new Date(Date.now() - 60_000),
      recordedStoppedAt: new Date(Date.now() - 42_000),
      uploadedAt: new Date(),
      verifiedAt: new Date(),
      localManifestJson: {
        fixture: true,
        processingDisposition: "RELEASED",
        transcriptionDisposition: "RELEASED",
      },
    },
  });
  fixture.recordingAssetId = recordingAsset.id;
  await prisma.mobileCaptureFinalizationReceipt.create({
    data: {
      uploadSessionId: fixture.uploadSessionId,
      captureId: randomUUID(),
      roomId: room.id,
      actorUserId: owner.id,
      processingDisposition: "RELEASED",
      transcriptDisposition: "RELEASED",
      recordingAssetId: recordingAsset.id,
      releasedByUserId: owner.id,
      releaseReason: "Disposable local collaboration dogfood",
      releasedAt: new Date(),
      transcriptReleasedByUserId: owner.id,
      transcriptReleaseReason: "Disposable local collaboration dogfood",
      transcriptReleasedAt: new Date(),
      metadataJson: {
        fixture: true,
        immutableUploadBinding: {
          uploadSessionId: fixture.uploadSessionId,
          roomId: room.id,
          sha256: checksum,
          bucketName: storageBucket,
          objectName: storageObjectPath,
          sizeBytes: Number(byteSize),
        },
      },
    },
  });

  const transcriptJob = await prisma.transcriptJob.create({
    data: {
      roomId: room.id,
      assetId: recordingAsset.id,
      status: "COMPLETED",
      provider: "local-dogfood",
      language: "en-US",
      requestedBy: ownerEmail,
      startedAt: new Date(Date.now() - 30_000),
      completedAt: new Date(),
      sourceSha256: checksum,
      resultJson: { fixture: true, segmentCount: 1 },
    },
  });
  fixture.transcriptJobId = transcriptJob.id;
  const transcriptText =
    "I will send the revised episode outline before next time.";
  const segment = await prisma.transcriptSegment.create({
    data: {
      transcriptJobId: transcriptJob.id,
      speakerLabel: "Fixture owner",
      startSeconds: 12,
      endSeconds: 18,
      text: transcriptText,
      confidence: 1,
      metadataJson: { fixture: true },
    },
  });
  fixture.transcriptSegmentId = segment.id;

  const packetBuildId = randomUUID();
  const actionCandidateId = `quipsly-transcript-action-candidate-v1:${transcriptJob.id}:${segment.id}`;
  const transcriptSnapshot = buildTranscriptSnapshot({
    id: segment.id,
    speakerLabel: segment.speakerLabel,
    startSeconds: segment.startSeconds,
    endSeconds: segment.endSeconds,
    text: segment.text,
  });
  const summary = await prisma.coachingNote.create({
    data: {
      roomId: room.id,
      authorUserId: owner.id,
      kind: "SUMMARY",
      visibility: "PROJECT_TEAM",
      title: "Disposable collaboration packet",
      body: "A generated packet used only to operate the local collaboration boundary.",
      sourceJson: {
        source: "transcript-packet-builder",
        transcriptJobId: transcriptJob.id,
        recordingAssetId: recordingAsset.id,
        roomId: room.id,
        packetBuildId,
        transcriptSnapshot,
        actionCandidates: [
          {
            id: actionCandidateId,
            kind: "quipsly-transcript-action-candidate-v1",
            reviewStatus: "READY_FOR_HUMAN_REVIEW",
            title: "Send the revised episode outline",
            detail:
              "A disposable candidate; no real client or episode work is represented.",
            transcriptJobId: transcriptJob.id,
            recordingAssetId: recordingAsset.id,
            roomId: room.id,
            packetBuildId,
            segmentId: segment.id,
            speakerLabel: segment.speakerLabel,
            startSeconds: segment.startSeconds,
            endSeconds: segment.endSeconds,
            humanApprovalRequired: true,
            committedActionItemId: null,
          },
        ],
        actionCandidateReviewReceipts: [],
      },
    },
  });
  fixture.summaryNoteId = summary.id;

  const outsiderRead = await requestJson(
    new URL(
      `/api/mobile/capture/transcripts/packet?callRoomId=${encodeURIComponent(room.id)}`,
      baseUrl,
    ),
    { headers: bearer(outsiderToken) },
  );
  assert(
    outsiderRead.status === 404 && outsiderRead.body?.ok === false,
    `Outsider packet read did not fail closed. HTTP ${outsiderRead.status}`,
  );

  const viewerRead = await requestJson(
    new URL(
      `/api/mobile/capture/transcripts/packet?callRoomId=${encodeURIComponent(room.id)}`,
      baseUrl,
    ),
    { headers: bearer(viewerToken) },
  );
  assert(
    viewerRead.status === 200 && viewerRead.body?.ok === true,
    `Project viewer could not read the disposable packet. HTTP ${viewerRead.status}`,
  );

  const reviewBody = {
    roomId: room.id,
    transcriptJobId: transcriptJob.id,
    recordingAssetId: recordingAsset.id,
    summaryNoteId: summary.id,
    packetBuildId,
    actionCandidateId,
    decision: "DEFER",
    note: "Explicitly authorized disposable dogfood decision; no real work was created.",
  };
  const viewerMutation = await requestJson(
    new URL("/api/mobile/capture/transcripts/packet/actions", baseUrl),
    {
      method: "POST",
      headers: { ...bearer(viewerToken), "content-type": "application/json" },
      body: JSON.stringify(reviewBody),
    },
  );
  assert(
    viewerMutation.status === 404 &&
      viewerMutation.body?.errorCode === "ROOM_ACCESS_DENIED",
    `Project viewer unexpectedly crossed the packet mutation boundary. HTTP ${viewerMutation.status}`,
  );

  const review = await requestJson(
    new URL("/api/mobile/capture/transcripts/packet/actions", baseUrl),
    {
      method: "POST",
      headers: {
        ...bearer(collaboratorToken),
        "content-type": "application/json",
      },
      body: JSON.stringify(reviewBody),
    },
  );
  assert(
    review.status === 200 &&
      review.body?.ok === true &&
      review.body?.actionItem === null &&
      review.body?.boundaries?.canonicalSessionAccess === true &&
      review.body?.boundaries?.canonicalSessionMutationAccess === true &&
      review.body?.boundaries?.sessionAccessRechecked === true,
    `Active project collaborator could not defer the disposable candidate. HTTP ${review.status}`,
  );

  const [storedSummary, actionCount] = await Promise.all([
    prisma.coachingNote.findUnique({ where: { id: summary.id } }),
    prisma.actionItem.count({ where: { roomId: room.id } }),
  ]);
  const storedSource = object(storedSummary?.sourceJson);
  const receipts = Array.isArray(storedSource.actionCandidateReviewReceipts)
    ? storedSource.actionCandidateReviewReceipts
    : [];
  assert(actionCount === 0, "DEFER unexpectedly materialized an ActionItem.");
  assert(
    receipts.length === 1 && object(receipts[0]).decision === "DEFER",
    "Disposable DEFER review receipt was not persisted.",
  );

  const noteRequest = {
    clientRequestId: randomUUID(),
    title: "Disposable collaborator Session note",
    body: "Generated fixture note used only to prove the Session mutation boundary.",
    kind: "SESSION_NOTE",
    visibility: "SESSION_SHARED",
  };
  const viewerNoteAttempt = await requestJson(
    new URL(`/api/sessions/${encodeURIComponent(room.id)}/notes`, baseUrl),
    {
      method: "POST",
      headers: { ...bearer(viewerToken), "content-type": "application/json" },
      body: JSON.stringify({
        ...noteRequest,
        clientRequestId: randomUUID(),
        title: "Viewer note attempt",
      }),
    },
  );
  assert(
    viewerNoteAttempt.status === 404 &&
      viewerNoteAttempt.body?.code === "NOT_FOUND",
    `Project viewer unexpectedly created Session note state. HTTP ${viewerNoteAttempt.status}`,
  );

  const editorNote = await requestJson(
    new URL(`/api/sessions/${encodeURIComponent(room.id)}/notes`, baseUrl),
    {
      method: "POST",
      headers: {
        ...bearer(collaboratorToken),
        "content-type": "application/json",
      },
      body: JSON.stringify(noteRequest),
    },
  );
  assert(
    editorNote.status === 200 &&
      editorNote.body?.ok === true &&
      editorNote.body?.boundaries?.canonicalSessionMutationAccess === true &&
      editorNote.body?.boundaries?.sessionAccessRechecked === true,
    `Project editor could not create the disposable Session note. HTTP ${editorNote.status}`,
  );
  const createdNoteId = String(editorNote.body.note?.id || "");
  const createdNoteUpdatedAt = String(editorNote.body.note?.updatedAt || "");
  assert(createdNoteId && createdNoteUpdatedAt, "Session note response omitted canonical identity or revision.");

  await prisma.studioProjectAccessGrant.update({
    where: {
      projectId_email: { projectId: project.id, email: collaboratorEmail },
    },
    data: { role: "VIEWER" },
  });
  const downgradedEdit = await requestJson(
    new URL(`/api/notes/${encodeURIComponent(createdNoteId)}`, baseUrl),
    {
      method: "PATCH",
      headers: {
        ...bearer(collaboratorToken),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Downgraded edit attempt",
        body: "This content must not replace the editor-authored fixture note.",
        expectedUpdatedAt: createdNoteUpdatedAt,
      }),
    },
  );
  assert(
    downgradedEdit.status === 404 && downgradedEdit.body?.code === "NOT_FOUND",
    `Downgraded project viewer unexpectedly edited Session note state. HTTP ${downgradedEdit.status}`,
  );
  const preservedNote = await prisma.coachingNote.findUnique({
    where: { id: createdNoteId },
    select: {
      title: true,
      body: true,
      _count: { select: { revisions: true } },
    },
  });
  assert(
    preservedNote?.title === noteRequest.title &&
      preservedNote?.body === noteRequest.body &&
      preservedNote?._count.revisions === 1,
    "Downgraded Session note edit changed content or appended a revision.",
  );
  const downgradedPacketRead = await requestJson(
    new URL(
      `/api/mobile/capture/transcripts/packet?callRoomId=${encodeURIComponent(room.id)}`,
      baseUrl,
    ),
    { headers: bearer(collaboratorToken) },
  );
  assert(
    downgradedPacketRead.status === 200 && downgradedPacketRead.body?.ok === true,
    `Downgraded project viewer lost intended Session read access. HTTP ${downgradedPacketRead.status}`,
  );
  const downgradedPacketMutation = await requestJson(
    new URL("/api/mobile/capture/transcripts/packet/actions", baseUrl),
    {
      method: "POST",
      headers: {
        ...bearer(collaboratorToken),
        "content-type": "application/json",
      },
      body: JSON.stringify(reviewBody),
    },
  );
  assert(
    downgradedPacketMutation.status === 404 &&
      downgradedPacketMutation.body?.errorCode === "ROOM_ACCESS_DENIED",
    `Downgraded project viewer unexpectedly reviewed packet state. HTTP ${downgradedPacketMutation.status}`,
  );

  await prisma.studioProjectAccessGrant.update({
    where: {
      projectId_email: { projectId: project.id, email: collaboratorEmail },
    },
    data: { status: "REVOKED" },
  });
  const revokedRead = await requestJson(
    new URL(
      `/api/mobile/capture/transcripts/packet?callRoomId=${encodeURIComponent(room.id)}`,
      baseUrl,
    ),
    { headers: bearer(collaboratorToken) },
  );
  assert(
    revokedRead.status === 404 && revokedRead.body?.ok === false,
    `Revoked collaborator packet read did not fail closed. HTTP ${revokedRead.status}`,
  );

  const [collaborator, outsider, viewer] = await Promise.all([
    prisma.user.findUnique({ where: { primaryEmail: collaboratorEmail } }),
    prisma.user.findUnique({ where: { primaryEmail: outsiderEmail } }),
    prisma.user.findUnique({ where: { primaryEmail: viewerEmail } }),
  ]);
  fixture.collaboratorUserId = collaborator?.id || "";
  fixture.outsiderUserId = outsider?.id || "";
  fixture.viewerUserId = viewer?.id || "";
  assert(
    fixture.collaboratorUserId,
    "Collaborator bearer identity was not persisted in Quipsly.",
  );
  assert(
    fixture.outsiderUserId,
    "Outsider bearer identity was not persisted in Quipsly.",
  );
  assert(
    fixture.viewerUserId,
    "Viewer bearer identity was not persisted in Quipsly.",
  );

  operation = {
    schema: "quipsly-local-session-collaboration-dogfood-v1",
    activeProjectGrantUsed: true,
    outsiderDenied: true,
    projectViewerReadAllowed: true,
    projectViewerMutationDenied: true,
    disposableDecision: "DEFER",
    actionItemsCreated: actionCount,
    reviewReceiptsPersisted: receipts.length,
    editorSessionNoteCreated: true,
    viewerSessionNoteCreateDenied: true,
    downgradedSessionNoteEditDenied: true,
    downgradedSessionNotePreserved: true,
    downgradedPacketReadAllowed: true,
    downgradedPacketMutationDenied: true,
    revokedGrantDeniedImmediately: true,
    canonicalSessionAccess: review.body.boundaries.canonicalSessionAccess,
    canonicalSessionMutationAccess:
      review.body.boundaries.canonicalSessionMutationAccess,
    transactionalAccessRecheck: review.body.boundaries.sessionAccessRechecked,
    sourceContent: "generated-fixture-only",
    externalSideEffects: false,
  };
} finally {
  cleanup = await cleanupFixture().catch((error) => ({
    ok: false,
    error: error instanceof Error ? error.message : "cleanup failed",
  }));
  await Promise.allSettled([
    auth.deleteUser(collaboratorUid),
    auth.deleteUser(outsiderUid),
    auth.deleteUser(viewerUid),
  ]);
  await deleteApp(firebaseApp);
  await prisma.$disconnect();
}

assert(
  cleanup?.ok === true,
  `Disposable database cleanup failed: ${cleanup?.error || "unknown"}`,
);
assert(operation, "Session collaboration operation did not complete.");
process.stdout.write(
  `${JSON.stringify({ ok: true, operation, cleanup }, null, 2)}\n`,
);

async function cleanupFixture() {
  if (fixture.uploadSessionId) {
    await prisma.mobileCaptureFinalizationReceipt.deleteMany({
      where: { uploadSessionId: fixture.uploadSessionId },
    });
  }
  if (fixture.roomId) {
    await prisma.callRoom.deleteMany({ where: { id: fixture.roomId } });
  }
  if (fixture.projectId) {
    await prisma.studioProject.deleteMany({ where: { id: fixture.projectId } });
  }
  if (fixture.workspaceId) {
    await prisma.studioWorkspace.deleteMany({
      where: { id: fixture.workspaceId },
    });
  }
  await prisma.user.deleteMany({
    where: {
      primaryEmail: {
        in: [ownerEmail, collaboratorEmail, outsiderEmail, viewerEmail],
      },
    },
  });

  const [rooms, projects, workspaces, users, receipts] = await Promise.all([
    prisma.callRoom.count({ where: { id: fixture.roomId } }),
    prisma.studioProject.count({ where: { id: fixture.projectId } }),
    prisma.studioWorkspace.count({ where: { id: fixture.workspaceId } }),
    prisma.user.count({
      where: {
        primaryEmail: {
          in: [ownerEmail, collaboratorEmail, outsiderEmail, viewerEmail],
        },
      },
    }),
    prisma.mobileCaptureFinalizationReceipt.count({
      where: { uploadSessionId: fixture.uploadSessionId },
    }),
  ]);
  return {
    ok: rooms + projects + workspaces + users + receipts === 0,
    remaining: { rooms, projects, workspaces, users, receipts },
  };
}

async function signInToEmulator(email, signInPassword) {
  const endpoint = new URL(
    `/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local-dogfood`,
    `http://${authEmulatorHost}`,
  );
  const result = await requestJson(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password: signInPassword,
      returnSecureToken: true,
    }),
  });
  assert(
    result.status === 200 && result.body?.idToken,
    `Firebase emulator sign-in failed for disposable identity. HTTP ${result.status}`,
  );
  return result.body.idToken;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

function bearer(token) {
  return { authorization: `Bearer ${token}` };
}

function buildTranscriptSnapshot(segment) {
  const textHash = sha256(segment.text);
  const segmentReviews = [
    {
      segmentId: segment.id,
      providerTextSha256: textHash,
      resolvedTextSha256: textHash,
      resolvedSpeakerLabel: segment.speakerLabel,
      acceptedReviewId: null,
      acceptedCorrectionId: null,
      reviewStatus: "provider",
      startSeconds: segment.startSeconds,
      endSeconds: segment.endSeconds,
    },
  ];
  return {
    schema: "quipsly-transcript-packet-snapshot-v1",
    sha256: sha256(JSON.stringify(segmentReviews)),
    segmentCount: 1,
    humanReviewedSegmentCount: 0,
    providerOnlySegmentCount: 1,
    segmentReviews,
  };
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function object(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : {};
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertLoopbackUrl(url, label) {
  assert(
    url.protocol === "http:" || url.protocol === "postgresql:",
    `${label} must use a local protocol.`,
  );
  assertLoopbackHost(url.hostname, label);
}

function assertLoopbackHost(host, label) {
  const hostname = String(host)
    .split(":")[0]
    .replace(/^\[|\]$/g, "")
    .toLowerCase();
  assert(
    hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1",
    `${label} must resolve to loopback.`,
  );
}
