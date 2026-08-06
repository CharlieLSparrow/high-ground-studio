/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { recordSucceededSessionPreflightAction } from "@/lib/server/governed-action-runtime";

import { GET, POST } from "./route";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({
  getQuipslySessionFromRequest: jest.fn(),
}));
jest.mock("@/lib/server/governed-action-runtime", () => ({
  recordSucceededSessionPreflightAction: jest.fn(),
}));

const REQUEST_ID = "6e4cc29d-baf7-4a24-9148-d3ba9e808ca1";
const testedAt = new Date("2026-08-06T10:30:00.000Z");
const expiresAt = new Date("2026-08-06T12:30:00.000Z");

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    id: "preflight-1",
    requestId: REQUEST_ID,
    requestSha256: "stored-hash",
    roomId: "room-1",
    participantId: "participant-1",
    actorUserId: "user-1",
    clientInstanceId: "web-studio-1",
    clientKind: "web",
    deviceLabel: "Quipsly Web · MacIntel",
    microphoneLabel: "Shure MV7i",
    cameraLabel: "Canon EOS R8",
    outputLabel: "Shure MV7i Headphones",
    cameraWanted: true,
    status: "READY",
    audioSignalState: "ready",
    rmsDbfs: -24,
    samplePeakDbfs: -8,
    peakHoldDbfs: -5,
    clippedSampleCount: 0,
    sampleRateHz: 48_000,
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: false,
    cameraWidth: 1_920,
    cameraHeight: 1_080,
    cameraFrameRate: 30,
    privateSampleDurationSeconds: 10,
    privateSamplePlaybackComplete: true,
    playbackDecision: "HEARD_CLEAR",
    issueCodes: [],
    evidenceJson: {},
    testedAt,
    expiresAt,
    createdAt: testedAt,
    governedActionId: "governed-action-1",
    ...overrides,
  };
}

function healthyBody() {
  return {
    requestId: REQUEST_ID,
    clientInstanceId: "web-studio-1",
    deviceLabel: "Quipsly Web · MacIntel",
    microphoneLabel: "Shure MV7i",
    cameraLabel: "Canon EOS R8",
    outputLabel: "Shure MV7i Headphones",
    cameraWanted: true,
    privateSampleDurationSeconds: 10,
    privateSamplePlaybackComplete: true,
    playbackDecision: "HEARD_CLEAR",
    audioEvidence: {
      state: "ready",
      rmsDbfs: -24,
      samplePeakDbfs: -8,
      peakHoldDbfs: -5,
      clippedSampleCountSinceStart: 0,
      sampleRateHz: 48_000,
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: false,
    },
    cameraEvidence: { width: 1_920, height: 1_080, frameRate: 30 },
  };
}

function healthyIOSBody() {
  return {
    ...healthyBody(),
    clientKind: "ios",
    clientInstanceId: "ios-install-1",
    deviceLabel: "Quipsly Capture · iPhone",
    outputLabel: "AirPods",
  };
}

const context = { params: Promise.resolve({ roomId: "room-1" }) };

