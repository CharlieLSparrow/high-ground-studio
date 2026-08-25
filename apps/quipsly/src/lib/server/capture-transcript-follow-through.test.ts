/** @jest-environment node */

import { buildCoachingPacketFromTranscriptJob } from "./coaching-packets";
import { reconcileCaptureTranscriptFollowThrough } from "./capture-transcript-follow-through";
import { reconcileCaptureTranscriptJob } from "./capture-transcript-reconciliation";
import { acquirePrismaAdvisoryTransactionLock } from "./prisma-advisory-lock";

jest.mock("server-only", () => ({}));
jest.mock("./coaching-packets", () => ({
  buildCoachingPacketFromTranscriptJob: jest.fn(),
}));
jest.mock("./capture-transcript-reconciliation", () => ({
  reconcileCaptureTranscriptJob: jest.fn(),
}));
jest.mock("./prisma-advisory-lock", () => ({
  acquirePrismaAdvisoryTransactionLock: jest.fn(),
}));

function transactionalPrisma<T extends Record<string, any>>(prisma: T) {
  prisma.transcriptJob.update ??= jest.fn().mockResolvedValue({ id: "job-1" });
  return Object.assign(prisma, {
    $transaction: jest.fn(async (callback: (tx: T) => unknown) => callback(prisma)),
  });
}

