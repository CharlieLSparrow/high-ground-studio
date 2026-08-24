import "server-only";

import { buildCoachingPacketFromTranscriptJob } from "@/lib/server/coaching-packets";
import { reconcileCaptureTranscriptJob } from "@/lib/server/capture-transcript-reconciliation";

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
    },
  });
  const authorUserId = authority?.requestedBy
    || authority?.room?.booking?.coachUserId
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
      select: { sourceJson: true },
    });
    if (existing) {
      const source = typeof existing.sourceJson === "object"
        && existing.sourceJson !== null
        && !Array.isArray(existing.sourceJson)
        ? existing.sourceJson as Record<string, unknown>
        : {};
      return {
        transcriptJobId: input.transcriptJobId,
        transcriptStatus: "completed",
        packetStatus: "ready",
        packetBuildId: typeof source.packetBuildId === "string" ? source.packetBuildId : null,
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
  return {
    transcriptJobId: input.transcriptJobId,
    transcriptStatus: "completed",
    packetStatus: "ready",
    packetBuildId: packet.packetBuildId || null,
    reusedExistingPacket: packet.reusedExistingPacket === true,
  };
}
