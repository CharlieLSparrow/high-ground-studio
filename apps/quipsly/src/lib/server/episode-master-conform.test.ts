import { newEpisodeProgramRenderResult } from "@high-ground/quipsly-media-processing";

import { planEpisodeMasterConform, queueEpisodeMasterConform } from "./episode-master-conform";
import { readLocalExecutorTarget } from "./local-executor-storage";
import { loadEpisodeProgramReviewContext } from "./episode-program-review";

jest.mock("./episode-program-review", () => ({
  EpisodeProgramReviewError: class EpisodeProgramReviewError extends Error {},
  loadEpisodeProgramReviewContext: jest.fn(),
}));
jest.mock("./local-executor-storage", () => ({
  readLocalExecutorTarget: jest.fn(),
}));
jest.mock("./prisma-advisory-lock", () => ({
  acquirePrismaAdvisoryTransactionLock: jest.fn(async () => undefined),
}));

const NODE_ID = "execution_worker_master_plan_test";
const SCOPE_ID = "storage_scope_master_plan_test";
const outputSha = "a".repeat(64);
const identity = {
  branchId: "branch_master_plan_test",
  branchRevision: 9,
  timelineFingerprintSha256: "b".repeat(64),
  sourceProjectionFingerprintSha256: "c".repeat(64),
  editStateFingerprintSha256: "d".repeat(64),
  manifestSha256: "e".repeat(64),
  outputSha256: outputSha,
  outputGeneration: `sha256:${outputSha}`,
  outputSizeBytes: BigInt(100_000_000),
};

function context() {
  return {
    project: { id: "project_master_plan_test" },
    episode: { id: "episode_master_plan_test" },
    job: {
      kind: "quipsly-episode-program-render-job-v1",
      version: 1,
      jobId: "program_render_master_plan_test",
      projectId: "project_master_plan_test",
      episodeProductionId: "episode_master_plan_test",
      executionTarget: {
        portability: "executor-local",
        custodianNodeId: NODE_ID,
        storageScopeId: SCOPE_ID,
      },
      requestedByEmail: "editor@example.test",
      clientRequestId: "program_render_master_plan_request",
      queuedAt: "2026-08-08T12:00:00.000Z",
      renderProfile: "episode-program-review-1280x720-24fps-v1",
      program: { sequenceDurationSeconds: 30, outputDurationSeconds: 30, skippedDurationSeconds: 0, chunkCount: 1 },
      sources: [{
        portability: "executor-local",
        custodianNodeId: NODE_ID,
        storageScopeId: SCOPE_ID,
        laneId: "camera_4k_test",
        mediaAssetId: "asset_4k_test",
        sourceId: "source_4k_test",
        recordingAssetId: "recording_4k_test",
        label: "Canon R8",
        kind: "video",
        role: "primary",
        provider: "local",
        locator: "/tmp/quipsly-master-plan/canon-r8.mp4",
        generation: `sha256:${"f".repeat(64)}`,
        sha256: "f".repeat(64),
        sizeBytes: 20_000_000_000,
        contentType: "video/mp4",
        sequenceOffsetSeconds: 0,
        sourceStartSeconds: 0,
        sourceDurationSeconds: 30,
      }, {
        portability: "executor-local",
        custodianNodeId: NODE_ID,
        storageScopeId: SCOPE_ID,
        laneId: "audio_test",
        mediaAssetId: "asset_audio_test",
        sourceId: "source_audio_test",
        recordingAssetId: "recording_audio_test",
        label: "MV7i",
        kind: "audio",
        role: "audio",
        provider: "local",
        locator: "/tmp/quipsly-master-plan/mv7i.wav",
        generation: `sha256:${"1".repeat(64)}`,
        sha256: "1".repeat(64),
        sizeBytes: 2_000_000_000,
        contentType: "audio/wav",
        sequenceOffsetSeconds: 0,
        sourceStartSeconds: 0,
        sourceDurationSeconds: 30,
      }],
      chunks: [{ id: "program_chunk_master_plan_test", outputStartSeconds: 0, sequenceStartSeconds: 0, sequenceEndSeconds: 30, decisionId: "decision_master_plan_test", decisionKind: "primary", visualLaneIds: ["camera_4k_test"], clipLaneId: null, audioLaneIds: ["audio_test"] }],
      target: { provider: "local", portability: "executor-local", custodianNodeId: NODE_ID, storageScopeId: SCOPE_ID, locator: "media-vault/episode-program-renders/episode_master_plan_test/branch_master_plan_test/revision-9/program_render_master_plan_test.mp4", contentType: "video/mp4", container: "mp4", videoCodec: "h264", audioCodec: "aac", width: 1280, height: 720, fps: 24, sampleRateHz: 48_000, variantKind: "episode-program-review" },
      boundaries: { sourceMediaRemainsImmutable: true, editBranchRemainsCanonicalIntent: true, outputIsReviewCandidate: true, outputIsNotApprovedMaster: true, outputIsNotPublicationMedia: true, approvalRequiresSeparateReceipt: true, serverMustVerifyResultBeforePlayback: true, localArtifactsRequireExactExecutor: true, editorIntentIsPortableWithoutRenderBytes: true },
      ...identity,
    },
    result: {
      output: {
        sha256: outputSha,
        generation: `sha256:${outputSha}`,
        sizeBytes: 100_000_000,
      },
    },
  };
}

