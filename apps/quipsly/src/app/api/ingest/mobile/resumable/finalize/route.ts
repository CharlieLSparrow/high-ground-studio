import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { ensureHomeNestForEmail } from "@/lib/server/home-nest";
import { MEDIA_VAULT_PREFIXES } from "@/lib/server/media-vault";
import { ensureMobileCaptureAudioAnalysisQueued } from "@/lib/server/mobile-capture-audio-analysis";
import {
  assertMobileCaptureUploadReferences,
  MobileCaptureReferenceError,
} from "@/lib/server/mobile-capture-records";
import { finalizeMobileCaptureDatabaseEvidence } from "@/lib/server/mobile-capture-resumable-finalization";
import {
  evaluateMobileCaptureProcessingAuthorization,
  mobileCaptureHoldRecoveryPolicy,
} from "@/lib/server/mobile-capture-processing-authorization";
import {
  completeMediaVaultUploadReservation,
  MOBILE_CAPTURE_RESUMABLE_RESERVATION_TTL_MS,
  MediaVaultUploadReservationError,
  reserveMediaVaultUploadCapacity,
} from "@/lib/server/media-vault-upload-reservations";
import { MEDIA_VAULT_UPLOAD_RESERVATION_LANES } from "@/lib/server/media-vault-upload-reservation-policy.js";
import {
  computeMobileCaptureObjectSha256,
  getMobileCaptureObjectEvidence,
  loadMobileCaptureResumableManifest,
  mobileCaptureFinalizeLeaseIsActive,
  newMobileCaptureFinalizeLease,
  saveMobileCaptureResumableManifest,
  type MobileCaptureObjectEvidence,
  type MobileCaptureResumableManifest,
  type StoredMobileCaptureResumableManifest,
} from "@/lib/server/mobile-capture-resumable-store";
import {
  MOBILE_CAPTURE_RESUMABLE_CONTRACT_KIND,
  isSafeMobileCaptureUploadSessionId,
  mobileCaptureManifestBindingMismatch,
} from "@/lib/server/mobile-capture-security";
import { getQuipslySessionFromRequest, type QuipslySession } from "@/lib/server/quipsly-session";
import {
  buildMobileCaptureLocalRetention,
  buildMobileCaptureServerVerification,
} from "@high-ground/quipsly-domain/mobile-capture-upload";
import {
  SYNCHRONOUS_CAPTURE_VERIFICATION_LIMIT_BYTES,
} from "@high-ground/quipsly-capture-verification";
import {
  ensureLongSourceVerificationQueued,
  longSourceByteEvidenceMatchesManifest,
} from "@/lib/server/mobile-capture-long-verification";

export const runtime = "nodejs";
export const maxDuration = 3600;

function jsonNoStore(body: unknown, status = 200, headers?: Record<string, string>) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      ...headers,
    },
  });
}

function asObject(value: unknown): Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

async function normalizedReceiptMatchesFinalization(
  prisma: any,
  manifest: MobileCaptureResumableManifest,
) {
  if (!manifest.finalization || !manifest.verification) return false;
  const receipt = await prisma.mobileCaptureFinalizationReceipt.findUnique({
    where: { uploadSessionId: manifest.uploadSessionId },
  });
  if (!receipt) return false;
  const immutableBinding = asObject(asObject(receipt.metadataJson).immutableUploadBinding);
  return (
    receipt.captureId === manifest.captureId
    && receipt.roomId === manifest.callRoomId
    && receipt.actorUserId === manifest.actorUserId
    && (receipt.startReceiptId ?? null) === (manifest.finalization.startReceiptId ?? null)
    && (receipt.consentVersion ?? null) === (manifest.finalization.consentVersion ?? null)
    && receipt.processingDisposition === manifest.finalization.processingDisposition
    && receipt.transcriptDisposition === manifest.finalization.transcriptDisposition
    && (receipt.sourceId ?? null) === (manifest.finalization.sourceId ?? null)
    && (receipt.mediaAssetId ?? null) === (manifest.finalization.mediaAssetId ?? null)
    && (receipt.recordingAssetId ?? null) === (manifest.finalization.recordingAssetId ?? null)
    && (receipt.transcriptJobId ?? null) === (manifest.finalization.transcriptJobId ?? null)
    && immutableBinding.uploadSessionId === manifest.uploadSessionId
    && immutableBinding.captureId === manifest.captureId
    && immutableBinding.sha256 === manifest.verification.computedSha256
    && immutableBinding.bucketName === manifest.bucketName
    && immutableBinding.objectName === manifest.objectName
    && immutableBinding.generation === manifest.verification.generation
    && immutableBinding.sizeBytes === manifest.verification.verifiedSizeBytes
  );
}

