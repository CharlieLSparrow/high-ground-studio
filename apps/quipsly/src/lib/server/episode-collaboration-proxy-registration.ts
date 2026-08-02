import "server-only";

import type { Prisma } from "@prisma/client";
import {
  parseEpisodeCollaborationProxyJob,
  parseEpisodeCollaborationProxyResult,
  type EpisodeCollaborationProxyJob,
  type EpisodeCollaborationProxyResult,
} from "@high-ground/quipsly-media-processing";

import {
  canonicalEpisodeImportedMedia,
  canonicalEpisodeProductionJson,
} from "@/lib/episode-production/imported-media";
import { resolveAllowedLocalStudioMediaPath } from "@/lib/server/studio-media-location-security";

export type EpisodeCollaborationProxyRegistration = {
  proxyAssetId: string;
  sourceId: string;
  variantId: string;
  playbackUrl: string;
  providerSourceId: string;
  originalRemainsSourceTruth: true;
};

export async function registerEpisodeCollaborationProxy(input: {
  prisma: any;
  job: EpisodeCollaborationProxyJob | unknown;
  result: EpisodeCollaborationProxyResult | unknown;
  registrationSource: string;
  attachmentMetadata?: Record<string, unknown>;
  markCaptureReady?: boolean;
}): Promise<EpisodeCollaborationProxyRegistration> {
  const job = parseEpisodeCollaborationProxyJob(input.job);
  const result = parseEpisodeCollaborationProxyResult(input.result, job);
  const registrationSource = cleanText(input.registrationSource);
  if (!registrationSource) {
    throw new Error("Collaboration proxy registration source is required.");
  }

  return serializableTransaction(input.prisma, async (transaction) => {
    const currentJob = await transaction.studioWorkflowJob.findUnique({
      where: { id: job.jobId },
    });
    if (!currentJob) throw new Error("Collaboration proxy workflow job disappeared.");
    const persistedJob = parseEpisodeCollaborationProxyJob(
      currentJob.inputJson,
      currentJob.id,
    );
    if (
      currentJob.projectId !== job.projectId
      || currentJob.assetId !== job.source.rawAssetId
      || persistedJob.projectId !== job.projectId
      || persistedJob.episodeProductionId !== job.episodeProductionId
    ) {
      throw new Error("Collaboration proxy workflow binding changed before commit.");
    }
    if (currentJob.status === "completed") {
      const completed = completedRegistration(currentJob.resultJson);
      if (completed) return completed;
      throw new Error("Completed collaboration proxy job has no valid registration receipt.");
    }

    const [project, rawAsset, source, productionKey] = await Promise.all([
      transaction.studioProject.findUnique({
        where: { id: job.projectId },
        select: { id: true, slug: true },
      }),
      transaction.studioMediaAsset.findUnique({
        where: { id: job.source.rawAssetId },
        include: {
          assetAttachments: {
            where: { projectId: job.projectId },
            select: { id: true, metadataJson: true },
          },
        },
      }),
      transaction.studioVideoSource.findUnique({
        where: { id: job.source.sourceId },
        select: { id: true, providerSourceId: true, url: true },
      }),
      transaction.studioEpisodeProduction.findUnique({
        where: { id: job.episodeProductionId },
        select: { id: true, projectId: true, slug: true },
      }),
    ]);
    if (
      !project
      || project.slug !== job.projectSlug
      || !rawAsset
      || rawAsset.isProxy
      || rawAsset.assetAttachments.length === 0
      || !source
      || !(await sourceMatchesJob(source, rawAsset, job))
      || !productionKey
      || productionKey.projectId !== job.projectId
      || productionKey.slug !== job.episodeSlug
    ) {
      throw new Error(
        "Collaboration proxy registration requires the exact original, source, episode, and Nest attachment.",
      );
    }

    const providerSourceId = result.output.locator;
    let proxySource = await transaction.studioVideoSource.findFirst({
      where: { providerSourceId },
    });
    if (!proxySource) {
      proxySource = await transaction.studioVideoSource.create({
        data: {
          provider: result.output.provider === "gcs"
            ? "episode-collaboration-proxy-worker"
            : "local-episode-collaboration-proxy-worker",
          providerSourceId,
          url: "/api/ingest/media/pending",
          title: `${rawAsset.filename} collaboration proxy`,
        },
      });
    }
    const playbackUrl = `/api/ingest/media/${proxySource.id}`;
    if (proxySource.url !== playbackUrl) {
      proxySource = await transaction.studioVideoSource.update({
        where: { id: proxySource.id },
        data: { url: playbackUrl },
      });
    }

    let proxyAsset = await transaction.studioMediaAsset.findFirst({
      where: {
        rawAssetId: rawAsset.id,
        isProxy: true,
        url: playbackUrl,
      },
    });
    if (!proxyAsset) {
      proxyAsset = await transaction.studioMediaAsset.create({
        data: {
          filename: proxyFilename(rawAsset.filename),
          url: playbackUrl,
          mimeType: result.output.contentType,
          sizeBytes: BigInt(result.output.sizeBytes),
          isProxy: true,
          rawAssetId: rawAsset.id,
          cloudProvider: result.output.provider,
          isGlobal: false,
          duration: result.output.metadata.durationSeconds,
          resolution: `${result.output.metadata.width}x${result.output.metadata.height}`,
          fps: result.output.metadata.fps,
        },
      });
    }

    const commonMetadata = {
      schema: "quipsly-episode-collaboration-proxy-registration-v1",
      rawAssetId: rawAsset.id,
      originalSourceId: job.source.sourceId,
      proxyJobId: job.jobId,
      sourceId: proxySource.id,
      playbackUrl,
      source: job.source,
      output: result.output,
      worker: result.worker,
      copiedOriginal: false,
      mutatedOriginal: false,
      originalRemainsSourceTruth: true,
      ...input.attachmentMetadata,
    };
    await transaction.studioAssetAttachment.upsert({
      where: {
        projectId_assetId: {
          projectId: job.projectId,
          assetId: proxyAsset.id,
        },
      },
      create: {
        projectId: job.projectId,
        assetId: proxyAsset.id,
        role: "proxy-video",
        source: registrationSource,
        createdByEmail: job.actorEmail,
        metadataJson: toPrismaJson(commonMetadata),
      },
      update: {
        role: "proxy-video",
        source: registrationSource,
        metadataJson: toPrismaJson(commonMetadata),
      },
    });

    const variant = await transaction.studioAssetVariant.upsert({
      where: {
        assetId_kind_url: {
          assetId: rawAsset.id,
          kind: "proxy-video",
          url: playbackUrl,
        },
      },
      create: {
        assetId: rawAsset.id,
        kind: "proxy-video",
        url: playbackUrl,
        mimeType: result.output.contentType,
        width: result.output.metadata.width,
        height: result.output.metadata.height,
        duration: result.output.metadata.durationSeconds,
        sizeBytes: BigInt(result.output.sizeBytes),
        metadataJson: toPrismaJson({
          ...commonMetadata,
          proxyAssetId: proxyAsset.id,
          sourceId: proxySource.id,
          providerSourceId,
          registrationSource,
        }),
      },
      update: {
        mimeType: result.output.contentType,
        width: result.output.metadata.width,
        height: result.output.metadata.height,
        duration: result.output.metadata.durationSeconds,
        sizeBytes: BigInt(result.output.sizeBytes),
        metadataJson: toPrismaJson({
          ...commonMetadata,
          proxyAssetId: proxyAsset.id,
          sourceId: proxySource.id,
          providerSourceId,
          registrationSource,
        }),
      },
    });

    await transaction.$queryRawUnsafe(
      'SELECT "id" FROM "StudioEpisodeProduction" WHERE "id" = $1 FOR UPDATE',
      productionKey.id,
    );
    const production = await transaction.studioEpisodeProduction.findUnique({
      where: { id: productionKey.id },
      select: { id: true, productionJson: true, timelineJson: true },
    });
    if (!production) {
      throw new Error("Collaboration proxy Episode Production disappeared after locking.");
    }
    const productionJson = canonicalEpisodeProductionJson(
      production.productionJson,
      production.timelineJson,
    );
    let matched = false;
    const importedMedia = canonicalEpisodeImportedMedia(
      production.productionJson,
      production.timelineJson,
    ).map((entry) => {
      const row = jsonObject(entry);
      if (row.id !== rawAsset.id && row.sourceId !== job.source.sourceId) {
        return row;
      }
      matched = true;
      return {
        ...row,
        proxy: {
          ...jsonObject(row.proxy),
          status: "ready",
          proxyAssetId: proxyAsset.id,
          sourceId: proxySource.id,
          proxyUrl: playbackUrl,
          variantId: variant.id,
          completedAt: result.completedAt,
          profile: result.output.profile,
          sourceOriginalPreserved: true,
          technical: result.output.metadata,
          immutableObjectEvidence: {
            provider: result.output.provider,
            locator: result.output.locator,
            generation: result.output.generation,
            sha256: result.output.sha256,
            sizeBytes: result.output.sizeBytes,
            contentType: result.output.contentType,
          },
        },
      };
    });
    if (!matched) {
      throw new Error(
        "Canonical Episode Production no longer contains the collaboration proxy original.",
      );
    }
    await transaction.studioEpisodeProduction.update({
      where: { id: production.id },
      data: {
        productionJson: toPrismaJson({
          ...productionJson,
          importedMedia,
          lastCollaborationProxyReadyAt: result.completedAt,
          ...(input.markCaptureReady
            ? { lastCaptureProxyReadyAt: result.completedAt }
            : {}),
        }),
      },
    });

    const registration: EpisodeCollaborationProxyRegistration = {
      proxyAssetId: proxyAsset.id,
      sourceId: proxySource.id,
      variantId: variant.id,
      playbackUrl,
      providerSourceId,
      originalRemainsSourceTruth: true,
    };
    await transaction.studioWorkflowJob.update({
      where: { id: job.jobId },
      data: {
        status: "completed",
        error: null,
        startedAt: currentJob.startedAt || new Date(job.queuedAt),
        completedAt: new Date(result.completedAt),
        resultJson: toPrismaJson({
          kind: "quipsly-episode-collaboration-proxy-registration-result-v1",
          ...registration,
          source: job.source,
          output: result.output,
          worker: result.worker,
          registrationSource,
        }),
      },
    });
    return registration;
  });
}

