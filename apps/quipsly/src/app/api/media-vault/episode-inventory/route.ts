import { NextResponse } from "next/server";
import { importedMediaProxyReadiness } from "@/lib/episode-production/media-proxy-readiness";
import { parseAudibleEventDetectorReceipt } from "@/lib/audio/audible-event-analysis";

import {
  canonicalEpisodeImportedMedia,
} from "@/lib/episode-production/imported-media";
import { getPrismaClient } from "@/lib/prisma";
import { episodeInventoryAudioMasterCandidate } from "@/lib/episode-inventory-audio-master";
import { episodeInventoryAudioDeliveryArtifact } from "@/lib/episode-inventory-audio-delivery";
import {
  episodeAudioProcessingEvidence,
  episodeAudioSignalActivityEvidence,
  episodeAudioTranscriptActivityEvidence,
} from "@/lib/episode-audio-processing-evidence";
import {
  episodeAudioProgramFingerprint,
  projectEpisodeAudioTrackDecisions,
} from "@/lib/server/episode-audio-track-decisions";
import { getMediaVaultReadiness } from "@/lib/server/media-vault";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";
import {
  mobileCaptureMediaProcessingGate,
  mobileCaptureTranscriptProcessingGate,
} from "@/lib/server/mobile-capture-processing-gates";

export const runtime = "nodejs";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function jsonObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function jsonArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item)) : [];
}

function publicBigInt(value: unknown) {
  return value === null || value === undefined ? null : String(value);
}

function dateIso(value: unknown) {
  return value && typeof (value as any).toISOString === "function" ? (value as any).toISOString() : null;
}

function nestedRecord(value: Record<string, unknown>, key: string) {
  return jsonObject(value[key]);
}

function publicSessionContext(value: unknown) {
  const context = jsonObject(value);
  const tagSnapshot = jsonArray(context.tagSnapshot).map((tag) => ({
    id: text(tag.id),
    slug: text(tag.slug),
    label: text(tag.label),
    category: text(tag.category),
  })).filter((tag) => tag.id && tag.label);
  const roomId = text(context.roomId);
  const projectId = text(context.projectId);
  const projectSlug = text(context.projectSlug);
  if (!roomId || !projectId || !projectSlug) return null;
  return {
    version: Number(context.version) || 1,
    source: text(context.source) || "call-room-canonical-context",
    roomId,
    roomUpdatedAt: text(context.roomUpdatedAt) || null,
    projectId,
    projectSlug,
    tagIds: tagSnapshot.map((tag) => tag.id),
    tagSnapshot,
    canonicalTagSource: text(context.canonicalTagSource) || `/sessions/${encodeURIComponent(roomId)}`,
  };
}

function recordingAssetIdFromImportedMedia(item: Record<string, unknown>) {
  const direct = text(item.recordingAssetId);
  if (direct) return direct;

  const metadata = nestedRecord(item, "metadata");
  const metadataSync = nestedRecord(metadata, "recordingSync");
  const sync = nestedRecord(item, "sync");
  const syncRecording = nestedRecord(sync, "recordingSync");

  return text(metadataSync.recordingAssetId) || text(syncRecording.recordingAssetId) || null;
}

function collectAssetIds(importedMedia: Record<string, unknown>[]) {
  const ids = new Set<string>();
  for (const item of importedMedia) {
    for (const key of ["id", "assetId", "mediaAssetId", "rawAssetId"]) {
      const value = text(item[key]);
      if (value) ids.add(value);
    }
  }
  return [...ids];
}

function publicVariant(variant: any) {
  return {
    id: variant.id,
    kind: variant.kind,
    url: variant.url,
    mimeType: variant.mimeType,
    width: variant.width,
    height: variant.height,
    duration: variant.duration,
    sizeBytes: publicBigInt(variant.sizeBytes),
    metadataJson: jsonObject(variant.metadataJson),
    updatedAt: dateIso(variant.updatedAt),
  };
}

