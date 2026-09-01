import {
  buildMobileCaptureConsentVersions as buildConsentVersions,
  latestMobileCaptureConsentForParticipant as latestConsentForParticipant,
  legacyMobileCaptureConsentVersion as legacyConsentVersion,
  mobileCaptureAllPartiesAllowTranscription as allPartiesAllowTranscription,
  mobileCaptureAllPartiesReady as allPartiesReady,
  mobileCaptureConsentVersion as consentVersion,
} from "./mobile-capture-consent-readiness.js";

export const MOBILE_CAPTURE_ROOM_READINESS_VERSION = 1 as const;

export type MobileCaptureSourceType = "audio" | "video";

export type MobileCaptureConsentVersion = {
  participantId: string;
  userId: string;
  role: string;
  consentId: string | null;
  status: string;
  policyVersion: string | null;
  canRecordAudio: boolean;
  canRecordVideo: boolean;
  canTranscribe: boolean;
  consentedAt: string | null;
  revokedAt: string | null;
  updatedAt: string | null;
  consentTextHash: string | null;
  evidenceVersion: number | null;
  recordingChoiceExplicit: boolean;
  transcriptionChoiceExplicit: boolean;
  allAudibleParticipantsNotifiedAndAgreed: boolean;
  presentationSurface: string | null;
  presentationVersion: number | null;
};

export type MobileCaptureRoomReadinessEvaluation = {
  version: typeof MOBILE_CAPTURE_ROOM_READINESS_VERSION;
  eligibleForProcessing: boolean;
  allPartiesCurrentlyReady: boolean;
  allPartiesCurrentlyAllowTranscription: boolean;
  disposition: "eligible" | "preservation-only";
  reasonCode:
    | "READY"
    | "ROOM_NOT_FOUND"
    | "ACTOR_NOT_PARTICIPANT"
    | "ACTOR_CONSENT_MISMATCH"
    | "ALL_PARTY_CONSENT_REQUIRED"
    | "APPLIED_START_REQUIRED"
    | "START_OWNER_MISMATCH"
    | "START_CONSENT_SNAPSHOT_MISSING"
    | "CONSENT_VERSION_CHANGED"
    | "LEGACY_START_BINDING_MISSING";
  reason: string;
  roomId: string;
  captureId: string;
  actorUserId: string;
  actorConsentId: string | null;
  startReceiptId: string | null;
  consentVersion: string;
  startConsentVersion: string | null;
  consentVersions: MobileCaptureConsentVersion[];
  evaluatedAt: string;
};

type ParticipantLike = {
  id: string;
  userId?: string | null;
  role?: string | null;
};

type ConsentLike = {
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
};

export function latestMobileCaptureConsentForParticipant(
  participant: ParticipantLike,
  consents: readonly ConsentLike[],
) {
  return latestConsentForParticipant(participant, consents) as ConsentLike | null;
}

/**
 * Produces the canonical, stable consent material bound into a START receipt.
 * Observers and anonymous provider ghosts do not participate in the recording
 * decision; every signed-in, non-observer human does.
 */
export function buildMobileCaptureConsentVersions(args: {
  participants: readonly ParticipantLike[];
  consents: readonly ConsentLike[];
}): MobileCaptureConsentVersion[] {
  return buildConsentVersions(args) as MobileCaptureConsentVersion[];
}

export function mobileCaptureConsentVersion(
  versions: readonly MobileCaptureConsentVersion[],
) {
  return consentVersion(versions) as string;
}

export function legacyMobileCaptureConsentVersion(
  versions: readonly MobileCaptureConsentVersion[],
) {
  return legacyConsentVersion(versions) as string;
}

export function mobileCaptureAllPartiesReady(
  versions: readonly MobileCaptureConsentVersion[],
  sourceType: MobileCaptureSourceType,
) {
  return allPartiesReady(versions, sourceType) as boolean;
}

export function mobileCaptureAllPartiesAllowTranscription(
  versions: readonly MobileCaptureConsentVersion[],
) {
  return allPartiesAllowTranscription(versions) as boolean;
}

function metadataObject(value: unknown): Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function evaluation(args: Omit<MobileCaptureRoomReadinessEvaluation, "version" | "evaluatedAt">) {
  return {
    version: MOBILE_CAPTURE_ROOM_READINESS_VERSION,
    evaluatedAt: new Date().toISOString(),
    ...args,
  } satisfies MobileCaptureRoomReadinessEvaluation;
}

/**
 * The sole processing-readiness evaluator for canonical Capture uploads.
 *
 * It deliberately separates byte preservation from downstream processing.
 * A missing/rejected/stale START never causes uploaded bytes to be deleted; it
 * causes the resulting receipt to remain protected instead of being processed.
 */
