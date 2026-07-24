import * as assert from "node:assert/strict";
import { test } from "node:test";

import {
  isTranscriptSegmentWord,
  parseEpisodeTranscriptPayload,
} from "./index";

test("word-timed transcript payloads retain their source timing vocabulary", () => {
  const words = [
    { id: "word-1", text: "High", startMs: 1_000, endMs: 1_200, confidence: 0.98 },
    { word: "ground", start: "1.2", end: "1.6", providerToken: "kept" },
  ];
  const parsed = parseEpisodeTranscriptPayload({
    schemaVersion: 1,
    episodeId: "episode-4",
    segments: [
      {
        id: "segment-1",
        startSourceTimeMs: 1_000,
        endSourceTimeMs: 2_000,
        speaker: "Charlie",
        text: "High ground",
        words,
      },
    ],
  });

  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.ok ? parsed.transcript.segments[0].words : null, words);
});

test("word timing guards reject ambiguous or impossible source evidence", () => {
  assert.equal(isTranscriptSegmentWord({ startMs: 100, endMs: 200 }), false);
  assert.equal(isTranscriptSegmentWord({ text: "trust", startMs: -1 }), false);
  assert.equal(isTranscriptSegmentWord({ text: "trust", confidence: 1.1 }), false);
  assert.equal(isTranscriptSegmentWord({ token: "trust", start_ms: "0.25" }), true);
});