async function completeUploadReservation(
  prisma: any,
  manifest: MobileCaptureResumableManifest,
  evidence: { generation: string; sizeBytes: number; crc32c?: string | null; verifiedAt?: string | null },
) {
  return completeMediaVaultUploadReservation({
    prisma,
    lane: MEDIA_VAULT_UPLOAD_RESERVATION_LANES.mobileCaptureResumable,
    actorUserId: manifest.actorUserId,
    bucketName: manifest.bucketName,
    objectPath: manifest.objectName,
    completedSizeBytes: evidence.sizeBytes,
    generation: evidence.generation,
    completionSource: "mobile-capture-resumable-finalize",
    completionEvidenceJson: {
      captureId: manifest.captureId,
      crc32c: evidence.crc32c ?? null,
      recordingAssetId: manifest.finalization?.recordingAssetId ?? null,
      verifiedAt: evidence.verifiedAt ?? null,
    },
  });
}

async function ensureUploadReservation(prisma: any, manifest: MobileCaptureResumableManifest) {
  const manifestExpiry = new Date(manifest.uploadUriExpiresAt);
  const expiresAt = Number.isFinite(manifestExpiry.getTime()) && manifestExpiry > new Date()
    ? manifestExpiry
    : new Date(Date.now() + MOBILE_CAPTURE_RESUMABLE_RESERVATION_TTL_MS);
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
      source: "mobile-capture-resumable-finalize",
    },
  });
}

function verifiedResponse(manifest: MobileCaptureResumableManifest, idempotent: boolean) {
  const mediaHeld = manifest.finalization?.processingDisposition === "HELD";
  const transcriptHeld = manifest.finalization?.transcriptDisposition === "HELD";
  const recoveryPolicy = mobileCaptureHoldRecoveryPolicy({
    processingAuthorization: manifest.processingAuthorization,
    processingHeld: mediaHeld,
    transcriptHeld,
  });
  return jsonNoStore({
    ok: true,
    canonical: true,
    idempotent,
    contractKind: MOBILE_CAPTURE_RESUMABLE_CONTRACT_KIND,
    uploadSessionId: manifest.uploadSessionId,
    captureId: manifest.captureId,
    captureGroupId: manifest.captureGroupId,
    uploadStage: "verified",
    projectId: manifest.projectId,
    projectSlug: manifest.projectSlug,
    storageBackend: manifest.storageBackend,
    storageUri: manifest.storageUri,
    gcsUri: manifest.gcsUri,
    objectName: manifest.objectName,
    objectPath: manifest.objectName,
    expectedSizeBytes: manifest.expectedSizeBytes,
    expectedSha256: manifest.sha256,
    sha256: manifest.verification?.computedSha256 ?? manifest.sha256,
    verification: manifest.verification ?? null,
    storageVerification: manifest.verification ?? null,
    finalization: manifest.finalization ?? null,
    captureRecords: manifest.finalization ?? null,
    processingDisposition: manifest.finalization?.processingDisposition ?? "HELD",
    processingHold: mediaHeld
      ? {
          reasonCode: manifest.finalization?.holdReasonCode ?? null,
          reason: manifest.finalization?.holdReason ?? null,
          ...recoveryPolicy.processing,
        }
      : null,
    transcriptDisposition: manifest.finalization?.transcriptDisposition ?? "HELD",
    transcriptHold: transcriptHeld
      ? {
          reasonCode: manifest.finalization?.transcriptHoldReasonCode ?? null,
          reason: manifest.finalization?.transcriptHoldReason ?? null,
          ...recoveryPolicy.transcript,
        }
      : null,
    roomReadinessBindingVersion: manifest.roomReadinessBindingVersion,
    originalRoomReadiness: manifest.initialRoomReadiness,
    serverVerification: buildMobileCaptureServerVerification({
      provider: manifest.storageBackend,
      verified: true,
      recordingAssetId: manifest.finalization?.recordingAssetId ?? null,
      transcriptJobId: manifest.finalization?.transcriptJobId ?? null,
      verifiedAt: manifest.verification?.verifiedAt ?? null,
      sizeBytes: manifest.verification?.verifiedSizeBytes ?? manifest.expectedSizeBytes,
    }),
    localRetention: buildMobileCaptureLocalRetention(),
  });
}

