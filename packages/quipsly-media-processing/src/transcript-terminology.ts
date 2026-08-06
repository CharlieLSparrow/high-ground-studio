export const STUDIO_TRANSCRIPT_TERMINOLOGY_SNAPSHOT_KIND = "quipsly-transcript-terminology-snapshot-v1" as const;
export const STUDIO_TRANSCRIPT_TERMINOLOGY_MAX_TERMS = 50;
export const STUDIO_TRANSCRIPT_TERMINOLOGY_MAX_PROMPT_CHARACTERS = 1_000;
export const STUDIO_TRANSCRIPT_TERMINOLOGY_PROVIDER_MODE = "initial-prompt-first-window" as const;

export type StudioTranscriptTerminologyTermSnapshot = {
  id: string;
  revision: number;
  canonicalText: string;
  aliases: string[];
  category: string;
  pronunciationHint: string | null;
  contextHint: string | null;
  priority: number;
};

export type StudioTranscriptTerminologySnapshot = {
  kind: typeof STUDIO_TRANSCRIPT_TERMINOLOGY_SNAPSHOT_KIND;
  projectId: string;
  compiledAt: string;
  revisionToken: string;
  termsSha256: string;
  terms: StudioTranscriptTerminologyTermSnapshot[];
  providerInput: {
    provider: "openai-whisper-local";
    mode: "initial-prompt-first-window" | "initial-prompt-carried";
    promptText: string;
    promptSha256: string;
    includedTermIds: string[];
    omittedTermIds: string[];
    maxCharacters: typeof STUDIO_TRANSCRIPT_TERMINOLOGY_MAX_PROMPT_CHARACTERS;
  };
  boundaries: {
    vocabularyIsProviderContextNotTruth: true;
    providerEvidenceRemainsImmutable: true;
    historicalTranscriptsAreNotRewritten: true;
    measuredAccuracyRequiredBeforeDefaultRouting: true;
  };
};

const SAFE_ID = /^[A-Za-z0-9_-]{8,160}$/;
const SHA256 = /^[0-9a-f]{64}$/;

export function compileWhisperTerminologyPrompt(
  terms: StudioTranscriptTerminologyTermSnapshot[],
  maxCharacters = STUDIO_TRANSCRIPT_TERMINOLOGY_MAX_PROMPT_CHARACTERS,
) {
  if (!Number.isSafeInteger(maxCharacters) || maxCharacters < 80 || maxCharacters > STUDIO_TRANSCRIPT_TERMINOLOGY_MAX_PROMPT_CHARACTERS) {
    throw new Error("Transcript terminology prompt limit is invalid.");
  }
  const ordered = [...terms]
    .map(parseStudioTranscriptTerminologyTermSnapshot)
    .sort((left, right) => right.priority - left.priority
      || left.canonicalText.localeCompare(right.canonicalText)
      || left.id.localeCompare(right.id))
    .slice(0, STUDIO_TRANSCRIPT_TERMINOLOGY_MAX_TERMS);
  const prefix = "Preferred spellings and names: ";
  let promptText = prefix;
  const includedTermIds: string[] = [];
  const omittedTermIds: string[] = [];
  for (const term of ordered) {
    const entry = includedTermIds.length ? `; ${term.canonicalText}` : term.canonicalText;
    const terminal = ".";
    if (`${promptText}${entry}${terminal}`.length > maxCharacters) {
      omittedTermIds.push(term.id);
      continue;
    }
    promptText += entry;
    includedTermIds.push(term.id);
  }
  if (!includedTermIds.length) promptText = "";
  else promptText += ".";
  omittedTermIds.push(...ordered.filter((term) => !includedTermIds.includes(term.id) && !omittedTermIds.includes(term.id)).map((term) => term.id));
  return { promptText, includedTermIds, omittedTermIds };
}

