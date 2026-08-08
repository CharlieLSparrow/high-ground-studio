import {
  appendEpisodeMasterReview,
  readAuthorizedEpisodeMasterReviewSummary,
} from "./episode-master-review";
import { readCurrentLocalExecutorIdentity } from "./local-executor-storage";
import { verifyLocalRenderResult } from "./episode-render-proof";

jest.mock("server-only", () => ({}));
jest.mock("./prisma-advisory-lock", () => ({ acquirePrismaAdvisoryTransactionLock: jest.fn(async () => undefined) }));
jest.mock("./local-executor-storage", () => ({ readCurrentLocalExecutorIdentity: jest.fn() }));
jest.mock("./episode-render-proof", () => ({ verifyLocalRenderResult: jest.fn() }));
jest.mock("@high-ground/quipsly-media-processing", () => {
  const actual = jest.requireActual("@high-ground/quipsly-media-processing");
  return {
    ...actual,
    parseEpisodeMasterConformJob: jest.fn((value) => value),
    parseEpisodeMasterConformResult: jest.fn((value) => value),
  };
});

const NODE_ID = "execution_worker_master_review";
const SCOPE_ID = "storage_scope_master_review";
const outputSha = "a".repeat(64);
const job = {
  jobId: "master_conform_review_test",
  projectId: "project_master_review_test",
  episodeProductionId: "episode_master_review_test",
  manifestSha256: "b".repeat(64),
  executionTarget: { portability: "executor-local", custodianNodeId: NODE_ID, storageScopeId: SCOPE_ID },
  approval: {
    receiptId: "program_approval_master_review",
    reviewJobId: "program_render_master_review",
    branchId: "branch_master_review_test",
    branchRevision: 12,
    timelineFingerprintSha256: "c".repeat(64),
    sourceProjectionFingerprintSha256: "d".repeat(64),
    editStateFingerprintSha256: "e".repeat(64),
    reviewManifestSha256: "f".repeat(64),
  },
};
const result = {
  output: {
    locator: "/tmp/quipsly-master-review/master.mp4",
    sha256: outputSha,
    generation: `sha256:${outputSha}`,
    sizeBytes: 400_000_000,
    durationSeconds: 10,
  },
};
const registration = {
  schema: "quipsly-episode-master-conform-registration-v1",
  outputIsUnapprovedMasterCandidate: true,
  sourceId: "source_master_review_test",
  playbackUrl: "/api/ingest/media/source_master_review_test",
};

