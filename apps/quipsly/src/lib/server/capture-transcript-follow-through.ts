import "server-only";

import { buildCoachingPacketFromTranscriptJob } from "@/lib/server/coaching-packets";
import { reconcileCaptureTranscriptJob } from "@/lib/server/capture-transcript-reconciliation";
import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";

export type CaptureTranscriptFollowThroughResult = {
  transcriptJobId: string;
  transcriptStatus: "completed" | "pending" | "held" | "failed";
  packetStatus: "ready" | "waiting" | "author-missing" | "build-held";
  packetBuildId: string | null;
  reusedExistingPacket: boolean;
};

/**
 * Reconciles durable worker evidence and prepares private, candidate-only
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

  return input.prisma.$transaction(async (tx: any) => {
    await acquirePrismaAdvisoryTransactionLock(
      tx,
      `capture-transcript-follow-through:${input.transcriptJobId}`,
    );
    return preparePrivateFollowThrough({
      prisma: tx,
      transcriptJobId: input.transcriptJobId,
      refreshExistingPacket: input.refreshExistingPacket,
    });
  }, { maxWait: 5_000, timeout: 30_000, isolationLevel: "Serializable" });
}

async function preparePrivateFollowThrough(input: {
  prisma: any;
  transcriptJobId: string;
  refreshExistingPacket?: boolean;
}): Promise<CaptureTranscriptFollowThroughResult> {
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
  // A booked coaching Session belongs in the assigned coach's private review
  // lane even when the client's phone uploaded or queued the source first.
  // Non-booked production/research Sessions retain the transcript requester.
  const authorUserId = authority?.room?.booking?.coachUserId
    || authority?.requestedBy
    || authority?.room?.createdByUserId
    || null;
  if (!authorUserId) {
    return {
      transcriptJobId: input.transcriptJobId,
      transcriptStatus: "completed",
      packetStatus: "author-missing",
      packetBuildId: null,
      reusedExistingPacket: false,
    };
  }

  if (input.refreshExistingPacket !== true) {
    const existing = await input.prisma.coachingNote.findFirst({
      where: {
        roomId: authority.roomId,
        authorUserId,
        kind: "SUMMARY",
        title: `Transcript packet: ${input.transcriptJobId}`,
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, sourceJson: true },
    });
    if (existing) {
      const source = typeof existing.sourceJson === "object"
        && existing.sourceJson !== null
        && !Array.isArray(existing.sourceJson)
        ? existing.sourceJson as Record<string, unknown>
        : {};
      const packetBuildId = typeof source.packetBuildId === "string" ? source.packetBuildId : null;
      await recordReadyFollowThrough(input.prisma, {
        transcriptJobId: input.transcriptJobId,
        resultJson: authority.resultJson,
        packetBuildId,
        summaryNoteId: existing.id,
        reusedExistingPacket: true,
      });
      return {
        transcriptJobId: input.transcriptJobId,
        transcriptStatus: "completed",
        packetStatus: "ready",
        packetBuildId,
        reusedExistingPacket: true,
      };
    }
  }

  const packet = await buildCoachingPacketFromTranscriptJob({
    prisma: input.prisma,
    transcriptJobId: input.transcriptJobId,
    authorUserId,
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
          candidateOnly: true,
          authorPrivate: true,
          automaticAssignment: false,
          automaticSharing: false,
          externalSideEffects: false,
          preparedAt: new Date().toISOString(),
        },
      },
    },
  });
}
