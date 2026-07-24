import { OrganizationRole, SubscriptionStatus } from "@prisma/client";

import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";

import { inviteTeamMemberAction, updateSubscriptionAction } from "./actions";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));

describe("settings provider truth boundaries", () => {
  beforeEach(() => jest.clearAllMocks());

  it("does not turn an email address into an account or organization membership", async () => {
    const result = await inviteTeamMemberAction(
      "org-1",
      "editor@example.com",
      OrganizationRole.EDITOR,
    );

    expect(result).toEqual({
      ok: false,
      errorCode: "ORGANIZATION_INVITATION_UNAVAILABLE",
      error: expect.stringMatching(/No account or membership was created/i),
    });
    expect(auth).not.toHaveBeenCalled();
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("does not activate a subscription without provider checkout and webhook receipts", async () => {
    const result = await updateSubscriptionAction(
      "org-1",
      "plan-pro",
      SubscriptionStatus.ACTIVE,
    );

    expect(result).toEqual({
      ok: false,
      errorCode: "BILLING_PROVIDER_NOT_CONNECTED",
      error: expect.stringMatching(/No subscription was changed/i),
    });
    expect(auth).not.toHaveBeenCalled();
    expect(getPrismaClient).not.toHaveBeenCalled();
  });
});
