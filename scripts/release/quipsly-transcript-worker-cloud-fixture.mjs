#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import {
  lstat,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";

import { Storage } from "@google-cloud/storage";

import {
  CAPTURE_TRANSCRIPT_QUEUE_KIND,
  buildCaptureTranscriptManifestObjectName,
  buildCaptureTranscriptQueueObjectName,
  buildCaptureTranscriptRawObjectName,
  buildCaptureTranscriptResultObjectName,
  newCaptureTranscriptManifest,
  parseCaptureTranscriptManifest,
  parseCaptureTranscriptResult,
} from "../../packages/quipsly-media-processing/src/index.ts";

const execute = promisify(execFile);
const projectId = requiredEnvironment("PROJECT_ID", /^[a-z][a-z0-9-]{4,62}$/);
const bucketName = requiredEnvironment(
  "QUIPSLY_MEDIA_BUCKET",
  /^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/,
);
const expectedBuildId = requiredEnvironment(
  "EXPECTED_BUILD_ID",
  /^[0-9a-f]{40}$/,
);
const fixtureAudioInput = requiredEnvironment("FIXTURE_AUDIO_PATH", /.+/);
if (process.env.FIXTURE_CONSENT_ACKNOWLEDGED !== "1") {
  throw new Error(
    "FIXTURE_CONSENT_ACKNOWLEDGED=1 is required for an authorized, "
      + "non-sensitive speech fixture.",
  );
}

const region = optionalEnvironment("REGION", "us-central1");
const jobName = optionalEnvironment("JOB_NAME", "quipsly-transcript-worker");
const deepgramSecret = optionalEnvironment(
  "DEEPGRAM_SECRET",
  "quipsly-deepgram-api-key",
);
const transcriptProvider = optionalEnvironment("TRANSCRIPT_PROVIDER", "deepgram");
if (!["deepgram", "google-speech-v2"].includes(transcriptProvider)) {
  throw new Error("TRANSCRIPT_PROVIDER must be deepgram or google-speech-v2.");
}
const providerModel = optionalEnvironment(
  "TRANSCRIPT_MODEL",
  transcriptProvider === "google-speech-v2" ? "chirp_3" : "nova-3",
);
const providerLanguage = optionalEnvironment("TRANSCRIPT_LANGUAGE", "en-US");
const minimumWordCount = boundedInteger(
  process.env.MINIMUM_WORD_COUNT,
  3,
  1,
  10_000,
);
const cleanupRequested = process.env.CLEANUP === "1";
assertSafeName(region, "region");
assertSafeName(jobName, "job name");
if (transcriptProvider === "deepgram") assertSafeSecretName(deepgramSecret);
if (!/^[A-Za-z0-9._-]{1,128}$/.test(providerModel)) {
  throw new Error("TRANSCRIPT_MODEL is unsafe.");
}
if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(providerLanguage)) {
  throw new Error("TRANSCRIPT_LANGUAGE is unsafe.");
}

const fixtureAudioPath = await resolveFixtureAudioPath(fixtureAudioInput);
const suffix = `${utcCompact()}_${randomBytes(6).toString("hex")}`;
const jobId = `transcript_fixture_${suffix}`;
const roomId = `fixture_room_${suffix}`;
const recordingAssetId = `fixture_recording_${suffix}`;
const sourceObjectName =
  `media-vault/recordings/transcript-fixtures/${jobId}/source.wav`;
const manifestObjectName = buildCaptureTranscriptManifestObjectName(jobId);
const queueObjectName = buildCaptureTranscriptQueueObjectName(jobId);
const rawObjectName = buildCaptureTranscriptRawObjectName(jobId);
const resultObjectName = buildCaptureTranscriptResultObjectName(jobId);
const scratch = await mkdtemp(
  join(tmpdir(), "quipsly-transcript-cloud-fixture-"),
);
const marker = join(scratch, ".quipsly-cloud-fixture");
await writeFile(marker, jobId, { mode: 0o600 });

const storage = new Storage({ projectId });
const bucket = storage.bucket(bucketName);
const fixtureObjectNames = [
  queueObjectName,
  resultObjectName,
  rawObjectName,
  manifestObjectName,
  sourceObjectName,
];

