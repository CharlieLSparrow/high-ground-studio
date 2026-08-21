import "server-only";

import { google } from "googleapis";

import {
  CAPTURE_TRANSCRIPT_QUEUE_KIND,
  buildCaptureTranscriptManifestObjectName,
  buildCaptureTranscriptQueueObjectName,
  buildCaptureTranscriptResultObjectName,
  compileDeepgramTerminologyKeyterms,
  newCaptureTranscriptManifest,
  planTranscriptRouting,
  parseCaptureTranscriptManifest,
  parseCaptureTranscriptQueueReceipt,
  type CaptureTranscriptManifest,
  type CaptureTranscriptProviderRequest,
  type CaptureTranscriptQueueReceipt,
  type DeepgramTerminologyProjection,
  type TranscriptSourceTopology,
} from "@high-ground/quipsly-media-processing";

import { getMediaBucket } from "@/lib/server/gcs";
import {
  assertCaptureTranscriptManifestBinding,
  CaptureTranscriptOutboxError,
} from "@/lib/server/capture-transcript-manifest-policy";
import { mobileCaptureTranscriptProcessingGate } from "@/lib/server/mobile-capture-processing-gates";
import { getMobileCaptureObjectEvidence } from "@/lib/server/mobile-capture-resumable-store";
import { compileStudioTranscriptTerminologySnapshot } from "@/lib/server/studio-transcript-terminology";

export type CaptureTranscriptQueueStatus = {
  status:
    | "held"
    | "queued"
    | "processing"
    | "completed"
    | "configuration-required";
  transcriptJobId: string;
  queueObjectName: string | null;
  manifestObjectName: string | null;
  resultObjectName: string | null;
  executionRequested: boolean;
};

export { CaptureTranscriptOutboxError } from "@/lib/server/capture-transcript-manifest-policy";

/**
 * Converts the canonical TranscriptJob into a recoverable GCS outbox. The
 * source binding and provider request are immutable; DB state can be rebuilt
 * from the manifest/result receipts after a process crash.
 */
