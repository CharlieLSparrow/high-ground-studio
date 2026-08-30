import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { captureTranscriptSourceTopology } from "@/lib/server/capture-transcript-processing";
import { mobileCaptureTranscriptProcessingGate } from "@/lib/server/mobile-capture-processing-gates";
import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

const PROVIDER = "apple-speech-transcriber-on-device";
const MAXIMUM_REQUEST_BYTES = 4 * 1024 * 1024;
const MAXIMUM_SEGMENTS = 12_000;
const MAXIMUM_SEGMENT_CHARACTERS = 12_000;
const MAXIMUM_TRANSCRIPT_CHARACTERS = 1_000_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

type JsonObject = Record<string, unknown>;

type NormalizedSegment = {
  startSeconds: number;
  endSeconds: number;
  text: string;
};

class OnDeviceTranscriptError extends Error {
  readonly status: number;
  readonly code: string;
  readonly explicitReleaseRequired: boolean;

  constructor(
    status: number,
    code: string,
    message: string,
    explicitReleaseRequired = false,
  ) {
    super(message);
    this.name = "OnDeviceTranscriptError";
    this.status = status;
    this.code = code;
    this.explicitReleaseRequired = explicitReleaseRequired;
  }
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, maximumLength = Number.POSITIVE_INFINITY) {
  return typeof value === "string" ? value.trim().slice(0, maximumLength) : "";
}

function exactText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function finiteNumber(value: unknown) {
  const number = typeof value === "number" ? value : Number.NaN;
  return Number.isFinite(number) ? number : null;
}

function integerString(value: unknown) {
  const candidate = typeof value === "string" ? value.trim() : String(value ?? "").trim();
  return /^[1-9][0-9]*$/.test(candidate) ? candidate : "";
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function isProviderRecordingReceiptSlot(asset: any) {
  const manifest = isObject(asset?.localManifestJson) ? asset.localManifestJson : {};
  return asset?.kind === "SERVER_MIX" && manifest.source === "provider-recording-receipt-slot";
}

function sourceGeneration(asset: any) {
  const manifest = isObject(asset?.localManifestJson) ? asset.localManifestJson : {};
  return text(manifest.storageGeneration, 240) || null;
}

function onDeviceTranscriptRoutingSummary(input: {
  asset: any;
  engine: {
    transcriber: string;
    preset: string;
    configurationHash: string;
    modelAssetStatus: string;
  };
  language: string;
}) {
  const topology = captureTranscriptSourceTopology(input.asset);
  return {
    schema: "quipsly-transcript-routing-summary-v1",
    sourceTopology: topology.kind,
    participantLabel: topology.kind === "participant-isolated"
      ? topology.participantLabel
      : null,
    speakerAuthority: topology.kind === "participant-isolated"
      ? "source-binding"
      : "unresolved",
    provider: PROVIDER,
    model: [input.engine.transcriber, input.engine.preset]
      .filter(Boolean)
      .join(" · ") || null,
    modelRevisionPolicy: input.engine.modelAssetStatus || "device-managed",
    language: input.language,
    diarizationRequested: false,
    timingGranularity: "segment",
    terminologySnapshotSha256: null,
    terminologyKeytermCount: 0,
    manifestBacked: false,
    providerOutputRemainsImmutable: true,
    configurationHash: input.engine.configurationHash,
  };
}

function normalizeSegments(value: unknown, assetDurationSeconds: number | null) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new OnDeviceTranscriptError(
      400,
      "ON_DEVICE_TRANSCRIPT_SEGMENTS_REQUIRED",
      "The finalized on-device transcript must contain at least one timed segment.",
    );
  }
  if (value.length > MAXIMUM_SEGMENTS) {
    throw new OnDeviceTranscriptError(
      413,
      "ON_DEVICE_TRANSCRIPT_TOO_MANY_SEGMENTS",
      `An on-device transcript may contain at most ${MAXIMUM_SEGMENTS.toLocaleString()} segments.`,
    );
  }

  let totalCharacters = 0;
  let previousStart = -1;
  return value.map((candidate, index): NormalizedSegment => {
    if (!isObject(candidate)) {
      throw new OnDeviceTranscriptError(400, "ON_DEVICE_TRANSCRIPT_SEGMENT_INVALID", `Transcript segment ${index + 1} is invalid.`);
    }
    const startSeconds = finiteNumber(candidate.startSeconds);
    const endSeconds = finiteNumber(candidate.endSeconds);
    const segmentText = exactText(candidate.text);
    if (startSeconds === null || endSeconds === null || startSeconds < 0 || endSeconds <= startSeconds) {
      throw new OnDeviceTranscriptError(400, "ON_DEVICE_TRANSCRIPT_TIMING_INVALID", `Transcript segment ${index + 1} has invalid timing.`);
    }
    if (startSeconds < previousStart) {
      throw new OnDeviceTranscriptError(400, "ON_DEVICE_TRANSCRIPT_ORDER_INVALID", "Transcript segments must be ordered by start time.");
    }
    if (assetDurationSeconds !== null && endSeconds > assetDurationSeconds + 5) {
      throw new OnDeviceTranscriptError(409, "ON_DEVICE_TRANSCRIPT_SOURCE_RANGE_MISMATCH", "Transcript timing extends beyond the verified recording duration.");
    }
    if (!segmentText) {
      throw new OnDeviceTranscriptError(400, "ON_DEVICE_TRANSCRIPT_TEXT_REQUIRED", `Transcript segment ${index + 1} has no finalized text.`);
    }
    if (segmentText.length > MAXIMUM_SEGMENT_CHARACTERS) {
      throw new OnDeviceTranscriptError(413, "ON_DEVICE_TRANSCRIPT_SEGMENT_TOO_LARGE", `Transcript segment ${index + 1} is too large.`);
    }
    totalCharacters += segmentText.length;
    if (totalCharacters > MAXIMUM_TRANSCRIPT_CHARACTERS) {
      throw new OnDeviceTranscriptError(413, "ON_DEVICE_TRANSCRIPT_TOO_LARGE", "The on-device transcript is too large for one submission.");
    }
    previousStart = startSeconds;
    return { startSeconds, endSeconds, text: segmentText };
  });
}