try {
  const jobContract = await readJobContract();
  const sourcePath = join(scratch, "source.wav");
  await normalizeSpeechFixture(fixtureAudioPath, sourcePath);
  const sourceProbe = await probeAudio(sourcePath);
  assertSourceProbe(sourceProbe);
  const sourceBytes = await readFile(sourcePath);
  const sourceSha256 = sha256(sourceBytes);

  await bucket.upload(sourcePath, {
    destination: sourceObjectName,
    resumable: false,
    validation: "crc32c",
    metadata: {
      contentType: "audio/wav",
      cacheControl: "private, no-store",
      metadata: {
        quipslyKind: "capture-transcript-cloud-fixture-v1",
        quipslyFixtureJobId: jobId,
        quipslyExpectedSha256: sourceSha256,
        quipslyExpectedSizeBytes: String(sourceBytes.byteLength),
      },
    },
    preconditionOpts: { ifGenerationMatch: 0 },
  });
  const sourceEvidence = await objectEvidence(sourceObjectName);
  assert(
    sourceEvidence.sizeBytes === sourceBytes.byteLength,
    "Uploaded speech fixture size does not match its local source.",
  );
  assert(
    sourceEvidence.contentType === "audio/wav",
    "Uploaded speech fixture content type drifted.",
  );
  assert(
    sourceEvidence.customMetadata.quipslyExpectedSha256 === sourceSha256,
    "Uploaded speech fixture SHA-256 metadata drifted.",
  );
  assert(
    sourceEvidence.customMetadata.quipslyExpectedSizeBytes
      === String(sourceBytes.byteLength),
    "Uploaded speech fixture size metadata drifted.",
  );

  const queuedAt = new Date().toISOString();
  const manifest = newCaptureTranscriptManifest({
    jobId,
    actorUserId: `fixture_actor_${suffix}`,
    actorEmail: "transcript-fixture@quipsly.com",
    source: {
      bucketName,
      objectName: sourceObjectName,
      generation: sourceEvidence.generation,
      sizeBytes: sourceEvidence.sizeBytes,
      sha256: sourceSha256,
      contentType: sourceEvidence.contentType,
      roomId,
      recordingAssetId,
    },
    provider: {
      name: transcriptProvider,
      model: providerModel,
      version: transcriptProvider === "deepgram" ? "latest" : null,
      language: providerLanguage,
      smartFormat: true,
      punctuate: true,
      diarize: true,
      diarizeModel: transcriptProvider === "deepgram" ? "v2" : null,
      multichannel: false,
      utterances: true,
      paragraphs: true,
    },
    queuedAt,
    updatedAt: queuedAt,
  });
  const initialManifest = await saveJsonIfAbsent(
    manifestObjectName,
    manifest,
    {
      quipslyKind: manifest.kind,
      quipslyTranscriptJobId: jobId,
      quipslyFixture: "true",
    },
  );
  await enqueue(initialManifest.generation, queuedAt);

  const firstExecution = await executeJob();
  const completedManifestStored = await loadJson(manifestObjectName);
  const completedManifest = parseCaptureTranscriptManifest(
    completedManifestStored.value,
    jobId,
  );
  assert(
    completedManifest.status === "completed",
    `Fixture manifest ended in ${completedManifest.status}, not completed.`,
  );
  assert(
    completedManifestStored.generation !== initialManifest.generation,
    "Worker did not advance the transcript manifest generation.",
  );

  const rawStored = await loadJson(rawObjectName);
  const resultStored = await loadJson(resultObjectName);
  const result = parseCaptureTranscriptResult(
    resultStored.value,
    completedManifest,
  );
  assert(
    result.worker.buildId === expectedBuildId,
    "Worker result does not identify the expected committed source.",
  );
  assert(
    result.worker.imageDigest === jobContract.imageDigest,
    "Worker result image digest does not match the deployed job image.",
  );
  assert(
    result.rawProviderResponse.generation === rawStored.generation
      && result.rawProviderResponse.sizeBytes === rawStored.sizeBytes
      && result.rawProviderResponse.sha256 === rawStored.sha256,
    "Raw provider receipt does not match the normalized result binding.",
  );
  assert(
    result.words.length >= minimumWordCount,
    `Transcript returned ${result.words.length} words; `
      + `at least ${minimumWordCount} were required.`,
  );
  assertTranscriptBounds(result, sourceProbe.durationSeconds);
  assertProviderMetadata(
    rawStored.evidence.customMetadata,
    completedManifest,
    rawStored.sha256,
  );

  const firstGenerations = {
    source: sourceEvidence.generation,
    manifest: completedManifestStored.generation,
    raw: rawStored.generation,
    result: resultStored.generation,
  };

  const replayQueuedAt = new Date().toISOString();
  await enqueue(completedManifestStored.generation, replayQueuedAt);
  const secondExecution = await executeJob();
  const replaySource = await objectEvidence(sourceObjectName);
  const replayManifest = await loadJson(manifestObjectName);
  const replayRaw = await loadJson(rawObjectName);
  const replayResult = await loadJson(resultObjectName);
  assert(
    replaySource.generation === firstGenerations.source,
    "Completed-job replay replaced the immutable speech source.",
  );
  assert(
    replayManifest.generation === firstGenerations.manifest,
    "Completed-job replay rewrote the manifest.",
  );
  assert(
    replayRaw.generation === firstGenerations.raw,
    "Completed-job replay replaced the billable provider receipt.",
  );
  assert(
    replayResult.generation === firstGenerations.result,
    "Completed-job replay replaced the normalized result.",
  );
  const [queueExists] = await bucket.file(queueObjectName).exists();
  assert(!queueExists, "Completed-job replay left its queue receipt behind.");

  const speakerCount = new Set(
    result.words
      .map((word) => word.speakerLabel)
      .filter((speaker) => speaker !== null),
  ).size;
  const report = {
    kind: "quipsly-transcript-worker-cloud-fixture-report-v1",
    passed: true,
    projectId,
    region,
    jobName,
    jobId,
    expectedBuildId,
    imageDigest: jobContract.imageDigest,
    executions: [firstExecution, secondExecution],
    source: {
      objectName: sourceObjectName,
      generation: sourceEvidence.generation,
      sizeBytes: sourceEvidence.sizeBytes,
      sha256: sourceSha256,
      durationSeconds: sourceProbe.durationSeconds,
      sampleRate: sourceProbe.sampleRate,
      channels: sourceProbe.channels,
      unchangedAfterWorker: true,
    },
    manifest: {
      objectName: manifestObjectName,
      initialGeneration: initialManifest.generation,
      completedGeneration: completedManifestStored.generation,
      status: completedManifest.status,
    },
    providerReceipt: {
      objectName: rawObjectName,
      generation: rawStored.generation,
      sizeBytes: rawStored.sizeBytes,
      sha256: rawStored.sha256,
      requestIdSha256: sha256(Buffer.from(result.provider.requestId)),
    },
    transcript: {
      objectName: resultObjectName,
      generation: resultStored.generation,
      model: result.provider.model,
      durationSeconds: result.provider.durationSeconds,
      channelCount: result.provider.channels,
      speakerCount,
      segmentCount: result.segments.length,
      wordCount: result.words.length,
      firstWordSeconds: result.words[0].startSeconds,
      lastWordSeconds: result.words.at(-1).endSeconds,
      textDisclosed: false,
    },
    completedReplayWasCreateOnceNoOp: true,
    cleanupRequested,
    completedAt: new Date().toISOString(),
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  if (cleanupRequested) {
    for (const objectName of fixtureObjectNames) {
      const evidence = await objectEvidence(objectName).catch((error) => {
        if (Number(error?.code) === 404) return null;
        throw error;
      });
      if (evidence) await deleteExactGeneration(evidence);
    }
  }
  const markerValue = await readFile(marker, "utf8").catch(() => "");
  if (markerValue === jobId) {
    await rm(scratch, { recursive: true, force: true });
  }
}

async function resolveFixtureAudioPath(input) {
  const candidate = isAbsolute(input) ? input : resolve(process.cwd(), input);
  const linkInfo = await lstat(candidate);
  if (linkInfo.isSymbolicLink()) {
    throw new Error("FIXTURE_AUDIO_PATH must not be a symbolic link.");
  }
  const canonical = await realpath(candidate);
  const fileInfo = await stat(canonical);
  if (!fileInfo.isFile() || fileInfo.size < 1 || fileInfo.size > 100 * 1024 * 1024) {
    throw new Error(
      "FIXTURE_AUDIO_PATH must be a regular file between 1 byte and 100 MiB.",
    );
  }
  return canonical;
}

async function readJobContract() {
  const { stdout } = await execute(
    "gcloud",
    [
      "run",
      "jobs",
      "describe",
      jobName,
      `--project=${projectId}`,
      `--region=${region}`,
      "--format=json",
    ],
    { maxBuffer: 4 * 1024 * 1024 },
  );
  const job = JSON.parse(stdout);
  const template =
    job.template?.template
    || job.spec?.template?.spec?.template?.spec;
  const container = template?.containers?.[0];
  const environment = Object.fromEntries(
    (container?.env || []).map((entry) => [entry.name, entry]),
  );
  const image = String(container?.image || "");
  const digestMatch = image.match(/@(sha256:[0-9a-f]{64})$/);
  assert(digestMatch, "Cloud Run Job does not use an immutable image digest.");
  assert(
    environment.QUIPSLY_MEDIA_BUCKET?.value === bucketName,
    "Cloud Run Job media bucket does not match the fixture bucket.",
  );
  assert(
    environment.QUIPSLY_WORKER_BUILD_ID?.value === expectedBuildId,
    "Cloud Run Job build ID does not match EXPECTED_BUILD_ID.",
  );
  assert(
    environment.QUIPSLY_TRANSCRIPT_PROVIDER?.value === transcriptProvider,
    "Cloud Run Job provider does not match TRANSCRIPT_PROVIDER.",
  );
  const secret =
    environment.DEEPGRAM_API_KEY?.valueSource?.secretKeyRef?.secret
    || environment.DEEPGRAM_API_KEY?.valueFrom?.secretKeyRef?.name;
  if (transcriptProvider === "deepgram") {
    assert(
      secret === deepgramSecret
        || String(secret || "").endsWith(`/secrets/${deepgramSecret}`),
      "Cloud Run Job does not use the expected Deepgram secret.",
    );
    assert(
      typeof environment.DEEPGRAM_API_KEY?.value !== "string",
      "Cloud Run Job exposes the Deepgram key as plaintext.",
    );
  } else {
    assert(!environment.DEEPGRAM_API_KEY, "Google worker retains a Deepgram secret.");
  }
  return { image, imageDigest: digestMatch[1] };
}

async function normalizeSpeechFixture(input, destination) {
  await execute(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      input,
      "-map_metadata",
      "-1",
      "-vn",
      "-ac",
      "1",
      "-ar",
      "48000",
      "-c:a",
      "pcm_s16le",
      "-y",
      destination,
    ],
    { maxBuffer: 4 * 1024 * 1024 },
  );
}

