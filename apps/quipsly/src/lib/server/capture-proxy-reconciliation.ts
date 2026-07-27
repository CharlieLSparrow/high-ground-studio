import "server-only";

import {
  canonicalEpisodeImportedMedia,
  canonicalEpisodeProductionJson,
} from "@/lib/episode-production/imported-media";
import { getMediaBucket, toGcsUri } from "@/lib/server/gcs";
import {
  CaptureProxyOutboxError,
  ensureCaptureProxyWorkflowQueued,
} from "@/lib/server/capture-proxy-processing";
import { authorizeStudioMediaSource } from "@/lib/server/studio-media-source-access";
import {
  buildCaptureProxyManifestObjectName,
  buildCaptureProxyResultObjectName,
  parseCaptureProxyManifest,
  parseCaptureProxyResult,
  type CaptureProxyManifest,
  type CaptureProxyResult,
} from "@high-ground/quipsly-media-processing";

export type CaptureProxyReconciliationResult = {
  checked: number;
  completed: number;
  failed: number;
  blocked: number;
};

export async function reconcileCaptureProxyResults(input: {
  prisma: any;
  projectIds: string[];
  limit?: number;
}): Promise<CaptureProxyReconciliationResult> {
  const projectIds = [...new Set(
    input.projectIds
      .map((value) => value.trim())
      .filter(Boolean),
  )];
  const limit = Math.max(1, Math.min(10, input.limit ?? 4));
  if (projectIds.length === 0) {
    return { checked: 0, completed: 0, failed: 0, blocked: 0 };
  }
  const jobs = await input.prisma.studioWorkflowJob.findMany({
    where: {
      projectId: { in: projectIds },
      type: "asset-proxy",
      source: "mobile-capture-finalization",
      status: { in: ["queued", "processing", "blocked"] },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  const summary = {
    checked: jobs.length,
    completed: 0,
    failed: 0,
    blocked: 0,
  };
  for (const job of jobs) {
    const outcome = await reconcileOne(input.prisma, job);
    summary[outcome] += 1;
  }
  return summary;
}

async function reconcileOne(
  prisma: any,
  job: any,
): Promise<"completed" | "failed" | "blocked"> {
  try {
    const control = jsonObject(jsonObject(job.inputJson).processingControl);
    const manifestObjectName =
      text(control.manifestObjectName)
      || buildCaptureProxyManifestObjectName(job.id);
    const resultObjectName = buildCaptureProxyResultObjectName(job.id);
    const bucketName = text(control.bucketName);
    if (!bucketName) {
      try {
        await ensureCaptureProxyWorkflowQueued({ prisma, workflow: job });
        return "blocked";
      } catch (error) {
        if (!(error instanceof CaptureProxyOutboxError)) throw error;
        await markJob(prisma, job.id, "failed", {
          code: "proxy-outbox-invalid",
          message: error.message,
        });
        return "failed";
      }
    }
    const bucket = getMediaBucket(bucketName);
    const storedManifest = await loadJsonIfPresent(
      bucket,
      manifestObjectName,
    );
    if (!storedManifest) return "blocked";
    let manifest: CaptureProxyManifest;
    try {
      manifest = parseCaptureProxyManifest(
        storedManifest.value,
        job.id,
      );
    } catch (error) {
      await markJob(prisma, job.id, "failed", {
        code: "proxy-manifest-invalid",
        message: errorMessage(error, "Proxy manifest is invalid."),
      });
      return "failed";
    }
    if (
      manifest.projectId !== job.projectId
      || manifest.source.rawAssetId !== job.assetId
      || manifest.source.bucketName !== bucketName
      || manifest.target.bucketName !== bucketName
    ) {
      await markJob(prisma, job.id, "failed", {
        code: "proxy-manifest-binding-mismatch",
        message: "Proxy manifest no longer matches its workflow project and raw asset.",
      });
      return "failed";
    }
    if (manifest.status === "failed-terminal") {
      await markJob(prisma, job.id, "failed", {
        code: manifest.failure?.code || "proxy-worker-failed",
        message: manifest.failure?.message || "Proxy worker failed terminal.",
      });
      return "failed";
    }
    if (manifest.status !== "completed") return "blocked";

    const storedResult = await loadJsonIfPresent(bucket, resultObjectName);
    if (!storedResult) return "blocked";
    let result: CaptureProxyResult;
    try {
      result = parseCaptureProxyResult(
        storedResult.value,
        manifest,
      );
      await assertStoredOutput(bucket, result);
    } catch (error) {
      if (isNotFound(error)) return "blocked";
      await markJob(prisma, job.id, "failed", {
        code: "proxy-result-invalid",
        message: errorMessage(
          error,
          "Proxy result or immutable output evidence is invalid.",
        ),
      });
      return "failed";
    }
    const access = await authorizeStudioMediaSource({
      prisma,
      actor: {
        id: manifest.actorUserId,
        email: manifest.actorEmail,
        isStaff: false,
      },
      sourceId: manifest.source.sourceId,
    });
    if (!access.allowed) {
      await markJob(prisma, job.id, "blocked", {
        code: access.errorCode || "capture-processing-held",
        message: access.error,
      });
      return "blocked";
    }
    await commitProxyResult(prisma, job, manifest, result);
    return "completed";
  } catch (error) {
    if (isNotFound(error)) return "blocked";
    console.error("[capture-proxy] reconciliation remains retryable", {
      jobId: job.id,
      error,
    });
    await markJob(prisma, job.id, "blocked", {
      code: "proxy-reconciliation-retry",
      message: errorMessage(
        error,
        "Temporary proxy reconciliation failure.",
      ),
    });
    return "blocked";
  }
}

async function commitProxyResult(
  prisma: any,
  job: any,
  manifest: CaptureProxyManifest,
  result: CaptureProxyResult,
) {
  await serializableTransaction(prisma, async (transaction) => {
    const currentJob = await transaction.studioWorkflowJob.findUnique({
      where: { id: job.id },
    });
    if (!currentJob) throw new Error("Proxy workflow job disappeared.");
    if (currentJob.status === "completed") return;
    if (
      currentJob.projectId !== manifest.projectId
      || currentJob.assetId !== manifest.source.rawAssetId
    ) {
      throw new Error("Proxy workflow binding changed before commit.");
    }
    const project = await transaction.studioProject.findUnique({
      where: { id: manifest.projectId },
      select: { id: true, slug: true },
    });
    const rawAsset = await transaction.studioMediaAsset.findUnique({
      where: { id: manifest.source.rawAssetId },
      include: {
        assetAttachments: {
          where: { projectId: manifest.projectId },
          select: { id: true },
        },
      },
    });
    if (
      !project
      || project.slug !== manifest.projectSlug
      || !rawAsset
      || rawAsset.isProxy
      || rawAsset.assetAttachments.length === 0
    ) {
      throw new Error(
        "Proxy commit requires the exact raw asset attached to the exact Nest.",
      );
    }
    const providerSourceId = toGcsUri(
      result.output.bucketName,
      result.output.objectName,
      result.output.generation,
    );
    let proxySource = await transaction.studioVideoSource.findFirst({
      where: { providerSourceId },
    });
    if (!proxySource) {
      proxySource = await transaction.studioVideoSource.create({
        data: {
          provider: "capture-proxy-worker",
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
          cloudProvider: "gcs",
          isGlobal: false,
          duration: result.output.metadata.durationSeconds,
          resolution:
            `${result.output.metadata.width}x${result.output.metadata.height}`,
          fps: result.output.metadata.fps,
        },
      });
    }
    await transaction.studioAssetAttachment.upsert({
      where: {
        projectId_assetId: {
          projectId: manifest.projectId,
          assetId: proxyAsset.id,
        },
      },
      create: {
        projectId: manifest.projectId,
        assetId: proxyAsset.id,
        role: "proxy-video",
        source: "capture-proxy-worker",
        createdByEmail: manifest.actorEmail,
        metadataJson: proxyAttachmentMetadata(
          manifest,
          result,
          proxySource.id,
          playbackUrl,
        ),
      },
      update: {
        role: "proxy-video",
        source: "capture-proxy-worker",
        metadataJson: proxyAttachmentMetadata(
          manifest,
          result,
          proxySource.id,
          playbackUrl,
        ),
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
        metadataJson: proxyVariantMetadata(
          manifest,
          result,
          proxyAsset.id,
          proxySource.id,
        ),
      },
      update: {
        mimeType: result.output.contentType,
        width: result.output.metadata.width,
        height: result.output.metadata.height,
        duration: result.output.metadata.durationSeconds,
        sizeBytes: BigInt(result.output.sizeBytes),
        metadataJson: proxyVariantMetadata(
          manifest,
          result,
          proxyAsset.id,
          proxySource.id,
        ),
      },
    });

    const productionKey = await transaction.studioEpisodeProduction.findUnique({
      where: {
        projectId_slug: {
          projectId: manifest.projectId,
          slug: manifest.episodeSlug,
        },
      },
      select: { id: true },
    });
    if (!productionKey) {
      throw new Error("Proxy result has no canonical Episode Production.");
    }
    await transaction.$queryRawUnsafe(
      'SELECT "id" FROM "StudioEpisodeProduction" WHERE "id" = $1 FOR UPDATE',
      productionKey.id,
    );
    const production = await transaction.studioEpisodeProduction.findUnique({
      where: { id: productionKey.id },
      select: { id: true, productionJson: true, timelineJson: true },
    });
    if (!production) {
      throw new Error("Proxy Episode Production disappeared after locking.");
    }
    const productionJson = canonicalEpisodeProductionJson(
      production.productionJson,
      production.timelineJson,
    );
    const importedMedia = canonicalEpisodeImportedMedia(
      production.productionJson,
      production.timelineJson,
    ).map((entry) => {
      const row = jsonObject(entry);
      if (
        row.id !== rawAsset.id
        && row.sourceId !== manifest.source.sourceId
      ) {
        return row;
      }
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
            bucketName: result.output.bucketName,
            objectName: result.output.objectName,
            generation: result.output.generation,
            crc32c: result.output.crc32c,
            sha256: result.output.sha256,
            sizeBytes: result.output.sizeBytes,
          },
        },
      };
    });
    if (!importedMedia.some((entry) => entry.id === rawAsset.id)) {
      throw new Error(
        "Canonical Episode Production no longer contains the proxy raw asset.",
      );
    }
    await transaction.studioEpisodeProduction.update({
      where: { id: production.id },
      data: {
        productionJson: {
          ...productionJson,
          importedMedia,
          lastCaptureProxyReadyAt: result.completedAt,
        },
      },
    });
    await transaction.studioWorkflowJob.update({
      where: { id: job.id },
      data: {
        status: "completed",
        error: null,
        startedAt: currentJob.startedAt || new Date(manifest.queuedAt),
        completedAt: new Date(result.completedAt),
        resultJson: {
          proxyAssetId: proxyAsset.id,
          sourceId: proxySource.id,
          variantId: variant.id,
          playbackUrl,
          providerSourceId,
          output: result.output,
          worker: result.worker,
          originalRemainsSourceTruth: true,
        },
      },
    });
  });
}

