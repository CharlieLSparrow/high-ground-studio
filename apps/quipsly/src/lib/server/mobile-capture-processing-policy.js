import {
  buildMobileCaptureConsentVersions,
  buildMobileCaptureProviderCompositeReadiness,
  mobileCaptureAllPartiesAllowTranscription,
  mobileCaptureAllPartiesReady,
  mobileCaptureConsentVersion,
} from "./mobile-capture-consent-readiness.js";

function asObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function consentParticipantIds(consentVersions) {
  if (!Array.isArray(consentVersions)) return [];
  return consentVersions
    .map((version) => text(asObject(version).participantId))
    .filter(Boolean);
}

function normalizedCaptureParticipantIds(receipts) {
  return [...new Set(receipts.flatMap((receipt) => {
    const metadata = asObject(receipt?.metadataJson);
    const originalDecision = asObject(metadata.originalDecision);
    const initialRoomReadiness = asObject(originalDecision.initialRoomReadiness);
    return consentParticipantIds(initialRoomReadiness.consentVersions);
  }))].sort();
}

function currentConsentScope({ room, participantIds }) {
  if (participantIds.length === 0) {
    // Compatibility for normalized receipts created before the immutable
    // capture-time consent snapshot was embedded. The broader room ledger is
    // safer than guessing which later participants were or were not recorded.
    return {
      participants: room.participants,
      consents: room.recordingConsents,
      missingParticipantIds: [],
    };
  }
  const participantIdSet = new Set(participantIds);
  const participants = room.participants.filter((participant) => participantIdSet.has(participant.id));
  const presentParticipantIds = new Set(participants.map((participant) => participant.id));
  return {
    participants,
    consents: room.recordingConsents,
    missingParticipantIds: participantIds.filter((participantId) => !presentParticipantIds.has(participantId)),
  };
}

function immutableReceiptMatchesRecordingAsset(receipt, recordingAsset) {
  const metadata = asObject(receipt?.metadataJson);
  const binding = asObject(metadata.immutableUploadBinding);
  return Boolean(
    text(receipt?.recordingAssetId) === text(recordingAsset?.id)
    && text(binding.uploadSessionId) === text(receipt?.uploadSessionId)
    && text(binding.roomId) === text(recordingAsset?.roomId)
    && text(binding.sha256).toLowerCase() === text(recordingAsset?.checksum).toLowerCase()
    && text(binding.bucketName) === text(recordingAsset?.storageBucket)
    && text(binding.objectName) === text(recordingAsset?.storageObjectPath)
    && numeric(binding.sizeBytes) !== null
    && numeric(binding.sizeBytes) === numeric(recordingAsset?.byteSize),
  );
}

function trustedProviderProcessingGateFromEvidence({ recordingAsset, room, transcript }) {
  const manifest = asObject(recordingAsset?.localManifestJson);
  const livekit = asObject(manifest.livekit);
  const verification = asObject(manifest.verification);
  const consentBinding = asObject(manifest.providerConsentBinding);
  const trustedProviderEvidence =
    recordingAsset?.kind === "SERVER_MIX"
    && manifest.provider === "livekit"
    && Boolean(text(livekit.egressId))
    && verification.status === "verified"
    && Boolean(text(recordingAsset?.storageObjectPath))
    && consentBinding.version === 1
    && Array.isArray(consentBinding.consentVersions)
    && Boolean(text(consentBinding.consentVersion));
  if (!trustedProviderEvidence) {
    return {
      allowed: false,
      receipt: null,
      errorCode: "NORMALIZED_CAPTURE_RELEASE_REQUIRED",
      error: "This recording has no normalized release receipt or trusted provider consent binding.",
    };
  }
  if (!room) {
    return {
      allowed: false,
      receipt: null,
      errorCode: "PROVIDER_CAPTURE_ROOM_REQUIRED",
      error: "The provider recording room is unavailable, so current all-party consent cannot be verified.",
    };
  }
  const providerParticipantIds = consentParticipantIds(consentBinding.consentVersions);
  const scope = currentConsentScope({ room, participantIds: providerParticipantIds });
  if (scope.missingParticipantIds.length > 0) {
    return {
      allowed: false,
      receipt: null,
      errorCode: "PROVIDER_CAPTURE_PARTICIPANT_SCOPE_UNAVAILABLE",
      error: "A participant from the immutable provider capture consent snapshot is missing from the current consent ledger.",
    };
  }
  const readiness = buildMobileCaptureProviderCompositeReadiness({
    participants: scope.participants,
    consents: scope.consents,
  });
  const bindingMatches =
    readiness.consentVersion === consentBinding.consentVersion
    && mobileCaptureConsentVersion(consentBinding.consentVersions) === consentBinding.consentVersion;
  if (
    !readiness.allPartiesSourceReady
    || !bindingMatches
    || manifest.providerProcessingDisposition !== "RELEASED"
  ) {
    return {
      allowed: false,
      receipt: null,
      errorCode: "PROVIDER_ALL_PARTY_SOURCE_BINDING_REQUIRED",
      error: "Provider composite processing requires the unchanged all-party audio-and-video consent snapshot captured at egress start.",
    };
  }
  if (!transcript) return { allowed: true, receipt: null };
  if (
    !readiness.allPartiesAllowTranscription
    || manifest.providerTranscriptDisposition !== "RELEASED"
  ) {
    return {
      allowed: false,
      receipt: null,
      errorCode: "PROVIDER_ALL_PARTY_TRANSCRIPTION_RELEASE_REQUIRED",
      error: "Provider recording transcription requires separate current all-party transcription consent and an explicit provider transcript disposition.",
    };
  }
  return { allowed: true, receipt: null };
}

