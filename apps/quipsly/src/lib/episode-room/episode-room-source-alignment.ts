const CAPTURE_ALIGNMENT_SCHEMA = "quipsly-capture-alignment-proposal-v1";

type JsonRecord = Record<string, unknown>;

export type EpisodeRoomCaptureAlignment = {
  schema: typeof CAPTURE_ALIGNMENT_SCHEMA;
  status: "needs-alignment" | "proposal-ready";
  contractValid: boolean;
  method: string | null;
  sourceClockEvidence: string | null;
  estimatedServerStartedAt: string | null;
  uncertaintyMilliseconds: number | null;
  estimatedOffsetMilliseconds: number | null;
  baselineRecordingAssetId: string | null;
  proposalSourceCount: number | null;
  startReceiptId: string | null;
  clockDriftEvidence: {
    status: "not-measured" | "measured";
    openingSampleId: string | null;
    laterSampleId: string | null;
    observationIntervalSeconds: number | null;
    residualDriftMilliseconds: number | null;
    observedPartsPerMillion: number | null;
    uncertaintyMilliseconds: number | null;
    sampleAccurateClaimed: false;
  };
  sampleAccurateClaimed: boolean;
  reviewRequired: boolean;
  reviewGate: {
    waveformCorrelationRequired: boolean;
    driftReviewRequired: boolean;
    humanApprovalRequired: boolean;
  };
  reason: string;
};

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

function alignmentRecord(importedAsset: unknown) {
  const asset = record(importedAsset);
  const metadata = record(asset.metadata);
  const sync = record(asset.sync);
  const metadataRecording = record(metadata.recordingSync);
  const syncRecording = record(sync.recordingSync);
  const candidates = [
    record(sync.alignment),
    record(syncRecording.alignment),
    record(metadataRecording.alignment),
  ];
  return candidates.find(
    (candidate) => candidate.schema === CAPTURE_ALIGNMENT_SCHEMA,
  ) ?? null;
}

/**
 * Reads only the capture-clock proposal contract. Generic source workflow
 * states such as `ready-to-sync` are intentionally not treated as alignment
 * evidence.
 */
export function episodeRoomCaptureAlignment(
  importedAsset: unknown,
): EpisodeRoomCaptureAlignment | null {
  const alignment = alignmentRecord(importedAsset);
  if (!alignment) return null;

  const group = record(alignment.captureGroup);
  const startBoundary = record(alignment.startBoundary);
  const clockDrift = record(alignment.clockDriftEvidence);
  const reviewGate = record(alignment.reviewGate);
  const reportedStatus = text(alignment.status);
  const estimatedServerStartedAt = validIsoDate(
    alignment.estimatedServerStartedAt,
  );
  const uncertaintyMilliseconds = finiteNumber(
    alignment.uncertaintyMilliseconds,
  );
  const sampleAccurateDeclaredFalse =
    alignment.sampleAccurateClaimed === false;
  const sampleAccurateClaimed = !sampleAccurateDeclaredFalse;
  const reviewRequired = alignment.reviewRequired === true;
  const parsedReviewGate = {
    waveformCorrelationRequired:
      reviewGate.waveformCorrelationRequired === true,
    driftReviewRequired: reviewGate.driftReviewRequired === true,
    humanApprovalRequired: reviewGate.humanApprovalRequired === true,
  };
  const proposalShapeValid =
    reportedStatus !== "proposal-ready"
    || Boolean(estimatedServerStartedAt);
  const groupContractValid =
    Object.keys(group).length === 0
    || group.sampleAccurateClaimed === false;
  const driftStatus = clockDrift.status === "measured" ? "measured" : "not-measured";
  const driftObservationIntervalSeconds = finiteNumber(clockDrift.observationIntervalSeconds);
  const driftResidualMilliseconds = finiteNumber(clockDrift.residualDriftMilliseconds);
  const driftObservedPartsPerMillion = finiteNumber(clockDrift.observedPartsPerMillion);
  const driftUncertaintyMilliseconds = finiteNumber(clockDrift.uncertaintyMilliseconds);
  const driftContractValid = driftStatus === "not-measured" || (
    clockDrift.sampleAccurateClaimed === false
    && driftObservationIntervalSeconds !== null
    && driftObservationIntervalSeconds > 0
    && driftResidualMilliseconds !== null
    && driftObservedPartsPerMillion !== null
    && driftUncertaintyMilliseconds !== null
    && driftUncertaintyMilliseconds >= 0
    && Boolean(text(clockDrift.openingSampleId))
    && Boolean(text(clockDrift.laterSampleId))
  );
  const contractValid =
    sampleAccurateDeclaredFalse
    && reviewRequired
    && parsedReviewGate.waveformCorrelationRequired
    && parsedReviewGate.driftReviewRequired
    && parsedReviewGate.humanApprovalRequired
    && proposalShapeValid
    && groupContractValid
    && driftContractValid;
  const status =
    reportedStatus === "proposal-ready" && contractValid
      ? "proposal-ready"
      : "needs-alignment";
  const reason = contractValid
    ? text(alignment.reason)
    : "The stored clock proposal failed its safety contract. Rebuild it from immutable capture evidence before using any offset.";

  return {
    schema: CAPTURE_ALIGNMENT_SCHEMA,
    status,
    contractValid,
    method: text(alignment.method) || null,
    sourceClockEvidence: text(alignment.sourceClockEvidence) || null,
    estimatedServerStartedAt,
    uncertaintyMilliseconds:
      uncertaintyMilliseconds === null
        ? null
        : Math.max(0, uncertaintyMilliseconds),
    estimatedOffsetMilliseconds: finiteNumber(
      group.estimatedOffsetMilliseconds,
    ),
    baselineRecordingAssetId:
      text(group.baselineRecordingAssetId) || null,
    proposalSourceCount: (() => {
      const count = finiteNumber(group.proposalSourceCount);
      return count === null ? null : Math.max(0, Math.trunc(count));
    })(),
    startReceiptId: text(startBoundary.receiptId) || null,
    clockDriftEvidence: driftStatus === "measured" && driftContractValid
      ? {
          status: "measured",
          openingSampleId: text(clockDrift.openingSampleId) || null,
          laterSampleId: text(clockDrift.laterSampleId) || null,
          observationIntervalSeconds: driftObservationIntervalSeconds,
          residualDriftMilliseconds: driftResidualMilliseconds,
          observedPartsPerMillion: driftObservedPartsPerMillion,
          uncertaintyMilliseconds: driftUncertaintyMilliseconds,
          sampleAccurateClaimed: false,
        }
      : {
          status: "not-measured",
          openingSampleId: null,
          laterSampleId: null,
          observationIntervalSeconds: null,
          residualDriftMilliseconds: null,
          observedPartsPerMillion: null,
          uncertaintyMilliseconds: null,
          sampleAccurateClaimed: false,
        },
    sampleAccurateClaimed,
    reviewRequired,
    reviewGate: parsedReviewGate,
    reason: reason || (
      status === "proposal-ready"
        ? "Clock evidence is ready for waveform, drift, and human review."
        : "Align this source from preserved clock and waveform evidence."
    ),
  };
}
