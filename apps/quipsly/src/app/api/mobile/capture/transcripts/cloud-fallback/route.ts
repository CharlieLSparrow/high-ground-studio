import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import {
  ensureCaptureTranscriptProcessingQueued,
} from "@/lib/server/capture-transcript-processing";
import { mobileCaptureTranscriptProcessingGate } from "@/lib/server/mobile-capture-processing-gates";
import {
  mobileCaptureTranscriptAccessibleAssetWhere,
  mobileCaptureTranscriptParticipantMismatch,
} from "@/lib/server/mobile-capture-transcript-device-access";
import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

const MAXIMUM_REQUEST_BYTES = 32 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const DEVICE_PROVIDERS = [
  "apple-speech-transcriber-on-device",
  "apple-speech-recognizer-service",
];
const FALLBACK_REASON_CODES = new Set([
  "apple-speech-unavailable",
  "apple-speech-unsupported-locale",
  "apple-speech-permission-denied",
  "apple-speech-model-install-failed",
  "apple-speech-no-finalized-text",
  "apple-speech-processing-failed",
  "local-source-unavailable-after-upload",
  "local-source-changed-after-upload",
  "local-transcript-storage-unavailable",
]);

type JsonObject = Record<string, unknown>;

class CloudFallbackError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CloudFallbackError";
  }
}

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : {};
}

function text(value: unknown, maximumLength = Number.POSITIVE_INFINITY) {
  return typeof value === "string" ? value.trim().slice(0, maximumLength) : "";
}

function integerString(value: unknown) {
  const candidate = typeof value === "string" ? value.trim() : String(value ?? "").trim();
  return /^[1-9][0-9]*$/.test(candidate) ? candidate : "";
}

async function readBody(request: Request) {
  const declared = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declared) && declared > MAXIMUM_REQUEST_BYTES) {
    throw new CloudFallbackError(413, "CLOUD_FALLBACK_REQUEST_TOO_LARGE", "The cloud fallback request is too large.");
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAXIMUM_REQUEST_BYTES) {
    throw new CloudFallbackError(413, "CLOUD_FALLBACK_REQUEST_TOO_LARGE", "The cloud fallback request is too large.");
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    return parsed as JsonObject;
  } catch {
    throw new CloudFallbackError(400, "CLOUD_FALLBACK_BODY_INVALID", "Send the cloud fallback request as a JSON object.");
  }
}

function requestFingerprint(input: {
  recordingAssetId: string;
  sourceSha256: string;
  sourceByteCount: string;
  reasonCode: string;
}) {
  return createHash("sha256")
    .update(JSON.stringify(input), "utf8")
    .digest("hex");
}

