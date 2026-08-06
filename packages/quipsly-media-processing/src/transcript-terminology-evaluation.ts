import type { TranscriptEvaluationWord } from "./transcript-evaluation.js";

export const TRANSCRIPT_CRITICAL_TERMINOLOGY_REFERENCE_KIND =
  "quipsly-transcript-critical-terminology-reference-v1" as const;

export type TranscriptCriticalTerminologySourceTerm = {
  id: string;
  revision: number;
  canonicalText: string;
  aliases: string[];
  category: string;
  priority: number;
};

export type TranscriptCriticalTerminologyReferenceTerm = {
  id: string;
  revision: number;
  canonicalText: string;
  aliases: string[];
  category: string;
  priority: number;
  referenceOccurrenceCount: number;
  canonicalReferenceOccurrenceCount: number;
};

export type TranscriptCriticalTerminologyReference = {
  kind: typeof TRANSCRIPT_CRITICAL_TERMINOLOGY_REFERENCE_KIND;
  revisionToken: string;
  termsSha256: string;
  promptTermCount: number;
  referenceTermCount: number;
  referenceOccurrenceCount: number;
  terms: TranscriptCriticalTerminologyReferenceTerm[];
};

export type TranscriptCriticalTerminologyMetrics = {
  promptTermCount: number;
  referenceTermCount: number;
  referenceOccurrenceCount: number;
  candidateMentionCount: number;
  matchedOccurrenceCount: number;
  missedOccurrenceCount: number;
  falsePositiveMentionCount: number;
  canonicalCandidateMentionCount: number;
  conceptRecall: number | null;
  conceptPrecision: number | null;
  preferredSpellingRate: number | null;
};

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const MAX_TERMS = 250;

function tokens(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)
    ?.map((token) => token.replaceAll("’", "'")) ?? [];
}

function transcriptTokens(words: readonly TranscriptEvaluationWord[]) {
  return words.flatMap((word) => tokens(word.text));
}

function phraseCount(haystack: readonly string[], needle: readonly string[]) {
  if (!needle.length || needle.length > haystack.length) return 0;
  let count = 0;
  for (let index = 0; index <= haystack.length - needle.length;) {
    const matches = needle.every((token, offset) => haystack[index + offset] === token);
    if (matches) {
      count += 1;
      index += needle.length;
    } else {
      index += 1;
    }
  }
  return count;
}

