#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { normalizeMobileCaptureResumableManifestForRead } from "../apps/quipsly/src/lib/server/mobile-capture-resumable-manifest.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const createRoute = read("apps/quipsly/src/app/api/ingest/mobile/resumable/route.ts");
const finalizeRoute = read("apps/quipsly/src/app/api/ingest/mobile/resumable/finalize/route.ts");
const store = read("apps/quipsly/src/lib/server/mobile-capture-resumable-store.ts");
const finalization = read("apps/quipsly/src/lib/server/mobile-capture-resumable-finalization.ts");
const records = read("apps/quipsly/src/lib/server/mobile-capture-records.ts");
const legacyChunk = read("apps/quipsly/src/app/api/ingest/mobile/chunk/route.ts");
const legacyMultipart = read("apps/quipsly/src/app/api/ingest/mobile/route.ts");
const canonicalWrapper = read("apps/quipsly/src/app/api/mobile/capture/uploads/resumable/route.ts");
const canonicalFinalizeWrapper = read("apps/quipsly/src/app/api/mobile/capture/uploads/resumable/finalize/route.ts");
const readiness = read("apps/quipsly/src/app/api/mobile/capture/readiness/route.ts");
const sessionsRoute = read("apps/quipsly/src/app/api/mobile/capture/sessions/route.ts");

test("canonical upload creation is authenticated, room-project-bound, consent-bound, and immutable", () => {
  for (const required of [
    "getQuipslySessionFromRequest",
    "resolveRoomBoundProject",
    "assertMobileCaptureUploadReferences",
    "recordingConsentId",
    "expectedSizeBytes",
    "normalizeMobileCaptureSha256",
    "mobileCaptureResumableBindingMismatch",
    "evaluateMobileCaptureRoomReadiness",
    "preservation-only",
  ]) {
    assert.ok(createRoute.includes(required), required);
  }
  assert.ok(createRoute.includes("Cache-Control\": \"private, no-store"));
  assert.ok(createRoute.includes("createMobileCaptureResumableManifest"));
  assert.ok(createRoute.includes("objectPath: manifest.objectName"));
  assert.ok(createRoute.includes("payload.restartUploadSession || mobileCaptureUploadUriIsExpired"));
  assert.equal(createRoute.includes("actorCanWriteProject"), false,
    "room-authorized coachees may preserve their own bytes without becoming Studio editors");
  assert.ok(createRoute.includes("Upload project must match the server-owned capture room binding"));
  assert.ok(finalizeRoute.includes("Upload project binding no longer matches its capture room"));
  assert.ok(sessionsRoute.includes("ensureHomeNestForEmail"));
  assert.ok(sessionsRoute.includes("projectSlug: captureProjectSlug"));
  assert.ok(sessionsRoute.includes("projectId: captureProjectId"));
  assert.equal(sessionsRoute.includes('nestSlug: text(body.nestSlug) || "home"'), false,
    "quick sessions must bind the real actor Home Nest instead of a non-existent literal alias");
});

test("legacy v2 manifests normalize to preservation-only while quarantining historical authority claims", () => {
  const uploadSessionId = "9d8c0c81-847f-4e16-96d0-26b494c890aa";
  const normalized = normalizeMobileCaptureResumableManifestForRead({
    kind: "quipsly-mobile-capture-gcs-resumable-v2",
    version: 2,
    status: "verified",
    uploadSessionId,
    actorUserId: "legacy-actor",
    callRoomId: "legacy-room",
    recordingConsentId: "legacy-consent",
    createdAt: "2026-07-17T00:00:00.000Z",
    finalization: {
      sourceId: "legacy-source",
      mediaAssetId: "legacy-media",
      transcriptJobId: "legacy-transcript",
      transcriptJobStatus: "QUEUED",
    },
  }, uploadSessionId);

  assert.equal(normalized.captureId, uploadSessionId);
  assert.equal(normalized.roomReadinessBindingVersion, 0);
  assert.equal(normalized.processingDisposition, "preservation-only");
  assert.equal(normalized.startReceiptId, null);
  assert.equal(normalized.consentVersion, null);
  assert.equal(normalized.initialRoomReadiness.reasonCode, "LEGACY_START_BINDING_MISSING");
  assert.equal(normalized.initialRoomReadiness.eligibleForProcessing, false);
  assert.equal(normalized.finalization?.processingDisposition, "HELD",
    "historical source/media IDs cannot confer current processing authority");
  assert.equal(normalized.finalization?.transcriptDisposition, "HELD",
    "a historical queued transcript cannot confer current transcript authority");
  assert.equal(normalized.finalization?.sourceId, null);
  assert.equal(normalized.finalization?.mediaAssetId, null);
  assert.equal(normalized.finalization?.transcriptJobId, null);
  assert.equal(normalized.finalization?.legacyHistoricalEvidence?.sourceId, "legacy-source");
  assert.equal(normalized.finalization?.legacyHistoricalEvidence?.mediaAssetId, "legacy-media");
  assert.equal(normalized.finalization?.legacyHistoricalEvidence?.transcriptJobId, "legacy-transcript");

  const unfinished = normalizeMobileCaptureResumableManifestForRead({
    kind: "quipsly-mobile-capture-gcs-resumable-v2",
    version: 2,
    status: "verified",
    uploadSessionId,
    actorUserId: "legacy-actor",
    callRoomId: "legacy-room",
    recordingConsentId: "legacy-consent",
    createdAt: "2026-07-17T00:00:00.000Z",
  }, uploadSessionId);
  assert.equal(unfinished.finalization, null,
    "a verified legacy manifest without DB evidence remains visibly unfinished so finalize can create a HELD receipt");
});

