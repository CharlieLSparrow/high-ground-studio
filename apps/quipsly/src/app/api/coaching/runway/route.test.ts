/** @jest-environment node */
import { POST } from "./route";
import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { coachingClientSchedulingContext, CoachingClientSpaceError } from "@/lib/server/coaching-client-space";
import { quipslyCoachCapabilityAccess } from "@/lib/server/subscription-entitlements";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));
jest.mock("@/lib/server/subscription-entitlements", () => ({ quipslyCoachCapabilityAccess: jest.fn() }));
jest.mock("@/lib/server/coaching-client-space", () => ({
  coachingClientSchedulingContext: jest.fn(),
  CoachingClientSpaceError: class extends Error { constructor(message: string, readonly status: number) { super(message); } },
}));

const actor = { id: "coach", primaryEmail: "coach@example.test", isStaff: false };
const prisma = { serviceOffering: { findUnique: jest.fn() }, $transaction: jest.fn() };
function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/coaching/runway", { method: "POST", body: JSON.stringify(body) });
}

describe("booking creation identity boundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: actor } as never);
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);
  });
  it.each(["create-booking-room", "create-booking-series", "create-booking-hold"])("rejects forged coach IDs before any writes for %s", async (action) => {
    const response = await POST(request({ action, coachUserId: "another-coach" }));
    expect(response.status).toBe(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(quipslyCoachCapabilityAccess).not.toHaveBeenCalled();
  });
  it("does not let a service offering substitute another coach", async () => {
    prisma.serviceOffering.findUnique.mockResolvedValue({ coachProfile: { userId: "another-coach" } });
    expect((await POST(request({ action: "create-booking-room", offeringId: "other-service" }))).status).toBe(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it("rejects an inaccessible client space before subscription or scheduling work", async () => {
    jest.mocked(coachingClientSchedulingContext).mockRejectedValue(new CoachingClientSpaceError("This client space is not available for scheduling.", 404));
    const response = await POST(request({ action: "create-booking-room", engagementId: "private-space", projectSlug: "guessed-project", clientEmail: "guessed@example.test" }));
    expect(response.status).toBe(404);
    expect(coachingClientSchedulingContext).toHaveBeenCalledWith({ actor, engagementId: "private-space", prisma });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(quipslyCoachCapabilityAccess).not.toHaveBeenCalled();
  });
});
