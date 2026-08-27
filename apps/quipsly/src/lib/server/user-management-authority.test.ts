/** @jest-environment node */

import {
  hasPlatformOwnerRole,
  isUserManagementAdminEmail,
  isUserManagementBreakGlassEnabled,
  listConfiguredUserManagementEmails,
} from "./user-management";

jest.mock("server-only", () => ({}));
jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("next/navigation", () => ({ redirect: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-onboarding", () => ({ QUIPSLY_FREE_PLAN_SLUG: "quipsly-free" }));
jest.mock("@/lib/server/studio-project-access", () => ({
  normalizeAccessEmail: (value: unknown) => String(value || "").trim().toLowerCase(),
}));
jest.mock("@/lib/studio/project-registry", () => ({
  sourceLabelForNestKind: (value: string) => `nest-kind:${value}`,
}));

const originalEmails = process.env.QUIPSLY_ADMIN_EMAILS;
const originalEnabled = process.env.QUIPSLY_ADMIN_BREAK_GLASS_ENABLED;

afterEach(() => {
  if (originalEmails === undefined) delete process.env.QUIPSLY_ADMIN_EMAILS;
  else process.env.QUIPSLY_ADMIN_EMAILS = originalEmails;
  if (originalEnabled === undefined) delete process.env.QUIPSLY_ADMIN_BREAK_GLASS_ENABLED;
  else process.env.QUIPSLY_ADMIN_BREAK_GLASS_ENABLED = originalEnabled;
});

describe("staff authority", () => {
  it("uses database roles as the ordinary platform-owner signal", () => {
    expect(hasPlatformOwnerRole(["COACH", "OWNER"])).toBe(true);
    expect(hasPlatformOwnerRole(["COACH"])).toBe(false);
    expect(hasPlatformOwnerRole(null)).toBe(false);
  });

  it("does not grant staff authority from a configured email while break glass is disabled", () => {
    process.env.QUIPSLY_ADMIN_EMAILS = " Charlie@Example.com ";
    process.env.QUIPSLY_ADMIN_BREAK_GLASS_ENABLED = "false";

    expect(listConfiguredUserManagementEmails()).toEqual(["charlie@example.com"]);
    expect(isUserManagementBreakGlassEnabled()).toBe(false);
    expect(isUserManagementAdminEmail("charlie@example.com")).toBe(false);
  });

  it("accepts only an exact configured email during an explicit emergency", () => {
    process.env.QUIPSLY_ADMIN_EMAILS = "charlie@example.com, support@example.com";
    process.env.QUIPSLY_ADMIN_BREAK_GLASS_ENABLED = "true";

    expect(isUserManagementAdminEmail("CHARLIE@example.com")).toBe(true);
    expect(isUserManagementAdminEmail("other@example.com")).toBe(false);
  });
});
