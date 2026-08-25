/** @jest-environment node */

import { newSessionRecordingShareJob } from "@high-ground/quipsly-media-processing";

import { getMediaBucket, requireMediaBucketName } from "@/lib/server/gcs";
import {
  mediaProcessorEnabled,
  requestMediaProcessorExecution,
} from "@/lib/server/media-processor-control";

import { ensureSessionRecordingShareCloudQueued } from "./session-recording-share-cloud";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/server/gcs", () => ({
  getMediaBucket: jest.fn(),
  requireMediaBucketName: jest.fn(),
}));
jest.mock("@/lib/server/media-processor-control", () => ({
  mediaProcessorEnabled: jest.fn(),
  mediaProcessorExecutionRequestIsRecent: jest.fn(() => false),
  requestMediaProcessorExecution: jest.fn(),
}));

const bucketName = "quipsly-private-media";
const job = newSessionRecordingShareJob({
  jobId: "session_share_server_12345678",
  roomId: "room_server_12345678",
  outputId: "output_server_12345678",
  outputRevision: 1,
  requestedAt: "2026-08-25T04:00:00.000Z",
  sourceSetSha256: "a".repeat(64),
  edit: {
    startSeconds: 0,
    endSeconds: 10,
    keptRanges: [
      { id: "range_server_12345678", startSeconds: 0, endSeconds: 10 },
    ],
    transcriptExclusions: [],
    joinCrossfadeSeconds: 0,
  },
  sources: [
    {
      recordingAssetId: "recording_server_12345678",
      participantId: "participant_server_12345678",
      participantLabel: "Coach",
      provider: "gcs",
      bucketName,
      objectName: "media-vault/recordings/room/source.m4a",
      locator: `gcs://${bucketName}/media-vault/recordings/room/source.m4a?generation=101`,
      generation: "101",
      sha256: "b".repeat(64),
      sizeBytes: 1_000,
      contentType: "audio/mp4",
      programOffsetSeconds: 0,
    },
  ],
  target: {
    provider: "gcs",
    bucketName,
    objectName:
      "media-vault/derived/session-recording-share/room_server_12345678/session_share_server_12345678.m4a",
    locator:
      "media-vault/derived/session-recording-share/room_server_12345678/session_share_server_12345678.m4a",
    contentType: "audio/mp4",
    codec: "aac-lc",
    sampleRateHz: 48_000,
    channels: 2,
  },
});

test("server commits an immutable cloud outbox before requesting the worker", async () => {
  const objects = new Map<string, { value: Buffer; generation: string }>();
  let generation = 10;
  const bucket = {
    file(name: string, options?: { generation?: string }) {
      return {
        async save(value: string) {
          if (objects.has(name))
            throw Object.assign(new Error("exists"), { code: 412 });
          objects.set(name, {
            value: Buffer.from(value),
            generation: String(++generation),
          });
        },
        async getMetadata() {
          const row = objects.get(name);
          if (
            !row ||
            (options?.generation && options.generation !== row.generation)
          )
            throw Object.assign(new Error("missing"), { code: 404 });
          return [{ generation: row.generation }];
        },
        async download() {
          return [objects.get(name)!.value];
        },
      };
    },
  };
  const workflowJob: any = {
    id: job.jobId,
    type: "session-recording-share",
    source: "session-recording-share",
    status: "queued",
    inputJson: job,
  };
  const prisma = {
    studioWorkflowJob: {
      findUnique: jest.fn(async () => workflowJob),
      update: jest.fn(async ({ data }: any) => {
        Object.assign(workflowJob, data);
        return workflowJob;
      }),
    },
  };
  jest.mocked(requireMediaBucketName).mockReturnValue(bucketName);
  jest.mocked(getMediaBucket).mockReturnValue(bucket as never);
  jest.mocked(mediaProcessorEnabled).mockReturnValue(true);
  const result = await ensureSessionRecordingShareCloudQueued({
    prisma,
    workflowJob,
  });
  expect(result.executionRequested).toBe(true);
  expect(objects.size).toBe(2);
  expect(requestMediaProcessorExecution).toHaveBeenCalledTimes(1);
  expect(
    prisma.studioWorkflowJob.update.mock.invocationCallOrder[0],
  ).toBeLessThan(
    jest.mocked(requestMediaProcessorExecution).mock.invocationCallOrder[0]!,
  );
});
