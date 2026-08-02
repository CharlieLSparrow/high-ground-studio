import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { stat, writeFile } from "node:fs/promises";
import test from "node:test";

import {
  COLLABORATION_PROXY_PROFILE,
  EPISODE_COLLABORATION_PROXY_CLOUD_QUEUE_KIND,
  buildEpisodeCollaborationProxyCloudManifestObjectName,
  buildEpisodeCollaborationProxyCloudQueueObjectName,
  buildEpisodeCollaborationProxyCloudResultObjectName,
  buildEpisodeCollaborationProxyTargetLocator,
  newEpisodeCollaborationProxyCloudManifest,
  newEpisodeCollaborationProxyJob,
  parseEpisodeCollaborationProxyCloudManifest,
  parseEpisodeCollaborationProxyResult,
} from "../packages/quipsly-media-processing/src/index.ts";
import {
  processEpisodeCloudProxyQueueObject,
} from "../apps/quipsly-media-processor/src/episode-cloud-worker.ts";
import {
  ProxyTranscodeError,
} from "../apps/quipsly-media-processor/src/transcoder.ts";

const jobId = "episode_cloud_proxy_job_001";
const bucketName = "quipsly-media";
const sourceObjectName = "media-vault/recordings/episodes/source.mov";
const sourceGeneration = "101";
const outputGeneration = "501";
const sourceBytes = Buffer.from("immutable cloud episode source bytes");
const proxyBytes = Buffer.from("deterministic cloud collaboration proxy bytes");
const sourceSha256 = sha256(sourceBytes);
const proxySha256 = sha256(proxyBytes);

function fixture() {
  const queuedAt = "2026-08-02T20:00:00.000Z";
  const targetLocator = buildEpisodeCollaborationProxyTargetLocator({
    projectSlug: "high-ground-odyssey",
    episodeSlug: "episode-8",
    rawAssetId: "raw_asset_001",
    sourceSha256,
  });
  const job = newEpisodeCollaborationProxyJob({
    jobId,
    projectId: "project_001",
    projectSlug: "high-ground-odyssey",
    episodeProductionId: "production_001",
    episodeSlug: "episode-8",
    actorUserId: "actor_001",
    actorEmail: "charlie@example.com",
    queuedAt,
    source: {
      provider: "gcs",
      locator: `gcs://${bucketName}/${sourceObjectName}?generation=${sourceGeneration}`,
      generation: sourceGeneration,
      sizeBytes: sourceBytes.byteLength,
      sha256: sourceSha256,
      contentType: "video/quicktime",
      rawAssetId: "raw_asset_001",
      sourceId: "source_001",
    },
    target: {
      provider: "gcs",
      locator: targetLocator,
      contentType: "video/mp4",
      profile: COLLABORATION_PROXY_PROFILE,
    },
  });
  const manifest = newEpisodeCollaborationProxyCloudManifest(job);
  const manifestObjectName = buildEpisodeCollaborationProxyCloudManifestObjectName(jobId);
  const queueObjectName = buildEpisodeCollaborationProxyCloudQueueObjectName(jobId);
  const queue = {
    kind: EPISODE_COLLABORATION_PROXY_CLOUD_QUEUE_KIND,
    version: 1,
    jobId,
    manifestObjectName,
    manifestGeneration: "1",
    enqueuedAt: queuedAt,
  };
  return { job, manifest, manifestObjectName, queueObjectName, queue };
}

class FakeStorage {
  constructor({ sourceGenerationOverride = sourceGeneration } = {}) {
    const value = fixture();
    this.rows = new Map([
      [value.manifestObjectName, { value: value.manifest, generation: "1" }],
      [value.queueObjectName, { value: value.queue, generation: "1" }],
    ]);
    this.sourceGeneration = sourceGenerationOverride;
    this.deadLetters = [];
    this.deleted = [];
    this.uploadCount = 0;
  }