export async function evaluateMobileCaptureRoomReadiness(args: {
  prisma: any;
  roomId: string;
  captureId: string;
  actorUserId: string;
  recordingConsentId: string;
  sourceType: MobileCaptureSourceType;
}): Promise<MobileCaptureRoomReadinessEvaluation> {
  const room = await args.prisma.callRoom.findUnique({
    where: { id: args.roomId },
    include: {
      participants: { where: { accessStatus: "ACTIVE" } },
      recordingConsents: true,
    },
  });

  if (!room) {
    return evaluation({
      eligibleForProcessing: false,
      allPartiesCurrentlyReady: false,
      allPartiesCurrentlyAllowTranscription: false,
      disposition: "preservation-only",
      reasonCode: "ROOM_NOT_FOUND",
      reason: "The capture room no longer exists in the app-owned ledger.",
      roomId: args.roomId,
      captureId: args.captureId,
      actorUserId: args.actorUserId,
      actorConsentId: null,
      startReceiptId: null,
      consentVersion: mobileCaptureConsentVersion([]),
      startConsentVersion: null,
      consentVersions: [],
    });
  }

  const consentVersions = buildMobileCaptureConsentVersions({
    participants: room.participants,
    consents: room.recordingConsents,
  });
  const consentVersion = mobileCaptureConsentVersion(consentVersions);
  const actorConsent = consentVersions.find((item) => item.userId === args.actorUserId) ?? null;
  const allPartiesCurrentlyReady = mobileCaptureAllPartiesReady(consentVersions, args.sourceType);
  const allPartiesCurrentlyAllowTranscription =
    mobileCaptureAllPartiesAllowTranscription(consentVersions);

  const receipts = await args.prisma.captureRoomStateReceipt.findMany({
    where: {
      roomId: args.roomId,
      captureId: args.captureId,
      action: "START_RECORDING",
    },
    orderBy: [{ sequence: "asc" }],
  });
  const appliedStarts = receipts.filter((receipt: any) => (
    receipt.stateApplied === true && receipt.outcome === "APPLIED"
  ));
  const actorStart = appliedStarts.find((receipt: any) => receipt.actorUserId === args.actorUserId) ?? null;
  const crossActorStart = appliedStarts.find((receipt: any) => receipt.actorUserId !== args.actorUserId) ?? null;

  const common = {
    roomId: args.roomId,
    captureId: args.captureId,
    actorUserId: args.actorUserId,
    actorConsentId: actorConsent?.consentId ?? null,
    startReceiptId: actorStart?.receiptId ?? null,
    consentVersion,
    startConsentVersion: actorStart?.consentVersion ?? null,
    consentVersions,
    allPartiesCurrentlyReady,
    allPartiesCurrentlyAllowTranscription,
  };

  if (!actorConsent) {
    return evaluation({
      ...common,
      eligibleForProcessing: false,
      disposition: "preservation-only",
      reasonCode: "ACTOR_NOT_PARTICIPANT",
      reason: "The upload actor is not a signed-in, non-observer participant in this room.",
    });
  }
  if (actorConsent.consentId !== args.recordingConsentId) {
    return evaluation({
      ...common,
      eligibleForProcessing: false,
      disposition: "preservation-only",
      reasonCode: "ACTOR_CONSENT_MISMATCH",
      reason: "The upload consent receipt is not the actor consent version bound to this room.",
    });
  }
  if (!allPartiesCurrentlyReady) {
    return evaluation({
      ...common,
      eligibleForProcessing: false,
      disposition: "preservation-only",
      reasonCode: "ALL_PARTY_CONSENT_REQUIRED",
      reason: "Every signed-in, non-observer participant must currently grant this recording type.",
    });
  }
  if (crossActorStart && !actorStart) {
    return evaluation({
      ...common,
      eligibleForProcessing: false,
      disposition: "preservation-only",
      reasonCode: "START_OWNER_MISMATCH",
      reason: "This capture UUID is owned by another participant's START receipt.",
    });
  }
  if (!actorStart) {
    return evaluation({
      ...common,
      eligibleForProcessing: false,
      disposition: "preservation-only",
      reasonCode: "APPLIED_START_REQUIRED",
      reason: "No applied START receipt binds this actor, room, and capture UUID.",
    });
  }

  const startMetadata = metadataObject(actorStart.metadataJson);
  const startVersions = Array.isArray(startMetadata.allPartyConsentVersions)
    ? startMetadata.allPartyConsentVersions as MobileCaptureConsentVersion[]
    : [];
  const persistedStartVersion = typeof actorStart.consentVersion === "string"
    ? actorStart.consentVersion
    : typeof startMetadata.allPartyConsentVersion === "string"
      ? startMetadata.allPartyConsentVersion
      : null;
  const canonicalStartVersion = startVersions.length > 0
    ? mobileCaptureConsentVersion(startVersions)
    : null;
  const canonicalSnapshotMatchesCurrent = canonicalStartVersion === consentVersion;
  const legacyReceiptMatchesCurrent = persistedStartVersion === legacyMobileCaptureConsentVersion(consentVersions);
  if (
    !persistedStartVersion
    || startVersions.length === 0
    || (
      canonicalStartVersion !== persistedStartVersion
      && !(canonicalSnapshotMatchesCurrent && legacyReceiptMatchesCurrent)
    )
  ) {
    return evaluation({
      ...common,
      eligibleForProcessing: false,
      disposition: "preservation-only",
      reasonCode: "START_CONSENT_SNAPSHOT_MISSING",
      reason: "The START receipt does not contain a verifiable all-party consent snapshot.",
    });
  }
  if (!canonicalSnapshotMatchesCurrent) {
    return evaluation({
      ...common,
      startConsentVersion: persistedStartVersion,
      eligibleForProcessing: false,
      disposition: "preservation-only",
      reasonCode: "CONSENT_VERSION_CHANGED",
      reason: "Participant permission changed after recording started, so this source remains protected.",
    });
  }

  return evaluation({
    ...common,
    startConsentVersion: consentVersion,
    eligibleForProcessing: true,
    disposition: "eligible",
    reasonCode: "READY",
    reason: "All-party consent and the actor-owned applied START receipt are bound and current.",
  });
}
