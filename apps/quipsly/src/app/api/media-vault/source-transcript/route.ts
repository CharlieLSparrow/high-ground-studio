import { NextRequest, NextResponse } from "next/server";

import type { StudioSourceTranscriptAuthorizationKind } from "@high-ground/quipsly-media-processing";

import { getPrismaClient } from "@/lib/prisma";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";
import { authorizeStudioMediaSource } from "@/lib/server/studio-media-source-access";
import {
  queueStudioSourceTranscript,
  readStudioSourceTranscriptStatus,
  reconcileStudioSourceTranscript,
} from "@/lib/server/studio-source-transcript";

export const runtime = "nodejs";

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function coordinates(value: Record<string, unknown>) {
  const projectId = text(value.projectId);
  const projectSlug = text(value.projectSlug);
  const episodeSlug = text(value.episodeSlug);
  const assetId = text(value.assetId);
  const sourceId = text(value.sourceId);
  return projectSlug && episodeSlug && assetId ? { projectId, projectSlug, episodeSlug, assetId, sourceId } : null;
}

export async function GET(request: NextRequest) {
  try {
    const input = coordinates({
      projectId: request.nextUrl.searchParams.get("projectId"),
      projectSlug: request.nextUrl.searchParams.get("projectSlug"),
      episodeSlug: request.nextUrl.searchParams.get("episodeSlug"),
      assetId: request.nextUrl.searchParams.get("assetId"),
    });
    if (!input) return NextResponse.json({ ok: false, error: "projectSlug, episodeSlug, and assetId are required." }, { status: 400 });
    const prisma = getPrismaClient();
    const access = await resolveEpisodeProductionAccess({ request, ...(input.projectId ? { projectId: input.projectId } : {}), projectSlug: input.projectSlug, action: "read", prisma });
    if (!access.allowed) return NextResponse.json({ ok: false, code: access.code, error: access.error }, { status: access.status });
    const status = await readStudioSourceTranscriptStatus({ prisma, projectSlug: input.projectSlug, episodeSlug: input.episodeSlug, assetId: input.assetId });
    return NextResponse.json({ ok: true, ...status }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[studio source transcript] status failed", error);
    return NextResponse.json({ ok: false, error: "Unable to read source transcript status." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const input = coordinates(body);
    const action = text(body.action) || "queue";
    if (!input || !input.sourceId) return NextResponse.json({ ok: false, error: "projectSlug, episodeSlug, assetId, and sourceId are required." }, { status: 400 });
    if (action !== "queue" && action !== "reconcile") return NextResponse.json({ ok: false, error: "Unsupported source transcript action." }, { status: 400 });
    const prisma = getPrismaClient();
    const access = await resolveEpisodeProductionAccess({ request, ...(input.projectId ? { projectId: input.projectId } : {}), projectSlug: input.projectSlug, action: "write", prisma });
    if (!access.allowed) return NextResponse.json({ ok: false, code: access.code, error: access.error }, { status: access.status });
    const sourceAccess = await authorizeStudioMediaSource({
      prisma,
      actor: { id: access.actor.id, email: access.actor.email, isStaff: access.actor.isStaff },
      sourceId: input.sourceId,
    });
    if (!sourceAccess.allowed) return NextResponse.json({ ok: false, code: sourceAccess.errorCode || "transcript-source-held", error: sourceAccess.error }, { status: sourceAccess.status });
    const authorizationKind = text(body.authorizationKind) as StudioSourceTranscriptAuthorizationKind;
    const status = action === "queue"
      ? await queueStudioSourceTranscript({
        prisma,
        projectSlug: input.projectSlug,
        episodeSlug: input.episodeSlug,
        assetId: input.assetId,
        sourceId: input.sourceId,
        actorEmail: access.actor.email,
        actorUserId: access.actor.id,
        authorizationKind,
        authorizationAccepted: body.authorizationAccepted === true,
        language: text(body.language) || "en",
      })
      : await reconcileStudioSourceTranscript({ prisma, projectSlug: input.projectSlug, episodeSlug: input.episodeSlug, assetId: input.assetId, sourceId: input.sourceId });
    return NextResponse.json({ ok: true, ...status }, { status: status.status === "completed" ? 200 : 202, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to operate source transcription.";
    console.error("[studio source transcript] operation failed", error);
    return NextResponse.json({ ok: false, error: message }, { status: 409 });
  }
}
