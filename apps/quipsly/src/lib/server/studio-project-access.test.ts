import { resolveStudioProjectAccess } from "@/lib/server/studio-project-access";

jest.mock("@/lib/server/quipsly-onboarding", () => ({
  ensureQuipslyStarterStateForUser: jest.fn(),
}));
jest.mock("@/lib/server/studio-user-identity", () => ({
  ensureInvitedStudioUserByEmail: jest.fn(),
}));

describe("resolveStudioProjectAccess", () => {
  const originalOwnerOverride = process.env.QUIPSLY_OWNER_OVERRIDE;

  afterEach(() => {
    if (originalOwnerOverride === undefined) {
      delete process.env.QUIPSLY_OWNER_OVERRIDE;
    } else {
      process.env.QUIPSLY_OWNER_OVERRIDE = originalOwnerOverride;
    }
  });

  it("does not let the retired localhost owner override impersonate a signed-in account", async () => {
    process.env.QUIPSLY_OWNER_OVERRIDE = "true";
    const prisma = {
      studioProject: {
        findFirst: jest.fn().mockResolvedValue({
          id: "project-1",
          slug: "private-nest",
          workspace: { ownerLabel: "owner@example.com" },
          accessGrants: [],
        }),
      },
      user: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    await expect(resolveStudioProjectAccess({
      projectSlug: "private-nest",
      email: "outsider@example.com",
      prisma: prisma as never,
    })).resolves.toEqual(expect.objectContaining({
      allowed: false,
      role: null,
      source: "none",
    }));
  });

  it("denies an unrelated account when the operator override is disabled", async () => {
    process.env.QUIPSLY_OWNER_OVERRIDE = "false";
    const prisma = {
      studioProject: {
        findFirst: jest.fn().mockResolvedValue({
          id: "project-1",
          slug: "private-nest",
          workspace: { ownerLabel: "owner@example.com" },
          accessGrants: [{ email: "owner@example.com", role: "OWNER", status: "ACTIVE" }],
        }),
      },
      user: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    await expect(resolveStudioProjectAccess({
      projectSlug: "private-nest",
      email: "outsider@example.com",
      prisma: prisma as never,
    })).resolves.toEqual(expect.objectContaining({
      allowed: false,
      role: null,
      source: "none",
    }));
  });
});
