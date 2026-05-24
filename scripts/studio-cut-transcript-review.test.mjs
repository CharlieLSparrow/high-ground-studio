import assert from "node:assert/strict";
import { test } from "node:test";

import { buildTranscriptReview } from "../apps/studio-cut-web/src/transcriptReview.ts";

const manifest = {
  id: "episode-004",
  title: "Episode 004",
  durationMs: 10000,
  sources: {
    homer: { role: "homer", label: "Homer" },
    charlie: { role: "charlie", label: "Charlie" },
    clip: { role: "clip", label: "Clip" },
    program: { role: "program", label: "Program" },
  },
  sourceMonitorProxy: {
    localPlaceholderPath: "source-monitor-proxy.mp4",
    panes: {
      homer: { x: 0, y: 0, width: 0.5, height: 0.5 },
      charlie: { x: 0.5, y: 0, width: 0.5, height: 0.5 },
      clip: { x: 0, y: 0.5, width: 0.5, height: 0.5 },
    },
  },
  syncBootstrap: { source: "premiere" },
};

test("transcript review flags clip references and speaker state mismatches", () => {
  const review = buildTranscriptReview({
    manifest,
    sourceDurationMs: 10000,
    derivedSegments: [
      {
        startSourceTimeMs: 0,
        endSourceTimeMs: 10000,
        state: "homer",
        sourceEventId: "decision-001",
      },
    ],
    transcript: {
      schemaVersion: 1,
      episodeId: "episode-004",
      segments: [
        {
          id: "transcript-001",
          startSourceTimeMs: 1000,
          endSourceTimeMs: 5000,
          speaker: "Charlie",
          speakerRole: "charlie",
          text: "Let's look at the clip on screen now.",
        },
        {
          id: "transcript-002",
          startSourceTimeMs: 5000,
          endSourceTimeMs: 8000,
          speaker: "Homer",
          speakerRole: "homer",
          text: "Um uh you know this synthetic line is rough.",
        },
      ],
    },
  });

  assert.equal(review.status, "check");
  assert.equal(review.summary.segmentCount, 2);
  assert.equal(review.summary.clipReferenceCount, 1);
  assert.equal(review.summary.fillerMarkerCount, 3);
  assert(
    review.tasks.some((task) => task.kind === "transcript_clip_reference"),
  );
  assert(
    review.tasks.some(
      (task) => task.kind === "transcript_speaker_state_mismatch",
    ),
  );
  assert(
    review.tasks.some((task) => task.kind === "transcript_filler_cluster"),
  );
});
