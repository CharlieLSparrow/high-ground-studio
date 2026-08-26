/** @jest-environment node */

import { POST } from "./route";
import {
  createNestWithOwner,
  QuipslyNestCreateIdentityConflictError,
} from "@/lib/server/quipsly-core";
import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { quipslyCoachCapabilityAccess } from "@/lib/server/subscription-entitlements";

jest.mock("@/lib/server/quipsly-core", () => ({
  createNestWithOwner: jest.fn(),
  QuipslyNestCreateIdentityConflictError: class QuipslyNestCreateIdentityConflictError extends Error {},
}));
jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));
jest.mock("@/lib/server/subscription-entitlements", () => ({ quipslyCoachCapabilityAccess: jest.fn() }));

const requestId = "123e4567-e89b-42d3-a456-426614174000";

function request(body: Record<string, unknown>) {
  return new Request("https://nest.quipsly.com/api/mobile/capture/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("mobile project creation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: {
        id: "user-1",
        email: "owner@example.com",
        primaryEmail: "owner@example.com",
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
      nest: { id: "project-1", slug: "episode-nine", name: "Episode Nine", kind: "production" },
      document: {
        id: "document-1",
        stableId: "doc-episode-nine",
        nestSlug: "episode-nine",
        title: "Episode Nine Production Document",
        kind: "original-content",
      },
      idempotentReplay: false,
      receiptId: "receipt-1",
    });
  });

  it("requires a signed-in Quipsly identity", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null);

    const response = await POST(request({
      name: "Episode Nine",
      nestKind: "production",
      clientRequestId: requestId,
    }));

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ ok: false, code: "PROJECT_SIGN_IN_REQUIRED" });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("asks an unpaid coach to start or restore a plan without hiding shared work", async () => {
    jest.mocked(quipslyCoachCapabilityAccess).mockResolvedValue({
      allowed: false,
      capability: "workspace.private_nests",
      accessMode: "NONE",
      entitlement: null,
    } as never);

    const response = await POST(request({
      name: "Episode Nine",
      nestKind: "production",
      clientRequestId: requestId,
    }));

    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: "QUIPSLY_SUBSCRIPTION_REQUIRED",
      managementURL: "/settings#subscription",
    });
    expect(createNestWithOwner).not.toHaveBeenCalled();
  });

  it("creates one private canonical project for the exact actor and retry identity", async () => {
    const response = await POST(request({
      name: "  Episode   Nine ",
      description: "  First production rehearsal  ",
      nestKind: "production",
      clientRequestId: requestId,
    }));

    expect(response.status).toBe(200);
    expect(quipslyCoachCapabilityAccess).toHaveBeenCalledWith({
      prisma: expect.objectContaining({ kind: "prisma" }),
      userId: "user-1",
      capability: "workspace.private_nests",
      isStaff: false,
    });
    expect(createNestWithOwner).toHaveBeenCalledWith({
      name: "Episode Nine",
      description: "First production rehearsal",
      nestKind: "production",
      ownerEmail: "owner@example.com",
      clientRequestId: requestId,
    });
    expect(await response.json()).toMatchObject({
      ok: true,
      schema: "quipsly-mobile-project-create-v1",
      project: {
        id: "project-1",
        slug: "episode-nine",
        role: "OWNER",
        canWrite: true,
      },
      boundaries: {
        slugCollisionCannotGrantExistingOwnership: true,
        retryIdentityProtected: true,
        externalSideEffects: false,
      },
    });
  });

  it("returns a held conflict instead of mutating another request", async () => {
    jest.mocked(createNestWithOwner).mockRejectedValue(
      new QuipslyNestCreateIdentityConflictError(),
    );

    const response = await POST(request({
      name: "Episode Nine",
      nestKind: "production",
      clientRequestId: requestId,
    }));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: "PROJECT_REQUEST_ID_CONFLICT",
    });
  });

  it("rejects unsupported project kinds instead of silently changing their meaning", async () => {
    const response = await POST(request({
      name: "Episode Nine",
      nestKind: "podcast-but-not-canonical",
      clientRequestId: requestId,
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, code: "PROJECT_KIND_INVALID" });
    expect(createNestWithOwner).not.toHaveBeenCalled();
  });
});
