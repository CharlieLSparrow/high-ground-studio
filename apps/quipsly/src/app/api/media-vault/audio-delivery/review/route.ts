import { NextRequest, NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { appendAudioDeliveryReview, AudioDeliveryError } from "@/lib/server/audio-delivery";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";
import { authorizeStudioMediaSource } from "@/lib/server/studio-media-source-access";

export const runtime = "nodejs";

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const projectId = text(body.projectId);
    const projectSlug = text(body.projectSlug); const assetId = text(body.assetId);
    const sourceId = text(body.sourceId); const deliveryJobId = text(body.deliveryJobId);
    const clientRequestId = text(body.clientRequestId); const decision = text(body.decision);
    if (!projectSlug || !assetId || !sourceId || !deliveryJobId || !clientRequestId || (decision !== "approved" && decision !== "rejected")) return NextResponse.json({ ok: false, error: "Complete delivery-review coordinates and a supported decision are required." }, { status: 400 });
    const prisma = getPrismaClient();
    const access = await resolveEpisodeProductionAccess({ request, ...(projectId ? { projectId } : {}), projectSlug, action: "write", prisma });
    if (!access.allowed) return NextResponse.json({ ok: false, code: access.code, error: access.error }, { status: access.status });
    const sourceAccess = await authorizeStudioMediaSource({ prisma, actor: { id: access.actor.id, email: access.actor.email, isStaff: access.actor.isStaff }, sourceId });
    if (!sourceAccess.allowed) return NextResponse.json({ ok: false, code: sourceAccess.errorCode || "audio-delivery-review-source-held", error: sourceAccess.error }, { status: sourceAccess.status });
    const result = await appendAudioDeliveryReview({ prisma, projectSlug, assetId, deliveryJobId, actor: { id: access.actor.id, email: access.actor.email }, clientRequestId, decision, playbackEvidence: body.playbackEvidence, note: text(body.note) || null });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const status = error instanceof AudioDeliveryError ? error.status : 500;
    const code = error instanceof AudioDeliveryError ? error.code : "AUDIO_DELIVERY_REVIEW_FAILED";
    const message = error instanceof Error ? error.message : "Unable to save delivery review.";
    console.error("[audio delivery review] operation failed", error);
    return NextResponse.json({ ok: false, code, error: message }, { status });
  }
}
