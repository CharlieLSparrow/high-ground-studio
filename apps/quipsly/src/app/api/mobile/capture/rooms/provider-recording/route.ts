import { NextResponse } from "next/server";
import { buildQuipslyProviderRecordingReceiptSlotManifest } from "@high-ground/quipsly-domain/coaching-meeting-spine";

import { projectProviderRecordingState } from "@/lib/provider-recording-state";
import { getPrismaClient } from "@/lib/prisma";
import {
  reconcileQuipslyLiveKitEgressRecording,
  startQuipslyLiveKitRoomCompositeEgress,
  stopQuipslyLiveKitRoomCompositeEgress,
} from "@/lib/server/coaching-livekit-egress";
import {
  getProviderRecordingEnvironment,
  processProviderRecordingCommand,
  ProviderRecordingCommandError,
} from "@/lib/server/provider-recording-command";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import {
  latestMobileCaptureConsentForParticipant,
  mobileCaptureAllPartiesReady,
  buildMobileCaptureConsentVersions,
} from "@/lib/server/mobile-capture-room-readiness";

export const runtime = "nodejs";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function paymentHoldForRoom(room: any) {
  const paymentPolicy = text(room?.booking?.paymentPolicy).toUpperCase();
  const paymentStatus = text(room?.booking?.paymentRecord?.status).toUpperCase();
  const bookingStatus = text(room?.booking?.status).toUpperCase();
  const needsPaymentEvidence =
    paymentPolicy === "PAID_ONE_TO_ONE" &&
    paymentStatus !== "PAID" &&
    ["HOLDING_PAYMENT", "REQUESTED", "CONFIRMED"].includes(bookingStatus || "HOLDING_PAYMENT");

  return {
    blocked: needsPaymentEvidence,
    paymentPolicy,
    paymentStatus: paymentStatus || "MISSING",
    bookingStatus: bookingStatus || "UNKNOWN",
  };
}

async function readJson(request: Request) {
  try {
    const value = await request.json();
    return isObject(value) ? value : {};
  } catch {
    return {};
  }
}

function normalizeAction(value: unknown) {
  const action = text(value).toUpperCase();
  return ["PREPARE_RECEIPT_SLOT", "START_EGRESS", "STOP_EGRESS", "RECONCILE_COMMAND", "RECONCILE_PROVIDER_FILE"].includes(action) ? action : "";
}

function consentGrantedForParticipant(participant: any, consents: any[]) {
  const consent = latestMobileCaptureConsentForParticipant(participant, consents);
  return mobileCaptureAllPartiesReady(
    buildMobileCaptureConsentVersions({ participants: [participant], consents: consent ? [consent] : [] }),
    "audio",
  );
}

function participantNeedsProviderConsent(participant: any) {
  return participant?.role !== "OBSERVER";
}

function asProviderReceiptSlot(asset: any) {
  if (asset?.kind !== "SERVER_MIX") return false;
  if (!["HELD", "LOCAL_READY", "UPLOADING"].includes(asset?.status)) return false;
  const manifest = isObject(asset?.localManifestJson) ? asset.localManifestJson : {};
  return manifest.source === "provider-recording-receipt-slot";
}

function providerRecordingManifest(input: {
  room: any;
  userId: string;
  now: Date;
  existing?: boolean;
}) {
  return buildQuipslyProviderRecordingReceiptSlotManifest({
    provider: input.room.provider,
    providerRoomId: input.room.providerRoomId,
    callRoomId: input.room.id,
    captureGroupId: input.room.captureGroupId,
    preparedAt: input.now.toISOString(),
    preparedByUserId: input.userId,
    reusedExistingSlot: input.existing === true,
  });
}

function roomAccessWhere(callRoomId: string, user: { id: string; isStaff?: boolean }) {
  return user.isStaff
    ? { id: callRoomId }
    : {
        id: callRoomId,
        OR: [
          { createdByUserId: user.id },
          { participants: { some: { userId: user.id, accessStatus: "ACTIVE" } } },
          { booking: { clientUserId: user.id } },
          { booking: { coachUserId: user.id } },
        ],
      };
}

