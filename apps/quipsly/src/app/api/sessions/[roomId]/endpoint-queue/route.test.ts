/** @jest-environment node */

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({
  getQuipslySessionFromRequest: jest.fn(),
}));

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { GET, POST } from "./route";

const REQUEST_ID = "6e4cc29d-baf7-4a24-9148-d3ba9e808ca1";
const CAPTURE_ID = "8fb5f3ca-2898-41fc-b84d-0b6fcb2f9c6c";
const reconciledAt = new Date(Date.now() - 60_000);
const actor = {
  id: "user-1",
  name: "Retained QA Coach",
  primaryEmail: "retained-coach@example.test",
  isStaff: false,
};

function body(overrides: Record<string, unknown> = {}) {
  return {
    requestId: REQUEST_ID,
    clientInstanceId: "web-installation-20260806",
    clientKind: "web",
    deviceLabel: "Retained QA browser installation",
    queueRevision: "3",
    queueState: "DRAINED",
    localSourceCount: 1,
    pendingSourceCount: 0,
    failedSourceCount: 0,
    observedCaptureIds: [CAPTURE_ID],
    recordingAssetIds: ["asset-1"],
    latestLocalMutationAt: reconciledAt.toISOString(),
    reconciledAt: reconciledAt.toISOString(),
    ...overrides,
  };
}

function storedReceipt(overrides: Record<string, unknown> = {}) {
  return {
    id: "queue-receipt-1",
    requestId: REQUEST_ID,
    requestSha256: "request-hash",
    roomId: "room-1",
    captureGroupId: "capture-group-1",
    participantId: "participant-1",
    actorUserId: "user-1",
    clientInstanceId: "web-installation-20260806",
    clientKind: "web",
    deviceLabel: "Retained QA browser installation",
    queueRevision: 3n,
    queueState: "DRAINED",
    queueStateSha256: "state-hash",
    localSourceCount: 1,
    pendingSourceCount: 0,
    failedSourceCount: 0,
    observedCaptureIds: [CAPTURE_ID],
    recordingAssetIds: ["asset-1"],
    latestLocalMutationAt: reconciledAt,
    reconciledAt,
    serverSourceSetSha256: "server-source-hash",
    createdAt: reconciledAt,
    ...overrides,
  };
}

function request(method: "GET" | "POST", payload?: unknown) {
  return new Request("http://127.0.0.1:3012/api/sessions/room-1/endpoint-queue", {
    method,
    headers: payload ? { "content-type": "application/json" } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });
}

const context = { params: Promise.resolve({ roomId: "room-1" }) };

