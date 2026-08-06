import { NextRequest, NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { AudibleEventReviewError, registerAudibleEventAnalysis } from "@/lib/server/audible-event-review";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";
import { authorizeStudioMediaSource } from "@/lib/server/studio-media-source-access";

export const runtime = "nodejs";

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const projectSlug = text(body.projectSlug);
    const assetId = text(body.assetId);
    const sourceId = text(body.sourceId);
    if (!projectSlug || !assetId || !sourceId || text(body.action) !== "register-source-bound-analysis") {
      return NextResponse.json({ ok: false, error: "Exact source coordinates and register-source-bound-analysis are required." }, { status: 400 });
    }
    const prisma = getPrismaClient();
    const access = await resolveEpisodeProductionAccess({ request, projectSlug, action: "write", prisma });
    if (!access.allowed) return NextResponse.json({ ok: false, code: access.code, error: access.error }, { status: access.status });
    if (!access.actor.isStaff) return NextResponse.json({ ok: false, code: "audible-event-analysis-staff-required", error: "Trusted detector registration requires a staff operator." }, { status: 403 });
    const sourceAccess = await authorizeStudioMediaSource({ prisma, actor: { id: access.actor.id, email: access.actor.email, isStaff: true }, sourceId });
    if (!sourceAccess.allowed) return NextResponse.json({ ok: false, code: sourceAccess.errorCode || "audible-event-source-held", error: sourceAccess.error }, { status: sourceAccess.status });
    return NextResponse.json(await registerAudibleEventAnalysis({ prisma, projectSlug, assetId, sourceId, analysis: body.analysis }), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AudibleEventReviewError) return NextResponse.json({ ok: false, code: error.code, error: error.message }, { status: error.status });
    console.error("Unable to register source-bound audible-event analysis.", error);
    return NextResponse.json({ ok: false, error: "Unable to register source-bound audible-event analysis." }, { status: 500 });
  }
}
