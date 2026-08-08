import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  EXTERNAL_SOURCE_PROXY_PROFILE,
  newExternalSourceProxyJob,
  parseSourceAudioNavigationJob,
  parseSourceVisualOverviewJob,
  parseExternalSourceProxyResult,
} from "@high-ground/quipsly-media-processing";

import {
  runOneLocalExternalSourceProxyJob,
  sourceNavigationJobsFromExternalProxy,
  type LocalExternalSourceProxyStore,
} from "./local-external-source-proxy-worker.js";
import { sha256File } from "./transcoder.js";

test("local external proxy worker preserves exact source bytes and returns a verified derivative receipt", async () => {
  const root = await mkdtemp(
    path.join(tmpdir(), "quipsly-external-proxy-worker-"),
  );
  const sourcePath = path.join(root, "outside-ingest-original.mp4");
  const outputRoot = path.join(root, "outputs");
  await writeFile(sourcePath, Buffer.alloc(4_096, 7));
  const sourceSha256 = await sha256File(sourcePath);
  const sourceBefore = await readFile(sourcePath);
  const job = newExternalSourceProxyJob({
    jobId: "xspjob_00000001",
    derivativeId: "xspderivative_00000001",
    projectId: "project_00000001",
    projectSlug: "high-ground-odyssey",
    actorUserId: "user_00000001",
    actorEmail: "creator@example.test",
    queuedAt: "2026-08-08T00:00:00.000Z",
    source: {
      provider: "local-file-vault",
      externalReferenceId: "reference_00000001",
      sourceRevisionId: "revision_00000001",
      revisionKey: `sha256:${sourceSha256}`,
      identitySha256: "a".repeat(64),
      expectedContentSha256: sourceSha256,
      expectedSizeBytes: 4_096,
      contentType: "video/mp4",
    },
    target: {
      provider: "local",
      locator: `source-story/high-ground-odyssey/revision_00000001/${EXTERNAL_SOURCE_PROXY_PROFILE}-aaaaaaaa.mp4`,
      contentType: "video/mp4",
      profile: EXTERNAL_SOURCE_PROXY_PROFILE,
    },
  });
  let receipt: unknown = null;
  const store: LocalExternalSourceProxyStore = {
    claim: async () => ({
      id: job.jobId,
      inputJson: job,
      attempt: 1,
      executionId: "execution_00000001",
    }),
    resolve: async () => ({
      path: sourcePath,
      projectId: job.projectId,
      referenceId: job.source.externalReferenceId,
      sourceRevisionId: job.source.sourceRevisionId,
      revisionKey: job.source.revisionKey,
      identitySha256: job.source.identitySha256,
      contentSha256: job.source.expectedContentSha256,
      sizeBytes: job.source.expectedSizeBytes,
      accessState: "available",
      capabilityState: "downloadable",
      provider: job.source.provider,
    }),
    complete: async (input) => {
      receipt = input.receipt;
      return true;
    },
    retry: async () => true,
    fail: async () => true,
  };
  const transcoder = {
    transcode: async (_inputPath: string, outputPath: string) => {
      await writeFile(outputPath, Buffer.alloc(2_048, 3));
      return {
        sizeBytes: 2_048,
        sha256: await sha256File(outputPath),
        technical: {
          durationSeconds: 12.5,
          width: 960,
          height: 480,
          fps: 24,
          hasAudio: true,
          videoCodec: "h264" as const,
          audioCodec: "aac" as const,
          pixelFormat: "yuv420p" as const,
          fastStart: true as const,
        },
      };
    },
  };
  const result = await runOneLocalExternalSourceProxyJob(store, transcoder, {
    executionId: "execution_00000001",
    buildId: "build_00000001",
    leaseMs: 60_000,
    localMediaRoot: outputRoot,
    now: () => new Date("2026-08-08T00:01:00.000Z"),
  });
  assert.equal(result.disposition, "completed");
  assert.deepEqual(
    await readFile(sourcePath),
    sourceBefore,
    "proxy generation must not mutate the original",
  );
  const parsed = parseExternalSourceProxyResult(receipt, job);
  assert.equal(parsed.source.observedContentSha256, sourceSha256);
  assert.equal(parsed.output.durationSeconds, 12.5);
  assert.equal(parsed.output.widthPixels, 960);
  assert.equal((await stat(parsed.output.locator)).size, 2_048);
  const navigation = sourceNavigationJobsFromExternalProxy({
    job,
    receipt: parsed,
    queuedAt: "2026-08-08T00:01:00.000Z",
  });
  const visual = parseSourceVisualOverviewJob(
    navigation.visual,
    navigation.visual.jobId,
  );
  const audio = parseSourceAudioNavigationJob(
    navigation.audio,
    navigation.audio.jobId,
  );
  assert.equal(visual.input.derivativeId, job.derivativeId);
  assert.equal(visual.input.generation, parsed.output.generation);
  assert.equal(visual.source.expectedContentSha256, sourceSha256);
  assert.equal(visual.target.sampleCount, 8);
  assert.match(visual.target.locator, /contact-sheet-4x2-jpeg-v1-/);
  assert.equal(audio.input.derivativeId, job.derivativeId);
  assert.equal(audio.input.generation, parsed.output.generation);
  assert.equal(audio.source.expectedContentSha256, sourceSha256);
  assert.equal(audio.analyzer.completeDecodeRequired, true);
});

