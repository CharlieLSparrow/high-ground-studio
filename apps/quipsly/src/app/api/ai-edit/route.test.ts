/** @jest-environment node */

import { GoogleGenAI } from "@google/genai";

import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { POST } from "./route";

jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));
jest.mock("@google/genai", () => ({
  GoogleGenAI: jest.fn(),
  Type: { OBJECT: "OBJECT", ARRAY: "ARRAY", STRING: "STRING", NUMBER: "NUMBER" },
}));

const mockedSession = jest.mocked(getQuipslySessionFromRequest);
const mockedGoogle = jest.mocked(GoogleGenAI);
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

describe("AI edit suggestion boundary", () => {
  const originalKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    mockedSession.mockResolvedValue({ user: { id: "user-1" } } as never);
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

    const response = await POST(request({ transcriptBlocks, providerDisclosureAccepted: true }));
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toEqual(expect.objectContaining({ ok: false, errorCode: "AUTH_REQUIRED", edits: [] }));
    expect(mockedGoogle).not.toHaveBeenCalled();
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("returns unavailable without substituting mock edits when the provider is not configured", async () => {
    delete process.env.GEMINI_API_KEY;

    const response = await POST(request({ transcriptBlocks, providerDisclosureAccepted: true }));
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

  it("requires explicit provider disclosure acceptance and validates transcript bounds", async () => {
    const disclosure = await POST(request({ transcriptBlocks }));
    expect(disclosure.status).toBe(409);
    expect(await disclosure.json()).toEqual(expect.objectContaining({ errorCode: "AI_PROVIDER_DISCLOSURE_REQUIRED" }));

    const invalid = await POST(request({
      providerDisclosureAccepted: true,
      transcriptBlocks: [{ ...transcriptBlocks[0], duration: -1 }],
    }));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual(expect.objectContaining({ errorCode: "INVALID_TRANSCRIPT", edits: [] }));
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("returns bounded proposals only and never claims to apply them", async () => {
    generateContent.mockResolvedValue({
      text: JSON.stringify({
        edits: [
          { type: "deactivate", blockId: "block-2" },
          { type: "deactivate", blockId: "not-supplied" },
          { type: "add_keyframe", timeOffset: 5, x: 30, y: 2, scale: 75 },
          { type: "add_keyframe", timeOffset: 999, x: 30, y: 2, scale: 75 },
        ],
      }),
    });

    const response = await POST(request({ transcriptBlocks, providerDisclosureAccepted: true }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(payload).toEqual(expect.objectContaining({
      ok: true,
      applied: false,
      suggestionCount: 2,
      edits: [
        { type: "deactivate", blockId: "block-2" },
        { type: "add_keyframe", timeOffset: 5, x: 30, y: 2, scale: 75 },
      ],
    }));
    expect(payload.nextAction).toMatch(/Review each suggestion/i);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("fails closed with no raw provider error and no applied edit claim", async () => {
    generateContent.mockRejectedValue(new Error("secret provider diagnostic"));

    const response = await POST(request({ transcriptBlocks, providerDisclosureAccepted: true }));
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
