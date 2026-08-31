/** @jest-environment node */

jest.mock("server-only", () => ({}));

import { createHash } from "node:crypto";

import { getPrismaClient } from "@/lib/prisma";
import { ensureCaptureTranscriptProcessingQueued } from "@/lib/server/capture-transcript-processing";
import { mobileCaptureTranscriptProcessingGate } from "@/lib/server/mobile-capture-processing-gates";
import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/capture-transcript-processing", () => ({
  ensureCaptureTranscriptProcessingQueued: jest.fn(),
}));
jest.mock("@/lib/server/mobile-capture-processing-gates", () => ({
  mobileCaptureTranscriptProcessingGate: jest.fn(),
}));
jest.mock("@/lib/server/prisma-advisory-lock", () => ({
  acquirePrismaAdvisoryTransactionLock: jest.fn(),
}));
jest.mock("@/lib/server/quipsly-session", () => ({
  getQuipslySessionFromRequest: jest.fn(),
}));

const requestId = "c84763f5-ecc3-48f5-b521-ef2227d5a15d";
const sourceSha256 = "a".repeat(64);

function body(overrides: Record<string, unknown> = {}) {
  return {
    clientRequestId: requestId,
    recordingAssetId: "asset-1",
    sourceSha256,
    sourceByteCount: "1024",
    reasonCode: "apple-speech-unsupported-locale",
    ...overrides,
  };
}

