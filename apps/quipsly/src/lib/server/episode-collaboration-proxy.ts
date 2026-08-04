import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { open, stat } from "node:fs/promises";
import path from "node:path";

import type { Prisma } from "@prisma/client";
import {
  COLLABORATION_PROXY_PROFILE,
  buildEpisodeCollaborationProxyCloudManifestObjectName,
  buildEpisodeCollaborationProxyCloudResultObjectName,
  buildEpisodeCollaborationProxyTargetLocator,
  newEpisodeCollaborationProxyJob,
  parseEpisodeCollaborationProxyCloudManifest,
  parseEpisodeCollaborationProxyJob,
  parseEpisodeCollaborationProxyResult,
  type EpisodeCollaborationProxyJob,
} from "@high-ground/quipsly-media-processing";

import {
  canonicalEpisodeImportedMedia,
  canonicalEpisodeProductionJson,
} from "@/lib/episode-production/imported-media";
import {
  getMediaBucket,
  toGcsUri,
} from "@/lib/server/gcs";
import { registerEpisodeCollaborationProxy } from "@/lib/server/episode-collaboration-proxy-registration";
import {
  ensureEpisodeCollaborationProxyCloudQueued,
} from "@/lib/server/episode-collaboration-proxy-cloud";
import {
  authorizeConfiguredMediaVaultLocation,
  resolveAllowedLocalStudioMediaPath,
} from "@/lib/server/studio-media-location-security";

const JOB_TYPE = "asset-proxy";
const JOB_SOURCE = "episode-import-media.upload";

export type EpisodeCollaborationProxyStatus = {
  jobId: string | null;
  status: "not-queued" | "queued" | "processing" | "output-ready" | "completed" | "blocked" | "failed";
  proxyUrl: string | null;
  proxyAssetId: string | null;
  proxySourceId: string | null;
  variantId: string | null;
  outputEvidence: Record<string, unknown> | null;
  error: string | null;
  updatedAt: string | null;
  originalRemainsSourceTruth: true;
};

