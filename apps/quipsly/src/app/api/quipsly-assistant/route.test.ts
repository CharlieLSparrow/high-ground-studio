/** @jest-environment node */

import { GoogleGenAI } from "@google/genai";
import { getPrismaClient } from "@/lib/prisma";
import { requireProjectAccess } from "@/lib/server/access";
import { POST } from "./route";

const mockEmbedContent = jest.fn();
const mockGenerateContent = jest.fn();

jest.mock("@google/genai", () => ({
  GoogleGenAI: jest.fn(() => ({ models: { embedContent: mockEmbedContent, generateContent: mockGenerateContent } })),
  Schema: {},
  Type: {},
}));
jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/access", () => ({ requireProjectAccess: jest.fn() }));
jest.mock("@high-ground/quipsly-domain/output-catalog", () => ({
  createOutputCapabilityPlan: jest.fn(),
  createOutputPacketSkeleton: jest.fn(),
  getOutputDefinition: jest.fn(() => null),
  listOutputsForNestKind: jest.fn(() => []),
}));

const tx = {
  studioAssistantAction: { create: jest.fn() },
  studioAssistantLedger: { create: jest.fn() },
};
const prisma = {
  studioProject: { findFirst: jest.fn() },
  studioDocument: { findMany: jest.fn(), findFirst: jest.fn() },
  studioAssistantSession: { findFirst: jest.fn(), create: jest.fn() },
  $queryRaw: jest.fn(),
  $transaction: jest.fn(),
};

function request(overrides: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/quipsly-assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "Find the courage theme.",
      projectSlug: "high-ground",
      documentId: "document-1",
      documentTitle: "Untrusted title",
      visibleBlocks: [{ id: "block-1", text: "Tampered browser text", tags: ["episode"] }],
      projectDocuments: [{ id: "foreign", title: "Untrusted document" }],
      ...overrides,
    }),
  });
}

