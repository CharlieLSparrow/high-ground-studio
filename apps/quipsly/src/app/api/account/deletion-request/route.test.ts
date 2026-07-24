/** @jest-environment node */

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({
  getQuipslySessionFromRequest: jest.fn(),
}));

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { GET, POST } from "./route";

const mockedPrisma = jest.mocked(getPrismaClient);
const mockedSession = jest.mocked(getQuipslySessionFromRequest);

function request(method: "GET" | "POST", body?: unknown) {
  return new Request("http://localhost/api/account/deletion-request", {
    method,
    headers:
      body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("account deletion request route", () => {
  const findFirst = jest.fn();
  const create = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedPrisma.mockReturnValue({
      userAccountDeletionRequest: { findFirst, create },
    } as never);
    mockedSession.mockResolvedValue({
      user: { id: "user-1", primaryEmail: "person@example.test" },
    } as never);
  });

  it("rejects unsigned status reads before database access", async () => {
    mockedSession.mockResolvedValue(null);

    const response = await GET(request("GET"));

    expect(response.status).toBe(401);
    expect(mockedPrisma).not.toHaveBeenCalled();
  });

  it("returns a truthful empty state with the completion policy", async () => {
    findFirst.mockResolvedValue(null);

    const response = await GET(request("GET"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      request: null,
      policy: {
        targetDays: 30,
        supportEmail: "charlie@highgroundodyssey.com",
      },
    });
    expect(payload.policy.timing).toContain("within 30 days");
    expect(findFirst).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { requestedAt: "desc" },
    });
  });

  it("projects durable completion status for reopening the app", async () => {
    findFirst.mockResolvedValue({
      id: "deletion-1",
      status: "COMPLETED",
      requestedAt: new Date("2026-07-01T12:00:00.000Z"),
      reviewedAt: new Date("2026-07-02T12:00:00.000Z"),
      completedAt: new Date("2026-07-10T12:00:00.000Z"),
      canceledAt: null,
      updatedAt: new Date("2026-07-10T12:00:00.000Z"),
    });

    const response = await GET(request("GET"));
    const payload = await response.json();

    expect(payload).toMatchObject({
      ok: true,
      request: {
        id: "deletion-1",
        status: "COMPLETED",
        statusLabel: "Deletion completed",
        active: false,
        requestedAt: "2026-07-01T12:00:00.000Z",
        targetCompletionAt: "2026-07-31T12:00:00.000Z",
        completedAt: "2026-07-10T12:00:00.000Z",
      },
    });
    expect(payload.nextAction).toContain("completion confirmation");
  });

  it("reuses an open request and preserves its original target date", async () => {
    findFirst.mockResolvedValue({
      id: "deletion-1",
      status: "REVIEWING",
      requestedAt: new Date("2026-07-01T12:00:00.000Z"),
      reviewedAt: new Date("2026-07-02T12:00:00.000Z"),
      completedAt: null,
      canceledAt: null,
      updatedAt: new Date("2026-07-02T12:00:00.000Z"),
    });

    const response = await POST(request("POST", { reason: "Leaving" }));
    const payload = await response.json();

    expect(payload).toMatchObject({
      ok: true,
      request: {
        id: "deletion-1",
        reusedExistingRequest: true,
        targetCompletionAt: "2026-07-31T12:00:00.000Z",
      },
    });
    expect(create).not.toHaveBeenCalled();
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        status: {
          in: expect.arrayContaining([
            "REQUESTED",
            "EXECUTING",
            "FAILED",
          ]),
        },
      },
      orderBy: { requestedAt: "desc" },
    });
  });

  it("records policy evidence when creating a request", async () => {
    findFirst.mockResolvedValue(null);
    create.mockImplementation(async ({ data }) => ({
      id: "deletion-2",
      status: "REQUESTED",
      requestedAt: new Date("2026-07-24T12:00:00.000Z"),
      reviewedAt: null,
      completedAt: null,
      canceledAt: null,
      updatedAt: new Date("2026-07-24T12:00:00.000Z"),
      ...data,
    }));

    const response = await POST(
      request("POST", {
        reason: "  Please remove it.  ",
        source: "ios-capture",
        appSurface: "HighGroundCapture",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      request: {
        id: "deletion-2",
        status: "REQUESTED",
        reusedExistingRequest: false,
      },
      policy: { version: "2026-07-24.v2", targetDays: 30 },
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        emailSnapshot: "person@example.test",
        reason: "Please remove it.",
        metadataJson: expect.objectContaining({
          policyVersion: "2026-07-24.v2",
          targetDays: 30,
        }),
      }),
    });
  });
});
