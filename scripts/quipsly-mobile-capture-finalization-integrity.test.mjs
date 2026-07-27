#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [finalization, schema, additiveSql, releaseRoute, records] = await Promise.all([
  readFile(new URL("../apps/quipsly/src/lib/server/mobile-capture-resumable-finalization.ts", import.meta.url), "utf8"),
  readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8"),
  readFile(new URL("../ops/quipsly-coaching-capture-additive.sql", import.meta.url), "utf8"),
  readFile(new URL("../apps/quipsly/src/app/api/mobile/capture/uploads/resumable/release/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../apps/quipsly/src/lib/server/mobile-capture-records.ts", import.meta.url), "utf8"),
]);

assert.match(finalization, /isolationLevel: "Serializable"/);
assert.match(finalization, /SELECT 1 AS locked FROM pg_advisory_xact_lock\(hashtextextended\(\$1, 0\)\)/,
  "same-upload finalizers must serialize before source creation");
assert.match(finalization, /StudioEpisodeProduction" WHERE "id" = \$1 FOR UPDATE/,
  "different uploads targeting one episode must lock the projection row");
assert.ok(
  finalization.indexOf("FOR UPDATE") < finalization.indexOf("productionJson: {") ,
  "the episode row lock must be acquired before importedMedia is written",
);
assert.match(finalization, /mobileCaptureEpisodeAttachment\.findUnique/);
assert.match(finalization, /mobileCaptureEpisodeAttachment\.create/);
assert.match(finalization, /studioAssetAttachment\.upsert/,
  "released Capture sources must use the canonical Nest asset attachment");
assert.match(finalization, /studioWorkflowJob\.create/,
  "released Capture sources must enter the durable processing ledger");
assert.match(finalization, /type: isVideo \? "asset-proxy" : "asset-register"/);
assert.match(finalization, /proxy-required-before-collaborative-playback/);
assert.match(finalization, /canonicalField:\s+"StudioEpisodeProduction\.productionJson\.importedMedia"/);
assert.doesNotMatch(
  finalization.slice(
    finalization.indexOf("async function attachEpisodeMediaWithoutLostUpdate"),
    finalization.indexOf("function captureRecordInput"),
  ),
  /data:\s*\{\s*timelineJson:/,
  "Capture finalization must not write episode sources into timelineJson",
);
assert.match(schema, /model MobileCaptureEpisodeAttachment \{/);
assert.match(schema, /uploadSessionId\s+String\s+@id @db\.Uuid/);
assert.match(schema, /@@unique\(\[productionId, mediaAssetId\]\)/);
assert.match(additiveSql, /MobileCaptureEpisodeAttachment_productionId_mediaAssetId_key/);
assert.match(finalization, /isRetryableCaptureRoomTransactionError/,
  "serialization and unique conflicts must retry the whole finalizer");

const heldBranch = finalization.slice(
  finalization.indexOf('if (processingDecision.disposition === "HELD")'),
  finalization.indexOf("const studioMedia = await createOrReuseStudioMedia"),
);
assert.doesNotMatch(heldBranch, /createOrReuseStudioMedia/,
  "HELD uploads must not create reusable source/media rows");
assert.doesNotMatch(heldBranch, /attachEpisodeMediaWithoutLostUpdate/,
  "HELD uploads must not attach to an episode");
assert.match(heldBranch, /recordMobileCaptureIngestion/,
  "HELD uploads still preserve app-owned RecordingAsset evidence");
assert.match(records, /transcriptionDisposition/);
assert.match(records, /provider: processingHold \? "processing-hold" : "consent-required"/);
assert.match(finalization, /originalDecision: Object\.keys\(originalDecision\)\.length > 0/,
  "release must preserve the first HELD decision rather than rewrite its reason");
assert.match(finalization, /initialRoomReadiness: args\.manifest\.initialRoomReadiness/);

assert.match(releaseRoute, /Only Quipsly staff may release held capture media/);
assert.match(releaseRoute, /allowedKeys = new Set\(\["uploadSessionId", "reason"\]\)/);
assert.match(releaseRoute, /computeMobileCaptureObjectSha256/);
assert.match(releaseRoute, /initialRoomReadiness, startReceiptId, consentVersion/);

console.log("PASS: capture finalization is serializable, normalized, idempotent, hold-safe, and explicitly releasable.");
