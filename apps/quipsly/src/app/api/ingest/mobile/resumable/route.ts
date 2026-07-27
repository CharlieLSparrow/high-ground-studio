import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { ensureHomeNestForEmail } from "@/lib/server/home-nest";
import { buildMobileRecordingObjectName } from "@/lib/server/media-vault";
import {
  assertMobileCaptureUploadReferences,
  MobileCaptureReferenceError,
} from "@/lib/server/mobile-capture-records";
import {
  createMobileCaptureResumableManifest,
  getMobileCaptureObjectEvidence,
  loadMobileCaptureResumableManifest,
  mobileCaptureResumableStorageTarget,
  mobileCaptureUploadUriIsExpired,
  refreshMobileCaptureResumableUploadUri,
  MobileCaptureResumableStoreError,
  type MobileCaptureResumableManifest,
  type StoredMobileCaptureResumableManifest,
} from "@/lib/server/mobile-capture-resumable-store";
import { evaluateMobileCaptureRoomReadiness } from "@/lib/server/mobile-capture-room-readiness";
import {
  MOBILE_CAPTURE_RESUMABLE_RESERVATION_TTL_MS,
  MediaVaultUploadReservationError,
  reserveMediaVaultUploadCapacity,
} from "@/lib/server/media-vault-upload-reservations";
import { MEDIA_VAULT_UPLOAD_RESERVATION_LANES } from "@/lib/server/media-vault-upload-reservation-policy.js";
import {
  MOBILE_CAPTURE_RESUMABLE_CONTRACT_KIND,
  isSafeMobileCaptureUploadSessionId,
  mobileCaptureManifestBindingMismatch,
  mobileCaptureResumableBindingMismatch,
  normalizeMobileCaptureUploadIdentity,
  normalizeMobileCaptureSha256,
  type MobileCaptureResumableImmutableBinding,
} from "@/lib/server/mobile-capture-security";
import { getQuipslySessionFromRequest, type QuipslySession } from "@/lib/server/quipsly-session";
import { buildMobileCaptureLocalRetention } from "@high-ground/quipsly-domain/mobile-capture-upload";
import {
  MAX_LONG_VIDEO_SOURCE_BYTES,
  SYNCHRONOUS_CAPTURE_VERIFICATION_LIMIT_BYTES,
} from "@high-ground/quipsly-capture-verification";
import {
  longSourceVerifierEnabled,
} from "@/lib/server/mobile-capture-long-verification";

export const runtime = "nodejs";

const MAX_SEGMENTS_JSON_BYTES = 256 * 1024;
const MAX_SOURCE_PROFILE_JSON_BYTES = 64 * 1024;
const SAFE_PROJECT_SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,127}$/i;

type CreatePayload = {
  uploadSessionId: string;
  captureId: string;
  projectId: string | null;
  projectSlug: string | null;
  fileName: string;
  contentType: string;
  sourceType: "audio" | "video";
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
  startedAt: string;
  stoppedAt: string;
  recordingSegmentsJson: string | null;
  restartUploadSession: boolean;
};

function jsonNoStore(body: unknown, status = 200, headers?: Record<string, string>) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", ...headers },
  });
}

function text(value: unknown, maxLength = 512) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function optionalText(value: unknown, maxLength = 512) {
  if (value == null || value === "") return null;
  return text(value, maxLength);
}

function normalizedDate(value: unknown) {
  const candidate = text(value, 80);
  if (!candidate) return null;
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function segmentsJson(value: unknown) {
  if (value == null || value === "") return null;
  let encoded: string;
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    encoded = JSON.stringify(parsed);
  } catch {
    return null;
  }
  return Buffer.byteLength(encoded, "utf8") <= MAX_SEGMENTS_JSON_BYTES ? encoded : null;
}

function sourceProfileJson(value: unknown) {
  if (value == null || value === "") return null;
  let encoded: string;
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    encoded = JSON.stringify(parsed);
  } catch {
    return null;
  }
  return Buffer.byteLength(encoded, "utf8") <= MAX_SOURCE_PROFILE_JSON_BYTES
    ? encoded
    : null;
}

