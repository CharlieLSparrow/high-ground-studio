/** @jest-environment node */

import { getMediaBucket, requireMediaBucketName } from "@/lib/server/gcs";
import { mediaProcessorEnabled } from "@/lib/server/media-processor-control";
import { sessionAccessWhere } from "@/lib/server/session-access";
import { sessionProtectedPlaybackBinding } from "@/lib/server/session-protected-playback";

import {
  SessionAudioAuditionError,
  prepareSessionAudioAudition,
  reconcileSessionAudioAudition,
} from "./session-audio-audition";

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
jest.mock("@/lib/server/session-access", () => ({
  sessionAccessWhere: jest.fn(() => ({ id: "room-12345678" })),
}));
jest.mock("@/lib/server/session-protected-playback", () => ({
  sessionProtectedPlaybackBinding: jest.fn(),
}));

const roomId = "room-12345678";
const recordingAssetId = "recording-12345678";
const sourceSha = "a".repeat(64);
const source = {
  id: recordingAssetId,
  roomId,
  status: "VERIFIED",
  contentType: "video/mp4",
  byteSize: BigInt(4_000_000_000),
  durationSeconds: 3600,
  storageBucket: "quipsly-private-media",
  storageObjectPath: "media-vault/recordings/coaching/camera.mp4",
  checksum: sourceSha,
  verifiedAt: new Date("2026-08-25T01:00:00.000Z"),
  localManifestJson: {},
};
const receipt = {
  roomId,
  recordingAssetId,
  uploadSessionId: "123e4567-e89b-12d3-a456-426614174000",
  processingDisposition: "RELEASED",
  metadataJson: {},
};

describe("Session audio audition durable outbox", () => {
  let prisma: ReturnType<typeof fakePrisma>;
  let storage: ReturnType<typeof fakeBucket>;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = fakePrisma();
    storage = fakeBucket();
    jest.mocked(getMediaBucket).mockReturnValue(storage.bucket as never);
    jest
      .mocked(requireMediaBucketName)
      .mockReturnValue("quipsly-private-media");
    jest.mocked(mediaProcessorEnabled).mockReturnValue(false);
    jest.mocked(sessionProtectedPlaybackBinding).mockReturnValue({
      schema: "quipsly-session-protected-playback-v1",
      roomId,
      recordingAssetId,
      url: `/api/sessions/${roomId}/recordings/${recordingAssetId}/media`,
      sha256: sourceSha,
      byteSize: 4_000_000_000,
      bucketName: "quipsly-private-media",
      objectName: "media-vault/recordings/coaching/camera.mp4",
      generation: "101",
      contentType: "video/mp4",
      kind: "video",
    });
  });

  it("commits one deterministic Session job before a create-once GCS outbox", async () => {
    const first = await prepareSessionAudioAudition({
      prisma: prisma.client,
      roomId,
      recordingAssetId,
      actor: { id: "coach-12345678", primaryEmail: "coach@example.com" },
    });
    expect(first).toMatchObject({
      state: "HELD",
      recordingAssetId,
      derivative: null,
    });
    expect(prisma.created).toHaveLength(1);
    expect(storage.objects.size).toBe(2);
    const row = prisma.created[0];
    expect(row.inputJson).toMatchObject({
      roomId,
      source: {
        recordingAssetId,
        generation: "101",
        sha256: sourceSha,
        durationSeconds: 3600,
      },
      originalRemainsSourceTruth: true,
    });
    expect([...storage.objects.keys()]).toEqual(
      expect.arrayContaining([
        expect.stringContaining("/manifests/"),
        expect.stringContaining("/queue/"),
      ]),
    );

    const replay = await prepareSessionAudioAudition({
      prisma: prisma.client,
      roomId,
      recordingAssetId,
      actor: { id: "other-12345678", primaryEmail: "other@example.com" },
    });
    expect(replay.jobId).toBe(first.jobId);
    expect(prisma.created).toHaveLength(1);
    expect(storage.objects.size).toBe(2);
  });

  it("revalidates duration and exact source binding before readback", async () => {
    const prepared = await prepareSessionAudioAudition({
      prisma: prisma.client,
      roomId,
      recordingAssetId,
      actor: { id: "coach-12345678", primaryEmail: "coach@example.com" },
    });
    prisma.asset.durationSeconds = 3601;
    await expect(
      reconcileSessionAudioAudition({
        prisma: prisma.client,
        roomId,
        recordingAssetId,
        actor: { id: "coach-12345678", primaryEmail: "coach@example.com" },
      }),
    ).rejects.toMatchObject<Partial<SessionAudioAuditionError>>({
      code: "AUDITION_SOURCE_CHANGED",
      status: 409,
    });
    expect(prepared.jobId).toBeTruthy();
  });

  it("applies Session access before creating any derivative state", async () => {
    prisma.room = null;
    await expect(
      prepareSessionAudioAudition({
        prisma: prisma.client,
        roomId,
        recordingAssetId,
        actor: {
          id: "outsider-12345678",
          primaryEmail: "outsider@example.com",
        },
      }),
    ).rejects.toMatchObject<Partial<SessionAudioAuditionError>>({
      code: "SOURCE_NOT_FOUND",
      status: 404,
    });
    expect(sessionAccessWhere).toHaveBeenCalled();
    expect(prisma.created).toHaveLength(0);
    expect(storage.objects.size).toBe(0);
  });
});