export async function queueEpisodeCollaborationProxy(input: {
  prisma: any;
  projectSlug: string;
  episodeSlug: string;
  rawAssetId: string;
  sourceId: string;
  actorUserId: string | null;
  actorEmail: string;
}) {
  const context = await loadExactContext(input);
  const sourceEvidence = await inspectImmutableStudioMediaSource(context.source.providerSourceId, context.rawAsset.mimeType);
  const targetLocator = buildEpisodeCollaborationProxyTargetLocator({
    projectSlug: context.project.slug,
    episodeSlug: context.production.slug,
    rawAssetId: context.rawAsset.id,
    sourceSha256: sourceEvidence.sha256,
  });
  const existing = await input.prisma.studioWorkflowJob.findFirst({
    where: {
      projectId: context.project.id,
      assetId: context.rawAsset.id,
      type: JOB_TYPE,
      source: JOB_SOURCE,
    },
    orderBy: { createdAt: "desc" },
  });
  if (existing?.status === "completed") {
    return statusFromJob(existing);
  }

  const jobId = existing?.id || `episode_proxy_${randomUUID().replaceAll("-", "")}`;
  const queuedAt = existing?.createdAt?.toISOString?.() || new Date().toISOString();
  const job = newEpisodeCollaborationProxyJob({
    jobId,
    projectId: context.project.id,
    projectSlug: context.project.slug,
    episodeProductionId: context.production.id,
    episodeSlug: context.production.slug,
    actorUserId: input.actorUserId || null,
    actorEmail: input.actorEmail,
    queuedAt,
    source: {
      provider: sourceEvidence.provider,
      locator: sourceEvidence.locator,
      generation: sourceEvidence.generation,
      sizeBytes: sourceEvidence.sizeBytes,
      sha256: sourceEvidence.sha256,
      contentType: sourceEvidence.contentType,
      rawAssetId: context.rawAsset.id,
      sourceId: context.source.id,
    },
    target: {
      provider: sourceEvidence.provider,
      locator: targetLocator,
      contentType: "video/mp4",
      profile: COLLABORATION_PROXY_PROFILE,
    },
  });

  const saved = await input.prisma.$transaction(async (transaction: any) => {
    const currentProduction = await transaction.studioEpisodeProduction.findUnique({
      where: { id: context.production.id },
      select: { productionJson: true, timelineJson: true },
    });
    if (!currentProduction) throw new Error("Episode disappeared before proxy queueing.");
    const productionJson = canonicalEpisodeProductionJson(
      currentProduction.productionJson,
      currentProduction.timelineJson,
    );
    let matched = false;
    const importedMedia = canonicalEpisodeImportedMedia(
      currentProduction.productionJson,
      currentProduction.timelineJson,
    ).map((entry) => {
      const row = jsonObject(entry);
      if (row.id !== context.rawAsset.id && row.sourceId !== context.source.id) return row;
      matched = true;
      return {
        ...row,
        sha256: sourceEvidence.sha256,
        proxy: {
          ...jsonObject(row.proxy),
          status: "queued",
          proxyUrl: null,
          queuedAt: new Date().toISOString(),
          jobId,
          profile: COLLABORATION_PROXY_PROFILE,
          note: "A durable collaboration proxy is queued. The immutable original remains render truth.",
        },
      };
    });
    if (!matched) throw new Error("Episode no longer contains the requested proxy source.");
    await transaction.studioEpisodeProduction.update({
      where: { id: context.production.id },
      data: {
        productionJson: toPrismaJson({
          ...productionJson,
          importedMedia,
          lastCollaborationProxyQueuedAt: new Date().toISOString(),
        }),
      },
    });
    if (existing) {
      if (existing.status === "output-ready" || existing.status === "processing") {
        try {
          const currentContract = parseEpisodeCollaborationProxyJob(existing.inputJson, existing.id);
          if (currentContract.source.sha256 === job.source.sha256) return existing;
        } catch {
          // A legacy or stale job is replaced below with the current immutable binding.
        }
      }
      return transaction.studioWorkflowJob.update({
        where: { id: existing.id },
        data: {
          status: "queued",
          error: null,
          inputJson: toPrismaJson(job),
          resultJson: null,
          requestedByEmail: input.actorEmail,
          startedAt: null,
          completedAt: null,
        },
      });
    }
    return transaction.studioWorkflowJob.create({
      data: {
        id: job.jobId,
        projectId: context.project.id,
        assetId: context.rawAsset.id,
        type: JOB_TYPE,
        status: "queued",
        source: JOB_SOURCE,
        requestedByEmail: input.actorEmail,
        inputJson: toPrismaJson(job),
      },
    });
  }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 });
  if (job.source.provider === "gcs") {
    const cloud = await ensureEpisodeCollaborationProxyCloudQueued({
      prisma: input.prisma,
      workflow: saved,
    });
    const refreshed = await input.prisma.studioWorkflowJob.findUnique({
      where: { id: saved.id },
    });
    const status = refreshed ? statusFromJob(refreshed) : statusFromJob(saved);
    return cloud.status === "configuration-required"
      ? {
        ...status,
        status: "blocked" as const,
        error: "Cloud collaboration proxy is queued, but the media processor is not configured.",
      }
      : status;
  }
  return statusFromJob(saved);
}

export async function readEpisodeCollaborationProxyStatus(input: {
  prisma: any;
  projectSlug: string;
  episodeSlug: string;
  rawAssetId: string;
}) {
  const project = await input.prisma.studioProject.findFirst({
    where: { slug: input.projectSlug },
    select: { id: true },
  });
  if (!project) return emptyStatus();
  const production = await input.prisma.studioEpisodeProduction.findUnique({
    where: {
      projectId_slug: {
        projectId: project.id,
        slug: input.episodeSlug,
      },
    },
    select: { id: true },
  });
  if (!production) return emptyStatus();
  const job = await input.prisma.studioWorkflowJob.findFirst({
    where: {
      projectId: project.id,
      assetId: input.rawAssetId,
      type: JOB_TYPE,
      source: JOB_SOURCE,
    },
    orderBy: { createdAt: "desc" },
  });
  return job ? statusFromJob(job) : emptyStatus();
}

