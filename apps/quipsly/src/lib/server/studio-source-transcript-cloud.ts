import "server-only";

import { google } from "googleapis";

import {
  CAPTURE_TRANSCRIPT_QUEUE_KIND,
  STUDIO_SOURCE_TRANSCRIPT_CONTRACT_VERSION,
  STUDIO_SOURCE_TRANSCRIPT_RESULT_KIND,
  buildCaptureTranscriptManifestObjectName,
  buildCaptureTranscriptQueueObjectName,
  buildCaptureTranscriptResultObjectName,
  compileDeepgramTerminologyKeyterms,
  newCaptureTranscriptManifest,
  parseCaptureTranscriptManifest,
  parseCaptureTranscriptQueueReceipt,
  parseCaptureTranscriptResult,
  parseStudioSourceTranscriptJob,
  parseStudioSourceTranscriptResult,
  planTranscriptRouting,
  type CaptureTranscriptManifest,
  type CaptureTranscriptProviderRequest,
  type CaptureTranscriptQueueReceipt,
  type DeepgramTerminologyProjection,
  type TranscriptSourceTopology,
  type StudioSourceTranscriptResult,
} from "@high-ground/quipsly-media-processing";

import { getMediaBucket, parseGcsUri, toGcsUri } from "@/lib/server/gcs";
import { assertCaptureTranscriptManifestBinding } from "@/lib/server/capture-transcript-manifest-policy";

export type StudioTranscriptCloudQueueStatus = {
  status: "queued" | "processing" | "output-ready" | "configuration-required" | "failed";
  executionRequested: boolean;
  error: string | null;
};

