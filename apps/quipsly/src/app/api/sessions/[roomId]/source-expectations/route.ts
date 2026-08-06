import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { sessionAccessWhere, sessionMutationAccessWhere } from "@/lib/server/session-access";
import {
  expectedSourceRequestSha256,
  expectedSourceSnapshot,
  expectedSourceTransitionAllowed,
  mutationStatus,
  parseCreateExpectedSource,
  parseMutateExpectedSource,
  prismaExpectedSourceAction,
  recordingKindMatchesExpectation,
} from "@/lib/server/session-source-expectations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "cache-control": "private, no-store",
  vary: "Authorization, Cookie",
};

function manifestCaptureId(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const captureId = (value as Record<string, unknown>).captureId;
  const normalized = typeof captureId === "string" ? captureId.trim().toLowerCase() : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)
    ? normalized
    : null;
}

function responseView(expectation: any) {
  return {
    ...expectedSourceSnapshot(expectation),
    participantLabel: expectation.participant?.displayName
      || expectation.participant?.user?.name
      || expectation.participant?.email
      || null,
    recordingAsset: expectation.recordingAsset ? {
      id: expectation.recordingAsset.id,
      fileName: expectation.recordingAsset.fileName,
      kind: expectation.recordingAsset.kind,
      status: expectation.recordingAsset.status,
      verifiedAt: expectation.recordingAsset.verifiedAt?.toISOString() ?? null,
    } : null,
    updatedAt: expectation.updatedAt.toISOString(),
  };
}

const expectationInclude = {
  participant: { select: { displayName: true, email: true, user: { select: { name: true } } } },
  recordingAsset: { select: { id: true, fileName: true, kind: true, status: true, verifiedAt: true } },
} as const;

export async function GET(request: Request, context: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await context.params;
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) return NextResponse.json({ ok: false, code: "UNAUTHORIZED", error: "Sign in before reading the recording plan." }, { status: 401, headers: PRIVATE_HEADERS });
  const prisma = getPrismaClient();
  const room = await prisma.callRoom.findFirst({ where: sessionAccessWhere(roomId, session.user), select: { id: true } });
  if (!room) return NextResponse.json({ ok: false, code: "NOT_FOUND", error: "Session not found." }, { status: 404, headers: PRIVATE_HEADERS });
  const expectations = await prisma.callExpectedSource.findMany({ where: { roomId: room.id }, orderBy: [{ status: "asc" }, { createdAt: "asc" }], include: expectationInclude });
  return NextResponse.json({ ok: true, expectations: expectations.map(responseView) }, { headers: PRIVATE_HEADERS });
}

