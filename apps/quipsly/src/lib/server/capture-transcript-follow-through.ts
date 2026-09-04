import "server-only";

import {
  buildCoachingPacketFromTranscriptJob,
  packetCreatesOrdinarySessionWork,
} from "@/lib/server/coaching-packets";
import { reconcileCaptureTranscriptJob } from "@/lib/server/capture-transcript-reconciliation";
import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";

export type CaptureTranscriptFollowThroughResult = {
  transcriptJobId: string;
  transcriptStatus: "completed" | "pending" | "held" | "failed";
  packetStatus: "ready" | "waiting" | "author-missing" | "build-held";
  packetBuildId: string | null;
  reusedExistingPacket: boolean;
};

export function captureTranscriptFollowThroughAuthorId(authority: any): string | null {
  return authority?.room?.booking?.coachUserId
    || authority?.requestedBy
    || authority?.room?.createdByUserId
    || null;
}

/**
 * Reconciles durable worker evidence and creates ordinary, editable Session
 * follow-through without depending on a particular browser remaining open.
 * Authorship comes from canonical transcript/coach ownership, never from the
 * account that happened to poll the Session.
 */
export async function reconcileCaptureTranscriptFollowThrough(input: {
  prisma: any;
  transcriptJobId: string;
  refreshExistingPacket?: boolean;
}): Promise<CaptureTranscriptFollowThroughResult> {
  const transcript = await reconcileCaptureTranscriptJob({
    prisma: input.prisma,
    transcriptJobId: input.transcriptJobId,
  });
  if (transcript.status !== "completed") {
    return {
      transcriptJobId: input.transcriptJobId,
      transcriptStatus: transcript.status,
      packetStatus: "waiting",
      packetBuildId: null,
      reusedExistingPacket: false,
    };
  }

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await input.prisma.$transaction(async (tx: any) => {
        return prepareSessionFollowThrough({
          prisma: tx,
          transcriptJobId: input.transcriptJobId,
        });
      }, { maxWait: 5_000, timeout: 30_000, isolationLevel: "ReadCommitted" });
    } catch (error) {
      if (attempt >= 3 || !isSerializableWriteConflict(error)) throw error;
    }
  }
  throw new Error("Capture transcript follow-through exhausted its transaction retry boundary.");
}

function isSerializableWriteConflict(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2034");
}

async function prepareSessionFollowThrough(input: {
  prisma: any;
  transcriptJobId: string;
}): Promise<CaptureTranscriptFollowThroughResult> {
  // Same-job calls can arrive from immediate dispatch, scheduled recovery,
  // and two connected clients refreshing the same Session. Take the narrow
  // job lock before discovering the shared room, then the room lock before
  // reading the authoritative result. Under READ COMMITTED, a waiter sees the
  // winner's durable follow-through instead of retaining a stale serializable
  // snapshot and manufacturing a P2034 conflict for ordinary polling.
  await acquirePrismaAdvisoryTransactionLock(
    input.prisma,
    `capture-transcript-follow-through-job:${input.transcriptJobId}`,
  );
  const lockScope = await input.prisma.transcriptJob.findUnique({
    where: { id: input.transcriptJobId },
    select: { roomId: true },
  });
  if (lockScope?.roomId) {
    await acquirePrismaAdvisoryTransactionLock(
      input.prisma,
      `capture-transcript-follow-through-room:${lockScope.roomId}`,
    );
  }

  const authority = await input.prisma.transcriptJob.findUnique({
    where: { id: input.transcriptJobId },
    select: {
      roomId: true,
      requestedBy: true,
      room: {
        select: {
          createdByUserId: true,
          booking: { select: { coachUserId: true } },
        },
      },
      resultJson: true,
    },
  });
  const durableReady = durableReadyFollowThrough(authority?.resultJson);
  const durableSummary = durableReady?.summaryNoteId
    ? await input.prisma.coachingNote.findUnique({
        where: { id: durableReady.summaryNoteId },
        select: { roomId: true, sourceJson: true },
      })
    : null;
  if (
    durableReady
    && durableSummary?.roomId === authority?.roomId
    && durableSummaryMatchesTranscript({
      sourceJson: durableSummary.sourceJson,
      transcriptJobId: input.transcriptJobId,
      packetBuildId: durableReady.packetBuildId,
    })
  ) {
    return {
      transcriptJobId: input.transcriptJobId,
      transcriptStatus: "completed",
      packetStatus: "ready",
      packetBuildId: durableReady.packetBuildId,
      reusedExistingPacket: true,
    };
  }
  // A booked coaching Session belongs to the assigned coach even when the
  // client's phone uploaded or queued the source first. Canonical Session and
  // booking access determines who can see the generated work.
  // Non-booked production/research Sessions retain the transcript requester.
  const authorUserId = captureTranscriptFollowThroughAuthorId(authority);
  if (!authorUserId) {
    return {
      transcriptJobId: input.transcriptJobId,
      transcriptStatus: "completed",
      packetStatus: "author-missing",
      packetBuildId: null,
      reusedExistingPacket: false,
    };
  }

  const packet = await buildCoachingPacketFromTranscriptJob({
    prisma: input.prisma,
    transcriptJobId: input.transcriptJobId,
    authorUserId,
    // The builder reuses current automatic packets, but deliberately versions
    // a historical candidate-only packet into ordinary editable Session work.
    force: false,
  });
  if (!packet.ok) {
    return {
      transcriptJobId: input.transcriptJobId,
      transcriptStatus: "completed",
      packetStatus: "build-held",
      packetBuildId: null,
      reusedExistingPacket: false,
    };
  }
  await recordReadyFollowThrough(input.prisma, {
    transcriptJobId: input.transcriptJobId,
    resultJson: authority.resultJson,
    packetBuildId: packet.packetBuildId || null,
    summaryNoteId: packet.summaryNoteId || null,
    reusedExistingPacket: packet.reusedExistingPacket === true,
  });
  return {
    transcriptJobId: input.transcriptJobId,
    transcriptStatus: "completed",
    packetStatus: "ready",
    packetBuildId: packet.packetBuildId || null,
    reusedExistingPacket: packet.reusedExistingPacket === true,
  };
}

