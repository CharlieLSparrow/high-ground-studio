#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  buildMobileCaptureConsentVersions,
  mobileCaptureAllPartiesAllowTranscription,
  mobileCaptureAllPartiesReady,
} from "../../apps/quipsly/src/lib/server/mobile-capture-consent-readiness.js";

const requireFromQuipsly = createRequire(
  new URL("../../apps/quipsly/package.json", import.meta.url),
);
const { PrismaClient } = requireFromQuipsly("@prisma/client");
const { PrismaPg } = requireFromQuipsly("@prisma/adapter-pg");

const LOCAL_BUCKET = "quipsly-local-development-vault";
const PROVIDER = "openai-whisper-local";
const RESULT_SCHEMA = "quipsly-local-transcript-result-v1";
const DEFAULT_WHISPER_EXECUTABLE = "/opt/homebrew/Caskroom/miniconda/base/bin/whisper";
const MAX_ERROR_LENGTH = 2_000;
let stopping = false;
let activeChild = null;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function object(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : {};
}

export function requireLocalDatabase(value) {
  const url = new URL(value);
  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error("Local transcript worker refuses a non-loopback database.");
  }
  return value;
}

export function safeLocalSourcePath(vaultRoot, objectName) {
  const root = path.resolve(vaultRoot, "objects");
  const normalizedObject = text(objectName);
  if (!normalizedObject.startsWith("media-vault/recordings/")) {
    throw new Error("Local transcript source is outside the recording namespace.");
  }
  const resolved = path.resolve(root, normalizedObject);
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Local transcript source escaped the private vault root.");
  }
  return resolved;
}

export function validateLocalSourceReceipt(value, expected) {
  const receipt = object(value);
  const metadata = object(receipt.customMetadata);
  const receiptSize = Number(receipt.sizeBytes);
  const receiptSha256 = text(metadata.quipslyExpectedSha256).toLowerCase();
  if (text(receipt.generation) !== expected.sourceGeneration) {
    throw new Error("Local transcript source generation does not match its immutable storage receipt.");
  }
  if (!Number.isSafeInteger(receiptSize) || receiptSize !== expected.sizeBytes) {
    throw new Error("Local transcript source size does not match its immutable storage receipt.");
  }
  if (!/^[a-f0-9]{64}$/.test(receiptSha256) || receiptSha256 !== expected.sha256) {
    throw new Error("Local transcript source hash does not match its immutable storage receipt.");
  }
  if (expected.contentType && text(receipt.contentType) !== expected.contentType) {
    throw new Error("Local transcript source type does not match its immutable storage receipt.");
  }
  return {
    generation: expected.sourceGeneration,
    sizeBytes: receiptSize,
    sha256: receiptSha256,
    contentType: text(receipt.contentType) || null,
  };
}

export function normalizeWhisperTranscript(value) {
  const root = object(value);
  const providerSegments = Array.isArray(root.segments) ? root.segments : [];
  const segments = providerSegments.flatMap((candidate, providerSegmentIndex) => {
    const row = object(candidate);
    const startSeconds = Number(row.start);
    const endSeconds = Number(row.end);
    const segmentText = text(row.text);
    if (
      !segmentText
      || !Number.isFinite(startSeconds)
      || !Number.isFinite(endSeconds)
      || startSeconds < 0
      || endSeconds < startSeconds
    ) return [];
    const words = (Array.isArray(row.words) ? row.words : []).flatMap((candidateWord) => {
      const wordRow = object(candidateWord);
      const punctuatedWord = text(wordRow.word);
      const wordStart = Number(wordRow.start);
      const wordEnd = Number(wordRow.end);
      if (
        !punctuatedWord
        || !Number.isFinite(wordStart)
        || !Number.isFinite(wordEnd)
        || wordStart < 0
        || wordEnd < wordStart
      ) return [];
      const lexicalWord = punctuatedWord.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, "") || punctuatedWord;
      return [{
        startSeconds: wordStart,
        endSeconds: wordEnd,
        word: lexicalWord,
        punctuatedWord,
        confidence: Number.isFinite(Number(wordRow.probability))
          ? Number(wordRow.probability)
          : null,
      }];
    });
    return [{
      providerSegmentIndex,
      startSeconds,
      endSeconds,
      text: segmentText,
      confidence: null,
      words,
    }];
  });
  if (!segments.length) throw new Error("Whisper returned no usable transcript segments.");
  return {
    language: text(root.language) || null,
    text: text(root.text),
    segments,
  };
}

