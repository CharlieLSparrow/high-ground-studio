import type { CallParticipantPreflightReceipt, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { captureRoomAccessWhere } from "@/lib/server/mobile-capture-room-join-diagnostics";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import {
  buildSessionPreflightEvidence,
  sessionPreflightNextAction,
  sessionPreflightRequestSha256,
} from "@/lib/server/session-preflight";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "cache-control": "private, no-store",
  vary: "Authorization, Cookie",
};

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function requestId(value: unknown) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)
    ? normalized
    : "";
}

function receiptView(receipt: CallParticipantPreflightReceipt) {
  return {
    id: receipt.id,
    requestId: receipt.requestId,
    participantId: receipt.participantId,
    clientInstanceId: receipt.clientInstanceId,
    clientKind: receipt.clientKind,
    deviceLabel: receipt.deviceLabel,
    microphoneLabel: receipt.microphoneLabel,
    cameraLabel: receipt.cameraLabel,
    outputLabel: receipt.outputLabel,
    cameraWanted: receipt.cameraWanted,
    status: receipt.status,
    audioSignalState: receipt.audioSignalState,
    rmsDbfs: receipt.rmsDbfs,
    samplePeakDbfs: receipt.samplePeakDbfs,
    peakHoldDbfs: receipt.peakHoldDbfs,
    clippedSampleCount: receipt.clippedSampleCount,
    sampleRateHz: receipt.sampleRateHz,
    channelCount: receipt.channelCount,
    cameraWidth: receipt.cameraWidth,
    cameraHeight: receipt.cameraHeight,
    cameraFrameRate: receipt.cameraFrameRate,
    privateSampleDurationSeconds: receipt.privateSampleDurationSeconds,
    privateSamplePlaybackComplete: receipt.privateSamplePlaybackComplete,
    playbackDecision: receipt.playbackDecision,
    issueCodes: receipt.issueCodes,
    testedAt: receipt.testedAt instanceof Date ? receipt.testedAt.toISOString() : String(receipt.testedAt),
    expiresAt: receipt.expiresAt instanceof Date ? receipt.expiresAt.toISOString() : String(receipt.expiresAt),
    current: receipt.status === "READY" && new Date(receipt.expiresAt).getTime() > Date.now(),
  };
}

