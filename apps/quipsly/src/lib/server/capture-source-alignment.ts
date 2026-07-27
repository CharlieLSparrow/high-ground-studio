const FOUNDATION_REFERENCE_EPOCH_MILLISECONDS = Date.UTC(2001, 0, 1);
const ALIGNMENT_SCHEMA = "quipsly-capture-alignment-proposal-v1";
const ALIGNMENT_METHOD = "lowest-rtt-monotonic-server-projection-v1";

type JsonObject = Record<string, unknown>;

export type CaptureSourceAlignmentProposal = {
  schema: typeof ALIGNMENT_SCHEMA;
  status: "needs-alignment" | "proposal-ready";
  captureGroupId: string | null;
  sourceClockEvidence:
    | "source-profile-missing"
    | "clock-samples-missing"
    | "clock-samples-invalid"
    | "lowest-rtt-monotonic-projection";
  method: typeof ALIGNMENT_METHOD | null;
  estimatedServerStartedAt: string | null;
  uncertaintyMilliseconds: number | null;
  selectedClockSample: {
    sampleId: string;
    protocolVersion: number;
    clientKind: string;
    networkRoundTripMilliseconds: number;
    serverOffsetMilliseconds: number;
    wallClockDiscontinuityMilliseconds: number;
    sourceProfileDateEncoding: "iso8601" | "swift-reference-date";
  } | null;
  startBoundary: {
    receiptId: string;
    occurredAt: string;
    receivedAt: string;
    estimatedServerOccurredAt: string;
    sourceStartAfterActionMilliseconds: number;
    serverReceiptDeliveryDeltaMilliseconds: number;
  } | null;
  reportedWallStartAt: string | null;
  reportedWallVsMonotonicEstimateMilliseconds: number | null;
  sampleAccurateClaimed: false;
  reviewRequired: true;
  reviewGate: {
    waveformCorrelationRequired: true;
    driftReviewRequired: true;
    humanApprovalRequired: true;
  };
  reason: string;
  captureGroup?: {
    baselineRecordingAssetId: string;
    baselineEstimatedServerStartedAt: string;
    estimatedOffsetMilliseconds: number;
    proposalSourceCount: number;
    sampleAccurateClaimed: false;
  };
};

type ValidClockSample = {
  sampleId: string;
  protocolVersion: number;
  clientKind: string;
  deviceWallSentAtMilliseconds: number;
  deviceMonotonicSentNanoseconds: bigint;
  deviceMonotonicReceivedNanoseconds: bigint;
  serverReceivedAtMilliseconds: number;
  serverSentAtMilliseconds: number;
  deviceWallReceivedAtMilliseconds: number;
  networkRoundTripMilliseconds: number;
  serverOffsetMilliseconds: number;
  uncertaintyMilliseconds: number;
  wallClockDiscontinuityMilliseconds: number;
  sourceProfileDateEncoding: "iso8601" | "swift-reference-date";
};

