import assert from "node:assert/strict";
import { test } from "node:test";

import { buildSyncReviewSummary } from "../apps/studio-cut-web/src/syncReview.ts";

const referenceRail = {
  syncJobId: "episode-004-rescue-sync",
  referenceRole: "phoneReferenceAudio",
  segments: [
    {
      inputId: "phone-reference-02",
      fileName: "phone-reference-02.m4a",
      railStartMs: 6000,
      sourceStartMs: 0,
      durationMs: 4000,
      confidence: 0.83,
      warnings: ["Low reference level in middle section."],
    },
    {
      inputId: "phone-reference-01",
      fileName: "phone-reference-01.m4a",
      railStartMs: 0,
      sourceStartMs: 0,
      durationMs: 6000,
      confidence: 0.95,
      warnings: [],
    },
  ],
  totalDurationMs: 10000,
  warnings: [],
};

const syncMap = {
  syncMapId: "episode-004-sync-map",
  syncJobId: "episode-004-rescue-sync",
  projectId: "episode-004",
  branchId: "main",
  createdAt: "2026-05-24T00:00:00.000Z",
  updatedAt: "2026-05-24T00:01:00.000Z",
  canonicalTimeline: {
    durationMs: 10000,
    timebase: "milliseconds",
    referenceRole: "phoneReferenceAudio",
  },
  assets: [
    {
      assetId: "charlie-video-asset",
      inputId: "charlie-video",
      role: "charlieVideo",
      fileName: "charlie-video.mp4",
      timelineStartMs: 1200,
      assetStartMs: 0,
      durationMs: 8800,
      estimatedOffsetMs: 1200,
      confidence: 0.81,
      warnings: [],
    },
    {
      assetId: "homer-video-asset",
      inputId: "homer-video",
      role: "homerVideo",
      fileName: "homer-video.mp4",
      timelineStartMs: 0,
      assetStartMs: 0,
      durationMs: 10000,
      estimatedOffsetMs: 0,
      confidence: 0.9,
      warnings: ["Synthetic asset warning."],
    },
  ],
  referenceRail,
  globalWarnings: ["Synthetic sync map warning."],
};

const syncReport = {
  syncJobId: "episode-004-rescue-sync",
  generatedAt: "2026-05-24T00:01:00.000Z",
  status: "ready",
  referenceRail,
  trackOffsets: [
    {
      role: "charlieVideo",
      inputId: "charlie-video",
      fileName: "charlie-video.mp4",
      estimatedOffsetMs: 1200,
      confidence: 0.81,
      anchorCount: 3,
      anchorAgreementMs: 24,
      driftPpm: 0,
      warnings: ["Synthetic offset warning."],
    },
    {
      role: "homerVideo",
      inputId: "homer-video",
      fileName: "homer-video.mp4",
      estimatedOffsetMs: 0,
      confidence: 0.9,
      anchorCount: 3,
      anchorAgreementMs: 18,
      warnings: [],
    },
  ],
  globalWarnings: ["Synthetic sync report warning."],
};

test("sync review summary exposes reference rail, offsets, roles, and warnings", () => {
  const summary = buildSyncReviewSummary(syncMap, syncReport);

  assert.equal(summary.timelineDurationMs, 10000);
  assert.equal(summary.assetCount, 2);
  assert.equal(summary.referencePieceCount, 2);
  assert.equal(summary.trackOffsetCount, 2);
  assert.equal(summary.lowestConfidence, 0.81);
  assert.match(summary.roleSummary, /Homer video x1/);
  assert.match(summary.roleSummary, /Charlie video x1/);
  assert.deepEqual(
    summary.referenceSegments.map((segment) => segment.inputId),
    ["phone-reference-01", "phone-reference-02"],
  );
  assert.deepEqual(
    summary.offsetDetails.map((offset) => offset.inputId),
    ["homer-video", "charlie-video"],
  );
  assert.equal(summary.offsetDetails[1].anchorCount, 3);
  assert.equal(summary.offsetDetails[1].anchorAgreementMs, 24);
  assert(
    summary.warningDetails.some((warning) =>
      warning.message.includes("Synthetic sync map warning"),
    ),
  );
  assert(
    summary.warningDetails.some((warning) =>
      warning.message.includes("Synthetic offset warning"),
    ),
  );
});

test("sync review summary falls back to Sync Map offsets without a report", () => {
  const summary = buildSyncReviewSummary(syncMap);

  assert.equal(summary.trackOffsetCount, 2);
  assert.equal(summary.offsetDetails[0].source, "syncMap");
  assert.equal(summary.offsetDetails[1].estimatedOffsetMs, 1200);
});
