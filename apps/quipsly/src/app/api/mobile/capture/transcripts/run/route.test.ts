/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { mobileCaptureTranscriptProcessingGate } from "@/lib/server/mobile-capture-processing-gates";
import { ensureCaptureTranscriptProcessingQueued } from "@/lib/server/capture-transcript-processing";
import { reconcileCaptureTranscriptJob } from "@/lib/server/capture-transcript-reconciliation";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/capture-transcripts", () => ({
  transcriptRetryDisposition: jest.requireActual("@/lib/server/capture-transcripts").transcriptRetryDisposition,
}));
jest.mock("@/lib/server/capture-transcript-processing", () => ({
  CaptureTranscriptOutboxError: class CaptureTranscriptOutboxError extends Error {
    code: string;

    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
  ensureCaptureTranscriptProcessingQueued: jest.fn(),
}));
jest.mock("@/lib/server/capture-transcript-reconciliation", () => ({
  reconcileCaptureTranscriptJob: jest.fn(),
}));
jest.mock("@/lib/server/mobile-capture-processing-gates", () => ({ mobileCaptureTranscriptProcessingGate: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));

describe("mobile transcript run versioning", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(reconcileCaptureTranscriptJob).mockResolvedValue({
      status: "pending",
      transcriptJobId: "job-v2",
      message: null,
    });
    jest.mocked(ensureCaptureTranscriptProcessingQueued).mockResolvedValue({
      status: "queued",
      transcriptJobId: "job-v2",
      queueObjectName: "queue",
      manifestObjectName: "manifest",
      resultObjectName: "result",
      executionRequested: true,
    });
  });

  it("creates a new transcript job instead of requeueing a segment-bearing version", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "user-1", primaryEmail: " Producer@Example.com ", isStaff: false },
    } as any);
    jest.mocked(mobileCaptureTranscriptProcessingGate).mockResolvedValue({ allowed: true } as any);
    const create = jest.fn().mockResolvedValue({ id: "job-v2" });
    const update = jest.fn();
    const recordingFindFirst = jest.fn().mockResolvedValue({ id: "asset-1", roomId: "room-1", kind: "LOCAL_AUDIO", localManifestJson: {}, transcriptJobs: [{ id: "job-v1", status: "FAILED", _count: { segments: 2, words: 8 } }] });
    const transcriptFindFirst = jest.fn().mockResolvedValue({ id: "job-v2" });
    jest.mocked(getPrismaClient).mockReturnValue({
      recordingAsset: { findFirst: recordingFindFirst },
      transcriptJob: { create, update, findFirst: transcriptFindFirst },
    } as any);

    const response = await POST(new Request("http://localhost/api/mobile/capture/transcripts/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ recordingAssetId: "asset-1" }) }));
    const payload = await response.json();
    expect(response.status).toBe(202);
    expect(payload).toMatchObject({ ok: true, transcriptJobId: "job-v2", ensuredFromRecording: true });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ roomId: "room-1", assetId: "asset-1", resultJson: expect.objectContaining({ versionedFromTranscriptJobId: "job-v1", immutablePriorSegmentCount: 2, immutablePriorWordCount: 8 }) }) }));
    expect(update).not.toHaveBeenCalled();
    expect(ensureCaptureTranscriptProcessingQueued).toHaveBeenCalledWith(expect.objectContaining({
      transcriptJobId: "job-v2",
      actorUserId: "user-1",
      actorEmail: "producer@example.com",
    }));
    const projectGrantRoom = {
      project: {
        accessGrants: {
          some: {
            email: "producer@example.com",
            status: "ACTIVE",
          },
        },
      },
    };
    expect(recordingFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([{ room: projectGrantRoom }]),
      }),
    }));
    expect(transcriptFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([{ room: projectGrantRoom }]),
      }),
    }));
  });

  it("requeues a failed job only while it has no provider segments", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: { id: "user-1", isStaff: false } } as any);
    jest.mocked(mobileCaptureTranscriptProcessingGate).mockResolvedValue({ allowed: true } as any);
    jest.mocked(reconcileCaptureTranscriptJob).mockResolvedValue({
      status: "pending",
      transcriptJobId: "job-v1",
      message: null,
    });
    jest.mocked(ensureCaptureTranscriptProcessingQueued).mockResolvedValue({
      status: "queued",
      transcriptJobId: "job-v1",
      queueObjectName: "queue",
      manifestObjectName: "manifest",
      resultObjectName: "result",
      executionRequested: true,
    });
    const update = jest.fn().mockResolvedValue({ id: "job-v1" });
    const create = jest.fn();
    jest.mocked(getPrismaClient).mockReturnValue({
      recordingAsset: { findFirst: jest.fn().mockResolvedValue({ id: "asset-1", roomId: "room-1", kind: "LOCAL_AUDIO", localManifestJson: {}, transcriptJobs: [{ id: "job-v1", status: "FAILED", _count: { segments: 0, words: 0 } }] }) },
      transcriptJob: { create, update, findFirst: jest.fn().mockResolvedValue({ id: "job-v1" }) },
    } as any);
    const response = await POST(new Request("http://localhost/api/mobile/capture/transcripts/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ recordingAssetId: "asset-1" }) }));
    expect(response.status).toBe(202);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "job-v1" }, data: expect.objectContaining({ status: "QUEUED" }) }));
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects a provider receipt slot before creating or executing transcript work", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "user-1", primaryEmail: "producer@example.com", isStaff: false },
    } as any);
    const create = jest.fn();
    const update = jest.fn();
    jest.mocked(getPrismaClient).mockReturnValue({
      recordingAsset: {
        findFirst: jest.fn().mockResolvedValue({
          id: "receipt-slot-1",
          roomId: "room-1",
          kind: "SERVER_MIX",
          localManifestJson: {
            source: "provider-recording-receipt-slot",
          },
          transcriptJobs: [],
        }),
      },
      transcriptJob: {
        create,
        update,
        findFirst: jest.fn(),
      },
    } as any);

    const response = await POST(new Request(
      "http://localhost/api/mobile/capture/transcripts/run",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recordingAssetId: "receipt-slot-1" }),
      },
    ));
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload).toEqual({
      ok: false,
      error: "Provider recording receipt slots are not media. Attach verified provider recording media before transcription.",
    });
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(mobileCaptureTranscriptProcessingGate).not.toHaveBeenCalled();
    expect(reconcileCaptureTranscriptJob).not.toHaveBeenCalled();
    expect(ensureCaptureTranscriptProcessingQueued).not.toHaveBeenCalled();
  });
});
