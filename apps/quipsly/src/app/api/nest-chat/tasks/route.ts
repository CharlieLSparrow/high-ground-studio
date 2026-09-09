import { NextResponse } from "next/server";
import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { createNestConversationTask, NestConversationTaskError } from "@/lib/server/nest-conversation-task";

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  const headers = { "Cache-Control": "private, no-store" };
  if (!session?.user?.id) return NextResponse.json({ ok: false, error: "Sign in to create a task." }, { status: 401, headers });
  const body = await request.json().catch(() => null);
  if (!body || typeof body.projectSlug !== "string" || typeof body.sourceMessageId !== "string"
    || typeof body.title !== "string" || typeof body.clientRequestId !== "string"
    || (body.tags !== undefined && (!Array.isArray(body.tags?.tagIds) || !body.tags.tagIds.every((id: unknown) => typeof id === "string")
      || (body.tags.newTagLabels !== undefined && (!Array.isArray(body.tags.newTagLabels)
        || !body.tags.newTagLabels.every((label: unknown) => typeof label === "string")))))) {
    return NextResponse.json({ ok: false, error: "Choose a message and task title." }, { status: 400, headers });
  }
  try {
    const result = await createNestConversationTask({ prisma: getPrismaClient(), actorUserId: session.user.id,
      projectSlug: body.projectSlug, messageId: body.sourceMessageId, title: body.title,
      clientRequestId: body.clientRequestId, tagIds: body.tags?.tagIds ?? [], newTagLabels: body.tags?.newTagLabels ?? [] });
    return NextResponse.json({ ok: true, ...result }, { headers });
  } catch (error) {
    if (error instanceof NestConversationTaskError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status, headers });
    console.error("[nest-chat] task creation failed", error);
    return NextResponse.json({ ok: false, error: "Your task couldn't save. Your draft is still here; try again." }, { status: 503, headers });
  }
}