export function parseStudioTranscriptTerminologySnapshot(value: unknown): StudioTranscriptTerminologySnapshot {
  const row = record(value);
  const providerInput = record(row.providerInput);
  const boundaries = record(row.boundaries);
  const terms = array(row.terms).map(parseStudioTranscriptTerminologyTermSnapshot);
  const includedTermIds = stringArray(providerInput.includedTermIds, "providerInput.includedTermIds");
  const omittedTermIds = stringArray(providerInput.omittedTermIds, "providerInput.omittedTermIds");
  const promptText = text(providerInput.promptText, "providerInput.promptText", true);
  if (
    row.kind !== STUDIO_TRANSCRIPT_TERMINOLOGY_SNAPSHOT_KIND
    || providerInput.provider !== "openai-whisper-local"
    || (providerInput.mode !== "initial-prompt-first-window" && providerInput.mode !== "initial-prompt-carried")
    || providerInput.maxCharacters !== STUDIO_TRANSCRIPT_TERMINOLOGY_MAX_PROMPT_CHARACTERS
    || boundaries.vocabularyIsProviderContextNotTruth !== true
    || boundaries.providerEvidenceRemainsImmutable !== true
    || boundaries.historicalTranscriptsAreNotRewritten !== true
    || boundaries.measuredAccuracyRequiredBeforeDefaultRouting !== true
  ) throw new Error("Transcript terminology snapshot is invalid.");
  if (terms.length > STUDIO_TRANSCRIPT_TERMINOLOGY_MAX_TERMS) throw new Error("Transcript terminology snapshot has too many terms.");
  if (promptText.length > STUDIO_TRANSCRIPT_TERMINOLOGY_MAX_PROMPT_CHARACTERS || /[\u0000-\u001f\u007f]/u.test(promptText)) {
    throw new Error("Transcript terminology provider prompt is invalid.");
  }
  const ids = new Set(terms.map((term) => term.id));
  if (ids.size !== terms.length
    || includedTermIds.some((id) => !ids.has(id))
    || omittedTermIds.some((id) => !ids.has(id))
    || includedTermIds.some((id) => omittedTermIds.includes(id))) {
    throw new Error("Transcript terminology term selection is inconsistent.");
  }
  const compiled = compileWhisperTerminologyPrompt(terms);
  if (compiled.promptText !== promptText
    || compiled.includedTermIds.join("\u0000") !== includedTermIds.join("\u0000")
    || compiled.omittedTermIds.join("\u0000") !== omittedTermIds.join("\u0000")) {
    throw new Error("Transcript terminology provider prompt does not match its terms.");
  }
  return {
    kind: STUDIO_TRANSCRIPT_TERMINOLOGY_SNAPSHOT_KIND,
    projectId: id(row.projectId, "projectId"),
    compiledAt: isoDate(row.compiledAt, "compiledAt"),
    revisionToken: text(row.revisionToken, "revisionToken"),
    termsSha256: sha256(row.termsSha256, "termsSha256"),
    terms,
    providerInput: {
      provider: "openai-whisper-local",
      mode: providerInput.mode,
      promptText,
      promptSha256: sha256(providerInput.promptSha256, "providerInput.promptSha256"),
      includedTermIds,
      omittedTermIds,
      maxCharacters: STUDIO_TRANSCRIPT_TERMINOLOGY_MAX_PROMPT_CHARACTERS,
    },
    boundaries: {
      vocabularyIsProviderContextNotTruth: true,
      providerEvidenceRemainsImmutable: true,
      historicalTranscriptsAreNotRewritten: true,
      measuredAccuracyRequiredBeforeDefaultRouting: true,
    },
  };
}

export function parseStudioTranscriptTerminologyTermSnapshot(value: unknown): StudioTranscriptTerminologyTermSnapshot {
  const row = record(value);
  const canonicalText = text(row.canonicalText, "canonicalText");
  const aliases = stringArray(row.aliases, "aliases").map((entry) => boundedTermText(entry, "alias"));
  if (new Set(aliases.map(normalized)).size !== aliases.length || aliases.some((alias) => normalized(alias) === normalized(canonicalText))) {
    throw new Error("Transcript terminology aliases must be unique and distinct from the canonical text.");
  }
  return {
    id: id(row.id, "id"),
    revision: positiveInteger(row.revision, "revision"),
    canonicalText: boundedTermText(canonicalText, "canonicalText"),
    aliases,
    category: boundedToken(row.category, "category"),
    pronunciationHint: nullableBoundedText(row.pronunciationHint, "pronunciationHint", 160),
    contextHint: nullableBoundedText(row.contextHint, "contextHint", 240),
    priority: integerRange(row.priority, "priority", 0, 100),
  };
}

function normalized(value: string) { return value.normalize("NFKC").trim().toLocaleLowerCase("en-US"); }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function text(value: unknown, field: string, allowEmpty = false) { const result = typeof value === "string" ? value.trim() : ""; if (!allowEmpty && !result) throw new Error(`${field} is required.`); return result; }
function id(value: unknown, field: string) { const result = text(value, field); if (!SAFE_ID.test(result)) throw new Error(`${field} is invalid.`); return result; }
function sha256(value: unknown, field: string) { const result = text(value, field).toLowerCase(); if (!SHA256.test(result)) throw new Error(`${field} is invalid.`); return result; }
function isoDate(value: unknown, field: string) { const result = text(value, field); if (!Number.isFinite(Date.parse(result))) throw new Error(`${field} is invalid.`); return result; }
function positiveInteger(value: unknown, field: string) { const result = Number(value); if (!Number.isSafeInteger(result) || result < 1) throw new Error(`${field} is invalid.`); return result; }
function integerRange(value: unknown, field: string, min: number, max: number) { const result = Number(value); if (!Number.isSafeInteger(result) || result < min || result > max) throw new Error(`${field} is invalid.`); return result; }
function boundedToken(value: unknown, field: string) { const result = text(value, field).toLowerCase(); if (!/^[a-z][a-z0-9-]{1,39}$/.test(result)) throw new Error(`${field} is invalid.`); return result; }
function boundedTermText(value: unknown, field: string) { const result = text(value, field); if (result.length > 120 || /[\u0000-\u001f\u007f;]/u.test(result)) throw new Error(`${field} is invalid.`); return result; }
function nullableBoundedText(value: unknown, field: string, max: number) { if (value == null || value === "") return null; const result = text(value, field); if (result.length > max || /[\u0000-\u001f\u007f]/u.test(result)) throw new Error(`${field} is invalid.`); return result; }
function stringArray(value: unknown, field: string) { if (!Array.isArray(value) || value.length > 24) throw new Error(`${field} is invalid.`); return value.map((entry, index) => text(entry, `${field}[${index}]`)); }