export async function ensureCaptureTranscriptProcessingQueued(input: {
  prisma: any;
  transcriptJobId: string;
  actorUserId: string;
  actorEmail: string;
}): Promise<CaptureTranscriptQueueStatus> {
  const job = await input.prisma.transcriptJob.findUnique({
    where: { id: input.transcriptJobId },
    include: {
      asset: { include: { participant: true } },
      room: { select: { projectId: true } },
      segments: { select: { id: true }, take: 1 },
      words: { select: { id: true }, take: 1 },
    },
  });
  if (!job) {
    throw new CaptureTranscriptOutboxError(
      "TRANSCRIPT_JOB_NOT_FOUND",
      "Transcript job was not found.",
    );
  }
  if (job.status === "COMPLETED") {
    return {
      status: "completed",
      transcriptJobId: job.id,
      queueObjectName: null,
      manifestObjectName: job.processingManifestObject,
      resultObjectName: job.processingResultObject,
      executionRequested: false,
    };
  }
  if (!["QUEUED", "RUNNING"].includes(job.status)) {
    throw new CaptureTranscriptOutboxError(
      "TRANSCRIPT_JOB_NOT_QUEUEABLE",
      "Retry from the immutable recording to preserve transcript version history.",
    );
  }
  if (job.segments.length > 0 || job.words.length > 0) {
    throw new CaptureTranscriptOutboxError(
      "TRANSCRIPT_VERSION_IMMUTABLE",
      "This transcript version already contains immutable provider evidence.",
    );
  }
  if (!job.asset || !job.roomId || job.asset.roomId !== job.roomId) {
    throw new CaptureTranscriptOutboxError(
      "TRANSCRIPT_SOURCE_MISSING",
      "Transcript job has no room-bound recording asset.",
    );
  }
  if (isProviderRecordingReceiptSlot(job.asset)) {
    throw new CaptureTranscriptOutboxError(
      "TRANSCRIPT_SOURCE_IS_RECEIPT_SLOT",
      "Provider recording receipt slots are not transcript media.",
    );
  }

  const gate = await mobileCaptureTranscriptProcessingGate({
    prisma: input.prisma,
    recordingAsset: job.asset,
  });
  if (!gate.allowed) {
    await holdJob(input.prisma, job.id, gate.error, gate.errorCode);
    return {
      status: "held",
      transcriptJobId: job.id,
      queueObjectName: null,
      manifestObjectName: null,
      resultObjectName: null,
      executionRequested: false,
    };
  }
  if (!["UPLOADED", "VERIFIED"].includes(job.asset.status)) {
    throw new CaptureTranscriptOutboxError(
      "TRANSCRIPT_SOURCE_NOT_VERIFIED",
      "Recording asset is not uploaded or verified yet.",
    );
  }
  if (!job.asset.storageBucket || !job.asset.storageObjectPath) {
    throw new CaptureTranscriptOutboxError(
      "TRANSCRIPT_SOURCE_NOT_DURABLE",
      "Recording asset does not have a durable storage object path.",
    );
  }

  const evidence = await getMobileCaptureObjectEvidence(
    job.asset.storageBucket,
    job.asset.storageObjectPath,
  );
  if (!evidence) {
    throw new CaptureTranscriptOutboxError(
      "TRANSCRIPT_SOURCE_NOT_FOUND",
      "The immutable recording object could not be found.",
    );
  }
  const sizeBytes = bigintAsPositiveNumber(job.asset.byteSize);
  const sha256 = requiredSha256(job.asset.checksum);
  const contentType = requiredMediaType(
    job.asset.contentType || evidence.contentType,
  );
  if (
    evidence.sizeBytes !== sizeBytes
    || evidence.contentType !== contentType
    || evidence.customMetadata.quipslyExpectedSizeBytes !== String(sizeBytes)
    || evidence.customMetadata.quipslyExpectedSha256 !== sha256
    || !/^[1-9][0-9]*$/.test(evidence.generation)
  ) {
    throw new CaptureTranscriptOutboxError(
      "TRANSCRIPT_SOURCE_INTEGRITY_FAILED",
      "Stored recording evidence does not match its canonical asset binding.",
    );
  }
  if (evidence.storageBackend === "local-development") {
    const priorResult = jsonObject(job.resultJson);
    const priorControl = jsonObject(priorResult.processingControl);
    await input.prisma.transcriptJob.update({
      where: { id: job.id },
      data: {
        resultJson: {
          ...priorResult,
          source: "capture-transcript-local-worker-queue",
          processingControl: {
            ...priorControl,
            version: 1,
            sourceGeneration: evidence.generation,
            sourceSha256: sha256,
            consentGateCheckedAt: new Date().toISOString(),
            reconciliationRequiresFreshConsentGate: true,
            routing: localCaptureTranscriptRoutingSummary(job.asset),
          },
        },
      },
    });
    return {
      status: localCaptureTranscriptWorkerEnabled()
        ? "queued"
        : "configuration-required",
      transcriptJobId: job.id,
      queueObjectName: null,
      manifestObjectName: null,
      resultObjectName: null,
      executionRequested: false,
    };
  }

  const manifestObjectName = buildCaptureTranscriptManifestObjectName(job.id);
  const queueObjectName = buildCaptureTranscriptQueueObjectName(job.id);
  const resultObjectName = buildCaptureTranscriptResultObjectName(job.id);
  const queuedAt = new Date().toISOString();
  const topology = captureTranscriptSourceTopology(job.asset);
  const providerName = process.env.QUIPSLY_TRANSCRIPT_PROVIDER?.trim()
    === "google-speech-v2"
    ? "google-speech-v2" as const
    : "deepgram" as const;
  const providerModel = providerName === "google-speech-v2"
    ? process.env.GOOGLE_SPEECH_MODEL?.trim() || "chirp_3"
    : process.env.DEEPGRAM_MODEL?.trim() || "nova-3";
  const providerVersion = providerName === "google-speech-v2"
    ? null
    : process.env.DEEPGRAM_MODEL_VERSION?.trim() || "latest";
  const providerLocation = process.env.GOOGLE_SPEECH_LOCATION?.trim()
    || "us";
  const language = normalizedLanguage(job.language) || "en-US";
  const terminologySnapshot = job.room?.projectId
    ? await compileStudioTranscriptTerminologySnapshot({
        prisma: input.prisma,
        projectId: job.room.projectId,
        compiledAt: new Date(queuedAt),
      })
    : null;
  const terminology = providerName === "deepgram"
    && terminologySnapshot
    && providerModel.startsWith("nova-3")
    ? compileDeepgramTerminologyKeyterms(terminologySnapshot)
    : null;
  const routingPlan = planTranscriptRouting({
    source: {
      sourceId: job.asset.id,
      sha256,
      sizeBytes,
      topology,
    },
    language,
    cloudProcessing: "required",
    providers: {
      appleOnDeviceAvailable: false,
      deepgramAvailable: providerName === "deepgram",
      deepgramModel: providerModel,
      deepgramModelVersion: providerVersion,
      deepgramModelVersionPolicy: providerVersion === "latest"
        ? "moving-latest"
        : "pinned",
      googleSpeechAvailable: providerName === "google-speech-v2",
      googleSpeechModel: providerModel,
      googleSpeechLocation: providerLocation,
      openAIAvailable: false,
    },
    terminologySnapshotSha256: terminology?.snapshotSha256 || null,
    includeEvaluationComparisons: false,
  });
  const desiredManifest = newCaptureTranscriptManifest({
    jobId: job.id,
    actorUserId: requiredText(input.actorUserId, "actor user"),
    actorEmail: requiredEmail(input.actorEmail),
    source: {
      bucketName: evidence.bucketName,
      objectName: evidence.objectName,
      generation: evidence.generation,
      sizeBytes,
      sha256,
      contentType,
      roomId: job.roomId,
      recordingAssetId: job.asset.id,
      topology,
    },
    provider: captureTranscriptProviderRequest({
      name: providerName,
      topology,
      model: providerModel,
      // `latest` is made explicit until a measured standard-model revision is
      // selected from retained Quipsly reference windows. The raw response is
      // still retained for resolved model evidence and exact replay diagnosis.
      version: providerVersion,
      language,
      terminology,
    }),
    routingPlan,
    queuedAt,
    updatedAt: queuedAt,
  });
  const bucket = getMediaBucket(evidence.bucketName);
  const storedManifest = await saveManifestIfAbsent(
    bucket,
    manifestObjectName,
    desiredManifest,
  );
  const manifest = parseCaptureTranscriptManifest(
    storedManifest.value,
    job.id,
  );
  assertCaptureTranscriptManifestBinding({
    stored: manifest,
    desired: desiredManifest,
    created: storedManifest.created,
  });

  if (manifest.status === "failed-terminal") {
    await input.prisma.transcriptJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        provider: manifest.provider.name,
        errorMessage: manifest.failure?.message || "Transcript worker failed.",
        completedAt: new Date(
          manifest.failure?.failedAt || manifest.updatedAt,
        ),
        processingManifestObject: manifestObjectName,
        sourceGeneration: manifest.source.generation,
        sourceSha256: manifest.source.sha256,
      },
    });
    throw new CaptureTranscriptOutboxError(
      manifest.failure?.code || "TRANSCRIPT_WORKER_FAILED",
      manifest.failure?.message || "Transcript worker failed terminal.",
    );
  }

  if (manifest.status !== "completed") {
    const queueReceipt: CaptureTranscriptQueueReceipt = {
      kind: CAPTURE_TRANSCRIPT_QUEUE_KIND,
      version: 1,
      jobId: job.id,
      manifestObjectName,
      manifestGeneration: storedManifest.generation,
      enqueuedAt: manifest.queuedAt,
    };
    await saveQueueIfAbsent(bucket, queueObjectName, queueReceipt);
  }

  const priorResult = jsonObject(job.resultJson);
  const priorControl = jsonObject(priorResult.processingControl);
  const processingControl = {
    version: 1,
    bucketName: evidence.bucketName,
    queueObjectName,
    manifestObjectName,
    manifestGeneration: storedManifest.generation,
    resultObjectName,
    sourceGeneration: manifest.source.generation,
    sourceSha256: manifest.source.sha256,
    executionRequestedAt: text(priorControl.executionRequestedAt) || null,
    consentGateCheckedAt: queuedAt,
    reconciliationRequiresFreshConsentGate: true,
    routing: captureTranscriptRoutingSummary(manifest),
  };
  await input.prisma.transcriptJob.update({
    where: { id: job.id },
    data: {
      status: "RUNNING",
      provider: manifest.provider.name,
      requestedBy: input.actorUserId,
      startedAt: job.startedAt || new Date(),
      completedAt: null,
      errorMessage: null,
      processingManifestObject: manifestObjectName,
      processingResultObject: manifest.status === "completed"
        ? resultObjectName
        : null,
      sourceGeneration: manifest.source.generation,
      sourceSha256: manifest.source.sha256,
      resultJson: {
        ...priorResult,
        source: "capture-transcript-background-worker",
        processingControl,
      },
    },
  });

  if (manifest.status === "completed") {
    return {
      status: "processing",
      transcriptJobId: job.id,
      queueObjectName,
      manifestObjectName,
      resultObjectName,
      executionRequested: false,
    };
  }
  if (!captureTranscriptWorkerEnabled()) {
    return {
      status: "configuration-required",
      transcriptJobId: job.id,
      queueObjectName,
      manifestObjectName,
      resultObjectName,
      executionRequested: false,
    };
  }
  if (executionRequestIsRecent(processingControl.executionRequestedAt)) {
    return {
      status: manifest.status === "processing" ? "processing" : "queued",
      transcriptJobId: job.id,
      queueObjectName,
      manifestObjectName,
      resultObjectName,
      executionRequested: false,
    };
  }

  await requestCaptureTranscriptExecution();
  const executionRequestedAt = new Date().toISOString();
  await input.prisma.transcriptJob.update({
    where: { id: job.id },
    data: {
      resultJson: {
        ...priorResult,
        source: "capture-transcript-background-worker",
        processingControl: {
          ...processingControl,
          executionRequestedAt,
        },
      },
    },
  });
  return {
    status: manifest.status === "processing" ? "processing" : "queued",
    transcriptJobId: job.id,
    queueObjectName,
    manifestObjectName,
    resultObjectName,
    executionRequested: true,
  };
}

