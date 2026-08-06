import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { captureRoomAccessWhere } from "@/lib/server/mobile-capture-room-join-diagnostics";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import {
  parseSessionEndpointQueueEvidence,
  serverSourceSetSha256,
  sessionEndpointQueueRequestSha256,
  sessionEndpointQueueStateSha256,
} from "@/lib/server/session-endpoint-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "cache-control": "private, no-store",
  vary: "Authorization, Cookie",
};

function requestId(value: unknown) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)
    ? normalized
    : "";
}

function receiptView(receipt: any) {
  return {
    id: receipt.id,
    requestId: receipt.requestId,
    participantId: receipt.participantId,
    clientInstanceId: receipt.clientInstanceId,
    clientKind: receipt.clientKind,
    deviceLabel: receipt.deviceLabel,
    queueRevision: String(receipt.queueRevision),
    queueState: receipt.queueState,
    localSourceCount: receipt.localSourceCount,
    pendingSourceCount: receipt.pendingSourceCount,
    failedSourceCount: receipt.failedSourceCount,
    observedCaptureIds: receipt.observedCaptureIds,
    recordingAssetIds: receipt.recordingAssetIds,
    latestLocalMutationAt: new Date(receipt.latestLocalMutationAt).toISOString(),
    reconciledAt: new Date(receipt.reconciledAt).toISOString(),
    createdAt: new Date(receipt.createdAt).toISOString(),
  };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await context.params;
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) {
    return NextResponse.json({ ok: false, code: "UNAUTHORIZED", error: "Sign in before reading endpoint recovery state." }, { status: 401, headers: PRIVATE_HEADERS });
  }
  const prisma = getPrismaClient();
  const room = await prisma.callRoom.findFirst({
    where: captureRoomAccessWhere(roomId, session.user),
    select: { id: true },
  });
  if (!room) return NextResponse.json({ ok: false, code: "NOT_FOUND", error: "Session not found." }, { status: 404, headers: PRIVATE_HEADERS });
  const receipts = await prisma.callEndpointQueueReceipt.findMany({
    where: { roomId: room.id },
    orderBy: [{ clientInstanceId: "asc" }, { queueRevision: "desc" }],
    take: 500,
  });
  const latest = new Map<string, any>();
  for (const receipt of receipts) if (!latest.has(receipt.clientInstanceId)) latest.set(receipt.clientInstanceId, receipt);
  return NextResponse.json({
    ok: true,
    endpointQueues: [...latest.values()].map(receiptView),
    boundary: "Latest server-acknowledged state per exact app/browser installation; not live presence.",
  }, { headers: PRIVATE_HEADERS });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await context.params;
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) {
    return NextResponse.json({ ok: false, code: "UNAUTHORIZED", error: "Sign in before reconciling an endpoint queue." }, { status: 401, headers: PRIVATE_HEADERS });
  }
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const idempotencyId = requestId(body?.requestId);
  const evidence = parseSessionEndpointQueueEvidence(body);
  if (!idempotencyId || !evidence) {
    return NextResponse.json({ ok: false, code: "INVALID_ENDPOINT_QUEUE", error: "A valid request ID and bounded endpoint queue snapshot are required." }, { status: 400, headers: PRIVATE_HEADERS });
  }
  const prisma = getPrismaClient();
  const room = await prisma.callRoom.findFirst({
    where: captureRoomAccessWhere(roomId, session.user),
    select: {
      id: true,
      captureGroupId: true,
      participants: {
        where: { userId: session.user.id, accessStatus: "ACTIVE" },
        select: { id: true },
      },
    },
  });
  if (!room) return NextResponse.json({ ok: false, code: "NOT_FOUND", error: "Session not found." }, { status: 404, headers: PRIVATE_HEADERS });
  const participant = room.participants[0];
  if (!participant) {
    return NextResponse.json({ ok: false, code: "PARTICIPANT_REQUIRED", error: "Join this Session as an active participant before reconciling a recording endpoint." }, { status: 403, headers: PRIVATE_HEADERS });
  }
  const requestSha256 = sessionEndpointQueueRequestSha256({
    roomId: room.id,
    captureGroupId: room.captureGroupId,
    participantId: participant.id,
    actorUserId: session.user.id,
    evidence,
  });
  try {
    const result = await prisma.$transaction(async (tx) => {
      const lockKey = `${room.id}:${evidence.clientInstanceId}`;
      await tx.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
      const existing = await tx.callEndpointQueueReceipt.findUnique({ where: { requestId: idempotencyId } });
      if (existing) {
        if (existing.requestSha256 !== requestSha256 || existing.roomId !== room.id || existing.actorUserId !== session.user.id) {
          return { kind: "conflict" as const };
        }
        return { kind: "ok" as const, receipt: existing, replay: true };
      }
      const endpointIdentity = await tx.callParticipantProviderGrantReceipt.findFirst({
        where: {
          roomId: room.id,
          participantId: participant.id,
          clientInstanceId: evidence.clientInstanceId,
          clientKind: { equals: evidence.clientKind, mode: "insensitive" },
        },
        select: { id: true },
      }) ?? await tx.callParticipantPreflightReceipt.findFirst({
        where: {
          roomId: room.id,
          participantId: participant.id,
          clientInstanceId: evidence.clientInstanceId,
          clientKind: { equals: evidence.clientKind, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (!endpointIdentity) return { kind: "unknown-endpoint" as const };
      const latest = await tx.callEndpointQueueReceipt.findFirst({
        where: { roomId: room.id, clientInstanceId: evidence.clientInstanceId },
        orderBy: { queueRevision: "desc" },
      });
      if (latest && evidence.queueRevision <= latest.queueRevision) return { kind: "stale" as const, latest };

      const recordingAssets = evidence.recordingAssetIds.length
        ? await tx.recordingAsset.findMany({
            where: { id: { in: evidence.recordingAssetIds }, roomId: room.id, participantId: participant.id },
            select: { id: true, status: true, verifiedAt: true, localManifestJson: true },
          })
        : [];
      const serverAssetIds = recordingAssets.map((asset) => asset.id).sort();
      const finalizations = serverAssetIds.length
        ? await tx.mobileCaptureFinalizationReceipt.findMany({
            where: { roomId: room.id, recordingAssetId: { in: serverAssetIds } },
            select: { recordingAssetId: true, processingDisposition: true },
          })
        : [];
      const releasedIds = new Set(finalizations
        .filter((item) => item.processingDisposition === "RELEASED")
        .map((item) => item.recordingAssetId)
        .filter((id): id is string => Boolean(id)));
      const verifiedReleased = recordingAssets.every((asset) => asset.status === "VERIFIED" && asset.verifiedAt && releasedIds.has(asset.id));
      const captureReceipts = evidence.observedCaptureIds.length
        ? await tx.captureRoomStateReceipt.findMany({
            where: { roomId: room.id, captureId: { in: evidence.observedCaptureIds }, actorUserId: session.user.id },
            select: { captureId: true },
          })
        : [];
      const serverCaptureIds = new Set(captureReceipts.map((receipt) => receipt.captureId).filter((id): id is string => Boolean(id)));
      for (const asset of recordingAssets) {
        const manifest = asset.localManifestJson && typeof asset.localManifestJson === "object" && !Array.isArray(asset.localManifestJson)
          ? asset.localManifestJson as Record<string, unknown>
          : {};
        if (typeof manifest.captureId === "string") serverCaptureIds.add(manifest.captureId.toLowerCase());
      }
      if (evidence.queueState === "DRAINED" && (
        evidence.localSourceCount < 1
        || serverAssetIds.length !== evidence.localSourceCount
        || evidence.observedCaptureIds.length !== evidence.localSourceCount
        || !evidence.recordingAssetIds.every((id) => serverAssetIds.includes(id))
        || !evidence.observedCaptureIds.every((id) => serverCaptureIds.has(id))
        || !verifiedReleased
      )) return { kind: "server-incomplete" as const };
      const receipt = await tx.callEndpointQueueReceipt.create({
        data: {
          requestId: idempotencyId,
          requestSha256,
          roomId: room.id,
          captureGroupId: room.captureGroupId,
          participantId: participant.id,
          actorUserId: session.user.id,
          clientInstanceId: evidence.clientInstanceId,
          clientKind: evidence.clientKind,
          deviceLabel: evidence.deviceLabel,
          queueRevision: evidence.queueRevision,
          queueState: evidence.queueState,
          queueStateSha256: sessionEndpointQueueStateSha256(evidence),
          localSourceCount: evidence.localSourceCount,
          pendingSourceCount: evidence.pendingSourceCount,
          failedSourceCount: evidence.failedSourceCount,
          observedCaptureIds: evidence.observedCaptureIds,
          recordingAssetIds: evidence.recordingAssetIds,
          latestLocalMutationAt: evidence.latestLocalMutationAt,
          reconciledAt: evidence.reconciledAt,
          serverSourceSetSha256: serverSourceSetSha256(serverAssetIds),
        },
      });
      return { kind: "ok" as const, receipt, replay: false };
    });
    if (result.kind === "conflict") return NextResponse.json({ ok: false, code: "REQUEST_ID_CONFLICT", error: "That request ID belongs to different endpoint evidence." }, { status: 409, headers: PRIVATE_HEADERS });
    if (result.kind === "unknown-endpoint") return NextResponse.json({ ok: false, code: "UNKNOWN_ENDPOINT", error: "Run the Session join or private playback check on this exact installation first." }, { status: 409, headers: PRIVATE_HEADERS });
    if (result.kind === "stale") return NextResponse.json({ ok: false, code: "STALE_QUEUE_REVISION", error: "A newer snapshot from this exact installation is already durable.", latest: receiptView(result.latest) }, { status: 409, headers: PRIVATE_HEADERS });
    if (result.kind === "server-incomplete") return NextResponse.json({ ok: false, code: "SERVER_COPY_INCOMPLETE", error: "The endpoint cannot claim drained until every listed local source has matching verified, released server bytes and capture identity." }, { status: 409, headers: PRIVATE_HEADERS });
    return NextResponse.json({
      ok: true,
      idempotentReplay: result.replay,
      endpointQueue: receiptView(result.receipt),
      safeToLeaveThisEndpoint: result.receipt.queueState === "DRAINED",
      boundary: "This acknowledges the latest durable queue snapshot from one exact installation; it does not report live presence.",
    }, { status: result.replay ? 200 : 201, headers: PRIVATE_HEADERS });
  } catch (error) {
    console.error("[session-endpoint-queue] failed", error);
    return NextResponse.json({ ok: false, code: "ENDPOINT_QUEUE_UNAVAILABLE", error: "Nest could not acknowledge the endpoint queue. Keep the local source and retry." }, { status: 503, headers: PRIVATE_HEADERS });
  }
}
