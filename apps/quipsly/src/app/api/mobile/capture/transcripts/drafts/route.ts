import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { readTranscriptCorrectionDesk, TranscriptCorrectionError } from "@/lib/server/transcript-corrections";

export const dynamic = "force-dynamic";

const TRANSCRIPT_DRAFT_OPERATION = "create-draft-from-transcript-segment";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function body(request: Request) {
  try { return record(await request.json()); } catch { return {}; }
}

function identity(userId: string, clientRequestId: string) {
  return createHash("sha256").update(`${userId}|${clientRequestId}`).digest("hex").slice(0, 32);
}

function boundaries() {
  return {
    explicitHumanAction: true,
    sourceAnchorPreserved: true,
    providerTranscriptMutated: false,
    correctionOverlayMutated: false,
    recordingMutated: false,
    taskCreated: false,
    goalCreated: false,
    calendarMutated: false,
    externalDelivery: false,
    publication: false,
  };
}

function sourcePath(roomId: string, segmentId: string) {
  return `/sessions/${encodeURIComponent(roomId)}#transcript-segment-${encodeURIComponent(segmentId)}`;
}

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Sign in before starting a draft from transcript evidence." }, { status: 401 });
  }

  const input = await body(request);
  const roomId = text(input.roomId, 200);
  const segmentId = text(input.segmentId, 200);
  const clientRequestId = text(input.clientRequestId, 160);
  const expectedProviderTextSha256 = text(input.expectedProviderTextSha256, 64).toLowerCase();
  const requestedTitle = text(input.title, 180);
  const openingNote = text(input.openingNote, 10_000);
  if (!roomId || !segmentId || !clientRequestId || !expectedProviderTextSha256) {
    return NextResponse.json({ ok: false, error: "Room, segment, provider evidence, and request identity are required." }, { status: 400 });
  }

  const prisma = getPrismaClient() as any;
  const actor = {
    id: session.user.id,
    email: session.user.primaryEmail || session.user.email,
    isStaff: session.user.isStaff === true,
  };
  const requestIdentity = identity(actor.id, clientRequestId);
  const documentStableId = `transcript-draft-${requestIdentity}`;
  const exactSourcePath = sourcePath(roomId, segmentId);

  try {
    const result = await prisma.$transaction(async (tx: any) => {
      const desk = await readTranscriptCorrectionDesk({ prisma: tx, roomId, actor });
      if (!desk.gate.allowed || !desk.playback || !desk.projectId) {
        throw new TranscriptCorrectionError(
          desk.gate.error || "Released recording-backed transcript evidence in a writable Nest is required.",
          409,
          "TRANSCRIPT_DRAFT_EVIDENCE_HELD",
        );
      }
      const project = await tx.studioProject.findUnique({ where: { id: desk.projectId }, select: { slug: true } });
      if (!project?.slug) throw new TranscriptCorrectionError("The transcript's writable Nest is unavailable.", 409, "TRANSCRIPT_DRAFT_PROJECT_HELD");
      const segment = desk.segments.find((candidate: any) => candidate.id === segmentId);
      if (!segment) throw new TranscriptCorrectionError("The transcript segment changed or is unavailable.", 409, "STALE_TRANSCRIPT_SEGMENT");
      if (segment.providerTextSha256 !== expectedProviderTextSha256) {
        throw new TranscriptCorrectionError("Provider transcript evidence changed. Refresh before starting the draft.", 409, "STALE_PROVIDER_EVIDENCE");
      }

      const replay = await tx.studioDocument.findUnique({
        where: { stableId: documentStableId },
        select: { id: true, projectId: true, personalOwnerUserId: true, title: true, sourcePath: true, blocks: { orderBy: { order: "asc" }, select: { id: true, order: true } } },
      });
      if (replay) {
        const operation = await tx.studioDocumentOperation.findFirst({
          where: { documentId: replay.id, operationType: TRANSCRIPT_DRAFT_OPERATION },
          select: { payloadJson: true },
        });
        const payload = record(operation?.payloadJson);
        if (replay.projectId !== desk.projectId
            || replay.personalOwnerUserId !== actor.id
            || replay.sourcePath !== exactSourcePath
            || payload.clientRequestId !== clientRequestId
            || payload.roomId !== roomId
            || payload.segmentId !== segmentId
            || payload.createdByUserId !== actor.id) {
          throw new TranscriptCorrectionError("That draft request identity is already bound to different evidence.", 409, "IDEMPOTENCY_CONFLICT");
        }
        const draftBlock = replay.blocks.find((block: any) => block.order === 1) ?? replay.blocks[0];
        return { document: replay, projectSlug: project.slug, draftBlockId: draftBlock?.id ?? null, idempotentReplay: true };
      }

      const timestamp = `${Math.floor(segment.startSeconds / 60)}:${String(Math.floor(segment.startSeconds % 60)).padStart(2, "0")}–${Math.floor(segment.endSeconds / 60)}:${String(Math.floor(segment.endSeconds % 60)).padStart(2, "0")}`;
      const speaker = segment.speakerLabel || segment.providerSpeakerLabel || "Speaker";
      const title = requestedTitle || `Draft — ${segment.text}`.slice(0, 180);
      const sourceBody = [
        `Source moment · ${timestamp} · ${speaker}`,
        `> ${segment.text}`,
        `Recording-backed transcript evidence: ${exactSourcePath}`,
      ].join("\n\n");
      const draftBody = openingNote || "Start writing from this exact source moment. The transcript and recording remain unchanged.";
      const document = await tx.studioDocument.create({
        data: {
          projectId: desk.projectId,
          personalOwnerUserId: actor.id,
          stableId: documentStableId,
          title,
          sourceLabel: `Session transcript · ${timestamp}`,
          sourcePath: exactSourcePath,
          projectionStatus: "draft",
          isPrivate: true,
          blocks: {
            create: [
              {
                stableId: `transcript-evidence-${requestIdentity}`,
                order: 0,
                title: "Source moment",
                body: sourceBody,
                sourceLabel: `Transcript · ${timestamp} · ${speaker}`,
                sourcePath: exactSourcePath,
                externalId: `transcript:${desk.transcriptJobId}:${segmentId}`,
                projectionStatus: "draft",
                isPrivate: true,
              },
              {
                stableId: `transcript-writing-${requestIdentity}`,
                order: 1,
                title: "Draft response",
                body: draftBody,
                sourceLabel: `Writing from transcript · ${timestamp}`,
                sourcePath: exactSourcePath,
                externalId: `transcript-draft:${desk.transcriptJobId}:${segmentId}`,
                projectionStatus: "draft",
                isPrivate: true,
              },
            ],
          },
        },
        select: { id: true, projectId: true, title: true, sourcePath: true, blocks: { orderBy: { order: "asc" }, select: { id: true, order: true } } },
      });
      const draftBlock = document.blocks.find((block: any) => block.order === 1) ?? document.blocks[0];
      await tx.studioDocumentOperation.create({
        data: {
          projectId: desk.projectId,
          documentId: document.id,
          actorEmail: text(actor.email, 320) || null,
          origin: "human",
          operationType: TRANSCRIPT_DRAFT_OPERATION,
          status: "applied",
          afterJson: { documentStableId, draftBlockId: draftBlock?.id ?? null, title },
          payloadJson: {
            schema: "quipsly-transcript-writing-draft-v1",
            surface: text(input.surface, 80) || "quipsly-transcript-review",
            clientRequestId,
            createdByUserId: actor.id,
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
            sourceMutated: false,
            externalSideEffects: false,
            boundaries: boundaries(),
          },
          reversible: true,
        },
      });
      return { document, projectSlug: project.slug, draftBlockId: draftBlock?.id ?? null, idempotentReplay: false };
    });

    const href = `/create?project=${encodeURIComponent(result.projectSlug)}&document=${encodeURIComponent(result.document.id)}${result.draftBlockId ? `&block=${encodeURIComponent(result.draftBlockId)}` : ""}`;
    return NextResponse.json({
      ok: true,
      idempotentReplay: result.idempotentReplay,
      document: { id: result.document.id, title: result.document.title, href },
      boundaries: boundaries(),
    });
  } catch (error) {
    if (error instanceof TranscriptCorrectionError) {
      return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: error.status });
    }
    console.error("[transcript-draft] source-linked draft creation failed", error);
    return NextResponse.json({ ok: false, error: "Quipsly could not start this draft. No source or external system was changed." }, { status: 503 });
  }
}