export async function POST(request: Request) {
  try {
    const session = await getQuipslySessionFromRequest(request);
    if (!session?.user) {
      throw new CloudFallbackError(401, "AUTHENTICATION_REQUIRED", "Sign in before requesting transcript fallback.");
    }
    const body = await readBody(request);
    const recordingAssetId = text(body.recordingAssetId, 240);
    const clientRequestId = text(body.clientRequestId, 80).toLowerCase();
    const sourceSha256 = text(body.sourceSha256, 64).toLowerCase();
    const sourceByteCount = integerString(body.sourceByteCount);
    const reasonCode = text(body.reasonCode, 80).toLowerCase();
    if (!recordingAssetId) {
      throw new CloudFallbackError(400, "CLOUD_FALLBACK_ASSET_REQUIRED", "Choose the verified recording that needs transcript fallback.");
    }
    if (!UUID_PATTERN.test(clientRequestId)) {
      throw new CloudFallbackError(400, "CLOUD_FALLBACK_REQUEST_ID_INVALID", "The fallback request ID must be a UUID.");
    }
    if (!SHA256_PATTERN.test(sourceSha256) || !sourceByteCount) {
      throw new CloudFallbackError(400, "CLOUD_FALLBACK_SOURCE_EVIDENCE_INVALID", "The exact verified source SHA-256 and byte count are required.");
    }
    if (!FALLBACK_REASON_CODES.has(reasonCode)) {
      throw new CloudFallbackError(400, "CLOUD_FALLBACK_REASON_INVALID", "The device fallback reason is not recognized.");
    }

    const prisma = getPrismaClient() as any;
    const userId = session.user.id;
    const actorEmail = text(session.user.primaryEmail || session.user.email, 320).toLowerCase();
    const fingerprint = requestFingerprint({ recordingAssetId, sourceSha256, sourceByteCount, reasonCode });
    const prepared = await prisma.$transaction(async (transaction: any) => {
      await acquirePrismaAdvisoryTransactionLock(transaction, `cloud-transcript-fallback:${recordingAssetId}`);
      const asset = await transaction.recordingAsset.findFirst({
        where: mobileCaptureTranscriptAccessibleAssetWhere({
          recordingAssetId,
          userId,
          actorEmail,
          isStaff: session.user.isStaff,
        }),
        include: {
          participant: {
            select: { id: true, userId: true, displayName: true, email: true },
          },
        },
      });
      if (!asset) {
        throw new CloudFallbackError(404, "CLOUD_FALLBACK_ASSET_NOT_FOUND", "You do not have access to this recording.");
      }
      if (mobileCaptureTranscriptParticipantMismatch({ asset, userId, isStaff: session.user.isStaff })) {
        throw new CloudFallbackError(403, "CLOUD_FALLBACK_PARTICIPANT_MISMATCH", "Request transcript fallback only for your own isolated recording.");
      }
      if (asset.status !== "VERIFIED" || !asset.verifiedAt || !asset.storageBucket || !asset.storageObjectPath) {
        throw new CloudFallbackError(409, "CLOUD_FALLBACK_VERIFIED_SOURCE_REQUIRED", "The exact recording must finish cloud verification before fallback can run.");
      }
      if (text(asset.checksum, 64).toLowerCase() !== sourceSha256 || String(asset.byteSize ?? "") !== sourceByteCount) {
        throw new CloudFallbackError(409, "CLOUD_FALLBACK_SOURCE_MISMATCH", "Fallback evidence does not match the verified recording bytes.");
      }
      const gate = await mobileCaptureTranscriptProcessingGate({ prisma: transaction, recordingAsset: asset });
      if (!gate.allowed) {
        throw new CloudFallbackError(409, gate.errorCode || "CLOUD_FALLBACK_TRANSCRIPTION_HELD", gate.error || "Current transcription consent is required.");
      }

      const completed = await transaction.transcriptJob.findFirst({
        where: {
          assetId: recordingAssetId,
          status: "COMPLETED",
          OR: [{ segments: { some: {} } }, { words: { some: {} } }],
        },
        orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        select: { id: true, provider: true },
      });
      if (completed) {
        return {
          transcriptJobId: completed.id,
          alreadyCompleted: true,
          deviceCompleted: DEVICE_PROVIDERS.includes(completed.provider),
          idempotentReplay: true,
        };
      }

      let job = await transaction.transcriptJob.findFirst({
        where: {
          assetId: recordingAssetId,
          status: { in: ["QUEUED", "RUNNING"] },
          segments: { none: {} },
          words: { none: {} },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
      if (!job) {
        job = await transaction.transcriptJob.create({
          data: {
            roomId: asset.roomId,
            assetId: asset.id,
            status: "QUEUED",
            provider: "pending",
            requestedBy: userId,
            sourceSha256,
            resultJson: { source: "mobile-capture-device-fallback" },
          },
        });
      }
      const priorResult = object(job.resultJson);
      const priorFallback = object(priorResult.deviceCloudFallback);
      const priorFingerprint = text(priorFallback.requestFingerprint, 64).toLowerCase();
      if (priorFingerprint && priorFingerprint !== fingerprint) {
        throw new CloudFallbackError(409, "CLOUD_FALLBACK_REQUEST_CONFLICT", "This transcript already has different device fallback evidence.");
      }
      const idempotentReplay = priorFingerprint === fingerprint;
      if (!idempotentReplay) {
        await transaction.transcriptJob.update({
          where: { id: job.id },
          data: {
            requestedBy: userId,
            resultJson: {
              ...priorResult,
              source: "mobile-capture-device-fallback",
              deviceCloudFallback: {
                schema: "quipsly-device-cloud-transcript-fallback-v1",
                clientRequestId,
                requestFingerprint: fingerprint,
                reasonCode,
                requestedAt: new Date().toISOString(),
                requestedByUserId: userId,
                sourceSha256,
                sourceByteCount,
                speculative: false,
                deviceAttemptFailedFirst: true,
              },
            },
          },
        });
      }
      return {
        transcriptJobId: job.id,
        alreadyCompleted: false,
        deviceCompleted: false,
        idempotentReplay,
      };
    }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 });

    if (prepared.alreadyCompleted) {
      return NextResponse.json({
        ok: true,
        status: "COMPLETED",
        providerExecutionRequested: false,
        ...prepared,
      });
    }
    const queued = await ensureCaptureTranscriptProcessingQueued({
      prisma,
      transcriptJobId: prepared.transcriptJobId,
      actorUserId: userId,
      actorEmail,
    });
    return NextResponse.json({
      ok: true,
      status: queued.status,
      providerExecutionRequested: queued.executionRequested,
      transcriptJobId: prepared.transcriptJobId,
      idempotentReplay: prepared.idempotentReplay,
      fallbackReasonCode: reasonCode,
    }, { status: prepared.idempotentReplay ? 200 : 202 });
  } catch (error) {
    if (error instanceof CloudFallbackError) {
      return NextResponse.json({ ok: false, error: error.message, errorCode: error.code }, { status: error.status });
    }
    throw error;
  }
}
