import {
  newEpisodeProgramRenderResult,
  parseEpisodeProgramRenderJob,
  type EpisodeRenderProofSource,
} from "@high-ground/quipsly-media-processing";

import {
  planEpisodeProgramRender,
  programChunks,
  queueEpisodeProgramRender,
  registerEpisodeProgramRender,
} from "./episode-program-render";
import {
  ensureEpisodeEditBranch,
  projectCanonicalEpisodeEditState,
} from "./episode-edit-store";
import { resolveExactEpisodeRenderSources } from "./episode-render-exact-sources";
import { verifyLocalRenderResult } from "./episode-render-proof";

jest.mock("./episode-edit-store", () => ({
  ensureEpisodeEditBranch: jest.fn(),
  projectCanonicalEpisodeEditState: jest.fn(),
}));
jest.mock("./episode-render-exact-sources", () => ({
  ExactEpisodeRenderSourceError: class ExactEpisodeRenderSourceError extends Error {},
  resolveExactEpisodeRenderSources: jest.fn(),
}));
jest.mock("./episode-render-proof", () => ({
  verifyLocalRenderResult: jest.fn(),
}));

const mockedEnsure = jest.mocked(ensureEpisodeEditBranch);
const mockedProject = jest.mocked(projectCanonicalEpisodeEditState);
const mockedExact = jest.mocked(resolveExactEpisodeRenderSources);
const mockedVerify = jest.mocked(verifyLocalRenderResult);
const EXECUTOR_NODE_ID = "execution_worker_program_test";
const EXECUTOR_SCOPE_ID = "storage_scope_program_test";

const exactSource: EpisodeRenderProofSource = {
  portability: "executor-local",
  custodianNodeId: EXECUTOR_NODE_ID,
  storageScopeId: EXECUTOR_SCOPE_ID,
  laneId: "camera_lane_0001",
  mediaAssetId: "media_asset_0001",
  sourceId: "video_source_0001",
  recordingAssetId: "recording_asset_0001",
  label: "Charlie camera",
  kind: "video",
  role: "primary",
  provider: "local",
  locator: "/tmp/quipsly-media/source.mp4",
  generation: `sha256:${"a".repeat(64)}`,
  sha256: "a".repeat(64),
  sizeBytes: 25_000_000,
  contentType: "video/mp4",
  sequenceOffsetSeconds: 0,
  sourceStartSeconds: 0,
  sourceDurationSeconds: 65,
};

const state = {
  version: "quipsly-program-edit.v1" as const,
  durationSeconds: 65,
  sourceProjectionFingerprint: "b".repeat(64),
  sources: [{
    id: "camera_lane_0001",
    mediaAssetId: "media_asset_0001",
    sourceId: "video_source_0001",
    recordingAssetId: "recording_asset_0001",
    label: "Charlie camera",
    role: "primary" as const,
    kind: "video" as const,
    contentType: "video/mp4",
    sourceSha256: "a".repeat(64),
    offsetSeconds: 0,
    sourceStartSeconds: 0,
    durationSeconds: 65,
  }],
  programDecisions: [{
    id: "decision_primary_0001",
    startTime: 0,
    kind: "primary" as const,
    sourceLaneIDs: ["camera_lane_0001"],
  }, {
    id: "decision_skip_0001",
    startTime: 35,
    kind: "skip" as const,
    sourceLaneIDs: [],
  }, {
    id: "decision_primary_0002",
    startTime: 45,
    kind: "primary" as const,
    sourceLaneIDs: ["camera_lane_0001"],
  }],
};

function capabilities() {
  return {
    schema: "quipsly-execution-worker-capabilities-v1",
    executorKind: "local-mac",
    jobTypes: ["episode-program-render"],
    renderProfiles: ["episode-program-review-1280x720-24fps-v1"],
    storage: {
      schema: "quipsly-local-media-storage-v1",
      status: "measured",
      availableBytes: 100_000_000,
      reserveBytes: 10_000_000,
      safeAvailableBytes: 90_000_000,
      measuredAt: new Date().toISOString(),
      workspaceMode: "durable",
      scopeId: EXECUTOR_SCOPE_ID,
    },
  };
}

