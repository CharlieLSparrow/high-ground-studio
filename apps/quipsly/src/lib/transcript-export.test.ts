import { createTranscriptExport, transcriptHasSubtitleTiming, type TranscriptExportPassage } from "./transcript-export";

const passage: TranscriptExportPassage = {text: "I will finish the chapter.", speakerLabel: "Riley", startSeconds: 3.66, endSeconds: 5.84};
const base = {title: "Coaching session", segments: [passage]};

it("exports clean effective text without jobs, review labels, or provider metadata", () => {
  const output = createTranscriptExport({...base, format: "txt"});
  expect(output.filename).toBe("coaching-session-transcript.txt");
  expect(output.content).toBe("Coaching session\n\n[00:00:03.660] Riley\nI will finish the chapter.\n");
  expect(output.content).not.toMatch(/provider|reviewed|job|immutable/i);
});

it("can produce just readable paragraphs without timestamps or names", () => {
  expect(createTranscriptExport({...base, format: "txt", timestamps: false, speakers: false}).content)
    .toBe("Coaching session\n\nI will finish the chapter.\n");
});

it("uses Session alignment without changing the original source timestamps", () => {
  const segment = {...passage, programStartSeconds: 11.25, programEndSeconds: 13.43};
  const before = {...segment};
  const output = createTranscriptExport({...base, segments: [segment], format: "srt"});
  expect(output.content).toBe("1\n00:00:11,250 --> 00:00:13,430\nRiley: I will finish the chapter.\n");
  expect(segment).toEqual(before);
});

it("keeps simultaneous speakers instead of shifting their speech to remove overlaps", () => {
  const output = createTranscriptExport({...base, format: "vtt", segments: [
    {...passage, startSeconds: 3, endSeconds: 6}, {...passage, speakerLabel: "Casey", startSeconds: 2, endSeconds: 4},
  ]});
  expect(output.content.startsWith("WEBVTT\n\n1\n00:00:02.000 --> 00:00:04.000\nCasey:")).toBe(true);
  expect(output.content).toContain("2\n00:00:03.000 --> 00:00:06.000\nRiley:");
});

it("rounds milliseconds correctly across minute and hour boundaries", () => {
  const output = createTranscriptExport({...base, format: "srt", segments: [{...passage, startSeconds: 59.9999, endSeconds: 3600.001}]});
  expect(output.content).toContain("00:01:00,000 --> 01:00:00,001");
});

it.each([
  {startSeconds: -1}, {endSeconds: NaN}, {endSeconds: 3.66},
  {endSeconds: 3.66001}, {programStartSeconds: 10}, {programEndSeconds: 11},
])("rejects invalid or half-aligned subtitle timing: %j", timing => {
  const segments = [{...passage, ...timing}];
  expect(transcriptHasSubtitleTiming(segments)).toBe(false);
  expect(() => createTranscriptExport({...base, segments, format: "vtt"})).toThrow("Subtitle timing");
  expect(createTranscriptExport({...base, segments, format: "txt"}).content).toContain(passage.text);
});

it("does not let transcript text create subtitle markup or extra cues", () => {
  const output = createTranscriptExport({...base, format: "vtt", segments: [{...passage, text: "<script>& hello\n\n2\n00:00:00 --> 00:00:02"}]});
  expect(output.content).toContain("&lt;script&gt;&amp; hello 2 00:00:00 --&gt; 00:00:02");
  expect(output.content).not.toContain("<script>");
});

it("escapes Markdown while preserving the text and optional speaker labels", () => {
  const output = createTranscriptExport({...base, title: "# Chapter", format: "md", segments: [{...passage, text: "[notes](https://example.test)"}]});
  expect(output.content).toContain("# \\# Chapter");
  expect(output.content).toContain("**Riley**");
  expect(output.content).toContain("\\[notes\\](https://example.test)");
});
