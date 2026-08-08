import {
  newEpisodeProgramRenderJob,
  newEpisodeProgramRenderResult,
} from "@high-ground/quipsly-media-processing";

import {
  appendEpisodeProgramReview,
  loadEpisodeProgramReviewContext,
  readAuthorizedEpisodeProgramReviewSummary,
} from "./episode-program-review";
import { readCurrentLocalExecutorIdentity } from "./local-executor-storage";
import { verifyLocalRenderResult } from "./episode-render-proof";

jest.mock("./local-executor-storage", () => ({
  readCurrentLocalExecutorIdentity: jest.fn(),
}));
jest.mock("./episode-render-proof", () => ({
  verifyLocalRenderResult: jest.fn(),
}));
jest.mock("./prisma-advisory-lock", () => ({
  acquirePrismaAdvisoryTransactionLock: jest.fn(async () => undefined),
}));

const NODE_ID = "execution_worker_review_test";
const SCOPE_ID = "storage_scope_review_test";
const OUTPUT_PATH = "/tmp/quipsly-media/program-review.mp4";
const sourceSha = "a".repeat(64);
const outputSha = "b".repeat(64);
const authority = {
  portability: "executor-local" as const,
  custodianNodeId: NODE_ID,
  storageScopeId: SCOPE_ID,
};

