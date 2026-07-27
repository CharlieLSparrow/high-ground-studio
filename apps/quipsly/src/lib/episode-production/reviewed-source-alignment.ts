import {
  episodeRoomCaptureAlignment,
  type EpisodeRoomCaptureAlignment,
} from "@/lib/episode-room/episode-room-source-alignment";

const REVIEW_SCHEMA = "quipsly-reviewed-source-alignment-v1";
const REVIEW_METHOD = "human-waveform-and-drift-review-v1";

type JsonRecord = Record<string, unknown>;

export type ReviewedSourceAlignment = {
  schema: typeof REVIEW_SCHEMA;
  reviewId: string;
  status: "placement-approved";
  method: typeof REVIEW_METHOD;
  reviewedAt: string;
  reviewer: {
    userId: string;
    email: string;
    name: string;
    source: string;
  };
  placement: {
    anchorTimelineSeconds: number;
    targetSourceSeconds: 0;
    targetClipId: string | null;
  };
  sourceEvidence: {
    strength: "sha256-pair" | "stable-identity-pair";
    spine: AlignmentSourceEvidence;
    target: AlignmentSourceEvidence;
  };
  clockProposal: {
    schema: EpisodeRoomCaptureAlignment["schema"];
    method: string | null;
    estimatedServerStartedAt: string | null;
    uncertaintyMilliseconds: number | null;
    estimatedOffsetMilliseconds: number | null;
    baselineRecordingAssetId: string | null;
    proposalSourceCount: number | null;
    startReceiptId: string | null;
    contractValid: true;
    sampleAccurateClaimed: false;
    reviewRequired: true;
    reviewGate: {
      waveformCorrelationRequired: true;
      driftReviewRequired: true;
      humanApprovalRequired: true;
    };
  } | null;
  checks: {
    waveformCorrelationConfirmed: true;
    driftReviewConfirmed: true;
    humanApprovalConfirmed: true;
  };
  driftReview: {
    observationIntervalSeconds: number;
    residualDriftMilliseconds: number;
    observedPartsPerMillion: number;
    correctionApplied: false;
  };
  notes: string | null;
  sampleAccurateClaimed: false;
  sourceBytesMutated: false;
  timelineDecisionReversible: true;
};

type AlignmentSourceEvidence = {
  assetId: string;
  sourceId: string | null;
  recordingAssetId: string | null;
  originalName: string;
  sha256: string | null;
  storageGeneration: string | null;
};

