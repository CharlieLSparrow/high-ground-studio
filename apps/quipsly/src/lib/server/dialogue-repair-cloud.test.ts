/** @jest-environment node */

import { createHash } from "node:crypto";
import {
  buildDialogueRepairTargetLocator,
  newDialogueRepairCandidate,
  newDialogueRepairJob,
  newDialogueRepairProposal,
  newDialogueRepairReviewReceipt,
} from "@high-ground/quipsly-media-processing";

import { getMediaBucket } from "@/lib/server/gcs";
import {
  mediaProcessorEnabled,
  mediaProcessorExecutionRequestIsRecent,
  requestMediaProcessorExecution,
} from "@/lib/server/media-processor-control";

import { ensureDialogueRepairCloudQueued } from "./dialogue-repair-cloud";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/server/gcs", () => ({ getMediaBucket: jest.fn() }));
jest.mock("@/lib/server/media-processor-control", () => ({
  mediaProcessorEnabled: jest.fn(),
  mediaProcessorExecutionRequestIsRecent: jest.fn(),
  requestMediaProcessorExecution: jest.fn(),
}));

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const source = {
  assetId: "asset_cloud_outbox",
  provider: "gcs" as const,
  locator: "gcs://quipsly-test-bucket/media-vault/raw/coaching.wav?generation=401",
  generation: "401",
  sha256: digest("dialogue-cloud-outbox-source"),
  sizeBytes: 31,
  contentType: "audio/wav",
};
const candidate = newDialogueRepairCandidate({
  candidateId: "candidate_cloud_outbox",
  createdAt: "2026-08-25T18:00:00.000Z",
  createdByEmail: "coach@example.test",
  label: "mouth-click",
  source,
  range: { startSeconds: 4, endSeconds: 4.03, auditionPreRollSeconds: 1.5, auditionPostRollSeconds: 1.5, sourceDurationSeconds: 12 },
  origin: { kind: "human-marked" },
  context: { speakerId: null, speakerLabel: "Coach", transcriptWordAnchors: [] },
});
const review = newDialogueRepairReviewReceipt({
  receiptId: "review_cloud_outbox",
  occurredAt: "2026-08-25T18:01:00.000Z",
  actorEmail: "coach@example.test",
  decision: "confirmed",
  candidate,
  evidence: {
    protectedPlaybackSourceId: "source_cloud_outbox",
    contextStartSeconds: 2.5,
    contextEndSeconds: 5.53,
    listenedSecondBins: [2, 3, 4, 5],
    clientTrackedPlaybackIsNotProofOfAudibility: true,
  },
});
const proposal = newDialogueRepairProposal({ proposalId: "proposal_cloud_outbox", createdAt: "2026-08-25T18:02:00.000Z", candidate, reviewReceipt: review });
const job = newDialogueRepairJob({
  jobId: "dialogue_repair_outbox123",
  projectId: "project_cloud_outbox",
  requestedByEmail: "coach@example.test",
  queuedAt: "2026-08-25T18:03:00.000Z",
  source,
  proposal,
  target: {
    provider: "gcs",
    locator: buildDialogueRepairTargetLocator({ assetId: source.assetId, sourceSha256: source.sha256, candidateId: candidate.candidateId, range: candidate.range }),
    contentType: "audio/wav",
    codec: "pcm_s24le",
    sampleRateHz: 48_000,
    variantKind: "dialogue-repair-preview",
  },
});

class MemoryBucket {
  rows = new Map<string, { bytes: Buffer; generation: string; metadata: Record<string, unknown> }>();
  generation = 500;

  file = (name: string, options?: { generation?: string }) => ({
    save: async (value: string, config: any) => {
      if (config?.preconditionOpts?.ifGenerationMatch === 0 && this.rows.has(name)) throw Object.assign(new Error("exists"), { code: 412 });
      const generation = String(++this.generation);
      this.rows.set(name, { bytes: Buffer.from(value), generation, metadata: config?.metadata?.metadata ?? {} });
    },
    getMetadata: async () => {
      const row = this.rows.get(name);
      if (!row || (options?.generation && options.generation !== row.generation)) throw Object.assign(new Error("missing"), { code: 404 });
      return [{ generation: row.generation, metadata: row.metadata }];
    },
    download: async () => {
      const row = this.rows.get(name);
      if (!row || (options?.generation && options.generation !== row.generation)) throw Object.assign(new Error("missing"), { code: 404 });
      return [row.bytes];
    },
  });
}

function createPrisma() {
  let row: any = {
    id: job.jobId,
    projectId: job.projectId,
    assetId: job.source.assetId,
    type: "dialogue-repair",
    status: "queued",
    error: null,
    inputJson: job,
  };
  return {
    studioAssetProcessingJob: {
      update: jest.fn(async ({ data }) => {
        row = { ...row, ...data, inputJson: data.inputJson ?? row.inputJson };
        return row;
      }),
    },
    current: () => row,
  };
}

describe("Dialogue Repair cloud outbox", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(mediaProcessorEnabled).mockReturnValue(true);
    jest.mocked(mediaProcessorExecutionRequestIsRecent).mockReturnValue(false);
    jest.mocked(requestMediaProcessorExecution).mockResolvedValue(undefined as never);
  });

  it("creates immutable control objects and requests one processor execution", async () => {
    const bucket = new MemoryBucket();
    const prisma = createPrisma();
    jest.mocked(getMediaBucket).mockReturnValue(bucket as never);

    const status = await ensureDialogueRepairCloudQueued({ prisma, processingJob: prisma.current() });

    expect(status).toMatchObject({ status: "queued", jobId: job.jobId, bucketName: "quipsly-test-bucket", executionRequested: true });
    expect(bucket.rows.has(status.manifestObjectName)).toBe(true);
    expect(bucket.rows.has(status.queueObjectName)).toBe(true);
    expect(requestMediaProcessorExecution).toHaveBeenCalledTimes(1);
    expect(prisma.current().inputJson.processingControl).toMatchObject({
      sourceGeneration: source.generation,
      sourceSha256: source.sha256,
      targetObjectName: job.target.locator,
      originalRemainsSourceTruth: true,
      matchedAuditionRequired: true,
      promotionRequiresSeparateApproval: true,
    });
  });

  it("replays create-once control state without replacing its manifest or queue", async () => {
    const bucket = new MemoryBucket();
    const prisma = createPrisma();
    jest.mocked(getMediaBucket).mockReturnValue(bucket as never);
    const first = await ensureDialogueRepairCloudQueued({ prisma, processingJob: prisma.current() });
    const manifestGeneration = bucket.rows.get(first.manifestObjectName)?.generation;
    const queueGeneration = bucket.rows.get(first.queueObjectName)?.generation;
    jest.mocked(mediaProcessorExecutionRequestIsRecent).mockReturnValue(true);

    const replay = await ensureDialogueRepairCloudQueued({ prisma, processingJob: prisma.current() });

    expect(replay.executionRequested).toBe(false);
    expect(bucket.rows.get(first.manifestObjectName)?.generation).toBe(manifestGeneration);
    expect(bucket.rows.get(first.queueObjectName)?.generation).toBe(queueGeneration);
    expect(requestMediaProcessorExecution).toHaveBeenCalledTimes(1);
  });
});
