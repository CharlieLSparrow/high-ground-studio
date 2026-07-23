export type MobileCaptureReleasePolicyDecision =
  | {
      allowed: false;
      status: 400 | 403 | 409;
      errorCode: string;
      error: string;
    }
  | {
      allowed: true;
      idempotent: boolean;
      reconcileControlManifest: boolean;
      mediaNeedsRelease: boolean;
      transcriptCanRelease: boolean;
    };

/** Pure policy used by the privileged HTTP route and contract tests. */
export function mobileCaptureReleasePolicy(input: {
  actorIsStaff: boolean;
  reason: string;
  hasClientBindingOverrides: boolean;
  manifestVerified: boolean;
  normalizedReceiptExists: boolean;
  normalizedReceiptBindingMatches: boolean;
  receiptProcessingDisposition: string | null;
  receiptTranscriptDisposition: string | null;
  manifestProcessingDisposition: string | null;
  manifestTranscriptDisposition: string | null;
  allPartiesCurrentlyReady: boolean;
  actorConsentBindingMatches: boolean;
  allPartiesCurrentlyAllowTranscription: boolean;
}): MobileCaptureReleasePolicyDecision {
  if (!input.actorIsStaff) {
    return {
      allowed: false,
      status: 403,
      errorCode: "STAFF_RELEASE_REQUIRED",
      error: "Only Quipsly staff may release held capture media.",
    };
  }
  if (input.hasClientBindingOverrides) {
    return {
      allowed: false,
      status: 400,
      errorCode: "CLIENT_BINDING_OVERRIDE_FORBIDDEN",
      error: "Release bindings come only from the durable upload manifest.",
    };
  }
  if (input.reason.trim().length < 20) {
    return {
      allowed: false,
      status: 400,
      errorCode: "RELEASE_REASON_REQUIRED",
      error: "An explicit release reason of at least 20 characters is required.",
    };
  }
  if (!input.manifestVerified) {
    return {
      allowed: false,
      status: 409,
      errorCode: "VERIFIED_BYTES_REQUIRED",
      error: "Only fully verified immutable recording bytes may enter release review.",
    };
  }
  if (!input.normalizedReceiptExists) {
    return {
      allowed: false,
      status: 409,
      errorCode: "FINALIZATION_RECEIPT_REQUIRED",
      error: "The normalized HELD finalization receipt is missing.",
    };
  }
  if (!input.normalizedReceiptBindingMatches) {
    return {
      allowed: false,
      status: 409,
      errorCode: "FINALIZATION_BINDING_MISMATCH",
      error: "The finalization receipt does not match the immutable actor, room, and capture binding.",
    };
  }

  const mediaReleasedInDatabase = input.receiptProcessingDisposition === "RELEASED";
  const transcriptReleasedInDatabase = input.receiptTranscriptDisposition === "RELEASED";
  const mediaReleasedInManifest = input.manifestProcessingDisposition === "RELEASED";
  const transcriptReleasedInManifest = input.manifestTranscriptDisposition === "RELEASED";
  if (
    mediaReleasedInDatabase
    && transcriptReleasedInDatabase
    && mediaReleasedInManifest
    && transcriptReleasedInManifest
  ) {
    return {
      allowed: true,
      idempotent: true,
      reconcileControlManifest: false,
      mediaNeedsRelease: false,
      transcriptCanRelease: true,
    };
  }
  const reconcileControlManifest =
    (mediaReleasedInDatabase && !mediaReleasedInManifest)
    || (transcriptReleasedInDatabase && !transcriptReleasedInManifest);
  if (
    reconcileControlManifest
    && (!input.allPartiesCurrentlyReady || !input.actorConsentBindingMatches)
  ) {
    // A durable release may have committed immediately before the control
    // manifest CAS failed. Rebuilding that receipt performs no new processing
    // and must remain possible even if consent changes before the retry.
    return {
      allowed: true,
      idempotent: false,
      reconcileControlManifest: true,
      mediaNeedsRelease: false,
      transcriptCanRelease: transcriptReleasedInDatabase,
    };
  }
  if (!input.allPartiesCurrentlyReady || !input.actorConsentBindingMatches) {
    return {
      allowed: false,
      status: 409,
      errorCode: "CURRENT_ALL_PARTY_SOURCE_CONSENT_REQUIRED",
      error: "Every signed-in, non-observer participant must currently grant this source type.",
    };
  }

  if (
    mediaReleasedInDatabase
    && !transcriptReleasedInDatabase
    && !input.allPartiesCurrentlyAllowTranscription
    && !reconcileControlManifest
  ) {
    return {
      allowed: false,
      status: 409,
      errorCode: "ALL_PARTY_TRANSCRIPTION_CONSENT_REQUIRED",
      error: "Media is released, but transcript release requires every participant's current transcription consent.",
    };
  }

  return {
    allowed: true,
    idempotent: false,
    reconcileControlManifest,
    mediaNeedsRelease: !mediaReleasedInDatabase,
    transcriptCanRelease: input.allPartiesCurrentlyAllowTranscription,
  };
}
