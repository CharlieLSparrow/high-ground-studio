/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { mapMobileCaptureSessionsForUser } from "@/lib/server/mobile-capture-sessions";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { GET } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/mobile-capture-sessions", () => ({
  mapMobileCaptureSessionsForUser: jest.fn(() => []),
}));
jest.mock("@/lib/server/quipsly-session", () => ({
  getQuipslySessionFromRequest: jest.fn(),
}));

describe("mobile Capture review digest", () => {
  beforeEach(() => jest.clearAllMocks());

  it("stops before private reads when signed out", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null as any);

    const response = await GET(new Request("http://localhost/api/mobile/capture/review-digest"));

    expect(response.status).toBe(401);
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("keeps Nest access-grant sessions visible to the same iPhone actor", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: {
        id: "user-1",
        primaryEmail: " Producer@Example.com ",
        name: "Producer",
        isStaff: false,
      },
    } as any);
    const findMany = jest.fn().mockResolvedValue([]);
    jest.mocked(getPrismaClient).mockReturnValue({
      callRoom: { findMany },
      mobileCaptureFinalizationReceipt: { findMany: jest.fn() },
    } as any);

    const response = await GET(new Request("http://localhost/api/mobile/capture/review-digest"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        OR: expect.arrayContaining([
          {
            project: {
              accessGrants: {
                some: {
                  email: "producer@example.com",
                  status: "ACTIVE",
                },
              },
            },
          },
        ]),
      },
    }));
    expect(mapMobileCaptureSessionsForUser).toHaveBeenCalledWith({
      rooms: [],
      userId: "user-1",
      finalizationReceipts: [],
    });
    expect(payload).toMatchObject({
      ok: true,
      packetKind: "quipsly-mobile-capture-review-digest-v1",
      digest: { sessionCount: 0 },
      boundaries: { sideEffectFree: true },
    });
  });
});
