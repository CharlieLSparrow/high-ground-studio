/** @jest-environment node */

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({
  getQuipslySessionFromRequest: jest.fn(),
}));

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import {
  expectedSourceRequestSha256,
  parseCreateExpectedSource,
} from "@/lib/server/session-source-expectations";

import { GET, PATCH, POST } from "./route";

const CREATE_REQUEST_ID = "c440492c-e93a-48a0-9c17-0c740a808af2";
const MUTATION_REQUEST_ID = "29c969fb-9453-47b9-99a2-90d7d8e47ee4";
const actor = {
  id: "user-1",
  name: "Retained QA Producer",
  primaryEmail: "retained-producer@example.test",
  isStaff: false,
};
const now = new Date("2026-08-06T23:00:00.000Z");

function createBody(overrides: Record<string, unknown> = {}) {
  return {
    requestId: CREATE_REQUEST_ID,
    participantId: "participant-1",
    label: "Scott iPhone 4K video master",
    sourceKind: "VIDEO",
    retentionRole: "REQUIRED_MASTER",
    expectedClientKind: "ios",
    expectedDeviceLabel: "iPhone 16",
    captureId: "2a32f19d-8770-4c35-a157-96884d566e82",
    reason: "Declared before recording.",
    ...overrides,
  };
}

function storedExpectation(overrides: Record<string, unknown> = {}) {
  return {
    id: "expectation-1",
    roomId: "room-1",
    participantId: "participant-1",
    createdByUserId: actor.id,
    label: "Scott iPhone 4K video master",
    sourceKind: "VIDEO",
    retentionRole: "REQUIRED_MASTER",
    status: "ACTIVE",
    expectedClientKind: "ios",
    expectedDeviceLabel: "iPhone 16",
    recordingAssetId: null,
    captureId: "2a32f19d-8770-4c35-a157-96884d566e82",
    revision: 1,
    latestReason: "Declared before recording.",
    createdAt: now,
    updatedAt: now,
    participant: {
      displayName: "Scott Sparrow",
      email: "shomers@icloud.com",
      user: { name: "Scott Sparrow" },
    },
    recordingAsset: null,
    ...overrides,
  };
}

function request(method: "GET" | "POST" | "PATCH", payload?: unknown) {
  return new Request("http://127.0.0.1:3012/api/sessions/room-1/source-expectations", {
    method,
    headers: payload ? { "content-type": "application/json" } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });
}

const context = { params: Promise.resolve({ roomId: "room-1" }) };