export function buildCaptureSourceAlignmentProposal(input: {
  sourceProfile: unknown;
  callRoomId: string;
  captureId: string;
  captureGroupId: string | null;
  actorUserId: string;
  startReceiptId?: string | null;
  recordedStartedAt?: unknown;
  startReceipt?: unknown;
}): CaptureSourceAlignmentProposal {
  const sourceProfile = object(input.sourceProfile);
  const captureGroupId = text(input.captureGroupId) || null;
  const base = baseProposal(captureGroupId);
  if (Object.keys(sourceProfile).length === 0) {
    return {
      ...base,
      sourceClockEvidence: "source-profile-missing",
      reason: "The immutable source has no capture-clock profile. Align it from waveforms and preserve the reviewed decision.",
    };
  }

  const monotonicStartedNanoseconds = positiveBigInt(
    sourceProfile.monotonicStartedNanoseconds,
  );
  const rawSamples = Array.isArray(sourceProfile.clockSamples)
    ? sourceProfile.clockSamples
    : [];
  if (!monotonicStartedNanoseconds || rawSamples.length === 0) {
    return {
      ...base,
      sourceClockEvidence: "clock-samples-missing",
      reason: "The source profile is preserved, but it has no complete monotonic clock burst. Waveform alignment remains required.",
    };
  }

  const validSamples = rawSamples
    .map((sample) => validClockSample({
      sample,
      schemaVersion: finiteInteger(sourceProfile.schemaVersion) ?? 1,
      callRoomId: input.callRoomId,
      captureGroupId,
      monotonicStartedNanoseconds,
    }))
    .filter((sample): sample is ValidClockSample => Boolean(sample))
    .sort((left, right) => (
      left.networkRoundTripMilliseconds - right.networkRoundTripMilliseconds
      || left.uncertaintyMilliseconds - right.uncertaintyMilliseconds
      || left.sampleId.localeCompare(right.sampleId)
    ));
  const selected = validSamples[0];
  if (!selected) {
    return {
      ...base,
      sourceClockEvidence: "clock-samples-invalid",
      reason: "Capture-clock samples were present but none matched this room, take, and monotonic source boundary. No automatic offset was accepted.",
    };
  }

  const monotonicElapsedMilliseconds = nanosecondsToMilliseconds(
    monotonicStartedNanoseconds - selected.deviceMonotonicSentNanoseconds,
  );
  const estimatedServerStartedAtMilliseconds =
    selected.deviceWallSentAtMilliseconds
    + monotonicElapsedMilliseconds
    + selected.serverOffsetMilliseconds;
  const reportedWallStartAtMilliseconds = dateMilliseconds(
    input.recordedStartedAt,
    1,
  )?.milliseconds ?? null;
  const startReceipt = validStartReceipt(input.startReceipt, {
    receiptId: text(input.startReceiptId),
    roomId: input.callRoomId,
    captureId: input.captureId,
    actorUserId: input.actorUserId,
  });
  const startBoundary = startReceipt
    ? {
        receiptId: startReceipt.receiptId,
        occurredAt: new Date(startReceipt.occurredAtMilliseconds).toISOString(),
        receivedAt: new Date(startReceipt.receivedAtMilliseconds).toISOString(),
        estimatedServerOccurredAt: new Date(
          startReceipt.occurredAtMilliseconds + selected.serverOffsetMilliseconds,
        ).toISOString(),
        sourceStartAfterActionMilliseconds: rounded(
          estimatedServerStartedAtMilliseconds
          - startReceipt.occurredAtMilliseconds
          - selected.serverOffsetMilliseconds,
        ),
        serverReceiptDeliveryDeltaMilliseconds: rounded(
          startReceipt.receivedAtMilliseconds
          - estimatedServerStartedAtMilliseconds,
        ),
      }
    : null;
  const uncertaintyMilliseconds = rounded(
    Math.max(
      selected.uncertaintyMilliseconds,
      selected.networkRoundTripMilliseconds / 2,
    )
    + Math.abs(selected.wallClockDiscontinuityMilliseconds) / 2
    + 2,
  );

  return {
    ...base,
    status: startBoundary ? "proposal-ready" : "needs-alignment",
    sourceClockEvidence: "lowest-rtt-monotonic-projection",
    method: ALIGNMENT_METHOD,
    estimatedServerStartedAt: new Date(
      estimatedServerStartedAtMilliseconds,
    ).toISOString(),
    uncertaintyMilliseconds,
    selectedClockSample: {
      sampleId: selected.sampleId,
      protocolVersion: selected.protocolVersion,
      clientKind: selected.clientKind,
      networkRoundTripMilliseconds: rounded(
        selected.networkRoundTripMilliseconds,
      ),
      serverOffsetMilliseconds: rounded(selected.serverOffsetMilliseconds),
      wallClockDiscontinuityMilliseconds: rounded(
        selected.wallClockDiscontinuityMilliseconds,
      ),
      sourceProfileDateEncoding: selected.sourceProfileDateEncoding,
    },
    startBoundary,
    reportedWallStartAt: reportedWallStartAtMilliseconds === null
      ? null
      : new Date(reportedWallStartAtMilliseconds).toISOString(),
    reportedWallVsMonotonicEstimateMilliseconds:
      reportedWallStartAtMilliseconds === null
        ? null
        : rounded(
            reportedWallStartAtMilliseconds
            + selected.serverOffsetMilliseconds
            - estimatedServerStartedAtMilliseconds,
          ),
    reason: startBoundary
      ? "A deterministic clock proposal is ready. Correlate waveforms, review drift, and explicitly approve it before locking the timeline."
      : "The source clock can be projected, but its exact applied START receipt is missing or mismatched. Keep the proposal untrusted until the ledger binding is repaired.",
  };
}

