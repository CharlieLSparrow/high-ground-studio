import { NextRequest, NextResponse } from "next/server";

import type { AudibleEventTruthSplit, AudibleEventTruthVerdict, AudibleEventTruthWorkload } from "@/lib/audio/audible-event-corpus";
import { getPrismaClient } from "@/lib/prisma";
import { appendAudibleEventTruth, AudibleEventCorpusError, readAudibleEventCorpusStatus } from "@/lib/server/audible-event-corpus";
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
    return NextResponse.json({ ok: true, ...await readAudibleEventCorpusStatus({ prisma, projectSlug: input.projectSlug, assetId: input.assetId, sourceId: input.sourceId }) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return failure(error, "Unable to read audible-event corpus evidence.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const input = coordinates(body);
    if (!input || text(body.action) !== "label-corpus-window") return NextResponse.json({ ok: false, error: "Exact source coordinates and label-corpus-window are required." }, { status: 400 });
    const prisma = getPrismaClient();
    const access = await resolveEpisodeProductionAccess({ request, ...(input.projectId ? { projectId: input.projectId } : {}), projectSlug: input.projectSlug, action: "write", prisma });
    if (!access.allowed) return NextResponse.json({ ok: false, code: access.code, error: access.error }, { status: access.status });
    const sourceAccess = await authorizeStudioMediaSource({ prisma, actor: { id: access.actor.id, email: access.actor.email, isStaff: access.actor.isStaff }, sourceId: input.sourceId });
    if (!sourceAccess.allowed) return NextResponse.json({ ok: false, code: sourceAccess.errorCode || "audible-event-source-held", error: sourceAccess.error }, { status: sourceAccess.status });
    const result = await appendAudibleEventTruth({
      prisma,
      projectSlug: input.projectSlug,
      assetId: input.assetId,
      sourceId: input.sourceId,
      actor: { id: access.actor.id, email: access.actor.email },
      clientRequestId: text(body.clientRequestId),
      supersedesReceiptId: text(body.supersedesReceiptId) || null,
      verdict: text(body.verdict) as AudibleEventTruthVerdict,
      workload: text(body.workload) as AudibleEventTruthWorkload,
      split: text(body.split) as AudibleEventTruthSplit,
      classificationIdentifier: text(body.classificationIdentifier),
      displayLabel: text(body.displayLabel),
      family: text(body.family),
      reviewStartSeconds: Number(body.reviewStartSeconds),
      reviewEndSeconds: Number(body.reviewEndSeconds),
      eventStartSeconds: body.eventStartSeconds == null ? null : Number(body.eventStartSeconds),
      eventEndSeconds: body.eventEndSeconds == null ? null : Number(body.eventEndSeconds),
      playbackEvidence: body.playbackEvidence,
      note: text(body.note),
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return failure(error, "Unable to save audible-event corpus evidence.");
  }
}

function failure(error: unknown, fallback: string) {
  if (error instanceof AudibleEventCorpusError) return NextResponse.json({ ok: false, code: error.code, error: error.message }, { status: error.status });
  console.error(fallback, error);
  return NextResponse.json({ ok: false, error: fallback }, { status: 500 });
}