async function verifiedResponseWithAutomaticAnalysis(
  prisma: any,
  manifest: MobileCaptureResumableManifest,
  idempotent: boolean,
) {
  try {
    await ensureMobileCaptureAudioAnalysisQueued({ prisma, manifest });
  } catch (error) {
    console.error("[Mobile Capture Resumable] Audio analysis scheduling deferred", {
      uploadSessionId: manifest.uploadSessionId,
      reason: error instanceof Error ? error.message : "unknown",
    });
  }
  return verifiedResponse(manifest, idempotent);
}

function failureResponse(manifest: MobileCaptureResumableManifest) {
  const failure = manifest.failure;
  return jsonNoStore({
    ok: false,
    canonical: true,
    contractKind: MOBILE_CAPTURE_RESUMABLE_CONTRACT_KIND,
    uploadSessionId: manifest.uploadSessionId,
    captureId: manifest.captureId,
    captureGroupId: manifest.captureGroupId,
    uploadStage: "failed",
    error: failure?.message ?? "Upload verification failed.",
    failure: failure ?? null,
    localRetention: buildMobileCaptureLocalRetention(),
  }, failure?.retryable ? 503 : 422);
}

function verifyingResponse(manifest: MobileCaptureResumableManifest) {
  return jsonNoStore({
    ok: true,
    canonical: true,
    contractKind: MOBILE_CAPTURE_RESUMABLE_CONTRACT_KIND,
    uploadSessionId: manifest.uploadSessionId,
    captureId: manifest.captureId,
    captureGroupId: manifest.captureGroupId,
    uploadStage: "verifying",
    retryAfterSeconds: 5,
    localRetention: buildMobileCaptureLocalRetention(),
  }, 202, { "Retry-After": "5" });
}

async function authorizeManifest(
  session: QuipslySession,
  prisma: any,
  manifest: MobileCaptureResumableManifest,
) {
  const identityMismatch = mobileCaptureManifestBindingMismatch(manifest, {
    actorUserId: session.user.id,
    actorEmail: session.user.primaryEmail,
    projectId: manifest.projectId,
    projectSlug: manifest.projectSlug,
  });
  if (identityMismatch) return { ok: false as const, status: 403, error: identityMismatch };

  const references = await assertMobileCaptureUploadReferences({
    prisma,
    actorUserId: session.user.id,
    actorIsStaff: session.user.isStaff,
    sessionId: manifest.uploadSessionId,
    fileName: manifest.fileName,
    contentType: manifest.contentType,
    sizeBytes: manifest.expectedSizeBytes,
    checksumSha256: manifest.sha256,
    exactBytesVerified: true,
    provider: "pending",
    projectSlug: null,
    episodeSlug: manifest.episodeSlug,
    sourceType: manifest.sourceType,
    callRoomId: manifest.callRoomId,
    participantId: manifest.participantId,
    recordingConsentId: manifest.recordingConsentId,
    recordingAssetId: manifest.recordingAssetId,
    capturePurpose: manifest.capturePurpose,
    startedAt: manifest.startedAt,
    stoppedAt: manifest.stoppedAt,
    segmentsJson: manifest.recordingSegmentsJson,
    totalChunks: 1,
  });
  const roomSlug = String(references.room?.projectSlug || references.room?.nestSlug || "").trim();
  const roomProject = !roomSlug || roomSlug === "home"
    ? await ensureHomeNestForEmail(session.user.primaryEmail, prisma)
    : await prisma.studioProject.findFirst({
        where: { slug: roomSlug },
        select: { id: true, slug: true },
      });
  if (!roomProject || roomProject.id !== manifest.projectId || roomProject.slug !== manifest.projectSlug) {
    return { ok: false as const, status: 409, error: "Upload project binding no longer matches its capture room." };
  }

  return { ok: true as const };
}

