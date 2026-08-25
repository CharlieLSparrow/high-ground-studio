import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import test from "node:test";

import {
  SESSION_RECORDING_SHARE_CLOUD_QUEUE_KIND,
  SESSION_RECORDING_SHARE_CLOUD_MAX_ATTEMPTS,
  assertSessionRecordingShareCloudResult,
  buildSessionRecordingShareCloudManifestObjectName,
  buildSessionRecordingShareCloudQueueObjectName,
  buildSessionRecordingShareCloudResultObjectName,
  newSessionRecordingShareCloudManifest,
  newSessionRecordingShareJob,
  parseSessionRecordingShareCloudManifest,
} from "@high-ground/quipsly-media-processing";

import { processSessionRecordingShareCloudQueueObject } from "./session-recording-share-cloud-worker.js";
import type { CaptureProxyWorkerStorage, ObjectEvidence } from "./worker.js";

const bucket = "quipsly-private-media";
const sourceBytes = Buffer.from("immutable participant audio");
const sourceSha = createHash("sha256").update(sourceBytes).digest("hex");
const job = newSessionRecordingShareJob({
  jobId: "session_share_worker_12345678",
  roomId: "room_worker_12345678",
  outputId: "output_worker_12345678",
  outputRevision: 1,
  requestedAt: "2026-08-25T03:00:00.000Z",
  sourceSetSha256: "a".repeat(64),
  edit: {
    startSeconds: 0,
    endSeconds: 10,
    keptRanges: [
      { id: "range_worker_12345678", startSeconds: 0, endSeconds: 10 },
    ],
    transcriptExclusions: [],
    joinCrossfadeSeconds: 0,
  },
  sources: [
    {
      recordingAssetId: "recording_worker_12345678",
      participantId: "participant_worker_12345678",
      participantLabel: "Coach",
      provider: "gcs",
      bucketName: bucket,
      objectName: "media-vault/recordings/room/source.m4a",
      locator: `gcs://${bucket}/media-vault/recordings/room/source.m4a?generation=101`,
      generation: "101",
      sha256: sourceSha,
      sizeBytes: sourceBytes.length,
      contentType: "audio/mp4",
      programOffsetSeconds: 0,
    },
  ],
  target: {
    provider: "gcs",
    bucketName: bucket,
    objectName:
      "media-vault/derived/session-recording-share/room_worker_12345678/session_share_worker_12345678.m4a",
    locator:
      "media-vault/derived/session-recording-share/room_worker_12345678/session_share_worker_12345678.m4a",
    contentType: "audio/mp4",
    codec: "aac-lc",
    sampleRateHz: 48_000,
    channels: 2,
  },
});

class MemoryStorage implements CaptureProxyWorkerStorage {
  json = new Map<string, { value: unknown; generation: string }>();
  objects = new Map<string, { bytes: Buffer; evidence: ObjectEvidence }>();
  deleted: string[] = [];
  deadLetters: Array<{ name: string; value: unknown; generation: string }> = [];
  constructor() {
    const manifest = newSessionRecordingShareCloudManifest(job);
    const manifestName = buildSessionRecordingShareCloudManifestObjectName(
      job.jobId,
    );
    const queueName = buildSessionRecordingShareCloudQueueObjectName(job.jobId);
    this.json.set(manifestName, { value: manifest, generation: "11" });
    this.json.set(queueName, {
      value: {
        kind: SESSION_RECORDING_SHARE_CLOUD_QUEUE_KIND,
        version: 1,
        jobId: job.jobId,
        manifestObjectName: manifestName,
        manifestGeneration: "11",
        enqueuedAt: manifest.queuedAt,
      },
      generation: "12",
    });
    this.objects.set(job.sources[0]!.objectName, {
      bytes: sourceBytes,
      evidence: {
        bucketName: bucket,
        objectName: job.sources[0]!.objectName,
        generation: "101",
        sizeBytes: sourceBytes.length,
        contentType: "audio/mp4",
        crc32c: "source-crc",
        customMetadata: {},
      },
    });
  }
  async listQueueObjects() {
    return [];
  }
  async listQueueObjectsUnder() {
    return [];
  }
  async loadJson(name: string) {
    const value = this.json.get(name);
    if (!value) throw new Error(`missing ${name}`);
    return value;
  }
  async saveJson(name: string, value: unknown, generation: string) {
    const current = this.json.get(name);
    if (!current || current.generation !== generation)
      throw Object.assign(new Error("precondition"), { code: 412 });
    const stored = { value, generation: String(Number(generation) + 1) };
    this.json.set(name, stored);
    return stored;
  }
  async saveJsonIfAbsent(name: string, value: unknown) {
    if (!this.json.has(name)) this.json.set(name, { value, generation: "31" });
    return this.json.get(name)!;
  }
  async objectEvidence(name: string, generation: string) {
    const row = this.objects.get(name);
    return row?.evidence.generation === generation ? row.evidence : null;
  }
  async materializeObject(
    name: string,
    generation: string,
    destination: string,
  ) {
    const row = this.objects.get(name);
    if (!row || row.evidence.generation !== generation)
      throw new Error("missing object");
    await writeFile(destination, row.bytes);
    return {
      sizeBytes: row.bytes.length,
      sha256: createHash("sha256").update(row.bytes).digest("hex"),
    };
  }
  async uploadProxy(
    sourcePath: string,
    objectName: string,
    contentType: string,
    customMetadata: Record<string, string>,
  ) {
    const bytes = await readFile(sourcePath);
    const evidence = {
      bucketName: bucket,
      objectName,
      generation: "202",
      sizeBytes: bytes.length,
      contentType,
      crc32c: "output-crc",
      customMetadata,
    };
    this.objects.set(objectName, { bytes, evidence });
    return evidence;
  }
  async deleteObject(name: string) {
    this.deleted.push(name);
  }
  async writeDeadLetter(name: string, value: unknown, generation: string) {
    this.deadLetters.push({ name, value, generation });
  }
}

