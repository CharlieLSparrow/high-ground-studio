import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  COLLABORATION_PROXY_PROFILE,
  buildEpisodeCollaborationProxyTargetLocator,
  newEpisodeCollaborationProxyJob,
  parseEpisodeCollaborationProxyJob,
  parseEpisodeCollaborationProxyResult,
} from "../packages/quipsly-media-processing/src/index.ts";
import {
  runOneLocalEpisodeProxyJob,
} from "../apps/quipsly-media-processor/src/local-episode-worker.ts";

const sourceBytes = Buffer.from("immutable episode source bytes");
const proxyBytes = Buffer.from("deterministic collaboration proxy bytes");
const sourceSha256 = sha256(sourceBytes);
const proxySha256 = sha256(proxyBytes);

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "quipsly-episode-proxy-test-"));
  const sourcePath = path.join(root, "media-vault", "raw", "episode-source.mov");
  await writeFile(sourcePath, sourceBytes, { recursive: false, mode: 0o600 }).catch(async (error) => {
    if (error.code !== "ENOENT") throw error;
    const { mkdir } = await import("node:fs/promises");
    await mkdir(path.dirname(sourcePath), { recursive: true, mode: 0o700 });
    await writeFile(sourcePath, sourceBytes, { mode: 0o600 });
  });
  const job = newEpisodeCollaborationProxyJob({
    jobId: "episode_proxy_job_001",
    projectId: "project_001",
    projectSlug: "high-ground-odyssey",
    episodeProductionId: "production_001",
    episodeSlug: "episode-8",
    actorUserId: null,
    actorEmail: "charlie@example.com",
    queuedAt: "2026-08-02T18:00:00.000Z",
    source: {
      provider: "local",
      locator: sourcePath,
      generation: `sha256:${sourceSha256}`,
      sizeBytes: sourceBytes.byteLength,
      sha256: sourceSha256,
      contentType: "video/quicktime",
      rawAssetId: "raw_asset_001",
      sourceId: "source_001",
    },
    target: {
      provider: "local",
      locator: buildEpisodeCollaborationProxyTargetLocator({
        projectSlug: "high-ground-odyssey",
        episodeSlug: "episode-8",
        rawAssetId: "raw_asset_001",
        sourceSha256,
      }),
      contentType: "video/mp4",
      profile: COLLABORATION_PROXY_PROFILE,
    },
  });
  return { root, sourcePath, job };
}

class FakeStore {
  constructor(job, { commit = true } = {}) {
    this.job = job;
    this.commitResult = commit;
    this.completed = [];
    this.failed = [];
    this.retried = [];
  }
  async claim({ executionId }) {
    return this.job
      ? { id: this.job.jobId, inputJson: this.job, attempt: 1, executionId }
      : null;
  }
  async complete(value) {
    this.completed.push(value);
    return this.commitResult;
  }
  async retry(value) {
    this.retried.push(value);
    return true;
  }
  async fail(value) {
    this.failed.push(value);
    return true;
  }
}

class FakeTranscoder {
  constructor({ mutateSource = false } = {}) {
    this.mutateSource = mutateSource;
    this.transcodeCount = 0;
    this.inspectCount = 0;
  }
  async transcode(inputPath, outputPath) {
    this.transcodeCount += 1;
    this.transcodedOutputPath = outputPath;
    await writeFile(outputPath, proxyBytes, { flag: "wx", mode: 0o600 });
    if (this.mutateSource) await writeFile(inputPath, Buffer.from("changed source"));
    return proxyResult();
  }
  async inspect(outputPath) {
    this.inspectCount += 1;
    assert.deepEqual(await readFile(outputPath), proxyBytes);
    return proxyResult();
  }
}

const options = (root) => ({
  executionId: "execution_001",
  buildId: "test-build",
  leaseMs: 60_000,
  localMediaRoot: root,
  now: () => new Date("2026-08-02T18:05:00.000Z"),
});

test("episode proxy contract rejects provider and target authority drift", async () => {
  const { job } = await fixture();
  assert.throws(() => parseEpisodeCollaborationProxyJob({
    ...job,
    target: { ...job.target, locator: "../outside.mp4" },
  }, job.jobId));
  assert.throws(() => parseEpisodeCollaborationProxyJob({
    ...job,
    target: { ...job.target, provider: "gcs" },
  }, job.jobId));
});

test("local worker atomically creates a receipt-backed proxy and preserves its original", async () => {
  const { root, sourcePath, job } = await fixture();
  const store = new FakeStore(job);
  const transcoder = new FakeTranscoder();
  const result = await runOneLocalEpisodeProxyJob(store, transcoder, options(root));
  assert.equal(result.disposition, "completed");
  assert.match(transcoder.transcodedOutputPath, /\.partial-[A-Za-z0-9_-]+\.mp4$/);
  assert.equal(result.recoveredExistingOutput, false);
  assert.equal(transcoder.transcodeCount, 1);
  assert.deepEqual(await readFile(sourcePath), sourceBytes);
  assert.deepEqual(await readFile(result.outputPath), proxyBytes);
  const receipt = parseEpisodeCollaborationProxyResult(store.completed[0].receipt, job);
  assert.equal(receipt.output.sha256, proxySha256);
  assert.equal(receipt.output.generation, `sha256:${proxySha256}`);
  assert.equal(receipt.originalRemainsSourceTruth, true);
  const partials = (await import("node:fs/promises")).readdir(path.dirname(result.outputPath));
  assert.equal((await partials).some((name) => name.includes(".partial-")), false);
});

test("local worker recovers a prior atomically renamed output without transcoding twice", async () => {
  const { root, job } = await fixture();
  const outputPath = path.join(root, job.target.locator);
  const { mkdir } = await import("node:fs/promises");
  await mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 });
  await writeFile(outputPath, proxyBytes, { mode: 0o600 });
  const store = new FakeStore(job);
  const transcoder = new FakeTranscoder();
  const result = await runOneLocalEpisodeProxyJob(store, transcoder, options(root));
  assert.equal(result.disposition, "completed");
  assert.equal(result.recoveredExistingOutput, true);
  assert.equal(transcoder.transcodeCount, 0);
  assert.equal(transcoder.inspectCount, 1);
});

test("source drift fails terminal and removes the derivative created from unstable bytes", async () => {
  const { root, job } = await fixture();
  const store = new FakeStore(job);
  const result = await runOneLocalEpisodeProxyJob(
    store,
    new FakeTranscoder({ mutateSource: true }),
    options(root),
  );
  assert.equal(result.disposition, "failed");
  assert.equal(result.code, "episode-proxy-source-byte-mismatch");
  assert.equal(store.failed.length, 1);
  const outputPath = path.join(root, job.target.locator);
  await assert.rejects(stat(outputPath), { code: "ENOENT" });
});

test("a lost database claim keeps deterministic output available for safe retry", async () => {
  const { root, job } = await fixture();
  const store = new FakeStore(job, { commit: false });
  const result = await runOneLocalEpisodeProxyJob(store, new FakeTranscoder(), options(root));
  assert.equal(result.disposition, "claim-lost");
  assert.deepEqual(await readFile(path.join(root, job.target.locator)), proxyBytes);
});

function proxyResult() {
  return {
    sizeBytes: proxyBytes.byteLength,
    sha256: proxySha256,
    technical: {
      durationSeconds: 12.5,
      width: 1280,
      height: 638,
      fps: 23.976,
      hasAudio: true,
      videoCodec: "h264",
      audioCodec: "aac",
      pixelFormat: "yuv420p",
      fastStart: true,
    },
  };
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
