"use server";

import { getPrismaClient } from "@/lib/prisma";

type VideoSegmentPrismaClient = ReturnType<typeof getPrismaClient> & {
  studioVideoSource: {
    findFirst: (input: unknown) => Promise<any>;
    create: (input: unknown) => Promise<any>;
  };
  studioVideoSegment: {
    create: (input: unknown) => Promise<any>;
    findMany: (input: unknown) => Promise<any[]>;
  };
  studioSegmentList: {
    create: (input: unknown) => Promise<any>;
  };
  studioSegmentListItem: {
    findMany: (input: unknown) => Promise<Array<{ position: number }>>;
    create: (input: unknown) => Promise<any>;
  };
};

function getVideoSegmentPrismaClient() {
  return getPrismaClient() as VideoSegmentPrismaClient;
}

export async function ingestVideoSource(url: string) {
  const prisma = getVideoSegmentPrismaClient();

  // Very simplistic URL parser for YouTube
  const isYouTube = url.includes("youtube.com") || url.includes("youtu.be");
  
  if (!isYouTube) {
    if (url.endsWith(".mp4")) {
      let source = await prisma.studioVideoSource.findFirst({
        where: { url, provider: "internal" }
      });
      if (!source) {
        source = await prisma.studioVideoSource.create({
          data: {
            provider: "internal",
            providerSourceId: url,
            url,
            title: `Raw Video File`,
          }
        });
      }
      return source;
    }
    throw new Error("Only YouTube URLs or .mp4 URLs are supported in MVP");
  }

  // Extract video ID (very naive approach for MVP)
  let videoId = "";
  if (url.includes("v=")) {
    videoId = url.split("v=")[1].split("&")[0];
  } else if (url.includes("youtu.be/")) {
    videoId = url.split("youtu.be/")[1].split("?")[0];
  }

  if (!videoId) {
    throw new Error("Invalid YouTube URL");
  }

  // Create or return existing source
  let source = await prisma.studioVideoSource.findFirst({
    where: { providerSourceId: videoId, provider: "youtube" }
  });

  if (!source) {
    source = await prisma.studioVideoSource.create({
      data: {
        provider: "youtube",
        providerSourceId: videoId,
        url,
        title: `YouTube Video: ${videoId}`,
      }
    });
  }

  return source;
}

export async function createVideoSegment({
  sourceId,
  startMs,
  endMs,
  title,
  concept,
  difficulty,
  cameraAngles
}: {
  sourceId: string;
  startMs: number;
  endMs: number;
  title: string;
  concept: string;
  difficulty: string;
  cameraAngles?: { x: number, y: number, z: number } | null;
}) {
  const prisma = getVideoSegmentPrismaClient();

  if (startMs < 0 || endMs <= startMs) {
    throw new Error("Invalid timestamps: endMs must be greater than startMs, and startMs must be >= 0.");
  }

  const startSeconds = startMs / 1000;
  const endSeconds = endMs / 1000;
  
  const segment = await prisma.studioVideoSegment.create({
    data: {
      sourceId,
      startSeconds,
      endSeconds,
      title,
      concept,
      difficulty,
      cameraJson: cameraAngles ? JSON.parse(JSON.stringify(cameraAngles)) : null,
    }
  });
  
  return segment;
}

export async function getSegmentsForSource(sourceId: string) {
  const prisma = getVideoSegmentPrismaClient();

  return await prisma.studioVideoSegment.findMany({
    where: { sourceId },
    orderBy: { startSeconds: "asc" }
  });
}

export async function createSegmentList(title: string, description?: string) {
  const prisma = getVideoSegmentPrismaClient();

  return await prisma.studioSegmentList.create({
    data: {
      title,
      description
    }
  });
}

export async function addSegmentToList(listId: string, segmentId: string) {
  const prisma = getVideoSegmentPrismaClient();

  // Get max position
  const existing = await prisma.studioSegmentListItem.findMany({
    where: { listId },
    orderBy: { position: "desc" },
    take: 1
  });
  
  const position = existing.length > 0 ? existing[0].position + 1 : 0;
  
  return await prisma.studioSegmentListItem.create({
    data: {
      listId,
      segmentId,
      position
    }
  });
}