async function sourceMatchesJob(
  source: { id: string; providerSourceId: string | null; url: string },
  rawAsset: { url: string; assetAttachments: Array<{ metadataJson: unknown }> },
  job: EpisodeCollaborationProxyJob,
) {
  const expectedPlaybackUrl = `/api/ingest/media/${source.id}`;
  const attachmentNamesSource = rawAsset.assetAttachments.some((attachment) => {
    const metadata = jsonObject(attachment.metadataJson);
    return metadata.sourceId === source.id;
  });
  const sourceLocator = cleanText(source.providerSourceId);
  const sourceLocatorMatches = job.source.provider === "local"
    ? (await resolveAllowedLocalStudioMediaPath(sourceLocator)) === job.source.locator
    : sourceLocator === job.source.locator
      || sourceLocator.split("?generation=")[0]
        === job.source.locator.split("?generation=")[0];
  return sourceLocatorMatches
    && source.url === expectedPlaybackUrl
    && (rawAsset.url === expectedPlaybackUrl || attachmentNamesSource);
}

function completedRegistration(value: unknown): EpisodeCollaborationProxyRegistration | null {
  const row = jsonObject(value);
  const result = {
    proxyAssetId: cleanText(row.proxyAssetId),
    sourceId: cleanText(row.sourceId),
    variantId: cleanText(row.variantId),
    playbackUrl: cleanText(row.playbackUrl),
    providerSourceId: cleanText(row.providerSourceId),
    originalRemainsSourceTruth: row.originalRemainsSourceTruth as true,
  };
  return result.proxyAssetId
    && result.sourceId
    && result.variantId
    && result.playbackUrl
    && result.providerSourceId
    && result.originalRemainsSourceTruth === true
    ? result
    : null;
}

async function serializableTransaction<T>(
  prisma: any,
  operation: (transaction: any) => Promise<T>,
) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: "Serializable",
        maxWait: 10_000,
        timeout: 30_000,
      });
    } catch (error) {
      if (attempt === 3 || !isRetryableTransactionError(error)) throw error;
    }
  }
  throw new Error("Collaboration proxy registration retry budget exhausted.");
}

function proxyFilename(rawFilename: string) {
  const stem = rawFilename.replace(/\.[^.]+$/, "").slice(0, 180);
  return `${stem || "episode"}.collaboration-proxy.mp4`;
}

function jsonObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRetryableTransactionError(error: unknown) {
  const code = cleanText((error as { code?: unknown })?.code);
  return code === "P2034" || code === "P2002";
}
