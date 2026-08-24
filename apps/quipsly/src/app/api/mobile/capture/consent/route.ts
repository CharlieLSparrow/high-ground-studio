import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import {
  buildMobileCaptureConsentVersions,
  mobileCaptureAllPartiesReady,
} from "@/lib/server/mobile-capture-room-readiness";
import {
  MOBILE_CAPTURE_CONSENT_EVIDENCE_VERSION,
  MOBILE_CAPTURE_CONSENT_PRESENTATION_SURFACES,
  MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
  MOBILE_CAPTURE_CONSENT_TEXT,
  MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
  isSupportedMobileCaptureConsentPresentationSurface,
  mobileCaptureConsentHasCurrentPolicyEvidence,
} from "@/lib/server/mobile-capture-consent-readiness.js";
import { quarantineRoomTranscriptsForConsentChange } from "@/lib/server/capture-transcript-privacy";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { captureRoomAccessWhere } from "@/lib/server/mobile-capture-room-join-diagnostics";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function consentActionFromBody(body: Record<string, unknown>) {
  const explicit = text(body.consentAction).toUpperCase();

  if (["GRANT", "DECLINE", "REVOKE"].includes(explicit)) {
    return explicit;
  }

  if (body.recordingConsentGranted === true) {
    return "GRANT";
  }

  return "";
}

function allParticipantsAllowTranscription(
  versions: ReturnType<typeof buildMobileCaptureConsentVersions>,
) {
  return versions.length > 0 && versions.every(
    (version) =>
      version.status === "GRANTED" &&
      version.canTranscribe &&
      Boolean(version.consentedAt) &&
      !version.revokedAt &&
      mobileCaptureConsentHasCurrentPolicyEvidence(version),
  );
}

async function readJson(request: Request) {
  try {
    const value = await request.json();
    return isObject(value) ? value : {};
  } catch {
    return {};
  }
}

