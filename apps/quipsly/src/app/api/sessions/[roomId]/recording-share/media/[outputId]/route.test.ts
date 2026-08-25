/** @jest-environment node */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { getPrismaClient } from "@/lib/prisma";
import {
  loadLocalMobileCaptureObject,
  MOBILE_CAPTURE_LOCAL_VAULT_BUCKET,
} from "@/lib/server/mobile-capture-local-vault";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import {
  authorizeSessionRecordingShareMedia,
} from "@/lib/server/session-recording-share";

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
jest.mock("@/lib/server/mobile-capture-local-vault", () => ({
  MOBILE_CAPTURE_LOCAL_VAULT_BUCKET: "quipsly-local-development-vault",
  loadLocalMobileCaptureObject: jest.fn(),
}));
jest.mock("@/lib/server/session-recording-share", () => ({
  authorizeSessionRecordingShareMedia: jest.fn(),
  SessionRecordingShareError: class SessionRecordingShareError extends Error {
    constructor(
      readonly status: number,
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));

const roomId = "session_room_stream_0001";
const outputId = "session_output_stream_0001";
const generation = "1787690000000";
const sha256 = "e".repeat(64);
const bytes = Buffer.from("verified private coaching video bytes");
let directory = "";
let objectPath = "";

function context() {
  return { params: Promise.resolve({ roomId, outputId }) };
}

function request(range?: string) {
  return new Request(
    `http://127.0.0.1:3012/api/sessions/${roomId}/recording-share/media/${outputId}`,
    { headers: range ? { Range: range } : undefined },
  );
}

describe("Session recording-share private media", () => {
  beforeAll(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "quipsly-share-stream-test-"));
    objectPath = path.join(directory, "reviewed.mp4");
    await writeFile(objectPath, bytes);
  });

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "coach_stream_0001", primaryEmail: "coach@example.test" },
    } as never);
    jest.mocked(getPrismaClient).mockReturnValue({} as never);
    jest.mocked(authorizeSessionRecordingShareMedia).mockResolvedValue({
      id: "recording_asset_stream_0001",
      fileName: "Coaching-session-reviewed-r2.mp4",
      contentType: "video/mp4",
      byteSize: BigInt(bytes.length),
      checksum: sha256,
      storageBucket: MOBILE_CAPTURE_LOCAL_VAULT_BUCKET,
      storageObjectPath: "session-exports/room/reviewed.mp4",
      storageGeneration: generation,
    } as never);
    jest.mocked(loadLocalMobileCaptureObject).mockResolvedValue({
      objectPath,
      generation,
      sizeBytes: bytes.length,
      contentType: "video/mp4",
      createdAt: "2026-08-25T23:00:00.000Z",
      customMetadata: {
        quipslyKind: "session-recording-share-v3",
        quipslyExpectedSha256: sha256,
        quipslyExpectedSizeBytes: String(bytes.length),
      },
    });
  });

  it("authenticates before authorizing private output", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null as never);
    const response = await GET(request(), context());
    expect(response.status).toBe(401);
    expect(authorizeSessionRecordingShareMedia).not.toHaveBeenCalled();
  });

  it("streams a confined local video range instead of buffering the whole output", async () => {
    const response = await GET(request("bytes=9-22"), context());
    expect(response.status).toBe(206);
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(response.headers.get("content-range")).toBe(
      `bytes 9-22/${bytes.length}`,
    );
    expect(response.headers.get("content-disposition")).toContain(
      "Coaching-session-reviewed-r2.mp4",
    );
    expect(Buffer.from(await response.arrayBuffer())).toEqual(
      bytes.subarray(9, 23),
    );
    expect(loadLocalMobileCaptureObject).toHaveBeenCalledWith(
      "session-exports/room/reviewed.mp4",
    );
  });

  it("fails closed when the local generation or hash receipt drifts", async () => {
    jest.mocked(loadLocalMobileCaptureObject).mockResolvedValue({
      objectPath,
      generation: "1787690000001",
      sizeBytes: bytes.length,
      contentType: "video/mp4",
      createdAt: "2026-08-25T23:00:00.000Z",
      customMetadata: {
        quipslyKind: "session-recording-share-v3",
        quipslyExpectedSha256: "f".repeat(64),
        quipslyExpectedSizeBytes: String(bytes.length),
      },
    });
    const response = await GET(request(), context());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "RECORDING_SHARE_OBJECT_MISMATCH",
    });
  });

  it("answers HEAD from the immutable receipt without opening the file body", async () => {
    const response = await HEAD(request(), context());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-length")).toBe(String(bytes.length));
    expect((await response.arrayBuffer()).byteLength).toBe(0);
  });
});
