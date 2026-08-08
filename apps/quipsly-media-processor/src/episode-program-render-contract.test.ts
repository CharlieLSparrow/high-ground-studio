import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  EPISODE_PROGRAM_REVIEW_PROFILE,
  buildEpisodeProgramRenderTargetLocator,
  episodeProgramRenderManifestCanonicalJson,
  newEpisodeProgramRenderJob,
  type EpisodeProgramRenderJob,
} from "@high-ground/quipsly-media-processing";

import type { EpisodeProgramRenderTechnical } from "./episode-program-render-ffmpeg.js";
import {
  runOneLocalEpisodeProgramRenderJob,
  type LocalEpisodeProgramRenderClaim,
  type LocalEpisodeProgramRenderer,
  type LocalEpisodeProgramRenderStore,
} from "./local-episode-program-render-worker.js";

const authority = {
  portability: "executor-local" as const,
  custodianNodeId: "execution_worker_program_test",
  storageScopeId: "storage_scope_program_test",
};
const sourceBytes = Buffer.from("exact immutable program source bytes\n");
const sourceSha256 = createHash("sha256").update(sourceBytes).digest("hex");

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "quipsly-program-render-test-"));
  const sourcePath = path.join(root, "source.mp4");
  await writeFile(sourcePath, sourceBytes);
  return { root, sourcePath };
}

function job(sourcePath: string): EpisodeProgramRenderJob {
  const base = {
    jobId: "program_render_job_test",
    projectId: "project_test",
    episodeProductionId: "episode_production_test",
    branchId: "branch_test",
    branchRevision: 9,
    requestedByEmail: "editor@example.com",
    clientRequestId: "program_request_test",
    queuedAt: "2026-08-08T12:00:00.000Z",
    timelineFingerprintSha256: "a".repeat(64),
    sourceProjectionFingerprintSha256: "b".repeat(64),
    editStateFingerprintSha256: "c".repeat(64),
    manifestSha256: "0".repeat(64),
    renderProfile: EPISODE_PROGRAM_REVIEW_PROFILE,
    executionTarget: authority,
    program: {
      sequenceDurationSeconds: 2,
      outputDurationSeconds: 2,
      skippedDurationSeconds: 0,
      chunkCount: 1,
    },
    sources: [{
      ...authority,
      laneId: "lane_source_test",
      mediaAssetId: "media_asset_test",
      sourceId: "studio_source_test",
      recordingAssetId: null,
      label: "Exact source",
      kind: "video" as const,
      role: "primary" as const,
      provider: "local" as const,
      locator: sourcePath,
      generation: `sha256:${sourceSha256}`,
      sha256: sourceSha256,
      sizeBytes: sourceBytes.length,
      contentType: "video/mp4",
      sequenceOffsetSeconds: 0,
      sourceStartSeconds: 0,
      sourceDurationSeconds: 2,
    }],
    chunks: [{
      id: "program_chunk_test",
      outputStartSeconds: 0,
      sequenceStartSeconds: 0,
      sequenceEndSeconds: 2,
      decisionId: "decision_program_test",
      decisionKind: "primary",
      visualLaneIds: ["lane_source_test"],
      clipLaneId: null,
      audioLaneIds: ["lane_source_test"],
    }],
    target: {
      provider: "local" as const,
      ...authority,
      locator: buildEpisodeProgramRenderTargetLocator({
        episodeProductionId: "episode_production_test",
        branchId: "branch_test",
        branchRevision: 9,
        jobId: "program_render_job_test",
      }),
      contentType: "video/mp4" as const,
      container: "mp4" as const,
      videoCodec: "h264" as const,
      audioCodec: "aac" as const,
      width: 1280 as const,
      height: 720 as const,
      fps: 24 as const,
      sampleRateHz: 48_000 as const,
      variantKind: "episode-program-review" as const,
    },
  };
  const placeholder = newEpisodeProgramRenderJob(base);
  return newEpisodeProgramRenderJob({
    ...base,
    manifestSha256: createHash("sha256")
      .update(episodeProgramRenderManifestCanonicalJson(placeholder))
      .digest("hex"),
  });
}

class Store implements LocalEpisodeProgramRenderStore {
  completed: unknown = null;
  failed: Array<{ code: string; message: string }> = [];
  renewed: number[] = [];
  allowRenew = true;

  constructor(private readonly inputJson: unknown) {}

