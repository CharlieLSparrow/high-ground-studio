'use server'

import { getPrismaClient } from '@/lib/prisma';

export async function generateStudioCutPackage(assetId: string) {
  const prisma = getPrismaClient();

  const asset = await prisma.studioMediaAsset.findUnique({
    where: { id: assetId },
    include: {
      clips: {
        orderBy: { inTimecode: 'asc' }
      },
      projects: true
    }
  });

  if (!asset) {
    throw new Error("Asset not found");
  }

  const projectId = asset.projects[0]?.id || "default-project";
  const branchId = "main";
  const now = new Date().toISOString();

  // Map Quipsly MediaClips to Studio Cut ClipCandidates
  const clipCandidates = asset.clips.map(clip => ({
    id: clip.id,
    projectId,
    branchId,
    sourceType: "selection",
    sourceId: asset.id,
    startSourceTimeMs: clip.inTimecode * 1000,
    endSourceTimeMs: clip.outTimecode * 1000,
    label: clip.title,
    note: clip.description || "",
    createdBy: "quipsly-clip-logger",
    createdAt: clip.createdAt.toISOString(),
    updatedAt: clip.updatedAt.toISOString(),
  }));

  // Create the Studio Cut compatible JSON package
  const payload = {
    schemaVersion: 1,
    exportedAt: now,
    projectId,
    branchId,
    sourceAsset: {
      id: asset.id,
      filename: asset.filename,
      url: asset.url
    },
    clipCandidates
  };

  return payload;
}