export async function ensureStudioSourceTranscriptCloudQueued(input: {
  prisma: any;
  processingJob: any;
  actorUserId: string;
}) : Promise<StudioTranscriptCloudQueueStatus> {
  const contract = parseStudioSourceTranscriptJob(input.processingJob.inputJson, input.processingJob.id);
  if (contract.source.provider !== "gcs") throw new Error("Cloud transcript queue requires a generation-bound GCS source.");
  const location = exactGcsLocation(contract.source.locator, contract.source.generation);
  const canonical = await input.prisma.transcriptJob.findUnique({ where: { id: contract.transcriptJobId } });
  if (!canonical || canonical.studioMediaAssetId !== contract.source.assetId || canonical.episodeProductionId !== contract.episodeProductionId) {
    throw new Error("Cloud transcript queue lost its canonical Studio binding.");
  }
  if (canonical.status === "COMPLETED") return { status: "output-ready", executionRequested: false, error: null };
  if (!["QUEUED", "RUNNING"].includes(canonical.status)) {
    return { status: "failed", executionRequested: false, error: canonical.errorMessage || "Canonical transcript is not queueable." };
  }

  if (contract.provider.name === "openai-whisper-local") throw new Error("A GCS transcript job must freeze a cloud provider request.");
  const providerName = contract.provider.name;
  const model = contract.provider.model;
  const version = contract.provider.version;
  const language = normalizeCloudLanguage(contract.provider.language);
  const topology = { kind: "unknown" as const };
  const terminology = providerName === "deepgram" && model.startsWith("nova-3") && contract.terminology
    ? compileDeepgramTerminologyKeyterms(contract.terminology)
    : null;
  const routingPlan = planTranscriptRouting({
    source: { sourceId: contract.source.assetId, sha256: contract.source.sha256, sizeBytes: contract.source.sizeBytes, topology },
    language,
    cloudProcessing: "required",
    providers: {
      appleOnDeviceAvailable: false,
      deepgramAvailable: providerName === "deepgram",
      deepgramModel: model,
      deepgramModelVersion: version,
      deepgramModelVersionPolicy: version === "latest" ? "moving-latest" : "pinned",
      googleSpeechAvailable: providerName === "google-speech-v2",
      googleSpeechModel: model,
      googleSpeechLocation: process.env.GOOGLE_SPEECH_LOCATION?.trim() || "us",
      openAIAvailable: false,
    },
    terminologySnapshotSha256: terminology?.snapshotSha256 || null,
    includeEvaluationComparisons: false,
  });
  const queuedAt = contract.queuedAt;
  const desired = newCaptureTranscriptManifest({
    jobId: contract.transcriptJobId,
    actorUserId: requiredText(input.actorUserId, "actor user"),
    actorEmail: contract.requestedByEmail,
    source: {
      bucketName: location.bucketName,
      objectName: location.objectName,
      generation: location.generation,
      sizeBytes: contract.source.sizeBytes,
      sha256: contract.source.sha256,
      contentType: contract.source.contentType,
      // v1 projections retained for worker replay compatibility. The explicit
      // subject below is the semantic authority for Studio media.
      roomId: contract.episodeProductionId,
      recordingAssetId: contract.source.assetId,
      subject: {
        kind: "studio-media",
        projectId: contract.projectId,
        episodeProductionId: contract.episodeProductionId,
        studioMediaAssetId: contract.source.assetId,
        sourceId: contract.sourceId,
      },
      topology,
    },
    provider: cloudProviderRequest({ name: providerName, topology, model, version, language, terminology }),
    routingPlan,
    queuedAt,
    updatedAt: queuedAt,
  });
  const bucket = getMediaBucket(location.bucketName);
  const manifestObjectName = buildCaptureTranscriptManifestObjectName(contract.transcriptJobId);
  const queueObjectName = buildCaptureTranscriptQueueObjectName(contract.transcriptJobId);
  const stored = await saveManifestIfAbsent(bucket, manifestObjectName, desired);
  const manifest = parseCaptureTranscriptManifest(stored.value, contract.transcriptJobId);
  assertCaptureTranscriptManifestBinding({ stored: manifest, desired, created: stored.created });
  if (manifest.status === "failed-terminal") {
    const message = manifest.failure?.message || "Cloud transcript worker failed terminal.";
    await failRows(input.prisma, input.processingJob.id, contract.transcriptJobId, message, manifest.provider.name);
    return { status: "failed", executionRequested: false, error: message };
  }
  if (manifest.status !== "completed") {
    await saveQueueIfAbsent(bucket, queueObjectName, {
      kind: CAPTURE_TRANSCRIPT_QUEUE_KIND,
      version: 1,
      jobId: contract.transcriptJobId,
      manifestObjectName,
      manifestGeneration: stored.generation,
      enqueuedAt: manifest.queuedAt,
    });
  }

  const previous = object(input.processingJob.resultJson);
  const priorControl = object(previous.cloudControl);
  const configured = workerEnabled();
  const control = {
    schema: "quipsly-studio-transcript-cloud-control-v1",
    bucketName: location.bucketName,
    manifestObjectName,
    manifestGeneration: stored.generation,
    queueObjectName,
    resultObjectName: buildCaptureTranscriptResultObjectName(contract.transcriptJobId),
    sourceGeneration: contract.source.generation,
    sourceSha256: contract.source.sha256,
    executionRequestedAt: text(priorControl.executionRequestedAt) || null,
    configurationRequired: !configured,
    configurationError: configured ? null : "Cloud transcription is queued, but the transcript worker is not configured.",
  };
  await input.prisma.$transaction([
    input.prisma.transcriptJob.update({
      where: { id: contract.transcriptJobId },
      data: {
        status: "RUNNING",
        provider: manifest.provider.name,
        startedAt: canonical.startedAt || new Date(),
        processingManifestObject: manifestObjectName,
        processingResultObject: manifest.status === "completed" ? buildCaptureTranscriptResultObjectName(contract.transcriptJobId) : null,
        sourceGeneration: contract.source.generation,
        sourceSha256: contract.source.sha256,
        errorMessage: null,
        resultJson: { ...object(canonical.resultJson), source: "studio-source-transcript-cloud-worker", cloudControl: control },
      },
    }),
    input.prisma.studioAssetProcessingJob.update({
      where: { id: input.processingJob.id },
      data: { status: manifest.status === "completed" ? "processing" : "queued", error: null, resultJson: { ...previous, state: manifest.status, cloudControl: control } },
    }),
  ]);
  if (manifest.status === "completed") return { status: "output-ready", executionRequested: false, error: null };
  if (!configured) return { status: "configuration-required", executionRequested: false, error: control.configurationError };
  if (recent(control.executionRequestedAt)) return { status: manifest.status === "processing" ? "processing" : "queued", executionRequested: false, error: null };
  await requestWorkerExecution();
  const executionRequestedAt = new Date().toISOString();
  await input.prisma.studioAssetProcessingJob.update({
    where: { id: input.processingJob.id },
    data: { resultJson: { ...previous, state: manifest.status, cloudControl: { ...control, executionRequestedAt } } },
  });
  return { status: manifest.status === "processing" ? "processing" : "queued", executionRequested: true, error: null };
}

