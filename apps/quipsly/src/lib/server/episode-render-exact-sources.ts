import "server-only";

import { stat } from "node:fs/promises";

import type { EpisodeRenderProofSource } from "@high-ground/quipsly-media-processing";

import type { ProgramEditSource } from "@/lib/editor/program-edit-contract";
import type { LocalExecutorTarget } from "@/lib/server/local-executor-storage";
import { resolveAllowedLocalStudioMediaPath } from "@/lib/server/studio-media-location-security";

export class ExactEpisodeRenderSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExactEpisodeRenderSourceError";
  }
}

export async function resolveExactEpisodeRenderSources(input: {
  prisma: any;
  requiredSources: ProgramEditSource[];
  executorTarget: LocalExecutorTarget;
}): Promise<EpisodeRenderProofSource[]> {
  const mediaAssetIds = unique(
    input.requiredSources
      .map((source) => source.mediaAssetId)
      .filter(Boolean) as string[],
  );
  const sourceIds = unique(
    input.requiredSources.map((source) => source.sourceId).filter(Boolean) as string[],
  );
  if (input.requiredSources.some((source) => !source.mediaAssetId || !source.sourceId)) {
    throw new ExactEpisodeRenderSourceError(
      "At least one selected lane lacks durable media or source identity. Refresh Capture materialization before rendering.",
    );
  }
  const sources = await input.prisma.studioVideoSource.findMany({
    where: { id: { in: sourceIds } },
    select: { id: true, providerSourceId: true, url: true },
  });
  const sourcesById = new Map(sources.map((source: any) => [source.id, source]));
  const playbackUrls = unique(sources.map((source: any) => source.url).filter(Boolean));
  const assets = await input.prisma.studioMediaAsset.findMany({
    where: { OR: [{ id: { in: mediaAssetIds } }, { url: { in: playbackUrls } }] },
    orderBy: [{ id: "asc" }],
    select: {
      id: true,
      filename: true,
      mimeType: true,
      sizeBytes: true,
      duration: true,
      url: true,
    },
  });
  const assetsById = new Map(assets.map((asset: any) => [asset.id, asset]));
  const exactSources: EpisodeRenderProofSource[] = [];
  for (const source of input.requiredSources) {
    const durableSource = sourcesById.get(source.sourceId!) as any;
    const sha256 = source.sourceSha256?.toLowerCase() ?? "";
    const locator = durableSource?.providerSourceId
      ? await resolveAllowedLocalStudioMediaPath(durableSource.providerSourceId)
      : null;
    const file = locator ? await stat(locator).catch(() => null) : null;
    const preferredAsset = assetsById.get(source.mediaAssetId!) as any;
    const asset = measuredAsset(preferredAsset, file?.size)
      ? preferredAsset
      : assets.find((candidate: any) => (
          candidate.url === durableSource?.url && measuredAsset(candidate, file?.size)
        ));
    const sizeBytes = Number(asset?.sizeBytes ?? 0);
    if (
      !asset
      || !durableSource
      || !locator
      || !file?.isFile()
      || !/^[0-9a-f]{64}$/.test(sha256)
      || !Number.isSafeInteger(sizeBytes)
      || sizeBytes <= 0
    ) {
      throw new ExactEpisodeRenderSourceError(
        `${source.label} is playable in the browser but is not available as an exact local worker source on this Mac.`,
      );
    }
    exactSources.push({
      portability: "executor-local",
      custodianNodeId: input.executorTarget.nodeId,
      storageScopeId: input.executorTarget.storageScopeId,
      laneId: source.id,
      mediaAssetId: asset.id,
      sourceId: source.sourceId!,
      recordingAssetId: source.recordingAssetId ?? null,
      label: source.label,
      kind: source.kind === "audio" ? "audio" : "video",
      role: source.role,
      provider: "local",
      locator,
      generation: `sha256:${sha256}`,
      sha256,
      sizeBytes,
      contentType: source.contentType
        || asset.mimeType
        || (source.kind === "audio" ? "audio/wav" : "video/mp4"),
      sequenceOffsetSeconds: source.offsetSeconds,
      sourceStartSeconds: source.sourceStartSeconds ?? 0,
      sourceDurationSeconds: source.durationSeconds,
    });
  }
  return exactSources;
}

function measuredAsset(asset: any, fileSize: number | undefined) {
  const assetSize = Number(asset?.sizeBytes ?? 0);
  return Boolean(asset)
    && Number.isSafeInteger(assetSize)
    && assetSize > 0
    && Number.isSafeInteger(fileSize)
    && assetSize === fileSize;
}

function unique(values: string[]) { return [...new Set(values)]; }
