import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import {
  sessionAccessWhere,
  sessionInvitationAccessWhere,
} from "@/lib/server/session-access";
import {
  buildMobileCaptureConsentVersions,
  mobileCaptureAllPartiesReady,
  mobileCaptureConsentVersion,
} from "@/lib/server/mobile-capture-room-readiness";
import { normalizedCaptureReceiptOccurredAt } from "@/lib/server/capture-room-state-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Authorization, Cookie",
};
const ACK_STATES = new Set([
  "OBSERVED",
  "STARTED",
  "START_FAILED",
  "STOPPING",
  "STOPPED",
  "STOP_FAILED",
]);

function privateJson(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: PRIVATE_HEADERS });
}

function text(value: unknown, maximum = 240) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function uuid(value: unknown) {
  const candidate = text(value, 64).toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    candidate,
  )
    ? candidate
    : "";
}

function opaqueEndpointId(roomId: string, clientInstanceId: string) {
  return `recording-endpoint-${createHash("sha256")
    .update(`${roomId}\0${clientInstanceId}`)
    .digest("hex")
    .slice(0, 20)}`;
}

function opaqueParticipantId(roomId: string, participantId: string) {
  return `recording-participant-${createHash("sha256")
    .update(`${roomId}\0${participantId}`)
    .digest("hex")
    .slice(0, 20)}`;
}

type ExpectedRecordingParticipant = { id: string; label: string };

function participantRecordingState(action: string, receipts: any[]) {
  const states = new Set(receipts.map((receipt) => receipt.state));
  if (states.has("START_FAILED") || states.has("STOP_FAILED"))
    return "NEEDS_ATTENTION";
  if (action === "START") {
    if (states.has("STARTED")) return "RECORDING";
    if (states.has("OBSERVED")) return "GETTING_READY";
    return "WAITING";
  }
  if (
    receipts.length > 0 &&
    receipts.every((receipt) => receipt.state === "STOPPED")
  )
    return "STOPPED_SAFELY";
  if (states.has("STOPPING") || states.has("STOPPED")) return "STOPPING";
  return "WAITING";
}

function directiveView(
  directive: any,
  options: {
    viewerParticipantId?: string | null;
    includeAllEndpoints?: boolean;
    participantLabels?: Map<string, string>;
    expectedParticipants?: ExpectedRecordingParticipant[];
  } = {},
) {
  if (!directive) return null;
  const latestByEndpoint = new Map<string, any>();
  for (const receipt of directive.receipts ?? []) {
    if (
      !options.includeAllEndpoints &&
      receipt.participantId !== options.viewerParticipantId
    ) {
      continue;
    }
    if (!latestByEndpoint.has(receipt.clientInstanceId))
      latestByEndpoint.set(receipt.clientInstanceId, receipt);
  }
  const endpointReceipts = [...latestByEndpoint.values()];
  const participantStatuses = (options.expectedParticipants ?? []).map(
    (participant) => {
      const participantReceipts = endpointReceipts.filter(
        (receipt) => receipt.participantId === participant.id,
      );
      const state = participantRecordingState(
        directive.action,
        participantReceipts,
      );
      return {
        id: opaqueParticipantId(directive.roomId, participant.id),
        participantLabel: participant.label,
        state,
        endpointCount: participantReceipts.length,
        recordingEndpointCount: participantReceipts.filter(
          (receipt) => receipt.state === "STARTED",
        ).length,
        attentionEndpointCount: participantReceipts.filter((receipt) =>
          ["START_FAILED", "STOP_FAILED"].includes(receipt.state),
        ).length,
      };
    },
  );
  const recordingHealth = {
    expectedParticipantCount: participantStatuses.length,
    participantWithEndpointCount: participantStatuses.filter(
      (participant) => participant.endpointCount > 0,
    ).length,
    recordingParticipantCount: participantStatuses.filter(
      (participant) => participant.state === "RECORDING",
    ).length,
    attentionParticipantCount: participantStatuses.filter(
      (participant) => participant.state === "NEEDS_ATTENTION",
    ).length,
    waitingParticipantCount: participantStatuses.filter((participant) =>
      ["WAITING", "GETTING_READY", "STOPPING"].includes(participant.state),
    ).length,
    allParticipantsRecording:
      participantStatuses.length > 0 &&
      participantStatuses.every(
        (participant) => participant.state === "RECORDING",
      ),
    allParticipantsStoppedSafely:
      participantStatuses.length > 0 &&
      participantStatuses.every(
        (participant) => participant.state === "STOPPED_SAFELY",
      ),
  };
  return {
    id: directive.id,
    sequence: String(directive.sequence),
    action: directive.action,
    captureGroupId: directive.captureGroupId,
    issuedAt: new Date(directive.issuedAt).toISOString(),
    issuedByCurrentActor: directive.issuedByCurrentActor === true,
    shouldRecord: directive.action === "START",
    participantStatuses,
    recordingHealth,
    endpointReceipts: endpointReceipts.map((receipt) => ({
      id: opaqueEndpointId(directive.roomId, receipt.clientInstanceId),
      clientKind: receipt.clientKind,
      deviceLabel: receipt.deviceLabel,
      participantLabel:
        options.participantLabels?.get(receipt.participantId) ??
        "Session participant",
      state: receipt.state,
      captureId: receipt.captureId ?? null,
      detail: receipt.detail ?? null,
      occurredAt: new Date(receipt.occurredAt).toISOString(),
      receivedAt: new Date(receipt.receivedAt).toISOString(),
    })),
  };
}

