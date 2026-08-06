import { NextRequest, NextResponse } from "next/server";

import type { DialogueRepairLabel, DialogueRepairReviewReceipt } from "@high-ground/quipsly-media-processing";

import { getPrismaClient } from "@/lib/prisma";
import { appendDialogueRepairReview, createDialogueRepairCandidate, DialogueRepairError, queueDialogueRepairExperiment, readDialogueRepairStatus, reconcileDialogueRepairExperiment } from "@/lib/server/dialogue-repair";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";
import { authorizeStudioMediaSource } from "@/lib/server/studio-media-source-access";

export const runtime = "nodejs";

const LABELS = new Set<DialogueRepairLabel>(["mouth-click", "plosive", "sibilance", "breath", "clipping", "noise-event"]);

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function coordinates(value: Record<string, unknown>) {
  const projectSlug = text(value.projectSlug);
  const assetId = text(value.assetId);
  const sourceId = text(value.sourceId);
  return projectSlug && assetId && sourceId ? { projectSlug, assetId, sourceId } : null;
}

export async function GET(request: NextRequest) {
  try {
    const input = coordinates({ projectSlug: request.nextUrl.searchParams.get("projectSlug"), assetId: request.nextUrl.searchParams.get("assetId"), sourceId: request.nextUrl.searchParams.get("sourceId") });
    if (!input) return NextResponse.json({ ok: false, error: "projectSlug, assetId, and sourceId are required." }, { status: 400 });
    const prisma = getPrismaClient();
    const access = await resolveEpisodeProductionAccess({ request, projectSlug: input.projectSlug, action: "read", prisma });
    if (!access.allowed) return NextResponse.json({ ok: false, code: access.code, error: access.error }, { status: access.status });
    const sourceAccess = await authorizeStudioMediaSource({ prisma, actor: { id: access.actor.id, email: access.actor.email, isStaff: access.actor.isStaff }, sourceId: input.sourceId });
    if (!sourceAccess.allowed) return NextResponse.json({ ok: false, code: sourceAccess.errorCode || "dialogue-repair-source-held", error: sourceAccess.error }, { status: sourceAccess.status });
    return NextResponse.json({ ok: true, ...await readDialogueRepairStatus({ prisma, ...input }) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return failure(error, "Unable to read Dialogue Repair evidence.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const input = coordinates(body);
    const action = text(body.action);
    if (!input || !["create-candidate", "review-candidate", "queue-experiment", "reconcile-experiment"].includes(action)) return NextResponse.json({ ok: false, error: "Exact source coordinates and a supported Dialogue Repair action are required." }, { status: 400 });
    const prisma = getPrismaClient();
    const access = await resolveEpisodeProductionAccess({ request, projectSlug: input.projectSlug, action: "write", prisma });
    if (!access.allowed) return NextResponse.json({ ok: false, code: access.code, error: access.error }, { status: access.status });
    const sourceAccess = await authorizeStudioMediaSource({ prisma, actor: { id: access.actor.id, email: access.actor.email, isStaff: access.actor.isStaff }, sourceId: input.sourceId });
    if (!sourceAccess.allowed) return NextResponse.json({ ok: false, code: sourceAccess.errorCode || "dialogue-repair-source-held", error: sourceAccess.error }, { status: sourceAccess.status });
    const actor = { id: access.actor.id, email: access.actor.email };
    if (action === "create-candidate") {
      const label = text(body.label) as DialogueRepairLabel;
      if (!LABELS.has(label)) return NextResponse.json({ ok: false, error: "A supported dialogue-event label is required." }, { status: 400 });
      const result = await createDialogueRepairCandidate({ prisma, ...input, actor, clientRequestId: text(body.clientRequestId), label, startSeconds: Number(body.startSeconds), endSeconds: Number(body.endSeconds), auditionPreRollSeconds: body.auditionPreRollSeconds === undefined ? undefined : Number(body.auditionPreRollSeconds), auditionPostRollSeconds: body.auditionPostRollSeconds === undefined ? undefined : Number(body.auditionPostRollSeconds) });
      return NextResponse.json(result, { status: result.idempotentReplay ? 200 : 201, headers: { "Cache-Control": "private, no-store" } });
    }
    if (action === "queue-experiment") {
      const result = await queueDialogueRepairExperiment({ prisma, ...input, actor, candidateId: text(body.candidateId) });
      return NextResponse.json(result, { status: result.experiment.status === "completed" ? 200 : 202, headers: { "Cache-Control": "private, no-store" } });
    }
    if (action === "reconcile-experiment") {
      const result = await reconcileDialogueRepairExperiment({ prisma, ...input, candidateId: text(body.candidateId), jobId: text(body.jobId) });
      return NextResponse.json(result, { status: result.experiment.status === "completed" ? 200 : 202, headers: { "Cache-Control": "private, no-store" } });
    }
    const decision = text(body.decision) as DialogueRepairReviewReceipt["decision"];
    if (decision !== "confirmed" && decision !== "false-positive" && decision !== "needs-comparison") return NextResponse.json({ ok: false, error: "A supported dialogue review decision is required." }, { status: 400 });
    const result = await appendDialogueRepairReview({ prisma, ...input, actor, candidateId: text(body.candidateId), clientRequestId: text(body.clientRequestId), decision, playbackEvidence: body.playbackEvidence, note: typeof body.note === "string" ? body.note : null });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return failure(error, "Unable to operate Dialogue Repair.");
  }
}

function failure(error: unknown, fallback: string) {
  if (error instanceof DialogueRepairError) return NextResponse.json({ ok: false, code: error.code, error: error.message }, { status: error.status });
  console.error("[dialogue repair] operation failed", error);
  return NextResponse.json({ ok: false, code: "DIALOGUE_REPAIR_FAILED", error: fallback }, { status: 500 });
}