describe("automatic transcript follow-through", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(reconcileCaptureTranscriptJob).mockResolvedValue({
      status: "completed",
      transcriptJobId: "job-1",
      segmentCount: 8,
      wordCount: 120,
      alreadyCompleted: false,
    });
    jest.mocked(buildCoachingPacketFromTranscriptJob).mockResolvedValue({
      ok: true,
      packetBuildId: "packet-1",
      reusedExistingPacket: false,
    } as any);
  });

  it("uses the assigned coach for booked coaching even when another participant queued transcription", async () => {
    const prisma = transactionalPrisma({
      coachingNote: { findFirst: jest.fn().mockResolvedValue(null) },
      transcriptJob: {
        findUnique: jest.fn().mockResolvedValue({
          roomId: "room-1",
          requestedBy: "recording-owner",
          room: {
            createdByUserId: "room-owner",
            booking: { coachUserId: "coach-owner" },
          },
        }),
      },
    });
    await expect(reconcileCaptureTranscriptFollowThrough({
      prisma,
      transcriptJobId: "job-1",
    })).resolves.toMatchObject({ packetStatus: "ready", packetBuildId: "packet-1" });
    expect(buildCoachingPacketFromTranscriptJob).toHaveBeenCalledWith({
      prisma,
      transcriptJobId: "job-1",
      authorUserId: "coach-owner",
      force: false,
    });
  });

  it("uses the transcript requester and then room creator for non-booked or legacy jobs", async () => {
    const findUnique = jest.fn()
      .mockResolvedValueOnce({
        roomId: "room-1",
        requestedBy: "recording-owner",
        room: { createdByUserId: "room-owner", booking: null },
      })
      .mockResolvedValueOnce({
        roomId: "room-1",
        requestedBy: null,
        room: { createdByUserId: "room-owner", booking: null },
      });
    const prisma = transactionalPrisma({
      coachingNote: { findFirst: jest.fn().mockResolvedValue(null) },
      transcriptJob: { findUnique },
    });
    await reconcileCaptureTranscriptFollowThrough({ prisma, transcriptJobId: "job-1" });
    await reconcileCaptureTranscriptFollowThrough({ prisma, transcriptJobId: "job-1" });
    expect(jest.mocked(buildCoachingPacketFromTranscriptJob).mock.calls[0]?.[0].authorUserId).toBe("recording-owner");
    expect(jest.mocked(buildCoachingPacketFromTranscriptJob).mock.calls[1]?.[0].authorUserId).toBe("room-owner");
  });

  it("does not create candidate notes before transcript completion", async () => {
    jest.mocked(reconcileCaptureTranscriptJob).mockResolvedValue({
      status: "pending",
      transcriptJobId: "job-1",
      message: null,
    });
    await expect(reconcileCaptureTranscriptFollowThrough({
      prisma: { transcriptJob: { findUnique: jest.fn() } },
      transcriptJobId: "job-1",
    })).resolves.toMatchObject({ transcriptStatus: "pending", packetStatus: "waiting" });
    expect(buildCoachingPacketFromTranscriptJob).not.toHaveBeenCalled();
  });

  it("does not create authorless private packet material", async () => {
    const prisma = transactionalPrisma({
      coachingNote: { findFirst: jest.fn() },
      transcriptJob: { findUnique: jest.fn().mockResolvedValue({ roomId: "room-1", requestedBy: null, room: null }) },
    });
    await expect(reconcileCaptureTranscriptFollowThrough({
      prisma,
      transcriptJobId: "job-1",
    })).resolves.toMatchObject({ packetStatus: "author-missing" });
    expect(buildCoachingPacketFromTranscriptJob).not.toHaveBeenCalled();
  });

  it("uses a cheap existing-packet read during Session-list sweeps", async () => {
    const prisma = transactionalPrisma({
      coachingNote: {
        findFirst: jest.fn().mockResolvedValue({ id: "summary-existing", sourceJson: { packetBuildId: "packet-existing" } }),
      },
      transcriptJob: {
        findUnique: jest.fn().mockResolvedValue({
          roomId: "room-1",
          requestedBy: "recording-owner",
          room: { createdByUserId: "room-owner", booking: null },
        }),
        update: jest.fn().mockResolvedValue({ id: "job-1" }),
      },
    });
    await expect(reconcileCaptureTranscriptFollowThrough({
      prisma,
      transcriptJobId: "job-1",
    })).resolves.toMatchObject({
      packetStatus: "ready",
      packetBuildId: "packet-existing",
      reusedExistingPacket: true,
    });
    expect(buildCoachingPacketFromTranscriptJob).not.toHaveBeenCalled();
    expect(prisma.coachingNote.findFirst).toHaveBeenCalledWith({
      where: {
        roomId: "room-1",
        authorUserId: "recording-owner",
        kind: "SUMMARY",
        title: "Transcript packet: job-1",
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, sourceJson: true },
    });
    expect(prisma.transcriptJob.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "job-1" },
      data: { resultJson: expect.objectContaining({
        followThrough: expect.objectContaining({
          packetStatus: "ready",
          packetBuildId: "packet-existing",
          summaryNoteId: "summary-existing",
          candidateOnly: true,
          authorPrivate: true,
          automaticAssignment: false,
          automaticSharing: false,
          externalSideEffects: false,
        }),
      }) },
    }));
  });

  it("does not let another author's packet suppress the canonical owner's packet", async () => {
    const prisma = transactionalPrisma({
      coachingNote: { findFirst: jest.fn().mockResolvedValue(null) },
      transcriptJob: {
        findUnique: jest.fn().mockResolvedValue({
          roomId: "room-1",
          requestedBy: "recording-owner",
          room: { createdByUserId: "room-owner", booking: null },
        }),
      },
    });
    await reconcileCaptureTranscriptFollowThrough({
      prisma,
      transcriptJobId: "job-1",
    });
    expect(prisma.coachingNote.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ authorUserId: "recording-owner" }),
    }));
    expect(buildCoachingPacketFromTranscriptJob).toHaveBeenCalledWith(expect.objectContaining({
      authorUserId: "recording-owner",
    }));
  });

  it("serializes one candidate-only private build for a transcript", async () => {
    const prisma = transactionalPrisma({
      coachingNote: { findFirst: jest.fn().mockResolvedValue(null) },
      transcriptJob: {
        findUnique: jest.fn().mockResolvedValue({
          roomId: "room-1",
          requestedBy: "recording-owner",
          resultJson: { providerEvidence: true },
          room: { createdByUserId: "room-owner", booking: null },
        }),
        update: jest.fn().mockResolvedValue({ id: "job-1" }),
      },
    });
    jest.mocked(buildCoachingPacketFromTranscriptJob).mockResolvedValue({
      ok: true,
      packetBuildId: "packet-1",
      summaryNoteId: "summary-1",
      reusedExistingPacket: false,
    } as any);

    await reconcileCaptureTranscriptFollowThrough({ prisma, transcriptJobId: "job-1" });

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 5_000,
      timeout: 30_000,
      isolationLevel: "Serializable",
    });
    expect(acquirePrismaAdvisoryTransactionLock).toHaveBeenCalledWith(
      prisma,
      "capture-transcript-follow-through:job-1",
    );
    expect(prisma.transcriptJob.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { resultJson: expect.objectContaining({
        providerEvidence: true,
        followThrough: expect.objectContaining({
          packetBuildId: "packet-1",
          summaryNoteId: "summary-1",
          candidateOnly: true,
          authorPrivate: true,
          automaticAssignment: false,
          automaticSharing: false,
        }),
      }) },
    }));
  });

  it("retries the complete locked transaction after a serializable write conflict", async () => {
    const prisma = transactionalPrisma({
      coachingNote: { findFirst: jest.fn().mockResolvedValue({ id: "summary-1", sourceJson: { packetBuildId: "packet-1" } }) },
      transcriptJob: {
        findUnique: jest.fn().mockResolvedValue({
          roomId: "room-1",
          requestedBy: "recording-owner",
          resultJson: {},
          room: { createdByUserId: "room-owner", booking: null },
        }),
        update: jest.fn().mockResolvedValue({ id: "job-1" }),
      },
    });
    const conflict = Object.assign(new Error("serialization conflict"), { code: "P2034" });
    prisma.$transaction
      .mockRejectedValueOnce(conflict)
      .mockImplementationOnce(async (callback: (tx: typeof prisma) => unknown) => callback(prisma));

    await expect(reconcileCaptureTranscriptFollowThrough({ prisma, transcriptJobId: "job-1" }))
      .resolves.toMatchObject({ packetStatus: "ready", packetBuildId: "packet-1" });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(prisma.transcriptJob.update).toHaveBeenCalledTimes(1);
  });
});
