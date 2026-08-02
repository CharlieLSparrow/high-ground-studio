import { createHash, randomUUID } from "node:crypto";
import {
  readTranscriptDerivedNoteSource,
  TRANSCRIPT_DERIVED_NOTE_SCHEMA,
} from "@high-ground/quipsly-domain/transcript-derived-task";
import { NextResponse } from "next/server";

import {
  isEditableSessionNoteKind,
  isSessionNoteVisibility,
  type EditableSessionNoteKind,
  type SessionNoteVisibility,
} from "@/lib/session-note-contract";
import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { sessionMutationAccessWhere } from "@/lib/server/session-access";
import { canUseProjectTeamNotes } from "@/lib/server/session-note-access";
import { readTranscriptCorrectionDesk, TranscriptCorrectionError } from "@/lib/server/transcript-corrections";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown, max: number, preserveLineBreaks = false) {
  if (typeof value !== "string") return "";
  const normalized = preserveLineBreaks ? value.trim() : value.replace(/\s+/g, " ").trim();
  return normalized.slice(0, max);
}

async function body(request: Request) {
  try { return record(await request.json()); } catch { return {}; }
}

function noteIdentity(userId: string, clientRequestId: string) {
  return `transcript-note-${createHash("sha256").update(`${userId}|${clientRequestId}`).digest("hex").slice(0, 24)}`;
}

function transcriptDerivedNoteBoundaries(noteCreated: boolean) {
  return {
    explicitHumanAction: true,
    canonicalIdentity: true,
    canonicalSessionMutationAccess: true,
    sessionAccessRechecked: true,
    sourceAnchorPreserved: true,
    explicitVisibility: true,
    noteCreated,
    providerTranscriptMutated: false,
    correctionOverlayMutated: false,
    recordingMutated: false,
    taskCreated: false,
    goalCreated: false,
    calendarMutated: false,
    messageSent: false,
    externalDelivery: false,
    publication: false,
  };
}

function sourceMatches(sourceJson: unknown, input: {
  actorUserId: string;
  roomId: string;
  segmentId: string;
  clientRequestId: string;
  expectedProviderTextSha256: string;
  title: string;
  body: string;
  kind: EditableSessionNoteKind;
  visibility: SessionNoteVisibility;
}) {
  const source = record(sourceJson);
  return source.schema === TRANSCRIPT_DERIVED_NOTE_SCHEMA
    && source.createdByUserId === input.actorUserId
    && source.roomId === input.roomId
    && source.segmentId === input.segmentId
    && source.clientRequestId === input.clientRequestId
    && source.providerTextSha256 === input.expectedProviderTextSha256
    && source.initialTitle === input.title
    && source.initialBody === input.body
    && source.initialKind === input.kind
    && source.initialVisibility === input.visibility;
}

const NOTE_SELECT = {
  id: true,
  roomId: true,
  authorUserId: true,
  title: true,
  body: true,
  kind: true,
  visibility: true,
  sourceJson: true,
  createdAt: true,
  updatedAt: true,
  authorUser: { select: { name: true, primaryEmail: true } },
  tagLinks: {
    orderBy: { createdAt: "asc" as const },
    select: { tag: { select: { id: true, label: true, slug: true } } },
  },
  _count: { select: { revisions: true } },
};

