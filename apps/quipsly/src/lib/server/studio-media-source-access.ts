import "server-only";

import { mobileCaptureMediaProcessingGate } from "@/lib/server/mobile-capture-processing-gates";
import {
  authorizeIngestMediaSource,
  type IngestMediaActor,
} from "@/lib/server/mobile-capture-security";
import { resolveStudioProjectAccess } from "@/lib/server/studio-project-access";

type StudioSourceRecord = {
  id: string;
  provider: string;
  providerSourceId: string | null;
  url: string | null;
  title: string | null;
  localArtifactAuthority?: {
    portability: "executor-local";
    custodianNodeId: string;
    storageScopeId: string;
  } | null;
};

type LinkedCaptureLineage = {
  recordingAssetIds: Set<string>;
  held: { errorCode: string; error: string } | null;
  captureLineageDetected: boolean;
};

export type StudioMediaSourceAccess =
  | {
      allowed: true;
      source: StudioSourceRecord;
      captureProcessing: {
        linked: boolean;
        recordingAssetIds: string[];
      };
    }
  | {
      allowed: false;
      status: 401 | 403 | 404 | 409;
      error: string;
      errorCode?: string;
    };

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function looksLikeCaptureSource(source: StudioSourceRecord) {
  return source.provider === "capture-recording"
    || /^(?:Quipsly Capture|Field Kit|Source recording)\b/i.test(text(source.title))
    || /(?:^|\/)recordings\/source\//i.test(text(source.providerSourceId));
}