function approval(overrides: Record<string, unknown> = {}) {
  return {
    id: "program_approval_master_plan_test",
    renderJobId: "program_render_master_plan_test",
    projectId: "project_master_plan_test",
    episodeProductionId: "episode_master_plan_test",
    decision: "APPROVED",
    actorEmail: "editor@example.test",
    occurredAt: new Date("2026-08-08T13:00:00.000Z"),
    ...identity,
    ...overrides,
  };
}

function executor(overrides: Record<string, unknown> = {}) {
  return {
    nodeId: NODE_ID,
    hostName: "Wall-E Master Mac",
    storageScopeId: SCOPE_ID,
    storage: {
      status: "measured",
      safeAvailableBytes: String(100 * 1024 ** 3),
      availableBytes: String(110 * 1024 ** 3),
      reserveBytes: String(10 * 1024 ** 3),
      measuredAt: "2026-08-08T13:00:00.000Z",
      workspaceMode: "durable",
      localPathWithheld: true,
    },
    ...overrides,
  };
}

describe("Episode master conform planning", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(loadEpisodeProgramReviewContext).mockResolvedValue(context() as never);
    jest.mocked(readLocalExecutorTarget).mockResolvedValue(executor() as never);
  });

  it("plans a 4K original-source conform without creating a job", async () => {
    const prisma = database();
    const plan = await planEpisodeMasterConform({
      prisma,
      projectSlug: "high-ground-odyssey",
      episodeSlug: "episode-9",
      reviewJobId: "program_render_master_plan_test",
      approvalReceiptId: "program_approval_master_plan_test",
    });

    expect(plan).toEqual(expect.objectContaining({
      branchRevision: 9,
      masterProfile: expect.objectContaining({
        id: "episode-master-3840x2160-24fps-h264-v1",
        width: 3840,
        height: 2160,
        fps: 24,
        outputDurationSeconds: 30,
      }),
      sources: expect.objectContaining({
        requiredCount: 2,
        allExactOnExecutor: true,
        allVideoMetadataMeasured: true,
        video: [{
          laneId: "camera_4k_test",
          label: "Canon R8",
          width: 3840,
          height: 2160,
          fps: 24,
          relationshipToOutput: "native-or-larger",
        }],
      }),
      executor: expect.objectContaining({
        label: "Wall-E Master Mac",
        status: "ready",
        canQueue: true,
      }),
      holds: [],
      boundaries: {
        createsNoJob: true,
        originalSourcesWillBeUsed: true,
        reviewCandidateWillNotBeUpscaled: true,
        sourceMediaRemainsImmutable: true,
        approvalDoesNotAuthorizePublication: true,
        renderedMasterWillRequireSeparateReview: true,
        portableUploadNotStarted: true,
        publicationNotStarted: true,
      },
    }));
    expect(plan.masterProfile.estimatedBytesHigh).toBeGreaterThan(plan.masterProfile.estimatedBytesLow);
    expect(prisma.studioWorkflowJob?.create).toBeUndefined();
  });

  it("rejects an older approval after a newer decision", async () => {
    const prisma = database({ latest: approval({ id: "newer_rejection", decision: "REJECTED" }) });
    await expect(planEpisodeMasterConform({
      prisma,
      projectSlug: "high-ground-odyssey",
      episodeSlug: "episode-9",
      reviewJobId: "program_render_master_plan_test",
      approvalReceiptId: "program_approval_master_plan_test",
    })).rejects.toMatchObject({ code: "EPISODE_MASTER_CONFORM_APPROVAL_STALE" });
  });

  it("holds queue readiness when metadata or durable capacity is missing", async () => {
    jest.mocked(readLocalExecutorTarget).mockResolvedValue(executor({
      storage: { ...executor().storage, safeAvailableBytes: "1024", workspaceMode: "temporary" },
    }) as never);
    const prisma = database({ mediaAssets: [{ id: "asset_4k_test", resolution: null, fps: null }] });
    const plan = await planEpisodeMasterConform({
      prisma,
      projectSlug: "high-ground-odyssey",
      episodeSlug: "episode-9",
      reviewJobId: "program_render_master_plan_test",
      approvalReceiptId: "program_approval_master_plan_test",
    });
    expect(plan.executor).toEqual(expect.objectContaining({ status: "held", canQueue: false }));
    expect(plan.holds).toEqual(expect.arrayContaining([
      expect.stringContaining("durable media workspace"),
      expect.stringContaining("safe local space"),
      expect.stringContaining("Measure resolution and frame rate"),
    ]));
  });

  it("queues one approval-bound 4K manifest after a transactional latest-decision recheck", async () => {
    const prisma = database({ queue: true });
    const queued = await queueEpisodeMasterConform({
      prisma,
      projectSlug: "high-ground-odyssey",
      episodeSlug: "episode-9",
      reviewJobId: "program_render_master_plan_test",
      approvalReceiptId: "program_approval_master_plan_test",
      clientRequestId: "master_queue_request_test",
      actor: { email: "editor@example.test" },
    });
    expect(queued).toEqual(expect.objectContaining({
      idempotentReplay: false,
      job: expect.objectContaining({
        status: "queued",
        branchRevision: 9,
        outputDurationSeconds: 30,
      }),
    }));
    const created = prisma.__created.mock.calls[0][0].data;
    expect(created).toEqual(expect.objectContaining({
      type: "episode-master-conform",
      source: "episode-editor.local-approved-master",
      requestedByEmail: "editor@example.test",
    }));
    expect(created.inputJson).toEqual(expect.objectContaining({
      kind: "quipsly-episode-master-conform-job-v1",
      renderProfile: "episode-master-3840x2160-24fps-h264-v1",
      approval: expect.objectContaining({ receiptId: "program_approval_master_plan_test" }),
      boundaries: expect.objectContaining({ reviewCandidateIsNotMasterInput: true }),
    }));
  });
});

