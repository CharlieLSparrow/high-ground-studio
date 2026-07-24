/** @jest-environment node */

jest.mock("@/lib/prisma", () => ({
  getPrismaClient: jest.fn(),
}));

jest.mock("@/lib/server/quipsly-session", () => ({
  getQuipslySessionFromRequest: jest.fn(),
}));

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { POST } from "./route";

const USER_ID = "user-owner";
const NOTE_ID = "11111111-1111-4111-8111-111111111111";
const DOCUMENT_ID = "document-id";

const session = {
  user: {
    id: USER_ID,
    email: "owner@example.com",
    primaryEmail: "owner@example.com",
  },
};

function request(
  payload: unknown,
  authorization = "Bearer verified-firebase-id-token",
) {
  return new Request("http://localhost/api/v1/notes/parse", {
    method: "POST",
    headers: {
      authorization,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

function prismaMocks() {
  const tx = {
    studioDocumentBlock: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
  };
  const transaction = jest.fn(async (operation: (client: typeof tx) => unknown) =>
    operation(tx),
  );

  return {
    prisma: {
      studioDocument: { findUnique: jest.fn() },
      quipslyNote: { findFirst: jest.fn() },
      $transaction: transaction,
    },
    tx,
  };
}

function ownedDocument({
  sourceLabel = "nest-kind:home",
  hasOwnerGrant = true,
}: {
  sourceLabel?: string;
  hasOwnerGrant?: boolean;
} = {}) {
  return {
    id: DOCUMENT_ID,
    stableId: NOTE_ID,
    sourceLabel: "quipsly-native-note",
    project: {
      sourceLabel,
      accessGrants: hasOwnerGrant ? [{ id: "owner-grant" }] : [],
    },
  };
}

describe("POST /api/v1/notes/parse", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("requires normal authentication even for the former dev token", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null);

    const response = await POST(
      request({ documentId: DOCUMENT_ID, rawText: "Private" }, "Bearer dev-token"),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "UNAUTHORIZED" });
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("rejects a document without the authenticated user's Home Nest owner grant", async () => {
    const { prisma, tx } = prismaMocks();
    prisma.studioDocument.findUnique.mockResolvedValue(
      ownedDocument({ hasOwnerGrant: false }),
    );
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);
    jest
      .mocked(getQuipslySessionFromRequest)
      .mockResolvedValue(session as never);

    const response = await POST(
      request({ documentId: DOCUMENT_ID, rawText: "Private" }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      code: "NOTE_DOCUMENT_NOT_FOUND",
    });
    expect(prisma.quipslyNote.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.studioDocumentBlock.deleteMany).not.toHaveBeenCalled();
  });

  it("rejects an owned Home Nest document without an owned source note", async () => {
    const { prisma, tx } = prismaMocks();
    prisma.studioDocument.findUnique.mockResolvedValue(ownedDocument());
    prisma.quipslyNote.findFirst.mockResolvedValue(null);
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);
    jest
      .mocked(getQuipslySessionFromRequest)
      .mockResolvedValue(session as never);

    const response = await POST(
      request({ documentId: DOCUMENT_ID, rawText: "Private" }),
    );

    expect(response.status).toBe(404);
    expect(prisma.quipslyNote.findFirst).toHaveBeenCalledWith({
      where: { id: NOTE_ID, userId: USER_ID },
      select: { id: true },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.studioDocumentBlock.deleteMany).not.toHaveBeenCalled();
  });

  it("rebuilds only an authenticated owner's note document", async () => {
    const { prisma, tx } = prismaMocks();
    prisma.studioDocument.findUnique.mockResolvedValue(ownedDocument());
    prisma.quipslyNote.findFirst.mockResolvedValue({ id: NOTE_ID });
    tx.studioDocumentBlock.deleteMany.mockResolvedValue({ count: 2 });
    tx.studioDocumentBlock.createMany.mockResolvedValue({ count: 2 });
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);
    jest
      .mocked(getQuipslySessionFromRequest)
      .mockResolvedValue(session as never);

    const response = await POST(
      request({ documentId: DOCUMENT_ID, rawText: "# Heading\n\nBody" }),
    );

    expect(response.status).toBe(200);
    expect(tx.studioDocumentBlock.deleteMany).toHaveBeenCalledWith({
      where: { documentId: DOCUMENT_ID },
    });
    expect(tx.studioDocumentBlock.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          documentId: DOCUMENT_ID,
          title: "Heading",
          body: "# Heading",
          isPrivate: true,
        }),
        expect.objectContaining({
          documentId: DOCUMENT_ID,
          title: null,
          body: "Body",
          isPrivate: true,
        }),
      ]),
    });
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      success: true,
      blockCount: 2,
    });
  });

  it("returns a failure instead of claiming success when the transaction fails", async () => {
    const { prisma } = prismaMocks();
    prisma.studioDocument.findUnique.mockResolvedValue(ownedDocument());
    prisma.quipslyNote.findFirst.mockResolvedValue({ id: NOTE_ID });
    prisma.$transaction.mockRejectedValue(new Error("database offline"));
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);
    jest
      .mocked(getQuipslySessionFromRequest)
      .mockResolvedValue(session as never);

    const response = await POST(
      request({ documentId: DOCUMENT_ID, rawText: "Private" }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "PARSE_FAILED",
    });
  });
});