  async claim(): Promise<LocalEpisodeProgramRenderClaim> {
    return {
      id: "program_render_job_test",
      inputJson: this.inputJson,
      attempt: 1,
      executionId: "execution_program_test",
    };
  }
  async renew(input: { renderedChunkCount: number }) {
    this.renewed.push(input.renderedChunkCount);
    return this.allowRenew;
  }
  async complete(input: { receipt: unknown }) {
    this.completed = input.receipt;
    return true;
  }
  async retry(input: { code: string; message: string }) {
    this.failed.push(input);
    return true;
  }
  async fail(input: { code: string; message: string }) {
    this.failed.push(input);
    return true;
  }
}

class Renderer implements LocalEpisodeProgramRenderer {
  calls = 0;
  mutateSourcePath: string | null = null;

  async render(
    _job: EpisodeProgramRenderJob,
    outputPath: string,
    afterChunk: (renderedChunkCount: number) => Promise<void>,
  ): Promise<EpisodeProgramRenderTechnical> {
    this.calls += 1;
    await writeFile(outputPath, Buffer.from("complete program review bytes\n"));
    await afterChunk(1);
    if (this.mutateSourcePath) await writeFile(this.mutateSourcePath, Buffer.from("changed source\n"));
    return {
      durationSeconds: 2,
      width: 1280,
      height: 720,
      fps: 24,
      videoCodec: "h264",
      audioCodec: "aac",
      completeDecode: true,
      fastStart: true,
      ffmpegVersion: "ffmpeg test",
      renderedChunkCount: 1,
    };
  }
}

function options(root: string) {
  return {
    executionId: "execution_program_test",
    ...authority,
    buildId: "program-worker-test",
    imageDigest: null,
    leaseMs: 60_000,
    localMediaRoot: root,
    now: () => new Date("2026-08-08T12:00:00.000Z"),
  };
}

test("program worker renews its lease, preserves exact inputs, and emits an unapproved receipt", async () => {
  const { root, sourcePath } = await fixture();
  try {
    const frozenJob = job(sourcePath);
    const store = new Store(frozenJob);
    const renderer = new Renderer();
    const result = await runOneLocalEpisodeProgramRenderJob(store, renderer, options(root));

    assert.equal(result.disposition, "completed");
    assert.deepEqual(store.renewed, [1]);
    assert.deepEqual(await readFile(sourcePath), sourceBytes);
    const receipt = store.completed as Record<string, any>;
    assert.equal(receipt.boundaries.outputIsNotApprovedMaster, true);
    assert.equal(receipt.boundaries.outputIsNotPublicationMedia, true);
    assert.equal(receipt.worker.renderedChunkCount, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("program worker refuses a manifest for another executor before rendering", async () => {
  const { root, sourcePath } = await fixture();
  try {
    const foreign = structuredClone(job(sourcePath));
    foreign.executionTarget.custodianNodeId = "execution_worker_foreign_test";
    foreign.target.custodianNodeId = "execution_worker_foreign_test";
    foreign.sources[0]!.custodianNodeId = "execution_worker_foreign_test";
    const store = new Store(foreign);
    const renderer = new Renderer();
    const result = await runOneLocalEpisodeProgramRenderJob(store, renderer, options(root));

    assert.equal(result.disposition, "failed");
    assert.equal(renderer.calls, 0);
    assert.equal(store.failed[0]?.code, "episode-program-render-manifest-invalid");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("program worker abandons partial output when its durable lease is lost", async () => {
  const { root, sourcePath } = await fixture();
  try {
    const store = new Store(job(sourcePath));
    store.allowRenew = false;
    const result = await runOneLocalEpisodeProgramRenderJob(store, new Renderer(), options(root));

    assert.equal(result.disposition, "claim-lost");
    assert.equal(store.completed, null);
    assert.equal(store.failed.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("program worker deletes output and fails when an input drifts during render", async () => {
  const { root, sourcePath } = await fixture();
  try {
    const store = new Store(job(sourcePath));
    const renderer = new Renderer();
    renderer.mutateSourcePath = sourcePath;
    const result = await runOneLocalEpisodeProgramRenderJob(store, renderer, options(root));

    assert.equal(result.disposition, "failed");
    assert.equal(store.failed[0]?.code, "episode-program-render-source-drift");
    assert.equal(store.completed, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
