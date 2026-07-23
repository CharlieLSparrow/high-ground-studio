type MobileCaptureRecordInput = {
  prisma: any;
  actorUserId?: string;
  actorIsStaff?: boolean;
  sessionId: string;
  fileName: string;
  contentType?: string | null;
  sizeBytes: number;
  checksumSha256?: string | null;
  exactBytesVerified: boolean;
  provider: string;
  storageBucket?: string | null;
  storageObjectPath?: string | null;
  storageGeneration?: string | null;
  storageCrc32c?: string | null;
  projectSlug?: string | null;
  episodeSlug?: string | null;
  sourceType?: string | null;
  callRoomId?: string | null;
  participantId?: string | null;
  recordingConsentId?: string | null;
  recordingConsentGranted?: boolean;
  recordingAssetId?: string | null;
  capturePurpose?: string | null;
  startedAt?: string | null;
  stoppedAt?: string | null;
  segmentsJson?: string | null;
  totalChunks?: number;
  mediaAssetId?: string | null;
  sourceId?: string | null;
  processingDisposition: "RELEASED" | "HELD";
  processingHoldReasonCode?: string | null;
  processingHoldReason?: string | null;
  transcriptionDisposition: "RELEASED" | "HELD";
  transcriptionHoldReasonCode?: string | null;
  transcriptionHoldReason?: string | null;
};

type MobileCaptureReferenceInput = Omit<
  MobileCaptureRecordInput,
  "exactBytesVerified" | "processingDisposition" | "transcriptionDisposition"
> & {
  exactBytesVerified?: MobileCaptureRecordInput["exactBytesVerified"];
  processingDisposition?: MobileCaptureRecordInput["processingDisposition"];
  transcriptionDisposition?: MobileCaptureRecordInput["transcriptionDisposition"];
};

export class MobileCaptureReferenceError extends Error {
  readonly status: 403 | 404 | 409;