export function captureParticipantIds(receipt) {
  const originalDecision = object(object(receipt?.metadataJson).originalDecision);
  const readiness = object(originalDecision.initialRoomReadiness);
  const versions = Array.isArray(readiness.consentVersions) ? readiness.consentVersions : [];
  return [...new Set(versions.map((version) => text(object(version).participantId)).filter(Boolean))].sort();
}

export function currentConsentAllowsLocalTranscription(room, sourceType, recordedParticipantIds = []) {
  const requestedScope = new Set(recordedParticipantIds.map(text).filter(Boolean));
  const roomParticipants = Array.isArray(room?.participants) ? room.participants : [];
  const roomConsents = Array.isArray(room?.recordingConsents) ? room.recordingConsents : [];
  const participants = requestedScope.size
    ? roomParticipants.filter((participant) => requestedScope.has(text(participant?.id)))
    : roomParticipants;
  const presentIds = new Set(participants.map((participant) => text(participant?.id)).filter(Boolean));
  const missingRecordedParticipant = [...requestedScope].some((participantId) => !presentIds.has(participantId));
  const consents = requestedScope.size
    ? roomConsents.filter((consent) => requestedScope.has(text(consent?.participantId)))
    : roomConsents;
  const versions = buildMobileCaptureConsentVersions({
    participants,
    consents,
  });
  return {
    allowed:
      !missingRecordedParticipant
      && mobileCaptureAllPartiesReady(versions, sourceType)
      && mobileCaptureAllPartiesAllowTranscription(versions),
    participantCount: versions.length,
    consentIds: versions.map((version) => version.consentId).filter(Boolean),
  };
}

async function hashFile(filename) {
  const digest = createHash("sha256");
  let bytes = 0;
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filename);
    stream.on("data", (chunk) => {
      bytes += chunk.length;
      digest.update(chunk);
    });
    stream.on("end", resolve);
    stream.on("error", reject);
  });
  return { sha256: digest.digest("hex"), bytes };
}

function sourceTypeForAsset(asset) {
  return asset.kind === "LOCAL_VIDEO" || text(asset.contentType).toLowerCase().startsWith("video/")
    ? "video"
    : "audio";
}

export function durableReleasePresent(receipt, asset) {
  const binding = object(object(receipt?.metadataJson).immutableUploadBinding);
  return Boolean(
    receipt?.recordingAssetId === asset?.id
    && receipt?.processingDisposition === "RELEASED"
    && receipt?.transcriptDisposition === "RELEASED"
    && receipt?.releasedAt
    && text(receipt?.releaseReason).length >= 20
    && receipt?.transcriptReleasedAt
    && text(receipt?.transcriptReleaseReason).length >= 20
    && text(binding.uploadSessionId) === text(receipt?.uploadSessionId)
    && text(binding.roomId) === text(asset?.roomId)
    && text(binding.sha256).toLowerCase() === text(asset?.checksum).toLowerCase()
    && text(binding.bucketName) === text(asset?.storageBucket)
    && text(binding.objectName) === text(asset?.storageObjectPath)
    && Number(binding.sizeBytes) === Number(asset?.byteSize)
  );
}

async function nextLocalJob(prisma) {
  return prisma.transcriptJob.findFirst({
    where: {
      status: "QUEUED",
      asset: { storageBucket: LOCAL_BUCKET },
    },
    orderBy: [{ createdAt: "asc" }],
    include: {
      asset: true,
      room: {
        include: {
          participants: true,
          recordingConsents: true,
        },
      },
      _count: { select: { segments: true, words: true } },
    },
  });
}

