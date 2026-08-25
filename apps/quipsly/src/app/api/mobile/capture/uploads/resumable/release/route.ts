import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { ensureMobileCaptureAudioAnalysisQueued } from "@/lib/server/mobile-capture-audio-analysis";
import { mobileCaptureReleasePolicy } from "@/lib/server/mobile-capture-release-policy";
import { finalizeMobileCaptureDatabaseEvidence } from "@/lib/server/mobile-capture-resumable-finalization";
import {
  computeMobileCaptureObjectSha256,
  getMobileCaptureObjectEvidence,
  loadMobileCaptureResumableManifest,
  saveMobileCaptureResumableManifest,
  type MobileCaptureResumableManifest,
} from "@/lib/server/mobile-capture-resumable-store";
import { evaluateMobileCaptureRoomReadiness } from "@/lib/server/mobile-capture-room-readiness";
import { isSafeMobileCaptureUploadSessionId } from "@/lib/server/mobile-capture-security";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

export const runtime = "nodejs";
export const maxDuration = 3600;

function jsonNoStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function text(value: unknown, maximum: number) {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return normalized.length <= maximum ? normalized : "";
}

function releaseResponse(manifest: MobileCaptureResumableManifest, idempotent: boolean) {
  return jsonNoStore({
    ok: true,
    canonical: true,
    idempotent,
    uploadSessionId: manifest.uploadSessionId,
    uploadStage: "verified",
    processingDisposition: manifest.finalization?.processingDisposition ?? "HELD",
    transcriptDisposition: manifest.finalization?.transcriptDisposition ?? "HELD",
    captureRecords: manifest.finalization ?? null,
    originalReadiness: manifest.initialRoomReadiness,
  });
}

