/** @jest-environment node */

import { randomUUID } from "node:crypto";

import { getPrismaClient } from "../prisma";
import {
  MockEmbeddingProvider,
  QUIPSLY_EMBEDDING_DIMENSIONS,
  hybridSearchExamples,
  syncProjectEmbeddings,
  type EmbeddingProvider,
} from "./embeddings";

jest.mock("@google/genai", () => ({ GoogleGenAI: jest.fn() }));

const describeDatabase = process.env.QUIPSLY_EMBEDDING_DB_SMOKE === "1" ? describe : describe.skip;
if (process.env.QUIPSLY_EMBEDDING_DB_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) throw new Error("QUIPSLY_LOCAL_DATABASE_URL is required for the research-index smoke.");
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

describeDatabase("research embedding disposable database", () => {
  const prisma = getPrismaClient();
  const suffix = randomUUID();
  const workspaceId = `embedding-smoke-workspace-${suffix}`;
  const projectId = `embedding-smoke-project-${suffix}`;
  const documentId = `embedding-smoke-document-${suffix}`;
  const blockId = `embedding-smoke-block-${suffix}`;
  const quoteId = `embedding-smoke-quote-${suffix}`;

  beforeAll(async () => {
    await prisma.studioWorkspace.create({
      data: {
        id: workspaceId,
        slug: `embedding-smoke-${suffix}`,
        name: "Embedding smoke",
        projects: {
          create: {
            id: projectId,
            slug: "research",
            name: "Research",
            documents: {
              create: {
                id: documentId,
                stableId: `embedding-smoke-stable-${suffix}`,
                title: "High Ground research",
                blocks: {
                  create: {
                    id: blockId,
                    stableId: `embedding-smoke-block-stable-${suffix}`,
                    order: 0,
                    title: "Courage",
                    body: "Charlie and Homer explore courage as the choice to stay present with uncertainty.",
                  },
                },
              },
            },
            quipLoreQuotes: {
              create: {
                id: quoteId,
                text: "A coaching question should make the next honest action easier to see.",
              },
            },
          },
        },
      },
    });
    await prisma.retrievalEmbedding.createMany({
      data: [
        {
          id: `managed-old-${suffix}`,
          sourceOrigin: "studio-document-block",
          sourceId: "obsolete-block",
          projectId,
          contentSnapshot: "Obsolete managed index row",
        },
        {
          id: `unmanaged-${suffix}`,
          sourceOrigin: "external-approved-index",
          sourceId: "external-source",
          projectId,
          contentSnapshot: "A separately managed index row",
        },
      ],
    });
  });

  afterAll(async () => {
    try {
      await prisma.retrievalEmbedding.deleteMany({ where: { projectId } });
      await prisma.studioWorkspace.deleteMany({ where: { id: workspaceId } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it("atomically replaces managed rows, preserves other origins, and stores real 768-dimension vectors", async () => {
    await expect(syncProjectEmbeddings(projectId, new MockEmbeddingProvider())).resolves.toEqual({
      syncedBlocks: 1,
      syncedQuotes: 1,
    });

    const rows = await prisma.retrievalEmbedding.findMany({
      where: { projectId },
      select: { sourceOrigin: true, sourceId: true, contentSnapshot: true },
      orderBy: { sourceOrigin: "asc" },
    });
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceOrigin: "external-approved-index", sourceId: "external-source" }),
      expect.objectContaining({ sourceOrigin: "studio-document-block", sourceId: blockId }),
      expect.objectContaining({ sourceOrigin: "quipsly-lore-quote", sourceId: quoteId }),
    ]));
    expect(rows).toHaveLength(3);

    const dimensions = await prisma.$queryRaw<Array<{ dimensions: number }>>`
      SELECT vector_dims("embedding")::int AS dimensions
      FROM "RetrievalEmbedding"
      WHERE "projectId" = ${projectId} AND "sourceOrigin" = 'studio-document-block'
    `;
    expect(dimensions).toEqual([{ dimensions: QUIPSLY_EMBEDDING_DIMENSIONS }]);
  });

  it("retains the last-known-good database index when the provider fails", async () => {
    const before = await prisma.retrievalEmbedding.findMany({
      where: { projectId },
      select: { id: true, sourceOrigin: true, sourceId: true, contentSnapshot: true },
      orderBy: { id: "asc" },
    });
    const failingProvider: EmbeddingProvider = {
      generateEmbedding: jest.fn().mockRejectedValue(new Error("provider unavailable")),
    };

    await expect(syncProjectEmbeddings(projectId, failingProvider)).rejects.toThrow("provider unavailable");
    await expect(prisma.retrievalEmbedding.findMany({
      where: { projectId },
      select: { id: true, sourceOrigin: true, sourceId: true, contentSnapshot: true },
      orderBy: { id: "asc" },
    })).resolves.toEqual(before);
  });

  it("keeps quote and external index rows out of manuscript example hits", async () => {
    const hits = await hybridSearchExamples(
      "a query absent from every exact block",
      projectId,
      20,
      new MockEmbeddingProvider(),
    );

    expect(hits).toEqual([{ sourceId: blockId, score: expect.any(Number) }]);
    expect(hits.some((hit) => hit.sourceId === quoteId || hit.sourceId === "external-source")).toBe(false);
  });
});