test("local external proxy worker fails closed when the provider projection no longer matches the queued revision", async () => {
  const job = newExternalSourceProxyJob({
    jobId: "xspjob_00000002",
    derivativeId: "xspderivative_00000002",
    projectId: "project_00000002",
    projectSlug: "source-proof",
    actorUserId: "user_00000002",
    actorEmail: "creator@example.test",
    queuedAt: "2026-08-08T00:00:00.000Z",
    source: {
      provider: "local-file-vault",
      externalReferenceId: "reference_00000002",
      sourceRevisionId: "revision_00000002",
      revisionKey: "revision-1",
      identitySha256: "b".repeat(64),
      expectedContentSha256: "c".repeat(64),
      expectedSizeBytes: 1_024,
      contentType: "video/mp4",
    },
    target: {
      provider: "local",
      locator: `source-story/source-proof/revision_00000002/${EXTERNAL_SOURCE_PROXY_PROFILE}-bbbbbbbb.mp4`,
      contentType: "video/mp4",
      profile: EXTERNAL_SOURCE_PROXY_PROFILE,
    },
  });
  let failureCode = "";
  const store: LocalExternalSourceProxyStore = {
    claim: async () => ({
      id: job.jobId,
      inputJson: job,
      attempt: 1,
      executionId: "execution_00000002",
    }),
    resolve: async () => ({
      path: "/missing",
      projectId: job.projectId,
      referenceId: job.source.externalReferenceId,
      sourceRevisionId: job.source.sourceRevisionId,
      revisionKey: "different-revision",
      identitySha256: job.source.identitySha256,
      contentSha256: job.source.expectedContentSha256,
      sizeBytes: job.source.expectedSizeBytes,
      accessState: "available",
      capabilityState: "downloadable",
      provider: job.source.provider,
    }),
    complete: async () => true,
    retry: async () => true,
    fail: async (input) => {
      failureCode = input.code;
      return true;
    },
  };
  const result = await runOneLocalExternalSourceProxyJob(
    store,
    {
      transcode: async () => {
        throw new Error("must not transcode");
      },
    },
    {
      executionId: "execution_00000002",
      buildId: "build_00000002",
      leaseMs: 60_000,
      localMediaRoot: path.join(tmpdir(), "never-used"),
      now: () => new Date("2026-08-08T00:01:00.000Z"),
    },
  );
  assert.equal(result.disposition, "failed");
  assert.equal(failureCode, "external-proxy-source-binding-changed");
});

test("local external proxy worker refuses to retain a browsing derivative larger than its source", async () => {
  const root = await mkdtemp(
    path.join(tmpdir(), "quipsly-external-proxy-efficiency-"),
  );
  const sourcePath = path.join(root, "small-source.mp4");
  await writeFile(sourcePath, Buffer.alloc(1_024, 9));
  const sourceSha256 = await sha256File(sourcePath);
  const job = newExternalSourceProxyJob({
    jobId: "xspjob_00000003",
    derivativeId: "xspderivative_00000003",
    projectId: "project_00000003",
    projectSlug: "source-efficiency",
    actorUserId: "user_00000003",
    actorEmail: "creator@example.test",
    queuedAt: "2026-08-08T00:00:00.000Z",
    source: {
      provider: "local-file-vault",
      externalReferenceId: "reference_00000003",
      sourceRevisionId: "revision_00000003",
      revisionKey: `sha256:${sourceSha256}`,
      identitySha256: "d".repeat(64),
      expectedContentSha256: sourceSha256,
      expectedSizeBytes: 1_024,
      contentType: "video/mp4",
    },
    target: {
      provider: "local",
      locator: `source-story/source-efficiency/revision_00000003/${EXTERNAL_SOURCE_PROXY_PROFILE}-dddddddd.mp4`,
      contentType: "video/mp4",
      profile: EXTERNAL_SOURCE_PROXY_PROFILE,
    },
  });
  let failureCode = "";
  const store: LocalExternalSourceProxyStore = {
    claim: async () => ({
      id: job.jobId,
      inputJson: job,
      attempt: 1,
      executionId: "execution_00000003",
    }),
    resolve: async () => ({
      path: sourcePath,
      projectId: job.projectId,
      referenceId: job.source.externalReferenceId,
      sourceRevisionId: job.source.sourceRevisionId,
      revisionKey: job.source.revisionKey,
      identitySha256: job.source.identitySha256,
      contentSha256: job.source.expectedContentSha256,
      sizeBytes: job.source.expectedSizeBytes,
      accessState: "available",
      capabilityState: "downloadable",
      provider: job.source.provider,
    }),
    complete: async () => {
      throw new Error("must not retain an oversized derivative");
    },
    retry: async () => true,
    fail: async (input) => {
      failureCode = input.code;
      return true;
    },
  };
  const result = await runOneLocalExternalSourceProxyJob(
    store,
    {
      transcode: async (_inputPath, outputPath) => {
        await writeFile(outputPath, Buffer.alloc(2_048, 5));
        return {
          sizeBytes: 2_048,
          sha256: await sha256File(outputPath),
          technical: {
            durationSeconds: 2,
            width: 640,
            height: 360,
            fps: 24,
            hasAudio: true,
            videoCodec: "h264" as const,
            audioCodec: "aac" as const,
            pixelFormat: "yuv420p" as const,
            fastStart: true as const,
          },
        };
      },
    },
    {
      executionId: "execution_00000003",
      buildId: "build_00000003",
      leaseMs: 60_000,
      localMediaRoot: path.join(root, "outputs"),
      now: () => new Date("2026-08-08T00:01:00.000Z"),
    },
  );
  assert.equal(result.disposition, "failed");
  assert.equal(failureCode, "external-proxy-not-storage-efficient");
});
