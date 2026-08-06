import { NextRequest, NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";
import { appendEpisodeAudioMixPromotion, EpisodeAudioMixReviewError } from "@/lib/server/episode-audio-mix-review";

export const runtime = "nodejs";

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function failure(error: unknown) { const status = error instanceof EpisodeAudioMixReviewError ? error.status : 500; const code = error instanceof EpisodeAudioMixReviewError ? error.code : "EPISODE_MIX_PROMOTION_FAILED"; if (status >= 500) console.error("[episode-audio-mix-promotion] failed", error); return NextResponse.json({ ok: false, code, error: error instanceof Error ? error.message : "Unable to change the Episode mix candidate." }, { status, headers: { "Cache-Control": "private, no-store" } }); }

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const projectId = text(body?.projectId);
    const projectSlug = text(body?.projectSlug);
    const episodeProductionId = text(body?.episodeProductionId);
    const jobId = text(body?.jobId);
    const operation = text(body?.operation);
    if (!body || !projectSlug || !episodeProductionId || !jobId || !["promote", "withdraw"].includes(operation)) return NextResponse.json({ ok: false, code: "EPISODE_MIX_PROMOTION_REQUEST_INVALID", error: "Exact mix coordinates and a promote or withdraw operation are required." }, { status: 400 });
    const prisma = getPrismaClient();
    const access = await resolveEpisodeProductionAccess({ request, ...(projectId ? { projectId } : {}), projectSlug, action: "write", prisma });
    if (!access.allowed) return NextResponse.json({ ok: false, code: access.code, error: access.error }, { status: access.status });
    return NextResponse.json(await appendEpisodeAudioMixPromotion({ prisma, projectSlug, episodeProductionId, jobId, actor: { email: access.actor.email }, clientRequestId: text(body.clientRequestId), operation: operation as "promote" | "withdraw", reviewReceiptId: text(body.reviewReceiptId) || null, reason: typeof body.reason === "string" ? body.reason : null }), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return failure(error); }
}
