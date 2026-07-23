import { NextRequest, NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { buildNativeSessionContext } from "@/lib/server/native-session-context";

export async function GET(request: NextRequest) {
  try {
    const context = await buildNativeSessionContext(request);
    const prisma = getPrismaClient();

    const grants = await prisma.studioProjectAccessGrant.findMany({
      where: {
        email: context.user.primaryEmail,
        status: "ACTIVE",
      },
      include: {
        project: {
          include: {
            workspace: true,
            episodeProductions: {
              orderBy: { createdAt: "desc" },
            },
          },
        },
      },
    });

    const workspacesMap = new Map<string, {
      id: string;
      slug: string;
      name: string;
      projects: Array<{
        id: string;
        slug: string;
        name: string;
        role: string;
        sourceLabel: string | null;
        episodes: Array<{
          id: string;
          slug: string;
          title: string | null;
          status: string;
        }>;
      }>;
    }>();

    for (const grant of grants) {
      const project = grant.project;
      if (!project?.workspace) continue;

      if (!workspacesMap.has(project.workspace.id)) {
        workspacesMap.set(project.workspace.id, {
          id: project.workspace.id,
          slug: project.workspace.slug,
          name: project.workspace.name,
          projects: [],
        });
      }

      workspacesMap.get(project.workspace.id)?.projects.push({
        id: project.id,
        slug: project.slug,
        name: project.name,
        role: grant.role,
        sourceLabel: project.sourceLabel,
        episodes: project.episodeProductions.map((episode) => ({
          id: episode.id,
          slug: episode.slug,
          title: episode.title,
          status: episode.status,
        })),
      });
    }

    return NextResponse.json({
      ok: true,
      user: {
        id: context.user.id,
        name: context.user.name,
        email: context.user.primaryEmail,
      },
      homeNest: context.homeNest,
      workspaces: Array.from(workspacesMap.values()),
      projects: context.projects,
      note: "This native mobile context shares the Firebase bearer-token session path with Quipsly Mac.",
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized. Please sign in." },
      { status: 401 }
    );
  }
}
