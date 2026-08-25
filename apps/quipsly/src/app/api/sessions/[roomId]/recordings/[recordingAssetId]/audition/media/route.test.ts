/** @jest-environment node */

import { Readable } from "node:stream";

import { getMediaBucket, requireMediaBucketName } from "@/lib/server/gcs";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { resolveSessionAudioAuditionBinding } from "@/lib/server/session-audio-audition";

import { GET, HEAD } from "./route";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn(() => ({})) }));
jest.mock("@/lib/server/quipsly-session", () => ({
  getQuipslySessionFromRequest: jest.fn(),
}));
jest.mock("@/lib/server/gcs", () => ({
  getMediaBucket: jest.fn(),
  requireMediaBucketName: jest.fn(),
}));
jest.mock("@/lib/server/session-audio-audition", () => ({
  SessionAudioAuditionError: class SessionAudioAuditionError extends Error {
    constructor(
      readonly status: number,
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  },
  resolveSessionAudioAuditionBinding: jest.fn(),
}));

const roomId = "room-12345678";
const recordingAssetId = "recording-12345678";
const bytes = Buffer.from("verified compact transcript audition bytes");
const outputSha = "b".repeat(64);
const sourceSha = "a".repeat(64);
const file = { getMetadata: jest.fn(), createReadStream: jest.fn() };
const bucket = { file: jest.fn(() => file) };
const context = () => ({
  params: Promise.resolve({ roomId, recordingAssetId }),
});
const request = (range?: string) =>
  new Request(
    `https://nest.quipsly.com/api/sessions/${roomId}/recordings/${recordingAssetId}/audition/media`,
    { headers: range ? { Range: range } : undefined },
  );

describe("Session audio audition media", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "coach-12345678", primaryEmail: "coach@example.com" },
    } as never);
    jest
      .mocked(requireMediaBucketName)
      .mockReturnValue("quipsly-private-media");
    jest.mocked(getMediaBucket).mockReturnValue(bucket as never);
    jest.mocked(resolveSessionAudioAuditionBinding).mockResolvedValue({
      result: {
        source: { sha256: sourceSha, generation: "101" },
        output: {
          bucketName: "quipsly-private-media",
          objectName:
            "media-vault/derived/session-audio-audition/room/recording/job.m4a",
          generation: "202",
          sizeBytes: bytes.length,
          sha256: outputSha,
          crc32c: "crc",
          contentType: "audio/mp4",
        },
      },
    } as never);
    file.getMetadata.mockResolvedValue([
      {
        generation: "202",
        size: String(bytes.length),
        contentType: "audio/mp4",
        crc32c: "crc",
        metadata: {
          quipslyOutputSha256: outputSha,
          quipslySourceSha256: sourceSha,
          quipslySourceGeneration: "101",
        },
      },
    ]);
    file.createReadStream.mockImplementation(
      (range?: { start: number; end: number }) =>
        Readable.from(
          range ? bytes.subarray(range.start, range.end + 1) : bytes,
        ),
    );
  });

  it("authenticates before resolving derivative evidence", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null as never);
    const response = await GET(request(), context());
    expect(response.status).toBe(401);
    expect(resolveSessionAudioAuditionBinding).not.toHaveBeenCalled();
  });

  it("streams only the immutable result generation with source lineage headers", async () => {
    const response = await GET(request(), context());
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    expect(response.headers.get("etag")).toBe(`"sha256-${outputSha}"`);
    expect(response.headers.get("x-quipsly-source-sha256")).toBe(sourceSha);
    expect(bucket.file).toHaveBeenCalledWith(
      "media-vault/derived/session-audio-audition/room/recording/job.m4a",
      { generation: "202" },
    );
  });

  it("supports byte ranges and metadata-only HEAD", async () => {
    const ranged = await GET(request("bytes=2-7"), context());
    expect(ranged.status).toBe(206);
    expect(Buffer.from(await ranged.arrayBuffer())).toEqual(
      bytes.subarray(2, 8),
    );
    const head = await HEAD(request(), context());
    expect(head.status).toBe(200);
    expect(head.headers.get("content-length")).toBe(String(bytes.length));
  });

  it("fails closed when stored derivative generation or size drifts", async () => {
    file.getMetadata.mockResolvedValue([
      {
        generation: "203",
        size: String(bytes.length),
        contentType: "audio/mp4",
        crc32c: "crc",
        metadata: {
          quipslyOutputSha256: outputSha,
          quipslySourceSha256: sourceSha,
          quipslySourceGeneration: "101",
        },
      },
    ]);
    const response = await GET(request(), context());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "AUDITION_OBJECT_MISMATCH",
    });
    expect(file.createReadStream).not.toHaveBeenCalled();
  });

  it("fails closed when stored derivative lineage metadata drifts", async () => {
    file.getMetadata.mockResolvedValue([
      {
        generation: "202",
        size: String(bytes.length),
        contentType: "audio/mp4",
        crc32c: "crc",
        metadata: {
          quipslyOutputSha256: "c".repeat(64),
          quipslySourceSha256: sourceSha,
          quipslySourceGeneration: "101",
        },
      },
    ]);
    const response = await GET(request(), context());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "AUDITION_OBJECT_MISMATCH",
    });
    expect(file.createReadStream).not.toHaveBeenCalled();
  });
});
