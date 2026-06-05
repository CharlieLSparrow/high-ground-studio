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

    const actions = await prisma.studioAssistantAction.findMany({
      where: {
        session: { projectId },
        status: "proposed",
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ actions });
  } catch (error: any) {
    console.error("GET /api/story-bible/actions error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const prisma = getPrismaClient();

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { primaryEmail: session.user.email.toLowerCase() },
          { aliases: { some: { email: session.user.email.toLowerCase() } } },
        ],
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const body = await req.json();
    const { actionId, status, comments } = body;

    if (!actionId || !status) {
      return NextResponse.json({ error: "actionId and status are required" }, { status: 400 });
    }

    const action = await prisma.studioAssistantAction.findUnique({
      where: { id: actionId },
      include: { session: true },
    });

    if (!action) {
      return NextResponse.json({ error: "Action not found" }, { status: 404 });
    }

    const project = await prisma.studioProject.findUnique({
      where: { id: action.session.projectId },
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

    const result = await prisma.$transaction(async (tx: any) => {
      const updatedAction = await tx.studioAssistantAction.update({
        where: { id: actionId },
        data: { status: status as string },
      });

      // Log the transition in the ledger
      await tx.studioAssistantLedger.create({
        data: {
          actionId,
          previousStatus: action.status,
          newStatus: status as string,
          notes: comments || null,
        }
      });

      if (status === "APPROVED" && action.kind === "PROPOSE_ENTITY") {
        const payload = action.payloadJson as any;
        if (payload && payload.name && payload.type) {
          await tx.storyEntity.create({
            data: {
              projectId: action.session.projectId,
              type: payload.type,
              name: payload.name,
              aliases: payload.aliases || [],
              attributes: payload.attributes || {},
            }
          });
        }
      }

      if (status === "APPROVED" && action.kind === "PROPOSE_ENTITY_UPDATE") {
        const payload = action.payloadJson as any;
        if (payload && payload.entityId) {
          const existing = await tx.storyEntity.findUnique({
            where: { id: payload.entityId },
          });
          if (existing) {
            const mergedAttributes = {
              ...(existing.attributes as Record<string, any> || {}),
              ...(payload.attributes || {}),
            };
            await tx.storyEntity.update({
              where: { id: payload.entityId },
              data: {
                ...(payload.name && { name: payload.name }),
                ...(payload.type && { type: payload.type }),
                ...(payload.aliases && { aliases: payload.aliases }),
                attributes: mergedAttributes,
              },
            });
          }
        }
      }

      return { updatedAction };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error("POST /api/story-bible/actions error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

