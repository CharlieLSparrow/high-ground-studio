/** @jest-environment node */

import { ensureCaptureTranscriptProcessingQueued } from "./capture-transcript-processing";
import { runExpiredDeviceTranscriptFallbackMaintenance } from "./capture-device-transcript-fallback-worker";
import { captureDeviceTranscriptExpectation } from "./capture-device-transcript-expectation";

jest.mock("server-only", () => ({}));
jest.mock("./capture-transcript-processing", () => ({
  ensureCaptureTranscriptProcessingQueued: jest.fn(),
}));

function candidate(id: string, fallbackAfter: string) {
  const expectedAt = new Date(new Date(fallbackAfter).getTime() - 1_800_000);
  return {
    id,
    resultJson: {
      deviceTranscriptExpectation: captureDeviceTranscriptExpectation({
        actorUserId: `user-${id}`,
        actorEmail: `${id}@example.test`,
        now: expectedAt,
      }),
    },
  };
}

describe("expired device transcript fallback worker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(ensureCaptureTranscriptProcessingQueued).mockResolvedValue({
      status: "queued",
      transcriptJobId: "job-expired",
      queueObjectName: "queue/job-expired.json",
      manifestObjectName: "manifest/job-expired.json",
      resultObjectName: "result/job-expired.json",
      executionRequested: true,
    });
  });

  it("queues only expired promises through the canonical integrity and consent gate", async () => {
    const prisma = {
      transcriptJob: {
        findMany: jest.fn().mockResolvedValue([
          candidate("job-expired", "2026-09-01T11:59:00.000Z"),
          candidate("job-future", "2026-09-01T12:30:00.000Z"),
        ]),
      },
    };

    await expect(runExpiredDeviceTranscriptFallbackMaintenance({
      prisma,
      limit: 8,
      now: new Date("2026-09-01T12:00:00.000Z"),
    })).resolves.toMatchObject({
      scanned: 2,
      deferred: 1,
      expired: 1,
      attempted: 1,
      queued: 1,
      failed: 0,
    });
    expect(prisma.transcriptJob.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: "QUEUED",
        provider: "pending",
      }),
      take: 200,
    }));
    expect(ensureCaptureTranscriptProcessingQueued).toHaveBeenCalledWith({
      prisma,
      transcriptJobId: "job-expired",
      actorUserId: "user-job-expired",
      actorEmail: "job-expired@example.test",
    });
  });

  it("isolates a transient queue failure for the next maintenance pass", async () => {
    const prisma = {
      transcriptJob: {
        findMany: jest.fn().mockResolvedValue([
          candidate("job-expired", "2026-09-01T11:59:00.000Z"),
        ]),
      },
    };
    jest.mocked(ensureCaptureTranscriptProcessingQueued).mockRejectedValueOnce(
      new Error("temporary provider outage"),
    );

    await expect(runExpiredDeviceTranscriptFallbackMaintenance({
      prisma,
      limit: 8,
      now: new Date("2026-09-01T12:00:00.000Z"),
    })).resolves.toMatchObject({
      expired: 1,
      attempted: 1,
      queued: 0,
      failed: 1,
      results: [{ transcriptJobId: "job-expired", status: "failed", retryable: true }],
    });
  });
});
