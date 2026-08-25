/** @jest-environment node */

import { createHash } from "node:crypto";

import {
  CAPTURE_TRANSCRIPT_RESULT_KIND,
  buildCaptureTranscriptRawObjectName,
  buildCaptureTranscriptResultObjectName,
  claimCaptureTranscriptManifest,
  completeCaptureTranscriptManifest,
  newStudioSourceTranscriptJob,
  parseCaptureTranscriptManifest,
  parseStudioSourceTranscriptResult,
} from "@high-ground/quipsly-media-processing";
import { getMediaBucket } from "@/lib/server/gcs";

import {
  ensureStudioSourceTranscriptCloudQueued,
  projectStudioSourceTranscriptCloudResult,
} from "./studio-source-transcript-cloud";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/server/gcs", () => ({
  getMediaBucket: jest.fn(),
  parseGcsUri: (value: string) => {
    const match = /^gcs:\/\/([^/]+)\/(.+)\?generation=([1-9][0-9]*)$/.exec(value);
    return match ? { bucketName: match[1], objectName: match[2], generation: match[3] } : null;
  },
  toGcsUri: (bucketName: string, objectName: string, generation: string) => `gcs://${bucketName}/${objectName}?generation=${generation}`,
}));
jest.mock("googleapis", () => ({ google: { auth: { GoogleAuth: jest.fn() } } }));

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const source = {
  assetId: "studio_asset_cloud_001",
  provider: "gcs" as const,
  locator: "gcs://quipsly-test-bucket/media-vault/raw/coaching/session.wav?generation=901",
  generation: "901",
  sha256: digest("studio-cloud-source"),
  sizeBytes: 31,
  contentType: "audio/wav",
};
const job = newStudioSourceTranscriptJob({
  jobId: "studio_transcript_cloud_001",
  transcriptJobId: "transcript_cloud_001",
  projectId: "project_cloud_001",
  episodeProductionId: "episode_cloud_001",
  episodeSlug: "coaching-session-1",
  sourceId: "source_cloud_001",
  requestedByEmail: "coach@example.test",
  queuedAt: "2026-08-25T20:00:00.000Z",
  source,
  authorization: {
    kind: "participant-consent-confirmed",
    statementVersion: "quipsly-studio-transcription-authorization-v1",
    accepted: true,
    acceptedAt: "2026-08-25T19:59:00.000Z",
    acceptedByEmail: "coach@example.test",
    importRole: "phone-audio",
    purpose: "episode-production-transcription-and-review",
  },
  provider: {
    name: "deepgram",
    model: "nova-3",
    version: "latest",
    language: "en-US",
    wordTimestamps: true,
    speakerDiarization: true,
  },
});

class MemoryBucket {
  rows = new Map<string, { bytes: Buffer; generation: string }>();
  generation = 1_000;
  file = (name: string, options?: { generation?: string }) => ({
    save: async (value: string, config: any) => {
      if (config?.preconditionOpts?.ifGenerationMatch === 0 && this.rows.has(name)) throw Object.assign(new Error("exists"), { code: 412 });
      this.rows.set(name, { bytes: Buffer.from(value), generation: String(++this.generation) });
    },
    getMetadata: async () => {
      const row = this.rows.get(name);
      if (!row || (options?.generation && options.generation !== row.generation)) throw Object.assign(new Error("missing"), { code: 404 });
      return [{ generation: row.generation }];
    },
    download: async () => {
      const row = this.rows.get(name);
      if (!row || (options?.generation && options.generation !== row.generation)) throw Object.assign(new Error("missing"), { code: 404 });
      return [row.bytes];
    },
  });
  write(name: string, value: unknown) { this.rows.set(name, { bytes: Buffer.from(JSON.stringify(value)), generation: String(++this.generation) }); }
  read(name: string) { return JSON.parse(this.rows.get(name)!.bytes.toString("utf8")); }
}

function createPrisma() {
  let processing: any = { id: job.jobId, status: "queued", inputJson: job, resultJson: null, error: null };
  let transcript: any = {
    id: job.transcriptJobId,
    studioMediaAssetId: job.source.assetId,
    episodeProductionId: job.episodeProductionId,
    status: "QUEUED",
    resultJson: {},
    startedAt: null,
    errorMessage: null,
  };
  const prisma: any = {
    studioAssetProcessingJob: {
      update: jest.fn(async ({ data }) => (processing = { ...processing, ...data })),
      findUnique: jest.fn(async () => processing),
    },
    transcriptJob: {
      findUnique: jest.fn(async () => transcript),
      update: jest.fn(async ({ data }) => (transcript = { ...transcript, ...data })),
    },
    $transaction: jest.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
    currentProcessing: () => processing,
    currentTranscript: () => transcript,
  };
  return prisma;
}

