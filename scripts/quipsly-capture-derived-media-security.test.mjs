#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(relativePath) {
  return readFile(new URL(relativePath, root), "utf8");
}

test("raw playback and audio extraction share project authorization and Capture release gates", async () => {
  const [playback, extraction, access, locationSecurity] = await Promise.all([
    source("apps/quipsly/src/app/api/ingest/media/[sourceId]/route.ts"),
    source("apps/quipsly/src/app/api/extract-audio/route.ts"),
    source("apps/quipsly/src/lib/server/studio-media-source-access.ts"),
    source("apps/quipsly/src/lib/server/studio-media-location-security.ts"),
  ]);

  assert.match(playback, /authorizeStudioMediaSource/);
  assert.match(extraction, /getQuipslySessionFromRequest/);
  assert.match(extraction, /authorizeStudioMediaSource/);
  assert.match(extraction, /QUIPSLY_AUDIO_EXTRACTION_LOCAL_ROOTS/);
  assert.match(extraction, /private-vault media/);
  assert.match(playback, /resolveAllowedLocalStudioMediaPath/);
  assert.match(playback, /authorizeConfiguredMediaVaultLocation/);
  assert.doesNotMatch(playback, /fs\.stat\(localPath\)/);
  assert.doesNotMatch(playback, /fs\.readFile\(localPath\)/);
  assert.match(locationSecurity, /requireMediaBucketName/);
  assert.match(locationSecurity, /fs\.realpath\(candidate\)/);
  assert.match(locationSecurity, /quipsly-media-ingest/);
  assert.match(locationSecurity, /quipsly-mobile-chunk-ingest/);
  assert.match(extraction, /Cache-Control["']?:?\s*["']private, no-store/);

  assert.match(access, /mobileCaptureFinalizationReceipt\.findMany/);
  assert.match(access, /mobileCaptureMediaProcessingGate/);
  assert.match(access, /Field Kit/);
  assert.match(access, /Source recording/);
  assert.match(access, /recordings\\\/source/);
  assert.match(access, /rawLineage/);
  assert.match(access, /CAPTURE_SOURCE_RELEASE_BINDING_REQUIRED/);
});

test("media health requires an authorized Nest and never probes caller supplied networks", async () => {
  const [route, editor] = await Promise.all([
    source("apps/quipsly/src/app/api/episode-production/media-health/route.ts"),
    source("apps/quipsly/src/app/(app)/editor/page.tsx"),
  ]);

  assert.match(route, /getQuipslySessionFromRequest/);
  assert.match(route, /resolveStudioProjectAccess/);
  assert.match(route, /authorizeStudioMediaSource/);
  assert.match(route, /Arbitrary remote server-side probing is disabled/);
  assert.doesNotMatch(route, /fetch\(sourceUrl/);
  assert.doesNotMatch(route, /probeGcsUri\(sourceUrl\)/);
  assert.match(editor, /JSON\.stringify\(\{ projectSlug: resolvedProjectSlug, items: mediaHealthProbeItems \}\)/);
});

test("proxy registration proves the raw Capture source is released before deriving bytes", async () => {
  const [registration, presign, capability] = await Promise.all([
    source("apps/quipsly/src/lib/server/media-vault-proxy-registration.ts"),
    source("apps/quipsly/src/app/api/upload/presigned/route.ts"),
    source("apps/quipsly/src/lib/server/media-vault-upload-capability.ts"),
  ]);
  const gate = registration.indexOf("authorizeStudioMediaSource({");
  const create = registration.indexOf("studioVideoSource.create({");

  assert.ok(gate >= 0, "proxy registration must call the shared source gate");
  assert.ok(create > gate, "proxy source creation must happen only after the raw source gate");
  assert.match(registration, /capture-processing-held/);
  assert.match(registration, /captureRecordingAssetIds/);
  assert.doesNotMatch(registration, /\|\| text\(input\.proxyUrl\)/);
  assert.match(registration, /verifyMediaVaultUploadCapability/);
  assert.match(registration, /storedSize !== capability\.payload\.expectedSizeBytes/);
  assert.match(registration, /storedGeneration/);
  assert.match(registration, /storedCrc32c/);
  assert.match(registration, /toGcsUri\([\s\S]*storedGeneration/);
  assert.doesNotMatch(registration, /\.\.\.\(isObject\(input\.metadataJson\)/);
  assert.match(presign, /getQuipslySessionFromRequest/);
  assert.match(presign, /QUIPSLY_CAPTURE_BETA_ACCESS_REQUIRED/);
  assert.match(presign, /expectedSizeBytes/);
  assert.match(presign, /extensionHeaders: \{[\s\S]*"content-length"/);
  assert.match(presign, /"x-goog-if-generation-match": "0"/);
  assert.match(capability, /expectedSizeBytes/);
});

test("transcript assist reads only authorized bounded private media", async () => {
  const [assist, importer] = await Promise.all([
    source("apps/quipsly/src/app/api/episode-production/transcript-assist/route.ts"),
    source("apps/quipsly/src/app/api/episode-production/import-media/route.ts"),
  ]);

  assert.match(assist, /authorizeStudioMediaSource/);
  assert.match(assist, /authorizeConfiguredMediaVaultLocation/);
  assert.match(assist, /resolveAllowedLocalStudioMediaPath/);
  assert.match(assist, /readStreamWithLimit/);
  assert.doesNotMatch(assist, /fetch\(sourceUrl/);
  assert.doesNotMatch(assist, /response\.arrayBuffer\(\)/);
  assert.match(importer, /External source registration accepts credential-free HTTPS URLs only/);
});

test("episode inventory scopes referenced IDs and derives readiness from normalized gates", async () => {
  const inventory = await source("apps/quipsly/src/app/api/media-vault/episode-inventory/route.ts");

  assert.match(inventory, /mobileCaptureMediaProcessingGate/);
  assert.match(inventory, /mobileCaptureTranscriptProcessingGate/);
  assert.match(inventory, /assetAttachments: \{ some: \{ projectId: project\.id \} \}/);
  assert.match(inventory, /room: \{[\s\S]*projectSlug: project\.slug/);
  assert.match(inventory, /unresolvedRecordingReference/);
  assert.match(inventory, /CAPTURE_RELEASE_LEDGER_UNAVAILABLE/);
  assert.match(inventory, /Recording status proves preservation, not processing permission/);
});

test("unverified Firebase mailboxes cannot claim Quipsly identities or invites", async () => {
  const [sessionResolver, bearerVerifier, sessionRoute, login] = await Promise.all([
    source("apps/quipsly/src/lib/server/quipsly-session.ts"),
    source("apps/quipsly/src/lib/server/firebase-auth.ts"),
    source("apps/quipsly/src/app/api/auth/session/route.ts"),
    source("apps/quipsly/src/app/(marketing)/login/LoginClient.tsx"),
  ]);

  const resolverVerification = sessionResolver.indexOf("decoded.email_verified !== true");
  const resolverIdentityMerge = sessionResolver.indexOf("ensureStudioUserFromFirebaseIdentity({");
  assert.ok(resolverVerification >= 0 && resolverVerification < resolverIdentityMerge);
  assert.match(bearerVerifier, /decodedToken\.email_verified !== true/);
  const routeVerification = sessionRoute.indexOf("decodedToken.email_verified !== true");
  const routeIdentityMerge = sessionRoute.indexOf("ensureStudioUserFromFirebaseIdentity({");
  assert.ok(routeVerification >= 0 && routeVerification < routeIdentityMerge);
  assert.match(sessionRoute, /EMAIL_VERIFICATION_REQUIRED/);
  assert.match(sessionResolver, /explicitly presents a bearer credential/);
  assert.match(login, /sendEmailVerification/);
  assert.match(login, /Check your inbox/);
});