export async function projectStudioSourceTranscriptCloudResult(input: {
  prisma: any;
  processingJob: any;
}): Promise<any> {
  const contract = parseStudioSourceTranscriptJob(input.processingJob.inputJson, input.processingJob.id);
  if (contract.source.provider !== "gcs") return input.processingJob;
  const location = exactGcsLocation(contract.source.locator, contract.source.generation);
  const bucket = getMediaBucket(location.bucketName);
  const manifestObjectName = buildCaptureTranscriptManifestObjectName(contract.transcriptJobId);
  const storedManifest = await loadJsonOrNull(bucket, manifestObjectName);
  if (!storedManifest) return input.processingJob;
  const manifest = parseCaptureTranscriptManifest(storedManifest.value, contract.transcriptJobId);
  assertStudioSubject(manifest, contract);
  if (manifest.status === "failed-terminal") {
    const message = manifest.failure?.message || "Cloud transcript worker failed terminal.";
    await failRows(input.prisma, input.processingJob.id, contract.transcriptJobId, message, manifest.provider.name);
    return input.prisma.studioAssetProcessingJob.findUnique({ where: { id: input.processingJob.id } });
  }
  if (manifest.status !== "completed") {
    if (input.processingJob.status !== manifest.status) {
      await input.prisma.studioAssetProcessingJob.update({ where: { id: input.processingJob.id }, data: { status: manifest.status, error: null } });
    }
    return input.prisma.studioAssetProcessingJob.findUnique({ where: { id: input.processingJob.id } });
  }
  const resultObjectName = buildCaptureTranscriptResultObjectName(contract.transcriptJobId);
  const storedResult = await loadJsonOrNull(bucket, resultObjectName);
  if (!storedResult) return input.processingJob;
  const cloud = parseCaptureTranscriptResult(storedResult.value, manifest);
  const receipt = toStudioReceipt(contract, cloud, manifest.attemptCount, Boolean(manifest.provider.terminology));
  await input.prisma.$transaction([
    input.prisma.transcriptJob.update({
      where: { id: contract.transcriptJobId },
      data: {
        provider: cloud.provider.name,
        processingManifestObject: manifestObjectName,
        processingResultObject: resultObjectName,
        providerRequestId: cloud.provider.requestId,
        providerResponseObject: cloud.rawProviderResponse.objectName,
        workerBuildId: cloud.worker.buildId,
      },
    }),
    input.prisma.studioAssetProcessingJob.update({
      where: { id: input.processingJob.id },
      data: { status: "output-ready", error: null, resultJson: { state: "output-ready", receipt } },
    }),
  ]);
  return input.prisma.studioAssetProcessingJob.findUnique({ where: { id: input.processingJob.id } });
}

