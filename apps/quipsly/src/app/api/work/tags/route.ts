import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { createAndAssignWorkEntityTag, replaceWorkEntityTags, type WorkTagEntityKind } from "@/lib/server/work-tags";

export const dynamic = "force-dynamic";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  const expectedTagRevision = Number(body.expectedTagRevision);
  const operation = text(body.operation, 40);
  const label = text(body.label, 120);
  const clientRequestId = text(body.clientRequestId, 80).toLowerCase();
  if (operation === "CREATE_AND_ASSIGN") {
    if (!["task", "goal", "session", "note", "document"].includes(entityKind) || !entityId || !label
      || !Number.isFinite(expectedUpdatedAt.getTime())
      || (entityKind === "document" && (!Number.isInteger(expectedTagRevision) || expectedTagRevision < 0))) {
      return NextResponse.json({ ok: false, code: "INVALID_INPUT", error: "The reusable tag request is incomplete or invalid." }, { status: 400 });
    }
    try {
      const result = await createAndAssignWorkEntityTag({
        prisma: getPrismaClient(),
        actorUserId: session.user.id,
        actorEmail,
        entityKind,
        entityId,
        label,
        expectedUpdatedAt,
        expectedTagRevision: entityKind === "document" ? expectedTagRevision : undefined,
      });
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
  const newTagLabels = Array.isArray(body.newTagLabels)
    ? body.newTagLabels.map((value) => text(value, 120))
    : body.newTagLabels === undefined ? [] : null;
  if (!["task", "goal", "session", "note", "document"].includes(entityKind)
      || !entityId
      || !tagIds
      || !newTagLabels
      || newTagLabels.some((value) => !value)
      || tagIds.length + newTagLabels.length > 24
      || !Number.isFinite(expectedUpdatedAt.getTime())
      || (entityKind === "document" && (!Number.isInteger(expectedTagRevision) || expectedTagRevision < 0))
      || (clientRequestId && !UUID_PATTERN.test(clientRequestId))) {
    return NextResponse.json({ ok: false, code: "INVALID_INPUT", error: "The tag decision is incomplete or invalid." }, { status: 400 });
  }
  try {
    const result = await replaceWorkEntityTags({
      prisma: getPrismaClient(),
      actorUserId: session.user.id,
      actorEmail,
      entityKind,
      entityId,
      tagIds,
      newTagLabels,
      expectedUpdatedAt,
      expectedTagRevision: entityKind === "document" ? expectedTagRevision : undefined,
      clientRequestId: clientRequestId || undefined,
      surface: clientRequestId ? "ios-capture-today" : "nest-work",
    });
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
