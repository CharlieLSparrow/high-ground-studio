/** @jest-environment node */

import {
  addCaptureGroupAlignmentOffsets,
  addCaptureGroupOffsetsToImportedMedia,
  buildCaptureSourceAlignmentProposal,
} from "./capture-source-alignment";

const receipt = {
  receiptId: "receipt-1",
  roomId: "room-1",
  captureId: "capture-1",
  actorUserId: "user-1",
  action: "START_RECORDING",
  outcome: "APPLIED",
  stateApplied: true,
  occurredAt: new Date("2026-07-27T18:00:00.400Z"),
  receivedAt: new Date("2026-07-27T18:00:00.650Z"),
};

function isoSample(overrides: Record<string, unknown> = {}) {
  return {
    protocolVersion: 1,
    sampleId: "sample-slow",
    callRoomId: "room-1",
    captureGroupId: "group-1",
    clientKind: "ios",
    deviceWallSentAt: "2026-07-27T18:00:00.000Z",
    deviceMonotonicSentNanoseconds: "1000000000",
    serverReceivedAt: "2026-07-27T18:00:00.120Z",
    serverSentAt: "2026-07-27T18:00:00.130Z",
    deviceWallReceivedAt: "2026-07-27T18:00:00.210Z",
    deviceMonotonicReceivedNanoseconds: "1210000000",
    networkRoundTripMilliseconds: 200,
    serverOffsetMilliseconds: 20,
    uncertaintyMilliseconds: 100,
    wallClockDiscontinuityMilliseconds: 0,
    ...overrides,
  };
}

