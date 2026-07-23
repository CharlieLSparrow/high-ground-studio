export const QUIPSLY_MOBILE_CAPTURE_UPLOAD_CONTRACT_KIND =
  "quipsly-mobile-capture-upload-v1" as const;

export type QuipslyMobileCaptureUploadStage =
  | "chunk-received"
  | "assembled"
  | "verified"
  | "held";

export type QuipslyMobileCaptureUploadVerificationStatus =
  | "pending"
  | "verified"
  | "uploaded-unverified"
  | "held"
  | "failed";

export type QuipslyMobileCaptureLocalRetention = {
  clientShouldPreserveOriginal: true;
  cleanupAllowed: false;
  reason: string;
};

export type QuipslyMobileCaptureServerVerification = {
  status: QuipslyMobileCaptureUploadVerificationStatus;
  storageProvider: string;
  recordingAssetId: string | null;
  transcriptJobId: string | null;
  verifiedAt: string | null;
  sizeBytes: number | null;
  reason: string;
};

export function buildMobileCaptureLocalRetention(
  reason = "Keep the local source recording until Quipsly shows a verified upload and an explicit retention policy says it may be pruned.",
): QuipslyMobileCaptureLocalRetention {
  return {
    clientShouldPreserveOriginal: true,
    cleanupAllowed: false,
    reason,
  };
}

export function buildMobileCaptureServerVerification(input: {
  provider: string;
  verified: boolean;
  recordingAssetId?: string | null;
  transcriptJobId?: string | null;
  verifiedAt?: string | null;
  sizeBytes?: number | null;
  failureReason?: string | null;
}): QuipslyMobileCaptureServerVerification {
  if (input.failureReason) {
    return {
      status: "failed",
      storageProvider: input.provider,
      recordingAssetId: input.recordingAssetId ?? null,
      transcriptJobId: input.transcriptJobId ?? null,
      verifiedAt: null,
      sizeBytes: input.sizeBytes ?? null,
      reason: input.failureReason,
    };
  }

  if (input.verified) {
    return {
      status: "verified",
      storageProvider: input.provider,
      recordingAssetId: input.recordingAssetId ?? null,
      transcriptJobId: input.transcriptJobId ?? null,
      verifiedAt: input.verifiedAt ?? new Date().toISOString(),
      sizeBytes: input.sizeBytes ?? null,
      reason:
        "Server storage accepted the assembled upload and Quipsly created app-owned recording evidence.",
    };
  }

  return {
    status: input.provider === "local-dev" ? "held" : "uploaded-unverified",
    storageProvider: input.provider,
    recordingAssetId: input.recordingAssetId ?? null,
    transcriptJobId: input.transcriptJobId ?? null,
    verifiedAt: null,
    sizeBytes: input.sizeBytes ?? null,
    reason:
      input.provider === "local-dev"
        ? "The server preserved the upload in local development storage; this is not cloud-verified production storage."
        : "The upload exists, but Quipsly has not verified durable cloud storage yet.",
  };
}
