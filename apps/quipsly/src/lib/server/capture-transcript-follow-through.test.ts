/** @jest-environment node */

import { buildCoachingPacketFromTranscriptJob, loadSessionFollowThroughSource, sessionFollowThroughAnalysisSource } from "./coaching-packets";
import { prepareSessionTranscriptAnalysis } from "./session-transcript-analysis-job";
import { reconcileCaptureTranscriptFollowThrough } from "./capture-transcript-follow-through";
import { reconcileCaptureTranscriptJob } from "./capture-transcript-reconciliation";
import { acquirePrismaAdvisoryTransactionLock } from "./prisma-advisory-lock";
import { SESSION_PACKET_TEMPLATE_VERSION } from "@high-ground/quipsly-domain/coaching-packet-version";

jest.mock("server-only", () => ({}));
jest.mock("./coaching-packets", () => ({
  buildCoachingPacketFromTranscriptJob: jest.fn(),
  loadSessionFollowThroughSource: jest.fn(),
  sessionFollowThroughAnalysisSource: jest.fn(),
  packetCreatesOrdinarySessionWork: (value: any) => value?.reviewRequired === false || (
    value?.packetBrief?.kind === "quipsly-transcript-packet-brief-v1" &&
    value?.packetBrief?.candidateOnly === false &&
    value?.packetBrief?.humanApprovalRequired === false
  ),
}));
jest.mock("./capture-transcript-reconciliation", () => ({
  reconcileCaptureTranscriptJob: jest.fn(),
}));
jest.mock("./prisma-advisory-lock", () => ({
  acquirePrismaAdvisoryTransactionLock: jest.fn(),
}));
jest.mock("./session-transcript-analysis-job", () => ({ prepareSessionTranscriptAnalysis: jest.fn() }));

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

  it("prepares semantic analysis before the materialization transaction and binds the commit to its fingerprint", async () => {
    const authority = { roomId: "room-1", requestedBy: "coach-1", room: { createdByUserId: "coach-1" } };
    const prisma = transactionalPrisma({
      coachingNote: { findFirst: jest.fn().mockResolvedValue(null) },
      transcriptJob: { findUnique: jest.fn().mockResolvedValue(authority) },
      sessionFollowThroughAnalysis: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    });
    jest.mocked(loadSessionFollowThroughSource).mockResolvedValue({ ok: true, job: authority, resolvedTranscript: {} } as any);
    jest.mocked(sessionFollowThroughAnalysisSource).mockReturnValue({ roomId: "room-1", purpose: "COACHING", segments: [] });
    jest.mocked(prepareSessionTranscriptAnalysis).mockImplementation(async () => {
      expect(prisma.$transaction).not.toHaveBeenCalled();
      return { status: "completed", reused: false, analysis: { sourceFingerprint: "fingerprint-1" } } as any;
    });
    const result = await reconcileCaptureTranscriptFollowThrough({ prisma, transcriptJobId: "job-1",
      analysisProvider: { name: "synthetic", model: "test", generate: jest.fn() }, runAnalysis: true });
    expect(result.packetStatus).toBe("ready");
    expect(buildCoachingPacketFromTranscriptJob).toHaveBeenCalledWith(expect.objectContaining({
      requireAnalysisFingerprint: "fingerprint-1", authorUserId: "coach-1",
    }));
    expect(prisma.sessionFollowThroughAnalysis.updateMany).toHaveBeenCalledWith({
      where: { roomId: "room-1", sourceFingerprint: "fingerprint-1", status: "completed" },
      data: { status: "materialized" },
    });
  });

  it("an in-flight analysis does not create incomplete fallback work or hold a materialization transaction", async () => {
    const prisma = transactionalPrisma({ transcriptJob: { update: jest.fn() } });
    jest.mocked(loadSessionFollowThroughSource).mockResolvedValue({ ok: true,
      job: { requestedBy: "coach-1" }, resolvedTranscript: {} } as any);
    jest.mocked(sessionFollowThroughAnalysisSource).mockReturnValue({ roomId: "room-1", purpose: "COACHING", segments: [] });
    jest.mocked(prepareSessionTranscriptAnalysis).mockResolvedValue({ status: "waiting" });
    const result = await reconcileCaptureTranscriptFollowThrough({ prisma, transcriptJobId: "job-1", refreshExistingPacket: true,
      analysisProvider: { name: "synthetic", model: "test", generate: jest.fn() } });
    expect(result).toMatchObject({ packetStatus: "waiting", analysisStatus: "waiting" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(buildCoachingPacketFromTranscriptJob).not.toHaveBeenCalled();
    expect(prisma.transcriptJob.update).not.toHaveBeenCalled();
    expect(prepareSessionTranscriptAnalysis).toHaveBeenCalledWith(expect.objectContaining({
      allowGeneration: false, retryFailed: false,
    }));
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
    const requesterAuthority = {
        roomId: "room-1",
        requestedBy: "recording-owner",
        room: { createdByUserId: "room-owner", booking: null },
      };
    const creatorAuthority = {
        roomId: "room-1",
        requestedBy: null,
        room: { createdByUserId: "room-owner", booking: null },
      };
    const findUnique = jest.fn()
      .mockResolvedValueOnce(requesterAuthority)
      .mockResolvedValueOnce(requesterAuthority)
      .mockResolvedValueOnce(creatorAuthority)
      .mockResolvedValueOnce(creatorAuthority);
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

  it("rechecks the current Session snapshot before reusing existing follow-through", async () => {
    jest.mocked(buildCoachingPacketFromTranscriptJob).mockResolvedValue({
      ok: true,
      packetBuildId: "packet-existing",
      summaryNoteId: "summary-existing",
      reusedExistingPacket: true,
    } as any);
    const prisma = transactionalPrisma({
      coachingNote: {
        findFirst: jest.fn().mockResolvedValue({
          id: "summary-existing",
          sourceJson: {
            packetBuildId: "packet-existing",
            reviewRequired: false,
          },
        }),
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
    expect(buildCoachingPacketFromTranscriptJob).toHaveBeenCalledWith({
      prisma,
      transcriptJobId: "job-1",
      authorUserId: "recording-owner",
      force: false,
    });
    expect(prisma.transcriptJob.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "job-1" },
      data: { resultJson: expect.objectContaining({
        followThrough: expect.objectContaining({
          packetStatus: "ready",
          packetBuildId: "packet-existing",
          summaryNoteId: "summary-existing",
          ordinarySessionWorkCreated: true,
          candidateOnly: false,
          canonicalAccessApplied: true,
          authorPrivate: false,
          automaticAssignment: true,
          automaticSharing: true,
          automaticExternalDelivery: false,
          externalSideEffects: false,
        }),
      }) },
    }));
  });

  it("upgrades a historical candidate-only packet instead of calling paperwork finished work", async () => {
    const prisma = transactionalPrisma({
      coachingNote: {
        findFirst: jest.fn().mockResolvedValue({
          id: "legacy-summary",
          sourceJson: {
            packetBuildId: "legacy-packet",
            packetBrief: {
              kind: "quipsly-transcript-packet-brief-v1",
              candidateOnly: true,
              humanApprovalRequired: true,
            },
          },
        }),
      },
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
    jest.mocked(buildCoachingPacketFromTranscriptJob).mockResolvedValue({
      ok: true,
      packetBuildId: "ordinary-work-packet",
      summaryNoteId: "ordinary-summary",
      reusedExistingPacket: false,
    } as any);

    await expect(reconcileCaptureTranscriptFollowThrough({
      prisma,
      transcriptJobId: "job-1",
    })).resolves.toMatchObject({
      packetStatus: "ready",
      packetBuildId: "ordinary-work-packet",
      reusedExistingPacket: false,
    });
    expect(buildCoachingPacketFromTranscriptJob).toHaveBeenCalledWith({
      prisma,
      transcriptJobId: "job-1",
      authorUserId: "recording-owner",
      force: false,
    });
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
    expect(buildCoachingPacketFromTranscriptJob).toHaveBeenCalledWith(expect.objectContaining({
      authorUserId: "recording-owner",
    }));
  });

  it("serializes one ordinary editable Session result build for a transcript", async () => {
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
      isolationLevel: "ReadCommitted",
    });
    expect(acquirePrismaAdvisoryTransactionLock).toHaveBeenNthCalledWith(
      1,
      prisma,
      "capture-transcript-follow-through-job:job-1",
    );
    expect(acquirePrismaAdvisoryTransactionLock).toHaveBeenNthCalledWith(
      2,
      prisma,
      "capture-transcript-follow-through-room:room-1",
    );
    expect(prisma.transcriptJob.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { resultJson: expect.objectContaining({
        providerEvidence: true,
        followThrough: expect.objectContaining({
          packetBuildId: "packet-1",
          summaryNoteId: "summary-1",
          ordinarySessionWorkCreated: true,
          candidateOnly: false,
          canonicalAccessApplied: true,
          authorPrivate: false,
          automaticAssignment: true,
          automaticSharing: true,
          automaticExternalDelivery: false,
        }),
      }) },
    }));
  });

  it("serializes different participant transcript jobs through the same Session lock", async () => {
    const prisma = transactionalPrisma({
      coachingNote: { findFirst: jest.fn().mockResolvedValue(null) },
      transcriptJob: {
        findUnique: jest.fn(async ({ where }: any) => ({
          roomId: "room-joint",
          requestedBy: where.id === "job-coach" ? "coach-owner" : "client-owner",
          resultJson: {},
          room: {
            createdByUserId: "coach-owner",
            booking: { coachUserId: "coach-owner" },
          },
        })),
        update: jest.fn().mockResolvedValue({ id: "job" }),
      },
    });

    await reconcileCaptureTranscriptFollowThrough({
      prisma,
      transcriptJobId: "job-coach",
    });
    await reconcileCaptureTranscriptFollowThrough({
      prisma,
      transcriptJobId: "job-client",
    });

    expect(acquirePrismaAdvisoryTransactionLock).toHaveBeenNthCalledWith(
      1,
      prisma,
      "capture-transcript-follow-through-job:job-coach",
    );
    expect(acquirePrismaAdvisoryTransactionLock).toHaveBeenNthCalledWith(
      2,
      prisma,
      "capture-transcript-follow-through-room:room-joint",
    );
    expect(acquirePrismaAdvisoryTransactionLock).toHaveBeenNthCalledWith(
      3,
      prisma,
      "capture-transcript-follow-through-job:job-client",
    );
    expect(acquirePrismaAdvisoryTransactionLock).toHaveBeenNthCalledWith(
      4,
      prisma,
      "capture-transcript-follow-through-room:room-joint",
    );
    expect(buildCoachingPacketFromTranscriptJob).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        transcriptJobId: "job-coach",
        authorUserId: "coach-owner",
      }),
    );
    expect(buildCoachingPacketFromTranscriptJob).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        transcriptJobId: "job-client",
        authorUserId: "coach-owner",
      }),
    );
  });

  it.each(["current", "old-template", "explicit-refresh"])("handles a durable ready marker with %s without forcing duplicate work", async (mode) => {
    const ready = {
      packetStatus: "ready",
      packetBuildId: "packet-ready",
      summaryNoteId: "summary-ready",
      ordinarySessionWorkCreated: true,
      candidateOnly: false,
      canonicalAccessApplied: true,
      automaticAssignment: true,
    };
    const prisma = transactionalPrisma({
      coachingNote: {
        findUnique: jest.fn().mockResolvedValue({
          roomId: "room-1",
          sourceJson: {
            packetBuildId: "packet-ready",
            packetTemplateVersion: mode === "old-template" ? "quipsly-session-packet-v5" : SESSION_PACKET_TEMPLATE_VERSION,
            reviewRequired: false,
            transcriptJobId: "job-1",
          },
        }),
      },
      transcriptJob: {
        findUnique: jest.fn()
          .mockResolvedValueOnce({ roomId: "room-1" })
          .mockResolvedValueOnce({
            roomId: "room-1",
            requestedBy: "recording-owner",
            room: { createdByUserId: "room-owner", booking: null },
            resultJson: { followThrough: ready },
          }),
        update: jest.fn().mockResolvedValue({ id: "job-1" }),
      },
    });

    const result = await reconcileCaptureTranscriptFollowThrough({
      prisma,
      transcriptJobId: "job-1",
      refreshExistingPacket: mode === "explicit-refresh",
    });
    if (mode !== "current") {
      expect(result.packetStatus).toBe("ready");
      expect(buildCoachingPacketFromTranscriptJob).toHaveBeenCalledWith(expect.objectContaining({ force: false }));
      return;
    }
    expect(result).toEqual({
      transcriptJobId: "job-1",
      transcriptStatus: "completed",
      packetStatus: "ready",
      packetBuildId: "packet-ready",
      reusedExistingPacket: true,
    });
    expect(buildCoachingPacketFromTranscriptJob).not.toHaveBeenCalled();
    expect(prisma.transcriptJob.update).not.toHaveBeenCalled();
  });

  it("repairs a stale ready marker when a multi-source recap has a different packet build", async () => {
    const prisma = transactionalPrisma({
      coachingNote: {
        findUnique: jest.fn().mockResolvedValue({
          roomId: "room-1",
          sourceJson: {
            packetBuildId: "packet-current",
            reviewRequired: false,
            transcriptSources: [{ transcriptJobId: "job-1" }],
          },
        }),
      },
      transcriptJob: {
        findUnique: jest.fn()
          .mockResolvedValueOnce({ roomId: "room-1" })
          .mockResolvedValueOnce({
            roomId: "room-1",
            requestedBy: "recording-owner",
            room: { createdByUserId: "room-owner", booking: null },
            resultJson: { followThrough: {
              packetStatus: "ready",
              packetBuildId: "packet-stale",
              summaryNoteId: "summary-ready",
              ordinarySessionWorkCreated: true,
              candidateOnly: false,
              canonicalAccessApplied: true,
              automaticAssignment: true,
            } },
          }),
        update: jest.fn().mockResolvedValue({ id: "job-1" }),
      },
    });
    jest.mocked(buildCoachingPacketFromTranscriptJob).mockResolvedValue({
      ok: true,
      packetBuildId: "packet-current",
      summaryNoteId: "summary-ready",
      reusedExistingPacket: true,
    } as any);

    await expect(reconcileCaptureTranscriptFollowThrough({
      prisma,
      transcriptJobId: "job-1",
    })).resolves.toMatchObject({
      packetStatus: "ready",
      packetBuildId: "packet-current",
      reusedExistingPacket: true,
    });
    expect(buildCoachingPacketFromTranscriptJob).toHaveBeenCalled();
    expect(prisma.transcriptJob.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { resultJson: expect.objectContaining({
        followThrough: expect.objectContaining({
          packetBuildId: "packet-current",
          summaryNoteId: "summary-ready",
        }),
      }) },
    }));
  });

  it("retries the complete locked transaction after a database write conflict", async () => {
    const prisma = transactionalPrisma({
      coachingNote: { findFirst: jest.fn().mockResolvedValue({ id: "summary-1", sourceJson: { packetBuildId: "packet-1", reviewRequired: false } }) },
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
