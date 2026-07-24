import "server-only";

import {
  buildMobileCaptureConsentVersions,
  latestMobileCaptureConsentForParticipant,
  mobileCaptureAllPartiesReady,
} from "@/lib/server/mobile-capture-room-readiness";

export type CaptureRoomAccessUser = {
  id: string;
  name?: string | null;
  primaryEmail?: string | null;
  isStaff?: boolean;
};

export function roomJoinText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function paymentHoldForRoom(room: any) {
  const paymentPolicy = roomJoinText(room?.booking?.paymentPolicy).toUpperCase();
  const paymentStatus = roomJoinText(room?.booking?.paymentRecord?.status).toUpperCase();
  const bookingStatus = roomJoinText(room?.booking?.status).toUpperCase();
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

export function captureRoomAccessWhere(callRoomId: string, user: CaptureRoomAccessUser) {
  if (user.isStaff) return { id: callRoomId };

  return {
    id: callRoomId,
    OR: [
      { createdByUserId: user.id },
      { participants: { some: { userId: user.id } } },
      { booking: { clientUserId: user.id } },
      { booking: { coachUserId: user.id } },
    ],
  };
}

function participantRoleForUser(room: any, userId: string) {
  if (room?.booking?.coachUserId === userId) return "COACH";
  if (room?.booking?.clientUserId === userId) return "CLIENT";
  if (room?.createdByUserId === userId) return "HOST";
  return "GUEST";
}

function liveKitConfigured() {
  return Boolean(
    roomJoinText(process.env.LIVEKIT_URL) &&
      roomJoinText(process.env.LIVEKIT_API_KEY) &&
      roomJoinText(process.env.LIVEKIT_API_SECRET),
  );
}

export function resolveCaptureRoomParticipant(room: any, user: CaptureRoomAccessUser) {
  const participant = (room?.participants || []).find((item: any) => item.userId === user.id) || null;
  const role = participant?.role || participantRoleForUser(room, user.id);

  return {
    participant,
    role,
    participantPresent: Boolean(participant),
    participantWouldBeCreatedOnJoin: !participant,
    displayName: participant?.displayName || user.name || user.primaryEmail || "Quipsly participant",
    email: participant?.email || user.primaryEmail || null,
  };
}

export function resolveCaptureRoomRecordingConsent(room: any, user: CaptureRoomAccessUser, participant: any | null) {
  const consent = participant
    ? latestMobileCaptureConsentForParticipant(participant, room?.recordingConsents || [])
    : null;
  const recordingConsentGranted = participant
    ? mobileCaptureAllPartiesReady(
        buildMobileCaptureConsentVersions({
          participants: [participant],
          consents: consent ? [consent] : [],
        }),
        "audio",
      )
    : false;

  return {
    consent,
    recordingConsentId: consent?.id ?? null,
    recordingConsentStatus: consent?.status ?? "not-created",
    recordingConsentGranted,
  };
}

export function buildCaptureRoomJoinDiagnostic(input: { room: any; user: CaptureRoomAccessUser }) {
  const { room, user } = input;
  const participantDraft = resolveCaptureRoomParticipant(room, user);
  const consentDraft = resolveCaptureRoomRecordingConsent(room, user, participantDraft.participant);
  const provider = roomJoinText(room?.provider).toLowerCase() || "planned";
  const roomOpenForJoin = ["PLANNED", "OPEN", "RECORDING"].includes(room?.status);
  const paymentHold = paymentHoldForRoom(room);
  const providerRoomName = roomJoinText(room?.providerRoomId) || room?.id || "";
  const configured = provider === "livekit" ? liveKitConfigured() : false;
  const providerReadiness = paymentHold.blocked
    ? "payment-hold"
    : provider !== "livekit"
      ? "provider-not-configured"
      : configured
        ? "livekit-ready"
        : "livekit-needs-config";
  const canMintJoinToken = Boolean(roomOpenForJoin && !paymentHold.blocked && provider === "livekit" && configured);
  const canJoin = Boolean(roomOpenForJoin && !paymentHold.blocked && provider === "livekit" && configured);
  const safeToRecordLocally = Boolean(consentDraft.recordingConsentGranted && !paymentHold.blocked);

  const nextAction = !roomOpenForJoin
    ? "This capture room is not open for joining. Review room status before preparing provider or local recording."
    : paymentHold.blocked
      ? "Resolve payment evidence in Quipsly before joining or recording this paid one-to-one session."
      : provider !== "livekit"
        ? "Prepare a LiveKit provider room or use consented local recording fallback."
        : !configured
          ? "Configure LiveKit server credentials before the provider-room join can mint a token."
          : consentDraft.recordingConsentGranted
            ? "The real join route can mint a short-lived room token. Recording still requires a visible recording start action."
            : "The real join route can mint a short-lived room token, but recording remains held until explicit consent is granted.";

  return {
    ok: true,
    diagnosticOnly: true,
    callRoomId: room?.id,
    room: {
      status: room?.status,
      purpose: room?.purpose,
      title: room?.title || null,
      nestSlug: room?.nestSlug || null,
      projectSlug: room?.projectSlug || null,
      scheduledStart: room?.scheduledStart || null,
      scheduledEnd: room?.scheduledEnd || null,
    },
    provider: provider || "planned",
    providerReadiness,
    canJoin,
    canMintJoinToken,
    serverUrlReturned: false,
    tokenReturned: false,
    tokenWouldBeShortLived: canMintJoinToken,
    tokenWouldBeRoomScoped: canMintJoinToken,
    providerBoundary: {
      providerRoomNamePresent: Boolean(providerRoomName),
      providerCredentialExposed: false,
      providerJoined: false,
      providerRecordingStarted: false,
      startsRecording: false,
      reusableAcrossRooms: false,
    },
    effects: {
      sideEffectFree: true,
      externalMutated: false,
      participantCreated: false,
      providerJoined: false,
      recordingStarted: false,
      tokenMinted: false,
      tokenReturned: false,
      stripeMutated: false,
      calendarMutated: false,
      mediaMutated: false,
    },
    participantBoundary: {
      participantPresent: participantDraft.participantPresent,
      participantWouldBeCreatedOnJoin: participantDraft.participantWouldBeCreatedOnJoin,
      role: participantDraft.role,
      displayName: participantDraft.displayName,
      email: participantDraft.email,
    },
    recordingBoundary: {
      joiningStartsRecording: false,
      localRecordingRequiresConsent: true,
      providerRecordingRequiresAllParticipantConsent: true,
      visibleRecordingIndicatorRequired: true,
      recordingConsentId: consentDraft.recordingConsentId,
      recordingConsentStatus: consentDraft.recordingConsentStatus,
      recordingConsentGranted: consentDraft.recordingConsentGranted,
      nextAction: consentDraft.recordingConsentGranted
        ? "Recording may be prepared from a visible Quipsly recording action. This diagnostic did not start it."
        : "Ask for explicit recording consent before local or provider recording.",
    },
    paymentBoundary: {
      blocked: paymentHold.blocked,
      paymentPolicy: paymentHold.paymentPolicy,
      paymentStatus: paymentHold.paymentStatus,
      bookingStatus: paymentHold.bookingStatus,
      stripeIsEvidenceOnly: true,
      noPaymentMutation: true,
    },
    localFallback: {
      available: true,
      safeToRecordLocally,
      reason: safeToRecordLocally ? "consent-granted" : paymentHold.blocked ? "payment-hold" : "consent-required",
      nextAction: safeToRecordLocally
        ? "Local segmented recording can be used as the resilient fallback."
        : "Hold local recording until payment and consent boundaries are satisfied.",
    },
    mediaBoundary: {
      sourceOfTruth: "Buckets store bytes. CallRoom owns recording intent. RecordingAsset and transcript jobs prove what exists.",
      proxyFilesAreDerivatives: true,
      originalsMutable: false,
    },
    nextAction,
  };
}
