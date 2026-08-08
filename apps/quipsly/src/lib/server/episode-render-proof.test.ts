import { statSync } from "node:fs";

import { parseEpisodeRenderProofJob } from "@high-ground/quipsly-media-processing";
import { planEpisodeRenderProof, queueEpisodeRenderProof } from "./episode-render-proof";
import { ensureEpisodeEditBranch, projectCanonicalEpisodeEditState } from "./episode-edit-store";
import { resolveAllowedLocalStudioMediaPath } from "./studio-media-location-security";

jest.mock("./episode-edit-store", () => ({
  ensureEpisodeEditBranch: jest.fn(),
  projectCanonicalEpisodeEditState: jest.fn(),
}));
jest.mock("./studio-media-location-security", () => ({ resolveAllowedLocalStudioMediaPath: jest.fn() }));

const mockedEnsure = jest.mocked(ensureEpisodeEditBranch);
const mockedProject = jest.mocked(projectCanonicalEpisodeEditState);
const mockedResolve = jest.mocked(resolveAllowedLocalStudioMediaPath);
const TEST_SOURCE_PATH = __filename;
const TEST_SOURCE_SIZE = statSync(TEST_SOURCE_PATH).size;
const EXECUTOR_NODE_ID = "execution_worker_render_test";
const EXECUTOR_SCOPE_ID = "storage_scope_render_test";

function executorCapabilities() {
  return {
    schema: "quipsly-execution-worker-capabilities-v1",
    executorKind: "local-mac",
    jobTypes: ["episode-render-proof"],
    renderProfiles: [
      "episode-edit-proof-1280x720-24fps-v1",
      "episode-section-review-1280x720-24fps-v1",
    ],
    storage: {
      schema: "quipsly-local-media-storage-v1",
      status: "measured",
      availableBytes: 20_000_000,
      reserveBytes: 5_000_000,
      safeAvailableBytes: 15_000_000,
      measuredAt: new Date().toISOString(),
      workspaceMode: "durable",
      scopeId: EXECUTOR_SCOPE_ID,
    },
  };
}

