import {
  aiEditTranscriptBounds,
  canonicalAiEditTranscript,
} from "./ai-edit-proposal-contract";

const blocks = [
  { id: "block-b", time: 4, duration: 3, text: "  Restart that thought. " },
  { id: "block-a", time: 0, duration: 4, text: "Welcome back." },
];

describe("AI edit proposal evidence", () => {
  it("canonicalizes ordering, whitespace, and millisecond timing", () => {
    expect(canonicalAiEditTranscript(blocks)).toBe(canonicalAiEditTranscript([
      { id: "block-a", time: 0.0004, duration: 4.0004, text: "Welcome back." },
      { id: "block-b", time: 4.0004, duration: 3.0004, text: "Restart that thought." },
    ]));
  });

  it("changes the evidence payload when source words or timing change materially", () => {
    expect(canonicalAiEditTranscript(blocks)).not.toBe(canonicalAiEditTranscript([
      ...blocks.slice(0, 1),
      { ...blocks[1], text: "Welcome to a different show." },
    ]));
    expect(canonicalAiEditTranscript(blocks)).not.toBe(canonicalAiEditTranscript([
      { ...blocks[0], time: 4.01 },
      blocks[1],
    ]));
  });

  it("reports the exact proof-watch transcript bounds", () => {
    expect(aiEditTranscriptBounds(blocks)).toEqual({ startSeconds: 0, endSeconds: 7 });
  });
});