describe("Episode full-program render", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockedEnsure.mockResolvedValue({
      episode: {
        id: "episode_production_0001",
        projectId: "project_0001",
        timelineJson: { clips: [] },
        transcriptJson: null,
        productionJson: {},
        updatedAt: new Date("2026-08-08T12:00:00.000Z"),
      },
      baseline: {} as never,
      branch: { id: "edit_branch_0001", headRevision: 7 } as never,
    } as never);
    mockedProject.mockReturnValue(state);
    mockedExact.mockResolvedValue([exactSource]);
    mockedVerify.mockResolvedValue("/tmp/quipsly-media/program.mp4");
  });

  it("projects visible decisions into ordered chunks and compresses explicit Skip ranges", () => {
    const frozen = programChunks(state);

    expect(frozen.program).toEqual({
      sequenceDurationSeconds: 65,
      outputDurationSeconds: 55,
      skippedDurationSeconds: 10,
      chunkCount: 3,
    });
    expect(frozen.chunks.map((chunk) => ({
      output: chunk.outputStartSeconds,
      start: chunk.sequenceStartSeconds,
      end: chunk.sequenceEndSeconds,
    }))).toEqual([
      { output: 0, start: 0, end: 17.5 },
      { output: 17.5, start: 17.5, end: 35 },
      { output: 35, start: 45, end: 65 },
    ]);
  });

  it("plans the whole program without creating a job or claiming approval", async () => {
    const prisma = database();
    const plan = await planEpisodeProgramRender({
      prisma,
      projectSlug: "high-ground-odyssey",
      episodeSlug: "episode-9",
      expectedRevision: 7,
      actor: { userId: "user-1", email: "charlie@quipsly.com", type: "human" },
    });

    expect(plan.program).toEqual(expect.objectContaining({
      outputDurationSeconds: 55,
      skippedDurationSeconds: 10,
      chunkCount: 3,
      visibleDecisionCount: 2,
    }));
    expect(plan.sources).toEqual(expect.objectContaining({
      exactLocalCount: 1,
      requiredCount: 1,
      totalBytes: 25_000_000,
    }));
    expect(plan.executor).toEqual(expect.objectContaining({
      label: "Program Render Mac",
      executorNodeId: EXECUTOR_NODE_ID,
      status: "ready",
      canQueue: true,
    }));
    expect(plan.boundaries).toEqual({
      createsNoJob: true,
      sourceMediaRemainsImmutable: true,
      outputIsNotApprovedMaster: true,
      publicationNotStarted: true,
    });
    expect(prisma.studioWorkflowJob.create).not.toHaveBeenCalled();
  });

  it("queues one exact-executor manifest with stable chunk and duration accounting", async () => {
    const prisma = database();
    const queued = await queueEpisodeProgramRender({
      prisma,
      projectSlug: "high-ground-odyssey",
      episodeSlug: "episode-9",
      expectedRevision: 7,
      clientRequestId: "program_request_0001",
      executorNodeId: EXECUTOR_NODE_ID,
      actor: { userId: "user-1", email: "charlie@quipsly.com", type: "human" },
    });
    const created = prisma.studioWorkflowJob.create.mock.calls[0]?.[0];
    const job = parseEpisodeProgramRenderJob(created.data.inputJson, created.data.id);

    expect(queued.job).toEqual(expect.objectContaining({
      branchRevision: 7,
      outputDurationSeconds: 55,
      chunkCount: 3,
      executionTarget: expect.objectContaining({ nodeId: EXECUTOR_NODE_ID }),
    }));
    expect(job.program).toEqual(expect.objectContaining({
      sequenceDurationSeconds: 65,
      outputDurationSeconds: 55,
      skippedDurationSeconds: 10,
    }));
    expect(job.boundaries.outputIsNotApprovedMaster).toBe(true);
    expect(job.boundaries.approvalRequiresSeparateReceipt).toBe(true);
    expect(job.sources[0]).toEqual(exactSource);
  });

  it("independently verifies and registers protected full-program playback", async () => {
    const prisma = database();
    await queueEpisodeProgramRender({
      prisma,
      projectSlug: "high-ground-odyssey",
      episodeSlug: "episode-9",
      expectedRevision: 7,
      clientRequestId: "program_request_register_0001",
      executorNodeId: EXECUTOR_NODE_ID,
      actor: { userId: "user-1", email: "charlie@quipsly.com", type: "human" },
    });
    const createdInput = prisma.studioWorkflowJob.create.mock.calls[0][0];
    const job = parseEpisodeProgramRenderJob(
      createdInput.data.inputJson,
      createdInput.data.id,
    );
    const outputSha256 = "c".repeat(64);
    const receipt = newEpisodeProgramRenderResult({
      jobId: job.jobId,
      completedAt: "2026-08-08T12:30:00.000Z",
      manifestSha256: job.manifestSha256,
      output: {
        provider: "local",
        ...job.executionTarget,
        locator: job.target.locator,
        generation: `sha256:${outputSha256}`,
        sha256: outputSha256,
        sizeBytes: 50_000_000,
        contentType: "video/mp4",
        durationSeconds: job.program.outputDurationSeconds,
        width: 1280,
        height: 720,
        fps: 24,
        videoCodec: "h264",
        audioCodec: "aac",
        completeDecode: true,
        fastStart: true,
        variantKind: "episode-program-review",
      },
      worker: {
        ...job.executionTarget,
        executionId: "execution_attempt_program_0001",
        buildId: "media-worker-build-1",
        imageDigest: null,
        attempt: 1,
        ffmpegVersion: "ffmpeg 8.0",
        renderedChunkCount: job.chunks.length,
      },
    }, job);
    const outputReady = {
      ...createdInput.data,
      status: "output-ready",
      resultJson: { state: "output-ready", receipt },
      error: null,
    };
    prisma.studioWorkflowJob.findUnique.mockResolvedValue(outputReady);

    const registered = await registerEpisodeProgramRender({
      prisma,
      projectSlug: "high-ground-odyssey",
      episodeSlug: "episode-9",
      jobId: job.jobId,
      actor: { userId: "user-1", email: "charlie@quipsly.com", type: "human" },
    });

    expect(mockedVerify).toHaveBeenCalledWith(
      job.target.locator,
      outputSha256,
      50_000_000,
    );
    expect(registered).toEqual(expect.objectContaining({
      ok: true,
      jobId: job.jobId,
      status: "completed",
      sourceId: "source_program_review_0001",
      playbackUrl: "/api/ingest/media/source_program_review_0001",
    }));
    expect(prisma.studioAssetAttachment.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        role: "episode-program-review",
        metadataJson: expect.objectContaining({
          schema: "quipsly-episode-program-render-registration-v1",
          custodianNodeId: EXECUTOR_NODE_ID,
          storageScopeId: EXECUTOR_SCOPE_ID,
          outputIsNotApprovedMaster: true,
        }),
      }),
    }));
  });

  it("does not substitute a different Mac when the requested executor is absent", async () => {
    await expect(queueEpisodeProgramRender({
      prisma: database(),
      projectSlug: "high-ground-odyssey",
      episodeSlug: "episode-9",
      expectedRevision: 7,
      clientRequestId: "program_request_missing_mac",
      executorNodeId: "execution_worker_missing_test",
      actor: { userId: "user-1", email: "charlie@quipsly.com", type: "human" },
    })).rejects.toMatchObject({
      code: "EPISODE_PROGRAM_RENDER_EXECUTOR_UNAVAILABLE",
    });
  });

  it("holds a program whose edit does not explicitly cover the first frame", () => {
    expect(() => programChunks({
      ...state,
      programDecisions: [{ ...state.programDecisions[0]!, startTime: 1 }],
    })).toThrow(/beginning of the Episode/);
  });
});

