import { NextResponse } from "next/server";
import { buildQuipslyProviderRecordingReceiptSlotManifest } from "@high-ground/quipsly-domain/coaching-meeting-spine";

import { getPrismaClient } from "@/lib/prisma";
import {
  reconcileQuipslyLiveKitEgressRecording,
  startQuipslyLiveKitRoomCompositeEgress,
  stopQuipslyLiveKitRoomCompositeEgress,
} from "@/lib/server/coaching-livekit-egress";
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
  return ["PREPARE_RECEIPT_SLOT", "START_EGRESS", "STOP_EGRESS", "RECONCILE_PROVIDER_FILE"].includes(action) ? action : "";
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
    preparedAt: input.now.toISOString(),
    preparedByUserId: input.userId,
    reusedExistingSlot: input.existing === true,
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

  if (!callRoomId) {
    return NextResponse.json(
      { ok: false, error: "Choose a Quipsly capture room before preparing provider recording evidence." },
      { status: 400 },
    );
  }

  if (!action) {
    return NextResponse.json(
      { ok: false, error: "Choose a valid provider recording action: PREPARE_RECEIPT_SLOT, START_EGRESS, STOP_EGRESS, or RECONCILE_PROVIDER_FILE." },
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
    where: session.user.isStaff
      ? { id: callRoomId }
      : {
          id: callRoomId,
          OR: [
            { createdByUserId: userId },
            { participants: { some: { userId } } },
            { booking: { clientUserId: userId } },
            { booking: { coachUserId: userId } },
          ],
        },
    include: {
      booking: { include: { paymentRecord: true } },
      participants: true,
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

  if (["ENDED", "CANCELED", "FAILED"].includes(room.status)) {
    return NextResponse.json(
      { ok: false, error: "This capture room is closed. Create a new room before preparing provider recording." },
      { status: 409 },
    );
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
  if (!participant) {
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
    const result = await startQuipslyLiveKitRoomCompositeEgress({ callRoomId: room.id, operatorUserId: userId });
    return NextResponse.json({
      ok: result.status === "started",
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
      recordingAssetId: result.recordingAssetId ?? null,
      callRoomId: result.callRoomId,
      message: result.message,
    }, { status: result.status === "started" ? 200 : 409 });
  }

  if (action === "STOP_EGRESS") {
    const result = await stopQuipslyLiveKitRoomCompositeEgress({ callRoomId: room.id, operatorUserId: userId });
    return NextResponse.json({
      ok: result.status === "stopped",
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
      recordingAssetId: result.recordingAssetId ?? null,
      callRoomId: result.callRoomId,
      message: result.message,
    }, { status: result.status === "stopped" ? 200 : 409 });
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