function parseCreatePayload(value: unknown):
  | { ok: true; payload: CreatePayload }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "Send a JSON mobile capture upload manifest." };
  }
  const body = value as Record<string, unknown>;
  const rawUploadSessionId = text(body.uploadSessionId, 64) || "";
  const captureIdWasProvided = body.captureId != null && body.captureId !== "";
  const rawCaptureId = optionalText(body.captureId, 64);
  const captureGroupIdWasProvided =
    body.captureGroupId != null && body.captureGroupId !== "";
  const rawCaptureGroupId = optionalText(body.captureGroupId, 64);
  const { uploadSessionId, captureId, captureGroupId } =
    normalizeMobileCaptureUploadIdentity({
      uploadSessionId: rawUploadSessionId,
      captureId: rawCaptureId,
      captureGroupId: rawCaptureGroupId,
    });
  const projectId = optionalText(body.projectId, 128);
  const projectSlug = optionalText(body.projectSlug, 128);
  const fileName = text(body.fileName, 200) || "";
  const rawContentType = text(body.contentType, 128)?.split(";", 1)[0]?.toLowerCase() || "";
  const rawSourceType = text(body.sourceType, 16)?.toLowerCase();
  const sha256 = typeof body.sha256 === "string"
    ? normalizeMobileCaptureSha256(body.sha256)
    : null;
  const expectedSizeBytes = Number(body.expectedSizeBytes);
  const episodeSlug = optionalText(body.episodeSlug, 128);
  const trackId = optionalText(body.trackId, 128);
  const callRoomId = text(body.callRoomId, 256) || "";
  const participantId = optionalText(body.participantId, 256);
  const recordingConsentId = text(body.recordingConsentId, 256) || "";
  const recordingAssetId = optionalText(body.recordingAssetId, 256);
  const capturePurpose = optionalText(body.capturePurpose, 160);
  const hasSourceProfile = body.sourceProfileJson != null || body.sourceProfile != null;
  const normalizedSourceProfile = sourceProfileJson(
    body.sourceProfileJson ?? body.sourceProfile,
  );
  const startedAt = normalizedDate(body.startedAt);
  const stoppedAt = normalizedDate(body.stoppedAt);
  const hasSegments = body.recordingSegmentsJson != null || body.recordingSegments != null;
  const normalizedSegments = segmentsJson(body.recordingSegmentsJson ?? body.recordingSegments);
  const restartUploadSession = body.restartUploadSession === true;

  if (!isSafeMobileCaptureUploadSessionId(uploadSessionId)) {
    return { ok: false, error: "uploadSessionId must be a UUID." };
  }
  if (captureIdWasProvided && !rawCaptureId) {
    return { ok: false, error: "captureId must be a UUID." };
  }
  if (!isSafeMobileCaptureUploadSessionId(captureId)) {
    return { ok: false, error: "captureId must be a UUID." };
  }
  if (captureGroupIdWasProvided && !rawCaptureGroupId) {
    return { ok: false, error: "captureGroupId must be a UUID." };
  }
  if (!isSafeMobileCaptureUploadSessionId(captureGroupId)) {
    return { ok: false, error: "captureGroupId must be a UUID." };
  }
  if (projectSlug && !SAFE_PROJECT_SLUG_PATTERN.test(projectSlug)) {
    return { ok: false, error: "projectSlug is invalid." };
  }
  if (!fileName || /[\\/\u0000-\u001f]/.test(fileName) || fileName === "." || fileName === "..") {
    return { ok: false, error: "fileName must be a plain recording filename." };
  }
  if (!rawContentType.startsWith("audio/") && !rawContentType.startsWith("video/")) {
    return { ok: false, error: "contentType must describe audio or video." };
  }
  if (rawSourceType !== "audio" && rawSourceType !== "video") {
    return { ok: false, error: "sourceType must be audio or video." };
  }
  if ((rawSourceType === "video") !== rawContentType.startsWith("video/")) {
    return { ok: false, error: "sourceType and contentType disagree." };
  }
  const maximumBytes =
    rawSourceType === "video" && longSourceVerifierEnabled()
      ? MAX_LONG_VIDEO_SOURCE_BYTES
      : SYNCHRONOUS_CAPTURE_VERIFICATION_LIMIT_BYTES;
  if (!Number.isSafeInteger(expectedSizeBytes) || expectedSizeBytes <= 0 || expectedSizeBytes > maximumBytes) {
    return { ok: false, error: `expectedSizeBytes must be between 1 and ${maximumBytes}.` };
  }
  if (!sha256) {
    return { ok: false, error: "sha256 must be a 64-character hexadecimal SHA-256 digest." };
  }
  if (!callRoomId || !recordingConsentId) {
    return { ok: false, error: "callRoomId and recordingConsentId are required for canonical uploads." };
  }
  if (!startedAt || !stoppedAt || new Date(stoppedAt) < new Date(startedAt)) {
    return { ok: false, error: "startedAt and stoppedAt must describe a valid completed recording." };
  }
  if (hasSegments && normalizedSegments == null) {
    return { ok: false, error: `recordingSegmentsJson must be valid and no larger than ${MAX_SEGMENTS_JSON_BYTES} bytes.` };
  }
  if (hasSourceProfile && normalizedSourceProfile == null) {
    return { ok: false, error: `sourceProfileJson must be a JSON object no larger than ${MAX_SOURCE_PROFILE_JSON_BYTES} bytes.` };
  }

  return {
    ok: true,
    payload: {
      uploadSessionId,
      captureId,
      projectId,
      projectSlug,
      fileName,
      contentType: rawContentType,
      sourceType: rawSourceType,
      expectedSizeBytes,
      sha256,
      episodeSlug,
      trackId,
      callRoomId,
      participantId,
      recordingConsentId,
      recordingAssetId,
      capturePurpose,
      captureGroupId,
      sourceProfileJson: normalizedSourceProfile,
      startedAt,
      stoppedAt,
      recordingSegmentsJson: normalizedSegments,
      restartUploadSession,
    },
  };
}

