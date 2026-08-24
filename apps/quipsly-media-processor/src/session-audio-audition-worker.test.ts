import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import test from "node:test";

import {
  SESSION_AUDIO_AUDITION_QUEUE_KIND,
  buildSessionAudioAuditionManifestObjectName,
  buildSessionAudioAuditionQueueObjectName,
  buildSessionAudioAuditionResultObjectName,
  buildSessionAudioAuditionTargetObjectName,
  newSessionAudioAuditionManifest,
  parseSessionAudioAuditionManifest,
  parseSessionAudioAuditionResult,
} from "@high-ground/quipsly-media-processing";

import type { SessionAudioAuditionEngine } from "./session-audio-audition-ffmpeg.js";
import { processSessionAudioAuditionQueueObject } from "./session-audio-audition-worker.js";
import type { CaptureProxyWorkerStorage, ObjectEvidence } from "./worker.js";

test("worker binds compact AAC bytes to the exact camera generation without changing the original", async () => {
  const sourceBytes = Buffer.from("immutable 4k camera source with audio");
  const outputBytes = Buffer.from("small seekable aac transcript audition");
  const jobId = "session_audition_1234567890abcdef";
  const roomId = "room-12345678";
  const recordingAssetId = "recording-12345678";
  const target = buildSessionAudioAuditionTargetObjectName({
    roomId,
    recordingAssetId,
    jobId,
  });
  const manifest = newSessionAudioAuditionManifest({
    jobId,
    roomId,
    requestedByUserId: "user-12345678",
    requestedByEmail: "coach@example.com",
    source: {
      bucketName: "quipsly-media.example",
      objectName: "media-vault/recordings/coaching/camera.mp4",
      generation: "101",
      sizeBytes: sourceBytes.length,
      sha256: sha256(sourceBytes),
      contentType: "video/mp4",
      durationSeconds: 72.5,
      roomId,
      recordingAssetId,
      finalizationUploadSessionId: "123e4567-e89b-12d3-a456-426614174000",
    },
    target: {
      bucketName: "quipsly-media.example",
      objectName: target,
      contentType: "audio/mp4",
      profile: "transcript-audition-aac-lc-128k-v1",
    },
    queuedAt: "2026-08-25T01:00:00.000Z",
    updatedAt: "2026-08-25T01:00:00.000Z",
  });
  const manifestName = buildSessionAudioAuditionManifestObjectName(jobId);
  const queueName = buildSessionAudioAuditionQueueObjectName(jobId);
  const storage = new FakeStorage(sourceBytes, manifest);
  storage.json.set(manifestName, { value: manifest, generation: "1" });
  storage.json.set(queueName, {
    value: {
      kind: SESSION_AUDIO_AUDITION_QUEUE_KIND,
      version: 1,
      jobId,
      manifestObjectName: manifestName,
      manifestGeneration: "1",
      enqueuedAt: manifest.queuedAt,
    },
    generation: "7",
  });
  const engine: SessionAudioAuditionEngine = {
    async extract(_input, output) {
      await writeFile(output, outputBytes, { mode: 0o600 });
      return {
        sizeBytes: outputBytes.length,
        sha256: sha256(outputBytes),
        technical: {
          sourceDurationSeconds: 72.5,
          durationSeconds: 72.5,
          durationDeltaSeconds: 0,
          sourceAudioOrdinal: 0,
          audioCodec: "aac",
          sampleRateHz: 48_000,
          channelCount: 2,
          bitRate: 128_000,
          hasVideo: false,
          decodedToEnd: true,
        },
      };
    },
  };
  let clock = Date.parse("2026-08-25T01:01:00.000Z");
  const outcome = await processSessionAudioAuditionQueueObject(
    storage,
    engine,
    {
      executionId: "worker-test",
      buildId: "build-test",
      imageDigest: null,
      leaseDurationMs: 60_000,
      now: () => new Date((clock += 1_000)),
    },
    { name: queueName, generation: "7" },
  );

  assert.equal(outcome.disposition, "completed");
  assert.equal(storage.deleted.has(queueName), true);
  assert.equal(storage.sourceBytes.equals(sourceBytes), true);
  assert.equal(storage.uploaded?.objectName, target);
  assert.equal(storage.uploaded?.metadata.originalRemainsSourceTruth, "true");
  assert.equal(
    storage.uploaded?.metadata.quipslySourceSha256,
    manifest.source.sha256,
  );
  const completed = parseSessionAudioAuditionManifest(
    storage.json.get(manifestName)!.value,
    jobId,
  );
  assert.equal(completed.status, "completed");
  const result = parseSessionAudioAuditionResult(
    storage.json.get(buildSessionAudioAuditionResultObjectName(jobId))!.value,
    completed,
  );
  assert.equal(result.output.sha256, sha256(outputBytes));
  assert.equal(result.output.metadata.hasVideo, false);
  assert.equal(result.source.generation, "101");
  assert.notEqual(result.output.objectName, result.source.objectName);
});

class FakeStorage implements CaptureProxyWorkerStorage {
  readonly json = new Map<string, { value: unknown; generation: string }>();
  readonly deleted = new Set<string>();
  uploaded: { objectName: string; metadata: Record<string, string> } | null =
    null;
  constructor(
    readonly sourceBytes: Buffer,
    readonly manifest: ReturnType<typeof newSessionAudioAuditionManifest>,
  ) {}
  async listQueueObjects() {
    return [];
  }
  async listQueueObjectsUnder() {
    return [];
  }
  async loadJson(name: string, generation?: string) {
    const row = this.json.get(name);
    if (!row || (generation && row.generation !== generation))
      throw Object.assign(new Error("not found"), { code: 404 });
    return structuredClone(row);
  }
  async saveJson(name: string, value: unknown, generation: string) {
    const row = this.json.get(name);
    if (!row || row.generation !== generation)
      throw Object.assign(new Error("conflict"), { code: 412 });
    const stored = {
      value: structuredClone(value),
      generation: String(Number(generation) + 1),
    };
    this.json.set(name, stored);
    return structuredClone(stored);
  }
  async saveJsonIfAbsent(name: string, value: unknown) {
    if (!this.json.has(name))
      this.json.set(name, { value: structuredClone(value), generation: "1" });
    return structuredClone(this.json.get(name)!);
  }
  async objectEvidence(
    name: string,
    generation: string,
  ): Promise<ObjectEvidence | null> {
    return name === this.manifest.source.objectName &&
      generation === this.manifest.source.generation
      ? {
          bucketName: this.manifest.source.bucketName,
          objectName: name,
          generation,
          sizeBytes: this.sourceBytes.length,
          contentType: this.manifest.source.contentType,
          crc32c: "source-crc",
          customMetadata: {},
        }
      : null;
  }
  async materializeObject(
    _name: string,
    _generation: string,
    destination: string,
  ) {
    await writeFile(destination, this.sourceBytes, { mode: 0o600 });
    return {
      sizeBytes: this.sourceBytes.length,
      sha256: sha256(this.sourceBytes),
    };
  }
  async uploadProxy(
    path: string,
    objectName: string,
    contentType: string,
    metadata: Record<string, string>,
  ) {
    const bytes = await readFile(path);
    this.uploaded = { objectName, metadata };
    return {
      bucketName: this.manifest.source.bucketName,
      objectName,
      generation: "202",
      sizeBytes: bytes.length,
      contentType,
      crc32c: "output-crc",
      customMetadata: metadata,
    };
  }
  async deleteObject(name: string) {
    this.deleted.add(name);
  }
  async writeDeadLetter() {}
}

function sha256(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
}