function fakePrisma() {
  const rows = new Map<string, any>();
  const created: any[] = [];
  const asset = structuredClone(source);
  const state: any = { room: { id: roomId, recordingAssets: [asset] }, asset };
  const client = {
    callRoom: {
      findFirst: jest.fn(async () =>
        state.room ? { ...state.room, recordingAssets: [state.asset] } : null,
      ),
    },
    mobileCaptureFinalizationReceipt: {
      findFirst: jest.fn(async () => receipt),
    },
    sessionAudioAuditionJob: {
      findUnique: jest.fn(async ({ where }: any) => rows.get(where.id) ?? null),
      findFirst: jest.fn(async ({ where }: any) => {
        const row = rows.get(where.id);
        return row &&
          row.roomId === where.roomId &&
          row.recordingAssetId === where.recordingAssetId
          ? row
          : null;
      }),
      create: jest.fn(async ({ data }: any) => {
        const row = {
          ...structuredClone(data),
          createdAt: new Date(),
          updatedAt: new Date(),
          resultJson: null,
          error: null,
        };
        rows.set(row.id, row);
        created.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = rows.get(where.id);
        if (!row) throw new Error("missing row");
        Object.assign(row, structuredClone(data), { updatedAt: new Date() });
        return row;
      }),
    },
  };
  return {
    client,
    rows,
    created,
    get room() {
      return state.room;
    },
    set room(value) {
      state.room = value;
    },
    asset: state.asset,
  };
}

function fakeBucket() {
  const objects = new Map<
    string,
    { value: Buffer; generation: string; contentType: string }
  >();
  const file = (name: string, options?: { generation?: string }) => ({
    async save(value: string, config: any) {
      if (
        objects.has(name) &&
        Number(config?.preconditionOpts?.ifGenerationMatch) === 0
      )
        throw Object.assign(new Error("exists"), { code: 412 });
      objects.set(name, {
        value: Buffer.from(value),
        generation: "1",
        contentType: config?.contentType || "application/json",
      });
    },
    async getMetadata() {
      const row = objects.get(name);
      if (
        !row ||
        (options?.generation && options.generation !== row.generation)
      )
        throw Object.assign(new Error("not found"), { code: 404 });
      return [
        {
          generation: row.generation,
          size: String(row.value.length),
          contentType: row.contentType,
        },
      ];
    },
    async download() {
      const row = objects.get(name);
      if (
        !row ||
        (options?.generation && options.generation !== row.generation)
      )
        throw Object.assign(new Error("not found"), { code: 404 });
      return [row.value];
    },
  });
  return { objects, bucket: { file } };
}
