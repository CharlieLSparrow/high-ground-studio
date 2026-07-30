jest.mock("../prisma", () => ({
  getPrismaClient: jest.fn(),
}));

jest.mock("./embeddings", () => ({
  hybridSearchExamples: jest.fn(),
  searchSemanticLoreQuotes: jest.fn().mockResolvedValue([]),
}));

import { getPrismaClient } from "../prisma";
import { buildContextPacket, searchExamples, searchQuotes } from "./search";
import { hybridSearchExamples } from "./embeddings";

const mockedGetPrismaClient = getPrismaClient as jest.Mock;
const mockedHybridSearchExamples = hybridSearchExamples as jest.Mock;

describe("writing retrieval privacy", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("scopes active-document context to shared documents or the actor's personal documents", async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const findMany = jest.fn().mockResolvedValue([]);
    mockedGetPrismaClient.mockReturnValue({
      studioDocumentBlock: { findFirst, findMany },
    });

    await buildContextPacket(
      {
        documentId: "document-private",
        cursorNodeId: "block-1",
      },
      {
        activeProjectId: "project-1",
        actorUserId: "writer-user",
      },
    );

    const expectedVisibility = {
      OR: [
        { personalOwnerUserId: null },
        { personalOwnerUserId: "writer-user" },
      ],
    };
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        documentId: "document-private",
        document: {
          projectId: "project-1",
          ...expectedVisibility,
        },
        stableId: "block-1",
      },
    });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        documentId: "document-private",
        document: {
          projectId: "project-1",
          ...expectedVisibility,
        },
      }),
    }));
  });

  test("keeps project-wide quote retrieval out of every personal document", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    mockedGetPrismaClient.mockReturnValue({
      studioKnowledgeNode: { findMany },
    });

    await searchQuotes(
      { query: "trust", library: "active-manuscript" },
      { activeProjectId: "project-1" },
    );

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        document: { personalOwnerUserId: null },
      }),
    }));
  });

  test("defends the block read even when a stale shared-search hit names a personal block", async () => {
    mockedHybridSearchExamples.mockResolvedValue([
      { sourceId: "block-private", score: 1 },
    ]);
    const findMany = jest.fn().mockResolvedValue([]);
    mockedGetPrismaClient.mockReturnValue({
      studioDocumentBlock: { findMany },
    });

    await searchExamples(
      { query: "example", library: "active-manuscript" },
      { activeProjectId: "project-1" },
    );

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: { in: ["block-private"] },
        document: { personalOwnerUserId: null },
      },
    }));
  });
});
