import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { buildSessionRecordingStatus } from "@/lib/session-recording-status";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { sessionAccessWhere } from "@/lib/server/session-access";
import { buildSessionReadinessTopology } from "@/lib/server/session-readiness-topology";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function privateJson(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      Vary: "Authorization, Cookie",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function cleanRoomId(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 240) : "";
}

export async function GET(request: Request, context: { params: Promise<{ roomId: string }> }) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) return privateJson({ ok: false, code: "AUTH_REQUIRED", error: "Sign in before reading private recording status." }, 401);
  const { roomId: rawRoomId } = await context.params;
  const roomId = cleanRoomId(rawRoomId);
  if (!roomId) return privateJson({ ok: false, code: "ROOM_REQUIRED", error: "A Session is required." }, 400);

  try {
    const prisma = getPrismaClient() as any;
    const room = await prisma.callRoom.findFirst({
      where: sessionAccessWhere(roomId, session.user),
      select: {
        id: true,
        status: true,
        participants: {
          where: { accessStatus: "ACTIVE" },
          orderBy: { createdAt: "asc" },
          select: { id: true, userId: true, displayName: true, email: true, role: true, user: { select: { name: true, primaryEmail: true } } },
        },
        participantProviderGrants: {
          orderBy: { issuedAt: "desc" },
          take: 200,
          select: { id: true, participantId: true, clientInstanceId: true, clientKind: true, deviceLabel: true, issuedAt: true, expiresAt: true },
        },
        participantPreflightReceipts: {
          orderBy: { testedAt: "desc" },
          take: 200,
          select: { id: true, governedActionId: true, participantId: true, clientInstanceId: true, clientKind: true, deviceLabel: true, microphoneLabel: true, cameraLabel: true, outputLabel: true, cameraWanted: true, status: true, audioSignalState: true, privateSamplePlaybackComplete: true, playbackDecision: true, issueCodes: true, testedAt: true, expiresAt: true },
        },
        endpointQueueReceipts: {
          orderBy: { queueRevision: "desc" },
          take: 500,
          select: { id: true, participantId: true, clientInstanceId: true, clientKind: true, deviceLabel: true, queueRevision: true, queueState: true, localSourceCount: true, pendingSourceCount: true, failedSourceCount: true, observedCaptureIds: true, recordingAssetIds: true, latestLocalMutationAt: true, reconciledAt: true, createdAt: true },
        },
        expectedSources: {
          orderBy: [{ status: "asc" }, { createdAt: "asc" }],
          take: 200,
          select: { id: true, participantId: true, label: true, sourceKind: true, retentionRole: true, status: true, expectedClientKind: true, expectedDeviceLabel: true, recordingAssetId: true, captureId: true, revision: true, latestReason: true, createdAt: true, updatedAt: true },
        },
        recordingAssets: {
          orderBy: { createdAt: "asc" },
          select: { id: true, roomId: true, participantId: true, fileName: true, kind: true, status: true, contentType: true, byteSize: true, durationSeconds: true, storageBucket: true, storageObjectPath: true, checksum: true, verifiedAt: true, recordedStartedAt: true, recordedStoppedAt: true, localManifestJson: true },
        },
        recordingConsents: {
          orderBy: { updatedAt: "desc" },
          select: { participantId: true, userId: true, status: true, canRecordAudio: true, canRecordVideo: true, canTranscribe: true, consentedAt: true, revokedAt: true, updatedAt: true },
        },
        stateReceipts: {
          where: { captureId: { not: null } },
          orderBy: { sequence: "asc" },
          select: { receiptId: true, captureId: true, actorUserId: true, captureOwnerUserId: true, action: true, outcome: true, stateApplied: true, occurredAt: true, receivedAt: true },
        },
      },
    });
    if (!room) return privateJson({ ok: false, code: "NOT_FOUND", error: "This private Session is unavailable." }, 404);

    const finalizations = await prisma.mobileCaptureFinalizationReceipt.findMany({
      where: { roomId: room.id },
      orderBy: { updatedAt: "desc" },
      select: { uploadSessionId: true, captureId: true, roomId: true, actorUserId: true, recordingAssetId: true, processingDisposition: true, transcriptDisposition: true, releaseReason: true, releasedAt: true, metadataJson: true, updatedAt: true },
    });
    const captures = new Map<string, { captureId: string; actorUserId: string; status: "START_AND_STOP_RECEIVED" | "START_ONLY" | "STOP_ONLY"; startedAt: string | null; stoppedAt: string | null; lastReceivedAt: string }>();
    for (const receipt of room.stateReceipts) {
      if (!receipt.captureId || receipt.outcome !== "APPLIED" || !receipt.stateApplied) continue;
      const captureId = String(receipt.captureId).toLowerCase();
      const current = captures.get(captureId) ?? { captureId, actorUserId: receipt.captureOwnerUserId || receipt.actorUserId, status: "START_ONLY", startedAt: null, stoppedAt: null, lastReceivedAt: receipt.receivedAt.toISOString() };
      if (receipt.action === "START_RECORDING") current.startedAt = receipt.occurredAt.toISOString();
      if (receipt.action === "STOP_RECORDING") current.stoppedAt = receipt.occurredAt.toISOString();
      current.status = current.startedAt && current.stoppedAt ? "START_AND_STOP_RECEIVED" : current.startedAt ? "START_ONLY" : "STOP_ONLY";
      current.lastReceivedAt = receipt.receivedAt.toISOString();
      captures.set(captureId, current);
    }
    const consentByParticipant = new Map<string, any>();
    for (const consent of room.recordingConsents) {
      const participant = room.participants.find((candidate: any) => candidate.id === consent.participantId || candidate.userId === consent.userId);
      if (participant && !consentByParticipant.has(participant.id)) consentByParticipant.set(participant.id, consent);
    }
    const topology = buildSessionReadinessTopology({
      participants: room.participants.map((participant: any) => {
        const consent = consentByParticipant.get(participant.id);
        const granted = consent?.status === "GRANTED" && consent?.canRecordAudio === true && consent?.consentedAt && !consent?.revokedAt;
        return {
          id: participant.id,
          userId: participant.userId,
          label: participant.displayName || participant.user?.name || participant.email || participant.user?.primaryEmail || "Session participant",
          role: String(participant.role),
          isCurrentActor: participant.userId === session.user.id,
          consent: consent ? { recordingReady: Boolean(granted), canRecordVideo: granted && consent.canRecordVideo === true, transcriptionReady: granted && consent.canTranscribe === true } : null,
        };
      }),
      grants: room.participantProviderGrants,
      preflights: room.participantPreflightReceipts,
      endpointQueues: room.endpointQueueReceipts,
      expectedSources: room.expectedSources,
      recordings: room.recordingAssets,
      finalizations,
      captures: [...captures.values()],
    });
    return privateJson({ ok: true, status: buildSessionRecordingStatus({ roomId: room.id, roomStatus: String(room.status), topology }), boundaries: { readOnly: true, privateSessionAccessRequired: true, providerPresenceIsNotRecordingProof: true } });
  } catch (error) {
    console.error("[session-recording-status] read failed", error);
    return privateJson({ ok: false, code: "RECORDING_STATUS_UNAVAILABLE", error: "Quipsly could not refresh recording status. Keep recording devices open and try again." }, 503);
  }
}

