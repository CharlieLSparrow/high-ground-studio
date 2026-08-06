import { NextRequest, NextResponse } from "next/server";

import type { AudioMasteryProfileId } from "@high-ground/quipsly-media-processing";

import { getPrismaClient } from "@/lib/prisma";
import { queueAudioMastery, readAudioMasteryStatus, reconcileAudioMastery } from "@/lib/server/audio-mastery";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";
import { authorizeStudioMediaSource } from "@/lib/server/studio-media-source-access";

export const runtime = "nodejs";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function coordinates(value: Record<string, unknown>) {
  const projectId = text(value.projectId);
  const projectSlug = text(value.projectSlug);
  const assetId = text(value.assetId);
  const sourceId = text(value.sourceId);
  return projectSlug && assetId ? { projectId, projectSlug, assetId, sourceId } : null;
}

function profile(value: unknown): AudioMasteryProfileId | null {
  const normalized = text(value) || "apple-podcasts-dialogue-v1";
  return normalized === "apple-podcasts-dialogue-v1" || normalized === "ebu-r128-broadcast-v1" ? normalized : null;
}

export async function GET(request: NextRequest) {
  try {
    const input = coordinates({
      projectId: request.nextUrl.searchParams.get("projectId"),
      projectSlug: request.nextUrl.searchParams.get("projectSlug"),
      assetId: request.nextUrl.searchParams.get("assetId"),
    });
    if (!input) return NextResponse.json({ ok: false, error: "projectSlug and assetId are required." }, { status: 400 });
    const prisma = getPrismaClient();
    const access = await resolveEpisodeProductionAccess({ request, ...(input.projectId ? { projectId: input.projectId } : {}), projectSlug: input.projectSlug, action: "read", prisma });
    if (!access.allowed) return NextResponse.json({ ok: false, code: access.code, error: access.error }, { status: access.status });
    const status = await readAudioMasteryStatus({ prisma, projectSlug: input.projectSlug, assetId: input.assetId });
    return NextResponse.json({ ok: true, ...status }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[audio mastery] status failed", error);
    return NextResponse.json({ ok: false, error: "Unable to read audio mastery status." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const input = coordinates(body);
    const action = text(body.action) || "queue";
    const profileId = profile(body.profileId);
    if (!input || !input.sourceId || !profileId) {
      return NextResponse.json({ ok: false, error: "projectSlug, assetId, sourceId, and a supported profileId are required." }, { status: 400 });
    }
    if (action !== "queue" && action !== "reconcile") {
      return NextResponse.json({ ok: false, error: "Unsupported audio mastery action." }, { status: 400 });
    }
    const prisma = getPrismaClient();
    const access = await resolveEpisodeProductionAccess({ request, ...(input.projectId ? { projectId: input.projectId } : {}), projectSlug: input.projectSlug, action: "write", prisma });
    if (!access.allowed) return NextResponse.json({ ok: false, code: access.code, error: access.error }, { status: access.status });
    const sourceAccess = await authorizeStudioMediaSource({
      prisma,
      actor: { id: access.actor.id, email: access.actor.email, isStaff: access.actor.isStaff },
      sourceId: input.sourceId,
    });
    if (!sourceAccess.allowed) {
      return NextResponse.json({ ok: false, code: sourceAccess.errorCode || "audio-mastery-source-held", error: sourceAccess.error }, { status: sourceAccess.status });
    }
    const status = action === "queue"
      ? await queueAudioMastery({
        prisma,
        projectSlug: input.projectSlug,
        assetId: input.assetId,
        sourceId: input.sourceId,
        profileId,
        actorEmail: access.actor.email,
      })
      : await reconcileAudioMastery({ prisma, projectSlug: input.projectSlug, assetId: input.assetId, sourceId: input.sourceId });
    return NextResponse.json({ ok: true, ...status }, {
      status: status.status === "completed" ? 200 : 202,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to operate audio mastery.";
    console.error("[audio mastery] operation failed", error);
    return NextResponse.json({ ok: false, error: message }, { status: 409 });
  }
}
