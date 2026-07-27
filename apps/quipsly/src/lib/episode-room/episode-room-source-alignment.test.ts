/** @jest-environment node */

import { episodeRoomCaptureAlignment } from "./episode-room-source-alignment";

function proposal(overrides: Record<string, unknown> = {}) {
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
      baselineRecordingAssetId: "recording-a",
      estimatedOffsetMilliseconds: 500,
      proposalSourceCount: 2,
      sampleAccurateClaimed: false,
    },
    reason: "Review it.",
    ...overrides,
  };
}

describe("Episode Room capture alignment read model", () => {
  it("reads the canonical proposal separately from generic source workflow state", () => {
    const result = episodeRoomCaptureAlignment({
      sync: {
        status: "ready-to-sync",
        alignment: proposal(),
      },
    });

    expect(result).toMatchObject({
      status: "proposal-ready",
      contractValid: true,
      estimatedServerStartedAt: "2026-07-27T18:00:00.510Z",
      uncertaintyMilliseconds: 52,
      estimatedOffsetMilliseconds: 500,
      baselineRecordingAssetId: "recording-a",
      proposalSourceCount: 2,
      startReceiptId: "receipt-1",
      sampleAccurateClaimed: false,
      reviewRequired: true,
    });
  });

  it("reads the compatibility copy under metadata recording sync", () => {
    const result = episodeRoomCaptureAlignment({
      metadata: {
        recordingSync: {
          alignment: proposal({
            status: "needs-alignment",
            estimatedServerStartedAt: null,
          }),
        },
      },
    });

    expect(result).toMatchObject({
      status: "needs-alignment",
      contractValid: true,
      estimatedServerStartedAt: null,
    });
  });

  it("downgrades a proposal that claims sample accuracy or skips review", () => {
    const result = episodeRoomCaptureAlignment({
      sync: {
        alignment: proposal({
          sampleAccurateClaimed: true,
          reviewRequired: false,
        }),
      },
    });

    expect(result).toMatchObject({
      status: "needs-alignment",
      contractValid: false,
      sampleAccurateClaimed: true,
      reviewRequired: false,
      reason: expect.stringContaining("failed its safety contract"),
    });
  });

  it("does not reinterpret ready-to-sync as clock alignment evidence", () => {
    expect(episodeRoomCaptureAlignment({
      sync: { status: "ready-to-sync" },
    })).toBeNull();
  });

  it("keeps absent optional group numbers absent instead of coercing them to zero", () => {
    const result = episodeRoomCaptureAlignment({
      sync: {
        alignment: proposal({ captureGroup: undefined }),
      },
    });

    expect(result).toMatchObject({
      status: "proposal-ready",
      estimatedOffsetMilliseconds: null,
      proposalSourceCount: null,
    });
  });
});
