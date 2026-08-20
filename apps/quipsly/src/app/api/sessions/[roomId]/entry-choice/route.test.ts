/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { GET, POST } from "./route";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({
  getQuipslySessionFromRequest: jest.fn(),
}));
jest.mock("@/lib/server/prisma-advisory-lock", () => ({
  acquirePrismaAdvisoryTransactionLock: jest.fn(),
}));

const userEvent = {
  findFirst: jest.fn(),
  create: jest.fn(),
  findMany: jest.fn(),
};
const prisma = {
  callRoom: { findFirst: jest.fn() },
  userEvent,
  $transaction: jest.fn(async (operation: (tx: unknown) => unknown) =>
    operation({ userEvent }),
  ),
};
const context = { params: Promise.resolve({ roomId: "room-safe_42" }) };

function request(method: "GET" | "POST", body?: unknown) {
  return new Request(
    "http://127.0.0.1:3012/api/sessions/room-safe_42/entry-choice",
    {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    },
  );
}

describe("Session entry choice API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: {
        id: "client-1",
        primaryEmail: "client@example.test",
        isStaff: false,
      },
    } as never);
    prisma.callRoom.findFirst.mockResolvedValue({
      id: "room-safe_42",
      purpose: "COACHING",
    });
    userEvent.findFirst.mockResolvedValue(null);
    userEvent.create.mockResolvedValue({ id: "entry-event-1" });
    userEvent.findMany.mockResolvedValue([]);
  });

  it("records a bounded browser choice without granting access or implying recording", async () => {
    const response = await POST(request("POST", { choice: "BROWSER" }), context);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      choice: "BROWSER",
      boundaries: {
        grantsAccess: false,
        joinsCall: false,
        startsRecording: false,
      },
    });
    expect(userEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "client-1",
        eventName: "Session Entry Selected: Browser",
        payloadJson: expect.objectContaining({
          roomId: "room-safe_42",
          measurement: "browser-call-opened",
        }),
      }),
      select: { id: true },
    });
  });

  it("replays the same person, room, and choice instead of inflating counts", async () => {
    userEvent.findFirst.mockResolvedValue({ id: "entry-event-existing" });
    const response = await POST(request("POST", { choice: "capture_app" }), context);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      choice: "CAPTURE_APP",
      idempotentReplay: true,
    });
    expect(userEvent.create).not.toHaveBeenCalled();
  });

  it("labels a TestFlight visit as a click rather than install proof", async () => {
    const response = await POST(request("POST", { choice: "TESTFLIGHT" }), context);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      boundaries: { testFlightClickIsInstallProof: false },
    });
    expect(userEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payloadJson: expect.objectContaining({
            measurement: "public-link-click-not-install",
          }),
        }),
      }),
    );
  });

  it("shows host-only aggregate choices while preserving Apple's install authority", async () => {
    userEvent.findMany.mockResolvedValue([
      { userId: "client-1", eventName: "Session Entry Selected: Browser" },
      { userId: "client-2", eventName: "Session Entry Selected: Capture App" },
      { userId: "client-2", eventName: "Session Entry Selected: TestFlight" },
    ]);
    const response = await GET(request("GET"), context);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      counts: { BROWSER: 1, CAPTURE_APP: 1, TESTFLIGHT: 1 },
      uniquePeople: 2,
      boundaries: {
        selectionsNotInstalls: true,
        appleTestFlightMetricsRemainInstallAuthority: true,
      },
    });
  });

  it("fails closed before writing when the account cannot access the Session", async () => {
    prisma.callRoom.findFirst.mockResolvedValue(null);
    const response = await POST(request("POST", { choice: "BROWSER" }), context);
    expect(response.status).toBe(404);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
