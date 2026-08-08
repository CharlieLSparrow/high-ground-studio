import { planEpisodeMasterConform } from "./episode-master-conform";
import { readLocalExecutorTarget } from "./local-executor-storage";
import { loadEpisodeProgramReviewContext } from "./episode-program-review";

jest.mock("./episode-program-review", () => ({
  EpisodeProgramReviewError: class EpisodeProgramReviewError extends Error {},
  loadEpisodeProgramReviewContext: jest.fn(),
}));
jest.mock("./local-executor-storage", () => ({
  readLocalExecutorTarget: jest.fn(),
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
      jobId: "program_render_master_plan_test",
      projectId: "project_master_plan_test",
      episodeProductionId: "episode_master_plan_test",
      executionTarget: {
        portability: "executor-local",
        custodianNodeId: NODE_ID,
        storageScopeId: SCOPE_ID,
      },
      program: { outputDurationSeconds: 3600 },
      sources: [{
        laneId: "camera_4k_test",
        mediaAssetId: "asset_4k_test",
        label: "Canon R8",
        kind: "video",
        sizeBytes: 20_000_000_000,
      }, {
        laneId: "audio_test",
        mediaAssetId: "asset_audio_test",
        label: "MV7i",
        kind: "audio",
        sizeBytes: 2_000_000_000,
      }],
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
        outputDurationSeconds: 3600,
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
});

function database(options: { latest?: any; mediaAssets?: any[] } = {}): any {
  const approved = approval();
  return {
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
  };
}
