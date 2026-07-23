import { createHash } from "node:crypto";
import { TRANSCRIPT_DERIVED_TASK_SCHEMA } from "@high-ground/quipsly-domain/transcript-derived-task";

import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { readTranscriptCorrectionDesk, TranscriptCorrectionError } from "@/lib/server/transcript-corrections";

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

function taskIdentity(userId: string, clientRequestId: string) {
  return `transcript-task-${createHash("sha256").update(`${userId}|${clientRequestId}`).digest("hex").slice(0, 24)}`;
}

function boundaries() {
  return {
    explicitHumanAction: true,
    sourceAnchorPreserved: true,
    providerTranscriptMutated: false,
    correctionOverlayMutated: false,
    recordingMutated: false,
    deadlineCreated: false,
    reminderCreated: false,
    calendarMutated: false,
    externalDelivery: false,
    publication: false,
  };
}

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Sign in before creating work from a transcript." }, { status: 401 });
  }
  const input = await body(request);
  const roomId = text(input.roomId, 200);
  const segmentId = text(input.segmentId, 200);
  const clientRequestId = text(input.clientRequestId, 160);
  const expectedProviderTextSha256 = text(input.expectedProviderTextSha256, 64).toLowerCase();
  const title = text(input.title, 240);
  const detail = text(input.detail, 2_000) || null;
  if (!roomId || !segmentId || !clientRequestId || !expectedProviderTextSha256 || !title) {
    return NextResponse.json({ ok: false, error: "Room, segment, provider evidence, request identity, and task title are required." }, { status: 400 });
  }

  const prisma = getPrismaClient() as any;
  const actor = {
    id: session.user.id,
    email: session.user.primaryEmail || session.user.email,
    isStaff: session.user.isStaff === true,
  };
  const id = taskIdentity(actor.id, clientRequestId);
  try {
    const result = await prisma.$transaction(async (tx: any) => {
      // Access, consent/release evidence, playback promotion, and the current
      // correction overlay are re-read inside the same transaction that creates
      // committed work. A stale client snapshot cannot sever the source anchor.
      const desk = await readTranscriptCorrectionDesk({ prisma: tx, roomId, actor });
      if (!desk.gate.allowed || !desk.playback) {
        throw new TranscriptCorrectionError(
          desk.gate.error || "Released recording-backed transcript evidence is required.",
          409,
          "TRANSCRIPT_TASK_EVIDENCE_HELD",
        );
      }
      const segment = desk.segments.find((candidate: any) => candidate.id === segmentId);
      if (!segment) throw new TranscriptCorrectionError("The transcript segment changed or is unavailable.", 409, "STALE_TRANSCRIPT_SEGMENT");
      if (segment.providerTextSha256 !== expectedProviderTextSha256) {
        throw new TranscriptCorrectionError("Provider transcript evidence changed. Refresh before creating the task.", 409, "STALE_PROVIDER_EVIDENCE");
      }

      const replay = await tx.actionItem.findUnique({ where: { id } });
      if (replay) {
        const source = record(replay.sourceJson);
        if (source.schema !== TRANSCRIPT_DERIVED_TASK_SCHEMA
            || source.clientRequestId !== clientRequestId
            || source.createdByUserId !== actor.id
            || replay.roomId !== roomId) {
          throw new TranscriptCorrectionError("That task request identity is already bound to different evidence.", 409, "IDEMPOTENCY_CONFLICT");
        }
        return { task: replay, idempotentReplay: true };
      }

      const task = await tx.actionItem.create({
        data: {
          id,
          roomId,
          projectId: desk.projectId ?? null,
          assignedUserId: actor.id,
          title,
          detail,
          status: "OPEN",
          sourceJson: {
            schema: TRANSCRIPT_DERIVED_TASK_SCHEMA,
            surface: text(input.surface, 80) || "quipsly-transcript-review",
            clientRequestId,
            explicitHumanAction: true,
            createdByUserId: actor.id,
            createdAt: new Date().toISOString(),
            roomId,
            transcriptJobId: desk.transcriptJobId,
            segmentId,
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
            boundaries: boundaries(),
          },
        },
      });
      return { task, idempotentReplay: false };
    });
    return NextResponse.json({
      ok: true,
      idempotentReplay: result.idempotentReplay,
      task: {
        id: result.task.id,
        title: result.task.title,
        detail: result.task.detail,
        status: result.task.status,
        roomId: result.task.roomId,
        assignedUserId: result.task.assignedUserId,
        createdAt: result.task.createdAt instanceof Date ? result.task.createdAt.toISOString() : result.task.createdAt,
      },
      boundaries: boundaries(),
    });
  } catch (error) {
    if (error instanceof TranscriptCorrectionError) {
      return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: error.status });
    }
    console.error("[transcript-task] explicit task creation failed", error);
    return NextResponse.json({ ok: false, error: "Quipsly could not create this task. No external action was taken." }, { status: 503 });
  }
}
