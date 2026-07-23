import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import { requireProjectAccess } from "@/lib/server/access";
import { NextResponse } from "next/server";
import {
  commitAssistantEntityAction,
  recordAssistantProposalDecisionAction,
} from "@/app/(app)/create/actions";

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
        kind: { in: ["PROPOSE_ENTITY", "PROPOSE_ENTITY_UPDATE"] },
        status: { in: ["proposed", "approved"] },
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
    const body = await req.json();
    const actionId = typeof body.actionId === "string" ? body.actionId : "";
    const status = body.status;

    if (!actionId || !["proposed", "approved", "rejected", "committed"].includes(status)) {
      return NextResponse.json({ error: "actionId and a supported lowercase status are required" }, { status: 400 });
    }

    const result = status === "committed"
      ? await commitAssistantEntityAction(actionId)
      : await recordAssistantProposalDecisionAction(actionId, status);
    if (!result.ok) {
      const responseStatus = result.code === "AUTH_REQUIRED"
        ? 401
        : result.code === "ACCESS_NOT_VERIFIED"
          ? 403
          : result.code === "ACTION_NOT_FOUND"
            ? 404
            : result.code === "PERSISTENCE_UNAVAILABLE"
              ? 503
              : 409;
      return NextResponse.json({ error: result.error, code: result.code }, { status: responseStatus });
    }
    return NextResponse.json({ ok: true, state: result.state, replay: result.replay, receipt: result.receipt });
  } catch (error: any) {
    console.error("POST /api/story-bible/actions error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