export async function GET(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) {
    return NextResponse.json(
      {
        ok: false,
        error: "Sign in before reading the recording consent policy.",
      },
      { status: 401 },
    );
  }

  const currentPolicy = {
    version: MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
    text: MOBILE_CAPTURE_CONSENT_TEXT,
    sha256: MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
    surface: "quipsly-capture-consent-v2",
    supportedSurfaces: MOBILE_CAPTURE_CONSENT_PRESENTATION_SURFACES,
    presentationVersion: 1,
  };
  const callRoomId =
    new URL(request.url).searchParams.get("callRoomId")?.trim() || "";
  if (!callRoomId)
    return NextResponse.json(
      {
        ok: true,
        currentPolicy,
        effects: {
          recordingStarted: false,
          providerJoined: false,
          externalMutated: false,
        },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );

  const prisma = getPrismaClient() as any;
  const userId = session.user.id;
  const room = await prisma.callRoom.findFirst({
    where: captureRoomAccessWhere(callRoomId, session.user),
    include: {
      booking: true,
      participants: { where: { accessStatus: "ACTIVE" } },
      recordingConsents: true,
    },
  });
  if (!room) {
    return NextResponse.json(
      { ok: false, error: "You do not have access to this capture session." },
      { status: 404 },
    );
  }
  const registeredParticipants = room.participants.filter(
    (item: any) => item?.role !== "OBSERVER" && Boolean(item?.userId),
  );
  const versions = buildMobileCaptureConsentVersions({
    participants: registeredParticipants,
    consents: room.recordingConsents,
  });
  const participant =
    registeredParticipants.find((item: any) => item.userId === userId) ?? null;
  const canControlRoom =
    session.user.isStaff ||
    room.createdByUserId === userId ||
    room.booking?.coachUserId === userId ||
    ["HOST", "COACH", "PRODUCER"].includes(participant?.role ?? "");
  const consent = participant
    ? (room.recordingConsents
        .filter(
          (item: any) =>
            item.participantId === participant.id || item.userId === userId,
        )
        .sort(
          (left: any, right: any) =>
            new Date(right.updatedAt).getTime() -
            new Date(left.updatedAt).getTime(),
        )[0] ?? null)
    : null;

  return NextResponse.json(
    {
      ok: true,
      currentPolicy,
      session: {
        callRoomId: room.id,
        roomStatus: room.status,
        canControlRoom,
        participantId: participant?.id ?? null,
        recordingConsentId: consent?.id ?? null,
        recordingConsentStatus: consent?.status ?? "not-created",
        recordingConsentCanRecordAudio:
          consent?.status === "GRANTED" && consent?.canRecordAudio === true,
        recordingConsentCanRecordVideo:
          consent?.status === "GRANTED" && consent?.canRecordVideo === true,
        recordingConsentCanTranscribe:
          consent?.status === "GRANTED" && consent?.canTranscribe === true,
        allRegisteredParticipantConsentGranted: mobileCaptureAllPartiesReady(
          versions,
          "audio",
        ),
        allRegisteredParticipantVideoConsentGranted:
          mobileCaptureAllPartiesReady(versions, "video"),
        allRegisteredParticipantTranscriptionConsentGranted:
          allParticipantsAllowTranscription(versions),
        consentRequiredParticipantCount: registeredParticipants.length,
      },
      effects: {
        recordingStarted: false,
        providerJoined: false,
        externalMutated: false,
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);

  if (!session?.user) {
    return NextResponse.json(
      { ok: false, error: "Sign in before updating recording consent." },
      { status: 401 },
    );
  }

  const body = await readJson(request);
  const callRoomId = text(body.callRoomId);
  const participantId = text(body.participantId);
  const consentAction = consentActionFromBody(body);
  const canRecordAudioChoice =
    typeof body.canRecordAudio === "boolean" ? body.canRecordAudio : null;
  const canRecordVideoChoice =
    typeof body.canRecordVideo === "boolean" ? body.canRecordVideo : null;
  const canTranscribeChoice =
    typeof body.canTranscribe === "boolean" ? body.canTranscribe : false;
  const transcriptionChoiceExplicit = typeof body.canTranscribe === "boolean";
  const presentationEvidence = isObject(body.presentationEvidence)
    ? body.presentationEvidence
    : {};
  const clientKind =
    text(body.clientKind).toLowerCase() === "web" ? "web" : "ios";
  const requestedDeviceLabel = text(body.deviceLabel).slice(0, 160);

  if (!callRoomId) {
    return NextResponse.json(
      {
        ok: false,
        error: "Choose a Quipsly capture session before recording.",
      },
      { status: 400 },
    );
  }

  if (!consentAction) {
    return NextResponse.json(
      {
        ok: false,
        error: "Choose whether to grant, decline, or revoke recording consent.",
      },
      { status: 400 },
    );
  }

  if (consentAction === "GRANT") {
    const presentedAt = new Date(text(presentationEvidence.presentedAt));
    const presentationValid =
      presentationEvidence.version === 1 &&
      isSupportedMobileCaptureConsentPresentationSurface(presentationEvidence.surface) &&
      presentationEvidence.recordingChoicePresented === true &&
      presentationEvidence.transcriptionChoicePresented === true &&
      presentationEvidence.audibleParticipantAttestationPresented === true &&
      body.allAudibleParticipantsNotifiedAndAgreed === true &&
      Number.isFinite(presentedAt.getTime()) &&
      presentedAt.getTime() >= Date.now() - 30 * 60 * 1_000 &&
      presentedAt.getTime() <= Date.now() + 5 * 60 * 1_000;
    const policyValid =
      text(body.consentPolicyVersion) ===
        MOBILE_CAPTURE_CONSENT_POLICY_VERSION &&
      text(body.consentText) === MOBILE_CAPTURE_CONSENT_TEXT &&
      text(body.consentTextHash).toLowerCase() ===
        MOBILE_CAPTURE_CONSENT_TEXT_SHA256;
    if (!policyValid || !presentationValid) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Present the current Quipsly consent policy and separate recording/transcription choices before granting consent.",
          errorCode: "CURRENT_CONSENT_PRESENTATION_REQUIRED",
          currentPolicy: {
            version: MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
            text: MOBILE_CAPTURE_CONSENT_TEXT,
            sha256: MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
            surface: "quipsly-capture-consent-v2",
            supportedSurfaces: MOBILE_CAPTURE_CONSENT_PRESENTATION_SURFACES,
            presentationVersion: 1,
          },
        },
        { status: 409 },
      );
    }
    if (
      canRecordAudioChoice === null ||
      canRecordVideoChoice === null ||
      (canRecordAudioChoice !== true && canRecordVideoChoice !== true)
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Choose explicitly whether this consent covers audio and video recording.",
          errorCode: "EXPLICIT_RECORDING_CHOICES_REQUIRED",
        },
        { status: 400 },
      );
    }
  }

  const prisma = getPrismaClient() as any;
  const userId = session.user.id;
  const room = await prisma.callRoom.findFirst({
    where: captureRoomAccessWhere(callRoomId, session.user),
    include: {
      booking: true,
      participants: { where: { accessStatus: "ACTIVE" } },
      recordingConsents: true,
    },
  });

  if (!room) {
    return NextResponse.json(
      { ok: false, error: "You do not have access to this capture session." },
      { status: 404 },
    );
  }

  if (
    consentAction === "GRANT" &&
    !["PLANNED", "OPEN", "RECORDING"].includes(room.status)
  ) {
    return NextResponse.json(
      { ok: false, error: "This capture session is not open for recording." },
      { status: 409 },
    );
  }

  let participant =
    (participantId &&
      room.participants.find(
        (item: any) => item.id === participantId && item.userId === userId,
      )) ||
    room.participants.find((item: any) => item.userId === userId);

  if (!participant) {
    const role =
      room.booking?.coachUserId === userId
        ? "COACH"
        : room.booking?.clientUserId === userId
          ? "CLIENT"
          : "GUEST";
    participant = await prisma.callParticipant.create({
      data: {
        roomId: room.id,
        userId,
        displayName:
          session.user.name ||
          session.user.primaryEmail ||
          "Quipsly participant",
        email: session.user.primaryEmail,
        role,
        deviceLabel:
          requestedDeviceLabel ||
          (clientKind === "web" ? "Quipsly Web" : "Quipsly iOS Capture"),
      },
    });
  }

  const existing = await prisma.recordingConsent.findFirst({
    where: {
      roomId: room.id,
      OR: [{ participantId: participant.id }, { userId }],
    },
    orderBy: { updatedAt: "desc" },
  });

  const now = new Date();
  const consentState =
    consentAction === "GRANT"
      ? {
          status: "GRANTED",
          canRecordAudio: canRecordAudioChoice === true,
          canRecordVideo: canRecordVideoChoice === true,
          canTranscribe:
            transcriptionChoiceExplicit && canTranscribeChoice === true,
          consentedAt: now,
          declinedAt: null,
          revokedAt: null,
        }
      : consentAction === "DECLINE"
        ? {
            status: "DECLINED",
            canRecordAudio: false,
            canRecordVideo: false,
            canTranscribe: false,
            consentedAt: null,
            declinedAt: now,
            revokedAt: null,
          }
        : {
            status: "REVOKED",
            canRecordAudio: false,
            canRecordVideo: false,
            canTranscribe: false,
            consentedAt: existing?.consentedAt ?? null,
            declinedAt: existing?.declinedAt ?? null,
            revokedAt: now,
          };
  const data = {
    roomId: room.id,
    participantId: participant.id,
    userId,
    status: consentState.status,
    consentText: MOBILE_CAPTURE_CONSENT_TEXT,
    policyVersion: MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
    canRecordAudio: consentState.canRecordAudio,
    canRecordVideo: consentState.canRecordVideo,
    canTranscribe: consentState.canTranscribe,
    consentedAt: consentState.consentedAt,
    declinedAt: consentState.declinedAt,
    revokedAt: consentState.revokedAt,
    metadataJson: {
      source: clientKind === "web" ? "web-capture" : "ios-capture",
      appSurface: clientKind === "web" ? "QuipslyWeb" : "QuipslyCapture",
      clientKind,
      deviceLabel: requestedDeviceLabel || null,
      updatedByUserId: userId,
      updatedAt: now.toISOString(),
      consentAction,
      consentEvidenceVersion: MOBILE_CAPTURE_CONSENT_EVIDENCE_VERSION,
      consentTextHash: MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
      recordingChoiceExplicit:
        consentAction === "GRANT" &&
        canRecordAudioChoice !== null &&
        canRecordVideoChoice !== null,
      transcriptionChoiceExplicit:
        consentAction === "GRANT" && transcriptionChoiceExplicit,
      allAudibleParticipantsNotifiedAndAgreed:
        consentAction === "GRANT" &&
        body.allAudibleParticipantsNotifiedAndAgreed === true,
      presentationEvidence:
        consentAction === "GRANT"
          ? {
              version: 1,
              surface: text(presentationEvidence.surface),
              presentedAt: text(presentationEvidence.presentedAt),
              serverConfirmedAt: now.toISOString(),
              recordingChoicePresented: true,
              transcriptionChoicePresented: true,
              audibleParticipantAttestationPresented: true,
            }
          : null,
      attestationKind: "participant-recording-and-transcription-choices-v2",
      independentParticipantReceiptsRequiredForProviderEgress: true,
    },
  };

  const shouldQuarantineTranscripts =
    consentAction !== "GRANT" || consentState.canTranscribe !== true;
  const mutation = await prisma.$transaction(
    async (tx: any) => {
      const consent = existing
        ? await tx.recordingConsent.update({
            where: { id: existing.id },
            data,
          })
        : await tx.recordingConsent.create({ data });
      const transcriptPrivacy = shouldQuarantineTranscripts
        ? await quarantineRoomTranscriptsForConsentChange({
            prisma: tx,
            roomId: room.id,
            changedByUserId: userId,
            consentAction: consentAction as "GRANT" | "DECLINE" | "REVOKE",
          })
        : {
            transcriptJobCount: 0,
            projectedTranscriptCount: 0,
            transcriptRowsDeleted: false,
            sourceMediaMutated: false,
          };
      return { consent, transcriptPrivacy };
    },
    { isolationLevel: "Serializable" },
  );
  const { consent, transcriptPrivacy } = mutation;

  const participants = room.participants.some(
    (item: any) => item.id === participant.id,
  )
    ? room.participants
    : [...room.participants, participant];
  const currentConsents = existing
    ? (room.recordingConsents?.map?.((item: any) =>
        item.id === consent.id ? consent : item,
      ) ?? [consent])
    : [...(room.recordingConsents ?? []), consent];
  const registeredParticipants = participants.filter(
    (item: any) => item?.role !== "OBSERVER" && Boolean(item?.userId),
  );
  const consentVersions = buildMobileCaptureConsentVersions({
    participants: registeredParticipants,
    consents: currentConsents,
  });
  const consentGrantedParticipantCount = consentVersions.filter(
    (receipt) =>
      receipt.status === "GRANTED" &&
      receipt.canRecordAudio &&
      Boolean(receipt.consentedAt) &&
      !receipt.revokedAt &&
      mobileCaptureConsentHasCurrentPolicyEvidence(receipt),
  ).length;
  const allRegisteredParticipantConsentGranted = mobileCaptureAllPartiesReady(
    consentVersions,
    "audio",
  );
  const videoConsentGrantedParticipantCount = consentVersions.filter(
    (receipt) =>
      receipt.status === "GRANTED" &&
      receipt.canRecordVideo &&
      Boolean(receipt.consentedAt) &&
      !receipt.revokedAt &&
      mobileCaptureConsentHasCurrentPolicyEvidence(receipt),
  ).length;
  const allRegisteredParticipantVideoConsentGranted =
    mobileCaptureAllPartiesReady(consentVersions, "video");
  const transcriptionConsentGrantedParticipantCount = consentVersions.filter(
    (receipt) =>
      receipt.status === "GRANTED" &&
      receipt.canTranscribe &&
      Boolean(receipt.consentedAt) &&
      !receipt.revokedAt &&
      mobileCaptureConsentHasCurrentPolicyEvidence(receipt),
  ).length;
  const allRegisteredParticipantTranscriptionConsentGranted =
    allParticipantsAllowTranscription(consentVersions);
  const selectedSourceConsentsReady =
    (!consent.canRecordAudio || allRegisteredParticipantConsentGranted) &&
    (!consent.canRecordVideo || allRegisteredParticipantVideoConsentGranted);

  return NextResponse.json({
    ok: true,
    session: {
      id: room.id,
      callRoomId: room.id,
      roomStatus: room.status,
      canControlRoom:
        session.user.isStaff ||
        room.createdByUserId === userId ||
        room.booking?.coachUserId === userId ||
        ["HOST", "COACH", "PRODUCER"].includes(participant.role ?? ""),
      participantId: participant.id,
      recordingConsentId: consent.id,
      recordingConsentStatus: consent.status,
      recordingConsentGranted:
        consent.status === "GRANTED" && consent.canRecordAudio === true,
      recordingConsentCanRecordAudio:
        consent.status === "GRANTED" && consent.canRecordAudio === true,
      recordingConsentCanRecordVideo:
        consent.status === "GRANTED" && consent.canRecordVideo === true,
      recordingConsentCanTranscribe:
        consent.status === "GRANTED" && consent.canTranscribe === true,
      recordingConsentVideoGranted:
        consent.status === "GRANTED" && consent.canRecordVideo === true,
      recordingConsentChoices: {
        canRecordAudio: consent.canRecordAudio,
        canRecordVideo: consent.canRecordVideo,
        canTranscribe: consent.canTranscribe,
        transcriptionChoiceExplicit,
        policyVersion: consent.policyVersion,
        consentTextHash: MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
      },
      consentRequiredParticipantCount: registeredParticipants.length,
      consentGrantedParticipantCount,
      allRegisteredParticipantConsentGranted,
      videoConsentGrantedParticipantCount,
      allRegisteredParticipantVideoConsentGranted,
      transcriptionConsentGrantedParticipantCount,
      allRegisteredParticipantTranscriptionConsentGranted,
      nextAction:
        consent.status === "GRANTED"
          ? selectedSourceConsentsReady
            ? "Recorder attestation and all signed-in participant consents are ready for the selected audio and video sources."
            : "Your recorder attestation is saved. Wait for every signed-in participant to consent to each selected source before recording."
          : consent.status === "REVOKED"
            ? "Consent revoked. Stop any active recording before continuing."
            : "Consent declined. Do not record this session.",
    },
    effects: {
      appOwnedConsentMutated: true,
      externalMutated: false,
      recordingStarted: false,
      providerJoined: false,
      providerRecordingStarted: false,
      providerTokenMinted: false,
      providerTokenReturned: false,
      stripeMutated: false,
      calendarMutated: false,
      externalInviteSent: false,
      mediaMutated: false,
      storageMutated: false,
      transcriptJobsQuarantined: transcriptPrivacy.transcriptJobCount,
      projectedTranscriptsQuarantined:
        transcriptPrivacy.projectedTranscriptCount,
      transcriptRowsDeleted: transcriptPrivacy.transcriptRowsDeleted,
      sourceMediaMutated: transcriptPrivacy.sourceMediaMutated,
      secretExposed: false,
    },
  });
}