describe("Studio source transcript cloud adapter", () => {
  const originalEnabled = process.env.QUIPSLY_TRANSCRIPT_WORKER_ENABLED;
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.QUIPSLY_TRANSCRIPT_WORKER_ENABLED = "0";
  });
  afterAll(() => {
    if (originalEnabled == null) delete process.env.QUIPSLY_TRANSCRIPT_WORKER_ENABLED;
    else process.env.QUIPSLY_TRANSCRIPT_WORKER_ENABLED = originalEnabled;
  });

  it("creates one replay-safe manifest with an explicit Studio subject and visible configuration hold", async () => {
    const bucket = new MemoryBucket();
    const prisma = createPrisma();
    jest.mocked(getMediaBucket).mockReturnValue(bucket as never);

    const first = await ensureStudioSourceTranscriptCloudQueued({ prisma, processingJob: prisma.currentProcessing(), actorUserId: "coach_user_001" });
    expect(first).toMatchObject({ status: "configuration-required", executionRequested: false });
    const control = prisma.currentProcessing().resultJson.cloudControl;
    const manifestGeneration = bucket.rows.get(control.manifestObjectName)?.generation;
    const queueGeneration = bucket.rows.get(control.queueObjectName)?.generation;
    const manifest = parseCaptureTranscriptManifest(bucket.read(control.manifestObjectName), job.transcriptJobId);
    expect(manifest.source.subject).toEqual({
      kind: "studio-media",
      projectId: job.projectId,
      episodeProductionId: job.episodeProductionId,
      studioMediaAssetId: job.source.assetId,
      sourceId: job.sourceId,
    });
    expect(control.configurationRequired).toBe(true);

    await ensureStudioSourceTranscriptCloudQueued({ prisma, processingJob: prisma.currentProcessing(), actorUserId: "coach_user_001" });
    expect(bucket.rows.get(control.manifestObjectName)?.generation).toBe(manifestGeneration);
    expect(bucket.rows.get(control.queueObjectName)?.generation).toBe(queueGeneration);
  });

  it("converts the shared worker receipt into Studio word-clock evidence without losing speaker attribution", async () => {
    const bucket = new MemoryBucket();
    const prisma = createPrisma();
    jest.mocked(getMediaBucket).mockReturnValue(bucket as never);
    await ensureStudioSourceTranscriptCloudQueued({ prisma, processingJob: prisma.currentProcessing(), actorUserId: "coach_user_001" });
    const control = prisma.currentProcessing().resultJson.cloudControl;
    const queued = parseCaptureTranscriptManifest(bucket.read(control.manifestObjectName), job.transcriptJobId);
    const claimed = claimCaptureTranscriptManifest({ manifest: queued, leaseId: "lease_cloud_001", executionId: "execution_cloud_001", now: new Date("2026-08-25T20:01:00.000Z"), leaseDurationMs: 60_000 })!;
    const rawObjectName = buildCaptureTranscriptRawObjectName(job.transcriptJobId);
    const raw = Buffer.from("{\"provider\":\"evidence\"}");
    const result: any = {
      kind: CAPTURE_TRANSCRIPT_RESULT_KIND,
      version: 1,
      jobId: job.transcriptJobId,
      manifestObjectName: control.manifestObjectName,
      source: claimed.source,
      provider: { name: "deepgram", model: "nova-3", requestId: "request_cloud_001", durationSeconds: 1.2, channels: 1 },
      rawProviderResponse: { bucketName: "quipsly-test-bucket", objectName: rawObjectName, generation: "1005", sizeBytes: raw.length, sha256: createHash("sha256").update(raw).digest("hex"), contentType: "application/json" },
      segments: [{ ordinal: 0, startSeconds: 0.1, endSeconds: 1.1, text: "Hello Homer.", confidence: 0.94, speakerLabel: "Speaker 0", channel: 0, providerShape: "deepgram-utterance", wordStartIndex: 0, wordEndIndexExclusive: 2 }],
      words: [
        { index: 0, startSeconds: 0.1, endSeconds: 0.5, word: "Hello", punctuatedWord: "Hello", confidence: 0.96, speakerLabel: "Speaker 0", channel: 0 },
        { index: 1, startSeconds: 0.55, endSeconds: 1.1, word: "Homer", punctuatedWord: "Homer.", confidence: 0.92, speakerLabel: "Speaker 0", channel: 0 },
      ],
      worker: { executionId: "execution_cloud_001", buildId: "worker-build-001", imageDigest: "sha256:worker" },
      completedAt: "2026-08-25T20:02:00.000Z",
    };
    const completed = completeCaptureTranscriptManifest({ manifest: claimed, leaseId: "lease_cloud_001", result, now: new Date(result.completedAt) });
    bucket.write(control.manifestObjectName, completed);
    bucket.write(buildCaptureTranscriptResultObjectName(job.transcriptJobId), result);

    const projected = await projectStudioSourceTranscriptCloudResult({ prisma, processingJob: prisma.currentProcessing() });
    expect(projected.status).toBe("output-ready");
    const receipt = parseStudioSourceTranscriptResult(projected.resultJson.receipt, job);
    expect(receipt.provider.name).toBe("deepgram");
    expect(receipt.provider.capabilities.speakerDiarization).toBe("provider");
    expect(receipt.coverage.speakerLabeledWordCount).toBe(2);
    expect(receipt.words.map((word) => word.segmentOrdinal)).toEqual([0, 0]);
    expect(prisma.currentTranscript()).toMatchObject({ providerRequestId: "request_cloud_001", workerBuildId: "worker-build-001" });
  });
});