export function captureTranscriptSourceTopology(asset: any) {
  if (
    ["LOCAL_AUDIO", "LOCAL_VIDEO"].includes(String(asset?.kind))
    && asset?.participantId
  ) {
    const label = (text(asset.participant?.displayName)
      || text(asset.participant?.email)
      || String(asset.participantId)).slice(0, 160);
    return {
      kind: "participant-isolated" as const,
      participantId: String(asset.participantId),
      participantLabel: label,
    };
  }
  if (String(asset?.kind) === "SERVER_MIX") {
    return { kind: "mixed-room" as const, expectedSpeakerCount: null };
  }
  return { kind: "unknown" as const };
}

export function localCaptureTranscriptRoutingSummary(asset: any) {
  const topology = captureTranscriptSourceTopology(asset);
  return {
    schema: "quipsly-transcript-routing-summary-v1",
    sourceTopology: topology.kind,
    participantLabel: topology.kind === "participant-isolated"
      ? topology.participantLabel
      : null,
    speakerAuthority: topology.kind === "participant-isolated"
      ? "source-binding"
      : "unresolved",
    provider: "openai-whisper-local",
    model: process.env.QUIPSLY_LOCAL_WHISPER_MODEL?.trim() || "large-v3-turbo",
    modelRevisionPolicy: "installed-local-model-name",
    language: process.env.QUIPSLY_LOCAL_WHISPER_LANGUAGE?.trim() || "en",
    diarizationRequested: false,
    timingGranularity: "segment",
    terminologySnapshotSha256: null,
    terminologyKeytermCount: 0,
    manifestBacked: false,
    providerOutputRemainsImmutable: true,
  } as const;
}