function durableReadyFollowThrough(value: unknown): {
  packetBuildId: string | null;
  summaryNoteId: string | null;
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const followThrough = (value as Record<string, unknown>).followThrough;
  if (!followThrough || typeof followThrough !== "object" || Array.isArray(followThrough)) {
    return null;
  }
  const ready = followThrough as Record<string, unknown>;
  if (
    ready.packetStatus !== "ready"
    || ready.ordinarySessionWorkCreated !== true
    || ready.candidateOnly !== false
    || ready.canonicalAccessApplied !== true
    || ready.automaticAssignment !== true
  ) {
    return null;
  }
  return {
    packetBuildId: typeof ready.packetBuildId === "string"
      ? ready.packetBuildId
      : null,
    summaryNoteId: typeof ready.summaryNoteId === "string"
      ? ready.summaryNoteId
      : null,
  };
}

function durableSummaryMatchesTranscript(input: {
  sourceJson: unknown;
  transcriptJobId: string;
  packetBuildId: string | null;
}) {
  if (
    !input.sourceJson
    || typeof input.sourceJson !== "object"
    || Array.isArray(input.sourceJson)
  ) return false;
  const source = input.sourceJson as Record<string, unknown>;
  if (!packetCreatesOrdinarySessionWork(source)) return false;
  if (
    typeof source.packetBuildId !== "string"
    || source.packetBuildId !== input.packetBuildId
  ) return false;
  if (source.transcriptJobId === input.transcriptJobId) return true;
  return Array.isArray(source.transcriptSources)
    && source.transcriptSources.some((candidate) => (
      candidate
      && typeof candidate === "object"
      && !Array.isArray(candidate)
      && (candidate as Record<string, unknown>).transcriptJobId === input.transcriptJobId
    ));
}

async function recordReadyFollowThrough(prisma: any, input: {
  transcriptJobId: string;
  resultJson: unknown;
  packetBuildId: string | null;
  summaryNoteId: string | null;
  reusedExistingPacket: boolean;
}) {
  const resultJson = input.resultJson && typeof input.resultJson === "object" && !Array.isArray(input.resultJson)
    ? input.resultJson as Record<string, unknown>
    : {};
  await prisma.transcriptJob.update({
    where: { id: input.transcriptJobId },
    data: {
      resultJson: {
        ...resultJson,
        followThrough: {
          schema: "quipsly-capture-transcript-follow-through-v1",
          packetStatus: "ready",
          packetBuildId: input.packetBuildId,
          summaryNoteId: input.summaryNoteId,
          reusedExistingPacket: input.reusedExistingPacket,
          ordinarySessionWorkCreated: true,
          candidateOnly: false,
          canonicalAccessApplied: true,
          authorPrivate: false,
          automaticAssignment: true,
          automaticSharing: true,
          automaticExternalDelivery: false,
          externalSideEffects: false,
          preparedAt: new Date().toISOString(),
        },
      },
    },
  });
}
