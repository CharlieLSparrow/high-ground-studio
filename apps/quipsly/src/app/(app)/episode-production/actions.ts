"use server";

import { getPrismaClient } from "@/lib/prisma";
import { lookupStudioProjectDocument, projectConfig } from "../create/projectConfig";
import type { EpisodeArtifact } from "./episodeArtifact";

export type EpisodeProductionState = {
  ok: boolean;
  mode: "database" | "fallback";
  id: string;
  projectSlug: string;
  documentId?: string;
  slug: string;
  title: string;
  boundaryLabel: string;
  status: string;
  message?: string;
};

function humanizeSlug(value: string) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function fallbackEpisodeProduction(
  projectSlug = "missing-project",
  episodeSlug = "current-episode",
  title = humanizeSlug(episodeSlug),
  message = "Episode production is running from URL state until the database model is available.",
): EpisodeProductionState {
  return {
    ok: true,
    mode: "fallback",
    id: `fallback-${projectSlug}-${episodeSlug}`,
    projectSlug,
    slug: episodeSlug,
    title,
    boundaryLabel: title,
    status: "fallback",
    message,
  };
}

async function findProjectAndDocument(prisma: ReturnType<typeof getPrismaClient>, projectSlug: string) {
  return lookupStudioProjectDocument(prisma, projectConfig(projectSlug).slug);
}

export async function ensureEpisodeProduction(input: {
  projectSlug?: string;
  episodeSlug?: string;
  title?: string;
  boundaryLabel?: string;
  boundaryKind?: string;
  boundaryStartBlockId?: string | null;
  boundaryEndBlockId?: string | null;
  boundaryStartOrder?: number | null;
  boundaryEndOrder?: number | null;
  productionJson?: Record<string, unknown>;
}): Promise<EpisodeProductionState> {
  const projectSlug = input.projectSlug?.trim();
  const episodeSlug = input.episodeSlug ?? "current-episode";
  const title = input.title ?? input.boundaryLabel ?? humanizeSlug(episodeSlug);
  const boundaryLabel = input.boundaryLabel ?? title;

  if (!projectSlug) {
    return Promise.resolve(fallbackEpisodeProduction(
      "missing-project",
      episodeSlug,
      title,
      "Choose a Nest/project before creating an episode production room.",
    ));
  }

  let prisma: ReturnType<typeof getPrismaClient>;
  try {
    prisma = getPrismaClient();
  } catch (error) {
    return fallbackEpisodeProduction(projectSlug, episodeSlug, title, "DATABASE_URL is not available in this runtime.");
  }

  try {
    const { project, document } = await findProjectAndDocument(prisma, projectSlug);
    if (!project || !document) {
      return fallbackEpisodeProduction(projectSlug, episodeSlug, title, "Project or document was not found yet.");
    }

    const production = await prisma.studioEpisodeProduction.upsert({
      where: { projectId_slug: { projectId: project.id, slug: episodeSlug } },
      update: {
        title,
        boundaryLabel,
        boundaryKind: input.boundaryKind ?? "episode",
        boundaryStartBlockId: input.boundaryStartBlockId ?? undefined,
        boundaryEndBlockId: input.boundaryEndBlockId ?? undefined,
        boundaryStartOrder: input.boundaryStartOrder ?? undefined,
        boundaryEndOrder: input.boundaryEndOrder ?? undefined,
        productionJson: {
          ...(input.productionJson ?? {}),
          projectSlug,
          episodeSlug,
          title,
          source: "quipsly-episode-production.ensure",
        } as any,
      },
      create: {
        projectId: project.id,
        documentId: document.id,
        slug: episodeSlug,
        title,
        boundaryLabel,
        boundaryKind: input.boundaryKind ?? "episode",
        boundaryStartBlockId: input.boundaryStartBlockId ?? undefined,
        boundaryEndBlockId: input.boundaryEndBlockId ?? undefined,
        boundaryStartOrder: input.boundaryStartOrder ?? undefined,
        boundaryEndOrder: input.boundaryEndOrder ?? undefined,
        productionJson: {
          ...(input.productionJson ?? {}),
          projectSlug,
          episodeSlug,
          title,
          source: "quipsly-episode-production.create",
        } as any,
      },
    });

    return {
      ok: true,
      mode: "database",
      id: production.id,
      projectSlug,
      documentId: document.id,
      slug: production.slug,
      title: production.title,
      boundaryLabel: production.boundaryLabel,
      status: production.status,
    };
  } catch (error) {
    console.warn("Could not ensure episode production.", error);
    return fallbackEpisodeProduction(projectSlug, episodeSlug, title, "StudioEpisodeProduction is not available yet.");
  }
}

export async function saveEpisodeRecordingRoom(input: {
  productionId?: string;
  projectSlug?: string;
  episodeSlug?: string;
  packageJson: Record<string, unknown>;
}): Promise<EpisodeProductionState> {
  const ensured = await ensureEpisodeProduction({
    projectSlug: input.projectSlug,
    episodeSlug: input.episodeSlug,
    title: typeof input.packageJson.episodeLabel === "string" ? input.packageJson.episodeLabel : undefined,
  });

  if (ensured.mode !== "database") return ensured;

  try {
    const prisma = getPrismaClient();
    const production = await prisma.studioEpisodeProduction.update({
      where: { id: ensured.id },
      data: {
        recordingRoomJson: input.packageJson as any,
        productionJson: {
          lastRecordingPackageAt: new Date().toISOString(),
          projectSlug: ensured.projectSlug,
          episodeSlug: ensured.slug,
        } as any,
      },
    });

    return {
      ...ensured,
      id: production.id,
      status: production.status,
      mode: "database",
    };
  } catch (error) {
    console.warn("Could not save episode recording room.", error);
    return {
      ...ensured,
      mode: "fallback",
      message: "Episode production exists, but recording room save failed.",
    };
  }
}

export async function saveEpisodeTimeline(input: {
  productionId?: string;
  projectSlug?: string;
  episodeSlug?: string;
  timelineJson: EpisodeArtifact;
  transcriptJson?: EpisodeArtifact;
}): Promise<EpisodeProductionState> {
  const ensured = await ensureEpisodeProduction({
    projectSlug: input.projectSlug,
    episodeSlug: input.episodeSlug,
  });

  if (ensured.mode !== "database") return ensured;

  try {
    const prisma = getPrismaClient();
    const production = await prisma.studioEpisodeProduction.update({
      where: { id: ensured.id },
      data: {
        timelineJson: input.timelineJson as any,
        transcriptJson: input.transcriptJson as any,
        productionJson: {
          lastTimelineSaveAt: new Date().toISOString(),
          projectSlug: ensured.projectSlug,
          episodeSlug: ensured.slug,
        } as any,
      },
    });

    return {
      ...ensured,
      id: production.id,
      status: production.status,
      mode: "database",
    };
  } catch (error) {
    console.warn("Could not save episode timeline.", error);
    return {
      ...ensured,
      mode: "fallback",
      message: "Episode production exists, but timeline save failed.",
    };
  }
}
