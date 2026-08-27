import {
  linkedFirebaseSubjects,
  revokeSupportUserSessions,
  setSupportUserActiveState,
} from "./support-user-lifecycle";

jest.mock("@/lib/firebase/firebase-admin", () => ({ adminAuth: {} }));

function target(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-target",
    isActive: true,
    firebaseUid: "firebase-primary",
    authIdentities: [
      { subject: "firebase-primary" },
      { subject: "firebase-google" },
    ],
    organizationMemberships: [{ organizationId: "org-1" }],
    ...overrides,
  };
}

function prismaFor(record: ReturnType<typeof target> | null) {
  const tx = {
    user: { update: jest.fn().mockResolvedValue({}) },
    userEvent: { create: jest.fn().mockResolvedValue({}) },
  };
  return {
    user: { findUnique: jest.fn().mockResolvedValue(record) },
    userEvent: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn().mockImplementation((callback) => callback(tx)),
    tx,
  };
}

function firebaseAdmin() {
  return {
    updateUser: jest.fn().mockResolvedValue({}),
    revokeRefreshTokens: jest.fn().mockResolvedValue(undefined),
  };
}

const actor = { userId: "support-1", email: "support@quipsly.com" };

describe("support user lifecycle", () => {
  it("deduplicates compatibility and identity-ledger Firebase subjects", () => {
    expect(linkedFirebaseSubjects(target())).toEqual(["firebase-primary", "firebase-google"]);
  });

  it("suspends and revokes every linked Firebase identity before recording the app hold", async () => {
    const prisma = prismaFor(target());
    const firebaseAuth = firebaseAdmin();

    await expect(setSupportUserActiveState({
      userId: "user-target",
      active: false,
      actor,
      prisma: prisma as never,
      firebaseAuth,
    })).resolves.toMatchObject({
      status: "changed",
      linkedIdentityCount: 2,
      updatedIdentityCount: 2,
    });

    expect(firebaseAuth.updateUser.mock.calls).toEqual([
      ["firebase-primary", { disabled: true }],
      ["firebase-google", { disabled: true }],
    ]);
    expect(firebaseAuth.revokeRefreshTokens.mock.calls).toEqual([
      ["firebase-primary"],
      ["firebase-google"],
    ]);
    expect(prisma.tx.user.update).toHaveBeenCalledWith({
      where: { id: "user-target" },
      data: { isActive: false },
    });
    expect(prisma.tx.userEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        eventName: "Support: account suspended",
        payloadJson: expect.objectContaining({ updatedIdentityCount: 2 }),
      }),
    }));
  });

  it("keeps a stale missing Firebase subject from blocking an app suspension", async () => {
    const prisma = prismaFor(target());
    const firebaseAuth = firebaseAdmin();
    firebaseAuth.updateUser
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(Object.assign(new Error("missing"), { code: "auth/user-not-found" }));

    await expect(setSupportUserActiveState({
      userId: "user-target",
      active: false,
      actor,
      prisma: prisma as never,
      firebaseAuth,
    })).resolves.toMatchObject({
      status: "changed",
      updatedIdentityCount: 1,
      missingIdentityCount: 1,
    });
    expect(prisma.tx.user.update).toHaveBeenCalled();
  });

  it("restores Firebase disabled state if the durable app update fails", async () => {
    const prisma = prismaFor(target());
    prisma.$transaction.mockRejectedValueOnce(new Error("database unavailable"));
    const firebaseAuth = firebaseAdmin();

    await expect(setSupportUserActiveState({
      userId: "user-target",
      active: false,
      actor,
      prisma: prisma as never,
      firebaseAuth,
    })).rejects.toThrow("database unavailable");

    expect(firebaseAuth.updateUser.mock.calls).toEqual([
      ["firebase-primary", { disabled: true }],
      ["firebase-google", { disabled: true }],
      ["firebase-primary", { disabled: false }],
      ["firebase-google", { disabled: false }],
    ]);
  });

  it("revokes sessions for every linked identity and records aggregate evidence", async () => {
    const prisma = prismaFor(target());
    const firebaseAuth = firebaseAdmin();

    await expect(revokeSupportUserSessions({
      userId: "user-target",
      actor,
      prisma: prisma as never,
      firebaseAuth,
    })).resolves.toMatchObject({ status: "revoked", revokedIdentityCount: 2 });
    expect(firebaseAuth.revokeRefreshTokens).toHaveBeenCalledTimes(2);
    expect(prisma.userEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        eventName: "Support: login sessions revoked",
        payloadJson: expect.objectContaining({ revokedIdentityCount: 2 }),
      }),
    }));
  });
});