export function captureTranscriptProviderRequest(input: {
  name?: "deepgram" | "google-speech-v2";
  topology: TranscriptSourceTopology;
  model: string;
  version: string | null;
  language: string | null;
  terminology: DeepgramTerminologyProjection | null;
}): CaptureTranscriptProviderRequest {
  const diarize = input.topology.kind !== "participant-isolated";
  const name = input.name || "deepgram";
  return {
    name,
    model: input.model,
    version: input.version,
    language: input.language,
    smartFormat: true,
    punctuate: true,
    diarize,
    // Pin new mixed/unknown jobs to a measured diarizer revision. Existing
    // manifests retain their original request verbatim.
    diarizeModel: name === "deepgram" && diarize ? "v2" : null,
    multichannel: false,
    utterances: true,
    paragraphs: true,
    terminology: name === "deepgram" && input.model.startsWith("nova-3")
      ? input.terminology
      : null,
  };
}

export function captureTranscriptRoutingSummary(
  manifest: CaptureTranscriptManifest,
) {
  const plan = manifest.routingPlan;
  if (!plan) return null;
  const topology = plan.source.topology;
  return {
    schema: "quipsly-transcript-routing-summary-v1",
    sourceTopology: topology.kind,
    participantLabel: topology.kind === "participant-isolated"
      ? topology.participantLabel
      : null,
    speakerAuthority: plan.speakerIdentityAuthority.kind,
    provider: plan.primaryAttempt.provider,
    model: plan.primaryAttempt.model,
    modelRevisionPolicy: plan.primaryAttempt.modelRevisionPolicy,
    language: plan.primaryAttempt.language,
    diarizationRequested: plan.primaryAttempt.configuration.diarize === true,
    timingGranularity: plan.primaryAttempt.timingGranularity,
    terminologySnapshotSha256:
      plan.primaryAttempt.terminology.snapshotSha256,
    terminologyKeytermCount: manifest.provider.terminology?.keyterms.length ?? 0,
    manifestBacked: true,
    providerOutputRemainsImmutable: true,
  } as const;
}