async function authorizedRoom(request: Request, roomId: string) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) return { error: "UNAUTHORIZED" as const };
  const prisma = getPrismaClient();
  const room = await prisma.callRoom.findFirst({
    where: captureRoomAccessWhere(roomId, session.user),
    select: {
      id: true,
      booking: { select: { coachUserId: true, clientUserId: true } },
      participants: {
        where: { accessStatus: "ACTIVE" },
        select: { id: true, userId: true },
      },
    },
  });
  if (!room) return { error: "NOT_FOUND" as const };
  return { prisma, room, actor: session.user };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await context.params;
  const access = await authorizedRoom(request, roomId);
  if ("error" in access) {
    return NextResponse.json(
      { ok: false, code: access.error, error: access.error === "UNAUTHORIZED" ? "Sign in before reading private setup checks." : "Session not found." },
      { status: access.error === "UNAUTHORIZED" ? 401 : 404, headers: PRIVATE_HEADERS },
    );
  }
  const participant = access.room.participants.find((candidate) => candidate.userId === access.actor.id);
  if (!participant) {
    return NextResponse.json({
      ok: true,
      preflight: null,
      boundaries: {
        sampleBytesRetained: false,
        sampleBytesUploaded: false,
        recordingStarted: false,
      },
    }, { headers: PRIVATE_HEADERS });
  }
  const latest = await access.prisma.callParticipantPreflightReceipt.findFirst({
    where: { roomId: access.room.id, participantId: participant.id },
    orderBy: { testedAt: "desc" },
  });
  return NextResponse.json({
    ok: true,
    preflight: latest ? receiptView(latest) : null,
    boundaries: {
      sampleBytesRetained: false,
      sampleBytesUploaded: false,
      recordingStarted: false,
    },
  }, { headers: PRIVATE_HEADERS });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await context.params;
  const access = await authorizedRoom(request, roomId);
  if ("error" in access) {
    return NextResponse.json(
      { ok: false, code: access.error, error: access.error === "UNAUTHORIZED" ? "Sign in before saving a private setup check." : "Session not found." },
      { status: access.error === "UNAUTHORIZED" ? 401 : 404, headers: PRIVATE_HEADERS },
    );
  }
  const body = object(await request.json().catch(() => null));
  const idempotencyId = requestId(body.requestId);
  if (!idempotencyId) {
    return NextResponse.json({ ok: false, code: "INVALID_REQUEST_ID", error: "A valid setup-check request ID is required." }, { status: 400, headers: PRIVATE_HEADERS });
  }
  const evidence = buildSessionPreflightEvidence(body);
  if (!evidence.clientInstanceId || !evidence.microphoneLabel) {
    return NextResponse.json({ ok: false, code: "INVALID_PREFLIGHT", error: "The exact browser endpoint and microphone must be identified before saving a setup check." }, { status: 400, headers: PRIVATE_HEADERS });
  }

  const knownParticipant = access.room.participants.find((candidate) => candidate.userId === access.actor.id);
  const participantRole = access.room.booking?.coachUserId === access.actor.id
    ? "COACH"
    : access.room.booking?.clientUserId === access.actor.id
      ? "CLIENT"
      : "GUEST";

  const requestSha256 = sessionPreflightRequestSha256(evidence);
  try {
    const result = await access.prisma.$transaction(async (tx) => {
      let participant = knownParticipant;
      if (!participant) {
        // Project/booking access can authorize preflight before a CallParticipant
        // exists. Serialize that identity boundary so two different samples from
        // the same new browser user converge on one participant row.
        const participantLock = `${access.room.id}:${access.actor.id}`;
        await tx.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtextextended(${participantLock}, 0))`;
        participant = await tx.callParticipant.findFirst({
          where: {
            roomId: access.room.id,
            userId: access.actor.id,
            accessStatus: "ACTIVE",
          },
          select: { id: true, userId: true },
        }) ?? undefined;
        if (!participant) {
          participant = await tx.callParticipant.create({
            data: {
              roomId: access.room.id,
              userId: access.actor.id,
              displayName: access.actor.name || access.actor.primaryEmail || "Quipsly participant",
              email: access.actor.primaryEmail,
              role: participantRole,
              deviceLabel: evidence.deviceLabel || "Quipsly Web",
            },
            select: { id: true, userId: true },
          });
        }
      }
      await tx.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtextextended(${idempotencyId}, 0))`;
      const existing = await tx.callParticipantPreflightReceipt.findUnique({ where: { requestId: idempotencyId } });
      if (existing) {
        if (
          existing.roomId !== access.room.id
          || existing.participantId !== participant.id
          || existing.actorUserId !== access.actor.id
          || existing.requestSha256 !== requestSha256
        ) {
          return { conflict: true as const, receipt: null, replay: false };
        }
        return { conflict: false as const, receipt: existing, replay: true };
      }
      const receipt = await tx.callParticipantPreflightReceipt.create({
        data: {
          requestId: idempotencyId,
          requestSha256,
          roomId: access.room.id,
          participantId: participant.id,
          actorUserId: access.actor.id,
          clientInstanceId: evidence.clientInstanceId,
          clientKind: evidence.clientKind,
          deviceLabel: evidence.deviceLabel,
          microphoneLabel: evidence.microphoneLabel,
          cameraLabel: evidence.cameraLabel,
          outputLabel: evidence.outputLabel,
          cameraWanted: evidence.cameraWanted,
          status: evidence.status,
          audioSignalState: evidence.audioSignalState,
          rmsDbfs: evidence.rmsDbfs,
          samplePeakDbfs: evidence.samplePeakDbfs,
          peakHoldDbfs: evidence.peakHoldDbfs,
          clippedSampleCount: evidence.clippedSampleCount,
          sampleRateHz: evidence.sampleRateHz,
          channelCount: evidence.channelCount,
          echoCancellation: evidence.echoCancellation,
          noiseSuppression: evidence.noiseSuppression,
          autoGainControl: evidence.autoGainControl,
          cameraWidth: evidence.cameraWidth,
          cameraHeight: evidence.cameraHeight,
          cameraFrameRate: evidence.cameraFrameRate,
          privateSampleDurationSeconds: evidence.privateSampleDurationSeconds,
          privateSamplePlaybackComplete: evidence.privateSamplePlaybackComplete,
          playbackDecision: evidence.playbackDecision,
          issueCodes: evidence.issueCodes,
          evidenceJson: evidence.evidenceJson as Prisma.InputJsonValue,
          testedAt: evidence.testedAt,
          expiresAt: evidence.expiresAt,
        },
      });
      return { conflict: false as const, receipt, replay: false };
    });
    if (result.conflict || !result.receipt) {
      return NextResponse.json({ ok: false, code: "REQUEST_ID_CONFLICT", error: "That setup-check request ID already belongs to different evidence. Run a fresh check." }, { status: 409, headers: PRIVATE_HEADERS });
    }
    return NextResponse.json({
      ok: true,
      idempotentReplay: result.replay,
      preflight: receiptView(result.receipt),
      nextAction: sessionPreflightNextAction(evidence),
      boundaries: {
        sampleBytesRetained: false,
        sampleBytesUploaded: false,
        recordingStarted: false,
        providerJoined: false,
        sourceTruthChanged: false,
      },
    }, { status: result.replay ? 200 : 201, headers: PRIVATE_HEADERS });
  } catch (error) {
    console.error("[session-preflight] failed", error);
    return NextResponse.json({ ok: false, code: "PREFLIGHT_UNAVAILABLE", error: "Quipsly could not save the setup-check receipt. The private sample remains only in this tab; retry with the same sample." }, { status: 503, headers: PRIVATE_HEADERS });
  }
}
