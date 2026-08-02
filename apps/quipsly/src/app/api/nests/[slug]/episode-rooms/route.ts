import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";
import {
  createEpisodeRoomFromManuscript,
  EpisodeRoomCreationError,
} from "@/lib/server/episode-room-creation";
import { resolveStudioProjectAccess } from "@/lib/server/studio-project-access";

export const dynamic = "force-dynamic";

function privateJson(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      Vary: "Authorization, Cookie",
    },
  });
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown, max = 180) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function errorResponse(error: unknown) {
  if (error instanceof EpisodeRoomCreationError) {
    return privateJson({ ok: false, code: error.code, error: error.message }, error.status);
  }
  console.error("[episode-rooms] Unexpected source import failure", error);
  return privateJson({ ok: false, error: "The Episode Room could not be created safely." }, 500);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const prisma = getPrismaClient();
  const targetAccess = await resolveEpisodeProductionAccess({
    request,
    projectSlug: slug,
    action: "manage",
    prisma,
  });
  if (!targetAccess.allowed) {
    return privateJson(
      { ok: false, code: targetAccess.code, error: targetAccess.error },
      targetAccess.status,
    );
  }

  const body = record(await request.json().catch(() => null));
  if (!body) return privateJson({ ok: false, error: "Send one Episode Room request." }, 400);
  const sourceProjectSlug = text(body.sourceProjectSlug, 100);
  const sourceDocumentId = text(body.sourceDocumentId, 120);
  const episodeSlug = text(body.episodeSlug, 100);
  const title = text(body.title, 180);
  const clientRequestId = text(body.clientRequestId, 160);
  if (!sourceProjectSlug || !sourceDocumentId || !episodeSlug || !title || !clientRequestId) {
    return privateJson({ ok: false, error: "Source manuscript, title, slug, and request identity are required." }, 400);
  }

  const sourceAccess = await resolveStudioProjectAccess({
    projectSlug: sourceProjectSlug,
    email: targetAccess.actor.email,
    action: "read",
    prisma,
  });
  if (!sourceAccess.allowed || !sourceAccess.projectId) {
    return privateJson({ ok: false, code: "episode-source-access-denied", error: "The source manuscript is unavailable." }, 404);
  }
  if (!targetAccess.access.projectId) {
    return privateJson({ ok: false, error: "The target Nest was not found." }, 404);
  }

  try {
    const result = await createEpisodeRoomFromManuscript({
      prisma,
      targetProjectId: targetAccess.access.projectId,
      targetProjectSlug: slug,
      sourceProjectId: sourceAccess.projectId,
      sourceProjectSlug,
      sourceDocumentId,
      episodeSlug,
      title,
      actor: { id: targetAccess.actor.id, email: targetAccess.actor.email },
      clientRequestId,
    });
    return privateJson({ ok: true, ...result }, result.replayed ? 200 : 201);
  } catch (error) {
    return errorResponse(error);
  }
}
