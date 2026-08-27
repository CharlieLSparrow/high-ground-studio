/** @jest-environment node */

import { ensureQuipslyStarterStateForUser } from "./quipsly-onboarding";
import { ensureManagedUserRecord } from "./managed-user-provisioning";

jest.mock("server-only", () => ({}));
jest.mock("./quipsly-onboarding", () => ({
  ensureQuipslyStarterStateForUser: jest.fn(async () => ({ homeNest: { id: "home-1" } })),
}));

function harness(existing: any = null) {
  const user = {
    findFirst: jest.fn(async () => existing),
    create: jest.fn(async ({ data }: any) => ({ id: "user-1", primaryEmail: data.primaryEmail })),
    update: jest.fn(async () => ({ id: existing?.id || "user-1" })),
    findUniqueOrThrow: jest.fn(async () => ({ id: existing.id, primaryEmail: existing.primaryEmail })),
  };
  const userRole = { createMany: jest.fn(async () => ({ count: 1 })) };
  const userEvent = { create: jest.fn(async () => ({ id: "event-1" })) };
  const prisma = {
    user,
    userRole,
    userEvent,
    $transaction: jest.fn(async (run: any) => run({ user, userRole, userEvent })),
  };
  return { prisma, user, userRole, userEvent };
}

const actor = { userId: "owner-1", email: "owner@example.com", source: "admin-users" };

describe("managed user provisioning", () => {
  beforeEach(() => jest.clearAllMocks());

  it("prepares an ordinary coach without claiming their email is verified", async () => {
    const state = harness();
    const result = await ensureManagedUserRecord({
      email: "coach@example.com",
      name: "Coach Person",
      role: "COACH",
      actor,
      prisma: state.prisma as never,
    });

    expect(result.created).toBe(true);
    expect(state.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        primaryEmail: "coach@example.com",
        emailVerified: undefined,
      }),
    }));
    expect(state.userEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        eventName: "Admin: user provisioning updated",
        payloadJson: expect.objectContaining({ identityVerified: false }),
      }),
    }));
    expect(ensureQuipslyStarterStateForUser).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      email: "coach@example.com",
    }));
  });

  it("records identity verification only for the isolated Firebase reviewer path", async () => {
    const state = harness();
    await ensureManagedUserRecord({
      email: "reviewer@dev.test",
      role: "CLIENT",
      firebaseUid: "firebase-reviewer-1",
      actor,
      prisma: state.prisma as never,
    });

    const data = state.user.create.mock.calls[0][0].data;
    expect(data.firebaseUid).toBe("firebase-reviewer-1");
    expect(data.emailVerified).toBeInstanceOf(Date);
  });

  it("refuses to overwrite an existing Firebase identity link", async () => {
    const state = harness({
      id: "user-1",
      primaryEmail: "reviewer@dev.test",
      name: null,
      firebaseUid: "firebase-original",
      roles: [],
    });
    await expect(ensureManagedUserRecord({
      email: "reviewer@dev.test",
      role: "CLIENT",
      firebaseUid: "firebase-other",
      actor,
      prisma: state.prisma as never,
    })).rejects.toThrow("different Firebase identity");
    expect(state.prisma.$transaction).not.toHaveBeenCalled();
  });
});