describe("Session retained-source plan API", () => {
  const prisma = {
    callRoom: { findFirst: jest.fn() },
    callExpectedSource: {
      findMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    callExpectedSourceRevision: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    recordingAsset: { findFirst: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: actor } as never);
    prisma.callRoom.findFirst.mockResolvedValue({
      id: "room-1",
      participants: [{ id: "participant-1" }],
    });
    prisma.callExpectedSource.findMany.mockResolvedValue([]);
    prisma.callExpectedSourceRevision.findUnique.mockResolvedValue(null);
    prisma.callExpectedSource.create.mockImplementation(async ({ data }) => storedExpectation({ ...data, participant: undefined }));
    prisma.callExpectedSource.findUniqueOrThrow.mockResolvedValue(storedExpectation());
    prisma.callExpectedSourceRevision.create.mockResolvedValue({ id: "revision-1" });
    prisma.$transaction.mockImplementation(async (operation) => operation(prisma));
  });

  it("authenticates before exposing or changing a private source plan", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null);

    const [readResponse, writeResponse] = await Promise.all([
      GET(request("GET"), context),
      POST(request("POST", createBody()), context),
    ]);

    expect(readResponse.status).toBe(401);
    expect(writeResponse.status).toBe(401);
    expect(readResponse.headers.get("cache-control")).toBe("private, no-store");
    expect(prisma.callRoom.findFirst).not.toHaveBeenCalled();
  });

  it("rejects a provider witness disguised as the required high-quality master", async () => {
    const response = await POST(request("POST", createBody({
      sourceKind: "PROVIDER",
      retentionRole: "REQUIRED_MASTER",
    })), context);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, code: "INVALID_EXPECTED_SOURCE" });
    expect(prisma.callExpectedSource.create).not.toHaveBeenCalled();
  });

  it("creates one append-only first revision for an editable Session participant", async () => {
    const response = await POST(request("POST", createBody()), context);
    const packet = await response.json();

    expect(response.status).toBe(201);
    expect(packet).toMatchObject({
      ok: true,
      idempotentReplay: false,
      expectation: {
        id: "expectation-1",
        participantLabel: "Scott Sparrow",
        sourceKind: "VIDEO",
        retentionRole: "REQUIRED_MASTER",
        captureId: "2a32f19d-8770-4c35-a157-96884d566e82",
        revision: 1,
      },
    });
    expect(prisma.callExpectedSourceRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        requestId: CREATE_REQUEST_ID,
        action: "CREATE",
        revision: 1,
        beforeJson: {},
      }),
    });
  });

  it("replays an identical create request without writing a second expectation", async () => {
    const parsed = parseCreateExpectedSource(createBody());
    expect(parsed).not.toBeNull();
    const requestSha256 = expectedSourceRequestSha256({
      action: "CREATE",
      roomId: "room-1",
      actorUserId: actor.id,
      ...parsed!,
    });
    prisma.callExpectedSourceRevision.findUnique.mockResolvedValue({
      requestId: CREATE_REQUEST_ID,
      requestSha256,
      actorUserId: actor.id,
      expectation: storedExpectation(),
    });

    const response = await POST(request("POST", createBody()), context);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, idempotentReplay: true });
    expect(prisma.callExpectedSource.create).not.toHaveBeenCalled();
    expect(prisma.callExpectedSourceRevision.create).not.toHaveBeenCalled();
  });

  it("rejects a stale recovery decision without changing the current plan", async () => {
    prisma.callExpectedSource.findFirst.mockResolvedValue(storedExpectation({ revision: 2 }));

    const response = await PATCH(request("PATCH", {
      requestId: MUTATION_REQUEST_ID,
      expectationId: "expectation-1",
      expectedRevision: 1,
      action: "WAIVE",
      reason: "The phone failed before recording.",
    }), context);

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: "STALE_EXPECTATION",
      expectation: { revision: 2 },
    });
    expect(prisma.callExpectedSource.update).not.toHaveBeenCalled();
    expect(prisma.callExpectedSourceRevision.create).not.toHaveBeenCalled();
  });

  it("rejects impossible state transitions instead of silently rewriting history", async () => {
    prisma.callExpectedSource.findFirst.mockResolvedValue(storedExpectation());

    const response = await PATCH(request("PATCH", {
      requestId: MUTATION_REQUEST_ID,
      expectationId: "expectation-1",
      expectedRevision: 1,
      action: "RESTORE",
    }), context);

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: "INVALID_EXPECTED_SOURCE_TRANSITION",
    });
    expect(prisma.callExpectedSource.update).not.toHaveBeenCalled();
    expect(prisma.callExpectedSourceRevision.create).not.toHaveBeenCalled();
  });

  it("binds only an exact-room, kind-compatible retained source and records the decision", async () => {
    prisma.callExpectedSource.findFirst
      .mockResolvedValueOnce(storedExpectation())
      .mockResolvedValueOnce(null);
    prisma.recordingAsset.findFirst.mockResolvedValue({
      id: "asset-video-1",
      participantId: "participant-1",
      kind: "LOCAL_VIDEO",
      localManifestJson: { captureId: "a8ed9ea3-4b97-47fa-b305-3302354401d7" },
    });
    prisma.callExpectedSource.update.mockResolvedValue(storedExpectation({
      recordingAssetId: "asset-video-1",
      captureId: "a8ed9ea3-4b97-47fa-b305-3302354401d7",
      revision: 2,
    }));
    prisma.callExpectedSource.findUniqueOrThrow.mockResolvedValue(storedExpectation({
      recordingAssetId: "asset-video-1",
      captureId: "a8ed9ea3-4b97-47fa-b305-3302354401d7",
      revision: 2,
      recordingAsset: {
        id: "asset-video-1",
        fileName: "Scott-iPhone.mov",
        kind: "LOCAL_VIDEO",
        status: "VERIFIED",
        verifiedAt: now,
      },
    }));

    const response = await PATCH(request("PATCH", {
      requestId: MUTATION_REQUEST_ID,
      expectationId: "expectation-1",
      expectedRevision: 1,
      action: "BIND",
      recordingAssetId: "asset-video-1",
      reason: "Matched after byte verification.",
    }), context);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      expectation: { recordingAssetId: "asset-video-1", revision: 2 },
    });
    expect(prisma.callExpectedSourceRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "BIND",
        revision: 2,
        reason: "Matched after byte verification.",
      }),
    });
  });
});
