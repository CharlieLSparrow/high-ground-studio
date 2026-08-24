/** @jest-environment node */

import { Readable } from "node:stream";

import { getPrismaClient } from "@/lib/prisma";
import { getMediaBucket, requireMediaBucketName } from "@/lib/server/gcs";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { GET, HEAD } from "./route";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({
  getQuipslySessionFromRequest: jest.fn(),
}));
jest.mock("@/lib/server/gcs", () => ({
  getMediaBucket: jest.fn(),
  requireMediaBucketName: jest.fn(),
}));

const roomId = "room-coaching-1";
const recordingAssetId = "recording-asset-1";
const generation = "1742";
const sha256 = "a".repeat(64);
const bytes = Buffer.from("verified session audio");

const prisma = {
  callRoom: { findFirst: jest.fn() },
  mobileCaptureFinalizationReceipt: { findFirst: jest.fn() },
};
const file = {
  getMetadata: jest.fn(),
  createReadStream: jest.fn(),
};
const bucket = { file: jest.fn() };

function context() {
  return { params: Promise.resolve({ roomId, recordingAssetId }) };
}

function request(range?: string) {
  return new Request(
    `http://127.0.0.1:3012/api/sessions/${roomId}/recordings/${recordingAssetId}/media`,
    { headers: range ? { Range: range } : undefined },
  );
}

function accessibleRoom() {
  return {
    id: roomId,
    recordingAssets: [
      {
        id: recordingAssetId,
        roomId,
        status: "VERIFIED",
        contentType: "audio/mp4",
        byteSize: BigInt(bytes.length),
        storageBucket: "quipsly-private-media",
        storageObjectPath: "mobile/room-coaching-1/session-audio.m4a",
        checksum: sha256,
        verifiedAt: new Date("2026-08-24T12:00:00.000Z"),
        localManifestJson: {
          exactBytesVerified: true,
          storageGeneration: generation,
        },
      },
    ],
  };
}

function releasedReceipt() {
  return {
    roomId,
    recordingAssetId,
    processingDisposition: "RELEASED",
    metadataJson: {
      immutableUploadBinding: {
        roomId,
        sha256,
        bucketName: "quipsly-private-media",
        objectName: "mobile/room-coaching-1/session-audio.m4a",
        generation,
        sizeBytes: bytes.length,
      },
    },
  };
}

describe("Session protected recording media", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: {
        id: "coach-1",
        primaryEmail: "coach@example.test",
        isStaff: false,
      },
    } as never);
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);
    jest
      .mocked(requireMediaBucketName)
      .mockReturnValue("quipsly-private-media");
    jest.mocked(getMediaBucket).mockReturnValue(bucket as never);
    prisma.callRoom.findFirst.mockResolvedValue(accessibleRoom());
    prisma.mobileCaptureFinalizationReceipt.findFirst.mockResolvedValue(
      releasedReceipt(),
    );
    bucket.file.mockReturnValue(file);
    file.getMetadata.mockResolvedValue([
      { size: String(bytes.length), generation, contentType: "audio/mp4" },
    ]);
    file.createReadStream.mockImplementation(
      (range?: { start: number; end: number }) =>
        Readable.from(
          range ? bytes.subarray(range.start, range.end + 1) : bytes,
        ),
    );
  });

  it("authenticates before reading private Session state", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null as never);
    const response = await GET(request(), context());
    expect(response.status).toBe(401);
    expect(prisma.callRoom.findFirst).not.toHaveBeenCalled();
  });

  it("does not disclose an inaccessible Session or mismatched asset", async () => {
    prisma.callRoom.findFirst.mockResolvedValue(null);
    const response = await GET(request(), context());
    expect(response.status).toBe(404);
    expect(
      prisma.mobileCaptureFinalizationReceipt.findFirst,
    ).not.toHaveBeenCalled();
    expect(getMediaBucket).not.toHaveBeenCalled();
  });

  it("does not stream a held source", async () => {
    prisma.mobileCaptureFinalizationReceipt.findFirst.mockResolvedValue({
      ...releasedReceipt(),
      processingDisposition: "HELD",
    });
    const response = await GET(request(), context());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "SOURCE_NOT_RELEASED",
    });
    expect(getMediaBucket).not.toHaveBeenCalled();
  });

  it("fails closed when the immutable receipt drifts from the RecordingAsset", async () => {
    prisma.mobileCaptureFinalizationReceipt.findFirst.mockResolvedValue({
      ...releasedReceipt(),
      metadataJson: {
        immutableUploadBinding: {
          ...releasedReceipt().metadataJson.immutableUploadBinding,
          sha256: "b".repeat(64),
        },
      },
    });
    const response = await GET(request(), context());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "SOURCE_EVIDENCE_MISMATCH",
    });
    expect(getMediaBucket).not.toHaveBeenCalled();
  });

  it("streams the exact immutable generation without requiring a Studio project", async () => {
    const response = await GET(request(), context());
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("cache-control")).toBe("private, max-age=120");
    expect(response.headers.get("etag")).toBe(`"sha256-${sha256}"`);
    expect(response.headers.get("vary")).toBe("Authorization, Cookie");
    expect(bucket.file).toHaveBeenCalledWith(
      "mobile/room-coaching-1/session-audio.m4a",
      { generation },
    );
    expect(prisma.callRoom.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          recordingAssets: expect.any(Object),
        }),
      }),
    );
    expect(accessibleRoom()).not.toHaveProperty("project");
  });

  it("preserves playback compatibility with an audited recovery generation", async () => {
    const receipt = releasedReceipt();
    delete (receipt.metadataJson.immutableUploadBinding as any).generation;
    (receipt.metadataJson as any).recoveryAuthority = {
      durableCaptureReplica: {
        bucketName: "quipsly-private-media",
        objectName: "mobile/room-coaching-1/session-audio.m4a",
        generation,
      },
    };
    prisma.mobileCaptureFinalizationReceipt.findFirst.mockResolvedValue(
      receipt,
    );

    const response = await GET(request(), context());
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    expect(bucket.file).toHaveBeenCalledWith(
      "mobile/room-coaching-1/session-audio.m4a",
      { generation },
    );
  });

  it("serves standards-compliant byte ranges and rejects invalid ranges", async () => {
    const ranged = await GET(request("bytes=2-8"), context());
    expect(ranged.status).toBe(206);
    expect(ranged.headers.get("content-range")).toBe(
      `bytes 2-8/${bytes.length}`,
    );
    expect(Buffer.from(await ranged.arrayBuffer())).toEqual(
      bytes.subarray(2, 9),
    );

    const invalid = await GET(request(`bytes=${bytes.length}-`), context());
    expect(invalid.status).toBe(416);
    expect(invalid.headers.get("content-range")).toBe(
      `bytes */${bytes.length}`,
    );
  });

  it("supports metadata-only HEAD without opening a media stream", async () => {
    const response = await HEAD(request(), context());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-length")).toBe(String(bytes.length));
    expect(file.createReadStream).not.toHaveBeenCalled();
  });
});
