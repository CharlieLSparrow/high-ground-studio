/** @jest-environment node */

import {
  ReviewedSourceAlignmentError,
  buildReviewedSourceAlignment,
  reviewedSourceAlignment,
} from "./reviewed-source-alignment";

function asset(
  id: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    sourceId: `source-${id}`,
    originalName: `${id}.wav`,
    sha256: (id === "spine" ? "a" : "b").repeat(64),
    sync: {
      recordingAssetId: `recording-${id}`,
      recordingSync: {
        recordingAssetId: `recording-${id}`,
        storageGeneration: "123",
      },
    },
    ...overrides,
  };
}

function proposal() {
  return {
    schema: "quipsly-capture-alignment-proposal-v1",
    status: "proposal-ready",
    method: "lowest-rtt-monotonic-server-projection-v1",
    sourceClockEvidence: "lowest-rtt-monotonic-projection",
    estimatedServerStartedAt: "2026-07-27T18:00:00.510Z",
    uncertaintyMilliseconds: 52,
    sampleAccurateClaimed: false,
    reviewRequired: true,
    reviewGate: {
      waveformCorrelationRequired: true,
      driftReviewRequired: true,
      humanApprovalRequired: true,
    },
    startBoundary: { receiptId: "receipt-1" },
    captureGroup: {
      baselineRecordingAssetId: "recording-spine",
      estimatedOffsetMilliseconds: 500,
      proposalSourceCount: 2,
      sampleAccurateClaimed: false,
    },
    reason: "Review it.",
  };
}

function reviewInput(overrides: Record<string, unknown> = {}) {
  return {
    reviewId: "review-1",
    reviewedAt: "2026-07-27T19:00:00.000Z",
    reviewer: {
      userId: "user-1",
      email: "EDITOR@example.com",
      name: "Editor",
      source: "embedded-cookie",
    },
    spineAsset: asset("spine"),
    targetAsset: asset("target", {
      sync: {
        recordingAssetId: "recording-target",
        alignment: proposal(),
      },
    }),
    targetClipId: "clip-1",
    anchorTimelineSeconds: 0.5,
    waveformCorrelationConfirmed: true,
    driftReviewConfirmed: true,
    humanApprovalConfirmed: true,
    driftObservationIntervalSeconds: 1_800,
    residualDriftMilliseconds: 36,
    notes: "Checked the opening clap and a phrase near the end.",
    ...overrides,
  };
}

describe("reviewed source alignment", () => {
  it("builds a reversible placement approval from server-owned evidence", () => {
    const review = buildReviewedSourceAlignment(reviewInput());

    expect(review).toMatchObject({
      schema: "quipsly-reviewed-source-alignment-v1",
      status: "placement-approved",
      reviewedAt: "2026-07-27T19:00:00.000Z",
      reviewer: {
        userId: "user-1",
        email: "editor@example.com",
      },
      placement: {
        anchorTimelineSeconds: 0.5,
        targetSourceSeconds: 0,
        targetClipId: "clip-1",
      },
      sourceEvidence: {
        strength: "sha256-pair",
        spine: { assetId: "spine" },
        target: { assetId: "target" },
      },
      clockProposal: {
        contractValid: true,
        estimatedOffsetMilliseconds: 500,
        startReceiptId: "receipt-1",
      },
      driftReview: {
        observationIntervalSeconds: 1_800,
        residualDriftMilliseconds: 36,
        observedPartsPerMillion: 20,
        correctionApplied: false,
      },
      sampleAccurateClaimed: false,
      sourceBytesMutated: false,
      timelineDecisionReversible: true,
    });
    expect(reviewedSourceAlignment({
      sync: { alignmentReview: review },
    })).toEqual(review);
  });

  it("refuses approval until all three review gates are explicit", () => {
    expect(() => buildReviewedSourceAlignment(reviewInput({
      driftReviewConfirmed: false,
    }))).toThrow(ReviewedSourceAlignmentError);
  });

  it("refuses a capture proposal whose safety contract is invalid", () => {
    expect(() => buildReviewedSourceAlignment(reviewInput({
      targetAsset: asset("target", {
        sync: {
          alignment: {
            ...proposal(),
            sampleAccurateClaimed: true,
          },
        },
      }),
    }))).toThrow("not safe to approve");
  });

  it("refuses to align a source against itself", () => {
    const shared = asset("same");
    expect(() => buildReviewedSourceAlignment(reviewInput({
      spineAsset: shared,
      targetAsset: shared,
    }))).toThrow("must be different");
  });

  it("does not read incomplete or optimistic review packets", () => {
    expect(reviewedSourceAlignment({
      sync: {
        alignmentReview: {
          schema: "quipsly-reviewed-source-alignment-v1",
          status: "placement-approved",
          method: "human-waveform-and-drift-review-v1",
          sampleAccurateClaimed: true,
          sourceBytesMutated: false,
          timelineDecisionReversible: true,
        },
      },
    })).toBeNull();
  });

  it("does not read a packet that asserts approval without reviewer evidence", () => {
    const valid = buildReviewedSourceAlignment(reviewInput());
    expect(reviewedSourceAlignment({
      sync: {
        alignmentReview: {
          ...valid,
          reviewer: {},
        },
      },
    })).toBeNull();
  });

  it("does not promote invalid hash strings to immutable-pair evidence", () => {
    const review = buildReviewedSourceAlignment(reviewInput({
      spineAsset: asset("spine", { sha256: "not-a-sha" }),
    }));

    expect(review.sourceEvidence.strength).toBe("stable-identity-pair");
    expect(review.sourceEvidence.spine.sha256).toBeNull();
  });

  it("does not read a packet whose stored drift result contradicts its evidence", () => {
    const valid = buildReviewedSourceAlignment(reviewInput());
    expect(reviewedSourceAlignment({
      sync: {
        alignmentReview: {
          ...valid,
          driftReview: {
            ...valid.driftReview,
            observedPartsPerMillion: 999,
          },
        },
      },
    })).toBeNull();
  });

  it("does not trust a clock snapshot that drops its review gates", () => {
    const valid = buildReviewedSourceAlignment(reviewInput());
    expect(reviewedSourceAlignment({
      sync: {
        alignmentReview: {
          ...valid,
          clockProposal: {
            ...valid.clockProposal,
            reviewGate: {},
          },
        },
      },
    })).toBeNull();
  });
});
