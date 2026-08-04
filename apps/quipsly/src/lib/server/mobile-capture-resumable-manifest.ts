import { createHash } from "node:crypto";

import type {
  MobileCaptureResumableFinalizationEvidence,
  MobileCaptureResumableManifest,
} from "@/lib/server/mobile-capture-resumable-store";
import {
  parseLongSourceVerificationState,
} from "@high-ground/quipsly-capture-verification";

import { isSafeMobileCaptureUploadSessionId } from "@/lib/server/mobile-capture-security";

const MOBILE_CAPTURE_ROOM_READINESS_VERSION = 1 as const;

/**
 * Normalizes pre-hardening v2 manifests without upgrading their authority.
 * Legacy bytes may complete verification, but remain preservation-only until
 * staff records an explicit audited release.
 */
export function normalizeMobileCaptureResumableManifestForRead(
  value: Partial<MobileCaptureResumableManifest>,
  expectedSessionId: string,
): MobileCaptureResumableManifest {
  const declaredCaptureId = value.captureId?.trim().toLowerCase() || "";
  const captureId = isSafeMobileCaptureUploadSessionId(declaredCaptureId)
    ? declaredCaptureId
    : expectedSessionId;
  const declaredCaptureGroupId =
    value.captureGroupId?.trim().toLowerCase() || "";
  const captureGroupId = isSafeMobileCaptureUploadSessionId(
    declaredCaptureGroupId,
  )
    ? declaredCaptureGroupId
    : captureId;
  const hasHardenedRoomBinding =
    isSafeMobileCaptureUploadSessionId(declaredCaptureId)
    && value.initialRoomReadiness?.version === MOBILE_CAPTURE_ROOM_READINESS_VERSION
    && value.initialRoomReadiness.captureId === captureId
    && value.initialRoomReadiness.roomId === value.callRoomId
    && value.initialRoomReadiness.actorUserId === value.actorUserId
    && ["eligible", "preservation-only"].includes(
      value.processingDisposition || "",
    );
  const legacyFinalization = value.finalization as Partial<MobileCaptureResumableFinalizationEvidence> | null | undefined;
  const normalizedFinalization = legacyFinalization
    ? hasHardenedRoomBinding
      ? {
        ...legacyFinalization,
        sourceId: legacyFinalization.sourceId ?? null,
        mediaAssetId: legacyFinalization.mediaAssetId ?? null,
        transcriptJobId: legacyFinalization.transcriptJobId ?? null,
        transcriptJobStatus: legacyFinalization.transcriptJobStatus ?? null,
        processingDisposition: legacyFinalization.processingDisposition
          ?? (legacyFinalization.sourceId && legacyFinalization.mediaAssetId ? "RELEASED" : "HELD"),
        holdReasonCode: legacyFinalization.holdReasonCode ?? null,
        holdReason: legacyFinalization.holdReason ?? null,
        startReceiptId: legacyFinalization.startReceiptId ?? null,
        consentVersion: legacyFinalization.consentVersion ?? null,
        transcriptDisposition: legacyFinalization.transcriptDisposition
          ?? (["QUEUED", "RUNNING", "COMPLETED"].includes(legacyFinalization.transcriptJobStatus || "")
            ? "RELEASED"
            : "HELD"),
        transcriptHoldReasonCode: legacyFinalization.transcriptHoldReasonCode ?? null,
        transcriptHoldReason: legacyFinalization.transcriptHoldReason ?? null,
        legacyHistoricalEvidence: legacyFinalization.legacyHistoricalEvidence ?? null,
      } as MobileCaptureResumableFinalizationEvidence
      : {
        ...legacyFinalization,
        sourceId: null,
        mediaAssetId: null,
        transcriptJobId: null,
        transcriptJobStatus: "HELD",
        processingDisposition: "HELD",
        holdReasonCode: "LEGACY_START_BINDING_MISSING",
        holdReason: "Historical Studio records do not confer current processing authority without hardened START and all-party consent binding.",
        startReceiptId: null,
        consentVersion: null,
        transcriptDisposition: "HELD",
        transcriptHoldReasonCode: "LEGACY_START_BINDING_MISSING",
        transcriptHoldReason: "Historical transcript evidence is quarantined until canonical reviewed release.",
        legacyHistoricalEvidence: {
          capturedAt: value.updatedAt || value.createdAt || new Date(0).toISOString(),
          sourceId: legacyFinalization.sourceId ?? null,
          mediaAssetId: legacyFinalization.mediaAssetId ?? null,
          recordingAssetId: legacyFinalization.recordingAssetId ?? null,
          recordingAssetStatus: legacyFinalization.recordingAssetStatus ?? null,
          transcriptJobId: legacyFinalization.transcriptJobId ?? null,
          transcriptJobStatus: legacyFinalization.transcriptJobStatus ?? null,
          claimedProcessingDisposition: legacyFinalization.processingDisposition ?? null,
          claimedTranscriptDisposition: legacyFinalization.transcriptDisposition ?? null,
        },
      } as MobileCaptureResumableFinalizationEvidence
    : null;
  const longSourceVerification = value.longSourceVerification == null
    ? null
    : parseLongSourceVerificationState(
        value.longSourceVerification,
        expectedSessionId,
      );
  const legacyReadiness = {
    version: MOBILE_CAPTURE_ROOM_READINESS_VERSION,
    eligibleForProcessing: false,
    allPartiesCurrentlyReady: false,
    allPartiesCurrentlyAllowTranscription: false,
    disposition: "preservation-only" as const,
    reasonCode: "LEGACY_START_BINDING_MISSING" as const,
    reason: "This legacy v2 upload predates actor-owned START and versioned all-party consent binding.",
    roomId: value.callRoomId || "",
    captureId,
    actorUserId: value.actorUserId || "",
    actorConsentId: value.recordingConsentId || null,
    startReceiptId: null,
    consentVersion: createHash("sha256").update("[]").digest("hex"),
    startConsentVersion: null,
    consentVersions: [],
    evaluatedAt: value.createdAt || new Date(0).toISOString(),
  };

  return {
    ...value,
    storageBackend: value.storageBackend === "local-development" ? "local-development" : "gcs",
    storageUri: value.storageUri || value.gcsUri || "",
    gcsUri: value.storageBackend === "local-development" ? null : value.gcsUri ?? value.storageUri ?? null,
    localUploadTokenSha256: value.localUploadTokenSha256 ?? null,
    captureId,
    captureGroupId,
    sourceProfileJson: value.sourceProfileJson ?? null,
    uploadOrigin: value.uploadOrigin ?? null,
    initialRoomReadiness: hasHardenedRoomBinding
      ? {
          ...value.initialRoomReadiness!,
          allPartiesCurrentlyAllowTranscription:
            value.initialRoomReadiness!.allPartiesCurrentlyAllowTranscription === true,
        }
      : legacyReadiness,
    roomReadinessBindingVersion: hasHardenedRoomBinding ? 1 : 0,
    startReceiptId: hasHardenedRoomBinding ? value.startReceiptId ?? null : null,
    consentVersion: hasHardenedRoomBinding ? value.consentVersion ?? null : null,
    processingDisposition: hasHardenedRoomBinding
      ? value.processingDisposition as "eligible" | "preservation-only"
      : "preservation-only",
    finalization: normalizedFinalization,
    longSourceVerification,
  } as MobileCaptureResumableManifest;
}