function customMetadataValue(object: MobileCaptureObjectEvidence, key: string) {
  const matched = Object.entries(object.customMetadata).find(
    ([candidate]) => candidate.toLowerCase() === key.toLowerCase(),
  );
  return matched?.[1] ?? null;
}

function objectBindingMismatch(manifest: MobileCaptureResumableManifest, object: MobileCaptureObjectEvidence) {
  if (!manifest.objectName.startsWith(`${MEDIA_VAULT_PREFIXES.mobileRecording}/`)) {
    return "The upload destination is outside the mobile recording vault.";
  }
  if (object.generation.length === 0) return "The completed storage object has no immutable generation.";
  if (object.sizeBytes !== manifest.expectedSizeBytes) {
    return `The completed object size is ${object.sizeBytes}, expected ${manifest.expectedSizeBytes}.`;
  }
  if (object.contentType.toLowerCase() !== manifest.contentType.toLowerCase()) {
    return `The completed object content type is ${object.contentType}, expected ${manifest.contentType}.`;
  }
  const expectedMetadata: Record<string, string> = {
    quipslyContract: MOBILE_CAPTURE_RESUMABLE_CONTRACT_KIND,
    quipslyUploadSessionId: manifest.uploadSessionId,
    quipslyActorUserId: manifest.actorUserId,
    quipslyProjectId: manifest.projectId,
    quipslyProjectSlug: manifest.projectSlug,
    quipslyRecordingConsentId: manifest.recordingConsentId,
    quipslyExpectedSizeBytes: String(manifest.expectedSizeBytes),
    quipslyExpectedSha256: manifest.sha256,
  };
  if (manifest.roomReadinessBindingVersion === 1) {
    Object.assign(expectedMetadata, {
      quipslyCaptureId: manifest.captureId,
      quipslyStartReceiptId: manifest.startReceiptId || "none",
      quipslyConsentVersion: manifest.consentVersion || "none",
      quipslyProcessingDisposition: manifest.processingDisposition,
      quipslyRoomReadinessBindingVersion: "1",
    });
  }
  if (manifest.processingAuthorization?.kind === "source-import") {
    Object.assign(expectedMetadata, {
      quipslyProcessingAuthorizationKind: "source-import",
      quipslyProcessingAuthorizationId:
        manifest.processingAuthorization.authorizationId,
    });
  }
  for (const [key, expected] of Object.entries(expectedMetadata)) {
    if (customMetadataValue(object, key) !== expected) {
      return `The completed storage object has invalid ${key} binding metadata.`;
    }
  }
  return null;
}

async function persistFailure(
  stored: StoredMobileCaptureResumableManifest,
  code: string,
  message: string,
  retryable: boolean,
) {
  const now = new Date().toISOString();
  const failed: MobileCaptureResumableManifest = {
    ...stored.manifest,
    status: "failed",
    updatedAt: now,
    finalizeLease: null,
    failure: { code, message, retryable, failedAt: now },
  };
  try {
    return await saveMobileCaptureResumableManifest(failed, stored.generation);
  } catch {
    return await loadMobileCaptureResumableManifest(stored.manifest.uploadSessionId) ?? {
      manifest: failed,
      generation: stored.generation,
    };
  }
}