describe("Episode render proof queue", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockedEnsure.mockResolvedValue({
      episode: {
        id: "episode_production_0001",
        projectId: "project_0001",
        timelineJson: { clips: [] },
        transcriptJson: null,
        productionJson: {},
        updatedAt: new Date("2026-08-07T18:00:00.000Z"),
      },
      baseline: {} as never,
      branch: { id: "edit_branch_0001", headRevision: 4 } as never,
    } as never);
    mockedProject.mockReturnValue({
      version: "quipsly-program-edit.v1",
      durationSeconds: 30,
      sourceProjectionFingerprint: "b".repeat(64),
      sources: [{
        id: "audio_lane_0001",
        mediaAssetId: "media_asset_0001",
        sourceId: "video_source_0001",
        recordingAssetId: "recording_asset_0001",
        label: "MV7i exact source",
        role: "audio",
        kind: "audio",
        contentType: "audio/wav",
        sourceSha256: "a".repeat(64),
        offsetSeconds: 0,
        sourceStartSeconds: 0,
        durationSeconds: 30,
      }],
      programDecisions: [],
    });
    mockedResolve.mockResolvedValue(TEST_SOURCE_PATH);
  });

  it("freezes the current branch into an exact local 24 fps proof job", async () => {
    let createdInput: any = null;
    const prisma = database((input) => { createdInput = input; });
    const result = await queueEpisodeRenderProof({
      prisma,
      projectSlug: "high-ground-odyssey",
      episodeSlug: "episode-9",
      sequenceStartSeconds: 5,
      expectedRevision: 4,
      clientRequestId: "proof_request_0001",
      actor: { userId: "user-1", email: "charlie@quipsly.com", type: "human" },
    });
    const job = parseEpisodeRenderProofJob(createdInput.data.inputJson, createdInput.data.id);
    expect(result).toEqual(expect.objectContaining({ idempotentReplay: false, job: expect.objectContaining({ branchRevision: 4, sequenceStartSeconds: 5, sequenceEndSeconds: 15 }) }));
    expect(job.target).toEqual(expect.objectContaining({ provider: "local", width: 1280, height: 720, fps: 24 }));
    expect(job.executionTarget).toEqual({
      portability: "executor-local",
      custodianNodeId: EXECUTOR_NODE_ID,
      storageScopeId: EXECUTOR_SCOPE_ID,
    });
    expect(job.proof).toEqual(expect.objectContaining({ decisionKind: "audio-source-through", audioLaneIds: ["audio_lane_0001"] }));
    expect(job.sources[0]).toEqual(expect.objectContaining({ sha256: "a".repeat(64), locator: TEST_SOURCE_PATH }));
    expect(job.manifestSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("freezes an explicit section review for up to thirty seconds", async () => {
    const prisma = database();
    const result = await queueEpisodeRenderProof({
      prisma,
      projectSlug: "high-ground-odyssey",
      episodeSlug: "episode-9",
      sequenceStartSeconds: 0,
      expectedRevision: 4,
      clientRequestId: "section_review_request_0001",
      renderProfile: "section-review-30s",
      actor: { userId: "user-1", email: "charlie@quipsly.com", type: "human" },
    });
    const created = prisma.studioWorkflowJob.create.mock.calls[0]?.[0];
    const job = parseEpisodeRenderProofJob(created.data.inputJson, created.data.id);
    expect(result.job).toEqual(expect.objectContaining({ renderProfile: "section-review-30s", sequenceEndSeconds: 30 }));
    expect(job).toEqual(expect.objectContaining({ renderProfile: "section-review-30s" }));
    expect(job.target.variantKind).toBe("episode-section-review");
  });

  it("plans local, browser, and cloud execution without creating a job or uploading media", async () => {
    const prisma = database();
    prisma.agentNode.findMany.mockResolvedValue([{
      id: EXECUTOR_NODE_ID,
      hostName: "Editing Mac",
      status: "online",
      lastHeartbeatAt: new Date(),
      capabilities: executorCapabilities(),
    }]);
    const plan = await planEpisodeRenderProof({
      prisma,
      projectSlug: "high-ground-odyssey",
      episodeSlug: "episode-9",
      sequenceStartSeconds: 5,
      expectedRevision: 4,
      renderProfile: "proof-10s",
      actor: { userId: "user-1", email: "charlie@quipsly.com", type: "human" },
    });
    expect(plan.boundaries).toEqual({
      createsNoJob: true,
      sourceMediaRemainsImmutable: true,
      cloudUploadNotStarted: true,
      publicationNotStarted: true,
    });
    expect(plan.executors).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "browser", status: "ready", canQueue: false }),
      expect.objectContaining({
        id: "local-mac",
        label: "Editing Mac",
        executorNodeId: EXECUTOR_NODE_ID,
        artifactPortability: "executor-local",
        status: "ready",
        canQueue: true,
        costKind: "none",
      }),
      expect.objectContaining({ id: "cloud", status: "not-configured", canQueue: false, costKind: "metered" }),
    ]));
    expect(plan.sources).toEqual(expect.objectContaining({ exactLocalCount: 1, requiredCount: 1, totalBytes: TEST_SOURCE_SIZE }));
    expect(prisma.studioWorkflowJob.create).not.toHaveBeenCalled();
  });

  it("reconciles an incomplete imported placeholder with the measured protected source asset", async () => {
    const cameraDecision = {
      id: "decision_0001",
      startTime: 0,
      kind: "primaryWithClip" as const,
      sourceLaneIDs: [],
      clipLaneID: "camera_lane_0001",
    };
    mockedProject.mockReturnValue({
      version: "quipsly-program-edit.v1",
      durationSeconds: 30,
      sourceProjectionFingerprint: "b".repeat(64),
      sources: [{
        id: "camera_lane_0001",
        mediaAssetId: "placeholder_asset_0001",
        sourceId: "video_source_0001",
        label: "Protected iPhone camera",
        role: "reference",
        kind: "video",
        contentType: "video/mp4",
        sourceSha256: "a".repeat(64),
        offsetSeconds: 0,
        sourceStartSeconds: 0,
        durationSeconds: 30,
      }],
      programDecisions: [cameraDecision],
    });
    const prisma = database();
    prisma.studioEditBranch.findUnique.mockResolvedValue({
      id: "edit_branch_0001",
      headRevision: 4,
      stateJson: { programDecisions: [cameraDecision] },
    });
    prisma.studioMediaAsset.findMany.mockResolvedValue([
      { id: "placeholder_asset_0001", filename: "camera.mp4", mimeType: "video/mp4", sizeBytes: null, duration: 30, url: "/api/ingest/media/video_source_0001" },
      { id: "measured_proxy_asset_0001", filename: "camera.proxy.mp4", mimeType: "video/mp4", sizeBytes: BigInt(TEST_SOURCE_SIZE), duration: 30, url: "/api/ingest/media/video_source_0001" },
    ]);

    const result = await queueEpisodeRenderProof({
      prisma,
      projectSlug: "high-ground-odyssey",
      episodeSlug: "episode-9",
      sequenceStartSeconds: 0,
      expectedRevision: 4,
      clientRequestId: "proof_request_camera_0001",
      actor: { userId: "user-1", email: "charlie@quipsly.com", type: "human" },
    });
    const created = prisma.studioWorkflowJob.create.mock.calls[0]?.[0];
    const job = parseEpisodeRenderProofJob(created.data.inputJson, created.data.id);
    expect(result.job.branchRevision).toBe(4);
    expect(job.sources[0]).toEqual(expect.objectContaining({
      laneId: "camera_lane_0001",
      mediaAssetId: "measured_proxy_asset_0001",
      sizeBytes: TEST_SOURCE_SIZE,
    }));
  });

  it("holds instead of sending a browser-only source to a local worker", async () => {
    mockedResolve.mockResolvedValue(null);
    await expect(queueEpisodeRenderProof({
      prisma: database(),
      projectSlug: "high-ground-odyssey",
      episodeSlug: "episode-9",
      sequenceStartSeconds: 5,
      expectedRevision: 4,
      clientRequestId: "proof_request_0002",
      actor: { userId: "user-1", email: "charlie@quipsly.com", type: "human" },
    })).rejects.toMatchObject({ code: "EPISODE_RENDER_PROOF_HELD", message: expect.stringContaining("not available as an exact local worker source") });
  });

  it("does not silently substitute another Mac for a requested executor", async () => {
    await expect(queueEpisodeRenderProof({
      prisma: database(),
      projectSlug: "high-ground-odyssey",
      episodeSlug: "episode-9",
      sequenceStartSeconds: 5,
      expectedRevision: 4,
      clientRequestId: "proof_request_wrong_executor_0001",
      executorNodeId: "execution_worker_missing_test",
      actor: { userId: "user-1", email: "charlie@quipsly.com", type: "human" },
    })).rejects.toMatchObject({
      code: "EPISODE_RENDER_PROOF_EXECUTOR_UNAVAILABLE",
    });
  });

  it("chooses a compatible executor when the newest local Mac lacks the render profile", async () => {
    const prisma = database();
    const incompatibleNodeId = "execution_worker_incompatible_test";
    const compatibleNodeId = "execution_worker_compatible_test";
    const storageCapabilities = (scopeId: string) => ({
      ...executorCapabilities(),
      storage: { ...executorCapabilities().storage, scopeId },
    });
    prisma.agentNode.findMany.mockResolvedValue([
      {
        id: incompatibleNodeId,
        hostName: "Newest but incompatible Mac",
        status: "online",
        lastHeartbeatAt: new Date(),
        capabilities: storageCapabilities("storage_scope_incompatible_test"),
      },
      {
        id: compatibleNodeId,
        hostName: "Episode Render Mac",
        status: "online",
        lastHeartbeatAt: new Date(),
        capabilities: storageCapabilities("storage_scope_compatible_test"),
      },
    ]);
    prisma.agentNode.findUnique.mockImplementation(async ({ where }: any) => ({
      status: "online",
      lastHeartbeatAt: new Date(),
      capabilities: where.id === incompatibleNodeId
        ? { ...storageCapabilities("storage_scope_incompatible_test"), renderProfiles: [] }
        : storageCapabilities("storage_scope_compatible_test"),
    }));

    const plan = await planEpisodeRenderProof({
      prisma,
      projectSlug: "high-ground-odyssey",
      episodeSlug: "episode-9",
      sequenceStartSeconds: 5,
      expectedRevision: 4,
      renderProfile: "proof-10s",
      actor: { userId: "user-1", email: "charlie@quipsly.com", type: "human" },
    });
    expect(plan.executors.find((executor) => executor.id === "local-mac")).toMatchObject({
      label: "Episode Render Mac",
      executorNodeId: compatibleNodeId,
      status: "ready",
    });
  });
});