describe("Episode master review ledger", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(readCurrentLocalExecutorIdentity).mockResolvedValue({ nodeId: NODE_ID, hostName: "Wall-E", storageScopeId: SCOPE_ID } as never);
    jest.mocked(verifyLocalRenderResult).mockResolvedValue(result.output.locator as never);
  });

  it("appends an exact-output approval only after complete audible playback evidence", async () => {
    const prisma = database();
    const reviewed = await appendEpisodeMasterReview({
      prisma,
      projectSlug: "high-ground-odyssey",
      episodeSlug: "episode-9",
      jobId: job.jobId,
      actor: { userId: "user_master_review", email: "editor@example.test" },
      clientRequestId: "master_review_request_test",
      decision: "approved",
      playbackEvidence: {
        kind: "quipsly-episode-program-review-playback-evidence-v1",
        durationSeconds: 10,
        watchedSecondBins: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
        playbackStartedAt: "2026-08-08T13:00:00.000Z",
        playbackEndedAt: "2026-08-08T13:00:10.000Z",
        playthroughEnded: true,
        maximumPlaybackRate: 1,
        mutedAtDecision: false,
        volumeAtDecision: 1,
        seekCount: 0,
      },
      note: "Exact 4K candidate reviewed.",
    });
    expect(reviewed).toEqual(expect.objectContaining({ ok: true, idempotentReplay: false }));
    const data = prisma.__create.mock.calls[0][0].data;
    expect(data).toEqual(expect.objectContaining({
      renderJobId: job.jobId,
      programApprovalReceiptId: job.approval.receiptId,
      decision: "APPROVED",
      masterManifestSha256: job.manifestSha256,
      outputSha256: outputSha,
      outputGeneration: `sha256:${outputSha}`,
    }));
    expect(data.evidenceJson).toEqual(expect.objectContaining({
      approvalDoesNotUploadOrPublish: true,
      approvalPermitsOnlyLaterPromotionPlanning: true,
    }));
  });

  it("rejects a partial master playthrough before any receipt is created", async () => {
    const prisma = database();
    await expect(appendEpisodeMasterReview({
      prisma,
      projectSlug: "high-ground-odyssey",
      episodeSlug: "episode-9",
      jobId: job.jobId,
      actor: { email: "editor@example.test" },
      clientRequestId: "master_review_partial_test",
      decision: "approved",
      playbackEvidence: {
        kind: "quipsly-episode-program-review-playback-evidence-v1",
        durationSeconds: 10,
        watchedSecondBins: [0, 1],
        playbackStartedAt: "2026-08-08T13:00:00.000Z",
        playbackEndedAt: null,
        playthroughEnded: false,
        maximumPlaybackRate: 1,
        mutedAtDecision: false,
        volumeAtDecision: 1,
        seekCount: 0,
      },
    })).rejects.toMatchObject({ code: "EPISODE_MASTER_REVIEW_INCOMPLETE" });
    expect(prisma.__create).not.toHaveBeenCalled();
  });

  it("reads only a candidate with current approval, exact executor, and verified bytes", async () => {
    const prisma = database({ latestMasterReview: receipt() });
    const summary = await readAuthorizedEpisodeMasterReviewSummary({ prisma, projectSlug: "high-ground-odyssey", episodeSlug: "episode-9", jobId: job.jobId });
    expect(summary).toEqual(expect.objectContaining({ latest: expect.objectContaining({ decision: "approved", watchedFraction: 1 }) }));
    expect(verifyLocalRenderResult).toHaveBeenCalledWith(result.output.locator, outputSha, result.output.sizeBytes);
  });
});

function receipt() {
  return {
    id: "master_review_receipt_test",
    renderJobId: job.jobId,
    decision: "APPROVED",
    actorEmail: "editor@example.test",
    occurredAt: new Date("2026-08-08T13:01:00.000Z"),
    note: "Exact 4K candidate reviewed.",
    evidenceJson: { coverage: { watchedFraction: 1 } },
    requestSha256: "1".repeat(64),
  };
}

function database(options: { latestMasterReview?: any } = {}): any {
  const createdReceipt = receipt();
  const create = jest.fn(async () => createdReceipt);
  const base = {
    studioProject: { findFirst: jest.fn(async () => ({ id: job.projectId })) },
    studioEpisodeProduction: { findFirst: jest.fn(async () => ({ id: job.episodeProductionId, projectId: job.projectId })) },
    studioWorkflowJob: { findFirst: jest.fn(async () => ({ id: job.jobId, status: "completed", inputJson: job, resultJson: { receipt: result, registration } })) },
    studioEditBranch: { findUnique: jest.fn(async () => ({ headRevision: job.approval.branchRevision })) },
    studioEpisodeProgramReviewReceipt: { findFirst: jest.fn(async () => ({ id: job.approval.receiptId, decision: "APPROVED" })) },
    studioVideoSource: { findUnique: jest.fn(async () => ({ id: registration.sourceId, url: registration.playbackUrl, providerSourceId: result.output.locator })) },
    studioEpisodeMasterReviewReceipt: {
      findUnique: jest.fn(async () => null),
      findFirst: jest.fn(async () => options.latestMasterReview ?? createdReceipt),
      count: jest.fn(async ({ where }: any) => where.decision === "APPROVED" ? 1 : 0),
    },
  };
  return {
    ...base,
    __create: create,
    $transaction: jest.fn(async (callback: any) => callback({
      studioEpisodeMasterReviewReceipt: { findUnique: jest.fn(async () => null), create },
      studioEditBranch: base.studioEditBranch,
      studioWorkflowJob: { findUnique: base.studioWorkflowJob.findFirst },
      studioEpisodeProgramReviewReceipt: base.studioEpisodeProgramReviewReceipt,
    })),
  };
}
