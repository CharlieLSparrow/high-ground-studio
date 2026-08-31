/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { mobileCaptureTranscriptProcessingGate } from "@/lib/server/mobile-capture-processing-gates";
import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/mobile-capture-processing-gates", () => ({ mobileCaptureTranscriptProcessingGate: jest.fn() }));
jest.mock("@/lib/server/prisma-advisory-lock", () => ({ acquirePrismaAdvisoryTransactionLock: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));

const requestId = "c84763f5-ecc3-48f5-b521-ef2227d5a15d";
const sourceSha256 = "a".repeat(64);
const sidecarSha256 = "b".repeat(64);
const configurationHash = "c".repeat(64);

function body(overrides: Record<string, unknown> = {}) {
  return {
    clientRequestId: requestId,
    recordingAssetId: "asset-1",
    sourceSha256,
    sourceByteCount: "1024",
    sidecarSha256,
    language: "en-US",
    recognitionExecution: "on-device",
    engine: {
      framework: "Speech",
      transcriber: "SpeechTranscriber",
      preset: "transcription",
      configurationHash,
      modelAssetStatus: "installed",
    },
    device: {
      appVersion: "1.0",
      appBuild: "42",
      modelIdentifier: "iPhone17,3",
      systemName: "iOS",
      systemVersion: "26.2",
    },
    segments: [
      { startSeconds: 0.2, endSeconds: 1.8, text: "A reviewed source still needs human review." },
      { startSeconds: 2, endSeconds: 3.1, text: "No speaker was inferred." },
    ],
    ...overrides,
  };
}

function post(payload: Record<string, unknown>) {
  return POST(new Request("http://localhost/api/mobile/capture/transcripts/on-device", {
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
    verifiedAt: new Date("2026-08-01T12:00:00.000Z"),
    storageBucket: "capture-bucket",
    storageObjectPath: "recordings/asset-1.m4a",
    checksum: sourceSha256,
    byteSize: BigInt(1024),
    durationSeconds: 10,
    localManifestJson: { storageGeneration: "7" },
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

function installPrisma(args: { asset?: any; prior?: any; fallback?: any } = {}) {
  const create = jest.fn().mockResolvedValue({ id: "job-device-1" });
  const update = jest.fn().mockResolvedValue({ id: args.fallback?.id ?? "job-device-1" });
  const findFirst = jest.fn()
    .mockResolvedValueOnce(args.prior ?? null)
    .mockResolvedValueOnce(args.fallback ?? null);
  const transaction = {
    recordingAsset: { findFirst: jest.fn().mockResolvedValue(args.asset ?? asset()) },
    transcriptJob: {
      findFirst,
      create,
      update,
    },
  };
  const $transaction = jest.fn(async (operation: (transaction: any) => Promise<any>) => operation(transaction));
  jest.mocked(getPrismaClient).mockReturnValue({ $transaction } as any);
  return { transaction, create, update, findFirst, $transaction };
}

describe("on-device transcript ingestion", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "user-1", primaryEmail: " Producer@Example.com ", isStaff: false },
    } as any);
    jest.mocked(mobileCaptureTranscriptProcessingGate).mockResolvedValue({ allowed: true } as any);
  });

  it("creates an immutable, source-bound transcript version without diarization claims", async () => {
    const { transaction, create, $transaction } = installPrisma();

    const response = await post(body());
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload).toMatchObject({
      ok: true,
      status: "COMPLETED",
      provider: "apple-speech-transcriber-on-device",
      transcriptJobId: "job-device-1",
      segmentCount: 2,
      wordCount: 0,
      speakerDiarization: "unavailable",
      humanPlaybackReviewRequired: false,
      directlyEditable: true,
      idempotentReplay: false,
    });
    expect(acquirePrismaAdvisoryTransactionLock).toHaveBeenCalledWith(transaction, "on-device-transcript:asset-1");
    expect(mobileCaptureTranscriptProcessingGate).toHaveBeenCalledWith({ prisma: transaction, recordingAsset: expect.objectContaining({ id: "asset-1" }) });
    expect($transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
      maxWait: 10_000,
      timeout: 30_000,
    });
    expect(transaction.recordingAsset.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "asset-1",
        OR: expect.arrayContaining([
          { room: { project: { accessGrants: { some: { email: "producer@example.com", status: "ACTIVE" } } } } },
        ]),
      }),
      include: {
        participant: {
          select: { id: true, userId: true, displayName: true, email: true },
        },
      },
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        roomId: "room-1",
        assetId: "asset-1",
        status: "COMPLETED",
        provider: "apple-speech-transcriber-on-device",
        language: "en-US",
        requestedBy: "user-1",
        sourceGeneration: "7",
        sourceSha256,
        providerRequestId: `apple-speech:${requestId}`,
        workerBuildId: "42",
        resultJson: expect.objectContaining({
          source: "quipsly-capture-on-device-transcript-v1",
          clientRequestId: requestId,
          sidecarSha256,
          sourceByteCount: "1024",
          recognitionExecution: "on-device",
          providerNetworkRequestMadeByQuipsly: false,
          speakerDiarization: "unavailable",
          humanPlaybackReviewRequired: false,
          directlyEditable: true,
          segmentCount: 2,
          processingControl: {
            version: 1,
            sourceRole: "recording-original",
            consentGateCheckedAt: expect.any(String),
            reconciliationRequiresFreshConsentGate: false,
            routing: expect.objectContaining({
              schema: "quipsly-transcript-routing-summary-v1",
              sourceTopology: "participant-isolated",
              participantLabel: "Coach Homer",
              speakerAuthority: "source-binding",
              provider: "apple-speech-transcriber-on-device",
              model: "SpeechTranscriber · transcription",
              modelRevisionPolicy: "installed",
              language: "en-US",
              diarizationRequested: false,
              timingGranularity: "segment",
              manifestBacked: false,
              providerOutputRemainsImmutable: true,
              configurationHash,
            }),
          },
        }),
        segments: {
          create: [
            expect.objectContaining({ speakerLabel: "Coach Homer", speakerUserId: "user-1", confidence: null, metadataJson: expect.objectContaining({ finalizedResult: true, speakerAttribution: "source-binding", sourceBoundParticipantId: "participant-1", sourceBoundUserId: "user-1", humanPlaybackReviewRequired: false, directlyEditable: true, timingAuthority: "source-media-time" }) }),
            expect.objectContaining({ speakerLabel: "Coach Homer", speakerUserId: "user-1", confidence: null, metadataJson: expect.objectContaining({ finalizedResult: true, speakerAttribution: "source-binding", sourceBoundParticipantId: "participant-1", sourceBoundUserId: "user-1", humanPlaybackReviewRequired: false, directlyEditable: true, timingAuthority: "source-media-time" }) }),
          ],
        },
      }),
      select: { id: true },
    });
  });

  it("does not invent a speaker identity for a mixed source", async () => {
    const { create } = installPrisma({
      asset: asset({
        kind: "SERVER_MIX",
        participantId: null,
        participant: null,
      }),
    });

    const response = await post(body());

    expect(response.status).toBe(201);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        resultJson: expect.objectContaining({
          speakerDiarization: "unavailable",
          processingControl: expect.objectContaining({
            routing: expect.objectContaining({
              sourceTopology: "mixed-room",
              participantLabel: null,
              speakerAuthority: "unresolved",
              diarizationRequested: false,
            }),
          }),
        }),
        segments: {
          create: expect.arrayContaining([
            expect.objectContaining({
              speakerLabel: null,
              metadataJson: expect.objectContaining({ speakerAttribution: "unresolved" }),
            }),
          ]),
        },
      }),
    }));
  });

  it("completes the untouched canonical fallback job instead of leaving duplicate paid-ASR work", async () => {
    const { create, update, findFirst } = installPrisma({
      fallback: { id: "canonical-fallback-job" },
    });

    const response = await post(body());
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload).toMatchObject({
      ok: true,
      transcriptJobId: "canonical-fallback-job",
      provider: "apple-speech-transcriber-on-device",
    });
    expect(findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        assetId: "asset-1",
        status: "QUEUED",
        provider: "pending",
        providerRequestId: null,
        segments: { none: {} },
        words: { none: {} },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: "canonical-fallback-job" },
      data: expect.objectContaining({
        status: "COMPLETED",
        provider: "apple-speech-transcriber-on-device",
        providerRequestId: `apple-speech:${requestId}`,
        segments: { create: expect.any(Array) },
      }),
      select: { id: true },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects device text for another participant's isolated source", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "user-coach", primaryEmail: "coach@example.test", isStaff: false },
    } as any);
    const { create } = installPrisma({
      asset: asset({
        participant: {
          id: "participant-1",
          userId: "user-client",
          displayName: "Practice Client",
          email: "client@example.test",
        },
      }),
    });

    const response = await post(body());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      errorCode: "ON_DEVICE_TRANSCRIPT_PARTICIPANT_MISMATCH",
    });
    expect(create).not.toHaveBeenCalled();
    expect(mobileCaptureTranscriptProcessingGate).not.toHaveBeenCalled();
  });

  it("preserves Apple speech-service execution without calling it on-device or Quipsly cloud ASR", async () => {
    const { create } = installPrisma();

    const response = await post(body({
      recognitionExecution: "apple-speech-service",
      engine: {
        framework: "Speech",
        transcriber: "SFSpeechRecognizer",
        preset: "url-final-time-indexed-apple-service-v1",
        configurationHash,
        modelAssetStatus: "apple-service",
      },
    }));
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload).toMatchObject({
      ok: true,
      provider: "apple-speech-recognizer-service",
      transcriptJobId: "job-device-1",
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        provider: "apple-speech-recognizer-service",
        resultJson: expect.objectContaining({
          recognitionExecution: "apple-speech-service",
          providerNetworkRequestMadeByQuipsly: false,
          processingControl: expect.objectContaining({
            routing: expect.objectContaining({
              provider: "apple-speech-recognizer-service",
              model: "SFSpeechRecognizer · url-final-time-indexed-apple-service-v1",
            }),
          }),
        }),
      }),
    }));
  });

  it("infers execution for an older Capture build but rejects contradictory execution evidence", async () => {
    installPrisma();
    const legacy = await post(body({ recognitionExecution: undefined }));
    await expect(legacy.json()).resolves.toMatchObject({
      ok: true,
      provider: "apple-speech-transcriber-on-device",
    });

    installPrisma();
    const contradiction = await post(body({
      recognitionExecution: "on-device",
      engine: {
        framework: "Speech",
        transcriber: "SFSpeechRecognizer",
        preset: "url-final-time-indexed-apple-service-v1",
        configurationHash,
        modelAssetStatus: "apple-service",
      },
    }));
    expect(contradiction.status).toBe(409);
    await expect(contradiction.json()).resolves.toMatchObject({
      ok: false,
      errorCode: "APPLE_SPEECH_EXECUTION_MISMATCH",
    });
  });

  it("replays the exact request without creating another transcript version", async () => {
    const first = installPrisma();
    const firstResponse = await post(body());
    expect(firstResponse.status).toBe(201);
    const createdInputHash = first.create.mock.calls[0][0].data.resultJson.inputSha256;

    const { create } = installPrisma({
      prior: {
        id: "job-device-1",
        resultJson: { inputSha256: createdInputHash },
        _count: { segments: 2, words: 0 },
      },
    });
    const replay = await post(body());
    const payload = await replay.json();

    expect(replay.status).toBe(200);
    expect(payload).toMatchObject({ ok: true, transcriptJobId: "job-device-1", idempotentReplay: true, segmentCount: 2 });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects reuse of a request ID for changed transcript evidence", async () => {
    const { create } = installPrisma({
      prior: { id: "job-device-1", resultJson: { inputSha256: "d".repeat(64) }, _count: { segments: 2, words: 0 } },
    });
    const response = await post(body());
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ ok: false, errorCode: "ON_DEVICE_TRANSCRIPT_IDEMPOTENCY_CONFLICT" });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects a local transcript whose bytes do not match the verified cloud asset", async () => {
    const { create } = installPrisma({ asset: asset({ checksum: "e".repeat(64) }) });
    const response = await post(body());
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ ok: false, errorCode: "ON_DEVICE_TRANSCRIPT_SOURCE_MISMATCH" });
    expect(mobileCaptureTranscriptProcessingGate).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects an empty source before reading recording state", async () => {
    const response = await post(body({ sourceByteCount: "0" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      errorCode: "ON_DEVICE_TRANSCRIPT_SOURCE_EVIDENCE_INVALID",
    });
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("rechecks current transcription consent inside the transaction", async () => {
    const { create } = installPrisma();
    jest.mocked(mobileCaptureTranscriptProcessingGate).mockResolvedValue({
      allowed: false,
      errorCode: "CURRENT_ALL_PARTY_TRANSCRIPTION_CONSENT_REQUIRED",
      error: "Current all-party transcription consent is required before transcript processing or disclosure.",
    } as any);

    const response = await post(body());
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      errorCode: "CURRENT_ALL_PARTY_TRANSCRIPTION_CONSENT_REQUIRED",
      explicitReleaseRequired: true,
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects volatile, empty, unordered, or out-of-range segment evidence", async () => {
    for (const segments of [
      [],
      [{ startSeconds: 1, endSeconds: 1, text: "No duration" }],
      [{ startSeconds: 2, endSeconds: 3, text: "Later" }, { startSeconds: 1, endSeconds: 1.5, text: "Earlier" }],
      [{ startSeconds: 0, endSeconds: 16, text: "Past the source" }],
      [{ startSeconds: 0, endSeconds: 1, text: "   " }],
    ]) {
      installPrisma();
      const response = await post(body({ segments }));
      expect([400, 409]).toContain(response.status);
      const payload = await response.json();
      expect(payload.ok).toBe(false);
    }
  });

  it("requires authentication before reading or persisting transcript evidence", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null as any);
    const response = await post(body());
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ ok: false, errorCode: "AUTHENTICATION_REQUIRED" });
    expect(getPrismaClient).not.toHaveBeenCalled();
  });
});
