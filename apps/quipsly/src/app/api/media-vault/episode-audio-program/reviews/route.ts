import { NextRequest, NextResponse } from "next/server";

import type { EpisodeAudioReviewDecision } from "@/lib/episode-audio-review";
import { getPrismaClient } from "@/lib/prisma";
import {
  EpisodeAudioActivityReviewError,
  readEpisodeAudioActivityReviews,
  registerEpisodeAudioActivityReview,
} from "@/lib/server/episode-audio-activity-review";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";

export const runtime = "nodejs";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function failure(error: unknown) {
  const status = error instanceof EpisodeAudioActivityReviewError ? error.status : 500;
  const code = error instanceof EpisodeAudioActivityReviewError ? error.code : "EPISODE_AUDIO_REVIEW_FAILED";
  const message = error instanceof Error ? error.message : "Episode audio review failed.";
  if (status >= 500) console.error("[episode-audio-review] operation failed", error);
  return NextResponse.json({ ok: false, code, error: message }, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(request: NextRequest) {
  try {
    const projectId = text(request.nextUrl.searchParams.get("projectId"));
    const projectSlug = text(request.nextUrl.searchParams.get("projectSlug"));
    const episodeProductionId = text(request.nextUrl.searchParams.get("episodeProductionId"));
    if (!projectSlug || !episodeProductionId) return NextResponse.json({ ok: false, code: "EPISODE_AUDIO_REVIEW_REQUEST_INVALID", error: "Nest and Episode identities are required." }, { status: 400 });
    const prisma = getPrismaClient();
    const access = await resolveEpisodeProductionAccess({ request, ...(projectId ? { projectId } : {}), projectSlug, action: "read", prisma });
    if (!access.allowed) return NextResponse.json({ ok: false, code: access.code, error: access.error }, { status: access.status });
    const ledger = await readEpisodeAudioActivityReviews({ prisma, projectSlug, episodeProductionId });
    return NextResponse.json({ ok: true, ledger }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const projectId = text(body?.projectId);
    const projectSlug = text(body?.projectSlug);
    const episodeProductionId = text(body?.episodeProductionId);
    const analysisId = text(body?.analysisId);
    const eventId = text(body?.eventId);
    const decision = text(body?.decision) as EpisodeAudioReviewDecision;
    const clientRequestId = text(body?.clientRequestId);
    if (!body || !projectSlug || !episodeProductionId || !analysisId || !eventId || !decision || !body.playbackEvidence || !clientRequestId) return NextResponse.json({ ok: false, code: "EPISODE_AUDIO_REVIEW_REQUEST_INVALID", error: "Nest, Episode, analysis, event, conclusion, playback evidence, and stable request identity are required." }, { status: 400 });
    const prisma = getPrismaClient();
    const access = await resolveEpisodeProductionAccess({ request, ...(projectId ? { projectId } : {}), projectSlug, action: "write", prisma });
    if (!access.allowed) return NextResponse.json({ ok: false, code: access.code, error: access.error }, { status: access.status });
    const result = await registerEpisodeAudioActivityReview({
      prisma,
      actor: { id: access.actor.id, email: access.actor.email },
      projectSlug,
      episodeProductionId,
      analysisId,
      eventId,
      decision,
      note: text(body.note) || null,
      playbackEvidence: body.playbackEvidence,
      clientRequestId,
    });
    return NextResponse.json(result, { status: result.idempotentReplay ? 200 : 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return failure(error);
  }
}
