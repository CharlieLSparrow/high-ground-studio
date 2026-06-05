import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import { requireProjectAccess } from "@/lib/server/access";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");

    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    const prisma = getPrismaClient();

    const project = await prisma.studioProject.findUnique({
      where: { id: projectId },
      include: { workspace: true },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    try {
      await requireProjectAccess(project.slug, "read");
    } catch (e: any) {
      const message = e.message || "Forbidden";
      if (message.startsWith("UNAUTHORIZED")) {
        return NextResponse.json({ error: message }, { status: 401 });
      }
      return NextResponse.json({ error: message }, { status: 403 });
    }

    const entities = await prisma.storyEntity.findMany({
      where: { projectId },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ entities });
  } catch (error: any) {
    console.error("GET /api/story-bible/entities error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { projectId, type, name, aliases, attributes } = body;

    if (!projectId || !type || !name) {
      return NextResponse.json(
        { error: "projectId, type, and name are required" },
        { status: 400 }
      );
    }

    const prisma = getPrismaClient();

    const project = await prisma.studioProject.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    try {
      await requireProjectAccess(project.slug, "write");
    } catch (e: any) {
      const message = e.message || "Forbidden";
      if (message.startsWith("UNAUTHORIZED")) {
        return NextResponse.json({ error: message }, { status: 401 });
      }
      return NextResponse.json({ error: message }, { status: 403 });
    }

    const entity = await prisma.storyEntity.create({
      data: {
        projectId,
        type,
        name,
        aliases: aliases || [],
        attributes: attributes || {},
      },
    });

    return NextResponse.json({ entity }, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/story-bible/entities error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

