import { NextResponse } from "next/server";
import { buildQuipslyMeetingJoinSpine } from "@high-ground/quipsly-domain/coaching-meeting-spine";

import { getPrismaClient } from "@/lib/prisma";
import { createLiveKitJoinToken } from "@/lib/server/livekit-join-token";
import {
  captureRoomAccessWhere,
  paymentHoldForRoom,
  roomJoinText as text,
} from "@/lib/server/mobile-capture-room-join-diagnostics";
import {
  buildMobileCaptureConsentVersions,
  latestMobileCaptureConsentForParticipant,
  mobileCaptureAllPartiesReady,
} from "@/lib/server/mobile-capture-room-readiness";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

export const runtime = "nodejs";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson(request: Request) {
  try {
    const value = await request.json();
    return isObject(value) ? value : {};
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);

  if (!session?.user) {
    return NextResponse.json(
      { ok: false, error: "Sign in before joining a capture room." },
      { status: 401 },
    );
  }

  const body = await readJson(request);
  const callRoomId = text(body.callRoomId);

  if (!callRoomId) {
    return NextResponse.json(
      { ok: false, error: "Choose a Quipsly capture session before joining a room." },
      { status: 400 },
    );
  }

  const prisma = getPrismaClient() as any;
  const userId = session.user.id;
  const room = await prisma.callRoom.findFirst({
    where: captureRoomAccessWhere(callRoomId, session.user),
    include: {
      booking: { include: { paymentRecord: true } },
      participants: true,
      recordingConsents: true,
    },
  });

  if (!room) {
    return NextResponse.json(
      { ok: false, error: "You do not have access to this capture room." },
      { status: 404 },
    );
  }

  if (!["PLANNED", "OPEN", "RECORDING"].includes(room.status)) {
    return NextResponse.json(
      { ok: false, error: "This capture room is not open for joining." },
      { status: 409 },
    );
  }

  const paymentHold = paymentHoldForRoom(room);
  if (paymentHold.blocked) {
    return NextResponse.json(
      {
        ok: false,
        error: "This paid one-to-one coaching session is waiting on payment evidence before joining or recording.",
        canJoin: false,
        provider: room.provider || "planned",
        providerReadiness: "payment-hold",
        callRoomId: room.id,
        paymentBoundary: {
          paymentPolicy: paymentHold.paymentPolicy,
          paymentStatus: paymentHold.paymentStatus,
          bookingStatus: paymentHold.bookingStatus,
          stripeIsEvidenceOnly: true,
          noPaymentMutation: true,
        },
        recordingBoundary: {
          joiningStartsRecording: false,
          localRecordingRequiresConsent: true,
          providerRecordingRequiresAllParticipantConsent: true,
          visibleRecordingIndicatorRequired: true,
          recordingConsentGranted: false,
          nextAction: "Resolve payment evidence in Quipsly before joining, recording locally, or preparing provider recording.",
        },
        effects: {
          sideEffectFree: true,
          participantCreated: false,
          providerJoined: false,
          recordingStarted: false,
          providerRecordingStarted: false,
          tokenMinted: false,
          tokenReturned: false,
          externalMutated: false,
          stripeMutated: false,
          calendarMutated: false,
          mediaMutated: false,
          storageMutated: false,
          secretExposed: false,
        },
        localFallback: {
          available: true,
          safeToRecordLocally: false,
          reason: "payment-hold",
          nextAction: "Local recording is held until payment evidence is resolved or a human changes the booking policy.",
        },
        nextAction: "Resolve payment evidence in Quipsly before joining or recording this paid one-to-one session.",
      },
      { status: 409 },
    );
  }

  let participant = room.participants.find((item: any) => item.userId === userId);
  let participantCreated = false;
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
    participantCreated = true;
  }

  const consent = latestMobileCaptureConsentForParticipant(
    participant,
    room.recordingConsents,
  );

  const provider = typeof room.provider === "string" ? room.provider.toLowerCase() : "planned";
  const roomName = text(room.providerRoomId) || room.id;
  const recordingConsentId = consent?.id ?? null;
  const recordingConsentStatus = consent?.status ?? "not-created";
  const recordingConsentGranted = mobileCaptureAllPartiesReady(
    buildMobileCaptureConsentVersions({
      participants: [participant],
      consents: consent ? [consent] : [],
    }),
    "audio",
  );

  if (provider !== "livekit") {
    return NextResponse.json(
      buildQuipslyMeetingJoinSpine({
        provider: room.provider,
        providerReadiness: "provider-not-configured",
        canJoin: false,
        callRoomId: room.id,
        participantId: participant.id,
        recordingConsentId,
        recordingConsentStatus,
        recordingConsentGranted,
        participantCreated,
        nextAction: "This room is planned but does not have a live meeting provider yet. Use local recording only after consent.",
      }),
    );
  }

  const livekitUrl = text(process.env.LIVEKIT_URL);
  const livekitApiKey = text(process.env.LIVEKIT_API_KEY);
  const livekitApiSecret = text(process.env.LIVEKIT_API_SECRET);

  if (!livekitUrl || !livekitApiKey || !livekitApiSecret) {
    return NextResponse.json(
      buildQuipslyMeetingJoinSpine({
        provider: "livekit",
        providerReadiness: "livekit-needs-config",
        canJoin: false,
        callRoomId: room.id,
        participantId: participant.id,
        recordingConsentId,
        recordingConsentStatus,
        recordingConsentGranted,
        participantCreated,
        nextAction: "LiveKit is selected for this room, but server credentials are not configured yet. Use local recording only after consent.",
      }),
    );
  }

  const participantToken = createLiveKitJoinToken({
    apiKey: livekitApiKey,
    apiSecret: livekitApiSecret,
    identity: participant.id,
    name: participant.displayName || session.user.name || session.user.primaryEmail,
    roomName,
    metadata: {
      callRoomId: room.id,
      participantId: participant.id,
      userId,
      purpose: room.purpose,
      recordingConsentStatus,
    },
  });

  return NextResponse.json(
    buildQuipslyMeetingJoinSpine({
      provider: "livekit",
      providerReadiness: "livekit-ready",
      canJoin: true,
      serverUrl: livekitUrl,
      roomName,
      participantToken: participantToken.token,
      callRoomId: room.id,
      participantId: participant.id,
      recordingConsentId,
      recordingConsentStatus,
      recordingConsentGranted,
      tokenIssuedAt: participantToken.issuedAt,
      tokenExpiresAt: participantToken.expiresAt,
      tokenExpiresInSeconds: participantToken.expiresInSeconds,
      tokenSafeClaims: participantToken.safeClaims,
      participantCreated,
      nextAction: recordingConsentGranted
        ? "Join room. Recording is allowed after the visible recording state starts."
        : "Join room, but confirm recording consent before recording.",
    }),
  );
}
