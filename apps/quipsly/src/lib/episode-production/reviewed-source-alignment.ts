import {
  episodeRoomCaptureAlignment,
  type EpisodeRoomCaptureAlignment,
} from "@/lib/episode-room/episode-room-source-alignment";
import {
  parseAudioAlignmentEvidence,
  type AudioAlignmentEvidence,
} from "@high-ground/quipsly-media-processing";

const REVIEW_SCHEMA = "quipsly-reviewed-source-alignment-v1";
const AGENT_REVIEW_SCHEMA = "quipsly-reviewed-source-alignment-v2";
const NORMALIZED_OFFSET_REVIEW_SCHEMA = "quipsly-reviewed-source-alignment-v3";
const REVIEW_METHOD = "human-waveform-and-drift-review-v1";
const AGENT_REVIEW_METHOD = "authorized-agent-waveform-and-drift-qualification-v1";

type JsonRecord = Record<string, unknown>;

export type ReviewedSourceAlignment = {
  schema: typeof REVIEW_SCHEMA | typeof AGENT_REVIEW_SCHEMA | typeof NORMALIZED_OFFSET_REVIEW_SCHEMA;
  reviewId: string;
  status: "placement-approved";
  method: typeof REVIEW_METHOD | typeof AGENT_REVIEW_METHOD;
  reviewedAt: string;
  reviewer: {
    userId: string;
    email: string;
    name: string;
    source: string;
  };
  placement: {
    anchorTimelineSeconds: number;
    targetSourceSeconds: number;
    signedOffsetSeconds?: number;
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
    humanApprovalConfirmed: boolean;
    authorizedAgentQualificationConfirmed?: boolean;
  };
  approvalAuthority?: {
    kind: "person" | "authorized-agent";
    agentId?: string;
    delegatedByUserId: string;
    delegationScope?: string;
    qualificationMethod?: string;
    evidence?: AudioAlignmentEvidence;
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

export function canDelegateAuthorizedAgentAlignment(
  actor: { isStaff?: boolean | null },
) {
  return actor.isStaff === true;
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
  targetSourceSeconds?: unknown;
  signedOffsetSeconds?: unknown;
  waveformCorrelationConfirmed: unknown;
  driftReviewConfirmed: unknown;
  humanApprovalConfirmed: unknown;
  authorizedAgentQualificationConfirmed?: unknown;
  approvalAuthority?: unknown;
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
  const authorityInput = record(input.approvalAuthority);
  const isAuthorizedAgent = authorityInput.kind === "authorized-agent";
  if (
    input.waveformCorrelationConfirmed !== true
    || input.driftReviewConfirmed !== true
    || (
      isAuthorizedAgent
        ? input.authorizedAgentQualificationConfirmed !== true
          || input.humanApprovalConfirmed === true
        : input.humanApprovalConfirmed !== true
    )
  ) {
    throw new ReviewedSourceAlignmentError(
      "Listen at the sync point or provide qualified deterministic evidence, review drift later in the take, and explicitly approve or delegate the reversible placement before saving.",
      "alignment-review-invalid",
    );
  }

  const anchorTimelineSeconds = finiteNumber(input.anchorTimelineSeconds);
  const targetSourceSeconds = finiteNumber(input.targetSourceSeconds ?? 0);
  const signedOffsetSeconds = finiteNumber(
    input.signedOffsetSeconds ?? anchorTimelineSeconds,
  );
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
    || targetSourceSeconds === null
    || targetSourceSeconds < 0
    || targetSourceSeconds > 86_400
    || signedOffsetSeconds === null
    || Math.abs(signedOffsetSeconds) > 86_400
    || Math.abs(anchorTimelineSeconds - targetSourceSeconds - signedOffsetSeconds) > 0.001
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

  let approvalAuthority: ReviewedSourceAlignment["approvalAuthority"];
  if (isAuthorizedAgent) {
    let evidence: AudioAlignmentEvidence;
    try {
      evidence = parseAudioAlignmentEvidence(authorityInput.evidence);
    } catch {
      throw new ReviewedSourceAlignmentError(
        "Authorized agent approval requires valid exact-source audio alignment evidence.",
        "alignment-review-invalid",
      );
    }
    const agentId = text(authorityInput.agentId);
    const delegationScope = text(authorityInput.delegationScope);
    const qualificationMethod = text(authorityInput.qualificationMethod);
    if (
      !agentId
      || !delegationScope
      || qualificationMethod !== evidence.analyzer.algorithm
      || evidence.qualification.qualifiedForAuthorizedAgentReview !== true
      || evidence.spine.assetId !== spine.assetId
      || evidence.target.assetId !== target.assetId
      || !spine.sha256
      || !target.sha256
      || evidence.spine.sha256 !== spine.sha256
      || evidence.target.sha256 !== target.sha256
      || Math.abs(evidence.drift.observationIntervalSeconds - observationIntervalSeconds) > 0.000001
      || Math.abs(evidence.drift.residualDriftMilliseconds - residualDriftMilliseconds) > 0.000001
      || Math.abs(evidence.opening.measuredOffsetSeconds - signedOffsetSeconds) > 0.001
    ) {
      throw new ReviewedSourceAlignmentError(
        "Authorized agent evidence does not match the selected sources, reviewed placement, drift measurement, or delegation scope.",
        "alignment-review-invalid",
      );
    }
    approvalAuthority = {
      kind: "authorized-agent",
      agentId,
      delegatedByUserId: reviewer.userId,
      delegationScope,
      qualificationMethod,
      evidence,
    };
  } else {
    approvalAuthority = {
      kind: "person",
      delegatedByUserId: reviewer.userId,
    };
  }

  const notes = text(input.notes).slice(0, 2_000) || null;
  const normalizedSignedPlacement = targetSourceSeconds > 0 || signedOffsetSeconds < 0;
  return {
    schema: normalizedSignedPlacement
      ? NORMALIZED_OFFSET_REVIEW_SCHEMA
      : isAuthorizedAgent
        ? AGENT_REVIEW_SCHEMA
        : REVIEW_SCHEMA,
    reviewId,
    status: "placement-approved",
    method: isAuthorizedAgent ? AGENT_REVIEW_METHOD : REVIEW_METHOD,
    reviewedAt: new Date(reviewedAt).toISOString(),
    reviewer: {
      ...reviewer,
      name: reviewer.name || reviewer.email,
    },
    placement: {
      anchorTimelineSeconds: rounded(anchorTimelineSeconds),
      targetSourceSeconds: rounded(targetSourceSeconds),
      ...(normalizedSignedPlacement
        ? { signedOffsetSeconds: rounded(signedOffsetSeconds) }
        : {}),
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
      humanApprovalConfirmed: !isAuthorizedAgent,
      ...(isAuthorizedAgent ? { authorizedAgentQualificationConfirmed: true } : {}),
    },
    approvalAuthority,
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
  const approvalAuthority = record(review.approvalAuthority);
  const driftReview = record(review.driftReview);
  const clockProposal = review.clockProposal === null
    ? null
    : record(review.clockProposal);
  const reviewedAt = validIsoDate(review.reviewedAt);
  const anchorTimelineSeconds = finiteNumber(
    placement.anchorTimelineSeconds,
  );
  const targetSourceSeconds = finiteNumber(placement.targetSourceSeconds);
  const signedOffsetSeconds = finiteNumber(
    placement.signedOffsetSeconds ?? anchorTimelineSeconds,
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
  const isPersonReview = review.schema === REVIEW_SCHEMA && review.method === REVIEW_METHOD;
  const isAgentReview = review.schema === AGENT_REVIEW_SCHEMA && review.method === AGENT_REVIEW_METHOD;
  const isNormalizedReview = review.schema === NORMALIZED_OFFSET_REVIEW_SCHEMA
    && (review.method === REVIEW_METHOD || review.method === AGENT_REVIEW_METHOD);
  const personAuthorityValid = (
    isPersonReview
    || (isNormalizedReview && review.method === REVIEW_METHOD)
  )
    && checks.humanApprovalConfirmed === true
    && checks.authorizedAgentQualificationConfirmed !== true
    && (
      Object.keys(approvalAuthority).length === 0
      || (
        approvalAuthority.kind === "person"
        && text(approvalAuthority.delegatedByUserId) === text(reviewer.userId)
      )
    );
  let agentAuthorityValid = false;
  if (isAgentReview || (isNormalizedReview && review.method === AGENT_REVIEW_METHOD)) {
    try {
      const evidence = parseAudioAlignmentEvidence(approvalAuthority.evidence);
      agentAuthorityValid =
        approvalAuthority.kind === "authorized-agent"
        && Boolean(text(approvalAuthority.agentId))
        && text(approvalAuthority.delegatedByUserId) === text(reviewer.userId)
        && Boolean(text(approvalAuthority.delegationScope))
        && text(approvalAuthority.qualificationMethod) === evidence.analyzer.algorithm
        && evidence.qualification.qualifiedForAuthorizedAgentReview === true
        && evidence.spine.assetId === spineAssetId
        && evidence.target.assetId === targetAssetId
        && evidence.spine.sha256 === validSha256(spine.sha256)
        && evidence.target.sha256 === validSha256(target.sha256)
        && Math.abs(evidence.opening.measuredOffsetSeconds - (signedOffsetSeconds ?? Number.NaN)) <= 0.001
        && Math.abs(evidence.drift.observationIntervalSeconds - (observationIntervalSeconds ?? Number.NaN)) <= 0.000001
        && Math.abs(evidence.drift.residualDriftMilliseconds - (residualDriftMilliseconds ?? Number.NaN)) <= 0.000001
        && checks.humanApprovalConfirmed === false
        && checks.authorizedAgentQualificationConfirmed === true;
    } catch {
      agentAuthorityValid = false;
    }
  }
  if (
    (!isPersonReview && !isAgentReview && !isNormalizedReview)
    || review.status !== "placement-approved"
    || !text(review.reviewId)
    || !reviewedAt
    || !text(reviewer.userId)
    || !text(reviewer.email)
    || !text(reviewer.name)
    || !text(reviewer.source)
    || anchorTimelineSeconds === null
    || anchorTimelineSeconds < 0
    || anchorTimelineSeconds > 86_400
    || targetSourceSeconds === null
    || targetSourceSeconds < 0
    || targetSourceSeconds > 86_400
    || signedOffsetSeconds === null
    || Math.abs(signedOffsetSeconds) > 86_400
    || Math.abs(anchorTimelineSeconds - targetSourceSeconds - signedOffsetSeconds) > 0.001
    || !sourceEvidenceValid
    || !clockProposalValid
    || checks.waveformCorrelationConfirmed !== true
    || checks.driftReviewConfirmed !== true
    || (!personAuthorityValid && !agentAuthorityValid)
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
