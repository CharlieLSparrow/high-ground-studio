import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { stat, writeFile } from "node:fs/promises";
import test from "node:test";

import {
  CAPTURE_PROXY_QUEUE_KIND,
  buildCaptureProxyManifestObjectName,
  buildCaptureProxyQueueObjectName,
  buildCaptureProxyResultObjectName,
  buildCaptureProxyTargetObjectName,
  newCaptureProxyManifest,
  parseCaptureProxyManifest,
  parseCaptureProxyResult,
} from "../packages/quipsly-media-processing/src/index.ts";
import {
  processCaptureProxyQueueObject,
} from "../apps/quipsly-media-processor/src/worker.ts";
import {
  ProxyTranscodeError,
} from "../apps/quipsly-media-processor/src/transcoder.ts";

const jobId = "job_capture_proxy_001";
const sourceBytes = Buffer.from("immutable-source-bytes");
const proxyBytes = Buffer.from("deterministic-proxy-bytes");
const sourceSha256 = sha256(sourceBytes);
const proxySha256 = sha256(proxyBytes);

function fixture() {
  const now = "2026-07-27T16:00:00.000Z";
  const manifest = newCaptureProxyManifest({
    jobId,
    projectId: "project_001",
    projectSlug: "high-ground-odyssey",
    episodeSlug: "episode-5",
    actorUserId: "actor_001",
    actorEmail: "charlie@example.com",
    captureId: "capture_001",
    captureGroupId: "capture_group_001",
    source: {
      bucketName: "quipsly-media",
      objectName: "media-vault/recordings/capture/video.mov",
      generation: "101",
      sizeBytes: sourceBytes.byteLength,
      sha256: sourceSha256,
      contentType: "video/quicktime",
      rawAssetId: "raw_asset_001",
      sourceId: "source_001",
      recordingAssetId: "recording_001",
      uploadSessionId: "11111111-1111-4111-8111-111111111111",
    },
    target: {
      bucketName: "quipsly-media",
      objectName: buildCaptureProxyTargetObjectName({
        projectSlug: "high-ground-odyssey",
        episodeSlug: "episode-5",
        rawAssetId: "raw_asset_001",
        jobId,
      }),
      contentType: "video/mp4",
      profile: "collaboration-1080p-h264-aac-v1",
    },
    queuedAt: now,
    updatedAt: now,
  });
  const manifestObjectName = buildCaptureProxyManifestObjectName(jobId);
  const queueObjectName = buildCaptureProxyQueueObjectName(jobId);
  const queue = {
    kind: CAPTURE_PROXY_QUEUE_KIND,
    version: 1,
    jobId,
    manifestObjectName,
    manifestGeneration: "1",
    enqueuedAt: now,
  };
  return { manifest, manifestObjectName, queueObjectName, queue };
}

class FakeStorage {
  constructor({ sourceGeneration = "101" } = {}) {
    const value = fixture();
    this.rows = new Map([
      [value.manifestObjectName, { value: value.manifest, generation: "1" }],
      [value.queueObjectName, { value: value.queue, generation: "1" }],
    ]);
    this.sourceGeneration = sourceGeneration;
    this.deadLetters = [];
    this.deleted = [];
  }

  async listQueueObjects() {
    const { queueObjectName } = fixture();
    return [{ name: queueObjectName, generation: "1" }];
  }

  async loadJson(name, generation) {
    const row = this.rows.get(name);
    if (!row || (generation && generation !== row.generation)) {
      throw Object.assign(new Error("not found"), { code: 404 });
    }
    return structuredClone(row);
  }

  async saveJson(name, value, ifGenerationMatch) {
    const current = this.rows.get(name);
    if (!current || current.generation !== String(ifGenerationMatch)) {
      throw Object.assign(new Error("precondition"), { code: 412 });
    }
    const next = {
      value: structuredClone(value),
      generation: String(Number(current.generation) + 1),
    };
    this.rows.set(name, next);
    return structuredClone(next);
  }

  async saveJsonIfAbsent(name, value) {
    if (!this.rows.has(name)) {
      this.rows.set(name, {
        value: structuredClone(value),
        generation: "1",
      });
    }
    return structuredClone(this.rows.get(name));
  }

  async objectEvidence(name) {
    return {
      bucketName: "quipsly-media",
      objectName: name,
      generation: this.sourceGeneration,
      sizeBytes: sourceBytes.byteLength,
      contentType: "video/quicktime",
      crc32c: "source-crc",
      customMetadata: {},
    };
  }

  async materializeObject(_name, _generation, destinationPath) {
    await writeFile(destinationPath, sourceBytes, { flag: "wx", mode: 0o600 });
    return { sizeBytes: sourceBytes.byteLength, sha256: sourceSha256 };
  }

  async uploadProxy(sourcePath, objectName, contentType, customMetadata) {
    const file = await stat(sourcePath);
    return {
      bucketName: "quipsly-media",
      objectName,
      generation: "501",
      sizeBytes: file.size,
      contentType,
      crc32c: "proxy-crc",
      customMetadata,
    };
  }

  async deleteObject(name, generation) {
    const row = this.rows.get(name);
    if (row?.generation === String(generation)) this.rows.delete(name);
    this.deleted.push({ name, generation });
  }

