import { NextRequest, NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import {
  queueEpisodeCollaborationProxy,
  readEpisodeCollaborationProxyStatus,
  reconcileEpisodeCollaborationProxy,
} from "@/lib/server/episode-collaboration-proxy";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";
import { authorizeStudioMediaSource } from "@/lib/server/studio-media-source-access";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function requiredCoordinates(value: Record<string, unknown>) {
  const projectSlug = clean(value.projectSlug);
  const episodeSlug = clean(value.episodeSlug);
  const assetId = clean(value.assetId);
  const sourceId = clean(value.sourceId);
  if (!projectSlug || !episodeSlug || !assetId) return null;
  return { projectSlug, episodeSlug, assetId, sourceId };
}

export async function GET(request: NextRequest) {
  try {
    const coordinates = requiredCoordinates({
      projectSlug: request.nextUrl.searchParams.get("projectSlug"),
      episodeSlug: request.nextUrl.searchParams.get("episodeSlug"),
      assetId: request.nextUrl.searchParams.get("assetId"),
      sourceId: request.nextUrl.searchParams.get("sourceId"),
    });
    if (!coordinates) {
      return NextResponse.json({
        ok: false,
        error: "projectSlug, episodeSlug, and assetId are required.",
      }, { status: 400 });
    }
    const prisma = getPrismaClient();
    const access = await resolveEpisodeProductionAccess({
      request,
      projectSlug: coordinates.projectSlug,
      action: "read",
      prisma,
    });
    if (!access.allowed) {
      return NextResponse.json({
        ok: false,
        code: access.code,
        error: access.error,
      }, { status: access.status });
    }
    const status = await readEpisodeCollaborationProxyStatus({
      prisma,
      projectSlug: coordinates.projectSlug,
      episodeSlug: coordinates.episodeSlug,
      rawAssetId: coordinates.assetId,
    });
    return NextResponse.json({ ok: true, ...status }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("[episode collaboration proxy] status failed", error);
    return NextResponse.json({ ok: false, error: "Unable to read collaboration proxy status." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const coordinates = requiredCoordinates(body);
    const action = clean(body.action) || "queue";
    if (!coordinates || !coordinates.sourceId) {
      return NextResponse.json({
        ok: false,
        error: "projectSlug, episodeSlug, assetId, and sourceId are required.",
      }, { status: 400 });
    }
    if (action !== "queue" && action !== "reconcile") {
      return NextResponse.json({ ok: false, error: "Unsupported collaboration proxy action." }, { status: 400 });
    }
    const prisma = getPrismaClient();
    const access = await resolveEpisodeProductionAccess({
      request,
      projectSlug: coordinates.projectSlug,
      action: "write",
      prisma,
    });
    if (!access.allowed) {
      return NextResponse.json({
        ok: false,
        code: access.code,
        error: access.error,
      }, { status: access.status });
    }
    const sourceAccess = await authorizeStudioMediaSource({
      prisma,
      actor: {
        id: access.actor.id,
        email: access.actor.email,
        isStaff: access.actor.isStaff,
      },
      sourceId: coordinates.sourceId,
    });
    if (!sourceAccess.allowed) {
      return NextResponse.json({
        ok: false,
        code: sourceAccess.errorCode || "collaboration-proxy-source-held",
        error: sourceAccess.error,
      }, { status: sourceAccess.status });
    }

    const status = action === "queue"
      ? await queueEpisodeCollaborationProxy({
        prisma,
        projectSlug: coordinates.projectSlug,
        episodeSlug: coordinates.episodeSlug,
        rawAssetId: coordinates.assetId,
        sourceId: coordinates.sourceId,
        actorUserId: access.actor.id || null,
        actorEmail: access.actor.email,
      })
      : await reconcileEpisodeCollaborationProxy({
        prisma,
        projectSlug: coordinates.projectSlug,
        episodeSlug: coordinates.episodeSlug,
        rawAssetId: coordinates.assetId,
        sourceId: coordinates.sourceId,
      });
    return NextResponse.json({ ok: true, ...status }, {
      status: status.status === "completed" ? 200 : 202,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to operate collaboration proxy.";
    console.error("[episode collaboration proxy] operation failed", error);
    return NextResponse.json({ ok: false, error: message }, { status: 409 });
  }
}
