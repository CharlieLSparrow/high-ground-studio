'use server'

import { getPrismaClient } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function createMediaBin(projectId: string, name: string, description?: string) {
  const prisma = getPrismaClient();

  await prisma.mediaBin.create({
    data: {
      projectId,
      name,
      description
    }
  });

  revalidatePath('/media');
}

export async function createMediaClip(mediaAssetId: string, title: string, inTimecode: number, outTimecode: number, description?: string) {
  const prisma = getPrismaClient();

  await prisma.mediaClip.create({
    data: {
      mediaAssetId,
      title,
      inTimecode,
      outTimecode,
      description
    }
  });

  revalidatePath(`/media/${mediaAssetId}`);
}

export async function assignAssetToBin(assetId: string, mediaBinId: string | null) {
  const prisma = getPrismaClient();

  await prisma.studioMediaAsset.update({
    where: { id: assetId },
    data: { mediaBinId }
  });

  revalidatePath('/media');
}

export async function seedDummyVideo(projectId: string) {
  const prisma = getPrismaClient();

  const asset = await prisma.studioMediaAsset.create({
    data: {
      filename: 'BigBuckBunny_Travel_Vlog.mp4',
      url: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      mimeType: 'video/mp4',
      duration: 596,
      resolution: '1920x1080',
      fps: 24,
      thumbnailUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg',
      projects: {
        connect: { id: projectId }
      }
    }
  });

  revalidatePath('/media');
  return asset;
}