function sourceIdFromPlaybackUrl(value: unknown) {
  const match = /\/api\/ingest\/media\/([^/?#]+)/.exec(text(value));
  return match ? decodeURIComponent(match[1]) : "";
}

async function sourceLinkedStudioAssets(prisma: any, sourceId: string) {
  const select = {
    id: true,
    isGlobal: true,
    isProxy: true,
    rawAssetId: true,
    url: true,
    projects: { select: { slug: true } },
    assetAttachments: {
      select: {
        metadataJson: true,
        project: { select: { slug: true } },
      },
    },
  } as const;
  const directAssets = await prisma.studioMediaAsset.findMany({
    where: {
      OR: [
        { rawAssetId: sourceId },
        { url: `/api/ingest/media/${sourceId}` },
      ],
    },
    select,
  });
  let variantAssets: any[] = [];
  try {
    const variants = await prisma.studioAssetVariant.findMany({
      where: { url: `/api/ingest/media/${sourceId}` },
      select: { asset: { select } },
    });
    variantAssets = variants.map((variant: any) => variant.asset);
  } catch {
    // Variant-backed playback is additive. Older schemas fail closed for the
    // derivative while ordinary raw media authorization remains available.
  }
  return [...new Map(
    [...directAssets, ...variantAssets].map((asset: any) => [asset.id, asset]),
  ).values()];
}

async function loadLinkedRecordingAssetIds(
  prisma: any,
  source: StudioSourceRecord,
  visitedSourceIds = new Set<string>(),
): Promise<LinkedCaptureLineage> {
  if (visitedSourceIds.has(source.id)) {
    return {
      recordingAssetIds: new Set<string>(),
      held: null,
      captureLineageDetected: false,
    };
  }
  const nextVisitedSourceIds = new Set(visitedSourceIds).add(source.id);
  const recordingAssetIds = new Set<string>();
  let captureLineageDetected = looksLikeCaptureSource(source);

  try {
    const receipts = await prisma.mobileCaptureFinalizationReceipt.findMany({
      where: { sourceId: source.id },
      orderBy: { createdAt: "asc" },
      select: {
        recordingAssetId: true,
        processingDisposition: true,
        holdReasonCode: true,
        holdReason: true,
      },
    });
    if (receipts.length > 0) captureLineageDetected = true;
    const held = receipts.find((receipt: any) => receipt.processingDisposition !== "RELEASED");
    if (held) {
      return {
        recordingAssetIds,
        held: {
          errorCode: text(held.holdReasonCode) || "CAPTURE_MEDIA_EXPLICIT_RELEASE_REQUIRED",
          error: text(held.holdReason) || "This capture source is preserved, but processing remains held.",
        },
        captureLineageDetected: true,
      };
    }
    for (const receipt of receipts) {
      const id = text(receipt.recordingAssetId);
      if (id) recordingAssetIds.add(id);
    }
  } catch {
    // The additive receipt table must exist before deploying the matching
    // backend. A source that visibly belongs to Capture fails closed below;
    // ordinary pre-Capture Studio media remains readable.
    // Continue to protected manifest/attachment bindings. A visibly Capture-
    // owned source without one is rejected below.
  }

  try {
    const manifestAssets = await prisma.recordingAsset.findMany({
      where: {
        OR: [
          { localManifestJson: { path: ["sourceId"], equals: source.id } },
          { localManifestJson: { path: ["promotion", "sourceId"], equals: source.id } },
        ],
      },
      select: { id: true },
    });
    if (manifestAssets.length > 0) captureLineageDetected = true;
    for (const asset of manifestAssets) {
      const id = text(asset.id);
      if (id) recordingAssetIds.add(id);
    }
  } catch {
    // A visibly Capture-owned source without a readable binding is rejected
    // below; ordinary Studio sources do not depend on the additive table.
  }

  // Older promotion code wrote the RecordingAsset binding on the attachment
  // rather than a relational column on StudioVideoSource.
  const linkedStudioAssets = await sourceLinkedStudioAssets(prisma, source.id);
  for (const asset of linkedStudioAssets) {
    for (const attachment of asset.assetAttachments ?? []) {
      const metadata = objectValue(attachment.metadataJson);
      const id = text(metadata.recordingAssetId);
      if (id) {
        recordingAssetIds.add(id);
        captureLineageDetected = true;
      }
    }

    // Proxy assets point rawAssetId at the raw StudioMediaAsset (not at its
    // StudioVideoSource). Follow that edge back to the authorized raw source
    // so a derivative cannot outlive a later Capture hold/revocation.
    if (asset.isProxy === true && text(asset.rawAssetId)) {
      const rawAsset = await prisma.studioMediaAsset.findUnique({
        where: { id: text(asset.rawAssetId) },
        select: {
          url: true,
          assetAttachments: { select: { metadataJson: true } },
        },
      });
      for (const attachment of rawAsset?.assetAttachments ?? []) {
        const metadata = objectValue(attachment.metadataJson);
        const id = text(metadata.recordingAssetId);
        if (id) {
          recordingAssetIds.add(id);
          captureLineageDetected = true;
        }
      }
      const rawSourceId = sourceIdFromPlaybackUrl(rawAsset?.url);
      if (rawSourceId) {
        const rawSource = await prisma.studioVideoSource.findUnique({
          where: { id: rawSourceId },
          select: {
            id: true,
            provider: true,
            providerSourceId: true,
            url: true,
            title: true,
          },
        });
        if (rawSource) {
          const rawLineage: LinkedCaptureLineage = await loadLinkedRecordingAssetIds(
            prisma,
            rawSource,
            nextVisitedSourceIds,
          );
          if (rawLineage.held) return rawLineage;
          rawLineage.recordingAssetIds.forEach((id: string) => recordingAssetIds.add(id));
          captureLineageDetected ||= rawLineage.captureLineageDetected;
        }
      }
    }

    // A registered variant (audio master, collaboration proxy, transcript
    // audition render) inherits authorization and Capture-release state from
    // the owning asset's original playback source. The derivative may never
    // become an unscoped, independently readable source.
    const owningSourceId = sourceIdFromPlaybackUrl(asset.url);
    if (owningSourceId && owningSourceId !== source.id) {
      const owningSource = await prisma.studioVideoSource.findUnique({
        where: { id: owningSourceId },
        select: {
          id: true,
          provider: true,
          providerSourceId: true,
          url: true,
          title: true,
        },
      });
      if (owningSource) {
        const owningLineage = await loadLinkedRecordingAssetIds(prisma, owningSource, nextVisitedSourceIds);
        if (owningLineage.held) return owningLineage;
        owningLineage.recordingAssetIds.forEach((id: string) => recordingAssetIds.add(id));
        captureLineageDetected ||= owningLineage.captureLineageDetected;
      }
    }
  }

  return { recordingAssetIds, held: null, captureLineageDetected };
}

/**
 * Shared read boundary for raw Studio media and any derived byte endpoint.
 *
 * Project authorization answers who may see a source. The Capture processing
 * gate separately answers whether preserved mobile/provider bytes may be used
 * for playback, extraction, proxies, transcripts, or editor derivatives.
 */
export async function authorizeStudioMediaSource(input: {
  prisma: any;
  actor: IngestMediaActor | null;
  sourceId: string;
}): Promise<StudioMediaSourceAccess> {
  const authorization = await authorizeIngestMediaSource({
    actor: input.actor,
    sourceId: input.sourceId,
    loadSource: (sourceId) => input.prisma.studioVideoSource.findUnique({
      where: { id: sourceId },
      select: {
        id: true,
        provider: true,
        providerSourceId: true,
        url: true,
        title: true,
      },
    }),
    loadScopes: async (sourceId) => {
      const assets = await sourceLinkedStudioAssets(input.prisma, sourceId);
      return assets.map((asset: any) => ({
        isGlobal: asset.isGlobal,
        projectSlugs: [
          ...asset.projects.map((project: any) => project.slug),
          ...asset.assetAttachments.map((attachment: any) => attachment.project.slug),
        ],
      }));
    },
    canReadProject: async (projectSlug, actorEmail) => {
      const access = await resolveStudioProjectAccess({
        projectSlug,
        email: actorEmail,
        action: "read",
        prisma: input.prisma,
      });
      return access.allowed;
    },
  });

  if (!authorization.allowed) return authorization;
  const source = authorization.source as StudioSourceRecord;
  if (
    source.provider === "local-episode-render-proof-worker"
    || source.provider === "local-episode-program-render-worker"
    || source.provider === "local-episode-master-conform-worker"
  ) {
    const assets = await sourceLinkedStudioAssets(input.prisma, source.id);
    const authorities = assets.flatMap((asset: any) =>
      (asset.assetAttachments ?? []).flatMap((attachment: any) => {
        const metadata = objectValue(attachment.metadataJson);
        const custodianNodeId = text(metadata.custodianNodeId);
        const storageScopeId = text(metadata.storageScopeId);
        return (
          metadata.schema === "quipsly-episode-render-proof-registration-v2"
          || metadata.schema === "quipsly-episode-program-render-registration-v1"
          || metadata.schema === "quipsly-episode-master-conform-registration-v1"
        )
          && metadata.artifactPortability === "executor-local"
          && /^[A-Za-z0-9:_-]{8,200}$/.test(custodianNodeId)
          && /^[A-Za-z0-9:_-]{8,200}$/.test(storageScopeId)
          ? [{ portability: "executor-local" as const, custodianNodeId, storageScopeId }]
          : [];
      }),
    );
    const authority = authorities[0] ?? null;
    if (
      !authority
      || authorities.some((candidate) =>
        candidate.custodianNodeId !== authority.custodianNodeId
        || candidate.storageScopeId !== authority.storageScopeId)
    ) {
      return {
        allowed: false,
        status: 409,
        errorCode: "LOCAL_ARTIFACT_CUSTODY_REQUIRED",
        error: "This local render has no unambiguous executor storage authority.",
      };
    }
    source.localArtifactAuthority = authority;
  }
  const linked = await loadLinkedRecordingAssetIds(input.prisma, source);
  if (linked.held) {
    return {
      allowed: false,
      status: 409,
      errorCode: linked.held.errorCode,
      error: linked.held.error,
    };
  }

  if (
    linked.recordingAssetIds.size === 0
    && linked.captureLineageDetected
  ) {
    return {
      allowed: false,
      status: 409,
      errorCode: "CAPTURE_SOURCE_RELEASE_BINDING_REQUIRED",
      error: "This capture source has no complete normalized release binding, so its bytes remain held.",
    };
  }

  for (const recordingAssetId of linked.recordingAssetIds) {
    const recordingAsset = await input.prisma.recordingAsset.findUnique({
      where: { id: recordingAssetId },
    });
    if (!recordingAsset) {
      return {
        allowed: false,
        status: 409,
        errorCode: "CAPTURE_RECORDING_ASSET_REQUIRED",
        error: "This capture source no longer has its immutable RecordingAsset binding.",
      };
    }
    let gate;
    try {
      gate = await mobileCaptureMediaProcessingGate({
        prisma: input.prisma,
        recordingAsset,
      });
    } catch {
      return {
        allowed: false,
        status: 409,
        errorCode: "CAPTURE_RELEASE_LEDGER_UNAVAILABLE",
        error: "Quipsly could not verify this capture source's normalized release ledger, so its bytes remain held.",
      };
    }
    if (!gate.allowed) {
      return {
        allowed: false,
        status: 409,
        errorCode: gate.errorCode,
        error: gate.error,
      };
    }
  }

  return {
    allowed: true,
    source,
    captureProcessing: {
      linked: linked.recordingAssetIds.size > 0,
      recordingAssetIds: [...linked.recordingAssetIds],
    },
  };
}
