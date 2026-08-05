import {
  buildMobileCaptureConsentVersions,
  mobileCaptureAllPartiesAllowTranscription,
  mobileCaptureAllPartiesReady,
} from "@/lib/server/mobile-capture-room-readiness";

type PreparationParticipantInput = {
  id: string;
  userId?: string | null;
  displayName?: string | null;
  email?: string | null;
  role?: string | null;
  joinedAt?: Date | string | null;
  user?: { name?: string | null; primaryEmail?: string | null } | null;
};

type PreparationConsentInput = {
  id: string;
  participantId?: string | null;
  userId?: string | null;
  status?: string | null;
  policyVersion?: string | null;
  canRecordAudio?: boolean | null;
  canRecordVideo?: boolean | null;
  canTranscribe?: boolean | null;
  consentedAt?: Date | string | null;
  revokedAt?: Date | string | null;
  updatedAt?: Date | string | null;
  metadataJson?: unknown;
};

type LiveKitEnvironment = {
  LIVEKIT_URL?: string;
  LIVEKIT_API_KEY?: string;
  LIVEKIT_API_SECRET?: string;
};

export type SessionPreparation = {
  captureGroupId: string;
  purpose: string;
  status: string;
  provider: string;
  providerRoomId: string | null;
  providerCanJoin: boolean;
  providerReadiness: "livekit-ready" | "livekit-needs-config" | "livekit-needs-room-id" | "local-fallback";
  providerNextAction: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  project: { id: string; name: string; slug: string } | null;
  participants: Array<{
    id: string;
    label: string;
    role: string;
    isCurrentActor: boolean;
    joinedAt: string | null;
    consent: {
      id: string | null;
      status: string;
      policyVersion: string | null;
      canRecordAudio: boolean;
      canRecordVideo: boolean;
      canTranscribe: boolean;
      recordingReady: boolean;
      transcriptionReady: boolean;
      consentedAt: string | null;
      revokedAt: string | null;
      updatedAt: string | null;
    } | null;
  }>;
  allAudioReady: boolean;
  allTranscriptionReady: boolean;
};

export type SessionConsentSnapshot = {
  total: number;
  granted: number;
  transcriptionPermitted: number;
};

function iso(value: Date | string | null | undefined) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

export function buildSessionPreparationState(room: {
  captureGroupId: string;
  purpose?: string | null;
  status?: string | null;
  provider?: string | null;
  providerRoomId?: string | null;
  scheduledStart?: Date | string | null;
  scheduledEnd?: Date | string | null;
  project?: { id: string; name: string; slug: string } | null;
  participants?: PreparationParticipantInput[] | null;
  recordingConsents?: PreparationConsentInput[] | null;
}, actorUserId?: string | null, env: LiveKitEnvironment = process.env as LiveKitEnvironment): {
  preparation: SessionPreparation;
  consentSnapshot: SessionConsentSnapshot;
} {
  const participants = (room.participants ?? [])
    .filter((participant) => participant.role !== "OBSERVER" && Boolean(participant.userId));
  const consentVersions = buildMobileCaptureConsentVersions({
    participants,
    consents: room.recordingConsents ?? [],
  });
  const consentByParticipantId = new Map(
    consentVersions.map((consent) => [consent.participantId, consent]),
  );
  const provider = String(room.provider || "planned").toLowerCase();
  const providerRoomId = String(room.providerRoomId || "").trim() || null;
  const hasLiveKitConfig = Boolean(env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET);
  const providerState = provider === "livekit" && providerRoomId && hasLiveKitConfig
    ? {
        providerCanJoin: true,
        providerReadiness: "livekit-ready" as const,
        providerNextAction: "Choose and test the exact devices, then join from browser or iPhone.",
      }
    : provider === "livekit" && providerRoomId
      ? {
          providerCanJoin: false,
          providerReadiness: "livekit-needs-config" as const,
          providerNextAction: "LiveKit is selected, but this environment is missing server credentials.",
        }
      : provider === "livekit"
        ? {
            providerCanJoin: false,
            providerReadiness: "livekit-needs-room-id" as const,
            providerNextAction: "Prepare a provider room before anyone tries to join.",
          }
        : {
            providerCanJoin: false,
            providerReadiness: "local-fallback" as const,
            providerNextAction: "Prepare LiveKit for a shared call, or keep this Session local-only.",
          };

  return {
    consentSnapshot: {
      total: consentVersions.length,
      granted: consentVersions.filter((consent) => (
        consent.status === "GRANTED"
        && consent.canRecordAudio
        && Boolean(consent.consentedAt)
        && !consent.revokedAt
      )).length,
      transcriptionPermitted: consentVersions.filter((consent) => (
        consent.status === "GRANTED"
        && consent.canTranscribe
        && Boolean(consent.consentedAt)
        && !consent.revokedAt
      )).length,
    },
    preparation: {
      captureGroupId: room.captureGroupId,
      purpose: String(room.purpose || "COACHING"),
      status: String(room.status || "PLANNED"),
      provider,
      providerRoomId,
      ...providerState,
      scheduledStart: iso(room.scheduledStart),
      scheduledEnd: iso(room.scheduledEnd),
      project: room.project ?? null,
      participants: participants.map((participant) => {
        const consent = consentByParticipantId.get(participant.id);
        return {
          id: participant.id,
          label: participant.displayName
            || participant.user?.name
            || participant.email
            || participant.user?.primaryEmail
            || "Participant",
          role: String(participant.role || "GUEST"),
          isCurrentActor: Boolean(actorUserId && participant.userId === actorUserId),
          joinedAt: iso(participant.joinedAt),
          consent: consent ? {
            id: consent.consentId,
            status: consent.status,
            policyVersion: consent.policyVersion,
            canRecordAudio: consent.canRecordAudio,
            canRecordVideo: consent.canRecordVideo,
            canTranscribe: consent.canTranscribe,
            recordingReady: mobileCaptureAllPartiesReady([consent], "audio"),
            transcriptionReady: mobileCaptureAllPartiesAllowTranscription([consent]),
            consentedAt: consent.consentedAt,
            revokedAt: consent.revokedAt,
            updatedAt: consent.updatedAt,
          } : null,
        };
      }),
      allAudioReady: mobileCaptureAllPartiesReady(consentVersions, "audio"),
      allTranscriptionReady: mobileCaptureAllPartiesAllowTranscription(consentVersions),
    },
  };
}