function renderEvidence() {
  const base = {
    jobId: "episode_program_review_job_0001",
    projectId: "project_review_0001",
    episodeProductionId: "episode_review_0001",
    branchId: "branch_review_0001",
    branchRevision: 5,
    requestedByEmail: "editor@example.test",
    clientRequestId: "render_request_review_0001",
    queuedAt: "2026-08-08T12:00:00.000Z",
    timelineFingerprintSha256: "c".repeat(64),
    sourceProjectionFingerprintSha256: "d".repeat(64),
    editStateFingerprintSha256: "e".repeat(64),
    manifestSha256: "f".repeat(64),
    renderProfile: "episode-program-review-1280x720-24fps-v1" as const,
    executionTarget: authority,
    program: {
      sequenceDurationSeconds: 10,
      outputDurationSeconds: 10,
      skippedDurationSeconds: 0,
      chunkCount: 1,
    },
    sources: [{
      ...authority,
      laneId: "camera_lane_review_0001",
      mediaAssetId: "media_asset_review_0001",
      sourceId: "source_review_0001",
      recordingAssetId: null,
      label: "Review camera",
      kind: "video" as const,
      role: "primary" as const,
      provider: "local" as const,
      locator: "/tmp/quipsly-media/source.mp4",
      generation: `sha256:${sourceSha}`,
      sha256: sourceSha,
      sizeBytes: 10_000,
      contentType: "video/mp4",
      sequenceOffsetSeconds: 0,
      sourceStartSeconds: 0,
      sourceDurationSeconds: 10,
    }],
    chunks: [{
      id: "program_chunk_review_0001",
      outputStartSeconds: 0,
      sequenceStartSeconds: 0,
      sequenceEndSeconds: 10,
      decisionId: "decision_review_0001",
      decisionKind: "primary",
      visualLaneIds: ["camera_lane_review_0001"],
      clipLaneId: null,
      audioLaneIds: ["camera_lane_review_0001"],
    }],
    target: {
      provider: "local" as const,
      ...authority,
      locator: "media-vault/episode-program-renders/episode_review_0001/branch_review_0001/revision-5/episode_program_review_job_0001.mp4",
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
  const job = newEpisodeProgramRenderJob({ ...base, manifestSha256: placeholder.manifestSha256 });
  const result = newEpisodeProgramRenderResult({
    jobId: job.jobId,
    completedAt: "2026-08-08T12:10:00.000Z",
    manifestSha256: job.manifestSha256,
    output: {
      provider: "local",
      ...authority,
      locator: job.target.locator,
      generation: `sha256:${outputSha}`,
      sha256: outputSha,
      sizeBytes: 50_000,
      contentType: "video/mp4",
      durationSeconds: 10,
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
      ...authority,
      executionId: "execution_review_0001",
      buildId: "worker-build-1",
      imageDigest: null,
      attempt: 1,
      ffmpegVersion: "ffmpeg 8.0",
      renderedChunkCount: 1,
    },
  }, job);
  return { job, result };
}

function playbackEvidence(overrides: Record<string, unknown> = {}) {
  return {
    kind: "quipsly-episode-program-review-playback-evidence-v1",
    durationSeconds: 10,
    watchedSecondBins: Array.from({ length: 10 }, (_, index) => index),
    playbackStartedAt: "2026-08-08T12:20:00.000Z",
    playbackEndedAt: "2026-08-08T12:20:10.000Z",
    playthroughEnded: true,
    maximumPlaybackRate: 1,
    mutedAtDecision: false,
    volumeAtDecision: 1,
    seekCount: 0,
    ...overrides,
  };
}

describe("Episode full-program review ledger", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(readCurrentLocalExecutorIdentity).mockResolvedValue({
      nodeId: NODE_ID,
      hostName: "Review Mac",
      storageScopeId: SCOPE_ID,
    });
    jest.mocked(verifyLocalRenderResult).mockResolvedValue(OUTPUT_PATH);
  });

  it("appends an exact-generation approval without creating a master", async () => {
    const prisma = database();
    const result = await appendEpisodeProgramReview({
      prisma,
      projectSlug: "high-ground-odyssey",
      episodeSlug: "episode-9",
      jobId: "episode_program_review_job_0001",
      actor: { userId: "user_review_0001", email: "Editor@Example.test" },
      clientRequestId: "program_review_request_0001",
      decision: "approved",
      playbackEvidence: playbackEvidence(),
      note: "The complete Play Edit is ready for master conform.",
    });

    expect(result).toMatchObject({
      ok: true,
      idempotentReplay: false,
      receipt: {
        decision: "approved",
        jobId: "episode_program_review_job_0001",
        watchedFraction: 1,
      },
      review: {
        approvalCount: 1,
        rejectionCount: 0,
        boundaries: {
          masterNotCreated: true,
          portableUploadNotStarted: true,
          publicationNotStarted: true,
        },
      },
    });
    expect(prisma.studioEpisodeProgramReviewReceipt.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        decision: "APPROVED",
        branchRevision: 5,
        manifestSha256: "f".repeat(64),
        outputSha256: outputSha,
        outputGeneration: `sha256:${outputSha}`,
        outputSizeBytes: BigInt(50_000),
        evidenceJson: expect.objectContaining({
          approvalDoesNotCreateMaster: true,
          clientTrackedPlaybackIsNotProofOfAttentionOrAudibility: true,
        }),
      }),
    }));
  });

  it("holds approval when playback skipped most of the program", async () => {
    await expect(appendEpisodeProgramReview({
      prisma: database(),
      projectSlug: "high-ground-odyssey",
      episodeSlug: "episode-9",
      jobId: "episode_program_review_job_0001",
      actor: { userId: "user_review_0001", email: "editor@example.test" },
      clientRequestId: "program_review_request_0002",
      decision: "approved",
      playbackEvidence: playbackEvidence({ watchedSecondBins: [0, 9], seekCount: 1 }),
    })).rejects.toMatchObject({ code: "EPISODE_PROGRAM_REVIEW_INCOMPLETE" });
  });

  it("holds stale edit revisions and another Mac's output", async () => {
    const stale = database();
    stale.studioEditBranch.findUnique.mockResolvedValue({ headRevision: 6 });
    await expect(loadEpisodeProgramReviewContext({
      prisma: stale,
      projectSlug: "high-ground-odyssey",
      episodeSlug: "episode-9",
      jobId: "episode_program_review_job_0001",
    })).rejects.toMatchObject({ code: "EPISODE_PROGRAM_REVIEW_EDIT_STALE" });

    jest.mocked(readCurrentLocalExecutorIdentity).mockResolvedValue({
      nodeId: "execution_worker_other_test",
      hostName: "Other Mac",
      storageScopeId: "storage_scope_other_test",
    });
    await expect(loadEpisodeProgramReviewContext({
      prisma: database(),
      projectSlug: "high-ground-odyssey",
      episodeSlug: "episode-9",
      jobId: "episode_program_review_job_0001",
    })).rejects.toMatchObject({ code: "EPISODE_PROGRAM_REVIEW_EXECUTOR_MISMATCH" });
  });

  it("does not reveal another Nest's review receipt by job id", async () => {
    const prisma = database();
    prisma.studioWorkflowJob.findFirst.mockResolvedValue(null);
    await expect(readAuthorizedEpisodeProgramReviewSummary({
      prisma,
      projectSlug: "different-nest",
      episodeSlug: "episode-9",
      jobId: "episode_program_review_job_0001",
    })).rejects.toMatchObject({
      status: 404,
      code: "EPISODE_PROGRAM_REVIEW_CANDIDATE_NOT_FOUND",
    });
    expect(prisma.studioEpisodeProgramReviewReceipt.findFirst).not.toHaveBeenCalled();
  });
});

