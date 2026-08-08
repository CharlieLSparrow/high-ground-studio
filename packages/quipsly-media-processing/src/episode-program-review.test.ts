import assert from "node:assert/strict";
import test from "node:test";

import {
  episodeProgramReviewCoverage,
  parseEpisodeProgramReviewPlaybackEvidence,
} from "./episode-program-review.js";

function evidence(overrides: Record<string, unknown> = {}) {
  return {
    kind: "quipsly-episode-program-review-playback-evidence-v1",
    durationSeconds: 10,
    watchedSecondBins: Array.from({ length: 10 }, (_, index) => index),
    playbackStartedAt: "2026-08-08T12:00:00.000Z",
    playbackEndedAt: "2026-08-08T12:00:10.000Z",
    playthroughEnded: true,
    maximumPlaybackRate: 1,
    mutedAtDecision: false,
    volumeAtDecision: 1,
    seekCount: 0,
    ...overrides,
  };
}

test("complete audible program playback is approval-ready", () => {
  assert.deepEqual(episodeProgramReviewCoverage(evidence(), 10), {
    watchedBinCount: 10,
    requiredBinCount: 10,
    watchedFraction: 1,
    includesStart: true,
    includesMiddle: true,
    includesEnd: true,
    completedPlaythrough: true,
    audibleAtDecision: true,
    acceptablePlaybackRate: true,
    approvalReady: true,
  });
});

test("seeking to the end cannot manufacture a full review", () => {
  const coverage = episodeProgramReviewCoverage(evidence({
    watchedSecondBins: [0, 9],
    seekCount: 1,
  }), 10);
  assert.equal(coverage.includesStart, true);
  assert.equal(coverage.includesEnd, true);
  assert.equal(coverage.approvalReady, false);
});

test("muted or excessive-speed playback stays held", () => {
  assert.equal(episodeProgramReviewCoverage(evidence({ mutedAtDecision: true }), 10).approvalReady, false);
  assert.equal(episodeProgramReviewCoverage(evidence({ maximumPlaybackRate: 2.5 }), 10).approvalReady, false);
});

test("evidence rejects wrong duration, duplicate bins, and false completion", () => {
  assert.throws(() => parseEpisodeProgramReviewPlaybackEvidence(evidence({ durationSeconds: 11 }), 10));
  assert.throws(() => parseEpisodeProgramReviewPlaybackEvidence(evidence({ watchedSecondBins: [0, 0, 1] }), 10));
  assert.throws(() => parseEpisodeProgramReviewPlaybackEvidence(evidence({ playbackEndedAt: null }), 10));
});
