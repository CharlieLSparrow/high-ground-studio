import "server-only";

import { getPrismaClient } from "@/lib/prisma";
import { getMediaBucket, parseGcsUri, toGcsUri } from "@/lib/server/gcs";
import {
  cleanMediaVaultPathPart,
  MEDIA_VAULT_PREFIXES,
  requireMediaVaultBucketName,
} from "@/lib/server/media-vault";
import { verifyMediaVaultUploadCapability } from "@/lib/server/media-vault-upload-capability";
import { attachAssetToNest } from "@/lib/server/quipsly-core";
import { authorizeStudioMediaSource } from "@/lib/server/studio-media-source-access";

type RegisterProxyInput = {
  prisma?: any;
  rawAssetId: string;
  actorUserId: string;
  actorEmail?: string | null;
  isStaff?: boolean;
  nestSlug?: string | null;
  bucketName?: string | null;
  objectPath?: string | null;
  gcsUri?: string | null;
  proxyUrl?: string | null;
  uploadCapability?: string | null;
  filename?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | string | null;
  duration?: number | string | null;
  resolution?: string | null;
  fps?: number | string | null;
  thumbnailUrl?: string | null;
  variantKind?: string | null;
  metadataJson?: Record<string, unknown> | null;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function bigintOrNull(value: unknown) {
  const parsed = numberOrNull(value);
  if (parsed === null || parsed < 0) return null;
  return BigInt(Math.round(parsed));
}

function publicAsset(asset: any) {
  if (!asset) return null;
  return {
    id: asset.id,
    filename: asset.filename,
    url: asset.url,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes === null || asset.sizeBytes === undefined ? null : String(asset.sizeBytes),
    isProxy: asset.isProxy,
    rawAssetId: asset.rawAssetId,
    cloudProvider: asset.cloudProvider,
    duration: asset.duration,
    resolution: asset.resolution,
    fps: asset.fps,
    thumbnailUrl: asset.thumbnailUrl,
    updatedAt: asset.updatedAt?.toISOString?.() ?? null,
  };
}

function resolveProviderSourceId(input: RegisterProxyInput) {
  const explicitGcsUri = text(input.gcsUri);
  if (explicitGcsUri.startsWith("gcs://")) return explicitGcsUri;

  const objectPath = text(input.objectPath);
  const bucketName = text(input.bucketName);
  if (objectPath && bucketName) return toGcsUri(bucketName, objectPath);
  if (objectPath.startsWith("gcs://")) return objectPath;

  return "";
}

function inferCloudProvider(providerSourceId: string) {
  if (providerSourceId.startsWith("gcs://")) return "gcs";
  if (providerSourceId.startsWith("http://") || providerSourceId.startsWith("https://")) return "remote";
  if (providerSourceId.startsWith("/api/")) return "quipsly";
  return "local";
}

function sourceIdFromPlaybackUrl(value: unknown) {
  const match = /\/api\/ingest\/media\/([^/?#]+)/.exec(text(value));
  return match ? decodeURIComponent(match[1]) : "";
}

async function ensureProjectAccess(input: {
  prisma: any;
  rawAssetId: string;
  actorUserId: string;
  isStaff?: boolean;
  nestSlug?: string | null;
}) {
  const nestSlug = text(input.nestSlug);
  const rawAsset = await input.prisma.studioMediaAsset.findUnique({
    where: { id: input.rawAssetId },
    include: {
      projects: { select: { id: true, slug: true, title: true } },
      assetAttachments: {
        include: { project: { select: { id: true, slug: true, title: true } } },
      },
    },
  });

  if (!rawAsset) {
    return {
      ok: false as const,
      status: "raw-asset-not-found",
      message: "Raw asset was not found.",
    };
  }

  if (rawAsset.isProxy) {
    return {
      ok: false as const,
      status: "raw-asset-required",
      message: "Register proxies against original source assets, not another proxy.",
      rawAsset,
    };
  }

  if (input.isStaff) {
    return { ok: true as const, rawAsset, targetNestSlug: nestSlug || rawAsset.projects[0]?.slug || null };
  }

  if (!nestSlug) {
    return {
      ok: false as const,
      status: "nest-required",
      message: "Choose a Nest before registering a proxy for this asset.",
      rawAsset,
    };
  }

  const project = await input.prisma.studioProject.findFirst({
    where: {
      slug: nestSlug,
      OR: [
        { createdByUserId: input.actorUserId },
        { updatedByUserId: input.actorUserId },
        { accessGrants: { some: { userId: input.actorUserId, status: "ACTIVE" } } },
      ],
    },
    select: { id: true, slug: true },
  });

  if (!project) {
    return {
      ok: false as const,
      status: "nest-access-denied",
      message: "You do not have access to register proxies in this Nest.",
      rawAsset,
    };
  }

  const attachedToProject = rawAsset.assetAttachments.some((attachment: any) => attachment.projectId === project.id) ||
    rawAsset.projects.some((item: any) => item.id === project.id);
  if (!attachedToProject) {
    return {
      ok: false as const,
      status: "raw-asset-not-attached",
      message: "Attach the raw asset to this Nest before registering its proxy.",
      rawAsset,
    };
  }

  return { ok: true as const, rawAsset, targetNestSlug: project.slug };
}

export async function registerMediaVaultProxy(input: RegisterProxyInput) {
  const prisma = input.prisma ?? getPrismaClient();
  const rawAssetId = text(input.rawAssetId);
  if (!rawAssetId) {
    return {
      ok: false,
      status: "missing-raw-asset",
      message: "Choose the raw asset this proxy represents.",
    };
  }

  const access = await ensureProjectAccess({
    prisma,
    rawAssetId,
    actorUserId: input.actorUserId,
    isStaff: input.isStaff,
    nestSlug: input.nestSlug,
  });
  if (!access.ok) return access;

  const rawSourceId = sourceIdFromPlaybackUrl(access.rawAsset.url);
  let captureRecordingAssetIds: string[] = [];
  if (rawSourceId) {
    const rawSourceAccess = await authorizeStudioMediaSource({
      prisma,
      actor: input.actorEmail
        ? {
            id: input.actorUserId,
            email: input.actorEmail,
            isStaff: input.isStaff === true,
          }
        : null,
      sourceId: rawSourceId,
    });
    if (!rawSourceAccess.allowed) {
      return {
        ok: false,
        status: rawSourceAccess.status === 409
          ? "capture-processing-held"
          : "raw-source-access-denied",
        errorCode: rawSourceAccess.errorCode,
        message: rawSourceAccess.error,
        rawAsset: publicAsset(access.rawAsset),
      };
    }
    captureRecordingAssetIds = rawSourceAccess.captureProcessing.recordingAssetIds;
  }

  const requestedProviderSourceId = resolveProviderSourceId(input);
  if (!requestedProviderSourceId) {
    return {
      ok: false,
      status: "missing-proxy-location",
      rawAsset: publicAsset(access.rawAsset),
      message: "Register a proxy only with the private-GCS object issued by Quipsly's upload route.",
    };
  }
  const parsedObject = parseGcsUri(requestedProviderSourceId);
  const configuredBucket = requireMediaVaultBucketName();
  const targetNestSlug = text(access.targetNestSlug);
  const targetProject = targetNestSlug
    ? await prisma.studioProject.findUnique({
        where: { slug: targetNestSlug },
        select: { id: true, slug: true },
      })
    : null;
  const expectedProxyPrefix = `${MEDIA_VAULT_PREFIXES.proxy}/${cleanMediaVaultPathPart(targetNestSlug, "home-nest")}/`;
  if (
    !parsedObject
    || parsedObject.bucketName !== configuredBucket
    || !parsedObject.objectName.startsWith(expectedProxyPrefix)
    || !targetProject
    || !input.actorEmail
  ) {
    return {
      ok: false,
      status: "untrusted-proxy-location",
      rawAsset: publicAsset(access.rawAsset),
      message: "Proxy media must use the actor- and Nest-bound private-vault location issued by Quipsly.",
    };
  }
  const capability = verifyMediaVaultUploadCapability({
    capability: text(input.uploadCapability),
    actorUserId: input.actorUserId,
    actorEmail: input.actorEmail,
    projectId: targetProject.id,
    projectSlug: targetProject.slug,
    bucketName: parsedObject.bucketName,
    objectPath: parsedObject.objectName,
    expectedSizeBytes: Number(input.sizeBytes),
  });
  if (!capability.ok) {
    return {
      ok: false,
      status: "invalid-upload-capability",
      rawAsset: publicAsset(access.rawAsset),
      message: capability.error,
    };
  }

  let objectMetadata: any;
  try {
    [objectMetadata] = await getMediaBucket(parsedObject.bucketName)
      .file(parsedObject.objectName)
      .getMetadata();
  } catch {
    return {
      ok: false,
      status: "proxy-object-not-found",
      rawAsset: publicAsset(access.rawAsset),
      message: "The issued proxy object is not present in the private media vault yet.",
    };
  }
  const storedSize = Number(objectMetadata?.size ?? 0);
  const storedContentType = text(objectMetadata?.contentType) || capability.payload.contentType;
  const storedGeneration = text(objectMetadata?.generation);
  const storedCrc32c = text(objectMetadata?.crc32c);
  if (
    !Number.isFinite(storedSize)
    || storedSize <= 0
    || storedSize !== capability.payload.expectedSizeBytes
    || !/^[0-9]+$/.test(storedGeneration)
    || !storedCrc32c
    || storedContentType !== capability.payload.contentType
    || (text(input.mimeType) && text(input.mimeType) !== storedContentType)
  ) {
    return {
      ok: false,
      status: "proxy-object-verification-failed",
      rawAsset: publicAsset(access.rawAsset),
      message: "The uploaded proxy object does not match its server-issued size/content-type evidence.",
    };
  }
  const providerSourceId = toGcsUri(
    parsedObject.bucketName,
    parsedObject.objectName,
    storedGeneration,
  );

  const existingSource = await prisma.studioVideoSource.findFirst({
    where: { providerSourceId },
  });
  const source = existingSource || await prisma.studioVideoSource.create({
    data: {
      provider: "media-vault-proxy",
      providerSourceId,
      url: "/api/ingest/media/pending",
      title: text(input.filename) || `${access.rawAsset.filename} proxy`,
    },
  });
  const playbackUrl = `/api/ingest/media/${source.id}`;
  if (source.url !== playbackUrl) {
    await prisma.studioVideoSource.update({
      where: { id: source.id },
      data: { url: playbackUrl },
    });
  }

  const variantKind = text(input.variantKind) || (text(input.mimeType).startsWith("audio/") ? "proxy-audio" : "proxy-video");
  const existingProxy = await prisma.studioMediaAsset.findFirst({
    where: {
      rawAssetId: access.rawAsset.id,
      isProxy: true,
      url: playbackUrl,
    },
  });
  const proxyAsset = existingProxy || await prisma.studioMediaAsset.create({
    data: {
      filename: text(input.filename) || `${access.rawAsset.filename}.proxy`,
      url: playbackUrl,
      mimeType: storedContentType,
      sizeBytes: BigInt(storedSize),
      isProxy: true,
      rawAssetId: access.rawAsset.id,
      cloudProvider: inferCloudProvider(providerSourceId),
      isGlobal: false,
      duration: numberOrNull(input.duration),
      resolution: text(input.resolution) || null,
      fps: numberOrNull(input.fps),
      thumbnailUrl: text(input.thumbnailUrl) || null,
    },
  });

  if (access.targetNestSlug) {
    await attachAssetToNest({
      prisma,
      nestSlug: access.targetNestSlug,
      assetId: proxyAsset.id,
      role: variantKind,
      source: "media-vault-proxy-registration",
      actorEmail: input.actorEmail,
      metadataJson: {
        rawAssetId: access.rawAsset.id,
        providerSourceId,
        playbackUrl,
        proxySource: "registered-derivative",
        captureRecordingAssetIds,
        immutableObjectEvidence: {
          bucketName: parsedObject.bucketName,
          objectName: parsedObject.objectName,
          generation: storedGeneration,
          crc32c: storedCrc32c,
          sizeBytes: storedSize,
          contentType: storedContentType,
        },
        copiedOriginal: false,
        mutatedOriginal: false,
        clientMetadata: isObject(input.metadataJson) ? input.metadataJson : {},
      },
    });
  }

  const variant = await prisma.studioAssetVariant.upsert({
    where: {
      assetId_kind_url: {
        assetId: access.rawAsset.id,
        kind: variantKind,
        url: playbackUrl,
      },
    },
    create: {
      assetId: access.rawAsset.id,
      kind: variantKind,
      url: playbackUrl,
      mimeType: proxyAsset.mimeType,
      duration: proxyAsset.duration,
      sizeBytes: proxyAsset.sizeBytes,
      metadataJson: {
        proxyAssetId: proxyAsset.id,
        sourceId: source.id,
        providerSourceId,
        registeredByUserId: input.actorUserId,
        captureRecordingAssetIds,
        immutableObjectEvidence: {
          generation: storedGeneration,
          crc32c: storedCrc32c,
          sizeBytes: storedSize,
          contentType: storedContentType,
        },
        source: "media-vault-proxy-registration",
        clientMetadata: isObject(input.metadataJson) ? input.metadataJson : {},
      },
    },
    update: {
      mimeType: proxyAsset.mimeType,
      duration: proxyAsset.duration,
      sizeBytes: proxyAsset.sizeBytes,
      metadataJson: {
        proxyAssetId: proxyAsset.id,
        sourceId: source.id,
        providerSourceId,
        updatedByUserId: input.actorUserId,
        captureRecordingAssetIds,
        immutableObjectEvidence: {
          generation: storedGeneration,
          crc32c: storedCrc32c,
          sizeBytes: storedSize,
          contentType: storedContentType,
        },
        source: "media-vault-proxy-registration",
        clientMetadata: isObject(input.metadataJson) ? input.metadataJson : {},
      },
    },
  });

  await prisma.studioWorkflowJob.create({
    data: {
      projectId: targetProject.id,
      assetId: access.rawAsset.id,
      type: "asset-proxy-register",
      status: "completed",
      source: "media-vault-proxy-registration",
      requestedByEmail: input.actorEmail ?? null,
      completedAt: new Date(),
      inputJson: {
        rawAssetId: access.rawAsset.id,
        proxyAssetId: proxyAsset.id,
        sourceId: source.id,
        providerSourceId,
        playbackUrl,
        variantKind,
        immutableObjectEvidence: {
          generation: storedGeneration,
          crc32c: storedCrc32c,
          sizeBytes: storedSize,
          contentType: storedContentType,
        },
      },
      resultJson: {
        proxyAssetId: proxyAsset.id,
        variantId: variant.id,
        playbackUrl,
      },
    },
  });

  return {
    ok: true,
    status: existingProxy ? "already-registered" : "registered",
    rawAsset: publicAsset(access.rawAsset),
    proxyAsset: publicAsset(proxyAsset),
    variant: {
      id: variant.id,
      kind: variant.kind,
      url: variant.url,
    },
    sourceId: source.id,
    providerSourceId,
    playbackUrl,
    targetNestSlug: access.targetNestSlug,
    boundaries: {
      copiedOriginal: false,
      mutatedOriginal: false,
      proxyIsDerivative: true,
      originalRemainsSourceTruth: true,
    },
    message: "Proxy is registered as a derivative of the raw Quipsly media asset.",
  };
}