test("recording bytes go directly to a preconditioned private GCS resumable session", () => {
  for (const required of [
    "createResumableUpload",
    "private: true",
    "ifGenerationMatch: 0",
    "contentLength: manifest.expectedSizeBytes",
    "quipslyExpectedSha256",
    "quipslyRoomReadinessBindingVersion",
    "saveMobileCaptureResumableManifest",
    "media-vault/control/mobile-capture-resumable",
  ]) {
    assert.ok(`${store}\n${read("apps/quipsly/src/lib/server/mobile-capture-security.ts")}`.includes(required), required);
  }

  for (const forbidden of ["node:fs", "node:os", "tmpdir(", "assembledPath", "INGEST_ROOT"]) {
    assert.equal(`${createRoute}\n${finalizeRoute}\n${store}`.includes(forbidden), false, forbidden);
  }
});

test("finalization streams and verifies one immutable storage generation before app records", () => {
  for (const required of [
    "getMobileCaptureObjectEvidence",
    "object.sizeBytes !== manifest.expectedSizeBytes",
    "computeMobileCaptureObjectSha256",
    "hashed.sha256 !== stored.manifest.sha256",
    "storage-object-binding-mismatch",
    "sha256-mismatch",
    "newMobileCaptureFinalizeLease",
    "finalizeMobileCaptureDatabaseEvidence",
  ]) {
    assert.ok(finalizeRoute.includes(required), required);
  }
  assert.ok(store.includes('createHash("sha256")'));
  assert.ok(store.includes("createReadStream({ validation: \"crc32c\" })"));
  assert.ok(store.includes("generation: evidence.generation"));
  assert.ok(finalizeRoute.includes("manifest.roomReadinessBindingVersion === 1"),
    "only hardened manifests require the new GCS metadata fields");
  assert.ok(finalizeRoute.includes("normalizedReceiptMatchesFinalization"),
    "verified manifests may short-circuit only when exact normalized DB evidence matches");
  assert.ok(finalizeRoute.includes("immutableUploadBinding"));
  assert.ok(finalizeRoute.includes("immutableBinding.sha256 === manifest.verification.computedSha256"));
  assert.ok(
    finalizeRoute.indexOf("computeMobileCaptureObjectSha256") <
      finalizeRoute.lastIndexOf("finalizeMobileCaptureDatabaseEvidence"),
    "hash verification must precede DB evidence creation",
  );
});

test("verified bytes create idempotent source, asset, receipt, checksum, and transcript evidence", () => {
  for (const required of [
    "studioVideoSource.findFirst",
    "studioMediaAsset.findFirst",
    "recordMobileCaptureIngestion",
    "checksumSha256: manifest.sha256",
    "transcriptJobId",
    "alreadyAttached",
  ]) {
    assert.ok(finalization.includes(required), required);
  }
  assert.ok(records.includes("checksum: input.checksumSha256"));
  assert.ok(finalizeRoute.includes('status: "verified"'));
  assert.ok(finalizeRoute.includes("buildMobileCaptureServerVerification"));
});

test("legacy server-buffered ingress is terminal and advertises resumable v2", () => {
  assert.ok(legacyChunk.includes("LEGACY_MOBILE_CHUNK_DISABLED"));
  assert.ok(legacyMultipart.includes("LEGACY_MOBILE_MULTIPART_DISABLED"));
  for (const source of [legacyChunk, legacyMultipart]) {
    assert.ok(source.includes("MOBILE_CAPTURE_RESUMABLE_CONTRACT_KIND"));
    assert.ok(source.includes('/api/mobile/capture/uploads/resumable"'));
    assert.ok(source.includes("status: 410"));
    assert.equal(source.includes("formData("), false);
    assert.equal(source.includes("arrayBuffer("), false);
    assert.equal(source.includes("readFile("), false);
    assert.equal(source.includes("uploadMediaBuffer"), false);
  }
  assert.ok(records.includes('input.processingDisposition === "RELEASED"'));
  assert.equal(records.includes('input.processingDisposition || "RELEASED"'), false,
    "missing processing disposition must fail closed");
  assert.ok(records.includes("immutableReceiptBindingMatchesInput"));
  assert.ok(records.includes("recordingAsset = null"),
    "compatibility ingest must create fresh held evidence instead of rebinding a normalized asset");
  assert.ok(canonicalWrapper.includes("ingest/mobile/resumable/route"));
  assert.ok(canonicalFinalizeWrapper.includes("ingest/mobile/resumable/finalize/route"));
  assert.ok(readiness.includes('uploadsResumable: "/api/mobile/capture/uploads/resumable"'));
  assert.ok(readiness.includes("mediaBytesTransitAppServer: false"));
  assert.ok(readiness.includes("serverSha256RequiredBeforeReceipt: true"));
});