export function addCaptureGroupAlignmentOffsets<
  T extends {
    recordingAssetId: string;
    captureGroupId?: string | null;
    alignment: CaptureSourceAlignmentProposal;
  },
>(sources: T[]): T[] {
  const grouped = new Map<string, T[]>();
  for (const source of sources) {
    const groupId = text(source.captureGroupId)
      || text(source.alignment.captureGroupId);
    if (
      !groupId
      || source.alignment.status !== "proposal-ready"
      || !source.alignment.estimatedServerStartedAt
    ) {
      continue;
    }
    const group = grouped.get(groupId) ?? [];
    group.push(source);
    grouped.set(groupId, group);
  }

  for (const group of grouped.values()) {
    const ordered = group
      .map((source) => ({
        source,
        timestamp: Date.parse(
          source.alignment.estimatedServerStartedAt || "",
        ),
      }))
      .filter((entry) => Number.isFinite(entry.timestamp))
      .sort((left, right) => (
        left.timestamp - right.timestamp
        || left.source.recordingAssetId.localeCompare(
          right.source.recordingAssetId,
        )
      ));
    const baseline = ordered[0];
    if (!baseline) continue;
    for (const entry of ordered) {
      entry.source.alignment.captureGroup = {
        baselineRecordingAssetId: baseline.source.recordingAssetId,
        baselineEstimatedServerStartedAt:
          baseline.source.alignment.estimatedServerStartedAt!,
        estimatedOffsetMilliseconds: rounded(
          entry.timestamp - baseline.timestamp,
        ),
        proposalSourceCount: ordered.length,
        sampleAccurateClaimed: false,
      };
    }
  }
  return sources;
}

function validClockSample(input: {
  sample: unknown;
  schemaVersion: number;
  callRoomId: string;
  captureGroupId: string | null;
  monotonicStartedNanoseconds: bigint;
}): ValidClockSample | null {
  const sample = object(input.sample);
  const protocolVersion = finiteInteger(sample.protocolVersion);
  const sampleId = text(sample.sampleId);
  const clientKind = text(sample.clientKind);
  const sampleRoomId = text(sample.callRoomId);
  const sampleCaptureGroupId = text(sample.captureGroupId);
  const monotonicSent = positiveBigInt(
    sample.deviceMonotonicSentNanoseconds,
  );
  const monotonicReceived = positiveBigInt(
    sample.deviceMonotonicReceivedNanoseconds,
  );
  const wallSent = dateMilliseconds(
    sample.deviceWallSentAt,
    input.schemaVersion,
  );
  const wallReceived = dateMilliseconds(
    sample.deviceWallReceivedAt,
    input.schemaVersion,
  );
  const serverReceived = dateMilliseconds(sample.serverReceivedAt, 1);
  const serverSent = dateMilliseconds(sample.serverSentAt, 1);
  if (
    protocolVersion !== 1
    || !sampleId
    || !clientKind
    || sampleRoomId !== input.callRoomId
    || (input.captureGroupId !== null
      && sampleCaptureGroupId !== input.captureGroupId)
    || !monotonicSent
    || !monotonicReceived
    || monotonicReceived < monotonicSent
    || input.monotonicStartedNanoseconds < monotonicSent
    || !wallSent
    || !wallReceived
    || !serverReceived
    || !serverSent
    || serverSent.milliseconds < serverReceived.milliseconds
  ) {
    return null;
  }
  const monotonicElapsedMilliseconds = nanosecondsToMilliseconds(
    monotonicReceived - monotonicSent,
  );
  const serverProcessingMilliseconds =
    serverSent.milliseconds - serverReceived.milliseconds;
  const networkRoundTripMilliseconds = Math.max(
    0,
    monotonicElapsedMilliseconds - serverProcessingMilliseconds,
  );
  const serverOffsetMilliseconds = (
    (serverReceived.milliseconds - wallSent.milliseconds)
    + (serverSent.milliseconds - wallReceived.milliseconds)
  ) / 2;
  const wallClockDiscontinuityMilliseconds = (
    wallReceived.milliseconds - wallSent.milliseconds
  ) - monotonicElapsedMilliseconds;
  const reportedUncertainty = nonnegativeFinite(
    sample.uncertaintyMilliseconds,
  );

  return {
    sampleId,
    protocolVersion,
    clientKind,
    deviceWallSentAtMilliseconds: wallSent.milliseconds,
    deviceMonotonicSentNanoseconds: monotonicSent,
    deviceMonotonicReceivedNanoseconds: monotonicReceived,
    serverReceivedAtMilliseconds: serverReceived.milliseconds,
    serverSentAtMilliseconds: serverSent.milliseconds,
    deviceWallReceivedAtMilliseconds: wallReceived.milliseconds,
    networkRoundTripMilliseconds,
    serverOffsetMilliseconds,
    uncertaintyMilliseconds:
      reportedUncertainty ?? networkRoundTripMilliseconds / 2,
    wallClockDiscontinuityMilliseconds,
    sourceProfileDateEncoding:
      wallSent.encoding === "swift-reference-date"
      || wallReceived.encoding === "swift-reference-date"
        ? "swift-reference-date"
        : "iso8601",
  };
}

