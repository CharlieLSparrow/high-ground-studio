/** @jest-environment node */

import { createHash } from "node:crypto";
import { buildAudioTreatmentTargetLocator, newAudioTreatmentJob } from "@high-ground/quipsly-media-processing";
import { getMediaBucket } from "@/lib/server/gcs";
import { mediaProcessorEnabled, mediaProcessorExecutionRequestIsRecent, requestMediaProcessorExecution } from "@/lib/server/media-processor-control";
import { ensureAudioTreatmentCloudQueued } from "./audio-treatment-cloud";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/server/gcs", () => ({ getMediaBucket: jest.fn() }));
jest.mock("@/lib/server/media-processor-control", () => ({ mediaProcessorEnabled: jest.fn(), mediaProcessorExecutionRequestIsRecent: jest.fn(), requestMediaProcessorExecution: jest.fn() }));

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const source = { assetId: "asset_treatment_outbox", provider: "gcs" as const, locator: "gcs://quipsly-test-bucket/media-vault/raw/treatment.wav?generation=601", generation: "601", sha256: digest("treatment-cloud-outbox-source"), sizeBytes: 29, contentType: "audio/wav" };
const job = newAudioTreatmentJob({
  jobId: "audio_treatment_outbox123",
  projectId: "project_treatment_outbox",
  requestedByEmail: "engineer@example.test",
  queuedAt: "2026-08-25T18:00:00.000Z",
  source,
  triggerDiagnosisId: "diagnosis_treatment_outbox",
  profileId: "dc-rumble-correction-v1",
  target: { provider: "gcs", locator: buildAudioTreatmentTargetLocator({ assetId: source.assetId, sourceSha256: source.sha256, profileId: "dc-rumble-correction-v1" }), contentType: "audio/wav", codec: "pcm_s24le", sampleRateHz: 48_000, variantKind: "audio-treatment-preview" },
});

class MemoryBucket {
  rows = new Map<string, { bytes: Buffer; generation: string; metadata: Record<string, unknown> }>();
  generation = 700;
  file = (name: string, options?: { generation?: string }) => ({
    save: async (value: string, config: any) => { if (config?.preconditionOpts?.ifGenerationMatch === 0 && this.rows.has(name)) throw Object.assign(new Error("exists"), { code: 412 }); const generation = String(++this.generation); this.rows.set(name, { bytes: Buffer.from(value), generation, metadata: config?.metadata?.metadata ?? {} }); },
    getMetadata: async () => { const row = this.rows.get(name); if (!row || (options?.generation && options.generation !== row.generation)) throw Object.assign(new Error("missing"), { code: 404 }); return [{ generation: row.generation, metadata: row.metadata }]; },
    download: async () => { const row = this.rows.get(name); if (!row || (options?.generation && options.generation !== row.generation)) throw Object.assign(new Error("missing"), { code: 404 }); return [row.bytes]; },
  });
}
function createPrisma() {
  let row: any = { id: job.jobId, projectId: job.projectId, assetId: job.source.assetId, type: "audio-treatment", status: "queued", error: null, inputJson: job };
  return { studioAssetProcessingJob: { update: jest.fn(async ({ data }) => { row = { ...row, ...data, inputJson: data.inputJson ?? row.inputJson }; return row; }) }, current: () => row };
}

describe("audio treatment cloud outbox", () => {
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
    const status = await ensureAudioTreatmentCloudQueued({ prisma, processingJob: prisma.current() });
    expect(status).toMatchObject({ status: "queued", bucketName: "quipsly-test-bucket", executionRequested: true });
    expect(bucket.rows.has(status.manifestObjectName)).toBe(true);
    expect(bucket.rows.has(status.queueObjectName)).toBe(true);
    expect(prisma.current().inputJson.processingControl).toMatchObject({ sourceGeneration: source.generation, sourceSha256: source.sha256, targetObjectName: job.target.locator, originalRemainsSourceTruth: true, promotionRequiresExplicitApproval: true });
  });
  it("replays create-once state without replacing its manifest or queue", async () => {
    const bucket = new MemoryBucket();
    const prisma = createPrisma();
    jest.mocked(getMediaBucket).mockReturnValue(bucket as never);
    const first = await ensureAudioTreatmentCloudQueued({ prisma, processingJob: prisma.current() });
    const manifestGeneration = bucket.rows.get(first.manifestObjectName)?.generation;
    const queueGeneration = bucket.rows.get(first.queueObjectName)?.generation;
    jest.mocked(mediaProcessorExecutionRequestIsRecent).mockReturnValue(true);
    const replay = await ensureAudioTreatmentCloudQueued({ prisma, processingJob: prisma.current() });
    expect(replay.executionRequested).toBe(false);
    expect(bucket.rows.get(first.manifestObjectName)?.generation).toBe(manifestGeneration);
    expect(bucket.rows.get(first.queueObjectName)?.generation).toBe(queueGeneration);
    expect(requestMediaProcessorExecution).toHaveBeenCalledTimes(1);
  });
});
