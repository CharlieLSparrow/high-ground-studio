#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const files = {
  readinessRoute: path.join(root, "apps/quipsly/src/app/api/mobile/capture/readiness/route.ts"),
  sessionsMapper: path.join(root, "apps/quipsly/src/lib/server/mobile-capture-sessions.ts"),
  promoteRoute: path.join(root, "apps/quipsly/src/app/api/mobile/capture/recordings/promote/route.ts"),
  promotionHelper: path.join(root, "apps/quipsly/src/lib/server/recording-media-promotion.ts"),
  reviewDigestRoute: path.join(root, "apps/quipsly/src/app/api/mobile/capture/review-digest/route.ts"),
  bridge: path.join(root, "apps/mobile-capture/HighGroundCapture/HighGroundCapture/BridgeModels.swift"),
  phoneShell: path.join(root, "apps/mobile-capture/HighGroundCapture/HighGroundCapture/CapturePhoneShell.swift"),
  experienceModel: path.join(root, "apps/mobile-capture/HighGroundCapture/HighGroundCapture/CaptureExperienceModel.swift"),
  policy: path.join(root, "docs/quipsly/capture-recording-to-podcast-editor-flow.md"),
  core: path.join(root, "apps/quipsly/src/lib/server/quipsly-core.ts"),
};