function phraseVariants(term: Pick<TranscriptCriticalTerminologyReferenceTerm, "canonicalText" | "aliases">) {
  const seen = new Set<string>();
  return [term.canonicalText, ...term.aliases]
    .map((text, index) => ({ text, canonical: index === 0, tokens: tokens(text) }))
    .filter((variant) => {
      const key = variant.tokens.join("\u0000");
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => right.tokens.length - left.tokens.length || left.text.localeCompare(right.text));
}

function termMentions(haystack: readonly string[], term: Pick<TranscriptCriticalTerminologyReferenceTerm, "canonicalText" | "aliases">) {
  const occupied = new Uint8Array(haystack.length);
  let total = 0;
  let canonical = 0;
  for (const variant of phraseVariants(term)) {
    for (let index = 0; index <= haystack.length - variant.tokens.length; index += 1) {
      if (variant.tokens.some((token, offset) => haystack[index + offset] !== token || occupied[index + offset])) continue;
      total += 1;
      if (variant.canonical) canonical += 1;
      variant.tokens.forEach((_, offset) => { occupied[index + offset] = 1; });
      index += variant.tokens.length - 1;
    }
  }
  return { total, canonical };
}

export function buildTranscriptCriticalTerminologyReference(input: {
  revisionToken: string;
  termsSha256: string;
  terms: readonly TranscriptCriticalTerminologySourceTerm[];
  referenceWords: readonly TranscriptEvaluationWord[];
}): TranscriptCriticalTerminologyReference | null {
  if (!input.terms.length) return null;
  if (!input.revisionToken.trim() || !SHA256.test(input.termsSha256)) throw new Error("Critical terminology revision receipt is required.");
  if (input.terms.length > MAX_TERMS) throw new Error("Critical terminology reference has too many terms.");
  const referenceTokens = transcriptTokens(input.referenceWords);
  const terms = input.terms.map((term): TranscriptCriticalTerminologyReferenceTerm => {
    if (!SAFE_ID.test(term.id) || !Number.isSafeInteger(term.revision) || term.revision < 1) {
      throw new Error("Critical terminology source identity is invalid.");
    }
    const canonicalText = term.canonicalText.normalize("NFKC").trim();
    const aliases = [...new Set(term.aliases.map((alias) => alias.normalize("NFKC").trim()).filter(Boolean))];
    if (!canonicalText || !tokens(canonicalText).length) throw new Error("Critical terminology text is invalid.");
    const mentions = termMentions(referenceTokens, { canonicalText, aliases });
    return {
      id: term.id,
      revision: term.revision,
      canonicalText,
      aliases,
      category: term.category,
      priority: term.priority,
      referenceOccurrenceCount: mentions.total,
      canonicalReferenceOccurrenceCount: mentions.canonical,
    };
  }).sort((left, right) => right.priority - left.priority || left.canonicalText.localeCompare(right.canonicalText) || left.id.localeCompare(right.id));
  return {
    kind: TRANSCRIPT_CRITICAL_TERMINOLOGY_REFERENCE_KIND,
    revisionToken: input.revisionToken,
    termsSha256: input.termsSha256,
    promptTermCount: terms.length,
    referenceTermCount: terms.filter((term) => term.referenceOccurrenceCount > 0).length,
    referenceOccurrenceCount: terms.reduce((sum, term) => sum + term.referenceOccurrenceCount, 0),
    terms,
  };
}

export function parseTranscriptCriticalTerminologyReference(value: unknown): TranscriptCriticalTerminologyReference | null {
  if (value == null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Critical terminology reference is invalid.");
  const row = value as Record<string, unknown>;
  if (row.kind !== TRANSCRIPT_CRITICAL_TERMINOLOGY_REFERENCE_KIND || typeof row.revisionToken !== "string" || !SHA256.test(String(row.termsSha256))) {
    throw new Error("Critical terminology reference is invalid.");
  }
  if (!Array.isArray(row.terms) || row.terms.length > MAX_TERMS) throw new Error("Critical terminology reference terms are invalid.");
  const terms = row.terms.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("Critical terminology reference term is invalid.");
    const term = entry as Record<string, unknown>;
    const parsed: TranscriptCriticalTerminologyReferenceTerm = {
      id: String(term.id ?? ""),
      revision: Number(term.revision),
      canonicalText: String(term.canonicalText ?? ""),
      aliases: Array.isArray(term.aliases) ? term.aliases.map(String) : [],
      category: String(term.category ?? "general"),
      priority: Number(term.priority),
      referenceOccurrenceCount: Number(term.referenceOccurrenceCount),
      canonicalReferenceOccurrenceCount: Number(term.canonicalReferenceOccurrenceCount),
    };
    if (!SAFE_ID.test(parsed.id) || !Number.isSafeInteger(parsed.revision) || parsed.revision < 1 || !tokens(parsed.canonicalText).length
      || !Number.isSafeInteger(parsed.priority) || !Number.isSafeInteger(parsed.referenceOccurrenceCount) || parsed.referenceOccurrenceCount < 0
      || !Number.isSafeInteger(parsed.canonicalReferenceOccurrenceCount) || parsed.canonicalReferenceOccurrenceCount < 0
      || parsed.canonicalReferenceOccurrenceCount > parsed.referenceOccurrenceCount) {
      throw new Error("Critical terminology reference term is invalid.");
    }
    return parsed;
  });
  const promptTermCount = terms.length;
  const referenceTermCount = terms.filter((term) => term.referenceOccurrenceCount > 0).length;
  const referenceOccurrenceCount = terms.reduce((sum, term) => sum + term.referenceOccurrenceCount, 0);
  if (Number(row.promptTermCount) !== promptTermCount
    || Number(row.referenceTermCount) !== referenceTermCount || Number(row.referenceOccurrenceCount) !== referenceOccurrenceCount) {
    throw new Error("Critical terminology reference receipt does not match its terms.");
  }
  return {
    kind: TRANSCRIPT_CRITICAL_TERMINOLOGY_REFERENCE_KIND,
    revisionToken: row.revisionToken,
    termsSha256: String(row.termsSha256),
    promptTermCount,
    referenceTermCount,
    referenceOccurrenceCount,
    terms,
  };
}

export function evaluateTranscriptCriticalTerminology(
  referenceValue: unknown,
  candidateWords: readonly TranscriptEvaluationWord[],
): TranscriptCriticalTerminologyMetrics | null {
  const reference = parseTranscriptCriticalTerminologyReference(referenceValue);
  if (!reference) return null;
  const candidateTokens = transcriptTokens(candidateWords);
  let candidateMentionCount = 0;
  let matchedOccurrenceCount = 0;
  let falsePositiveMentionCount = 0;
  let canonicalCandidateMentionCount = 0;
  for (const term of reference.terms) {
    const mentions = termMentions(candidateTokens, term);
    candidateMentionCount += mentions.total;
    canonicalCandidateMentionCount += mentions.canonical;
    matchedOccurrenceCount += Math.min(term.referenceOccurrenceCount, mentions.total);
    falsePositiveMentionCount += Math.max(0, mentions.total - term.referenceOccurrenceCount);
  }
  const missedOccurrenceCount = reference.referenceOccurrenceCount - matchedOccurrenceCount;
  return {
    promptTermCount: reference.promptTermCount,
    referenceTermCount: reference.referenceTermCount,
    referenceOccurrenceCount: reference.referenceOccurrenceCount,
    candidateMentionCount,
    matchedOccurrenceCount,
    missedOccurrenceCount,
    falsePositiveMentionCount,
    canonicalCandidateMentionCount,
    conceptRecall: reference.referenceOccurrenceCount ? matchedOccurrenceCount / reference.referenceOccurrenceCount : null,
    conceptPrecision: candidateMentionCount ? matchedOccurrenceCount / candidateMentionCount : null,
    preferredSpellingRate: candidateMentionCount ? Math.min(canonicalCandidateMentionCount, matchedOccurrenceCount) / candidateMentionCount : null,
  };
}