  constructor(message: string, status: 403 | 404 | 409 = 403) {
    super(message);
    this.name = "MobileCaptureReferenceError";
    this.status = status;
  }
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function purposeFor(value?: string | null) {
  const normalized = (value || "").toLowerCase();
  if (normalized.includes("podcast")) return "PODCAST";
  if (normalized.includes("research")) return "RESEARCH_INTERVIEW";
  if (normalized.includes("internal")) return "INTERNAL_MEETING";
  return "COACHING";
}

function kindFor(sourceType?: string | null, contentType?: string | null) {
  const normalizedSource = (sourceType || "").toLowerCase();
  const normalizedContent = (contentType || "").toLowerCase();

  if (normalizedSource.includes("video") || normalizedContent.startsWith("video/")) {
    return "LOCAL_VIDEO";
  }

  return "LOCAL_AUDIO";
}

function safeProviderRoomId(input: MobileCaptureRecordInput) {
  return (
    input.callRoomId ||
    `${input.capturePurpose || "mobile-capture"}:${input.actorUserId}:${input.projectSlug || "home"}:${input.episodeSlug || "session"}:${input.sessionId}`
  ).slice(0, 240);
}

function metadataFor(input: MobileCaptureRecordInput) {
  // Runtime callers outside TypeScript must fail closed too. Only the
  // canonical finalizer may opt a recording into RELEASED explicitly.
  const processingDisposition = input.processingDisposition === "RELEASED"
    ? "RELEASED"
    : "HELD";
  const transcriptionDisposition = processingDisposition === "RELEASED"
    && input.transcriptionDisposition === "RELEASED"
    ? "RELEASED"
    : "HELD";
  return {
    sessionId: input.sessionId,
    fileName: input.fileName,
    projectSlug: input.projectSlug || null,
    episodeSlug: input.episodeSlug || null,
    sourceType: input.sourceType || null,
    callRoomId: input.callRoomId || null,
    participantId: input.participantId || null,
    recordingConsentId: input.recordingConsentId || null,
    actorUserId: input.actorUserId,
    capturePurpose: input.capturePurpose || null,
    mediaAssetId: input.mediaAssetId || null,
    sourceId: input.sourceId || null,
    checksumSha256: input.checksumSha256 || null,
    exactBytesVerified: input.exactBytesVerified === true,
    byteVerificationKind: input.exactBytesVerified === true
      ? "server-size-and-sha256"
      : "storage-accepted-unverified",
    storageGeneration: input.storageGeneration || null,
    storageCrc32c: input.storageCrc32c || null,
    processingDisposition,
    processingHoldReasonCode: input.processingHoldReasonCode || null,
    processingHoldReason: input.processingHoldReason || null,
    transcriptionDisposition,
    transcriptionHoldReasonCode: input.transcriptionHoldReasonCode || null,
    transcriptionHoldReason: input.transcriptionHoldReason || null,
  };
}

function safeJson(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function immutableReceiptBindingMatchesInput(receipt: any, input: MobileCaptureReferenceInput) {
  const metadata = safeJson(receipt?.metadataJson);
  const binding = safeJson(metadata.immutableUploadBinding);
  const expectedSize = Number(binding.sizeBytes);
  return Boolean(
    binding.uploadSessionId === input.sessionId
    && binding.actorUserId === input.actorUserId
    && binding.roomId === input.callRoomId
    && binding.sha256 === input.checksumSha256
    && binding.bucketName === input.storageBucket
    && binding.objectName === input.storageObjectPath
    && Number.isFinite(expectedSize)
    && expectedSize === input.sizeBytes,
  );
}

function recordingSegments(value?: string | null, fallback: unknown = []) {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed ?? [];
  } catch {
    return { raw: value };
  }
}

function roomUpdateData(input: MobileCaptureRecordInput, metadataJson: Record<string, unknown>, startedAt: Date | null) {
  return {
    recordingStartedAt: startedAt || undefined,
    nestSlug: input.projectSlug || undefined,
    projectSlug: input.projectSlug || undefined,
    metadataJson: {
      ...metadataJson,
      lastMobileCaptureIngestedAt: new Date().toISOString(),
    },
  };
}

function roomCreateData(input: MobileCaptureRecordInput, providerRoomId: string, metadataJson: Record<string, unknown>, startedAt: Date | null) {
  return {
    createdByUserId: input.actorUserId,
    purpose: purposeFor(input.capturePurpose),
    status: "OPEN",
    provider: "quipsly-mobile",
    providerRoomId,
    title: input.episodeSlug || input.capturePurpose || "Mobile capture session",
    openedAt: startedAt,
    recordingStartedAt: startedAt,
    nestSlug: input.projectSlug || null,
    projectSlug: input.projectSlug || null,
    recordingPolicyJson: {
      source: "mobile-capture",
      requiresExplicitConsent: true,
    },
    transcriptPolicyJson: {
      source: "mobile-capture",
      queueAfterVerifiedUpload: true,
    },
    metadataJson,
  };
}

export async function assertMobileCaptureUploadReferences(input: MobileCaptureReferenceInput) {
  if (!input.actorUserId) {
    throw new MobileCaptureReferenceError(
      "A verified upload actor is required before capture records can be mutated.",
      403,
    );
  }
  const hasRoomScopedReferences = Boolean(
    input.participantId || input.recordingConsentId || input.recordingAssetId,
  );
  if (!input.callRoomId && hasRoomScopedReferences) {
    throw new MobileCaptureReferenceError(
      "Participant, consent, and recording asset IDs require a capture room.",
      409,
    );
  }

  const room = input.callRoomId
    ? await input.prisma.callRoom.findFirst({
        where: input.actorIsStaff
          ? { id: input.callRoomId }
          : {
              id: input.callRoomId,
              OR: [
                { createdByUserId: input.actorUserId },
                { participants: { some: { userId: input.actorUserId } } },
                { booking: { clientUserId: input.actorUserId } },
                { booking: { coachUserId: input.actorUserId } },
              ],
            },
      })
    : null;

  if (input.callRoomId && !room) {
    throw new MobileCaptureReferenceError(
      "Capture room was not found or is not accessible to this user.",
      403,
    );
  }
  if (room?.projectSlug && input.projectSlug && room.projectSlug !== input.projectSlug) {
    throw new MobileCaptureReferenceError(
      "Capture room belongs to a different Nest project.",
      403,
    );
  }

  const participant = room
    ? await input.prisma.callParticipant.findFirst({
        where: {
          ...(input.participantId ? { id: input.participantId } : { userId: input.actorUserId }),
          roomId: room.id,
          ...(!input.actorIsStaff && input.participantId ? { userId: input.actorUserId } : {}),
        },
      })
    : null;
  if (input.participantId && !participant) {
    throw new MobileCaptureReferenceError(
      "Capture participant does not belong to this user and room.",
      403,
    );
  }

  const consent = room && participant
    ? await input.prisma.recordingConsent.findFirst({
        where: {
          ...(input.recordingConsentId ? { id: input.recordingConsentId } : {}),
          roomId: room.id,
          participantId: participant.id,
        },
        orderBy: { updatedAt: "desc" },
      })
    : null;
  if (
    input.recordingConsentId &&
    (!consent || (!input.actorIsStaff && consent.userId && consent.userId !== input.actorUserId))
  ) {
    throw new MobileCaptureReferenceError(
      "Recording consent does not belong to this user, participant, and room.",
      403,
    );
  }

  let recordingAsset = input.recordingAssetId
    ? await input.prisma.recordingAsset.findFirst({
        where: {
          id: input.recordingAssetId,
          roomId: room.id,
          ...(participant ? { participantId: participant.id } : {}),
        },
      })
    : null;
  if (input.recordingAssetId && !recordingAsset) {
    throw new MobileCaptureReferenceError(
      "Recording asset does not belong to this participant and room.",
      403,
    );
  }

  if (recordingAsset && input.prisma.mobileCaptureFinalizationReceipt?.findFirst) {
    const normalizedReceipt = await input.prisma.mobileCaptureFinalizationReceipt.findFirst({
      where: { recordingAssetId: recordingAsset.id },
      orderBy: { createdAt: "asc" },
    });
    if (normalizedReceipt) {
      if (input.exactBytesVerified === true) {
        if (!immutableReceiptBindingMatchesInput(normalizedReceipt, input)) {
          throw new MobileCaptureReferenceError(
            "Recording asset has an immutable finalized upload binding that does not match these bytes.",
            409,
          );
        }
      } else {
        // Compatibility uploads are preservation-only. A caller-controlled
        // recordingAssetId must never rebind normalized evidence to new bytes.
        recordingAsset = null;
      }
    }
  }

  return { room, participant, consent, recordingAsset };
}

async function findOrCreateRoom(
  input: MobileCaptureRecordInput,
  metadataJson: Record<string, unknown>,
  startedAt: Date | null,
  existingRoom: any,
) {
  const updateData = roomUpdateData(input, metadataJson, startedAt);

  if (existingRoom) {
    return input.prisma.callRoom.update({
      where: { id: existingRoom.id },
      data: {
        ...updateData,
        recordingStartedAt: existingRoom.recordingStartedAt || updateData.recordingStartedAt,
        nestSlug: existingRoom.nestSlug || updateData.nestSlug,
        projectSlug: existingRoom.projectSlug || updateData.projectSlug,
        metadataJson: {
          ...safeJson(existingRoom.metadataJson),
          ...updateData.metadataJson,
          attachedBy: "callRoomId",
        },
      },
    });
  }

  const providerRoomId = safeProviderRoomId(input);
  return input.prisma.callRoom.upsert({
    where: { providerRoomId },
    update: updateData,
    create: roomCreateData(input, providerRoomId, metadataJson, startedAt),
  });
}

async function findOrCreateParticipant(input: MobileCaptureRecordInput, roomId: string, existingParticipant: any) {
  if (existingParticipant) {
    return input.prisma.callParticipant.update({
      where: { id: existingParticipant.id },
      data: {
        deviceLabel: existingParticipant.deviceLabel || "iOS capture app",
        connectionJson: {
          ...safeJson(existingParticipant.connectionJson),
          source: "mobile-capture",
          participantId: existingParticipant.id,
          lastMobileCaptureIngestedAt: new Date().toISOString(),
        },
      },
    });
  }

  const actorParticipant = await input.prisma.callParticipant.findFirst({
    where: { roomId, userId: input.actorUserId },
  });
  if (actorParticipant) {
    return actorParticipant;
  }

  return input.prisma.callParticipant.create({
    data: {
      roomId,
      userId: input.actorUserId,
      displayName: "Mobile participant",
      role: "GUEST",
      deviceLabel: "iOS capture app",
      connectionJson: {
        source: "mobile-capture",
        actorUserId: input.actorUserId,
        sessionId: input.sessionId,
      },
    },
  });
}

async function findReusableConsent(input: MobileCaptureRecordInput, roomId: string, participantId: string) {
  return input.prisma.recordingConsent.findFirst({
    where: {
      roomId,
      participantId,
    },
    orderBy: { updatedAt: "desc" },
  });
}

async function findReusableRecordingAsset(input: MobileCaptureRecordInput, roomId: string, participantId: string, startedAt: Date | null) {
  const candidate = await input.prisma.recordingAsset.findFirst({
    where: {
      roomId,
      participantId,
      fileName: input.fileName,
      recordedStartedAt: startedAt,
      kind: kindFor(input.sourceType, input.contentType),
    },
    orderBy: { updatedAt: "desc" },
  });
  if (!candidate || input.exactBytesVerified === true) return candidate;
  if (!input.prisma.mobileCaptureFinalizationReceipt?.findFirst) return candidate;
  const normalizedReceipt = await input.prisma.mobileCaptureFinalizationReceipt.findFirst({
    where: { recordingAssetId: candidate.id },
    select: { uploadSessionId: true },
  });
  return normalizedReceipt ? null : candidate;
}

async function findOrQueueTranscriptJob(
  input: MobileCaptureRecordInput,
  roomId: string,
  recordingAssetId: string,
  consentAllowsTranscription: boolean,
  processingHold?: { code: string; reason: string } | null,
) {
  const existing = await input.prisma.transcriptJob.findFirst({
    where: { assetId: recordingAssetId },
    orderBy: { createdAt: "desc" },
  });

  const resultJson = {
    source: "mobile-capture-ingest",
    mediaAssetId: input.mediaAssetId || null,
    sourceId: input.sourceId || null,
    lastMobileCaptureIngestedAt: new Date().toISOString(),
    recordingConsentGranted: consentAllowsTranscription,
  };

  if (!consentAllowsTranscription || processingHold) {
    const heldMessage = processingHold?.reason || "Transcript held until recording consent is granted.";
    const heldResultJson = {
      ...resultJson,
      holdReason: processingHold?.code || "recording-consent-required",
    };

    if (existing) {
      const shouldPreserveCompleted = existing.status === "COMPLETED";
      return input.prisma.transcriptJob.update({
        where: { id: existing.id },
        data: {
          roomId,
          assetId: recordingAssetId,
          status: shouldPreserveCompleted ? existing.status : "HELD",
          provider: shouldPreserveCompleted
            ? existing.provider
            : processingHold ? "processing-hold" : "consent-required",
          errorMessage: shouldPreserveCompleted ? existing.errorMessage : heldMessage,
          resultJson: {
            ...safeJson(existing.resultJson),
            ...heldResultJson,
          },
        },
      });
    }

    return input.prisma.transcriptJob.create({
      data: {
        roomId,
        assetId: recordingAssetId,
        status: "HELD",
        provider: processingHold ? "processing-hold" : "consent-required",
        errorMessage: heldMessage,
        resultJson: heldResultJson,
      },
    });
  }

  if (existing) {
    const shouldRequeue = ["HELD", "FAILED"].includes(existing.status);
    return input.prisma.transcriptJob.update({
      where: { id: existing.id },
      data: {
        roomId,
        assetId: recordingAssetId,
        status: shouldRequeue ? "QUEUED" : existing.status,
        provider: shouldRequeue ? "pending" : existing.provider,
        errorMessage: shouldRequeue ? null : existing.errorMessage,
        resultJson: {
          ...safeJson(existing.resultJson),
          ...resultJson,
          requeuedFromStatus: shouldRequeue ? existing.status : null,
        },
      },
    });
  }

  return input.prisma.transcriptJob.create({
    data: {
      roomId,
      assetId: recordingAssetId,
      status: "QUEUED",
      provider: "pending",
      resultJson,
    },
  });
}

export async function recordMobileCaptureIngestion(input: MobileCaptureRecordInput) {
  const startedAt = parseDate(input.startedAt);
  const stoppedAt = parseDate(input.stoppedAt);
  const metadataJson = metadataFor(input);
  const references = await assertMobileCaptureUploadReferences(input);

  const room = await findOrCreateRoom(input, metadataJson, startedAt, references.room);
  const participant = await findOrCreateParticipant(input, room.id, references.participant);
  const consent = references.consent || await findReusableConsent(input, room.id, participant.id);
  const recordingKind = kindFor(input.sourceType, input.contentType);
  const processingDisposition = input.processingDisposition === "RELEASED"
    ? "RELEASED"
    : "HELD";
  const transcriptionDisposition = processingDisposition === "RELEASED"
    && input.transcriptionDisposition === "RELEASED"
    ? "RELEASED"
    : "HELD";
  const processingHold = processingDisposition === "HELD"
    ? {
        code: input.processingHoldReasonCode || "capture-room-readiness-required",
        reason: input.processingHoldReason || "Processing held until an explicit reviewed release.",
      }
    : null;
  const transcriptionHold = processingHold || transcriptionDisposition === "HELD"
    ? {
        code: input.transcriptionHoldReasonCode
          || processingHold?.code
          || "all-party-transcription-consent-required",
        reason: input.transcriptionHoldReason
          || processingHold?.reason
          || "Transcript held until every signed-in, non-observer participant grants transcription consent.",
      }
    : null;
  const consentAllowsProcessing =
    !processingHold &&
    consent?.status === "GRANTED" &&
    Boolean(consent?.consentedAt) &&
    !consent?.revokedAt &&
    (recordingKind === "LOCAL_VIDEO" ? consent.canRecordVideo === true : consent.canRecordAudio === true);
  const consentAllowsTranscription = consentAllowsProcessing && consent?.canTranscribe === true;
  const exactBytesVerified = input.exactBytesVerified === true
    && Boolean(input.checksumSha256);

  const existingRecordingAsset =
    references.recordingAsset ||
    await findReusableRecordingAsset(input, room.id, participant.id, startedAt);
  const recordingStatus =
    !consentAllowsProcessing
      ? "HELD"
      : existingRecordingAsset?.status === "VERIFIED" || exactBytesVerified
      ? "VERIFIED"
      : "UPLOADED";
  const recordingAssetData = {
    kind: recordingKind,
    status: recordingStatus,
    fileName: input.fileName,
    contentType: input.contentType || existingRecordingAsset?.contentType || null,
    byteSize: BigInt(input.sizeBytes),
    storageBucket: input.storageBucket || existingRecordingAsset?.storageBucket || null,
    storageObjectPath: input.storageObjectPath || existingRecordingAsset?.storageObjectPath || null,
    checksum: input.checksumSha256 || existingRecordingAsset?.checksum || null,
    localManifestJson: {
      ...safeJson(existingRecordingAsset?.localManifestJson),
      ...metadataJson,
      provider: input.provider,
      totalChunks: input.totalChunks || 1,
      consentId: consent?.id || null,
      lastMobileCaptureIngestedAt: new Date().toISOString(),
    },
    segmentsJson: recordingSegments(input.segmentsJson, existingRecordingAsset?.segmentsJson || []),
    recordedStartedAt: startedAt || existingRecordingAsset?.recordedStartedAt || null,
    recordedStoppedAt: stoppedAt || existingRecordingAsset?.recordedStoppedAt || null,
    uploadedAt: new Date(),
    verifiedAt: exactBytesVerified ? new Date() : existingRecordingAsset?.verifiedAt || null,
  };

  const recordingAsset = existingRecordingAsset
    ? await input.prisma.recordingAsset.update({
        where: { id: existingRecordingAsset.id },
        data: recordingAssetData,
      })
    : await input.prisma.recordingAsset.create({
        data: {
          roomId: room.id,
          participantId: participant.id,
          ...recordingAssetData,
        },
      });

  const totalChunks = Math.max(1, input.totalChunks || 1);
  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
    await input.prisma.uploadChunk.upsert({
      where: {
        assetId_chunkIndex: {
          assetId: recordingAsset.id,
          chunkIndex,
        },
      },
      update: {
        status: exactBytesVerified ? "VERIFIED" : "UPLOADED",
        checksum: input.checksumSha256 || undefined,
        uploadedAt: new Date(),
        verifiedAt: exactBytesVerified ? new Date() : null,
      },
      create: {
        assetId: recordingAsset.id,
        chunkIndex,
        status: exactBytesVerified ? "VERIFIED" : "UPLOADED",
        checksum: input.checksumSha256 || null,
        uploadedAt: new Date(),
        verifiedAt: exactBytesVerified ? new Date() : null,
      },
    });
  }

  const transcriptJob = await findOrQueueTranscriptJob(
    input,
    room.id,
    recordingAsset.id,
    consentAllowsTranscription,
    transcriptionHold,
  );

  return {
    roomId: room.id,
    participantId: participant.id,
    consentId: consent?.id || null,
    consentStatus: consent?.status || "MISSING",
    recordingAssetId: recordingAsset.id,
    recordingAssetStatus: recordingAsset.status,
    transcriptJobId: transcriptJob.id,
    transcriptJobStatus: transcriptJob.status,
  };
}
