import { getPrismaClient } from "@/lib/prisma";
import {
  listProjectsVisibleToEmail,
} from "@/lib/server/home-nest";
import { getQuipslySession } from "@/lib/server/quipsly-session";
import { normalizeAccessEmail } from "@/lib/server/studio-project-access";
import { isUserManagementAdminEmail } from "@/lib/server/user-management";

import { AudioMasteryWorkspaceClient } from "./audio-mastery-workspace-client";
import type { AudioWorkspaceProjectOption } from "./audio-mastery-workspace-model";

export const dynamic = "force-dynamic";

type SearchParams = {
  project?: string;
  episode?: string;
  asset?: string;
  at?: string;
  focus?: string;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function sourceClockSeconds(value: unknown) {
  const parsed = Number(text(value));
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 86_400 ? parsed : null;
}

function publicLoadError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const code = typeof error === "object" && error && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
  if (code === "ECONNREFUSED" || message.includes("ECONNREFUSED")) {
    return "The workspace database is unavailable. No source inventory was substituted.";
  }
  return "Quipsly could not read your accessible episode productions.";
}

export default async function AudioMasteryWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolved = await searchParams;
  const session = await getQuipslySession();
  const actorEmail = normalizeAccessEmail(
    session?.user?.primaryEmail || session?.user?.email,
  );
  if (!actorEmail) {
    return <div className="mx-auto max-w-2xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950"><h1 className="text-2xl font-black">Sign in to open Audio Studio</h1><p className="mt-2 text-sm font-semibold leading-6">Audio evidence is private and permission-filtered by Nest.</p></div>;
  }

  let projects: AudioWorkspaceProjectOption[] = [];
  let loadError: string | null = null;

  try {
    const prisma = getPrismaClient();
    const hasOperatorAccess = Boolean(
      session?.user?.isStaff || isUserManagementAdminEmail(actorEmail),
    );
    const accessibleProjects = hasOperatorAccess
      ? await prisma.studioProject.findMany({
        select: {
          id: true,
          slug: true,
          name: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: "desc" },
      }).then((rows) => rows.map((project) => ({
        ...project,
        role: "OWNER" as const,
      })))
      : await listProjectsVisibleToEmail(actorEmail, prisma);
    const productions = accessibleProjects.length
      ? await prisma.studioEpisodeProduction.findMany({
        where: { projectId: { in: accessibleProjects.map((project) => project.id) } },
        select: {
          id: true,
          projectId: true,
          slug: true,
          title: true,
          status: true,
          updatedAt: true,
        },
        orderBy: [{ updatedAt: "desc" }, { title: "asc" }],
      })
      : [];

    projects = accessibleProjects.map((project) => ({
      id: project.id,
      slug: project.slug,
      name: project.name,
      role: project.role,
      episodes: productions
        .filter((episode) => episode.projectId === project.id)
        .map((episode) => ({
          id: episode.id,
          slug: episode.slug,
          title: episode.title,
          status: episode.status,
          updatedAt: episode.updatedAt.toISOString(),
        })),
    }));
  } catch (error) {
    console.error("[audio studio] failed to load workspace choices", error);
    loadError = publicLoadError(error);
  }

  const requestedProjectSlug = text(resolved.project);
  const requestedEpisodeSlug = text(resolved.episode);
  const selectedProject = projects.find((project) => project.slug === requestedProjectSlug)
    ?? projects.find((project) => project.episodes.length > 0)
    ?? projects[0]
    ?? null;
  const selectedEpisode = selectedProject?.episodes.find((episode) => episode.slug === requestedEpisodeSlug)
    ?? selectedProject?.episodes[0]
    ?? null;

  return (
    <AudioMasteryWorkspaceClient
      projects={projects}
      initialProjectSlug={selectedProject?.slug ?? ""}
      initialEpisodeSlug={selectedEpisode?.slug ?? ""}
      initialAssetId={text(resolved.asset) || null}
      initialFocusSeconds={sourceClockSeconds(resolved.at)}
      initialFocusId={text(resolved.focus).slice(0, 240) || null}
      loadError={loadError}
    />
  );
}