function publicJob(job: any) {
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    source: job.source,
    error: job.error,
    inputJson: jsonObject(job.inputJson),
    resultJson: jsonObject(job.resultJson),
    createdAt: dateIso(job.createdAt),
    updatedAt: dateIso(job.updatedAt),
    completedAt: dateIso(job.completedAt),
  };
}

function publicAttachment(attachment: any) {
  return {
    id: attachment.id,
    projectId: attachment.projectId,
    nestSlug: attachment.project?.slug ?? null,
    nestTitle: attachment.project?.name ?? null,
    role: attachment.role,
    source: attachment.source,
    metadataJson: jsonObject(attachment.metadataJson),
    updatedAt: dateIso(attachment.updatedAt),
  };
}

function publicAsset(asset: any, proxies: any[] = []): any {
  if (!asset) return null;
  const variants = Array.isArray(asset.variants) ? asset.variants.map(publicVariant) : [];
  const jobs = Array.isArray(asset.workflowJobs) ? asset.workflowJobs.map(publicJob) : [];
  const attachments = Array.isArray(asset.assetAttachments) ? asset.assetAttachments.map(publicAttachment) : [];
  const audioMasterPromotionEvents = Array.isArray(asset.audioMasterPromotions)
    ? asset.audioMasterPromotions
    : [];
  const audioMasterDeliveryCandidate = episodeInventoryAudioMasterCandidate(
    audioMasterPromotionEvents,
  );
  const audioDeliveryArtifact = episodeInventoryAudioDeliveryArtifact({
    jobs: Array.isArray(asset.processingJobs) ? asset.processingJobs : [],
    variants: Array.isArray(asset.variants) ? asset.variants : [],
    promotionEvents: audioMasterPromotionEvents,
  });
  const audioProcessingEvidence = episodeAudioProcessingEvidence(
    Array.isArray(asset.processingJobs) ? asset.processingJobs : [],
    Array.isArray(asset.transcriptJobs) ? asset.transcriptJobs : [],
  );
  const audioSignalActivityEvidence = episodeAudioSignalActivityEvidence(
    Array.isArray(asset.processingJobs) ? asset.processingJobs : [],
  );
  const audioTranscriptActivityEvidence = episodeAudioTranscriptActivityEvidence(
    Array.isArray(asset.processingJobs) ? asset.processingJobs : [],
    Array.isArray(asset.transcriptJobs) ? asset.transcriptJobs : [],
  );
  const proxyAssets: any[] = proxies.map((proxy) => publicAsset(proxy, [])).filter(Boolean);
  const hasProxy =
    proxyAssets.length > 0 ||
    variants.some((variant: any) => String(variant.kind || "").toLowerCase().includes("proxy"));

  return {
    id: asset.id,
    filename: asset.filename,
    url: asset.url,
    mimeType: asset.mimeType,
    sizeBytes: publicBigInt(asset.sizeBytes),
    isProxy: asset.isProxy,
    rawAssetId: asset.rawAssetId,
    cloudProvider: asset.cloudProvider,
    duration: asset.duration,
    resolution: asset.resolution,
    fps: asset.fps,
    thumbnailUrl: asset.thumbnailUrl,
    createdAt: dateIso(asset.createdAt),
    updatedAt: dateIso(asset.updatedAt),
    attachments,
    variants,
    jobs,
    audioProcessingEvidence,
    audioSignalActivityEvidence,
    audioTranscriptActivityEvidence,
    proxyAssets,
    audioMasterDeliveryCandidate,
    audioDeliveryArtifact,
    readiness: {
      sourceSafe: asset.isProxy !== true,
      hasProxy,
      needsProxy: asset.isProxy !== true && String(asset.mimeType || "").startsWith("video/") && !hasProxy,
      hasThumbnail: Boolean(asset.thumbnailUrl) || variants.some((variant: any) => String(variant.kind || "").toLowerCase().includes("thumb")),
      hasWorkflowJobs: jobs.length > 0,
      hasActiveAudioMasterCandidate: audioMasterDeliveryCandidate?.active === true,
      hasVerifiedAudioDeliveryArtifact: audioDeliveryArtifact?.readiness.encodedAndVerified === true,
      hasApprovedAudioDeliveryArtifact: audioDeliveryArtifact?.readiness.proofListenApproved === true,
    },
  };
}

