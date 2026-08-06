/** @jest-environment node */

jest.mock("server-only", () => ({}));

import { getPrismaClient } from "@/lib/prisma";

import { loadSessionSourceClockAttention } from "./session-source-clock-attention-loader";

const runLocalDatabaseSmoke = process.env.QUIPSLY_LOCAL_DB_SMOKE === "1" ? describe : describe.skip;
if (process.env.QUIPSLY_LOCAL_DB_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) {
    throw new Error("QUIPSLY_LOCAL_DATABASE_URL is required for the retained source-clock attention smoke.");
  }
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

runLocalDatabaseSmoke("retained Session source-clock attention", () => {
  const prisma = getPrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("projects every retained authority into bounded, source-exact listening moments", async () => {
    const room = await prisma.callRoom.findUnique({
      where: { id: "retained-coaching-follow-up-20260731" },
      select: {
        id: true,
        project: { select: { id: true, slug: true } },
        episodeProduction: { select: { id: true, slug: true } },
        recordingAssets: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            fileName: true,
            contentType: true,
            durationSeconds: true,
            localManifestJson: true,
          },
        },
      },
    });

    expect(room).not.toBeNull();
    expect(room?.project).not.toBeNull();
    if (!room?.project) throw new Error("Retained Session is missing its canonical project binding.");
    const project = room.project;

    const sources = room.recordingAssets.flatMap((recording) => {
      const promotion = object(object(recording.localManifestJson).promotion);
      const mediaAssetId = cleanText(promotion.mediaAssetId);
      const sourceId = cleanText(promotion.sourceId);
      const playbackUrl = cleanText(promotion.playbackUrl);
      const nestSlug = cleanText(promotion.nestSlug);
      const durationSeconds = Number(recording.durationSeconds);
      if (!mediaAssetId
        || !sourceId
        || playbackUrl !== `/api/ingest/media/${sourceId}`
        || nestSlug !== project.slug
        || !Number.isFinite(durationSeconds)
        || durationSeconds <= 0) return [];
      return [{
        recordingAssetId: recording.id,
        mediaAssetId,
        sourceId,
        sourceUrl: playbackUrl,
        sourceKind: String(recording.contentType || "").startsWith("video/") ? "video" as const : "audio" as const,
        label: recording.fileName || "Session recording",
      }];
    });

    expect(sources.length).toBeGreaterThan(0);
    const attention = await loadSessionSourceClockAttention({
      prisma,
      roomId: room.id,
      projectId: project.id,
      projectSlug: project.slug,
      episodeProductionId: room.episodeProduction?.id ?? null,
      episodeSlug: room.episodeProduction?.slug ?? null,
      sources,
    });

    const projectedItemIds = attention.moments.flatMap((moment) => moment.items.map((item) => item.id));
    expect(new Set(projectedItemIds).size).toBe(projectedItemIds.length);
    expect(projectedItemIds.sort()).toEqual(attention.items.map((item) => item.id).sort());
    expect(attention.counts.total).toBe(attention.items.length);
    expect(attention.counts.moments).toBe(attention.moments.length);
    expect(attention.counts.estimatedReviewSeconds).toBeLessThanOrEqual(attention.counts.separateReviewSeconds);

    for (const moment of attention.moments) {
      expect(moment.endSeconds - moment.startSeconds).toBeLessThanOrEqual(25);
      expect(moment.items.length).toBeGreaterThan(0);
      expect(moment.items.every((item) => item.source.roomId === moment.source.roomId)).toBe(true);
      expect(moment.items.every((item) => item.source.mediaAssetId === moment.source.mediaAssetId)).toBe(true);
      expect(moment.items.every((item) => item.source.sourceId === moment.source.sourceId)).toBe(true);
    }
    expect(attention.boundaries.truncatedContextRequiresAuthoritySurface).toBe(true);

    console.info("Retained source-clock attention summary", {
      sources: sources.length,
      signals: attention.counts.total,
      moments: attention.counts.moments,
      estimatedReviewSeconds: attention.counts.estimatedReviewSeconds,
      separateReviewSeconds: attention.counts.separateReviewSeconds,
      sharedContextSavingsSeconds: attention.counts.sharedContextSavingsSeconds,
      byAuthority: attention.counts.byAuthority,
    });
  });
});