export async function reconcileEpisodeCollaborationProxy(input: {
  prisma: any;
  projectSlug: string;
  episodeSlug: string;
  rawAssetId: string;
  sourceId: string;
}) {
  const context = await loadExactContext({
    ...input,
    actorUserId: null,
    actorEmail: "unused@example.invalid",
  });
  const jobRow = await input.prisma.studioWorkflowJob.findFirst({
    where: {
      projectId: context.project.id,
      assetId: context.rawAsset.id,
      type: JOB_TYPE,
      source: JOB_SOURCE,
    },
    orderBy: { createdAt: "desc" },
  });
  if (!jobRow) return emptyStatus();
  if (jobRow.status === "completed") return statusFromJob(jobRow);
  const job = parseEpisodeCollaborationProxyJob(jobRow.inputJson, jobRow.id);
  if (job.source.provider === "gcs") {
    return reconcileCloudEpisodeCollaborationProxy({
      prisma: input.prisma,
      workflow: jobRow,
      job,
    });
  }
  if (jobRow.status !== "output-ready") return statusFromJob(jobRow);

  const resultEnvelope = jsonObject(jobRow.resultJson);
  const result = parseEpisodeCollaborationProxyResult(resultEnvelope.receipt, job);
  await assertCurrentSource(job);
  await assertCurrentOutput(job, result);
  const registration = await registerEpisodeCollaborationProxy({
    prisma: input.prisma,
    job,
    result,
    registrationSource: "episode-collaboration-proxy-reconciliation",
  });
  return {
    jobId: job.jobId,
    status: "completed" as const,
    proxyUrl: registration.playbackUrl,
    proxyAssetId: registration.proxyAssetId,
    proxySourceId: registration.sourceId,
    variantId: registration.variantId,
    outputEvidence: result.output,
    error: null,
    updatedAt: result.completedAt,
    originalRemainsSourceTruth: true as const,
  };
}

async function reconcileCloudEpisodeCollaborationProxy(input: {
  prisma: any;
  workflow: any;
  job: EpisodeCollaborationProxyJob;
}) {
  const cloud = await ensureEpisodeCollaborationProxyCloudQueued({
    prisma: input.prisma,
    workflow: input.workflow,
  });
  if (cloud.status === "configuration-required") {
    return {
      ...statusFromJob(input.workflow),
      status: "blocked" as const,
      error: "Cloud collaboration proxy is queued, but the media processor is not configured.",
    };
  }
  if (cloud.status === "failed") {
    const refreshed = await input.prisma.studioWorkflowJob.findUnique({
      where: { id: input.workflow.id },
    });
    return refreshed ? statusFromJob(refreshed) : statusFromJob(input.workflow);
  }
  const sourceLocation = exactGcsLocation(
    input.job.source.locator,
    input.job.source.generation,
  );
  if (sourceLocation.bucketName !== cloud.bucketName) {
    throw new Error("Cloud collaboration proxy control bucket drifted from its source.");
  }
  const bucket = getMediaBucket(cloud.bucketName);
  const storedManifest = await loadGcsJsonIfPresent(
    bucket,
    buildEpisodeCollaborationProxyCloudManifestObjectName(input.job.jobId),
  );
  if (!storedManifest) return statusFromJob(input.workflow);
  const manifest = parseEpisodeCollaborationProxyCloudManifest(
    storedManifest.value,
    input.job.jobId,
  );
  if (manifest.status === "failed-terminal") {
    const error = [
      manifest.failure?.code || "episode-proxy-worker-failed",
      manifest.failure?.message || "Episode collaboration proxy failed terminal.",
    ].join(": ");
    const failed = await input.prisma.studioWorkflowJob.update({
      where: { id: input.job.jobId },
      data: {
        status: "failed",
        error,
        completedAt: new Date(manifest.failure?.failedAt || manifest.updatedAt),
      },
    });
    return statusFromJob(failed);
  }
  if (manifest.status !== "completed") {
    const refreshed = await input.prisma.studioWorkflowJob.findUnique({
      where: { id: input.job.jobId },
    });
    return refreshed ? statusFromJob(refreshed) : statusFromJob(input.workflow);
  }
  const storedResult = await loadGcsJsonIfPresent(
    bucket,
    buildEpisodeCollaborationProxyCloudResultObjectName(input.job.jobId),
  );
  if (!storedResult) return statusFromJob(input.workflow);
  const result = parseEpisodeCollaborationProxyResult(storedResult.value, input.job);
  await assertCurrentSource(input.job);
  await assertCurrentOutput(input.job, result);
  const registration = await registerEpisodeCollaborationProxy({
    prisma: input.prisma,
    job: input.job,
    result,
    registrationSource: "episode-collaboration-proxy-cloud-reconciliation",
    attachmentMetadata: {
      controlManifestObjectName: cloud.manifestObjectName,
      controlManifestGeneration: storedManifest.generation,
      controlResultObjectName: cloud.resultObjectName,
      controlResultGeneration: storedResult.generation,
    },
  });
  return {
    jobId: input.job.jobId,
    status: "completed" as const,
    proxyUrl: registration.playbackUrl,
    proxyAssetId: registration.proxyAssetId,
    proxySourceId: registration.sourceId,
    variantId: registration.variantId,
    outputEvidence: result.output,
    error: null,
    updatedAt: result.completedAt,
    originalRemainsSourceTruth: true as const,
  };
}