async function readJson(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > MAXIMUM_REQUEST_BYTES) {
    throw new OnDeviceTranscriptError(413, "ON_DEVICE_TRANSCRIPT_REQUEST_TOO_LARGE", "The on-device transcript submission is too large.");
  }
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    throw new OnDeviceTranscriptError(400, "ON_DEVICE_TRANSCRIPT_BODY_INVALID", "The on-device transcript body could not be read.");
  }
  if (new TextEncoder().encode(raw).byteLength > MAXIMUM_REQUEST_BYTES) {
    throw new OnDeviceTranscriptError(413, "ON_DEVICE_TRANSCRIPT_REQUEST_TOO_LARGE", "The on-device transcript submission is too large.");
  }
  try {
    const value = JSON.parse(raw);
    if (!isObject(value)) throw new Error("not an object");
    return value;
  } catch {
    throw new OnDeviceTranscriptError(400, "ON_DEVICE_TRANSCRIPT_BODY_INVALID", "Send the on-device transcript as a JSON object.");
  }
}

function accessibleRoomWhere(userId: string, actorEmail: string) {
  return [
    { room: { createdByUserId: userId } },
    { room: { participants: { some: { userId, accessStatus: "ACTIVE" } } } },
    { room: { booking: { clientUserId: userId } } },
    { room: { booking: { coachUserId: userId } } },
    ...(actorEmail
      ? [{ room: { project: { accessGrants: { some: { email: actorEmail, status: "ACTIVE" } } } } }]
      : []),
  ];
}