export async function POST(request: Request, context: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await context.params;
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) return NextResponse.json({ ok: false, code: "UNAUTHORIZED", error: "Sign in before changing the recording plan." }, { status: 401, headers: PRIVATE_HEADERS });
  const body = await request.json().catch(() => null);
  const input = parseCreateExpectedSource(body);
  if (!input) return NextResponse.json({ ok: false, code: "INVALID_EXPECTED_SOURCE", error: "A request ID, label, source kind, and retention role are required." }, { status: 400, headers: PRIVATE_HEADERS });
  const prisma = getPrismaClient();
  const room = await prisma.callRoom.findFirst({
    where: sessionMutationAccessWhere(roomId, session.user),
    select: { id: true, participants: { where: { accessStatus: "ACTIVE" }, select: { id: true } } },
  });
  if (!room) return NextResponse.json({ ok: false, code: "NOT_FOUND", error: "Session not found or not editable." }, { status: 404, headers: PRIVATE_HEADERS });
  if (input.participantId && !room.participants.some((participant) => participant.id === input.participantId)) {
    return NextResponse.json({ ok: false, code: "INVALID_PARTICIPANT", error: "The planned source owner is not an active Session participant." }, { status: 400, headers: PRIVATE_HEADERS });
  }
  const requestSha256 = expectedSourceRequestSha256({ action: "CREATE", roomId: room.id, actorUserId: session.user.id, ...input });
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtextextended(${room.id}, 0))`;
      const existingRevision = await tx.callExpectedSourceRevision.findUnique({ where: { requestId: input.requestId }, include: { expectation: { include: expectationInclude } } });
      if (existingRevision) return existingRevision.requestSha256 === requestSha256 && existingRevision.actorUserId === session.user.id
        ? { kind: "ok" as const, expectation: existingRevision.expectation, replay: true }
        : { kind: "conflict" as const };
      const expectation = await tx.callExpectedSource.create({
        data: {
          roomId: room.id,
          participantId: input.participantId,
          createdByUserId: session.user.id,
          label: input.label,
          sourceKind: input.sourceKind,
          retentionRole: input.retentionRole,
          expectedClientKind: input.expectedClientKind,
          expectedDeviceLabel: input.expectedDeviceLabel,
          captureId: input.captureId,
          latestReason: input.reason,
        },
      });
      const afterJson = expectedSourceSnapshot(expectation);
      await tx.callExpectedSourceRevision.create({ data: { requestId: input.requestId, requestSha256, expectationId: expectation.id, roomId: room.id, actorUserId: session.user.id, action: "CREATE", revision: 1, beforeJson: {}, afterJson, reason: input.reason } });
      const hydrated = await tx.callExpectedSource.findUniqueOrThrow({ where: { id: expectation.id }, include: expectationInclude });
      return { kind: "ok" as const, expectation: hydrated, replay: false };
    });
    if (result.kind === "conflict") return NextResponse.json({ ok: false, code: "REQUEST_ID_CONFLICT", error: "That request ID belongs to a different recording-plan decision." }, { status: 409, headers: PRIVATE_HEADERS });
    return NextResponse.json({ ok: true, idempotentReplay: result.replay, expectation: responseView(result.expectation) }, { status: result.replay ? 200 : 201, headers: PRIVATE_HEADERS });
  } catch (error) {
    console.error("[session-source-expectations] create failed", error);
    return NextResponse.json({ ok: false, code: "EXPECTED_SOURCE_UNAVAILABLE", error: "Nest could not save the planned source. Nothing was changed." }, { status: 503, headers: PRIVATE_HEADERS });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await context.params;
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) return NextResponse.json({ ok: false, code: "UNAUTHORIZED", error: "Sign in before changing the recording plan." }, { status: 401, headers: PRIVATE_HEADERS });
  const body = await request.json().catch(() => null);
  const input = parseMutateExpectedSource(body);
  if (!input) return NextResponse.json({ ok: false, code: "INVALID_EXPECTED_SOURCE_CHANGE", error: "A valid action, request ID, expectation revision, and required reason are needed." }, { status: 400, headers: PRIVATE_HEADERS });
  const prisma = getPrismaClient();
  const room = await prisma.callRoom.findFirst({ where: sessionMutationAccessWhere(roomId, session.user), select: { id: true } });
  if (!room) return NextResponse.json({ ok: false, code: "NOT_FOUND", error: "Session not found or not editable." }, { status: 404, headers: PRIVATE_HEADERS });
  const requestSha256 = expectedSourceRequestSha256({ roomId: room.id, actorUserId: session.user.id, ...input });
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtextextended(${room.id}, 0))`;
      const replayRevision = await tx.callExpectedSourceRevision.findUnique({ where: { requestId: input.requestId }, include: { expectation: { include: expectationInclude } } });
      if (replayRevision) return replayRevision.requestSha256 === requestSha256 && replayRevision.actorUserId === session.user.id
        ? { kind: "ok" as const, expectation: replayRevision.expectation, replay: true }
        : { kind: "conflict" as const };
      const current = await tx.callExpectedSource.findFirst({ where: { id: input.expectationId, roomId: room.id }, include: expectationInclude });
      if (!current) return { kind: "missing" as const };
      if (current.revision !== input.expectedRevision) return { kind: "stale" as const, expectation: current };
      if (!expectedSourceTransitionAllowed(input.action, current)) return { kind: "invalid-transition" as const };
      let asset: any = null;
      if (input.action === "BIND") {
        asset = await tx.recordingAsset.findFirst({ where: { id: input.recordingAssetId!, roomId: room.id }, select: { id: true, participantId: true, kind: true, localManifestJson: true } });
        if (!asset || !recordingKindMatchesExpectation(current.sourceKind, asset.kind) || (current.participantId && asset.participantId && current.participantId !== asset.participantId)) return { kind: "invalid-binding" as const };
        const occupied = await tx.callExpectedSource.findFirst({ where: { recordingAssetId: asset.id, id: { not: current.id } }, select: { id: true } });
        if (occupied) return { kind: "asset-occupied" as const };
      }
      const beforeJson = expectedSourceSnapshot(current);
      const nextRevision = current.revision + 1;
      const updateData = input.action === "BIND"
        ? { recordingAssetId: asset.id, captureId: manifestCaptureId(asset.localManifestJson), status: "ACTIVE" as const, revision: nextRevision, latestReason: input.reason }
        : input.action === "UNBIND"
          ? { recordingAssetId: null, captureId: null, status: "ACTIVE" as const, revision: nextRevision, latestReason: input.reason }
          : { status: mutationStatus(input.action), revision: nextRevision, latestReason: input.reason };
      const updated = await tx.callExpectedSource.update({ where: { id: current.id }, data: updateData });
      const afterJson = expectedSourceSnapshot(updated);
      await tx.callExpectedSourceRevision.create({ data: { requestId: input.requestId, requestSha256, expectationId: current.id, roomId: room.id, actorUserId: session.user.id, action: prismaExpectedSourceAction(input.action), revision: nextRevision, beforeJson, afterJson, reason: input.reason } });
      const hydrated = await tx.callExpectedSource.findUniqueOrThrow({ where: { id: current.id }, include: expectationInclude });
      return { kind: "ok" as const, expectation: hydrated, replay: false };
    });
    if (result.kind === "conflict") return NextResponse.json({ ok: false, code: "REQUEST_ID_CONFLICT", error: "That request ID belongs to a different recording-plan decision." }, { status: 409, headers: PRIVATE_HEADERS });
    if (result.kind === "missing") return NextResponse.json({ ok: false, code: "NOT_FOUND", error: "The planned source no longer exists." }, { status: 404, headers: PRIVATE_HEADERS });
    if (result.kind === "stale") return NextResponse.json({ ok: false, code: "STALE_EXPECTATION", error: "The recording plan changed. Refresh before deciding.", expectation: responseView(result.expectation) }, { status: 409, headers: PRIVATE_HEADERS });
    if (result.kind === "invalid-transition") return NextResponse.json({ ok: false, code: "INVALID_EXPECTED_SOURCE_TRANSITION", error: "That action does not match the current recording-plan state. Refresh and choose an available decision." }, { status: 409, headers: PRIVATE_HEADERS });
    if (result.kind === "invalid-binding") return NextResponse.json({ ok: false, code: "INVALID_SOURCE_BINDING", error: "That retained source does not match the planned person and source kind." }, { status: 409, headers: PRIVATE_HEADERS });
    if (result.kind === "asset-occupied") return NextResponse.json({ ok: false, code: "SOURCE_ALREADY_BOUND", error: "That retained source already fulfills another recording-plan item." }, { status: 409, headers: PRIVATE_HEADERS });
    return NextResponse.json({ ok: true, idempotentReplay: result.replay, expectation: responseView(result.expectation) }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    console.error("[session-source-expectations] mutation failed", error);
    return NextResponse.json({ ok: false, code: "EXPECTED_SOURCE_UNAVAILABLE", error: "Nest could not save the recording-plan decision. Nothing was changed." }, { status: 503, headers: PRIVATE_HEADERS });
  }
}
