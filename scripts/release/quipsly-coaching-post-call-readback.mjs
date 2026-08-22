#!/usr/bin/env node

import { createHash } from "node:crypto";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const requireFromQuipsly = createRequire(new URL("../../apps/quipsly/package.json", import.meta.url));
const { PrismaClient } = requireFromQuipsly("@prisma/client");
const { PrismaPg } = requireFromQuipsly("@prisma/adapter-pg");

function fail(message) {
  throw new Error(message);
}

function hash(value) {
  return value ? createHash("sha256").update(String(value).trim().toLowerCase()).digest("hex") : null;
}

function iso(value) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function latestBy(rows, key) {
  const result = new Map();
  for (const row of rows) {
    const value = key(row);
    if (value && !result.has(value)) result.set(value, row);
  }
  return [...result.values()];
}

function recordingWindow(asset) {
  const startedAt = asset?.recordedStartedAt ? new Date(asset.recordedStartedAt).getTime() : Number.NaN;
  const stoppedAt = asset?.recordedStoppedAt ? new Date(asset.recordedStoppedAt).getTime() : Number.NaN;
  if (!Number.isFinite(startedAt) || !Number.isFinite(stoppedAt) || stoppedAt <= startedAt) return null;
  return { startedAt, stoppedAt, durationSeconds: (stoppedAt - startedAt) / 1_000 };
}

function transcriptTiming(job, asset) {
  const segments = Array.isArray(job?.segments) ? job.segments : [];
  const declaredDuration = Number(asset?.durationSeconds);
  const measuredWindow = recordingWindow(asset);
  const assetDuration = Number.isFinite(declaredDuration) && declaredDuration > 0
    ? declaredDuration
    : measuredWindow?.durationSeconds;
  const sourceMatches = Boolean(job?.sourceSha256 && asset?.checksum)
    && String(job.sourceSha256).toLowerCase() === String(asset.checksum).toLowerCase();
  let previousStart = -1;
  const spansAreValid = segments.length > 0 && segments.every((segment) => {
    const start = Number(segment.startSeconds);
    const end = Number(segment.endSeconds);
    const valid = Number.isFinite(start)
      && Number.isFinite(end)
      && start >= 0
      && end > start
      && start >= previousStart;
    previousStart = start;
    return valid;
  });
  const firstStartSeconds = spansAreValid ? Number(segments[0].startSeconds) : null;
  const lastEndSeconds = spansAreValid ? Math.max(...segments.map((segment) => Number(segment.endSeconds))) : null;
  const toleranceSeconds = Number.isFinite(assetDuration) && assetDuration > 0
    ? Math.max(2, assetDuration * 0.02)
    : 0;
  const insideSource = spansAreValid
    && Number.isFinite(assetDuration)
    && assetDuration > 0
    && lastEndSeconds <= assetDuration + toleranceSeconds;
  return {
    sourceMatches,
    spansAreValid,
    insideSource,
    firstStartSeconds,
    lastEndSeconds,
    sourceDurationSeconds: Number.isFinite(assetDuration) && assetDuration > 0 ? assetDuration : null,
    sourceDurationAuthority: Number.isFinite(declaredDuration) && declaredDuration > 0 ? "asset-duration" : measuredWindow ? "recording-window" : null,
    toleranceSeconds,
    passed: sourceMatches && spansAreValid && insideSource,
  };
}

