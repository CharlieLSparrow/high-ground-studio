import "server-only";

import { getPrismaClient } from "@/lib/prisma";
import {
  addCaptureGroupOffsetsToImportedMedia,
  type CaptureSourceAlignmentProposal,
} from "@/lib/server/capture-source-alignment";
import { toGcsUri } from "@/lib/server/gcs";
import { mobileCaptureMediaProcessingGate } from "@/lib/server/mobile-capture-processing-gates";
import { attachAssetToNest, createWorkflowJob } from "@/lib/server/quipsly-core";
import { resolveStudioProjectAccess } from "@/lib/server/studio-project-access";

type PromotionInput = {
  prisma?: any;
  recordingAssetId: string;
  actorUserId: string;
  actorEmail?: string | null;
  isStaff?: boolean;
  nestSlug?: string | null;
  episodeSlug?: string | null;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return isObject(value) ? value : {};
}

function toJsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

function publicBigIntNumber(value: unknown) {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function dateIso(value: unknown) {
  return value instanceof Date ? value.toISOString() : undefined;
}

function captureAlignmentFromRecordingAsset(
  recordingAsset: any,
): CaptureSourceAlignmentProposal | null {
  const manifest = asRecord(recordingAsset?.localManifestJson);
  const promotion = asRecord(manifest.promotion);
  const candidates = [
    asRecord(promotion.alignment),
    asRecord(manifest.alignment),
  ];
  const alignment = candidates.find((candidate) => (
    candidate.schema === "quipsly-capture-alignment-proposal-v1"
  ));
  if (!alignment) return null;

  const reviewGate = asRecord(alignment.reviewGate);
  if (
    alignment.sampleAccurateClaimed !== false
    || alignment.reviewRequired !== true
    || reviewGate.waveformCorrelationRequired !== true
    || reviewGate.driftReviewRequired !== true
    || reviewGate.humanApprovalRequired !== true
  ) {
    return null;
  }
  return toJsonValue(alignment) as CaptureSourceAlignmentProposal;
}

/**
 * Reconstructs the canonical editor handoff from RecordingAsset evidence.
 * Normalized mobile finalization writes this evidence before generic/manual
 * promotion can run. Provider and legacy assets simply omit fields they do not
 * possess; no clock or consent claim is inferred.
 */
export function recordingPromotionSyncEvidence(
  recordingAsset: any,
  promotedAt: string,
): Record<string, unknown> {
  const manifest = asRecord(recordingAsset?.localManifestJson);
  const promotion = asRecord(manifest.promotion);
  const alignment = captureAlignmentFromRecordingAsset(recordingAsset);
  const captureGroupId =
    text(manifest.captureGroupId)
    || text(promotion.captureGroupId)
    || text(alignment?.captureGroupId);
  const uploadSessionId = text(manifest.sessionId);
  const capturePurpose = text(manifest.capturePurpose);
  const expectedSha256 =
    text(manifest.checksumSha256)
    || text(recordingAsset?.checksum);
  const storageGeneration = text(manifest.storageGeneration);
  const reportedSourceProfile = asRecord(manifest.reportedSourceProfile);
  const recordingSegments =
    Array.isArray(recordingAsset?.segmentsJson)
    || isObject(recordingAsset?.segmentsJson)
      ? toJsonValue(recordingAsset.segmentsJson)
      : [];

  return {
    recordingAssetId: recordingAsset.id,
    callRoomId: recordingAsset.roomId,
    participantId: recordingAsset.participantId ?? null,
    recordingConsentId: text(manifest.recordingConsentId) || null,
    ...(typeof manifest.recordingConsentGranted === "boolean"
      ? { recordingConsentGranted: manifest.recordingConsentGranted }
      : {}),
    recordedStartAt: dateIso(recordingAsset.recordedStartedAt),
    recordedEndAt: dateIso(recordingAsset.recordedStoppedAt),
    durationSeconds: recordingAsset.durationSeconds ?? null,
    recordingSegments,
    ...(capturePurpose ? { capturePurpose } : {}),
    ...(captureGroupId ? { captureGroupId } : {}),
    ...(uploadSessionId ? { uploadSessionId } : {}),
    ...(expectedSha256 ? { expectedSha256 } : {}),
    ...(storageGeneration ? { storageGeneration } : {}),
    ...(Object.keys(reportedSourceProfile).length > 0
      ? { reportedSourceProfile }
      : {}),
    ...(alignment ? { alignment } : {}),
    promotedAt,
    source: "recording-media-promotion",
  };
}

type SessionHandoffTag = {
  id: string;
  slug: string;
  label: string;
  category: string;
};

export type RecordingSessionHandoffContext = {
  version: 1;
  source: "call-room-canonical-context";
  roomId: string;
  roomUpdatedAt?: string;
  projectId: string;
  projectSlug: string;
  tagIds: string[];
  tagSnapshot: SessionHandoffTag[];
  canonicalTagSource: string;
};

export function recordingSessionHandoffContext(room: any): RecordingSessionHandoffContext | null {
  const projectId = text(room?.project?.id) || text(room?.projectId);
  const projectSlug = text(room?.project?.slug);
  const roomId = text(room?.id);
  if (!projectId || !projectSlug || !roomId) return null;

  const tagSnapshot = (Array.isArray(room?.tagLinks) ? room.tagLinks : [])
    .map((link: any) => link?.tag)
    .filter((tag: any) => text(tag?.projectId) === projectId && text(tag?.id))
    .map((tag: any) => ({
      id: text(tag.id),
      slug: text(tag.slug),
      label: text(tag.label),
      category: text(tag.category),
    }))
    .sort((a: SessionHandoffTag, b: SessionHandoffTag) => a.id.localeCompare(b.id));

  return {
    version: 1,
    source: "call-room-canonical-context",
    roomId,
    roomUpdatedAt: dateIso(room?.updatedAt),
    projectId,
    projectSlug,
    tagIds: tagSnapshot.map((tag: SessionHandoffTag) => tag.id),
    tagSnapshot,
    canonicalTagSource: `/sessions/${encodeURIComponent(roomId)}`,
  };
}

function isProviderRecordingReceiptSlot(asset: any) {
  const manifest = isObject(asset?.localManifestJson) ? asset.localManifestJson : {};
  return asset?.kind === "SERVER_MIX" && manifest.source === "provider-recording-receipt-slot";
}

function manifestPromotion(asset: any) {
  const manifest = isObject(asset?.localManifestJson) ? asset.localManifestJson : {};
  return isObject(manifest.promotion) ? manifest.promotion : null;
}

function inferMediaKind(asset: any) {
  const kind = text(asset?.kind).toUpperCase();
  const contentType = text(asset?.contentType).toLowerCase();

  if (kind.includes("VIDEO") || contentType.startsWith("video/")) return "video";
  if (kind.includes("AUDIO") || kind === "SERVER_MIX" || contentType.startsWith("audio/")) return "audio";
  return "other";
}

function importRoleFor(asset: any) {
  const kind = text(asset?.kind).toUpperCase();
  const contentType = text(asset?.contentType).toLowerCase();
  if (kind === "SERVER_MIX") return contentType.startsWith("video/") ? "room-composite-video" : "room-mix-audio";
  if (kind.includes("VIDEO")) return "participant-camera";
  if (kind.includes("AUDIO")) return "spine-audio-candidate";
  return "capture-source";
}

function readableRoleLabel(role: string) {
  if (role === "room-composite-video") return "Room composite video";
  if (role === "room-mix-audio") return "Room mix audio";
  if (role === "participant-camera") return "Participant camera";
  if (role === "spine-audio-candidate") return "Spine audio candidate";
  return "Capture source";
}

function titleFor(asset: any, room: any) {
  const title = text(room?.title) || text(room?.booking?.offering?.title) || "Quipsly capture";
  const fileName = text(asset?.fileName) || "recording";
  return `${title} - ${fileName}`;
}

function canAccessRecordingAssetWhere(input: PromotionInput) {
  if (input.isStaff) return { id: input.recordingAssetId };

  return {
    id: input.recordingAssetId,
    OR: [
      { room: { createdByUserId: input.actorUserId } },
      { room: { participants: { some: { userId: input.actorUserId } } } },
      { room: { booking: { clientUserId: input.actorUserId } } },
      { room: { booking: { coachUserId: input.actorUserId } } },
    ],
  };
}

export function resolveRecordingPromotionTarget(input: {
  requestedNestSlug?: string | null;
  room: any;
  recordingAsset: any;
}) {
  const manifest = asRecord(input.recordingAsset?.localManifestJson);
  const requested = text(input.requestedNestSlug);
  const manifestNest = text(manifest.projectSlug);
  const canonicalNest = text(input.room?.project?.slug);
  const roomNest = text(input.room?.projectSlug) || text(input.room?.nestSlug);
  if (canonicalNest) {
    if (manifestNest && manifestNest !== canonicalNest) {
      return {
        nestSlug: "",
        source: "binding-conflict",
        boundNestSlug: canonicalNest,
        conflictNestSlug: manifestNest,
      };
    }
    if (requested && requested !== canonicalNest) {
      return {
        nestSlug: "",
        source: "canonical-project-conflict",
        boundNestSlug: canonicalNest,
        conflictNestSlug: requested,
      };
    }
    return {
      nestSlug: canonicalNest,
      source: "canonical-session-project",
      boundNestSlug: canonicalNest,
      conflictNestSlug: null,
      legacySlugDrift: Boolean(roomNest && roomNest !== canonicalNest),
    };
  }
  if (manifestNest && roomNest && manifestNest !== roomNest) {
    return {
      nestSlug: "",
      source: "binding-conflict",
      boundNestSlug: manifestNest,
      conflictNestSlug: roomNest,
    };
  }
  const boundNestSlug = manifestNest || roomNest;
  if (requested) {
    return {
      nestSlug: requested,
      source: requested === boundNestSlug ? "request-matches-capture" : "explicit-cross-project-request",
      boundNestSlug: boundNestSlug || null,
      conflictNestSlug: null,
    };
  }
  if (boundNestSlug) {
    return {
      nestSlug: boundNestSlug,
      source: manifestNest ? "capture-manifest" : "room",
      boundNestSlug,
      conflictNestSlug: null,
    };
  }
  return { nestSlug: "", source: "missing", boundNestSlug: null, conflictNestSlug: null };
}

async function authorizePromotionDestination(input: {
  prisma: any;
  targetNestSlug: string;
  actorEmail?: string | null;
}) {
  const access = await resolveStudioProjectAccess({
    projectSlug: input.targetNestSlug,
    email: input.actorEmail,
    action: "write",
    prisma: input.prisma,
  });
  return access.allowed && access.projectId ? access : null;
}

function promotionAttachmentMetadata(input: {
  recordingAsset: any;
  sourceId: string;
  playbackUrl: string;
  providerSourceId: string;
  storageBucket: string | null;
  storageObjectPath: string;
  episodeSlug: string;
  mediaKind: string;
  sessionContext: RecordingSessionHandoffContext | null;
}) {
  const recordingSync = recordingPromotionSyncEvidence(
    input.recordingAsset,
    new Date().toISOString(),
  );
  return {
    handoffVersion: 1,
    handoffKind: "capture-session-to-studio",
    callRoomId: input.recordingAsset.roomId,
    recordingAssetId: input.recordingAsset.id,
    sourceId: input.sourceId,
    playbackUrl: input.playbackUrl,
    providerSourceId: input.providerSourceId,
    storageBucket: input.storageBucket,
    storageObjectPath: input.storageObjectPath,
    episodeSlug: input.episodeSlug,
    mediaKind: input.mediaKind,
    promotedFrom: "RecordingAsset",
    captureGroupId: text(recordingSync.captureGroupId) || null,
    alignment: recordingSync.alignment ?? null,
    sessionContext: input.sessionContext,
    boundaries: {
      copiedBlob: false,
      mutatedOriginal: false,
      externalPublished: false,
      canonicalTagsRemainOnSession: true,
    },
  };
}

// Episode attach writes StudioEpisodeProduction.productionJson.importedMedia.
// The bucket keeps the blob; episode production state keeps the editor meaning.
async function attachPromotedRecordingToEpisodeProduction(input: {
  prisma: any;
  projectId: string;
  projectSlug: string;
  episodeSlug?: string | null;
  recordingAsset: any;
  mediaAsset: any;
  sourceId: string;
  playbackUrl: string;
  providerSourceId: string;
  importRole: string;
  mediaKind: string;
  actorUserId: string;
  sessionContext: RecordingSessionHandoffContext | null;
}) {
  const episodeSlug = text(input.episodeSlug);
  if (!episodeSlug) {
    return {
      status: "not-requested",
      message: "No episodeSlug was supplied, so the recording was attached to the Nest only.",
    };
  }

  if (!input.prisma.studioEpisodeProduction) {
    return {
      status: "episode-production-unavailable",
      episodeSlug,
      message: "Episode production persistence is not available in this deployment.",
    };
  }

  const project = await input.prisma.studioProject.findUnique({
    where: { id: input.projectId },
    include: { documents: { orderBy: { createdAt: "asc" }, take: 1 } },
  });
  const document = project?.documents?.[0] ?? null;
  if (!project || !document) {
    return {
      status: "missing-project-document",
      episodeSlug,
      message: "The Nest needs a document before Quipsly can create episode production state.",
    };
  }

  const title = episodeSlug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  const production = await input.prisma.studioEpisodeProduction.upsert({
    where: { projectId_slug: { projectId: input.projectId, slug: episodeSlug } },
    update: {
      title,
      boundaryLabel: title,
      boundaryKind: "episode",
    },
    create: {
      projectId: input.projectId,
      documentId: document.id,
      slug: episodeSlug,
      title,
      boundaryLabel: title,
      boundaryKind: "episode",
      productionJson: {
        episodeProductionPayloadVersion: 1,
        projectSlug: input.projectSlug,
        episodeSlug,
        importedMedia: [],
        source: "recording-media-promotion.create-production",
      },
    },
  });

  const currentJson = asRecord(production.productionJson);
  const importedMedia = Array.isArray(currentJson.importedMedia) ? currentJson.importedMedia.map(asRecord) : [];
  const existingImportedAsset = importedMedia.find((asset) => {
    const assetMetadata = asRecord(asset.metadata);
    const assetRecordingSync = asRecord(assetMetadata.recordingSync);
    return text(asset.id) === input.mediaAsset.id
      || text(asset.sourceId) === input.sourceId
      || text(assetRecordingSync.recordingAssetId) === input.recordingAsset.id;
  });
  if (existingImportedAsset) {
    return {
      status: "already-attached-to-episode-production",
      episodeSlug,
      productionId: production.id,
      importedMediaId: text(existingImportedAsset.id) || input.mediaAsset.id,
      importRole: text(existingImportedAsset.importRole) || input.importRole,
      proxyStillNeededForVideo: input.mediaKind === "video",
      message: "This whole-source recording is already attached to the episode; no duplicate media or workflow job was created.",
    };
  }
  const promotedAt = new Date().toISOString();
  const storageBucket = text(input.recordingAsset.storageBucket);
  const storageObjectPath = text(input.recordingAsset.storageObjectPath);
  const isVideo = input.mediaKind === "video";
  const recordingSync = recordingPromotionSyncEvidence(
    input.recordingAsset,
    promotedAt,
  );
  const alignment = recordingSync.alignment;
  const importedAsset = {
    id: input.mediaAsset.id,
    sourceId: input.sourceId,
    projectSlug: input.projectSlug,
    episodeSlug,
    originalName: text(input.mediaAsset.filename) || text(input.recordingAsset.fileName) || "capture-recording",
    contentType: text(input.mediaAsset.mimeType) || text(input.recordingAsset.contentType) || "application/octet-stream",
    size: publicBigIntNumber(input.mediaAsset.sizeBytes ?? input.recordingAsset.byteSize),
    kind: isVideo ? "video" : input.mediaKind === "audio" ? "audio" : "unknown",
    bucketName: storageBucket,
    objectName: storageObjectPath,
    gcsUri: input.providerSourceId,
    playbackUrl: input.playbackUrl,
    importedAt: promotedAt,
    source: "recorder-upload",
    importRole: input.importRole,
    metadata: {
      recordingSync,
      sessionContext: input.sessionContext,
      localImport: {
        promotedFrom: "RecordingAsset",
        roleLabel: readableRoleLabel(input.importRole),
        copiedBlob: false,
        mutatedOriginal: false,
      },
    },
    sync: {
      status: "ready-to-sync",
      suggestedRole: input.importRole,
      source: "recording-media-promotion",
      recordingSync,
      ...(alignment ? { alignment } : {}),
      note: `${readableRoleLabel(input.importRole)} promoted from verified capture evidence. Ready to align in the episode editor.`,
    },
    proxy: {
      status: isVideo ? "queued" : "not-required",
      note: isVideo
        ? "Video recording is source-safe but still needs a media-vault proxy before comfortable collaborative editing."
        : "Audio recording does not require a video proxy.",
    },
  };

  const withoutExisting = importedMedia.filter((asset) => {
    const assetMetadata = asRecord(asset.metadata);
    const assetRecordingSync = asRecord(assetMetadata.recordingSync);
    return (
      text(asset.id) !== input.mediaAsset.id &&
      text(asset.sourceId) !== input.sourceId &&
      text(assetRecordingSync.recordingAssetId) !== input.recordingAsset.id
    );
  });
  const nextImportedMedia = addCaptureGroupOffsetsToImportedMedia([
    importedAsset,
    ...withoutExisting,
  ]);
  const nextProductionJson = {
    ...currentJson,
    episodeProductionPayloadVersion: 1,
    projectSlug: input.projectSlug,
    episodeSlug,
    importedMedia: nextImportedMedia,
    lastRecordingPromotionAt: promotedAt,
    source: "recording-media-promotion",
  };

  await input.prisma.studioEpisodeProduction.update({
    where: { id: production.id },
    data: { productionJson: toJsonValue(nextProductionJson) },
  });

  await createWorkflowJob({
    prisma: input.prisma,
    projectId: input.projectId,
    assetId: input.mediaAsset.id,
    type: "asset-register",
    source: "recording-media-promotion.episode-production",
    requestedByEmail: null,
    inputJson: {
      recordingAssetId: input.recordingAsset.id,
      mediaAssetId: input.mediaAsset.id,
      sourceId: input.sourceId,
      projectSlug: input.projectSlug,
      episodeSlug,
      importRole: input.importRole,
      mediaKind: input.mediaKind,
      workflowKind: "episode-recording-attach",
      importedMediaCount: nextImportedMedia.length,
      proxyStillNeededForVideo: isVideo,
      sessionContext: input.sessionContext,
    },
  });

  return {
    status: "attached-to-episode-production",
    episodeSlug,
    productionId: production.id,
    importedMediaId: input.mediaAsset.id,
    importRole: input.importRole,
    proxyStillNeededForVideo: isVideo,
    message: "Recording is now visible to the episode editor as whole-source imported media.",
  };
}

export async function promoteRecordingAssetToStudioMedia(input: PromotionInput) {
  const prisma = input.prisma ?? getPrismaClient();
  const recordingAssetId = text(input.recordingAssetId);

  if (!recordingAssetId) {
    return {
      ok: false,
      status: "missing-recording-asset",
      message: "Choose a recording asset before promoting capture media.",
    };
  }

  const recordingAsset = await prisma.recordingAsset.findFirst({
    where: canAccessRecordingAssetWhere({ ...input, recordingAssetId }),
    include: {
      room: {
        include: {
          booking: { include: { offering: true } },
          project: { select: { id: true, slug: true, name: true } },
          tagLinks: {
            include: {
              tag: { select: { id: true, projectId: true, slug: true, label: true, category: true } },
            },
          },
        },
      },
      participant: true,
    },
  });

  if (!recordingAsset) {
    return {
      ok: false,
      status: "not-found",
      message: "Recording asset was not found or is not visible to this user.",
    };
  }

  if (isProviderRecordingReceiptSlot(recordingAsset)) {
    return {
      ok: false,
      status: "receipt-slot-not-media",
      recordingAssetId: recordingAsset.id,
      message: "Provider receipt slots are not media. Reconcile the provider file before promotion.",
    };
  }

  const processingGate = await mobileCaptureMediaProcessingGate({
    prisma,
    recordingAsset,
  });
  if (!processingGate.allowed) {
    return {
      ok: false,
      status: "capture-processing-held",
      recordingAssetId: recordingAsset.id,
      holdReasonCode: processingGate.errorCode,
      message: processingGate.error,
    };
  }

  if (recordingAsset.status !== "VERIFIED") {
    return {
      ok: false,
      status: "needs-verification",
      recordingAssetId: recordingAsset.id,
      recordingAssetStatus: recordingAsset.status,
      message: "Promote only verified recording evidence into the editor/media system.",
    };
  }

  const target = resolveRecordingPromotionTarget({
    requestedNestSlug: input.nestSlug,
    room: recordingAsset.room,
    recordingAsset,
  });
  if (target.source === "binding-conflict" || target.source === "canonical-project-conflict") {
    return {
      ok: false,
      status: target.source === "canonical-project-conflict"
        ? "canonical-session-project-conflict"
        : "capture-destination-binding-conflict",
      httpStatus: 409,
      recordingAssetId: recordingAsset.id,
      targetNestSlug: target.boundNestSlug,
      conflictNestSlug: target.conflictNestSlug,
      message: target.source === "canonical-project-conflict"
        ? "This Session has a canonical Nest. Move the Session explicitly before promoting it somewhere else."
        : "Capture manifest and canonical Session project bindings disagree. Resolve that integrity conflict before promotion.",
    };
  }
  if (!target.nestSlug) {
    return {
      ok: false,
      status: "missing-nest",
      recordingAssetId: recordingAsset.id,
      message: "Recording needs an explicit Nest or an immutable capture-room project binding before promotion.",
    };
  }
  const sessionContext = recordingSessionHandoffContext(recordingAsset.room);

  const existingPromotion = manifestPromotion(recordingAsset);
  const existingMediaAssetId = text(existingPromotion?.mediaAssetId);
  if (existingMediaAssetId) {
    const existingNestSlug = text(existingPromotion?.nestSlug);
    if (!existingNestSlug || existingNestSlug !== target.nestSlug) {
      return {
        ok: false,
        status: "promotion-destination-conflict",
        httpStatus: 409,
        recordingAssetId: recordingAsset.id,
        targetNestSlug: existingNestSlug || null,
        message: "This recording promotion is already bound to another Nest destination.",
      };
    }
    const existingAccess = await authorizePromotionDestination({
      prisma,
      targetNestSlug: existingNestSlug,
      actorEmail: input.actorEmail,
    });
    if (!existingAccess) {
      return {
        ok: false,
        status: "destination-access-denied",
        httpStatus: 403,
        recordingAssetId: recordingAsset.id,
        targetNestSlug: existingNestSlug,
        message: "You do not have write access to the recording's Studio destination.",
      };
    }
    const existingMediaAsset = await prisma.studioMediaAsset.findUnique({
      where: { id: existingMediaAssetId },
      select: { id: true, filename: true, url: true, mimeType: true, isProxy: true },
    });

    if (existingMediaAsset) {
      const existingEpisodeSlug = text(input.episodeSlug) || text(existingPromotion?.episodeSlug) || recordingAsset.room.id;
      const existingSourceId = text(existingPromotion?.sourceId);
      const existingProviderSourceId = text(existingPromotion?.providerSourceId);
      const existingMediaKind = text(existingPromotion?.mediaKind) || inferMediaKind(recordingAsset);
      const existingImportRole = text(existingPromotion?.importRole) || importRoleFor(recordingAsset);
      const handoffAttachment = await attachAssetToNest({
        prisma,
        nestSlug: existingNestSlug,
        actorEmail: input.actorEmail,
        assetId: existingMediaAsset.id,
        role: existingImportRole,
        source: "recording-media-promotion",
        metadataJson: promotionAttachmentMetadata({
          recordingAsset,
          sourceId: existingSourceId,
          playbackUrl: existingMediaAsset.url,
          providerSourceId: existingProviderSourceId,
          storageBucket: text(recordingAsset.storageBucket) || null,
          storageObjectPath: text(recordingAsset.storageObjectPath),
          episodeSlug: existingEpisodeSlug,
          mediaKind: existingMediaKind,
          sessionContext,
        }),
      });
      const episodeAttachment = await attachPromotedRecordingToEpisodeProduction({
        prisma,
        projectId: existingAccess.projectId!,
        projectSlug: existingNestSlug,
        episodeSlug: existingEpisodeSlug,
        recordingAsset,
        mediaAsset: existingMediaAsset,
        sourceId: existingSourceId,
        playbackUrl: existingMediaAsset.url,
        providerSourceId: existingProviderSourceId,
        importRole: existingImportRole,
        mediaKind: existingMediaKind,
        actorUserId: input.actorUserId,
        sessionContext,
      }).catch((error) => ({
        status: "episode-attachment-failed",
        message: error instanceof Error ? error.message : "Episode attachment failed.",
      }));
      return {
        ok: true,
        status: "already-promoted",
        recordingAssetId: recordingAsset.id,
        mediaAsset: existingMediaAsset,
        sourceId: text(existingPromotion?.sourceId) || null,
        playbackUrl: existingMediaAsset.url,
        targetNestSlug: text(existingPromotion?.nestSlug) || null,
        handoffReceipt: {
          attachmentId: handoffAttachment.attachment.id,
          projectId: handoffAttachment.attachment.projectId,
          sessionContext,
          idempotent: true,
        },
        episodeAttachment,
        message: "Recording was already promoted into Quipsly media.",
      };
    }
  }

  const storageBucket = text(recordingAsset.storageBucket);
  const storageObjectPath = text(recordingAsset.storageObjectPath);
  if (!storageObjectPath) {
    return {
      ok: false,
      status: "missing-storage-object",
      recordingAssetId: recordingAsset.id,
      message: "Recording cannot be promoted until storage object evidence is present.",
    };
  }

  const recordingManifest = isObject(recordingAsset.localManifestJson)
    ? recordingAsset.localManifestJson
    : {};
  const storageGeneration = text(recordingManifest.storageGeneration);
  const fallbackProviderSourceId = storageObjectPath.startsWith("gcs://")
    ? storageObjectPath
    : storageBucket
      ? toGcsUri(storageBucket, storageObjectPath, storageGeneration || null)
      : storageObjectPath;
  const fallbackCloudProvider = fallbackProviderSourceId.startsWith("gcs://") ? "gcs" : "local";
  const fileName = text(recordingAsset.fileName) || `${recordingAsset.id}.media`;
  const contentType = text(recordingAsset.contentType) || "application/octet-stream";
  const mediaKind = inferMediaKind(recordingAsset);
  const importRole = importRoleFor(recordingAsset);

  const destinationAccess = await authorizePromotionDestination({
    prisma,
    targetNestSlug: target.nestSlug,
    actorEmail: input.actorEmail,
  });
  if (!destinationAccess) {
    return {
      ok: false,
      status: "destination-access-denied",
      httpStatus: 403,
      recordingAssetId: recordingAsset.id,
      targetNestSlug: target.nestSlug,
      boundNestSlug: target.boundNestSlug,
      explicitCrossProjectRequest: target.source === "explicit-cross-project-request",
      message: "You do not have write access to the requested Studio destination.",
    };
  }

  // Destination authorization must precede every reusable media/source write.
  // All local handoff records commit together so an episode/receipt failure
  // cannot strand a reusable media row without its canonical provenance.
  return prisma.$transaction(async (tx: any) => {
  // Finalization already creates the immutable playback source and one media
  // reference after exact-byte verification. Promotion adds shared/editor
  // meaning to those rows; it must not mint a second source/media identity for
  // the same recording. The released finalization receipt is the authoritative
  // bridge, including the real local-development path when no GCS object exists.
  const finalizationReceipt = await tx.mobileCaptureFinalizationReceipt.findFirst({
    where: {
      recordingAssetId: recordingAsset.id,
      processingDisposition: "RELEASED",
      sourceId: { not: null },
      mediaAssetId: { not: null },
    },
    orderBy: { createdAt: "desc" },
    select: { sourceId: true, mediaAssetId: true },
  });
  const [finalizedSource, finalizedMediaAsset] = finalizationReceipt
    ? await Promise.all([
        tx.studioVideoSource.findUnique({ where: { id: finalizationReceipt.sourceId } }),
        tx.studioMediaAsset.findUnique({ where: { id: finalizationReceipt.mediaAssetId } }),
      ])
    : [null, null];
  const reusableFinalizedMedia = Boolean(
    finalizedSource
      && finalizedMediaAsset
      && finalizedSource.providerSourceId
      && finalizedMediaAsset.rawAssetId === finalizedSource.id
      && finalizedMediaAsset.url === `/api/ingest/media/${finalizedSource.id}`,
  );

  const source = reusableFinalizedMedia
    ? finalizedSource
    : await tx.studioVideoSource.create({
        data: {
          provider: "capture-recording",
          providerSourceId: fallbackProviderSourceId,
          url: "/api/ingest/media/pending",
          title: titleFor(recordingAsset, recordingAsset.room),
        },
      });
  const playbackUrl = `/api/ingest/media/${source.id}`;
  if (source.url !== playbackUrl) {
    await tx.studioVideoSource.update({
      where: { id: source.id },
      data: { url: playbackUrl },
    });
  }

  const mediaAsset = reusableFinalizedMedia
    ? finalizedMediaAsset
    : await tx.studioMediaAsset.create({
        data: {
          filename: fileName,
          url: playbackUrl,
          mimeType: contentType,
          sizeBytes: recordingAsset.byteSize ?? null,
          isProxy: false,
          rawAssetId: source.id,
          cloudProvider: fallbackCloudProvider,
          isGlobal: false,
          duration: recordingAsset.durationSeconds ?? null,
        },
      });
  const providerSourceId = text(source.providerSourceId) || fallbackProviderSourceId;

  const episodeSlug =
    text(input.episodeSlug) ||
    text(recordingAsset.room?.booking?.offering?.slug) ||
    text(recordingAsset.room?.id) ||
    "capture-session";
  const attachedResult = await attachAssetToNest({
    prisma: tx,
    nestSlug: target.nestSlug,
    actorEmail: input.actorEmail,
    assetId: mediaAsset.id,
    role: importRole,
    source: "recording-media-promotion",
    metadataJson: promotionAttachmentMetadata({
      recordingAsset,
      sourceId: source.id,
      playbackUrl,
      providerSourceId,
      storageBucket: storageBucket || null,
      storageObjectPath,
      episodeSlug,
      mediaKind,
      sessionContext,
    }),
  });
  const attached = {
    ...attachedResult,
    targetNestSlug: target.nestSlug,
    targetResolvedFrom: target.source,
  };

  await createWorkflowJob({
    prisma: tx,
    projectId: attached.attachment.projectId,
    assetId: mediaAsset.id,
    type: mediaKind === "video" ? "asset-proxy" : "asset-register",
    source: "recording-media-promotion",
    requestedByEmail: input.actorEmail,
    inputJson: {
      callRoomId: recordingAsset.roomId,
      recordingAssetId: recordingAsset.id,
      sourceId: source.id,
      playbackUrl,
      targetNestSlug: attached.targetNestSlug,
      episodeSlug,
      mediaKind,
      sessionContext,
      proxyPolicy: mediaKind === "video" ? "proxy-required-before-collaborative-editing" : "audio-source-registered",
    },
  });

  const episodeAttachment = await attachPromotedRecordingToEpisodeProduction({
    prisma: tx,
    projectId: attached.attachment.projectId,
    projectSlug: attached.targetNestSlug,
    episodeSlug,
    recordingAsset,
    mediaAsset,
    sourceId: source.id,
    playbackUrl,
    providerSourceId,
    importRole,
    mediaKind,
    actorUserId: input.actorUserId,
    sessionContext,
  });

  const promotedAt = new Date().toISOString();
  await tx.recordingAsset.update({
    where: { id: recordingAsset.id },
    data: {
      localManifestJson: {
        ...(isObject(recordingAsset.localManifestJson) ? recordingAsset.localManifestJson : {}),
        promotion: {
          status: "promoted-to-studio-media",
          mediaAssetId: mediaAsset.id,
          sourceId: source.id,
          playbackUrl,
          providerSourceId,
          projectId: attached.attachment.projectId,
          nestSlug: attached.targetNestSlug,
          targetResolvedFrom: attached.targetResolvedFrom,
          episodeSlug,
          episodeAttachment,
          importRole,
          mediaKind,
          sessionContext,
          handoffReceipt: {
            version: 1,
            attachmentId: attached.attachment.id,
            projectId: attached.attachment.projectId,
            source: "StudioAssetAttachment",
          },
          promotedAt,
          promotedByUserId: input.actorUserId,
          source: "recording-media-promotion",
        },
      },
    },
  });

  return {
    ok: true,
    status: "promoted",
    recordingAssetId: recordingAsset.id,
    mediaAsset: {
      id: mediaAsset.id,
      filename: mediaAsset.filename,
      url: mediaAsset.url,
      mimeType: mediaAsset.mimeType,
      isProxy: mediaAsset.isProxy,
      cloudProvider: mediaAsset.cloudProvider,
    },
    sourceId: source.id,
    playbackUrl,
    targetNestSlug: attached.targetNestSlug,
    targetResolvedFrom: attached.targetResolvedFrom,
    episodeSlug,
    mediaKind,
    importRole,
    handoffReceipt: {
      version: 1,
      attachmentId: attached.attachment.id,
      projectId: attached.attachment.projectId,
      sessionContext,
      idempotent: false,
    },
    episodeAttachment,
    boundaries: {
      copiedBlob: false,
      mutatedOriginal: false,
      externalPublished: false,
      proxyStillNeededForVideo: mediaKind === "video",
      sourceTruth: "RecordingAsset remains capture evidence. StudioMediaAsset is the reusable editor/media reference.",
    },
    message: "Verified recording is now available as Quipsly media.",
  };
  });
}
