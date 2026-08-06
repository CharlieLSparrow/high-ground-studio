import { NextRequest, NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";
import { authorizeStudioMediaSource } from "@/lib/server/studio-media-source-access";
import { appendAudioMasterReview, AudioMasteryReviewError } from "@/lib/server/audio-mastery-review";

export const runtime = "nodejs";

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const projectId = text(body.projectId);
    const projectSlug = text(body.projectSlug);
    const assetId = text(body.assetId);
    const sourceId = text(body.sourceId);
    const jobId = text(body.jobId);
    const decision = text(body.decision);
    if (!projectSlug || !assetId || !sourceId || !jobId || !["approved", "rejected"].includes(decision)) {
      return NextResponse.json({ ok: false, error: "Exact source coordinates, mastery job, and a supported decision are required." }, { status: 400 });
    }
    const prisma = getPrismaClient();
    const access = await resolveEpisodeProductionAccess({ request, ...(projectId ? { projectId } : {}), projectSlug, action: "write", prisma });
    if (!access.allowed) return NextResponse.json({ ok: false, code: access.code, error: access.error }, { status: access.status });
    const sourceAccess = await authorizeStudioMediaSource({ prisma, actor: { id: access.actor.id, email: access.actor.email, isStaff: access.actor.isStaff }, sourceId });
    if (!sourceAccess.allowed) return NextResponse.json({ ok: false, code: sourceAccess.errorCode || "audio-mastery-review-source-held", error: sourceAccess.error }, { status: sourceAccess.status });
    const result = await appendAudioMasterReview({
      prisma,
      actor: { id: access.actor.id, email: access.actor.email },
      projectSlug,
      assetId,
      sourceId,
      jobId,
      clientRequestId: text(body.clientRequestId),
      decision: decision as "approved" | "rejected",
      playbackEvidence: body.playbackEvidence,
      note: typeof body.note === "string" ? body.note : null,
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AudioMasteryReviewError) return NextResponse.json({ ok: false, code: error.code, error: error.message }, { status: error.status });
    console.error("[audio mastery review] failed", error);
    return NextResponse.json({ ok: false, code: "AUDIO_MASTER_REVIEW_FAILED", error: "Unable to record the mastering decision." }, { status: 500 });
  }
}
