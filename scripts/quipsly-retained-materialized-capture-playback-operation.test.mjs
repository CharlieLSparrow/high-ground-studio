#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { assertProtectedPlaybackBindings, captureClips } from "./quipsly-retained-materialized-capture-playback-operation.mjs";

const captureGroupId = "967f72b2-f762-4535-a337-e69b5676cad1";

function timeline() {
  return {
    clips: [
      { id: "other", assetId: "/api/ingest/media/other" },
      {
        id: "spine",
        assetId: "/api/ingest/media/cmsi2ifcf000blqxl6ho1zsaa",
        captureTakeSource: { captureGroupId, recordingAssetId: "recording-1", mediaAssetId: "media-1", sourceId: "source-1" },
      },
      {
        id: "target",
        assetId: "/api/ingest/media/cmsi2v3tf000llqxljw2v8xc0",
        captureTakeSource: { captureGroupId, recordingAssetId: "recording-2", mediaAssetId: "media-2", sourceId: "source-2" },
      },
    ],
  };
}

test("retained playback assertion accepts protected URLs with durable provenance", () => {
  assert.equal(captureClips(timeline()).length, 2);
  assert.equal(assertProtectedPlaybackBindings(timeline()).length, 2);
});

test("retained playback assertion rejects bare database IDs", () => {
  const fixture = timeline();
  fixture.clips[1].assetId = "media-1";
  assert.throws(() => assertProtectedPlaybackBindings(fixture), /protected playback URLs/);
});

test("operation is explicitly retained, local-only, and credential-safe", async () => {
  const source = await readFile(new URL("./quipsly-retained-materialized-capture-playback-operation.mjs", import.meta.url), "utf8");
  assert.match(source, /QUIPSLY_RETAINED_CAPTURE_PLAYBACK_OPERATION/);
  assert.match(source, /requireLoopbackOrigin/);
  assert.match(source, /readRetainedQAPassword/);
  assert.doesNotMatch(source, /password\s*=\s*["'][^"']+["']/i);
  assert.match(source, /sourceMediaMutated:\s*false/);
  assert.match(source, /publicationStarted:\s*false/);
  assert.match(source, /spine-source-ambiguous/);
  assert.match(source, /Make this the main spine audio/);
  assert.match(source, /Update episode with current evidence/);
  assert.match(source, /transcriptBlocksAdded >= 0/);
  assert.match(source, /unrelatedTimelineClipsPreserved >= 1/);
  assert.match(source, /searchParams\.get\("recordingAssetId"\) === TRANSCRIPT_RECORDING_ASSET_ID/);
  assert.match(source, /roomWideEvaluationSuppressed/);
  const editorSource = await readFile(new URL("../apps/quipsly/src/app/(app)/editor/page.tsx", import.meta.url), "utf8");
  assert.match(editorSource, /<Player\s+key=\{timelineFingerprint\}/);
  assert.match(editorSource, /className="quipsly-remotion-player"/);
  assert.match(editorSource, /numberOfSharedAudioTags=\{0\}/);
});