export class ReviewedSourceAlignmentError extends Error {
  constructor(
    message: string,
    readonly code:
      | "alignment-review-invalid"
      | "alignment-review-source-invalid"
      | "alignment-review-proposal-invalid",
  ) {
    super(message);
    this.name = "ReviewedSourceAlignmentError";
  }
}

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function finiteNumber(value: unknown) {
  if (
    typeof value !== "number"
    && (typeof value !== "string" || !value.trim())
  ) {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validIsoDate(value: unknown) {
  const candidate = text(value);
  return candidate && Number.isFinite(Date.parse(candidate))
    ? new Date(candidate).toISOString()
    : null;
}

function validSha256(value: unknown) {
  const candidate = text(value).toLowerCase();
  return /^[a-f0-9]{64}$/.test(candidate) ? candidate : null;
}

function rounded(value: number, places = 6) {
  const scale = 10 ** places;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function sourceEvidence(assetValue: unknown): AlignmentSourceEvidence {
  const asset = record(assetValue);
  const metadata = record(asset.metadata);
  const sync = record(asset.sync);
  const recordingSync = {
    ...record(metadata.recordingSync),
    ...record(sync.recordingSync),
  };
  const assetId = text(asset.id);
  if (!assetId) {
    throw new ReviewedSourceAlignmentError(
      "Alignment review requires a stable imported-media asset ID.",
      "alignment-review-source-invalid",
    );
  }
  const sha256 =
    validSha256(asset.sha256)
    || validSha256(recordingSync.expectedSha256);
  return {
    assetId,
    sourceId: text(asset.sourceId) || null,
    recordingAssetId:
      text(sync.recordingAssetId)
      || text(recordingSync.recordingAssetId)
      || null,
    originalName: text(asset.originalName) || "Untitled source",
    sha256,
    storageGeneration: text(recordingSync.storageGeneration) || null,
  };
}

export function buildReviewedSourceAlignment(input: {
  reviewId: string;
  reviewedAt: string;
  reviewer: {
    userId: string;
    email: string;
    name: string;
    source: string;
  };
  targetAsset: unknown;
  spineAsset: unknown;
  targetClipId?: unknown;
  anchorTimelineSeconds: unknown;
  waveformCorrelationConfirmed: unknown;
  driftReviewConfirmed: unknown;
  humanApprovalConfirmed: unknown;
  driftObservationIntervalSeconds: unknown;
  residualDriftMilliseconds: unknown;
  notes?: unknown;
}): ReviewedSourceAlignment {
  const reviewId = text(input.reviewId);
  const reviewedAt = text(input.reviewedAt);
  const reviewer = {
    userId: text(input.reviewer.userId),
    email: text(input.reviewer.email).toLowerCase(),
    name: text(input.reviewer.name),
    source: text(input.reviewer.source),
  };
  if (
    !reviewId
    || !reviewedAt
    || !Number.isFinite(Date.parse(reviewedAt))
    || !reviewer.userId
    || !reviewer.email
  ) {
    throw new ReviewedSourceAlignmentError(
      "Alignment review requires the authenticated reviewer and server review time.",
      "alignment-review-invalid",
    );
  }
  if (
    input.waveformCorrelationConfirmed !== true
    || input.driftReviewConfirmed !== true
    || input.humanApprovalConfirmed !== true
  ) {
    throw new ReviewedSourceAlignmentError(
      "Listen at the sync point, review drift later in the take, and explicitly approve the placement before saving.",
      "alignment-review-invalid",
    );
  }

  const anchorTimelineSeconds = finiteNumber(input.anchorTimelineSeconds);
  const observationIntervalSeconds = finiteNumber(
    input.driftObservationIntervalSeconds,
  );
  const residualDriftMilliseconds = finiteNumber(
    input.residualDriftMilliseconds,
  );
  if (
    anchorTimelineSeconds === null
    || anchorTimelineSeconds < 0
    || anchorTimelineSeconds > 86_400
  ) {
    throw new ReviewedSourceAlignmentError(
      "The reviewed timeline anchor must be between 0 and 24 hours.",
      "alignment-review-invalid",
    );
  }
  if (
    observationIntervalSeconds === null
    || observationIntervalSeconds <= 0
    || observationIntervalSeconds > 86_400
    || residualDriftMilliseconds === null
    || Math.abs(residualDriftMilliseconds) > 60_000
  ) {
    throw new ReviewedSourceAlignmentError(
      "Record a real later comparison point and its residual drift before approving placement.",
      "alignment-review-invalid",
    );
  }

  const target = sourceEvidence(input.targetAsset);
  const spine = sourceEvidence(input.spineAsset);
  if (target.assetId === spine.assetId) {
    throw new ReviewedSourceAlignmentError(
      "The target and spine must be different immutable sources.",
      "alignment-review-source-invalid",
    );
  }

  const captureProposal = episodeRoomCaptureAlignment(input.targetAsset);
  if (
    captureProposal
    && (
      captureProposal.status !== "proposal-ready"
      || !captureProposal.contractValid
    )
  ) {
    throw new ReviewedSourceAlignmentError(
      "This capture proposal is not safe to approve. Repair its immutable clock evidence first.",
      "alignment-review-proposal-invalid",
    );
  }

  const notes = text(input.notes).slice(0, 2_000) || null;
  return {
    schema: REVIEW_SCHEMA,
    reviewId,
    status: "placement-approved",
    method: REVIEW_METHOD,
    reviewedAt: new Date(reviewedAt).toISOString(),
    reviewer: {
      ...reviewer,
      name: reviewer.name || reviewer.email,
    },
    placement: {
      anchorTimelineSeconds: rounded(anchorTimelineSeconds),
      targetSourceSeconds: 0,
      targetClipId: text(input.targetClipId) || null,
    },
    sourceEvidence: {
      strength:
        spine.sha256 && target.sha256
          ? "sha256-pair"
          : "stable-identity-pair",
      spine,
      target,
    },
    clockProposal: captureProposal
      ? {
          schema: captureProposal.schema,
          method: captureProposal.method,
          estimatedServerStartedAt:
            captureProposal.estimatedServerStartedAt,
          uncertaintyMilliseconds:
            captureProposal.uncertaintyMilliseconds,
          estimatedOffsetMilliseconds:
            captureProposal.estimatedOffsetMilliseconds,
          baselineRecordingAssetId:
            captureProposal.baselineRecordingAssetId,
          proposalSourceCount: captureProposal.proposalSourceCount,
          startReceiptId: captureProposal.startReceiptId,
          contractValid: true,
          sampleAccurateClaimed: false,
          reviewRequired: true,
          reviewGate: {
            waveformCorrelationRequired: true,
            driftReviewRequired: true,
            humanApprovalRequired: true,
          },
        }
      : null,
    checks: {
      waveformCorrelationConfirmed: true,
      driftReviewConfirmed: true,
      humanApprovalConfirmed: true,
    },
    driftReview: {
      observationIntervalSeconds: rounded(observationIntervalSeconds),
      residualDriftMilliseconds: rounded(residualDriftMilliseconds),
      observedPartsPerMillion: rounded(
        residualDriftMilliseconds * 1_000 / observationIntervalSeconds,
      ),
      correctionApplied: false,
    },
    notes,
    sampleAccurateClaimed: false,
    sourceBytesMutated: false,
    timelineDecisionReversible: true,
  };
}

export function reviewedSourceAlignment(
  importedAsset: unknown,
): ReviewedSourceAlignment | null {
  const sync = record(record(importedAsset).sync);
  const review = record(sync.alignmentReview);
  const reviewer = record(review.reviewer);
  const placement = record(review.placement);
  const sourceEvidenceRecord = record(review.sourceEvidence);
  const spine = record(sourceEvidenceRecord.spine);
  const target = record(sourceEvidenceRecord.target);
  const checks = record(review.checks);
  const driftReview = record(review.driftReview);
  const clockProposal = review.clockProposal === null
    ? null
    : record(review.clockProposal);
  const reviewedAt = validIsoDate(review.reviewedAt);
  const anchorTimelineSeconds = finiteNumber(
    placement.anchorTimelineSeconds,
  );
  const observationIntervalSeconds = finiteNumber(
    driftReview.observationIntervalSeconds,
  );
  const residualDriftMilliseconds = finiteNumber(
    driftReview.residualDriftMilliseconds,
  );
  const observedPartsPerMillion = finiteNumber(
    driftReview.observedPartsPerMillion,
  );
  const spineAssetId = text(spine.assetId);
  const targetAssetId = text(target.assetId);
  const sourceStrength = text(sourceEvidenceRecord.strength);
  const sourceHashesValid =
    (spine.sha256 === null || Boolean(validSha256(spine.sha256)))
    && (target.sha256 === null || Boolean(validSha256(target.sha256)));
  const sourceEvidenceValid =
    Boolean(spineAssetId)
    && Boolean(targetAssetId)
    && spineAssetId !== targetAssetId
    && Boolean(text(spine.originalName))
    && Boolean(text(target.originalName))
    && sourceHashesValid
    && (
      sourceStrength === "stable-identity-pair"
      || (
        sourceStrength === "sha256-pair"
        && Boolean(validSha256(spine.sha256))
        && Boolean(validSha256(target.sha256))
      )
    );
  const clockProposalValid =
    clockProposal === null
    || (
      clockProposal.schema === "quipsly-capture-alignment-proposal-v1"
      && clockProposal.contractValid === true
      && Boolean(text(clockProposal.method))
      && Boolean(validIsoDate(clockProposal.estimatedServerStartedAt))
      && clockProposal.sampleAccurateClaimed === false
      && clockProposal.reviewRequired === true
      && record(clockProposal.reviewGate).waveformCorrelationRequired === true
      && record(clockProposal.reviewGate).driftReviewRequired === true
      && record(clockProposal.reviewGate).humanApprovalRequired === true
    );
  const observedDriftConsistent =
    observationIntervalSeconds !== null
    && observationIntervalSeconds > 0
    && residualDriftMilliseconds !== null
    && observedPartsPerMillion !== null
    && Math.abs(
      observedPartsPerMillion
      - rounded(
        residualDriftMilliseconds * 1_000 / observationIntervalSeconds,
      )
    ) <= 0.000001;
  if (
    review.schema !== REVIEW_SCHEMA
    || review.status !== "placement-approved"
    || review.method !== REVIEW_METHOD
    || !text(review.reviewId)
    || !reviewedAt
    || !text(reviewer.userId)
    || !text(reviewer.email)
    || !text(reviewer.name)
    || !text(reviewer.source)
    || anchorTimelineSeconds === null
    || anchorTimelineSeconds < 0
    || anchorTimelineSeconds > 86_400
    || placement.targetSourceSeconds !== 0
    || !sourceEvidenceValid
    || !clockProposalValid
    || checks.waveformCorrelationConfirmed !== true
    || checks.driftReviewConfirmed !== true
    || checks.humanApprovalConfirmed !== true
    || observationIntervalSeconds === null
    || observationIntervalSeconds <= 0
    || observationIntervalSeconds > 86_400
    || residualDriftMilliseconds === null
    || Math.abs(residualDriftMilliseconds) > 60_000
    || observedPartsPerMillion === null
    || !observedDriftConsistent
    || driftReview.correctionApplied !== false
    || review.sampleAccurateClaimed !== false
    || review.sourceBytesMutated !== false
    || review.timelineDecisionReversible !== true
  ) {
    return null;
  }
  return review as ReviewedSourceAlignment;
}

export function hasProtectedReviewedAlignment(
  importedAsset: unknown,
) {
  const sync = record(record(importedAsset).sync);
  return (
    sync.source === "editor-reviewed-alignment-v1"
    && Object.keys(
      record(sync.alignmentReview),
    ).length > 0
  );
}
