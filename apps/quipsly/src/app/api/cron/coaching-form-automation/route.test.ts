/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { reconcileCoachingFormAutomation } from "@/lib/server/coaching-form-automation";
import { POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/coaching-form-automation", () => ({
  reconcileCoachingFormAutomation: jest.fn(),
}));

describe("coaching form automation scheduler boundary", () => {
  const originalSecret = process.env.QUIPSLY_COACHING_FORM_AUTOMATION_SECRET;

  beforeEach(() => jest.clearAllMocks());

  afterEach(() => {
    if (originalSecret === undefined)
      delete process.env.QUIPSLY_COACHING_FORM_AUTOMATION_SECRET;
    else process.env.QUIPSLY_COACHING_FORM_AUTOMATION_SECRET = originalSecret;
  });

  it("fails closed before persistence when its dedicated secret is absent", async () => {
    delete process.env.QUIPSLY_COACHING_FORM_AUTOMATION_SECRET;
    const response = await POST(
      new Request("https://quipsly.example/api/cron/coaching-form-automation", {
        method: "POST",
      }),
    );
    expect(response.status).toBe(503);
    expect(getPrismaClient).not.toHaveBeenCalled();
    expect(reconcileCoachingFormAutomation).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret with constant-time comparison before persistence", async () => {
    process.env.QUIPSLY_COACHING_FORM_AUTOMATION_SECRET =
      "coaching-form-secret";
    const response = await POST(
      new Request("https://quipsly.example/api/cron/coaching-form-automation", {
        method: "POST",
        headers: { authorization: "Bearer incorrect" },
      }),
    );
    expect(response.status).toBe(401);
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("runs one bounded reconciliation pass for the authorized scheduler", async () => {
    process.env.QUIPSLY_COACHING_FORM_AUTOMATION_SECRET =
      "coaching-form-secret";
    const prisma = {};
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);
    jest.mocked(reconcileCoachingFormAutomation).mockResolvedValue({
      examined: 4,
      created: 1,
      alreadyAssigned: 1,
      waitingForTime: 1,
      waitingForEvent: 1,
      skippedByCoach: 0,
    });
    const response = await POST(
      new Request("https://quipsly.example/api/cron/coaching-form-automation", {
        method: "POST",
        headers: { authorization: "Bearer coaching-form-secret" },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(reconcileCoachingFormAutomation).toHaveBeenCalledWith({
      prisma,
      limit: 500,
    });
  });
});
