import { NextRequest, NextResponse } from "next/server";

import type { EpisodeRoomCommandInput } from "@/lib/server/episode-room-store";
import {
  EpisodeRoomCommandError,
  EpisodeRoomRevisionConflict,
  applyEpisodeRoomStoreCommand,
  importEpisodeRoomText,
  loadEpisodeRoomDesk,
  loadEpisodeRoomRuntime,
} from "@/lib/server/episode-room-store";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";
import { getPrismaClient } from "@/lib/prisma";
import { roleAllowsAction } from "@/lib/server/studio-project-access";

export const dynamic = "force-dynamic";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function number(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function expectedRevision(value: unknown) {
  const parsed = number(value);
  return parsed === undefined ? undefined : Math.max(0, Math.trunc(parsed));
}

function cleanClientRequestId(value: unknown) {
  return text(value).slice(0, 160);
}

function parseCommand(body: Record<string, unknown>): EpisodeRoomCommandInput | null {
  const type = text(body.type).toUpperCase();
  const clientRequestId = cleanClientRequestId(body.clientRequestId);
  const revision = expectedRevision(body.expectedRevision);
  if (!clientRequestId || revision === undefined) return null;

  if (type === "START_SESSION") {
    return {
      type,
      clientRequestId,
      expectedRevision: revision,
      ...(text(body.recordingRoomId) ? { recordingRoomId: text(body.recordingRoomId) } : {}),
    };
  }
  if (type === "ADD_CLIP") {
    const assetId = text(body.assetId);
    return assetId ? { type, assetId, clientRequestId, expectedRevision: revision } : null;
  }
  if (type === "REMOVE_CLIP" || type === "SELECT_CLIP") {
    const clipId = text(body.clipId);
    const positionSeconds = number(body.positionSeconds);
    return clipId
      ? {
          type,
          clipId,
          clientRequestId,
          expectedRevision: revision,
          ...(positionSeconds === undefined ? {} : { positionSeconds }),
        }
      : null;
  }
  if (type === "PLAY" || type === "PAUSE" || type === "ENDED") {
    const positionSeconds = number(body.positionSeconds);
    return {
      type,
      clientRequestId,
      expectedRevision: revision,
      ...(positionSeconds === undefined ? {} : { positionSeconds }),
    };
  }
  if (type === "SEEK") {
    const positionSeconds = number(body.positionSeconds);
    const fromPositionSeconds = number(body.fromPositionSeconds);
    return positionSeconds === undefined
      ? null
      : {
          type,
          positionSeconds,
          clientRequestId,
          expectedRevision: revision,
          ...(fromPositionSeconds === undefined ? {} : { fromPositionSeconds }),
        };
  }
  if (type === "SYNC_TIMELINE") {
    return { type, clientRequestId, expectedRevision: revision };
  }
  return null;
}

async function resolveAccess(request: NextRequest, projectSlug: string, action: "read" | "write") {
  const prisma = getPrismaClient();
  return resolveEpisodeProductionAccess({
    request,
    projectSlug,
    action,
    prisma,
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const episodeSlug = text(request.nextUrl.searchParams.get("episode"));
  if (!episodeSlug) {
    return NextResponse.json({ ok: false, error: "episode is required." }, { status: 400 });
  }

  const readAccess = await resolveAccess(request, slug, "read");
  if (!readAccess.allowed) {
    return NextResponse.json({
      ok: false,
      code: readAccess.code,
      error: readAccess.error,
    }, { status: readAccess.status });
  }
  if (request.nextUrl.searchParams.get("runtime") === "1") {
    const knownWritingVersion = text(
      request.nextUrl.searchParams.get("writingVersion"),
    ).slice(0, 128);
    const runtime = await loadEpisodeRoomRuntime(slug, episodeSlug, {
      ...(readAccess.actor.id ? { userId: readAccess.actor.id } : {}),
      email: readAccess.actor.email,
      label: readAccess.actor.name || readAccess.actor.email,
      isStaff: readAccess.actor.isStaff,
    }, knownWritingVersion || undefined);
    if (!runtime) {
      return NextResponse.json({ ok: false, error: "Episode production not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, ...runtime });
  }
  const canEdit = readAccess.access.role
    ? roleAllowsAction(readAccess.access.role, "write")
    : false;
  const desk = await loadEpisodeRoomDesk(slug, episodeSlug, canEdit, {
    ...(readAccess.actor.id ? { userId: readAccess.actor.id } : {}),
    email: readAccess.actor.email,
    label: readAccess.actor.name || readAccess.actor.email,
    isStaff: readAccess.actor.isStaff,
  });
  if (!desk) {
    return NextResponse.json({ ok: false, error: "Episode production not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, desk });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const episodeSlug = text(body?.episodeSlug);
  const command = body ? parseCommand(body) : null;
  if (!episodeSlug || !command) {
    return NextResponse.json({
      ok: false,
      error: "A valid episodeSlug, command type, clientRequestId, and expectedRevision are required.",
    }, { status: 400 });
  }

  const access = await resolveAccess(request, slug, "write");
  if (!access.allowed) {
    return NextResponse.json({
      ok: false,
      code: access.code,
      error: access.error,
    }, { status: access.status });
  }

  try {
    const result = await applyEpisodeRoomStoreCommand({
      projectSlug: slug,
      episodeSlug,
      input: command,
      actor: {
        ...(access.actor.id ? { userId: access.actor.id } : {}),
        email: access.actor.email,
        label: access.actor.name || access.actor.email,
        isStaff: access.actor.isStaff,
      },
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof EpisodeRoomRevisionConflict) {
      return NextResponse.json({
        ok: false,
        code: "episode-room-revision-conflict",
        error: error.message,
        currentRevision: error.currentRevision,
      }, { status: 409 });
    }
    if (error instanceof EpisodeRoomCommandError) {
      return NextResponse.json({
        ok: false,
        code: "episode-room-command-rejected",
        error: error.message,
      }, { status: 422 });
    }
    console.error("[episode-room] command failed", error);
    return NextResponse.json({
      ok: false,
      error: "The Episode Room could not save that command.",
    }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const episodeSlug = text(body?.episodeSlug);
  const episodeText = text(body?.body);
  const clientRequestId = cleanClientRequestId(body?.clientRequestId);
  if (!episodeSlug || !episodeText || !clientRequestId) {
    return NextResponse.json({
      ok: false,
      error: "episodeSlug, body, and clientRequestId are required.",
    }, { status: 400 });
  }
  const access = await resolveAccess(request, slug, "write");
  if (!access.allowed) {
    return NextResponse.json({
      ok: false,
      code: access.code,
      error: access.error,
    }, { status: access.status });
  }
  try {
    const result = await importEpisodeRoomText({
      projectSlug: slug,
      episodeSlug,
      body: episodeText,
      clientRequestId,
      actor: {
        ...(access.actor.id ? { userId: access.actor.id } : {}),
        email: access.actor.email,
        label: access.actor.name || access.actor.email,
        isStaff: access.actor.isStaff,
      },
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof EpisodeRoomCommandError) {
      return NextResponse.json({
        ok: false,
        code: "episode-room-text-import-rejected",
        error: error.message,
      }, { status: 422 });
    }
    console.error("[episode-room] text import failed", error);
    return NextResponse.json({
      ok: false,
      error: "Episode text could not be imported.",
    }, { status: 500 });
  }
}
