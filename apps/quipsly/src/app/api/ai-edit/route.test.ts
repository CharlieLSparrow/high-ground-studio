/** @jest-environment node */

import { GoogleGenAI } from "@google/genai";

import { getPrismaClient } from "@/lib/prisma";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { POST } from "./route";

jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/episode-production-access", () => ({ resolveEpisodeProductionAccess: jest.fn() }));
jest.mock("@google/genai", () => ({
  GoogleGenAI: jest.fn(),
  Type: { OBJECT: "OBJECT", ARRAY: "ARRAY", STRING: "STRING", NUMBER: "NUMBER" },
}));

const mockedSession = jest.mocked(getQuipslySessionFromRequest);
const mockedGoogle = jest.mocked(GoogleGenAI);
const mockedAccess = jest.mocked(resolveEpisodeProductionAccess);
const generateContent = jest.fn();

function request(body: unknown) {
  return new Request("https://quipsly.example/api/ai-edit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const transcriptBlocks = [
  { id: "block-1", time: 0, duration: 4, text: "Welcome back to the show." },
  { id: "block-2", time: 4, duration: 3, text: "Um, let me restart that thought." },
];
const sourceBinding = {
  projectSlug: "high-ground-odyssey",
  episodeSlug: "episode-4-part-2",
  timelineFingerprintSha256: "a".repeat(64),
};

describe("AI edit suggestion boundary", () => {
  const originalKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    mockedSession.mockResolvedValue({ user: { id: "user-1" } } as never);
    jest.mocked(getPrismaClient).mockReturnValue({} as never);
    mockedAccess.mockResolvedValue({
      allowed: true,
      actor: { id: "user-1", email: "editor@example.test", name: "Editor", isStaff: false, source: "embedded-cookie" },
      access: { allowed: true, role: "EDITOR", source: "grant", projectId: "project-1", projectSlug: sourceBinding.projectSlug },
    } as never);
    process.env.GEMINI_API_KEY = "configured-test-key";
    mockedGoogle.mockImplementation(() => ({ models: { generateContent } }) as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  });

  it("requires a verified session before reading transcript content or calling a provider", async () => {
    mockedSession.mockResolvedValue(null);

    const response = await POST(request({ transcriptBlocks, providerDisclosureAccepted: true, ...sourceBinding }));
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toEqual(expect.objectContaining({ ok: false, errorCode: "AUTH_REQUIRED", edits: [] }));
    expect(mockedGoogle).not.toHaveBeenCalled();
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("returns unavailable without substituting mock edits when the provider is not configured", async () => {
    delete process.env.GEMINI_API_KEY;

    const response = await POST(request({ transcriptBlocks, providerDisclosureAccepted: true, ...sourceBinding }));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toEqual(expect.objectContaining({
      ok: false,
      errorCode: "AI_EDIT_PROVIDER_NOT_CONFIGURED",
      edits: [],
      applied: false,
    }));
    expect(payload.error).toMatch(/No mock edits were substituted/i);
    expect(mockedGoogle).not.toHaveBeenCalled();
  });

  it("runs deterministic evidence without provider disclosure or configuration", async () => {
    delete process.env.GEMINI_API_KEY;

    const response = await POST(request({
      analysisMode: "deterministic",
      transcriptBlocks: [
        { id: "restart", time: 0, duration: 3, text: "Let me restart that thought." },
        { id: "next", time: 6, duration: 2, text: "Here is the clean version." },
      ],
      ...sourceBinding,
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual(expect.objectContaining({
      ok: true,
      applied: false,
      source: "deterministic-transcript-evidence",
      suggestionCount: 1,
      reviewCandidateCount: 1,
      proposalSet: expect.objectContaining({
        provider: { kind: "deterministic", model: "quipsly-transcript-evidence-v1" },
        proposals: [expect.objectContaining({ type: "deactivate", blockId: "restart", applied: false })],
        reviewCandidates: [expect.objectContaining({
          kind: "transcript-timing-gap",
          requiresSignalEvidence: true,
          changesSource: false,
        })],
      }),
    }));
    expect(mockedGoogle).not.toHaveBeenCalled();
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("requires explicit provider disclosure acceptance and validates transcript bounds", async () => {
    const disclosure = await POST(request({ transcriptBlocks }));
    expect(disclosure.status).toBe(409);
    expect(await disclosure.json()).toEqual(expect.objectContaining({ errorCode: "AI_PROVIDER_DISCLOSURE_REQUIRED" }));

    const invalid = await POST(request({
      providerDisclosureAccepted: true,
      ...sourceBinding,
      transcriptBlocks: [{ ...transcriptBlocks[0], duration: -1 }],
    }));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual(expect.objectContaining({ errorCode: "INVALID_TRANSCRIPT", edits: [] }));
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("requires project write access before sending transcript evidence to the provider", async () => {
    mockedAccess.mockResolvedValue({
      allowed: false,
      status: 403,
      code: "episode-production-access-denied",
      error: "Denied.",
      actor: { id: "user-1", email: "viewer@example.test", name: "Viewer", isStaff: false, source: "embedded-cookie" },
      access: null,
    } as never);

    const response = await POST(request({ transcriptBlocks, providerDisclosureAccepted: true, ...sourceBinding }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(expect.objectContaining({ errorCode: "episode-production-access-denied", edits: [] }));
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("returns bounded proposals only and never claims to apply them", async () => {
    generateContent.mockResolvedValue({
      text: JSON.stringify({
        edits: [
          { type: "deactivate", blockId: "block-2", rationale: "The speaker explicitly restarts the thought.", confidence: "high" },
          { type: "deactivate", blockId: "not-supplied", rationale: "Invalid block.", confidence: "high" },
          { type: "add_keyframe", timeOffset: 5, x: 30, y: 2, scale: 75, rationale: "Reframe at the new thought.", confidence: "medium" },
          { type: "add_keyframe", timeOffset: 999, x: 30, y: 2, scale: 75, rationale: "Outside timeline.", confidence: "low" },
        ],
      }),
    });

    const response = await POST(request({ transcriptBlocks, providerDisclosureAccepted: true, ...sourceBinding }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(payload).toEqual(expect.objectContaining({
      ok: true,
      applied: false,
      suggestionCount: 2,
      proposalSet: expect.objectContaining({
        kind: "quipsly-ai-edit-proposal-set-v1",
        binding: expect.objectContaining({
          projectSlug: sourceBinding.projectSlug,
          episodeSlug: sourceBinding.episodeSlug,
          timelineFingerprintSha256: sourceBinding.timelineFingerprintSha256,
          blockCount: 2,
        }),
        proposals: [
          expect.objectContaining({
            type: "deactivate",
            blockId: "block-2",
            sourceRange: { startSeconds: 4, endSeconds: 7 },
            evidence: expect.objectContaining({ blockIds: ["block-2"], transcriptTextSha256: expect.stringMatching(/^[0-9a-f]{64}$/) }),
            confidence: "high",
            changesSource: false,
            applied: false,
          }),
          expect.objectContaining({
            type: "add_keyframe",
            timeOffset: 5,
            sourceRange: { startSeconds: 3.5, endSeconds: 6.5 },
            evidence: expect.objectContaining({ blockIds: ["block-1", "block-2"], transcriptTextSha256: expect.stringMatching(/^[0-9a-f]{64}$/) }),
            x: 30,
            y: 2,
            scale: 75,
            confidence: "medium",
            changesSource: false,
            applied: false,
          }),
        ],
        boundaries: expect.objectContaining({
          proofWatchBeforeApply: true,
          staleBindingRejectsApply: true,
          noAutomaticSaveRenderOrPublish: true,
        }),
      }),
    }));
    expect(payload.nextAction).toMatch(/Review each suggestion/i);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("fails closed with no raw provider error and no applied edit claim", async () => {
    generateContent.mockRejectedValue(new Error("secret provider diagnostic"));

    const response = await POST(request({ transcriptBlocks, providerDisclosureAccepted: true, ...sourceBinding }));
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload).toEqual(expect.objectContaining({
      ok: false,
      errorCode: "AI_EDIT_PROVIDER_UNAVAILABLE",
      edits: [],
      applied: false,
    }));
    expect(JSON.stringify(payload)).not.toContain("secret provider diagnostic");
  });
});