export function parseArguments(argv) {
  const options = { roomId: "", outputPath: "", databaseUrl: process.env.DATABASE_URL || "" };
  const valueAfter = (index, flag) => {
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) fail(`${flag} requires a value.`);
    return value;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case "--": break;
      case "--room-id": options.roomId = valueAfter(index, argument); index += 1; break;
      case "--output": options.outputPath = valueAfter(index, argument); index += 1; break;
      case "--help":
      case "-h": options.help = true; break;
      default: fail(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

function usage() {
  return `Usage:
  QUIPSLY_PRODUCTION_POST_CALL_READBACK=1 DATABASE_URL=postgresql://... \\
    node scripts/release/quipsly-coaching-post-call-readback.mjs \\
      --room-id <canonical-room-id> --output <private-receipt.json>

The command opens a read-only PostgreSQL transaction, reads one exact Session,
redacts user identities, and writes a mode-0600 receipt. It never mutates the
Session and never claims that people heard one another or completed the journey
without help; those observations belong in the human-flight record.
`;
}

export function summarizePostCallEvidence(room, finalizationReceipts, auditedAt = new Date().toISOString()) {
  if (!room?.id) fail("Canonical Session room evidence is required.");
  const activeParticipants = room.participants.filter((row) => row.accessStatus === "ACTIVE" && row.userId);
  const participantUserIds = unique(activeParticipants.map((row) => row.userId));
  const latestConsents = latestBy(room.recordingConsents, (row) => row.userId || row.participantId);
  const latestPreflights = latestBy(room.participantPreflightReceipts, (row) => row.participantId);
  const latestQueues = latestBy(room.endpointQueueReceipts, (row) => `${row.participantId}:${row.clientInstanceId}`);
  const stateReceiptsApplied = room.stateReceipts.filter((row) => row.stateApplied && row.outcome === "APPLIED");
  const verifiedLocalAssets = room.recordingAssets.filter((row) =>
    ["LOCAL_AUDIO", "LOCAL_VIDEO"].includes(String(row.kind))
      && row.status === "VERIFIED"
      && row.checksum
      && row.byteSize != null
      && row.storageBucket
      && row.storageObjectPath
      && row.verifiedAt,
  );
  const localSourceParticipantIds = unique(verifiedLocalAssets.map((row) => row.participantId));
  const stoppedActors = unique(stateReceiptsApplied.filter((row) => row.action === "STOP_RECORDING").map((row) => row.actorUserId));
  const startedActors = unique(stateReceiptsApplied.filter((row) => row.action === "START_RECORDING").map((row) => row.actorUserId));
  const recordingCoordinatorUserIds = unique(activeParticipants
    .filter((row) => ["COACH", "HOST"].includes(String(row.role)))
    .map((row) => row.userId));
  const acceptedInvitations = room.invitations.filter((row) => row.status === "ACCEPTED" && row.acceptedAt && row.acceptedByUserId);
  const sentDeliveries = room.invitations.flatMap((row) => row.deliveries).filter((row) => row.status === "SENT" && row.completedAt);
  const currentConsentByUser = new Map(latestConsents.map((row) => [row.userId, row]));
  const consentReady = participantUserIds.length >= 2 && participantUserIds.every((userId) => {
    const consent = currentConsentByUser.get(userId);
    return consent?.status === "GRANTED"
      && consent.canRecordAudio === true
      && consent.canTranscribe === true
      && consent.consentedAt
      && !consent.revokedAt;
  });
  const participantIds = unique(activeParticipants.map((row) => row.id));
  const requiredSources = room.expectedSources.filter((row) => row.status === "ACTIVE" && row.retentionRole === "REQUIRED_MASTER");
  const requiredSourcesSatisfied = requiredSources.length >= 2
    && requiredSources.every((row) => row.recordingAssetId && verifiedLocalAssets.some((asset) => asset.id === row.recordingAssetId));
  const requiredAssetIds = new Set(requiredSources.map((row) => row.recordingAssetId).filter(Boolean));
  const requiredVerifiedAssets = verifiedLocalAssets.filter((asset) => requiredAssetIds.has(asset.id));
  const requiredRecordingWindows = requiredVerifiedAssets.map(recordingWindow).filter(Boolean);
  const sourceOverlapSeconds = requiredRecordingWindows.length === requiredVerifiedAssets.length && requiredRecordingWindows.length >= 2
    ? Math.max(0, (Math.min(...requiredRecordingWindows.map((row) => row.stoppedAt)) - Math.max(...requiredRecordingWindows.map((row) => row.startedAt))) / 1_000)
    : 0;
  const verifiedAssembledPlaybacks = (room.sessionOutputs || []).flatMap((output) => {
    if (output.kind !== "RECORDING_SHARE" || !["DRAFT", "RELEASED"].includes(String(output.status))) return [];
    const render = object(object(output.bodyJson).render);
    const sourceManifest = object(output.sourceManifestJson);
    const declaredSourceIds = unique((Array.isArray(sourceManifest.sources) ? sourceManifest.sources : [])
      .map((source) => object(source).recordingAssetId));
    const assembledAsset = room.recordingAssets.find((asset) => asset.id === render.recordingAssetId);
    const shareReceipt = object(object(assembledAsset?.localManifestJson).sessionRecordingShare);
    const receiptSourceIds = unique(Array.isArray(shareReceipt.sourceRecordingAssetIds) ? shareReceipt.sourceRecordingAssetIds : []);
    const requiredSourcesIncluded = requiredAssetIds.size >= 2
      && [...requiredAssetIds].every((id) => declaredSourceIds.includes(id) && receiptSourceIds.includes(id));
    const completeAssetReceipt = Boolean(assembledAsset
      && assembledAsset.kind === "SERVER_MIX"
      && assembledAsset.status === "VERIFIED"
      && assembledAsset.checksum
      && assembledAsset.byteSize != null
      && Number(assembledAsset.durationSeconds) > 0
      && assembledAsset.storageBucket
      && assembledAsset.storageObjectPath
      && assembledAsset.verifiedAt);
    const exactOutputBinding = Boolean(assembledAsset
      && render.status === "VERIFIED"
      && shareReceipt.outputId === output.id
      && Number(shareReceipt.sourceOutputRevision) <= Number(output.revision)
      && shareReceipt.originalsRemainImmutable === true);
    if (!requiredSourcesIncluded || !completeAssetReceipt || !exactOutputBinding) return [];
    return [{ output, assembledAsset, declaredSourceIds }];
  });
  const completedTranscriptByAssetId = new Map();
  for (const job of room.transcriptJobs || []) {
    if (job.assetId
      && !completedTranscriptByAssetId.has(job.assetId)
      && job.status === "COMPLETED"
      && job.completedAt
      && (job._count?.segments || 0) > 0) {
      completedTranscriptByAssetId.set(job.assetId, job);
    }
  }
  const transcribedParticipantIds = unique(verifiedLocalAssets
    .filter((asset) => completedTranscriptByAssetId.has(asset.id))
    .map((asset) => asset.participantId));
  const timedTranscriptByAssetId = new Map(verifiedLocalAssets.map((asset) => {
    const job = completedTranscriptByAssetId.get(asset.id);
    return [asset.id, job ? transcriptTiming(job, asset) : null];
  }));
  const timedTranscriptParticipantIds = unique(verifiedLocalAssets
    .filter((asset) => timedTranscriptByAssetId.get(asset.id)?.passed)
    .map((asset) => asset.participantId));
  const finalizedParticipants = unique(finalizationReceipts
    .filter((row) => row.recordingAssetId && row.processingDisposition !== "HELD")
    .map((row) => room.participants.find((participant) => participant.userId === row.actorUserId)?.id));

  const gates = {
    sessionLifecycleEnded: room.status === "ENDED" && Boolean(room.openedAt && room.recordingStartedAt && room.endedAt),
    canonicalTwoAccountRoom: participantUserIds.length >= 2
      && activeParticipants.some((row) => row.role === "COACH")
      && activeParticipants.some((row) => ["CLIENT", "GUEST"].includes(String(row.role))),
    acceptedPrivateInvitation: acceptedInvitations.length >= 1,
    invitationHandoffCompleted: acceptedInvitations.length >= 1
      && (sentDeliveries.length >= 1 || acceptedInvitations.some((row) => row.acceptedByUserId)),
    currentConsentForEveryAccount: consentReady,
    endpointReadinessForEveryParticipant: participantIds.length >= 2
      && participantIds.every((id) => latestPreflights.some((row) => row.participantId === id && row.status === "READY")),
    providerGrantForEveryParticipant: participantIds.length >= 2
      && participantIds.every((id) => room.participantProviderGrants.some((row) => row.participantId === id)),
    coachCoordinatedRecordingStartAndStop: recordingCoordinatorUserIds.length >= 1
      && recordingCoordinatorUserIds.some((id) => startedActors.includes(id) && stoppedActors.includes(id)),
    verifiedLocalSourceForEveryParticipant: participantIds.length >= 2
      && participantIds.every((id) => localSourceParticipantIds.includes(id)),
    requiredSourcePlanSatisfied: requiredSourcesSatisfied,
    coherentRequiredSourceOverlap: requiredSourcesSatisfied && sourceOverlapSeconds >= 2,
    finalizationForEveryParticipant: participantIds.length >= 2
      && participantIds.every((id) => finalizedParticipants.includes(id)),
    completedTranscriptForEveryParticipant: participantIds.length >= 2
      && participantIds.every((id) => transcribedParticipantIds.includes(id)),
    sourceBoundTimedTranscriptForEveryParticipant: participantIds.length >= 2
      && participantIds.every((id) => timedTranscriptParticipantIds.includes(id)),
    verifiedPrivateAssembledPlaybackAvailable: verifiedAssembledPlaybacks.length >= 1,
    endpointQueuesDrained: latestQueues.length >= 2
      && latestQueues.every((row) => row.queueState === "DRAINED" && row.pendingSourceCount === 0 && row.failedSourceCount === 0),
    sharedCollaborationWorkRetained: room.notes.some((row) => row.visibility === "SESSION_SHARED")
      && room.actionItems.length >= 1,
  };

  return {
    schema: "quipsly-coaching-post-call-readback-v5",
    auditedAt,
    authority: "read-only-canonical-postgresql-projection",
    room: {
      id: room.id,
      captureGroupId: room.captureGroupId,
      purpose: String(room.purpose),
      status: String(room.status),
      scheduledStart: iso(room.scheduledStart),
      openedAt: iso(room.openedAt),
      recordingStartedAt: iso(room.recordingStartedAt),
      endedAt: iso(room.endedAt),
      engagementBound: Boolean(room.coachingEngagementId),
    },
    participants: activeParticipants.map((row) => ({
      idSha256: hash(row.id),
      userIdSha256: hash(row.userId),
      emailSha256: hash(row.user?.primaryEmail || row.email),
      role: String(row.role),
      accessStatus: String(row.accessStatus),
      joinedAt: iso(row.joinedAt),
      leftAt: iso(row.leftAt),
      deviceLabel: row.deviceLabel || null,
    })),
    invitationEvidence: {
      total: room.invitations.length,
      accepted: acceptedInvitations.length,
      sentDeliveries: sentDeliveries.length,
      emailDeliveryProven: sentDeliveries.length >= 1,
      acceptedShareOrCopyHandoffProven: sentDeliveries.length === 0 && acceptedInvitations.length >= 1,
      rows: room.invitations.map((row) => ({
        idSha256: hash(row.id),
        recipientEmailSha256: hash(row.email),
        role: String(row.role),
        status: String(row.status),
        acceptedAt: iso(row.acceptedAt),
        deliveries: row.deliveries.map((delivery) => ({ status: String(delivery.status), channel: delivery.channel, completedAt: iso(delivery.completedAt) })),
      })),
    },
    consentEvidence: latestConsents.map((row) => ({
      userIdSha256: hash(row.userId),
      participantIdSha256: hash(row.participantId),
      status: String(row.status),
      policyVersion: row.policyVersion,
      canRecordAudio: row.canRecordAudio,
      canRecordVideo: row.canRecordVideo,
      canTranscribe: row.canTranscribe,
      consentedAt: iso(row.consentedAt),
      revokedAt: iso(row.revokedAt),
    })),
    endpointEvidence: {
      preflights: latestPreflights.map((row) => ({
        participantIdSha256: hash(row.participantId),
        clientKind: row.clientKind,
        status: row.status,
        audioSignalState: row.audioSignalState,
        cameraWanted: row.cameraWanted,
        camera: row.cameraWidth && row.cameraHeight ? { width: row.cameraWidth, height: row.cameraHeight, frameRate: row.cameraFrameRate } : null,
        testedAt: iso(row.testedAt),
        expiresAt: iso(row.expiresAt),
      })),
      providerGrants: room.participantProviderGrants.map((row) => ({
        participantIdSha256: hash(row.participantId), clientKind: row.clientKind, deviceLabel: row.deviceLabel, issuedAt: iso(row.issuedAt),
      })),
      queues: latestQueues.map((row) => ({
        participantIdSha256: hash(row.participantId), clientKind: row.clientKind, queueState: row.queueState,
        localSourceCount: row.localSourceCount, pendingSourceCount: row.pendingSourceCount, failedSourceCount: row.failedSourceCount,
        reconciledAt: iso(row.reconciledAt),
      })),
    },
    recordingEvidence: {
      stateTransitions: stateReceiptsApplied.map((row) => ({
        receiptIdSha256: hash(row.receiptId), actorUserIdSha256: hash(row.actorUserId), action: String(row.action), occurredAt: iso(row.occurredAt),
      })),
      requiredSources: requiredSources.map((row) => ({
        idSha256: hash(row.id), participantIdSha256: hash(row.participantId), sourceKind: String(row.sourceKind),
        retentionRole: String(row.retentionRole), recordingAssetBound: Boolean(row.recordingAssetId),
      })),
      verifiedLocalAssets: verifiedLocalAssets.map((row) => ({
        idSha256: hash(row.id), participantIdSha256: hash(row.participantId), kind: String(row.kind),
        byteSize: String(row.byteSize), durationSeconds: row.durationSeconds, checksumSha256: hash(row.checksum),
        recordedStartedAt: iso(row.recordedStartedAt), recordedStoppedAt: iso(row.recordedStoppedAt), uploadedAt: iso(row.uploadedAt), verifiedAt: iso(row.verifiedAt),
      })),
      requiredSourceOverlapSeconds: sourceOverlapSeconds,
      finalizations: finalizationReceipts.map((row) => ({
        captureIdSha256: hash(row.captureId), actorUserIdSha256: hash(row.actorUserId), recordingAssetIdSha256: hash(row.recordingAssetId),
        processingDisposition: row.processingDisposition, transcriptDisposition: row.transcriptDisposition, updatedAt: iso(row.updatedAt),
      })),
      providerReference: {
        commands: room.providerRecordingCommands.map((row) => ({ action: String(row.action), status: String(row.status), createdAt: iso(row.createdAt) })),
        events: room.providerRecordingEvents.map((row) => ({ eventType: row.eventType, applied: row.applied, receivedAt: iso(row.receivedAt) })),
        authority: "reference-or-fallback-only",
      },
      assembledPlaybacks: verifiedAssembledPlaybacks.map(({ output, assembledAsset, declaredSourceIds }) => ({
        outputIdSha256: hash(output.id),
        status: String(output.status),
        revision: output.revision,
        recipientUserIdSha256: hash(output.recipientUserId),
        assembledAssetIdSha256: hash(assembledAsset.id),
        sourceCount: declaredSourceIds.length,
        durationSeconds: assembledAsset.durationSeconds,
        byteSize: String(assembledAsset.byteSize),
        checksumSha256: hash(assembledAsset.checksum),
        verifiedAt: iso(assembledAsset.verifiedAt),
      })),
    },
    transcriptEvidence: {
      transcribedParticipantCount: transcribedParticipantIds.length,
      jobs: [...completedTranscriptByAssetId.values()].map((job) => ({
        idSha256: hash(job.id),
        recordingAssetIdSha256: hash(job.assetId),
        status: String(job.status),
        provider: job.provider,
        language: job.language || null,
        segmentCount: job._count?.segments || 0,
        wordCount: job._count?.words || 0,
        sourceSha256: hash(job.sourceSha256),
        completedAt: iso(job.completedAt),
        timing: timedTranscriptByAssetId.get(job.assetId),
      })),
      participantAttributionAuthority: "recording-asset-to-call-participant binding",
      humanSpeakerReviewClaimed: false,
    },
    collaborationEvidence: {
      sharedNoteCount: room.notes.filter((row) => row.visibility === "SESSION_SHARED").length,
      currentActorPrivateContentIncluded: false,
      taskCount: room.actionItems.length,
      goalCount: room.goals.length,
    },
    automatedGates: gates,
    automatedEvidencePassed: Object.values(gates).every(Boolean),
    humanAcceptance: {
      satisfied: false,
      requiredObservations: [
        "Both people completed ordinary navigation without rescue.",
        "Both people heard intelligible live audio and understood call state.",
        "A person listened to each retained source and the assembled playback.",
        "Coach and client independently returned and read back the Session and shared work.",
        "An unrelated signed-in account received concealment from the exact Session.",
      ],
      boundary: "Canonical records cannot prove comprehension, audible quality, hands-off completion, later human readback, or negative visibility by themselves.",
    },
    redaction: { namesIncluded: false, emailAddressesIncluded: false, contentBodiesIncluded: false, storageLocationsIncluded: false },
    externalSideEffects: false,
  };
}

async function readRoom(prisma, roomId) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const room = await tx.callRoom.findUnique({ where: { id: roomId } });
    if (!room) return null;
    // Prisma can fan nested includes into concurrent queries. This release
    // verifier intentionally uses one read-only connection, so assemble the
    // projection through sequential reads from the same repeatable snapshot.
    const participants = await tx.callParticipant.findMany({ where: { roomId }, orderBy: { createdAt: "asc" } });
    const invitationRows = await tx.callRoomInvitation.findMany({ where: { roomId }, orderBy: { createdAt: "asc" } });
    const deliveryRows = invitationRows.length
      ? await tx.callRoomInvitationDeliveryReceipt.findMany({ where: { invitationId: { in: invitationRows.map((row) => row.id) } }, orderBy: { createdAt: "asc" } })
      : [];
    const invitations = invitationRows.map((invitation) => ({
      ...invitation,
      deliveries: deliveryRows.filter((delivery) => delivery.invitationId === invitation.id),
    }));
    const recordingConsents = await tx.recordingConsent.findMany({ where: { roomId }, orderBy: { updatedAt: "desc" } });
    const participantPreflightReceipts = await tx.callParticipantPreflightReceipt.findMany({ where: { roomId }, orderBy: { testedAt: "desc" } });
    const participantProviderGrants = await tx.callParticipantProviderGrantReceipt.findMany({ where: { roomId }, orderBy: { issuedAt: "desc" } });
    const endpointQueueReceipts = await tx.callEndpointQueueReceipt.findMany({ where: { roomId }, orderBy: { createdAt: "desc" } });
    const expectedSources = await tx.callExpectedSource.findMany({ where: { roomId }, orderBy: { createdAt: "asc" } });
    const stateReceipts = await tx.captureRoomStateReceipt.findMany({ where: { roomId }, orderBy: { sequence: "asc" } });
    const recordingAssets = await tx.recordingAsset.findMany({ where: { roomId }, orderBy: { createdAt: "asc" } });
    const providerRecordingCommands = await tx.providerRecordingCommand.findMany({ where: { roomId }, orderBy: { createdAt: "asc" } });
    const providerRecordingEvents = await tx.providerRecordingEventReceipt.findMany({ where: { roomId }, orderBy: { receivedAt: "asc" } });
    const transcriptJobs = await tx.transcriptJob.findMany({
      where: { roomId },
      include: {
        _count: { select: { segments: true, words: true } },
        segments: {
          orderBy: [{ startSeconds: "asc" }, { id: "asc" }],
          select: { startSeconds: true, endSeconds: true, confidence: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });
    const collaborationScope = room.coachingEngagementId
      ? { OR: [{ roomId }, { engagementId: room.coachingEngagementId }] }
      : { roomId };
    const finalizationReceipts = await tx.mobileCaptureFinalizationReceipt.findMany({ where: { roomId }, orderBy: { updatedAt: "desc" } });
    const notes = await tx.coachingNote.findMany({ where: { ...collaborationScope, visibility: "SESSION_SHARED" }, select: { id: true, visibility: true } });
    const actionItems = await tx.actionItem.findMany({ where: collaborationScope, select: { id: true, status: true } });
    const goals = await tx.goal.findMany({ where: collaborationScope, select: { id: true, status: true } });
    const sessionOutputs = await tx.sessionOutput.findMany({
      where: { roomId, kind: "RECORDING_SHARE", status: { in: ["DRAFT", "RELEASED"] } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, kind: true, status: true, recipientUserId: true, bodyJson: true, sourceManifestJson: true, revision: true, updatedAt: true },
    });
    return {
      room: {
        ...room,
        participants,
        invitations,
        recordingConsents,
        participantPreflightReceipts,
        participantProviderGrants,
        endpointQueueReceipts,
        expectedSources,
        stateReceipts,
        recordingAssets,
        providerRecordingCommands,
        providerRecordingEvents,
        transcriptJobs,
        notes,
        actionItems,
        goals,
        sessionOutputs,
      },
      finalizationReceipts,
    };
  }, { isolationLevel: "RepeatableRead", timeout: 30_000 });
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) return process.stdout.write(usage());
  if (process.env.QUIPSLY_PRODUCTION_POST_CALL_READBACK !== "1") fail("Set QUIPSLY_PRODUCTION_POST_CALL_READBACK=1 to acknowledge the exact production readback.");
  if (!options.roomId || options.roomId.length > 240) fail("--room-id must identify one exact canonical Session.");
  if (!options.outputPath || !path.isAbsolute(options.outputPath)) fail("--output must be an absolute private receipt path.");
  const database = new URL(options.databaseUrl || fail("DATABASE_URL is required."));
  if (![/^postgres:$/.test(database.protocol), /^postgresql:$/.test(database.protocol)].some(Boolean)) fail("DATABASE_URL must use PostgreSQL.");
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: database.toString(), max: 1, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000 }),
    log: ["error"],
  });
  try {
    const result = await readRoom(prisma, options.roomId);
    if (!result) fail(`Session ${options.roomId} was not found.`);
    const receipt = summarizePostCallEvidence(result.room, result.finalizationReceipts);
    await mkdir(path.dirname(options.outputPath), { recursive: true });
    await writeFile(options.outputPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
    await chmod(options.outputPath, 0o600);
    process.stdout.write(`${JSON.stringify({ ok: true, outputPath: options.outputPath, automatedEvidencePassed: receipt.automatedEvidencePassed, humanAcceptanceSatisfied: false }, null, 2)}\n`);
    if (!receipt.automatedEvidencePassed) process.exitCode = 2;
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => { process.stderr.write(`quipsly-coaching-post-call-readback: ${error.message}\n`); process.exitCode = 1; });
}