async function loadExactContext(input: {
  prisma: any;
  projectSlug: string;
  episodeSlug: string;
  rawAssetId: string;
  sourceId: string;
  actorUserId: string | null;
  actorEmail: string;
}) {
  const project = await input.prisma.studioProject.findFirst({
    where: { slug: input.projectSlug },
    select: { id: true, slug: true },
  });
  if (!project) throw new Error("Nest not found for collaboration proxy.");
  const [production, rawAsset, source] = await Promise.all([
    input.prisma.studioEpisodeProduction.findUnique({
      where: {
        projectId_slug: {
          projectId: project.id,
          slug: input.episodeSlug,
        },
      },
      select: { id: true, slug: true, productionJson: true, timelineJson: true },
    }),
    input.prisma.studioMediaAsset.findUnique({
      where: { id: input.rawAssetId },
      include: {
        assetAttachments: {
          where: { projectId: project.id },
          select: { id: true, metadataJson: true },
        },
      },
    }),
    input.prisma.studioVideoSource.findUnique({
      where: { id: input.sourceId },
      select: { id: true, providerSourceId: true, url: true },
    }),
  ]);
  const imported = production
    ? canonicalEpisodeImportedMedia(production.productionJson, production.timelineJson)
      .map(jsonObject)
      .some((row) => row.id === input.rawAssetId && row.sourceId === input.sourceId)
    : false;
  if (
    !production
    || !rawAsset
    || rawAsset.isProxy
    || rawAsset.assetAttachments.length === 0
    || !source
    || source.url !== `/api/ingest/media/${source.id}`
    || !source.providerSourceId
    || !imported
  ) {
    throw new Error("Collaboration proxy requires an exact imported original attached to this Episode and Nest.");
  }
  return { project, production, rawAsset, source };
}