  async writeDeadLetter(name, value, sourceQueueGeneration) {
    this.deadLetters.push({ name, value, sourceQueueGeneration });
  }
}

class FakeTranscoder {
  async transcode(_inputPath, outputPath) {
    await writeFile(outputPath, proxyBytes, { flag: "wx", mode: 0o600 });
    return {
      sizeBytes: proxyBytes.byteLength,
      sha256: proxySha256,
      technical: {
        durationSeconds: 12.5,
        width: 1920,
        height: 1080,
        fps: 30,
        hasAudio: true,
        videoCodec: "h264",
        audioCodec: "aac",
        pixelFormat: "yuv420p",
        fastStart: true,
      },
    };
  }
}

const options = {
  executionId: "execution_001",
  buildId: "build_001",
  imageDigest: "sha256:processor",
  leaseDurationMs: 60_000,
  now: () => new Date("2026-07-27T16:05:00.000Z"),
};

test("contract rejects target and source authority drift", () => {
  const { manifest } = fixture();
  assert.throws(() => parseCaptureProxyManifest({
    ...manifest,
    target: {
      ...manifest.target,
      objectName: "media-vault/raw/escape.mp4",
    },
  }, jobId));
  assert.throws(() => parseCaptureProxyManifest({
    ...manifest,
    source: {
      ...manifest.source,
      objectName: "https://attacker.example/video.mov",
    },
    target: manifest.target,
  }, jobId));
});

test("worker produces an immutable registered-result receipt and retires queue", async () => {
  const storage = new FakeStorage();
  const { queueObjectName, manifestObjectName } = fixture();
  const result = await processCaptureProxyQueueObject(
    storage,
    new FakeTranscoder(),
    options,
    { name: queueObjectName, generation: "1" },
  );
  assert.deepEqual(result, {
    disposition: "completed",
    jobId,
    outputGeneration: "501",
  });
  assert.equal(storage.rows.has(queueObjectName), false);
  const completed = parseCaptureProxyManifest(
    storage.rows.get(manifestObjectName).value,
    jobId,
  );
  assert.equal(completed.status, "completed");
  const resultReceipt = parseCaptureProxyResult(
    storage.rows.get(buildCaptureProxyResultObjectName(jobId)).value,
    completed,
  );
  assert.equal(resultReceipt.output.sha256, proxySha256);
  assert.equal(resultReceipt.output.metadata.fastStart, true);
  assert.equal(resultReceipt.source.generation, "101");
});

test("worker recovers an immutable proxy left by a prior crashed execution", async () => {
  const priorOutputSha256 = "a".repeat(64);
  const storage = new FakeStorage();
  storage.uploadProxy = async (
    sourcePath,
    objectName,
    contentType,
    customMetadata,
  ) => {
    const file = await stat(sourcePath);
    return {
      bucketName: "quipsly-media",
      objectName,
      generation: "500",
      sizeBytes: file.size,
      contentType,
      crc32c: "prior-proxy-crc",
      customMetadata: {
        ...customMetadata,
        quipslyOutputSha256: priorOutputSha256,
      },
    };
  };
  const { queueObjectName, manifestObjectName } = fixture();
  const result = await processCaptureProxyQueueObject(
    storage,
    new FakeTranscoder(),
    options,
    { name: queueObjectName, generation: "1" },
  );
  assert.equal(result.disposition, "completed");
  const completed = parseCaptureProxyManifest(
    storage.rows.get(manifestObjectName).value,
    jobId,
  );
  const receipt = parseCaptureProxyResult(
    storage.rows.get(buildCaptureProxyResultObjectName(jobId)).value,
    completed,
  );
  assert.equal(receipt.output.generation, "500");
  assert.equal(receipt.output.sha256, priorOutputSha256);
});

test("transient processor failure releases the lease and preserves queue", async () => {
  const storage = new FakeStorage();
  const { queueObjectName, manifestObjectName } = fixture();
  await assert.rejects(
    processCaptureProxyQueueObject(
      storage,
      {
        async transcode() {
          throw new ProxyTranscodeError(
            "temporary-capacity",
            "processor capacity unavailable",
            true,
          );
        },
      },
      options,
      { name: queueObjectName, generation: "1" },
    ),
  );
  assert.equal(storage.rows.has(queueObjectName), true);
  const manifest = parseCaptureProxyManifest(
    storage.rows.get(manifestObjectName).value,
    jobId,
  );
  assert.equal(manifest.status, "queued");
  assert.equal(manifest.lease, null);
});

test("source generation drift fails terminal and dead-letters the queue", async () => {
  const storage = new FakeStorage({ sourceGeneration: "102" });
  const { queueObjectName, manifestObjectName } = fixture();
  const result = await processCaptureProxyQueueObject(
    storage,
    new FakeTranscoder(),
    options,
    { name: queueObjectName, generation: "1" },
  );
  assert.deepEqual(result, {
    disposition: "terminal",
    jobId,
    code: "source-generation-mismatch",
  });
  assert.equal(storage.rows.has(queueObjectName), false);
  assert.equal(storage.deadLetters.length, 1);
  const manifest = parseCaptureProxyManifest(
    storage.rows.get(manifestObjectName).value,
    jobId,
  );
  assert.equal(manifest.status, "failed-terminal");
});

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
