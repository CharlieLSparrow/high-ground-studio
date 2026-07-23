import { createHash } from "node:crypto";
import { TRANSCRIPT_DERIVED_GOAL_SCHEMA } from "@high-ground/quipsly-domain/transcript-derived-task";
import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { readTranscriptCorrectionDesk, TranscriptCorrectionError } from "@/lib/server/transcript-corrections";

// Kept outside route.ts so transaction helpers remain directly testable.
export const dynamic = "force-dynamic";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function body(request: Request) {
  try { return record(await request.json()); } catch { return {}; }
}

function goalIdentity(userId: string, clientRequestId: string) {
  return `transcript-goal-${createHash("sha256").update(`${userId}|${clientRequestId}`).digest("hex").slice(0, 24)}`;
}

export function transcriptDerivedGoalBoundaries() {
  return {
    explicitHumanAction: true,
    sourceAnchorPreserved: true,
    providerTranscriptMutated: false,
    correctionOverlayMutated: false,
    recordingMutated: false,
    taskCreated: false,
    targetDateCreated: false,
    reminderCreated: false,
    calendarMutated: false,
    externalDelivery: false,
    publication: false,
  };
}

export async function createTranscriptDerivedGoalInTransaction(input: {
  tx: any;
  actor: { id: string; email?: string | null; isStaff: boolean };
  goal: {
    roomId: string;
    segmentId: string;
    clientRequestId: string;
    expectedProviderTextSha256: string;
    title: string;
    description: string | null;
    surface: string;
  };
}) {
  const { tx, actor, goal: request } = input;
  const id = goalIdentity(actor.id, request.clientRequestId);
  const desk = await readTranscriptCorrectionDesk({ prisma: tx, roomId: request.roomId, actor });
  if (!desk.gate.allowed || !desk.playback) {
    throw new TranscriptCorrectionError(desk.gate.error || "Released recording-backed transcript evidence is required.", 409, "TRANSCRIPT_GOAL_EVIDENCE_HELD");
  }
  const segment = desk.segments.find((candidate: any) => candidate.id === request.segmentId);
  if (!segment) throw new TranscriptCorrectionError("The transcript segment changed or is unavailable.", 409, "STALE_TRANSCRIPT_SEGMENT");
  if (segment.providerTextSha256 !== request.expectedProviderTextSha256) {
    throw new TranscriptCorrectionError("Provider transcript evidence changed. Refresh before creating the goal.", 409, "STALE_PROVIDER_EVIDENCE");
  }

  const replay = await tx.goal.findUnique({ where: { id } });
  if (replay) {
    const source = record(replay.sourceJson);
    if (source.schema !== TRANSCRIPT_DERIVED_GOAL_SCHEMA
        || source.clientRequestId !== request.clientRequestId
        || source.createdByUserId !== actor.id
        || replay.roomId !== request.roomId) {
      throw new TranscriptCorrectionError("That goal request identity is already bound to different evidence.", 409, "IDEMPOTENCY_CONFLICT");
    }
    return { goal: replay, idempotentReplay: true };
  }

  const createdAt = new Date().toISOString();
  const goal = await tx.goal.create({
    data: {
      id,
      ownerUserId: actor.id,
      roomId: request.roomId,
      projectId: desk.projectId ?? null,
      title: request.title,
      description: request.description,
      status: "ACTIVE",
      sourceJson: {
        schema: TRANSCRIPT_DERIVED_GOAL_SCHEMA,
        surface: request.surface,
        clientRequestId: request.clientRequestId,
        explicitHumanAction: true,
        createdByUserId: actor.id,
        createdAt,
        roomId: request.roomId,
        transcriptJobId: desk.transcriptJobId,
        segmentId: request.segmentId,
        startSeconds: segment.startSeconds,
        endSeconds: segment.endSeconds,
        providerText: segment.providerText,
        providerTextSha256: segment.providerTextSha256,
        providerSpeakerLabel: segment.providerSpeakerLabel,
        effectiveTextSnapshot: segment.text,
        effectiveSpeakerLabelSnapshot: segment.speakerLabel,
        acceptedCorrectionId: segment.acceptedCorrection?.id ?? null,
        recordingAssetId: desk.playback.recordingAssetId,
        playbackSourceId: desk.playback.sourceId,
        boundaries: transcriptDerivedGoalBoundaries(),
      },
    },
  });
  return { goal, idempotentReplay: false };
}

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Sign in before creating a goal from a transcript." }, { status: 401 });
  }
  const input = await body(request);
  const roomId = text(input.roomId, 200);
  const segmentId = text(input.segmentId, 200);
  const clientRequestId = text(input.clientRequestId, 160);
  const expectedProviderTextSha256 = text(input.expectedProviderTextSha256, 64).toLowerCase();
  const title = text(input.title, 240);
  const description = text(input.description, 5_000) || null;
  if (!roomId || !segmentId || !clientRequestId || !expectedProviderTextSha256 || !title) {
    return NextResponse.json({ ok: false, error: "Room, segment, provider evidence, request identity, and goal title are required." }, { status: 400 });
  }

  const prisma = getPrismaClient() as any;
  const actor = { id: session.user.id, email: session.user.primaryEmail || session.user.email, isStaff: session.user.isStaff === true };
  try {
    const result = await prisma.$transaction((tx: any) => createTranscriptDerivedGoalInTransaction({
      tx,
      actor,
      goal: {
        roomId,
        segmentId,
        clientRequestId,
        expectedProviderTextSha256,
        title,
        description,
        surface: text(input.surface, 80) || "quipsly-transcript-review",
      },
    }));
    return NextResponse.json({
      ok: true,
      idempotentReplay: result.idempotentReplay,
      goal: {
        id: result.goal.id,
        title: result.goal.title,
        description: result.goal.description,
        status: result.goal.status,
        roomId: result.goal.roomId,
        ownerUserId: result.goal.ownerUserId,
        createdAt: result.goal.createdAt instanceof Date ? result.goal.createdAt.toISOString() : result.goal.createdAt,
      },
      boundaries: transcriptDerivedGoalBoundaries(),
    });
  } catch (error) {
    if (error instanceof TranscriptCorrectionError) {
      return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: error.status });
    }
    console.error("[transcript-goal] explicit goal creation failed", error);
    return NextResponse.json({ ok: false, error: "Quipsly could not create this goal. No external action was taken." }, { status: 503 });
  }
}
