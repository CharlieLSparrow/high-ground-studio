import { ensureInvitedStudioUserByEmail } from "./studio-user-identity";

jest.mock("@/lib/server/prisma-advisory-lock", () => ({
  acquirePrismaAdvisoryTransactionLock: jest.fn(),
}));

describe("ensureInvitedStudioUserByEmail", () => {
  it("preserves suspension and verification state for an existing person", async () => {
    const existing = {
      id: "user-existing",
      primaryEmail: "client@example.com",
      name: null,
      image: null,
      firebaseUid: null,
      isActive: false,
      emailVerified: null,
      aliases: [],
      roles: [],
    };
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue(existing),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...existing, ...data })),
      },
    };

    await ensureInvitedStudioUserByEmail({
      email: "CLIENT@example.com",
      name: "Client Name",
      prisma: prisma as never,
    });

    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: existing.id },
      data: { name: "Client Name" },
    }));
    expect(prisma.user.update.mock.calls[0][0].data).not.toHaveProperty("isActive");
    expect(prisma.user.update.mock.calls[0][0].data).not.toHaveProperty("emailVerified");
  });

  it("prepares a new invite without claiming the mailbox is verified", async () => {
    const created = {
      id: "user-created",
      primaryEmail: "new@example.com",
      name: null,
      image: null,
      aliases: [],
      roles: [],
    };
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(created),
      },
    };

    await ensureInvitedStudioUserByEmail({
      email: "new@example.com",
      prisma: prisma as never,
    });

    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ primaryEmail: "new@example.com", isActive: true });
    expect(data).not.toHaveProperty("emailVerified");
  });
});