describe("capture source alignment proposal", () => {
  it("selects the lowest-RTT sample and projects monotonic source time onto server time", () => {
    const proposal = buildCaptureSourceAlignmentProposal({
      sourceProfile: {
        schemaVersion: 1,
        monotonicStartedNanoseconds: "1500000000",
        clockSamples: [
          isoSample(),
          isoSample({
            sampleId: "sample-fast",
            serverReceivedAt: "2026-07-27T18:00:00.060Z",
            serverSentAt: "2026-07-27T18:00:00.070Z",
            deviceWallReceivedAt: "2026-07-27T18:00:00.110Z",
            deviceMonotonicReceivedNanoseconds: "1110000000",
            networkRoundTripMilliseconds: 100,
            uncertaintyMilliseconds: 50,
          }),
        ],
      },
      callRoomId: "room-1",
      captureId: "capture-1",
      captureGroupId: "group-1",
      actorUserId: "user-1",
      startReceiptId: "receipt-1",
      recordedStartedAt: "2026-07-27T18:00:00.500Z",
      startReceipt: receipt,
    });

    expect(proposal).toMatchObject({
      schema: "quipsly-capture-alignment-proposal-v1",
      status: "proposal-ready",
      sourceClockEvidence: "lowest-rtt-monotonic-projection",
      method: "lowest-rtt-monotonic-server-projection-v1",
      estimatedServerStartedAt: "2026-07-27T18:00:00.510Z",
      uncertaintyMilliseconds: 52,
      sampleAccurateClaimed: false,
      reviewRequired: true,
      selectedClockSample: {
        sampleId: "sample-fast",
        networkRoundTripMilliseconds: 100,
        serverOffsetMilliseconds: 10,
        sourceProfileDateEncoding: "iso8601",
      },
      startBoundary: {
        receiptId: "receipt-1",
        estimatedServerOccurredAt: "2026-07-27T18:00:00.410Z",
        sourceStartAfterActionMilliseconds: 100,
        serverReceiptDeliveryDeltaMilliseconds: 140,
      },
    });
  });

  it("reads already-shipped Swift reference-date numbers without changing their meaning", () => {
    const foundationSeconds = (
      Date.parse("2026-07-27T18:00:00.000Z")
      - Date.UTC(2001, 0, 1)
    ) / 1_000;
    const proposal = buildCaptureSourceAlignmentProposal({
      sourceProfile: {
        schemaVersion: 1,
        monotonicStartedNanoseconds: 1_500_000_000,
        clockSamples: [{
          ...isoSample(),
          sampleId: "swift-number",
          deviceWallSentAt: foundationSeconds,
          deviceWallReceivedAt: foundationSeconds + 0.21,
        }],
      },
      callRoomId: "room-1",
      captureId: "capture-1",
      captureGroupId: "group-1",
      actorUserId: "user-1",
      startReceiptId: "receipt-1",
      startReceipt: receipt,
    });

    expect(proposal.status).toBe("proposal-ready");
    expect(proposal.estimatedServerStartedAt)
      .toBe("2026-07-27T18:00:00.520Z");
    expect(proposal.selectedClockSample?.sourceProfileDateEncoding)
      .toBe("swift-reference-date");
    expect(proposal.sampleAccurateClaimed).toBe(false);
  });

  it("accepts lossless Mac monotonic strings after more than 104 days of uptime", () => {
    const proposal = buildCaptureSourceAlignmentProposal({
      sourceProfile: {
        schemaVersion: 1,
        monotonicStartedNanoseconds: "10000000500000000",
        monotonicStoppedNanoseconds: "10000002500000000",
        clockSamples: [{
          ...isoSample({
            clientKind: "macos",
            deviceMonotonicSentNanoseconds: "10000000000000000",
            deviceMonotonicReceivedNanoseconds: "10000000110000000",
            networkRoundTripMilliseconds: 100,
            uncertaintyMilliseconds: 50,
          }),
        }],
      },
      callRoomId: "room-1",
      captureId: "capture-1",
      captureGroupId: "group-1",
      actorUserId: "user-1",
      startReceiptId: "receipt-1",
      startReceipt: receipt,
    });

    expect(proposal).toMatchObject({
      status: "proposal-ready",
      estimatedServerStartedAt: "2026-07-27T18:00:00.520Z",
      sourceClockEvidence: "lowest-rtt-monotonic-projection",
      sampleAccurateClaimed: false,
      reviewRequired: true,
      selectedClockSample: {
        clientKind: "macos",
        sourceProfileDateEncoding: "iso8601",
      },
    });
  });

  it("refuses a room/take mismatch and never upgrades it to aligned", () => {
    const proposal = buildCaptureSourceAlignmentProposal({
      sourceProfile: {
        schemaVersion: 1,
        monotonicStartedNanoseconds: "1500000000",
        clockSamples: [isoSample({ callRoomId: "other-room" })],
      },
      callRoomId: "room-1",
      captureId: "capture-1",
      captureGroupId: "group-1",
      actorUserId: "user-1",
      startReceiptId: "receipt-1",
      startReceipt: receipt,
    });

    expect(proposal).toMatchObject({
      status: "needs-alignment",
      sourceClockEvidence: "clock-samples-invalid",
      estimatedServerStartedAt: null,
      sampleAccurateClaimed: false,
      reviewRequired: true,
    });
  });

  it("keeps a valid clock projection untrusted when the immutable START receipt ID drifts", () => {
    const proposal = buildCaptureSourceAlignmentProposal({
      sourceProfile: {
        schemaVersion: 1,
        monotonicStartedNanoseconds: "1500000000",
        clockSamples: [isoSample()],
      },
      callRoomId: "room-1",
      captureId: "capture-1",
      captureGroupId: "group-1",
      actorUserId: "user-1",
      startReceiptId: "different-receipt",
      startReceipt: receipt,
    });

    expect(proposal).toMatchObject({
      status: "needs-alignment",
      sourceClockEvidence: "lowest-rtt-monotonic-projection",
      startBoundary: null,
      sampleAccurateClaimed: false,
      reviewRequired: true,
    });
  });

  it("keeps a Canon card timestamp as unreviewed metadata instead of inventing timeline sync", () => {
    const proposal = buildCaptureSourceAlignmentProposal({
      sourceProfile: {
        schemaVersion: 1,
        sourceKind: "camera_card_original",
        captureTimingEvidence: "card-file-creation-date-unreviewed",
        recordedAtCandidate: "2026-07-27T17:59:58.000Z",
        cardByteIdentityVerified: true,
        monotonicStartedNanoseconds: null,
        monotonicStoppedNanoseconds: null,
        clockSamples: null,
      },
      callRoomId: "room-1",
      captureId: "capture-1",
      captureGroupId: "group-1",
      actorUserId: "user-1",
      startReceiptId: "receipt-1",
      recordedStartedAt: "2026-07-27T17:59:58.000Z",
      startReceipt: receipt,
    });

    expect(proposal).toMatchObject({
      status: "needs-alignment",
      sourceClockEvidence: "clock-samples-missing",
      method: null,
      estimatedServerStartedAt: null,
      uncertaintyMilliseconds: null,
      selectedClockSample: null,
      startBoundary: null,
      sampleAccurateClaimed: false,
      reviewRequired: true,
      reviewGate: {
        waveformCorrelationRequired: true,
        driftReviewRequired: true,
        humanApprovalRequired: true,
      },
    });
    expect(proposal.reason).toContain("Waveform alignment remains required");
  });

  it("derives reviewable group offsets without claiming a locked timeline", () => {
    const proposal = buildCaptureSourceAlignmentProposal({
      sourceProfile: {
        schemaVersion: 1,
        monotonicStartedNanoseconds: "1500000000",
        clockSamples: [isoSample()],
      },
      callRoomId: "room-1",
      captureId: "capture-1",
      captureGroupId: "group-1",
      actorUserId: "user-1",
      startReceiptId: "receipt-1",
      startReceipt: receipt,
    });
    const later = {
      ...proposal,
      estimatedServerStartedAt: "2026-07-27T18:00:01.020Z",
    };
    const sources = addCaptureGroupAlignmentOffsets([
      {
        recordingAssetId: "source-a",
        captureGroupId: "group-1",
        alignment: structuredClone(proposal),
      },
      {
        recordingAssetId: "source-b",
        captureGroupId: "group-1",
        alignment: later,
      },
    ]);

    expect(sources[0].alignment.captureGroup).toMatchObject({
      baselineRecordingAssetId: "source-a",
      estimatedOffsetMilliseconds: 0,
      proposalSourceCount: 2,
      sampleAccurateClaimed: false,
    });
    expect(sources[1].alignment.captureGroup?.estimatedOffsetMilliseconds)
      .toBe(500);
    expect(sources[1].alignment.status).toBe("proposal-ready");
  });

  it("persists the same group proposal into canonical Episode Production sync packets", () => {
    const first = buildCaptureSourceAlignmentProposal({
      sourceProfile: {
        schemaVersion: 1,
        monotonicStartedNanoseconds: "1500000000",
        clockSamples: [isoSample()],
      },
      callRoomId: "room-1",
      captureId: "capture-1",
      captureGroupId: "group-1",
      actorUserId: "user-1",
      startReceiptId: "receipt-1",
      startReceipt: receipt,
    });
    const second = {
      ...structuredClone(first),
      estimatedServerStartedAt: "2026-07-27T18:00:01.020Z",
    };
    const rows = addCaptureGroupOffsetsToImportedMedia([
      {
        id: "media-a",
        metadata: {
          recordingSync: {
            recordingAssetId: "recording-a",
            captureGroupId: "group-1",
            alignment: first,
          },
        },
        sync: {
          recordingSync: {
            recordingAssetId: "recording-a",
            captureGroupId: "group-1",
            alignment: first,
          },
          alignment: first,
        },
      },
      {
        id: "media-b",
        metadata: {
          recordingSync: {
            recordingAssetId: "recording-b",
            captureGroupId: "group-1",
            alignment: second,
          },
        },
        sync: {
          recordingSync: {
            recordingAssetId: "recording-b",
            captureGroupId: "group-1",
            alignment: second,
          },
          alignment: second,
        },
      },
      {
        id: "unrelated-manual-source",
        sync: { status: "manual" },
      },
    ]);

    expect(
      (rows[0].sync as any).alignment.captureGroup,
    ).toMatchObject({
      baselineRecordingAssetId: "recording-a",
      estimatedOffsetMilliseconds: 0,
      proposalSourceCount: 2,
      sampleAccurateClaimed: false,
    });
    expect(
      (rows[1].metadata as any).recordingSync.alignment.captureGroup
        .estimatedOffsetMilliseconds,
    ).toBe(500);
    expect(rows[2]).toEqual({
      id: "unrelated-manual-source",
      sync: { status: "manual" },
    });
  });
});
