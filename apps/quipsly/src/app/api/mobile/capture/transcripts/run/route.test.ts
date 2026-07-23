/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { runCaptureTranscriptJob } from "@/lib/server/capture-transcripts";
import { mobileCaptureTranscriptProcessingGate } from "@/lib/server/mobile-capture-processing-gates";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/capture-transcripts", () => ({
  runCaptureTranscriptJob: jest.fn(),
  transcriptRetryDisposition: jest.requireActual("@/lib/server/capture-transcripts").transcriptRetryDisposition,
}));
jest.mock("@/lib/server/mobile-capture-processing-gates", () => ({ mobileCaptureTranscriptProcessingGate: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));

describe("mobile transcript run versioning", () => {
  beforeEach(() => jest.clearAllMocks());

  it("creates a new transcript job instead of requeueing a segment-bearing version", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "user-1", primaryEmail: " Producer@Example.com ", isStaff: false },
    } as any);
    jest.mocked(mobileCaptureTranscriptProcessingGate).mockResolvedValue({ allowed: true } as any);
    jest.mocked(runCaptureTranscriptJob).mockResolvedValue({ ok: true, transcriptJobId: "job-v2", status: "COMPLETED", provider: "deepgram", segmentCount: 2 } as any);
    const create = jest.fn().mockResolvedValue({ id: "job-v2" });
    const update = jest.fn();
    const recordingFindFirst = jest.fn().mockResolvedValue({ id: "asset-1", roomId: "room-1", kind: "LOCAL_AUDIO", localManifestJson: {}, transcriptJobs: [{ id: "job-v1", status: "FAILED", _count: { segments: 2 } }] });
    const transcriptFindFirst = jest.fn().mockResolvedValue({ id: "job-v2" });
    jest.mocked(getPrismaClient).mockReturnValue({
      recordingAsset: { findFirst: recordingFindFirst },
      transcriptJob: { create, update, findFirst: transcriptFindFirst },
    } as any);

    const response = await POST(new Request("http://localhost/api/mobile/capture/transcripts/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ recordingAssetId: "asset-1" }) }));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ ok: true, transcriptJobId: "job-v2", ensuredFromRecording: true });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ roomId: "room-1", assetId: "asset-1", resultJson: expect.objectContaining({ versionedFromTranscriptJobId: "job-v1", immutablePriorSegmentCount: 2 }) }) }));
    expect(update).not.toHaveBeenCalled();
    expect(runCaptureTranscriptJob).toHaveBeenCalledWith(expect.objectContaining({ transcriptJobId: "job-v2" }));
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
    jest.mocked(runCaptureTranscriptJob).mockResolvedValue({ ok: true, transcriptJobId: "job-v1", status: "COMPLETED", segmentCount: 2 } as any);
    const update = jest.fn().mockResolvedValue({ id: "job-v1" });
    const create = jest.fn();
    jest.mocked(getPrismaClient).mockReturnValue({
      recordingAsset: { findFirst: jest.fn().mockResolvedValue({ id: "asset-1", roomId: "room-1", kind: "LOCAL_AUDIO", localManifestJson: {}, transcriptJobs: [{ id: "job-v1", status: "FAILED", _count: { segments: 0 } }] }) },
      transcriptJob: { create, update, findFirst: jest.fn().mockResolvedValue({ id: "job-v1" }) },
    } as any);
    const response = await POST(new Request("http://localhost/api/mobile/capture/transcripts/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ recordingAssetId: "asset-1" }) }));
    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "job-v1" }, data: expect.objectContaining({ status: "QUEUED" }) }));
    expect(create).not.toHaveBeenCalled();
  });
});
