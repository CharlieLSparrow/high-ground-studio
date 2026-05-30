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

// Resilient helper to verify Studio permissions
async function checkAuth() {
  const session = await auth();
  const roles = Array.isArray(session?.user?.roles) ? session.user.roles : [];
  
  // In development, if NextAuth is unconfigured, let's log a warning but allow bypass
  if (process.env.NODE_ENV === "development" && (!session || !session.user)) {
    console.warn("[Podcast Actions] Dev bypass active. Proceeding without active authentication.");
    return { ok: true, actor: "dev-bypass@highground.com" };
  }

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
      episodes: episodes.map(e => ({
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
  } catch (err: any) {
    console.warn("[Podcast Actions] Failed to load from PostgreSQL. Using simulated fallbacks.", err);
    
    // In-memory local fallback seeder for offline or mock state
    const fallbackEpisodes = [
      {
        id: "mock-1",
        slug: "the-autonomy-paradox",
        title: "Episode 1: The Autonomy Paradox",
        description: "Malcolm Gladwell and Daniel Pink discuss the surprising science of motivation. Why standard corporate incentives fail, and why true creative momentum requires absolute self-direction.",
        audioUrl: "https://storage.googleapis.com/high-ground-studio/episodes/take_1.mp3",
        audioSizeBytes: 14500320,
        durationSeconds: 1800,
        episodeType: "full",
        season: 1,
        episodeNumber: 1,
        publishedAt: new Date().toISOString()
      },
      {
        id: "mock-2",
        slug: "dopamine-timelines-spatial-engines",
        title: "Episode 2: Dopamine Timelines & Spatial Task Engines",
        description: "A deep dive into high-stimulus organization workflows built for neurodivergent minds. How to ditch linear task calendars for high-interest momentum.",
        audioUrl: "https://storage.googleapis.com/high-ground-studio/episodes/take_2.mp3",
        audioSizeBytes: 20120400,
        durationSeconds: 2400,
        episodeType: "full",
        season: 1,
        episodeNumber: 2,
        publishedAt: new Date(Date.now() - 86400000).toISOString()
      }
    ];

    return { success: true, isSimulated: true, episodes: fallbackEpisodes };
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

// Simulated final renders / stems selector from GCS asset buckets to bridge ComfyUI & editor processes
export async function getCloudRendersAction() {
  return [
    { name: "Take 1: The Autonomy Paradox (Audio Master).mp3", url: "https://storage.googleapis.com/high-ground-studio/episodes/take_1.mp3", sizeBytes: 14500320, durationSeconds: 1800 },
    { name: "Take 2: Dopamine Timelines (Audio Master).mp3", url: "https://storage.googleapis.com/high-ground-studio/episodes/take_2.mp3", sizeBytes: 20120400, durationSeconds: 2400 },
    { name: "S1E03_Fumadocs_Integrations_V1.mp3", url: "https://storage.googleapis.com/high-ground-studio/episodes/take_3.mp3", sizeBytes: 18500200, durationSeconds: 2100 },
    { name: "Interactive_Tonight_Show_Curated.mp3", url: "https://storage.googleapis.com/high-ground-studio/episodes/tonight_show.mp3", sizeBytes: 12500000, durationSeconds: 1500 }
  ];
}