describe("Quipsly assistant authorization and proposal persistence", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalApiKey = process.env.GEMINI_API_KEY;
  const originalProviderDisabled = process.env.QUIPSLY_DISABLE_AI_PROVIDER;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DATABASE_URL = "postgresql://disposable.test/quipsly";
    process.env.GEMINI_API_KEY = "test-key";
    delete process.env.QUIPSLY_DISABLE_AI_PROVIDER;
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);
    jest.mocked(requireProjectAccess).mockResolvedValue(undefined as never);
    prisma.studioProject.findFirst.mockResolvedValue({ id: "project-1", slug: "high-ground" });
    prisma.studioDocument.findMany.mockResolvedValue([
      { id: "document-1", title: "Canonical Episode", sourceLabel: "Podcast" },
    ]);
    prisma.studioDocument.findFirst.mockResolvedValue({
      id: "document-1",
      title: "Canonical Episode",
      blocks: [{ id: "block-1", body: "Canonical manuscript evidence." }],
    });
    prisma.studioAssistantSession.findFirst.mockResolvedValue({ id: "session-1" });
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(async (callback: any) => callback(tx));
    let actionNumber = 0;
    tx.studioAssistantAction.create.mockImplementation(async () => ({ id: `action-${++actionNumber}` }));
    tx.studioAssistantLedger.create.mockResolvedValue({ id: "ledger" });
    mockEmbedContent.mockResolvedValue({ embeddings: [] });
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({ assistantMessage: "Two proposals.", suggestions: [], toolIntents: [] }),
    });
  });

  afterAll(() => {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalApiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalApiKey;
    if (originalProviderDisabled === undefined) delete process.env.QUIPSLY_DISABLE_AI_PROVIDER;
    else process.env.QUIPSLY_DISABLE_AI_PROVIDER = originalProviderDisabled;
  });

  it("refuses provider work when Nest access cannot be verified", async () => {
    delete process.env.DATABASE_URL;
    const unavailable = await POST(request());
    expect(unavailable.status).toBe(503);
    expect(GoogleGenAI).not.toHaveBeenCalled();
    expect(getPrismaClient).not.toHaveBeenCalled();

    process.env.DATABASE_URL = "postgresql://disposable.test/quipsly";
    jest.mocked(requireProjectAccess).mockRejectedValueOnce(new Error("Forbidden"));
    const denied = await POST(request());
    expect(denied.status).toBe(403);
    expect(GoogleGenAI).not.toHaveBeenCalled();
  });

  it("rejects a session that does not belong to the authorized Nest and document", async () => {
    prisma.studioAssistantSession.findFirst.mockResolvedValueOnce(null);

    const response = await POST(request({ sessionId: "foreign-session" }));

    expect(response.status).toBe(409);
    expect(GoogleGenAI).not.toHaveBeenCalled();
  });

  it("sends canonical document evidence and atomically receipts every returned action by position", async () => {
    mockEmbedContent.mockResolvedValueOnce({ embeddings: [{ values: new Array(768).fill(0.01) }] });
    prisma.$queryRaw.mockResolvedValueOnce([{
      sourceOrigin: "quipsly-lore-quote",
      sourceId: "quote-1",
      contentSnapshot: "A cited research quote about courage.",
    }]);
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        assistantMessage: "Review these exact-source proposals.",
        suggestions: [],
        toolIntents: [
          {
            kind: "PROPOSE_ENTITY",
            label: "Repeated label",
            explanation: "First exact source.",
            riskLevel: "medium",
            payload: { name: "Courage", type: "THEME_MOTIF", attributes: { sourceExcerpt: "Canonical manuscript evidence." } },
          },
          {
            kind: "PROPOSE_ENTITY",
            label: "Repeated label",
            explanation: "Second exact source.",
            riskLevel: "medium",
            payload: { name: "Presence", type: "THEME_MOTIF", attributes: { sourceExcerpt: "Canonical manuscript evidence." } },
          },
        ],
      }),
    });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.toolIntents.map((intent: any) => intent.id)).toEqual(["action-1", "action-2"]);
    expect(body.toolIntents.map((intent: any) => intent.payload.sourceBlockId)).toEqual(["block-1", "block-1"]);
    expect(body.toolIntents[0].payload.attributes).toMatchObject({
      sourceDocumentId: "document-1",
      sourceBlockId: "block-1",
      sourceExcerpt: "Canonical manuscript evidence.",
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.studioAssistantAction.create).toHaveBeenCalledTimes(2);
    expect(tx.studioAssistantLedger.create).toHaveBeenCalledTimes(2);
    const providerPrompt = mockGenerateContent.mock.calls[0][0].contents as string;
    expect(providerPrompt).toContain("Canonical manuscript evidence.");
    expect(providerPrompt).toContain("Canonical Episode");
    expect(providerPrompt).toContain('"sourceOrigin": "quipsly-lore-quote"');
    expect(providerPrompt).toContain('"sourceId": "quote-1"');
    expect(providerPrompt).toContain("A cited research quote about courage.");
    expect(providerPrompt).not.toContain("Tampered browser text");
    expect(providerPrompt).not.toContain("Untrusted document");
  });

  it("returns no actionable proposal when the atomic action-ledger transaction fails", async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        assistantMessage: "One proposal.",
        suggestions: [],
        toolIntents: [{
          kind: "PROPOSE_DRAFT",
          label: "Draft a beat",
          explanation: "A breathing beat was requested.",
          riskLevel: "high",
          payload: { targetBlockId: "block-1", draftText: "Breathe." },
        }],
      }),
    });
    prisma.$transaction.mockRejectedValueOnce(new Error("ledger unavailable"));

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({ ok: false });
    expect(JSON.stringify(body)).not.toContain("PROPOSE_DRAFT");
  });

  it("discloses when generation succeeds without semantic Nest retrieval", async () => {
    mockEmbedContent.mockRejectedValueOnce(new Error("embedding quota unavailable"));

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.warning).toMatch(/semantic Nest retrieval was unavailable/i);
    expect(body.assistantMessage).toBe("Two proposals.");
  });

  it("gives local fallback controls durable IDs instead of browser-only actions", async () => {
    delete process.env.GEMINI_API_KEY;

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.source).toBe("local-fallback");
    expect(body.toolIntents).toHaveLength(2);
    expect(body.toolIntents[0]).toMatchObject({
      kind: "find-examples",
      payload: { query: "Find the courage theme." },
    });
    expect(body.toolIntents.every((intent: any) => /^action-\d+$/.test(intent.id))).toBe(true);
    expect(tx.studioAssistantLedger.create).toHaveBeenCalledTimes(2);
    expect(GoogleGenAI).not.toHaveBeenCalled();
  });

  it("honors the explicit local-QA provider kill switch even when a key is inherited", async () => {
    process.env.QUIPSLY_DISABLE_AI_PROVIDER = "true";

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.source).toBe("local-fallback");
    expect(body.warning).toMatch(/provider access is disabled/i);
    expect(GoogleGenAI).not.toHaveBeenCalled();
  });
});
