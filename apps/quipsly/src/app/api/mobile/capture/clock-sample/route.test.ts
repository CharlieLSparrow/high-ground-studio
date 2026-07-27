/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({
  getQuipslySessionFromRequest: jest.fn(),
}));

const mockedPrisma = jest.mocked(getPrismaClient);
const mockedSession = jest.mocked(getQuipslySessionFromRequest);

function clockRequest(overrides: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/mobile/capture/clock-sample", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      protocolVersion: 1,
      sampleId: "9f2d48d8-5583-4bad-9b90-4a6db58c35e0",
      callRoomId: "room-1",
      captureGroupId: "e8bceac0-70c2-4b8f-b50a-733e2c71ef75",
      clientKind: "ios",
      deviceWallSentAt: "2026-07-26T18:00:00.000Z",
      deviceMonotonicSentNanoseconds: "18446744073709551615",
      ...overrides,
    }),
  });
}

describe("mobile capture clock sample", () => {
  const findFirst = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedSession.mockResolvedValue({
      user: {
        id: "user-1",
        primaryEmail: "person@example.test",
        isStaff: false,
      },
    } as never);
    mockedPrisma.mockReturnValue({
      callRoom: { findFirst },
    } as never);
    findFirst.mockResolvedValue({ id: "room-1" });
  });

  it("rejects signed-out probes before reading private room state", async () => {
    mockedSession.mockResolvedValue(null);

    const response = await POST(clockRequest());

    expect(response.status).toBe(401);
    expect(mockedPrisma).not.toHaveBeenCalled();
  });

  it("rejects malformed monotonic values without coercing unsafe numbers", async () => {
    const response = await POST(
      clockRequest({ deviceMonotonicSentNanoseconds: 18_446_744_073_709_551_615 }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.code).toBe("DEVICE_MONOTONIC_TIME_INVALID");
    expect(mockedPrisma).not.toHaveBeenCalled();
  });

  it("enforces the same room-access boundary as room join", async () => {
    findFirst.mockResolvedValue(null);

    const response = await POST(clockRequest());

    expect(response.status).toBe(404);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: "room-1",
        OR: [
          { createdByUserId: "user-1" },
          { participants: { some: { userId: "user-1" } } },
          { booking: { clientUserId: "user-1" } },
          { booking: { coachUserId: "user-1" } },
        ],
      },
      select: { id: true },
    });
  });

  it("echoes a side-effect-free two-time server sample for client completion", async () => {
    const response = await POST(clockRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      protocolVersion: 1,
      sampleId: "9f2d48d8-5583-4bad-9b90-4a6db58c35e0",
      callRoomId: "room-1",
      captureGroupId: "e8bceac0-70c2-4b8f-b50a-733e2c71ef75",
      clientKind: "ios",
      deviceMonotonicSentNanoseconds: "18446744073709551615",
      clockBoundary: {
        sideEffectFree: true,
        persistedByServer: false,
        sourceProfileOwnsCompletedSample: true,
        sampleAccurateClaimed: false,
      },
    });
    expect(Date.parse(payload.serverReceivedAt)).not.toBeNaN();
    expect(Date.parse(payload.serverSentAt)).not.toBeNaN();
  });
});
