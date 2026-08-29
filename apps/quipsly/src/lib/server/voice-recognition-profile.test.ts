import {
  normalizeRecognitionPhrase,
  recognitionPhraseKey,
  validateVoiceRecognitionOperation,
} from "./voice-recognition-profile";

describe("voice recognition profile", () => {
  it("normalizes short useful phrases without accepting paragraphs", () => {
    expect(normalizeRecognitionPhrase("  Homer   Sparrow ")).toBe("Homer Sparrow");
    expect(normalizeRecognitionPhrase("one two three four five six seven eight nine")).toBeNull();
    expect(normalizeRecognitionPhrase("x".repeat(81))).toBeNull();
    expect(recognitionPhraseKey("José")).toBe("jose");
  });

  it("creates a deterministic, bounded bootstrap payload", () => {
    const result = validateVoiceRecognitionOperation({
      clientRequestId: "11111111-1111-4111-8111-111111111111",
      operationKind: "bootstrap",
      adaptationEnabled: true,
      phrases: ["Homer Sparrow", "homer sparrow", "  Quipsly  "],
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        operationKind: "bootstrap",
        adaptationEnabled: true,
        phrases: ["Homer Sparrow", "Quipsly"],
      },
    });
    if (result.ok) expect(result.payloadHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects ambiguous or malformed mutations", () => {
    expect(validateVoiceRecognitionOperation({ operationKind: "set-adaptation" })).toMatchObject({
      ok: false,
      code: "REQUEST_ID_INVALID",
    });
    expect(validateVoiceRecognitionOperation({
      clientRequestId: "11111111-1111-4111-8111-111111111111",
      operationKind: "learn-phrase",
      phrase: "",
    })).toMatchObject({ ok: false, code: "PHRASE_INVALID" });
  });
});
