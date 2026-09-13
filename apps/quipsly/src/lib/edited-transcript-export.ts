import type { TranscriptExportPassage } from "./transcript-export";

export type TimedTranscriptWord = { text: string; startSeconds: number; endSeconds: number };
export type EditableTranscriptPassage = TranscriptExportPassage & { words?: TimedTranscriptWord[]; providerText?: string };
export type RecordingTranscriptEdit = {
  keptRanges: Array<{ startSeconds: number; endSeconds: number }>;
  joinCrossfadeSeconds: number;
};

const tokenKey = (text: string) => text.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const contains = (range: {startSeconds: number; endSeconds: number}, start: number, end: number) =>
  start >= range.startSeconds - 0.000001 && end <= range.endSeconds + 0.000001;

/** Corrections do not create new word timing. Unchanged words retain their
 * anchors; a replacement phrase is one atomic span over its original words.
 * If a cut splits that span, omit it rather than leak removed words or invent
 * timestamps. Full passages always retain the complete corrected text. */
function correctedUnits(passage: EditableTranscriptPassage): TimedTranscriptWord[] {
  const words = passage.words ?? [];
  const tokens = passage.text.trim().split(/\s+/).filter(Boolean);
  if (!words.length || !tokens.length || words.length * tokens.length > 250_000 ||
    tokenKey(words.map(word => word.text).join(" ")) !== tokenKey(passage.providerText ?? passage.text) ||
    words.some((word, i) => !Number.isFinite(word.startSeconds) || !Number.isFinite(word.endSeconds) ||
      word.endSeconds <= word.startSeconds || word.startSeconds < passage.startSeconds - 0.1 ||
      word.endSeconds > passage.endSeconds + 0.1 || (i > 0 && word.startSeconds < words[i - 1].endSeconds - 0.02))) {
    return [{text: passage.text, startSeconds: passage.startSeconds, endSeconds: passage.endSeconds}];
  }
  const sourceKeys = words.map(word => tokenKey(word.text));
  const targetKeys = tokens.map(tokenKey);
  const columns = tokens.length + 1;
  const table = new Uint32Array((words.length + 1) * columns);
  for (let i = words.length - 1; i >= 0; i--) for (let j = tokens.length - 1; j >= 0; j--) {
    table[i * columns + j] = sourceKeys[i] && sourceKeys[i] === targetKeys[j]
      ? 1 + table[(i + 1) * columns + j + 1]
      : Math.max(table[(i + 1) * columns + j], table[i * columns + j + 1]);
  }
  const matches: Array<[number, number]> = [];
  let i = 0, j = 0;
  while (i < words.length && j < tokens.length) {
    if (sourceKeys[i] && sourceKeys[i] === targetKeys[j]) { matches.push([i++, j++]); }
    else if (table[(i + 1) * columns + j] >= table[i * columns + j + 1]) i++;
    else j++;
  }
  const units: TimedTranscriptWord[] = [];
  let sourceCursor = 0, targetCursor = 0;
  for (const [sourceIndex, targetIndex] of [...matches, [words.length, tokens.length]]) {
    const replacement = tokens.slice(targetCursor, targetIndex).join(" ");
    if (replacement) {
      if (sourceIndex > sourceCursor) units.push({text: replacement, startSeconds: words[sourceCursor].startSeconds, endSeconds: words[sourceIndex - 1].endSeconds});
      else if (units.length) units[units.length - 1].text += ` ${replacement}`;
      else if (sourceIndex < words.length) {
        units.push({...words[sourceIndex], text: `${replacement} ${tokens[targetIndex]}`});
        sourceCursor = sourceIndex + 1; targetCursor = targetIndex + 1;
        continue;
      }
    }
    if (sourceIndex < words.length) units.push({...words[sourceIndex], text: tokens[targetIndex]});
    sourceCursor = sourceIndex + 1; targetCursor = targetIndex + 1;
  }
  return units;
}

/** Same ripple clock as the audio renderer: each following range begins one
 * crossfade before the preceding range ends. Never stretch captions to fit
 * container/encoder padding. Inputs must already use the saved program clock. */
export function projectEditedTranscript(passages: readonly EditableTranscriptPassage[], edit: RecordingTranscriptEdit, renderedDurationSeconds: number) {
  const ranges = edit.keptRanges;
  const fade = edit.joinCrossfadeSeconds;
  if (!Array.isArray(ranges) || !ranges.length || ranges.length > 500 || !Number.isFinite(fade) || fade < 0 || fade > 0.05 ||
    ranges.some((range, index) => !Number.isFinite(range.startSeconds) || !Number.isFinite(range.endSeconds) || range.startSeconds < 0 ||
      range.endSeconds - range.startSeconds < Math.max(0.05, fade * 2) || (index > 0 && range.startSeconds < ranges[index - 1].endSeconds))) {
    throw new Error("This recording’s saved edit timing is unavailable.");
  }
  const durationSeconds = ranges.reduce((sum, range) => sum + range.endSeconds - range.startSeconds, 0) - (ranges.length - 1) * fade;
  if (!Number.isFinite(renderedDurationSeconds) || renderedDurationSeconds <= 0 || Math.abs(durationSeconds - renderedDurationSeconds) > 0.25) {
    throw new Error("The recording duration does not match its saved edit.");
  }
  const segments: TranscriptExportPassage[] = [];
  const omitted = new Set<number>();
  let outputStart = 0;
  for (const range of ranges) {
    for (const [index, passage] of passages.entries()) {
      if (!passage.text.trim() || !Number.isFinite(passage.startSeconds) || !Number.isFinite(passage.endSeconds) || passage.endSeconds <= passage.startSeconds) continue;
      if (passage.endSeconds <= range.startSeconds || passage.startSeconds >= range.endSeconds) continue;
      const whole = contains(range, passage.startSeconds, passage.endSeconds);
      const units = whole ? [{text: passage.text, startSeconds: passage.startSeconds, endSeconds: passage.endSeconds}] : correctedUnits(passage);
      const kept = units.filter(unit => contains(range, unit.startSeconds, unit.endSeconds));
      if (!whole && units.some(unit => unit.startSeconds < range.endSeconds && unit.endSeconds > range.startSeconds && !contains(range, unit.startSeconds, unit.endSeconds))) omitted.add(index);
      if (!kept.length) continue;
      const startSeconds = Math.max(0, outputStart + kept[0].startSeconds - range.startSeconds);
      const endSeconds = Math.min(durationSeconds, renderedDurationSeconds, outputStart + kept[kept.length - 1].endSeconds - range.startSeconds);
      if (Math.round(endSeconds * 1000) <= Math.round(startSeconds * 1000)) continue;
      segments.push({text: kept.map(unit => unit.text).join(" "), speakerLabel: passage.speakerLabel, startSeconds, endSeconds});
    }
    outputStart += range.endSeconds - range.startSeconds - fade;
  }
  return {segments: segments.sort((a, b) => a.startSeconds - b.startSeconds), durationSeconds, omittedBoundaryPassages: omitted.size};
}
