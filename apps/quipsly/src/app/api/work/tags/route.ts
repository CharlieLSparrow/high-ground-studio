import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { createAndAssignWorkEntityTag, replaceWorkEntityTags, type WorkTagEntityKind } from "@/lib/server/work-tags";

export const dynamic = "force-dynamic";

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  const actorEmail = text(session?.user?.primaryEmail || session?.user?.email, 320).toLowerCase();
  if (!session?.user?.id || !actorEmail) return NextResponse.json({ ok: false, code: "AUTH_REQUIRED", error: "Sign in before changing private tags." }, { status: 401 });
  let body: Record<string, unknown> = {};
  try { body = record(await request.json()); } catch { /* validation below */ }
  const entityKind = text(body.entityKind, 20) as WorkTagEntityKind;
  const entityId = text(body.entityId);
  const expectedUpdatedAt = new Date(text(body.expectedUpdatedAt, 80));
  const operation = text(body.operation, 40);
  const label = text(body.label, 120);
  if (operation === "CREATE_AND_ASSIGN") {
    if (!["task", "goal", "session"].includes(entityKind) || !entityId || !label || !Number.isFinite(expectedUpdatedAt.getTime())) {
      return NextResponse.json({ ok: false, code: "INVALID_INPUT", error: "The reusable tag request is incomplete or invalid." }, { status: 400 });
    }
    try {
      const result = await createAndAssignWorkEntityTag({ prisma: getPrismaClient(), actorUserId: session.user.id, actorEmail, entityKind, entityId, label, expectedUpdatedAt });
      if (!result.ok) {
        const status = result.code === "NOT_FOUND" ? 404
          : result.code === "CONFLICT" || result.code === "SLUG_CONFLICT" || result.code === "ARCHIVED" ? 409
            : result.code === "INVALID_INPUT" ? 400 : 403;
        return NextResponse.json(result, { status });
      }
      return NextResponse.json({ ...result, updatedAt: result.updatedAt.toISOString(), boundaries: { projectScoped: true, reusableVocabulary: true, externalSideEffects: false } });
    } catch (error) {
      console.error("[work-tags] authenticated create-and-assign failed", error);
      return NextResponse.json({ ok: false, code: "UNAVAILABLE", error: "Quipsly could not create this tag. No existing vocabulary or record was changed." }, { status: 503 });
    }
  }
  const tagIds = Array.isArray(body.tagIds) ? body.tagIds.map((value) => text(value)).filter(Boolean) : null;
  if (!["task", "goal", "session"].includes(entityKind) || !entityId || !tagIds || !Number.isFinite(expectedUpdatedAt.getTime())) {
    return NextResponse.json({ ok: false, code: "INVALID_INPUT", error: "The tag decision is incomplete or invalid." }, { status: 400 });
  }
  try {
    const result = await replaceWorkEntityTags({ prisma: getPrismaClient(), actorUserId: session.user.id, actorEmail, entityKind, entityId, tagIds, expectedUpdatedAt });
    if (!result.ok) {
      const status = result.code === "NOT_FOUND" ? 404 : result.code === "CONFLICT" ? 409 : result.code === "INVALID_INPUT" ? 400 : 403;
      return NextResponse.json(result, { status });
    }
    return NextResponse.json({ ...result, updatedAt: result.updatedAt.toISOString(), boundaries: { projectScoped: true, externalSideEffects: false } });
  } catch (error) {
    console.error("[work-tags] authenticated mutation failed", error);
    return NextResponse.json({ ok: false, code: "UNAVAILABLE", error: "Quipsly could not save these tags. No external action was taken." }, { status: 503 });
  }
}
