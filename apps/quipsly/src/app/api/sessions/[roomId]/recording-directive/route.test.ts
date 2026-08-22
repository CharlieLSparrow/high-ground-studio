/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import {
  buildMobileCaptureConsentVersions,
  mobileCaptureAllPartiesReady,
  mobileCaptureConsentVersion,
} from "@/lib/server/mobile-capture-room-readiness";

import { GET, PATCH, POST } from "./route";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({
  getQuipslySessionFromRequest: jest.fn(),
}));
jest.mock("@/lib/server/mobile-capture-room-readiness", () => ({
  buildMobileCaptureConsentVersions: jest.fn(),
  mobileCaptureAllPartiesReady: jest.fn(),
  mobileCaptureConsentVersion: jest.fn(),
}));

const room = {
  id: "room-1",
  captureGroupId: "11111111-1111-4111-8111-111111111111",
  status: "OPEN",
  participants: [{ id: "participant-1", userId: "coach-1", role: "COACH" }],
  recordingConsents: [{ id: "consent-1" }],
};
const directive = {
  id: "22222222-2222-4222-8222-222222222222",
  requestId: "33333333-3333-4333-8333-333333333333",
  sequence: 1n,
  roomId: "room-1",
  captureGroupId: room.captureGroupId,
  actorUserId: "coach-1",
  actorParticipantId: "participant-1",
  action: "START",
  requestSha256: "",
  issuedAt: new Date("2026-08-22T22:30:00.000Z"),
  receipts: [],
};
const prisma: any = {
  callRoom: { findFirst: jest.fn() },
  callRecordingDirective: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  callRecordingEndpointReceipt: { findUnique: jest.fn(), create: jest.fn() },
  callParticipantProviderGrantReceipt: { findFirst: jest.fn() },
  callParticipantPreflightReceipt: { findFirst: jest.fn() },
  $queryRaw: jest.fn(),
};
prisma.$transaction = jest.fn(async (operation: (tx: any) => unknown) =>
  operation(prisma),
);
const context = { params: Promise.resolve({ roomId: "room-1" }) };

function request(method: string, body?: unknown) {
  return new Request(
    "http://127.0.0.1:3012/api/sessions/room-1/recording-directive",
    {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    },
  );
}

describe("Session recording directive route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getPrismaClient).mockReturnValue(prisma);
    jest
      .mocked(getQuipslySessionFromRequest)
      .mockResolvedValue({
        user: { id: "coach-1", primaryEmail: "coach@example.test" },
      } as never);
    prisma.callRoom.findFirst.mockResolvedValue(room);
    prisma.callRecordingDirective.findFirst.mockResolvedValue(null);
    prisma.callRecordingDirective.findUnique.mockResolvedValue(null);
    prisma.callRecordingDirective.create.mockImplementation(
      async ({ data }: any) => ({
        ...directive,
        ...data,
        sequence: 1n,
        receipts: [],
      }),
    );
    prisma.callRecordingEndpointReceipt.findUnique.mockResolvedValue(null);
    prisma.callRecordingEndpointReceipt.create.mockImplementation(
      async ({ data }: any) => ({
        ...data,
        receivedAt: new Date("2026-08-22T22:31:00.000Z"),
      }),
    );
    prisma.callParticipantProviderGrantReceipt.findFirst.mockResolvedValue({
      id: "grant-1",
    });
    prisma.callParticipantPreflightReceipt.findFirst.mockResolvedValue(null);
    jest
      .mocked(buildMobileCaptureConsentVersions)
      .mockReturnValue([{ participantId: "participant-1" }] as never);
    jest.mocked(mobileCaptureAllPartiesReady).mockReturnValue(true);
    jest
      .mocked(mobileCaptureConsentVersion)
      .mockReturnValue("consent-version-1");
  });

  it("publishes one durable START intent without claiming an endpoint recorded", async () => {
    const response = await POST(
      request("POST", { requestId: directive.requestId, action: "START" }),
      context,
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      ok: true,
      directive: { action: "START", shouldRecord: true, endpointReceipts: [] },
    });
    expect(prisma.callRecordingDirective.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "START",
          allPartyConsentVersion: "consent-version-1",
        }),
      }),
    );
    expect(prisma.callRecordingEndpointReceipt.create).not.toHaveBeenCalled();
  });

  it("does not publish START until every participant has current consent", async () => {
    jest.mocked(mobileCaptureAllPartiesReady).mockReturnValue(false);
    const response = await POST(
      request("POST", { requestId: directive.requestId, action: "START" }),
      context,
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "CONSENT_REQUIRED" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns the latest private directive and endpoint states without actor identifiers", async () => {
    prisma.callRecordingDirective.findFirst.mockResolvedValue({
      ...directive,
      receipts: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          participantId: "participant-1",
          actorUserId: "coach-1",
          clientInstanceId: "browser-1",
          clientKind: "web",
          deviceLabel: "Mac",
          state: "STARTED",
          captureId: "55555555-5555-4555-8555-555555555555",
          occurredAt: new Date("2026-08-22T22:30:02.000Z"),
          receivedAt: new Date("2026-08-22T22:30:03.000Z"),
        },
      ],
    });
    const response = await GET(request("GET"), context);
    const packet = await response.json();
    expect(packet).toMatchObject({
      ok: true,
      directive: {
        shouldRecord: true,
        endpointReceipts: [{ state: "STARTED", deviceLabel: "Mac" }],
      },
      boundaries: { directiveIsIntentNotRecordedMedia: true },
    });
    expect(JSON.stringify(packet)).not.toContain("coach@example.test");
    expect(JSON.stringify(packet)).not.toContain("actorUserId");
  });

  it("accepts an idempotent endpoint acknowledgment only from a known installation", async () => {
    prisma.callRecordingDirective.findFirst.mockResolvedValue({
      id: directive.id,
      action: "START",
    });
    const receiptId = "44444444-4444-4444-8444-444444444444";
    const response = await PATCH(
      request("PATCH", {
        receiptId,
        directiveId: directive.id,
        state: "STARTED",
        captureId: "55555555-5555-4555-8555-555555555555",
        clientInstanceId: "browser-1",
        clientKind: "web",
        deviceLabel: "Mac",
      }),
      context,
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      ok: true,
      endpointReceipt: { id: receiptId, state: "STARTED" },
    });
  });

  it("authenticates before reading private coordination", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null as never);
    const response = await GET(request("GET"), context);
    expect(response.status).toBe(401);
    expect(prisma.callRoom.findFirst).not.toHaveBeenCalled();
  });
});
