import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import { canAccessStudioProjectBySlug } from "@/lib/server/studio-project-access";
import { syncProjectEmbeddings } from "@/lib/retrieval/embeddings";
import {
  addBlockComment,
  approveEpisodeCandidateAction,
  loadWorkbenchState,
  reorderDocumentBlocksAction,
  seedTonightPack,
  syncEmbeddingsAction,
  testPublishCandidateAction,
  retractEpisodeCandidateAction,
  updateCandidatePacketAction,
} from "./actions";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/studio-project-access", () => ({ canAccessStudioProjectBySlug: jest.fn() }));
jest.mock("@/lib/server/bi-directional-sync", () => ({ syncBlocksToQuipslyNote: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/retrieval/embeddings", () => ({
  QUIPSLY_EMBEDDING_MODEL: "gemini-embedding-2",
  syncProjectEmbeddings: jest.fn(),
}));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("../manuscript/manuscript-editor-model", () => ({
  createManuscriptDraftPlainText: jest.fn(() => ""),
  safeManuscriptDraft: jest.fn(() => null),
}));
jest.mock("./starterDocuments", () => ({ createStarterBlocks: jest.fn(() => []) }));
jest.mock("@google/genai", () => ({
  GoogleGenAI: jest.fn(),
  Schema: {},
  Type: {},
}));

