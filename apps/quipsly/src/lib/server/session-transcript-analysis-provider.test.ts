/** @jest-environment node */
import { GoogleGenAI } from "@google/genai";
import { configuredSessionAnalysisProvider } from "./session-transcript-analysis-provider";
import { SESSION_ANALYSIS_JSON_SCHEMA } from "./session-transcript-analysis";

jest.mock("server-only", () => ({}));
jest.mock("@google/genai", () => ({ GoogleGenAI: jest.fn() }));
beforeEach(() => jest.clearAllMocks());

test("existing API credentials alone never activate a new paid processor", () => {
  expect(configuredSessionAnalysisProvider({ GEMINI_API_KEY: "synthetic" })).toBeNull();
  expect(GoogleGenAI).not.toHaveBeenCalled();
});

test("an explicitly enabled processor requires a configured model and credential", () => {
  expect(() => configuredSessionAnalysisProvider({ SESSION_FOLLOW_THROUGH_AI_ENABLED: "true" })).toThrow("PROVIDER_UNAVAILABLE");
  expect(() => configuredSessionAnalysisProvider({ SESSION_FOLLOW_THROUGH_AI_ENABLED: "true", GEMINI_API_KEY: "synthetic" })).toThrow("PROVIDER_UNAVAILABLE");
  expect(GoogleGenAI).not.toHaveBeenCalled();
});

test("the provider uses structured output, bounded generation, separate instructions and cancellation", async () => {
  const generateContent = jest.fn().mockResolvedValue({ text: '{"goals":[],"tasks":[],"notes":[]}' });
  jest.mocked(GoogleGenAI).mockImplementation(() => ({ models: { generateContent } }) as unknown as GoogleGenAI);
  const provider = configuredSessionAnalysisProvider({ SESSION_FOLLOW_THROUGH_AI_ENABLED: "true",
    GEMINI_API_KEY: "synthetic", SESSION_FOLLOW_THROUGH_AI_MODEL: "configured-test-model" })!;
  expect(GoogleGenAI).not.toHaveBeenCalled();
  const controller = new AbortController();
  await provider.generate({ system: "Extraction instructions", content: "Untrusted transcript",
    schema: SESSION_ANALYSIS_JSON_SCHEMA, signal: controller.signal });
  expect(generateContent).toHaveBeenCalledWith({ model: "configured-test-model", contents: "Untrusted transcript",
    config: { systemInstruction: "Extraction instructions", responseMimeType: "application/json",
      responseJsonSchema: SESSION_ANALYSIS_JSON_SCHEMA, maxOutputTokens: 8192, temperature: 0.2, abortSignal: controller.signal } });
});
