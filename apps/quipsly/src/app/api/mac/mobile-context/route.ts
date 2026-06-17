import { NextRequest, NextResponse } from "next/server";
import { getPrismaClient } from "@/lib/prisma";
import { verifyBearerToken } from "@/lib/server/firebase-auth";

export async function GET(request: NextRequest) {
  let actor;
  try {
    actor = await verifyBearerToken(request);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized. Please sign in." },
      { status: 401 }
    );
  }

  const prisma = getPrismaClient();

  // Find all projects where the user is granted access
  const grants = await prisma.studioProjectAccessGrant.findMany({
    where: { 
      email: actor.primaryEmail,
      status: "ACTIVE"
    },
    include: {
      project: {
        include: {
          workspace: true,
          episodeProductions: {
            orderBy: { createdAt: 'desc' }
          }
        }
      }
    }
  });

  // Group by workspace
  const workspacesMap = new Map();

  for (const grant of grants) {
    const proj = grant.project;
    if (!proj || !proj.workspace) continue;

    const wsId = proj.workspace.id;
    if (!workspacesMap.has(wsId)) {
      workspacesMap.set(wsId, {
        id: wsId,
        slug: proj.workspace.slug,
        name: proj.workspace.name,
        projects: []
      });
    }

    const wsData = workspacesMap.get(wsId);
    wsData.projects.push({
      id: proj.id,
      slug: proj.slug,
      name: proj.name,
      episodes: proj.episodeProductions.map(ep => ({
        id: ep.id,
        slug: ep.slug,
        title: ep.title,
        status: ep.status,
      }))
    });
  }

  const workspaces = Array.from(workspacesMap.values());

  return NextResponse.json({
    ok: true,
    user: {
      id: actor.id,
      name: actor.name,
      email: actor.primaryEmail
    },
    workspaces
  });
}