function toStudioReceipt(
  job: ReturnType<typeof parseStudioSourceTranscriptJob>,
  cloud: ReturnType<typeof parseCaptureTranscriptResult>,
  attempt: number,
  terminologyApplied: boolean,
): StudioSourceTranscriptResult {
  const wordSegment = new Map<number, number>();
  for (const segment of cloud.segments) {
    for (let index = segment.wordStartIndex; index < segment.wordEndIndexExclusive; index += 1) wordSegment.set(index, segment.ordinal);
  }
  return parseStudioSourceTranscriptResult({
    kind: STUDIO_SOURCE_TRANSCRIPT_RESULT_KIND,
    version: STUDIO_SOURCE_TRANSCRIPT_CONTRACT_VERSION,
    jobId: job.jobId,
    transcriptJobId: job.transcriptJobId,
    completedAt: cloud.completedAt,
    source: job.source,
    language: job.provider.language,
    provider: {
      name: cloud.provider.name,
      model: cloud.provider.model,
      rawEvidenceSha256: cloud.rawProviderResponse.sha256,
      rawEvidenceSizeBytes: cloud.rawProviderResponse.sizeBytes,
      rawEvidenceLocator: toGcsUri(cloud.rawProviderResponse.bucketName, cloud.rawProviderResponse.objectName, cloud.rawProviderResponse.generation),
      terminology: terminologyApplied && job.terminology ? {
        snapshotSha256: job.terminology.termsSha256,
        promptSha256: job.terminology.providerInput.promptSha256,
        termCount: job.terminology.providerInput.includedTermIds.length,
        promptCharacterCount: job.terminology.providerInput.promptText.length,
        mode: job.terminology.providerInput.mode,
      } : null,
      capabilities: {
        segmentTiming: "provider",
        wordTiming: "provider",
        wordConfidence: "provider",
        segmentConfidence: "unavailable",
        speakerDiarization: job.provider.speakerDiarization ? "provider" : "unavailable",
        alternatives: "unavailable",
      },
    },
    segments: cloud.segments.map((segment) => ({
      ordinal: segment.ordinal,
      startSeconds: segment.startSeconds,
      endSeconds: segment.endSeconds,
      text: segment.text,
      confidence: segment.confidence,
      speakerLabel: segment.speakerLabel,
      wordStartIndex: segment.wordStartIndex,
      wordEndIndexExclusive: segment.wordEndIndexExclusive,
    })),
    words: cloud.words.map((word) => ({
      index: word.index,
      segmentOrdinal: wordSegment.get(word.index),
      startSeconds: word.startSeconds,
      endSeconds: word.endSeconds,
      word: word.word,
      punctuatedWord: word.punctuatedWord,
      confidence: word.confidence,
      speakerLabel: word.speakerLabel,
    })),
    coverage: {
      segmentCount: cloud.segments.length,
      wordCount: cloud.words.length,
      timedWordCount: cloud.words.length,
      confidenceWordCount: cloud.words.filter((word) => word.confidence != null).length,
      speakerLabeledWordCount: cloud.words.filter((word) => word.speakerLabel != null).length,
      transcriptStartSeconds: cloud.segments[0].startSeconds,
      transcriptEndSeconds: cloud.segments.at(-1)!.endSeconds,
    },
    worker: { ...cloud.worker, attempt: Math.max(1, attempt) },
    boundaries: { ...job.boundaries, completeSourceRead: true, providerEvidenceRetained: true },
  }, job);
}

function assertStudioSubject(manifest: CaptureTranscriptManifest, job: ReturnType<typeof parseStudioSourceTranscriptJob>) {
  const subject = manifest.source.subject;
  if (
    subject?.kind !== "studio-media"
    || subject.projectId !== job.projectId
    || subject.episodeProductionId !== job.episodeProductionId
    || subject.studioMediaAssetId !== job.source.assetId
    || subject.sourceId !== job.sourceId
    || manifest.source.sha256 !== job.source.sha256
    || manifest.source.generation !== job.source.generation
    || manifest.source.sizeBytes !== job.source.sizeBytes
  ) throw new Error("Cloud transcript manifest no longer matches its exact Studio source.");
}

async function failRows(prisma: any, processingJobId: string, transcriptJobId: string, message: string, provider: string) {
  await prisma.$transaction([
    prisma.transcriptJob.update({ where: { id: transcriptJobId }, data: { status: "FAILED", provider, errorMessage: message, completedAt: new Date() } }),
    prisma.studioAssetProcessingJob.update({ where: { id: processingJobId }, data: { status: "failed", error: message, completedAt: new Date() } }),
  ]);
}

async function saveManifestIfAbsent(bucket: any, objectName: string, manifest: CaptureTranscriptManifest) {
  const file = bucket.file(objectName);
  let created = false;
  try {
    await file.save(JSON.stringify(manifest), { resumable: false, validation: "crc32c", contentType: "application/json; charset=utf-8", metadata: { cacheControl: "private, no-store", metadata: { quipslyKind: manifest.kind, quipslyTranscriptJobId: manifest.jobId, quipslyStudioMediaAssetId: manifest.source.recordingAssetId } }, preconditionOpts: { ifGenerationMatch: 0 } });
    created = true;
  } catch (error) { if (!precondition(error)) throw error; }
  const [metadata] = await file.getMetadata();
  const generation = generationText(metadata.generation);
  const [raw] = await bucket.file(objectName, { generation }).download({ validation: "crc32c" });
  return { value: JSON.parse(raw.toString("utf8")) as unknown, generation, created };
}