export function captureTranscriptWorkerEnabled() {
  return process.env.QUIPSLY_TRANSCRIPT_WORKER_ENABLED === "1"
    && transcriptWorkerEnvironmentNames.every(
      (name) => Boolean(process.env[name]?.trim()),
    );
}

export function localCaptureTranscriptWorkerEnabled() {
  if (
    process.env.NODE_ENV === "production"
    || process.env.QUIPSLY_LOCAL_TRANSCRIPT_WORKER_AVAILABLE !== "1"
  ) return false;
  try {
    const database = new URL(process.env.DATABASE_URL || "");
    return ["localhost", "127.0.0.1", "::1"].includes(database.hostname);
  } catch {
    return false;
  }
}

const transcriptWorkerEnvironmentNames = [
  "QUIPSLY_TRANSCRIPT_WORKER_PROJECT_ID",
  "QUIPSLY_TRANSCRIPT_WORKER_REGION",
  "QUIPSLY_TRANSCRIPT_WORKER_JOB",
] as const;

async function requestCaptureTranscriptExecution() {
  const projectId = requiredEnv("QUIPSLY_TRANSCRIPT_WORKER_PROJECT_ID");
  const region = requiredEnv("QUIPSLY_TRANSCRIPT_WORKER_REGION");
  const jobName = requiredEnv("QUIPSLY_TRANSCRIPT_WORKER_JOB");
  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();
  await client.request({
    url:
      `https://run.googleapis.com/v2/projects/${encodeURIComponent(projectId)}`
      + `/locations/${encodeURIComponent(region)}`
      + `/jobs/${encodeURIComponent(jobName)}:run`,
    method: "POST",
    data: {},
  });
}

async function saveManifestIfAbsent(
  bucket: any,
  objectName: string,
  manifest: CaptureTranscriptManifest,
) {
  const file = bucket.file(objectName);
  let created = false;
  try {
    await file.save(JSON.stringify(manifest), {
      resumable: false,
      validation: "crc32c",
      contentType: "application/json; charset=utf-8",
      metadata: {
        cacheControl: "private, no-store",
        metadata: {
          quipslyKind: manifest.kind,
          quipslyTranscriptJobId: manifest.jobId,
          quipslyRecordingAssetId: manifest.source.recordingAssetId,
        },
      },
      preconditionOpts: { ifGenerationMatch: 0 },
    });
    created = true;
  } catch (error) {
    if (!isPreconditionFailure(error)) throw error;
  }
  const [metadata] = await file.getMetadata();
  const generation = requiredGeneration(metadata.generation);
  const [raw] = await bucket
    .file(objectName, { generation })
    .download({ validation: "crc32c" });
  return {
    value: JSON.parse(raw.toString("utf8")) as unknown,
    generation,
    created,
  };
}

