import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import test from "node:test";

import {
  INTERRUPTION_REPAIR_QUEUE_KIND,
  buildInterruptionRepairManifestObjectName,
  buildInterruptionRepairQueueObjectName,
  buildInterruptionRepairResultObjectName,
  buildInterruptionRepairTargetObjectName,
  newInterruptionRepairManifest,
  parseInterruptionRepairManifest,
  parseInterruptionRepairResult,
} from "@high-ground/quipsly-media-processing";

import type { InterruptionRepairEngine } from "./interruption-repair-ffmpeg.js";
import { processInterruptionRepairQueueObject } from "./interruption-repair-worker.js";
import type { CaptureProxyWorkerStorage, ObjectEvidence } from "./worker.js";

test("worker verifies exact original, writes a separate derivative, and completes atomically", async () => {
  const jobId = "repair-job-12345678";
  const sourceBytes = Buffer.from("immutable interrupted packet payload");
  const repairedBytes = Buffer.from("seekable repaired container around immutable packet payload");
  const sourceSha = sha256(sourceBytes);
  const targetName = buildInterruptionRepairTargetObjectName({
    projectSlug: "coaching",
    recordingAssetId: "recording-12345678",
    jobId,
  });
  const manifest = newInterruptionRepairManifest({
    jobId,
    projectId: "project-12345678",
    projectSlug: "coaching",
    actorUserId: "user-12345678",
    actorEmail: "coach@example.com",
    captureId: "capture-12345678",
    captureGroupId: "take-12345678",
    source: {
      bucketName: "quipsly-media.example",
      objectName: "media-vault/recordings/coaching/interrupted.webm",
      generation: "101",
      sizeBytes: sourceBytes.length,
      sha256: sourceSha,
      contentType: "audio/webm",
      recordingAssetId: "recording-12345678",
      uploadSessionId: "upload-12345678",
    },
    target: {
      bucketName: "quipsly-media.example",
      objectName: targetName,
      contentType: "audio/webm",
      profile: "lossless-container-remux-v1",
    },
    queuedAt: "2026-08-22T22:00:00.000Z",
    updatedAt: "2026-08-22T22:00:00.000Z",
  });
  const manifestName = buildInterruptionRepairManifestObjectName(jobId);
  const queueName = buildInterruptionRepairQueueObjectName(jobId);
  const storage = new FakeStorage(sourceBytes, manifest.source.objectName, manifest.source);
  storage.json.set(manifestName, { value: manifest, generation: "1" });
  storage.json.set(queueName, {
    value: {
      kind: INTERRUPTION_REPAIR_QUEUE_KIND,
      version: 1,
      jobId,
      manifestObjectName: manifestName,
      manifestGeneration: "1",
      enqueuedAt: manifest.queuedAt,
    },
    generation: "7",
  });
  const engine: InterruptionRepairEngine = {
    async repair(_input, output) {
      await writeFile(output, repairedBytes, { mode: 0o600 });
      return {
        sizeBytes: repairedBytes.length,
        sha256: sha256(repairedBytes),
        technical: {
          durationSeconds: 3.5,
          streamCount: 1,
          hasAudio: true,
          hasVideo: false,
          audioCodec: "opus",
          videoCodec: null,
          decodedToEnd: true,
          packetPayloadReencoded: false,
        },
      };
    },
  };
  let clock = Date.parse("2026-08-22T22:01:00.000Z");
  const outcome = await processInterruptionRepairQueueObject(storage, engine, {
    executionId: "worker-test",
    buildId: "build-test",
    imageDigest: null,
    leaseDurationMs: 60_000,
    now: () => new Date(clock += 1_000),
  }, { name: queueName, generation: "7" });

  assert.equal(outcome.disposition, "completed");
  assert.equal(storage.deleted.has(queueName), true);
  assert.equal(storage.sourceBytes.equals(sourceBytes), true);
  assert.equal(storage.uploaded?.objectName, targetName);
  assert.equal(storage.uploaded?.metadata.originalRemainsSourceTruth, "true");
  const completed = parseInterruptionRepairManifest(storage.json.get(manifestName)!.value, jobId);
  assert.equal(completed.status, "completed");
  const result = parseInterruptionRepairResult(
    storage.json.get(buildInterruptionRepairResultObjectName(jobId))!.value,
    completed,
  );
  assert.equal(result.output.sha256, sha256(repairedBytes));
  assert.equal(result.source.sha256, sourceSha);
  assert.notEqual(result.output.objectName, result.source.objectName);
});

class FakeStorage implements CaptureProxyWorkerStorage {
  readonly json = new Map<string, { value: unknown; generation: string }>();
  readonly deleted = new Set<string>();
  uploaded: { objectName: string; metadata: Record<string, string> } | null = null;
  readonly sourceBytes: Buffer;
  readonly sourceObjectName: string;
  readonly source: {
    bucketName: string;
    generation: string;
    contentType: string;
  };

  constructor(
    sourceBytes: Buffer,
    sourceObjectName: string,
    source: {
      bucketName: string;
      generation: string;
      contentType: string;
    },
  ) {
    this.sourceBytes = sourceBytes;
    this.sourceObjectName = sourceObjectName;
    this.source = source;
  }

  async listQueueObjects() { return []; }
  async listQueueObjectsUnder() { return []; }
  async loadJson(name: string, generation?: string) {
    const row = this.json.get(name);
    if (!row || (generation && row.generation !== generation)) throw Object.assign(new Error("not found"), { code: 404 });
    return structuredClone(row);
  }
  async saveJson(name: string, value: unknown, generation: string) {
    const current = this.json.get(name);
    if (!current || current.generation !== generation) throw Object.assign(new Error("conflict"), { code: 412 });
    const stored = { value: structuredClone(value), generation: String(Number(generation) + 1) };
    this.json.set(name, stored);
    return structuredClone(stored);
  }
  async saveJsonIfAbsent(name: string, value: unknown) {
    if (!this.json.has(name)) this.json.set(name, { value: structuredClone(value), generation: "1" });
    return structuredClone(this.json.get(name)!);
  }
  async objectEvidence(name: string, generation: string): Promise<ObjectEvidence | null> {
    if (name !== this.sourceObjectName || generation !== this.source.generation) return null;
    return {
      bucketName: this.source.bucketName,
      objectName: name,
      generation,
      sizeBytes: this.sourceBytes.length,
      contentType: this.source.contentType,
      crc32c: "source-crc",
      customMetadata: {},
    };
  }
  async materializeObject(_name: string, _generation: string, destination: string) {
    await writeFile(destination, this.sourceBytes, { mode: 0o600 });
    return { sizeBytes: this.sourceBytes.length, sha256: sha256(this.sourceBytes) };
  }
  async uploadProxy(path: string, objectName: string, contentType: string, metadata: Record<string, string>) {
    const bytes = await readFile(path);
    this.uploaded = { objectName, metadata };
    return {
      bucketName: this.source.bucketName,
      objectName,
      generation: "202",
      sizeBytes: bytes.length,
      contentType,
      crc32c: "output-crc",
      customMetadata: metadata,
    };
  }
  async deleteObject(name: string) { this.deleted.add(name); }
  async writeDeadLetter() {}
}

function sha256(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
}