async function claimLocalJob(prisma, candidate, workerBuildId) {
  if (!candidate.asset || !candidate.room || candidate._count.segments || candidate._count.words) {
    await prisma.transcriptJob.update({
      where: { id: candidate.id },
      data: { status: "FAILED", errorMessage: "Local transcript job has incomplete or mutable source bindings." },
    });
    return null;
  }
  const receipts = await prisma.mobileCaptureFinalizationReceipt.findMany({
    where: { recordingAssetId: candidate.asset.id },
    orderBy: { updatedAt: "desc" },
  });
  // A release authorizes processing of one immutable RecordingAsset, not only
  // its first transcript version. Versioned retries remain safe when the
  // receipt still matches the exact bucket, object, size, and SHA-256 binding.
  const receipt = receipts.find((candidateReceipt) => durableReleasePresent(candidateReceipt, candidate.asset));
  const consent = currentConsentAllowsLocalTranscription(
    candidate.room,
    sourceTypeForAsset(candidate.asset),
    captureParticipantIds(receipt),
  );
  if (!receipt || !consent.allowed) {
    await prisma.transcriptJob.updateMany({
      where: { id: candidate.id, status: "QUEUED" },
      data: {
        status: "HELD",
        errorMessage: "Local transcription is held because current all-party consent or the durable staff release audit is incomplete.",
      },
    });
    return null;
  }
  const priorResult = object(candidate.resultJson);
  const startedAt = new Date();
  const claimed = await prisma.transcriptJob.updateMany({
    where: { id: candidate.id, status: "QUEUED" },
    data: {
      status: "RUNNING",
      provider: PROVIDER,
      startedAt,
      completedAt: null,
      errorMessage: null,
      workerBuildId,
      resultJson: {
        ...priorResult,
        source: "local-durable-transcript-worker",
        localProcessing: {
          schema: RESULT_SCHEMA,
          status: "RUNNING",
          startedAt: startedAt.toISOString(),
          currentConsentIds: consent.consentIds,
          participantCount: consent.participantCount,
          sourceMutationAllowed: false,
          downstreamWorkCreated: false,
        },
      },
    },
  });
  return claimed.count === 1 ? { ...candidate, receipt, consent, startedAt } : null;
}

async function runWhisper({ executable, model, device, language, sourcePath }) {
  await access(executable, fsConstants.X_OK);
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "quipsly-whisper-"));
  const outputPath = path.join(
    outputDirectory,
    `${path.basename(sourcePath, path.extname(sourcePath))}.json`,
  );
  const args = [
    sourcePath,
    "--model", model,
    "--device", device,
    "--output_dir", outputDirectory,
    "--output_format", "json",
    "--verbose", "False",
    "--word_timestamps", "True",
    "--condition_on_previous_text", "False",
    "--fp16", device === "cpu" ? "False" : "True",
  ];
  if (language) args.push("--language", language);
  let stderr = "";
  let stdout = "";
  try {
    const exitCode = await new Promise((resolve, reject) => {
      const child = spawn(executable, args, { stdio: ["ignore", "pipe", "pipe"] });
      activeChild = child;
      child.stdout.on("data", (chunk) => { stdout = `${stdout}${chunk}`.slice(-16_000); });
      child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-16_000); });
      child.on("error", reject);
      child.on("exit", (code, signal) => resolve({ code, signal }));
    });
    if (exitCode.code !== 0) {
      throw new Error(`Whisper exited ${exitCode.code ?? exitCode.signal}: ${text(stderr || stdout).slice(-1_200)}`);
    }
    const raw = await readFile(outputPath);
    return { raw, transcript: normalizeWhisperTranscript(JSON.parse(raw.toString("utf8"))) };
  } finally {
    activeChild = null;
    await rm(outputDirectory, { recursive: true, force: true });
  }
}