type PublicProcessingGate = {
  allowed: boolean;
  errorCode?: string | null;
  error?: string | null;
};

const unavailableGate = (kind: "media" | "transcript"): PublicProcessingGate => ({
  allowed: false,
  errorCode: "CAPTURE_RELEASE_LEDGER_UNAVAILABLE",
  error: `Quipsly could not verify the normalized ${kind} release ledger, so processing remains held.`,
});

function publicRecording(recording: any, gates?: { media: PublicProcessingGate; transcript: PublicProcessingGate }) {
  const manifest = jsonObject(recording.localManifestJson);
  const promotion = jsonObject(manifest.promotion);
  const mediaGate = gates?.media ?? unavailableGate("media");
  const transcriptGate = gates?.transcript ?? unavailableGate("transcript");
  const transcriptJobs = Array.isArray(recording.transcriptJobs)
    ? recording.transcriptJobs.map((job: any) => ({
      id: job.id,
      status: job.status,
      provider: job.provider,
      assetId: job.assetId,
      roomId: job.roomId,
      segmentCount: job._count?.segments ?? null,
      startedAt: dateIso(job.startedAt),
      completedAt: dateIso(job.completedAt),
      updatedAt: dateIso(job.updatedAt),
      errorMessage: job.errorMessage,
    }))
    : [];

  return {
    id: recording.id,
    roomId: recording.roomId,
    participantId: recording.participantId,
    participant: recording.participant ? {
      id: recording.participant.id,
      displayName: recording.participant.displayName,
      email: recording.participant.email,
      role: String(recording.participant.role || "").toLowerCase() || null,
      deviceLabel: recording.participant.deviceLabel,
    } : null,
    kind: recording.kind,
    status: recording.status,
    fileName: recording.fileName,
    contentType: recording.contentType,
    byteSize: publicBigInt(recording.byteSize),
    durationSeconds: recording.durationSeconds,
    storageBucket: recording.storageBucket,
    storageObjectPath: recording.storageObjectPath,
    recordedStartedAt: dateIso(recording.recordedStartedAt),
    recordedStoppedAt: dateIso(recording.recordedStoppedAt),
    uploadedAt: dateIso(recording.uploadedAt),
    verifiedAt: dateIso(recording.verifiedAt),
    promotedMediaAssetId: text(promotion.mediaAssetId) || null,
    promotionStatus: text(promotion.status) || null,
    transcriptJobs,
    processing: {
      mediaDisposition: mediaGate.allowed ? "RELEASED" : "HELD",
      mediaHoldReasonCode: mediaGate.allowed ? null : mediaGate.errorCode || "CAPTURE_MEDIA_EXPLICIT_RELEASE_REQUIRED",
      mediaHoldReason: mediaGate.allowed ? null : mediaGate.error || "Capture media processing remains held.",
      transcriptDisposition: transcriptGate.allowed ? "RELEASED" : "HELD",
      transcriptHoldReasonCode: transcriptGate.allowed ? null : transcriptGate.errorCode || "CAPTURE_TRANSCRIPT_EXPLICIT_RELEASE_REQUIRED",
      transcriptHoldReason: transcriptGate.allowed ? null : transcriptGate.error || "Capture transcription remains held.",
    },
    readiness: {
      preservedAndVerified: recording.status === "VERIFIED",
      mediaProcessingReleased: mediaGate.allowed,
      transcriptProcessingReleased: transcriptGate.allowed,
      promotedToStudioMedia: mediaGate.allowed && Boolean(text(promotion.mediaAssetId)),
      completedTranscriptCount: transcriptGate.allowed
        ? transcriptJobs.filter((job: any) => job.status === "COMPLETED").length
        : 0,
      needsTranscript: transcriptGate.allowed
        && transcriptJobs.filter((job: any) => job.status === "COMPLETED").length === 0,
    },
  };
}

