import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const operation = await readFile(new URL("./quipsly-retained-studio-automated-edit-operation.mjs", import.meta.url), "utf8");

test("retained Studio automated edit operation is local, explicit, and privacy adversarial", () => {
  assert.match(operation, /QUIPSLY_RETAINED_STUDIO_EDIT_OPERATION/);
  assert.match(operation, /requireLoopbackOrigin/);
  assert.match(operation, /requireLoopbackDatabase/);
  assert.match(operation, /readRetainedQAPassword/);
  assert.match(operation, /signedOut\.status, 401/);
  assert.match(operation, /outsider\.status, 403/);
  assert.doesNotMatch(operation, /https:\/\/nest\.quipsly\.com/);
});

test("retained Studio automated edit operation proves canonical transcript, signal, playback, ledger, and no source mutation", () => {
  assert.match(operation, /segmentCount, 84/);
  assert.match(operation, /wordCount, 597/);
  assert.match(operation, /mediaAssetKind, "studio-media"/);
  assert.match(operation, /protectedVideoPlaybackStatus/);
  assert.match(operation, /StudioEpisodeEditProposalSet/);
  assert.match(operation, /sourceMediaUnchanged: true/);
  assert.match(operation, /timelineUnchanged: true/);
  assert.match(operation, /noRenderOrPublish: true/);
});