function post(payload: Record<string, unknown>) {
  return POST(new Request("http://localhost/api/mobile/capture/transcripts/cloud-fallback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }));
}

function asset(overrides: Record<string, unknown> = {}) {
  return {
    id: "asset-1",
    roomId: "room-1",
    kind: "LOCAL_AUDIO",
    status: "VERIFIED",
    verifiedAt: new Date("2026-08-30T12:00:00.000Z"),
    storageBucket: "capture-bucket",
    storageObjectPath: "recordings/asset-1.m4a",
    checksum: sourceSha256,
    byteSize: BigInt(1024),
    participantId: "participant-1",
    participant: {
      id: "participant-1",
      userId: "user-1",
      displayName: "Coach Homer",
      email: "homer@example.test",
    },
    ...overrides,
  };
}

function installPrisma(input: {
  asset?: any;
  completed?: any;
  job?: any;
} = {}) {
  const update = jest.fn().mockResolvedValue({ id: input.job?.id ?? "fallback-job-1" });
  const create = jest.fn().mockResolvedValue({
    id: "fallback-job-created",
    roomId: "room-1",
    assetId: "asset-1",
    status: "QUEUED",
    provider: "pending",
    resultJson: { source: "mobile-capture-device-fallback" },
  });
  const findFirst = jest.fn()
    .mockResolvedValueOnce(input.completed ?? null)
    .mockResolvedValueOnce(input.job ?? {
      id: "fallback-job-1",
      status: "QUEUED",
      provider: "pending",
      resultJson: { source: "mobile-capture-ingest" },
    });
  const transaction = {
    recordingAsset: { findFirst: jest.fn().mockResolvedValue(input.asset ?? asset()) },
    transcriptJob: { findFirst, update, create },
  };
  const prisma = {
    $transaction: jest.fn(async (operation: (tx: any) => Promise<any>) => operation(transaction)),
  };
  jest.mocked(getPrismaClient).mockReturnValue(prisma as any);
  return { prisma, transaction, findFirst, update, create };
}

describe("device transcript cloud fallback", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "user-1", primaryEmail: " Coach@Example.Test ", isStaff: false },
    } as any);
    jest.mocked(mobileCaptureTranscriptProcessingGate).mockResolvedValue({ allowed: true } as any);
    jest.mocked(ensureCaptureTranscriptProcessingQueued).mockResolvedValue({
      status: "queued",
      transcriptJobId: "fallback-job-1",
      queueObjectName: "queue.json",
      manifestObjectName: "manifest.json",
      resultObjectName: "result.json",
      executionRequested: true,
    });
  });

  it("queues the one canonical fallback only after a recorded device failure", async () => {
    const { prisma, transaction, update } = installPrisma();

    const response = await post(body());
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload).toMatchObject({
      ok: true,
      status: "queued",
      transcriptJobId: "fallback-job-1",
      providerExecutionRequested: true,
      idempotentReplay: false,
      fallbackReasonCode: "apple-speech-unsupported-locale",
    });
    expect(acquirePrismaAdvisoryTransactionLock).toHaveBeenCalledWith(
      transaction,
      "cloud-transcript-fallback:asset-1",
    );
    expect(update).toHaveBeenCalledWith({
      where: { id: "fallback-job-1" },
      data: expect.objectContaining({
        requestedBy: "user-1",
        resultJson: expect.objectContaining({
          source: "mobile-capture-device-fallback",
          deviceCloudFallback: expect.objectContaining({
            schema: "quipsly-device-cloud-transcript-fallback-v1",
            clientRequestId: requestId,
            reasonCode: "apple-speech-unsupported-locale",
            requestedByUserId: "user-1",
            sourceSha256,
            sourceByteCount: "1024",
            speculative: false,
            deviceAttemptFailedFirst: true,
          }),
        }),
      }),
    });
    expect(ensureCaptureTranscriptProcessingQueued).toHaveBeenCalledWith({
      prisma,
      transcriptJobId: "fallback-job-1",
      actorUserId: "user-1",
      actorEmail: "coach@example.test",
    });
  });

  it("does not purchase cloud ASR after any exact-source transcript already completed", async () => {
    installPrisma({
      completed: {
        id: "device-job",
        provider: "apple-speech-transcriber-on-device",
      },
    });

    const response = await post(body());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      status: "COMPLETED",
      transcriptJobId: "device-job",
      deviceCompleted: true,
      providerExecutionRequested: false,
    });
    expect(ensureCaptureTranscriptProcessingQueued).not.toHaveBeenCalled();
  });

  it("replays the same durable fallback without rewriting or creating another job", async () => {
    const requestFingerprint = createHash("sha256")
      .update(JSON.stringify({
        recordingAssetId: "asset-1",
        sourceSha256,
        sourceByteCount: "1024",
        reasonCode: "apple-speech-unsupported-locale",
      }), "utf8")
      .digest("hex");
    const { update, create } = installPrisma({
      job: {
        id: "fallback-job-1",
        status: "RUNNING",
        provider: "deepgram",
        resultJson: {
          source: "capture-transcript-background-worker",
          deviceCloudFallback: {
            schema: "quipsly-device-cloud-transcript-fallback-v1",
            requestFingerprint,
            deviceAttemptFailedFirst: true,
            speculative: false,
          },
        },
      },
    });

    const response = await post(body());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      transcriptJobId: "fallback-job-1",
      idempotentReplay: true,
    });
    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(ensureCaptureTranscriptProcessingQueued).toHaveBeenCalledTimes(1);
  });

  it("rejects fallback for another participant's isolated source", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "user-coach", primaryEmail: "coach@example.test", isStaff: false },
    } as any);
    const { update, create } = installPrisma({
      asset: asset({ participant: { ...asset().participant, userId: "user-client" } }),
    });

    const response = await post(body());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      errorCode: "CLOUD_FALLBACK_PARTICIPANT_MISMATCH",
    });
    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(ensureCaptureTranscriptProcessingQueued).not.toHaveBeenCalled();
  });

  it("rejects a fallback request that does not match the verified source bytes", async () => {
    const { update } = installPrisma();

    const response = await post(body({ sourceSha256: "b".repeat(64) }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      errorCode: "CLOUD_FALLBACK_SOURCE_MISMATCH",
    });
    expect(update).not.toHaveBeenCalled();
    expect(ensureCaptureTranscriptProcessingQueued).not.toHaveBeenCalled();
  });
});
