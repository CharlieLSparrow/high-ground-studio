import { NextRequest, NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import {
  EpisodeProgramDeliveryError,
  queueEpisodeProgramDelivery,
  readEpisodeProgramDeliveryStatus,
  reconcileEpisodeProgramDelivery,
} from "@/lib/server/episode-program-delivery";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";

export const runtime = "nodejs";

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function fields(value: Record<string, unknown> | URLSearchParams) {
  const get = (key: string) => value instanceof URLSearchParams ? value.get(key) : value[key];
  return { projectId: text(get("projectId")), projectSlug: text(get("projectSlug")), episodeProductionId: text(get("episodeProductionId")), mixJobId: text(get("mixJobId")) };
}
function invalid(input: ReturnType<typeof fields>) { return !input.projectSlug || !input.episodeProductionId; }
function failure(error: unknown) {
  const status = error instanceof EpisodeProgramDeliveryError ? error.status : 500;
  const code = error instanceof EpisodeProgramDeliveryError ? error.code : "EPISODE_PROGRAM_DELIVERY_FAILED";
  if (status >= 500) console.error("[episode-program-delivery] operation failed", error);
  return NextResponse.json({ ok: false, code, error: error instanceof Error ? error.message : "Episode program delivery operation failed." }, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(request: NextRequest) {
  try {
    const input = fields(request.nextUrl.searchParams);
    if (invalid(input)) return NextResponse.json({ ok: false, code: "EPISODE_PROGRAM_DELIVERY_REQUEST_INVALID", error: "Nest and Episode identities are required." }, { status: 400 });
    const prisma = getPrismaClient();
    const access = await resolveEpisodeProductionAccess({ request, ...(input.projectId ? { projectId: input.projectId } : {}), projectSlug: input.projectSlug, action: "read", prisma });
    if (!access.allowed) return NextResponse.json({ ok: false, code: access.code, error: access.error }, { status: access.status });
    return NextResponse.json({ ok: true, ...await readEpisodeProgramDeliveryStatus({ prisma, projectSlug: input.projectSlug, episodeProductionId: input.episodeProductionId }) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const input = fields(body ?? {});
    const operation = text(body?.operation);
    if (!body || invalid(input) || !["queue", "reconcile"].includes(operation) || (operation === "queue" && !input.mixJobId)) return NextResponse.json({ ok: false, code: "EPISODE_PROGRAM_DELIVERY_REQUEST_INVALID", error: "A supported operation plus Nest and Episode identities is required; encoding also requires the exact promoted mix job." }, { status: 400 });
    const prisma = getPrismaClient();
    const access = await resolveEpisodeProductionAccess({ request, ...(input.projectId ? { projectId: input.projectId } : {}), projectSlug: input.projectSlug, action: "write", prisma });
    if (!access.allowed) return NextResponse.json({ ok: false, code: access.code, error: access.error }, { status: access.status });
    const status = operation === "queue"
      ? await queueEpisodeProgramDelivery({ prisma, projectSlug: input.projectSlug, episodeProductionId: input.episodeProductionId, mixJobId: input.mixJobId, actorEmail: access.actor.email })
      : await reconcileEpisodeProgramDelivery({ prisma, projectSlug: input.projectSlug, episodeProductionId: input.episodeProductionId });
    return NextResponse.json({ ok: true, ...status }, { status: operation === "queue" && status.status === "queued" ? 202 : 200, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return failure(error); }
}