function database(options: { latest?: any; mediaAssets?: any[]; queue?: boolean } = {}): any {
  const approved = approval();
  const reviewContext = context();
  const reviewReceipt = newEpisodeProgramRenderResult({
    jobId: reviewContext.job.jobId,
    completedAt: "2026-08-08T12:20:00.000Z",
    manifestSha256: reviewContext.job.manifestSha256,
    output: { provider: "local", portability: "executor-local", custodianNodeId: NODE_ID, storageScopeId: SCOPE_ID, locator: reviewContext.job.target.locator, generation: `sha256:${outputSha}`, sha256: outputSha, sizeBytes: 100_000_000, contentType: "video/mp4", durationSeconds: 30, width: 1280, height: 720, fps: 24, videoCodec: "h264", audioCodec: "aac", completeDecode: true, fastStart: true, variantKind: "episode-program-review" },
    worker: { portability: "executor-local", custodianNodeId: NODE_ID, storageScopeId: SCOPE_ID, executionId: "program_review_execution_test", buildId: "program_review_build_test", imageDigest: null, attempt: 1, ffmpegVersion: "ffmpeg test", renderedChunkCount: 1 },
  }, reviewContext.job as never);
  const created = jest.fn(async ({ data }: any) => ({ ...data, status: "queued" }));
  const prisma: any = {
    __created: created,
    studioEpisodeProgramReviewReceipt: {
      findUnique: jest.fn(async () => approved),
      findFirst: jest.fn(async () => options.latest ?? approved),
    },
    studioMediaAsset: {
      findMany: jest.fn(async () => options.mediaAssets ?? [
        { id: "asset_4k_test", resolution: "3840x2160", fps: 24 },
        { id: "asset_audio_test", resolution: null, fps: null },
      ]),
    },
    studioWorkflowJob: {
      findFirst: jest.fn(async () => null),
    },
  };
  if (options.queue) prisma.$transaction = jest.fn(async (callback: any) => callback({
    studioEpisodeProgramReviewReceipt: { findFirst: jest.fn(async () => approved) },
    studioEditBranch: { findUnique: jest.fn(async () => ({ headRevision: 9 })) },
    studioWorkflowJob: {
      findUnique: jest.fn(async () => ({ status: "completed", inputJson: reviewContext.job, resultJson: { receipt: reviewReceipt } })),
      create: created,
    },
  }));
  return prisma;
}