function serializedNote(row: any, actorUserId: string) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    kind: String(row.kind),
    visibility: String(row.visibility),
    author: {
      id: row.authorUserId,
      label: row.authorUser?.name || row.authorUser?.primaryEmail || "Note author",
      isCurrentActor: row.authorUserId === actorUserId,
    },
    originLabel: "Transcript review",
    canEdit: row.authorUserId === actorUserId,
    revisionCount: row._count?.revisions ?? 0,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
    tags: (row.tagLinks || []).map((link: any) => link.tag),
    sourceAnchor: readTranscriptDerivedNoteSource(row.sourceJson),
    href: `/sessions/${encodeURIComponent(row.roomId)}?mode=notes`,
  };
}

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, code: "AUTH_REQUIRED", error: "Sign in before saving a note from transcript evidence." },
      { status: 401 },
    );
  }

  const input = await body(request);
  const roomId = text(input.roomId, 200);
  const segmentId = text(input.segmentId, 200);
  const clientRequestId = text(input.clientRequestId, 160);
  const expectedProviderTextSha256 = text(input.expectedProviderTextSha256, 64).toLowerCase();
  const title = text(input.title, 500);
  const noteBody = text(input.body, 20_000, true);
  const kind = isEditableSessionNoteKind(input.kind) ? input.kind : null;
  const visibility = isSessionNoteVisibility(input.visibility) ? input.visibility : null;
  if (!roomId || !segmentId || !clientRequestId || !/^[a-f0-9]{64}$/.test(expectedProviderTextSha256)
      || !noteBody || !kind || !visibility) {
    return NextResponse.json(
      { ok: false, code: "INVALID_INPUT", error: "Room, exact transcript evidence, request identity, note text, purpose, and audience are required." },
      { status: 400 },
    );
  }

  const prisma = getPrismaClient() as any;
  const actorEmail = text(session.user.primaryEmail || session.user.email, 320).toLowerCase();
  const actor = {
    id: session.user.id,
    email: actorEmail || null,
    isStaff: session.user.isStaff === true,
  };
  const id = noteIdentity(actor.id, clientRequestId);
  const replayInput = {
    actorUserId: actor.id,
    roomId,
    segmentId,
    clientRequestId,
    expectedProviderTextSha256,
    title,
    body: noteBody,
    kind,
    visibility,
  };

  try {
    const result = await prisma.$transaction(async (tx: any) => {
      const currentRoom = await tx.callRoom.findFirst({
        where: sessionMutationAccessWhere(roomId, session.user),
        select: {
          id: true,
          bookingId: true,
          project: {
            select: {
              accessGrants: actorEmail ? {
                where: { email: actorEmail, status: "ACTIVE" },
                take: 1,
                select: { role: true },
              } : undefined,
            },
          },
        },
      });
      if (!currentRoom) {
        throw new TranscriptCorrectionError("This Session is not available to this account.", 404, "SESSION_MUTATION_ACCESS_REQUIRED");
      }
      const canUseProjectTeam = canUseProjectTeamNotes(
        currentRoom.project?.accessGrants?.[0]?.role,
        actor.isStaff,
      );
      if ((visibility === "PROJECT_TEAM" || kind === "PRODUCTION") && !canUseProjectTeam) {
        throw new TranscriptCorrectionError("Only a Nest owner or editor can create production-team notes.", 403, "PROJECT_ROLE_REQUIRED");
      }

      const desk = await readTranscriptCorrectionDesk({ prisma: tx, roomId, actor });
      if (!desk.gate.allowed || !desk.playback) {
        throw new TranscriptCorrectionError(
          desk.gate.error || "Released recording-backed transcript evidence is required.",
          409,
          "TRANSCRIPT_NOTE_EVIDENCE_HELD",
        );
      }
      const segment = desk.segments.find((candidate: any) => candidate.id === segmentId);
      if (!segment) {
        throw new TranscriptCorrectionError("The transcript segment changed or is unavailable.", 409, "STALE_TRANSCRIPT_SEGMENT");
      }
      if (segment.providerTextSha256 !== expectedProviderTextSha256) {
        throw new TranscriptCorrectionError("Provider transcript evidence changed. Refresh before saving the note.", 409, "STALE_PROVIDER_EVIDENCE");
      }

      const replay = await tx.coachingNote.findUnique({ where: { id }, select: NOTE_SELECT });
      if (replay) {
        if (!sourceMatches(replay.sourceJson, replayInput)) {
          throw new TranscriptCorrectionError("That note request identity is already bound to different evidence or content.", 409, "IDEMPOTENCY_CONFLICT");
        }
        return { note: replay, idempotentReplay: true };
      }

      const createdAt = new Date().toISOString();
      const sourceJson = {
        schema: TRANSCRIPT_DERIVED_NOTE_SCHEMA,
        surface: text(input.surface, 80) || "quipsly-transcript-review",
        clientRequestId,
        explicitHumanAction: true,
        createdByUserId: actor.id,
        createdAt,
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
        initialTitle: title,
        initialBody: noteBody,
        initialKind: kind,
        initialVisibility: visibility,
        aiGenerated: false,
        boundaries: transcriptDerivedNoteBoundaries(true),
      };
      const note = await tx.coachingNote.create({
        data: {
          id,
          roomId,
          bookingId: currentRoom.bookingId || null,
          authorUserId: actor.id,
          kind,
          visibility,
          title: title || null,
          body: noteBody,
          sourceJson,
          revisions: {
            create: {
              id: randomUUID(),
              revision: 1,
              operation: "created-from-transcript",
              actorUserId: actor.id,
              snapshotJson: { title: title || null, body: noteBody, kind, visibility, sourceJson },
            },
          },
        },
        select: NOTE_SELECT,
      });
      return { note, idempotentReplay: false };
    }, { isolationLevel: "Serializable" });

    return NextResponse.json({
      ok: true,
      idempotentReplay: result.idempotentReplay,
      note: serializedNote(result.note, actor.id),
      boundaries: transcriptDerivedNoteBoundaries(!result.idempotentReplay),
    });
  } catch (error) {
    if (error instanceof TranscriptCorrectionError) {
      return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: error.status });
    }
    if (record(error).code === "P2002") {
      const raced = await prisma.coachingNote.findUnique({ where: { id }, select: NOTE_SELECT });
      if (raced && sourceMatches(raced.sourceJson, replayInput)) {
        return NextResponse.json({
          ok: true,
          idempotentReplay: true,
          note: serializedNote(raced, actor.id),
          boundaries: transcriptDerivedNoteBoundaries(false),
        });
      }
      return NextResponse.json(
        { ok: false, code: "IDEMPOTENCY_CONFLICT", error: "A concurrent request used this identity for different note evidence." },
        { status: 409 },
      );
    }
    console.error("[transcript-note] explicit note creation failed", error);
    return NextResponse.json(
      { ok: false, error: "Quipsly could not save this note. No task, message, delivery, calendar event, or publication was created." },
      { status: 503 },
    );
  }
}
