import { NextRequest, NextResponse } from "next/server";

import type { AudioDeliveryProfileId } from "@high-ground/quipsly-media-processing";

import { getPrismaClient } from "@/lib/prisma";
import { AudioDeliveryError, queueAudioDelivery, readAudioDeliveryStatus, reconcileAudioDelivery } from "@/lib/server/audio-delivery";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";
import { authorizeStudioMediaSource } from "@/lib/server/studio-media-source-access";

export const runtime = "nodejs";

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function coordinates(value: Record<string, unknown>) {
  const projectId = text(value.projectId); const projectSlug = text(value.projectSlug); const assetId = text(value.assetId);
  const sourceId = text(value.sourceId); const masteryJobId = text(value.masteryJobId);
  return projectSlug && assetId ? { projectId, projectSlug, assetId, sourceId, masteryJobId } : null;
}
function profile(value: unknown): AudioDeliveryProfileId | null { const normalized = text(value) || "apple-podcasts-aac-stereo-v1"; return normalized === "apple-podcasts-aac-stereo-v1" ? normalized : null; }

export async function GET(request: NextRequest) {
  try {
    const input = coordinates({ projectId: request.nextUrl.searchParams.get("projectId"), projectSlug: request.nextUrl.searchParams.get("projectSlug"), assetId: request.nextUrl.searchParams.get("assetId") });
    if (!input) return NextResponse.json({ ok: false, error: "projectSlug and assetId are required." }, { status: 400 });
    const prisma = getPrismaClient();
    const access = await resolveEpisodeProductionAccess({ request, ...(input.projectId ? { projectId: input.projectId } : {}), projectSlug: input.projectSlug, action: "read", prisma });
    if (!access.allowed) return NextResponse.json({ ok: false, code: access.code, error: access.error }, { status: access.status });
    return NextResponse.json({ ok: true, ...await readAudioDeliveryStatus({ prisma, projectSlug: input.projectSlug, assetId: input.assetId }) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[audio delivery] status failed", error);
    return NextResponse.json({ ok: false, error: "Unable to read audio delivery status." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const input = coordinates(body); const action = text(body.action) || "queue"; const profileId = profile(body.profileId);
    if (!input || !input.sourceId || !input.masteryJobId || !profileId) return NextResponse.json({ ok: false, error: "projectSlug, assetId, sourceId, masteryJobId, and a supported profileId are required." }, { status: 400 });
    if (action !== "queue" && action !== "reconcile") return NextResponse.json({ ok: false, error: "Unsupported audio delivery action." }, { status: 400 });
    const prisma = getPrismaClient();
    const access = await resolveEpisodeProductionAccess({ request, ...(input.projectId ? { projectId: input.projectId } : {}), projectSlug: input.projectSlug, action: "write", prisma });
    if (!access.allowed) return NextResponse.json({ ok: false, code: access.code, error: access.error }, { status: access.status });
    const sourceAccess = await authorizeStudioMediaSource({ prisma, actor: { id: access.actor.id, email: access.actor.email, isStaff: access.actor.isStaff }, sourceId: input.sourceId });
    if (!sourceAccess.allowed) return NextResponse.json({ ok: false, code: sourceAccess.errorCode || "audio-delivery-source-held", error: sourceAccess.error }, { status: sourceAccess.status });
    const deliveryCoordinates = { projectSlug: input.projectSlug, assetId: input.assetId, sourceId: input.sourceId, masteryJobId: input.masteryJobId };
    const status = action === "queue"
      ? await queueAudioDelivery({ prisma, ...deliveryCoordinates, actorEmail: access.actor.email, profileId })
      : await reconcileAudioDelivery({ prisma, ...deliveryCoordinates });
    return NextResponse.json({ ok: true, ...status }, { status: status.status === "completed" ? 200 : 202, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const status = error instanceof AudioDeliveryError ? error.status : 409;
    const code = error instanceof AudioDeliveryError ? error.code : "AUDIO_DELIVERY_OPERATION_FAILED";
    const message = error instanceof Error ? error.message : "Unable to operate audio delivery.";
    console.error("[audio delivery] operation failed", error);
    return NextResponse.json({ ok: false, code, error: message }, { status });
  }
}
