/** @jest-environment node */

import { buildCoachingPacketFromTranscriptJob } from "./coaching-packets";
import { reconcileCaptureTranscriptFollowThrough } from "./capture-transcript-follow-through";
import { reconcileCaptureTranscriptJob } from "./capture-transcript-reconciliation";

jest.mock("server-only", () => ({}));
jest.mock("./coaching-packets", () => ({
  buildCoachingPacketFromTranscriptJob: jest.fn(),
}));
jest.mock("./capture-transcript-reconciliation", () => ({
  reconcileCaptureTranscriptJob: jest.fn(),
}));

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
    const prisma = {
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
    };
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
    const prisma = {
      coachingNote: { findFirst: jest.fn().mockResolvedValue(null) },
      transcriptJob: { findUnique },
    };
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
    const prisma = {
      coachingNote: { findFirst: jest.fn() },
      transcriptJob: { findUnique: jest.fn().mockResolvedValue({ roomId: "room-1", requestedBy: null, room: null }) },
    };
    await expect(reconcileCaptureTranscriptFollowThrough({
      prisma,
      transcriptJobId: "job-1",
    })).resolves.toMatchObject({ packetStatus: "author-missing" });
    expect(buildCoachingPacketFromTranscriptJob).not.toHaveBeenCalled();
  });

  it("uses a cheap existing-packet read during Session-list sweeps", async () => {
    const prisma = {
      coachingNote: {
        findFirst: jest.fn().mockResolvedValue({ sourceJson: { packetBuildId: "packet-existing" } }),
      },
      transcriptJob: {
        findUnique: jest.fn().mockResolvedValue({
          roomId: "room-1",
          requestedBy: "recording-owner",
          room: { createdByUserId: "room-owner", booking: null },
        }),
      },
    };
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
      select: { sourceJson: true },
    });
  });

  it("does not let another author's packet suppress the canonical owner's packet", async () => {
    const prisma = {
      coachingNote: { findFirst: jest.fn().mockResolvedValue(null) },
      transcriptJob: {
        findUnique: jest.fn().mockResolvedValue({
          roomId: "room-1",
          requestedBy: "recording-owner",
          room: { createdByUserId: "room-owner", booking: null },
        }),
      },
    };
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
});
