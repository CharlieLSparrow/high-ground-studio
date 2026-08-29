import { createHash } from "node:crypto";

export const VOICE_RECOGNITION_SCHEMA = "quipsly-voice-recognition-profile-v1";
export const VOICE_RECOGNITION_MAX_TERMS = 100;

export type VoiceRecognitionOperationKind =
  | "bootstrap"
  | "set-adaptation"
  | "learn-phrase"
  | "forget-phrase";

export type VoiceRecognitionOperationInput = {
  clientRequestId: string;
  operationKind: VoiceRecognitionOperationKind;
  adaptationEnabled?: boolean;
  phrase?: string;
  phrases?: string[];
  weight?: number;
};

export type VoiceRecognitionValidation =
  | { ok: true; value: VoiceRecognitionOperationInput; payloadHash: string }
  | { ok: false; code: string; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeRecognitionPhrase(value: unknown) {
  if (typeof value !== "string") return null;
  const phrase = value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
  if (!phrase || phrase.length > 80) return null;
  const wordCount = phrase.split(" ").filter(Boolean).length;
  if (wordCount > 8) return null;
  return phrase;
}

export function recognitionPhraseKey(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US");
}

function uniquePhrases(values: unknown) {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const phrases: string[] = [];
  for (const value of values) {
    const phrase = normalizeRecognitionPhrase(value);
    if (!phrase) continue;
    const key = recognitionPhraseKey(phrase);
    if (seen.has(key)) continue;
    seen.add(key);
    phrases.push(phrase);
    if (phrases.length >= VOICE_RECOGNITION_MAX_TERMS) break;
  }
  return phrases;
}

function operationHash(input: VoiceRecognitionOperationInput) {
  return createHash("sha256")
    .update(JSON.stringify({
      clientRequestId: input.clientRequestId,
      operationKind: input.operationKind,
      adaptationEnabled: input.adaptationEnabled ?? null,
      phrase: input.phrase ?? null,
      phrases: input.phrases ?? [],
      weight: input.weight ?? null,
    }))
    .digest("hex");
}

export function validateVoiceRecognitionOperation(raw: unknown): VoiceRecognitionValidation {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, code: "BODY_INVALID", error: "The speech preference update is invalid." };
  }
  const body = raw as Record<string, unknown>;
  const clientRequestId = String(body.clientRequestId || "").trim().toLowerCase();
  if (!UUID.test(clientRequestId)) {
    return { ok: false, code: "REQUEST_ID_INVALID", error: "The speech preference request identity is invalid." };
  }
  const operationKind = String(body.operationKind || "") as VoiceRecognitionOperationKind;
  if (!["bootstrap", "set-adaptation", "learn-phrase", "forget-phrase"].includes(operationKind)) {
    return { ok: false, code: "OPERATION_INVALID", error: "That speech preference change is not supported." };
  }

  let value: VoiceRecognitionOperationInput;
  if (operationKind === "bootstrap") {
    if (typeof body.adaptationEnabled !== "boolean") {
      return { ok: false, code: "ADAPTATION_INVALID", error: "The speech adaptation choice is invalid." };
    }
    value = {
      clientRequestId,
      operationKind,
      adaptationEnabled: body.adaptationEnabled,
      phrases: uniquePhrases(body.phrases),
    };
  } else if (operationKind === "set-adaptation") {
    if (typeof body.adaptationEnabled !== "boolean") {
      return { ok: false, code: "ADAPTATION_INVALID", error: "The speech adaptation choice is invalid." };
    }
    value = { clientRequestId, operationKind, adaptationEnabled: body.adaptationEnabled };
  } else {
    const phrase = normalizeRecognitionPhrase(body.phrase);
    if (!phrase) {
      return { ok: false, code: "PHRASE_INVALID", error: "Use a name or phrase of eight words or fewer." };
    }
    const requestedWeight = Number(body.weight ?? 1);
    const weight = Number.isSafeInteger(requestedWeight) && requestedWeight >= 1 && requestedWeight <= 10
      ? requestedWeight
      : 1;
    value = operationKind === "learn-phrase"
      ? { clientRequestId, operationKind, phrase, weight }
      : { clientRequestId, operationKind, phrase };
  }

  return { ok: true, value, payloadHash: operationHash(value) };
}
