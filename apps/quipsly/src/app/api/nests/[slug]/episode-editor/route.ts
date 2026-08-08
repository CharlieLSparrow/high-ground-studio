import { NextRequest, NextResponse } from "next/server";
import { PROGRAM_DECISION_KINDS, type ProgramDecisionKind } from "@/lib/editor/program-edit-contract";
import { episodeRenderProfile } from "@high-ground/quipsly-media-processing";
import {
  EpisodeEditConflict,
  ensureEpisodeEditBranch,
  loadEpisodeEditDesk,
  saveProgramDecision,
  saveTimelineAnnotation,
  type EditActor,
} from "@/lib/server/episode-edit-store";
import { requireProjectAccess } from "@/lib/server/access";
import { getPrismaClient } from "@/lib/prisma";
import {
  EpisodeRenderProofError,
  planEpisodeRenderProof,
  queueEpisodeRenderProof,
  registerEpisodeRenderProof,
} from "@/lib/server/episode-render-proof";
import {
  EpisodeProgramRenderError,
  planEpisodeProgramRender,
  queueEpisodeProgramRender,
  registerEpisodeProgramRender,
} from "@/lib/server/episode-program-render";
import {
  appendEpisodeProgramReview,
  EpisodeProgramReviewError,
  readAuthorizedEpisodeProgramReviewSummary,
} from "@/lib/server/episode-program-review";
import {
  EpisodeMasterConformError,
  planEpisodeMasterConform,
  queueEpisodeMasterConform,
  registerEpisodeMasterConform,
} from "@/lib/server/episode-master-conform";

export const dynamic = "force-dynamic";

function requestedRenderProfile(value: unknown) {
  try {
    return episodeRenderProfile(value ?? "proof-10s").id;
  } catch {
    throw new EpisodeRenderProofError("Choose a supported Episode render profile.", 400, "EPISODE_RENDER_PROFILE_INVALID");
  }
}

function actorFromAccess(access: Awaited<ReturnType<typeof requireProjectAccess>>): EditActor {
  const user = access.user as { id?: string; primaryEmail?: string; displayName?: string | null };
  return {
    userId: user.id,
    email: user.primaryEmail,
    label: user.displayName ?? user.primaryEmail,
    type: "human",
  };
}