function database(): any {
  const prisma: any = {
    studioEditBranch: {
      findUnique: jest.fn(async () => ({
        id: "edit_branch_0001",
        headRevision: 7,
        stateJson: { programDecisions: state.programDecisions },
      })),
    },
    studioWorkflowJob: {
      findFirst: jest.fn(async () => null),
      findUnique: jest.fn(async () => null),
      create: jest.fn(async (input) => ({
        ...input.data,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      update: jest.fn(async ({ where, data }) => ({
        id: where.id,
        status: data.status,
        resultJson: data.resultJson,
      })),
    },
    studioEpisodeProduction: {
      findFirst: jest.fn(async () => ({
        id: "episode_production_0001",
        projectId: "project_0001",
      })),
    },
    studioVideoSource: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async ({ data }) => ({
        id: "source_program_review_0001",
        ...data,
      })),
      update: jest.fn(async ({ where, data }) => ({
        id: where.id,
        provider: "local-episode-program-render-worker",
        providerSourceId: "/tmp/quipsly-media/program.mp4",
        title: "Episode 9 program review",
        ...data,
      })),
    },
    studioMediaAsset: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async ({ data }) => ({ id: "asset_program_review_0001", ...data })),
    },
    studioAssetAttachment: {
      upsert: jest.fn(async () => ({})),
    },
    agentNode: {
      findMany: jest.fn(async () => [{
        id: EXECUTOR_NODE_ID,
        hostName: "Program Render Mac",
        status: "online",
        lastHeartbeatAt: new Date(),
        capabilities: capabilities(),
      }]),
      findUnique: jest.fn(async () => ({
        status: "online",
        lastHeartbeatAt: new Date(),
        capabilities: capabilities(),
      })),
    },
  };
  prisma.$transaction = jest.fn(async (operation: (tx: any) => Promise<unknown>) => operation(prisma));
  return prisma;
}
