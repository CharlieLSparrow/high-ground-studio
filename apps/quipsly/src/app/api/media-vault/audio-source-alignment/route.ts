import { NextRequest, NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";
import { authorizeStudioMediaSource } from "@/lib/server/studio-media-source-access";
import {
  queueAudioSourceAlignment,
  readAudioSourceAlignmentStatus,
  reconcileAudioSourceAlignment,
} from "@/lib/server/audio-source-alignment";

export const runtime = "nodejs";

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function number(value: unknown) { const parsed = typeof value === "number" ? value : Number(value); return Number.isFinite(parsed) ? parsed : null; }

export async function GET(request: NextRequest) {
  try {
    const projectSlug = text(request.nextUrl.searchParams.get("projectSlug"));
    const episodeSlug = text(request.nextUrl.searchParams.get("episodeSlug"));
    const targetAssetId = text(request.nextUrl.searchParams.get("targetAssetId"));
    if (!projectSlug || !episodeSlug || !targetAssetId) return NextResponse.json({ ok: false, error: "projectSlug, episodeSlug, and targetAssetId are required." }, { status: 400 });
    const prisma = getPrismaClient();
    const access = await resolveEpisodeProductionAccess({ request, projectSlug, action: "read", prisma });
    if (!access.allowed) return NextResponse.json({ ok: false, code: access.code, error: access.error }, { status: access.status });
    return NextResponse.json({ ok: true, ...await readAudioSourceAlignmentStatus({ prisma, projectSlug, episodeSlug, targetAssetId }) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[audio source alignment] status failed", error);
    return NextResponse.json({ ok: false, error: "Unable to read exact-source alignment status." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = text(body.action) || "queue";
    const projectSlug = text(body.projectSlug);
    const episodeSlug = text(body.episodeSlug);
    const spineAssetId = text(body.spineAssetId);
    const spineSourceId = text(body.spineSourceId);
    const targetAssetId = text(body.targetAssetId);
    const targetSourceId = text(body.targetSourceId);
    if (![projectSlug, episodeSlug, spineAssetId, spineSourceId, targetAssetId, targetSourceId].every(Boolean)) {
      return NextResponse.json({ ok: false, error: "Project, episode, spine, and target source identities are required." }, { status: 400 });
    }
    if (action !== "queue" && action !== "reconcile") return NextResponse.json({ ok: false, error: "Unsupported audio alignment action." }, { status: 400 });
    const prisma = getPrismaClient();
    const access = await resolveEpisodeProductionAccess({ request, projectSlug, action: "write", prisma });
    if (!access.allowed) return NextResponse.json({ ok: false, code: access.code, error: access.error }, { status: access.status });
    const sourceAuthorizations = await Promise.all([spineSourceId, targetSourceId].map((sourceId) => authorizeStudioMediaSource({
      prisma,
      actor: { id: access.actor.id, email: access.actor.email, isStaff: access.actor.isStaff },
      sourceId,
    })));
    const denied = sourceAuthorizations.find((authorization) => !authorization.allowed);
    if (denied && !denied.allowed) return NextResponse.json({ ok: false, code: denied.errorCode || "audio-alignment-source-held", error: denied.error }, { status: denied.status });
    const status = action === "queue"
      ? await queueAudioSourceAlignment({
        prisma,
        projectSlug,
        episodeSlug,
        spineAssetId,
        spineSourceId,
        targetAssetId,
        targetSourceId,
        actorUserId: access.actor.id,
        actorEmail: access.actor.email,
        proposal: {
          initialOffsetSeconds: number(body.initialOffsetSeconds) ?? 0,
          openingTargetSeconds: number(body.openingTargetSeconds) ?? 0,
          laterTargetSeconds: number(body.laterTargetSeconds) ?? 0,
          windowSeconds: number(body.windowSeconds) ?? 6,
          searchRadiusSeconds: number(body.searchRadiusSeconds) ?? 1,
          sampleRate: number(body.sampleRate) ?? 12_000,
          minimumCorrelation: number(body.minimumCorrelation) ?? 0.78,
          minimumPeakMargin: number(body.minimumPeakMargin) ?? 0.04,
        },
      })
      : await reconcileAudioSourceAlignment({ prisma, projectSlug, episodeSlug, spineAssetId, spineSourceId, targetAssetId, targetSourceId });
    return NextResponse.json({ ok: true, ...status }, { status: status.status === "completed" ? 200 : 202, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unable to operate exact-source alignment.";
    console.error("[audio source alignment] operation failed", error);
    return NextResponse.json({ ok: false, error: detail }, { status: 409 });
  }
}
