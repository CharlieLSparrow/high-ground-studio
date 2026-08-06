import { NextRequest, NextResponse } from "next/server";

import type { AudibleEventReviewDecision } from "@/lib/audio/audible-event-review";
import { getPrismaClient } from "@/lib/prisma";
import { appendAudibleEventReview, AudibleEventReviewError, readAudibleEventReviewStatus } from "@/lib/server/audible-event-review";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";
import { authorizeStudioMediaSource } from "@/lib/server/studio-media-source-access";

export const runtime = "nodejs";

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function coordinates(value: Record<string, unknown>) {
  const projectId = text(value.projectId);
  const projectSlug = text(value.projectSlug);
  const assetId = text(value.assetId);
  const sourceId = text(value.sourceId);
  return projectSlug && assetId && sourceId ? { projectId, projectSlug, assetId, sourceId } : null;
}
export async function GET(request: NextRequest) {
  try {
    const input = coordinates({ projectId: request.nextUrl.searchParams.get("projectId"), projectSlug: request.nextUrl.searchParams.get("projectSlug"), assetId: request.nextUrl.searchParams.get("assetId"), sourceId: request.nextUrl.searchParams.get("sourceId") });
    if (!input) return NextResponse.json({ ok: false, error: "projectSlug, assetId, and sourceId are required." }, { status: 400 });
    const prisma = getPrismaClient();
    const access = await resolveEpisodeProductionAccess({ request, ...(input.projectId ? { projectId: input.projectId } : {}), projectSlug: input.projectSlug, action: "read", prisma });
    if (!access.allowed) return NextResponse.json({ ok: false, code: access.code, error: access.error }, { status: access.status });
    const sourceAccess = await authorizeStudioMediaSource({ prisma, actor: { id: access.actor.id, email: access.actor.email, isStaff: access.actor.isStaff }, sourceId: input.sourceId });
    if (!sourceAccess.allowed) return NextResponse.json({ ok: false, code: sourceAccess.errorCode || "audible-event-source-held", error: sourceAccess.error }, { status: sourceAccess.status });
    return NextResponse.json({ ok: true, ...await readAudibleEventReviewStatus({ prisma, projectSlug: input.projectSlug, assetId: input.assetId, sourceId: input.sourceId }) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return failure(error, "Unable to read audible-event review evidence.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const input = coordinates(body);
    if (!input || text(body.action) !== "review-suggestion") return NextResponse.json({ ok: false, error: "Exact source coordinates and review-suggestion are required." }, { status: 400 });
    const decision = text(body.decision) as AudibleEventReviewDecision;
    if (decision !== "confirmed" && decision !== "false-positive" && decision !== "needs-comparison") return NextResponse.json({ ok: false, error: "A supported listening decision is required." }, { status: 400 });
    const prisma = getPrismaClient();
    const access = await resolveEpisodeProductionAccess({ request, ...(input.projectId ? { projectId: input.projectId } : {}), projectSlug: input.projectSlug, action: "write", prisma });
    if (!access.allowed) return NextResponse.json({ ok: false, code: access.code, error: access.error }, { status: access.status });
    const sourceAccess = await authorizeStudioMediaSource({ prisma, actor: { id: access.actor.id, email: access.actor.email, isStaff: access.actor.isStaff }, sourceId: input.sourceId });
    if (!sourceAccess.allowed) return NextResponse.json({ ok: false, code: sourceAccess.errorCode || "audible-event-source-held", error: sourceAccess.error }, { status: sourceAccess.status });
    const result = await appendAudibleEventReview({
      prisma,
      projectSlug: input.projectSlug,
      assetId: input.assetId,
      sourceId: input.sourceId,
      actor: { id: access.actor.id, email: access.actor.email },
      analysisId: text(body.analysisId),
      eventId: text(body.eventId),
      clientRequestId: text(body.clientRequestId),
      decision,
      playbackEvidence: body.playbackEvidence,
      note: typeof body.note === "string" ? body.note : null,
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return failure(error, "Unable to save audible-event review evidence.");
  }
}

function failure(error: unknown, fallback: string) {
  if (error instanceof AudibleEventReviewError) return NextResponse.json({ ok: false, code: error.code, error: error.message }, { status: error.status });
  console.error(fallback, error);
  return NextResponse.json({ ok: false, error: fallback }, { status: 500 });
}