async function resolveRoomBoundProject(session: QuipslySession, prisma: any, room: any) {
  const roomSlug = String(room?.projectSlug || room?.nestSlug || "").trim();
  if (!roomSlug || roomSlug === "home") {
    const homeNest = await ensureHomeNestForEmail(session.user.primaryEmail, prisma);
    if (room?.id && (room.projectSlug !== homeNest.slug || room.nestSlug !== homeNest.slug)) {
      await prisma.callRoom.update({
        where: { id: room.id },
        data: {
          projectSlug: homeNest.slug,
          nestSlug: homeNest.slug,
          metadataJson: {
            ...(typeof room.metadataJson === "object" && room.metadataJson ? room.metadataJson : {}),
            projectId: homeNest.id,
            projectSlug: homeNest.slug,
            legacyHomeAliasResolvedAt: new Date().toISOString(),
          },
        },
      });
    }
    return { id: homeNest.id, slug: homeNest.slug };
  }
  return prisma.studioProject.findFirst({
    where: { slug: roomSlug },
    select: { id: true, slug: true },
  });
}

async function authorizeStoredManifest(
  session: QuipslySession,
  prisma: any,
  stored: StoredMobileCaptureResumableManifest,
) {
  const identityMismatch = mobileCaptureManifestBindingMismatch(stored.manifest, {
    actorUserId: session.user.id,
    actorEmail: session.user.primaryEmail,
    projectId: stored.manifest.projectId,
    projectSlug: stored.manifest.projectSlug,
  });
  if (identityMismatch) return { ok: false as const, status: 403, error: identityMismatch };
  const references = await assertMobileCaptureUploadReferences({
    prisma,
    actorUserId: session.user.id,
    actorIsStaff: session.user.isStaff,
    sessionId: stored.manifest.uploadSessionId,
    fileName: stored.manifest.fileName,
    contentType: stored.manifest.contentType,
    sizeBytes: stored.manifest.expectedSizeBytes,
    checksumSha256: stored.manifest.sha256,
    exactBytesVerified: true,
    provider: "pending",
    projectSlug: null,
    episodeSlug: stored.manifest.episodeSlug,
    sourceType: stored.manifest.sourceType,
    callRoomId: stored.manifest.callRoomId,
    participantId: stored.manifest.participantId,
    recordingConsentId: stored.manifest.recordingConsentId,
    recordingAssetId: stored.manifest.recordingAssetId,
    capturePurpose: stored.manifest.capturePurpose,
    captureGroupId: stored.manifest.captureGroupId,
    sourceProfileJson: stored.manifest.sourceProfileJson,
    startedAt: stored.manifest.startedAt,
    stoppedAt: stored.manifest.stoppedAt,
    segmentsJson: stored.manifest.recordingSegmentsJson,
    totalChunks: 1,
  });
  const project = await resolveRoomBoundProject(session, prisma, references.room);
  if (!project || project.id !== stored.manifest.projectId || project.slug !== stored.manifest.projectSlug) {
    return { ok: false as const, status: 409, error: "Upload project binding no longer matches its capture room." };
  }
  return { ok: true as const };
}

