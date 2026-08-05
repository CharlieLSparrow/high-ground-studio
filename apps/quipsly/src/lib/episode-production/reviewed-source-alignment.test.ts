/** @jest-environment node */

import {
  ReviewedSourceAlignmentError,
  buildReviewedSourceAlignment,
  canDelegateAuthorizedAgentAlignment,
  hasProtectedReviewedAlignment,
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

function delegatedAgentEvidence() {
  return {
    kind: "quipsly-audio-alignment-evidence-v1",
    createdAt: "2026-07-27T18:55:00.000Z",
    spine: {
      assetId: "spine",
      provider: "local",
      locator: "/private/spine.wav",
      generation: "sha256:spine",
      sha256: "a".repeat(64),
      sizeBytes: 1_000,
      contentType: "audio/wav",
    },
    target: {
      assetId: "target",
      provider: "local",
      locator: "/private/target.mov",
      generation: "sha256:target",
      sha256: "b".repeat(64),
      sizeBytes: 2_000,
      contentType: "video/quicktime",
    },
    analyzer: {
      algorithm: "normalized-fft-cross-correlation-v1",
      sampleRate: 12_000,
      windowSeconds: 6,
      searchRadiusSeconds: 1,
      ffmpegVersion: "ffmpeg test",
    },
    opening: {
      targetStartSeconds: 10,
      expectedSpineStartSeconds: 10.5,
      measuredSpineStartSeconds: 10.5,
      measuredOffsetSeconds: 0.5,
      normalizedCorrelation: 0.96,
      secondBestCorrelation: 0.61,
      peakMargin: 0.35,
    },
    later: {
      targetStartSeconds: 1_810,
      expectedSpineStartSeconds: 1_810.5,
      measuredSpineStartSeconds: 1_810.536,
      measuredOffsetSeconds: 0.536,
      normalizedCorrelation: 0.93,
      secondBestCorrelation: 0.58,
      peakMargin: 0.35,
    },
    drift: {
      observationIntervalSeconds: 1_800,
      residualDriftMilliseconds: 36,
      observedPartsPerMillion: 20,
    },
    qualification: {
      minimumCorrelation: 0.78,
      minimumPeakMargin: 0.04,
      qualifiedForAuthorizedAgentReview: true,
      reason: "Distinct peaks at two separated source-bound windows.",
    },
    boundaries: {
      sampleAccurateClaimed: false,
      sourceBytesMutated: false,
      timelinePlacementApplied: false,
      personOrDelegatedApprovalStillRequired: true,
    },
  };
}

describe("reviewed source alignment", () => {
  it("limits agent delegation to a signed-in staff authority", () => {
    expect(canDelegateAuthorizedAgentAlignment({ isStaff: true })).toBe(true);
    expect(canDelegateAuthorizedAgentAlignment({ isStaff: false })).toBe(false);
    expect(canDelegateAuthorizedAgentAlignment({})).toBe(false);
  });

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

  it("records authorized agent qualification without manufacturing human listening", () => {
    const evidence = delegatedAgentEvidence();
    const review = buildReviewedSourceAlignment(reviewInput({
      humanApprovalConfirmed: false,
      authorizedAgentQualificationConfirmed: true,
      approvalAuthority: {
        kind: "authorized-agent",
        agentId: "codex-quipsly-media-review",
        delegationScope: "Exact-source reversible alignment for this retained QA take only.",
        qualificationMethod: "normalized-fft-cross-correlation-v1",
        evidence,
      },
    }));

    expect(review).toMatchObject({
      schema: "quipsly-reviewed-source-alignment-v2",
      method: "authorized-agent-waveform-and-drift-qualification-v1",
      checks: {
        humanApprovalConfirmed: false,
        authorizedAgentQualificationConfirmed: true,
      },
      approvalAuthority: {
        kind: "authorized-agent",
        agentId: "codex-quipsly-media-review",
        delegatedByUserId: "user-1",
      },
    });
    expect(reviewedSourceAlignment({ sync: { alignmentReview: review } })).toEqual(review);
  });

  it("normalizes a negative exact-source offset into source trim without losing its sign", () => {
    const evidence = delegatedAgentEvidence();
    evidence.opening.expectedSpineStartSeconds = 9.65;
    evidence.opening.measuredSpineStartSeconds = 9.65;
    evidence.opening.measuredOffsetSeconds = -0.35;
    evidence.later.expectedSpineStartSeconds = 1_809.65;
    evidence.later.measuredSpineStartSeconds = 1_809.686;
    evidence.later.measuredOffsetSeconds = -0.314;
    const review = buildReviewedSourceAlignment(reviewInput({
      anchorTimelineSeconds: 0,
      targetSourceSeconds: 0.35,
      signedOffsetSeconds: -0.35,
      humanApprovalConfirmed: false,
      authorizedAgentQualificationConfirmed: true,
      approvalAuthority: {
        kind: "authorized-agent",
        agentId: "codex-quipsly-media-review",
        delegationScope: "Exact-source reversible alignment for this retained QA take only.",
        qualificationMethod: "normalized-fft-cross-correlation-v1",
        evidence,
      },
    }));

    expect(review).toMatchObject({
      schema: "quipsly-reviewed-source-alignment-v3",
      placement: {
        anchorTimelineSeconds: 0,
        targetSourceSeconds: 0.35,
        signedOffsetSeconds: -0.35,
      },
    });
    expect(reviewedSourceAlignment({ sync: { alignmentReview: review } })).toEqual(review);
  });

  it("rejects agent qualification when evidence source bytes or drift are changed", () => {
    const evidence = delegatedAgentEvidence();
    expect(() => buildReviewedSourceAlignment(reviewInput({
      humanApprovalConfirmed: false,
      authorizedAgentQualificationConfirmed: true,
      approvalAuthority: {
        kind: "authorized-agent",
        agentId: "codex-quipsly-media-review",
        delegationScope: "One retained QA take.",
        qualificationMethod: "normalized-fft-cross-correlation-v1",
        evidence: {
          ...evidence,
          target: { ...evidence.target, sha256: "c".repeat(64) },
        },
      },
    }))).toThrow(/does not match/);
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

  it("protects even a damaged reviewed receipt from silent replacement", () => {
    expect(hasProtectedReviewedAlignment({
      sync: {
        source: "editor-reviewed-alignment-v1",
        alignmentReview: {
          schema: "damaged-but-preserved",
        },
      },
    })).toBe(true);
    expect(hasProtectedReviewedAlignment({
      sync: {
        source: "editor-sync-bench",
        alignmentReview: {
          schema: "untrusted",
        },
      },
    })).toBe(false);
  });
});