async function saveQueueIfAbsent(bucket: any, objectName: string, receipt: CaptureTranscriptQueueReceipt) {
  parseCaptureTranscriptQueueReceipt(receipt);
  try {
    await bucket.file(objectName).save(JSON.stringify(receipt), { resumable: false, validation: "crc32c", contentType: "application/json; charset=utf-8", metadata: { cacheControl: "private, no-store", metadata: { quipslyKind: receipt.kind, quipslyTranscriptJobId: receipt.jobId } }, preconditionOpts: { ifGenerationMatch: 0 } });
  } catch (error) { if (!precondition(error)) throw error; }
}

async function loadJsonOrNull(bucket: any, objectName: string) {
  try {
    const file = bucket.file(objectName);
    const [metadata] = await file.getMetadata();
    const generation = generationText(metadata.generation);
    const [raw] = await bucket.file(objectName, { generation }).download({ validation: "crc32c" });
    return { value: JSON.parse(raw.toString("utf8")) as unknown, generation };
  } catch (error) { if (Number((error as { code?: unknown }).code) === 404) return null; throw error; }
}

async function requestWorkerExecution() {
  const projectId = requiredEnvironment("QUIPSLY_TRANSCRIPT_WORKER_PROJECT_ID");
  const region = requiredEnvironment("QUIPSLY_TRANSCRIPT_WORKER_REGION");
  const jobName = requiredEnvironment("QUIPSLY_TRANSCRIPT_WORKER_JOB");
  const auth = new google.auth.GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const client = await auth.getClient();
  await client.request({ url: `https://run.googleapis.com/v2/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(region)}/jobs/${encodeURIComponent(jobName)}:run`, method: "POST", data: {} });
}

function exactGcsLocation(locator: string, generation: string) {
  const parsed = parseGcsUri(locator);
  if (!parsed || parsed.generation !== generation || !parsed.objectName.startsWith("media-vault/") || parsed.objectName.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("Studio transcript source must be one exact generation-bound media-vault object.");
  }
  return { ...parsed, generation };
}
function cloudProviderRequest(input: {
  name: "deepgram" | "google-speech-v2";
  topology: TranscriptSourceTopology;
  model: string;
  version: string | null;
  language: string | null;
  terminology: DeepgramTerminologyProjection | null;
}): CaptureTranscriptProviderRequest {
  const diarize = input.topology.kind !== "participant-isolated";
  return {
    name: input.name,
    model: input.model,
    version: input.version,
    language: input.language,
    smartFormat: true,
    punctuate: true,
    diarize,
    diarizeModel: input.name === "deepgram" && diarize ? "v2" : null,
    multichannel: false,
    utterances: true,
    paragraphs: true,
    terminology: input.name === "deepgram" ? input.terminology : null,
  };
}
function normalizeCloudLanguage(value: string | null) { const language = text(value) || "en"; return language === "en" ? "en-US" : language; }
function workerEnabled() { return process.env.QUIPSLY_TRANSCRIPT_WORKER_ENABLED === "1" && ["QUIPSLY_TRANSCRIPT_WORKER_PROJECT_ID", "QUIPSLY_TRANSCRIPT_WORKER_REGION", "QUIPSLY_TRANSCRIPT_WORKER_JOB"].every((name) => Boolean(process.env[name]?.trim())); }
function recent(value: unknown) { const parsed = Date.parse(text(value)); return Number.isFinite(parsed) && Date.now() - parsed < 60_000; }
function precondition(error: unknown) { const code = Number((error as { code?: unknown; status?: unknown })?.code ?? (error as { status?: unknown })?.status); return code === 409 || code === 412; }
function generationText(value: unknown) { const result = String(value || ""); if (!/^[1-9][0-9]*$/.test(result)) throw new Error("Transcript control object lacks an immutable generation."); return result; }
function requiredText(value: unknown, field: string) { const result = text(value); if (!result) throw new Error(`${field} is required.`); return result; }
function requiredEnvironment(name: string) { return requiredText(process.env[name], name); }
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function object(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