function database(onCreate: (input: any) => void = () => undefined): any {
  return {
    studioEditBranch: { findUnique: jest.fn(async () => ({ id: "edit_branch_0001", headRevision: 4, stateJson: { programDecisions: [] } })) },
    studioWorkflowJob: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async (input) => {
        onCreate(input);
        return { ...input.data, createdAt: new Date(), updatedAt: new Date() };
      }),
    },
    studioMediaAsset: {
      findMany: jest.fn(async () => [{ id: "media_asset_0001", filename: "source.wav", mimeType: "audio/wav", sizeBytes: BigInt(TEST_SOURCE_SIZE), duration: 30, url: "/api/ingest/media/video_source_0001" }]),
    },
    studioVideoSource: {
      findMany: jest.fn(async () => [{ id: "video_source_0001", providerSourceId: TEST_SOURCE_PATH, url: "/api/ingest/media/video_source_0001" }]),
    },
    agentNode: {
      findMany: jest.fn(async () => [{
        id: EXECUTOR_NODE_ID,
        hostName: "Editing Mac",
        status: "online",
        lastHeartbeatAt: new Date(),
        capabilities: executorCapabilities(),
      }]),
      findUnique: jest.fn(async () => ({
        status: "online",
        lastHeartbeatAt: new Date(),
        capabilities: executorCapabilities(),
      })),
    },
  };
}