export async function GET(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) {
    return NextResponse.json(
      { ok: false, error: "Sign in before reading provider recording evidence." },
      { status: 401 },
    );
  }
  const callRoomId = text(new URL(request.url).searchParams.get("callRoomId"));
  if (!callRoomId) {
    return NextResponse.json(
      { ok: false, error: "Choose a Quipsly capture room before reading provider recording evidence." },
      { status: 400 },
    );
  }
  const prisma = getPrismaClient() as any;
  const room = await prisma.callRoom.findFirst({
    where: roomAccessWhere(callRoomId, session.user),
    select: {
      id: true,
      status: true,
      provider: true,
      captureGroupId: true,
      metadataJson: true,
      booking: { include: { paymentRecord: true } },
      providerRecordingCommands: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          action: true,
          status: true,
          providerEgressId: true,
          recordingAssetId: true,
          errorCode: true,
          errorMessage: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      recordingAssets: {
        where: { kind: "SERVER_MIX" },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          kind: true,
          status: true,
          localManifestJson: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });
  if (!room) {
    return NextResponse.json(
      { ok: false, error: "You do not have access to this capture room." },
      { status: 404 },
    );
  }
  const environment = getProviderRecordingEnvironment();
  const projection = projectProviderRecordingState(room);
  const paymentHold = paymentHoldForRoom(room);
  return NextResponse.json({
    ok: true,
    providerRecording: {
      state: projection.state,
      optionalWitness: true,
      affectsCaptureGroupSync: false,
      syncAuthority: "server-owned capture group, device clock receipts, protected local masters, and waveform/drift review",
      canOperate: Boolean(session.user.isStaff),
      configured: environment.missing.length === 0,
      enabled: environment.egressEnabled,
      paymentHeld: paymentHold.blocked,
      nextAction: projection.nextAction,
      activeRecordingAssetId: projection.activeAsset?.id || projection.activeStart?.recordingAssetId || null,
      latestCommand: projection.latest
        ? {
            id: projection.latest.id,
            action: projection.latest.action,
            status: projection.latest.status,
            errorCode: projection.latest.errorCode,
            message: projection.latest.errorMessage,
            updatedAt: projection.latest.updatedAt,
          }
        : null,
    },
  });
}

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);

  if (!session?.user) {
    return NextResponse.json(
      { ok: false, error: "Sign in before preparing provider recording evidence." },
      { status: 401 },
    );
  }

  const body = await readJson(request);
  const callRoomId = text(body.callRoomId);
  const action = normalizeAction(body.action);
  const recordingAssetId = text(body.recordingAssetId);
  const commandId = text(body.commandId);
  const requestId = text(body.requestId);

  if (!callRoomId) {
    return NextResponse.json(
      { ok: false, error: "Choose a Quipsly capture room before preparing provider recording evidence." },
      { status: 400 },
    );
  }

  if (!action) {
    return NextResponse.json(
      { ok: false, error: "Choose a valid provider recording action: PREPARE_RECEIPT_SLOT, START_EGRESS, STOP_EGRESS, RECONCILE_COMMAND, or RECONCILE_PROVIDER_FILE." },
      { status: 400 },
    );
  }

  if (["START_EGRESS", "STOP_EGRESS"].includes(action) && !requestId) {
    return NextResponse.json(
      {
        ok: false,
        code: "PROVIDER_RECORDING_REQUEST_ID_REQUIRED",
        error: "Provider START and STOP require a stable UUID requestId so retries cannot duplicate external recording actions.",
      },
      { status: 400 },
    );
  }

  if (action !== "PREPARE_RECEIPT_SLOT" && !session.user.isStaff) {
    return NextResponse.json(
      {
        ok: false,
        error: "Provider egress start, stop, and reconciliation are staff-only until the in-app recording UX is mature.",
        providerRecording: {
          startsWithJoin: false,
          requiresExplicitStart: true,
          requiresAllParticipantConsent: true,
          receiptRequiredBeforeTranscript: true,
          currentStatus: "staff-required",
          externalRecordingStarted: false,
          nextAction: "Use local recording in the capture app, or ask a Quipsly operator to control provider egress.",
        },
      },
      { status: 403 },
    );
  }

  const prisma = getPrismaClient() as any;
  const userId = session.user.id;
  const room = await prisma.callRoom.findFirst({
    where: roomAccessWhere(callRoomId, session.user),
    include: {
      booking: { include: { paymentRecord: true } },
      participants: { where: { accessStatus: "ACTIVE" } },
      recordingConsents: true,
      recordingAssets: true,
    },
  });

  if (!room) {
    return NextResponse.json(
      { ok: false, error: "You do not have access to this capture room." },
      { status: 404 },
    );
  }

  if (
    ["PREPARE_RECEIPT_SLOT", "START_EGRESS"].includes(action)
    && ["ENDED", "CANCELED", "FAILED"].includes(room.status)
  ) {
    return NextResponse.json(
      { ok: false, error: "This capture room is closed. Create a new room before preparing provider recording." },
      { status: 409 },
    );
  }

  if (action === "RECONCILE_COMMAND") {
    if (!commandId) {
      return NextResponse.json(
        { ok: false, error: "Choose the durable provider command that needs reconciliation." },
        { status: 400 },
      );
    }
    const command = await prisma.providerRecordingCommand.findFirst({
      where: { id: commandId, roomId: room.id },
      select: { id: true, status: true },
    });
    if (!command) {
      return NextResponse.json(
        { ok: false, error: "That provider command does not belong to this capture room." },
        { status: 404 },
      );
    }
    let result;
    try {
      result = await processProviderRecordingCommand({ commandId: command.id });
    } catch (error) {
      if (error instanceof ProviderRecordingCommandError) {
        return NextResponse.json(
          { ok: false, code: error.code, error: error.message },
          { status: error.status },
        );
      }
      throw error;
    }
    const accepted = ["started", "stopped", "queued", "processing", "reconcile-required"].includes(result.status);
    return NextResponse.json({
      ok: accepted,
      action,
      providerRecording: {
        startsWithJoin: false,
        requiresExplicitStart: true,
        requiresAllParticipantConsent: true,
        receiptRequiredBeforeTranscript: true,
        currentStatus: result.status,
        externalRecordingStarted: result.status === "started",
        egressId: result.egressId ?? null,
        nextAction: result.message,
      },
      command: {
        id: result.commandId,
        requestId: result.requestId,
        status: result.status,
        idempotentReplay: result.idempotentReplay,
      },
      recordingAssetId: result.recordingAssetId ?? null,
      callRoomId: result.callRoomId,
      message: result.message,
    }, { status: ["started", "stopped"].includes(result.status) ? 200 : accepted ? 202 : 409 });
  }

  const paymentHold = paymentHoldForRoom(room);
  if (paymentHold.blocked && ["PREPARE_RECEIPT_SLOT", "START_EGRESS"].includes(action)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Provider recording evidence cannot be prepared for a paid one-to-one coaching session until payment evidence is resolved.",
        providerRecording: {
          startsWithJoin: false,
          requiresExplicitStart: true,
          requiresAllParticipantConsent: true,
          receiptRequiredBeforeTranscript: true,
          currentStatus: "payment-hold",
          externalRecordingStarted: false,
          nextAction: "Resolve payment evidence in Quipsly before preparing provider recording evidence.",
        },
        paymentBoundary: {
          paymentPolicy: paymentHold.paymentPolicy,
          paymentStatus: paymentHold.paymentStatus,
          bookingStatus: paymentHold.bookingStatus,
          stripeIsEvidenceOnly: true,
          noPaymentMutation: true,
        },
      },
      { status: 409 },
    );
  }

  let participant = room.participants.find((item: any) => item.userId === userId);
  const participants = [...room.participants];
  if (!participant && action === "PREPARE_RECEIPT_SLOT") {
    const role = room.booking?.coachUserId === userId ? "COACH" : room.booking?.clientUserId === userId ? "CLIENT" : "GUEST";
    participant = await prisma.callParticipant.create({
      data: {
        roomId: room.id,
        userId,
        displayName: session.user.name || session.user.primaryEmail || "Quipsly participant",
        email: session.user.primaryEmail,
        role,
        deviceLabel: "Quipsly iOS Capture",
      },
    });
    participants.push(participant);
  }

  const participantsNeedingConsent = participants.filter(participantNeedsProviderConsent);
  const allConsentGranted =
    participantsNeedingConsent.length > 0
    && participantsNeedingConsent.every((item) => consentGrantedForParticipant(item, room.recordingConsents));

  if (!allConsentGranted && ["PREPARE_RECEIPT_SLOT", "START_EGRESS"].includes(action)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Provider recording receipt slots require explicit consent from every non-observer participant.",
        providerRecording: {
          startsWithJoin: false,
          requiresExplicitStart: true,
          requiresAllParticipantConsent: true,
          receiptRequiredBeforeTranscript: true,
          currentStatus: "consent-required",
          externalRecordingStarted: false,
          nextAction: "Collect explicit recording consent from every participant before preparing provider egress evidence.",
        },
      },
      { status: 409 },
    );
  }

  if (action === "START_EGRESS") {
    let result;
    try {
      result = await startQuipslyLiveKitRoomCompositeEgress({
        callRoomId: room.id,
        operatorUserId: userId,
        requestId,
      });
    } catch (error) {
      if (error instanceof ProviderRecordingCommandError) {
        return NextResponse.json(
          { ok: false, code: error.code, error: error.message },
          { status: error.status },
        );
      }
      throw error;
    }
    const accepted = ["started", "queued", "processing", "reconcile-required"].includes(result.status);
    return NextResponse.json({
      ok: accepted,
      action,
      providerRecording: {
        startsWithJoin: false,
        requiresExplicitStart: true,
        requiresAllParticipantConsent: true,
        receiptRequiredBeforeTranscript: true,
        currentStatus: result.status,
        externalRecordingStarted: result.status === "started",
        egressId: result.egressId ?? null,
        nextAction: result.message,
      },
      command: {
        id: result.commandId,
        requestId: result.requestId,
        status: result.status,
        idempotentReplay: result.idempotentReplay,
      },
      recordingAssetId: result.recordingAssetId ?? null,
      callRoomId: result.callRoomId,
      message: result.message,
    }, { status: result.status === "started" ? 200 : accepted ? 202 : 409 });
  }

  if (action === "STOP_EGRESS") {
    let result;
    try {
      result = await stopQuipslyLiveKitRoomCompositeEgress({
        callRoomId: room.id,
        operatorUserId: userId,
        requestId,
      });
    } catch (error) {
      if (error instanceof ProviderRecordingCommandError) {
        return NextResponse.json(
          { ok: false, code: error.code, error: error.message },
          { status: error.status },
        );
      }
      throw error;
    }
    const accepted = ["stopped", "queued", "processing", "reconcile-required"].includes(result.status);
    return NextResponse.json({
      ok: accepted,
      action,
      providerRecording: {
        startsWithJoin: false,
        requiresExplicitStart: true,
        requiresAllParticipantConsent: true,
        receiptRequiredBeforeTranscript: true,
        currentStatus: result.status,
        externalRecordingStarted: false,
        egressId: result.egressId ?? null,
        nextAction: result.message,
      },
      command: {
        id: result.commandId,
        requestId: result.requestId,
        status: result.status,
        idempotentReplay: result.idempotentReplay,
      },
      recordingAssetId: result.recordingAssetId ?? null,
      callRoomId: result.callRoomId,
      message: result.message,
    }, { status: result.status === "stopped" ? 200 : accepted ? 202 : 409 });
  }

  if (action === "RECONCILE_PROVIDER_FILE") {
    if (!recordingAssetId) {
      return NextResponse.json(
        { ok: false, error: "Choose a provider recording asset before reconciling provider file evidence." },
        { status: 400 },
      );
    }

    const result = await reconcileQuipslyLiveKitEgressRecording({ recordingAssetId, operatorUserId: userId });
    return NextResponse.json({
      ok: result.status === "verified",
      action,
      providerRecording: {
        startsWithJoin: false,
        requiresExplicitStart: true,
        requiresAllParticipantConsent: true,
        receiptRequiredBeforeTranscript: true,
        currentStatus: result.status,
        externalRecordingStarted: false,
        nextAction: result.message,
      },
      recordingAssetId: result.recordingAssetId,
      transcriptJobId: result.transcriptJobId ?? null,
      callRoomId: result.callRoomId,
      message: result.message,
    }, { status: result.status === "failed" ? 500 : result.status === "verified" ? 200 : 409 });
  }

  const now = new Date();
  const existing = room.recordingAssets.find(asProviderReceiptSlot);
  const asset = existing || await prisma.recordingAsset.create({
    data: {
      roomId: room.id,
      participantId: participant.id,
      kind: "SERVER_MIX",
      status: "HELD",
      fileName: `${room.provider || "provider"}-${room.id}-recording-receipt-slot.json`,
      contentType: "application/json",
      localManifestJson: providerRecordingManifest({ room, userId, now }),
      segmentsJson: [],
      errorMessage: "Provider recording has not started. This is a receipt slot only.",
    },
  });

  const manifest = providerRecordingManifest({ room, userId, now, existing: Boolean(existing) });

  await prisma.callRoom.update({
    where: { id: room.id },
    data: {
      metadataJson: {
        ...(isObject(room.metadataJson) ? room.metadataJson : {}),
        providerRecording: {
          ...manifest,
          receiptSlotRecordingAssetId: asset.id,
        },
      },
    },
  });

  return NextResponse.json({
    ok: true,
    reusedExistingSlot: Boolean(existing),
    room: {
      id: room.id,
      status: room.status,
      provider: room.provider,
      providerRoomId: room.providerRoomId,
    },
    recordingAsset: {
      id: asset.id,
      kind: asset.kind,
      status: asset.status,
      fileName: asset.fileName,
    },
    providerRecording: {
      ...manifest,
      receiptSlotRecordingAssetId: asset.id,
    },
    nextAction:
      "Receipt slot is ready. Do not start provider egress until Quipsly has a visible start action and can attach provider receipt evidence.",
  });
}