describe("Session endpoint queue receipt API", () => {
  const prisma = {
    callRoom: { findFirst: jest.fn() },
    callEndpointQueueReceipt: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    callParticipantProviderGrantReceipt: { findFirst: jest.fn() },
    callParticipantPreflightReceipt: { findFirst: jest.fn() },
    recordingAsset: { findMany: jest.fn() },
    mobileCaptureFinalizationReceipt: { findMany: jest.fn() },
    captureRoomStateReceipt: { findMany: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: actor } as never);
    prisma.callRoom.findFirst.mockResolvedValue({
      id: "room-1",
      captureGroupId: "capture-group-1",
      participants: [{ id: "participant-1" }],
    });
    prisma.callEndpointQueueReceipt.findMany.mockResolvedValue([]);
    prisma.callEndpointQueueReceipt.findUnique.mockResolvedValue(null);
    prisma.callEndpointQueueReceipt.findFirst.mockResolvedValue(null);
    prisma.callParticipantProviderGrantReceipt.findFirst.mockResolvedValue({ id: "grant-1" });
    prisma.callParticipantPreflightReceipt.findFirst.mockResolvedValue(null);
    prisma.recordingAsset.findMany.mockResolvedValue([{
      id: "asset-1",
      status: "VERIFIED",
      verifiedAt: reconciledAt,
      localManifestJson: { captureId: CAPTURE_ID },
    }]);
    prisma.mobileCaptureFinalizationReceipt.findMany.mockResolvedValue([{
      recordingAssetId: "asset-1",
      processingDisposition: "RELEASED",
    }]);
    prisma.captureRoomStateReceipt.findMany.mockResolvedValue([{
      captureId: CAPTURE_ID,
    }]);
    prisma.callEndpointQueueReceipt.create.mockImplementation(async ({ data }) => storedReceipt({
      ...data,
      requestSha256: data.requestSha256,
      queueStateSha256: data.queueStateSha256,
      serverSourceSetSha256: data.serverSourceSetSha256,
    }));
    prisma.$transaction.mockImplementation(async (operation) => operation(prisma));
  });

  it("authenticates before reading private endpoint state", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null);

    const response = await GET(request("GET"), context);

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(prisma.callRoom.findFirst).not.toHaveBeenCalled();
  });

  it("projects only the latest receipt for each exact installation", async () => {
    prisma.callEndpointQueueReceipt.findMany.mockResolvedValue([
      storedReceipt({ id: "receipt-a3", queueRevision: 3n }),
      storedReceipt({ id: "receipt-a2", queueRevision: 2n, queueState: "NOT_EMPTY" }),
      storedReceipt({
        id: "receipt-b4",
        requestId: "fb35db91-baca-443a-a9ed-3c3f35be5880",
        clientInstanceId: "ios-installation-20260806",
        clientKind: "ios",
        queueRevision: 4n,
      }),
    ]);

    const response = await GET(request("GET"), context);
    const packet = await response.json();

    expect(response.status).toBe(200);
    expect(packet.endpointQueues).toHaveLength(2);
    expect(packet.endpointQueues.map((item: { id: string }) => item.id)).toEqual(["receipt-a3", "receipt-b4"]);
    expect(packet.boundary).toContain("not live presence");
  });

  it("rejects a drain claim from an installation that never joined or ran preflight", async () => {
    prisma.callParticipantProviderGrantReceipt.findFirst.mockResolvedValue(null);
    prisma.callParticipantPreflightReceipt.findFirst.mockResolvedValue(null);

    const response = await POST(request("POST", body()), context);

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ ok: false, code: "UNKNOWN_ENDPOINT" });
    expect(prisma.callEndpointQueueReceipt.create).not.toHaveBeenCalled();
  });

  it("rejects a stale revision without weakening the latest durable receipt", async () => {
    prisma.callEndpointQueueReceipt.findFirst.mockResolvedValue(storedReceipt({ queueRevision: 4n }));

    const response = await POST(request("POST", body({ queueRevision: "3" })), context);
    const packet = await response.json();

    expect(response.status).toBe(409);
    expect(packet).toMatchObject({
      ok: false,
      code: "STALE_QUEUE_REVISION",
      latest: { queueRevision: "4" },
    });
    expect(prisma.callEndpointQueueReceipt.create).not.toHaveBeenCalled();
  });

  it("rejects DRAINED while a listed server source is not verified and released", async () => {
    prisma.mobileCaptureFinalizationReceipt.findMany.mockResolvedValue([{
      recordingAssetId: "asset-1",
      processingDisposition: "HELD",
    }]);

    const response = await POST(request("POST", body()), context);

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ ok: false, code: "SERVER_COPY_INCOMPLETE" });
    expect(prisma.callEndpointQueueReceipt.create).not.toHaveBeenCalled();
  });

  it("accepts a monotonic drain only after exact capture and server bytes reconcile", async () => {
    const response = await POST(request("POST", body()), context);
    const packet = await response.json();

    expect(response.status).toBe(201);
    expect(packet).toMatchObject({
      ok: true,
      idempotentReplay: false,
      safeToLeaveThisEndpoint: true,
      endpointQueue: {
        clientInstanceId: "web-installation-20260806",
        queueRevision: "3",
        queueState: "DRAINED",
        recordingAssetIds: ["asset-1"],
      },
    });
    expect(prisma.callEndpointQueueReceipt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        roomId: "room-1",
        participantId: "participant-1",
        actorUserId: "user-1",
        queueRevision: 3n,
        queueState: "DRAINED",
        localSourceCount: 1,
        pendingSourceCount: 0,
        failedSourceCount: 0,
      }),
    });
  });

  it("replays the identical request id without appending a second receipt", async () => {
    const matching = storedReceipt();
    const crypto = await import("@/lib/server/session-endpoint-queue");
    const parsed = crypto.parseSessionEndpointQueueEvidence(body());
    expect(parsed).not.toBeNull();
    matching.requestSha256 = crypto.sessionEndpointQueueRequestSha256({
      roomId: "room-1",
      captureGroupId: "capture-group-1",
      participantId: "participant-1",
      actorUserId: "user-1",
      evidence: parsed!,
    });
    prisma.callEndpointQueueReceipt.findUnique.mockResolvedValue(matching);

    const response = await POST(request("POST", body()), context);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, idempotentReplay: true });
    expect(prisma.callEndpointQueueReceipt.create).not.toHaveBeenCalled();
  });
});
