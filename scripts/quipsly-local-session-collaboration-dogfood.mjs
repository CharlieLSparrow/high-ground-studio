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
import {
  assertNoHorizontalOverflow,
  clearRenderedSession,
  loadPlaywright,
  signInThroughRenderedLogin,
} from "./lib/retained-qa-browser.mjs";

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
  sourceId: `session-collaboration-source-${nonce}`,
  mediaAssetId: `session-collaboration-media-${nonce}`,
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
  const taskTag = await prisma.studioTag.create({
    data: {
      projectId: project.id,
      slug: `follow-through-${nonce}`,
      label: "Follow-through",
      description: "Disposable canonical tag for transcript-task dogfood.",
      isPrivate: true,
    },
  });
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
  await prisma.callRoomTagLink.create({
    data: {
      roomId: room.id,
      tagId: taskTag.id,
      createdByUserId: owner.id,
      sourceJson: {
        source: "quipsly-local-session-collaboration-dogfood",
        disposable: true,
      },
    },
  });
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
  const playbackUrl = `/api/ingest/media/${fixture.sourceId}`;
  await prisma.studioVideoSource.create({
    data: {
      id: fixture.sourceId,
      provider: "local-dogfood",
      providerSourceId: `session-collaboration/${nonce}/audio.wav`,
      url: playbackUrl,
      title: "Disposable coaching-session playback evidence",
    },
  });
  await prisma.studioMediaAsset.create({
    data: {
      id: fixture.mediaAssetId,
      filename: "session-collaboration-dogfood.wav",
      url: playbackUrl,
      mimeType: "audio/wav",
      sizeBytes: byteSize,
      duration: 18,
      cloudProvider: "local-dogfood",
      isGlobal: false,
    },
  });
  await prisma.studioAssetAttachment.create({
    data: {
      projectId: project.id,
      assetId: fixture.mediaAssetId,
      role: "spine-audio-candidate",
      source: "quipsly-local-session-collaboration-dogfood",
      createdByEmail: ownerEmail,
      metadataJson: {
        callRoomId: room.id,
        sourceId: fixture.sourceId,
        playbackUrl,
        fixture: true,
      },
    },
  });
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
        promotion: {
          status: "promoted-to-studio-media",
          mediaAssetId: fixture.mediaAssetId,
          sourceId: fixture.sourceId,
          playbackUrl,
          mediaKind: "audio",
          projectId: project.id,
          localOnly: true,
        },
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
      sourceId: fixture.sourceId,
      mediaAssetId: fixture.mediaAssetId,
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
        reviewLanes: [
          {
            id: "internal-summary",
            label: "Internal summary",
            status: "READY_FOR_HUMAN_REVIEW",
            itemCount: 1,
            meaning: "Disposable candidate material used to verify packet lane review.",
            sourceTruth: "Derived only from this generated transcript fixture.",
            reviewRule: "Human review is required before internal use.",
            humanApprovalRequired: true,
            externalSideEffects: false,
            items: [{ noteId: "self", segmentId: segment.id, text: transcriptText }],
          },
          {
            id: "empty-goals",
            label: "Goals",
            status: "EMPTY",
            itemCount: 0,
            meaning: "No goal candidates were derived from this fixture.",
            sourceTruth: "No source-linked goal candidate exists.",
            reviewRule: "Empty categories have no decision controls.",
            humanApprovalRequired: true,
            externalSideEffects: false,
            items: [],
          },
        ],
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
  const taskMaterialization = object(viewerRead.body?.packet?.taskMaterialization);
  const materializationProject = object(taskMaterialization.project);
  const materializationTags = Array.isArray(taskMaterialization.tags)
    ? taskMaterialization.tags.map(object)
    : [];
  assert(
    materializationProject.id === project.id &&
      materializationProject.name === project.name &&
      taskMaterialization.defaultOwner === "ACTOR" &&
      materializationTags.length === 1 &&
      materializationTags[0]?.id === taskTag.id &&
      materializationTags[0]?.selectedForSession === true,
    "Packet read did not expose the exact Session project, canonical tag vocabulary, and actor-owned default for review.",
  );
  const packetNoteCandidates = Array.isArray(viewerRead.body?.packet?.noteCandidates)
    ? viewerRead.body.packet.noteCandidates.map(object)
    : [];
  const packetNoteCandidate = packetNoteCandidates.find(
    (candidate) => candidate.segmentId === segment.id && candidate.laneId === "internal-summary",
  );
  assert(
    packetNoteCandidate?.id &&
      packetNoteCandidate.clientRequestId === packetNoteCandidate.id &&
      packetNoteCandidate.roomId === room.id &&
      packetNoteCandidate.transcriptJobId === transcriptJob.id &&
      packetNoteCandidate.recordingAssetId === recordingAsset.id &&
      packetNoteCandidate.summaryNoteId === summary.id &&
      packetNoteCandidate.packetBuildId === packetBuildId &&
      packetNoteCandidate.providerTextSha256 === sha256(transcriptText) &&
      packetNoteCandidate.humanApprovalRequired === true &&
      packetNoteCandidate.committedNoteId === null,
    "Packet read did not project an uncommitted note candidate with exact transcript, packet, lane, and recording identity.",
  );

  const laneReviewBody = {
    roomId: room.id,
    transcriptJobId: transcriptJob.id,
    summaryNoteId: summary.id,
    status: "APPROVED_FOR_INTERNAL_USE",
    note: "Disposable route acceptance only; no canonical work or delivery was created.",
  };
  const viewerLaneMutation = await requestJson(
    new URL("/api/mobile/capture/transcripts/packet", baseUrl),
    {
      method: "PATCH",
      headers: { ...bearer(viewerToken), "content-type": "application/json" },
      body: JSON.stringify({ ...laneReviewBody, laneId: "internal-summary" }),
    },
  );
  assert(
    viewerLaneMutation.status === 404 && viewerLaneMutation.body?.ok === false,
    `Project viewer unexpectedly reviewed a packet lane. HTTP ${viewerLaneMutation.status}`,
  );

  const emptyLaneMutation = await requestJson(
    new URL("/api/mobile/capture/transcripts/packet", baseUrl),
    {
      method: "PATCH",
      headers: {
        ...bearer(collaboratorToken),
        "content-type": "application/json",
      },
      body: JSON.stringify({ ...laneReviewBody, laneId: "empty-goals" }),
    },
  );
  assert(
    emptyLaneMutation.status === 409 &&
      emptyLaneMutation.body?.errorCode === "PACKET_REVIEW_LANE_EMPTY",
    `Empty packet lane did not fail closed. HTTP ${emptyLaneMutation.status}`,
  );

  const laneReview = await requestJson(
    new URL("/api/mobile/capture/transcripts/packet", baseUrl),
    {
      method: "PATCH",
      headers: {
        ...bearer(collaboratorToken),
        "content-type": "application/json",
      },
      body: JSON.stringify({ ...laneReviewBody, laneId: "internal-summary" }),
    },
  );
  assert(
    laneReview.status === 200 &&
      laneReview.body?.ok === true &&
      laneReview.body?.reviewLaneStatus === "APPROVED_FOR_INTERNAL_USE" &&
      laneReview.body?.reviewLane?.humanReview?.externalSideEffects === false &&
      laneReview.body?.boundaries?.noExternalMutation === true &&
      laneReview.body?.boundaries?.noClientDelivery === true &&
      laneReview.body?.boundaries?.noPublicationClaim === true,
    `Active project collaborator could not review the disposable packet lane. HTTP ${laneReview.status}`,
  );

  const reviewBody = {
    roomId: room.id,
    transcriptJobId: transcriptJob.id,
    recordingAssetId: recordingAsset.id,
    summaryNoteId: summary.id,
    packetBuildId,
    actionCandidateId,
    decision: "ACCEPT",
    title: "Send the reviewed episode outline",
    detail: "A disposable accepted task used to verify transcript evidence, ownership, due-date, and taxonomy continuity.",
    assignToMe: true,
    dueAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    tagIds: [taskTag.id],
    note: "Explicitly authorized disposable dogfood acceptance; no real client or episode work is represented.",
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
      review.body?.actionItem?.assignedUserId &&
      review.body?.actionItem?.dueAt === reviewBody.dueAt &&
      review.body?.actionItem?.projectId === project.id &&
      Array.isArray(review.body?.actionItem?.tagIds) &&
      review.body.actionItem.tagIds.length === 1 &&
      review.body.actionItem.tagIds[0] === taskTag.id &&
      review.body?.actionItem?.source?.schema === "quipsly-transcript-derived-task-v1" &&
      review.body?.actionItem?.source?.segmentId === segment.id &&
      review.body?.actionItem?.source?.playbackSourceId === fixture.sourceId &&
      review.body?.boundaries?.assignedToActor === true &&
      review.body?.boundaries?.dueDateCreated === true &&
      review.body?.boundaries?.projectTagsApplied === true &&
      review.body?.boundaries?.canonicalSessionAccess === true &&
      review.body?.boundaries?.canonicalSessionMutationAccess === true &&
      review.body?.boundaries?.sessionAccessRechecked === true,
    `Active project collaborator could not accept the disposable candidate as source-linked work. HTTP ${review.status}`,
  );
  const exactReplay = await requestJson(
    new URL("/api/mobile/capture/transcripts/packet/actions", baseUrl),
    {
      method: "POST",
      headers: { ...bearer(collaboratorToken), "content-type": "application/json" },
      body: JSON.stringify(reviewBody),
    },
  );
  assert(
    exactReplay.status === 200 &&
      exactReplay.body?.idempotentReplay === true &&
      exactReplay.body?.actionItem?.id === review.body.actionItem.id,
    "Exact candidate materialization replay did not recover the same canonical task.",
  );
  const changedIntent = await requestJson(
    new URL("/api/mobile/capture/transcripts/packet/actions", baseUrl),
    {
      method: "POST",
      headers: { ...bearer(collaboratorToken), "content-type": "application/json" },
      body: JSON.stringify({ ...reviewBody, assignToMe: false }),
    },
  );
  assert(
    changedIntent.status === 409 &&
      changedIntent.body?.errorCode === "ACTION_CANDIDATE_IDEMPOTENCY_CONFLICT",
    "Changed owner intent unexpectedly rewrote an already accepted candidate.",
  );

  const [storedSummary, storedActionItems] = await Promise.all([
    prisma.coachingNote.findUnique({ where: { id: summary.id } }),
    prisma.actionItem.findMany({
      where: { roomId: room.id },
      include: { tagLinks: { include: { tag: true } } },
    }),
  ]);
  const actionCount = storedActionItems.length;
  const storedSource = object(storedSummary?.sourceJson);
  const receipts = Array.isArray(storedSource.actionCandidateReviewReceipts)
    ? storedSource.actionCandidateReviewReceipts
    : [];
  const storedReviewLanes = Array.isArray(storedSource.reviewLanes)
    ? storedSource.reviewLanes
    : [];
  const storedReviewedLane = storedReviewLanes.find(
    (lane) => object(lane).id === "internal-summary",
  );
  const storedEmptyLane = storedReviewLanes.find(
    (lane) => object(lane).id === "empty-goals",
  );
  assert(
    actionCount === 1 &&
      storedActionItems[0]?.assignedUserId === review.body.actionItem.assignedUserId &&
      storedActionItems[0]?.dueAt?.toISOString() === reviewBody.dueAt &&
      storedActionItems[0]?.tagLinks?.[0]?.tag?.id === taskTag.id &&
      object(storedActionItems[0]?.sourceJson).playbackSourceId === fixture.sourceId,
    "ACCEPT did not persist exactly one owned, dated, tagged ActionItem with its playback anchor.",
  );
  assert(
    receipts.length === 1 &&
      object(receipts[0]).decision === "ACCEPT" &&
      object(object(receipts[0]).materializationIntent).assignedUserId === "ACTOR" &&
      object(receipts[0]).assignmentClaimed === true,
    "Disposable ACCEPT review receipt did not preserve the exact materialization intent.",
  );
  const renderedTask = await inspectRenderedAcceptedTask({
    roomId: room.id,
    email: collaboratorEmail,
    password,
    title: reviewBody.title,
    tagLabel: taskTag.label,
  });
  assert(
    object(storedReviewedLane).status === "APPROVED_FOR_INTERNAL_USE" &&
      object(object(storedReviewedLane).humanReview).externalSideEffects === false,
    "Disposable packet lane review receipt was not persisted without side effects.",
  );
  assert(
    object(storedEmptyLane).status === "EMPTY" &&
      !object(storedEmptyLane).humanReview,
    "Rejected empty-lane review unexpectedly changed saved packet state.",
  );

  const transcriptNoteRequest = {
    roomId: room.id,
    segmentId: segment.id,
    clientRequestId: packetNoteCandidate.clientRequestId,
    expectedProviderTextSha256: packetNoteCandidate.providerTextSha256,
    title: "Next-session episode outline decision",
    body: "Before our next coaching Session, draft the revised episode outline and bring it back for review.",
    kind: "DECISION",
    visibility: "CLIENT_SAFE",
    transcriptJobId: packetNoteCandidate.transcriptJobId,
    recordingAssetId: packetNoteCandidate.recordingAssetId,
    summaryNoteId: packetNoteCandidate.summaryNoteId,
    packetBuildId: packetNoteCandidate.packetBuildId,
    packetNoteCandidateId: packetNoteCandidate.id,
    packetLaneId: packetNoteCandidate.laneId,
    surface: "local-session-collaboration-dogfood",
  };
  const viewerTranscriptNoteAttempt = await requestJson(
    new URL("/api/mobile/capture/transcripts/notes", baseUrl),
    {
      method: "POST",
      headers: { ...bearer(viewerToken), "content-type": "application/json" },
      body: JSON.stringify(transcriptNoteRequest),
    },
  );
  assert(
    viewerTranscriptNoteAttempt.status === 404 &&
      viewerTranscriptNoteAttempt.body?.code === "SESSION_MUTATION_ACCESS_REQUIRED",
    `Project viewer unexpectedly created a transcript-linked note. HTTP ${viewerTranscriptNoteAttempt.status}`,
  );

  const transcriptNote = await requestJson(
    new URL("/api/mobile/capture/transcripts/notes", baseUrl),
    {
      method: "POST",
      headers: { ...bearer(collaboratorToken), "content-type": "application/json" },
      body: JSON.stringify(transcriptNoteRequest),
    },
  );
  assert(
    transcriptNote.status === 200 &&
      transcriptNote.body?.ok === true &&
      transcriptNote.body?.idempotentReplay === false &&
      transcriptNote.body?.note?.sourceAnchor?.segmentId === segment.id &&
      transcriptNote.body?.note?.sourceAnchor?.providerTextSha256 === sha256(transcriptText) &&
      transcriptNote.body?.boundaries?.sourceAnchorPreserved === true &&
      transcriptNote.body?.boundaries?.packetCandidateReviewed === true &&
      transcriptNote.body?.boundaries?.packetSnapshotRechecked === true &&
      transcriptNote.body?.boundaries?.taskCreated === false &&
      transcriptNote.body?.boundaries?.goalCreated === false &&
      transcriptNote.body?.boundaries?.calendarMutated === false &&
      transcriptNote.body?.boundaries?.messageSent === false,
    `Project editor could not create an exact transcript-linked note. HTTP ${transcriptNote.status}`,
  );
  const transcriptNoteId = String(transcriptNote.body.note?.id || "");
  const transcriptNoteUpdatedAt = String(transcriptNote.body.note?.updatedAt || "");
  assert(
    transcriptNoteId && transcriptNoteUpdatedAt,
    "Transcript-linked note response omitted canonical identity or revision time.",
  );

  const transcriptNoteReplay = await requestJson(
    new URL("/api/mobile/capture/transcripts/notes", baseUrl),
    {
      method: "POST",
      headers: { ...bearer(collaboratorToken), "content-type": "application/json" },
      body: JSON.stringify(transcriptNoteRequest),
    },
  );
  assert(
    transcriptNoteReplay.status === 200 &&
      transcriptNoteReplay.body?.idempotentReplay === true &&
      transcriptNoteReplay.body?.note?.id === transcriptNoteId &&
      transcriptNoteReplay.body?.note?.revisionCount === 1,
    "Transcript-linked note replay duplicated or changed canonical state.",
  );

  const transcriptNoteChangedIntent = await requestJson(
    new URL("/api/mobile/capture/transcripts/notes", baseUrl),
    {
      method: "POST",
      headers: { ...bearer(collaboratorToken), "content-type": "application/json" },
      body: JSON.stringify({
        ...transcriptNoteRequest,
        visibility: "AUTHOR_PRIVATE",
      }),
    },
  );
  assert(
    transcriptNoteChangedIntent.status === 409 &&
      transcriptNoteChangedIntent.body?.code === "IDEMPOTENCY_CONFLICT",
    "Changed note intent unexpectedly rewrote an already materialized packet candidate.",
  );

  const packetAfterNote = await requestJson(
    new URL(
      `/api/mobile/capture/transcripts/packet?callRoomId=${encodeURIComponent(room.id)}`,
      baseUrl,
    ),
    { headers: bearer(collaboratorToken) },
  );
  const committedPacketNoteCandidate = Array.isArray(packetAfterNote.body?.packet?.noteCandidates)
    ? packetAfterNote.body.packet.noteCandidates
        .map(object)
        .find((candidate) => candidate.id === packetNoteCandidate.id)
    : null;
  assert(
    packetAfterNote.status === 200 &&
      committedPacketNoteCandidate?.committedNoteId === transcriptNoteId &&
      committedPacketNoteCandidate?.humanApprovalRequired === false,
    "Packet refresh did not project the canonical note identity back onto the reviewed candidate.",
  );

  const viewerSessionProjection = await requestJson(
    new URL("/api/mobile/capture/sessions", baseUrl),
    { headers: bearer(viewerToken) },
  );
  const projectedViewerSession = Array.isArray(viewerSessionProjection.body?.sessions)
    ? viewerSessionProjection.body.sessions.find((candidate) => candidate?.id === room.id)
    : null;
  const projectedTranscriptNote = Array.isArray(projectedViewerSession?.sessionNotes)
    ? projectedViewerSession.sessionNotes.find((candidate) => candidate?.id === transcriptNoteId)
    : null;
  assert(
    viewerSessionProjection.status === 200 &&
      projectedTranscriptNote?.visibility === "CLIENT_SAFE" &&
      projectedTranscriptNote?.sourceAnchor?.segmentId === segment.id,
    "The iPhone Session projection did not expose the client-safe note and its playback anchor to a project viewer.",
  );

  const transcriptNoteEditRequestId = randomUUID();
  const transcriptNoteEdit = await requestJson(
    new URL(`/api/notes/${encodeURIComponent(transcriptNoteId)}`, baseUrl),
    {
      method: "PATCH",
      headers: { ...bearer(collaboratorToken), "content-type": "application/json" },
      body: JSON.stringify({
        title: "Revised next-session episode outline decision",
        body: "Before our next coaching Session, draft the revised episode outline, tag open questions, and bring it back for review.",
        kind: "DECISION",
        visibility: "AUTHOR_PRIVATE",
        tagIds: [],
        expectedUpdatedAt: transcriptNoteUpdatedAt,
        clientRequestId: transcriptNoteEditRequestId,
      }),
    },
  );
  assert(
    transcriptNoteEdit.status === 200 &&
      transcriptNoteEdit.body?.ok === true &&
      transcriptNoteEdit.body?.note?.revisionCount === 2 &&
      transcriptNoteEdit.body?.note?.visibility === "AUTHOR_PRIVATE" &&
      transcriptNoteEdit.body?.boundaries?.appendOnlyRevision === true,
    `Project editor could not revise the transcript-linked note. HTTP ${transcriptNoteEdit.status}`,
  );
  const storedTranscriptNote = await prisma.coachingNote.findUnique({
    where: { id: transcriptNoteId },
    include: { revisions: { orderBy: { revision: "asc" } } },
  });
  assert(
    storedTranscriptNote?.revisions.length === 2 &&
      object(storedTranscriptNote.sourceJson).schema === "quipsly-transcript-derived-note-v1" &&
      object(storedTranscriptNote.sourceJson).segmentId === segment.id &&
      object(storedTranscriptNote.revisions[0]?.snapshotJson).sourceJson !== undefined,
    "Canonical note revision did not preserve the immutable transcript source anchor.",
  );

  const viewerPrivateProjection = await requestJson(
    new URL("/api/mobile/capture/sessions", baseUrl),
    { headers: bearer(viewerToken) },
  );
  const projectedPrivateSession = Array.isArray(viewerPrivateProjection.body?.sessions)
    ? viewerPrivateProjection.body.sessions.find((candidate) => candidate?.id === room.id)
    : null;
  assert(
    Array.isArray(projectedPrivateSession?.sessionNotes) &&
      !projectedPrivateSession.sessionNotes.some((candidate) => candidate?.id === transcriptNoteId),
    "Changing a transcript-linked note to author-private did not remove it from the viewer projection.",
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
    projectViewerLaneReviewDenied: true,
    emptyLaneReviewDenied: true,
    actionableLaneReviewPersisted: true,
    laneReviewExternalSideEffects: false,
    disposableDecision: "ACCEPT",
    actionItemsCreated: actionCount,
    acceptedTaskAssignedToActor: true,
    acceptedTaskDueDatePersisted: true,
    acceptedTaskTagPersisted: true,
    acceptedTaskPlaybackAnchorProjected: true,
    acceptedTaskExactReplayRecovered: true,
    acceptedTaskChangedIntentRejected: true,
    packetTaskProjectRead: true,
    packetTaskActiveTagsRead: true,
    packetTaskSessionTagsSelectedByDefault: true,
    acceptedTaskRenderedInSession: renderedTask.session,
    acceptedTaskRenderedInWork: renderedTask.work,
    acceptedTaskPhoneWidthNoOverflow: renderedTask.phoneWidthNoOverflow,
    reviewReceiptsPersisted: receipts.length,
    editorSessionNoteCreated: true,
    editorTranscriptNoteCreated: true,
    packetNoteCandidateProjected: true,
    packetNoteCandidateMaterialized: true,
    packetNoteCandidateSnapshotRechecked: true,
    packetNoteCandidateProjectedCommittedIdentity: true,
    transcriptNoteReplayIdempotent: true,
    transcriptNoteChangedIntentRejected: true,
    transcriptNotePlaybackAnchorProjected: true,
    transcriptNoteRevisionPreservedSource: true,
    transcriptNoteAudienceChangeEnforced: true,
    viewerSessionNoteCreateDenied: true,
    viewerTranscriptNoteCreateDenied: true,
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

async function inspectRenderedAcceptedTask(input) {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    colorScheme: "light",
    locale: "en-US",
    timezoneId: "America/Denver",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const identity = { role: "session-collaboration-editor", email: input.email };
  try {
    await signInThroughRenderedLogin({
      page,
      baseURL: baseUrl.origin,
      identity,
      password: input.password,
      callbackPath: `/sessions/${input.roomId}?mode=transcript`,
    });
    const main = page.getByRole("main").last();
    await page.getByRole("heading", { name: "Decide candidate by candidate", exact: true }).waitFor({ timeout: 20_000 });
    const sessionText = await main.innerText();
    assert(sessionText.includes(input.title), "Rendered Session review lost the accepted task title.");
    assert(sessionText.includes("Committed as canonical Quipsly work"), "Rendered Session review did not distinguish committed work from a candidate.");
    await assertNoHorizontalOverflow(main, "desktop accepted transcript task");

    await page.getByRole("link", { name: "Open task", exact: true }).click();
    await page.waitForURL((url) => url.origin === baseUrl.origin && url.pathname === "/work");
    await page.getByRole("heading", { name: "Work Queue", exact: true }).waitFor({ timeout: 20_000 });
    const workText = await page.getByRole("main").last().innerText();
    assert(workText.includes(input.title), "Rendered Work Queue lost the accepted transcript task.");
    assert(workText.includes(input.tagLabel), "Rendered Work Queue lost the selected canonical tag.");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseUrl.origin}/sessions/${input.roomId}?mode=transcript`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Decide candidate by candidate", exact: true }).waitFor({ timeout: 20_000 });
    await assertNoHorizontalOverflow(page.getByRole("main").last(), "phone-width accepted transcript task");
    assert(pageErrors.length === 0, `Rendered accepted task raised client errors: ${pageErrors.join(" | ")}`);
    await clearRenderedSession(page, baseUrl.origin, identity.role);
    return { session: true, work: true, phoneWidthNoOverflow: true };
  } finally {
    await context.close();
    await browser.close();
  }
}

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
  if (fixture.mediaAssetId) {
    await prisma.studioMediaAsset.deleteMany({ where: { id: fixture.mediaAssetId } });
  }
  if (fixture.sourceId) {
    await prisma.studioVideoSource.deleteMany({ where: { id: fixture.sourceId } });
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

  const [rooms, projects, workspaces, users, receipts, mediaAssets, sources, actions, tags, actionTagLinks, roomTagLinks] = await Promise.all([
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
    prisma.studioMediaAsset.count({ where: { id: fixture.mediaAssetId } }),
    prisma.studioVideoSource.count({ where: { id: fixture.sourceId } }),
    prisma.actionItem.count({ where: { roomId: fixture.roomId } }),
    prisma.studioTag.count({ where: { projectId: fixture.projectId } }),
    prisma.actionItemTagLink.count({ where: { actionItem: { roomId: fixture.roomId } } }),
    prisma.callRoomTagLink.count({ where: { roomId: fixture.roomId } }),
  ]);
  const remainingCount = rooms + projects + workspaces + users + receipts + mediaAssets + sources + actions + tags + actionTagLinks + roomTagLinks;
  return {
    ok: remainingCount === 0,
    remaining: { rooms, projects, workspaces, users, receipts, mediaAssets, sources, actions, tags, actionTagLinks, roomTagLinks },
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