async function probeAudio(filePath) {
  const { stdout } = await execute(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      filePath,
    ],
    { maxBuffer: 4 * 1024 * 1024 },
  );
  const probe = JSON.parse(stdout);
  const audioStreams = (probe.streams || []).filter(
    (stream) => stream.codec_type === "audio",
  );
  const audio = audioStreams[0] || {};
  return {
    audioStreamCount: audioStreams.length,
    codec: String(audio.codec_name || ""),
    channels: Number(audio.channels),
    sampleRate: Number(audio.sample_rate),
    durationSeconds: Number(probe.format?.duration || audio.duration),
  };
}

function assertSourceProbe(probe) {
  assert(probe.audioStreamCount === 1, "Fixture must contain one audio stream.");
  assert(probe.codec === "pcm_s16le", "Fixture audio is not canonical PCM.");
  assert(probe.channels === 1, "Fixture audio is not mono.");
  assert(probe.sampleRate === 48_000, "Fixture audio is not 48 kHz.");
  assert(
    Number.isFinite(probe.durationSeconds)
      && probe.durationSeconds >= 1
      && probe.durationSeconds <= 120,
    "Fixture speech must be between 1 and 120 seconds.",
  );
}

function assertTranscriptBounds(result, sourceDurationSeconds) {
  const allowanceSeconds = 1;
  for (const word of result.words) {
    assert(
      word.startSeconds >= 0
        && word.endSeconds >= word.startSeconds
        && word.endSeconds <= sourceDurationSeconds + allowanceSeconds,
      `Transcript word ${word.index} falls outside the source duration.`,
    );
  }
  for (const segment of result.segments) {
    assert(
      segment.startSeconds >= 0
        && segment.endSeconds >= segment.startSeconds
        && segment.endSeconds <= sourceDurationSeconds + allowanceSeconds,
      `Transcript segment ${segment.ordinal} falls outside the source duration.`,
    );
  }
}