function responseFor(
  stored: StoredMobileCaptureResumableManifest,
  created: boolean,
  objectExists = false,
  uploadReservation: Record<string, unknown> | null = null,
) {
  const { manifest } = stored;
  const canUpload =
    manifest.status === "uploading" &&
    !objectExists &&
    !mobileCaptureUploadUriIsExpired(manifest);
  const uploadStage = manifest.status === "uploading" && objectExists
    ? "uploaded-unverified"
    : manifest.status;
  return {
    ok: true,
    canonical: true,
    created,
    contractKind: MOBILE_CAPTURE_RESUMABLE_CONTRACT_KIND,
    uploadSessionId: manifest.uploadSessionId,
    captureId: manifest.captureId,
    captureGroupId: manifest.captureGroupId,
    uploadStage,
    readyToFinalize: objectExists || manifest.status === "verified",
    objectName: manifest.objectName,
    objectPath: manifest.objectName,
    storageBackend: manifest.storageBackend,
    storageUri: manifest.storageUri,
    projectId: manifest.projectId,
    projectSlug: manifest.projectSlug,
    uploadReservation,
    expectedSizeBytes: manifest.expectedSizeBytes,
    expectedSha256: manifest.sha256,
    upload: canUpload
      ? {
          method: "PUT",
          url: manifest.uploadUri,
          expiresAt: manifest.uploadUriExpiresAt,
          contentType: manifest.contentType,
          contentLength: manifest.expectedSizeBytes,
          resumable: true,
          instruction: manifest.storageBackend === "local-development"
            ? "Development-only loopback upload. Preserve this URL as a secret capability; production never uses this backend."
            : "Upload bytes directly to GCS. Preserve this URL as a secret capability and use Content-Range when resuming.",
        }
      : null,
    finalizeUrl: "/api/mobile/capture/uploads/resumable/finalize",
    failure: manifest.failure ?? null,
    verification: manifest.verification ?? null,
    finalization: manifest.finalization ?? null,
    processingDisposition: manifest.finalization?.processingDisposition
      ?? (manifest.processingDisposition === "eligible" ? "PENDING" : "HELD"),
    holdReason: manifest.finalization?.holdReason ?? (
      manifest.processingDisposition === "preservation-only"
        ? manifest.initialRoomReadiness.reason
        : null
    ),
    roomReadinessBindingVersion: manifest.roomReadinessBindingVersion,
    originalRoomReadiness: manifest.initialRoomReadiness,
    localRetention: buildMobileCaptureLocalRetention(),
  };
}

