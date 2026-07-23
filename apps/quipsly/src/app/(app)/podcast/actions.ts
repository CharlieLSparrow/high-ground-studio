"use server";

import { revalidatePath } from "next/cache";
import { getPrismaClient } from "@/lib/prisma";
import { auth } from "@/auth";
import { canAccessStudio } from "@/lib/studio-authz";

export type EpisodeData = {
  id?: string;
  slug: string;
  title: string;
  description: string;
  audioUrl: string;
  audioSizeBytes: number;
  durationSeconds: number;
  episodeType: string;
  season?: number | null;
  episodeNumber?: number | null;
  publishedAt?: string;
};

export type CloudRenderData = {
  name: string;
  url: string;
  sizeBytes: number;
  durationSeconds: number;
};

type PodcastEpisodeRecord = {
  id: string;
  slug: string;
  title: string;
  description: string;
  audioUrl: string;
  audioSizeBytes: number;
  durationSeconds: number;
  episodeType: string;
  season: number | null;
  episodeNumber: number | null;
  publishedAt: Date;
};

// Resilient helper to verify Studio permissions
async function checkAuth() {
  const session = await auth();
  const roles = Array.isArray(session?.user?.roles) ? session.user.roles : [];
  
  if (!session?.user?.id) {
    return { ok: false, error: "Sign in required." };
  }

  if (!canAccessStudio(roles)) {
    return { ok: false, error: "Unauthorized role access." };
  }

  return { 
    ok: true, 
    actor: session.user.primaryEmail || session.user.email || session.user.id 
  };
}

export async function getEpisodesAction() {
  const authCheck = await checkAuth();
  if (!authCheck.ok) {
    return { success: false, error: authCheck.error, episodes: [] };
  }

  try {
    const prisma = getPrismaClient();
    const episodes = await prisma.podcastEpisode.findMany({
      orderBy: { publishedAt: "desc" }
    });

    return { 
      success: true, 
      episodes: episodes.map((e: PodcastEpisodeRecord) => ({
        id: e.id,
        slug: e.slug,
        title: e.title,
        description: e.description,
        audioUrl: e.audioUrl,
        audioSizeBytes: e.audioSizeBytes,
        durationSeconds: e.durationSeconds,
        episodeType: e.episodeType,
        season: e.season,
        episodeNumber: e.episodeNumber,
        publishedAt: e.publishedAt.toISOString()
      })) 
    };
  } catch (error: unknown) {
    console.error("[Podcast Actions] PostgreSQL episode read failed.", error);
    return {
      success: false as const,
      state: "unavailable" as const,
      error: "Podcast records are unavailable. No episode list was loaded and no demo records were substituted.",
      episodes: [],
    };
  }
}

export async function createEpisodeAction(data: EpisodeData) {
  const authCheck = await checkAuth();
  if (!authCheck.ok) return { success: false, error: authCheck.error };

  try {
    const prisma = getPrismaClient();
    const episode = await prisma.podcastEpisode.create({
      data: {
        slug: data.slug,
        title: data.title,
        description: data.description,
        audioUrl: data.audioUrl,
        audioSizeBytes: Number(data.audioSizeBytes),
        durationSeconds: Number(data.durationSeconds),
        episodeType: data.episodeType,
        season: data.season ? Number(data.season) : null,
        episodeNumber: data.episodeNumber ? Number(data.episodeNumber) : null,
        publishedAt: data.publishedAt ? new Date(data.publishedAt) : new Date()
      }
    });

    revalidatePath("/podcast");
    return { success: true, id: episode.id };
  } catch (err: any) {
    console.error("[Podcast Actions] Failed to create episode", err);
    return { success: false, error: err.message || "Failed to create episode" };
  }
}

export async function updateEpisodeAction(id: string, data: EpisodeData) {
  const authCheck = await checkAuth();
  if (!authCheck.ok) return { success: false, error: authCheck.error };

  try {
    const prisma = getPrismaClient();
    const episode = await prisma.podcastEpisode.update({
      where: { id },
      data: {
        slug: data.slug,
        title: data.title,
        description: data.description,
        audioUrl: data.audioUrl,
        audioSizeBytes: Number(data.audioSizeBytes),
        durationSeconds: Number(data.durationSeconds),
        episodeType: data.episodeType,
        season: data.season ? Number(data.season) : null,
        episodeNumber: data.episodeNumber ? Number(data.episodeNumber) : null,
        publishedAt: data.publishedAt ? new Date(data.publishedAt) : undefined
      }
    });

    revalidatePath("/podcast");
    return { success: true, id: episode.id };
  } catch (err: any) {
    console.error("[Podcast Actions] Failed to update episode", err);
    return { success: false, error: err.message || "Failed to update episode" };
  }
}

export async function deleteEpisodeAction(id: string) {
  const authCheck = await checkAuth();
  if (!authCheck.ok) return { success: false, error: authCheck.error };

  try {
    const prisma = getPrismaClient();
    await prisma.podcastEpisode.delete({
      where: { id }
    });

    revalidatePath("/podcast");
    return { success: true };
  } catch (err: any) {
    console.error("[Podcast Actions] Failed to delete episode", err);
    return { success: false, error: err.message || "Failed to delete episode" };
  }
}

export async function getCloudRendersAction() {
  // This desk does not yet have a verified GCS inventory adapter. Returning
  // hard-coded "masters" here made prototype data look like durable media truth.
  return {
    success: false as const,
    state: "unavailable" as const,
    error: "Cloud render inventory is not connected. Enter a verified audio URL manually.",
    renders: [] as CloudRenderData[],
  };
}
