import "server-only";
import { GoogleGenAI } from "@google/genai";
import { SessionAnalysisError, type SessionAnalysisProvider } from "./session-transcript-analysis";

/** Explicit deployment configuration keeps enabling a paid processor separate
 * from shipping its implementation. No provider call happens during import. */
export function configuredSessionAnalysisProvider(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): SessionAnalysisProvider | null {
  if (environment.SESSION_FOLLOW_THROUGH_AI_ENABLED !== "true") return null;
  const apiKey = environment.GEMINI_API_KEY?.trim();
  const model = environment.SESSION_FOLLOW_THROUGH_AI_MODEL?.trim();
  if (!apiKey || !model) throw new SessionAnalysisError("PROVIDER_UNAVAILABLE");
  return {
    name: "google-gemini", model,
    async generate({ system, content, schema, signal }) {
      const client = new GoogleGenAI({ apiKey });
      const response = await client.models.generateContent({
        model,
        contents: content,
        config: {
          systemInstruction: system,
          responseMimeType: "application/json",
          responseJsonSchema: schema,
          maxOutputTokens: 8192,
          temperature: 0.2,
          abortSignal: signal,
        },
      });
      if (!response.text) throw new SessionAnalysisError("INVALID_OUTPUT");
      return response.text;
    },
  };
}
