import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { parseGcsUri } from "@/lib/server/gcs";
import { registerMediaVaultProxy } from "@/lib/server/media-vault-proxy-registration";
import {
  completeMediaVaultUploadReservation,
  MediaVaultUploadReservationError,
} from "@/lib/server/media-vault-upload-reservations";
import { MEDIA_VAULT_UPLOAD_RESERVATION_LANES } from "@/lib/server/media-vault-upload-reservation-policy.js";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

export const runtime = "nodejs";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function readJson(request: Request) {
  try {
    const value = await request.json();
    return isObject(value) ? value : {};
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) {
    return NextResponse.json(
      { ok: false, error: "Sign in before registering media-vault proxies." },
      { status: 401 },
    );
  }

  const body = await readJson(request);
  const result = await registerMediaVaultProxy({
    rawAssetId: text(body.rawAssetId),
    actorUserId: session.user.id,
    actorEmail: session.user.email,
    isStaff: session.user.isStaff === true,
    nestSlug: text(body.nestSlug || body.projectSlug) || null,
    bucketName: text(body.bucketName) || null,
    objectPath: text(body.objectPath || body.bucketPath) || null,
    gcsUri: text(body.gcsUri) || null,
    proxyUrl: text(body.proxyUrl) || null,
    uploadCapability: text(body.uploadCapability) || null,
    filename: text(body.filename) || null,
    mimeType: text(body.mimeType || body.contentType) || null,
    sizeBytes: text(body.sizeBytes) || null,
    duration: text(body.duration) || null,
    resolution: text(body.resolution) || null,
    fps: text(body.fps) || null,
    thumbnailUrl: text(body.thumbnailUrl) || null,
    variantKind: text(body.variantKind) || null,
    metadataJson: isObject(body.metadataJson) ? body.metadataJson : null,
  });

  if (result.ok) {
    try {
      const completedObject = parseGcsUri(text(result.providerSourceId));
      const uploadReservation = await completeMediaVaultUploadReservation({
        prisma: getPrismaClient(),
        lane: MEDIA_VAULT_UPLOAD_RESERVATION_LANES.mediaVaultPresigned,
        actorUserId: session.user.id,
        bucketName: completedObject?.bucketName || text(body.bucketName),
        objectPath: completedObject?.objectName || text(body.objectPath || body.bucketPath),
        completedSizeBytes: Number(body.sizeBytes),
        generation: completedObject?.generation || "",
        completionSource: "media-vault-proxy-registration",
        completionEvidenceJson: {
          providerSourceId: text(result.providerSourceId),
          proxyAssetId: result.proxyAsset?.id ?? null,
          rawAssetId: text(body.rawAssetId),
          sourceId: result.sourceId ?? null,
        },
      });
      return NextResponse.json({ ...result, uploadReservation }, { status: 200 });
    } catch (error) {
      if (error instanceof MediaVaultUploadReservationError) {
        return NextResponse.json({
          ok: false,
          status: "upload-reservation-completion-failed",
          errorCode: error.code,
          message: error.message,
          proxyRegistration: result,
        }, { status: error.status });
      }
      throw error;
    }
  }

  return NextResponse.json(result, { status: 400 });
}