/**
 * @param {{recordingAsset: any, receipts?: any[], room?: any, transcript: boolean}} input
 */
export function mobileCaptureProcessingGateFromEvidence({
  recordingAsset,
  receipts = [],
  room = null,
  transcript,
}) {
  const manifest = asObject(recordingAsset?.localManifestJson);
  if (
    manifest.processingDisposition === "HELD"
    || manifest.processingDisposition === "preservation-only"
    || (transcript && manifest.transcriptionDisposition === "HELD")
  ) {
    return {
      allowed: false,
      receipt: null,
      errorCode: String(
        (transcript && manifest.transcriptionHoldReasonCode)
        || manifest.processingHoldReasonCode
        || (transcript
          ? "CAPTURE_TRANSCRIPT_EXPLICIT_RELEASE_REQUIRED"
          : "CAPTURE_MEDIA_EXPLICIT_RELEASE_REQUIRED"),
      ),
      error: String(
        (transcript && manifest.transcriptionHoldReason)
        || manifest.processingHoldReason
        || (transcript
          ? "Transcript processing is held until explicit release."
          : "Capture media is held until explicit release."),
      ),
    };
  }

  const normalizedReceipts = Array.isArray(receipts) ? receipts : [];
  const heldReceipt = normalizedReceipts.find((receipt) => (
    transcript
      ? receipt.processingDisposition !== "RELEASED"
        || receipt.transcriptDisposition !== "RELEASED"
      : receipt.processingDisposition !== "RELEASED"
  ));
  if (heldReceipt) {
    return {
      allowed: false,
      receipt: heldReceipt,
      errorCode: transcript && heldReceipt.transcriptDisposition !== "RELEASED"
        ? heldReceipt.transcriptHoldReasonCode || "CAPTURE_TRANSCRIPT_EXPLICIT_RELEASE_REQUIRED"
        : heldReceipt.holdReasonCode || "CAPTURE_MEDIA_EXPLICIT_RELEASE_REQUIRED",
      error: transcript && heldReceipt.transcriptDisposition !== "RELEASED"
        ? heldReceipt.transcriptHoldReason || "Transcription is paused until the recording has valid permission."
        : heldReceipt.holdReason || "This recording is protected because its recording authorization is incomplete.",
    };
  }
  if (normalizedReceipts.length > 0) {
    const mismatchedReceipt = normalizedReceipts.find(
      (receipt) => !immutableReceiptMatchesRecordingAsset(receipt, recordingAsset),
    );
    if (mismatchedReceipt) {
      return {
        allowed: false,
        receipt: mismatchedReceipt,
        errorCode: "CAPTURE_IMMUTABLE_UPLOAD_BINDING_MISMATCH",
        error: transcript
          ? "Transcript source media no longer matches the immutable upload evidence recorded at finalization."
          : "Capture media no longer matches the immutable object, size, and SHA-256 evidence recorded at finalization.",
      };
    }
    if (!room) {
      return {
        allowed: false,
        receipt: normalizedReceipts[0],
        errorCode: "CURRENT_CAPTURE_ROOM_REQUIRED",
        error: "The capture room is unavailable, so current participant consent cannot be verified.",
      };
    }
    const scope = currentConsentScope({
      room,
      participantIds: normalizedCaptureParticipantIds(normalizedReceipts),
    });
    if (scope.missingParticipantIds.length > 0) {
      return {
        allowed: false,
        receipt: normalizedReceipts[0],
        errorCode: "CAPTURE_CONSENT_PARTICIPANT_SCOPE_UNAVAILABLE",
        error: "A participant from the immutable capture-time consent snapshot is missing from the current consent ledger.",
      };
    }
    const consentVersions = buildMobileCaptureConsentVersions({
      participants: scope.participants,
      consents: scope.consents,
    });
    const sourceType = recordingAsset?.kind === "LOCAL_VIDEO"
      || recordingAsset?.kind === "SCREEN_REFERENCE"
      ? "video"
      : "audio";
    if (!mobileCaptureAllPartiesReady(consentVersions, sourceType)) {
      return {
        allowed: false,
        receipt: normalizedReceipts[0],
        errorCode: "CURRENT_ALL_PARTY_SOURCE_CONSENT_REQUIRED",
        error: "Current all-party recording consent is required before processing or disclosing this captured source.",
      };
    }
    if (
      transcript
      && !mobileCaptureAllPartiesAllowTranscription(consentVersions)
    ) {
      return {
        allowed: false,
        receipt: normalizedReceipts[0],
        errorCode: "CURRENT_ALL_PARTY_TRANSCRIPTION_CONSENT_REQUIRED",
        error: "Current all-party transcription consent is required before transcript processing or disclosure.",
      };
    }
    return { allowed: true, receipt: normalizedReceipts[0] };
  }

  return trustedProviderProcessingGateFromEvidence({ recordingAsset, room, transcript });
}