function importedMediaPublic(
  item: Record<string, unknown>,
  assetById: Map<string, any>,
  recordingById: Map<string, any>,
  processingByRecordingId: Map<string, { media: PublicProcessingGate; transcript: PublicProcessingGate }>,
) {
  const assetId = text(item.id) || text(item.assetId) || text(item.mediaAssetId) || null;
  const recordingAssetId = recordingAssetIdFromImportedMedia(item);
  const asset = assetId ? assetById.get(assetId) : null;
  const recording = recordingAssetId ? recordingById.get(recordingAssetId) : null;
  const unresolvedRecordingReference = Boolean(recordingAssetId && !recording);
  const assetView = asset ? publicAsset(asset, asset.proxyAssetsRaw || []) : null;
  const recordingView = recording
    ? publicRecording(recording, processingByRecordingId.get(recording.id))
    : null;
  const sync = nestedRecord(item, "sync");
  const proxy = nestedRecord(item, "proxy");
  const itemMetadata = nestedRecord(item, "metadata");
  const metadataRecordingSync = nestedRecord(itemMetadata, "recordingSync");
  const syncRecordingSync = nestedRecord(sync, "recordingSync");
  const reportedSourceProfile = Object.keys(nestedRecord(syncRecordingSync, "reportedSourceProfile")).length > 0
    ? nestedRecord(syncRecordingSync, "reportedSourceProfile")
    : nestedRecord(metadataRecordingSync, "reportedSourceProfile");
  const audibleEventAnalysis = parseAudibleEventDetectorReceipt(reportedSourceProfile.audibleEventAnalysis);
  const importedContext = publicSessionContext(itemMetadata.sessionContext);
  const attachmentContext = assetView?.attachments
    ?.map((attachment: any) => publicSessionContext(jsonObject(attachment.metadataJson).sessionContext))
    .find(Boolean) ?? null;
  const sessionContext = importedContext ?? attachmentContext;

  return {
    id: assetId,
    sourceId: text(item.sourceId) || null,
    originalName: text(item.originalName) || asset?.filename || recording?.fileName || "Unnamed media",
    kind: text(item.kind) || null,
    contentType: text(item.contentType) || asset?.mimeType || recording?.contentType || null,
    importRole: text(item.importRole) || text(sync.suggestedRole) || null,
    recordingAssetId,
    unresolvedRecordingReference,
    syncStatus: text(sync.status) || null,
    sync: {
      status: text(sync.status) || null,
      recordingSync: audibleEventAnalysis ? { reportedSourceProfile: { audibleEventAnalysis } } : null,
    },
    proxyStatus: text(proxy.status) || null,
    sessionContext,
    storage: {
      bucketName: text(item.bucketName) || recording?.storageBucket || null,
      objectName: text(item.objectName) || recording?.storageObjectPath || null,
      gcsUri: text(item.gcsUri) || null,
      playbackUrl: text(item.playbackUrl) || asset?.url || null,
    },
    asset: assetView,
    recording: recordingView,
    safeNextAction: unresolvedRecordingReference
      ? "Hold this item: its referenced capture recording is missing or is outside this Nest's authorized room lineage."
      : recordingView && !recordingView.readiness.mediaProcessingReleased
      ? `Preserve only; media processing is held (${recordingView.processing.mediaHoldReasonCode}).`
      : recordingView && !recordingView.readiness.transcriptProcessingReleased
        ? `Media is released, but transcription is held (${recordingView.processing.transcriptHoldReasonCode}).`
      : assetView?.readiness?.needsProxy
      ? "Create or register a media-vault proxy before collaborative video editing."
      : recordingView && recordingView.readiness.completedTranscriptCount === 0
        ? "Run or repair the transcript from this verified recording."
        : "Review sync role and timeline use in the episode editor.",
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectSlug = text(url.searchParams.get("projectSlug") || url.searchParams.get("nestSlug"));
  const projectId = text(url.searchParams.get("projectId"));
  const episodeSlug = text(url.searchParams.get("episodeSlug") || url.searchParams.get("episode"));

  if (!projectSlug || !episodeSlug) {
    return NextResponse.json(
      { ok: false, error: "Provide projectSlug and episodeSlug to inspect episode media truth." },
      { status: 400 },
    );
  }

  const prisma = getPrismaClient() as any;
  const access = await resolveEpisodeProductionAccess({
    request,
    projectSlug,
    ...(projectId ? { projectId } : {}),
    action: "read",
    prisma,
  });
  if (!access.allowed) {
    return NextResponse.json({
      ok: false,
      code: access.code,
      error: access.error,
      actorSource: access.actor.source,
    }, { status: access.status });
  }

  const project = await prisma.studioProject.findUnique({
    where: { id: access.access.projectId },
    select: { id: true, slug: true, name: true },
  });
  if (!project) {
    return NextResponse.json({ ok: false, error: "Nest was not found." }, { status: 404 });
  }

  const episodeProduction = await prisma.studioEpisodeProduction.findUnique({
    where: { projectId_slug: { projectId: project.id, slug: episodeSlug } },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      boundaryLabel: true,
      boundaryKind: true,
      recordingRoomJson: true,
      timelineJson: true,
      transcriptJson: true,
      productionJson: true,
      updatedAt: true,
    },
  });

  if (!episodeProduction) {
    return NextResponse.json({
      ok: true,
      mediaVault: getMediaVaultReadiness(),
      project,
      episode: { slug: episodeSlug, found: false },
      importedMedia: [],
      recordingEvidence: [],
      summary: {
        importedMediaCount: 0,
        sourceRecordingCount: 0,
        proxyReadyCount: 0,
        proxyNeededCount: 0,
        completedTranscriptJobCount: 0,
      },
      safeNextActions: [
        "Create or open the episode production room before attaching recordings or proxies.",
      ],
      boundaries: {
        sideEffectFree: true,
        noOriginalMutation: true,
        noExternalMutation: true,
        inventoryOnly: true,
        projectLocatorRule:
          "When supplied, projectId and projectSlug must identify the same Nest. A slug-only locator is accepted only while globally unambiguous.",
      },
    });
  }

  const importedMedia = canonicalEpisodeImportedMedia(
    episodeProduction.productionJson,
    episodeProduction.timelineJson,
  );
  const audioProgramFingerprintSha256 = episodeAudioProgramFingerprint({
    episodeProductionId: episodeProduction.id,
    importedMedia,
  });
  const [audioDecisionRows, episodeParticipants] = await Promise.all([
    prisma.studioEpisodeAudioTrackDecisionReceipt.findMany({
      where: { episodeProductionId: episodeProduction.id },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      take: 500,
    }),
    prisma.callParticipant.findMany({
      where: { room: { episodeProductionId: episodeProduction.id } },
      select: { id: true, displayName: true, email: true, role: true, deviceLabel: true, roomId: true },
      orderBy: [{ displayName: "asc" }, { email: "asc" }, { id: "asc" }],
      take: 100,
    }),
  ]);
  const audioDecisionLedger = projectEpisodeAudioTrackDecisions(
    audioDecisionRows,
    audioProgramFingerprintSha256,
  );
  const assetIds = collectAssetIds(importedMedia);
  const recordingAssetIds = [...new Set(importedMedia.map(recordingAssetIdFromImportedMedia).filter(Boolean) as string[])];

  const rawAssets = assetIds.length
    ? await prisma.studioMediaAsset.findMany({
      where: {
        id: { in: assetIds },
        OR: [
          { projects: { some: { id: project.id } } },
          { assetAttachments: { some: { projectId: project.id } } },
        ],
      },
      include: {
        variants: { orderBy: { updatedAt: "desc" } },
        workflowJobs: { orderBy: { createdAt: "desc" }, take: 8 },
        audioMasterPromotions: {
          where: { projectId: project.id },
          orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
          take: 20,
        },
        processingJobs: {
          where: { type: { in: ["audio-signal-profile", "source-transcript", "source-transcript-v2", "audio-alignment", "audio-mastery", "audio-delivery"] } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 25,
          include: { audioDeliveryReviews: { orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: 20 } },
        },
        transcriptJobs: {
          where: { episodeProductionId: episodeProduction.id },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 10,
          include: { _count: { select: { segments: true, words: true } } },
        },
        assetAttachments: {
          include: { project: { select: { id: true, slug: true, name: true } } },
          orderBy: { updatedAt: "desc" },
        },
      },
      orderBy: { updatedAt: "desc" },
    })
    : [];
  const proxies = rawAssets.length
    ? await prisma.studioMediaAsset.findMany({
      where: {
        isProxy: true,
        rawAssetId: { in: rawAssets.map((asset: any) => asset.id) },
        OR: [
          { projects: { some: { id: project.id } } },
          { assetAttachments: { some: { projectId: project.id } } },
        ],
      },
      include: {
        variants: { orderBy: { updatedAt: "desc" } },
        workflowJobs: { orderBy: { createdAt: "desc" }, take: 8 },
        audioMasterPromotions: {
          where: { projectId: project.id },
          orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
          take: 20,
        },
        processingJobs: {
          where: { type: { in: ["audio-signal-profile", "source-transcript", "source-transcript-v2", "audio-alignment", "audio-mastery", "audio-delivery"] } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 25,
          include: { audioDeliveryReviews: { orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: 20 } },
        },
        transcriptJobs: {
          where: { episodeProductionId: episodeProduction.id },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 10,
          include: { _count: { select: { segments: true, words: true } } },
        },
        assetAttachments: {
          include: { project: { select: { id: true, slug: true, name: true } } },
          orderBy: { updatedAt: "desc" },
        },
      },
      orderBy: { updatedAt: "desc" },
    })
    : [];

  const proxiesByRawId = new Map<string, any[]>();
  for (const proxy of proxies) {
    const rawId = text(proxy.rawAssetId);
    if (!rawId) continue;
    proxiesByRawId.set(rawId, [...(proxiesByRawId.get(rawId) || []), proxy]);
  }

  const assetById = new Map<string, any>();
  for (const asset of rawAssets) {
    assetById.set(asset.id, { ...asset, proxyAssetsRaw: proxiesByRawId.get(asset.id) || [] });
  }

  const recordingEvidence = recordingAssetIds.length
    ? await prisma.recordingAsset.findMany({
      where: {
        id: { in: recordingAssetIds },
        room: {
          OR: [
            { projectId: project.id },
            { projectSlug: project.slug },
            { nestSlug: project.slug },
          ],
        },
      },
      include: {
        participant: { select: { id: true, displayName: true, email: true, role: true, deviceLabel: true } },
        transcriptJobs: {
          orderBy: { createdAt: "desc" },
          take: 5,
          include: { _count: { select: { segments: true } } },
        },
      },
      orderBy: { updatedAt: "desc" },
    })
    : [];
  const recordingById = new Map<string, any>(recordingEvidence.map((recording: any) => [recording.id, recording]));
  const processingByRecordingId = new Map<string, { media: PublicProcessingGate; transcript: PublicProcessingGate }>();
  await Promise.all(recordingEvidence.map(async (recording: any) => {
    const [media, transcript] = await Promise.all([
      mobileCaptureMediaProcessingGate({ prisma, recordingAsset: recording }).catch(() => unavailableGate("media")),
      mobileCaptureTranscriptProcessingGate({ prisma, recordingAsset: recording }).catch(() => unavailableGate("transcript")),
    ]);
    processingByRecordingId.set(recording.id, { media, transcript });
  }));

  const imported = importedMedia.map((item) => {
    const publicItem = importedMediaPublic(
      item,
      assetById,
      recordingById,
      processingByRecordingId,
    );
    return {
      ...publicItem,
      proxyReadiness: importedMediaProxyReadiness(publicItem),
    };
  });
  const mediaReleased = (item: any) => !item.unresolvedRecordingReference
    && (!item.recording || item.recording.readiness.mediaProcessingReleased);
  const proxyNeededCount = imported.filter((item: any) => mediaReleased(item)
    && item.proxyReadiness.needed).length;
  const proxyReadyCount = imported.filter((item: any) => mediaReleased(item)
    && item.proxyReadiness.ready).length;
  const releasedRecordingEvidence = recordingEvidence.filter((recording: any) => (
    processingByRecordingId.get(recording.id)?.media.allowed === true
  ));
  const transcriptReleasedRecordingEvidence = recordingEvidence.filter((recording: any) => (
    processingByRecordingId.get(recording.id)?.transcript.allowed === true
  ));
  const completedTranscriptJobCount = transcriptReleasedRecordingEvidence.reduce((count: number, recording: any) => (
    count + (recording.transcriptJobs || []).filter((job: any) => job.status === "COMPLETED").length
  ), 0);
  const unresolvedRecordingReferenceCount = imported.filter((item: any) => item.unresolvedRecordingReference).length;
  const activeAudioMasterCandidateCount = rawAssets.filter((asset: any) => (
    asset.audioMasterPromotions?.[0]?.operation === "PROMOTE"
  )).length;
  const audioDeliveryArtifacts = rawAssets.map((asset: any) => episodeInventoryAudioDeliveryArtifact({
    jobs: asset.processingJobs || [],
    variants: asset.variants || [],
    promotionEvents: asset.audioMasterPromotions || [],
  })).filter(Boolean);
  const verifiedAudioDeliveryArtifactCount = audioDeliveryArtifacts.filter((artifact: any) => artifact.readiness.encodedAndVerified).length;
  const approvedAudioDeliveryArtifactCount = audioDeliveryArtifacts.filter((artifact: any) => artifact.readiness.proofListenApproved).length;
  const mediaHeldCount = recordingEvidence.length - releasedRecordingEvidence.length;
  const transcriptHeldCount = recordingEvidence.length - transcriptReleasedRecordingEvidence.length;

  const safeNextActions = [
    imported.length === 0 ? "Attach verified recordings or imported source media to this episode." : null,
    proxyNeededCount > 0 ? "Create or register media-vault proxies for video sources before collaborative editing." : null,
    mediaHeldCount > 0 ? `${mediaHeldCount} preserved capture source(s) remain held; resolve normalized media release evidence before deriving or editing bytes.` : null,
    transcriptHeldCount > 0 ? `${transcriptHeldCount} capture source(s) remain held for transcription; do not treat historical transcript jobs as released truth.` : null,
    unresolvedRecordingReferenceCount > 0
      ? `${unresolvedRecordingReferenceCount} imported item(s) reference missing or foreign recording evidence and remain held.`
      : null,
    transcriptReleasedRecordingEvidence.length > 0 && completedTranscriptJobCount === 0
      ? "Run or repair transcription only for the explicitly released recording evidence."
      : null,
    activeAudioMasterCandidateCount > verifiedAudioDeliveryArtifactCount
      ? "Encode each active promoted master as a separately verified podcast delivery artifact."
      : null,
    verifiedAudioDeliveryArtifactCount > approvedAudioDeliveryArtifactCount
      ? "Proof-listen the actual encoded AAC bytes before creating any output packet or enclosure upload."
      : null,
    "Use this inventory as read-only truth before upload, proxy, transcript, edit, review, or publishing actions.",
  ].filter(Boolean);

  return NextResponse.json({
    ok: true,
    mediaVault: getMediaVaultReadiness(),
    project,
    episode: {
      found: true,
      id: episodeProduction.id,
      slug: episodeProduction.slug,
      title: episodeProduction.title,
      status: episodeProduction.status,
      boundaryLabel: episodeProduction.boundaryLabel,
      boundaryKind: episodeProduction.boundaryKind,
      updatedAt: dateIso(episodeProduction.updatedAt),
      hasTimeline: Boolean(episodeProduction.timelineJson),
      hasTranscript: Boolean(episodeProduction.transcriptJson),
      hasRecordingRoom: Boolean(episodeProduction.recordingRoomJson),
    },
    importedMedia: imported,
    recordingEvidence: recordingEvidence.map((recording: any) => (
      publicRecording(recording, processingByRecordingId.get(recording.id))
    )),
    audioProgram: {
      fingerprintSha256: audioProgramFingerprintSha256,
      decisions: audioDecisionLedger,
      participants: episodeParticipants.map((participant: any) => ({
        id: participant.id,
        displayName: participant.displayName,
        email: participant.email,
        role: String(participant.role || "").toLowerCase() || null,
        deviceLabel: participant.deviceLabel,
        roomId: participant.roomId,
      })),
      actions: { decisions: "/api/media-vault/episode-audio-program/decisions" },
    },
    summary: {
      importedMediaCount: imported.length,
      videoCount: imported.filter((item: any) => item.kind === "video" || String(item.contentType || "").startsWith("video/")).length,
      audioCount: imported.filter((item: any) => item.kind === "audio" || String(item.contentType || "").startsWith("audio/")).length,
      sourceRecordingCount: recordingEvidence.length,
      proxyReadyCount,
      proxyNeededCount,
      completedTranscriptJobCount,
      mediaReleasedCount: releasedRecordingEvidence.length,
      mediaHeldCount,
      transcriptReleasedCount: transcriptReleasedRecordingEvidence.length,
      transcriptHeldCount,
      unresolvedRecordingReferenceCount,
      attachedAssetCount: rawAssets.length,
      activeAudioMasterCandidateCount,
      verifiedAudioDeliveryArtifactCount,
      approvedAudioDeliveryArtifactCount,
    },
    safeNextActions,
    actions: {
      nestInventory: `/api/media-vault/inventory?nestSlug=${encodeURIComponent(project.slug)}`,
      registerProxy: "/api/media-vault/proxies/register",
      uploadProxy: "/api/upload/presigned",
      promoteRecording: "/api/mobile/capture/recordings/promote",
      transcriptRun: "/api/mobile/capture/transcripts/run",
      packetBuild: "/api/mobile/capture/transcripts/packet",
      audioDelivery: "/api/media-vault/audio-delivery",
      audioDeliveryReview: "/api/media-vault/audio-delivery/review",
    },
    boundaries: {
      sideEffectFree: true,
      noOriginalMutation: true,
      noExternalMutation: true,
      inventoryOnly: true,
      sourceTruth:
        "RecordingAsset owns capture evidence; StudioMediaAsset owns reusable media; StudioEpisodeProduction owns episode-editor meaning.",
      editorRule:
        "Whole sources stay intact. Proxy, transcript, sync, and edit decisions are inspectable metadata.",
      processingRule:
        "Recording status proves preservation, not processing permission. Normalized media and transcript release gates independently control readiness and next actions.",
      projectLocatorRule:
        "When supplied, projectId and projectSlug must identify the same Nest. A slug-only locator is accepted only while globally unambiguous.",
    },
  });
}
