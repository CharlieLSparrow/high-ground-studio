#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const files = {
  helper: path.join(root, "apps/quipsly/src/lib/server/media-vault.ts"),
  gcsHelper: path.join(root, "apps/quipsly/src/lib/server/gcs.ts"),
  readinessRoute: path.join(root, "apps/quipsly/src/app/api/mobile/capture/readiness/route.ts"),
  mediaVaultReadinessRoute: path.join(root, "apps/quipsly/src/app/api/media-vault/readiness/route.ts"),
  inventoryRoute: path.join(root, "apps/quipsly/src/app/api/media-vault/inventory/route.ts"),
  episodeInventoryRoute: path.join(root, "apps/quipsly/src/app/api/media-vault/episode-inventory/route.ts"),
  editorPage: path.join(root, "apps/quipsly/src/app/(app)/editor/page.tsx"),
  proxyRegisterRoute: path.join(root, "apps/quipsly/src/app/api/media-vault/proxies/register/route.ts"),
  promotionRoute: path.join(root, "apps/quipsly/src/app/api/mobile/capture/recordings/promote/route.ts"),
  promotionHelper: path.join(root, "apps/quipsly/src/lib/server/recording-media-promotion.ts"),
  liveKitEgress: path.join(root, "apps/quipsly/src/lib/server/coaching-livekit-egress.ts"),
  localEngineConfig: path.join(root, "apps/local-engine/src/MediaVaultConfig.ts"),
  localEngineRegistration: path.join(root, "apps/local-engine/src/EpisodeMediaRegistrationService.ts"),
  localMediaInventory: path.join(root, "scripts/quipsly-local-media-vault-inventory.mjs"),
  bucketVerifier: path.join(root, "scripts/verify-cloud-bucket.sh"),
  policy: path.join(root, "docs/quipsly/media-vault-policy.md"),
  consolidationWorkorder: path.join(root, "docs/quipsly/media-vault-consolidation-workorder.md"),
  envExample: path.join(root, ".env.example"),
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
  "MEDIA_VAULT_PREFIXES",
  "PRIMARY_MEDIA_VAULT_BUCKET",
  "media-vault/raw",
  "media-vault/proxy",
  "media-vault/thumb",
  "media-vault/recordings/livekit",
  "media-vault/recordings/mobile",
  "media-vault/exports",
  "media-vault/packets",
  "media-vault/review",
  "QUIPSLY_MEDIA_BUCKET",
  "high-ground-odyssey-media",
  "policyBucketMatchesConfigured",
  "configuredBucketWarning",
  "bucketConsolidationPolicy",
  "editorAttachmentPolicy",
  "Buckets store bytes. Quipsly/Nest metadata owns access, attachment, review, publishing, and receipts.",
]) {
  assertIncludes("media vault helper", text.helper, needle, "the shared helper must remain the boring single path contract");
}

for (const needle of [
  "mediaVaultReadiness",
  "readiness: \"/api/media-vault/readiness\"",
  "inventory: \"/api/media-vault/inventory\"",
  "uploadPresigned: \"/api/upload/presigned\"",
  "registerProxy: \"/api/media-vault/proxies/register\"",
  "promoteRecording: \"/api/mobile/capture/recordings/promote\"",
  "episodeInventory: \"/api/media-vault/episode-inventory\"",
]) {
  assertIncludes("mobile capture readiness", text.readinessRoute, needle, "readiness should expose the storage/media seams without secrets");
}

for (const needle of [
  "getMediaVaultReadiness",
  "mockMediaUploadsAllowed",
  "providerSecretsExposed: false",
  "Mock upload URLs are local-only development scaffolding",
  "RecordingAsset owns call-room evidence first",
  "noOriginalMutation: true",
]) {
  assertIncludes("media vault readiness route", text.mediaVaultReadinessRoute, needle, "media-vault readiness should be directly inspectable without cloud mutation");
}

assertIncludes(
  "media vault readiness route",
  text.mediaVaultReadinessRoute,
  "episodeInventory: \"/api/media-vault/episode-inventory\"",
  "media-vault readiness should advertise the episode-level truth endpoint",
);