export async function inspectImmutableStudioMediaSource(locator: string, fallbackContentType: string | null) {
  const gcs = authorizeConfiguredMediaVaultLocation(locator);
  if (gcs.kind === "rejected-gcs") throw new Error(gcs.error);
  if (gcs.kind === "gcs") {
    const bucket = getMediaBucket(gcs.bucketName);
    const file = bucket.file(gcs.objectName, gcs.generation ? { generation: gcs.generation } : undefined);
    const [metadata] = await file.getMetadata();
    const generation = String(metadata.generation || "");
    const sizeBytes = Number(metadata.size);
    const contentType = String(metadata.contentType || fallbackContentType || "video/mp4");
    if (!generation || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
      throw new Error("GCS source lacks immutable generation and size evidence.");
    }
    const sha256 = await sha256Stream(file.createReadStream({ validation: "crc32c" }));
    return {
      provider: "gcs" as const,
      locator: toGcsUri(gcs.bucketName, gcs.objectName, generation),
      generation,
      sizeBytes,
      sha256,
      contentType,
    };
  }
  const localPath = await resolveAllowedLocalStudioMediaPath(locator);
  if (!localPath) throw new Error("Local proxy source is outside Quipsly's authorized ingest root.");
  const fileStat = await stat(localPath);
  if (!fileStat.isFile() || fileStat.size <= 0) throw new Error("Local proxy source is empty or unavailable.");
  const sha256 = await sha256File(localPath);
  return {
    provider: "local" as const,
    locator: localPath,
    generation: `sha256:${sha256}`,
    sizeBytes: fileStat.size,
    sha256,
    contentType: fallbackContentType || "video/mp4",
  };
}

async function assertCurrentSource(job: EpisodeCollaborationProxyJob) {
  const evidence = await inspectImmutableStudioMediaSource(job.source.locator, job.source.contentType);
  if (
    evidence.provider !== job.source.provider
    || evidence.locator !== job.source.locator
    || evidence.generation !== job.source.generation
    || evidence.sizeBytes !== job.source.sizeBytes
    || evidence.sha256 !== job.source.sha256
  ) {
    throw new Error("Immutable original changed after the collaboration proxy was queued.");
  }
}

async function assertCurrentOutput(
  job: EpisodeCollaborationProxyJob,
  result: ReturnType<typeof parseEpisodeCollaborationProxyResult>,
) {
  if (job.target.provider === "gcs" && result.output.provider === "gcs") {
    const source = exactGcsLocation(job.source.locator, job.source.generation);
    const output = exactGcsLocation(result.output.locator, result.output.generation);
    if (
      output.bucketName !== source.bucketName
      || output.objectName !== job.target.locator
    ) {
      throw new Error("Cloud collaboration proxy escaped its deterministic target binding.");
    }
    const bucket = getMediaBucket(output.bucketName);
    const file = bucket.file(output.objectName, { generation: output.generation });
    const [metadata] = await file.getMetadata();
    const custom = Object.fromEntries(
      Object.entries(metadata.metadata ?? {}).map(([key, value]) => [key, String(value)]),
    );
    const sha256 = await sha256Stream(file.createReadStream({ validation: "crc32c" }));
    if (
      String(metadata.generation || "") !== result.output.generation
      || Number(metadata.size) !== result.output.sizeBytes
      || String(metadata.contentType || "") !== result.output.contentType
      || String(metadata.crc32c || "") !== result.output.crc32c
      || sha256 !== result.output.sha256
      || custom.quipslyKind !== "episode-collaboration-proxy-v1"
      || custom.quipslyProxyJobId !== job.jobId
      || custom.quipslyProjectId !== job.projectId
      || custom.quipslyEpisodeProductionId !== job.episodeProductionId
      || custom.quipslyRawAssetId !== job.source.rawAssetId
      || custom.quipslySourceId !== job.source.sourceId
      || custom.quipslySourceLocator !== job.source.locator
      || custom.quipslySourceGeneration !== job.source.generation
      || custom.quipslySourceSha256 !== job.source.sha256
      || custom.quipslyOutputSha256 !== result.output.sha256
      || custom.quipslyOutputSizeBytes !== String(result.output.sizeBytes)
      || custom.quipslyProfile !== result.output.profile
      || custom.quipslyOriginalRemainsSourceTruth !== "true"
      || custom.quipslyFastStart !== "true"
    ) {
      throw new Error("Cloud collaboration proxy output no longer matches its worker and object receipts.");
    }
    return;
  }
  if (job.target.provider !== "local" || result.output.provider !== "local") {
    throw new Error("Collaboration proxy worker provider drifted from its queued target.");
  }
  const outputPath = await resolveAllowedLocalStudioMediaPath(result.output.locator);
  if (!outputPath || !outputPath.endsWith(path.normalize(job.target.locator))) {
    throw new Error("Local collaboration proxy escaped its authorized deterministic target.");
  }
  const fileStat = await stat(outputPath);
  const sha256 = await sha256File(outputPath);
  if (
    !fileStat.isFile()
    || fileStat.size !== result.output.sizeBytes
    || sha256 !== result.output.sha256
    || result.output.generation !== `sha256:${sha256}`
    || !(await hasFastStart(outputPath))
  ) {
    throw new Error("Local collaboration proxy output no longer matches its worker receipt.");
  }
}