async function claimVerification(stored: StoredMobileCaptureResumableManifest) {
  const now = new Date().toISOString();
  const finalizeLease = newMobileCaptureFinalizeLease();
  const claimed: MobileCaptureResumableManifest = {
    ...stored.manifest,
    status: "verifying",
    updatedAt: now,
    finalizeLease,
    failure: null,
  };
  try {
    const saved = await saveMobileCaptureResumableManifest(claimed, stored.generation);
    return {
      stored: saved,
      claimed:
        saved.manifest.status === "verifying" &&
        saved.manifest.finalizeLease?.id === finalizeLease.id,
    };
  } catch {
    const winner = await loadMobileCaptureResumableManifest(stored.manifest.uploadSessionId);
    if (!winner) throw new Error("The upload verification claim was lost.");
    return { stored: winner, claimed: false };
  }
}

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) {
    return jsonNoStore({ ok: false, error: "Sign in before finalizing a Quipsly capture upload." }, 401);
  }

  let uploadSessionId = "";
  try {
    const body = await request.json() as { uploadSessionId?: unknown };
    uploadSessionId = typeof body.uploadSessionId === "string"
      ? body.uploadSessionId.trim().toLowerCase()
      : "";
  } catch {
    return jsonNoStore({ ok: false, error: "Send uploadSessionId as JSON." }, 400);
  }
  if (!isSafeMobileCaptureUploadSessionId(uploadSessionId)) {
    return jsonNoStore({ ok: false, error: "uploadSessionId must be a UUID." }, 400);
  }

  const prisma = getPrismaClient();
  try {
    let stored = await loadMobileCaptureResumableManifest(uploadSessionId);
    if (!stored) return jsonNoStore({ ok: false, error: "Upload session not found." }, 404);
    const authorization = await authorizeManifest(session, prisma, stored.manifest);
    if (!authorization.ok) return jsonNoStore({ ok: false, error: authorization.error }, authorization.status);
    await ensureUploadReservation(prisma, stored.manifest);

    if (
      stored.manifest.status === "verified"
      && await normalizedReceiptMatchesFinalization(prisma, stored.manifest)
    ) {
      await completeUploadReservation(prisma, stored.manifest, {
        generation: stored.manifest.verification!.generation,
        sizeBytes: stored.manifest.verification!.verifiedSizeBytes,
        crc32c: stored.manifest.verification!.crc32c,
        verifiedAt: stored.manifest.verification!.verifiedAt,
      });
      return verifiedResponseWithAutomaticAnalysis(prisma, stored.manifest, true);
    }
    if (stored.manifest.status === "failed" && !stored.manifest.failure?.retryable) {
      return failureResponse(stored.manifest);
    }
    if (mobileCaptureFinalizeLeaseIsActive(stored.manifest)) {
      return verifyingResponse(stored.manifest);
    }

    const object = await getMobileCaptureObjectEvidence(
      stored.manifest.bucketName,
      stored.manifest.objectName,
    );
    if (!object) {
      return jsonNoStore({
        ok: false,
        canonical: true,
        contractKind: MOBILE_CAPTURE_RESUMABLE_CONTRACT_KIND,
        uploadSessionId,
        uploadStage: "uploading",
        error: "Durable storage has not finalized the recording object yet. Resume or complete the upload before finalizing.",
        localRetention: buildMobileCaptureLocalRetention(),
      }, 409, { "Retry-After": "5" });
    }

    const bindingMismatch = objectBindingMismatch(stored.manifest, object);
    if (bindingMismatch) {
      stored = await persistFailure(stored, "storage-object-binding-mismatch", bindingMismatch, false);
      return failureResponse(stored.manifest);
    }

    const usesLongSourceVerifier =
      stored.manifest.sourceType === "video"
      && stored.manifest.expectedSizeBytes
        > SYNCHRONOUS_CAPTURE_VERIFICATION_LIMIT_BYTES;
    if (usesLongSourceVerifier) {
      const longState = stored.manifest.longSourceVerification;
      if (longState?.status === "failed-terminal") {
        stored = await persistFailure(
          stored,
          longState.failure!.code,
          longState.failure!.message,
          false,
        );
        return failureResponse(stored.manifest);
      }
      if (longState?.status !== "bytes-verified") {
        try {
          const queued = await ensureLongSourceVerificationQueued({
            stored,
            objectGeneration: object.generation,
          });
          stored = queued.stored;
        } catch (error) {
          console.error("[Mobile Capture Resumable] Long-source queue failed", {
            uploadSessionId,
            reason: error instanceof Error ? error.message : "unknown",
          });
          return jsonNoStore({
            ok: false,
            canonical: true,
            contractKind: MOBILE_CAPTURE_RESUMABLE_CONTRACT_KIND,
            uploadSessionId,
            uploadStage: "verification-queue-failed",
            error:
              "The immutable video is safe in storage, but its verification job could not be queued. Retry finalization and keep the local source.",
            localRetention: buildMobileCaptureLocalRetention(),
          }, 503, { "Retry-After": "15" });
        }
        return verifyingResponse(stored.manifest);
      }
      if (!longSourceByteEvidenceMatchesManifest(stored.manifest)) {
        stored = await persistFailure(
          stored,
          "long-source-evidence-mismatch",
          "Long-source verification evidence does not match the immutable upload manifest.",
          false,
        );
        return failureResponse(stored.manifest);
      }
    }

    const claim = await claimVerification(stored);
    stored = claim.stored;
    if (
      stored.manifest.status === "verified"
      && await normalizedReceiptMatchesFinalization(prisma, stored.manifest)
    ) {
      await completeUploadReservation(prisma, stored.manifest, {
        generation: stored.manifest.verification!.generation,
        sizeBytes: stored.manifest.verification!.verifiedSizeBytes,
        crc32c: stored.manifest.verification!.crc32c,
        verifiedAt: stored.manifest.verification!.verifiedAt,
      });
      return verifiedResponseWithAutomaticAnalysis(prisma, stored.manifest, true);
    }
    if (stored.manifest.status === "failed") {
      return failureResponse(stored.manifest);
    }
    if (!claim.claimed) return verifyingResponse(stored.manifest);
    if (stored.manifest.status !== "verifying" || !stored.manifest.finalizeLease) {
      return verifyingResponse(stored.manifest);
    }

    const hashed = usesLongSourceVerifier
      ? {
          sha256:
            stored.manifest.longSourceVerification!.evidence!.computedSha256,
          streamedBytes:
            stored.manifest.longSourceVerification!.evidence!.streamedSizeBytes,
        }
      : await computeMobileCaptureObjectSha256(object);
    if (hashed.streamedBytes !== stored.manifest.expectedSizeBytes) {
      stored = await persistFailure(
        stored,
        "storage-stream-size-mismatch",
        `Server streamed ${hashed.streamedBytes} bytes, expected ${stored.manifest.expectedSizeBytes}.`,
        false,
      );
      return failureResponse(stored.manifest);
    }
    if (hashed.sha256 !== stored.manifest.sha256) {
      stored = await persistFailure(
        stored,
        "sha256-mismatch",
        "Server-computed SHA-256 does not match the digest supplied by the recording device.",
        false,
      );
      return failureResponse(stored.manifest);
    }

    const processingAuthorization = await evaluateMobileCaptureProcessingAuthorization({
      prisma,
      manifest: stored.manifest,
    });
    const roomReadiness = processingAuthorization.readiness;
    const releaseAutomatically = processingAuthorization.authorized;
    const processingDecision = releaseAutomatically
      ? {
          disposition: "RELEASED" as const,
          reasonCode: null,
          reason: null,
          startReceiptId: stored.manifest.startReceiptId,
          consentVersion: stored.manifest.consentVersion,
          releaseAudit: null,
          transcriptDisposition: roomReadiness.allPartiesCurrentlyAllowTranscription
            ? "RELEASED" as const
            : "HELD" as const,
          transcriptReasonCode: roomReadiness.allPartiesCurrentlyAllowTranscription
            ? null
            : "ALL_PARTY_TRANSCRIPTION_CONSENT_REQUIRED",
          transcriptReason: roomReadiness.allPartiesCurrentlyAllowTranscription
            ? null
            : "Transcript held until every signed-in, non-observer participant grants transcription consent.",
          transcriptReleaseAudit: null,
        }
      : {
          disposition: "HELD" as const,
          reasonCode: processingAuthorization.reasonCode,
          reason: processingAuthorization.reason,
          startReceiptId: stored.manifest.startReceiptId,
          consentVersion: stored.manifest.consentVersion,
          releaseAudit: null,
          transcriptDisposition: "HELD" as const,
          transcriptReasonCode: "MEDIA_PROCESSING_HELD",
          transcriptReason: "Transcript waits until the recording has a valid processing authorization.",
          transcriptReleaseAudit: null,
        };

    let finalization;
    try {
      finalization = await finalizeMobileCaptureDatabaseEvidence({
        prisma,
        manifest: stored.manifest,
        object,
        actorIsStaff: session.user.isStaff,
        processingDecision,
      });
    } catch (error) {
      console.error("[Mobile Capture Resumable] Database finalization failed", {
        uploadSessionId,
        reason: error instanceof Error ? error.message : "unknown",
      });
      stored = await persistFailure(
        stored,
        "database-finalization-failed",
        "The recording bytes verified, but Quipsly could not finish the app-owned receipt. Retry finalization; keep the local source.",
        true,
      );
      return failureResponse(stored.manifest);
    }

    try {
      await completeMediaVaultUploadReservation({
        prisma,
        lane: MEDIA_VAULT_UPLOAD_RESERVATION_LANES.mobileCaptureResumable,
        actorUserId: stored.manifest.actorUserId,
        bucketName: stored.manifest.bucketName,
        objectPath: stored.manifest.objectName,
        completedSizeBytes: object.sizeBytes,
        generation: object.generation,
        completionSource: "mobile-capture-resumable-finalize",
        completionEvidenceJson: {
          captureId: stored.manifest.captureId,
          crc32c: object.crc32c,
          recordingAssetId: finalization.recordingAssetId,
          receiptUploadSessionId: stored.manifest.uploadSessionId,
          verifiedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("[Mobile Capture Resumable] Quota reservation completion failed", {
        uploadSessionId,
        reason: error instanceof Error ? error.message : "unknown",
      });
      stored = await persistFailure(
        stored,
        "upload-reservation-completion-failed",
        "The recording and app receipt verified, but the durable upload quota receipt needs a retry.",
        !(error instanceof MediaVaultUploadReservationError) || error.status >= 500,
      );
      return failureResponse(stored.manifest);
    }

    const verifiedAt = new Date().toISOString();
    const verified: MobileCaptureResumableManifest = {
      ...stored.manifest,
      status: "verified",
      uploadUri: "",
      localUploadTokenSha256: null,
      updatedAt: verifiedAt,
      finalizeLease: null,
      failure: null,
      verification: {
        expectedSha256: stored.manifest.sha256,
        computedSha256: hashed.sha256,
        expectedSizeBytes: stored.manifest.expectedSizeBytes,
        verifiedSizeBytes: object.sizeBytes,
        generation: object.generation,
        crc32c: object.crc32c,
        md5Hash: object.md5Hash,
        verifiedAt,
      },
      finalization,
    };
    try {
      stored = await saveMobileCaptureResumableManifest(verified, stored.generation);
    } catch (error) {
      console.error("[Mobile Capture Resumable] Verified receipt persistence failed", {
        uploadSessionId,
        reason: error instanceof Error ? error.message : "unknown",
      });
      const recovered = await loadMobileCaptureResumableManifest(uploadSessionId);
      if (
        recovered?.manifest.status === "verified"
        && await normalizedReceiptMatchesFinalization(prisma, recovered.manifest)
      ) {
        await completeUploadReservation(prisma, recovered.manifest, {
          generation: recovered.manifest.verification!.generation,
          sizeBytes: recovered.manifest.verification!.verifiedSizeBytes,
          crc32c: recovered.manifest.verification!.crc32c,
          verifiedAt: recovered.manifest.verification!.verifiedAt,
        });
        return verifiedResponseWithAutomaticAnalysis(prisma, recovered.manifest, true);
      }
      return jsonNoStore({
        ok: false,
        error: "The recording verified and app records were created, but the durable verification receipt needs a retry.",
        localRetention: buildMobileCaptureLocalRetention(),
      }, 503);
    }

    if (stored.manifest.status !== "verified") {
      return verifyingResponse(stored.manifest);
    }
    return verifiedResponseWithAutomaticAnalysis(prisma, stored.manifest, false);
  } catch (error) {
    if (error instanceof MediaVaultUploadReservationError) {
      return jsonNoStore({
        ok: false,
        error: error.message,
        code: error.code,
        retryAfterSeconds: error.retryAfterSeconds,
        localRetention: buildMobileCaptureLocalRetention(),
      }, error.status, error.retryAfterSeconds
        ? { "Retry-After": String(error.retryAfterSeconds) }
        : undefined);
    }
    if (error instanceof MobileCaptureReferenceError) {
      return jsonNoStore({ ok: false, error: error.message }, error.status);
    }
    console.error("[Mobile Capture Resumable] Finalize failed", {
      uploadSessionId,
      reason: error instanceof Error ? error.message : "unknown",
    });
    return jsonNoStore({
      ok: false,
      error: "Unable to verify the durable recording. Retry finalization and keep the local source.",
      localRetention: buildMobileCaptureLocalRetention(),
    }, 503);
  }
}