for (const needle of [
  "QUIPSLY_ALLOW_MOCK_UPLOADS",
  "process.env.NODE_ENV !== \"production\"",
  "throw error",
  "Mock upload URL created because QUIPSLY_ALLOW_MOCK_UPLOADS=true outside production.",
]) {
  assertIncludes("gcs helper", text.gcsHelper, needle, "mock upload behavior must be explicit and dev-gated, not silent production success");
}

for (const needle of [
  "sideEffectFree: true",
  "noOriginalMutation: true",
  "inventoryOnly: true",
  "needsProxyCount",
  "rawAssetId",
  "proxyAssets",
]) {
  assertIncludes("media inventory route", text.inventoryRoute, needle, "inventory must be inspectable without moving bytes or mutating originals");
}

for (const needle of [
  "resolveEpisodeProductionAccess",
  "projectSlug",
  "episodeSlug",
  "StudioEpisodeProduction",
  "importedMedia",
  "RecordingAsset",
  "StudioMediaAsset",
  "proxyNeededCount",
  "completedTranscriptJobCount",
  "safeNextActions",
  "sideEffectFree: true",
  "noOriginalMutation: true",
  "noExternalMutation: true",
  "Whole sources stay intact",
]) {
  assertIncludes("episode media inventory route", text.episodeInventoryRoute, needle, "episode media truth must show recordings, proxies, transcripts, and safe next actions without mutation");
}

for (const needle of [
  "/api/media-vault/episode-inventory",
  "Episode media truth",
  "Recordings, proxies, transcripts, and safe next actions",
  "data-testid=\"episode-media-truth-panel\"",
  "Whole-source media",
  "Safe next actions",
  "never uploads, promotes, transcribes, publishes, or mutates originals",
  "RecordingAsset owns capture evidence; StudioMediaAsset owns reusable media; StudioEpisodeProduction owns episode-editor meaning.",
]) {
  assertIncludes("web editor media truth panel", text.editorPage, needle, "the editor should make media-vault episode truth visible without side effects");
}

for (const needle of [
  "registerMediaVaultProxy",
  "Sign in before registering media-vault proxies.",
  "rawAssetId",
  "proxyUrl",
]) {
  assertIncludes("proxy register route", text.proxyRegisterRoute, needle, "proxy registration should attach derivatives to immutable raw assets");
}

for (const needle of [
  "promoteRecordingAssetToStudioMedia",
  "Sign in before promoting a recording into Quipsly media.",
  "recordingAssetId",
  "episodeSlug",
]) {
  assertIncludes("recording promotion route", text.promotionRoute, needle, "recordings should promote through an app-owned media seam");
}

for (const needle of [
  "RecordingAsset",
  "StudioMediaAsset",
  "attachPromotedRecordingToEpisodeProduction",
  "proxyStillNeededForVideo",
  "The bucket keeps the blob; episode production state keeps the editor meaning.",
]) {
  assertIncludes("recording promotion helper", text.promotionHelper, needle, "call recordings must attach to editor state as meaning, not copied mystery files");
}

for (const needle of [
  "MEDIA_VAULT_BUCKET_ENV_NAMES",
  "MEDIA_VAULT_PREFIXES.livekitRecording",
  "LIVEKIT_EGRESS_ENABLED",
]) {
  assertIncludes("LiveKit egress helper", text.liveKitEgress, needle, "provider recording should use the shared media-vault bucket and explicit operator gate");
}

for (const needle of [
  "'high-ground-odyssey-media'",
  "'media-vault'",
  "kind,",
]) {
  assertIncludes("local engine media vault config", text.localEngineConfig, needle, "local-engine should align raw/proxy/thumb outputs with the shared vault");
}

for (const needle of [
  "/api/media-vault/proxies/register",
  "routeToProxyRegisterEndpoint",
  "mutatedOriginal: false",
]) {
  assertIncludes("local engine episode media registration", text.localEngineRegistration, needle, "local-engine proxy derivatives must register back to Nest instead of becoming loose files");
}