async function assertStoredOutput(
  bucket: any,
  result: CaptureProxyResult,
) {
  const file = bucket.file(
    result.output.objectName,
    { generation: result.output.generation },
  );
  const [metadata] = await file.getMetadata();
  const custom = Object.fromEntries(
    Object.entries(metadata.metadata ?? {}).map(([key, value]) => [
      key,
      String(value),
    ]),
  );
  if (
    String(metadata.generation ?? "") !== result.output.generation
    || Number(metadata.size) !== result.output.sizeBytes
    || String(metadata.contentType ?? "") !== result.output.contentType
    || String(metadata.crc32c ?? "") !== result.output.crc32c
    || custom.quipslyProxyJobId !== result.jobId
    || custom.quipslyRawAssetId !== result.source.rawAssetId
    || custom.quipslySourceGeneration !== result.source.generation
    || custom.quipslySourceSha256 !== result.source.sha256
    || custom.quipslyOutputSha256 !== result.output.sha256
    || custom.quipslyProfile !== result.output.profile
  ) {
    throw new Error(
      "Stored proxy object does not match the signed worker result receipt.",
    );
  }
}

async function loadJsonIfPresent(bucket: any, objectName: string) {
  const file = bucket.file(objectName);
  try {
    const [metadata] = await file.getMetadata();
    const generation = String(metadata.generation ?? "");
    if (!/^[1-9][0-9]*$/.test(generation)) {
      throw new Error("Control object is missing an immutable generation.");
    }
    const [raw] = await bucket.file(
      objectName,
      { generation },
    ).download({ validation: "crc32c" });
    return {
      value: JSON.parse(raw.toString("utf8")) as unknown,
      generation,
    };
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

async function markJob(
  prisma: any,
  jobId: string,
  status: "failed" | "blocked",
  failure: { code: string; message: string },
) {
  await prisma.studioWorkflowJob.update({
    where: { id: jobId },
    data: {
      status,
      error: `${failure.code}: ${failure.message}`.slice(0, 4_000),
      ...(status === "failed" ? { completedAt: new Date() } : {}),
      resultJson: {
        status,
        failure,
        originalRemainsSourceTruth: true,
      },
    },
  });
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
  throw new Error("Capture proxy reconciliation retry budget exhausted.");
}

function proxyFilename(rawFilename: string) {
  const stem = rawFilename.replace(/\.[^.]+$/, "").slice(0, 180);
  return `${stem || "capture"}.collaboration-proxy.mp4`;
}

function proxyAttachmentMetadata(
  manifest: CaptureProxyManifest,
  result: CaptureProxyResult,
  sourceId: string,
  playbackUrl: string,
) {
  return {
    rawAssetId: manifest.source.rawAssetId,
    recordingAssetId: manifest.source.recordingAssetId,
    captureId: manifest.captureId,
    captureGroupId: manifest.captureGroupId,
    uploadSessionId: manifest.source.uploadSessionId,
    proxyJobId: manifest.jobId,
    sourceId,
    playbackUrl,
    output: result.output,
    worker: result.worker,
    copiedOriginal: false,
    mutatedOriginal: false,
    originalRemainsSourceTruth: true,
  };
}

function proxyVariantMetadata(
  manifest: CaptureProxyManifest,
  result: CaptureProxyResult,
  proxyAssetId: string,
  sourceId: string,
) {
  return {
    proxyAssetId,
    sourceId,
    proxyJobId: manifest.jobId,
    providerSourceId: toGcsUri(
      result.output.bucketName,
      result.output.objectName,
      result.output.generation,
    ),
    recordingAssetId: manifest.source.recordingAssetId,
    immutableObjectEvidence: {
      generation: result.output.generation,
      crc32c: result.output.crc32c,
      sha256: result.output.sha256,
      sizeBytes: result.output.sizeBytes,
      contentType: result.output.contentType,
    },
    technical: result.output.metadata,
    originalRemainsSourceTruth: true,
    source: "capture-proxy-worker",
  };
}

function jsonObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isNotFound(error: unknown) {
  return Number((error as { code?: unknown })?.code) === 404;
}

function isRetryableTransactionError(error: unknown) {
  const code = text((error as { code?: unknown })?.code);
  return code === "P2034" || code === "P2002";
}
