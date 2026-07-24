/** @jest-environment node */

jest.mock("@/lib/release-health", () => ({
  RELEASE_HEALTH_HEADERS: { "Cache-Control": "no-store" },
  createBetaReadinessResponseBody: jest.fn(),
}));

jest.mock("@/lib/server/production-core-readiness", () => ({
  getProductionCoreReadinessSafe: jest.fn(),
}));

jest.mock("@/lib/server/release-smoke-receipt", () => ({
  RELEASE_SMOKE_RECEIPT_HEADER: "x-quipsly-release-smoke-receipt",
}));

import { createBetaReadinessResponseBody } from "@/lib/release-health";
import { getProductionCoreReadinessSafe } from "@/lib/server/production-core-readiness";
import { GET } from "./route";

const mockedCreateReadiness = jest.mocked(createBetaReadinessResponseBody);
const mockedProductionCore = jest.mocked(getProductionCoreReadinessSafe);

describe("GET /api/beta-readiness", () => {
  const originalSecret = process.env.QUIPSLY_RELEASE_SMOKE_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.QUIPSLY_RELEASE_SMOKE_SECRET = "route-test-secret-with-at-least-32-bytes";
    mockedProductionCore.mockResolvedValue({ ok: false } as never);
  });

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.QUIPSLY_RELEASE_SMOKE_SECRET;
    else process.env.QUIPSLY_RELEASE_SMOKE_SECRET = originalSecret;
  });

  it("returns 503 when the generated evidence contract is not ready", async () => {
    mockedCreateReadiness.mockReturnValue({
      ok: false,
      ready: false,
      readinessStatus: "implemented-unverified",
    } as ReturnType<typeof createBetaReadinessResponseBody>);

    const response = await GET(new Request("http://quipsly.test/api/beta-readiness?receipt=ignored"));

    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Vary")).toBe("x-quipsly-release-smoke-receipt");
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      ready: false,
      readinessStatus: "implemented-unverified",
    });
    expect(mockedCreateReadiness).toHaveBeenCalledWith({
      productionCore: { ok: false },
      releaseSmokeReceipt: {
        token: null,
      },
    });
  });

  it("returns 200 only when every required evidence gate is satisfied", async () => {
    mockedCreateReadiness.mockReturnValue({
      ok: true,
      ready: true,
      readinessStatus: "runtime-verified",
    } as ReturnType<typeof createBetaReadinessResponseBody>);

    const response = await GET(new Request("http://quipsly.test/api/beta-readiness", {
      headers: {
        "x-quipsly-release-smoke-receipt": "qsr1.signed.token",
      },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      ready: true,
      readinessStatus: "runtime-verified",
    });
    expect(mockedCreateReadiness).toHaveBeenCalledWith({
      productionCore: { ok: false },
      releaseSmokeReceipt: {
        token: "qsr1.signed.token",
      },
    });
  });
});
