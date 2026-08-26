import { NextRequest, NextResponse } from "next/server";
import { Storage } from "@google-cloud/storage";
import { requireMediaBucketName } from "@/lib/server/gcs";
import { ensureHomeNestForEmail } from "@/lib/server/home-nest";
import {
  buildMediaVaultObjectName,
  cleanMediaVaultPathPart,
  MEDIA_VAULT_PREFIXES,
  normalizeDirectMediaVaultDirectory,
} from "@/lib/server/media-vault";
import { issueMediaVaultUploadCapability } from "@/lib/server/media-vault-upload-capability";
import {
  isSafeMediaVaultUploadRequestId,
  MEDIA_VAULT_PRESIGNED_RESERVATION_TTL_MS,
  MediaVaultUploadReservationError,
  reserveMediaVaultUploadCapacity,
} from "@/lib/server/media-vault-upload-reservations";
import { MEDIA_VAULT_UPLOAD_RESERVATION_LANES } from "@/lib/server/media-vault-upload-reservation-policy.js";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { resolveStudioProjectAccess } from "@/lib/server/studio-project-access";
import { getPrismaClient } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const session = await getQuipslySessionFromRequest(request);
    if (!session?.user) {
      return NextResponse.json(
        { error: "Sign in before requesting a media-vault upload." },
        { status: 401 },
      );
    }
    const {
      uploadRequestId: rawUploadRequestId,
      filename,
      contentType,
      sizeBytes,
      episodeId,
      projectSlug,
      nestSlug,
      directory,
    } = await request.json();
    const uploadRequestId = typeof rawUploadRequestId === "string"
      ? rawUploadRequestId.trim().toLowerCase()
      : "";
    if (!isSafeMediaVaultUploadRequestId(uploadRequestId)) {
      return NextResponse.json({
        error: "uploadRequestId must be a stable UUID so retries remain exactly idempotent.",
        code: "UPLOAD_RESERVATION_ID_INVALID",
      }, { status: 400 });
    }
    const prisma = getPrismaClient() as any;
    const requestedProjectSlug = String(nestSlug || projectSlug || "").trim();
    let resolvedProjectId: string | null = null;
    let resolvedProjectSlug: string | null = null;
    if (requestedProjectSlug) {
      const access = await resolveStudioProjectAccess({
          projectSlug: requestedProjectSlug,
          email: session.user.primaryEmail,
          action: "write",
          prisma,
        });
      if (access.allowed) {
        resolvedProjectId = access.projectId;
        resolvedProjectSlug = access.projectSlug;
      }
    } else {
      const homeNest = await ensureHomeNestForEmail(session.user.primaryEmail, prisma);
      resolvedProjectId = homeNest?.id ?? null;
      resolvedProjectSlug = homeNest?.slug ?? null;
    }
    if (!resolvedProjectId || !resolvedProjectSlug) {
      return NextResponse.json(
        { error: "You do not have write access to the requested media-vault Nest." },
        { status: 403 },
      );
    }

    const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID;
    const bucketName = requireMediaBucketName();
    const safeFilename = cleanMediaVaultPathPart(filename, "upload.bin");
    const safeObjectDirectory = normalizeDirectMediaVaultDirectory(directory);
    const safeContentType = String(contentType || "application/octet-stream").trim();
    if (!safeContentType || safeContentType.length > 160 || /[\r\n]/.test(safeContentType)) {
      return NextResponse.json({ error: "Choose a valid upload content type." }, { status: 400 });
    }
    const expectedSizeBytes = Number(sizeBytes);
    const maximumSizeBytes = safeObjectDirectory === MEDIA_VAULT_PREFIXES.thumb
      ? 25 * 1024 * 1024
      : safeObjectDirectory === MEDIA_VAULT_PREFIXES.proxy
        ? 1024 * 1024 * 1024
        : 2 * 1024 * 1024 * 1024;
    if (
      !Number.isSafeInteger(expectedSizeBytes)
      || expectedSizeBytes <= 0
      || expectedSizeBytes > maximumSizeBytes
    ) {
      return NextResponse.json({
        error: `sizeBytes must be an exact integer between 1 and ${maximumSizeBytes} for this media-vault lane.`,
      }, { status: 400 });
    }
    const storagePath = buildMediaVaultObjectName({
      directory: safeObjectDirectory,
      nestSlug: resolvedProjectSlug,
      contextSlug: episodeId,
      assetId: uploadRequestId,
      filename: safeFilename,
    });

    const reservation = await reserveMediaVaultUploadCapacity({
      prisma,
      lane: MEDIA_VAULT_UPLOAD_RESERVATION_LANES.mediaVaultPresigned,
      requestId: uploadRequestId,
      actorUserId: session.user.id,
      actorEmail: session.user.primaryEmail,
      projectId: resolvedProjectId,
      projectSlug: resolvedProjectSlug,
      bucketName,
      objectPath: storagePath,
      contentType: safeContentType,
      expectedSizeBytes,
      expiresAt: new Date(Date.now() + MEDIA_VAULT_PRESIGNED_RESERVATION_TTL_MS),
      metadataJson: {
        directory: safeObjectDirectory,
        episodeId: String(episodeId || "") || null,
        filename: safeFilename,
        source: "api-upload-presigned",
      },
    });
    if (reservation.status === "COMPLETED") {
      return NextResponse.json({
        error: "This exact upload request is already complete. Reuse its registered media record or start a new UUID.",
        code: "UPLOAD_RESERVATION_ALREADY_COMPLETED",
        uploadReservation: reservation,
      }, { status: 409 });
    }

    const storage = projectId ? new Storage({ projectId }) : new Storage();
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(storagePath);
    const capabilityExpiresAt = new Date(reservation.expiresAt).getTime();
    const signedUploadExpiresAt = Math.min(
      Date.now() + 15 * 60 * 1_000,
      capabilityExpiresAt,
    );
    
    const [url] = await file.getSignedUrl({
      version: "v4",
      action: "write",
      expires: signedUploadExpiresAt,
      contentType: safeContentType,
      // GCS will accept this V4 request only when the browser-generated
      // Content-Length matches the server-bound object size exactly.
      extensionHeaders: {
        "content-length": String(expectedSizeBytes),
        "x-goog-if-generation-match": "0",
      },
    });

    const uploadCapability = issueMediaVaultUploadCapability({
      reservationId: reservation.id,
      requestId: reservation.requestId,
      actorUserId: session.user.id,
      actorEmail: session.user.primaryEmail,
      projectId: resolvedProjectId,
      projectSlug: resolvedProjectSlug,
      bucketName,
      objectPath: storagePath,
      contentType: safeContentType,
      expectedSizeBytes,
      expiresAt: capabilityExpiresAt,
    });

    return NextResponse.json({
      url,
      bucketName,
      bucketPath: storagePath,
      gcsUri: `gcs://${bucketName}/${storagePath}`,
      projectId: resolvedProjectId,
      projectSlug: resolvedProjectSlug,
      expectedSizeBytes,
      uploadReservation: reservation,
      requiredUploadHeaders: {
        "Content-Type": safeContentType,
        "X-Goog-If-Generation-Match": "0",
      },
      uploadCapability,
      capabilityExpiresAt: new Date(capabilityExpiresAt).toISOString(),
    });
    
  } catch (error) {
    if (error instanceof MediaVaultUploadReservationError) {
      return NextResponse.json({
        error: error.message,
        code: error.code,
        retryAfterSeconds: error.retryAfterSeconds,
      }, {
        status: error.status,
        headers: error.retryAfterSeconds
          ? { "Retry-After": String(error.retryAfterSeconds) }
          : undefined,
      });
    }
    console.error("Error generating presigned URL:", error);
    return NextResponse.json(
      { error: "Failed to generate presigned URL." },
      { status: 500 }
    );
  }
}
