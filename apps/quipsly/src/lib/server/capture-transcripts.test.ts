/** @jest-environment node */

import { mobileCaptureTranscriptProcessingGate } from "@/lib/server/mobile-capture-processing-gates";
import { readMobileCaptureObjectBytes } from "@/lib/server/mobile-capture-object-reader";

import { runCaptureTranscriptJob, transcriptRetryDisposition } from "./capture-transcripts";

jest.mock("@/lib/server/mobile-capture-processing-gates", () => ({ mobileCaptureTranscriptProcessingGate: jest.fn() }));
jest.mock("@/lib/server/mobile-capture-object-reader", () => ({ readMobileCaptureObjectBytes: jest.fn() }));

describe("immutable transcript versioning", () => {
  const originalProvider = process.env.CAPTURE_TRANSCRIPT_PROVIDER;
  const originalDeepgramApiKey = process.env.DEEPGRAM_API_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(readMobileCaptureObjectBytes).mockReset();
  });

  afterAll(() => {
    if (originalProvider === undefined) delete process.env.CAPTURE_TRANSCRIPT_PROVIDER;
    else process.env.CAPTURE_TRANSCRIPT_PROVIDER = originalProvider;
    if (originalDeepgramApiKey === undefined) delete process.env.DEEPGRAM_API_KEY;
    else process.env.DEEPGRAM_API_KEY = originalDeepgramApiKey;
  });

  it("creates a new version when a failed or held job already has provider segments", () => {
    expect(transcriptRetryDisposition({ status: "FAILED", segmentCount: 3 })).toBe("CREATE_VERSION");
    expect(transcriptRetryDisposition({ status: "HELD", segmentCount: 1 })).toBe("CREATE_VERSION");
    expect(transcriptRetryDisposition({ status: "FAILED", segmentCount: 0 })).toBe("REQUEUE");
    expect(transcriptRetryDisposition({ status: "QUEUED", segmentCount: 0 })).toBe("REUSE");
    expect(transcriptRetryDisposition(null)).toBe("CREATE");
  });

  it("holds a segment-bearing version before media download or provider work", async () => {
    const update = jest.fn().mockResolvedValue({});
    const prisma = {
      transcriptJob: {
        findUnique: jest.fn().mockResolvedValue({
          id: "job-1", assetId: "asset-1", status: "FAILED", provider: "deepgram", requestedBy: "user-1",
          room: {}, asset: { id: "asset-1" },
          segments: [{ id: "segment-1", _count: { corrections: 0 } }],
        }),
        update,
      },
      $transaction: jest.fn(),
    };
    const result = await runCaptureTranscriptJob({ prisma, transcriptJobId: "job-1", requestedByUserId: "user-1" });
    expect(result).toMatchObject({ ok: false, errorCode: "TRANSCRIPT_VERSION_IMMUTABLE", createNewVersion: true, recordingAssetId: "asset-1", status: 409 });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "HELD" }) }));
    expect(mobileCaptureTranscriptProcessingGate).not.toHaveBeenCalled();
    expect(readMobileCaptureObjectBytes).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("uses the same immutable gate when corrections already exist", async () => {
    const prisma = {
      transcriptJob: {
        findUnique: jest.fn().mockResolvedValue({ id: "job-1", assetId: "asset-1", status: "HELD", provider: "deepgram", requestedBy: null, room: {}, asset: {}, segments: [{ id: "segment-1", _count: { corrections: 2 } }] }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const result = await runCaptureTranscriptJob({ prisma, transcriptJobId: "job-1" });
    expect(result).toMatchObject({ errorCode: "TRANSCRIPT_VERSION_IMMUTABLE", createNewVersion: true });
    expect(result.error).toContain("correction history");
  });

  it("fails closed instead of leaving a job running when source integrity cannot be verified", async () => {
    process.env.CAPTURE_TRANSCRIPT_PROVIDER = "deepgram";
    process.env.DEEPGRAM_API_KEY = "test-key";
    jest.mocked(mobileCaptureTranscriptProcessingGate).mockResolvedValue({ allowed: true } as any);
    jest.mocked(readMobileCaptureObjectBytes).mockRejectedValue(new Error("hash mismatch"));
    const update = jest.fn().mockResolvedValue({});
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      transcriptJob: {
        findUnique: jest.fn().mockResolvedValue({
          id: "job-1",
          assetId: "asset-1",
          status: "QUEUED",
          provider: "pending",
          requestedBy: "user-1",
          room: {},
          asset: {
            id: "asset-1",
            kind: "LOCAL_AUDIO",
            status: "VERIFIED",
            storageBucket: "capture-production",
            storageObjectPath: "raw/take.m4a",
            byteSize: 1024n,
            checksum: "a".repeat(64),
            contentType: "audio/m4a",
            localManifestJson: {},
          },
          segments: [],
        }),
        update,
        updateMany,
      },
      $transaction: jest.fn(),
    };

    const result = await runCaptureTranscriptJob({
      prisma,
      transcriptJobId: "job-1",
      requestedByUserId: "user-1",
    });

    expect(result).toMatchObject({
      ok: false,
      errorCode: "TRANSCRIPT_SOURCE_INTEGRITY_FAILED",
      status: 409,
    });
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "job-1", status: "QUEUED" },
      data: expect.objectContaining({ status: "RUNNING" }),
    }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "FAILED" }),
    }));
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("lets only one request claim a queued provider job", async () => {
    process.env.CAPTURE_TRANSCRIPT_PROVIDER = "deepgram";
    process.env.DEEPGRAM_API_KEY = "test-key";
    jest.mocked(mobileCaptureTranscriptProcessingGate).mockResolvedValue({ allowed: true } as any);
    const update = jest.fn();
    const prisma = {
      transcriptJob: {
        findUnique: jest.fn().mockResolvedValue({
          id: "job-1",
          assetId: "asset-1",
          status: "QUEUED",
          provider: "pending",
          requestedBy: "user-1",
          room: {},
          asset: {
            id: "asset-1",
            kind: "LOCAL_AUDIO",
            status: "VERIFIED",
            storageBucket: "capture-production",
            storageObjectPath: "raw/take.m4a",
            byteSize: 1024n,
            checksum: "a".repeat(64),
            contentType: "audio/m4a",
            localManifestJson: {},
          },
          segments: [],
        }),
        update,
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: jest.fn(),
    };

    const result = await runCaptureTranscriptJob({
      prisma,
      transcriptJobId: "job-1",
      requestedByUserId: "user-1",
    });

    expect(result).toMatchObject({
      ok: false,
      errorCode: "TRANSCRIPT_JOB_ALREADY_CLAIMED",
      status: 409,
    });
    expect(readMobileCaptureObjectBytes).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
