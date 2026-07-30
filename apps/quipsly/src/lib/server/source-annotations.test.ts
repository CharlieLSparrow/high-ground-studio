/** @jest-environment node */

jest.mock("server-only", () => ({}));

import {
  buildVerifiedTextSelector,
  createWritingDraftFromSourceAnnotation,
} from "./source-annotations";

describe("source annotation anchors", () => {
  it("retains quote and position evidence against immutable source text", () => {
    const immutableText =
      "Opening context. Keep the source intact and decisions around it. Closing context.";
    const exactText = "Keep the source intact and decisions around it.";
    const startOffset = immutableText.indexOf(exactText);
    const result = buildVerifiedTextSelector({
      immutableText,
      startOffset,
      endOffset: startOffset + exactText.length,
      exactText,
      contextLength: 16,
    });

    expect(result).toMatchObject({
      ok: true,
      selector: {
        selectorKind: "text-quote",
        startOffset,
        endOffset: startOffset + exactText.length,
        exactText,
      },
    });
    if (result.ok) {
      expect(result.selector.prefixText).toBe("pening context. ");
      expect(result.selector.suffixText).toBe(" Closing context");
      expect(result.selector.sourceFingerprint).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it("fails closed when a stale client selection no longer matches", () => {
    expect(
      buildVerifiedTextSelector({
        immutableText: "The preserved source.",
        startOffset: 4,
        endOffset: 13,
        exactText: "different",
      }),
    ).toEqual({
      ok: false,
      message:
        "The source changed or the selection no longer matches. Reopen the source and select it again.",
    });
  });

  it("rejects empty and out-of-bounds selections", () => {
    expect(
      buildVerifiedTextSelector({
        immutableText: "Source",
        startOffset: 2,
        endOffset: 2,
        exactText: "",
      }).ok,
    ).toBe(false);
    expect(
      buildVerifiedTextSelector({
        immutableText: "Source",
        startOffset: 0,
        endOffset: 99,
        exactText: "Source",
      }).ok,
    ).toBe(false);
  });
});

describe("annotation to writing handoff", () => {
  it("creates an actor-owned draft with pinned evidence, an editable response, and a durable use receipt", async () => {
    const updatedAt = new Date("2026-07-18T18:00:00.000Z");
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: "annotation-1",
            body: "This could frame the opening.",
            exactText: "Keep the source intact.",
            kind: "question",
            visibility: "private",
            createdByUserId: "user-1",
            updatedAt,
            sourceUnitId: "source-1",
            sourceTitle: "Production philosophy",
            author: "Charlie",
            sourceUrl: "https://example.com/source",
            sourcePath: null,
            sourceFingerprint: "fingerprint",
          },
        ]),
      studioDocument: {
        create: jest.fn().mockResolvedValue({ id: "document-db-1" }),
      },
      studioDocumentBlock: {
        create: jest.fn()
          .mockResolvedValueOnce({ id: "evidence-block-db-1" })
          .mockResolvedValueOnce({ id: "response-block-db-1" }),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
      studioDocumentOperation: {
        create: jest.fn().mockResolvedValue({ id: "operation-1" }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    } as any;

    const result = await createWritingDraftFromSourceAnnotation(prisma, {
      annotationId: "annotation-1",
      projectId: "project-1",
      projectSlug: "high-ground",
      actorUserId: "user-1",
      actorEmail: "person@example.com",
      clientRequestId: "handoff-1",
      expectedUpdatedAt: updatedAt,
    });

    expect(result).toMatchObject({
      ok: true,
      reused: false,
      blockId: "evidence-block-db-1",
      responseBlockId: "response-block-db-1",
      href: expect.stringMatching(
        /^\/create\?project=high-ground&document=document-db-1&block=response-block-db-1$/,
      ),
    });
    expect(tx.studioDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          projectId: "project-1",
          personalOwnerUserId: "user-1",
          projectionStatus: "draft",
          isPrivate: true,
        }),
      }),
    );
    expect(tx.studioDocumentBlock.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          body: expect.stringContaining("> Keep the source intact."),
          externalId: "annotation-evidence:annotation-1",
          isPrivate: true,
        }),
      }),
    );
    expect(tx.studioDocumentBlock.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          body: "This could frame the opening.",
          externalId: "annotation-response:annotation-1",
          isPrivate: true,
        }),
      }),
    );
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.studioDocumentOperation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          operationType: "create-draft-from-source-annotation",
          reversible: true,
        }),
      }),
    );
  });

  it("returns the same draft for an exact replay of the same annotation revision", async () => {
    const updatedAt = new Date("2026-07-18T18:00:00.000Z");
    const tx = {
      $queryRaw: jest.fn().mockResolvedValueOnce([
        {
          annotationId: "annotation-1",
          projectId: "project-1",
          documentId: "document-db-1",
          documentStableId: "document-stable-1",
          blockId: "block-db-1",
          blockStableId: "block-stable-1",
          responseBlockId: "response-block-db-1",
          responseBlockStableId: "response-block-stable-1",
          sourceJson: {
            kind: "quipsly-source-annotation-use-v1",
            annotationRevision: updatedAt.toISOString(),
            responseBlockId: "response-block-db-1",
            responseBlockStableId: "response-block-stable-1",
          },
        },
      ]),
      studioDocument: { create: jest.fn() },
      studioDocumentBlock: { create: jest.fn() },
      $executeRaw: jest.fn(),
      studioDocumentOperation: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    } as any;

    await expect(
      createWritingDraftFromSourceAnnotation(prisma, {
        annotationId: "annotation-1",
        projectId: "project-1",
        projectSlug: "high-ground",
        actorUserId: "user-1",
        actorEmail: "person@example.com",
        clientRequestId: "handoff-1",
        expectedUpdatedAt: updatedAt,
      }),
    ).resolves.toEqual({
      ok: true,
      documentId: "document-db-1",
      documentStableId: "document-stable-1",
      blockId: "block-db-1",
      blockStableId: "block-stable-1",
      responseBlockId: "response-block-db-1",
      responseBlockStableId: "response-block-stable-1",
      href: "/create?project=high-ground&document=document-db-1&block=response-block-db-1",
      reused: true,
    });
    expect(tx.studioDocument.create).not.toHaveBeenCalled();
  });

  it("retries one serialization conflict and then reuses the canonical draft", async () => {
    const updatedAt = new Date("2026-07-18T18:00:00.000Z");
    const tx = {
      $queryRaw: jest.fn().mockResolvedValueOnce([
        {
          annotationId: "annotation-1",
          projectId: "project-1",
          documentId: "document-db-1",
          documentStableId: "document-stable-1",
          blockId: "block-db-1",
          blockStableId: "block-stable-1",
          responseBlockId: "response-block-db-1",
          responseBlockStableId: "response-block-stable-1",
          sourceJson: {
            kind: "quipsly-source-annotation-use-v1",
            annotationRevision: updatedAt.toISOString(),
            responseBlockId: "response-block-db-1",
            responseBlockStableId: "response-block-stable-1",
          },
        },
      ]),
      studioDocument: { create: jest.fn() },
      studioDocumentBlock: { create: jest.fn() },
      $executeRaw: jest.fn(),
      studioDocumentOperation: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest
        .fn()
        .mockRejectedValueOnce({ code: "P2034" })
        .mockImplementationOnce(
          async (callback: (client: typeof tx) => unknown) => callback(tx),
        ),
    } as any;

    await expect(
      createWritingDraftFromSourceAnnotation(prisma, {
        annotationId: "annotation-1",
        projectId: "project-1",
        projectSlug: "high-ground",
        actorUserId: "user-1",
        actorEmail: "person@example.com",
        clientRequestId: "handoff-1",
        expectedUpdatedAt: updatedAt,
      }),
    ).resolves.toMatchObject({
      ok: true,
      documentId: "document-db-1",
      blockId: "block-db-1",
      reused: true,
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(prisma.$transaction).toHaveBeenNthCalledWith(
      2,
      expect.any(Function),
      { isolationLevel: "Serializable" },
    );
    expect(tx.studioDocument.create).not.toHaveBeenCalled();
  });

  it("rejects a reused handoff identity bound to another annotation or revision", async () => {
    const updatedAt = new Date("2026-07-18T18:00:00.000Z");
    const tx = {
      $queryRaw: jest.fn().mockResolvedValueOnce([
        {
          annotationId: "annotation-other",
          projectId: "project-1",
          documentId: "document-db-1",
          documentStableId: "document-stable-1",
          blockId: "block-db-1",
          blockStableId: "block-stable-1",
          responseBlockId: "response-block-db-1",
          responseBlockStableId: "response-block-stable-1",
          sourceJson: {
            kind: "quipsly-source-annotation-use-v1",
            annotationRevision: "2026-07-18T17:00:00.000Z",
            responseBlockId: "response-block-db-1",
            responseBlockStableId: "response-block-stable-1",
          },
        },
      ]),
      studioDocument: { create: jest.fn() },
      studioDocumentBlock: { create: jest.fn() },
      $executeRaw: jest.fn(),
      studioDocumentOperation: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    } as any;

    await expect(
      createWritingDraftFromSourceAnnotation(prisma, {
        annotationId: "annotation-1",
        projectId: "project-1",
        projectSlug: "high-ground",
        actorUserId: "user-1",
        actorEmail: "person@example.com",
        clientRequestId: "handoff-1",
        expectedUpdatedAt: updatedAt,
      }),
    ).resolves.toEqual({
      ok: false,
      code: "CONFLICT",
      message:
        "That writing handoff identity already belongs to a different source decision.",
    });
    expect(tx.studioDocument.create).not.toHaveBeenCalled();
  });
});