async function persistTranscript({
  prisma,
  job,
  transcript,
  rawProviderBytes,
  sourceEvidence,
  sourceGeneration,
  model,
  device,
  workerBuildId,
  mediaRoot,
}) {
  const completedAt = new Date();
  const rawSha256 = createHash("sha256").update(rawProviderBytes).digest("hex");
  const evidenceDirectory = path.join(mediaRoot, "transcripts", "jobs", job.id);
  await mkdir(evidenceDirectory, { recursive: true });
  const rawEvidencePath = path.join(evidenceDirectory, `provider-${rawSha256}.json`);
  try {
    await writeFile(rawEvidencePath, rawProviderBytes, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const existing = await hashFile(rawEvidencePath);
    if (existing.sha256 !== rawSha256 || existing.bytes !== rawProviderBytes.length) {
      throw new Error("Existing local transcript provider evidence does not match the current immutable result.");
    }
  }

  let wordCount = 0;
  await prisma.$transaction(async (transaction) => {
    const current = await transaction.transcriptJob.findUnique({
      where: { id: job.id },
      include: { _count: { select: { segments: true, words: true } } },
    });
    if (
      current?.status !== "RUNNING"
      || current.provider !== PROVIDER
      || current._count.segments !== 0
      || current._count.words !== 0
    ) {
      throw new Error("Transcript job changed after the local worker claimed it.");
    }
    for (const segment of transcript.segments) {
      const created = await transaction.transcriptSegment.create({
        data: {
          transcriptJobId: job.id,
          speakerLabel: null,
          startSeconds: segment.startSeconds,
          endSeconds: segment.endSeconds,
          text: segment.text,
          confidence: segment.confidence,
          metadataJson: {
            source: "local-durable-transcript-worker",
            provider: PROVIDER,
            model,
            device,
            providerSegmentIndex: segment.providerSegmentIndex,
            immutableProviderEvidence: true,
            humanReviewed: false,
            sourceMutated: false,
          },
        },
        select: { id: true },
      });
      if (segment.words.length) {
        await transaction.transcriptWord.createMany({
          data: segment.words.map((word) => ({
            transcriptJobId: job.id,
            segmentId: created.id,
            providerWordIndex: wordCount++,
            startSeconds: word.startSeconds,
            endSeconds: word.endSeconds,
            word: word.word,
            punctuatedWord: word.punctuatedWord,
            confidence: word.confidence,
            speakerLabel: null,
            channel: null,
            metadataJson: {
              source: "local-durable-transcript-worker",
              provider: PROVIDER,
              model,
              immutableProviderEvidence: true,
            },
          })),
        });
      }
    }
    const priorResult = object(current.resultJson);
    await transaction.transcriptJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        provider: PROVIDER,
        language: transcript.language,
        completedAt,
        errorMessage: null,
        sourceGeneration,
        sourceSha256: sourceEvidence.sha256,
        workerBuildId,
        resultJson: {
          ...priorResult,
          source: "local-durable-transcript-worker",
          localProcessing: {
            schema: RESULT_SCHEMA,
            status: "COMPLETED",
            provider: PROVIDER,
            model,
            device,
            startedAt: job.startedAt.toISOString(),
            completedAt: completedAt.toISOString(),
            sourceSha256: sourceEvidence.sha256,
            sourceSizeBytes: sourceEvidence.bytes,
            sourceGeneration,
            rawProviderSha256: rawSha256,
            rawProviderEvidencePath: path.relative(mediaRoot, rawEvidencePath),
            segmentCount: transcript.segments.length,
            wordCount,
            immutableProviderEvidence: true,
            humanReviewed: false,
            sourceMutationAllowed: false,
            downstreamWorkCreated: false,
          },
        },
      },
    });
  }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 });
  return { segmentCount: transcript.segments.length, wordCount, rawSha256 };
}

async function processClaimedJob(prisma, job, options) {
  const sourcePath = safeLocalSourcePath(
    options.captureVaultRoot,
    job.asset.storageObjectPath,
  );
  const sourceStat = await stat(sourcePath);
  if (!sourceStat.isFile()) throw new Error("Local transcript source is not a regular file.");
  const before = await hashFile(sourcePath);
  const expectedSize = Number(job.asset.byteSize);
  if (!Number.isSafeInteger(expectedSize) || expectedSize < 1) {
    throw new Error("Local transcript source byte count cannot be represented safely.");
  }
  if (
    before.bytes !== expectedSize
    || before.sha256 !== text(job.asset.checksum).toLowerCase()
  ) {
    throw new Error("Local transcript source no longer matches the canonical byte count and SHA-256.");
  }
  const manifest = object(job.asset.localManifestJson);
  const sourceGeneration = text(manifest.storageGeneration);
  if (!sourceGeneration || manifest.exactBytesVerified !== true) {
    throw new Error("Local transcript source lacks exact-byte verification evidence.");
  }
  const localReceipt = validateLocalSourceReceipt(
    JSON.parse(await readFile(`${sourcePath}.quipsly.json`, "utf8")),
    {
      sourceGeneration,
      sizeBytes: before.bytes,
      sha256: before.sha256,
      contentType: text(job.asset.contentType) || null,
    },
  );
  const result = await runWhisper({
    executable: options.executable,
    model: options.model,
    device: options.device,
    language: options.language,
    sourcePath,
  });
  const after = await hashFile(sourcePath);
  if (after.bytes !== before.bytes || after.sha256 !== before.sha256) {
    throw new Error("Immutable recording bytes changed while transcription was running.");
  }
  return persistTranscript({
    prisma,
    job,
    transcript: result.transcript,
    rawProviderBytes: result.raw,
    sourceEvidence: after,
    sourceGeneration: localReceipt.generation,
    model: options.model,
    device: options.device,
    workerBuildId: options.workerBuildId,
    mediaRoot: options.mediaRoot,
  });
}

