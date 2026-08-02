import { createHash, randomUUID } from "node:crypto";
import {
  transcriptPacketNoteCandidateId,
  TRANSCRIPT_PACKET_SOURCE,
} from "@high-ground/quipsly-domain/coaching-packet";
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
import {
  packetSnapshotMatches,
  packetTemplateMatches,
  projectTranscriptSegmentsForPacket,
  resolvePacketEvidenceSpan,
  selectLatestCorrelatedPacketNotes,
  TRANSCRIPT_PACKET_SEGMENT_ORDER_BY,
} from "@/lib/server/coaching-packets";
import { mobileCaptureTranscriptProcessingGate } from "@/lib/server/mobile-capture-processing-gates";
import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { sessionMutationAccessWhere } from "@/lib/server/session-access";
import { canUseProjectTeamNotes } from "@/lib/server/session-note-access";
import { readTranscriptCorrectionDesk, TranscriptCorrectionError } from "@/lib/server/transcript-corrections";
import {
  buildTranscriptSourceAnchorFields,
  resolveTranscriptSpanSegments,
} from "@/lib/server/transcript-source-span";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function hasOwn(value: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
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

function transcriptDerivedNoteBoundaries(noteCreated: boolean, packetCandidate = false) {
  return {
    explicitHumanAction: true,
    canonicalIdentity: true,
    canonicalSessionMutationAccess: true,
    sessionAccessRechecked: true,
    sourceAnchorPreserved: true,
    explicitVisibility: true,
    packetCandidateReviewed: packetCandidate,
    packetSnapshotRechecked: packetCandidate,
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
  segmentIds?: string[];
  clientRequestId: string;
  expectedProviderTextSha256: string;
  title: string;
  body: string;
  kind: EditableSessionNoteKind;
  visibility: SessionNoteVisibility;
  packetContext: {
    transcriptJobId: string;
    recordingAssetId: string;
    summaryNoteId: string;
    packetBuildId: string;
    packetNoteCandidateId: string;
    packetLaneId: string;
  } | null;
}) {
  const source = record(sourceJson);
  const packetMatches = !input.packetContext || (
    source.transcriptJobId === input.packetContext.transcriptJobId
    && source.recordingAssetId === input.packetContext.recordingAssetId
    && source.packetSummaryNoteId === input.packetContext.summaryNoteId
    && source.packetBuildId === input.packetContext.packetBuildId
    && source.packetNoteCandidateId === input.packetContext.packetNoteCandidateId
    && source.packetLaneId === input.packetContext.packetLaneId
  );
  return packetMatches
    && source.schema === TRANSCRIPT_DERIVED_NOTE_SCHEMA
    && source.createdByUserId === input.actorUserId
    && source.roomId === input.roomId
    && source.segmentId === input.segmentId
    && JSON.stringify(Array.isArray(source.segmentIds) ? source.segmentIds : [source.segmentId])
      === JSON.stringify(input.segmentIds ?? [input.segmentId])
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
  const packetFieldNames = [
    "transcriptJobId",
    "recordingAssetId",
    "summaryNoteId",
    "packetBuildId",
    "packetNoteCandidateId",
    "packetLaneId",
  ];
  const packetFieldsPresent = packetFieldNames.filter((field) => hasOwn(input, field));
  const packetContext = packetFieldsPresent.length
    ? {
        transcriptJobId: text(input.transcriptJobId, 200),
        recordingAssetId: text(input.recordingAssetId, 200),
        summaryNoteId: text(input.summaryNoteId, 200),
        packetBuildId: text(input.packetBuildId, 200),
        packetNoteCandidateId: text(input.packetNoteCandidateId, 700),
        packetLaneId: text(input.packetLaneId, 200),
      }
    : null;
  if (!roomId || !segmentId || !clientRequestId || !/^[a-f0-9]{64}$/.test(expectedProviderTextSha256)
      || !noteBody || !kind || !visibility) {
    return NextResponse.json(
      { ok: false, code: "INVALID_INPUT", error: "Room, exact transcript evidence, request identity, note text, purpose, and audience are required." },
      { status: 400 },
    );
  }
  if (packetContext && (packetFieldsPresent.length !== packetFieldNames.length
      || Object.values(packetContext).some((value) => !value)
      || packetContext.packetNoteCandidateId !== clientRequestId)) {
    return NextResponse.json(
      { ok: false, code: "INVALID_PACKET_NOTE_CONTEXT", error: "The complete packet, lane, candidate, and transcript identity is required." },
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
    packetContext,
  };

  try {
    const result = await prisma.$transaction(async (tx: any) => {
      let packetLaneLabel: string | null = null;
      let packetEvidenceSegmentIds: string[] | null = null;
      let packetSourceTextSha256 = "";
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

      if (packetContext) {
        await acquirePrismaAdvisoryTransactionLock(tx, `transcript-job-packet-source:${packetContext.transcriptJobId}`);
        await tx.$queryRaw`SELECT "id" FROM "CoachingNote" WHERE "id" = ${packetContext.summaryNoteId} FOR UPDATE`;
        const packetSummaries = await tx.coachingNote.findMany({
          where: { roomId, kind: "SUMMARY" },
          orderBy: [{ createdAt: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
          take: 100,
          select: { id: true, kind: true, sourceJson: true, createdAt: true, updatedAt: true },
        });
        const correlatedSummaries = packetSummaries.filter((note: any) => {
          const source = record(note.sourceJson);
          return source.source === TRANSCRIPT_PACKET_SOURCE
            && source.transcriptJobId === packetContext.transcriptJobId;
        });
        const currentPacket = selectLatestCorrelatedPacketNotes(correlatedSummaries).summary;
        const packetSource = record(currentPacket?.sourceJson);
        if (!currentPacket
            || currentPacket.id !== packetContext.summaryNoteId
            || packetSource.packetBuildId !== packetContext.packetBuildId
            || packetSource.recordingAssetId !== packetContext.recordingAssetId
            || packetSource.roomId !== roomId) {
          throw new TranscriptCorrectionError("This note candidate is not part of the current Session packet. Refresh before saving it.", 409, "STALE_PACKET_NOTE_CANDIDATE");
        }

        const lockedTranscriptJob = await tx.transcriptJob.findFirst({
          where: { id: packetContext.transcriptJobId, roomId, assetId: packetContext.recordingAssetId },
          include: {
            asset: true,
            segments: {
              orderBy: TRANSCRIPT_PACKET_SEGMENT_ORDER_BY,
              include: {
                corrections: { where: { status: "accepted" }, orderBy: { updatedAt: "desc" } },
                verifications: { orderBy: { createdAt: "desc" } },
              },
            },
          },
        });
        if (!lockedTranscriptJob?.asset || lockedTranscriptJob.status !== "COMPLETED") {
          throw new TranscriptCorrectionError("Completed recording-backed transcript evidence is required.", 409, "TRANSCRIPT_NOTE_EVIDENCE_HELD");
        }
        const lockedGate = await mobileCaptureTranscriptProcessingGate({ prisma: tx, recordingAsset: lockedTranscriptJob.asset });
        if (!lockedGate.allowed) {
          throw new TranscriptCorrectionError(lockedGate.error || "Transcript evidence is held.", 409, lockedGate.errorCode || "TRANSCRIPT_NOTE_EVIDENCE_HELD");
        }
        if (!packetTemplateMatches(packetSource) || !packetSnapshotMatches(packetSource, lockedTranscriptJob.segments)) {
          throw new TranscriptCorrectionError("Transcript review changed after this packet was built. Build the current packet before saving a note.", 409, "TRANSCRIPT_REVIEW_CHANGED");
        }
        const lane = array(packetSource.reviewLanes).map(record).find((candidate) => candidate.id === packetContext.packetLaneId);
        const laneStatus = text(lane?.status, 80);
        const item = array(lane?.items).map(record).find((candidate) => candidate.segmentId === segmentId);
        const packetEvidence = item
          ? resolvePacketEvidenceSpan(item, projectTranscriptSegmentsForPacket(lockedTranscriptJob.segments))
          : null;
        const expectedCandidateId = transcriptPacketNoteCandidateId(packetContext.packetBuildId, packetContext.packetLaneId, segmentId);
        if (!lane || !item || !packetEvidence || packetContext.packetNoteCandidateId !== expectedCandidateId
            || laneStatus === "EMPTY" || laneStatus === "REJECTED_BY_HUMAN") {
          throw new TranscriptCorrectionError("This packet note candidate is unavailable or its lane is closed. Refresh before saving it.", 409, "PACKET_NOTE_CANDIDATE_UNAVAILABLE");
        }
        packetEvidenceSegmentIds = packetEvidence.map((segment) => segment.id);
        packetSourceTextSha256 = text(item.sourceTextSha256, 64).toLowerCase();
        packetLaneLabel = text(lane.label, 240) || "Session note";
      }

      const desk = await readTranscriptCorrectionDesk({ prisma: tx, roomId, actor });
      if (!desk.gate.allowed || !desk.playback) {
        throw new TranscriptCorrectionError(
          desk.gate.error || "Released recording-backed transcript evidence is required.",
          409,
          "TRANSCRIPT_NOTE_EVIDENCE_HELD",
        );
      }
      const evidenceSegments = resolveTranscriptSpanSegments({
        segmentIds: packetEvidenceSegmentIds,
        primarySegmentId: segmentId,
        segments: desk.segments,
      });
      const sourceAnchor = evidenceSegments ? buildTranscriptSourceAnchorFields(evidenceSegments) : null;
      if (!sourceAnchor) {
        throw new TranscriptCorrectionError("The transcript evidence span changed or is unavailable.", 409, "STALE_TRANSCRIPT_SEGMENT");
      }
      if (sourceAnchor.providerTextSha256 !== expectedProviderTextSha256) {
        throw new TranscriptCorrectionError("Provider transcript evidence changed. Refresh before saving the note.", 409, "STALE_PROVIDER_EVIDENCE");
      }
      if (packetSourceTextSha256
          && createHash("sha256").update(sourceAnchor.effectiveTextSnapshot, "utf8").digest("hex") !== packetSourceTextSha256) {
        throw new TranscriptCorrectionError("The complete transcript thought changed. Refresh before saving the note.", 409, "STALE_TRANSCRIPT_SPAN_EVIDENCE");
      }

      const replay = await tx.coachingNote.findUnique({ where: { id }, select: NOTE_SELECT });
      if (replay) {
        if (!sourceMatches(replay.sourceJson, { ...replayInput, segmentIds: sourceAnchor.segmentIds })) {
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
        ...sourceAnchor,
        recordingAssetId: desk.playback.recordingAssetId,
        playbackSourceId: desk.playback.sourceId,
        initialTitle: title,
        initialBody: noteBody,
        initialKind: kind,
        initialVisibility: visibility,
        ...(packetContext ? {
          packetSummaryNoteId: packetContext.summaryNoteId,
          packetBuildId: packetContext.packetBuildId,
          packetNoteCandidateId: packetContext.packetNoteCandidateId,
          packetLaneId: packetContext.packetLaneId,
          packetLaneLabel,
          packetCandidate: true,
          materializedFromPacket: true,
        } : {}),
        aiGenerated: false,
        boundaries: transcriptDerivedNoteBoundaries(true, Boolean(packetContext)),
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
              operation: packetContext ? "created-from-transcript-packet" : "created-from-transcript",
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
      boundaries: transcriptDerivedNoteBoundaries(!result.idempotentReplay, Boolean(packetContext)),
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
          boundaries: transcriptDerivedNoteBoundaries(false, Boolean(packetContext)),
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