export async function POST(request: Request) {
  try {
    const session = await getQuipslySessionFromRequest(request);
    if (!session?.user) {
      throw new OnDeviceTranscriptError(401, "AUTHENTICATION_REQUIRED", "Sign in before submitting an on-device transcript.");
    }

    const body = await readJson(request);
    const recordingAssetId = text(body.recordingAssetId, 240);
    const clientRequestId = text(body.clientRequestId, 80).toLowerCase();
    const sourceSha256 = text(body.sourceSha256, 64).toLowerCase();
    const sourceByteCount = integerString(body.sourceByteCount);
    const sidecarSha256 = text(body.sidecarSha256, 64).toLowerCase();
    const language = text(body.language, 64);
    const engine = isObject(body.engine) ? body.engine : {};
    const device = isObject(body.device) ? body.device : {};

    if (!recordingAssetId) {
      throw new OnDeviceTranscriptError(400, "ON_DEVICE_TRANSCRIPT_ASSET_REQUIRED", "Choose the verified recording that produced this transcript.");
    }
    if (!UUID_PATTERN.test(clientRequestId)) {
      throw new OnDeviceTranscriptError(400, "ON_DEVICE_TRANSCRIPT_REQUEST_ID_INVALID", "The on-device transcript request ID must be a UUID.");
    }
    if (!SHA256_PATTERN.test(sourceSha256) || !sourceByteCount) {
      throw new OnDeviceTranscriptError(400, "ON_DEVICE_TRANSCRIPT_SOURCE_EVIDENCE_INVALID", "The exact source SHA-256 and byte count are required.");
    }
    if (!SHA256_PATTERN.test(sidecarSha256)) {
      throw new OnDeviceTranscriptError(400, "ON_DEVICE_TRANSCRIPT_SIDECAR_EVIDENCE_INVALID", "The protected transcript sidecar SHA-256 is required.");
    }
    if (!language) {
      throw new OnDeviceTranscriptError(400, "ON_DEVICE_TRANSCRIPT_LANGUAGE_REQUIRED", "The recognition locale is required.");
    }

    const prisma = getPrismaClient() as any;
    const userId = session.user.id;
    const actorEmail = text(session.user.primaryEmail || session.user.email, 320).toLowerCase();

    const result = await prisma.$transaction(async (transaction: any) => {
      await acquirePrismaAdvisoryTransactionLock(transaction, `on-device-transcript:${recordingAssetId}`);
      const asset = await transaction.recordingAsset.findFirst({
        where: session.user.isStaff
          ? { id: recordingAssetId }
          : { id: recordingAssetId, OR: accessibleRoomWhere(userId, actorEmail) },
        include: {
          participant: {
            select: { id: true, userId: true, displayName: true, email: true },
          },
        },
      });
      if (!asset) {
        throw new OnDeviceTranscriptError(404, "ON_DEVICE_TRANSCRIPT_ASSET_NOT_FOUND", "You do not have access to this recording.");
      }
      if (isProviderRecordingReceiptSlot(asset)) {
        throw new OnDeviceTranscriptError(409, "ON_DEVICE_TRANSCRIPT_MEDIA_REQUIRED", "Provider receipt slots are not media and cannot be transcribed.");
      }
      if (asset.status !== "VERIFIED" || !asset.verifiedAt || !asset.storageBucket || !asset.storageObjectPath) {
        throw new OnDeviceTranscriptError(409, "ON_DEVICE_TRANSCRIPT_VERIFIED_SOURCE_REQUIRED", "Finish immutable cloud verification before attaching an on-device transcript.");
      }
      if (text(asset.checksum, 64).toLowerCase() !== sourceSha256 || String(asset.byteSize ?? "") !== sourceByteCount) {
        throw new OnDeviceTranscriptError(409, "ON_DEVICE_TRANSCRIPT_SOURCE_MISMATCH", "The local transcript source does not match the verified uploaded recording bytes.");
      }

      const transcriptGate = await mobileCaptureTranscriptProcessingGate({ prisma: transaction, recordingAsset: asset });
      if (!transcriptGate.allowed) {
        throw new OnDeviceTranscriptError(
          409,
          transcriptGate.errorCode || "ON_DEVICE_TRANSCRIPT_RELEASE_REQUIRED",
          transcriptGate.error || "Current all-party transcription consent is required.",
          true,
        );
      }

      const duration = finiteNumber(asset.durationSeconds);
      const segments = normalizeSegments(body.segments, duration);
      const normalizedEngine = {
        framework: text(engine.framework, 80) || "Speech",
        transcriber: text(engine.transcriber, 120) || "SpeechTranscriber",
        preset: text(engine.preset, 120),
        configurationHash: text(engine.configurationHash, 64).toLowerCase(),
        modelAssetStatus: text(engine.modelAssetStatus, 80),
      };
      const normalizedDevice = {
        appVersion: text(device.appVersion, 40),
        appBuild: text(device.appBuild, 40),
        modelIdentifier: text(device.modelIdentifier, 120),
        systemName: text(device.systemName, 40),
        systemVersion: text(device.systemVersion, 40),
      };
      if (!SHA256_PATTERN.test(normalizedEngine.configurationHash)) {
        throw new OnDeviceTranscriptError(400, "ON_DEVICE_TRANSCRIPT_CONFIGURATION_HASH_INVALID", "The recognition configuration SHA-256 is required.");
      }
      const routing = onDeviceTranscriptRoutingSummary({
        asset,
        engine: normalizedEngine,
        language,
      });

      const immutableInput = {
        schemaVersion: 1,
        recordingAssetId,
        sourceSha256,
        sourceByteCount,
        sidecarSha256,
        language,
        engine: normalizedEngine,
        device: normalizedDevice,
        segments,
      };
      const inputSha256 = sha256(stableJson(immutableInput));
      const providerRequestId = `apple-speech:${clientRequestId}`;
      const prior = await transaction.transcriptJob.findFirst({
        where: { assetId: recordingAssetId, provider: PROVIDER, providerRequestId },
        include: { _count: { select: { segments: true, words: true } } },
      });
      if (prior) {
        const priorResult = isObject(prior.resultJson) ? prior.resultJson : {};
        if (priorResult.inputSha256 !== inputSha256) {
          throw new OnDeviceTranscriptError(409, "ON_DEVICE_TRANSCRIPT_IDEMPOTENCY_CONFLICT", "This request ID was already used for different transcript evidence.");
        }
        return {
          transcriptJobId: prior.id,
          segmentCount: prior._count?.segments ?? segments.length,
          idempotentReplay: true,
        };
      }

      const now = new Date();
      const created = await transaction.transcriptJob.create({
        data: {
          roomId: asset.roomId,
          assetId: asset.id,
          status: "COMPLETED",
          provider: PROVIDER,
          language,
          requestedBy: userId,
          startedAt: now,
          completedAt: now,
          sourceGeneration: sourceGeneration(asset),
          sourceSha256,
          providerRequestId,
          workerBuildId: normalizedDevice.appBuild || null,
          resultJson: {
            schemaVersion: 1,
            source: "quipsly-capture-on-device-transcript-v1",
            clientRequestId,
            inputSha256,
            sidecarSha256,
            sourceByteCount,
            sourceVerification: "recording-asset-status-size-and-sha256",
            recognitionExecution: "on-device",
            providerNetworkRequestMadeByQuipsly: false,
            speakerDiarization: "unavailable",
            humanPlaybackReviewRequired: true,
            uploadConsentRecheckedAt: now.toISOString(),
            submittedByUserId: userId,
            processingControl: {
              version: 1,
              sourceRole: "recording-original",
              consentGateCheckedAt: now.toISOString(),
              reconciliationRequiresFreshConsentGate: false,
              routing,
            },
            engine: normalizedEngine,
            device: normalizedDevice,
            segmentCount: segments.length,
          },
          segments: {
            create: segments.map((segment, index) => ({
              startSeconds: segment.startSeconds,
              endSeconds: segment.endSeconds,
              text: segment.text,
              speakerLabel: null,
              speakerUserId: null,
              confidence: null,
              metadataJson: {
                schemaVersion: 1,
                source: "apple-speech-transcriber-final-result",
                providerSegmentIndex: index,
                finalizedResult: true,
                speakerAttribution: routing.speakerAuthority,
                humanPlaybackReviewRequired: true,
                sidecarSha256,
              },
            })),
          },
        },
        select: { id: true },
      });
      return { transcriptJobId: created.id, segmentCount: segments.length, idempotentReplay: false };
    }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 });

    return NextResponse.json({
      ok: true,
      status: "COMPLETED",
      provider: PROVIDER,
      wordCount: 0,
      speakerDiarization: "unavailable",
      humanPlaybackReviewRequired: true,
      ...result,
    }, { status: result.idempotentReplay ? 200 : 201 });
  } catch (error) {
    if (error instanceof OnDeviceTranscriptError) {
      return NextResponse.json({
        ok: false,
        error: error.message,
        errorCode: error.code,
        ...(error.explicitReleaseRequired ? { explicitReleaseRequired: true } : {}),
      }, { status: error.status });
    }
    throw error;
  }
}