async function canWrite(projectSlug: string): Promise<boolean> {
  try {
    await requireProjectAccess(projectSlug, "write");
    return true;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  await requireProjectAccess(slug, "read");
  const episode = request.nextUrl.searchParams.get("episode") ?? undefined;
  const sourceMediaAssetId = request.nextUrl.searchParams.get("source");
  const payload = await loadEpisodeEditDesk(slug, episode, await canWrite(slug), {
    selectedMediaAssetId: sourceMediaAssetId,
  });
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const access = await requireProjectAccess(slug, "write");
  const actor = actorFromAccess(access);
  const body = await request.json() as Record<string, unknown>;
  const action = String(body.action ?? "");
  const episodeSlug = String(body.episodeSlug ?? "");
  const selectedMediaAssetId = typeof body.selectedMediaAssetId === "string"
    ? body.selectedMediaAssetId
    : null;
  if (!episodeSlug) return NextResponse.json({ error: "Choose an episode first." }, { status: 400 });

  try {
    let operationResult: unknown = null;
    if (action === "open-episode") {
      await ensureEpisodeEditBranch(slug, episodeSlug, actor);
    } else if (action === "set-decision") {
      const kind = String(body.kind ?? "") as ProgramDecisionKind;
      if (!PROGRAM_DECISION_KINDS.includes(kind)) {
        return NextResponse.json({ error: "Unknown edit decision." }, { status: 400 });
      }
      await saveProgramDecision({
        projectSlug: slug,
        episodeSlug,
        kind,
        sequenceTime: Number(body.sequenceTime ?? 0),
        expectedRevision: Number(body.expectedRevision ?? 0),
        clientRequestId: String(body.clientRequestId ?? crypto.randomUUID()),
        actor,
      });
    } else if (action === "add-annotation") {
      await saveTimelineAnnotation({
        projectSlug: slug,
        episodeSlug,
        sequenceTime: Number(body.sequenceTime ?? 0),
        expectedRevision: Number(body.expectedRevision ?? 0),
        clientRequestId: String(body.clientRequestId ?? crypto.randomUUID()),
        kind: String(body.kind ?? "note"),
        body: String(body.body ?? ""),
        tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
        actor,
      });
    } else if (action === "plan-render-proof") {
      if (!actor.email) return NextResponse.json({ error: "A verified account email is required to inspect render options." }, { status: 400 });
      operationResult = await planEpisodeRenderProof({
        prisma: getPrismaClient(),
        projectSlug: slug,
        episodeSlug,
        sequenceStartSeconds: Number(body.sequenceTime ?? 0),
        expectedRevision: Number(body.expectedRevision ?? 0),
        renderProfile: requestedRenderProfile(body.renderProfile),
        executorNodeId:
          typeof body.executorNodeId === "string" ? body.executorNodeId : null,
        actor: { ...actor, email: actor.email },
      });
    } else if (action === "queue-render-proof") {
      if (!actor.email) return NextResponse.json({ error: "A verified account email is required to queue a proof." }, { status: 400 });
      operationResult = await queueEpisodeRenderProof({
        prisma: getPrismaClient(),
        projectSlug: slug,
        episodeSlug,
        sequenceStartSeconds: Number(body.sequenceTime ?? 0),
        expectedRevision: Number(body.expectedRevision ?? 0),
        clientRequestId: String(body.clientRequestId ?? crypto.randomUUID()),
        renderProfile: requestedRenderProfile(body.renderProfile),
        executorNodeId:
          typeof body.executorNodeId === "string" ? body.executorNodeId : null,
        actor: { ...actor, email: actor.email },
      });
    } else if (action === "register-render-proof") {
      if (!actor.email) return NextResponse.json({ error: "A verified account email is required to verify a proof." }, { status: 400 });
      operationResult = await registerEpisodeRenderProof({
        prisma: getPrismaClient(),
        projectSlug: slug,
        episodeSlug,
        jobId: String(body.jobId ?? ""),
        actor: { ...actor, email: actor.email },
      });
    } else if (action === "plan-program-render") {
      if (!actor.email) return NextResponse.json({ error: "A verified account email is required to inspect full-program readiness." }, { status: 400 });
      operationResult = await planEpisodeProgramRender({
        prisma: getPrismaClient(),
        projectSlug: slug,
        episodeSlug,
        expectedRevision: Number(body.expectedRevision ?? 0),
        executorNodeId:
          typeof body.executorNodeId === "string" ? body.executorNodeId : null,
        actor: { ...actor, email: actor.email },
      });
    } else if (action === "queue-program-render") {
      if (!actor.email) return NextResponse.json({ error: "A verified account email is required to queue a full-program review." }, { status: 400 });
      operationResult = await queueEpisodeProgramRender({
        prisma: getPrismaClient(),
        projectSlug: slug,
        episodeSlug,
        expectedRevision: Number(body.expectedRevision ?? 0),
        clientRequestId: String(body.clientRequestId ?? crypto.randomUUID()),
        executorNodeId:
          typeof body.executorNodeId === "string" ? body.executorNodeId : null,
        actor: { ...actor, email: actor.email },
      });
    } else if (action === "register-program-render") {
      if (!actor.email) return NextResponse.json({ error: "A verified account email is required to verify a full-program review." }, { status: 400 });
      operationResult = await registerEpisodeProgramRender({
        prisma: getPrismaClient(),
        projectSlug: slug,
        episodeSlug,
        jobId: String(body.jobId ?? ""),
        actor: { ...actor, email: actor.email },
      });
    } else if (action === "read-program-review") {
      operationResult = await readAuthorizedEpisodeProgramReviewSummary({
        prisma: getPrismaClient(),
        projectSlug: slug,
        episodeSlug,
        jobId: String(body.jobId ?? ""),
      });
    } else if (action === "review-program-render") {
      if (!actor.email) return NextResponse.json({ error: "A verified account email is required to review a full program." }, { status: 400 });
      if (body.decision !== "approved" && body.decision !== "rejected") {
        return NextResponse.json({ error: "Choose approve or request changes." }, { status: 400 });
      }
      operationResult = await appendEpisodeProgramReview({
        prisma: getPrismaClient(),
        projectSlug: slug,
        episodeSlug,
        jobId: String(body.jobId ?? ""),
        actor: { userId: actor.userId, email: actor.email },
        clientRequestId: String(body.clientRequestId ?? crypto.randomUUID()),
        decision: body.decision,
        playbackEvidence: body.playbackEvidence,
        note: typeof body.note === "string" ? body.note : null,
      });
    } else if (action === "plan-master-conform") {
      operationResult = await planEpisodeMasterConform({
        prisma: getPrismaClient(),
        projectSlug: slug,
        episodeSlug,
        reviewJobId: String(body.jobId ?? ""),
        approvalReceiptId: String(body.approvalReceiptId ?? ""),
      });
    } else if (action === "queue-master-conform") {
      if (!actor.email) return NextResponse.json({ error: "A verified account email is required to queue a master conform." }, { status: 400 });
      operationResult = await queueEpisodeMasterConform({
        prisma: getPrismaClient(),
        projectSlug: slug,
        episodeSlug,
        reviewJobId: String(body.jobId ?? ""),
        approvalReceiptId: String(body.approvalReceiptId ?? ""),
        clientRequestId: String(body.clientRequestId ?? crypto.randomUUID()),
        actor: { email: actor.email },
      });
    } else if (action === "register-master-conform") {
      if (!actor.email) return NextResponse.json({ error: "A verified account email is required to verify a master candidate." }, { status: 400 });
      operationResult = await registerEpisodeMasterConform({
        prisma: getPrismaClient(),
        projectSlug: slug,
        episodeSlug,
        jobId: String(body.jobId ?? ""),
        actor: { email: actor.email },
      });
    } else {
      return NextResponse.json({ error: "Unknown editor action." }, { status: 400 });
    }
    return NextResponse.json({ ...await loadEpisodeEditDesk(slug, episodeSlug, true, {
      includeInspection: action === "open-episode"
        || action === "plan-render-proof"
        || action === "queue-render-proof"
        || action === "register-render-proof"
        || action === "plan-program-render"
        || action === "queue-program-render"
        || action === "register-program-render"
        || action === "read-program-review"
        || action === "review-program-render"
        || action === "plan-master-conform"
        || action === "queue-master-conform"
        || action === "register-master-conform",
      selectedMediaAssetId,
    }), operationResult }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof EpisodeRenderProofError) {
      return NextResponse.json({ error: error.message, errorCode: error.code }, { status: error.status });
    }
    if (error instanceof EpisodeProgramRenderError) {
      return NextResponse.json({ error: error.message, errorCode: error.code }, { status: error.status });
    }
    if (error instanceof EpisodeProgramReviewError) {
      return NextResponse.json({ error: error.message, errorCode: error.code }, { status: error.status });
    }
    if (error instanceof EpisodeMasterConformError) {
      return NextResponse.json({ error: error.message, errorCode: error.code }, { status: error.status });
    }
    if (error instanceof EpisodeEditConflict) {
      return NextResponse.json({
        error: "Another editor saved a newer change. The shared edit has been refreshed.",
        currentRevision: error.currentRevision,
        payload: await loadEpisodeEditDesk(slug, episodeSlug, true, {
          includeInspection: false,
          selectedMediaAssetId,
        }),
      }, { status: 409 });
    }
    throw error;
  }
}
