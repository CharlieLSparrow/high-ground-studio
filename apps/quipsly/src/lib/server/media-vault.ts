import "server-only";

export const MEDIA_VAULT_ROOT = "media-vault";
export const PRIMARY_MEDIA_VAULT_BUCKET = "high-ground-odyssey-media";

export const MEDIA_VAULT_PREFIXES = {
  raw: "media-vault/raw",
  proxy: "media-vault/proxy",
  thumb: "media-vault/thumb",
  livekitRecording: "media-vault/recordings/livekit",
  mobileRecording: "media-vault/recordings/mobile",
  exports: "media-vault/exports",
  packets: "media-vault/packets",
  review: "media-vault/review",
} as const;

export const DIRECT_UPLOAD_MEDIA_VAULT_DIRECTORIES = [
  MEDIA_VAULT_PREFIXES.raw,
  MEDIA_VAULT_PREFIXES.proxy,
  MEDIA_VAULT_PREFIXES.thumb,
  MEDIA_VAULT_PREFIXES.mobileRecording,
  MEDIA_VAULT_PREFIXES.exports,
  MEDIA_VAULT_PREFIXES.packets,
  MEDIA_VAULT_PREFIXES.review,
] as const;

export const MEDIA_VAULT_BUCKET_ENV_NAMES = [
  "QUIPSLY_MEDIA_BUCKET",
  "LIVEKIT_EGRESS_GCS_BUCKET",
  "COACHING_CAPTURE_BUCKET",
  "HIGH_GROUND_MEDIA_BUCKET",
  "GOOGLE_CLOUD_STORAGE_BUCKET",
  "GCS_BUCKET_NAME",
  "NEXT_PUBLIC_GCS_BUCKET",
] as const;

export type DirectMediaVaultDirectory = (typeof DIRECT_UPLOAD_MEDIA_VAULT_DIRECTORIES)[number];

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeTimestamp(value = new Date()) {
  return value.toISOString().replace(/[:.]/g, "-");
}

export function cleanMediaVaultPathPart(value: unknown, fallback: string) {
  const raw = text(value);
  const safe = raw
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .join("-")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return safe || fallback;
}

export function chooseConfiguredMediaVaultBucket() {
  for (const envName of MEDIA_VAULT_BUCKET_ENV_NAMES) {
    const bucketName = text(process.env[envName]);
    if (bucketName) {
      return {
        configured: true as const,
        bucketName,
        envName,
      };
    }
  }

  return {
    configured: false as const,
    bucketName: "",
    envName: "",
  };
}

export function requireMediaVaultBucketName() {
  const configured = chooseConfiguredMediaVaultBucket();
  if (configured.bucketName) return configured.bucketName;

  throw new Error(
    `Missing media vault bucket. Set one of: ${MEDIA_VAULT_BUCKET_ENV_NAMES.join(", ")}.`,
  );
}

export function normalizeDirectMediaVaultDirectory(
  value: unknown,
  fallback: DirectMediaVaultDirectory = MEDIA_VAULT_PREFIXES.raw,
): DirectMediaVaultDirectory {
  const raw = text(value).replace(/\/+$/g, "");
  return DIRECT_UPLOAD_MEDIA_VAULT_DIRECTORIES.includes(raw as DirectMediaVaultDirectory)
    ? (raw as DirectMediaVaultDirectory)
    : fallback;
}

export function buildMediaVaultObjectName(input: {
  directory: DirectMediaVaultDirectory;
  nestSlug?: unknown;
  projectSlug?: unknown;
  contextSlug?: unknown;
  episodeSlug?: unknown;
  assetId?: unknown;
  filename?: unknown;
}) {
  const nest = cleanMediaVaultPathPart(input.nestSlug || input.projectSlug, "home-nest");
  const context = cleanMediaVaultPathPart(input.contextSlug || input.episodeSlug, "unassigned");
  const assetId = cleanMediaVaultPathPart(input.assetId, `asset-${Date.now()}`);
  const filename = cleanMediaVaultPathPart(input.filename, "media.bin");

  return `${input.directory}/${nest}/${context}/${assetId}/${filename}`;
}

export function buildLiveKitRecordingObjectName(callRoomId: unknown, timestamp = new Date()) {
  const room = cleanMediaVaultPathPart(callRoomId, "unassigned-room");
  return `${MEDIA_VAULT_PREFIXES.livekitRecording}/${room}/${safeTimestamp(timestamp)}-room-composite.mp4`;
}

export function buildMobileRecordingObjectName(input: {
  callRoomId?: unknown;
  participantOrDevice?: unknown;
  sessionId?: unknown;
  projectSlug?: unknown;
  episodeSlug?: unknown;
  trackId?: unknown;
  filename?: unknown;
}) {
  const roomOrProject = cleanMediaVaultPathPart(input.callRoomId || input.projectSlug, "unassigned-room");
  const participantOrDevice = cleanMediaVaultPathPart(input.participantOrDevice || input.trackId, "device");
  const sessionOrEpisode = cleanMediaVaultPathPart(input.sessionId || input.episodeSlug, "session");
  const filename = cleanMediaVaultPathPart(input.filename, "mobile-recording.mp4");

  return `${MEDIA_VAULT_PREFIXES.mobileRecording}/${roomOrProject}/${participantOrDevice}/${sessionOrEpisode}/${filename}`;
}

export function getMediaVaultReadiness() {
  const bucket = chooseConfiguredMediaVaultBucket();
  const policyBucketMatchesConfigured = bucket.bucketName
    ? bucket.bucketName === PRIMARY_MEDIA_VAULT_BUCKET
    : false;
  return {
    configured: bucket.configured,
    configuredEnvName: bucket.envName || null,
    bucketNameVisibleForOps: bucket.bucketName || null,
    bucketValueIsSecret: false,
    primaryPolicyBucket: PRIMARY_MEDIA_VAULT_BUCKET,
    policyBucketMatchesConfigured,
    configuredBucketWarning: bucket.bucketName && !policyBucketMatchesConfigured
      ? `Configured media bucket ${bucket.bucketName} does not match the primary Quipsly media-vault policy bucket ${PRIMARY_MEDIA_VAULT_BUCKET}. Do not upload new proxy or recording bytes until this is an intentional migration decision.`
      : null,
    root: MEDIA_VAULT_ROOT,
    prefixes: MEDIA_VAULT_PREFIXES,
    directUploadDirectories: DIRECT_UPLOAD_MEDIA_VAULT_DIRECTORIES,
    sourceOfTruth: "Buckets store bytes. Quipsly/Nest metadata owns access, attachment, review, publishing, and receipts.",
    proxyPolicy: "Proxy files live under media-vault/proxy and must point back to immutable raw/source evidence.",
    recordingPolicy: "Provider and mobile recordings attach to CallRoom first, then promote into editor/media assets after verification.",
    bucketConsolidationPolicy:
      "Use one primary bucket with boring media-vault prefixes by default. Create another bucket only for explicit IAM, lifecycle, billing, residency, or compliance boundaries.",
    editorAttachmentPolicy:
      "Podcast/coaching recordings attach to CallRoom first, then StudioMediaAsset and StudioEpisodeProduction as whole-source media. The editor must not infer roles from bucket folders.",
  };
}