function validStartReceipt(
  value: unknown,
  expected: {
    receiptId: string;
    roomId: string;
    captureId: string;
    actorUserId: string;
  },
) {
  const receipt = object(value);
  const occurredAt = dateMilliseconds(receipt.occurredAt, 1);
  const receivedAt = dateMilliseconds(receipt.receivedAt, 1);
  if (
    !expected.receiptId
    || text(receipt.receiptId) !== expected.receiptId
    || text(receipt.roomId) !== expected.roomId
    || text(receipt.captureId) !== expected.captureId
    || text(receipt.actorUserId) !== expected.actorUserId
    || text(receipt.action) !== "START_RECORDING"
    || receipt.stateApplied !== true
    || text(receipt.outcome) !== "APPLIED"
    || !occurredAt
    || !receivedAt
  ) {
    return null;
  }
  return {
    receiptId: expected.receiptId,
    occurredAtMilliseconds: occurredAt.milliseconds,
    receivedAtMilliseconds: receivedAt.milliseconds,
  };
}

function baseProposal(
  captureGroupId: string | null,
): CaptureSourceAlignmentProposal {
  return {
    schema: ALIGNMENT_SCHEMA,
    status: "needs-alignment",
    captureGroupId,
    sourceClockEvidence: "clock-samples-missing",
    method: null,
    estimatedServerStartedAt: null,
    uncertaintyMilliseconds: null,
    selectedClockSample: null,
    startBoundary: null,
    reportedWallStartAt: null,
    reportedWallVsMonotonicEstimateMilliseconds: null,
    sampleAccurateClaimed: false,
    reviewRequired: true,
    reviewGate: {
      waveformCorrelationRequired: true,
      driftReviewRequired: true,
      humanApprovalRequired: true,
    },
    reason: "No deterministic alignment proposal is available yet.",
  };
}

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function finiteInteger(value: unknown) {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && /^[0-9]+$/.test(value.trim())
      ? Number(value)
      : Number.NaN;
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function positiveBigInt(value: unknown) {
  try {
    if (typeof value === "bigint") return value > 0n ? value : null;
    if (
      typeof value === "number"
      && Number.isFinite(value)
      && Number.isInteger(value)
      && value > 0
    ) {
      return BigInt(value);
    }
    if (
      typeof value === "string"
      && /^[1-9][0-9]*$/.test(value.trim())
    ) {
      return BigInt(value);
    }
  } catch {
    // Invalid clock evidence stays review-only.
  }
  return null;
}

function nonnegativeFinite(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function nanosecondsToMilliseconds(value: bigint) {
  const wholeMilliseconds = value / 1_000_000n;
  const remainingNanoseconds = value % 1_000_000n;
  return Number(wholeMilliseconds)
    + Number(remainingNanoseconds) / 1_000_000;
}

function dateMilliseconds(
  value: unknown,
  schemaVersion: number,
): {
  milliseconds: number;
  encoding: "iso8601" | "swift-reference-date";
} | null {
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed)
      ? { milliseconds: parsed, encoding: "iso8601" }
      : null;
  }
  if (
    typeof value === "number"
    && Number.isFinite(value)
    && schemaVersion === 1
  ) {
    const milliseconds =
      FOUNDATION_REFERENCE_EPOCH_MILLISECONDS + value * 1_000;
    return Number.isFinite(milliseconds)
      ? { milliseconds, encoding: "swift-reference-date" }
      : null;
  }
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return { milliseconds: value.getTime(), encoding: "iso8601" };
  }
  return null;
}

function rounded(value: number) {
  return Math.round(value * 1_000) / 1_000;
}
