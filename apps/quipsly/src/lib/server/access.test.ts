import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import {
  findStudioProjectForAccess,
  resolveStudioProjectAccess,
} from "@/lib/server/studio-project-access";

import { requireProjectAccess } from "./access";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/studio-project-access", () => ({
  findStudioProjectForAccess: jest.fn(),
  normalizeAccessEmail: (email?: string | null) => (email || "").trim().toLowerCase(),
  resolveStudioProjectAccess: jest.fn(),
}));

describe("project access boundary", () => {
  beforeEach(() => jest.clearAllMocks());

  it("rejects unauthenticated access before reading the database in development", async () => {
    const original = process.env.NODE_ENV;
    Object.defineProperty(process.env, "NODE_ENV", { value: "development", configurable: true, writable: true });
    jest.mocked(auth).mockResolvedValue(null as any);
    await expect(requireProjectAccess("quipsly-dev-lab", "read")).rejects.toThrow("UNAUTHORIZED: Not signed in");
    expect(getPrismaClient).not.toHaveBeenCalled();
    Object.defineProperty(process.env, "NODE_ENV", { value: original, configurable: true, writable: true });
  });

  it("rejects unauthenticated access before reading the database in production", async () => {
    jest.mocked(auth).mockResolvedValue(null as any);
    await expect(requireProjectAccess("quipsly-dev-lab", "publish")).rejects.toThrow("UNAUTHORIZED: Not signed in");
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("authorizes a customer Nest in its own workspace through the canonical grant resolver", async () => {
    const prisma = {
      studioDocument: {
        findFirst: jest.fn().mockResolvedValue({ id: "document-1", projectId: "project-1" }),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: "user-1", primaryEmail: "member@example.com" }),
      },
    };
    jest.mocked(auth).mockResolvedValue({
      user: { id: "user-1", primaryEmail: "Member@Example.com" },
    } as any);
    jest.mocked(getPrismaClient).mockReturnValue(prisma as any);
    jest.mocked(findStudioProjectForAccess).mockResolvedValue({
      id: "project-1",
      slug: "customer-nest",
      workspace: { id: "workspace-customer", slug: "member-home" },
      accessGrants: [{ email: "member@example.com", status: "ACTIVE", role: "EDITOR" }],
    } as any);
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({
      allowed: true,
      role: "EDITOR",
      source: "grant",
      projectId: "project-1",
      projectSlug: "customer-nest",
    });

    const result = await requireProjectAccess("customer-nest", "record");

    expect(resolveStudioProjectAccess).toHaveBeenCalledWith(expect.objectContaining({
      projectSlug: "customer-nest",
      email: "member@example.com",
      action: "write",
      prisma,
    }));
    expect(result.workspace).toEqual({ id: "workspace-customer", slug: "member-home" });
    expect(result.document.id).toBe("document-1");
  });

  it("maps publishing to manage access and fails closed when denied", async () => {
    const prisma = {};
    jest.mocked(auth).mockResolvedValue({
      user: { id: "user-1", primaryEmail: "viewer@example.com" },
    } as any);
    jest.mocked(getPrismaClient).mockReturnValue(prisma as any);
    jest.mocked(findStudioProjectForAccess).mockResolvedValue({
      id: "project-1",
      slug: "customer-nest",
      workspace: { id: "workspace-customer" },
      accessGrants: [],
    } as any);
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({
      allowed: false,
      role: "VIEWER",
      source: "grant",
      projectId: "project-1",
      projectSlug: "customer-nest",
    });

    await expect(requireProjectAccess("customer-nest", "publish")).rejects.toThrow(
      "FORBIDDEN: Insufficient permissions to perform publish on this project",
    );
    expect(resolveStudioProjectAccess).toHaveBeenCalledWith(expect.objectContaining({ action: "manage" }));
  });
});
