/** @jest-environment node */

jest.mock("server-only", () => ({}));

import {
  assertPersonalWritingDocumentAccess,
  canReadPersonalWritingDocument,
  personalWritingDocumentVisibilityWhere,
  resolvePersonalWritingActorUserId,
} from "./personal-writing-documents";

describe("personal writing document access", () => {
  it("keeps project documents visible while limiting personal documents to their owner", () => {
    expect(canReadPersonalWritingDocument(null, "actor-1")).toBe(true);
    expect(canReadPersonalWritingDocument("actor-1", "actor-1")).toBe(true);
    expect(canReadPersonalWritingDocument("actor-1", "actor-2")).toBe(false);
    expect(() => assertPersonalWritingDocumentAccess("actor-1", "actor-2"))
      .toThrow("Document not found.");
  });

  it("builds a fail-closed Prisma filter for signed-out and signed-in reads", () => {
    expect(personalWritingDocumentVisibilityWhere(null)).toEqual({
      personalOwnerUserId: null,
    });
    expect(personalWritingDocumentVisibilityWhere("actor-1")).toEqual({
      OR: [
        { personalOwnerUserId: null },
        { personalOwnerUserId: "actor-1" },
      ],
    });
  });

  it("resolves canonical users through primary or alias email", async () => {
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: "actor-1" }),
      },
    } as any;
    await expect(resolvePersonalWritingActorUserId(prisma, " Person@Example.com "))
      .resolves.toBe("actor-1");
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { primaryEmail: "person@example.com" },
          { aliases: { some: { email: "person@example.com" } } },
        ],
      },
      select: { id: true },
    });
  });
});