function request(method: "GET" | "POST", body?: unknown) {
  return new Request("http://127.0.0.1:3012/api/sessions/room-1/preflight", {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("Session preflight receipt API", () => {
  const prisma = {
    callRoom: { findFirst: jest.fn() },
    callParticipant: { findFirst: jest.fn(), create: jest.fn() },
    callParticipantPreflightReceipt: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: {
        id: "user-1",
        name: "Charlie",
        primaryEmail: "charlie@example.test",
        isStaff: false,
      },
    } as never);
    prisma.callRoom.findFirst.mockResolvedValue({
      id: "room-1",
      projectId: "project-1",
      booking: null,
      participants: [{ id: "participant-1", userId: "user-1" }],
    });
    prisma.callParticipantPreflightReceipt.findFirst.mockResolvedValue(null);
    prisma.callParticipant.findFirst.mockResolvedValue(null);
    prisma.callParticipant.create.mockResolvedValue({ id: "participant-created", userId: "user-1" });
    prisma.callParticipantPreflightReceipt.findUnique.mockResolvedValue(null);
    prisma.callParticipantPreflightReceipt.create.mockImplementation(async ({ data }) => receipt({
      ...data,
      requestSha256: data.requestSha256,
      testedAt: data.testedAt,
      expiresAt: data.expiresAt,
    }));
    prisma.$transaction.mockImplementation(async (operation) => operation(prisma));
    jest.mocked(recordSucceededSessionPreflightAction).mockResolvedValue({
      runId: "governed-run-1",
      actionId: "governed-action-1",
      attemptId: "governed-attempt-1",
      receiptId: "governed-receipt-1",
    });
  });

  it("authenticates before reading private Session or setup evidence", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null);

    const response = await GET(request("GET"), context);

    expect(response.status).toBe(401);
    expect(prisma.callRoom.findFirst).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("returns the actor's latest receipt without sample bytes or provider secrets", async () => {
    prisma.callParticipantPreflightReceipt.findFirst.mockResolvedValue(receipt());

    const response = await GET(request("GET"), context);
    const packet = await response.json();

    expect(response.status).toBe(200);
    expect(packet).toMatchObject({
      ok: true,
      preflight: {
        microphoneLabel: "Shure MV7i",
        outputLabel: "Shure MV7i Headphones",
        status: "READY",
        privateSamplePlaybackComplete: true,
      },
      boundaries: {
        sampleBytesRetained: false,
        sampleBytesUploaded: false,
        recordingStarted: false,
      },
    });
    expect(JSON.stringify(packet)).not.toContain("requestSha256");
    expect(JSON.stringify(packet)).not.toContain("token");
  });

  it("persists a ready receipt while explicitly retaining no private audio", async () => {
    const response = await POST(request("POST", healthyBody()), context);
    const packet = await response.json();

    expect(response.status).toBe(201);
    expect(packet).toMatchObject({
      ok: true,
      idempotentReplay: false,
      preflight: {
        status: "READY",
        audioSignalState: "ready",
        playbackDecision: "HEARD_CLEAR",
      },
      governance: {
        actionId: "governed-action-1",
        receiptId: "governed-receipt-1",
      },
      boundaries: {
        sampleBytesRetained: false,
        sampleBytesUploaded: false,
        recordingStarted: false,
        providerJoined: false,
        sourceTruthChanged: false,
      },
    });
    expect(prisma.callParticipantPreflightReceipt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        roomId: "room-1",
        participantId: "participant-1",
        actorUserId: "user-1",
        microphoneLabel: "Shure MV7i",
        status: "READY",
        governedActionId: "governed-action-1",
        evidenceJson: expect.objectContaining({
          privateSampleBytesRetained: false,
          privateSampleUploaded: false,
        }),
      }),
    });
    expect(recordSucceededSessionPreflightAction).toHaveBeenCalledWith(prisma, expect.objectContaining({
      requestId: REQUEST_ID,
      projectId: "project-1",
      roomId: "room-1",
      actorUserId: "user-1",
      status: "READY",
      payload: expect.objectContaining({
        clientInstanceId: "web-studio-1",
        microphoneLabel: "Shure MV7i",
        privateSampleBytesRetained: false,
        privateSampleUploaded: false,
      }),
    }));
  });

  it("persists the same private-playback contract for an iPhone endpoint", async () => {
    const response = await POST(request("POST", healthyIOSBody()), context);
    const packet = await response.json();

    expect(response.status).toBe(201);
    expect(packet).toMatchObject({
      ok: true,
      preflight: {
        clientKind: "ios",
        clientInstanceId: "ios-install-1",
        deviceLabel: "Quipsly Capture · iPhone",
        outputLabel: "AirPods",
        status: "READY",
      },
    });
    expect(prisma.callParticipantPreflightReceipt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clientKind: "ios",
        clientInstanceId: "ios-install-1",
        evidenceJson: expect.objectContaining({
          audioEvidenceCoverage: "local-native-recorder-meter-and-complete-private-playback",
          outputRoutingAuthority: "native-current-audio-route",
        }),
      }),
    });
  });

  it("serializes participant identity before a first authorized endpoint receipt", async () => {
    prisma.callRoom.findFirst.mockResolvedValue({
      id: "room-1",
      projectId: "project-1",
      booking: { coachUserId: "user-1", clientUserId: "client-1" },
      participants: [],
    });

    const response = await POST(request("POST", healthyBody()), context);

    expect(response.status).toBe(201);
    expect(prisma.callParticipant.findFirst).toHaveBeenCalledWith({
      where: { roomId: "room-1", userId: "user-1", accessStatus: "ACTIVE" },
      select: { id: true, userId: true },
    });
    expect(prisma.callParticipant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        roomId: "room-1",
        userId: "user-1",
        role: "COACH",
        deviceLabel: "Quipsly Web · MacIntel",
      }),
      select: { id: true, userId: true },
    });
    expect(prisma.callParticipantPreflightReceipt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ participantId: "participant-created" }),
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it("binds an idempotency replay to the same actor, room, participant, and evidence hash", async () => {
    const first = await POST(request("POST", healthyBody()), context);
    const firstPacket = await first.json();
    const created = prisma.callParticipantPreflightReceipt.create.mock.results[0].value;
    const createdReceipt = await created;
    prisma.callParticipantPreflightReceipt.findUnique.mockResolvedValue(createdReceipt);

    const replay = await POST(request("POST", healthyBody()), context);
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toMatchObject({ ok: true, idempotentReplay: true });
    expect(firstPacket.idempotentReplay).toBe(false);

    prisma.callParticipantPreflightReceipt.findUnique.mockResolvedValue(receipt({
      requestSha256: createdReceipt.requestSha256,
      actorUserId: "another-user",
    }));
    const conflict = await POST(request("POST", healthyBody()), context);
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({ code: "REQUEST_ID_CONFLICT" });
  });
});
