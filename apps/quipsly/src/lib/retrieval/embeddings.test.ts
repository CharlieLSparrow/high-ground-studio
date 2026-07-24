import { GoogleGenAI } from "@google/genai";

import { getPrismaClient } from "../prisma";
import {
  GeminiEmbeddingProvider,
  QUIPSLY_EMBEDDING_DIMENSIONS,
  QUIPSLY_EMBEDDING_MODEL,
  hybridSearchExamples,
  prepareRetrievalQuery,
  syncProjectEmbeddings,
  type EmbeddingProvider,
} from "./embeddings";

jest.mock("../prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@google/genai", () => ({ GoogleGenAI: jest.fn() }));

const validVector = () => Array.from(
  { length: QUIPSLY_EMBEDDING_DIMENSIONS },
  (_, index) => (index + 1) / QUIPSLY_EMBEDDING_DIMENSIONS,
);

describe("research embedding truth", () => {
  const originalGeminiApiKey = process.env.GEMINI_API_KEY;
  const originalProviderDisabled = process.env.QUIPSLY_DISABLE_AI_PROVIDER;

  beforeEach(() => {
    jest.clearAllMocks();
    if (originalGeminiApiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalGeminiApiKey;
    delete process.env.QUIPSLY_DISABLE_AI_PROVIDER;
  });

  afterAll(() => {
    if (originalGeminiApiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalGeminiApiKey;
    if (originalProviderDisabled === undefined) delete process.env.QUIPSLY_DISABLE_AI_PROVIDER;
    else process.env.QUIPSLY_DISABLE_AI_PROVIDER = originalProviderDisabled;
  });

  it("uses the current 768-dimension model contract without a zero-vector fallback", async () => {
    process.env.GEMINI_API_KEY = "test-provider-key";
    const embedContent = jest.fn().mockResolvedValue({ embeddings: [{ values: validVector() }] });
    jest.mocked(GoogleGenAI).mockImplementation(() => ({ models: { embedContent } }) as never);

    await expect(new GeminiEmbeddingProvider().generateEmbedding("title: Test | text: Evidence"))
      .resolves.toHaveLength(QUIPSLY_EMBEDDING_DIMENSIONS);
    expect(embedContent).toHaveBeenCalledWith({
      model: QUIPSLY_EMBEDDING_MODEL,
      contents: "title: Test | text: Evidence",
      config: { outputDimensionality: QUIPSLY_EMBEDDING_DIMENSIONS },
    });

    embedContent.mockResolvedValueOnce({ embeddings: [{ values: new Array(QUIPSLY_EMBEDDING_DIMENSIONS).fill(0) }] });
    await expect(new GeminiEmbeddingProvider().generateEmbedding("invalid"))
      .rejects.toThrow(/invalid 768-dimension vector/i);
  });

  it("fails closed before a provider call when credentials are absent", async () => {
    delete process.env.GEMINI_API_KEY;

    await expect(new GeminiEmbeddingProvider().generateEmbedding("private coaching note"))
      .rejects.toThrow(/existing research index was not changed/i);
    expect(GoogleGenAI).not.toHaveBeenCalled();
  });

  it("fails closed when the local-QA provider kill switch overrides an inherited key", async () => {
    process.env.GEMINI_API_KEY = "inherited-key";
    process.env.QUIPSLY_DISABLE_AI_PROVIDER = "true";

    await expect(new GeminiEmbeddingProvider().generateEmbedding("private coaching note"))
      .rejects.toThrow(/provider access is disabled/i);
    expect(GoogleGenAI).not.toHaveBeenCalled();
  });

  it("finds useful lexical matches without a vector index or exact phrase match", async () => {
    const provider: EmbeddingProvider = {
      generateEmbedding: jest.fn().mockRejectedValue(new Error("provider disabled")),
    };
    const prisma = {
      studioDocumentBlock: {
        findMany: jest.fn().mockResolvedValue([
          { id: "block-episode", body: "The episode workflow ends in Studio." },
          { id: "block-coaching", body: "The coaching workflow preserves research continuation evidence." },
        ]),
      },
      $queryRaw: jest.fn(),
    };
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);

    await expect(hybridSearchExamples(
      "Find coaching workflow and research continuation examples.",
      "project-1",
      10,
      provider,
    )).resolves.toEqual([
      expect.objectContaining({ sourceId: "block-coaching" }),
      expect.objectContaining({ sourceId: "block-episode" }),
    ]);
    expect(prisma.studioDocumentBlock.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          { body: { contains: "coaching", mode: "insensitive" } },
          { body: { contains: "continuation", mode: "insensitive" } },
        ]),
      }),
    }));
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("prepares retrieval queries using the matching Gemini Embedding 2 search prefix", () => {
    expect(prepareRetrievalQuery("  where did Homer discuss courage?  "))
      .toBe("task: search result | query: where did Homer discuss courage?");
  });

  it("replaces only managed project vectors after every provider call succeeds", async () => {
    const order: string[] = [];
    const provider: EmbeddingProvider = {
      generateEmbedding: jest.fn(async (text) => {
        order.push(`provider:${text}`);
        return validVector();
      }),
    };
    const tx = {
      retrievalEmbedding: {
        deleteMany: jest.fn(async () => { order.push("delete-managed-index"); return { count: 2 }; }),
      },
      $executeRaw: jest.fn(async () => { order.push("insert-vector"); return 1; }),
    };
    const prisma = {
      studioDocument: {
        findMany: jest.fn().mockResolvedValue([{ title: "Episode 4", blocks: [
          { id: "block-1", title: "Opening", body: "A sufficiently long writing block about the episode." },
        ] }]),
      },
      quipLoreQuote: {
        findMany: jest.fn().mockResolvedValue([
          { id: "quote-1", text: "A sufficiently long research quote about courage." },
        ]),
      },
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);

    await expect(syncProjectEmbeddings("project-1", provider)).resolves.toEqual({
      syncedBlocks: 1,
      syncedQuotes: 1,
    });

    expect(provider.generateEmbedding).toHaveBeenCalledTimes(2);
    expect(tx.retrievalEmbedding.deleteMany).toHaveBeenCalledWith({
      where: {
        projectId: "project-1",
        sourceOrigin: { in: ["studio-document-block", "quipsly-lore-quote"] },
      },
    });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(order.findIndex((item) => item === "delete-managed-index"))
      .toBeGreaterThan(order.map((item) => item.startsWith("provider:")).lastIndexOf(true));
  });

  it("leaves the previous index untouched when any provider item fails", async () => {
    const provider: EmbeddingProvider = {
      generateEmbedding: jest.fn()
        .mockResolvedValueOnce(validVector())
        .mockRejectedValueOnce(new Error("provider quota unavailable")),
    };
    const prisma = {
      studioDocument: {
        findMany: jest.fn().mockResolvedValue([{ title: "Coaching", blocks: [
          { id: "block-1", title: null, body: "A sufficiently long private coaching note for indexing." },
        ] }]),
      },
      quipLoreQuote: {
        findMany: jest.fn().mockResolvedValue([
          { id: "quote-1", text: "A sufficiently long quote that triggers the second call." },
        ]),
      },
      $transaction: jest.fn(),
    };
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);

    await expect(syncProjectEmbeddings("project-1", provider)).rejects.toThrow("provider quota unavailable");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
