import { OrganizationRole, SubscriptionStatus } from "@prisma/client";

import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";

import {
  getOrgFeedbackTicketsAction,
  inviteTeamMemberAction,
  removeTeamMemberAction,
  updateMemberRoleAction,
  updateSubscriptionAction,
} from "./actions";

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

  it("cannot remove a member from another organization by guessing its ID", async () => {
    const findUnique = jest.fn()
      .mockResolvedValueOnce({ organizationId: "org-1", userId: "owner-1", role: OrganizationRole.OWNER })
      .mockResolvedValueOnce({
        id: "foreign-member",
        organizationId: "org-2",
        userId: "person-2",
        role: OrganizationRole.EDITOR,
        user: { primaryEmail: "private@example.test" },
      });
    const deleteMember = jest.fn();
    jest.mocked(auth).mockResolvedValue({ user: { id: "owner-1", isStaff: false } } as never);
    jest.mocked(getPrismaClient).mockReturnValue({
      organizationMember: { findUnique, delete: deleteMember },
    } as never);

    await expect(removeTeamMemberAction("org-1", "foreign-member")).resolves.toEqual({
      ok: false,
      error: "Member not found.",
    });
    expect(deleteMember).not.toHaveBeenCalled();
  });

  it("cannot change a member role in another organization by guessing its ID", async () => {
    const findUnique = jest.fn()
      .mockResolvedValueOnce({ organizationId: "org-1", userId: "owner-1", role: OrganizationRole.OWNER })
      .mockResolvedValueOnce({
        id: "foreign-member",
        organizationId: "org-2",
        userId: "person-2",
        role: OrganizationRole.EDITOR,
        user: { primaryEmail: "private@example.test" },
      });
    const update = jest.fn();
    jest.mocked(auth).mockResolvedValue({ user: { id: "owner-1", isStaff: false } } as never);
    jest.mocked(getPrismaClient).mockReturnValue({
      organizationMember: { findUnique, update },
    } as never);

    await expect(updateMemberRoleAction("org-1", "foreign-member", OrganizationRole.ADMIN)).resolves.toEqual({
      ok: false,
      error: "Member not found.",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("does not let an organization admin grant the Owner role", async () => {
    const findUnique = jest.fn()
      .mockResolvedValueOnce({ organizationId: "org-1", userId: "admin-1", role: OrganizationRole.ADMIN })
      .mockResolvedValueOnce({
        id: "member-2",
        organizationId: "org-1",
        userId: "person-2",
        role: OrganizationRole.EDITOR,
        user: { primaryEmail: "person@example.test" },
      });
    const update = jest.fn();
    jest.mocked(auth).mockResolvedValue({ user: { id: "admin-1", isStaff: false } } as never);
    jest.mocked(getPrismaClient).mockReturnValue({
      organizationMember: { findUnique, update },
    } as never);

    await expect(updateMemberRoleAction("org-1", "member-2", OrganizationRole.OWNER)).resolves.toEqual({
      ok: false,
      error: "Only an Owner can grant the Owner role.",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("does not let the current Owner accidentally orphan their organization", async () => {
    const findUnique = jest.fn()
      .mockResolvedValueOnce({ organizationId: "org-1", userId: "owner-1", role: OrganizationRole.OWNER })
      .mockResolvedValueOnce({
        id: "owner-member",
        organizationId: "org-1",
        userId: "owner-1",
        role: OrganizationRole.OWNER,
        user: { primaryEmail: "owner@example.test" },
      });
    const update = jest.fn();
    jest.mocked(auth).mockResolvedValue({ user: { id: "owner-1", isStaff: false } } as never);
    jest.mocked(getPrismaClient).mockReturnValue({
      organizationMember: { findUnique, update },
    } as never);

    await expect(updateMemberRoleAction("org-1", "owner-member", OrganizationRole.ADMIN)).resolves.toEqual({
      ok: false,
      error: "Transfer ownership before changing your own Owner role.",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects feedback-history reads for an unrelated organization", async () => {
    const findMany = jest.fn();
    jest.mocked(auth).mockResolvedValue({ user: { id: "coach-1", isStaff: false } } as never);
    jest.mocked(getPrismaClient).mockReturnValue({
      organizationMember: { findUnique: jest.fn().mockResolvedValue(null) },
      feedbackTicket: { findMany },
    } as never);

    await expect(getOrgFeedbackTicketsAction("org-private")).rejects.toThrow(
      "Unauthorized to access organization feedback tickets",
    );
    expect(findMany).not.toHaveBeenCalled();
  });

  it("shows an ordinary customer only their own support tickets", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    jest.mocked(auth).mockResolvedValue({ user: { id: "coach-1", isStaff: false } } as never);
    jest.mocked(getPrismaClient).mockReturnValue({
      organizationMember: { findUnique: jest.fn().mockResolvedValue({ organizationId: "org-1" }) },
      feedbackTicket: { findMany },
    } as never);

    await getOrgFeedbackTicketsAction("org-1");

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "coach-1" },
    }));
  });

  it("allows Quipsly staff to support an organization without joining it", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    jest.mocked(auth).mockResolvedValue({ user: { id: "staff-1", isStaff: true } } as never);
    jest.mocked(getPrismaClient).mockReturnValue({
      organizationMember: { findUnique: jest.fn().mockResolvedValue(null) },
      feedbackTicket: { findMany },
    } as never);

    await getOrgFeedbackTicketsAction("org-1");

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { OR: [{ organizationId: "org-1" }, { userId: "staff-1" }] },
    }));
  });
});
