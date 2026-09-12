import { transcriptWorkSource } from "@/lib/server/transcript-work-source";
import { createHash } from "node:crypto";
import { TRANSCRIPT_TASK_MATERIALIZE_CAPABILITY_ID } from "@high-ground/quipsly-domain/governed-actions";
import { TRANSCRIPT_DERIVED_TASK_SCHEMA } from "@high-ground/quipsly-domain/transcript-derived-task";

import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import {
  readGovernedActionSourceReference,
  recordSucceededTranscriptWorkAction,
} from "@/lib/server/governed-action-runtime";
import { readTranscriptCorrectionDesk, TranscriptCorrectionError } from "@/lib/server/transcript-corrections";
import { editCanonicalTaskInTransaction } from "@/lib/server/canonical-task-edit";
import { planTranscriptTaskSave, readTranscriptTaskFields, readTranscriptTaskSave, readTranscriptTaskSaveState,
  sameTranscriptTaskFields } from "@/lib/server/transcript-task-save";

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
  const fields = readTranscriptTaskFields(input);
  const save = input.save === undefined ? null : readTranscriptTaskSave(input.save);
  if (!fields || (input.save !== undefined && !save)
      || (save?.revision === 0 && !sameTranscriptTaskFields(save.original, fields))) {
    return NextResponse.json({ ok: false, error: "Use a task title of 1–500 characters and details of up to 5,000 characters. The save revision must match its original draft." }, { status: 400 });
  }
  const { title, detail } = fields;
  if (!roomId || !segmentId || !clientRequestId || !expectedProviderTextSha256) {
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
      // Access, source identity, and the current
      // correction overlay are re-read inside the same transaction that creates
      // committed work. A stale client snapshot cannot sever the source anchor.
      const desk = await readTranscriptCorrectionDesk({ prisma: tx, roomId, actor, segmentId });
      const workSource = transcriptWorkSource(desk);
      if (!workSource) {
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
            || replay.roomId !== roomId
            || source.segmentId !== segmentId
            || source.providerTextSha256 !== expectedProviderTextSha256) {
          throw new TranscriptCorrectionError("That task request identity is already bound to different evidence.", 409, "IDEMPOTENCY_CONFLICT");
        }
        // Compare the original command, not the task's editable current state.
        // An exact retry must neither undo later edits nor silently discard new
        // wording from a client that reused its request ID after a lost reply.
        const savedIntent = record(source.materializationIntent);
        const original = readTranscriptTaskFields(Object.keys(savedIntent).length ? savedIntent : replay);
        if (!original || !sameTranscriptTaskFields(original, save?.original ?? fields)) {
          throw new TranscriptCorrectionError(
            "This task was already saved with different wording. Your new draft has not replaced it. Open the saved task to continue editing.",
            409,
            "IDEMPOTENCY_CONFLICT",
          );
        }
        if (save) {
          const previous = source.draftSave === undefined ? { revision: 0, fields: original }
            : readTranscriptTaskSaveState(source.draftSave);
          const plan = previous ? planTranscriptTaskSave({ previous, revision: save.revision, desired: fields,
            current: { title: replay.title, detail: replay.detail } }) : { kind: "conflict" as const };
          if (plan.kind === "conflict") {
            throw new TranscriptCorrectionError("This task changed elsewhere. Your writing is still here; open the saved task to compare the changes.", 409, "TASK_DRAFT_CONFLICT");
          }
          if (plan.kind === "amend") {
            const edit = await editCanonicalTaskInTransaction({ tx, taskId: id, actorUserId: actor.id,
              expectedUpdatedAt: replay.updatedAt, ...plan.fields, dueAt: replay.dueAt, dueIntent: null,
              surface: "ios-capture-transcript" });
            if (edit.kind !== "saved") {
              throw new TranscriptCorrectionError("This task changed or is no longer editable. Your writing is still here.", 409, "TASK_DRAFT_CONFLICT");
            }
            const edited = await tx.actionItem.findUnique({ where: { id } });
            if (!edited) throw new TranscriptCorrectionError("The saved task is unavailable. Your draft is still here.", 409, "TASK_DRAFT_CONFLICT");
            const saved = await tx.actionItem.updateMany({ where: { id, updatedAt: edited.updatedAt }, data: {
              sourceJson: { ...record(edited.sourceJson), draftSave: { revision: save.revision, fields } },
            } });
            if (saved.count !== 1) throw new TranscriptCorrectionError("This task changed while saving. Try again; your writing is still here.", 409, "TASK_DRAFT_CONFLICT");
            return { task: edited, idempotentReplay: false, governance: readGovernedActionSourceReference(source.governance) };
          }
        }
        return {
          task: replay,
          idempotentReplay: true,
          governance: readGovernedActionSourceReference(source.governance),
        };
      }

      const sourceSurface = text(input.surface, 80) || "quipsly-transcript-review";
      const workBoundaries = boundaries();
      const governance = await recordSucceededTranscriptWorkAction(tx, {
        capabilityId: TRANSCRIPT_TASK_MATERIALIZE_CAPABILITY_ID,
        clientRequestId,
        projectId: desk.projectId ?? null,
        roomId,
        actorUserId: actor.id,
        actorEmail: actor.email || "unknown@quipsly.invalid",
        sourceSurface,
        targetObjectType: "ActionItem",
        targetObjectId: id,
        payload: {
          contractKind: "quipsly-transcript-task-materialization-payload-v1",
          roomId,
          segmentId,
          expectedProviderTextSha256,
          title,
          detail,
          assignedUserId: actor.id,
        },
        sourceEvidence: {
          objectType: "TranscriptSegment",
          roomId,
          transcriptJobId: desk.transcriptJobId,
          segmentId,
          startSeconds: segment.startSeconds,
          endSeconds: segment.endSeconds,
          providerTextSha256: segment.providerTextSha256,
          acceptedCorrectionId: segment.acceptedCorrection?.id ?? null,
          recordingAssetId: workSource.recordingAssetId,
          playbackSourceId: workSource.playbackSourceId,
        },
        result: { targetObjectType: "ActionItem", targetObjectId: id, status: "OPEN" },
        boundaries: workBoundaries,
      });
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
            surface: sourceSurface,
            clientRequestId,
            materializationIntent: save?.original ?? fields,
            ...(save ? { draftSave: { revision: save.revision, fields } } : {}),
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
            speakerAuthority: segment.speakerAuthority,
            sourceBoundParticipantId: segment.sourceBoundParticipantId,
            acceptedCorrectionId: segment.acceptedCorrection?.id ?? null,
            recordingAssetId: workSource.recordingAssetId,
            playbackSourceId: workSource.playbackSourceId,
            governance,
            boundaries: workBoundaries,
          },
        },
      });
      return { task, idempotentReplay: false, governance };
    }, { isolationLevel: "Serializable" });
    return NextResponse.json({
      ok: true,
      idempotentReplay: result.idempotentReplay,
      governance: result.governance,
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
