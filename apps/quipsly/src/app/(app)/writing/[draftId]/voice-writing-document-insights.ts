export type VoiceWritingDocumentStats = {
  wordCount: number;
  estimatedReadingMinutes: number;
};

const WORD_PATTERN = /[\p{L}\p{N}]+(?:[’'][\p{L}\p{N}]+)*/gu;

export function voiceWritingDocumentStats(
  text: string,
  wordsPerMinute = 200,
): VoiceWritingDocumentStats {
  const wordCount = String(text || "").match(WORD_PATTERN)?.length ?? 0;
  const safeWordsPerMinute = Number.isFinite(wordsPerMinute)
    ? Math.max(1, Math.round(wordsPerMinute))
    : 200;
  return {
    wordCount,
    estimatedReadingMinutes: wordCount === 0
      ? 0
      : Math.max(1, Math.ceil(wordCount / safeWordsPerMinute)),
  };
}

export function voiceWritingSectionCountLabel(count: number) {
  const safeCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  return `${safeCount} ${safeCount === 1 ? "section" : "sections"}`;
}