function assertProviderMetadata(metadata, manifest, responseSha256) {
  const expected = {
    quipslyKind: "capture-transcript-provider-response-v1",
    quipslyTranscriptJobId: jobId,
    quipslySourceGeneration: manifest.source.generation,
    quipslySourceSha256: manifest.source.sha256,
    quipslyProvider: manifest.provider.name,
    quipslyProviderModel: manifest.provider.model,
    quipslyProviderResponseSha256: responseSha256,
  };
  for (const [key, value] of Object.entries(expected)) {
    assert(
      metadata[key] === value,
      `Stored provider receipt metadata ${key} does not match its binding.`,
    );
  }
}

async function enqueue(manifestGeneration, enqueuedAt) {
  return saveJsonIfAbsent(
    queueObjectName,
    {
      kind: CAPTURE_TRANSCRIPT_QUEUE_KIND,
      version: 1,
      jobId,
      manifestObjectName,
      manifestGeneration,
      enqueuedAt,
    },
    {
      quipslyKind: CAPTURE_TRANSCRIPT_QUEUE_KIND,
      quipslyTranscriptJobId: jobId,
      quipslyFixture: "true",
    },
  );
}

async function executeJob() {
  const { stdout, stderr } = await execute(
    "gcloud",
    [
      "run",
      "jobs",
      "execute",
      jobName,
      `--project=${projectId}`,
      `--region=${region}`,
      "--wait",
      "--quiet",
      "--format=value(metadata.name)",
    ],
    { maxBuffer: 8 * 1024 * 1024 },
  );
  const executionName = stdout.trim()
    || stderr.match(/executions\/([A-Za-z0-9-]+)/)?.[1]
    || "completed-execution-name-not-returned";
  return { executionName };
}