function read(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing file: ${path.relative(root, file)}`);
  return fs.readFileSync(file, "utf8");
}

function assertIncludes(name, haystack, needle, explanation) {
  if (!haystack.includes(needle)) {
    throw new Error(`${name} missing ${JSON.stringify(needle)}: ${explanation}`);
  }
}

function assertNotIncludes(name, haystack, needle, explanation) {
  if (haystack.includes(needle)) {
    throw new Error(`${name} should not include ${JSON.stringify(needle)}: ${explanation}`);
  }
}

const text = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, read(file)]));

for (const needle of [
  "recordingPromotionBoundary",
  "RecordingAsset stays as call-room evidence",
  "StudioEpisodeProduction.productionJson.importedMedia",
  "requiresVerifiedRecording: true",
  "noOriginalMutation: true",
  "proxyStillNeededForVideo: true",
]) {
  assertIncludes("mobile readiness route", text.readinessRoute, needle, "mobile readiness should explain how recordings become podcast/editor material");
}

for (const needle of [
  "actionPacket",
  "canPromoteRecordingToMedia",
  "latestRecordingPromotionStatus",
  "latestRecordingMediaAssetId",
  "latestRecordingPlaybackUrl",
  "providerRecordingReceiptSlotId",
]) {
  assertIncludes("mobile sessions mapper", text.sessionsMapper, needle, "native sessions need visible post-capture promotion state");
}

for (const needle of [
  "promoteRecordingAssetToStudioMedia",
  "recordingAssetId",
  "nestSlug",
  "episodeSlug",
  "Sign in before promoting a recording into Quipsly media.",
]) {
  assertIncludes("recording promotion route", text.promoteRoute, needle, "promotion should be explicit, authenticated, and target-aware");
}

for (const needle of [
  "RecordingAsset",
  "StudioMediaAsset",
  "studioVideoSource",
  "attachPromotedRecordingToEpisodeProduction",
  "StudioEpisodeProduction.productionJson.importedMedia",
  "room-composite-video",
  "room-mix-audio",
  "participant-camera",
  "spine-audio-candidate",
  "proxyStillNeededForVideo",
  "mutatedOriginal: false",
  "authorizePromotionDestination",
  "resolveStudioProjectAccess",
  "destination-access-denied",
  "explicit-cross-project-request",
]) {
  assertIncludes("recording promotion helper", text.promotionHelper, needle, "promotion must preserve source evidence and attach whole-source editor meaning");
}
assertNotIncludes(
  "recording promotion helper",
  text.promotionHelper,
  "actor-home-nest-fallback",
  "an access denial must never silently attach capture media to a different Home Nest",
);
const destinationAuthorization = text.promotionHelper.indexOf("const destinationAccess = await authorizePromotionDestination");
const reusableSourceWrite = text.promotionHelper.indexOf("tx.studioVideoSource.create");
const reusableMediaWrite = text.promotionHelper.indexOf("tx.studioMediaAsset.create");
if (
  destinationAuthorization < 0 ||
  reusableSourceWrite < 0 ||
  reusableMediaWrite < 0 ||
  destinationAuthorization > reusableSourceWrite ||
  destinationAuthorization > reusableMediaWrite
) {
  throw new Error("recording promotion must authorize the exact target before source/media creation");
}
for (const needle of ["resolveNestAccess", "action: \"write\"", "QuipslyNestWriteAccessError"]) {
  assertIncludes("central Nest attachment", text.core, needle, "attachAssetToNest must enforce actor write access as defense in depth");
}

for (const needle of [
  "recordingPromotionReady",
  "recordingPromotedToMedia",
  "latestRecordingMediaAssetId",
  "promoteRecording",
]) {
  assertIncludes("review digest route", text.reviewDigestRoute, needle, "review digest should summarize recording promotion state");
}

for (const needle of [
  "MobileCaptureRecordingPromotionResponse",
  "promoteRecordingToStudioMedia",
  "recordingMediaVaultLine",
  "episodeSlug",
  "latestRecordingMediaAssetId",
]) {
  assertIncludes("native bridge", text.bridge, needle, "native client should understand recording promotion and episode targeting");
}

for (const needle of [
  "CaptureRecordingEditScreen(",
  "CaptureRecordingShareEditor(",
  "Edit recording",
  "CaptureRecordingEditLink_",
  "StudioHandoffCard(",
  "Advanced sync and edit",
  "model.isPromotingRecordingToStudio",
  "await model.promoteSelectedRecordingToStudio()",
  "Prepare advanced edit",
  "Open advanced edit",
  "CaptureStudioHandoffCard_",
  "CaptureAttachToStudioButton_",
  "without deleting or changing any original",
  "This prepares immutable source material for advanced waveform, sync, and timeline work. It never publishes, trims, or deletes your recording.",
]) {
  assertIncludes("native phone shell", text.phoneShell, needle, "the reachable iPhone Session workflow should expose basic in-app editing plus an explicit, source-safe advanced handoff");
}

for (const retiredLabel of ["Continue in Studio", "Review in Studio"]) {
  assertNotIncludes(
    "native phone shell",
    text.phoneShell,
    retiredLabel,
    "basic recording review and editing must not imply that a second app is required",
  );
}

for (const needle of [
  "isPromotingRecordingToStudio",
  "promoteSelectedRecordingToStudio",
  "activeCaptureSession == nil, activeVideoCaptureSession == nil",
  "stableOwnerSnapshot",
  "matchesStableOwnerSnapshot",
  "sessionClient.promoteRecordingToStudioMedia",
  "Every original and verified cloud copy remains preserved.",
]) {
  assertIncludes("native experience model", text.experienceModel, needle, "Studio promotion must stop active capture, preserve account authority, and keep immutable source evidence");
}

for (const needle of [
  "The recording is first call-room evidence.",
  "StudioEpisodeProduction.productionJson.importedMedia",
  "Do not make a new bucket because a recording feels like a different product category.",
  "These roles are editor hints, not destructive transformations.",
  "The app must not imply that promotion publishes",
]) {
  assertIncludes("recording to editor policy", text.policy, needle, "human-readable policy should prevent mystery recordings and chopped-source thinking");
}

console.log(JSON.stringify({
  ok: true,
  checked: Object.keys(files).length,
  facts: [
    "verified recordings promote explicitly into Studio media",
    "known episode recordings attach as whole-source editor material",
    "native sessions expose promotion state and attach action",
    "review digest summarizes promotion readiness",
    "policy keeps buckets boring and app records meaningful",
  ],
}, null, 2));
