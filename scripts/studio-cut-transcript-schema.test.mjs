import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parseEpisodeTranscriptPayload,
  isEpisodeTranscript,
} from "../packages/studio-cut-schema/src/index.ts";

test("episode transcript schema accepts timed speaker segments", () => {
  const transcript = {
    schemaVersion: 1,
    episodeId: "episode-004",
    generatedAt: "2026-05-24T00:00:00.000Z",
    language: "en",
    segments: [
      {
        id: "transcript-001",
        startSourceTimeMs: 0,
        endSourceTimeMs: 12000,
        speaker: "Charlie",
        speakerRole: "charlie",
        text: "Let's look at the clip on screen.",
        confidence: 0.97,
      },
    ],
  };

  assert.equal(isEpisodeTranscript(transcript), true);
  assert.deepEqual(parseEpisodeTranscriptPayload(transcript), {
    ok: true,
    transcript,
  });
});

test("episode transcript schema rejects malformed segments", () => {
  const result = parseEpisodeTranscriptPayload({
    schemaVersion: 1,
    episodeId: "episode-004",
    segments: [
      {
        id: "bad-segment",
        startSourceTimeMs: 12000,
        endSourceTimeMs: 1000,
        speaker: "Charlie",
        text: "Bad timing.",
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.match(result.reason, /Transcript must include/);
});
