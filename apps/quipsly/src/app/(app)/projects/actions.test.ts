import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getPrismaClient } from "@/lib/prisma";
import {
  createNestWithOwner,
  QuipslyNestCreateIdentityConflictError,
} from "@/lib/server/quipsly-core";
import { getQuipslySession } from "@/lib/server/quipsly-session";
import { quipslyCoachCapabilityAccess } from "@/lib/server/subscription-entitlements";
import { createNestAction } from "./actions";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-core", () => {
  class IdentityConflict extends Error {}
  return {
    createNestWithOwner: jest.fn(),
    QuipslyNestCreateIdentityConflictError: IdentityConflict,
  };
});
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySession: jest.fn() }));
jest.mock("@/lib/server/subscription-entitlements", () => ({ quipslyCoachCapabilityAccess: jest.fn() }));
jest.mock("@/lib/server/studio-project-access", () => ({
  normalizeAccessEmail: (value?: string | null) =>
    String(value || "").trim().toLowerCase() || null,
}));
jest.mock("@/lib/studio/project-registry", () => ({
  normalizeNestKind: (value?: string | null) =>
    String(value || "writing").trim().toLowerCase(),
}));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("next/navigation", () => ({
  redirect: jest.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

const requestId = "123e4567-e89b-42d3-a456-426614174000";

function form(overrides: Record<string, string> = {}) {
  const data = new FormData();
  for (const [name, value] of Object.entries({
    name: "High Ground Odyssey",
    description: "Podcast episodes and production work.",
    template: "production",
    documentTitle: "",
    clientRequestId: requestId,
    ...overrides,
  })) {
    data.set(name, value);
  }
  return data;
}

describe("createNestAction", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getQuipslySession).mockResolvedValue({
      user: {
        id: "user-1",
        primaryEmail: " OWNER@EXAMPLE.COM ",
        email: "fallback@example.com",
        isStaff: false,
      },
    } as never);
    jest.mocked(getPrismaClient).mockReturnValue({ kind: "prisma" } as never);
    jest.mocked(quipslyCoachCapabilityAccess).mockResolvedValue({
      allowed: true,
      capability: "workspace.private_nests",
      accessMode: "SUBSCRIBED",
      entitlement: null,
    } as never);
    jest.mocked(createNestWithOwner).mockResolvedValue({
      nest: { id: "project-1", slug: "high-ground-odyssey", name: "High Ground Odyssey" },
      document: { id: "document-1", stableId: "doc-high-ground-odyssey", title: "Production Nest: Episode Control Room" },
      idempotentReplay: false,
      receiptId: "receipt-1",
    } as never);
  });

  it("rejects a form that lost its protected retry identity before any write", async () => {
    await expect(createNestAction(
      { error: null },
      form({ clientRequestId: "not-a-uuid" }),
    )).resolves.toEqual({
      error: expect.stringContaining("protected retry identity"),
    });

    expect(getQuipslySession).not.toHaveBeenCalled();
    expect(createNestWithOwner).not.toHaveBeenCalled();
  });

  it("does not allow a forged Home Nest template through the public creation form", async () => {
    await expect(createNestAction(
      { error: null },
      form({ template: "home" }),
    )).resolves.toEqual({
      error: "Choose one of the available starting shapes.",
    });

    expect(createNestWithOwner).not.toHaveBeenCalled();
  });

  it("passes the exact actor, purpose, template title, and retry identity to the canonical kernel", async () => {
    await expect(createNestAction({ error: null }, form())).rejects.toThrow("NEXT_REDIRECT");

    expect(quipslyCoachCapabilityAccess).toHaveBeenCalledWith({
      prisma: expect.objectContaining({ kind: "prisma" }),
      userId: "user-1",
      capability: "workspace.private_nests",
      isStaff: false,
    });
    expect(createNestWithOwner).toHaveBeenCalledWith({
      prisma: expect.objectContaining({ kind: "prisma" }),
      name: "High Ground Odyssey",
      description: "Podcast episodes and production work.",
      nestKind: "production",
      documentTitle: "Production Nest: Episode Control Room",
      ownerEmail: "owner@example.com",
      clientRequestId: requestId,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/projects");
    expect(redirect).toHaveBeenCalledWith("/nests/high-ground-odyssey");
  });

  it("routes an unpaid coach directly to the plan instead of a beta gate", async () => {
    jest.mocked(quipslyCoachCapabilityAccess).mockResolvedValue({
      allowed: false,
      capability: "workspace.private_nests",
      accessMode: "NONE",
      entitlement: null,
    } as never);

    await expect(createNestAction({ error: null }, form())).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/settings?reason=private-nest#subscription");
    expect(createNestWithOwner).not.toHaveBeenCalled();
  });

  it("keeps an identity conflict visible without navigating or inventing a write", async () => {
    jest.mocked(createNestWithOwner).mockRejectedValue(
      new QuipslyNestCreateIdentityConflictError(),
    );

    await expect(createNestAction({ error: null }, form())).resolves.toEqual({
      error: expect.stringContaining("already used"),
    });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});