async function reserveForManifest(
  prisma: any,
  manifest: MobileCaptureResumableManifest,
  options: { refreshExpired: boolean },
) {
  const currentExpiry = new Date(manifest.uploadUriExpiresAt);
  const expiresAt = Number.isFinite(currentExpiry.getTime()) && currentExpiry > new Date()
    ? currentExpiry
    : options.refreshExpired
      ? new Date(Date.now() + MOBILE_CAPTURE_RESUMABLE_RESERVATION_TTL_MS)
      : null;
  if (!expiresAt) return null;
  return reserveMediaVaultUploadCapacity({
    prisma,
    lane: MEDIA_VAULT_UPLOAD_RESERVATION_LANES.mobileCaptureResumable,
    requestId: manifest.uploadSessionId,
    actorUserId: manifest.actorUserId,
    actorEmail: manifest.actorEmail,
    projectId: manifest.projectId,
    projectSlug: manifest.projectSlug,
    bucketName: manifest.bucketName,
    objectPath: manifest.objectName,
    contentType: manifest.contentType,
    expectedSizeBytes: manifest.expectedSizeBytes,
    expiresAt,
    metadataJson: {
      callRoomId: manifest.callRoomId,
      captureId: manifest.captureId,
      captureGroupId: manifest.captureGroupId,
      source: "mobile-capture-resumable",
    },
  });
}

async function recover(
  session: QuipslySession,
  prisma: any,
  uploadSessionId: string,
  refreshExpired: boolean,
) {
  const stored = await loadMobileCaptureResumableManifest(uploadSessionId);
  if (!stored) return jsonNoStore({ ok: false, error: "Upload session not found." }, 404);
  const authorization = await authorizeStoredManifest(session, prisma, stored);
  if (!authorization.ok) return jsonNoStore({ ok: false, error: authorization.error }, authorization.status);

  const reservation = refreshExpired
    ? await reserveForManifest(prisma, stored.manifest, { refreshExpired: true })
    : null;

  const recovered = refreshExpired &&
    stored.manifest.status === "uploading" &&
    mobileCaptureUploadUriIsExpired(stored.manifest)
    ? await refreshMobileCaptureResumableUploadUri(stored)
    : stored;
  const objectExists = Boolean(await getMobileCaptureObjectEvidence(
    recovered.manifest.bucketName,
    recovered.manifest.objectName,
  ));
  return jsonNoStore(responseFor(recovered, false, objectExists, reservation));
}

