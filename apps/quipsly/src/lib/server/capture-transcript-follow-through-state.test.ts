/** @jest-environment node */

jest.mock("server-only", () => ({}));

import {
  CAPTURE_TRANSCRIPT_FOLLOW_THROUGH_STALE_SCHEMA,
  markCaptureTranscriptFollowThroughStale,
} from "./capture-transcript-follow-through-state";

describe("capture transcript follow-through state", () => {
  it("preserves provider evidence while making materialized work discoverably stale", async () => {
    const update = jest.fn().mockResolvedValue({ id: "job-1" });
    const prisma = {
      transcriptJob: {
        findUnique: jest.fn().mockResolvedValue({
          resultJson: {
            providerEvidence: { requestId: "provider-1" },
            followThrough: {
              packetStatus: "ready",
              packetBuildId: "packet-1",
              summaryNoteId: "summary-1",
              ordinarySessionWorkCreated: true,
            },
          },
        }),
        update,
      },
    };

    await expect(markCaptureTranscriptFollowThroughStale({
      prisma,
      transcriptJobId: "job-1",
      reason: "accepted-transcript-correction",
      changedAt: new Date("2026-09-01T13:00:00.000Z"),
    })).resolves.toEqual({ marked: true, status: "stale" });
    expect(update).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: {
        resultJson: {
          providerEvidence: { requestId: "provider-1" },
          followThrough: {
            packetStatus: "stale",
            packetBuildId: "packet-1",
            summaryNoteId: "summary-1",
            ordinarySessionWorkCreated: true,
            stale: {
              schema: CAPTURE_TRANSCRIPT_FOLLOW_THROUGH_STALE_SCHEMA,
              reason: "accepted-transcript-correction",
              changedAt: "2026-09-01T13:00:00.000Z",
              durableWorkerRebuildRequired: true,
            },
          },
        },
      },
    });
  });

  it("does not invent stale materialization before ordinary Session work exists", async () => {
    const update = jest.fn();
    const prisma = {
      transcriptJob: {
        findUnique: jest.fn().mockResolvedValue({
          resultJson: { providerEvidence: true },
        }),
        update,
      },
    };

    await expect(markCaptureTranscriptFollowThroughStale({
      prisma,
      transcriptJobId: "job-1",
      reason: "confirmed-transcript-segment",
    })).resolves.toEqual({ marked: false, status: "not-materialized" });
    expect(update).not.toHaveBeenCalled();
  });

  it("reuses the same durable stale marker without another write", async () => {
    const update = jest.fn();
    const prisma = {
      transcriptJob: {
        findUnique: jest.fn().mockResolvedValue({
          resultJson: {
            followThrough: {
              packetStatus: "stale",
              packetBuildId: "packet-1",
              stale: { reason: "accepted-speaker-attribution" },
            },
          },
        }),
        update,
      },
    };

    await expect(markCaptureTranscriptFollowThroughStale({
      prisma,
      transcriptJobId: "job-1",
      reason: "accepted-speaker-attribution",
    })).resolves.toEqual({ marked: false, status: "stale" });
    expect(update).not.toHaveBeenCalled();
  });
});