async function releaseResponseWithAutomaticAnalysis(
  prisma: any,
  manifest: MobileCaptureResumableManifest,
  idempotent: boolean,
) {
  try {
    await ensureMobileCaptureAudioAnalysisQueued({ prisma, manifest });
  } catch (error) {
    console.error("[Mobile Capture Release] Audio analysis scheduling deferred", {
      uploadSessionId: manifest.uploadSessionId,
      reason: error instanceof Error ? error.message : "unknown",
    });
  }
  return releaseResponse(manifest, idempotent);
}

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) {
    return jsonNoStore({ ok: false, error: "Sign in before releasing held capture media." }, 401);
  }
  if (!session.user.isStaff) {
    return jsonNoStore({ ok: false, error: "Only Quipsly staff may release held capture media." }, 403);
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    body = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return jsonNoStore({ ok: false, error: "Send uploadSessionId and an audit reason as JSON." }, 400);
  }
  const allowedKeys = new Set(["uploadSessionId", "reason"]);
  const overrideKey = Object.keys(body).find((key) => !allowedKeys.has(key));
  if (overrideKey) {
    return jsonNoStore({
      ok: false,
      error: `Release requests cannot override ${overrideKey}; owner, room, project, media, and consent bindings come only from the durable manifest.`,
    }, 400);
  }

  const uploadSessionId = text(body.uploadSessionId, 64).toLowerCase();
  const reason = text(body.reason, 2_000);
  if (!isSafeMobileCaptureUploadSessionId(uploadSessionId)) {
    return jsonNoStore({ ok: false, error: "uploadSessionId must be a UUID." }, 400);
  }
  if (reason.length < 20) {
    return jsonNoStore({ ok: false, error: "An explicit release reason of at least 20 characters is required." }, 400);
  }

  const prisma = getPrismaClient() as any;
  try {
    let stored = await loadMobileCaptureResumableManifest(uploadSessionId);
    if (!stored) return jsonNoStore({ ok: false, error: "Upload session not found." }, 404);
    const manifest = stored.manifest;
    if (manifest.status !== "verified" || !manifest.verification) {
      return jsonNoStore({
        ok: false,
        error: "Only fully verified immutable recording bytes may enter release review.",
      }, 409);
    }
    const receipt = await prisma.mobileCaptureFinalizationReceipt.findUnique({
      where: { uploadSessionId },
    });
    if (!receipt) {
      return jsonNoStore({
        ok: false,
        error: "The normalized HELD finalization receipt is missing; retry canonical finalization before release.",
      }, 409);
    }
    if (
      receipt.actorUserId !== manifest.actorUserId
      || receipt.roomId !== manifest.callRoomId
      || receipt.captureId !== manifest.captureId
    ) {
      return jsonNoStore({
        ok: false,
        error: "The finalization receipt does not match the immutable actor, room, and capture binding.",
      }, 409);
    }
    const object = await getMobileCaptureObjectEvidence(manifest.bucketName, manifest.objectName);
    if (
      !object
      || object.generation !== manifest.verification.generation
      || object.sizeBytes !== manifest.verification.verifiedSizeBytes
    ) {
      return jsonNoStore({
        ok: false,
        error: "The immutable GCS generation no longer matches the verified upload receipt.",
      }, 409);
    }
    const hashed = await computeMobileCaptureObjectSha256(object);
    if (
      hashed.streamedBytes !== manifest.verification.verifiedSizeBytes
      || hashed.sha256 !== manifest.verification.computedSha256
      || hashed.sha256 !== manifest.sha256
    ) {
      return jsonNoStore({
        ok: false,
        error: "The preserved recording bytes failed release-time SHA-256 verification.",
      }, 409);
    }

    const readiness = await evaluateMobileCaptureRoomReadiness({
      prisma,
      roomId: manifest.callRoomId,
      captureId: manifest.captureId,
      actorUserId: manifest.actorUserId,
      recordingConsentId: manifest.recordingConsentId,
      sourceType: manifest.sourceType as "audio" | "video",
    });
    const policy = mobileCaptureReleasePolicy({
      actorIsStaff: session.user.isStaff,
      reason,
      hasClientBindingOverrides: false,
      manifestVerified: manifest.status === "verified" && Boolean(manifest.verification),
      normalizedReceiptExists: true,
      normalizedReceiptBindingMatches: true,
      receiptProcessingDisposition: receipt.processingDisposition,
      receiptTranscriptDisposition: receipt.transcriptDisposition,
      manifestProcessingDisposition: manifest.finalization?.processingDisposition ?? null,
      manifestTranscriptDisposition: manifest.finalization?.transcriptDisposition ?? null,
      allPartiesCurrentlyReady: readiness.allPartiesCurrentlyReady,
      actorConsentBindingMatches: readiness.actorConsentId === manifest.recordingConsentId,
      allPartiesCurrentlyAllowTranscription: readiness.allPartiesCurrentlyAllowTranscription,
    });
    if (!policy.allowed) {
      return jsonNoStore({
        ok: false,
        error: policy.error,
        reasonCode: policy.errorCode,
      }, policy.status);
    }
    if (policy.idempotent) return releaseResponseWithAutomaticAnalysis(prisma, manifest, true);

    const releasedAt = new Date().toISOString();
    const mediaNeedsRelease = policy.mediaNeedsRelease;
    const transcriptCanRelease = policy.transcriptCanRelease;
    const finalization = await finalizeMobileCaptureDatabaseEvidence({
      prisma,
      manifest,
      object,
      actorIsStaff: true,
      processingDecision: {
        disposition: "RELEASED",
        reasonCode: null,
        reason: null,
        // Explicit release never rewrites the original readiness binding.
        startReceiptId: manifest.startReceiptId,
        consentVersion: manifest.consentVersion,
        releaseAudit: mediaNeedsRelease
          ? {
              releasedByUserId: session.user.id,
              releaseReason: reason,
              releasedAt,
            }
          : null,
        transcriptDisposition: transcriptCanRelease ? "RELEASED" : "HELD",
        transcriptReasonCode: transcriptCanRelease
          ? null
          : "ALL_PARTY_TRANSCRIPTION_CONSENT_REQUIRED",
        transcriptReason: transcriptCanRelease
          ? null
          : "Transcript held until every signed-in, non-observer participant grants transcription consent.",
        transcriptReleaseAudit: transcriptCanRelease && receipt.transcriptDisposition !== "RELEASED"
          ? {
              releasedByUserId: session.user.id,
              releaseReason: reason,
              releasedAt,
            }
          : null,
      },
    });

    const releasedManifest: MobileCaptureResumableManifest = {
      ...manifest,
      updatedAt: releasedAt,
      finalization,
      // initialRoomReadiness, startReceiptId, consentVersion, and the original
      // preservation disposition intentionally remain immutable above.
    };
    try {
      stored = await saveMobileCaptureResumableManifest(releasedManifest, stored.generation);
    } catch {
      const winner = await loadMobileCaptureResumableManifest(uploadSessionId);
      if (winner?.manifest.finalization?.processingDisposition === "RELEASED") {
        return releaseResponseWithAutomaticAnalysis(prisma, winner.manifest, true);
      }
      return jsonNoStore({
        ok: false,
        error: "The database release is durable, but the GCS control receipt needs an idempotent retry.",
      }, 503);
    }

    return releaseResponseWithAutomaticAnalysis(prisma, stored.manifest, false);
  } catch (error) {
    console.error("[Mobile Capture Release] failed", {
      uploadSessionId,
      reason: error instanceof Error ? error.message : "unknown",
    });
    return jsonNoStore({
      ok: false,
      error: "Held capture release failed. No original bytes or room receipts were changed; retry review.",
    }, 503);
  }
}
