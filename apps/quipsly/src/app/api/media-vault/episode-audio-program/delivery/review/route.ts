import { NextRequest, NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import {
  appendEpisodeProgramDeliveryReview,
  EpisodeProgramDeliveryError,
  readEpisodeProgramDeliveryReviewSummary,
} from "@/lib/server/episode-program-delivery";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";

export const runtime = "nodejs";

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function fields(value: Record<string, unknown> | URLSearchParams) {
  const get = (key: string) => value instanceof URLSearchParams ? value.get(key) : value[key];
  return { projectId: text(get("projectId")), projectSlug: text(get("projectSlug")), episodeProductionId: text(get("episodeProductionId")), deliveryJobId: text(get("deliveryJobId")) };
}
function invalid(input: ReturnType<typeof fields>) { return !input.projectSlug || !input.episodeProductionId || !input.deliveryJobId; }
function failure(error: unknown) {
  const status = error instanceof EpisodeProgramDeliveryError ? error.status : 500;
  const code = error instanceof EpisodeProgramDeliveryError ? error.code : "EPISODE_PROGRAM_DELIVERY_REVIEW_FAILED";
  if (status >= 500) console.error("[episode-program-delivery-review] operation failed", error);
  return NextResponse.json({ ok: false, code, error: error instanceof Error ? error.message : "Unable to read or save the Episode program delivery review." }, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(request: NextRequest) {
  try {
    const input = fields(request.nextUrl.searchParams);
    if (invalid(input)) return NextResponse.json({ ok: false, code: "EPISODE_PROGRAM_DELIVERY_REVIEW_REQUEST_INVALID", error: "Nest, Episode, and delivery job identities are required." }, { status: 400 });
    const prisma = getPrismaClient();
    const access = await resolveEpisodeProductionAccess({ request, ...(input.projectId ? { projectId: input.projectId } : {}), projectSlug: input.projectSlug, action: "read", prisma });
    if (!access.allowed) return NextResponse.json({ ok: false, code: access.code, error: access.error }, { status: access.status });
    return NextResponse.json({ ok: true, review: await readEpisodeProgramDeliveryReviewSummary({ prisma, jobId: input.deliveryJobId }) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const input = fields(body ?? {});
    const decision = text(body?.decision);
    if (!body || invalid(input) || !["approved", "rejected"].includes(decision)) return NextResponse.json({ ok: false, code: "EPISODE_PROGRAM_DELIVERY_REVIEW_REQUEST_INVALID", error: "Exact delivery coordinates and an approved or rejected decision are required." }, { status: 400 });
    const prisma = getPrismaClient();
    const access = await resolveEpisodeProductionAccess({ request, ...(input.projectId ? { projectId: input.projectId } : {}), projectSlug: input.projectSlug, action: "write", prisma });
    if (!access.allowed) return NextResponse.json({ ok: false, code: access.code, error: access.error }, { status: access.status });
    return NextResponse.json(await appendEpisodeProgramDeliveryReview({ prisma, projectSlug: input.projectSlug, episodeProductionId: input.episodeProductionId, deliveryJobId: input.deliveryJobId, actor: { email: access.actor.email }, clientRequestId: text(body.clientRequestId), decision: decision as "approved" | "rejected", playbackEvidence: body.playbackEvidence, note: typeof body.note === "string" ? body.note : null }), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return failure(error); }
}