async function failClaimedJob(prisma, jobId, error) {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, MAX_ERROR_LENGTH);
  const failedAt = new Date();
  await prisma.$transaction(async (transaction) => {
    const current = await transaction.transcriptJob.findUnique({ where: { id: jobId } });
    if (current?.status !== "RUNNING" || current.provider !== PROVIDER) return;
    const priorResult = object(current.resultJson);
    const localProcessing = object(priorResult.localProcessing);
    await transaction.transcriptJob.updateMany({
      where: { id: jobId, status: "RUNNING", provider: PROVIDER },
      data: {
        status: "FAILED",
        errorMessage: message,
        completedAt: failedAt,
        resultJson: {
          ...priorResult,
          localProcessing: {
            ...localProcessing,
            status: "FAILED",
            failedAt: failedAt.toISOString(),
            downstreamWorkCreated: false,
            sourceMutationAllowed: false,
          },
        },
      },
    });
  });
  return message;
}

async function runWorker() {
  const databaseURL = requireLocalDatabase(process.env.DATABASE_URL || "");
  const mediaRoot = path.resolve(
    process.env.QUIPSLY_LOCAL_MEDIA_WORKSPACE_ROOT ||
      process.env.QUIPSLY_LOCAL_MEDIA_UPLOAD_ROOT ||
      path.join(os.tmpdir(), "quipsly-media-ingest"),
  );
  const captureVaultRoot = path.resolve(
    process.env.QUIPSLY_LOCAL_CAPTURE_VAULT_ROOT
      || path.join(mediaRoot, "capture-vault"),
  );
  const executable = path.resolve(
    process.env.QUIPSLY_LOCAL_WHISPER_EXECUTABLE || DEFAULT_WHISPER_EXECUTABLE,
  );
  const model = text(process.env.QUIPSLY_LOCAL_WHISPER_MODEL) || "large-v3-turbo";
  const device = text(process.env.QUIPSLY_LOCAL_WHISPER_DEVICE) || "cpu";
  const language = text(process.env.QUIPSLY_LOCAL_WHISPER_LANGUAGE) || "en";
  const workerBuildId = text(process.env.QUIPSLY_LOCAL_TRANSCRIPT_WORKER_BUILD_ID) || "local-development";
  const runOnce = process.argv.includes("--once");
  const pollMilliseconds = Math.max(500, Number(process.env.QUIPSLY_LOCAL_TRANSCRIPT_POLL_MS) || 2_000);
  if (!/^[A-Za-z0-9._-]{2,100}$/.test(model)) throw new Error("Local Whisper model is invalid.");
  if (!/^[A-Za-z0-9._-]{2,30}$/.test(device)) throw new Error("Local Whisper device is invalid.");
  await access(executable, fsConstants.X_OK);
  await mkdir(path.join(mediaRoot, "transcripts", "jobs"), { recursive: true });
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseURL, max: 2 }),
    log: ["error"],
  });
  try {
    do {
      const candidate = await nextLocalJob(prisma);
      if (!candidate) {
        if (runOnce) return;
        await new Promise((resolve) => setTimeout(resolve, pollMilliseconds));
        continue;
      }
      const claimed = await claimLocalJob(prisma, candidate, workerBuildId);
      if (!claimed) {
        if (runOnce) return;
        continue;
      }
      process.stdout.write(`START local transcript ${claimed.id} ${claimed.asset.fileName || claimed.asset.id}\n`);
      try {
        const result = await processClaimedJob(prisma, claimed, {
          executable,
          model,
          device,
          language,
          workerBuildId,
          mediaRoot,
          captureVaultRoot,
        });
        process.stdout.write(`PASS local transcript ${claimed.id} ${result.segmentCount} segments ${result.wordCount} words\n`);
      } catch (error) {
        const message = await failClaimedJob(prisma, claimed.id, error);
        process.stderr.write(`FAIL local transcript ${claimed.id} ${message}\n`);
      }
      if (runOnce) return;
    } while (!stopping);
  } finally {
    await prisma.$disconnect();
  }
}

function stop() {
  stopping = true;
  if (activeChild && !activeChild.killed) activeChild.kill("SIGTERM");
}

process.on("SIGTERM", stop);
process.on("SIGINT", stop);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runWorker();
}
