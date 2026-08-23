import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import {
  buildCoachingTranscriptReport,
  coachingTranscriptReportFileName,
  CoachingTranscriptReportError,
  renderCoachingTranscriptReport,
} from "@/lib/server/coaching-transcript-report";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import {
  readTranscriptCorrectionDesk,
  TranscriptCorrectionError,
} from "@/lib/server/transcript-corrections";
import { newestCoherentRecordingTake } from "@/lib/server/session-recording-share";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Authorization, Cookie",
  "X-Content-Type-Options": "nosniff",
};

function text(value: unknown, max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

function contentDisposition(filename: string) {
  const ascii = filename.replace(/[^a-z0-9 ._-]+/gi, "").trim() || "Coaching Transcript.docx";
  return `attachment; filename="${ascii.replaceAll('"', "")}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

type TranscriptSourceCandidate = {
  id: string;
  participantId: string | null;
  kind: string;
  checksum: string | null;
  recordedStartedAt: Date;
  transcriptJobs: Array<{ id: string; createdAt: Date }>;
};

function isParticipantIsolatedDesk(desk: any) {
  return desk?.processing?.routing?.sourceTopology === "participant-isolated"
    && desk.processing.routing.speakerAuthority === "source-binding";
}

function selectCoherentTranscriptSources(
  rows: TranscriptSourceCandidate[],
  participantIds: string[],
  anchorRecordingAssetId?: string | null,
) {
  const sorted = [...rows].sort((left, right) => left.recordedStartedAt.getTime() - right.recordedStartedAt.getTime());
  const anchor = sorted.find((row) => row.id === anchorRecordingAssetId) ?? null;
  const take = anchor
    ? newestCoherentRecordingTake(sorted.filter((row) => (
      Math.abs(row.recordedStartedAt.getTime() - anchor.recordedStartedAt.getTime()) <= 30_000
    )))
    : newestCoherentRecordingTake(sorted);
  return participantIds.map((participantId) => {
    const candidates = take.filter((row) => row.participantId === participantId && row.transcriptJobs[0]?.id);
    return candidates.sort((left, right) => {
      if (left.id === anchorRecordingAssetId) return -1;
      if (right.id === anchorRecordingAssetId) return 1;
      const kindPriority = (kind: string) => kind === "LOCAL_AUDIO" ? 0 : kind === "LOCAL_VIDEO" ? 1 : 2;
      return kindPriority(left.kind) - kindPriority(right.kind)
        || right.transcriptJobs[0].createdAt.getTime() - left.transcriptJobs[0].createdAt.getTime()
        || left.id.localeCompare(right.id);
    })[0] ?? null;
  });
}

async function readCompleteCoachingTranscript(input: {
  prisma: any;
  roomId: string;
  actor: { id: string; email?: string | null; isStaff: boolean };
  anchorDesk: any;
  recordingAssetId?: string | null;
}) {
  const anchor = input.anchorDesk;
  const anchorSource = {
    transcriptJobId: anchor.transcriptJobId,
    recordingAssetId: anchor.recording.id,
    sourceSha256: anchor.sourceSha256,
    participantId: isParticipantIsolatedDesk(anchor) ? anchor.recording.participantId ?? null : null,
    programOffsetSeconds: 0,
  };
  if (!isParticipantIsolatedDesk(anchor)) {
    return { desks: [anchor], sources: [anchorSource], segments: anchor.segments };
  }

  const reportParticipants = anchor.participants.filter((participant: any) => ["COACH", "HOST", "CLIENT"].includes(text(participant.role).toUpperCase()));
  const coach = reportParticipants.filter((participant: any) => text(participant.role).toUpperCase() === "COACH");
  const hosts = reportParticipants.filter((participant: any) => text(participant.role).toUpperCase() === "HOST");
  const clients = reportParticipants.filter((participant: any) => text(participant.role).toUpperCase() === "CLIENT");
  const coachCandidates = coach.length ? coach : hosts;
  if (coachCandidates.length !== 1 || clients.length !== 1) {
    throw new CoachingTranscriptReportError(
      "Choose exactly one coach and one client before creating the mentor transcript.",
      409,
      "REPORT_PARTICIPANTS_AMBIGUOUS",
    );
  }
  const participantIds = [coachCandidates[0].id, clients[0].id];
  const rows = await input.prisma.recordingAsset.findMany({
    where: {
      roomId: input.roomId,
      status: "VERIFIED",
      kind: { in: ["LOCAL_AUDIO", "LOCAL_VIDEO"] },
      participantId: { in: participantIds },
      checksum: { not: null },
      recordedStartedAt: { not: null },
      transcriptJobs: { some: { status: "COMPLETED" } },
    },
    orderBy: [{ recordedStartedAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      participantId: true,
      kind: true,
      checksum: true,
      recordedStartedAt: true,
      transcriptJobs: {
        where: { status: "COMPLETED" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
        select: { id: true, createdAt: true },
      },
    },
  }) as TranscriptSourceCandidate[];
  const selected = selectCoherentTranscriptSources(rows, participantIds, input.recordingAssetId ?? anchor.recording.id);
  if (selected.some((source) => !source)) {
    throw new CoachingTranscriptReportError(
      "The complete mentor transcript is still preparing. Wait for both participant recordings to finish transcribing.",
      409,
      "REPORT_SPEAKERS_INCOMPLETE",
    );
  }
  const completeSources = selected as TranscriptSourceCandidate[];
  const desks = await Promise.all(completeSources.map((source) => readTranscriptCorrectionDesk({
    prisma: input.prisma,
    roomId: input.roomId,
    actor: input.actor,
    recordingAssetId: source.id,
  })));
  const originMs = Math.min(...completeSources.map((source) => source.recordedStartedAt.getTime()));
  const sources = desks.map((desk, index) => {
    const selectedSource = completeSources[index];
    if (
      !desk.gate.allowed
      || !desk.transcriptJobId
      || desk.transcriptJobId !== selectedSource.transcriptJobs[0].id
      || desk.recording?.participantId !== selectedSource.participantId
      || !isParticipantIsolatedDesk(desk)
      || text(desk.sourceSha256).toLowerCase() !== text(selectedSource.checksum).toLowerCase()
    ) {
      throw new CoachingTranscriptReportError(
        "One participant transcript no longer matches its verified source recording. Refresh the Session before exporting.",
        409,
        "REPORT_SOURCE_CHANGED",
      );
    }
    return {
      transcriptJobId: desk.transcriptJobId,
      recordingAssetId: selectedSource.id,
      sourceSha256: desk.sourceSha256,
      participantId: selectedSource.participantId,
      programOffsetSeconds: Math.max(0, (selectedSource.recordedStartedAt.getTime() - originMs) / 1_000),
    };
  });
  const segments = desks.flatMap((desk, index) => desk.segments.map((segment: any) => ({
    ...segment,
    transcriptJobId: sources[index].transcriptJobId,
    recordingAssetId: sources[index].recordingAssetId,
    speakerAttribution: { participantId: sources[index].participantId },
    startSeconds: sources[index].programOffsetSeconds + Number(segment.startSeconds),
    endSeconds: sources[index].programOffsetSeconds + Number(segment.endSeconds),
  })));
  return { desks, sources, segments };
}

export async function GET(request: Request, context: { params: Promise<{ roomId: string }> }) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) {
    return privateJson({ ok: false, code: "AUTH_REQUIRED", error: "Sign in before downloading a private coaching transcript." }, 401);
  }
  const { roomId: rawRoomId } = await context.params;
  const roomId = text(rawRoomId);
  const recordingAssetId = text(new URL(request.url).searchParams.get("recordingAssetId")) || null;
  if (!roomId) return privateJson({ ok: false, code: "ROOM_REQUIRED", error: "A Session is required." }, 400);

  try {
    const prisma = getPrismaClient() as any;
    const actor = {
      id: session.user.id,
      email: session.user.primaryEmail,
      isStaff: session.user.isStaff,
    };
    const desk = await readTranscriptCorrectionDesk({
      prisma,
      roomId,
      actor,
      recordingAssetId,
    });
    if (desk.roomPurpose !== "COACHING") {
      throw new CoachingTranscriptReportError(
        "The mentor transcript format is available for coaching Sessions.",
        409,
        "REPORT_COACHING_REQUIRED",
      );
    }
    if (!desk.gate.allowed || !desk.transcriptJobId || !desk.recording?.id) {
      throw new CoachingTranscriptReportError(
        desk.gate.error || "A verified, consented recording transcript is required before export.",
        409,
        "REPORT_TRANSCRIPT_NOT_READY",
      );
    }
    const complete = await readCompleteCoachingTranscript({
      prisma,
      roomId,
      actor,
      anchorDesk: desk,
      recordingAssetId,
    });
    const report = buildCoachingTranscriptReport({
      roomId: desk.roomId,
      title: desk.roomTitle || "Coaching Session",
      scheduledStart: desk.scheduledStart,
      generatedAt: new Date(),
      sources: complete.sources,
      participants: desk.participants,
      speakerGroups: complete.desks.length === 1 ? desk.speakerGroups : [],
      segments: complete.segments,
    });
    const document = await renderCoachingTranscriptReport(report);
    const filename = coachingTranscriptReportFileName(report);
    return new Response(new Uint8Array(document), {
      status: 200,
      headers: {
        ...PRIVATE_HEADERS,
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": contentDisposition(filename),
        "Content-Length": String(document.byteLength),
        "X-Quipsly-Transcript-Schema": report.schema,
        "X-Quipsly-Transcript-Source-Count": String(report.sources.length),
      },
    });
  } catch (error) {
    if (error instanceof CoachingTranscriptReportError || error instanceof TranscriptCorrectionError) {
      return privateJson({ ok: false, code: error.code, error: error.message }, error.status);
    }
    console.error("[coaching-transcript-report] export failed", error);
    return privateJson({
      ok: false,
      code: "REPORT_UNAVAILABLE",
      error: "Quipsly could not prepare the private coaching transcript. Nothing was shared or changed.",
    }, 503);
  }
}