function database(): any {
  const { job, result } = renderEvidence();
  const receipts: any[] = [];
  const row = {
    id: job.jobId,
    projectId: job.projectId,
    type: "episode-program-render",
    source: "episode-editor.local-program-review",
    status: "completed",
    inputJson: job,
    resultJson: {
      state: "completed",
      receipt: result,
      registration: {
        schema: "quipsly-episode-program-render-registration-v1",
        sourceId: "source_program_review_0001",
        playbackUrl: "/api/ingest/media/source_program_review_0001",
        outputIsReviewCandidate: true,
        outputIsNotApprovedMaster: true,
      },
    },
  };
  const reviewModel = {
    findUnique: jest.fn(async ({ where }: any) => receipts.find((receipt) => (
      receipt.projectId === where.projectId_actorEmail_clientRequestId.projectId
      && receipt.actorEmail === where.projectId_actorEmail_clientRequestId.actorEmail
      && receipt.clientRequestId === where.projectId_actorEmail_clientRequestId.clientRequestId
    )) ?? null),
    findFirst: jest.fn(async ({ where }: any) => [...receipts].reverse().find((receipt) => receipt.renderJobId === where.renderJobId) ?? null),
    count: jest.fn(async ({ where }: any) => receipts.filter((receipt) => receipt.renderJobId === where.renderJobId && receipt.decision === where.decision).length),
    create: jest.fn(async ({ data }: any) => {
      const receipt = { id: `program_review_receipt_${receipts.length + 1}`, ...data, createdAt: new Date() };
      receipts.push(receipt);
      return receipt;
    }),
  };
  const prisma: any = {
    studioProject: { findFirst: jest.fn(async () => ({ id: job.projectId })) },
    studioEpisodeProduction: { findFirst: jest.fn(async () => ({ id: job.episodeProductionId, projectId: job.projectId })) },
    studioWorkflowJob: {
      findFirst: jest.fn(async () => row),
      findUnique: jest.fn(async () => row),
    },
    studioEditBranch: { findUnique: jest.fn(async () => ({ headRevision: job.branchRevision })) },
    studioVideoSource: { findUnique: jest.fn(async () => ({ id: "source_program_review_0001", url: "/api/ingest/media/source_program_review_0001", providerSourceId: OUTPUT_PATH })) },
    studioEpisodeProgramReviewReceipt: reviewModel,
  };
  prisma.$transaction = jest.fn(async (operation: (tx: any) => Promise<unknown>) => operation(prisma));
  return prisma;
}
