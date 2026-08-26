import { NextResponse } from "next/server";
import { buildQuipslyMeetingJoinSpine } from "@high-ground/quipsly-domain/coaching-meeting-spine";
import { buildQuipslySessionEntryReadiness } from "@high-ground/quipsly-domain/session-entry-readiness";

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
  mobileCaptureAllPartiesAllowTranscription,
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

function sessionEntryProjection(args: {
  room: any;
  actorUserId: string;
  currentParticipant?: any | null;
  providerCanJoin: boolean;
  providerReadiness: string;
  paymentBlocked: boolean;
}) {
  const participants = [...(Array.isArray(args.room.participants) ? args.room.participants : [])];
  if (args.currentParticipant && !participants.some((item: any) => item.id === args.currentParticipant.id)) {
    participants.push(args.currentParticipant);
  }
  const eligibleParticipants = participants.filter((item: any) => (
    item?.role !== "OBSERVER" && Boolean(item?.userId)
  ));
  const consentVersions = buildMobileCaptureConsentVersions({
    participants: eligibleParticipants,
    consents: Array.isArray(args.room.recordingConsents) ? args.room.recordingConsents : [],
  });
  const actorParticipant = args.currentParticipant
    ?? eligibleParticipants.find((item: any) => item.userId === args.actorUserId)
    ?? null;
  const actorConsentVersion = actorParticipant
    ? consentVersions.find((version) => version.participantId === actorParticipant.id) ?? null
    : null;
  const requiredParticipantCount = String(args.room.purpose || "").toUpperCase() === "COACHING" ? 2 : 1;
  const participantSetComplete = eligibleParticipants.length >= requiredParticipantCount;
  const actorAudioConsentGranted = actorConsentVersion
    ? mobileCaptureAllPartiesReady([actorConsentVersion], "audio")
    : false;
  const actorVideoConsentGranted = actorConsentVersion
    ? mobileCaptureAllPartiesReady([actorConsentVersion], "video")
    : false;
  const actorTranscriptionConsentGranted = actorConsentVersion
    ? mobileCaptureAllPartiesAllowTranscription([actorConsentVersion])
    : false;
  const allParticipantRecordingConsentGranted = participantSetComplete
    && mobileCaptureAllPartiesReady(consentVersions, "audio");
  const allParticipantVideoConsentGranted = participantSetComplete
    && mobileCaptureAllPartiesReady(consentVersions, "video");
  const allParticipantTranscriptionConsentGranted = participantSetComplete
    && mobileCaptureAllPartiesAllowTranscription(consentVersions);
  const entryReadiness = buildQuipslySessionEntryReadiness({
    roomStatus: args.room.status,
    purpose: args.room.purpose,
    actorAttached: Boolean(actorParticipant),
    actorAudioConsentGranted,
    actorVideoConsentGranted,
    actorTranscriptionConsentGranted,
    participantCount: eligibleParticipants.length,
    requiredParticipantCount,
    audioConsentGrantedParticipantCount: consentVersions.filter((version) => (
      mobileCaptureAllPartiesReady([version], "audio")
    )).length,
    videoConsentGrantedParticipantCount: consentVersions.filter((version) => (
      mobileCaptureAllPartiesReady([version], "video")
    )).length,
    transcriptionConsentGrantedParticipantCount: consentVersions.filter((version) => (
      mobileCaptureAllPartiesAllowTranscription([version])
    )).length,
    allParticipantAudioConsentGranted:
      allParticipantRecordingConsentGranted,
    allParticipantVideoConsentGranted,
    allParticipantTranscriptionConsentGranted,
    providerCanJoin: args.providerCanJoin,
    providerReadiness: args.providerReadiness,
    localCaptureAvailable: true,
    paymentBlocked: args.paymentBlocked,
  });

  return {
    actorAudioConsentGranted,
    allParticipantRecordingConsentGranted,
    allParticipantVideoConsentGranted,
    allParticipantTranscriptionConsentGranted,
    participantCount: eligibleParticipants.length,
    requiredParticipantCount,
    entryReadiness,
  };
}

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);

  if (!session?.user) {
    return NextResponse.json(
      { ok: false, code: "AUTH_REQUIRED", error: "Sign in before joining a capture room." },
      { status: 401 },
    );
  }

  const body = await readJson(request);
  const callRoomId = text(body.callRoomId);
  const clientInstanceId = text(body.clientInstanceId)
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .slice(0, 80);
  const clientKind = text(body.clientKind).toLowerCase() === "web" ? "web" : "ios";
  const requestedDeviceLabel = text(body.deviceLabel).slice(0, 160);
  const endpointRole = text(body.endpointRole).toLowerCase() === "companion"
    ? "companion"
    : "primary";

  if (!callRoomId) {
    return NextResponse.json(
      { ok: false, code: "ROOM_REQUIRED", error: "Choose a Quipsly capture session before joining a room." },
      { status: 400 },
    );
  }

  const prisma = getPrismaClient() as any;
  const userId = session.user.id;
  const room = await prisma.callRoom.findFirst({
    where: captureRoomAccessWhere(callRoomId, session.user),
    include: {
      booking: { include: { paymentRecord: true } },
      participants: { where: { accessStatus: "ACTIVE" } },
      recordingConsents: true,
    },
  });

  if (!room) {
    return NextResponse.json(
      { ok: false, code: "ROOM_ACCESS_DENIED", error: "You do not have access to this capture room." },
      { status: 404 },
    );
  }

  if (!["PLANNED", "OPEN", "RECORDING"].includes(room.status)) {
    return NextResponse.json(
      { ok: false, code: "ROOM_NOT_OPEN", error: "This call has ended and is no longer open for joining." },
      { status: 409 },
    );
  }

  const paymentHold = paymentHoldForRoom(room);
  if (paymentHold.blocked) {
    const paymentEntry = sessionEntryProjection({
      room,
      actorUserId: userId,
      providerCanJoin: false,
      providerReadiness: "payment-hold",
      paymentBlocked: true,
    });
    return NextResponse.json(
      {
        ok: false,
        code: "PAYMENT_HOLD",
        error: "This paid one-to-one coaching session is waiting on payment evidence before joining or recording.",
        canJoin: false,
        provider: room.provider || "planned",
        providerReadiness: "payment-hold",
        callRoomId: room.id,
        entryReadiness: paymentEntry.entryReadiness,
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

  let participant = room.participants.find((item: any) =>
    item.userId === userId && (item.accessStatus || "ACTIVE") === "ACTIVE"
  );
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
        deviceLabel: requestedDeviceLabel || (clientKind === "web" ? "Quipsly Web" : "Quipsly iOS Capture"),
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
  const readinessFor = (providerCanJoin: boolean, providerReadiness: string) =>
    sessionEntryProjection({
      room,
      actorUserId: userId,
      currentParticipant: participant,
      providerCanJoin,
      providerReadiness,
      paymentBlocked: false,
    });

  if (provider !== "livekit") {
    const readiness = readinessFor(false, "provider-not-configured");
    return NextResponse.json(
      buildQuipslyMeetingJoinSpine({
        provider: room.provider,
        providerReadiness: "provider-not-configured",
        canJoin: false,
        callRoomId: room.id,
        participantId: participant.id,
        recordingConsentId,
        recordingConsentStatus,
        recordingConsentGranted: readiness.actorAudioConsentGranted,
        ...readiness,
        participantCreated,
        nextAction: "This room is planned but does not have a live meeting provider yet. Use local recording only after consent.",
      }),
    );
  }

  const livekitUrl = text(process.env.LIVEKIT_URL);
  const livekitApiKey = text(process.env.LIVEKIT_API_KEY);
  const livekitApiSecret = text(process.env.LIVEKIT_API_SECRET);

  if (!livekitUrl || !livekitApiKey || !livekitApiSecret) {
    const readiness = readinessFor(false, "livekit-needs-config");
    return NextResponse.json(
      buildQuipslyMeetingJoinSpine({
        provider: "livekit",
        providerReadiness: "livekit-needs-config",
        canJoin: false,
        callRoomId: room.id,
        participantId: participant.id,
        recordingConsentId,
        recordingConsentStatus,
        recordingConsentGranted: readiness.actorAudioConsentGranted,
        ...readiness,
        participantCreated,
        nextAction: "LiveKit is selected for this room, but server credentials are not configured yet. Use local recording only after consent.",
      }),
    );
  }

  const providerIdentity = clientInstanceId ? `${participant.id}:${clientInstanceId}` : participant.id;
  const participantToken = createLiveKitJoinToken({
    apiKey: livekitApiKey,
    apiSecret: livekitApiSecret,
    // One canonical Quipsly participant may intentionally join from both a
    // browser and iPhone Capture. LiveKit identities must be unique per active
    // device or the later connection will evict the earlier one.
    identity: providerIdentity,
    name: participant.displayName || session.user.name || session.user.primaryEmail,
    roomName,
    metadata: {
      callRoomId: room.id,
      participantId: participant.id,
      userId,
      clientInstanceId: clientInstanceId || null,
      clientKind,
      deviceLabel: requestedDeviceLabel || null,
      endpointRole,
      purpose: room.purpose,
      recordingConsentStatus,
    },
  });

  await prisma.callParticipantProviderGrantReceipt.create({
    data: {
      roomId: room.id,
      participantId: participant.id,
      tokenJti: participantToken.safeClaims.jti,
      providerIdentity,
      providerRoomId: roomName,
      clientInstanceId: clientInstanceId || null,
      clientKind,
      deviceLabel: requestedDeviceLabel || null,
      issuedAt: new Date(participantToken.issuedAt),
      expiresAt: new Date(participantToken.expiresAt),
      metadataJson: {
        source: "mobile-capture-room-join",
        roomScoped: true,
        tokenPrepared: true,
        tokenReturned: false,
        recordingStarted: false,
        endpointRole,
      },
    },
  });

  const readiness = readinessFor(true, "livekit-ready");
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
      recordingConsentGranted: readiness.actorAudioConsentGranted,
      ...readiness,
      tokenIssuedAt: participantToken.issuedAt,
      tokenExpiresAt: participantToken.expiresAt,
      tokenExpiresInSeconds: participantToken.expiresInSeconds,
      tokenSafeClaims: participantToken.safeClaims,
      participantCreated,
      nextAction: readiness.allParticipantRecordingConsentGranted
        ? "Join room. Recording is allowed only after the visible recording state starts."
        : readiness.actorAudioConsentGranted
          ? "Join room. Your choice is saved; recording waits for every required participant."
          : "Join room, but confirm your recording choice before recording.",
    }),
  );
}