test("cloud worker verifies every source and installs one private exact-generation result", async () => {
  const storage = new MemoryStorage();
  const renderer = {
    async render(_job: unknown, outputPath: string) {
      const bytes = Buffer.from("rendered private coaching share");
      await writeFile(outputPath, bytes);
      return {
        sizeBytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        technical: {
          durationSeconds: 10,
          codec: "aac",
          sampleRateHz: 48_000,
          channels: 2,
          completeDecode: true,
          ffmpegVersion: "ffmpeg test",
        },
      };
    },
  };
  const queueName = buildSessionRecordingShareCloudQueueObjectName(job.jobId);
  const result = await processSessionRecordingShareCloudQueueObject(
    storage,
    renderer as never,
    {
      executionId: "execution_worker_12345678",
      buildId: "build-test",
      imageDigest: null,
      leaseDurationMs: 60_000,
      now: () => new Date("2026-08-25T03:01:00.000Z"),
    },
    { name: queueName, generation: "12" },
  );
  assert.equal(result.disposition, "completed");
  const canonical = assertSessionRecordingShareCloudResult(
    storage.json.get(
      buildSessionRecordingShareCloudResultObjectName(job.jobId),
    )!.value,
    job,
  );
  assert.equal(canonical.output.generation, "202");
  assert.equal(
    parseSessionRecordingShareCloudManifest(
      storage.json.get(
        buildSessionRecordingShareCloudManifestObjectName(job.jobId),
      )!.value,
    ).status,
    "completed",
  );
  assert.deepEqual(storage.deleted, [queueName]);
  assert.deepEqual(storage.deadLetters, []);
});

test("cloud worker terminalizes a preview after bounded transient attempts", async () => {
  const storage = new MemoryStorage();
  const manifestName = buildSessionRecordingShareCloudManifestObjectName(job.jobId);
  const queued = newSessionRecordingShareCloudManifest(job);
  storage.json.set(manifestName, {
    value: { ...queued, attemptCount: SESSION_RECORDING_SHARE_CLOUD_MAX_ATTEMPTS },
    generation: "11",
  });
  let renderCalls = 0;
  const renderer = {
    async render() {
      renderCalls += 1;
      throw new Error("renderer must not run after retry exhaustion");
    },
  };
  const queueName = buildSessionRecordingShareCloudQueueObjectName(job.jobId);
  const result = await processSessionRecordingShareCloudQueueObject(
    storage,
    renderer as never,
    {
      executionId: "execution_worker_retry_exhausted",
      buildId: "build-test",
      imageDigest: null,
      leaseDurationMs: 60_000,
      now: () => new Date("2026-08-25T03:02:00.000Z"),
    },
    { name: queueName, generation: "12" },
  );

  assert.deepEqual(result, {
    disposition: "terminal",
    jobId: job.jobId,
    code: "session-share-retry-exhausted",
  });
  assert.equal(renderCalls, 0);
  const terminal = parseSessionRecordingShareCloudManifest(
    storage.json.get(manifestName)!.value,
    job.jobId,
  );
  assert.equal(terminal.status, "failed-terminal");
  assert.equal(terminal.attemptCount, SESSION_RECORDING_SHARE_CLOUD_MAX_ATTEMPTS + 1);
  assert.equal(terminal.failure?.code, "session-share-retry-exhausted");
  assert.equal(storage.deadLetters.length, 1);
  assert.deepEqual(storage.deleted, [queueName]);
});