function exactGcsLocation(locator: string, expectedGeneration: string) {
  const match = /^gcs:\/\/([a-z0-9][a-z0-9._-]{1,221}[a-z0-9])\/(.+)\?generation=([1-9][0-9]*)$/.exec(locator);
  if (
    !match
    || match[3] !== expectedGeneration
    || !match[2].startsWith("media-vault/")
    || match[2].split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error("Collaboration proxy GCS locator is not generation-bound to the media vault.");
  }
  return { bucketName: match[1], objectName: match[2], generation: match[3] };
}

async function loadGcsJsonIfPresent(bucket: any, objectName: string) {
  const file = bucket.file(objectName);
  let metadata;
  try {
    [metadata] = await file.getMetadata();
  } catch (error) {
    if (Number((error as { code?: unknown }).code) === 404) return null;
    throw error;
  }
  const generation = String(metadata.generation || "");
  if (!/^[1-9][0-9]*$/.test(generation)) {
    throw new Error("Collaboration proxy control object lacks an immutable generation.");
  }
  const [raw] = await bucket.file(objectName, { generation }).download({ validation: "crc32c" });
  return {
    value: JSON.parse(raw.toString("utf8")) as unknown,
    generation,
  };
}

function statusFromJob(job: any): EpisodeCollaborationProxyStatus {
  const result = jsonObject(job.resultJson);
  const rawStatus = cleanText(job.status);
  const status = rawStatus === "queued"
    || rawStatus === "processing"
    || rawStatus === "output-ready"
    || rawStatus === "completed"
    || rawStatus === "blocked"
    || rawStatus === "failed"
    ? rawStatus
    : "blocked";
  return {
    jobId: job.id,
    status,
    proxyUrl: status === "completed" ? cleanText(result.playbackUrl) || null : null,
    proxyAssetId: status === "completed" ? cleanText(result.proxyAssetId) || null : null,
    proxySourceId: status === "completed" ? cleanText(result.sourceId) || null : null,
    variantId: status === "completed" ? cleanText(result.variantId) || null : null,
    outputEvidence: status === "completed" && Object.keys(jsonObject(result.output)).length
      ? jsonObject(result.output)
      : null,
    error: cleanText(job.error) || null,
    updatedAt: job.updatedAt?.toISOString?.() || null,
    originalRemainsSourceTruth: true,
  };
}

function emptyStatus(): EpisodeCollaborationProxyStatus {
  return {
    jobId: null,
    status: "not-queued",
    proxyUrl: null,
    proxyAssetId: null,
    proxySourceId: null,
    variantId: null,
    outputEvidence: null,
    error: null,
    updatedAt: null,
    originalRemainsSourceTruth: true,
  };
}

async function sha256File(filePath: string) {
  const handle = await open(filePath, "r");
  const hash = createHash("sha256");
  try {
    const buffer = Buffer.alloc(1024 * 1024);
    let position = 0;
    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
  } finally {
    await handle.close();
  }
  return hash.digest("hex");
}

async function sha256Stream(stream: NodeJS.ReadableStream) {
  const hash = createHash("sha256");
  for await (const chunk of stream) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

async function hasFastStart(filePath: string) {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(4 * 1024 * 1024);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const head = buffer.subarray(0, bytesRead);
    const moov = head.indexOf(Buffer.from("moov"));
    const mdat = head.indexOf(Buffer.from("mdat"));
    return moov > 0 && (mdat < 0 || moov < mdat);
  } finally {
    await handle.close();
  }
}

function jsonObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