async function saveQueueIfAbsent(
  bucket: any,
  objectName: string,
  receipt: CaptureTranscriptQueueReceipt,
) {
  const file = bucket.file(objectName);
  try {
    await file.save(JSON.stringify(receipt), {
      resumable: false,
      validation: "crc32c",
      contentType: "application/json; charset=utf-8",
      metadata: {
        cacheControl: "private, no-store",
        metadata: {
          quipslyKind: receipt.kind,
          quipslyTranscriptJobId: receipt.jobId,
        },
      },
      preconditionOpts: { ifGenerationMatch: 0 },
    });
  } catch (error) {
    if (!isPreconditionFailure(error)) throw error;
    const [raw] = await file.download({ validation: "crc32c" });
    const existing = parseCaptureTranscriptQueueReceipt(
      JSON.parse(raw.toString("utf8")) as unknown,
    );
    if (
      existing.jobId !== receipt.jobId
      || existing.manifestObjectName !== receipt.manifestObjectName
      || existing.enqueuedAt !== receipt.enqueuedAt
    ) {
      throw new CaptureTranscriptOutboxError(
        "TRANSCRIPT_QUEUE_BINDING_MISMATCH",
        "Existing transcript queue receipt has a different immutable binding.",
      );
    }
  }
}


async function holdJob(
  prisma: any,
  jobId: string,
  message: string,
  code: string,
) {
  const current = await prisma.transcriptJob.findUnique({
    where: { id: jobId },
    select: { resultJson: true },
  });
  await prisma.transcriptJob.update({
    where: { id: jobId },
    data: {
      status: "HELD",
      provider: "processing-hold",
      errorMessage: message,
      resultJson: {
        ...jsonObject(current?.resultJson),
        source: "capture-transcript-background-worker",
        hold: {
          code,
          message,
          heldAt: new Date().toISOString(),
          explicitReleaseRequired: true,
        },
      },
    },
  });
}

function executionRequestIsRecent(value: unknown) {
  const requestedAt = Date.parse(text(value));
  return Number.isFinite(requestedAt)
    && Date.now() - requestedAt < 2 * 60 * 1_000;
}

function normalizedLanguage(value: unknown) {
  const normalized = text(value);
  return normalized || null;
}

function isProviderRecordingReceiptSlot(asset: any) {
  const manifest = jsonObject(asset?.localManifestJson);
  return asset?.kind === "SERVER_MIX"
    && manifest.source === "provider-recording-receipt-slot";
}

function bigintAsPositiveNumber(value: unknown) {
  const parsed = typeof value === "bigint" ? Number(value) : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new CaptureTranscriptOutboxError(
      "TRANSCRIPT_SOURCE_SIZE_INVALID",
      "Recording asset has no valid immutable byte count.",
    );
  }
  return parsed;
}

function requiredSha256(value: unknown) {
  const normalized = text(value).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new CaptureTranscriptOutboxError(
      "TRANSCRIPT_SOURCE_SHA_INVALID",
      "Recording asset has no valid immutable SHA-256.",
    );
  }
  return normalized;
}

function requiredMediaType(value: unknown) {
  const normalized = text(value).toLowerCase();
  if (
    !normalized.startsWith("audio/")
    && !normalized.startsWith("video/")
  ) {
    throw new CaptureTranscriptOutboxError(
      "TRANSCRIPT_SOURCE_TYPE_INVALID",
      "Recording asset must be audio or video.",
    );
  }
  return normalized;
}

function requiredEmail(value: unknown) {
  const normalized = text(value).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new CaptureTranscriptOutboxError(
      "TRANSCRIPT_ACTOR_EMAIL_INVALID",
      "Transcript request has no valid actor email.",
    );
  }
  return normalized;
}

function requiredText(value: unknown, label: string) {
  const normalized = text(value);
  if (!normalized) {
    throw new CaptureTranscriptOutboxError(
      "TRANSCRIPT_BINDING_INCOMPLETE",
      `Transcript processing is missing ${label}.`,
    );
  }
  return normalized;
}

function requiredGeneration(value: unknown) {
  const generation = String(value ?? "");
  if (!/^[1-9][0-9]*$/.test(generation)) {
    throw new Error("GCS object is missing an immutable generation.");
  }
  return generation;
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function jsonObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isPreconditionFailure(error: unknown) {
  const code = Number(
    (error as { code?: unknown; status?: unknown })?.code
    ?? (error as { status?: unknown })?.status,
  );
  return code === 409 || code === 412;
}