async function readLatest(prisma: any, roomId: string, actorUserId: string) {
  const directive = await prisma.callRecordingDirective.findFirst({
    where: { roomId },
    orderBy: { sequence: "desc" },
    include: { receipts: { orderBy: { receivedAt: "desc" }, take: 500 } },
  });
  if (directive)
    directive.issuedByCurrentActor = directive.actorUserId === actorUserId;
  return directive;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id)
    return privateJson(
      {
        ok: false,
        code: "AUTH_REQUIRED",
        error: "Sign in before joining private recording coordination.",
      },
      401,
    );
  const { roomId: rawRoomId } = await context.params;
  const roomId = text(rawRoomId);
  const prisma = getPrismaClient() as any;
  const room = await prisma.callRoom.findFirst({
    where: sessionAccessWhere(roomId, session.user),
    select: {
      id: true,
      captureGroupId: true,
      participants: {
        where: { accessStatus: "ACTIVE" },
        select: { id: true, userId: true, role: true, displayName: true },
      },
    },
  });
  if (!room)
    return privateJson(
      {
        ok: false,
        code: "NOT_FOUND",
        error: "This private Session is unavailable.",
      },
      404,
    );
  const viewerParticipant = room.participants.find(
    (participant: any) => participant.userId === session.user.id,
  );
  const controller = await prisma.callRoom.findFirst({
    where: sessionInvitationAccessWhere(room.id, session.user),
    select: { id: true },
  });
  const participantLabels = new Map<string, string>(
    room.participants.map((participant: any) => [
      participant.id,
      !controller && participant.id === viewerParticipant?.id
        ? "You"
        : text(participant.displayName) || "Session participant",
    ]),
  );
  const expectedParticipants = (
    controller
      ? room.participants
      : viewerParticipant
        ? [viewerParticipant]
        : []
  ).map((participant: any) => ({
    id: participant.id,
    label:
      participantLabels.get(participant.id) ??
      (participant.id === viewerParticipant?.id
        ? "You"
        : "Session participant"),
  }));
  const latest = await readLatest(prisma, room.id, session.user.id);
  return privateJson({
    ok: true,
    directive: directiveView(latest, {
      viewerParticipantId: viewerParticipant?.id,
      includeAllEndpoints: Boolean(controller),
      participantLabels,
      expectedParticipants,
    }),
    captureGroupId: room.captureGroupId,
    boundaries: {
      directiveIsIntentNotRecordedMedia: true,
      endpointReceiptIsNotVerifiedUpload: true,
      controllerCanSeeAllEndpointStates: Boolean(controller),
      joiningNeverStartsRecording: true,
    },
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id)
    return privateJson(
      {
        ok: false,
        code: "AUTH_REQUIRED",
        error: "Sign in before controlling a Session recording.",
      },
      401,
    );
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const requestId = uuid(body?.requestId);
  const action = text(body?.action, 16).toUpperCase();
  if (!requestId || !["START", "STOP"].includes(action))
    return privateJson(
      {
        ok: false,
        code: "INVALID_DIRECTIVE",
        error: "A unique request ID and START or STOP action are required.",
      },
      400,
    );
  const { roomId: rawRoomId } = await context.params;
  const roomId = text(rawRoomId);
  const prisma = getPrismaClient() as any;
  const room = await prisma.callRoom.findFirst({
    where: sessionInvitationAccessWhere(roomId, session.user),
    select: {
      id: true,
      captureGroupId: true,
      status: true,
      participants: {
        where: { accessStatus: "ACTIVE" },
        select: { id: true, userId: true, role: true, displayName: true },
      },
      recordingConsents: true,
    },
  });
  if (!room)
    return privateJson(
      {
        ok: false,
        code: "CONTROL_REQUIRED",
        error:
          "Only the coach, host, producer, or Session owner can control recording.",
      },
      403,
    );
  const actorParticipant =
    room.participants.find(
      (participant: any) => participant.userId === session.user.id,
    ) ?? null;
  const participantLabels = new Map<string, string>(
    room.participants.map((participant: any) => [
      participant.id,
      text(participant.displayName) ||
        (participant.id === actorParticipant?.id
          ? "You"
          : "Session participant"),
    ]),
  );
  const expectedParticipants = room.participants.map((participant: any) => ({
    id: participant.id,
    label: participantLabels.get(participant.id) ?? "Session participant",
  }));
  const consentVersions = buildMobileCaptureConsentVersions({
    participants: room.participants,
    consents: room.recordingConsents,
  });
  if (
    action === "START" &&
    !mobileCaptureAllPartiesReady(consentVersions, "audio")
  ) {
    return privateJson(
      {
        ok: false,
        code: "CONSENT_REQUIRED",
        error: "Everyone in the Session must agree before recording starts.",
      },
      409,
    );
  }
  const requestSha256 = createHash("sha256")
    .update(
      JSON.stringify({
        roomId: room.id,
        captureGroupId: room.captureGroupId,
        actorUserId: session.user.id,
        action,
      }),
    )
    .digest("hex");
  try {
    const result = await prisma.$transaction(async (tx: any) => {
      await tx.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtextextended(${room.id}, 0))`;
      const existing = await tx.callRecordingDirective.findUnique({
        where: { requestId },
        include: { receipts: { orderBy: { receivedAt: "desc" }, take: 500 } },
      });
      if (existing)
        return existing.requestSha256 === requestSha256
          ? { kind: "ok" as const, directive: existing, replay: true }
          : { kind: "conflict" as const };
      const latest = await tx.callRecordingDirective.findFirst({
        where: { roomId: room.id },
        orderBy: { sequence: "desc" },
      });
      if (action === "START" && latest?.action === "START")
        return { kind: "already-started" as const, directive: latest };
      if (action === "STOP" && latest?.action !== "START")
        return { kind: "already-stopped" as const, directive: latest };
      const directive = await tx.callRecordingDirective.create({
        data: {
          requestId,
          roomId: room.id,
          captureGroupId: room.captureGroupId,
          actorUserId: session.user.id,
          actorParticipantId: actorParticipant?.id ?? null,
          action,
          allPartyConsentVersion:
            action === "START"
              ? mobileCaptureConsentVersion(consentVersions)
              : null,
          requestSha256,
          issuedAt: new Date(),
          metadataJson: {
            schema: "quipsly-call-recording-directive-v1",
            consentVersions: action === "START" ? consentVersions : [],
            commandIsNotCaptureProof: true,
          },
        },
        include: { receipts: true },
      });
      return { kind: "ok" as const, directive, replay: false };
    });
    if (result.kind === "conflict")
      return privateJson(
        {
          ok: false,
          code: "REQUEST_ID_CONFLICT",
          error: "That request ID belongs to a different recording command.",
        },
        409,
      );
    if (result.kind === "already-started")
      return privateJson(
        {
          ok: false,
          code: "ALREADY_RECORDING",
          error: "This Session already has an active recording command.",
          directive: directiveView(result.directive, {
            includeAllEndpoints: true,
            participantLabels,
            expectedParticipants,
          }),
        },
        409,
      );
    if (result.kind === "already-stopped")
      return privateJson(
        {
          ok: false,
          code: "NOT_RECORDING",
          error: "This Session is not currently under a recording command.",
          directive: directiveView(result.directive, {
            includeAllEndpoints: true,
            participantLabels,
            expectedParticipants,
          }),
        },
        409,
      );
    result.directive.issuedByCurrentActor = true;
    return privateJson(
      {
        ok: true,
        idempotentReplay: result.replay,
        directive: directiveView(result.directive, {
          includeAllEndpoints: true,
          participantLabels,
          expectedParticipants,
        }),
      },
      result.replay ? 200 : 201,
    );
  } catch (error) {
    console.error("[session-recording-directive] command failed", error);
    return privateJson(
      {
        ok: false,
        code: "DIRECTIVE_UNAVAILABLE",
        error:
          "Quipsly could not coordinate recording. No endpoint should change state until the command is durable.",
      },
      503,
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id)
    return privateJson(
      {
        ok: false,
        code: "AUTH_REQUIRED",
        error: "Sign in before acknowledging recording coordination.",
      },
      401,
    );
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const receiptId = uuid(body?.receiptId);
  const directiveId = uuid(body?.directiveId);
  const captureId = body?.captureId == null ? "" : uuid(body.captureId);
  const state = text(body?.state, 32).toUpperCase();
  const clientInstanceId = text(body?.clientInstanceId, 240);
  const clientKind = text(body?.clientKind, 32).toLowerCase();
  const deviceLabel = text(body?.deviceLabel, 240);
  const rawOccurredAt = text(body?.occurredAt, 64);
  const occurredAt = normalizedCaptureReceiptOccurredAt(rawOccurredAt);
  if (
    !receiptId ||
    !directiveId ||
    !ACK_STATES.has(state) ||
    !clientInstanceId ||
    !clientKind ||
    !deviceLabel ||
    (body?.captureId != null && !captureId)
  ) {
    return privateJson(
      {
        ok: false,
        code: "INVALID_ENDPOINT_RECEIPT",
        error:
          "A valid directive, endpoint identity, state, and unique receipt are required.",
      },
      400,
    );
  }
  const { roomId: rawRoomId } = await context.params;
  const roomId = text(rawRoomId);
  const prisma = getPrismaClient() as any;
  const room = await prisma.callRoom.findFirst({
    where: sessionAccessWhere(roomId, session.user),
    select: {
      id: true,
      participants: {
        where: { userId: session.user.id, accessStatus: "ACTIVE" },
        select: { id: true },
      },
    },
  });
  const participant = room?.participants[0];
  if (!room || !participant)
    return privateJson(
      {
        ok: false,
        code: "PARTICIPANT_REQUIRED",
        error:
          "Join this private Session before acknowledging a recording command.",
      },
      403,
    );
  const endpoint =
    (await prisma.callParticipantProviderGrantReceipt.findFirst({
      where: {
        roomId: room.id,
        participantId: participant.id,
        clientInstanceId,
        clientKind: { equals: clientKind, mode: "insensitive" },
      },
      select: { id: true },
    })) ??
    (await prisma.callParticipantPreflightReceipt.findFirst({
      where: {
        roomId: room.id,
        participantId: participant.id,
        clientInstanceId,
        clientKind: { equals: clientKind, mode: "insensitive" },
      },
      select: { id: true },
    }));
  if (!endpoint)
    return privateJson(
      {
        ok: false,
        code: "UNKNOWN_ENDPOINT",
        error:
          "Run the device check on this exact installation before recording.",
      },
      409,
    );
  const directive = await prisma.callRecordingDirective.findFirst({
    where: { id: directiveId, roomId: room.id },
    select: { id: true, action: true },
  });
  if (!directive)
    return privateJson(
      {
        ok: false,
        code: "DIRECTIVE_NOT_FOUND",
        error: "This recording command is no longer available in the Session.",
      },
      404,
    );
  try {
    const existing = await prisma.callRecordingEndpointReceipt.findUnique({
      where: { id: receiptId },
    });
    if (existing) {
      const replayOccurredAt = rawOccurredAt
        ? normalizedCaptureReceiptOccurredAt(
            rawOccurredAt,
            existing.receivedAt ?? existing.occurredAt,
          )
        : existing.occurredAt;
      const matches =
        existing.directiveId === directive.id &&
        existing.actorUserId === session.user.id &&
        existing.clientInstanceId === clientInstanceId &&
        existing.state === state &&
        (existing.captureId ?? null) === (captureId || null) &&
        existing.occurredAt.getTime() === replayOccurredAt.getTime();
      if (!matches)
        return privateJson(
          {
            ok: false,
            code: "RECEIPT_ID_CONFLICT",
            error: "That receipt ID belongs to different endpoint evidence.",
          },
          409,
        );
      return privateJson({
        ok: true,
        idempotentReplay: true,
        endpointReceipt: {
          state: existing.state,
          captureId: existing.captureId ?? null,
          occurredAt: existing.occurredAt.toISOString(),
        },
      });
    }
    const receipt = await prisma.callRecordingEndpointReceipt.create({
      data: {
        id: receiptId,
        directiveId: directive.id,
        roomId: room.id,
        participantId: participant.id,
        actorUserId: session.user.id,
        clientInstanceId,
        clientKind,
        deviceLabel,
        state,
        captureId: captureId || null,
        detail: text(body?.detail, 1000) || null,
        occurredAt,
        evidenceJson: {
          schema: "quipsly-call-recording-endpoint-receipt-v1",
          directiveAction: directive.action,
          receiptIsNotVerifiedUpload: true,
          clientOccurredAtProvided: Boolean(rawOccurredAt),
        },
      },
    });
    return privateJson(
      {
        ok: true,
        idempotentReplay: false,
        endpointReceipt: {
          state: receipt.state,
          captureId: receipt.captureId ?? null,
          occurredAt: receipt.occurredAt.toISOString(),
        },
      },
      201,
    );
  } catch (error) {
    console.error(
      "[session-recording-directive] endpoint acknowledgment failed",
      error,
    );
    return privateJson(
      {
        ok: false,
        code: "ENDPOINT_RECEIPT_UNAVAILABLE",
        error:
          "Keep the local recording state and retry this coordination receipt.",
      },
      503,
    );
  }
}