async function saveJsonIfAbsent(objectName, value, customMetadata) {
  await bucket.file(objectName).save(JSON.stringify(value), {
    resumable: false,
    validation: "crc32c",
    contentType: "application/json; charset=utf-8",
    metadata: {
      cacheControl: "private, no-store",
      metadata: customMetadata,
    },
    preconditionOpts: { ifGenerationMatch: 0 },
  });
  return loadJson(objectName);
}

async function loadJson(objectName) {
  const evidence = await objectEvidence(objectName);
  const [bytes] = await bucket.file(
    objectName,
    { generation: evidence.generation },
  ).download({ validation: "crc32c" });
  return {
    value: JSON.parse(bytes.toString("utf8")),
    generation: evidence.generation,
    sizeBytes: bytes.byteLength,
    sha256: sha256(bytes),
    evidence,
  };
}

async function objectEvidence(objectName, generation) {
  const file = bucket.file(
    objectName,
    generation ? { generation } : undefined,
  );
  const [metadata] = await file.getMetadata();
  const resolvedGeneration = String(metadata.generation || "");
  assert(
    /^[1-9][0-9]*$/.test(resolvedGeneration),
    `Object ${objectName} has no immutable generation.`,
  );
  return {
    bucketName,
    objectName,
    generation: resolvedGeneration,
    sizeBytes: Number(metadata.size),
    contentType: String(metadata.contentType || "").split(";")[0],
    customMetadata: Object.fromEntries(
      Object.entries(metadata.metadata || {}).map(([key, value]) => [
        key,
        String(value),
      ]),
    ),
  };
}

async function deleteExactGeneration(evidence) {
  try {
    await bucket.file(
      evidence.objectName,
      { generation: evidence.generation },
    ).delete({ ifGenerationMatch: evidence.generation });
  } catch (error) {
    if (Number(error?.code) !== 404) throw error;
  }
}

function requiredEnvironment(name, pattern) {
  const value = String(process.env[name] || "").trim();
  if (!pattern.test(value)) {
    throw new Error(`${name} is missing or unsafe.`);
  }
  return value;
}

function optionalEnvironment(name, fallback) {
  return String(process.env[name] || fallback).trim();
}

function assertSafeName(value, label) {
  if (!/^[a-z][a-z0-9-]{0,62}$/.test(value)) {
    throw new Error(`Unsafe ${label}: ${value || "<missing>"}.`);
  }
}

function assertSafeSecretName(value) {
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,254}$/.test(value)) {
    throw new Error("DEEPGRAM_SECRET is unsafe.");
  }
}

function boundedInteger(raw, fallback, minimum, maximum) {
  const value = raw == null || raw.trim() === "" ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`Expected an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function utcCompact() {
  return new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