describe("writing desk persistence truth", () => {
  const originalGeminiApiKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    if (originalGeminiApiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalGeminiApiKey;
    (auth as jest.Mock).mockResolvedValue({
      user: { id: "user-1", primaryEmail: "writer@example.com" },
    });
    (canAccessStudioProjectBySlug as jest.Mock).mockResolvedValue(true);
  });

  afterAll(() => {
    if (originalGeminiApiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalGeminiApiKey;
  });

  it("returns an empty unavailable state instead of a realistic editable manuscript", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    (getPrismaClient as jest.Mock).mockImplementation(() => {
      throw new Error("DATABASE_URL unavailable");
    });

    const state = await loadWorkbenchState("high-ground-odyssey");

    expect(state).toMatchObject({
      persistenceMode: "unavailable",
      blocks: [],
      views: [],
      documentTitle: "Writing desk unavailable",
    });
    expect(state?.projectName).not.toMatch(/offline|browser lab/i);
    warn.mockRestore();
  });

  it("returns a typed seed failure without fabricated project or document IDs", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    (getPrismaClient as jest.Mock).mockImplementation(() => {
      throw new Error("DATABASE_URL unavailable");
    });

    const result = await seedTonightPack("high-ground-odyssey");

    expect(result).toEqual({
      ok: false,
      state: "unavailable",
      code: "PERSISTENCE_UNAVAILABLE",
      error: "The writing database is unavailable, so no starter content was created.",
    });
    expect(result).not.toHaveProperty("projectId");
    expect(result).not.toHaveProperty("documentId");
    warn.mockRestore();
  });

  it("persists a complete authorized reorder and its reversible operation receipt", async () => {
    const updateBlock = jest.fn().mockResolvedValue({});
    const createOperation = jest.fn().mockResolvedValue({ id: "operation-1" });
    const updateDocument = jest.fn().mockResolvedValue({});
    const tx = {
      studioDocument: {
        findUnique: jest.fn().mockResolvedValue({
          id: "document-1",
          projectId: "project-1",
          blocks: [
            { id: "block-a", order: 0, archivedAt: null },
            { id: "block-archived", order: 1, archivedAt: new Date("2026-01-01T00:00:00.000Z") },
            { id: "block-b", order: 2, archivedAt: null },
          ],
        }),
        update: updateDocument,
      },
      studioDocumentBlock: { update: updateBlock },
      studioDocumentOperation: { create: createOperation },
    };
    const prisma = {
      studioDocument: {
        findUnique: jest.fn().mockResolvedValue({ project: { slug: "high-ground-odyssey" } }),
      },
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    (getPrismaClient as jest.Mock).mockReturnValue(prisma);

    const result = await reorderDocumentBlocksAction("document-1", ["block-b", "block-a"]);

    expect(result).toEqual({
      ok: true,
      state: "persisted",
      operationId: "operation-1",
      blockCount: 2,
    });
    expect(canAccessStudioProjectBySlug).toHaveBeenCalledWith(expect.objectContaining({
      projectSlug: "high-ground-odyssey",
      email: "writer@example.com",
      action: "write",
    }));
    expect(updateBlock).toHaveBeenCalledTimes(6);
    expect(updateBlock).toHaveBeenNthCalledWith(4, { where: { id: "block-b" }, data: { order: 0 } });
    expect(updateBlock).toHaveBeenNthCalledWith(5, { where: { id: "block-archived" }, data: { order: 1 } });
    expect(updateBlock).toHaveBeenNthCalledWith(6, { where: { id: "block-a" }, data: { order: 2 } });
    expect(createOperation).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        projectId: "project-1",
        documentId: "document-1",
        actorEmail: "writer@example.com",
        operationType: "reorder_blocks",
        reversible: true,
        beforeJson: { blocks: [
          { id: "block-a", order: 0 },
          { id: "block-archived", order: 1 },
          { id: "block-b", order: 2 },
        ] },
        afterJson: { blocks: [
          { id: "block-b", order: 0 },
          { id: "block-archived", order: 1 },
          { id: "block-a", order: 2 },
        ] },
      }),
      select: { id: true },
    }));
  });

  it("rejects an unauthenticated reorder before opening persistence", async () => {
    (auth as jest.Mock).mockResolvedValue(null);

    const result = await reorderDocumentBlocksAction("document-1", ["block-a"]);

    expect(result).toMatchObject({ ok: false, state: "rejected", code: "AUTH_REQUIRED" });
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("keeps transcript source evidence pinned during an authorized reorder", async () => {
    const updateBlock = jest.fn();
    const tx = {
      studioDocument: {
        findUnique: jest.fn().mockResolvedValue({
          id: "document-1",
          projectId: "project-1",
          blocks: [
            { id: "source-block", order: 0, archivedAt: null, externalId: "transcript:job-1:segment-1" },
            { id: "draft-block", order: 1, archivedAt: null, externalId: "transcript-draft:job-1:segment-1" },
          ],
        }),
      },
      studioDocumentBlock: { update: updateBlock },
      studioDocumentOperation: { create: jest.fn() },
    };
    const prisma = {
      studioDocument: {
        findUnique: jest.fn().mockResolvedValue({ project: { slug: "high-ground-odyssey" } }),
      },
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    (getPrismaClient as jest.Mock).mockReturnValue(prisma);

    const result = await reorderDocumentBlocksAction("document-1", ["draft-block", "source-block"]);

    expect(result).toMatchObject({
      ok: false,
      state: "rejected",
      code: "INVALID_REORDER",
      error: "Transcript source evidence stays pinned in its canonical position.",
    });
    expect(updateBlock).not.toHaveBeenCalled();
  });

  it("rejects a reorder when document write access is denied", async () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    (canAccessStudioProjectBySlug as jest.Mock).mockResolvedValue(false);
    const prisma = {
      studioDocument: {
        findUnique: jest.fn().mockResolvedValue({ project: { slug: "high-ground-odyssey" } }),
      },
      $transaction: jest.fn(),
    };
    (getPrismaClient as jest.Mock).mockReturnValue(prisma);

    const result = await reorderDocumentBlocksAction("document-1", ["block-a"]);

    expect(result).toMatchObject({
      ok: false,
      state: "rejected",
      code: "ACCESS_NOT_VERIFIED",
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it("rejects an unauthenticated passage note without a fake persistence receipt", async () => {
    (auth as jest.Mock).mockResolvedValue(null);
    const result = await addBlockComment("block-a", 0, 4, "Text", "A comment");

    expect(result).toEqual({
      ok: false,
      state: "rejected",
      code: "AUTH_REQUIRED",
      error: "Sign in before adding a note to this passage.",
    });
    expect(result).not.toHaveProperty("commentId");
  });

  it("rejects an unauthenticated research-index refresh before opening persistence", async () => {
    (auth as jest.Mock).mockResolvedValue(null);

    const result = await syncEmbeddingsAction("project-1");

    expect(result).toMatchObject({ success: false, state: "rejected", code: "AUTH_REQUIRED" });
    expect(getPrismaClient).not.toHaveBeenCalled();
    expect(syncProjectEmbeddings).not.toHaveBeenCalled();
  });

  it("keeps the prior research index when the embedding provider is not configured", async () => {
    delete process.env.GEMINI_API_KEY;
    (getPrismaClient as jest.Mock).mockReturnValue({
      studioProject: { findUnique: jest.fn().mockResolvedValue({ slug: "high-ground-odyssey" }) },
    });

    const result = await syncEmbeddingsAction("project-1");

    expect(result).toEqual({
      success: false,
      state: "unavailable",
      code: "PROVIDER_UNAVAILABLE",
      error: "AI research indexing is not configured. The existing index was not changed.",
    });
    expect(syncProjectEmbeddings).not.toHaveBeenCalled();
  });

  it("refreshes an authorized Nest with the current embedding model and real counts", async () => {
    process.env.GEMINI_API_KEY = "test-provider-key";
    (getPrismaClient as jest.Mock).mockReturnValue({
      studioProject: { findUnique: jest.fn().mockResolvedValue({ slug: "high-ground-odyssey" }) },
    });
    jest.mocked(syncProjectEmbeddings).mockResolvedValue({ syncedBlocks: 4, syncedQuotes: 2 });

    const result = await syncEmbeddingsAction("project-1");

    expect(result).toEqual({
      success: true,
      state: "persisted",
      result: { syncedBlocks: 4, syncedQuotes: 2, model: "gemini-embedding-2" },
    });
    expect(syncProjectEmbeddings).toHaveBeenCalledWith("project-1");
  });

  it("keeps every obsolete publishing mutation action retired before persistence", async () => {
    const results = await Promise.all([
      approveEpisodeCandidateAction("candidate-1"),
      updateCandidatePacketAction("candidate-1", { title: "Changed" }),
      testPublishCandidateAction("candidate-1"),
      retractEpisodeCandidateAction("candidate-1", ["youtube"]),
    ]);

    for (const result of results) {
      expect(result).toMatchObject({
        ok: false,
        error: "Legacy publishing execution is retired. No provider, filesystem, queue, or publication state was changed.",
      });
    }
    expect(results[0]).toMatchObject({ errorCode: "LEGACY_PUBLISHING_EXECUTION_RETIRED" });
    expect(getPrismaClient).not.toHaveBeenCalled();
  });
});
