import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import { requireProjectAccess } from "@/lib/server/access";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const prisma = getPrismaClient();

    const entity = await prisma.storyEntity.findUnique({
      where: { id },
      include: {
        mentions: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!entity) {
      return NextResponse.json({ error: "Entity not found" }, { status: 404 });
    }

    const project = await prisma.studioProject.findUnique({
      where: { id: entity.projectId },
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

    return NextResponse.json({ entity });
  } catch (error: any) {
    console.error(`GET /api/story-bible/entities/[id] error:`, error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const prisma = getPrismaClient();

    const entity = await prisma.storyEntity.findUnique({ where: { id } });
    if (!entity) {
      return NextResponse.json({ error: "Entity not found" }, { status: 404 });
    }

    const project = await prisma.studioProject.findUnique({
      where: { id: entity.projectId },
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

    const updatedEntity = await prisma.storyEntity.update({
      where: { id },
      data: {
        ...(body.name && { name: body.name }),
        ...(body.type && { type: body.type }),
        ...(body.aliases && { aliases: body.aliases }),
        ...(body.attributes && { attributes: body.attributes }),
      },
    });

    return NextResponse.json({ entity: updatedEntity });
  } catch (error: any) {
    console.error(`PATCH /api/story-bible/entities/[id] error:`, error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const prisma = getPrismaClient();

    const entity = await prisma.storyEntity.findUnique({ where: { id } });
    if (!entity) {
      return NextResponse.json({ error: "Entity not found" }, { status: 404 });
    }

    const project = await prisma.studioProject.findUnique({
      where: { id: entity.projectId },
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

    await prisma.storyEntity.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error(`DELETE /api/story-bible/entities/[id] error:`, error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

