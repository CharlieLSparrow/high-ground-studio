import path from "node:path";

export const MOBILE_CAPTURE_UPLOAD_SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const MOBILE_CAPTURE_SHA256_PATTERN = /^[0-9a-f]{64}$/i;
export const MOBILE_CAPTURE_RESUMABLE_CONTRACT_KIND =
  "quipsly-mobile-capture-gcs-resumable-v2" as const;
export const MOBILE_CAPTURE_RESUMABLE_CONTROL_PREFIX =
  "media-vault/control/mobile-capture-resumable" as const;

export type MobileCaptureUploadManifestBinding = {
  actorUserId: string;
  actorEmail: string;
  projectId: string;
  projectSlug: string;
};

export function isSafeMobileCaptureUploadSessionId(value: string) {
  return MOBILE_CAPTURE_UPLOAD_SESSION_ID_PATTERN.test(value.trim());
}

export function normalizeMobileCaptureUploadIdentity(input: {
  uploadSessionId: string;
  captureId?: string | null;
  captureGroupId?: string | null;
}) {
  const uploadSessionId = input.uploadSessionId.trim().toLowerCase();
  const captureId = input.captureId?.trim().toLowerCase() || uploadSessionId;
  const captureGroupId =
    input.captureGroupId?.trim().toLowerCase() || captureId;
  return { uploadSessionId, captureId, captureGroupId };
}

export function normalizeMobileCaptureSha256(value: string) {
  const normalized = value.trim().toLowerCase();
  return MOBILE_CAPTURE_SHA256_PATTERN.test(normalized) ? normalized : null;
}

export function buildMobileCaptureResumableManifestObjectName(sessionId: string) {
  const normalizedSessionId = sessionId.trim().toLowerCase();
  if (!isSafeMobileCaptureUploadSessionId(normalizedSessionId)) {
    throw new Error("Upload session ID must be a UUID.");
  }

  return `${MOBILE_CAPTURE_RESUMABLE_CONTROL_PREFIX}/${normalizedSessionId}.json`;
}

export function resolveMobileCaptureUploadSessionDirectory(root: string, sessionId: string) {
  const normalizedSessionId = sessionId.trim();
  if (!isSafeMobileCaptureUploadSessionId(normalizedSessionId)) {
    throw new Error("Upload session ID must be a UUID.");
  }

  const resolvedRoot = path.resolve(root);
  const resolvedSessionDirectory = path.resolve(resolvedRoot, normalizedSessionId);
  const relative = path.relative(resolvedRoot, resolvedSessionDirectory);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Upload session path escapes the mobile capture ingest root.");
  }

  return resolvedSessionDirectory;
}

export function mobileCaptureManifestBindingMismatch(
  manifest: Partial<MobileCaptureUploadManifestBinding>,
  expected: MobileCaptureUploadManifestBinding,
) {
  if (!manifest.actorUserId || manifest.actorUserId !== expected.actorUserId) {
    return "Upload session belongs to a different signed-in user.";
  }
  if (!manifest.actorEmail || manifest.actorEmail.trim().toLowerCase() !== expected.actorEmail.trim().toLowerCase()) {
    return "Upload session actor identity changed between chunks.";
  }
  if (!manifest.projectId || manifest.projectId !== expected.projectId) {
    return "Upload session belongs to a different Nest project.";
  }
  if (!manifest.projectSlug || manifest.projectSlug !== expected.projectSlug) {
    return "Upload session project changed between chunks.";
  }
  return null;
}

export type MobileCaptureResumableImmutableBinding = MobileCaptureUploadManifestBinding & {
  uploadSessionId: string;
  captureId: string;
  fileName: string;
  contentType: string;
  sourceType: string;
  expectedSizeBytes: number;
  sha256: string;
  episodeSlug: string | null;
  trackId: string | null;
  callRoomId: string;
  participantId: string | null;
  recordingConsentId: string;
  recordingAssetId: string | null;
  capturePurpose: string | null;
  captureGroupId: string;
  sourceProfileJson: string | null;
  startedAt: string | null;
  stoppedAt: string | null;
  recordingSegmentsJson: string | null;
  /**
   * The signed-in capture client will attach a fingerprinted, timed transcript
   * sidecar from this exact immutable source. This controls automatic provider
   * spending only; it never bypasses consent or exact-byte verification.
   */
  onDeviceTranscriptExpected: boolean;
};

export function mobileCaptureResumableBindingMismatch(
  manifest: Partial<MobileCaptureResumableImmutableBinding>,
  expected: MobileCaptureResumableImmutableBinding,
) {
  const identityMismatch = mobileCaptureManifestBindingMismatch(manifest, expected);
  if (identityMismatch) return identityMismatch;

  const fields = [
    "uploadSessionId",
    "captureId",
    "fileName",
    "contentType",
    "sourceType",
    "expectedSizeBytes",
    "sha256",
    "episodeSlug",
    "trackId",
    "callRoomId",
    "participantId",
    "recordingConsentId",
    "recordingAssetId",
    "capturePurpose",
    "captureGroupId",
    "sourceProfileJson",
    "startedAt",
    "stoppedAt",
    "recordingSegmentsJson",
    "onDeviceTranscriptExpected",
  ] as const;

  const changed = fields.find((field) => manifest[field] !== expected[field]);
  return changed ? `Upload session ${changed} changed after it was created.` : null;
}

export type IngestMediaActor = {
  id: string;
  email: string;
  isStaff: boolean;
};

export type IngestMediaSource = {
  id: string;
  providerSourceId: string | null;
  url: string | null;
};

export type IngestMediaScope = {
  isGlobal: boolean;
  projectSlugs: string[];
};

export type IngestMediaAuthorization =
  | { allowed: true; source: IngestMediaSource }
  | { allowed: false; status: 401 | 403 | 404; error: string };

export async function authorizeIngestMediaSource(input: {
  actor: IngestMediaActor | null;
  sourceId: string;
  loadSource: (sourceId: string) => Promise<IngestMediaSource | null>;
  loadScopes: (sourceId: string) => Promise<IngestMediaScope[]>;
  canReadProject: (projectSlug: string, actorEmail: string) => Promise<boolean>;
}): Promise<IngestMediaAuthorization> {
  if (!input.actor) {
    return { allowed: false, status: 401, error: "Sign in before opening Quipsly media." };
  }

  const source = await input.loadSource(input.sourceId);
  if (!source) {
    return { allowed: false, status: 404, error: "Source not found" };
  }

  if (input.actor.isStaff) {
    return { allowed: true, source };
  }

  const scopes = await input.loadScopes(input.sourceId);
  if (scopes.some((scope) => scope.isGlobal)) {
    return { allowed: true, source };
  }

  const projectSlugs = [
    ...new Set(scopes.flatMap((scope) => scope.projectSlugs).map((slug) => slug.trim()).filter(Boolean)),
  ];
  for (const projectSlug of projectSlugs) {
    if (await input.canReadProject(projectSlug, input.actor.email)) {
      return { allowed: true, source };
    }
  }

  return {
    allowed: false,
    status: 404,
    error: "Source not found",
  };
}
