import { projectEditedTranscript, type EditableTranscriptPassage } from "./edited-transcript-export";
import { createTranscriptExport } from "./transcript-export";

const passage = (text: string, startSeconds: number, endSeconds: number): EditableTranscriptPassage => ({text, speakerLabel: "Coach", startSeconds, endSeconds});
const edit = (ranges: number[][], fade = 0) => ({keptRanges: ranges.map(([startSeconds, endSeconds]) => ({startSeconds, endSeconds})), joinCrossfadeSeconds: fade});
const timed: EditableTranscriptPassage = {...passage("We write clear notes today.", 10, 15), providerText: "We write clear notes today.", words: ["We", "write", "clear", "notes", "today."].map((text, i) => ({text, startSeconds: 10 + i, endSeconds: 10.8 + i}))};

it("removes cut passages and maps later subtitles through every crossfade without stretching", () => {
  const result = projectEditedTranscript([passage("Opening", 3, 4), passage("Remove this", 6, 7), passage("Next", 10, 11), passage("Last", 15, 16)], edit([[2, 5], [9, 12], [14, 18]], 0.01), 10);
  expect(result.durationSeconds).toBeCloseTo(9.98);
  expect(result.segments.map(s => s.text)).toEqual(["Opening", "Next", "Last"]);
  expect(result.segments.map(s => s.startSeconds)).toEqual([1, 3.99, 6.98]);
  const srt = createTranscriptExport({title: "Edited", segments: result.segments, format: "srt"}).content;
  expect(srt).toContain("00:00:03,990 --> 00:00:04,990");
  expect(srt).not.toContain("Remove this");
});

it("uses only fully retained words at a partial trim and does not claim timing for cut word fragments", () => {
  const result = projectEditedTranscript([timed], edit([[11.4, 14]]), 2.6);
  expect(result.segments).toEqual([{text: "clear notes", speakerLabel: "Coach", startSeconds: 0.5999999999999996, endSeconds: 2.4000000000000004}]);
  expect(result.omittedBoundaryPassages).toBe(1);
});

it("preserves full corrected passages and maps a corrected phrase as an atomic original span", () => {
  const corrected = {...timed, text: "We draft excellent research notes today."};
  expect(projectEditedTranscript([corrected], edit([[10, 15]]), 5).segments[0].text).toBe(corrected.text);
  expect(projectEditedTranscript([corrected], edit([[11, 14]]), 3).segments[0].text).toBe("draft excellent research notes");
  const cut = projectEditedTranscript([corrected], edit([[12, 14]]), 2);
  expect(cut.segments[0].text).toBe("notes");
  expect(cut.omittedBoundaryPassages).toBe(1);
});

it("keeps insertions attached to an anchored word and applies deletions without moving later clocks", () => {
  const inserted = {...timed, text: "Yes, we write very clear notes today. Absolutely."};
  const result = projectEditedTranscript([inserted], edit([[10, 12], [14, 15]], 0.01), 2.99);
  expect(result.segments.map(s => s.text)).toEqual(["Yes, we write very", "today. Absolutely."]);
  const removed = {...timed, text: "We write notes today."};
  expect(projectEditedTranscript([removed], edit([[11, 14]]), 3).segments[0].text).toBe("write notes");
});

it("does not leak a partially retained passage when no word anchors exist", () => {
  const result = projectEditedTranscript([passage("Private part followed by shared part", 0, 5)], edit([[3, 6]]), 3);
  expect(result.segments).toEqual([]);
  expect(result.omittedBoundaryPassages).toBe(1);
});

it("does not attach un-timed provider text to the last available word", () => {
  const incomplete = {...timed, words: timed.words!.slice(0, 2)};
  const result = projectEditedTranscript([incomplete], edit([[10, 12]]), 2);
  expect(result.segments).toEqual([]);
  expect(result.omittedBoundaryPassages).toBe(1);
  expect(projectEditedTranscript([incomplete], edit([[10, 15]]), 5).segments[0].text).toBe(timed.text);
});

it("retains overlapping speakers, repeated words and source-relative offsets already on the program clock", () => {
  const result = projectEditedTranscript([timed, {...passage("Yes", 12.3, 12.6), speakerLabel: "Client"}], edit([[12, 15]]), 3);
  expect(result.segments.map(s => s.speakerLabel)).toEqual(["Coach", "Client"]);
  expect(result.segments[1].startSeconds).toBeCloseTo(0.3);
  const repeated = {...timed, text: "We write write clear notes today."};
  expect(projectEditedTranscript([repeated], edit([[11, 15]]), 4).segments[0].text).toContain("write write");
});

it.each([
  [edit([[3, 2]]), 1], [edit([[0, 3], [2, 4]], 0.01), 5], [edit([[0, 1]], 0.2), 1],
  [edit([[0, 1]]), 10], [edit([[0, Number.NaN]]), 1], [edit([]), 1],
] as const)("rejects a mismatched or malformed saved edit", (value, duration) => {
  expect(() => projectEditedTranscript([timed], value, duration)).toThrow();
});
