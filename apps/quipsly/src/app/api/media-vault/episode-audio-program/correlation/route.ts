import { NextRequest, NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import {
  EpisodeAudioPairCorrelationError,
  queueEpisodeAudioPairCorrelation,
  readEpisodeAudioPairCorrelation,
  reconcileEpisodeAudioPairCorrelation,
} from "@/lib/server/episode-audio-pair-correlation";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";

export const runtime = "nodejs";

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function fields(value: Record<string, unknown> | URLSearchParams) {
  const get = (key: string) => value instanceof URLSearchParams ? value.get(key) : value[key];
  return {
    projectId: text(get("projectId")), projectSlug: text(get("projectSlug")), episodeProductionId: text(get("episodeProductionId")),
    analysisReceiptId: text(get("analysisReceiptId")), activityMomentId: text(get("activityMomentId")),
    referenceAssetId: text(get("referenceAssetId")), observationAssetId: text(get("observationAssetId")),
  };
}
function invalid(input: ReturnType<typeof fields>) { return !input.projectSlug || !input.episodeProductionId || !input.analysisReceiptId || !input.activityMomentId || !input.referenceAssetId || !input.observationAssetId; }
function failure(error: unknown) {
  const status = error instanceof EpisodeAudioPairCorrelationError ? error.status : 500;
  const code = error instanceof EpisodeAudioPairCorrelationError ? error.code : "EPISODE_AUDIO_PAIR_FAILED";
  if (status >= 500) console.error("[episode-audio-pair-correlation] operation failed", error);
  return NextResponse.json({ ok: false, code, error: error instanceof Error ? error.message : "Episode audio pair correlation failed." }, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(request: NextRequest) {
  try {
    const input = fields(request.nextUrl.searchParams);
    if (invalid(input)) return NextResponse.json({ ok: false, code: "EPISODE_AUDIO_PAIR_REQUEST_INVALID", error: "Nest, Episode, analysis event, and two retained sources are required." }, { status: 400 });
    const prisma = getPrismaClient();
    const access = await resolveEpisodeProductionAccess({ request, ...(input.projectId ? { projectId: input.projectId } : {}), projectSlug: input.projectSlug, action: "read", prisma });
    if (!access.allowed) return NextResponse.json({ ok: false, code: access.code, error: access.error }, { status: access.status });
    const status = await readEpisodeAudioPairCorrelation({ prisma, ...input });
    return NextResponse.json({ ok: true, ...status }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const input = fields(body ?? {});
    const operation = text(body?.operation);
    if (!body || invalid(input) || !["queue", "reconcile"].includes(operation)) return NextResponse.json({ ok: false, code: "EPISODE_AUDIO_PAIR_REQUEST_INVALID", error: "A queue or reconcile operation plus exact analysis pair coordinates is required." }, { status: 400 });
    const prisma = getPrismaClient();
    const access = await resolveEpisodeProductionAccess({ request, ...(input.projectId ? { projectId: input.projectId } : {}), projectSlug: input.projectSlug, action: "write", prisma });
    if (!access.allowed) return NextResponse.json({ ok: false, code: access.code, error: access.error }, { status: access.status });
    const status = operation === "queue"
      ? await queueEpisodeAudioPairCorrelation({ prisma, ...input, actorEmail: access.actor.email })
      : await reconcileEpisodeAudioPairCorrelation({ prisma, ...input });
    return NextResponse.json({ ok: true, ...status }, { status: operation === "queue" && status.status === "queued" ? 202 : 200, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return failure(error); }
}
