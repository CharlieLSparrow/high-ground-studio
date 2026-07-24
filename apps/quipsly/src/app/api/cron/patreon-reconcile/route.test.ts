/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";

import { POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));

const mockedPrisma = jest.mocked(getPrismaClient);

describe("Patreon reconciliation scheduler boundary", () => {
  const originalSecret = process.env.PATREON_RECONCILE_SECRET;

  beforeEach(() => jest.clearAllMocks());

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.PATREON_RECONCILE_SECRET;
    else process.env.PATREON_RECONCILE_SECRET = originalSecret;
  });

  it("fails closed before persistence when its dedicated secret is absent", async () => {
    delete process.env.PATREON_RECONCILE_SECRET;

    const response = await POST(new Request("https://quipsly.example/api/cron/patreon-reconcile", { method: "POST" }));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toEqual(expect.objectContaining({
      ok: false,
      errorCode: "PATREON_RECONCILE_SECRET_NOT_CONFIGURED",
      persistenceChanged: false,
    }));
    expect(mockedPrisma).not.toHaveBeenCalled();
  });

  it("rejects a missing or wrong bearer secret before persistence", async () => {
    process.env.PATREON_RECONCILE_SECRET = "strong-test-secret";

    const response = await POST(new Request("https://quipsly.example/api/cron/patreon-reconcile", {
      method: "POST",
      headers: { Authorization: "Bearer wrong" },
    }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual(expect.objectContaining({ errorCode: "AUTH_REQUIRED", persistenceChanged: false }));
    expect(mockedPrisma).not.toHaveBeenCalled();
  });
});