export async function GET(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) {
    return jsonNoStore({ ok: false, error: "Sign in before recovering a Quipsly capture upload." }, 401);
  }
  const uploadSessionId = new URL(request.url).searchParams.get("uploadSessionId")?.trim().toLowerCase() || "";
  if (!isSafeMobileCaptureUploadSessionId(uploadSessionId)) {
    return jsonNoStore({ ok: false, error: "uploadSessionId must be a UUID." }, 400);
  }
  try {
    return await recover(session, getPrismaClient(), uploadSessionId, false);
  } catch (error) {
    console.error("[Mobile Capture Resumable] Status failed", error);
    return jsonNoStore({ ok: false, error: "Unable to load the durable upload session." }, 503);
  }
}

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) {
    return jsonNoStore({ ok: false, error: "Sign in before creating a Quipsly capture upload." }, 401);
  }
  if (!session.user.isStaff && !session.user.hasBetaAccess) {
    return jsonNoStore({
      ok: false,
      error: "Capture upload capabilities are limited to approved Quipsly beta accounts.",
      code: "QUIPSLY_CAPTURE_BETA_ACCESS_REQUIRED",
    }, 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonNoStore({ ok: false, error: "Send a JSON mobile capture upload manifest." }, 400);
  }

  const prisma = getPrismaClient();
  const bodyRecord = body && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown>
    : null;
  const recoverySessionId = bodyRecord && Object.keys(bodyRecord).every((key) => ["uploadSessionId", "recover"].includes(key))
    ? text(bodyRecord.uploadSessionId, 64)?.toLowerCase() || ""
    : "";
  if (recoverySessionId) {
    if (!isSafeMobileCaptureUploadSessionId(recoverySessionId)) {
      return jsonNoStore({ ok: false, error: "uploadSessionId must be a UUID." }, 400);
    }
    try {
      return await recover(session, prisma, recoverySessionId, true);
    } catch (error) {
      console.error("[Mobile Capture Resumable] Recovery failed", error);
      return jsonNoStore({ ok: false, error: "Unable to recover the durable upload session." }, 503);
    }
  }

  const parsed = parseCreatePayload(body);
  if (!parsed.ok) return jsonNoStore({ ok: false, error: parsed.error }, 400);

  try {
    const payload = parsed.payload;
    const references = await assertMobileCaptureUploadReferences({
      prisma,
      actorUserId: session.user.id,
      actorIsStaff: session.user.isStaff,
      sessionId: payload.uploadSessionId,
      fileName: payload.fileName,
      contentType: payload.contentType,
      sizeBytes: payload.expectedSizeBytes,
      checksumSha256: payload.sha256,
      provider: "pending",
      projectSlug: null,
      episodeSlug: payload.episodeSlug,
      sourceType: payload.sourceType,
      callRoomId: payload.callRoomId,
      participantId: payload.participantId,
      recordingConsentId: payload.recordingConsentId,
      recordingAssetId: payload.recordingAssetId,
      capturePurpose: payload.capturePurpose,
      captureGroupId: payload.captureGroupId,
      sourceProfileJson: payload.sourceProfileJson,
      startedAt: payload.startedAt,
      stoppedAt: payload.stoppedAt,
      segmentsJson: payload.recordingSegmentsJson,
      totalChunks: 1,
    });
    if (!references.participant || !references.consent) {
      return jsonNoStore({ ok: false, error: "Canonical uploads require an actor-owned participant and consent receipt." }, 409);
    }
    const resolvedProject = await resolveRoomBoundProject(session, prisma, references.room);
    if (!resolvedProject) {
      return jsonNoStore({ ok: false, error: "Capture room is not bound to a valid Nest project." }, 409);
    }
    if (
      (payload.projectId && payload.projectId !== resolvedProject.id)
      || (payload.projectSlug && payload.projectSlug !== resolvedProject.slug)
    ) {
      return jsonNoStore({ ok: false, error: "Upload project must match the server-owned capture room binding." }, 409);
    }
    const binding: MobileCaptureResumableImmutableBinding = {
      uploadSessionId: payload.uploadSessionId,
      captureId: payload.captureId,
      actorUserId: session.user.id,
      actorEmail: session.user.primaryEmail.trim().toLowerCase(),
      projectId: resolvedProject.id,
      projectSlug: resolvedProject.slug,
      fileName: payload.fileName,
      contentType: payload.contentType,
      sourceType: payload.sourceType,
      expectedSizeBytes: payload.expectedSizeBytes,
      sha256: payload.sha256,
      episodeSlug: payload.episodeSlug,
      trackId: payload.trackId,
      callRoomId: payload.callRoomId,
      participantId: references.participant.id,
      recordingConsentId: references.consent.id,
      recordingAssetId: references.recordingAsset?.id ?? null,
      capturePurpose: payload.capturePurpose,
      captureGroupId: payload.captureGroupId,
      sourceProfileJson: payload.sourceProfileJson,
      startedAt: payload.startedAt,
      stoppedAt: payload.stoppedAt,
      recordingSegmentsJson: payload.recordingSegmentsJson,
    };

    const existing = await loadMobileCaptureResumableManifest(payload.uploadSessionId);
    if (existing) {
      const mismatch = mobileCaptureResumableBindingMismatch(existing.manifest, binding);
      if (mismatch) return jsonNoStore({ ok: false, error: mismatch }, 409);
      const reservation = await reserveForManifest(prisma, existing.manifest, {
        refreshExpired: payload.restartUploadSession || mobileCaptureUploadUriIsExpired(existing.manifest),
      });
      const recovered = existing.manifest.status === "uploading" && (
        payload.restartUploadSession || mobileCaptureUploadUriIsExpired(existing.manifest)
      )
        ? await refreshMobileCaptureResumableUploadUri(existing)
        : existing;
      const objectExists = Boolean(await getMobileCaptureObjectEvidence(
        recovered.manifest.bucketName,
        recovered.manifest.objectName,
      ));
      return jsonNoStore(responseFor(recovered, false, objectExists, reservation));
    }

    const roomReadiness = await evaluateMobileCaptureRoomReadiness({
      prisma,
      roomId: payload.callRoomId,
      captureId: binding.captureId,
      actorUserId: session.user.id,
      recordingConsentId: references.consent.id,
      sourceType: payload.sourceType,
    });

    const objectName = buildMobileRecordingObjectName({
      callRoomId: binding.callRoomId,
      participantOrDevice: binding.participantId,
      sessionId: binding.uploadSessionId,
      projectSlug: binding.projectSlug,
      episodeSlug: binding.episodeSlug,
      trackId: binding.trackId,
      filename: binding.fileName,
    });
    const storageTarget = mobileCaptureResumableStorageTarget(objectName);
    if (
      binding.expectedSizeBytes
        > SYNCHRONOUS_CAPTURE_VERIFICATION_LIMIT_BYTES
      && storageTarget.storageBackend !== "gcs"
    ) {
      return jsonNoStore({
        ok: false,
        error:
          "Long video requires the production GCS verifier. The local development vault accepts only synchronously verifiable sources.",
      }, 409);
    }
    const { bucketName } = storageTarget;
    const reservation = await reserveMediaVaultUploadCapacity({
      prisma,
      lane: MEDIA_VAULT_UPLOAD_RESERVATION_LANES.mobileCaptureResumable,
      requestId: binding.uploadSessionId,
      actorUserId: binding.actorUserId,
      actorEmail: binding.actorEmail,
      projectId: binding.projectId,
      projectSlug: binding.projectSlug,
      bucketName,
      objectPath: objectName,
      contentType: binding.contentType,
      expectedSizeBytes: binding.expectedSizeBytes,
      expiresAt: new Date(Date.now() + MOBILE_CAPTURE_RESUMABLE_RESERVATION_TTL_MS),
      metadataJson: {
        callRoomId: binding.callRoomId,
        captureId: binding.captureId,
        captureGroupId: binding.captureGroupId,
        source: "mobile-capture-resumable",
      },
    });
    const created = await createMobileCaptureResumableManifest({
      ...binding,
      ...storageTarget,
      objectName,
      consentSnapshot: {
        id: references.consent.id,
        status: references.consent.status,
        canRecordAudio: references.consent.canRecordAudio === true,
        canRecordVideo: references.consent.canRecordVideo === true,
        canTranscribe: references.consent.canTranscribe === true,
        capturedAt: new Date().toISOString(),
      },
      initialRoomReadiness: roomReadiness,
      roomReadinessBindingVersion: 1,
      startReceiptId: roomReadiness.startReceiptId,
      consentVersion: roomReadiness.startConsentVersion,
      processingDisposition: roomReadiness.eligibleForProcessing
        ? "eligible"
        : "preservation-only",
    });
    const mismatch = mobileCaptureResumableBindingMismatch(created.stored.manifest, binding);
    if (mismatch) return jsonNoStore({ ok: false, error: mismatch }, 409);
    const objectExists = !created.created && Boolean(await getMobileCaptureObjectEvidence(
      created.stored.manifest.bucketName,
      created.stored.manifest.objectName,
    ));
    return jsonNoStore(
      responseFor(created.stored, created.created, objectExists, reservation),
      created.created ? 201 : 200,
    );
  } catch (error) {
    if (error instanceof MediaVaultUploadReservationError) {
      return jsonNoStore({
        ok: false,
        error: error.message,
        code: error.code,
        retryAfterSeconds: error.retryAfterSeconds,
      }, error.status, error.retryAfterSeconds
        ? { "Retry-After": String(error.retryAfterSeconds) }
        : undefined);
    }
    if (error instanceof MobileCaptureReferenceError) {
      return jsonNoStore({ ok: false, error: error.message }, error.status);
    }
    if (error instanceof MobileCaptureResumableStoreError) {
      const status = error.code === "not-found" ? 404 : error.code === "conflict" ? 409 : 500;
      return jsonNoStore({ ok: false, error: error.message }, status);
    }
    console.error("[Mobile Capture Resumable] Create failed", error);
    return jsonNoStore({ ok: false, error: "Unable to create the durable Capture upload session." }, 503);
  }
}