for (const needle of [
  "quipsly-local-media-vault-inventory-v1",
  "dryRun: true",
  "held-unattached",
  "media-vault/proxy",
  "--proxies-only",
  "--summary-only",
  "--limit",
  "noOriginalMutation",
]) {
  assertIncludes("local media inventory", text.localMediaInventory, needle, "local proxy migration must start with a dry-run manifest instead of blind bucket movement");
}

for (const needle of [
  "Dry-run by default",
  "--create",
  "--apply-cors",
  "--allow-non-primary",
  "PRIMARY_MEDIA_VAULT_BUCKET=\"high-ground-odyssey-media\"",
  "media-vault/proxy",
  "media-vault/recordings/livekit",
  "media-vault/recordings/mobile",
  "LIVEKIT_EGRESS_GCS_BUCKET",
  "Refusing to mutate bucket in dry-run mode.",
  "Buckets store bytes. Quipsly/Nest records own meaning",
]) {
  assertIncludes("bucket verifier", text.bucketVerifier, needle, "bucket verification must be policy-aware and non-mutating by default");
}

for (const needle of [
  "Do not create a separate proxy-only bucket by default.",
  "media-vault/proxy",
  "Podcast/coaching recordings are source assets once verified.",
  "The editor should never need to guess whether a blob is a podcast spine",
  "Meaning and access: app-owned records, not bucket names.",
  "`QUIPSLY_MEDIA_BUCKET` should point at `high-ground-odyssey-media`",
  "`/api/media-vault/readiness` exposes the side-effect-free media-vault contract",
  "`/api/media-vault/episode-inventory` exposes the side-effect-free episode media truth",
  "QUIPSLY_ALLOW_MOCK_UPLOADS=true",
  "scripts/quipsly-local-media-vault-inventory.mjs",
  "held-unattached",
  "Use `scripts/verify-cloud-bucket.sh` as the safe live check",
  "Default mode is intentionally read-only",
  "does not create buckets, change CORS, write marker objects, move objects, delete objects, or register app records",
]) {
  assertIncludes("media vault policy", text.policy, needle, "the human-readable operating policy should prevent bucket sprawl and mystery piles");
}

for (const needle of [
  "Use `scripts/verify-cloud-bucket.sh` before any live media-vault work.",
  "It should not be used as a migration script.",
  "It does not move loose proxies, attach recordings, create `StudioMediaAsset` records, or decide episode roles.",
  "This prevents the old anti-pattern",
]) {
  assertIncludes("media vault consolidation workorder", text.consolidationWorkorder, needle, "the consolidation workorder should keep verification separate from migration");
}

for (const needle of [
  'QUIPSLY_MEDIA_BUCKET="high-ground-odyssey-media"',
  'LIVEKIT_EGRESS_GCS_BUCKET="high-ground-odyssey-media"',
]) {
  assertIncludes("env example", text.envExample, needle, "new local/dev envs should default to the primary media-vault bucket");
}

const localEnvPath = path.join(root, ".env");
if (fs.existsSync(localEnvPath)) {
  const localEnv = read(localEnvPath);
  const match = localEnv.match(/^QUIPSLY_MEDIA_BUCKET=(.*)$/m);
  if (match && !match[1].includes("high-ground-odyssey-media")) {
    throw new Error("Local .env QUIPSLY_MEDIA_BUCKET is not aligned to high-ground-odyssey-media. This can scatter proxies and recordings into a reserved bucket.");
  }
}

assertNotIncludes("media vault policy", text.policy, "proxy-only bucket is required", "proxy bucket sprawl should not be normalized");

console.log(JSON.stringify({
  ok: true,
  checked: Object.keys(files).length,
  facts: [
    "one primary media-vault bucket policy is explicit",
    "proxy files use media-vault/proxy",
    "recordings attach to CallRoom first and promote into media/editor records",
    "inventory is side-effect free",
    "local proxy movement starts as a dry-run manifest",
    "local-engine and LiveKit use the shared policy",
  ],
}, null, 2));