  async listQueueObjects() { return []; }
  async listQueueObjectsUnder() {
    return [{ name: fixture().queueObjectName, generation: "1" }];
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
      this.rows.set(name, { value: structuredClone(value), generation: "1" });
    }
    return structuredClone(this.rows.get(name));
  }

  async objectEvidence(name) {
    return {
      bucketName,
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
    this.uploadCount += 1;
    const file = await stat(sourcePath);
    return {
      bucketName,
      objectName,
      generation: outputGeneration,
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
  constructor({ failure = null } = {}) {
    this.failure = failure;
    this.transcodeCount = 0;
  }

  async transcode(_inputPath, outputPath) {
    this.transcodeCount += 1;
    if (this.failure) throw this.failure;
    await writeFile(outputPath, proxyBytes, { flag: "wx", mode: 0o600 });
    return proxyResult();
  }
}

const options = {
  executionId: "execution_001",
  buildId: "build_001",
  imageDigest: `sha256:${"a".repeat(64)}`,
  leaseDurationMs: 60_000,
  now: () => new Date("2026-08-02T20:05:00.000Z"),
};

test("episode cloud control contract rejects local jobs and mutable GCS locators", () => {
  const { job } = fixture();
  assert.throws(() => newEpisodeCollaborationProxyCloudManifest({
    ...job,
    source: { ...job.source, provider: "local", locator: "/tmp/source.mov" },
    target: { ...job.target, provider: "local" },
  }));
  assert.throws(() => newEpisodeCollaborationProxyCloudManifest({
    ...job,
    source: {
      ...job.source,
      locator: `gcs://${bucketName}/${sourceObjectName}`,
    },
  }));
});

test("cloud worker creates a generation-bound result and retires its queue", async () => {
  const storage = new FakeStorage();
  const { job, queueObjectName, manifestObjectName } = fixture();
  const result = await processEpisodeCloudProxyQueueObject(
    storage,
    new FakeTranscoder(),
    options,
    { name: queueObjectName, generation: "1" },
  );
  assert.deepEqual(result, {
    disposition: "completed",
    jobId,
    outputGeneration,
  });
  assert.equal(storage.rows.has(queueObjectName), false);
  const completed = parseEpisodeCollaborationProxyCloudManifest(
    storage.rows.get(manifestObjectName).value,
    jobId,
  );
  assert.equal(completed.status, "completed");
  const receipt = parseEpisodeCollaborationProxyResult(
    storage.rows.get(buildEpisodeCollaborationProxyCloudResultObjectName(jobId)).value,
    job,
  );
  assert.equal(receipt.output.locator, `gcs://${bucketName}/${job.target.locator}?generation=${outputGeneration}`);
  assert.equal(receipt.output.sha256, proxySha256);
  assert.equal(receipt.output.crc32c, "proxy-crc");
  assert.equal(receipt.worker.imageDigest, options.imageDigest);
  assert.equal(receipt.originalRemainsSourceTruth, true);
});

test("create-once output recovery accepts the exact prior immutable derivative", async () => {
  const storage = new FakeStorage();
  const transcoder = new FakeTranscoder();
  const first = await processEpisodeCloudProxyQueueObject(
    storage,
    transcoder,
    options,
    { name: fixture().queueObjectName, generation: "1" },
  );
  assert.equal(first.disposition, "completed");
  assert.equal(storage.uploadCount, 1);
  assert.equal(transcoder.transcodeCount, 1);

  storage.rows.set(fixture().queueObjectName, {
    value: {
      ...fixture().queue,
      manifestGeneration: storage.rows.get(fixture().manifestObjectName).generation,
    },
    generation: "2",
  });
  const second = await processEpisodeCloudProxyQueueObject(
    storage,
    transcoder,
    options,
    { name: fixture().queueObjectName, generation: "2" },
  );
  assert.equal(second.disposition, "already-complete");
  assert.equal(storage.uploadCount, 1);
  assert.equal(transcoder.transcodeCount, 1);
});

test("source generation drift is terminal and dead-letters the queue", async () => {
  const storage = new FakeStorage({ sourceGenerationOverride: "102" });
  const result = await processEpisodeCloudProxyQueueObject(
    storage,
    new FakeTranscoder(),
    options,
    { name: fixture().queueObjectName, generation: "1" },
  );
  assert.equal(result.disposition, "terminal");
  assert.equal(result.code, "episode-proxy-source-generation-mismatch");
  assert.equal(storage.deadLetters.length, 1);
  assert.equal(storage.rows.has(fixture().queueObjectName), false);
});

test("non-retryable transcode failures commit terminal evidence", async () => {
  const storage = new FakeStorage();
  const result = await processEpisodeCloudProxyQueueObject(
    storage,
    new FakeTranscoder({
      failure: new ProxyTranscodeError("unsupported-source", "Unsupported source.", false),
    }),
    options,
    { name: fixture().queueObjectName, generation: "1" },
  );
  assert.equal(result.disposition, "terminal");
  assert.equal(result.code, "unsupported-source");
  assert.equal(storage.deadLetters.length, 1);
});

test("retryable transcode failures release the manifest lease and preserve queue", async () => {
  const storage = new FakeStorage();
  await assert.rejects(
    processEpisodeCloudProxyQueueObject(
      storage,
      new FakeTranscoder({
        failure: new ProxyTranscodeError("temporary-ffmpeg", "Temporary failure.", true),
      }),
      options,
      { name: fixture().queueObjectName, generation: "1" },
    ),
    /Temporary failure/,
  );
  const manifest = parseEpisodeCollaborationProxyCloudManifest(
    storage.rows.get(fixture().manifestObjectName).value,
    jobId,
  );
  assert.equal(manifest.status, "queued");
  assert.equal(manifest.lease, null);
  assert.equal(storage.rows.has(fixture().queueObjectName), true);
});

function proxyResult() {
  return {
    sizeBytes: proxyBytes.byteLength,
    sha256: proxySha256,
    technical: {
      durationSeconds: 12.5,
      width: 1280,
      height: 720,
      fps: 30,
      hasAudio: true,
      videoCodec: "h264",
      audioCodec: "aac",
      pixelFormat: "yuv420p",
      fastStart: true,
    },
  };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
