/** @jest-environment node */

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { findSharpRetentionDrop } from "./retention";
import { GET } from "./route";

const mockedPrisma = jest.mocked(getPrismaClient);
const mockedSession = jest.mocked(getQuipslySessionFromRequest);

function request(videoId?: string) {
  const suffix = videoId === undefined ? "" : `?videoId=${encodeURIComponent(videoId)}`;
  return new Request(`http://localhost/api/telemetry${suffix}`);
}

describe("retention telemetry route", () => {
  const findMany = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    mockedSession.mockResolvedValue({
      user: { id: "staff-1", isStaff: true, email: "staff@example.com" },
    } as never);
    mockedPrisma.mockReturnValue({ retentionTelemetry: { findMany } } as never);
  });

  afterEach(() => jest.restoreAllMocks());

  it("requires a signed-in staff user before touching Prisma", async () => {
    mockedSession.mockResolvedValue(null);
    const response = await GET(request("episode-4"));

    expect(response.status).toBe(401);
    expect(mockedPrisma).not.toHaveBeenCalled();

    mockedSession.mockResolvedValue({ user: { id: "member-1", isStaff: false } } as never);
    const memberResponse = await GET(request("episode-4"));
    expect(memberResponse.status).toBe(403);
    expect(mockedPrisma).not.toHaveBeenCalled();
  });

  it("requires an explicit bounded video ID", async () => {
    const missing = await GET(request());
    expect(missing.status).toBe(400);
    await expect(missing.json()).resolves.toMatchObject({ errorCode: "VIDEO_ID_REQUIRED" });

    const oversized = await GET(request("x".repeat(201)));
    expect(oversized.status).toBe(400);
    await expect(oversized.json()).resolves.toMatchObject({ errorCode: "VIDEO_ID_TOO_LONG" });
    expect(mockedPrisma).not.toHaveBeenCalled();
  });

  it("returns only persisted points and derives alerts from those points", async () => {
    findMany.mockResolvedValue([
      { segmentIndex: 0, timestamp: 0, retentionRate: 91 },
      { segmentIndex: 1, timestamp: 15, retentionRate: 88 },
      { segmentIndex: 2, timestamp: 30, retentionRate: 66 },
    ]);

    const response = await GET(request("episode-4"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      success: true,
      videoId: "episode-4",
      source: "postgres",
      readOnly: true,
      pointCount: 3,
      alert: { segmentIndex: 2, dropPercentagePoints: 22 },
    });
    expect(payload.data).toHaveLength(3);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { videoId: "episode-4" },
      take: 1_000,
    }));
  });

  it("returns a truthful empty state without seeding rows", async () => {
    findMany.mockResolvedValue([]);
    const response = await GET(request("unknown-video"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ success: true, pointCount: 0, alert: null, data: [] });
    expect(payload.nextAction).toContain("Nothing was seeded");
  });

  it("fails closed when persistence is unavailable", async () => {
    findMany.mockRejectedValue(new Error("ECONNREFUSED"));
    const response = await GET(request("episode-4"));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toMatchObject({
      success: false,
      errorCode: "RETENTION_TELEMETRY_UNAVAILABLE",
      data: [],
    });
  });
});

describe("findSharpRetentionDrop", () => {
  it("does not invent an alert when persisted points do not cross the threshold", () => {
    expect(findSharpRetentionDrop([
      { segmentIndex: 0, timestamp: 0, retentionRate: 90 },
      { segmentIndex: 1, timestamp: 15, retentionRate: 82 },
    ])).toBeNull();
  });
});
