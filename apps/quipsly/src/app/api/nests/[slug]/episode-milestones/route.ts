import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import {
  EPISODE_MILESTONE_KINDS,
  EPISODE_MILESTONE_STATUSES,
  EpisodeMilestoneError,
  createEpisodeMilestone,
  listEpisodeMilestoneAssignees,
  listEpisodeMilestones,
  updateEpisodeMilestone,
  type EpisodeMilestoneInput,
  type EpisodeMilestoneKind,
  type EpisodeMilestoneStatus,
  type EpisodeMilestoneUpdate,
} from "@/lib/server/episode-production-milestones";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";

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

function text(value: unknown, max = 2_000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function optionalText(value: unknown, max = 2_000) {
  if (value === null) return null;
  return typeof value === "string" ? value.trim().slice(0, max) || null : undefined;
}

function date(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function kind(value: unknown): EpisodeMilestoneKind | null {
  const candidate = text(value, 60).toUpperCase() as EpisodeMilestoneKind;
  return EPISODE_MILESTONE_KINDS.includes(candidate) ? candidate : null;
}

function status(value: unknown): EpisodeMilestoneStatus | null {
  const candidate = text(value, 30).toUpperCase() as EpisodeMilestoneStatus;
  return EPISODE_MILESTONE_STATUSES.includes(candidate) ? candidate : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

async function access(request: Request, slug: string, action: "read" | "write") {
  const prisma = getPrismaClient();
  const result = await resolveEpisodeProductionAccess({
    request,
    projectSlug: slug,
    action,
    prisma,
  });
  return { prisma, result };
}

async function episode(prisma: ReturnType<typeof getPrismaClient>, projectId: string, episodeSlug: string) {
  return prisma.studioEpisodeProduction.findFirst({
    where: { projectId, slug: episodeSlug },
    select: { id: true, projectId: true },
  });
}

function errorResponse(error: unknown) {
  if (error instanceof EpisodeMilestoneError) {
    return privateJson({ ok: false, code: error.code, error: error.message }, error.status);
  }
  console.error("[episode-milestones] Unexpected failure", error);
  return privateJson({ ok: false, error: "The episode runway could not be saved safely." }, 500);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const episodeSlug = text(new URL(request.url).searchParams.get("episode"), 160);
  if (!episodeSlug) return privateJson({ ok: false, error: "episode is required." }, 400);
  const { prisma, result } = await access(request, slug, "read");
  if (!result.allowed) return privateJson({ ok: false, code: result.code, error: result.error }, result.status);
  const projectId = result.access.projectId;
  if (!projectId) return privateJson({ ok: false, error: "Episode Nest not found." }, 404);
  const production = await episode(prisma, projectId, episodeSlug);
  if (!production) return privateJson({ ok: false, error: "Episode production not found." }, 404);
  const [milestones, assignees] = await Promise.all([
    listEpisodeMilestones(prisma, production.id),
    listEpisodeMilestoneAssignees(prisma, projectId, result.actor.id),
  ]);
  return privateJson({ ok: true, milestones, assignees });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const { prisma, result } = await access(request, slug, "write");
  if (!result.allowed) return privateJson({ ok: false, code: result.code, error: result.error }, result.status);
  const body = record(await request.json().catch(() => null));
  if (!body) return privateJson({ ok: false, error: "Send one milestone object." }, 400);
  const episodeSlug = text(body?.episodeSlug, 160);
  const clientRequestId = text(body?.clientRequestId, 160);
  const milestoneKind = kind(body?.kind);
  const startsAt = date(body?.startsAt);
  const endsAt = body?.endsAt === null || body?.endsAt === "" ? null : date(body?.endsAt);
  if (!episodeSlug || !clientRequestId || !milestoneKind || !startsAt || (body?.endsAt && !endsAt)) {
    return privateJson({ ok: false, error: "Episode, request identity, milestone type, and a valid start are required." }, 400);
  }
  const projectId = result.access.projectId;
  if (!projectId) return privateJson({ ok: false, error: "Episode Nest not found." }, 404);
  const production = await episode(prisma, projectId, episodeSlug);
  if (!production) return privateJson({ ok: false, error: "Episode production not found." }, 404);
  const milestone: EpisodeMilestoneInput = {
    kind: milestoneKind,
    title: text(body?.title, 160),
    detail: optionalText(body?.detail),
    startsAt,
    endsAt,
    timezone: text(body?.timezone, 100),
    assigneeUserId: optionalText(body?.assigneeUserId, 100),
    dependsOnMilestoneId: optionalText(body?.dependsOnMilestoneId, 100),
  };
  try {
    const created = await createEpisodeMilestone({
      prisma,
      projectId,
      episodeProductionId: production.id,
      actor: { id: result.actor.id, email: result.actor.email },
      clientRequestId,
      milestone,
    });
    return privateJson({ ok: true, ...created }, created.replayed ? 200 : 201);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const { prisma, result } = await access(request, slug, "write");
  if (!result.allowed) return privateJson({ ok: false, code: result.code, error: result.error }, result.status);
  const body = record(await request.json().catch(() => null));
  if (!body) return privateJson({ ok: false, error: "Send one milestone revision object." }, 400);
  const episodeSlug = text(body?.episodeSlug, 160);
  const milestoneId = text(body?.milestoneId, 100);
  const clientRequestId = text(body?.clientRequestId, 160);
  const expectedRevision = Number(body?.expectedRevision);
  if (!episodeSlug || !milestoneId || !clientRequestId || !Number.isInteger(expectedRevision) || expectedRevision < 1) {
    return privateJson({ ok: false, error: "Episode, milestone, request identity, and expected revision are required." }, 400);
  }
  const patch: EpisodeMilestoneUpdate = {};
  if ("kind" in body) {
    const value = kind(body?.kind);
    if (!value) return privateJson({ ok: false, error: "Choose a valid milestone type." }, 400);
    patch.kind = value;
  }
  if ("status" in body) {
    const value = status(body?.status);
    if (!value) return privateJson({ ok: false, error: "Choose a valid milestone status." }, 400);
    patch.status = value;
  }
  if ("title" in body) patch.title = text(body?.title, 160);
  if ("detail" in body) patch.detail = optionalText(body?.detail);
  if ("startsAt" in body) {
    const value = date(body?.startsAt);
    if (!value) return privateJson({ ok: false, error: "Choose a valid milestone start." }, 400);
    patch.startsAt = value;
  }
  if ("endsAt" in body) {
    const value = body?.endsAt === null || body?.endsAt === "" ? null : date(body?.endsAt);
    if (body?.endsAt && !value) return privateJson({ ok: false, error: "Choose a valid milestone end." }, 400);
    patch.endsAt = value;
  }
  if ("timezone" in body) patch.timezone = text(body?.timezone, 100);
  if ("assigneeUserId" in body) patch.assigneeUserId = optionalText(body?.assigneeUserId, 100);
  if ("dependsOnMilestoneId" in body) patch.dependsOnMilestoneId = optionalText(body?.dependsOnMilestoneId, 100);
  if (!Object.keys(patch).length) return privateJson({ ok: false, error: "Choose at least one milestone change." }, 400);

  const projectId = result.access.projectId;
  if (!projectId) return privateJson({ ok: false, error: "Episode Nest not found." }, 404);
  const production = await episode(prisma, projectId, episodeSlug);
  if (!production) return privateJson({ ok: false, error: "Episode production not found." }, 404);
  try {
    const updated = await updateEpisodeMilestone({
      prisma,
      projectId,
      episodeProductionId: production.id,
      milestoneId,
      actor: { id: result.actor.id, email: result.actor.email },
      clientRequestId,
      expectedRevision,
      patch,
    });
    return privateJson({ ok: true, ...updated });
  } catch (error) {
    return errorResponse(error);
  }
}
